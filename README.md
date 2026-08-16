# Swasth Admin Portal

Web admin portal for a gym's front desk: **manage the gym's members and sell
them memberships** — register walk-ins, find them, edit them, suspend and
reinstate them, sell and renew plans, take cash against a balance, record who
came in today, and see how the gym is doing.

It talks to an existing deployed REST API which lives in a separate repo and is
not modified from here.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

`.env` defaults to the deployed backend, so the portal works against real data
straight away:

```
VITE_API_BASE_URL=https://swasth-be.onrender.com/api/v1
VITE_GYM_CODE=swasth-koramangala
```

Point `VITE_API_BASE_URL` at `http://localhost:3000/api/v1` to use a local
backend. The gym code is read from the environment in one place
([src/api/client.ts](src/api/client.ts)) and never hardcoded in a component.

### Signing in

Phone + OTP, the same as the mobile app. On the staging backend the OTP is
returned in the response and shown on the login screen as a dev convenience.

| Phone        | Role                                             |
| ------------ | ------------------------------------------------ |
| `9999900003` | `GYM_ADMIN` — use this one                       |
| `9999900002` | `OWNER`                                          |
| `9999900001` | Platform admin (only a `MEMBER` at this gym)     |

Only `GYM_ADMIN` and `OWNER` may use the portal. Anyone else gets a "this portal
is for gym staff" screen with a way to sign out, rather than a dashboard that
403s on every call.

> **The backend sleeps.** It's on a free Render tier and sleeps after 15 minutes
> idle; the first request then takes 30–60 seconds. There are deliberately no
> request timeouts, and any spinner that lasts more than 5 seconds adds a
> "waking the server up…" note.

> **The OTP resend cooldown is 60 seconds per phone number.** The resend button
> is disabled with a visible countdown. If the backend rejects a resend anyway,
> the portal reads the wait out of the error message, restarts the countdown, and
> says that the code already sent is still valid.

```bash
npm run build         # tsc -b && vite build
npm run lint
```

## Layout

```
src/
  api/
    types.ts        every backend type and enum, mirroring the API docs
    client.ts       fetch wrapper: both headers, envelope unwrap, ApiError, refresh
    session.ts      persisted tokens + user + gym, subscribable, outside React
    endpoints.ts    typed functions per endpoint
  auth/             AuthProvider: session state, sign in, sign out, role check
  members/          queries, form validation, shared form fields,
                    membership presentation + the sell/pay/cancel panel
  components/       Button, Field, Modal, Toast, Badge, loading/empty/error states
  routes/           LoginPage, MembersPage, RegisterMemberPage, MemberDetailPage,
                    PlansPage, RenewalsPage, CheckInsPage, InsightsPage
  components/charts/ hand-rolled SVG marks + the validated chart tokens
  hooks/            useDebouncedValue, useCountdown, useSlowRequest
```

### API client

`request()` attaches `X-Gym-Code` and the bearer token, unwraps the
`{ success, data }` envelope so components never see it, and turns an error
response into a thrown `ApiError` carrying `message`, `statusCode` and `errors`.
The backend's `message` strings are written to be read by staff and are shown
verbatim — never folded into a generic "something went wrong".

**Token refresh.** Refresh tokens rotate on every use, and reusing a rotated one
makes the backend kill the whole session. So a single module-level promise
queues every concurrent 401 behind one `/auth/refresh` call, and both tokens are
replaced with what refresh returns. A failed refresh clears the session, which
the `AuthProvider` observes and redirects to login.

### The member list mixes two populations

Anyone who logs into the mobile app is auto-linked to the gym as a `MEMBER`
whether or not they ever paid or visited, and comes back from `GET /members`
alongside real paying members. The list splits on `membershipStatus` rather than
`source`, because what matters at the desk is whether someone has actually
bought something:

**Active** (the default working view) · **Expiring** (with a 7–90 day window) ·
**Expired** · **Leads** (`membershipStatus=NONE`) · **Everyone**.

Because the default view hides lapsed members, searching on a tab with no
matches offers **Search everyone** — so a member whose plan ran out is still one
click from being found.

### Plans and memberships

**Plans** ([src/routes/PlansPage.tsx](src/routes/PlansPage.tsx)) are what the gym
sells. They are archived, never deleted, and editing one never rewrites
memberships already sold — the name, price and duration are copied onto each
sale.

**Selling** happens on the member's page. Only `planId` is required; leaving the
start date blank lets the server begin today, or the day after an existing
membership ends so a renewal loses no time. Price can be overridden for one
sale, a discount comes off it, and collecting less than the full amount leaves a
`PARTIAL` balance that the desk can top up later. An explicit start date that
overlaps is refused with a `409` naming the date to use instead — the portal
shows that message and offers a one-click **Start on <date> instead**.

**Renewals** ([src/routes/RenewalsPage.tsx](src/routes/RenewalsPage.tsx)) is the
follow-up call list: who runs out soonest, their phone number, and anything they
still owe. It reads `GET /subscriptions/expiring`, which returns a nested
`member` object — undocumented in the brief, but what makes that route usable as
a call list on its own.

Money is cash-in-hand: there is no payment gateway, and the UI says so.

### Check-ins

[src/routes/CheckInsPage.tsx](src/routes/CheckInsPage.tsx) is the desk's busiest
screen: a search box that records the visit of whoever is at the counter, above
the day's register. Members can also check themselves in from the app, so rows
are tagged **App** or **Front desk**.

There is no check-out, so this is an arrivals register, not live occupancy.
Recording always stamps the current time, so on a past day the check-in box is
replaced by an explanation rather than a control that would lie about when
someone came in.

Two behaviours the UI leans on:

- **One check-in per member per day.** A second attempt is a `200` carrying the
  first visit with `alreadyCheckedIn: true`, not an error, so it reports "already
  checked in at 6:47 pm". Anyone already in today shows a ✓ and their time
  instead of a button.
- **Check-in needs an active membership**, and the `403` doubles as a renewal
  prompt: the message appears inline against that person with a link into their
  page to sell or renew.

Days are the gym's local days, so "today" is computed from the gym's `timezone`
rather than the browser's — a desk machine set to another zone must not disagree
with the register about which day it is.

### Insights

[src/routes/InsightsPage.tsx](src/routes/InsightsPage.tsx). There is no
statistics endpoint and inventing one is off the table, so every figure is
assembled from routes that exist — see
[src/members/insightQueries.ts](src/members/insightQueries.ts):

| Panel | Built from |
| --- | --- |
| Headline counts | `GET /members/stats` — one request, a true partition |
| Attendance | `GET /check-ins?date=…`, one request per day in the window |
| Renewals due | `GET /subscriptions/expiring?days=…`, bucketed by urgency |
| Plan sales | `GET /plans/:id`, which carries `timesSold` |

A single **Look ahead** control scopes both the expiring bucket and the renewals
list, so the two never disagree, and each segment of the membership bar drills
through to the list filter that reproduces it exactly (`active` →
`ACTIVE_NOT_EXPIRING`, and so on) — click a segment and the count on the next
screen matches the one you clicked.

Charts are hand-rolled SVG — no charting dependency. Every series is either a
single hue or an **ordinal ramp**, because each scale here is ordered
(membership health, renewal urgency); the ramps were checked with the dataviz
validator against this app's white card surface for monotone lightness, step
separation and contrast. A categorical red/green split was specifically
rejected: it fails colourblind separation (ΔE 4.1), and these scales are ordered
anyway. Each card carries a table view, tooltips on hover **and** keyboard
focus, and holds its previous render while refetching rather than flashing a
skeleton.

The charts are light-only, matching the rest of the portal — the app has no dark
mode, and giving only the charts one would be incoherent.

## Known API limitations

Found while building, all verified against the deployed backend.

**Archiving a plan clears `isPublic`, and restoring does not put it back.** A
restored plan is sellable at the desk again but silently invisible in the member
app until someone re-ticks it. The restore dialog says so, since nothing in the
UI would otherwise reveal it.

**`GET /plans` returns archived plans to staff** with no query parameter to
change that, so the Plans screen splits them into an "Archived" section itself.
The sell dialog offers only plans that are `isActive` and not archived.

**`POST /subscriptions/:id/payment` rejects `notes`** — it takes `amount` and
`paymentMethod` only, so a part payment can't carry its own note. The note
captured at the point of sale is the only one a membership has.

**`GET /check-ins?date=` returns a 500 on an unparseable date** rather than a
400, so the portal only ever sends `YYYY-MM-DD` from a date input.

**The check-in 403 messages are written for the member app** — "Your membership
has expired. Please renew at the gym." reads oddly at the desk, and says
"expired" even when the real reason is that the plan hasn't started yet. The
message is still shown verbatim, with the desk-side detail (the actual start
date) added beneath it rather than substituted for it.

**`POST /members/:id/check-ins` ignores its body** instead of rejecting unknown
fields the way every other write does, so the portal sends none.

**A queued renewal is not an overlap.** Selling a second plan without a start
date succeeds and queues it from the day after the current one ends; only an
explicit overlapping `startDate` is refused with a `409`.

### Counting members: use `GET /members/stats`

`membershipStatus=EXPIRING` is a **subset** of `ACTIVE`, not a sibling of it —
someone whose membership ends tomorrow is still active today, so both filters
count them. Summing the filters therefore double-counts every expiring member.

This portal originally derived its dashboard counts that way, on the brief's
earlier guidance, and the bug was real: with 27 members and 1 expiring, the
part-to-whole bar totalled 28. The backend now ships `GET /members/stats`, whose
`buckets` are a true partition, and the Insights page uses it — one request
instead of five, and nothing to keep in sync by hand.

Two things to keep straight when reading that response:

- `activeTotal` **includes** `expiringSoon` (it equals `buckets.active +
  buckets.expiringSoon`). It is the headline "active members" figure; never add
  the two together.
- `buckets.active` is the disjoint slice — the one that pairs with the
  `ACTIVE_NOT_EXPIRING` list filter.

### Fixed upstream on 2026-08-14

`PATCH /members/:id` used to `500` on `email`, `gender` and
`emergencyContactPhone` sent as `null`, and stored `1970-01-01` for a null
`dateOfBirth`. All four now clear correctly, so the `UNCLEARABLE_FIELDS`
workaround this portal carried has been **removed** — clearing a field sends
`null` for everything. Note that `gender: null` resets to `UNDISCLOSED` rather
than to an empty value, because the column is not nullable.

`fullName` really can be `null` — app signups who never finished onboarding come
back that way. Everything renders it through `memberName()` in
[src/lib/format.ts](src/lib/format.ts), which falls back to "Unnamed member".

**Things that still don't exist**, so the portal doesn't pretend they do: no
payment gateway (cash recorded by hand), no check-*out* and therefore no live
occupancy, no dashboard statistics endpoint, no way to add a trainer or a second
admin, and no classes or trainers.

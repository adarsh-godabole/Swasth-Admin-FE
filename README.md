# Swasth Admin Portal

Web admin portal for a gym's front desk: **manage the gym's members and sell
them memberships** — register walk-ins, find them, edit them, suspend and
reinstate them, sell and renew plans, and take cash against a balance.

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
                    PlansPage, RenewalsPage
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

**A queued renewal is not an overlap.** Selling a second plan without a start
date succeeds and queues it from the day after the current one ends; only an
explicit overlapping `startDate` is refused with a `409`.

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
payment gateway (cash recorded by hand), no dashboard statistics endpoint, no way
to add a trainer or a second admin, and no check-ins or classes.

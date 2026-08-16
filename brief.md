# Swasth Admin Portal — build brief

Feed this whole file to a fresh Claude Code session started in the admin portal
folder. It assumes no knowledge of the backend.

---

## 1. What you are building

A **web admin portal** for a gym, used by front-desk staff and the gym owner. It
talks to an existing, deployed REST API. **You are not building the backend, and
you cannot change it** — if something seems missing, say so rather than
inventing an endpoint.

Today the portal has exactly one job: **manage the gym's members.** Register
walk-ins, find them, edit them, suspend and reinstate them.

### Decided already — don't re-litigate

| Decision      | Choice                                                    |
| ------------- | --------------------------------------------------------- |
| Stack         | Vite + React + TypeScript                                  |
| Routing       | React Router                                               |
| Server state  | TanStack Query                                             |
| Styling       | Tailwind CSS                                               |
| Repo          | Standalone (not a monorepo with the backend)               |
| Auth          | Phone + OTP, same as the mobile app                        |
| Target users  | Gym staff on a desktop browser at the front desk           |

Nothing exists yet. Scaffold from scratch.

---

## 2. Backend

| Environment | Base URL                                          |
| ----------- | ------------------------------------------------- |
| Deployed    | `https://swasth-be.onrender.com/api/v1`           |
| Swagger     | `https://swasth-be.onrender.com/api/docs`         |
| Local       | `http://localhost:3000/api/v1` (only if it's running) |

Put these in `.env` as `VITE_API_BASE_URL` and `VITE_GYM_CODE`, defaulting to
the deployed URL so the portal works against real data immediately.

> The backend is on a free Render tier: **it sleeps after 15 minutes idle and the
> first request then takes 30–60 seconds.** Your loading states must tolerate a
> very slow first call — don't set short timeouts, and consider a "waking the
> server up…" message after ~5 seconds.

CORS is currently `*`, so browser calls work from any origin.

### Two headers on every request

```
X-Gym-Code: swasth-koramangala      <- required on essentially everything
Authorization: Bearer <accessToken> <- required on everything except login
```

The backend serves **many gyms from one database**. `X-Gym-Code` says which gym
you mean; the token is minted for one gym and the server rejects a mismatch with
`403`. Read the gym code from `VITE_GYM_CODE` — never hardcode it in components.

### Response envelope

Every success:

```json
{ "success": true, "data": { ... } }
```

Every error:

```json
{
  "success": false,
  "statusCode": 409,
  "message": "Rohit Sharma is already a member (SWK-0001)",
  "errors": ["optional array of field validation messages"],
  "path": "/api/v1/members",
  "timestamp": "2026-08-14T06:31:18.389Z"
}
```

Unwrap `data` in your API client so components never see the envelope. Surface
`message` directly in the UI — the backend's messages are written to be shown to
staff. When `errors` is present it is an array of per-field validation strings.

> **Validation is strict.** The API rejects unknown fields with a `400`. Send
> only the fields documented below — no extra keys. On `POST`, omit optional
> fields rather than sending `null`. On `PATCH`, `null` is meaningful: it clears
> the field. See the PATCH semantics table in section 5.

---

## 3. Auth

### The flow

1. `POST /auth/otp/send` with the phone number.
2. `POST /auth/otp/verify` with the phone and the 6-digit code → tokens.
3. Store both tokens. Attach the access token to every request.
4. On `401`, call `POST /auth/refresh` once, then retry the original request.
   If refresh also fails, clear tokens and send the user to login.

Access tokens last **15 minutes**; refresh tokens **30 days** and **rotate on
every use** — always replace both stored tokens with what refresh returns. If a
refresh token is reused after rotation the backend kills the whole session, so
never fire two refreshes at once: queue concurrent 401s behind a single refresh.

### `POST /auth/otp/send`

Headers: `X-Gym-Code`. No auth.

```json
{ "phone": "9999900003" }
```

Accepts local Indian format or E.164. Response:

```json
{
  "phone": "+91XXXXXX0003",
  "expiresAt": "2026-08-14T06:34:53.043Z",
  "devCode": "123456"
}
```

`devCode` only appears while the backend runs in staging with dev OTP enabled —
it is how you log in during development. Do not render it in production UI, but
it's fine to show it on the login screen when present, as a dev convenience.

> **There is a 60-second resend cooldown per phone number.** Asking again too
> soon returns `400 "Please wait N second(s)…"`, and the *original* code stays
> valid. Your "Resend OTP" button must be disabled with a visible countdown, or
> staff will lock themselves out of their own login. This has caught us out
> repeatedly.

The OTP expires in **5 minutes** and allows **5 wrong attempts**.

### `POST /auth/otp/verify`

Headers: `X-Gym-Code`. No auth.

```json
{ "phone": "9999900003", "code": "123456" }
```

Response:

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900,
  "isNewUser": false,
  "user": {
    "id": "5dc613ee-...",
    "phone": "+919999900003",
    "fullName": "Meera Front Desk",
    "role": "GYM_ADMIN",
    "memberCode": null,
    "onboarded": false
  },
  "gym": { "id": "c33aaeec-...", "code": "swasth-koramangala", "name": "Swasth Fitness, Koramangala" }
}
```

**Gate on `user.role`.** Only `GYM_ADMIN` and `OWNER` may use this portal. Any
other role — `MEMBER`, `TRAINER` — must see a clear "this portal is for gym
staff" message and a way to log out. Do not just dump them into a dashboard that
403s on every call.

### `POST /auth/refresh`

No gym header needed, no auth.

```json
{ "refreshToken": "eyJ..." }
```

Returns `{ accessToken, refreshToken, expiresIn }`. Store both.

### `POST /auth/logout`

Body `{ "refreshToken": "eyJ..." }`. Returns `204`. Clear local tokens either
way — never block logout on the network call.

### Test logins

All at gym `swasth-koramangala`, all using OTP `123456`:

| Phone           | Role at the gym                         |
| --------------- | --------------------------------------- |
| `9999900003`    | `GYM_ADMIN` — **use this one**          |
| `9999900002`    | `OWNER`                                 |
| `9999900001`    | Swasth platform admin (also a `MEMBER` here) |

---

## 4. The gym

### `GET /gyms/current`

Headers: `X-Gym-Code`. **No auth** — usable on the login screen.

```json
{
  "id": "c33aaeec-...",
  "code": "swasth-koramangala",
  "name": "Swasth Fitness, Koramangala",
  "phone": "+918012345678",
  "email": null,
  "addressLine1": "80 Feet Road, 6th Block",
  "addressLine2": null,
  "city": "Bengaluru",
  "state": "Karnataka",
  "pincode": "560095",
  "logoUrl": "",
  "timezone": "Asia/Kolkata",
  "currency": "INR"
}
```

Use it to show the gym's name and logo in the login screen and the header, so
staff can see at a glance which gym they're operating on.

---

## 5. Members

All routes need `X-Gym-Code` **and** a bearer token, and require role
`GYM_ADMIN` or `OWNER` (anything else gets `403`). Everything is automatically
scoped to the caller's gym — **never send a gym id in a body or query.**

### The member object

Returned by every member endpoint:

```json
{
  "id": "f27ec19a-...",
  "userId": "b5da5bef-...",
  "memberCode": "SWK-0001",
  "fullName": "Rohit Sharma",
  "phone": "+919876543210",
  "email": null,
  "gender": "MALE",
  "dateOfBirth": "1995-04-17T00:00:00.000Z",
  "heightCm": 175.5,
  "weightKg": 82.4,
  "goal": "WEIGHT_LOSS",
  "activityLevel": "BEGINNER",
  "medicalNotes": "Left knee surgery 2023 - avoid heavy squats",
  "notes": null,
  "emergencyContactName": "Sunita Sharma",
  "emergencyContactPhone": "+919812345678",
  "status": "ACTIVE",
  "source": "FRONT_DESK",
  "hasAppAccount": false,
  "onboarded": false,
  "joinedAt": "2026-08-14T06:31:18.312Z",
  "lastVisitAt": null
}
```

**Nullability — every one of these can come back `null`**, including
`fullName`. App signups routinely have no name at all. Type it as:

```ts
interface Member {
  id: string;
  userId: string;
  memberCode: string | null;
  fullName: string | null;          // yes, really
  phone: string;                    // never null
  email: string | null;
  gender: Gender;                   // never null; UNDISCLOSED is "not set"
  dateOfBirth: string | null;       // ISO datetime
  heightCm: number | null;
  weightKg: number | null;
  goal: FitnessGoal | null;
  activityLevel: ActivityLevel | null;
  medicalNotes: string | null;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  status: GymUserStatus;            // never null
  source: MemberSource;             // never null
  hasAppAccount: boolean;
  onboarded: boolean;
  joinedAt: string;                 // ISO datetime
  lastVisitAt: string | null;
}
```

Only `id`, `userId`, `phone`, `gender`, `status`, `source`, `hasAppAccount`,
`onboarded` and `joinedAt` are guaranteed non-null. Render a fallback for the
rest — a member with no name should show their member code or phone, never
crash and never show "undefined".

Notes on three fields that aren't obvious:

- **`id` is the membership id**, not the person's id. It's what every
  `/members/:id` route takes. `userId` identifies the person and is not used by
  this portal.
- **`hasAppAccount`** is `true` once the person has logged into the mobile app.
  Show it in the table — it tells the desk who still needs nudging to install
  the app.
- **`memberCode`** is `null` for people who signed up through the app and were
  never registered at the desk. See the gotcha in section 7.

### `GET /members` — list and search

Query parameters, all optional:

| Param       | Values                                        | Default    |
| ----------- | --------------------------------------------- | ---------- |
| `search`    | matches name, phone or member code (partial)   | —          |
| `status`    | `ACTIVE` \| `SUSPENDED` \| `LEFT`              | all        |
| `source`    | `FRONT_DESK` \| `APP_SIGNUP` \| `IMPORT`       | all        |
| `page`      | 1-based                                        | `1`        |
| `limit`     | max 100                                        | `20`       |
| `sortBy`    | `joinedAt` \| `fullName` \| `lastVisitAt`      | `joinedAt` |
| `sortOrder` | `asc` \| `desc`                                | `desc`     |

Response:

```json
{ "items": [ /* member objects */ ], "total": 3, "page": 1, "limit": 20, "totalPages": 1 }
```

Debounce the search box (~300 ms) — every keystroke is otherwise a request to a
sleepy free-tier server.

### `POST /members` — register a walk-in

Only `phone` and `fullName` are required.

```json
{
  "phone": "9876543210",
  "fullName": "Rohit Sharma",
  "email": "rohit@example.com",
  "gender": "MALE",
  "dateOfBirth": "1995-04-17",
  "heightCm": 175.5,
  "weightKg": 82.4,
  "goal": "WEIGHT_LOSS",
  "activityLevel": "BEGINNER",
  "medicalNotes": "…",
  "emergencyContactName": "Sunita Sharma",
  "emergencyContactPhone": "9812345678",
  "notes": "Front-desk notes"
}
```

Validation the form must mirror, or the API will reject it:

| Field                   | Rule                                        |
| ----------------------- | ------------------------------------------- |
| `phone`                 | required, 6–20 chars, Indian mobile or E.164 |
| `fullName`              | required, 2–120 chars                        |
| `email`                 | valid email, ≤255                            |
| `dateOfBirth`           | ISO date string `YYYY-MM-DD`                 |
| `heightCm`              | number 50–280, max 2 decimals                |
| `weightKg`              | number 20–500, max 2 decimals                |
| `medicalNotes`, `notes` | ≤1000 chars                                  |
| `emergencyContactName`  | ≤120 chars                                   |
| `emergencyContactPhone` | ≤20 chars                                    |

The member does **not** need the app installed — registering creates their
record against the phone number, and it's waiting for them when they later log
in. Say so in the UI; staff ask.

Errors worth handling explicitly:

| Status | Meaning                                                                 |
| ------ | ----------------------------------------------------------------------- |
| `409`  | Already an active member — the message includes their existing code      |
| `409`  | Number belongs to staff here (a trainer or admin)                        |
| `400`  | Validation — read the `errors` array                                     |

A `409` is a **normal outcome at a front desk**, not a crash. Show the message
plainly and offer to search for the existing member.

### `GET /members/:id`

Returns one member object. `404` if it isn't a member of this gym.

### `PATCH /members/:id`

Same fields as create **except `phone`**, all optional. The phone number is the
login identity and cannot be changed here.

**PATCH semantics — this is the contract:**

| You send            | Result                                    |
| ------------------- | ----------------------------------------- |
| field omitted       | left exactly as it was                     |
| `"field": null`     | **cleared**                                |
| `"field": value`    | set to that value, after validation        |
| `"field": ""`       | `400` on validated fields — use `null`     |

**Every** optional field can be cleared with `null`, including `email`,
`gender`, `dateOfBirth`, `emergencyContactPhone` and `fullName`. There are no
exceptions and no "unclearable" fields.

One special case: `gender` is not nullable in the database, so sending `null`
**resets it to `UNDISCLOSED`** rather than to an empty value. The response
confirms `"gender": "UNDISCLOSED"`. Everything else comes back as literal
`null`.

Validation still applies to real values — `""` fails `IsEmail`, `"BANANA"`
fails the gender enum. Only `null` means "clear".

### `POST /members/:id/deactivate`

```json
{ "status": "LEFT", "reason": "Moved to Pune" }
```

`status` is `LEFT` (quit) or `SUSPENDED` (temporary block), defaulting to
`LEFT`. `reason` is optional and gets appended to the member's notes. This also
**immediately logs the member out of the mobile app.** Confirm before doing it,
and make the two options' meanings clear.

`400` if they're already inactive.

### `POST /members/:id/reactivate`

No body. Restores `ACTIVE` and keeps the original member code. `400` if already
active.

---

## 5b. Plans and memberships

Added 2026-08-14. **There is no payment gateway and there will not be one for
now** — the desk takes cash and records what came in.

### Plans — what the gym sells

`GET /plans` is open to members too (they see only active, public plans);
everything else is staff-only.

```
GET   /plans                     list
POST  /plans                     create
GET   /plans/:id                 one, with timesSold
PATCH /plans/:id                 edit
POST  /plans/:id/archive         take off sale, keep history
POST  /plans/:id/restore         put back on sale
```

A plan:

```json
{
  "id": "…", "name": "3 Months", "description": null,
  "durationValue": 3, "durationUnit": "MONTH", "durationLabel": "3 months",
  "price": 4500, "isActive": true, "isPublic": true,
  "sortOrder": 2, "archivedAt": null, "timesSold": 7
}
```

`isActive` means sellable at the desk; `isPublic` means also visible in the
member app. `timesSold` appears only for staff. Plans are **archived, never
deleted**, and editing one never changes memberships already sold — name, price
and duration are copied onto the subscription at the point of sale.

### Memberships — selling a plan

```
POST /members/:memberId/subscriptions    sell a plan
GET  /members/:memberId/subscriptions    their history, newest first
GET  /subscriptions/expiring?days=7      the follow-up call list
POST /subscriptions/:id/payment          record more cash
POST /subscriptions/:id/cancel           cancel
```

Selling takes only `planId`; everything else is optional:

```json
{
  "planId": "…",
  "startDate": "2026-08-15",
  "price": 4500,
  "discount": 500,
  "amountPaid": 2000,
  "paymentMethod": "CASH",
  "notes": "Rest on the 20th"
}
```

- **Leave `startDate` out.** It defaults to today, or — if they are renewing
  before their current membership runs out — **the day after it ends**, so the
  member loses no time and the terms don't overlap.
- `price` overrides the plan's list price for this sale only. `discount` comes
  off it. `amountPaid` defaults to the full amount due; anything less is a
  `PARTIAL` payment with a balance owing.
- A sale that **overlaps an existing membership is refused with `409`**, and the
  message names the date to start it instead. Cancel the old one to replace it.

A subscription:

```json
{
  "id": "…", "memberId": "…", "planId": "…",
  "planName": "3 Months", "durationLabel": "3 months",
  "status": "ACTIVE",
  "startDate": "2026-08-14T00:00:00.000Z",
  "endDate": "2026-11-13T00:00:00.000Z",
  "daysRemaining": 91,
  "price": 4500, "discount": 500,
  "amountDue": 4000, "amountPaid": 4000, "balance": 0,
  "paymentMethod": "CASH", "paymentStatus": "PAID",
  "notes": null, "cancelledAt": null, "cancelReason": null
}
```

`status` is `ACTIVE | UPCOMING | EXPIRED | CANCELLED`, **computed from the dates
on every read** — there is no stored status to go stale, and no nightly job.
`daysRemaining` is 0 on the last valid day and negative once past.

### Every member now carries their membership

`GET /members` and `GET /members/:id` include:

```json
"membership": {
  "status": "ACTIVE",
  "subscriptionId": "…",
  "planName": "3 Months",
  "startDate": "…", "endDate": "…",
  "daysRemaining": 91,
  "balance": 0,
  "coveredUntil": "2026-12-13T00:00:00.000Z",
  "hasRenewalQueued": true
}
```

`null` when they have never bought anything — that's your "app signup / lead"
population. When a renewal is already queued, `status` and `endDate` describe
the membership they are on **today**, while `coveredUntil` is the last day
covered once the renewal is counted.

New list filters:

| Param              | Values                                                              |
| ------------------ | ------------------------------------------------------------------- |
| `membershipStatus` | `ACTIVE`, `EXPIRING`, `ACTIVE_NOT_EXPIRING`, `EXPIRED`, `NONE`       |
| `expiringInDays`   | window for `EXPIRING` / `ACTIVE_NOT_EXPIRING`, default 7, max 90     |

> ### These filters do NOT sum to the member count
>
> **`EXPIRING` is a subset of `ACTIVE`, not a sibling of it.** Someone whose
> membership ends tomorrow is still active today, so they are counted by both.
> Adding the four totals double-counts every expiring member — with 27 members
> and 1 expiring, the sum comes to 28.
>
> **For any total, chart or KPI, call `GET /members/stats`** (below). Never
> derive counts by calling the list once per status and adding the results.
>
> For a clickable chart segment, `ACTIVE_NOT_EXPIRING` is the disjoint slice:
> `ACTIVE_NOT_EXPIRING + EXPIRING = ACTIVE`.

`NONE` is the cleanest way to separate leads from paying members — better than
filtering on `source`.

### `GET /members/stats` — dashboard counts

Query params: `expiringInDays` (default 7), and optionally `status` / `source`
to narrow the population so the numbers match a filtered list.

```json
{
  "totalMembers": 27,
  "expiringInDays": 7,
  "activeTotal": 5,
  "buckets": {
    "active": 4,
    "expiringSoon": 1,
    "expired": 3,
    "never": 19
  }
}
```

- **`buckets` is a true partition** — the four always sum to `totalMembers`.
  Use it for part-to-whole charts.
- **`activeTotal`** is the "active members" headline figure and **includes**
  `expiringSoon`. It equals `buckets.active + buckets.expiringSoon`. Never add
  it to `expiringSoon`.
- `expired` covers anyone with history but nothing live — lapsed **and**
  cancelled.
- `never` is the app-signup population.

Each bucket maps to a list filter for drill-down: `active` →
`ACTIVE_NOT_EXPIRING`, `expiringSoon` → `EXPIRING`, `expired` → `EXPIRED`,
`never` → `NONE`.

### For the member app

`GET /users/me` now returns a `subscription` field with the same shape as
`membership` above, or `null`. That's the app home screen: plan name, days left,
expiry date.

## 5c. Check-ins / attendance

Added 2026-08-14. **No QR, no scanner** — the member taps a button in the app
and confirms. Staff can also record a visit at the desk.

```
GET  /check-ins?date=2026-08-14        who came in that day (defaults to today)
POST /members/:memberId/check-ins      record a visit from the desk
GET  /members/:memberId/check-ins      one member's visit history
```

`GET /check-ins` returns the day's register:

```json
{
  "date": "2026-08-14T00:00:00.000Z",
  "total": 2,
  "items": [
    {
      "id": "…", "memberId": "…",
      "date": "2026-08-14T00:00:00.000Z",
      "checkedInAt": "2026-08-14T17:12:04.000Z",
      "source": "FRONT_DESK",
      "alreadyCheckedIn": false,
      "member": { "id": "…", "memberCode": "SWK-0002", "fullName": "Priya Nair", "phone": "+919845012345" }
    }
  ]
}
```

`source` is `APP` (member tapped it) or `FRONT_DESK` (staff recorded it).

Things worth knowing:

- **One check-in per member per day.** Recording a second returns the first with
  `alreadyCheckedIn: true` and a `200` — not an error. Show it as "already
  checked in at 5:12 pm".
- **Requires an active membership.** A lapsed or never-bought member gets a
  `403` with a message naming which case it is. Useful at the desk: it doubles
  as a renewal prompt.
- **Days are the gym's local days**, computed from the gym's timezone rather
  than UTC, so early-morning visits land on the right day. Pass `date` as
  `YYYY-MM-DD`.
- `member.lastVisitAt` on the member record updates on every check-in, so the
  "hasn't been in for a fortnight" list you'll want is already possible with the
  existing member data.

There is **no check-out**, so there is no live occupancy — only who came in on a
given day.

## 6. Enums

Use these exact strings. Add human labels in the UI.

```ts
type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
type FitnessGoal = 'WEIGHT_LOSS' | 'MUSCLE_GAIN' | 'GENERAL_FITNESS' | 'ENDURANCE' | 'REHAB';
type ActivityLevel = 'BEGINNER' | 'OCCASIONAL' | 'REGULAR';
type GymUserStatus = 'ACTIVE' | 'SUSPENDED' | 'LEFT';
type MemberSource = 'APP_SIGNUP' | 'FRONT_DESK' | 'IMPORT';
type GymRole = 'MEMBER' | 'TRAINER' | 'GYM_ADMIN' | 'OWNER';

type DurationUnit = 'DAY' | 'MONTH';
type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'ONLINE' | 'OTHER';
type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING';
type SubscriptionStatus = 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED';
type CheckInSource = 'APP' | 'FRONT_DESK';
```

---

## 7. Known gaps and gotchas

Read these before designing screens. They are real, current, and will bite.

1. **The member list mixes two populations.** Anyone who logs into the mobile
   app is auto-linked to the gym as a `MEMBER` with `source: "APP_SIGNUP"` and
   `memberCode: null` — even if they've never paid or visited. They appear in
   `GET /members` alongside real registered members.
   **Handle it:** filter the main list with `membershipStatus` (see section 5b)
   and put the rest behind a "Leads" tab. `membershipStatus=NONE` is a cleaner
   split than `source`, because it separates people who have actually bought
   something from those who have not.

2. ~~**There are no membership plans yet.**~~ **Built** — see section 5b. Plans,
   selling, renewals, part payments and the expiring list all exist now. Money
   is manual cash only; there is no payment gateway.

3. **There is no endpoint to add a trainer or a second admin.** Only the gym
   owner is created, at gym onboarding. Don't build a staff-management screen;
   it has nothing to call.

4. ~~**No dashboard statistics endpoint exists.**~~ **`GET /members/stats` now
   exists** — see section 5b. Earlier guidance here said to derive counts by
   calling the list once per `membershipStatus` and adding the totals. **That
   was wrong** and double-counted expiring members, because `EXPIRING` is a
   subset of `ACTIVE`. Use the stats endpoint.

5. **No classes or trainers.** Still nothing. Check-in now exists (section 5c),
   but there is no check-*out*, so no live occupancy. Payments are recorded by
   hand against a membership — no gateway, and none planned for now.

6. **The 60-second OTP cooldown** described in section 3. The single most likely
   thing to make the portal feel broken.

7. **Free-tier cold starts** of 30–60 seconds on the first request.

### Fixed on 2026-08-14 — remove any workarounds

`PATCH` used to `500` on `email`, `gender` and `emergencyContactPhone` sent as
`null`, and silently store `1970-01-01` for a null `dateOfBirth`. Root cause:
class-validator's `@IsOptional()` also skips validation for `null`, so nulls
reached transforms like `value.toLowerCase()` that assumed a string.

All four now clear correctly, as does `fullName` (which had the same latent
bug), and the identical bug in `PATCH /users/me` is fixed too. **If the portal
carries an `UNCLEARABLE_FIELDS` list or similar workaround, delete it** — once
the backend is redeployed, clearing works for every field.

---

## 8. What to build

Ship in this order; each step should be usable before the next.

### 1. Scaffold
Vite + React + TS, Tailwind, React Router, TanStack Query. `.env` with
`VITE_API_BASE_URL` and `VITE_GYM_CODE`. A typed API client that attaches both
headers, unwraps the envelope, and turns an error response into a thrown error
carrying `message`, `statusCode` and `errors`.

### 2. Auth
Login screen (gym name and logo from `GET /gyms/current`, phone step, OTP step
with a resend countdown), token storage, silent refresh with a single-flight
queue, a route guard, the staff-only role gate, and logout.

### 3. Members list
The core screen. Table with member code, name, phone, status, joined date and
`hasAppAccount`. Debounced search, status filter, the front-desk/app-signup
split from gotcha 1, pagination, and column sorting on the three supported
fields. Empty state, loading skeleton, error state with retry.

### 4. Register member
A form matching the validation table exactly. Required fields first, the rest
behind an "Additional details" section — the desk is often registering someone
standing in front of them, so make the two-field path fast. Handle `409` well.

### 5. Member detail
View and edit everything except phone, plus deactivate (with the LEFT/SUSPENDED
choice and a confirmation) and reactivate. Show medical notes and emergency
contact prominently — they matter on the gym floor.

### Quality bar
- Every mutation gives visible feedback; every destructive action is confirmed.
- Loading, empty and error states everywhere. Assume the network is slow.
- Keyboard-usable: staff work fast and will not reach for the mouse.
- Backend `message` strings are shown to users as-is; never swallow them into a
  generic "Something went wrong".

---

## 9. Working agreement

- **Verify as you go.** Run the dev server and exercise the real API against the
  deployed backend with the test login above. Don't declare a screen finished
  without seeing it work with real data.
- **Don't mock the API.** It's live; use it.
- **If an endpoint you need doesn't exist, stop and say so.** Do not invent one,
  and do not work around it with a fake. The backend is a separate repo and is
  changed deliberately.
- Keep the API types in one place, mirroring section 5 and 6 exactly.

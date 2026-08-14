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
> only the fields documented below — no extra keys, and omit optional fields
> entirely rather than sending `null` or `""`.

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
login identity and cannot be changed here. Send only changed fields.

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

## 6. Enums

Use these exact strings. Add human labels in the UI.

```ts
type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
type FitnessGoal = 'WEIGHT_LOSS' | 'MUSCLE_GAIN' | 'GENERAL_FITNESS' | 'ENDURANCE' | 'REHAB';
type ActivityLevel = 'BEGINNER' | 'OCCASIONAL' | 'REGULAR';
type GymUserStatus = 'ACTIVE' | 'SUSPENDED' | 'LEFT';
type MemberSource = 'APP_SIGNUP' | 'FRONT_DESK' | 'IMPORT';
type GymRole = 'MEMBER' | 'TRAINER' | 'GYM_ADMIN' | 'OWNER';
```

---

## 7. Known gaps and gotchas

Read these before designing screens. They are real, current, and will bite.

1. **The member list mixes two populations.** Anyone who logs into the mobile
   app is auto-linked to the gym as a `MEMBER` with `source: "APP_SIGNUP"` and
   `memberCode: null` — even if they've never paid or visited. They appear in
   `GET /members` alongside real registered members.
   **Handle it:** default the main list to `source=FRONT_DESK`, and put app
   signups behind a separate tab or filter (call them "App signups" or "Leads").
   Don't show a blank member-code column and hope nobody notices.

2. **There are no membership plans yet.** You cannot show what a member paid
   for, when they expire, or whether they're active-paid. Don't design a
   dashboard around revenue or expiry — the data does not exist. This is the
   next backend feature.

3. **There is no endpoint to add a trainer or a second admin.** Only the gym
   owner is created, at gym onboarding. Don't build a staff-management screen;
   it has nothing to call.

4. **No dashboard statistics endpoint exists.** If you want a landing page, base
   it on `GET /members` counts (e.g. call it with `limit=1` per status and read
   `total`). Don't invent `/dashboard/stats`.

5. **No check-in, classes, trainers or payments.** None of it exists yet.

6. **The 60-second OTP cooldown** described in section 3. The single most likely
   thing to make the portal feel broken.

7. **Free-tier cold starts** of 30–60 seconds on the first request.

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

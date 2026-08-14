# Swasth Admin Portal

Web admin portal for a gym's front desk. Today it does one job: **manage the
gym's members** — register walk-ins, find them, edit them, suspend and reinstate
them.

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
  members/          queries (TanStack Query), form validation, shared form fields
  components/       Button, Field, Modal, Toast, Badge, loading/empty/error states
  routes/           LoginPage, MembersPage, RegisterMemberPage, MemberDetailPage
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

Anyone who logs into the mobile app is auto-linked to the gym as a `MEMBER` with
`source: APP_SIGNUP` and no member code, whether or not they ever paid or
visited. They come back from `GET /members` alongside real registered members,
so the list is split into tabs — **Members** (front desk, the default), **App
signups** (leads), and **Everyone** — rather than showing a half-empty member
code column.

## Known API limitations

Found while building this, all verified against the deployed backend. Each one
is a backend change, not something the portal can fix.

**`PATCH /members/:id` cannot clear four fields.** `null` is the only value the
API accepts for removing a field (`""` is rejected on validated fields), and it
works for `heightCm`, `weightKg`, `goal`, `activityLevel`, `medicalNotes`,
`notes` and `emergencyContactName`. For the rest:

| Field                   | Sending `null`                              |
| ----------------------- | ------------------------------------------- |
| `email`                 | `500 Internal server error`                 |
| `gender`                | `500 Internal server error`                 |
| `emergencyContactPhone` | `500 Internal server error`                 |
| `dateOfBirth`           | `200`, but stores `1970-01-01` — data loss   |

The edit form therefore refuses to clear these four and explains why, instead of
silently dropping the edit or corrupting the date. See `UNCLEARABLE_FIELDS` in
[src/members/form.ts](src/members/form.ts) — delete an entry once the backend is
fixed and clearing that field starts working immediately.

**`fullName` can be `null`.** The API docs type it as always present, but app
signups who never finished onboarding really do come back with
`fullName: null`. Everything renders it through `memberName()` in
[src/lib/format.ts](src/lib/format.ts), which falls back to "Unnamed member".

**Things that don't exist yet**, so the portal doesn't pretend they do: no
membership plans (nothing about what a member paid for, or when they expire), no
dashboard statistics endpoint, no way to add a trainer or a second admin, and no
check-ins, classes or payments.

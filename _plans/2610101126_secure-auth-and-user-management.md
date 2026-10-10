# Implementation Plan: Secure Authentication And User Management

Spec: `_specs/2610101126_secure-auth-and-user-management.md`
Branch: `feature/secure-auth-and-user-management`

---

**Feature type: full-stack.** Backend gains real JWT auth, password hashing, role enforcement and user-management endpoints. Frontend gains a shared API client that attaches the token, a session guard, and a fuller Manage Users tab.

## Architecture Overview

```
frontend (React/Vite)
  src/api.js (axios instance: Bearer token, 401 → /login)
     → backend/server.js (Express)
         → middleware/auth.js (verify JWT, reload user, check status + role)
         → db/index.js (pg Pool) → PostgreSQL (users, routes, transactions)
```

## Key Design Decisions

- **JWT in the `Authorization: Bearer` header, stored in `localStorage` (`token`)**, as the app already does. Cookies are deferred (spec Open Question 3); moving to an httpOnly cookie later only touches `src/api.js` and the login/logout handlers.
- **Stateless JWT plus a per-user `token_version` check.** Claims: `sub` (user id), `role`, `tv` (token version), 8 h expiry. Because the middleware reloads the user row on every request anyway (needed for status and role), it also compares `tv`. Deactivating, deleting, resetting a password or changing a password bumps `token_version`, which revokes every outstanding token immediately without a token blacklist table.
- **Role and identity come from the database row, not the token claims.** Claims are only a hint; a demoted or deactivated user is refused on the next request.
- **`bcryptjs` (already in `package.json`, cost 10) and `jsonwebtoken` (already listed)** are used; no new dependencies. `lowdb` stays untouched (out of scope).
- **Password column is replaced, not supplemented.** Plaintext `password` is hashed in place at startup and the old column dropped, so no readable copy remains. The conversion runs once and is a no-op afterwards.
- **Password strength rule (≥ 8 chars, one letter, one digit) applies to registration, Admin create, reset and change only, not to login.** The demo password `user123` is 7 characters and must keep working.
- **Login throttling is in-memory**, keyed by lower-cased username (known or unknown, so the response never reveals existence): 5 failures → 15 min block, cleared on success. It resets on server restart and is per-process; acceptable for this single-instance demo, noted as a limit.
- **Deleting a Passenger is an anonymising soft delete.** Status becomes `deleted`, the username is renamed to `deleted-<id>` (frees the name, hides identity), the hash is blanked, and Transactions stay attached to the row so the ledger and the existing foreign key stay valid. Allowed only when Balance is 0. Default path for Admins is deactivate.
- **Registration always creates role `user`.** The existing Login face check is retained, but a role mismatch no longer leaves a token in storage.
- **RFID tap requires an Admin session** (the dashboard simulation). A device key for real hardware is deferred to Phase 6 (Open Question 10).
- **Audit trail, self-service reset, extra registration fields, email/SMS** are out of scope (spec Non-Goals / assumed answers).

## Data Model / Migration

Changes to `users` (applied idempotently from `backend/db/schema.sql` plus a one-time legacy-password step in `backend/db/init.js`):

| Column | Type | Notes |
|--------|------|-------|
| `password` | removed | replaced by `password_hash` |
| `password_hash` | TEXT NOT NULL | bcrypt hash |
| `status` | TEXT NOT NULL DEFAULT `'active'` | CHECK in (`active`, `deactivated`, `deleted`) |
| `token_version` | INTEGER NOT NULL DEFAULT 0 | bumped to revoke tokens |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | existing rows get the migration time |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | set on every edit |

`routes` and `transactions` are unchanged.

Startup sequence in `initDatabase`:
1. Apply `schema.sql` (fresh databases get the new shape; existing ones get `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for the new columns, with `password_hash` nullable at this point).
2. If the legacy `password` column exists (check `information_schema.columns`): inside one transaction, bcrypt every row's value into `password_hash`, set `password_hash` NOT NULL, drop `password`. Rows already hashed (start with `$2`) are copied as-is, so a partial earlier run is safe.
3. If `users` is empty, seed as today but hash the seed passwords (`nirmal` / `user123`, `admin` / `admin_rail_2024`).

`backend/scripts/import-data-json.js` must hash the passwords it imports and set the new columns, otherwise `npm run db:import` breaks. No manual cut-over: existing demo accounts and balances survive the first restart. Operators must add `JWT_SECRET` to `backend/.env` before that restart (server refuses to start without it).

## API Contract

All routes except `/`, register and login require `Authorization: Bearer <token>`. Existing response envelopes (`{ success, ... }`) are preserved.

Common errors on every protected route:

| Status | Condition |
|--------|-----------|
| 401 | Missing, malformed, expired or revoked token; user deactivated/deleted. `message` is `Session expired` or `Not signed in` |
| 403 | Valid session but role or ownership not permitted |

### POST /api/register
Body `{ username, password }`. Response `{ success: true, user: { id, username, role: 'user', balance: 0, status: 'active' }, token }`.

| Status | Condition |
|--------|-----------|
| 400 | Username not 3–30 chars of `A-Za-z0-9_.-`, or password fails the strength rule (message states the rule) |
| 409 | Username already taken (replaces today's 400 with `Passenger ID already registered`; frontend only reads `message`) |

### POST /api/login
Body `{ username, password }`. Response as register, with real JWT.

| Status | Condition |
|--------|-----------|
| 401 | Unknown user, wrong password, deactivated or deleted account → always `Invalid username or password` |
| 429 | Blocked after 5 failures; `Too many attempts. Try again in N minutes.` and `Retry-After` header |

### GET /api/me
Returns `{ success: true, user: { id, username, role, balance, status } }`. Used by the frontend guard and to refresh Balance.

### PUT /api/me/password
Body `{ currentPassword, newPassword }`. Response `{ success: true, token }` (new token, since the old one is revoked).

| Status | Condition |
|--------|-----------|
| 400 | New password fails the rule or equals the current one |
| 403 | `currentPassword` wrong |

### GET /api/history/:userId
Unchanged shape. Passenger: `:userId` must equal own id, else 403. Admin: any id.

### POST /api/topup
Body `{ amount }` (a `userId` in the body is ignored for Passengers; if present and different from the session user → 403). Passenger only; an Admin gets 403. Otherwise unchanged (400 invalid amount, `{ success, balance }`).

### POST /api/rfid/tap
Admin only. Body and responses unchanged (200 approved, 402 insufficient, 404 unregistered). New: 403 `Card deactivated` when the target user is not `active`.

### GET /api/routes, PUT /api/routes/:id
GET: any signed-in user. PUT: Admin only; otherwise unchanged.

### GET /api/users
Admin only. Query `search` (case-insensitive substring of username), `role` (`user` | `admin`, optional). Response `{ success: true, users: [{ id, username, role, balance, status, createdAt }] }`. Excludes `deleted` accounts. The previous "passengers only" default is kept by the dashboard passing `role=user`; it no longer includes passwords (it never did).

### POST /api/users (Admin)
Body `{ username, password, role? }` (`role` default `user`). Response `{ success, user }`.
Errors: 400 validation, 409 duplicate username.

### PUT /api/users/:id (Admin)
Body `{ username?, role? }`. Response `{ success, user }`.
Errors: 400 validation, 404 not found, 409 duplicate, 409 `Cannot demote the last active admin` / `Cannot change your own role`.

### PUT /api/users/:id/status (Admin)
Body `{ status: 'active' | 'deactivated' }`. Bumps `token_version` when deactivating.
Errors: 404, 409 `Cannot deactivate your own account` / `Cannot deactivate the last active admin`.

### POST /api/users/:id/reset-password (Admin)
Body `{ newPassword }`. Bumps `token_version`. Response `{ success: true }`. Errors: 400 weak password, 404.

### DELETE /api/users/:id (Admin)
Anonymising soft delete. Response `{ success: true }`.
Errors: 404, 409 `Cannot delete your own account`, 409 `Cannot delete the last active admin`, 409 `Balance must be zero before deleting`.

## Algorithm / Logic Detail

**Auth middleware `requireAuth`:**
1. Read bearer token; verify signature and expiry with `JWT_SECRET`; any failure → 401.
2. `SELECT id, username, role, status, token_version, balance` for `sub`. Missing, `status != 'active'`, or `tv != token_version` → 401.
3. Attach `req.user` from the row (not the claims). `requireRole('admin')` and an ownership helper run after this.

**Login:**
1. Normalise username (trim). Check throttle for that key; blocked → 429.
2. Look up user. Always run one bcrypt compare (against a fixed dummy hash when no user exists) so timing doesn't reveal existence.
3. On any failure (including non-active status) record a failure and return the generic 401. On success clear the counter, sign the JWT, return profile.

**Last-admin / self-protection rules** (deactivate, delete, demote): inside one transaction, `SELECT … FOR UPDATE` the active admin rows, then reject if the target is the caller, or if the target is an active admin and the active-admin count is 1. This stops two Admins removing each other concurrently.

**Delete:** in one transaction lock the row, require `balance = 0`, then set `status='deleted'`, `username='deleted-<id>'`, `password_hash=''` (never matches a bcrypt compare), bump `token_version`, set `updated_at`.

**Concurrency with existing money paths:** top-up and tap keep their single conditional `UPDATE` plus ledger `INSERT`; the only additions are the auth check before and a status check inside the tap transaction.

## Project Structure

```
backend/
  middleware/
    auth.js          requireAuth, requireRole, signToken, own-account guard
  lib/
    passwords.js     hash/compare, strength + username validation
    loginThrottle.js in-memory attempt counter
  routes/
    users.js         admin user-management router (mounted at /api/users)
frontend/src/
  api.js             axios instance + token/session helpers
  components/
    RequireAuth.jsx  route guard calling GET /api/me
```

## Files to Modify / Files to Create

**To Modify**
- `backend/server.js`: validate `JWT_SECRET` at startup; replace register/login with hashed, JWT versions; add `/api/me`, `/api/me/password`; apply `requireAuth`/`requireRole` to history, topup, tap, routes, users; mount the users router; 429/409 handling.
- `backend/db/schema.sql`: new `users` shape and `ALTER … ADD COLUMN IF NOT EXISTS` statements.
- `backend/db/init.js`: legacy-password conversion step; hashed seeding.
- `backend/db/seed.js`: unchanged data (plaintext stays here only as seed input, hashed on insert).
- `backend/scripts/import-data-json.js`: hash imported passwords, populate new columns.
- `backend/.env.example`: add `JWT_SECRET`, optional `JWT_EXPIRES_IN` (default `8h`).
- `frontend/src/App.jsx`: wrap `/dashboard`, `/admin`, `/routes` in `RequireAuth` with a required role where relevant.
- `frontend/src/pages/Login.jsx`: use `api.js`; store token/user only when the role matches the face used; show the password rule hint, 409/429 messages and any "session expired" flash message.
- `frontend/src/pages/Dashboard.jsx`: use `api.js`; drop `userId` from top-up; add a compact "Change password" control; logout goes through shared helper.
- `frontend/src/pages/AdminDashboard.jsx`: use `api.js`; Manage Users tab gains search, Add User form, per-row actions (edit, deactivate/reactivate, reset password, delete) with confirmation, real Status badge, Created column; guards for self/last-admin errors surface the server message. Overview/Routes/RFID tabs keep their layout.
- `frontend/src/pages/Routes.jsx`: only if it needs the guard; no API calls added.
- `CLAUDE.md`, `smartrail-ticketing.md`: replace the "no endpoint requires authentication / plaintext passwords / placeholder token" notes, document the new env var, endpoints and `src/api.js`.

**Left Unchanged**
- Tailwind config, `index.css`, the "no purple" palette, login flip animation and dashboard layouts.
- Fare calculation, top-up amount rules, Live tracking board data, PWA manifest, `routes` and `transactions` tables.

## Build Order

| Phase | Owner | Work |
|-------|-------|------|
| 0 | Backend | `JWT_SECRET` handling, `lib/passwords.js`, schema changes and legacy-password migration in `init.js`, update import script |
| 1 | Backend | `middleware/auth.js`, new register/login/`/me`/change-password, login throttle |
| 2 | Backend | Protect history/topup/tap/routes with ownership and role rules; deactivated-card tap refusal |
| 3 | Backend | `routes/users.js` admin endpoints with last-admin and self-protection rules |
| 4 | Backend | Frontend wiring: `src/api.js`, `RequireAuth`, Login/Dashboard/AdminDashboard switched to the client and new response codes |
| 5 | Frontend | Manage Users tab UI (search, add, edit, status, reset, delete), change-password control, session-expired message, empty/error/loading states |
| 6 | Backend | Update `CLAUDE.md` and `smartrail-ticketing.md` |

## Manual Verification Plan

No test suite exists in `backend/` or `frontend/` (default per `CLAUDE.md`); verification is manual. Replace `$T` with the token from the relevant login.

1. **Startup without secret:** remove `JWT_SECRET`, `npm start` → exits with a clear message. Restore it.
2. **Migration:** start on a database that still has plaintext passwords → starts normally; `SELECT username, password_hash FROM users` shows `$2…` values and no `password` column. Restart → no changes, no errors.
3. **Demo logins:** `POST /api/login` with `nirmal`/`user123` and `admin`/`admin_rail_2024` → 200 with a JWT and unchanged balances; no `password` in the body.
4. **Generic failure:** wrong password and unknown username both → 401 `Invalid username or password`.
5. **Throttle:** 5 wrong passwords for `nirmal` → 6th (even correct) returns 429 with `Retry-After`.
6. **Registration:** weak password (`abc`) → 400; duplicate `nirmal` → 409; valid new user → 200 with token, role `user`, balance 0; body containing `"role":"admin"` is ignored.
7. **No token:** `GET /api/users`, `/api/history/1`, `/api/routes`, `POST /api/topup`, `POST /api/rfid/tap` without a header → all 401.
8. **Tampering:** alter a character of the token → 401; edit `user.role` in browser `localStorage` to `admin` and open `/admin` → page loads guard, `/api/me` says `user`, redirected, and admin API calls return 403.
9. **Ownership:** as `nirmal`, `GET /api/history/2` → 403; `POST /api/topup` with another `userId` → 403; own top-up → 200 and history shows a credit.
10. **Role gate:** as `nirmal`, `PUT /api/routes/1`, `GET /api/users`, `POST /api/rfid/tap` → 403.
11. **Admin user management (UI, `/admin` → Manage Passengers):** search by username filters; add a user; edit its username; deactivate it → that user's open session gets 401 on next call and login is refused; reactivate → login works; reset its password → old token stops working, new password works; delete with non-zero balance → 409 message; set balance to zero via a tap, then delete → disappears from list, username can be re-registered.
12. **Self-protection:** as `admin`, deactivate, delete and demote self → each blocked with a message; with only one active admin, creating a second admin and removing the first from the second works, but removing the last is blocked.
13. **Change password (Passenger Dashboard):** wrong current password → error; correct → still signed in via returned token; old token → 401; login with new password works.
14. **Expiry:** set `JWT_EXPIRES_IN=10s`, log in, wait, perform any action → redirected to `/login` with "session expired" message.
15. **Tap rules:** as `admin`, tap `nirmal` for more than the balance → 402 `Insufficient funds`; valid tap → approved and balance reduced; tap a deactivated user → 403.
16. **Regression:** Live tracking board loads for a Passenger; route Fare edit by Admin persists; layout and colours match before the change.

## Verification

1. `cd backend && npm install && npm start` with `DATABASE_URL` and `JWT_SECRET` set; confirm the "running" log line.
2. `cd frontend && npm run dev`; open the Vite URL.
3. Log in as passenger `nirmal` / `user123` → dashboard shows Balance and history; top up; log out → returns to `/login` and `localStorage` has no `token`/`user`.
4. Log in as admin `admin` / `admin_rail_2024` on the Administrator face → user management actions from steps 11–12 above work.
5. Run the curl checks in steps 7–10 and confirm every protected route rejects anonymous and cross-role calls.
6. Confirm `SELECT count(*) FROM users WHERE password_hash NOT LIKE '$2%' AND status <> 'deleted'` returns 0.
7. Confirm all acceptance criteria in the spec's checklist.

## Critical Files

| File | Why |
|------|-----|
| `backend/server.js` | Every endpoint gains auth, ownership and role rules |
| `backend/middleware/auth.js` | Single enforcement point for token validity, status, role |
| `backend/db/schema.sql` / `backend/db/init.js` | Column changes and the one-time plaintext → hash conversion |
| `backend/routes/users.js` | Admin user-management rules, last-admin protection |
| `backend/scripts/import-data-json.js` | Must hash passwords or the legacy import path breaks |
| `frontend/src/api.js` | Token attachment and uniform 401 handling replace per-page hardcoded URLs |
| `frontend/src/pages/Login.jsx` | Stops storing tokens on role mismatch; new error states |
| `frontend/src/pages/AdminDashboard.jsx` | User management UI |
| `CLAUDE.md` | Currently states there is no authentication; must be corrected |

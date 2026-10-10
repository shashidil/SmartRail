# Implementation Plan: Real Database Persistence

Spec: `_specs/2610101102_real-database-persistence.md`
Branch: `feature/real-database-persistence`

---

**Feature type: backend-only.** Every route keeps its path, request shape, response shape and status codes, so no frontend file changes.

## Architecture Overview

```
frontend (React/Vite, axios, unchanged)
   → backend/server.js (Express, same routes)
      → backend/db/index.js (pg Pool, DATABASE_URL from backend/.env)
         → PostgreSQL 17 @ localhost:5432, database "smartrail"
```

## Key Design Decisions

- **`pg` with plain SQL, no ORM or query builder.** The app has 8 endpoints and 3 tables; an ORM adds more than it removes. The unused `lowdb`, `bcryptjs`, `jsonwebtoken` dependencies are left alone (out of scope).
- **Atomicity via a single conditional `UPDATE`, not read-then-write.** A tap does `balance = balance - $amount WHERE id = $id AND balance >= $amount` inside a DB transaction together with the ledger `INSERT`. The row lock taken by `UPDATE` serializes concurrent taps on the same Passenger, which is what fixes the lost-update bug of the JSON file. No application-level locking.
- **Balance stored as `NUMERIC(12,2)`**, parsed back to JS numbers by a `pg` type parser so JSON output stays `500`, not `"500.00"`.
- **Transaction `date` is stored as a real timestamp and formatted on output** with the exact expression the server uses today (`toLocaleDateString() + ', ' + toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})`), so the UI text is identical. Resolves the spec's open question.
- **Transaction `id` becomes a database sequence.** Legacy ids (`Date.now()` milliseconds) are preserved on import and the sequence is advanced past the largest one, so ordering by `id DESC` still means "newest first". The imported rows' timestamps are derived from those millisecond ids.
- **Passwords stay plain text** (spec non-goal). Hashing is a separate follow-up.
- **Import is an explicit one-time command, never automatic**, and refuses to run unless the database is empty. This avoids the seed-vs-import conflict (startup seeding `nirmal` with 500 would otherwise clash with imported balances).
- **Fail fast on startup** if the database is unreachable, rather than serving a half-working API.
- **Small deliberate behaviour tightening:** `amount` for top-up and tap must be a finite number greater than 0, else `400`. Today `NaN`, negative or missing values corrupt balances (a negative tap credits the card). A non-numeric value would also make Postgres throw. Flagged here because it is the only change visible to API clients.

## Data Model / Migration

Applied idempotently on every startup from `backend/db/schema.sql` (`CREATE TABLE IF NOT EXISTS`); there is no migration tool, since there is one schema version.

**users**

| Column | Type | Notes |
|---|---|---|
| id | `SERIAL PRIMARY KEY` | replaces `users.length + 1` |
| username | `TEXT NOT NULL UNIQUE` | |
| password | `TEXT NOT NULL` | plain text, as today |
| role | `TEXT NOT NULL CHECK (role IN ('user','admin'))` | |
| balance | `NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0)` | check is a safety net behind the conditional update |

**routes**

| Column | Type |
|---|---|
| id | `SERIAL PRIMARY KEY` |
| name | `TEXT NOT NULL` |
| stations | `TEXT NOT NULL` |
| base_fare | `NUMERIC(10,2) NOT NULL` |
| per_km | `NUMERIC(10,2) NOT NULL` |
| total_km | `NUMERIC(8,2) NOT NULL` |

Queries alias these back to `baseFare`, `perKm`, `totalKm`.

**transactions**

| Column | Type | Notes |
|---|---|---|
| id | `BIGSERIAL PRIMARY KEY` | parsed to JS number (safe below 2^53) |
| user_id | `INTEGER NOT NULL REFERENCES users(id)` | exposed as `userId` |
| type | `TEXT NOT NULL CHECK (type IN ('credit','debit'))` | |
| title | `TEXT NOT NULL` | |
| amount | `NUMERIC(12,2) NOT NULL CHECK (amount > 0)` | |
| created_at | `TIMESTAMPTZ NOT NULL DEFAULT now()` | formatted into `date` on output |

Index: `transactions (user_id, id DESC)` for the history query.

**Seeding:** if `users` is empty at startup, insert the 2 demo accounts (ids 1 and 2) and the 9 routes (ids 1-9) currently hard-coded in `server.js`, then `setval` the sequences to the max id. Seed content moves to `backend/db/seed.js`.

**Importing `data.json`:** `npm run db:import` (new script). Steps:
1. Ensure schema exists.
2. Abort with a message if `users` already has rows.
3. In one transaction, insert users, routes and transactions preserving `id`, `balance`, `role`; derive `created_at` from each legacy transaction id.
4. `setval` all three sequences to `max(id)`.
5. Commit and print row counts.

If the server was already started once (so seed rows exist) and the import is wanted, drop and recreate the `smartrail` database first, then run the import, then start the server.

**Cut-over:** `data.json` stays on disk, unread and unwritten (already gitignored). `backend/.env` already contains `DATABASE_URL`; a committed `backend/.env.example` documents it without secrets.

## API Contract

All paths, bodies and success responses are **unchanged**. Only error handling is added.

| Method + path | Behaviour change |
|---|---|
| `POST /api/register` | Duplicate username detected by unique constraint (`INSERT ... ON CONFLICT DO NOTHING RETURNING`), same `400` message, now race-safe |
| `POST /api/login` | none |
| `GET /api/history/:userId` | Non-numeric `userId` returns `{success:true, history:[]}` as today; `date` formatted from `created_at` |
| `GET /api/users` | none, ordered by id |
| `GET /api/routes` | none, ordered by id |
| `PUT /api/routes/:id` | none; `404` when no row updated |
| `POST /api/topup` | atomic credit + ledger row; `amount` must be > 0 |
| `POST /api/rfid/tap` | atomic debit + ledger row; `amount` must be > 0 |

New or clarified error codes:

| Status | Endpoints | Condition |
|---|---|---|
| 400 | topup, tap | `amount` missing, not finite, or <= 0 (`{success:false, message:'Invalid amount'}`) |
| 400 | register | username already exists (existing message) |
| 401 | login | no matching username/password (existing) |
| 402 | tap | balance lower than amount (existing `Insufficient funds`) |
| 404 | topup | unknown user (`User not found`) |
| 404 | tap | unknown or non-numeric `userId` (`RFID unregistered`) |
| 404 | routes PUT | unknown route (existing) |
| 500 | any | database error; `{success:false, message:'Server error'}`, nothing partially applied |

## Algorithm / Logic Detail

**Top-up (`userId`, `amount`):**
1. Validate `amount`; coerce `userId` with `Number`.
2. Begin transaction.
3. `UPDATE users SET balance = balance + amount WHERE id = userId RETURNING balance`.
4. No row → rollback, `404`.
5. `INSERT` ledger row (`credit`, title `Card Recharge`).
6. Commit, respond `{success:true, balance}`.

**Tap (`userId`, `amount`):**
1. Validate `amount`; non-numeric `userId` → `404`.
2. Begin transaction.
3. `UPDATE users SET balance = balance - amount WHERE id = userId AND balance >= amount RETURNING balance`.
4. If a row came back → `INSERT` ledger row (`debit`, title `Station Exit Tap`), commit, respond `{success:true, message:'Tap Approved', newBalance}`.
5. If not → `SELECT` the user: absent → `404`, present → `402`. Rollback; nothing changed.

**Concurrency edge cases:**
- Two taps for a balance that covers one: the second `UPDATE` blocks on the row lock, re-evaluates `balance >= amount` against the committed value, matches nothing → `402`.
- Top-up concurrent with tap: both updates serialize on the row; final balance is start + credit - debit.
- Connection failure mid-request: the transaction rolls back, so no balance change without its ledger row.

**Helper:** a `withTransaction(fn)` in `backend/db/index.js` handles `BEGIN` / `COMMIT` / `ROLLBACK` and releases the client in `finally`.

**Express 4 async handling:** wrap handlers in a small `asyncHandler` and add one final error middleware that returns the `500` JSON above.

## Project Structure

```
backend/
├── server.js                  (modified) routes now call the database
├── db/
│   ├── index.js               pg Pool, type parsers, query + withTransaction helpers
│   ├── schema.sql             idempotent CREATE TABLE / INDEX statements
│   ├── seed.js                demo users and 9 routes (moved out of server.js)
│   └── init.js                runs schema.sql, seeds when users is empty
├── scripts/
│   └── import-data-json.js    one-time data.json import
└── .env.example               DATABASE_URL placeholder, no secrets
```

## Files to Modify / Files to Create

**To Modify**
- `backend/server.js`: remove `fs`/`path`/`DB_PATH`, `initDB`, `getData`, `saveData`; call `initDatabase()` before `app.listen` (exit with a clear message on failure); rewrite each handler with SQL per the sections above; add `asyncHandler`, `formatTxnDate`, error middleware. Keep route paths, JSON shapes and the root health text.
- `backend/package.json`: add `pg` dependency; add `"db:import": "node scripts/import-data-json.js"` script.
- `CLAUDE.md`: replace the "Persistence is a plain JSON file" paragraph with the PostgreSQL setup (`DATABASE_URL`, schema bootstrap, import command, reset by recreating the database).
- `smartrail-ticketing.md`: update the Persistence line in Technical Architecture.

**To Create**
- `backend/db/index.js`, `backend/db/schema.sql`, `backend/db/seed.js`, `backend/db/init.js`, `backend/scripts/import-data-json.js`, `backend/.env.example` (responsibilities as in Project Structure).

**Left Unchanged**
- Everything under `frontend/` (pages, Tailwind config, PWA manifest).
- `backend/.env` (already created locally and gitignored), `.gitignore`, `backend/data.json`.
- Unused `lowdb`, `bcryptjs`, `jsonwebtoken` dependencies.

## Build Order

| Phase | Owner | Work |
|-------|-------|------|
| 0 | Backend | Local PostgreSQL provisioned and `backend/.env` written (done) |
| 1 | Backend | `npm install pg`; create `db/index.js`, `db/schema.sql` |
| 2 | Backend | `db/seed.js` and `db/init.js`; wire into `server.js` startup with fail-fast |
| 3 | Backend | Rewrite read endpoints: login, history, users, routes |
| 4 | Backend | Rewrite write endpoints: register, routes PUT, topup, tap (transactions, amount validation, error middleware) |
| 5 | Backend | `scripts/import-data-json.js` and `db:import` script |
| 6 | Backend | `.env.example`, update `CLAUDE.md` and `smartrail-ticketing.md` |
| 7 | Backend | Run the Verification checklist end-to-end with the unchanged frontend |

No Frontend phase: the spec requires the UI to stay unchanged.

## Manual Verification Plan

This repo has no test suite or test script, and the spec does not ask for one, so verification is manual (see Verification below for the exact steps).

## Verification

Run from `backend/` with PostgreSQL running; set `DB="postgresql://postgres:1234@localhost:5432/smartrail"` for the `psql` checks.

1. **Clean start / seed.** `npm start`. Expect the startup log and no error. `psql $DB -c "select id,username,role,balance from users"` shows `nirmal` (500) and `admin`; `select count(*) from routes` returns 9.
2. **Restart safety.** Stop and start again; the row counts are unchanged (no duplicate seed).
3. **Unreachable database.** Temporarily stop the PostgreSQL service or set a wrong port in `.env`, run `npm start`: process exits with a clear connection error and does not listen.
4. **Login.** Frontend: log in as `nirmal` / `user123` and `admin` / `admin_rail_2024`; wrong password shows the existing invalid-credentials message.
5. **Register.** Register a new Passenger; it appears in Admin → Users with balance 0. Register the same username again: existing "Passenger ID already registered" message.
6. **Top-up persists.** As `nirmal`, top up Rs. 100: balance 600 and newest history row "Card Recharge" with the same date format as before. Restart the backend and reload: balance and row remain.
7. **Tap.** Admin → RFID, user id 1, amount 50: approved; balance 550; history shows "Station Exit Tap". Amount above balance: `402` message "Insufficient funds", balance and history unchanged.
8. **Validation.** `curl -X POST localhost:5000/api/rfid/tap -H "Content-Type: application/json" -d '{"userId":1,"amount":-5}'` returns `400`; `amount:"abc"` returns `400`; unknown `userId` 999 returns `404`.
9. **Fare edit.** Admin → Routes: change Main Line fare, restart backend, reload: new fare persists.
10. **Concurrency.** Set `nirmal` to a balance of 500, then fire 10 simultaneous taps of 100 (for example `for i in $(seq 10); do curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:5000/api/rfid/tap -H "Content-Type: application/json" -d '{"userId":1,"amount":100}' & done; wait`). Expect exactly five `200` and five `402`; final balance 0; `select balance = 500 + coalesce(sum(case when type='credit' then amount else -amount end),0) from users, transactions where users.id=1 and transactions.user_id=1 group by balance` is true.
11. **Import.** With a populated `data.json` copy, recreate the empty `smartrail` database, run `npm run db:import`: row counts equal the file, balances and ledger match, and a new top-up gets an id greater than all imported ids. Run the import again: it refuses and changes nothing.
12. **No leakage.** `git status` shows no `.env`, `data.json` or database files staged; `GET /api/users` response contains no `password` field.
13. **UI unchanged.** Click through Login, Dashboard, Admin tabs and the live tracking board; no visual or behavioural differences and no frontend file in `git diff`.

## Critical Files

| File | Why |
|------|-----|
| `backend/server.js` | All endpoints; the only file whose behaviour must be rewritten while keeping its contract |
| `backend/db/schema.sql` | Source of truth for tables, constraints and the history index |
| `backend/db/index.js` | Pool configuration, numeric/bigint parsing, transaction helper |
| `backend/db/init.js` / `backend/db/seed.js` | First-start behaviour must reproduce today's demo data exactly |
| `backend/scripts/import-data-json.js` | Only path that preserves existing Balances and Transaction history |
| `backend/.env` / `backend/.env.example` | `DATABASE_URL`; real file is never committed |
| `frontend/src/pages/Dashboard.jsx` | Reads `history[].id/type/title/date/amount`; the API output must keep matching it |
| `frontend/src/pages/AdminDashboard.jsx` | Reads users and routes and posts taps; also must keep matching the API |

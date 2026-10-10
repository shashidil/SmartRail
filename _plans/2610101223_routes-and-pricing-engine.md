# Implementation Plan: Routes And Pricing Engine

Spec: `_specs/2610101223_routes-and-pricing-engine.md`
Branch: `feature/routes-and-pricing-engine`

---

**Feature type: full-stack.** Backend gains Station-aware Routes with one fixed trip Fare, a trip (start tap / end tap) lifecycle, an audit trail and a GPS position store. Frontend gains a real Routes & Pricing manager, a trip-based RFID emulator, a read-only Passenger Routes view, and a Live tracking board fed by the API.

## Architecture Overview

```
frontend (React/Vite, src/api.js)
   AdminDashboard (Routes & Pricing, RFID terminal, open trips)
   Routes.jsx (Passenger: Routes + Fares, Live tracking board)   Dashboard.jsx (My trips)
        │  Bearer JWT
        ▼
backend/server.js ── routes/railRoutes.js  (/api/routes, history)
                  ├─ routes/trips.js      (/api/rfid/tap, /api/trips…)
                  └─ routes/trains.js     (/api/trains, /api/trains/position)
                         │
                   db/index.js (pg Pool, withTransaction) → local PostgreSQL
GPS device / RFID reader ──LAN──► same Express server (no cloud dependency)
```

## Key Design Decisions

- **One fixed `fare` per Route replaces `base_fare` + `per_km`.** No distance maths anywhere. The old columns stay in the table (made nullable, no longer read or written) so the migration is non-destructive and reversible; they can be dropped in a later cleanup.
- **A tap is an explicit `start` or `end`, not auto-toggled.** The reader at the gate knows its direction, and the spec requires "end tap with no open trip → refused" and "second start while open → refused", which an auto-toggle would silently turn into a new trip.
- **The Fare is snapshotted on the trip when it starts**, and that stored value is what is debited at the end. Mid-trip Fare edits never affect an open trip.
- **Debit happens at the end tap**; the start tap only checks Balance ≥ Fare (no hold). Because Top-up only adds and the old arbitrary-amount tap is removed, the Balance cannot drop between start and end, so the end-tap debit should always succeed. If it does not (e.g. Card deactivated meanwhile) the trip stays open and the Admin can cancel it.
- **"At most one open trip per Card" is enforced by the database** (partial unique index on open trips), not just by a pre-check, so two simultaneous start taps cannot both succeed.
- **"No double charge" is enforced by the transition** `open → completed` (a conditional update inside the same transaction as the debit and ledger insert). A bounced second end tap finds no open trip and is refused with nothing debited.
- **Optimistic concurrency on Routes** via a `version` counter: an edit carrying a stale version gets 409 so one Admin cannot silently overwrite another.
- **Stations are a shared table; a Route holds an ordered list of them.** A junction Station is one row used by several Routes. Admins type Station names; the server finds-or-creates by case-insensitive name, so there is no separate Station admin screen in the MVP.
- **GPS ingest is minimal and last-position-only.** One row per train, upserted. "No signal" is computed at read time from age, so a dead feed never shows a stale position as live. The feed uses the existing admin-authenticated bridge; device authentication stays out of scope (as in `CLAUDE.md`).
- **Local-only**: no new external service, no CDN calls introduced. Everything runs against the local Express + PostgreSQL pair.
- **Out of scope:** distance Fares, Fare classes, payment gateway, auto-expiry of open trips (Admin cancels), store-and-forward on readers, a train-list admin screen.
- **Assumptions taken from the spec's Open Questions** (change here if answers differ): one Fare per Route; debit at end tap; wrong-Route end tap is refused; Admin-only cancellation of open trips; starting Fare = the Route's current `base_fare`, to be confirmed by the Admin after migration.

## Data Model / Migration

All changes go in `backend/db/schema.sql` as idempotent statements (the file is re-applied on every start).

**`routes` (altered)**
- add `fare NUMERIC(10,2)` (≥ 0), `status TEXT NOT NULL DEFAULT 'active' CHECK IN ('active','inactive')`, `version INTEGER NOT NULL DEFAULT 1`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `stations`, `base_fare`, `per_km`, `total_km`: `DROP NOT NULL` (legacy, unused)

**`stations` (new):** `id SERIAL PK`, `name TEXT NOT NULL`, unique index on `lower(name)`.

**`route_stations` (new):** `route_id → routes ON DELETE CASCADE`, `station_id → stations`, `position INTEGER NOT NULL`; PK `(route_id, position)`, unique `(route_id, station_id)`.

**`trips` (new):**

| Field | Type | Note |
|-------|------|------|
| id | BIGSERIAL PK | |
| user_id | INTEGER → users | |
| route_id | INTEGER → routes | |
| start_station_id / end_station_id | INTEGER → stations | end null while open |
| fare | NUMERIC(10,2) | snapshot at start |
| status | TEXT | `open` / `completed` / `cancelled` |
| started_at / ended_at | TIMESTAMPTZ | |
| transaction_id | BIGINT → transactions | null if cancelled or fare 0 |
| cancelled_by | INTEGER → users | |
| cancel_reason | TEXT | |

Indexes: unique `(user_id) WHERE status = 'open'`; `(status, started_at DESC)`; `(user_id, id DESC)`.

**`route_audit` (new):** `id BIGSERIAL`, `route_id`, `admin_id → users`, `action` (`create`/`update`/`fare`/`status`/`stations`), `old_values JSONB`, `new_values JSONB`, `created_at`.

**`train_positions` (new):** `train_no TEXT PK`, `train_name TEXT`, `route_id INTEGER → routes NULL`, `latitude NUMERIC(9,6)`, `longitude NUMERIC(9,6)`, `speed_kmh NUMERIC(6,1) NULL`, `reported_at TIMESTAMPTZ`.

**Data migration** (new step in `db/init.js`, after `ensureSchema`, own transaction, safe to repeat):
1. For each route with `fare IS NULL`: `fare = base_fare`.
2. For each route with no `route_stations` rows: parse the legacy `stations` text (`"<Origin> (Nkm) ⇄ <Destination> (Nkm)"`) into two Stations (origin position 1, destination position 2), upserting into `stations`. A route whose text does not match the pattern is left without Stations and logged, so an Admin must complete it (it cannot start trips until it has ≥ 2).
3. Extend `syncSequences` to cover `stations`, `trips`, `route_audit`.

Fresh databases: `db/seed.js` `seedRoutes` changes to `{ id, name, fare, stations: [origin, destination] }` (fare = previous `baseFare`); `init.js` seeding inserts through the same helper used by the migration. No `data.json` import change is needed beyond `scripts/import` mapping `baseFare` → `fare` if that script reads `seedRoutes` fields (check when implementing).

Existing `transactions` are untouched. Trips completed from now on write one `debit` row titled e.g. `Trip: Main Line (Colombo Fort → Kandy)`.

## API Contract

All endpoints need a Bearer token. `date` strings are formatted like transactions (`formatTxnDate`, moved to `backend/lib/format.js`).

### `GET /api/routes` (changed)
Admin sees all Routes; Passenger sees only `active` Routes. **Response shape changes** (`stations` becomes an array; `baseFare`/`perKm`/`totalKm` removed); the only current consumer is `AdminDashboard.jsx`, updated in this plan.
```json
{ "success": true, "routes": [
  { "id": 1, "name": "Main Line", "fare": 250, "status": "active", "version": 3,
    "stations": [ { "id": 1, "name": "Colombo Fort", "position": 1 }, { "id": 2, "name": "Badulla", "position": 2 } ] } ] }
```

### `POST /api/routes` (new, admin)
Body: `{ "name": "Main Line Express", "fare": 300, "stations": ["Colombo Fort", "Kandy"] }` → `{ success, route }`.

### `PUT /api/routes/:id` (changed, admin)
Body: `{ "name", "fare", "status", "stations": [names], "version": 3 }` (all but `version` optional; omitted fields unchanged) → `{ success, route }` with `version` incremented. One audit row per call.

| Status | Condition |
|--------|-----------|
| 400 | name blank; fare not a number ≥ 0; fewer than 2 Stations; duplicate or blank Station name; status not `active`/`inactive` |
| 403 | caller not admin |
| 404 | Route not found |
| 409 | `version` stale; or a Station being removed is the start Station of an open trip on this Route |

### `GET /api/routes/history?routeId=` (new, admin)
→ `{ success, history: [ { id, routeId, routeName, admin: "admin", action, oldValues, newValues, date } ] }` newest first, last 100.

### `POST /api/rfid/tap` (changed, admin; replaces the amount-based tap)
Body: `{ "userId": 1, "action": "start" | "end", "routeId": 1, "stationId": 1 }`

Start → `{ success: true, message: "Trip started", trip: { id, routeId, fare, status: "open" }, balance }`
End → `{ success: true, message: "Trip completed", trip: { id, fare, status: "completed" }, newBalance }`

| Status | Condition |
|--------|-----------|
| 400 | `action` invalid; ids not integers; `stationId` not on the Route; end Station equals start Station |
| 402 | start: Balance < Route fare; end: debit failed for lack of Balance (trip stays open) |
| 403 | Card deactivated (existing message "Card deactivated") |
| 404 | user, Route or Station not found (user: "RFID unregistered") |
| 409 | start: Card already has an open trip; start on an inactive Route; end: no open trip; end: Route differs from the open trip's Route |

### Trip lists (new)
- `GET /api/trips/mine` (any role; Passenger's own, last 20) and `GET /api/trips?status=&userId=` (admin, last 100):
  `{ success, trips: [ { id, userId, username, routeId, routeName, startStation, endStation, fare, status, startedAt, endedAt, cancelReason } ] }`
- `PUT /api/trips/:id/cancel` (admin) body `{ "reason": "Forgot to tap out" }` → `{ success, trip }`. 400 reason blank; 404 trip missing; 409 trip not open. No debit, no ledger row.

### `GET /api/trains` (new, any role)
→ `{ success, trains: [ { trainNo, name, routeId, routeName, latitude, longitude, speedKmh, reportedAt, signal: "live" | "no_signal", status: "running" | "stopped" | "no_signal" } ] }`. `signal` is `no_signal` when `reportedAt` is older than `TRAIN_SIGNAL_TIMEOUT_SECONDS` (default 300). `status` is `running` if live and speed > 0, `stopped` if live and speed ≤ 0 or null, else `no_signal`. An empty array means "awaiting GPS".

### `POST /api/trains/position` (new, admin-authenticated feed endpoint)
Body: `{ "trainNo": "1015", "name": "Udarata Menike", "routeId": 1, "latitude": 6.9, "longitude": 79.8, "speedKmh": 52 }` → `{ success: true }`. Upserts by `trainNo`; `reportedAt` is server time. 400 on missing `trainNo`, non-numeric or out-of-range coordinates; 404 on unknown `routeId`.

## Project Structure

```
backend/
  lib/format.js            formatTxnDate (moved out of server.js), shared by history + trips
  lib/routeInput.js        parse/validate Route body: name, fare, status, stations[]
  routes/railRoutes.js     Route CRUD, history (admin) + passenger-safe list
  routes/trips.js          /api/rfid/tap, /api/trips, /api/trips/mine, cancel
  routes/trains.js         /api/trains, /api/trains/position
frontend/src/components/admin/
  RoutesPricing.jsx        Routes list, create/edit modal, history panel
  RfidTerminal.jsx         Route/Station/action tap form + open trips list with cancel
```

## Algorithm / Logic Detail

**Start tap** (one `withTransaction`):
1. Load Card: `SELECT … FROM users WHERE id` → 404 if missing/`deleted`; 403 if `deactivated`.
2. Load Route (`status='active'` else 409), confirm `stationId` is in `route_stations` else 400.
3. If `balance < route.fare` → 402.
4. `INSERT INTO trips (…, fare = route.fare, status='open')`. A unique-violation on the open-trip index → 409 "Trip already open". Return trip and Balance.

**End tap** (one `withTransaction`):
1. Card checks as above (404 / 403).
2. `SELECT … FROM trips WHERE user_id = $1 AND status = 'open' FOR UPDATE`. None → 409 "No open trip".
3. Route mismatch → 409; `stationId` not on Route → 400; equals start Station → 400.
4. If `fare > 0`: `UPDATE users SET balance = balance - fare WHERE id AND status='active' AND balance >= fare RETURNING balance`; no row → 402 and roll back (trip remains open). Insert the `debit` transaction. A `fare` of 0 completes the trip without a ledger row (ledger requires amount > 0).
5. `UPDATE trips SET status='completed', end_station_id, ended_at=now(), transaction_id`. Row-lock plus status predicate means a duplicate end tap blocks, then finds no open trip → 409 with nothing debited.

**Route save** (`PUT`): in one transaction, `UPDATE routes SET … , version = version + 1 WHERE id AND version = $v`; zero rows → distinguish 404 vs 409. If Stations were supplied, compare with current list; for any removed Station, refuse (409) when an open trip on this Route started there; then replace `route_stations` rows. Write one `route_audit` row containing only the changed fields (old/new), with `action` = `fare` or `status` when that is the only change, `stations` when only Stations changed, else `update`.

**Deactivating a Route** only blocks new start taps and hides it from Passengers; open trips can still be ended and charged.

## Files to Modify

- `backend/db/schema.sql`: altered `routes`; new `stations`, `route_stations`, `trips`, `route_audit`, `train_positions` and their indexes.
- `backend/db/init.js`: Route→Stations/fare migration step; seeding via fare + station lists; `syncSequences` table list.
- `backend/db/seed.js`: `seedRoutes` shape (`fare`, `stations: [origin, destination]`).
- `backend/server.js`: remove inline `/api/routes` handlers and the amount-based `/api/rfid/tap`; import `formatTxnDate` from `lib/format.js`; mount `railRoutes`, `trips`, `trains` routers.
- `backend/.env.example`: document `TRAIN_SIGNAL_TIMEOUT_SECONDS`.
- `frontend/src/pages/AdminDashboard.jsx`: Routes tab and RFID tab delegate to the new components; drop `handleRouteUpdate`, `rfidForm.amount`, per-km inputs; keep `fetchUsers` refresh after a tap (pass as callback).
- `frontend/src/pages/Routes.jsx`: remove `initialTrains`, simulation `setInterval` and hardcoded `lines`; fetch `/api/routes` (read-only Routes & Fares section) and poll `/api/trains` (10 s); empty "Awaiting GPS" and "No signal" states.
- `frontend/src/pages/Dashboard.jsx`: add "My Trips" list from `/api/trips/mine` beside the existing Transaction history.
- `CLAUDE.md` and `smartrail-ticketing.md`: update the endpoint list, data shapes (Route, Trip), and the statement that the tap takes an `amount`.

## Files to Create

- `backend/lib/format.js`, `backend/lib/routeInput.js`, `backend/routes/railRoutes.js`, `backend/routes/trips.js`, `backend/routes/trains.js` (responsibilities above; routers follow the `routes/users.js` pattern: `requireAuth` then `requireRole('admin')` where needed).
- `frontend/src/components/admin/RoutesPricing.jsx`, `frontend/src/components/admin/RfidTerminal.jsx`.

## Left Unchanged

- Auth, JWT, login throttling, `routes/users.js`, `middleware/auth.js`.
- `POST /api/topup`, `GET /api/history/:userId`, the `transactions` table and existing rows.
- Login page, `RequireAuth`, `api.js`, Tailwind palette and the "no purple" design.
- `lowdb` dependency (still unused).

## Build Order

| Phase | Owner | Work |
|-------|-------|------|
| 0 | Backend | Schema additions, `init.js` migration, `seed.js` shape, `lib/format.js` extraction; start server against an existing DB and confirm 9 Routes get fare + 2 Stations each |
| 1 | Backend | `lib/routeInput.js`, `routes/railRoutes.js` (list/create/update/history), audit rows, version check; wire in `server.js` |
| 2 | Backend | `routes/trips.js`: start/end tap, trips lists, cancel; remove old tap |
| 3 | Backend | `routes/trains.js`: position upsert and list with signal status |
| 4 | Frontend | `RoutesPricing.jsx` and `RfidTerminal.jsx`, wired into `AdminDashboard.jsx` |
| 5 | Frontend | `Routes.jsx` rewrite (Routes & Fares, live board states); `Dashboard.jsx` My Trips |
| 6 | Frontend | Polish: loading/empty/error states, disabled buttons while saving, stale-version "reload" message, mobile layout of the Routes tab |
| 7 | Backend | Docs updates (`CLAUDE.md`, `smartrail-ticketing.md`), `.env.example` |

## Manual Verification Plan

No test suite exists in the repo (see `CLAUDE.md`), so verify by hand. Use any HTTP client with a Bearer token from `POST /api/login` for `admin` and `nirmal` (id 1, Balance 500).

1. **Migration:** start the backend on the existing DB; `GET /api/routes` as admin returns 9 Routes, each with `fare` equal to the old base fare and two Stations. Restart; nothing is duplicated.
2. **Create Route:** `POST /api/routes` `{name:"Test Line", fare:120, stations:["A","B","C"]}` → 200 with 3 ordered Stations. With `fare:-1` → 400; with one Station → 400; as `nirmal` → 403.
3. **Fare edit + audit:** `PUT /api/routes/{id}` `{fare:150, version:1}` → 200, `version` 2. Repeat with `version:1` → 409. `GET /api/routes/history` shows who/when/old 120/new 150.
4. **Happy trip:** tap `{userId:1, action:"start", routeId, stationId:A}` → 200, Balance still 500. Tap `{action:"end", stationId:C}` → 200, `newBalance` 350; `GET /api/history/1` shows one debit `Trip: Test Line (A → C)`.
5. **Refusals:** start twice → second 409; end with no open trip → 409; end at the start Station → 400; end on another Route → 409; Station not on Route → 400; set Fare above Balance and start → 402 with no trip created.
6. **Double charge:** open a trip, then send the end tap twice in quick succession (two terminals/`curl &`); exactly one succeeds, Balance drops once.
7. **Mid-trip Fare change:** start a trip, change the Route Fare, end the trip → debited the original Fare.
8. **Deactivate:** set Route `status:"inactive"` → `nirmal` no longer sees it in `GET /api/routes`; a start tap → 409; an already open trip can still be ended.
9. **Station removal:** with an open trip starting at Station A, remove A → 409; after the trip ends, removal succeeds.
10. **Cancel:** open a trip, `PUT /api/trips/{id}/cancel` with reason → 200, no debit; the Card can start a new trip.
11. **Deactivated Card:** deactivate `nirmal`, tap start → 403.
12. **GPS:** `GET /api/trains` returns `[]`. `POST /api/trains/position` for train `1015` → listed with `signal:"live"`. Wait past `TRAIN_SIGNAL_TIMEOUT_SECONDS` (set to 20 for the test) → `no_signal`.
13. **UI (admin):** Routes & Pricing tab shows Stations and one Fare input per Route (no per-km); create/edit/deactivate via the modal; history panel lists changes; RFID tab has Route/Station/Start-End controls and an open-trips list with Cancel.
14. **UI (passenger):** `/routes` shows only active Routes with Fares, no edit controls, and an "Awaiting GPS" state; the live board shows no hardcoded trains; Dashboard shows My Trips.
15. **Offline:** disconnect the machine from the internet, restart both servers, repeat steps 4 and 13; everything works (fonts may fall back to system fonts).

## Verification

1. `cd backend && npm run dev` and `cd frontend && npm run dev` start cleanly; `cd frontend && npm run build` succeeds.
2. Log in as `admin` / `admin_rail_2024` → Routes & Pricing shows 9 migrated Routes; set a fixed Fare on one and confirm it saves and appears in history.
3. In RFID Emulation, start and end a trip for Passenger ID 1; the Balance drops by exactly the Route Fare, once.
4. Log in as `nirmal` / `user123` → `/routes` is read-only; Dashboard shows the new Transaction and the trip under My Trips.
5. Run steps 5–9 of the Manual Verification Plan to confirm every refusal path debits nothing.
6. Confirm existing Top-up, password change and user management still work (regression pass).

## Critical Files

| File | Why |
|------|-----|
| `backend/db/schema.sql` | All new tables, the open-trip unique index and altered `routes` |
| `backend/db/init.js` | Idempotent migration of the 9 Routes to Stations + fixed Fare |
| `backend/routes/trips.js` | Money-moving logic: start/end tap, no double charge, Fare snapshot |
| `backend/routes/railRoutes.js` | Route CRUD, optimistic locking, audit trail, Passenger visibility rules |
| `backend/routes/trains.js` | GPS ingest and "no signal" computation |
| `backend/server.js` | Removes the old tap/route handlers, mounts the new routers |
| `frontend/src/components/admin/RoutesPricing.jsx` | Admin Route/Fare/Station management UI |
| `frontend/src/components/admin/RfidTerminal.jsx` | Trip-based tap emulator and open-trips handling |
| `frontend/src/pages/Routes.jsx` | Removes hardcoded trains; read-only Routes and live board |

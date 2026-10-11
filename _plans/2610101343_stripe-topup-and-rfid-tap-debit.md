# Implementation Plan: Stripe Top-up And RFID Tap Debit

Spec: `_specs/2610101343_stripe-topup-and-rfid-tap-debit.md`
Branch: `feature/stripe-topup-and-rfid-tap-debit`

Feature type: **full-stack** (backend: Stripe Checkout + webhook, top-up ledger, device/Card taps; frontend: Passenger top-up flow, Admin Payments and Readers/Cards panels).

Decisions already recorded in the spec's Open Questions: currency is **LKR**, minimum top-up is **Rs. 500**, and the MVP runs on a Stripe **developer (test-mode) account** only.

---

## Architecture Overview

```
Passenger browser (React) --POST /api/topups--> backend (Express) --Checkout Session--> Stripe
        |  redirect to Stripe hosted page  <------------ session.url -----------------------|
        |  return to /dashboard?topup=...                                                   |
        |--GET /api/topups/:id (poll)--> backend <--POST /api/stripe/webhook (signed)-------|
                                           |
                       settleTopup(): one DB transaction: topup row -> succeeded,
                       users.balance += amount, transactions credit row

RFID reader (ESP32) --POST /api/device/tap (X-Device-Key)--> backend --lib/tap.js--> trips/users/transactions
Admin dashboard    --POST /api/rfid/tap (JWT, simulated)---> backend --lib/tap.js--^   (same rules)
```

## Key Design Decisions

- **Stripe Checkout (hosted page), not Elements.** Card data never touches SmartRail, no publishable key or `stripe-js` is needed in the frontend, and the redirect-and-return model matches the spec's assumed "hosted payment experience". The `stripe` npm package is added to the backend only.
- **Webhook is the source of truth; the return page is not.** The Balance is credited only from a verified `checkout.session.completed` (payment_status `paid`) or `checkout.session.async_payment_succeeded` event, or by a server-side re-fetch of the Session from Stripe. The browser return only triggers a status poll. This satisfies "close the browser right after paying".
- **Reconcile-on-read fallback.** When `GET /api/topups/:id` finds a `pending` row, it asks Stripe for the Session once and settles through the same function. This makes local dev work without the Stripe CLI and heals a missed webhook. Both paths call one `settleTopup` function so crediting logic exists once.
- **Exactly-once credit enforced by the database, not by hope.** `settleTopup` does a conditional `UPDATE topups SET status='succeeded' WHERE id=$1 AND status <> 'succeeded'`; only the winner proceeds to the balance update and ledger insert, all in one transaction. A unique `transactions.topup_id` is a second safety net. Webhook event ids are also stored (`stripe_events`) so replays are no-ops.
- **Do not credit blindly.** If the paid amount/currency differs from the stored attempt, or the account is deactivated/deleted/missing, the attempt becomes `review` (money taken, not credited) and is surfaced to Admins. No automatic refund (Non-Goal).
- **Late success is allowed.** `failed`, `cancelled` and `expired` attempts can still be settled if Stripe later reports the Session paid (e.g. Passenger retried the card on the same Checkout page, or an async payment succeeded).
- **Whole-rupee amounts only for MVP.** Avoids fractional-cent mismatches with Stripe's `unit_amount` (rupees x 100). Limits come from env: `TOPUP_MIN` (default 500) and `TOPUP_MAX` (default 50000, an assumption recorded in Open Questions).
- **Legacy no-payment top-up is switched off by default.** `POST /api/topup` stays in the code but returns 403 unless `ALLOW_DEMO_TOPUP=true`, so demos can opt in explicitly and normal operation cannot inflate balances.
- **Stripe fees absorbed by SmartRail** (Passenger gets exactly what they paid). Assumption, no extra fee line.
- **Live-mode guard.** On startup the server logs the Stripe mode from the key prefix and refuses to start payments with an `sk_live_` key unless `STRIPE_ALLOW_LIVE=true`, so the developer-account-only MVP cannot move real money by accident. Missing keys do not stop the server; top-up endpoints answer 503 "Online payments are unavailable".
- **One shared tap engine.** The start/end logic in `routes/trips.js` moves into `lib/tap.js` (`applyTap`) and is called by both the Admin-simulated endpoint and the new device endpoint, guaranteeing the same results, Transactions and error cases (spec FR 15, 19).
- **Reader identity is a per-device API key**, stored hashed (SHA-256; keys are 32+ random bytes so a fast hash is fine). A device row is bound to one Route and one Station, so a physical reader sends only the Card UID; it cannot be tricked into charging for other stations. Admins can disable a device instantly (checked on every tap).
- **Card identity is a separate `cards` table** (UID -> Passenger) rather than reusing `users.id`. This supports lost/replaced Cards and more than one Card per Passenger. The Admin simulator keeps using `userId` so it continues to work unchanged.
- **Idempotent taps via a reader-supplied `eventId`.** A retried request with the same `(device, eventId)` returns the stored response and applies nothing twice. Rejected taps are recorded too, which gives Admins the "rejected taps" visibility the spec asks for.
- **Direction is optional.** The reader may send `action: "start" | "end"`; if omitted the server infers it (open trip -> end, otherwise start). Recorded as an assumption for the spec's open "Tap direction" question.
- **Out of scope:** refunds, saved cards, firmware, device provisioning UI beyond create/disable/rotate key, email notifications.

## Data Model / Migration

All additions go into `backend/db/schema.sql` as idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, applied by `db/init.js` on start like existing tables. No existing rows are modified or deleted; seed data (2 users, 9 routes) and legacy credit Transactions stay valid. No manual cut-over, `data.json` import is unaffected.

**New table `topups`**

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| user_id | INTEGER NOT NULL -> users(id) | |
| amount | NUMERIC(12,2) NOT NULL CHECK (amount > 0) | LKR |
| currency | TEXT NOT NULL DEFAULT 'lkr' | |
| status | TEXT NOT NULL DEFAULT 'pending' CHECK in (`pending`,`succeeded`,`failed`,`cancelled`,`expired`,`review`) | |
| stripe_session_id | TEXT UNIQUE | set right after Session creation |
| stripe_payment_intent_id | TEXT | |
| failure_reason | TEXT | last Stripe decline/mismatch note |
| transaction_id | BIGINT -> transactions(id) | set when credited |
| created_at / updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| expires_at | TIMESTAMPTZ NOT NULL | created_at + `TOPUP_PENDING_MINUTES` (default 30, Stripe's minimum Session lifetime) |

Indexes: `(user_id, id DESC)`, `(status, id DESC)`.

**New table `stripe_events`**: `id TEXT PK` (Stripe event id), `type TEXT`, `topup_id BIGINT NULL`, `processed_at TIMESTAMPTZ DEFAULT now()`, `note TEXT`. Used for replay protection and to record events that matched no attempt (flagged for Admin).

**Changed `transactions`**: add `topup_id BIGINT UNIQUE REFERENCES topups(id)` (nullable; legacy and debit rows are NULL). Credit title for paid top-ups: `Card Recharge (Stripe)`.

**New table `cards`**: `id SERIAL PK`, `uid TEXT NOT NULL` (stored upper-cased; unique index on `upper(uid)`), `user_id INTEGER NOT NULL -> users(id)`, `status TEXT CHECK in ('active','blocked')`, `created_at`.

**New table `devices`**: `id SERIAL PK`, `name TEXT NOT NULL`, `key_hash TEXT NOT NULL UNIQUE`, `route_id INTEGER NOT NULL -> routes(id)`, `station_id INTEGER NOT NULL -> stations(id)`, `status TEXT CHECK in ('active','disabled')`, `last_seen_at TIMESTAMPTZ`, `created_at`. Route/Station validity is checked against `route_stations` on create.

**New table `tap_events`**: `id BIGSERIAL PK`, `device_id INTEGER NULL -> devices(id)`, `event_id TEXT NULL`, `card_uid TEXT`, `user_id INTEGER NULL`, `action TEXT`, `outcome TEXT` (`accepted` or a rejection code), `http_status INTEGER`, `response JSONB`, `created_at`. Unique `(device_id, event_id)` where both are not null. Rejected taps that never reach a known device (bad key) are logged to the server console only, since there is no device id to attach.

**Changed `trips`**: add `start_source TEXT NOT NULL DEFAULT 'admin'`, `end_source TEXT`, `device_id INTEGER` (the device of the end tap), values `admin` | `reader`. Existing trips default to `admin`, which is correct (all prior taps were simulated).

`db/init.js`: add the new tables to `syncSequences`' table list (`topups`, `cards`, `devices`, `tap_events`).

## API Contract

All JSON, existing shape `{ success, message? }`. `HttpError` gains an optional `code` so device and Passenger clients can branch on a stable string; `handle()` includes `code` in the body when set. Existing endpoints keep their current bodies.

### `POST /api/topups` (Passenger)
Request: `{ "amount": 1000 }` (whole rupees).
Response 200:
```json
{ "success": true, "topup": { "id": 12, "amount": 1000, "status": "pending" }, "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_..." }
```

| Status | Condition |
|---|---|
| 400 | amount missing / not a whole number / below `TOPUP_MIN` / above `TOPUP_MAX` (message states the limits) |
| 401 | no/invalid token |
| 403 | caller is not an active Passenger (`role` not `user`) or a `userId` in the body differs from the caller |
| 429 | more than 5 pending attempts in the last hour (prevents Session spam) |
| 502 | Stripe unreachable/errored; the pending row is marked `failed` so it is not left dangling |
| 503 | Stripe keys not configured |

### `GET /api/topups/mine` (Passenger)
Last 20 attempts: `{ "success": true, "topups": [{ "id", "amount", "status", "failureReason", "createdAt" }] }`.

### `GET /api/topups/:id` (Passenger own attempt; Admin any)
Returns `{ success, topup: { id, amount, status, failureReason, createdAt }, balance }`. If `pending`, performs the reconcile-on-read described above. 404 for another Passenger's attempt (does not reveal existence).

### `POST /api/topups/:id/cancel` (Passenger, own)
Called when the Passenger lands on the cancel URL. Moves `pending` -> `cancelled` and expires the Stripe Session so it cannot be paid later. 409 if already `succeeded`; idempotent on already `cancelled`.

### `GET /api/topups` (Admin)
Query `?status=&userId=`; returns last 100 with `username`, `stripePaymentIntentId`, `failureReason`. 400 on invalid status.

### `POST /api/stripe/webhook` (Stripe only, no JWT)
Raw body, `Stripe-Signature` verified with `STRIPE_WEBHOOK_SECRET`. Handles `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`; other types are acknowledged with 200 and ignored.

| Status | Condition |
|---|---|
| 200 | processed, duplicate (already in `stripe_events`), unknown attempt (recorded with note), or ignored type |
| 400 | missing/invalid signature or malformed payload (Balance untouched) |
| 500 | transient DB error, so Stripe retries |
| 503 | webhook secret not configured |

### `POST /api/topup` (legacy, unchanged body)
Now returns `403 { message: "Online payment is required to top up." }` unless `ALLOW_DEMO_TOPUP=true`.

### `POST /api/device/tap` (reader; auth by `X-Device-Key`, not JWT)
Request: `{ "cardUid": "04A1B2C3", "eventId": "dev1-000123", "action": "start" }` (`action` optional).
Response 200:
```json
{ "success": true, "code": "trip_started", "message": "Trip started", "trip": { "id": 8, "fare": 120, "status": "open", "routeId": 3 }, "balance": 480 }
{ "success": true, "code": "trip_completed", "message": "Trip completed", "trip": { "id": 8, "fare": 120, "status": "completed", "routeId": 3 }, "newBalance": 360 }
```
Replayed `eventId` returns the original body with header `Idempotent-Replay: true`.

| Status | `code` | Condition |
|---|---|---|
| 400 | `bad_request` | missing `cardUid`/`eventId`, bad `action` |
| 400 | `same_station` | end tap at the start Station |
| 401 | `unknown_device` | missing/unknown key |
| 402 | `insufficient_funds` | start with Balance below the fixed Fare, or end tap cannot cover the snapshot fare |
| 403 | `device_disabled` | device disabled by an Admin |
| 403 | `card_blocked` | Card blocked or Passenger deactivated |
| 404 | `unknown_card` | UID not registered, or Passenger deleted |
| 409 | `open_trip_exists` / `no_open_trip` / `route_mismatch` / `route_inactive` | trip state conflicts |

### `POST /api/rfid/tap` (Admin simulation, **unchanged contract**)
Same request/response/status codes as today; now implemented through `lib/tap.js` and tags the trip `start_source`/`end_source = 'admin'`.

### Cards and devices (Admin)
- `GET /api/cards?userId=`, `POST /api/cards` `{ userId, uid }` (409 `Card already registered`, 404 unknown/deleted user), `PUT /api/cards/:id/status` `{ status: 'active'|'blocked' }`.
- `GET /api/devices`, `POST /api/devices` `{ name, routeId, stationId }` -> returns the plain key **once** (`{ device, key }`), `PUT /api/devices/:id/status` `{ status }`, `POST /api/devices/:id/rotate-key` -> new key once.
- `GET /api/rfid/events?outcome=&limit=` last 100 `tap_events`, so Admins can see rejected taps.

## Project Structure

Only new files:

```
backend/
  lib/
    stripe.js        # lazily-built Stripe client, mode detection, isConfigured()
    topups.js        # createTopup, settleTopup, reconcileTopup, expirePending
    tap.js           # applyTap: shared start/end engine (moved out of routes/trips.js)
    deviceAuth.js    # requireDevice middleware (hash lookup, status, last_seen_at)
  routes/
    topups.js        # Passenger + Admin top-up endpoints
    stripeWebhook.js # raw-body webhook handler
    device.js        # POST /api/device/tap
    cards.js         # Admin card registry
    devices.js       # Admin device registry + rfid events
frontend/src/components/
  TopUpModal.jsx             # amount entry, presets, redirect to Checkout
  admin/PaymentsPanel.jsx    # Admin top-up attempts list/filter
  admin/CardsDevices.jsx     # Admin card registration + reader devices + rejected taps
```

## Algorithm / Logic Detail

**createTopup(userId, amount)**
1. Validate amount against limits; verify Stripe configured.
2. Insert `topups` row (`pending`, `expires_at`).
3. Create Checkout Session: mode `payment`, `currency: 'lkr'`, one line item `Rs. <amount> SmartRail top-up`, `unit_amount = amount * 100`, `metadata.topup_id`, `client_reference_id = topup id`, `success_url = FRONTEND_URL/dashboard?topup=success&id=<id>`, `cancel_url = FRONTEND_URL/dashboard?topup=cancelled&id=<id>`, `expires_at` 30 min, and Stripe-side idempotency key `topup-<id>` so a retried request cannot create two Sessions.
4. Save `stripe_session_id`; return `session.url`. On Stripe error mark row `failed` and return 502.

**settleTopup(session, eventId)** (called from webhook and reconcile)
1. Resolve attempt by `metadata.topup_id` (fall back to `stripe_session_id`). None -> record in `stripe_events` with note, return.
2. In one transaction: insert `stripe_events` id (`ON CONFLICT DO NOTHING`; conflict -> already processed, stop). Lock the topup row `FOR UPDATE`. If already `succeeded` stop.
3. If `payment_status !== 'paid'` stop (async methods).
4. If `amount_total !== amount*100` or currency not `lkr` -> status `review`, note reason, stop.
5. Lock the user row. If missing or `status <> 'active'` -> `review`, stop.
6. `UPDATE users SET balance = balance + amount`, insert credit Transaction (`topup_id` set), set topup `succeeded`, `transaction_id`, `stripe_payment_intent_id`.

**Status updates from other events**: `checkout.session.expired` -> `expired`; `async_payment_failed` / `payment_intent.payment_failed` -> `failed` with decline message; only applied when current status is not `succeeded`/`review`.

**Lazy expiry**: when listing or reading attempts, rows still `pending` past `expires_at` are shown (and persisted) as `expired`. They stay settle-able per the late-success rule.

**applyTap(client, { userId, routeId, stationId, action, source, deviceId })**: the existing logic of `routes/trips.js` unchanged in behaviour: lock user row `FOR UPDATE`; reject deleted (404) / deactivated (403); load Route; check Station on Route; `start`: Route must be active, Balance >= fare else 402, insert trip (unique partial index gives 409 on a second open trip) with snapshot fare and `start_source`; `end`: lock open trip, same Route, different Station, conditional `UPDATE ... balance >= fare` (402 otherwise), debit Transaction with title `Trip: <Route> (<start> -> <end>)`, complete trip with `end_source`/`device_id`. Concurrent taps for one Card serialise on the user row lock, so there is no double-debit or negative Balance (the `CHECK (balance >= 0)` is a last guard). A top-up committing while a trip is open is picked up at the end tap because the Balance is read under the lock.

**Device tap flow**
1. `requireDevice`: hash `X-Device-Key`, load device; unknown -> 401; disabled -> 403 and a `tap_events` row; update `last_seen_at`.
2. Validate `cardUid`/`eventId`.
3. Open a transaction; `INSERT INTO tap_events (...) ON CONFLICT (device_id, event_id) DO NOTHING RETURNING id`. No row returned -> read the stored response and replay it.
4. Resolve Card by UID (unknown -> `unknown_card`; blocked -> `card_blocked`), derive `action` if omitted, call `applyTap` with the device's Route/Station and `source: 'reader'`.
5. Success: store response JSON on the event, commit. `HttpError`: roll back, then write the rejection to `tap_events` in its own statement (so it survives) and return it.

## Files to Modify / Files to Create

**To Modify**

| File | Change |
|---|---|
| `backend/server.js` | Mount `stripeWebhook` with `express.raw` **before** `express.json()`; mount `topups`, `device` (before `tripsRouter`, which applies `requireAuth` to everything under `/api`), `cards`, `devices`; gate legacy `/api/topup` behind `ALLOW_DEMO_TOPUP`; log Stripe mode at start |
| `backend/lib/http.js` | `HttpError` optional `code`; `handle` returns it |
| `backend/routes/trips.js` | `/rfid/tap` delegates to `lib/tap.js`; trip source tagging; `TRIP_SELECT` exposes `startSource`/`endSource` |
| `backend/db/schema.sql`, `backend/db/init.js` | New tables/columns above; sequences list |
| `backend/.env.example`, `backend/package.json` | New env vars (below); add `stripe` dependency |
| `frontend/src/pages/Dashboard.jsx` | Replace hard-coded Rs. 500 `handleTopUp` with `TopUpModal`; handle `?topup=success|cancelled&id=` (poll `GET /api/topups/:id`, show result, refresh balance/history, strip the query string); "Recent top-ups" list with statuses |
| `frontend/src/pages/AdminDashboard.jsx` | New sidebar tabs "Payments" and "Readers & Cards" |
| `frontend/src/components/admin/RfidTerminal.jsx` | Show `startSource`/`endSource` badge in the trips table (small) |
| `CLAUDE.md`, `smartrail-ticketing.md` | Document new endpoints/env vars; mark Phase 6 software path done, device key setup |

New env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FRONTEND_URL` (default `http://localhost:5173`), `TOPUP_MIN` (500), `TOPUP_MAX` (50000), `TOPUP_PENDING_MINUTES` (30), `ALLOW_DEMO_TOPUP` (false), `STRIPE_ALLOW_LIVE` (false).

**To Create**: the files in Project Structure above.

**Left Unchanged**: Routes & Pricing engine (`routes/railRoutes.js`, `RoutesPricing.jsx`), `routes/trains.js`, `routes/users.js`, `middleware/auth.js`, login/auth flow, Tailwind palette and the existing Dashboard layout (no redesign; only the top-up control and one list are added), `frontend/src/api.js` (the 401 interceptor and token handling are reused as is).

## Build Order

| Phase | Owner | Work |
|-------|-------|------|
| 0 | Backend | `npm i stripe`; env vars; schema additions + `init.js` sequences; `HttpError.code` |
| 1 | Backend | `lib/tap.js` extraction; point `/api/rfid/tap` at it; confirm admin simulator behaves identically (regression gate before anything new) |
| 2 | Backend | `lib/stripe.js`, `lib/topups.js`, `routes/topups.js`; gate legacy `/api/topup`; `routes/stripeWebhook.js` mounted with raw body |
| 3 | Backend | `cards`, `devices`, `deviceAuth`, `routes/device.js`, `tap_events`, idempotency + rejection logging |
| 4 | Frontend | `TopUpModal`, Dashboard return-from-Stripe handling and recent top-ups list (wired to real API responses) |
| 5 | Frontend | `PaymentsPanel` and `CardsDevices` admin tabs; source badge in trips table |
| 6 | Frontend | Polish: loading/disabled states on Pay button (double-click guard), error messages, mobile layout, no-purple palette check |
| 7 | Backend | Docs: `.env.example`, `CLAUDE.md`, `smartrail-ticketing.md`; Stripe CLI instructions |

## Manual Verification Plan

No test suite exists (see `CLAUDE.md`) and none is proposed. Prerequisites: backend and frontend running, `STRIPE_SECRET_KEY` (test key) set, `stripe listen --forward-to localhost:5000/api/stripe/webhook` running with its `whsec_` value in `STRIPE_WEBHOOK_SECRET`.

1. **Happy path:** log in as `nirmal`, open Top up, enter 1000, pay with Stripe test card `4242 4242 4242 4242`. Expect redirect back, "Payment successful", Balance +1000, one new `Card Recharge (Stripe)` credit in history, one `succeeded` row in the top-up list.
2. **Refresh/replay:** reload the return URL several times; run `stripe events resend <evt_id>`. Balance unchanged, still one credit Transaction (`SELECT count(*) FROM transactions WHERE topup_id = <id>` = 1).
3. **Closed browser:** pay, close the tab before redirect completes, log in again. Balance is credited.
4. **Declined card** `4000 0000 0000 0002`: attempt shows failed with a message, Balance unchanged, retry with `4242` works on a new attempt.
5. **Cancel:** click "Back" on the Stripe page; attempt shows `cancelled`, Balance unchanged, the old Checkout URL no longer accepts payment.
6. **Validation:** amounts 0, -5, 499, 100000, `abc`, 750.5 -> 400 with a clear message and no row created. (`curl` with the Bearer token against `POST /api/topups`.)
7. **Authorization:** admin token to `POST /api/topups` -> 403; Passenger A reading Passenger B's `GET /api/topups/:id` -> 404; deactivate `nirmal` and retry -> 401/403.
8. **Forged webhook:** `curl -X POST /api/stripe/webhook` with a made-up JSON body and no/invalid signature -> 400, no Balance change.
9. **No keys:** unset `STRIPE_SECRET_KEY`, restart: server starts, `POST /api/topups` -> 503, Dashboard shows "Online payments are unavailable".
10. **Legacy endpoint:** `POST /api/topup` -> 403 by default; with `ALLOW_DEMO_TOPUP=true` it credits as before.
11. **Amount mismatch (review):** manually edit a pending row's `amount` in the DB, then pay the Session; attempt becomes `review`, Balance not credited, visible to Admin.
12. **Admin list:** as `admin`, Payments tab shows all attempts, filter by status and Passenger works.
13. **Register reader:** Admin creates a device (Route + Station), copies the key; registers Card UID `04A1B2C3` to `nirmal`.
14. **Reader start tap:** `curl -X POST /api/device/tap -H "X-Device-Key: <key>" -d '{"cardUid":"04A1B2C3","eventId":"t1"}'` -> `trip_started`. Repeat with the same `eventId` -> identical body, `Idempotent-Replay: true`, still one open trip.
15. **Reader end tap** (device at a different Station on the same Route, new `eventId`): `trip_completed`, fare debited once; same `eventId` again -> replay, no second debit. Passenger history shows the debit with Route and Stations.
16. **Rejections:** unknown UID -> 404 `unknown_card`; wrong key -> 401; disabled device -> 403 `device_disabled`; Balance below fare -> 402; second start while open -> 409. Each (known-device cases) appears in the Admin rejected-taps list.
17. **Concurrency:** fire two end taps with different `eventId` at once (`curl ... &`). Exactly one debit; the other gets 409 `no_open_trip`.
18. **Top-up during open trip:** start a trip with Balance exactly the fare, top up, end tap succeeds with the new Balance.
19. **Admin simulator regression:** use the RFID Terminal tab with `userId` 1 for start and end; behaves exactly as before and the trip shows source `admin`.

## Verification

1. `cd backend && npm install && npm start` logs `Stripe mode: test` (or "not configured") and starts without errors; `cd frontend && npm run dev` and `npm run build` succeed.
2. Demo logins still work: passenger `nirmal` / `user123`, admin `admin` / `admin_rail_2024`.
3. Steps 1-5 of the Manual Verification Plan pass using Stripe test cards; Balance in the UI equals `SELECT balance FROM users WHERE id = ...` and the sum of credits minus debits for new users.
4. `SELECT topup_id, count(*) FROM transactions WHERE topup_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1` returns no rows.
5. Steps 13-17 pass; `SELECT outcome, count(*) FROM tap_events GROUP BY 1` shows accepted and rejected outcomes.
6. `grep -r "sk_test\|sk_live\|whsec_\|X-Device-Key" frontend/src frontend/dist` finds nothing; no API response contains `key_hash`, the Stripe secret or a device key (other than the one-time create/rotate response).
7. Restart the backend against the existing database: schema applies idempotently, legacy Transactions and trips are intact.

## Critical Files

| File | Why |
|------|-----|
| `backend/lib/topups.js` | Exactly-once credit logic (`settleTopup`) and Stripe Session creation; the money path |
| `backend/routes/stripeWebhook.js` | Signature verification and raw-body requirement; must be mounted before `express.json()` |
| `backend/lib/tap.js` | Single tap engine shared by Admin simulator and readers; must preserve current behaviour |
| `backend/routes/device.js` / `backend/lib/deviceAuth.js` | Device authentication, idempotency and rejection logging |
| `backend/server.js` | Mount order (raw webhook, device router before the auth-wide trips router), legacy top-up gate |
| `backend/db/schema.sql` | New tables and columns; idempotent upgrade of existing databases |
| `backend/routes/trips.js` | Delegates to `lib/tap.js`; trip source tagging |
| `frontend/src/pages/Dashboard.jsx` | Top-up flow, Stripe return handling, balance refresh |
| `frontend/src/components/TopUpModal.jsx` | Amount validation/limits and double-click guard |
| `frontend/src/components/admin/CardsDevices.jsx` | Card registration and device key handling in the UI |

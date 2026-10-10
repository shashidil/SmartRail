# Spec: Real Database Persistence

## Summary
Replace the flat `data.json` file with a real database as the single store for Passengers, Admins, Routes and Transactions. Passengers, Admins and the RFID hardware bridge keep using the system exactly as they do today; only where the data lives changes.

## Background / Problem
All Users, Routes, Balances and Transactions are kept in one file that is fully read and fully rewritten on every request. There is no locking, so two near-simultaneous operations (for example two RFID taps, or a Top-up during a tap) can overwrite each other and silently lose a Balance change or a Transaction. The file is also not suitable for growth, querying (such as a Passenger's recent Transactions) or deployment beyond a single demo machine. Seed data is hard-coded into the server startup.

## Goals
- Users, Routes and Transactions are stored in a real database rather than a file.
- Every Top-up and RFID tap updates the Balance and records its Transaction as one all-or-nothing change.
- Concurrent taps and Top-ups for the same Passenger never lose or double-apply a Balance change.
- The first start of the system on an empty database provides the same starting data as today: the two demo accounts and the nine railway Routes with their Stations, Fares and distances.
- Existing data in `data.json`, if present, can be carried over without losing Balances or Transaction history.
- Every screen looks and behaves exactly as it does today.

## Non-Goals
- Any change to the UI, layout, design system or the hard-coded Live tracking board.
- Introducing real authentication, password hashing or session tokens (a separate piece of work).
- Changing Fare rules, Route content, or the Transaction wording shown to Passengers.
- Connecting physical Arduino/ESP32 hardware.
- Adding new features such as ticket types, refunds or reporting.

## Users & Roles
- **Passenger**: registers, logs in, tops up, sees Balance and last Transactions. No visible change.
- **Admin**: views Passengers, edits Route Fares, simulates RFID taps. No visible change.
- **RFID hardware bridge**: taps a Card to debit a Fare. Must remain compatible with the same request and response behaviour.

## User Stories
- As a Passenger, I want my Balance and Transactions to survive restarts and be correct even when several operations happen at once, so that I never lose money or see a wrong Balance.
- As an Admin, I want Fare changes to be saved reliably, so that all Passengers and taps use the updated price.
- As a developer, I want a standard database behind the system, so that the project can grow beyond a demo and be deployed.
- As the operator of the demo, I want a clean first start to reproduce the current demo data, so that setup stays one step.

## Functional Requirements
1. Users (username, password, role, Balance), Routes (name, Stations, base Fare, per-km Fare, total km) and Transactions (owner, credit/debit, title, amount, date) are persisted in the database.
2. Registering a Passenger rejects a username that already exists, as today.
3. Login succeeds only for a matching username and password, as today.
4. A Top-up increases the Balance and records one credit Transaction as a single atomic change.
5. An RFID tap decreases the Balance and records one debit Transaction as a single atomic change; a tap with insufficient Balance changes nothing and is refused as today.
6. A Passenger's history returns their ten most recent Transactions, newest first, as today.
7. The Admin Passenger list returns Passengers only and never exposes passwords, as today.
8. Updating a Route's Fares persists and is used by subsequent taps.
9. On first start against an empty database, the two demo accounts and nine Routes are created automatically.
10. A one-time import carries the Users, Routes and Transactions from an existing `data.json` into the database, preserving identifiers, Balances and Transaction dates.
11. All responses keep the same fields, formats and status codes the frontend relies on, so no frontend page needs to change.
12. Database connection details are configurable per environment without code changes.

## Data Concerns
- **Users**: Passengers and Admins with role, Balance and credentials; usernames are unique.
- **Routes**: the nine official lines with ordered Stations, Fare settings and distances.
- **Transactions**: an append-only ledger per User; the display date is currently a pre-formatted string and must keep the same appearance.
- Existing `data.json` content (including any Balances and Transactions created during demos) must be importable once; after import the file is no longer read or written.
- Passwords remain stored as they are today (plain text) for this feature; hashing is a separate follow-up.
- The database file or server data must be excluded from version control, as `data.json` is today.

## Edge Cases & Failure Modes
- Two taps for the same Passenger at the same moment with only enough Balance for one → exactly one succeeds, the other is refused for insufficient Balance.
- Top-up and tap at the same moment → both are applied; final Balance equals the starting Balance plus the credit minus the debit.
- Tap with insufficient Balance → refused, Balance and ledger unchanged.
- Tap or Top-up for an unknown User → refused with the same error behaviour as today.
- Duplicate username on registration → refused as today.
- Database unreachable at startup → the system reports a clear error and does not start serving as if it had data.
- Database becomes unavailable during a request → the request fails with a server error, no partial Balance change is left behind.
- `data.json` absent → first start uses the demo seed; `data.json` present and database empty → import is available and does not run twice.
- Import re-run against a populated database → no duplicate Users or Transactions are created.

## Acceptance Criteria
- [ ] Starting the system on an empty database yields the two demo logins and nine Routes.
- [ ] Logging in as `nirmal` and `admin` works with the existing credentials.
- [ ] Top-up updates the Balance and appears as the newest Transaction after a restart of the system.
- [ ] A tap that costs more than the Balance is refused and leaves Balance and history unchanged.
- [ ] Admin Fare edits persist across a restart and change the cost of the next tap.
- [ ] Firing many taps at once for one Passenger never produces a Balance different from the sum of recorded Transactions.
- [ ] Importing an existing `data.json` produces identical Balances and Transaction history to the file.
- [ ] No frontend file needs to change, and every page looks and behaves the same.
- [ ] No data file or database credentials are committed to the repository.

## Open Questions
- ~~Which database should be used?~~ Decided: PostgreSQL, run locally on the developer machine (PostgreSQL 17 is already installed and running). The plan must cover how a developer creates the local database and supplies its connection details without committing them.
- Should the import from `data.json` run automatically on first start when the file exists, or be an explicit one-time command? Assumed: explicit one-time command.
- Should Transaction dates remain pre-formatted display strings, or be stored as real timestamps and formatted on output? Assumed: stored as real timestamps, output unchanged.
- Are Transaction identifiers (currently the creation time in milliseconds) relied upon by anything outside the system? Assumed: no.
- Is hosting beyond a developer machine in scope now, which would affect connection configuration and backups? Assumed: no.

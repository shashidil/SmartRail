# Spec: Routes And Pricing Engine

## Summary
Give Admins a Routes & Pricing area in the admin dashboard to manage Routes, their Stations and a fixed trip Fare per Route. A Passenger taps their Card at the start and at the end of a trip, and the Route's fixed Fare is debited from their Balance. Passengers get a read-only view of Routes and Fares, and the Live tracking board shows train positions from a GPS feed supplied later.

## Background / Problem
- Admins can currently only change two numbers per Route (base fare and per-km rate). The per-km model is not what the product needs: the MVP charges one fixed amount per trip.
- Admins cannot add or remove Routes or edit Stations, and there is no record of who changed a Fare.
- A tap today is a single debit event, with no notion of a trip that starts and ends. There is no trip history showing start, end and what was charged.
- The Passenger-facing Routes page and Live tracking board use a hardcoded train list that has no connection to the Routes Admins manage.
- This is an MVP running on a local network with local RFID readers, not a cloud-hosted service. Online payment will be added later, so for now Balance is funded only by the existing Top-up.

## Goals
- Admins can create, view, edit and retire Routes and manage the ordered Stations on each Route.
- Each Route has one fixed trip Fare that Admins can set and change; distance is not used to calculate it.
- A Passenger's trip is recorded with a tap at the start and a tap at the end, and the fixed Fare for the Route is debited exactly once per completed trip.
- Passengers can browse Routes, Stations and Fares in a read-only view and cannot change anything.
- The Live tracking board shows train positions from GPS data when available and clearly shows when a train has no live position.
- Every Route or Fare change by an Admin is recorded so it can be audited.
- The whole flow works on a local network without internet access.

## Non-Goals
- Distance-based or per-km Fare calculation.
- Online payment gateway or card/bank payments (planned for a later phase). Top-up keeps working as it does today.
- Cloud hosting or remote RFID readers; the RFID system is connected locally.
- Building the GPS device or the physical Arduino/ESP32 reader hardware. Only the ability to accept a tap and show a position once supplied is in scope.
- Fare classes, concessions, peak/off-peak pricing, return tickets, timetables or seat booking.
- Changing user management, authentication or Top-up behaviour.
- Visual redesign; the existing palette and layout language stay.

## Users & Roles
- **Admin:** manages Routes, Stations and each Route's fixed Fare; sees trip records and the change history.
- **Passenger:** taps their Card to start and end a trip; read-only access to Routes, Fares, their own trip and Transaction history, and the Live tracking board. Cannot change Routes or Fares.
- **RFID hardware bridge / tap simulation:** sends the start-of-trip and end-of-trip taps, with the Route and Station where the tap happened, over the local network. The admin dashboard simulates these taps until real readers are connected.

## User Stories
- As an Admin, I want to add a Route with its Stations so that new lines can be used without a code change.
- As an Admin, I want to set one fixed Fare per Route so that pricing is simple and predictable.
- As an Admin, I want to deactivate a Route temporarily so that taps on it stop being charged during closures.
- As an Admin, I want to see who changed a Fare and when so that pricing changes are accountable.
- As an Admin, I want to see open trips (started but not ended) so that I can resolve problems.
- As a Passenger, I want to tap at the start and end of my trip so that I am charged the right fixed Fare automatically.
- As a Passenger, I want to see the Fare for a Route before I travel so that I know how much Balance I need.
- As a Passenger, I want to see where a train is so that I can decide when to go to the Station.

## Functional Requirements
1. The admin dashboard has a Routes & Pricing section listing every Route with its name, Stations, status (active/inactive) and fixed trip Fare.
2. An Admin can create a Route with a name and an ordered list of Stations, and can edit, reorder, add or remove Stations on it.
3. An Admin can set the fixed trip Fare of a Route in LKR; it must be zero or greater. Changing it affects only trips that start after the change.
4. An Admin can mark a Route inactive; inactive Routes are hidden from Passengers and cannot start new trips. Existing history is unaffected.
5. A start-of-trip tap on an active Route opens a trip for that Card, recording the Route, the Station and the time.
6. A start-of-trip tap is refused if the Card is deactivated, if the Card already has an open trip, or if the Balance is below the Route's fixed Fare.
7. An end-of-trip tap on the same Route completes the open trip, records the end Station and time, and debits the Route's fixed Fare once as a debit Transaction whose title names the Route and Stations.
8. The Fare debited is the Fare that applied when the trip started, even if an Admin changes the Fare mid-trip.
9. A Card cannot be charged twice for one trip: repeated or duplicate end taps do not debit again.
10. An end-of-trip tap with no open trip is refused and nothing is debited.
11. Passengers see a read-only list of active Routes with Stations and fixed Fare, and their own recent trips (Route, start, end, Fare charged, status).
12. Admins can view all trips, filter by status (open, completed, cancelled) and cancel an open trip with a reason.
13. Every create, edit, deactivate and Fare change records the Admin, the time, and the old and new values; Admins can view this history.
14. The Live tracking board lists trains with their Route, last known position, last-updated time and a status (running, stopped, no signal), taken from the GPS feed.
15. A train with no recent GPS update is shown as "no signal" rather than showing stale data as live. With no GPS data at all the board shows an honest "awaiting GPS" state.
16. The tap and trip features keep working when the local network has no internet access.

## Data Concerns
- **Routes:** the 9 existing Routes must be preserved. Their text Station lists become ordered Stations. Each Route needs one fixed trip Fare; the starting value must be agreed (see Open Questions) because the existing base fare and per-km figures do not map directly to a single amount.
- **Stations:** new: name and order on the Route. A Station may appear on more than one Route (for example a junction).
- **Trips:** new: Card/Passenger, Route, start Station and time, end Station and time, Fare charged, status.
- **Transactions:** a completed trip creates one debit Transaction. Existing Transactions and Balances remain unchanged and readable.
- **Change history:** new record of each Admin Route and Fare change.
- **Train positions:** supplied by an external GPS source; each position is tied to a train and a Route and has a timestamp. Only recent positions matter.

## Edge Cases & Failure Modes
- Start tap with Balance below the fixed Fare → refused, Card not debited, no trip opened.
- Start tap while a trip is already open → refused with a clear message (no second trip).
- End tap with no open trip → refused, nothing debited.
- Passenger forgets to tap at the end → trip stays open; Admin can cancel it, and any automatic expiry rule is decided in Open Questions.
- End tap at a Station not on the Route, or on a different Route → refused or flagged per the rule decided in Open Questions.
- Duplicate end tap in quick succession (reader bounce) → one debit only.
- Deactivated Card → tap refused (existing behaviour).
- Route deactivated while a trip is open on it → the open trip can still be completed and charged.
- Admin enters a negative or non-numeric Fare → refused.
- Station removed from a Route that has open trips → refused until those trips are completed or cancelled.
- Two Admins edit the same Route at once → the later save must not silently overwrite the earlier one without the Admin being told.
- Reader or local server unreachable → the tap is not accepted and the reader indicates failure; no partial debit.
- GPS feed down → board shows "no signal", never an invented position.
- Passenger opens the admin area → access refused.

## Acceptance Criteria
- [ ] An Admin can create a Route with Stations and a fixed Fare, and it appears in the Routes list.
- [ ] A start tap followed by an end tap on a Route debits exactly the Route's fixed Fare once and shows one Transaction.
- [ ] A start tap with insufficient Balance is refused and nothing is debited.
- [ ] A second start tap while a trip is open, and an end tap with no open trip, are both refused.
- [ ] Changing a Fare mid-trip does not change what that trip is charged.
- [ ] Duplicate end taps never charge twice.
- [ ] After migration all 9 Routes exist with their Stations and an Admin-confirmed fixed Fare.
- [ ] Deactivating a Route hides it from Passengers and blocks new trips on it.
- [ ] Every Fare change appears in the history with who, when, old and new values.
- [ ] A Passenger sees Routes, Fares and their own trips but cannot edit Routes or Fares, and direct attempts are refused.
- [ ] The Live tracking board no longer uses a hardcoded train list and shows "no signal" for trains without recent GPS data.
- [ ] Trips and taps work with the local network disconnected from the internet.
- [ ] Existing Top-up, Balance and user management behave as before.

## Open Questions
- **Fare scope:** assumed one fixed Fare per Route, regardless of start and end Station. Should it instead vary by Station pair (a small fare table), or by train type (Intercity vs. ordinary)? Suggested for MVP: one per Route.
- **When to debit:** assumed the Fare is debited at the end tap, after checking at the start tap that the Balance covers it. Alternative: debit at the start and refund on cancellation.
- **Forgotten end tap:** should open trips auto-expire after a time limit and either charge the fixed Fare or cancel? Suggested: Admin-cancel only for MVP, plus an "open trips" list.
- **Wrong-route end tap:** refuse, or charge the start Route's Fare anyway?
- **Starting Fare values:** what fixed amount should each of the 9 Routes start with?
- **Local deployment:** a single local server on the station/depot network is assumed, with readers on the same network. How are readers identified and trusted (device authentication is not designed yet), and is one server per station or one for the whole network?
- **Offline readers:** must a reader keep working if it loses contact with the local server (store and forward), or is a failed tap simply refused? Assumed refused for MVP.
- **GPS source:** what will the GPS device send (train number, latitude/longitude, timestamp), how often, and how is a train matched to a Route? Should Admins also manage a train list?
- **Passenger Fare lookup before tap:** is the read-only Routes list enough, or should Passengers also see Station-by-Station detail?
- **Suggested extras (later):** scheduled Fare changes with an effective date, Route closure notices shown to Passengers, trip receipts, and a daily revenue/trips summary for Admins.
- **History retention:** how long must the Admin change history and trip records be kept?

# Spec: Stripe Top-up And RFID Tap Debit

## Summary
Let a Passenger top up their Card Balance by paying online through the Stripe payment gateway, and make sure that once the physical RFID module is connected, a real Card tap at the end of a trip debits the Route's fixed Fare from the Passenger's Balance automatically.

## Background / Problem
Today a Passenger's Top-up is a simple "add this amount" action with no real payment behind it: nothing is charged, so the Balance can be inflated freely. The product needs real money to back every credit Transaction.

Separately, the trip start/end taps are currently only simulated from the Admin dashboard. The debit logic exists, but nothing connects a physical RFID reader to it, so no Passenger can actually tap a Card on a train or at a station and be charged. Phase 6 of the roadmap (connecting the physical RFID hardware) is the missing piece.

## Goals
- A Passenger can top up their own Balance by paying through Stripe, and the Balance only increases after Stripe confirms the payment succeeded.
- Every Top-up recorded as a credit Transaction corresponds to one confirmed Stripe payment, and no payment is ever credited twice or lost.
- The Passenger sees clear progress and a clear result (success, failed, cancelled, pending) for each Top-up attempt.
- When the RFID module reads a Card, the system identifies the Passenger from that Card and applies the existing trip tap rules: first tap opens a trip, the end tap debits the Route's fixed Fare once and completes the trip.
- A tap from the real hardware produces the same results, Transactions and error cases as a tap simulated from the Admin dashboard.
- Passengers can see the resulting debit Transaction and updated Balance without Admin help.

## Non-Goals
- Refunds, chargebacks and disputes handling through the app (handled manually in the Stripe dashboard for now).
- Saved payment methods, subscriptions, auto top-up or recurring payments.
- Payment methods other than those Stripe offers in its hosted payment experience (for example local bank transfers or cash agents).
- Redesigning the Passenger dashboard, Admin dashboard or the Routes & Pricing engine.
- Changing how Fares are calculated or how Routes and Stations are managed.
- Writing the firmware for the RFID module itself or designing device hardware; only the expectations the system places on a reader are covered.
- The native mobile app shell (Phase 7).
- Tax invoices or formal receipts beyond the existing Transaction ledger entry.

## Users & Roles
- **Passenger:** starts a Top-up for their own Card only, pays through Stripe, sees the outcome and the updated Balance and Transaction history. Taps their Card on the RFID reader to start and end trips.
- **Admin:** keeps the existing ability to simulate taps from the dashboard and to manage users and Routes. Needs visibility into Top-up payments that did not complete and into taps that were rejected, so they can help Passengers.
- **RFID hardware bridge (reader device):** submits Card taps on behalf of a Passenger together with the Route and Station where the tap happened. It is a trusted device, not a user, and must be identifiable so that an arbitrary person cannot fake taps.
- **Stripe:** external payment gateway that holds the card details and tells SmartRail whether each payment succeeded or failed.

## User Stories
- As a Passenger, I want to pay for a Top-up with my bank card through Stripe so that my Balance increases with real money.
- As a Passenger, I want to choose or enter a Top-up amount within sensible limits so that I only pay what I need.
- As a Passenger, I want to be told clearly whether my payment succeeded, failed or was cancelled so that I know whether my Balance changed.
- As a Passenger, I want my Balance to be correct even if I close the browser right after paying so that I'm never charged without being credited.
- As a Passenger, I want to tap my Card at the start and end of a journey and have the Fare debited automatically so that I don't need to buy a paper ticket.
- As a Passenger, I want to see each Top-up and each Fare debit in my Transaction history so that I can check what I paid.
- As an Admin, I want to see which Top-up payments are pending, failed or cancelled so that I can help a Passenger who says they paid but were not credited.
- As an Admin, I want taps from the physical reader to behave exactly like simulated taps so that I can trust the dashboard when testing the hardware.

## Functional Requirements
1. A signed-in Passenger can start a Top-up by entering an amount and being sent to Stripe's hosted payment experience to pay.
2. The Top-up amount must be a positive number within a minimum and maximum limit; amounts outside the limits are rejected before any payment is started, with a clear message.
3. Only a Passenger can start a Top-up, and only for their own Card. Admins and deactivated or deleted accounts cannot start one.
4. The Passenger's Balance is credited only after Stripe has confirmed the payment as successful. Returning to the app from Stripe is not by itself proof of payment.
5. Each confirmed payment credits the Balance exactly once and creates one credit Transaction, even if Stripe reports the same payment more than once or the Passenger refreshes or revisits the return page.
6. If a payment fails, is declined or is cancelled by the Passenger, the Balance is unchanged and no credit Transaction is created; the Passenger is told what happened and can try again.
7. If the Passenger completes payment but loses connection or closes the page before returning, the Balance is still credited once Stripe's confirmation arrives.
8. The Passenger can see the status of their recent Top-up attempts (pending, successful, failed, cancelled), not only the successful ones.
9. A pending Top-up that never completes is eventually shown as expired/cancelled and never credits the Balance afterwards unless Stripe later confirms payment.
10. The Admin can view Top-up attempts across Passengers, filtered by status and Passenger, to investigate payment problems.
11. The existing "add funds without paying" Top-up behaviour is no longer available to Passengers in normal operation. If a demo or test mode is kept, it is clearly separated and can be turned off.
12. The system supports a clearly marked test mode using Stripe test payments for development and demos, so no real money moves until the system is deliberately switched to live mode.
13. The RFID reader can submit a tap containing the Card/Passenger identity, the Route and the Station where it happened, and whether it is a start or end tap (or the system works this out from the Passenger's open trip).
14. A reader tap is only accepted from an identified, authorised reader device; unknown devices are rejected and the attempt is recorded.
15. A start tap checks that the Balance is at least the Route's fixed Fare and opens one trip; an end tap debits the snapshotted fixed Fare exactly once and completes the trip. These are the same rules as the existing simulated taps.
16. The same physical tap delivered twice (for example a reader retry after a network drop) must not open two trips or debit twice.
17. The reader receives a clear, quick response for every tap (accepted, insufficient Balance, deactivated Card, unknown Card, trip conflict, unknown Route/Station, rejected device) so it can show or sound feedback to the Passenger.
18. A successful debit appears in the Passenger's Transaction history with the Route, Stations and amount, and the Passenger's Balance reflects it on their next view.
19. Admin simulated taps and real reader taps are distinguishable in the record so that hardware testing can be audited.
20. A Passenger who tops up while a trip is open sees their new Balance used correctly at the end tap.

## Data Concerns
- **Top-up attempts** are a new kind of record: who started it, the amount, when, its status (pending, successful, failed, cancelled, expired) and the link to the Stripe payment. They must be kept even when unsuccessful so Admins can investigate.
- **Transactions:** a credit Transaction is created only for a confirmed payment and must be traceable back to the Stripe payment it came from. Existing credit Transactions from the earlier no-payment Top-up remain valid and must not be altered or removed.
- **Users:** Balance changes must remain consistent with the Transaction ledger. No change to the Passenger's profile fields is expected; a link to the Passenger's Stripe customer record is optional.
- **Cards / readers:** the system needs a way to know which reader devices are authorised, and how a physical Card's identity maps to a Passenger. If a Passenger can have more than one Card, or Cards can be lost/replaced, that must be represented.
- **Trips:** existing trip data is reused unchanged; each trip records whether its taps came from a reader or the Admin simulation.
- **Secrets and configuration:** Stripe keys and device credentials are environment configuration and must never be stored in the repository or sent to the browser (only the publishable key may be public).
- Amounts continue to be in Sri Lankan Rupees and must match exactly what Stripe charges.

## Edge Cases & Failure Modes
- Passenger enters 0, a negative value, non-numeric text or an amount beyond the limits → rejected with a clear message; no payment started.
- Passenger abandons the Stripe page or presses back → Top-up shown as cancelled/pending; Balance unchanged.
- Card is declined or requires extra authentication that fails → shown as failed; Balance unchanged; Passenger can retry.
- Stripe confirms payment but the Passenger's browser never returns → Balance is still credited once.
- Stripe sends the same confirmation more than once, or out of order → Balance credited once only.
- Confirmation received for a payment SmartRail has no record of, or for a deleted/deactivated account → not credited automatically; flagged for Admin attention.
- Confirmation request is not genuinely from Stripe (forged or tampered) → rejected, Balance unchanged.
- Stripe or SmartRail is unreachable while paying → Passenger sees a retry-able error and is never debited twice for one attempt.
- Passenger double-clicks "Pay" or opens two tabs → at most one payment per attempt is credited; multiple attempts are each separate and clearly listed.
- Amount charged by Stripe differs from the amount the Passenger requested → not credited blindly; flagged for Admin attention.
- Reader taps a Card that is not registered → rejected with a "unknown Card" response; nothing changes.
- Reader taps a deactivated or deleted Passenger's Card → rejected; no trip opened or debited.
- Start tap with Balance below the Route's fixed Fare → rejected as insufficient Balance; no trip opened.
- End tap with no open trip, or a second start tap while a trip is already open → rejected as a trip state conflict; no extra charge.
- The Route's Fare is changed or the Route is made inactive after the trip started → the fare snapshotted at the start tap is the one debited.
- Reader loses network at the end tap and retries later → debit applied once when it succeeds; the Passenger's open trip is not left stuck without Admin recourse (Admin can cancel the trip).
- Reader sends an unknown Route or Station → rejected with a clear response; nothing changes.
- Two taps for the same Card arrive at nearly the same time → only one is applied; Balance never goes negative or double-debits.
- Passenger Balance goes to exactly zero after the debit → allowed; further start taps are rejected until they top up.
- Reader device is stolen or compromised → Admin can disable that device and its taps are rejected immediately.

## Acceptance Criteria
- [ ] A Passenger can enter an amount, pay in Stripe test mode, return to the app and see the Balance increased by exactly that amount.
- [ ] Exactly one credit Transaction exists per successful payment, even after refreshing the return page or Stripe re-sending its confirmation.
- [ ] A cancelled or declined payment leaves the Balance and the credit Transactions unchanged and shows the Passenger a clear failed/cancelled message.
- [ ] Closing the browser immediately after paying still results in a correctly credited Balance.
- [ ] The Passenger can see their recent Top-up attempts with status, including failed and cancelled ones.
- [ ] An Admin can list Top-up attempts and filter by status and Passenger.
- [ ] Amounts outside the allowed limits are rejected before reaching Stripe.
- [ ] A Passenger cannot start a Top-up for another Passenger, and an Admin or deactivated account cannot start one.
- [ ] A forged or unsigned payment confirmation does not change any Balance.
- [ ] Without Stripe test-mode keys configured, the app clearly reports that online payments are unavailable instead of crashing or crediting funds.
- [ ] A tap from an authorised reader opens a trip on a start tap and debits the fixed Fare once on the end tap, with the same results as an Admin-simulated tap.
- [ ] A tap from an unknown or disabled reader is rejected and nothing changes.
- [ ] Re-sending the same tap does not open a second trip or debit a second time.
- [ ] Insufficient Balance, deactivated Card, unknown Card and trip conflicts each return a distinct, clear response to the reader.
- [ ] The debit appears in the Passenger's Transaction history with the correct Route, Stations and amount, and the Balance matches the ledger.
- [ ] No Stripe secret key or reader credential appears in the browser, the repository or client-visible responses.
- [ ] The Admin dashboard's simulated taps continue to work as before.

## Open Questions
- **Currency and limits:** assumed Sri Lankan Rupees; what are the minimum, maximum and any preset Top-up amounts? Does Stripe account support LKR charging for the business, or must another currency be used?use lkr and minimum amount 500.
- **Stripe account:** is a Stripe account with test keys available, and in which country is the business registered? This affects supported payment methods and fees.need to use only developer account for MVP product.
- **Payment experience:** assumed Stripe's hosted payment page (redirect and return); is an embedded in-page payment form preferred instead?
- **Fees:** does the Passenger pay Stripe's processing fee on top of the Top-up, or does SmartRail absorb it?
- **Legacy Top-up:** should the earlier no-payment Top-up be removed completely, or kept behind a demo/test switch for presentations?
- **Card identity:** how does a physical Card's ID map to a Passenger today? Is there a Card registration step (assigning a Card to a Passenger, replacing a lost Card) that this feature must also cover?
- **Reader authentication:** how will a reader prove who it is (shared device key, per-device credential, other)? Device authentication is not designed yet and is needed before real hardware taps are accepted.
- **Tap direction:** will the reader tell the system whether this is a start or end tap (for example by a gate or button), or should the system infer it from whether the Passenger has an open trip?
- **Reader feedback:** what response format and speed does the hardware need (LED, buzzer, small display), and what is the offline behaviour at stations with weak connectivity?
- **Pending Top-up lifetime:** how long should an unpaid attempt stay pending before it is shown as expired?
- **Refunds:** is a manual refund through Stripe acceptable at first, and should a refund then reduce the Balance, or is that handled outside the app?
- **Notifications:** should Passengers receive an email or message for successful Top-ups and low Balance, or is on-screen feedback enough?
- **Scope of Phase 6:** this spec covers the debit path for a connected reader; should the physical reader integration itself (device onboarding, provisioning) be a separate follow-up spec?

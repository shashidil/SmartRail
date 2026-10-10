# Spec: Secure Authentication And User Management

## Summary
Re-implement Passenger registration and login, and the Admin's user management, so that identity is proven with a signed, expiring session token and credentials are stored safely. Passengers and Admins only see and do what their role allows.

## Background / Problem
Today the sign-in flow is only a demonstration:
- Passwords are stored exactly as typed.
- The "token" returned at login is a placeholder that is never checked, so anyone who can reach the system can top up a Passenger's Balance, read any Passenger's Transaction history, change Route Fares or manage users without logging in.
- The Admin dashboard decides who is an Admin only from information kept in the browser, which anyone can edit.
- User management for the Admin is limited to viewing the Passenger list; there is no way to edit, deactivate or remove a Passenger, or to reset a forgotten password.
- Registration has minimal validation and no protection against weak passwords or repeated attempts.

## Goals
- Passwords are never stored or returned in readable form, and existing demo accounts keep working.
- Login issues a signed session token with a limited lifetime; every protected action requires a valid token.
- Role rules (Passenger vs Admin) are enforced by the system, not only by what the screens show.
- A Passenger can only see and act on their own Card Balance and Transactions.
- An Admin can fully manage Passenger accounts from the Admin dashboard.
- Sessions end cleanly (logout, expiry) and the user is returned to the login screen with a clear message.
- The visual design and "no purple" palette stay as they are.

## Non-Goals
- Redesigning the login, registration or dashboard screens beyond what the new behaviour needs.
- Social login, single sign-on, or two-factor authentication.
- Physical RFID hardware authentication (Phase 6) beyond keeping the tap bridge working.
- Email or SMS delivery (no verification emails or password reset links).
- Changing Fare calculation, Top-up rules or the Live tracking board.

## Users & Roles
- **Passenger (role `user`):** registers, logs in, logs out, views own Balance and Transactions, tops up own Card, and can change their own password.
- **Admin:** logs in, views and searches Passengers, creates Passengers, edits details, resets passwords, deactivates or reactivates accounts, deletes accounts, adjusts Route Fares, and simulates RFID taps.
- **RFID hardware bridge:** the tap action must keep working for the Admin simulation and the future Arduino/ESP32 device; how the device proves itself is an Open Question.

## User Stories
- As a Passenger, I want to register with a username, password, full name, phone number, NIC and email so that I get my own Card account and can later recover access.
- As a Passenger, I want to log in and stay signed in for a reasonable time so that I don't re-enter my details on every visit.
- As a Passenger, I want to log out so that nobody else using my device can spend my Balance.
- As a Passenger, I want to change my password so that I can keep my account secure.
- As an Admin, I want to see all Passengers with their Balance and status so that I can support them.
- As an Admin, I want to create, edit, deactivate, reactivate and delete Passenger accounts so that I can manage who uses the system.
- As an Admin, I want to reset a Passenger's password so that a locked-out Passenger can regain access.
- As an Admin, I want my Fare and tap controls protected so that only Admins can change Fares.

## Functional Requirements
1. Registration requires a unique username, a password meeting a minimum strength rule, and the Passenger's full name, phone number, NIC and email (email and NIC unique, all validated); new accounts are always Passengers with a zero Balance.
2. Registration cannot create an Admin; Admin accounts are created only by an existing Admin or by initial setup.
3. Passwords are stored only in a protected, non-reversible form and are never included in any response.
4. Existing accounts with readable passwords are converted to the protected form without the user having to do anything, and the demo logins keep working.
5. Login with a correct username and password returns a session token plus the user's basic profile (no password).
6. Login failures give a single generic message that does not reveal whether the username exists.
7. Repeated failed logins for the same account or source are temporarily slowed or blocked.
8. The session token expires after a fixed lifetime; an expired or tampered token is rejected and the user is sent to the login screen with an explanation.
9. All actions other than registration and login require a valid session token.
10. Passenger-only actions (view own Transactions, Top-up, change own password) apply only to the signed-in Passenger's own account; attempts on another account are refused.
11. Admin-only actions (list/create/edit/deactivate/delete users, reset passwords, change Fares, simulate taps) are refused for Passengers even if the screen is bypassed.
12. A deactivated account cannot log in, and an already-issued session for it stops working.
13. The Admin user list shows username, name, contact details, role, Balance, status, and created date, and supports searching by username, name, email, phone and NIC.
14. An Admin cannot deactivate, delete or demote their own account, and the last remaining active Admin cannot be removed.
15. Deleting a Passenger keeps the ledger consistent; what happens to their past Transactions is decided in Open Questions.
16. Logout clears the session on the device; the user must log in again to continue.
17. The Admin dashboard and Passenger dashboard decide access from the validated session, not from editable browser data alone.
18. The RFID tap action continues to debit the Card Balance correctly and still returns "insufficient Balance" when funds are too low.

## Data Concerns
- **Users:** gain a status (active/deactivated) and created/last-updated times; passwords change from readable to protected form. Existing Users (including `nirmal` and `admin`) must be preserved with their Balances.
- **Transactions:** must remain intact for existing Passengers; deleting a Passenger needs a defined rule for their history.
- **Routes:** unchanged, but Fare updates become Admin-only.
- **Sessions:** the session token itself is not stored in the system's records unless the plan decides it needs revocation (see Open Questions).
- A one-time conversion of all existing passwords must be safe to repeat and must not lock anyone out.

## Edge Cases & Failure Modes
- Duplicate username on registration or Admin create → clear "username already taken" message, no account created.
- Weak or empty password → rejected with the rule explained.
- Wrong password or unknown username → same generic "invalid username or password".
- Too many failed attempts → temporary lockout message; correct login works again after the wait.
- Expired token while using the dashboard → user is returned to login; unsaved action is not applied.
- Tampered or missing token → request refused as not signed in.
- Passenger tries an Admin action directly → refused as not permitted, no data changed.
- Passenger tries to view or top up another Passenger's account → refused.
- Admin tries to delete or deactivate themselves → blocked with a message.
- Deactivated Passenger's Card is tapped → decided in Open Questions (assumed: tap refused with a clear reason).
- Admin resets a password for a Passenger who is currently signed in → their existing session is ended or stops working at next use.
- Two Admins edit the same Passenger at once → last save wins without corrupting the Balance.
- Browser data (`user` / `token` in local storage) edited by hand → server-side checks still prevent access.

## Acceptance Criteria
- [ ] A new Passenger can register, log in, see their dashboard and log out.
- [ ] Passwords cannot be read from the stored records or any response.
- [ ] `nirmal` and `admin` demo logins still work after the change with Balances unchanged.
- [ ] Without a valid session, Balance, history, Top-up, Fare change, user management and tap actions are refused.
- [ ] A Passenger cannot view or top up another Passenger's account.
- [ ] A Passenger cannot reach any Admin action, including by editing browser data.
- [ ] An Admin can search, create, edit, deactivate, reactivate, delete and reset the password of a Passenger from the dashboard.
- [ ] An Admin cannot lock themselves out or remove the last Admin.
- [ ] A deactivated Passenger cannot log in and their open session stops working.
- [ ] An expired session returns the user to the login screen with a clear message.
- [ ] Repeated wrong passwords trigger a temporary block.
- [ ] RFID tap simulation from the Admin dashboard still debits correctly and reports insufficient Balance.
- [ ] No purple is introduced; existing layout and styling are otherwise unchanged.

## Open Questions
Details needed from the user (design and process decisions):
1. **Session lifetime:** how long should a login last (e.g. 1 hour, 1 day, 7 days)? Should there be a "remember me" option? Assumed: 8 hours, no refresh.
2. **Logout / revocation:** must logout and deactivation invalidate a token immediately (requires tracking), or is waiting for expiry acceptable? Assumed: deactivation is checked on every request.
3. **Where the token lives in the browser:** the current approach uses local storage; is moving to a more tamper-resistant cookie approach wanted? Assumed: keep local storage for now.
4. **Registration fields:** username and password only, or also name, phone number, NIC and email? Is email/phone needed for a future password reset?also name, phone number, NIC and email and needed for a future password reset
5. **Password rules:** minimum length and complexity? Assumed: at least 8 characters with a letter and a number.
6. **Password reset for Passengers:** Admin-initiated reset only, or a self-service flow (needs email/SMS)? Assumed: Admin-initiated only.self-service flow needs email
7. **Admin creation:** can an Admin create other Admins, and should there be other roles (e.g. station staff)? Assumed: Admins may create Passengers and Admins only.
8. **Deleting a Passenger:** hard delete with history removed, hard delete with history kept anonymised, or deactivate only? Assumed: deactivate by default, delete only when Balance is zero and history is retained.
9. **Balance handling:** may an Admin adjust a Passenger's Balance directly from user management, and if so should it be logged as a Transaction?
10. **RFID hardware identity:** how should the Arduino/ESP32 device authenticate its tap requests (shared device key vs Admin token)? Assumed: out of scope now; the simulation uses the Admin session.
11. **Lockout rule:** how many failed attempts and for how long? Assumed: 5 attempts, 15 minute block.
12. **Audit trail:** should Admin actions (reset, delete, deactivate) be recorded for review?

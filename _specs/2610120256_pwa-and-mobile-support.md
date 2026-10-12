# Spec: PWA And Mobile Support

## Summary
Turn SmartRail into an installable Progressive Web App that works properly on phones and tablets, so Passengers can add it to their home screen and check their Balance, top up and follow the Live tracking board from a mobile device. Admins can also use the dashboard on a phone or tablet in the field.

## Background / Problem
The project notes describe SmartRail as "PWA ready", but today it isn't installable in practice:

- The app's install information points at an icon that doesn't exist, and there are no properly sized home-screen icons. Browsers therefore won't offer "Install" / "Add to Home Screen", or they show a blank icon.
- Nothing is cached on the device, so the app doesn't load at all without a network connection. Even a brief signal drop on a train shows a browser error page instead of the app.
- There's no Apple-specific install information, so on iPhone the app opens with browser chrome and no proper icon or splash.
- The pages were mostly built for desktop. The Admin dashboard's side navigation is hidden on small screens with no way to open it, so an Admin on a phone can't switch sections. Several tables (Transactions, trips, Cards, devices, payments) are much wider than a phone screen, and some dialogs and forms aren't sized for touch.

Passengers are commuters who carry a phone, not a laptop. Phase 7 on the roadmap (a native mobile app shell) also expects a solid mobile web base to wrap.

## Goals
- The app passes the browser's installability checks on Android (Chrome) and desktop (Chrome/Edge). It can be added to the iPhone/iPad home screen (Safari) with a proper icon, name and full-screen launch.
- Once installed, the app opens in its own window without browser chrome, uses the SmartRail name, icon and theme colours, and shows a branded launch screen.
- After the first visit, the app shell (layout, styles, fonts, icons) loads from the device, even when offline or on a poor connection.
- When offline, the Passenger sees a clear "You're offline" state and their last-known Balance and recent Transactions, clearly labelled as not live. The app never shows a browser error page.
- Every page (Login, Passenger dashboard, Routes / Live tracking board, Admin dashboard and its sections) is usable on a 360px-wide phone screen in portrait. Nothing is cut off, no sideways page scrolling is needed, and touch targets are comfortably sized.
- When a new version of the app is deployed, installed copies pick it up reliably, and the user is told when a refresh is needed.
- The existing "no purple" rail palette and visual style are kept on every screen size.

## Non-Goals
- A native mobile app or app-store distribution (that's Phase 7).
- Push notifications (for example low-Balance or trip-completed alerts). This could be a follow-up.
- Offline actions that change data: no Top-up, Admin edit, simulated RFID tap or password change can be made or queued while offline.
- Using the phone itself as a Card (NFC tap-to-ride) or as an RFID reader.
- A visual redesign. Layouts may reflow for small screens, but the look, palette and page structure stay the same.
- Changes to the PayHere checkout pages themselves (they belong to PayHere).
- Changes to how Fares, Routes, Trips, Top-ups or Card taps work.

## Users & Roles
- **Passenger (role `user`):** the main audience. Installs the app on their phone, checks Balance and Transactions, starts a Top-up, views Routes, Fares and the Live tracking board. Benefits most from offline viewing of last-known data.
- **Admin:** can use every Admin section (users, Routes & Pricing, RFID terminal, Cards & devices, payments) on a phone or tablet. Admin data is never kept on the device for offline use (see Data Concerns).
- **RFID hardware bridge (reader devices):** not affected. Readers talk to the backend directly and don't use the web app.
- **PayHere:** not changed. The Passenger leaves the app for PayHere's hosted checkout and returns to it, and that round trip must also work from an installed app.

## User Stories
- As a Passenger, I want to install SmartRail on my phone's home screen so that I can open it like an app, without finding the website each time.
- As a Passenger, I want the app to open quickly even with weak signal on the platform so that I can check my Balance before tapping my Card.
- As a Passenger, I want to see my last-known Balance and recent Transactions when I'm offline, clearly marked as such, so that I'm not left with an error screen.
- As a Passenger, I want to top up from my phone and land back in the app after paying so that I can see my new Balance straight away.
- As a Passenger, I want to follow the Live tracking board on my phone so that I know where my train is.
- As an Admin, I want to reach every dashboard section on my phone so that I can deactivate a Card or check a payment while away from a desk.
- As an Admin, I want long tables to stay readable on a small screen so that I can find a user, trip or payment without zooming.
- As any user, I want to be told when a new version is available so that I'm never stuck on an outdated app.

## Functional Requirements
1. The app provides complete install information: full and short name, description, start page, standalone display, portrait-friendly orientation, theme and background colours that match the rail palette, and a set of home-screen icons, including a maskable icon for Android, made from the SmartRail brand mark.
2. The app provides the information iOS needs: home-screen icon, app title, status-bar style and full-screen standalone launch.
3. Chrome on Android and Chrome/Edge on desktop recognise the app as installable when it's served over HTTPS (or localhost).
4. The app offers an "Install app" button in a non-intrusive place (for example on the Login page and in the Passenger dashboard) when the browser supports installing and the app isn't already installed. On iOS, where browsers can't prompt, it shows short "Add to Home Screen" instructions. If the user dismisses the offer, it isn't shown again for a reasonable period.
5. After the first successful load, the app shell (layout, scripts, styles, fonts, icons, page navigation) is stored on the device, and later launches load the shell from the device first.
6. Live data (Balance, Transactions, trips, Routes, train positions, Top-up status) always comes from the server when online. Cached data may only be used when the network is unavailable and must never be shown as current.
7. When offline, the app shows a visible offline indicator. A Passenger who was signed in sees their last-known Balance and recent Transactions with a "last updated" time. Routes and Fares show their last-known values if available. The Live tracking board shows an "offline, positions unavailable" state instead of stale train positions.
8. When offline, every action that changes data (Top-up, password change, every Admin action, simulated RFID tap) is disabled or refused with a clear message. Nothing is queued to send later.
9. When the connection returns, the offline indicator clears and the current page refreshes its live data without a manual reload.
10. Opening any in-app page directly (from the home screen, a bookmark or a reload) works both online and offline, with the existing sign-in and role checks still applied.
11. Signing in is still required, and the existing session expiry and revocation keep working. A Passenger whose session expired while offline is sent to Login once back online.
12. Signing out (or being signed out by the server) removes all cached personal data (Balance, Transactions, trips, profile) from the device.
13. When a new app version is deployed, an installed app detects it. The user sees a "New version available, refresh" prompt, or the update is applied on the next launch without data loss. Users are never left on a broken mix of old and new versions.
14. The Top-up round trip works from an installed app: the Passenger can go to PayHere's checkout and return to the app, which then shows the Top-up result and updated Balance, as it does in the browser today.
15. Every page lays out correctly from 360px wide (phone portrait) up to desktop, with no sideways page scrolling.
16. On small screens the Admin dashboard has a visible menu control that opens and closes the section navigation. Choosing a section closes the menu.
17. Wide tables (Transactions, trips, users, Cards, devices, payments, RFID tap events) stay readable on phones, either by scrolling sideways inside their own area or by switching to a stacked card layout. The rest of the page never scrolls sideways.
18. Dialogs (Top-up, password change, user edit, Route edit) fit within a phone screen, can scroll when their content is taller than the screen, and their controls aren't covered by the on-screen keyboard.
19. Buttons, links and form fields are large enough to tap reliably, and form fields use the matching phone keyboard (numeric for amounts, email for email, phone for phone number).
20. Content isn't hidden behind phone notches, rounded corners or home indicators when the app runs full screen.
21. Heavy decorative effects (for example the animated Login scene) don't make phones sluggish, and they respect the device's "reduce motion" setting.

## Data Concerns
- **No server-side data changes.** Users, Cards, Balances, Transactions, Routes, Stations, Trips, Top-ups and devices are unchanged, and nothing needs migrating.
- **Data stored on the device:** the app shell, plus, for a signed-in Passenger only, a last-known copy of their own Balance, recent Transactions, profile basics and Routes/Fares, each with the time it was fetched. This copy only supports offline viewing and is never the source of truth.
- **Admin data is never kept on the device for offline use** (user lists, contact details, payments, Cards, devices, tap events). Admin pages need a live connection.
- **Sensitive data:** passwords, PayHere payment details and reader device keys are never cached. Contact details (NIC, email, phone) are cached only for the Passenger's own profile, if at all (see Open Questions).
- **Clean-up:** all cached personal data is removed on sign-out, on session revocation and when a different user signs in on the same device. Caches from old app versions are cleared when a new version takes over.
- **Existing sessions:** users who are already signed in in a browser stay signed in after this change.

## Edge Cases & Failure Modes
- Passenger opens the installed app with no signal → app shell loads, offline indicator shows, last-known Balance and Transactions appear with a "last updated" time. No browser error page.
- Passenger opens the app offline for the first time, with nothing cached → a branded offline screen explains that a connection is needed for the first use.
- Passenger tries to top up while offline → Top-up is disabled with "You're offline". No payment is started.
- Connection drops during the PayHere checkout → the Top-up stays pending as today. When the Passenger is back online and returns to the app, the existing status check settles the result. No double credit.
- Passenger returns from PayHere into the browser instead of the installed app (common on iOS) → the result page still works in the browser, and the Balance is correct the next time the installed app opens.
- Session expired or the Card was deactivated while offline → cached data is shown, labelled offline. Once online, the first server check signs the user out and clears cached data.
- Two users share one phone → when the second user signs in, the first user's cached data is removed before the second user's data is shown.
- New version deployed while the app is open → user sees the update prompt. Unsaved form input isn't silently lost by a forced reload.
- Stale cached Fare shown offline and then a Route Fare changes → once online, the live Fare replaces the cached one. Fares charged at tap time are always decided by the server, never by the cached value.
- Live tracking board offline → shows "offline, positions unavailable" and never displays stale positions as live.
- Browser doesn't support installing (for example Firefox desktop) → the app works as a normal website and no install button is shown.
- User denies or dismisses the install offer → no repeated nagging, and the app works the same.
- Very small screen (320px) or landscape phone → layout stays usable, possibly tighter, with no content cut off.
- On-screen keyboard opens over a dialog → the focused field and the dialog's primary button stay reachable.
- App served over plain HTTP on a non-localhost address (for example a phone testing against a laptop's local IP) → offline features and installing aren't available. The app still works online, and this is documented for developers.

## Acceptance Criteria
- [ ] Chrome on Android offers "Install app" for SmartRail, and the installed app opens full screen with the SmartRail icon, name and theme colour.
- [ ] Chrome or Edge on desktop shows the install icon, and the installed app opens in its own window.
- [ ] Safari on iPhone: "Add to Home Screen" gives a proper SmartRail icon and name, and the app launches without browser chrome.
- [ ] A browser installability/PWA audit (for example Lighthouse) reports the app as installable with no manifest or icon errors.
- [ ] With the network switched off after one visit, reopening the app shows the shell, an offline indicator and the Passenger's last-known Balance and Transactions with a "last updated" time.
- [ ] While offline, Top-up, password change and every Admin action are visibly disabled or refused with a clear message.
- [ ] Turning the network back on clears the offline indicator and refreshes live data without a manual reload.
- [ ] After signing out, going offline and reopening the app, no previous Passenger data is visible.
- [ ] Deploying a new build causes an already-installed app to offer, or apply, the update.
- [ ] A Top-up started from the installed app on a phone completes through PayHere, and the updated Balance is shown afterwards.
- [ ] On a 360px-wide phone screen, Login, Passenger dashboard, Routes / Live tracking board and every Admin section have no sideways page scrolling and nothing cut off.
- [ ] On a phone, the Admin can open the navigation menu and reach every Admin section.
- [ ] Wide tables are readable on a phone without zooming the whole page.
- [ ] All dialogs fit on a phone screen and their buttons stay reachable with the keyboard open.
- [ ] Amount fields open a numeric keyboard, email fields an email keyboard and phone fields a phone keyboard.
- [ ] Demo logins (`nirmal`, `admin`) and all existing desktop behaviour still work unchanged.
- [ ] No purple appears in any new UI (install prompt, offline indicator, update prompt, mobile menu).

## Open Questions
- **Offline scope:** is read-only offline viewing of the Passenger's own Balance and Transactions wanted, or should the first version only cache the app shell and show an offline screen? (Assumed: read-only last-known data, as described above.)
- **Contact details on the device:** should the Passenger's NIC, email and phone be cached for offline viewing, or left out to keep the device copy minimal? (Assumed: left out.)
- **Update behaviour:** prompt the user to refresh, or update silently on the next launch? (Assumed: prompt when the app is open, apply on next launch otherwise.)
- **Install prompt placement:** Login page, Passenger dashboard, both, or a menu item only? Should Admins see it too?
- **Icons and launch screen:** is there an official SmartRail logo to use, or should icons be made from the current brand mark and the rail palette?
- **Supported devices:** which minimum phone browsers and OS versions must be supported (for example the last two major versions of Chrome for Android and iOS Safari)?
- **Hosting:** installing and offline support need HTTPS outside localhost. Where will the frontend be hosted for real mobile testing, and should developer notes cover testing on a phone (for example through a tunnel)?
- **Mobile tables:** inner sideways scrolling, or stacked cards for the most-used tables (Passenger Transactions, Admin users)? (Assumed: stacked cards for Passenger Transactions, inner scrolling for Admin tables.)
- **Project notes:** `smartrail-ticketing.md` marks "PWA Conversion" as done in Phase 5. Should this work be tracked as completing Phase 5 or as a new phase?

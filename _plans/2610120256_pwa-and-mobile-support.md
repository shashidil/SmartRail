# Implementation Plan: PWA And Mobile Support

Spec: `_specs/2610120256_pwa-and-mobile-support.md`
Branch: `feature/pwa-and-mobile-support`

Feature type: **frontend-only**. The backend needs no code changes. The only backend-adjacent item is documenting the `FRONTEND_URL` value for mobile testing (see Logic Detail §8).

Open Questions from the spec are settled as the spec assumed:
- **Offline data:** Passengers can view their own last-known data read-only.
- **Contact details:** NIC, email and phone are kept out of the new offline copy.
- **Updates:** the user is prompted while the app is open, and a waiting update applies on the next launch.
- **Install offer:** shown on the Login page and the Passenger dashboard only (not to Admins).
- **Icons:** made from a new SVG brand mark in `rail-blue`.
- **Tables:** stacked cards for the Passenger lists (already list-based), inner sideways scrolling for Admin tables.
- **Phase tracking:** this completes Phase 5 in `smartrail-ticketing.md`.

---

## Algorithm / Logic Detail

### 1. Service worker and precache (vite-plugin-pwa)
- Add `vite-plugin-pwa@^2.0.0`. Its peer range includes `vite ^8`, and the repo is on Vite 8.0.9. Add `workbox-window` as its peer. Use `strategies: 'generateSW'`, `registerType: 'prompt'` and `injectRegister: false`, and register from React with `virtual:pwa-register/react`.
- **Precache:** everything the build emits (JS, CSS, HTML), the icons, `favicon.ico` and `offline.html`. Exclude `edit.mp4` (11.9 MB, the Dashboard hero video) with `globIgnores`, so the first install doesn't download 12 MB on mobile data.
- **Navigation fallback:** use `navigateFallback: 'index.html'` so `/dashboard`, `/admin`, `/routes` and `/login` open offline (FR10). Set `navigateFallbackDenylist: [/^\/api\//]` for a future deploy where the API shares the origin.
- **Runtime caching:**
  - Google Fonts stylesheet (`fonts.googleapis.com`): StaleWhileRevalidate.
  - Font files (`fonts.gstatic.com`): CacheFirst with a 1-year expiry.
  - `edit.mp4`: none. It plays online only, and offline the hero section falls back to a poster or gradient background.
- **API responses are never cached by the service worker.** The API is a different origin (`VITE_API_URL`, default `http://localhost:5000`), and Workbox leaves it alone unless a rule matches it. No rule is added. All offline data comes from the app-managed snapshot (§3), so the service worker can't leak one user's data to another.
- `cleanupOutdatedCaches: true` removes caches from earlier versions when a new service worker activates.
- `devOptions.enabled: false`. Service-worker behaviour is checked with `npm run build && npm run preview`, so `npm run dev` stays cache-free.

### 2. Online/offline state
- New hook `useOnlineStatus()` returns `navigator.onLine` and listens to the `online` and `offline` events.
- A request with no `err.response` (network error) is treated as "offline" even if `navigator.onLine` says otherwise. The axios response interceptor marks this with an `offline` flag on a small shared emitter in `src/lib/network.js`, and the hook combines both signals.
- **Request guard (FR8):** a new axios request interceptor rejects any non-GET request immediately while offline. It throws an error with `code: 'OFFLINE'` and message "You're offline. Connect to the internet and try again." Pages already show `err.response?.data?.message || fallback`, so each call site must also read `err.message` when `err.code === 'OFFLINE'`. Nothing is queued.

### 3. Offline snapshot (Passenger only)
- **Storage:** a new module `src/lib/offlineCache.js` keeps one localStorage key, `offline:<userId>`, holding `{ savedAt, balance, history, trips, topups, routes }`. `fullName` and `username` come from the existing `user` key. NIC, email and phone are not copied.
- **Writing:** on every successful load, `Dashboard.jsx` (`fetchHistory`, `fetchTrips`, `fetchTopups`) and `Routes.jsx` (`/api/routes`) write their slice with a new `savedAt`. Train positions (`/api/trains`) are never stored (FR7).
- **Reading:** a page reads the snapshot only when it's offline or when a load failed with a network error, and shows it under a "Last updated <time>, offline" banner.
- **Clearing (FR12):**
  - `clearSession()` in `src/api.js` also removes every `offline:*` key. Every sign-out path already goes through it: the logout buttons, the 401 interceptor and `RequireAuth`.
  - `setSession({ token })`, which runs on login or registration, removes `offline:*` keys belonging to other user ids before storing the new session. This covers two users sharing one phone.
- **Admin data** is never written to the snapshot. Admin pages use no cache.

### 4. RequireAuth when offline
Today, if `GET /api/me` fails without a 401, `RequireAuth.jsx` calls `clearSession()` and denies access. Offline, that would log the Passenger out and delete their snapshot. New flow:
1. No token → deny (unchanged).
2. `/api/me` succeeds → `status: 'ok'`, live (unchanged).
3. `/api/me` fails with a 401 → the interceptor handles it (unchanged).
4. `/api/me` fails with a network error and a stored user exists → `status: 'offline'`. Render children with the stored user, and run the role check against the stored user.
5. Any other error (5xx) → keep the current behaviour (clear the session and deny).
6. While in `status: 'offline'`, listen for the `online` event and re-run `/api/me`. Success returns to `ok` and the page reloads its live data (FR9). A 401 signs the user out through the interceptor, which also clears the snapshot.

**Security note:** an edited stored user could reach the `/admin` shell offline, but the Admin page caches nothing and every Admin action needs the server, which enforces roles. Access rules don't change.

The `status: 'offline'` value reaches pages through a small `SessionStatusContext` provided by `RequireAuth`. That way `Dashboard`, `Routes` and `AdminDashboard` know to show snapshot data or the "needs a connection" state without each re-checking.

### 5. Page behaviour offline
- **Passenger dashboard:**
  - Shows the balance, history, trips and top-ups from the snapshot under an `OfflineBanner`.
  - "Top Up" and "Change password" are disabled with a tooltip or inline "You're offline".
  - The PayHere return handler (`?topup=…&id=…`) waits for the connection to come back if it's offline, then runs. This keeps the existing exactly-once server settlement, and nothing is decided on the device.
- **Routes:**
  - Routes and Fares show from the snapshot with a "last updated" label.
  - The Live tracking board shows "Offline, positions unavailable" instead of the train list, and train polling pauses until the connection returns.
- **Admin dashboard:** every tab shows a full-width "Admin tools need a connection" panel. The hardcoded "Server: ONLINE" footer pill in the sidebar becomes a live online/offline pill from `useOnlineStatus`.
- **Login:** the submit button is disabled offline with "You're offline".
- **First-ever offline launch with nothing cached:** the service worker isn't installed yet, so the browser shows its own error. That can't be avoided. Once the service worker is installed, any navigation that misses the precache falls back to `offline.html`, a static branded page that says a connection is needed (spec edge case).

### 6. Update flow (FR13)
- New `UpdatePrompt` component, mounted once in `App.jsx`, uses `useRegisterSW` from `virtual:pwa-register/react`. When `needRefresh` is true it shows a bottom toast: "A new version of SmartRail is available" with **Refresh** and **Later** buttons. Refresh calls `updateServiceWorker(true)`.
- **Later** leaves the waiting service worker in place, and it activates on the next launch once every app window has closed. This is standard prompt-mode behaviour, and users never run a mix of old and new versions.
- `useRegisterSW`'s `onRegisteredSW` checks for updates every 60 minutes with `registration.update()`, so long-running installed sessions also notice deploys.
- Unsaved input isn't lost to a forced reload, because nothing reloads without the user pressing Refresh.

### 7. Install offer (FR4)
- New `InstallPrompt` component captures `beforeinstallprompt`, calling `preventDefault()` and storing the event.
- If the event was captured and the app isn't already running as installed (checked with `matchMedia('(display-mode: standalone)')` or `navigator.standalone`), it shows a small "Install SmartRail" button or card. Clicking it calls `prompt()`.
- On iOS Safari (user agent contains iPhone, iPad or iPod and the app isn't installed), it shows a short "Tap Share, then Add to Home Screen" hint instead.
- Dismissal stores `installDismissedAt` in localStorage and hides the offer for 14 days. The `appinstalled` event hides it for good.
- It's placed on `Login.jsx` (under the card) and `Dashboard.jsx` (near the header). Unsupported browsers render nothing.

### 8. Mobile testing over HTTPS
Service workers and installing need HTTPS outside localhost. The developer notes added to `CLAUDE.md` explain how to test on a real phone:
1. `npm run build && npm run preview -- --host`.
2. Expose the preview through an HTTPS tunnel (ngrok, already used for `PAYHERE_NOTIFY_URL`).
3. Set `VITE_API_URL` to a tunnelled backend URL before building.
4. Set `backend/.env` `FRONTEND_URL` to the tunnelled frontend origin so PayHere's `return_url` (`backend/lib/topups.js`) lands back on the app.

CORS is already open (`app.use(cors())`).

On iOS, PayHere's return opens in the installed app only if the URL is within the app scope and iOS chooses to. Often it opens in Safari, which has a separate localStorage. That Safari page then needs a login, so the Dashboard return handler there is unchanged. The installed app shows the correct Balance from `/api/me` and `/api/history` next time it opens. Documented as a known limitation, and no code is needed beyond §4.

### 9. Responsive layout pass
- **Viewport and safe areas:**
  - Change the viewport to `width=device-width, initial-scale=1, viewport-fit=cover`.
  - Add `.pt-safe`, `.pb-safe`, `.pl-safe` and `.pr-safe` utilities in `index.css` using `env(safe-area-inset-*)`.
  - Apply them to the sticky `nav` in `Routes.jsx`, the Passenger header/nav in `Dashboard.jsx`, the Admin header and drawer, and the bottom toasts.
- **Admin drawer (FR16):**
  - `AdminDashboard.jsx` gets `const [navOpen, setNavOpen] = useState(false)`.
  - The `<aside>` uses `-translate-x-full` unless `navOpen` is true, with `md:translate-x-0` unchanged. `z-10` becomes `z-40` so the drawer sits above content.
  - A dimmed backdrop (`md:hidden`) closes the drawer on tap. The header gets a `Menu` (lucide) button with `md:hidden` and `aria-label="Open menu"`.
  - Each nav button calls `setActiveTab(x)` and then `setNavOpen(false)`. The drawer also closes on Escape.
  - Header padding `px-8` → `px-4 md:px-8`. The non-functional header search input is hidden below `sm`. Content padding `p-8 lg:p-12` → `p-4 md:p-8 lg:p-12`.
- **Tables (FR17):**
  - Make sure every table sits in an `overflow-x-auto` container. The ones in `AdminDashboard.jsx` and the first two in `CardsDevices.jsx` already do. Add wrappers to `PaymentsPanel.jsx`, `RfidTerminal.jsx` and the "Rejected taps" table in `CardsDevices.jsx`, which sits directly under a `glass-card`. Wrap only the `<table>`, so the card header doesn't scroll with it.
  - Toolbars above tables (filters, selects, Refresh) use `flex-wrap gap-2`.
- **Dialogs (FR18):** the user modal (`AdminDashboard.jsx`), the password modal (`Dashboard.jsx`), `TopUpModal.jsx` and the Route modal (`RoutesPricing.jsx`) use `max-h-[90dvh] overflow-y-auto`, with `90vh` as a fallback for older browsers. On phones the overlay aligns them to the top (`items-start sm:items-center`) so the on-screen keyboard doesn't cover the primary button. Footer button rows use `flex-wrap`.
- **Login card:**
  - `aspect-[4/5] max-h-[600px]` cuts off the registration side (6 fields) on short phones. On phones, use `min-h` with the height set by the content, and keep the aspect ratio from `sm:` up.
  - The 3D flip stays. Both faces already scroll with `overflow-y-auto`, so make sure the back face scrolls too.
- **Reduced motion (FR21):**
  - Wrap the app in Framer Motion's `<MotionConfig reducedMotion="user">` in `main.jsx`.
  - In `Dashboard.jsx` the hero `<video>` doesn't autoplay when `prefers-reduced-motion: reduce` or `navigator.connection?.saveData` is set, and offline it shows a static gradient. Add `preload="metadata"`. The hero height drops to `h-[220px]` on phones.
  - Remove the `animate-pulse` dots under reduced motion with Tailwind's `motion-safe:` variant.
- **Touch targets and keyboards (FR19):**
  - Interactive controls get at least 44px height on phones. In practice: text buttons such as "Dismiss", "Refresh" and "Close" get `py-2 px-3 min-h-[44px] sm:min-h-0`, and icon buttons get at least `p-2.5`.
  - `RfidTerminal.jsx` user id: add `inputMode="numeric"`. `RoutesPricing.jsx` fare: `inputMode="decimal"`. Email and phone fields already use `type="email"` and `type="tel"`. `TopUpModal` already uses `inputMode="numeric"`.
- **Palette:** new UI uses only `rail-blue`, `rail-dark`, `rail-red`, slate, and the existing green/amber status colours. No purple.

## Files to Modify / Files to Create

**To Modify**
- `frontend/package.json`: add `vite-plugin-pwa` and `workbox-window` (deps), `@vite-pwa/assets-generator` (devDep), and a `generate-pwa-assets` script.
- `frontend/vite.config.js`: register `VitePWA({...})` with the manifest (name "SmartRail Sri Lanka - Digital Ticketing", short_name "SmartRail", description, `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `orientation: 'portrait'`, `theme_color: '#0F172A'`, `background_color: '#ffffff'`, and icons 64, 192 and 512 plus a maskable 512) and the Workbox options from §1.
- `frontend/index.html`:
  - Replace the broken `/vite.svg` icon with `/favicon.ico` and `/logo.svg`, and drop the manual manifest link (the plugin injects it).
  - Add `theme-color`, `apple-touch-icon` (180), `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` (`black-translucent`), `apple-mobile-web-app-title` and `description`.
  - Use the `viewport-fit=cover` viewport.
- `frontend/src/main.jsx`: wrap in `MotionConfig reducedMotion="user"`.
- `frontend/src/App.jsx`: mount `UpdatePrompt`.
- `frontend/src/api.js`:
  - Add the offline request guard and network-error flagging (§2).
  - `clearSession()` also clears the snapshots, and `setSession({ token })` purges other users' snapshots (§3).
- `frontend/src/components/RequireAuth.jsx`: the offline status flow and `SessionStatusContext` (§4).
- `frontend/src/pages/Dashboard.jsx`:
  - Write and read the snapshot, show `OfflineBanner`, disable Top-up and password change offline.
  - Defer the PayHere return handler until online.
  - Mount `InstallPrompt`.
  - Hero video behaviour, safe areas, touch targets.
- `frontend/src/pages/Routes.jsx`: snapshot for Routes, offline state for the Live tracking board, pause polling offline, safe-area nav.
- `frontend/src/pages/AdminDashboard.jsx`: mobile drawer, menu button, padding, live online pill, offline panel, user modal sizing.
- `frontend/src/pages/Login.jsx`: mobile card sizing, offline-disabled submit, `InstallPrompt`.
- `frontend/src/components/TopUpModal.jsx`: dialog sizing.
- `frontend/src/components/admin/PaymentsPanel.jsx`, `RfidTerminal.jsx` and `CardsDevices.jsx`: table wrappers, wrapping toolbars, `inputMode`, offline error message.
- `frontend/src/components/admin/RoutesPricing.jsx`: dialog sizing, `inputMode="decimal"`.
- `frontend/src/index.css`: safe-area utilities, and a `dvh` modal max-height helper if repeated.
- `CLAUDE.md`:
  - Update the PWA line (manifest now generated by vite-plugin-pwa, `public/manifest.json` removed).
  - Add the offline snapshot and service-worker notes and the mobile HTTPS testing steps from §8.
- `smartrail-ticketing.md`: note that PWA installability, offline viewing and mobile layouts are now delivered under Phase 5.
- `backend/.env.example`: comment next to `FRONTEND_URL` saying it must be the public HTTPS frontend origin when testing on a phone.

**To Create**
- `frontend/public/logo.svg`: the SmartRail brand mark (train glyph in `#00529B` on white, with safe padding for maskable icons). It's the source for the generated icons.
- `frontend/pwa-assets.config.js`: `@vite-pwa/assets-generator` preset (`minimal-2023`) pointing at `public/logo.svg`. Generated and committed into `public/`: `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`.
- `frontend/public/offline.html`: static branded fallback page (inline styles, rail palette, "SmartRail needs a connection for first use / this page").
- `frontend/src/lib/network.js`: offline flag emitter and `isOfflineError(err)` helper.
- `frontend/src/lib/offlineCache.js`: `saveSnapshot(userId, slice, data)`, `loadSnapshot(userId)`, `clearSnapshots({ exceptUserId })`.
- `frontend/src/hooks/useOnlineStatus.js`: returns `isOnline`.
- `frontend/src/components/OfflineBanner.jsx`: "You're offline. Showing data from <time>." strip (slate/amber, safe-area aware).
- `frontend/src/components/UpdatePrompt.jsx`: new-version toast (§6).
- `frontend/src/components/InstallPrompt.jsx`: install button / iOS hint (§7).

**To Delete**
- `frontend/public/manifest.json`: replaced by the generated `manifest.webmanifest`. It pointed at a missing `favicon.ico`.

**Left Unchanged**
- `backend/**` code: no endpoint, schema or auth changes. Fares, taps, Top-up settlement and PayHere signing stay as they are.
- `frontend/tailwind.config.js` palette, fonts and radii. No visual redesign.
- PayHere hosted checkout and the `?topup=&id=` return contract.

## Build Order

| Phase | Owner | Work |
|-------|-------|------|
| 0 | Frontend | Add the dependencies, `logo.svg` and the assets-generator config. Generate the icons and `favicon.ico`. Delete `public/manifest.json`. |
| 1 | Frontend | `vite.config.js` VitePWA manifest and Workbox config, `index.html` meta/iOS tags, `offline.html`. Check that `npm run build` emits `sw.js` and `manifest.webmanifest` and that Lighthouse reports the app installable. |
| 2 | Frontend | `network.js`, `useOnlineStatus`, the axios offline guard, `offlineCache.js`, and the `clearSession`/`setSession` snapshot clean-up. |
| 3 | Frontend | `RequireAuth` offline status and context, revalidation on reconnect. |
| 4 | Frontend | Page offline behaviour: Dashboard snapshot and disabled actions, deferred PayHere return, Routes snapshot and board offline state, Admin offline panel and live pill, Login offline submit. |
| 5 | Frontend | `UpdatePrompt` and `InstallPrompt` (Android/desktop and iOS hint), mounted in App, Login and Dashboard. |
| 6 | Frontend | Responsive pass: Admin drawer, padding, table wrappers, toolbars, dialogs, Login card, safe areas, touch targets, `inputMode`. |
| 7 | Frontend | Motion and performance polish: `MotionConfig`, hero video rules, `motion-safe` pulses. Final no-purple review. |
| 8 | Frontend | Documentation: `CLAUDE.md`, `smartrail-ticketing.md`, `backend/.env.example` comment. |

## Manual Verification Plan

There's no test suite (`frontend/package.json` has no test script), so verification is manual. Run the backend (`cd backend && npm start`). For the service-worker steps, run `cd frontend && npm run build && npm run preview` (http://localhost:4173), because `npm run dev` doesn't register the service worker.

1. **Build output:** `npm run build` succeeds, and `frontend/dist` contains `sw.js`, `workbox-*.js`, `manifest.webmanifest`, the icons and `offline.html`. The precache list in `sw.js` doesn't contain `edit.mp4`.
2. **Installability (desktop):** open http://localhost:4173 in Chrome.
   - DevTools → Application → Manifest shows name, short name, 192/512 icons, a maskable icon and no errors.
   - The Service Workers panel shows `sw.js` activated.
   - Lighthouse (PWA/installability) passes.
   - The address-bar install icon appears. Installing opens a standalone window with the SmartRail icon and the `#0F172A` title bar.
3. **Install offer:** on `/login`, the "Install SmartRail" button appears and clicking it opens the browser's install dialog. Dismissing hides it, and it stays hidden after a reload. Clearing `installDismissedAt` brings it back. It isn't shown inside the installed window.
4. **Offline Passenger:**
   - Log in as `nirmal` / `user123`. The dashboard loads balance, history and trips. Open `/routes` once.
   - DevTools → Network → Offline, then reload `/dashboard`. The shell renders, `OfflineBanner` shows "last updated <time>", and the last-known balance, history and trips appear.
   - "Top Up" and "Change password" are disabled.
   - Navigate to `/routes`: Routes and Fares show from the snapshot, and the Live tracking board says "Offline, positions unavailable".
5. **Offline mutation guard:** while offline, trigger a mutation from the console (or re-enable a button in DevTools and submit). The request is refused with "You're offline…", and the Network tab shows no outgoing request.
6. **Reconnect:** switch Network back to Online without reloading. The banner disappears, `/api/me` is called, and the balance and history refresh.
7. **Session revoked while offline:**
   - Go offline as `nirmal`.
   - In another browser profile, log in as `admin` / `admin_rail_2024` and deactivate `nirmal`.
   - Go back online in the first profile. The user is redirected to `/login` with the session-expired message, and localStorage has no `offline:*` key.
   - Reactivate `nirmal` afterwards.
8. **Sign-out clears data:** log in as `nirmal`, load the dashboard, then sign out. localStorage has no `offline:*`, `user` or `token`. Go offline and open `/dashboard`: it redirects to `/login` with no Passenger data visible.
9. **Shared device:**
   - Log in as `nirmal` and load the dashboard. Without signing out, clear `token` and log in as a second Passenger registered on `/login`.
   - Only the new user's `offline:<id>` key exists. Going offline shows only the second user's data.
10. **Admin offline:** log in as `admin` and go offline. Every tab shows "Admin tools need a connection", the sidebar pill reads OFFLINE, and no Admin data is in localStorage.
11. **Update flow:**
    - With the installed or preview app open, change a visible string and run `npm run build` again. Keep `preview` running, or restart it.
    - Within a reload or the 60-minute check (force it with DevTools → Application → Service Workers → Update), the "New version available" toast appears. Refresh loads the new version.
    - "Later", then closing every window and reopening, also shows the new version.
12. **Mobile layout:** in DevTools device mode at 360×740 (and 320×640, plus landscape), check `/login` (both card faces, registration fully reachable), `/dashboard`, `/routes` and every Admin tab:
    - `document.documentElement.scrollWidth === innerWidth`, so there's no sideways page scrolling.
    - The Admin menu button opens the drawer, the backdrop and section buttons close it, and every section is reachable.
    - Admin tables scroll sideways inside their card, and the card header stays fixed.
    - The Top-up, password, user and Route dialogs fit and scroll, and their buttons stay reachable.
13. **Keyboards:** on a real phone, or a device-mode keyboard hint, the Top-up amount and RFID user id fields open a numeric keyboard, the Route fare opens a decimal keyboard, email fields an email keyboard, and phone fields a phone keyboard.
14. **Reduced motion:** enable "Emulate CSS prefers-reduced-motion: reduce" in DevTools Rendering. The Login flip and page transitions don't animate, the hero video doesn't autoplay, and the pulse dots are static.
15. **Real phone over HTTPS (§8):**
    - Tunnel the preview and backend, rebuild with `VITE_API_URL` set to the backend tunnel, and set `FRONTEND_URL` to the frontend tunnel.
    - On Android Chrome, install from the menu. On iPhone Safari, Share → Add to Home Screen.
    - The app launches full screen, and content clears the notch and home indicator.
    - Top up Rs. 500 through the PayHere sandbox and return. The installed app (or Safari on iOS) shows the success notice, and the updated Balance appears in the installed app.
16. **Regression:** on desktop at full width, both demo logins work. Admin user management, Routes & Pricing, the RFID simulator, Payments and Readers & Cards behave as before, and the sidebar is permanently visible from `md` up.

## Verification

1. `cd frontend && npm install && npm run build` completes without errors, and `dist/sw.js` and `dist/manifest.webmanifest` exist.
2. `npm run preview` → http://localhost:4173. Chrome DevTools Application tab: manifest valid, service worker activated. Lighthouse installability passes.
3. `nirmal` / `user123`: offline reload of `/dashboard` shows the last-known Balance and Transactions with a "last updated" time. Top-up is disabled.
4. Back online, data refreshes automatically. Sign out, and no `offline:*` keys remain.
5. `admin` / `admin_rail_2024` at 360px width: the menu button opens the drawer, every section is reachable, and there's no sideways page scrolling.
6. A rebuilt deploy shows the "New version available" toast in an already-open app.
7. On a real Android phone and iPhone over an HTTPS tunnel, the app installs to the home screen and launches standalone with the SmartRail icon. A sandbox Top-up completes and the Balance updates.
8. No purple anywhere in the new install, offline, update or menu UI.

## Critical Files

| File | Why |
|------|-----|
| `frontend/vite.config.js` | Service worker, precache, navigation fallback and manifest. Gets installability and offline shell right or wrong. |
| `frontend/index.html` | iOS install meta tags, theme colour, viewport with safe areas, fixed icon links. |
| `frontend/src/components/RequireAuth.jsx` | Must not log users out when offline, must still revoke on reconnect. |
| `frontend/src/api.js` | Offline mutation guard, and snapshot clean-up on every sign-out and login path. |
| `frontend/src/lib/offlineCache.js` | The only place personal data persists on the device. Scoping and clearing live here. |
| `frontend/src/pages/Dashboard.jsx` | Main Passenger offline experience and the PayHere return flow. |
| `frontend/src/pages/AdminDashboard.jsx` | The mobile drawer, currently unreachable on phones. |
| `frontend/src/components/UpdatePrompt.jsx` | Keeps installed copies from running stale versions. |

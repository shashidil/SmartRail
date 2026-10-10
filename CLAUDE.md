# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SmartRail Sri Lanka: a smart-card (RFID) train ticketing demo. Two independent npm projects with no shared root package: `backend/` (Express API) and `frontend/` (React + Vite + Tailwind PWA). There is no test suite.

## Commands

Backend (port 5000, override with `PORT` in `backend/.env`):
```bash
cd backend && npm install
npm start        # node server.js
npm run dev      # nodemon, auto-restart
```

Frontend:
```bash
cd frontend && npm install
npm run dev      # Vite dev server
npm run build    # production build to frontend/dist
npm run preview
```
`npm run lint` is defined, but ESLint isn't installed as a dependency and there's no ESLint config, so it won't run until both are added.

Both servers must be running for the app to work (`backend/.env` needs `DATABASE_URL` and `JWT_SECRET`). Demo logins: passenger `nirmal` / `user123`, admin `admin` / `admin_rail_2024`.

## Architecture

**Backend (`backend/server.js`, ESM).** All routes live in `server.js`; database code lives in `backend/db/`. Persistence is PostgreSQL, configured by `DATABASE_URL` in `backend/.env` (gitignored; copy `backend/.env.example`). On startup `db/init.js` applies `db/schema.sql` (idempotent) and, if `users` is empty, seeds 2 users and 9 railway lines from `db/seed.js`. The server exits if the database is unreachable. Top-up and tap each run in one DB transaction (conditional `UPDATE` on the balance plus the ledger `INSERT`), so concurrent requests can't lose a balance change. To reset, drop and recreate the database. To carry over an old `backend/data.json`, run `npm run db:import` against an empty database before the first server start; it refuses to run on a non-empty one. Authentication: passwords are bcrypt-hashed (`users.password_hash`; a legacy plaintext `password` column is converted and dropped on first start). Login/register return a JWT (`JWT_SECRET` required in `backend/.env`, lifetime `JWT_EXPIRES_IN`, default 8h) sent as `Authorization: Bearer`. `middleware/auth.js` (`requireAuth`, `requireRole`) re-reads the user row on every request, so deactivation, deletion, role change and password change/reset (which bump `users.token_version`) revoke tokens immediately. Login is throttled in memory (5 failures per username → 15 min block, 429). `lowdb` is listed in `package.json` but unused. Password rule (new/changed passwords only): 8+ chars with a letter and a number.

Endpoints (all except register/login need a Bearer token): `POST /api/register`, `POST /api/login` (401 generic message, 429 when throttled), `GET /api/me`, `PUT /api/me/password`, `GET /api/history/:userId` (last 10; Passengers only their own), `GET /api/routes`, `PUT /api/routes/:id` (admin; `baseFare`/`perKm`), `POST /api/topup` (passenger, own card only; body `amount`), `POST /api/rfid/tap` (admin; debit; 402 when the balance is too low, 403 for a deactivated card). Admin user management lives in `routes/users.js` under `/api/users`: `GET` (`?search=&role=`), `POST`, `PUT /:id` (username/role), `PUT /:id/status`, `POST /:id/reset-password`, `DELETE /:id` (anonymising soft delete, only when balance is 0). Admins cannot deactivate/delete/demote themselves or the last active admin. The tap endpoint is the bridge for future Arduino/ESP32 hardware (device authentication is not designed yet); the admin dashboard simulates taps through it.

Data shapes: users have `{id, username, role: 'user'|'admin', balance, status: 'active'|'deactivated'|'deleted', fullName, phone, nic, email, createdAt}` (contact fields are required at Passenger registration, optional for seeded/Admin-created accounts, unique for email and NIC, and cleared on delete; validation lives in `backend/lib/profile.js`) (the hash is never returned). Transactions have `{id, userId, type: 'credit'|'debit', title, amount, date}`, where `date` is a display string formatted from the stored `created_at` timestamp. `amount` for top-up and tap must be a number > 0 (else 400). Routes have `{id, name, stations, baseFare, perKm, totalKm}`.

**Frontend (`frontend/src`).** `main.jsx` wraps the app in `BrowserRouter`, and `App.jsx` maps `/login`, `/dashboard` (passenger), `/admin` and `/routes` (live tracking board). Each page is a self-contained component in `src/pages/`. There's no shared API client, context or store:
- API calls go through `src/api.js` (axios instance; base URL `VITE_API_URL`, default `http://localhost:5000`). It attaches the Bearer token and, on any 401 from a protected call, clears the session and redirects to `/login` with a flash message. Session helpers (`setSession`, `clearSession`, `getStoredUser`) live there too.
- Session state is `localStorage` keys `user` (JSON) and `token`. `components/RequireAuth.jsx` wraps `/dashboard` (role `user`), `/admin` (role `admin`) and `/routes`; it confirms the session with `GET /api/me` before rendering, so editing `localStorage` doesn't grant access. After a top-up, `Dashboard` writes the new balance back into the `user` object.
- `Routes.jsx` uses a hardcoded train list and animates train status client-side with `setInterval`. It doesn't call the backend.

**Styling.** Tailwind with a custom `rail` palette (`rail-blue`, `rail-red`, `rail-dark`, `rail-muted`), `outfit`/`inter` font families, and tightened border radii, all set in `frontend/tailwind.config.js`. Animations use Framer Motion, and icons come from lucide-react. The project's design notes (`smartrail-ticketing.md`) call for a strict "no purple" palette. PWA metadata is in `frontend/public/manifest.json`.

## Project notes

`smartrail-ticketing.md` tracks the project's status and roadmap. Next up are Phase 6 (connecting physical Arduino/ESP32 RFID hardware) and Phase 7 (a native mobile app shell). `smart train ticketing system.zip` is an archived artifact and isn't used by the build.

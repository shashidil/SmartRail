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

Both servers must be running for the app to work. Demo logins: passenger `nirmal` / `user123`, admin `admin` / `admin_rail_2024`.

## Architecture

**Backend (`backend/server.js`, ESM).** All routes live in `server.js`; database code lives in `backend/db/`. Persistence is PostgreSQL, configured by `DATABASE_URL` in `backend/.env` (gitignored; copy `backend/.env.example`). On startup `db/init.js` applies `db/schema.sql` (idempotent) and, if `users` is empty, seeds 2 users and 9 railway lines from `db/seed.js`. The server exits if the database is unreachable. Top-up and tap each run in one DB transaction (conditional `UPDATE` on the balance plus the ledger `INSERT`), so concurrent requests can't lose a balance change. To reset, drop and recreate the database. To carry over an old `backend/data.json`, run `npm run db:import` against an empty database before the first server start; it refuses to run on a non-empty one. `lowdb`, `bcryptjs` and `jsonwebtoken` are listed in `package.json` but aren't used: passwords are stored in plaintext, and the returned "token" is a random placeholder that's never verified. No endpoint requires authentication.

Endpoints: `POST /api/register`, `POST /api/login`, `GET /api/history/:userId` (last 10 transactions), `GET /api/users` (passengers only, without passwords), `GET /api/routes`, `PUT /api/routes/:id` (updates `baseFare`/`perKm`), `POST /api/topup` (credit), `POST /api/rfid/tap` (debit; returns 402 when the balance is too low). The tap endpoint is meant as the bridge for future Arduino/ESP32 RFID hardware, and the admin dashboard currently simulates taps through it.

Data shapes: users have `{id, username, password, role: 'user'|'admin', balance}`. Transactions have `{id, userId, type: 'credit'|'debit', title, amount, date}`, where `date` is a display string formatted from the stored `created_at` timestamp. `amount` for top-up and tap must be a number > 0 (else 400). Routes have `{id, name, stations, baseFare, perKm, totalKm}`.

**Frontend (`frontend/src`).** `main.jsx` wraps the app in `BrowserRouter`, and `App.jsx` maps `/login`, `/dashboard` (passenger), `/admin` and `/routes` (live tracking board). Each page is a self-contained component in `src/pages/`. There's no shared API client, context or store:
- API calls use `axios` with the URL `http://localhost:5000` hardcoded in every page. If you change the backend host or port, update every page that calls the API.
- Session state is `localStorage` keys `user` (JSON) and `token`. Pages read `user` on mount and redirect to `/login` if it's missing. `AdminDashboard` also checks `role === 'admin'`. After a top-up, `Dashboard` writes the new balance back into the `user` object in `localStorage`.
- `Routes.jsx` uses a hardcoded train list and animates train status client-side with `setInterval`. It doesn't call the backend.

**Styling.** Tailwind with a custom `rail` palette (`rail-blue`, `rail-red`, `rail-dark`, `rail-muted`), `outfit`/`inter` font families, and tightened border radii, all set in `frontend/tailwind.config.js`. Animations use Framer Motion, and icons come from lucide-react. The project's design notes (`smartrail-ticketing.md`) call for a strict "no purple" palette. PWA metadata is in `frontend/public/manifest.json`.

## Project notes

`smartrail-ticketing.md` tracks the project's status and roadmap. Next up are Phase 6 (connecting physical Arduino/ESP32 RFID hardware) and Phase 7 (a native mobile app shell). `smart train ticketing system.zip` is an archived artifact and isn't used by the build.

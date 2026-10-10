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

**Backend (`backend/server.js`, single file, ESM).** All routes live in this one file. Persistence is a plain JSON file, `backend/data.json`, which is gitignored and created with seed data (2 users, 9 railway lines) by `initDB()` the first time the server starts. Every request calls `getData()` to read the whole file and `saveData()` to write it back, so there's no locking and no in-memory cache. Delete `data.json` to reset to the seed state. `lowdb`, `bcryptjs` and `jsonwebtoken` are listed in `package.json` but aren't used: passwords are stored in plaintext, and the returned "token" is a random placeholder that's never verified. No endpoint requires authentication.

Endpoints: `POST /api/register`, `POST /api/login`, `GET /api/history/:userId` (last 10 transactions), `GET /api/users` (passengers only, without passwords), `GET /api/routes`, `PUT /api/routes/:id` (updates `baseFare`/`perKm`), `POST /api/topup` (credit), `POST /api/rfid/tap` (debit; returns 402 when the balance is too low). The tap endpoint is meant as the bridge for future Arduino/ESP32 RFID hardware, and the admin dashboard currently simulates taps through it.

Data shapes: users have `{id, username, password, role: 'user'|'admin', balance}`. Transactions have `{id: Date.now(), userId, type: 'credit'|'debit', title, amount, date}`, where `date` is a preformatted display string. Routes have `{id, name, stations, baseFare, perKm, totalKm}`.

**Frontend (`frontend/src`).** `main.jsx` wraps the app in `BrowserRouter`, and `App.jsx` maps `/login`, `/dashboard` (passenger), `/admin` and `/routes` (live tracking board). Each page is a self-contained component in `src/pages/`. There's no shared API client, context or store:
- API calls use `axios` with the URL `http://localhost:5000` hardcoded in every page. If you change the backend host or port, update every page that calls the API.
- Session state is `localStorage` keys `user` (JSON) and `token`. Pages read `user` on mount and redirect to `/login` if it's missing. `AdminDashboard` also checks `role === 'admin'`. After a top-up, `Dashboard` writes the new balance back into the `user` object in `localStorage`.
- `Routes.jsx` uses a hardcoded train list and animates train status client-side with `setInterval`. It doesn't call the backend.

**Styling.** Tailwind with a custom `rail` palette (`rail-blue`, `rail-red`, `rail-dark`, `rail-muted`), `outfit`/`inter` font families, and tightened border radii, all set in `frontend/tailwind.config.js`. Animations use Framer Motion, and icons come from lucide-react. The project's design notes (`smartrail-ticketing.md`) call for a strict "no purple" palette. PWA metadata is in `frontend/public/manifest.json`.

## Project notes

`smartrail-ticketing.md` tracks the project's status and roadmap. Next up are Phase 6 (connecting physical Arduino/ESP32 RFID hardware) and Phase 7 (a native mobile app shell). `smart train ticketing system.zip` is an archived artifact and isn't used by the build.

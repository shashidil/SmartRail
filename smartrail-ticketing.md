# 🚆 Project Status: SmartRail Ticketing System

## 📜 Overview
SmartRail is a premium, PWA-certified smart card ticketing system for Sri Lanka Railways. This system integrates a persistent Node.js backend with a "Gallery Minimalist" React frontend, supporting real-time train tracking across 9 major railway lines and physical-hardware emulation.

## 🏗️ Technical Architecture
- **Tech Stack:** React (Vite) + Node.js (ESM) + Tailwind CSS + Framer Motion.
- **Persistence:** JSON File-based DB (`data.json`) for zero-loss server restarts.
- **PWA Ready:** Manifest and icons configured for "Home Screen" installation.
- **Hardware Bridge:** Dedicated RFID Tap API ready for Arduino/NodeMCU integration.

## ✅ Current System Capabilities
- [x] **Persistence:** Real-time saving of balances, users, and transaction logs.
- [x] **Full 9-Line Network:** Includes all official SLR lines (Main, Coast, Northern, Kelani Valley, etc.) with precise KM markers.
- [x] **Live Tracking Board:** Simulated movement and status updates for iconic trains like Udarata Menike and Yal Devi.
- [x] **Admin Tooling:** Dynamic pricing updates, user management, and RFID simulation.
- [x] **Transaction Ledger:** Automated receipt generation for every top-up and tap.
- [x] **UX Excellence:** 3D animated login, responsive layouts, and strict "Maestro" design (No-Purple).

## 📊 Database Schema (SLR Official KM)
| Line Name | Origin-Destination (KM) | Distance |
| :--- | :--- | :--- |
| **Main Line** | Colombo Fort (0) - Badulla (290) | 290 km |
| **Coast Line** | Colombo Fort (0) - Beliatta (187) | 187 km |
| **Northern Line** | Polgahawela (72) - KKS (411) | 339 km |
| **Kelani Valley** | Maradana (2) - Avissawella (59) | 57 km |
| **Puttalam Line** | Ragama (13) - Puttalam (133) | 120 km |

## 🛠️ Access Credentials
- **Passenger:** `nirmal` / `user123`
- **Administrator:** `admin` / `admin_rail_2024`

## 📅 Maintenance & Roadmap
- [x] **Phase 1-4:** Foundation, Design System, Auth, and Dashboards (DONE).
- [x] **Phase 5:** Database Persistence & PWA Conversion (DONE).
- [ ] **Phase 6:** Physical Arduino/ESP32 Hardware Connection.
- [ ] **Phase 7:** Passenger Mobile App (Native Shell).

---
*Updated based on Sri Lanka Railways official network maps and 2026 technical requirements.*

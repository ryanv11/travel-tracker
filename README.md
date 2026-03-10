# Travel Tracker

A personal travel tracking desktop app. Log trips, places, and items (restaurants, hotels, flights, experiences, and more), and view your travel history on an interactive world map with country and region shading.

---

## Setup

**Prerequisites:** Node.js 18+, npm

```bash
npm ci
```

> **Important:** Always run `npm ci` inside the environment where you will run the app. If you cloned the repo on macOS and are running in a Linux devcontainer (or vice versa), run `npm ci` again inside the container so native binaries (esbuild, libsql) match the platform.

### Database initialisation (first run)

```bash
npm run db:push    # Apply schema to a fresh SQLite file
npm run db:seed    # Populate default data (countries, shading config, etc.)
```

The database file path is set via `.env.local`:

```
DB_TYPE=sqlite
SQLITE_PATH=./data/travel-tracker.db
```

---

## Running the app (beta — localhost in browser)

Open two terminals:

```bash
# Terminal 1 — Backend API
npm run dev:api    # → http://localhost:3001

# Terminal 2 — Frontend
npm run dev        # → http://localhost:5173
```

Open `http://localhost:5173` in your browser.

---

## Data storage — important constraints

Travel Tracker stores all data in a **local SQLite file** (`.db`). This has two implications you should be aware of before use:

### OneDrive / cloud sync

The database file **can** be placed inside an OneDrive-synced folder for personal backup and to access your data across your own devices. However:

- **Only one device should have the app running at a time.** SQLite does not support concurrent write access from multiple machines. If two devices write simultaneously via a synced folder, the database will corrupt.
- OneDrive sync is for **backup and single-user roaming** only — not real-time multi-device sync.
- Before opening the app on a second device, ensure OneDrive has fully synced the latest database file from the first device, and that the first device is not actively running the app.

### Multi-user access

Multi-user access (trip companions, shared trips) is out of scope for this version. The app is designed for a single owner. A future hosted version will support multi-user access with proper concurrency controls.

---

## Testing

```bash
npm run test:backend        # Backend unit tests
npm run test:frontend       # Frontend unit tests
npm run test:contract       # Contract tests (requires backend running on :3001)
npm run type:check          # TypeScript type check (frontend)
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TanStack Query v5, MapLibre GL JS |
| Backend | Node.js, Express, TypeScript |
| ORM | Drizzle ORM |
| Database | SQLite via @libsql/client (PostgreSQL-ready — config change only) |
| Map data | Natural Earth GeoJSON (bundled — no internet required for boundaries) |
| Geocoding | OpenStreetMap Nominatim (online; queued and retried offline) |

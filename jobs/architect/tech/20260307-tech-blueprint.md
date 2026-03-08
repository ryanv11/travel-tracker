# Travel Tracker — Technology Blueprint
**Version:** 1.0
**Date:** 2026-03-07
**Author:** Architect
**Status:** Approved — implement from this document

---

## Hard Constraints (Non-Negotiable)

| ID | Constraint |
|----|------------|
| NF-01 | Local Mac app — no internet for core features |
| NF-02 | Map tiles require internet |
| NF-03 | SQLite for local storage |
| NF-04 | SQLite file storable on OneDrive |
| NF-05 | Migrate to hosted web app without a rebuild |
| NF-06 | Migrate to iOS without a rebuild |
| NF-07 | Future trip companion access without structural changes |
| NF-08 | Future notification engine without structural changes |
| OQ-02 | Target: packaged .app (Electron). Localhost-in-browser acceptable for beta. Same code in both modes. |

**The central architectural principle:** the tech stack must make the migration from local to hosted a deployment change, not a code change. This is testable — if migrating requires modifying any source file, the architecture has failed this constraint.

---

## 1. Technology Stack

### 1.1 Language Ecosystem

**Decision: TypeScript throughout — Node.js backend, React frontend.**

Single language across the entire stack provides:
- Shared type definitions between BACKEND and FRONTEND (trip, place, item types)
- Single toolchain (npm, Vite, tsc)
- Natural fit for Electron (which runs Node.js natively)
- No subprocess complexity for desktop packaging

Python was considered. Rejected because packaging a Python process inside Electron adds operational complexity (subprocess management, binary distribution), whereas a Node.js backend runs natively inside Electron's main process.

---

### 1.2 Database

**Production (Phase 1):** SQLite via `better-sqlite3`
**Production (Phase 2+):** PostgreSQL via `node-postgres` (`pg`)
**ORM:** Drizzle ORM

```
SQLite  ──► Drizzle ORM ──► Express API ──► React Frontend
PostgreSQL ──► (same Drizzle schema) ──► (same Express API) ──► (same React Frontend)
```

**Why Drizzle ORM:**
- Schema defined in TypeScript — single source of truth, not duplicated in SQL files
- `drizzle-kit` handles migrations (fulfils Shared Standard 4: no manual schema edits)
- Identical query API across SQLite and PostgreSQL — migration is a connection string change
- Lightweight, no "magic" — queries are transparent SQL with type safety
- Actively maintained, purpose-built for this exact SQLite→PostgreSQL migration pattern

**Migration from SQLite to PostgreSQL (Phase 2):**
1. Change `DB_TYPE` environment variable from `sqlite` to `postgres`
2. Set `DATABASE_URL` to the hosted PostgreSQL connection string
3. Run `drizzle-kit push` to apply schema to the new database
4. Import data (one-time migration script — DATABASE to write)
5. No source code changes

**OneDrive sync (NF-04):** Set `SQLITE_PATH` environment variable to the OneDrive folder path. The app reads this on startup. Simultaneous writes from multiple devices are not supported (and not required for MVP per BRD Assumptions).

---

### 1.3 Backend

**Framework: Express.js + TypeScript**

- Runs as a standard Node.js HTTP server on any port (`PORT` env variable, default 3001)
- Identical whether running inside Electron (main process) or deployed to a cloud server
- REST API (not GraphQL — see ADL-05)
- All business logic lives here: shading state computation, geocoding queue, item carry-forward, trip status transitions, locked-trip enforcement

**API structure:**

```
GET    /api/trips                    list trips (filterable)
POST   /api/trips                    create trip
GET    /api/trips/:id                get trip with places and items
PATCH  /api/trips/:id                update trip fields
PATCH  /api/trips/:id/lock           lock trip (RV-04)
PATCH  /api/trips/:id/unlock         unlock trip (TR-07)

GET    /api/trips/:id/places         list places for trip
POST   /api/trips/:id/places         add place to trip
DELETE /api/trips/:id/places/:placeId

GET    /api/trips/:id/items          list items for trip (with type-specific fields)
POST   /api/trips/:id/items          create item
PATCH  /api/trips/:id/items/:itemId  update item
DELETE /api/trips/:id/items/:itemId

GET    /api/cities                   search cities (local DB first, then Nominatim)
GET    /api/cities/:id/carry-forward list Next time items for carry-forward prompt (IT-07)
GET    /api/cities/:id/items         all completed items at a city across all trips (IT-09)

GET    /api/map/shading              all country shading states (bulk query, map load)
GET    /api/map/shading/regions/:countryCode   region shading for one country

GET    /api/admin/categories         }
POST   /api/admin/categories         }
PATCH  /api/admin/categories/:id     } admin panel endpoints
DELETE /api/admin/categories/:id     } (soft-delete = set is_active=0)
                                     } (repeat pattern for activities, companions,
                                     } map_shading_config, country_config)
```

**Geocoding service** (BACKEND component, not an endpoint):
- On app startup: scan cities where `geocode_status = 'pending'`, attempt Nominatim resolution for each
- On new city creation: if internet available, resolve immediately and set `geocode_status = 'resolved'`; if not, create with `geocode_status = 'pending'`
- Network detection: attempt a HEAD request to `nominatim.openstreetmap.org` before each geocoding attempt; catch network errors gracefully
- Retry policy: attempt every app startup, and on a 15-minute interval while the app is running; do not surface failures to the user (GE-12)
- Nominatim compliance: set a descriptive `User-Agent` header (e.g. `TravelTracker/1.0 (personal-app)`); respect 1 request/second rate limit; cache results permanently (already satisfied by storing in cities table)

---

### 1.4 Frontend

**Framework: React 18 + TypeScript + Vite**

- Standard single-page application (SPA)
- `VITE_API_BASE_URL` environment variable controls API endpoint:
  - Local: `http://localhost:3001`
  - Hosted: `https://your-domain.com`
  - iOS: `https://your-domain.com` (same hosted backend)
- Build produces static files (`dist/`) that work in any browser or WebView
- The FRONTEND never contains environment-specific code — only the env variable changes

**State management:** React Query (TanStack Query) for server state. No Redux needed for a single-user app of this complexity. React Query handles caching, refetching, and optimistic updates cleanly.

**Key UI components (for FRONTEND reference):**
- `MapView` — MapLibre GL JS integration (see §2)
- `TripList` / `TripDetail` — trip management views
- `ItemList` — item management with sort/filter (IT-08, IT-09)
- `PostTripReview` — guided review workflow (RV-01 through RV-04)
- `CarryForwardPrompt` — modal for Next time item suggestions (IT-07)
- `AdminPanel` — tabbed admin interface for all managed lists

---

### 1.5 Desktop Packaging

**For beta phase:** No packaging. BACKEND runs via `npm run dev` (or a permanent launchd service on macOS). User opens `http://localhost:3001` in their browser.

**For release:** **Electron**

**Why Electron over Tauri:**
- Tauri's backend is Rust. This would require either rewriting the Express API in Rust or running it as a sidecar subprocess — both add complexity and break the "same code" constraint.
- Electron runs Node.js natively. The Express server runs directly in Electron's main process. Zero code change.
- Electron's size (~150MB) is acceptable for a personal desktop app.
- Tauri's size advantage (~5MB) is irrelevant for a personal-use tool not distributed to others.

**Electron architecture:**

```
Electron Main Process (Node.js)
    ├── starts Express server on localhost:3001
    ├── opens BrowserWindow pointing to http://localhost:3001
    └── handles app lifecycle (quit, minimize, etc.)

Express Server (same code as standalone)
    └── serves REST API

React Frontend (pre-built static files)
    └── served by Express at GET /
        (or directly as file:// — Express serving is preferred for consistency)
```

The Express server in Electron is started by the main process and is identical to the server started by `npm start`. There is no Electron-specific code in Express or React.

**Beta → Release transition:** Add Electron wrapper. No other change.

**Release → Hosted transition:** Remove Electron wrapper. Deploy Express server to cloud. Point `VITE_API_BASE_URL` to hosted URL. Rebuild React. That is the entire migration.

---

## 2. Mapping Library

**Decision: MapLibre GL JS**

### 2.1 Evaluation

| Library | Vector tiles | Choropleth quality | Cost | Verdict |
|---------|-------------|-------------------|------|---------|
| MapLibre GL JS | Yes | Excellent (WebGL) | Free (OSS) | **Selected** |
| Leaflet.js + OSM | No (raster) | Good | Free (OSS) | Rejected — see below |
| Google Maps JS API | Yes | Good | API key + usage fees | Rejected |

**Why MapLibre GL JS:**
- Vector tiles with WebGL rendering: smooth zoom from world → country → region → city with no tile-boundary artifacts
- Polygon fill styling is first-class (choropleth is the native use case, not a workaround)
- Colour can be driven by a data property (`feature-state`) — perfect for dynamic shading from the API
- Open source (Apache 2.0 licence) — no cost, no API key, no vendor dependency
- React integration via `react-map-gl` (MapLibre adapter) — declarative, idiomatic

**Why Leaflet.js was rejected:**
- Raster tiles cannot change colour at render time — choropleth requires pre-rendered tiles or SVG overlay hacks
- Zoom transitions between tile zoom levels are jarring (the characteristic Leaflet "pop")
- GeoJSON polygon rendering at world scale performs poorly without WebGL

**Why Google Maps was rejected:**
- API key required for every environment
- Usage fees at any meaningful scale
- Choropleth requires GeoJSON overlay work (not native) — no advantage over MapLibre

### 2.2 Tile Provider

**MapTiler** — free tier

- Free tier: 100,000 map loads/month. A personal app will use <100/month.
- Provides OpenStreetMap-based vector tiles in Mapbox Vector Tile format (compatible with MapLibre)
- No payment information required for free tier
- Tile URL: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key={MAPTILER_KEY}`
- `MAPTILER_KEY` is stored in environment config, not hardcoded

**Fallback:** If MapTiler is unavailable or the user wants zero external dependency: self-host vector tiles using `pmtiles` format (Protomaps). A world basemap tile file (~100MB) can be stored locally and served by Express. This is a future option — MapTiler is the default.

### 2.3 GeoJSON Boundary Data

**Source: Natural Earth** (public domain, no attribution required for basic use)

Two files bundled with the app:

| File | Use | Approx size |
|------|-----|-------------|
| `ne_110m_admin_0_countries.json` | Country outlines for world map | ~800KB |
| `ne_10m_admin_1_states_provinces.json` | State/province outlines for region zoom | ~4MB |

These files are served by Express as static assets at `/geo/countries.json` and `/geo/regions.json`. The FRONTEND loads them once at map initialisation and caches them in memory for the session.

**Why Natural Earth:**
- Public domain (no licence fees, no attribution in MVP)
- Standard GeoJSON format — works with MapLibre out of the box
- Country codes in properties match ISO 3166-1 alpha-2 (same as `countries.country_code`)
- Region codes match ISO 3166-2 (used for matching `regions` records)

**FRONTEND implementation note:** MapLibre `feature-state` API is the correct mechanism for applying dynamic shading from the `/api/map/shading` response. After the shading API returns, iterate the results and call `map.setFeatureState({source: 'countries', id: countryCode}, {shadeState: stateKey})` for each country. The MapLibre style layer then maps `shadeState` to the configured colour. This decouples the data fetch from the polygon rendering.

---

## 3. Migration Paths

### 3.1 Beta → Packaged .app (Phase 1)

| What changes | What stays the same |
|-------------|---------------------|
| Add Electron wrapper (new file: `electron/main.ts`) | Express server code — unchanged |
| Build script produces `.app` | React frontend — unchanged |
| App distributed to user's Mac | Database schema — unchanged |
| | All API endpoints — unchanged |

### 3.2 Local → Hosted Web App (Phase 2)

| What changes | What stays the same |
|-------------|---------------------|
| `DB_TYPE=postgres`, `DATABASE_URL=<hosted>` | Express server code — unchanged |
| `VITE_API_BASE_URL=https://domain.com` | React frontend code — unchanged |
| Run schema migration (drizzle-kit push) | All API endpoints — unchanged |
| Deploy Express to cloud (Fly.io, Railway, etc.) | Database schema — unchanged |
| Serve React build statically (or from Express) | All business logic — unchanged |
| Remove Electron | |

**This is the critical test of the architecture:** no source files change. Only configuration. If any source file must be changed, that is an architectural defect to fix before Phase 2.

### 3.3 Hosted → iOS App (Phase 3)

| What changes | What stays the same |
|-------------|---------------------|
| Add Capacitor to React project | React source code — unchanged |
| Build iOS target via Xcode | Express API — unchanged |
| App connects to hosted backend (same URL) | Database — unchanged |

Capacitor wraps the React SPA in a native iOS WebView. The backend is the same hosted Express server as Phase 2. No backend code changes.

### 3.4 Future: Trip Companion Access (NF-07)

The schema and API are already structurally ready:
- `trip_companions_map` tracks companions per trip
- The API is stateless HTTP — adding authentication middleware (JWT or session) to Express routes is additive, not structural
- When companion access is added, it is an Express middleware layer + a users table — the existing schema does not change

### 3.5 Future: Notification Engine (NF-08)

Phase 2 notification engine (N-01 through N-04) is built on top of existing data:
- Flight departure dates: `item_flights.departure_datetime`
- Hotel check-in/out: `item_hotels.check_in_date` / `check_out_date`
- Trip end date: `trips.end_date`

No schema changes required. Notifications are a BACKEND scheduler reading existing columns.

---

## 4. Environment Configuration

All environment-specific values are in `.env` files. No hardcoded values in source (Shared Standard 3).

```
# .env.local (beta / development)
NODE_ENV=development
PORT=3001
DB_TYPE=sqlite
SQLITE_PATH=/Users/ryan/OneDrive/TravelTracker/travel-tracker.db
MAPTILER_KEY=<your-key>
VITE_API_BASE_URL=http://localhost:3001

# .env.production (hosted)
NODE_ENV=production
PORT=8080
DB_TYPE=postgres
DATABASE_URL=postgresql://user:pass@host:5432/travel_tracker
MAPTILER_KEY=<your-key>
VITE_API_BASE_URL=https://your-domain.com
```

---

## 5. Project Structure

```
travel-tracker/
├── electron/
│   └── main.ts             # Electron entry point (Phase 1 release only)
├── src/
│   ├── backend/
│   │   ├── server.ts       # Express app definition
│   │   ├── routes/         # One file per resource group
│   │   ├── services/       # Business logic (geocoding, shading, carry-forward)
│   │   ├── db/
│   │   │   ├── schema.ts   # Drizzle schema (source of truth)
│   │   │   └── index.ts    # DB connection (sqlite or postgres, per DB_TYPE)
│   │   └── migrations/     # Drizzle Kit output
│   └── frontend/
│       ├── main.tsx        # React entry
│       ├── components/     # UI components
│       ├── pages/          # Route-level components
│       ├── hooks/          # React Query hooks (one per resource)
│       └── types/          # Shared TypeScript types (matches DB schema)
├── geo/
│   ├── countries.json      # Natural Earth admin-0
│   └── regions.json        # Natural Earth admin-1
├── package.json
├── vite.config.ts
├── drizzle.config.ts
└── tsconfig.json
```

**Note on shared types:** The `src/frontend/types/` directory mirrors the Drizzle schema types. Drizzle's `InferSelectModel` and `InferInsertModel` utilities can export these directly from `schema.ts`, ensuring FRONTEND and BACKEND are always in sync without manual duplication.


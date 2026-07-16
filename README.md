# Travel Tracker

A personal travel tracking app. Log trips, places, and items (restaurants, hotels, flights, experiences, and more), and view your travel history on an interactive world map with country and region shading.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, TanStack Query v5 |
| Map | MapLibre GL JS via react-map-gl |
| Backend | Node.js, Express, TypeScript |
| ORM | Drizzle ORM |
| Database | SQLite via @libsql/client (PostgreSQL-ready — config change only) |
| Auth | Clerk (BYPASS_AUTH=true available for local dev) |
| Geocoding | OpenStreetMap Nominatim (queued and retried when offline) |
| Map data | Natural Earth GeoJSON (bundled — no internet required for boundaries) |
| Linting | Biome |

---

## Setup

**Prerequisites:** Node.js 22+, npm

```bash
npm ci
```

> **Platform note:** If you cloned on macOS and are running inside a Linux devcontainer (or vice versa), run `npm ci` again inside the container so native binaries (esbuild, libsql) match the platform.

### Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Required | Notes |
|----------|----------|-------|
| `SQLITE_PATH` | Yes | e.g. `file:./dev.db` |
| `VITE_MAPTILER_KEY` | Yes | Free key at [maptiler.com](https://www.maptiler.com/) |
| `BYPASS_AUTH` | Dev only | Backend: `true` skips JWT auth locally. Server throws a fatal error if set with `NODE_ENV=production`. |
| `VITE_BYPASS_AUTH` | Dev only | Frontend counterpart — must match `BYPASS_AUTH`, or the app throws at startup. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Unless bypassing | Clerk publishable key. Frontend throws at startup if unset and not bypassing. |
| `CLERK_JWKS_URI` | Unless bypassing | Clerk JWKS endpoint, e.g. `https://<instance>.clerk.accounts.dev/.well-known/jwks.json`. |
| `CLERK_ISSUER` | Unless bypassing | Clerk instance URL; validated as the JWT `iss` claim. |
| `OWNER_CLERK_ID` | For admin | Clerk user ID granted owner/admin access (ADL-27). Unset = safe lockout (no admin), not escalation. |

Auth uses Clerk-issued JWTs verified via JWKS (jose) — there is no Clerk *secret* key in this
architecture. See `.env.example` for the complete annotated list (`HOST`, `ALLOWED_ORIGINS`,
`VITE_API_BASE_URL`, `GEOCODING_ENABLED`, etc. all have working defaults).

### Database (first run)

Apply migrations and start the backend — seeding runs automatically on first startup:

```bash
npm run db:migrate   # apply all pending migrations
npm run dev:api      # backend starts and seeds countries, regions, and defaults
```

---

## Running

Open two terminals:

```bash
# Terminal 1 — Backend API
npm run dev:api    # → http://localhost:3001

# Terminal 2 — Frontend
npm run dev        # → http://localhost:5173
```

Open `http://localhost:5173`.

---

## Testing

```bash
npm run check              # Biome lint + format
npm run type:check:all     # TypeScript (frontend + backend)
npm run test:backend       # Backend unit tests (Vitest)
npm run test:frontend      # Frontend unit tests (Vitest)
npm run test:contract      # Contract tests (requires backend running on :3001)
```

---

## Schema changes

**Never use `db:push`.** Always use the migration workflow:

```bash
npm run db:generate   # generate a new migration SQL file from schema changes
npm run db:migrate    # apply pending migrations
```

`db:push` is disabled. See `patches/drizzle-kit+0.31.9.patch` for context.

---

## Data storage

All data is stored in a local SQLite file. The path is set by `SQLITE_PATH` in `.env.local`.

**OneDrive / cloud sync:** The database file can live inside a synced folder for personal backup, but only one device should run the app at a time. SQLite does not support concurrent writes from multiple machines via a synced folder.

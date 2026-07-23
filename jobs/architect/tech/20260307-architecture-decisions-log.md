# Travel Tracker — Architecture Decisions Log
**Version:** 1.0
**Date:** 2026-03-07
**Author:** Architect
**Status:** Active — append new decisions as they are made; never delete entries

This log is the authoritative record of every material technical decision made on the Travel Tracker project. All team members are bound by decisions recorded here. Changes to any decision require COO approval and must be recorded as a new entry (do not overwrite).

---

## ADL-01 — Language ecosystem: TypeScript throughout

**Date:** 2026-03-07
**Status:** Decided

**Decision:** TypeScript is the single language for both BACKEND (Node.js) and FRONTEND (React). No other languages are used in the application layer.

**Options considered:**
- TypeScript/Node.js throughout — selected
- Python (FastAPI) backend + TypeScript frontend — rejected
- Python backend + Electron sidecar — rejected

**Rationale:** Electron runs Node.js natively. A TypeScript backend runs inside the Electron main process without any subprocess complexity. A Python backend would require spawning and managing a separate process inside Electron, complicating packaging and distribution. Single-language stack also enables shared TypeScript types between BACKEND and FRONTEND, eliminating a category of type-mismatch bugs.

**Implications:** All engineers work in TypeScript. BACKEND uses Node.js conventions; FRONTEND uses React conventions.

---

## ADL-02 — Backend framework: Express.js

**Date:** 2026-03-07
**Status:** Decided

**Decision:** Express.js is the BACKEND web framework.

**Options considered:**
- Express.js — selected
- Fastify — rejected
- Hono — rejected

**Rationale:** Express is the most widely understood Node.js framework. For a solo developer building a personal application, familiarity and ecosystem size outweigh the performance advantages of Fastify. Hono is lightweight and modern but is optimised for edge runtimes, not a standard Node.js server. Express runs identically in Electron (main process) and on any Node.js host — it has no environment-specific behaviour.

**Implications:** BACKEND routes are Express Router instances. Middleware is standard Express middleware (cors, express.json, etc.).

---

## ADL-03 — ORM: Drizzle ORM

**Date:** 2026-03-07
**Status:** Decided

**Decision:** Drizzle ORM is the database abstraction layer.

**Options considered:**
- Drizzle ORM — selected
- Prisma — rejected
- Kysely — rejected
- Raw SQL (better-sqlite3 / pg directly) — rejected

**Rationale:** Drizzle is the only mainstream TypeScript ORM that treats SQLite and PostgreSQL as first-class targets with near-identical query APIs. The schema is defined once in TypeScript (`schema.ts`) and used by both engines. Migration tooling (`drizzle-kit`) generates and applies schema migrations without manual SQL edits (Shared Standard 4). Prisma was considered but rejected because its SQLite support lacks the same level of production parity as PostgreSQL, and its query builder is more abstracted (harder to write efficient shading aggregation queries). Raw SQL was rejected because it would lose type safety across the SQLite→PostgreSQL transition.

**Implications:** The `src/backend/db/schema.ts` file is the single source of truth for the database schema. All schema changes go through this file and through `drizzle-kit` migrations. No manual SQL edits to the database (Shared Standard 4).

---

## ADL-04 — Database: SQLite → PostgreSQL

**Date:** 2026-03-07
**Status:** Decided

**Decision:** SQLite for Phase 1 (local). PostgreSQL for Phase 2 (hosted). Migration is a configuration change only.

**Options considered:**
- SQLite local → PostgreSQL hosted (same schema) — selected
- SQLite throughout — rejected for Phase 2 (write concurrency limitations)
- PostgreSQL from day one (local Docker) — rejected

**Rationale:** SQLite is the correct choice for a local single-user app — it is a file, it syncs via OneDrive, it requires no server process, and it has zero configuration overhead. PostgreSQL is the correct choice for a hosted multi-user app. Drizzle ORM makes the migration transparent. PostgreSQL from day one (via Docker) was rejected as over-engineering for a beta that one person will use.

**Critical migration test:** When Phase 2 arrives, changing `DB_TYPE` from `sqlite` to `postgres` and running `drizzle-kit push` must be the complete database migration procedure. If it is not, the architecture has failed.

**Implications:** BACKEND database connection is abstracted behind a factory function in `src/backend/db/index.ts` that returns a Drizzle instance for the correct engine based on the `DB_TYPE` environment variable.

---

## ADL-05 — API style: REST

**Date:** 2026-03-07
**Status:** Decided

**Decision:** REST API. GraphQL is not used.

**Options considered:**
- REST — selected
- GraphQL — rejected

**Rationale:** GraphQL is appropriate when multiple independent clients need flexible querying of a shared API. This application has one client (the React frontend) with well-defined, predictable data needs. REST is simpler to implement, easier to test, and easier to reason about. The shading aggregation queries are complex SQL — REST allows these to be purpose-built endpoints rather than shoehorned into a GraphQL resolver.

**Implications:** API endpoints are defined as Express Router routes. See tech blueprint §1.3 for the full endpoint list.

---

## ADL-06 — Desktop packaging: Electron (target); localhost-in-browser (beta)

**Date:** 2026-03-07
**Status:** Decided

**Decision:** Beta phase uses no packaging — Express server runs via `npm start`, user opens `localhost:3001` in browser. Release phase uses Electron to package the app as a macOS `.app`.

**Options considered:**
- Electron — selected for release
- Tauri — rejected
- Localhost-in-browser only — rejected as final state (PO preference is .app)

**Rationale:** Tauri's backend is Rust. Using Tauri while keeping an Express backend would require a sidecar subprocess, breaking the "same code" migration constraint and adding Rust as a dependency. Electron runs Node.js natively — the Express server runs in Electron's main process with no modification. The beta-to-release transition is additive only: one new file (`electron/main.ts`) and a build config change.

**Electron architecture:** Express starts in the main process. A `BrowserWindow` opens pointing to `http://localhost:3001`. The FRONTEND is served by Express as static files (the built `dist/` directory). FRONTEND code does not know it is running inside Electron.

**Implications:** `electron/main.ts` is the only Electron-specific file in the project. Nothing in `src/backend/` or `src/frontend/` is Electron-aware. This enforces the clean separation required for Phase 2 migration.

---

## ADL-07 — Mapping library: MapLibre GL JS

**Date:** 2026-03-07
**Status:** Decided

**Decision:** MapLibre GL JS is the mapping library.

**Options considered:**
- MapLibre GL JS — selected
- Leaflet.js + OpenStreetMap raster tiles — rejected
- Google Maps JavaScript API — rejected

**Rationale:**
- MapLibre provides WebGL-accelerated vector tile rendering. Smooth zoom from world to city level is a core UX requirement (MP-02). Leaflet's raster tile approach produces jarring zoom transitions.
- Choropleth (polygon fill) shading is a first-class MapLibre feature via `feature-state`. Leaflet requires GeoJSON layer workarounds that perform poorly at world scale.
- MapLibre is Apache 2.0 licensed — no API key, no cost, no vendor dependency.
- Google Maps was rejected on cost and API key grounds. It is a commercial product with usage fees; inappropriate for a personal open-stack application.

**React integration:** `react-map-gl` library (MapLibre adapter). Provides declarative MapLibre integration in React components.

**Implications:** FRONTEND `MapView` component uses `react-map-gl` with a MapLibre GL JS instance. Map style, source definitions, and layer styling are defined in the MapLibre style spec (JSON). Shading colours are applied via `map.setFeatureState()` after each `/api/map/shading` call.

---

## ADL-08 — Map tile provider: MapTiler (free tier)

**Date:** 2026-03-07
**Status:** Decided

**Decision:** MapTiler provides the vector tile base map. Free tier (100,000 map loads/month) is sufficient for personal use.

**Options considered:**
- MapTiler free tier — selected
- Self-hosted PMTiles (Protomaps) — deferred
- Mapbox — rejected (cost)

**Rationale:** MapTiler's free tier is generous for personal use and requires no payment details. Self-hosted tiles via Protomaps (`pmtiles` format) is a viable future option if MapTiler usage grows or the user wants zero external dependencies — the migration would be a URL change in the map style configuration.

**Implications:** `MAPTILER_KEY` is an environment variable. It is never hardcoded. Tile URL is configured in the MapLibre style spec loaded by FRONTEND.

---

## ADL-09 — GeoJSON boundary data: Natural Earth (bundled)

**Date:** 2026-03-07
**Status:** Decided

**Decision:** Natural Earth GeoJSON files are bundled with the application and served as static assets by Express. No CDN or external service is used for boundary data.

**Files:**
- `geo/countries.json` — Natural Earth `ne_110m_admin_0_countries` (country outlines)
- `geo/regions.json` — Natural Earth `ne_10m_admin_1_states_provinces` (state/province outlines)

**Rationale:** Country and region boundaries are stable geographic data. Bundling them satisfies NF-01 (no internet for core features) and GE-10 (boundary polygon data bundled). Natural Earth is public domain — no licence overhead. ISO 3166 country codes in the Natural Earth properties match `countries.country_code` in the schema, enabling direct join between API shading data and GeoJSON features.

**Implications:** BACKEND serves `geo/` as a static directory. FRONTEND loads boundaries on map initialisation and caches them in memory for the session lifetime. FRONTEND never re-fetches boundary data mid-session.

---

## ADL-10 — City geocoding: Nominatim with offline-tolerant queue-and-resolve

**Date:** 2026-03-07
**Status:** Decided

**Decision:** City coordinates are resolved via OpenStreetMap Nominatim on first entry. If offline, cities are created in PENDING state and resolved in the background when connectivity returns.

**Rationale:** Provides the "hands off" experience required by the project owner without compromising the offline-first constraint. The queue-and-resolve pattern is documented in BRD GE-12. Cities are always immediately usable (GE-13); only map pin rendering is deferred until coordinates are available.

**Nominatim compliance requirements (BACKEND must implement):**
- User-Agent: `TravelTracker/1.0 (personal-use-app)`
- Maximum 1 request per second
- Results stored permanently locally — no repeated lookups for the same city
- Consistent with Nominatim usage policy for single-user personal applications

**Implications:** BACKEND `geocoding.service.ts` handles all Nominatim interaction. The service is called at: (1) app startup (process the pending queue), (2) city creation (immediate attempt if online), and (3) on a 15-minute interval timer while the app is running. It never blocks a user operation.

---

## ADL-11 — Item type-specific fields: base table + extension tables (Option B)

**Date:** 2026-03-07
**Status:** Decided

**Decision:** Item type-specific structured fields are stored in per-type extension tables (`item_flights`, `item_hotels`, `item_car_rentals`, `item_restaurants`) with a 1:1 FK relationship to the base `items` table.

**Options considered:**
- Option A: Single wide items table — rejected
- Option B: Base + extension tables — selected
- Option C: Base + JSON column — rejected

**Rationale:** Option C (JSON) was specifically rejected because rating sort/filter (IT-08, IT-09) requires column-level indexes on `rating`. JSON path queries cannot be efficiently indexed in SQLite, and even in PostgreSQL they require expression indexes that add complexity. Option A (wide table) creates an unmaintainable schema with dozens of nullable columns. Option B gives clean per-type constraints, indexable rating columns, and works identically in SQLite and PostgreSQL.

**Implications:** When BACKEND retrieves an item, it JOINs the appropriate extension table based on `item_type`. `item_type` is always known before the join is constructed. Experience and Note items use only the base `items` table — no extension table is created for these types as they carry no structured fields.

---

## ADL-12 — Map shading states: computed at query time, never stored

**Date:** 2026-03-07
**Status:** Decided

**Decision:** Map shading states are computed by BACKEND on demand from live trip data. No shading state is stored as a column or cached in the database.

**Rationale:** Any stored shading state would be a denormalisation risk. A trip status change (e.g. moving from Planning to Active, or Locked) would require updating a stored shading state — creating a dual-write consistency problem. Computing from source data at query time is always correct, regardless of how many status changes have occurred. For a personal single-user app, the query cost is trivial (see shading spec §7 performance notes).

**Implications:** The `/api/map/shading` endpoint runs the bulk aggregation query on every call. FRONTEND may cache the result for the duration of a session if needed, but the endpoint itself does not cache. If future scale requires caching, a PostgreSQL materialised view is the correct approach — not a stored column.

---

## ADL-13 — Carry-forward lineage: dual field (is_carried_forward + carried_from_item_id)

**Date:** 2026-03-07
**Status:** Decided

**Decision:** Carried-forward items store both `is_carried_forward` (boolean) and `carried_from_item_id` (self-referential FK) on the `items` table.

**Rationale:** The boolean allows simple `WHERE is_carried_forward = 1` queries (e.g. "show me all suggestions the user accepted"). The FK preserves lineage for display ("carried forward from [trip name]") and for future deduplication logic. The two fields are redundant in one direction (`is_carried_forward = 1` implies `carried_from_item_id IS NOT NULL`), but the redundancy is worth the query simplicity. BACKEND must enforce that both are set together — this is a BACKEND constraint, not a database constraint (SQLite cannot enforce conditional NOT NULL across columns).

**Implications:** BACKEND `items.service.ts` must validate: if `is_carried_forward = 1`, then `carried_from_item_id` must be non-null, and vice versa. An item cannot have one without the other.

---

## ADL-14 — Experience ratings: item_experiences extension table added

**Date:** 2026-03-07
**Status:** Decided — resolves OQ-A1

**Decision:** Experiences are rateable (1–5 stars, integer). `item_experiences` extension table added to the schema (§5.6 of ER schema v1.1). BRD updated to v2.3 (EX-01). IT-08 updated to include experiences.

**Rationale:** Project owner confirmed. Consistent with the established rating pattern for Restaurants and Hotels. The extension table approach (Option B, ADL-11) applies identically here: lazy row creation when the user first adds a rating or post-visit note to a completed Experience.

**Implications:** DATABASE must create `item_experiences` as part of the initial schema migration. BACKEND must handle the lazy extension row pattern for Experiences (same as Restaurants and Hotels). FRONTEND must render rating input and post-visit notes for Experiences in the post-trip review flow (RV-03).

---

## ADL-15 — ORM strategy: Drizzle ORM + drizzle-kit, migrate-only workflow, bugs patched via patch-package

**Date:** 2026-03-11
**Status:** Decided — resolves Dev inbox 2026-03-10

**Decision:** Adopt Option 1 from Dev's analysis. Retain Drizzle ORM for query building and drizzle-kit for schema diffing and migration generation, but:
1. Lock in the four manual node_modules patches via `patch-package` (committed at `patches/drizzle-kit+0.31.9.patch`).
2. Drop `db:push` from the approved dev workflow permanently. All schema changes must use `db:generate` + `db:migrate` only.
3. Add `postinstall: patch-package` to `package.json` so the patch re-applies automatically after every `npm install`.

The four patched bugs (duplicate CREATE INDEX, CHECK constraint regex, shared checkConstraints accumulator, partial index WHERE clause) all live in the drizzle-kit SQLite push/introspection path. The generate → migrate workflow is unaffected at runtime — generated SQL files are deterministic once written. The patch ensures that `db:generate` also produces correct diffs when introspecting existing schema state.

**Rationale:**
- Drizzle ORM (the query layer) is working correctly. The bugs are exclusively in drizzle-kit's SQLite diff engine.
- Two tracked migration files already exist (`0000`, `0001`). Switching to raw migrations now would orphan that history and add permanent maintenance burden.
- Options 3 (new ORM) and 4 (wait upstream) are inappropriate pre-production; the risk/rework cost outweighs the benefit.
- `patch-package` is a well-established npm pattern; the patch is small (103 lines), reviewed, and committed to version control. It is fully auditable.
- If drizzle-kit publishes a fix, verify against our four bugs and drop the patch — no other changes needed.

**Implications:**
- `db:push` must never be used. CLAUDE.md updated to reflect this.
- If `npm install` is run without internet (container rebuild), `postinstall` will run `patch-package` against the newly installed drizzle-kit binary. The patch must apply cleanly against `drizzle-kit@0.31.9`; if the version changes the patch will fail loudly — treat that as a signal to re-evaluate.
- All team members must use `db:generate` + `db:migrate` for any schema changes. The `db:migrate` script is now exposed in `package.json`.

---

## ADL-16 — Multi-user ownership boundary: user_id on trips, items, and trip_places

**Date:** 2026-03-19
**Status:** Decided — resolves NR-14 design review Q1

**Decision:** user_id (FK → users.id, TEXT/UUID) is added to three tables:
- `trips` — primary ownership root
- `items` — direct user scoping for cross-trip queries and Postgres RLS
- `trip_places` — added beyond the original COO proposal (see rationale)

user_id is a regular indexed FK column on each table. It is NOT part of a composite PK.

**Tables correctly excluded from direct user_id:**
- `trip_categories_map`, `trip_companions_map`, `trip_activities_map`,
  `trip_place_activities_map` — pure junction tables, ownership flows from parent
- `item_flights`, `item_hotels`, `item_car_rentals`, `item_restaurants`,
  `item_experiences` — extension tables, 1:1 FK to items; always accessed through items
- `countries`, `regions`, `cities` — shared geographic reference data, not user-owned
- `trip_categories`, `activities`, `companions`, `map_shading_config` — admin lists;
  per-user scoping deferred as a product decision to Phase 2+

**Why trip_places (deviation from COO proposal):**
trip_places is not a pure junction table. It has its own auto-increment PK, its own
timestamps, and is the direct target of cross-trip queries (carry-forward, city-level
item history). In the Postgres RLS phase, those queries start from city_id and join
through trip_places; a direct user_id on trip_places makes the RLS policy self-
contained without requiring a mandatory trips JOIN on every policy evaluation.

**Why indexed FK, not composite PK:**
Composite PK would cascade into every downstream FK reference (trip_places, items,
all junction tables). Drizzle ORM composite FK syntax is more complex. The security
model is identical — Postgres RLS policies reference the user_id column directly.

**users.id type: TEXT (UUID v4)**
UUID rather than INTEGER AUTOINCREMENT because: user IDs appear in JWTs and URLs
where sequential integers leak user count and enable enumeration. UUIDs are opaque
identifiers. Portable to Postgres without sequence conflicts.

**Required indexes:**
- `idx_trips_user_id` ON trips(user_id)
- `idx_items_user_id` ON items(user_id)
- `idx_trip_places_user_id` ON trip_places(user_id)

**Implications:**
- DATABASE adds users, refresh_tokens tables plus user_id columns + indexes
- BACKEND must migrate all trip/place/item queries through the repository layer
  (ADL-18) before multi-user access is enabled
- The undocumented ownerAccountId/subscriptionId/createdByAccountId columns already
  in trips and trip_places must be removed via migration — they were not approved
  by Architect and conflict with the clean user_id design

---

## ADL-17 — Auth architecture: OAuth (Google) + JWT access/refresh token pair

**Date:** 2026-03-19
**Status:** SUPERSEDED by ADL-20 (2026-03-20) — PO directed Clerk managed auth

**Decision:** OAuth 2.0 PKCE flow (Google as initial provider, designed for multi-
provider extension). JWT access tokens (15-minute expiry). Refresh tokens (30-day
expiry) stored server-side in refresh_tokens table (hashed). jose library for JWT.
No auth framework (no Passport, Lucia, Auth.js).

**Why OAuth over email+password:**
No password management — no storage, no reset flows, no breach exposure. Family
users universally have Google accounts. Architecture is designed to support
email+password as an additive future option (users table has password_hash column
capacity; the JWT and session layer is auth-strategy-agnostic).

**Why JWT over session cookies:**
Platform coverage: JWT (Authorization: Bearer header) works identically in browser,
Electron, iOS Capacitor WebView, and native iOS. Session cookies require httpOnly
cookie handling which is fragile in Electron (same-site/secure restrictions) and
iOS WebView (cross-domain, SameSite=None+Secure, separate cookie store). JWT is
the correct choice for a multi-platform target stack.

**Token storage by platform (MANDATORY — not optional):**
- Browser: access token in memory (JS variable); refresh token in httpOnly cookie
  (SameSite=Strict, Secure). NEVER localStorage.
- Electron: access token in memory; refresh token via Electron safeStorage API
  (OS keychain on macOS). NEVER localStorage.
- iOS (Capacitor): access token in memory; refresh token in iOS Keychain via
  Capacitor Secure Storage plugin. NEVER localStorage.

**Refresh token security:**
Refresh tokens are stored as SHA-256 hashes in the refresh_tokens table. Raw tokens
are never persisted server-side. Revocation is possible at any time by setting
revoked_at. All tokens for a user can be revoked on logout or password change.

**Library: jose**
jose is the canonical TypeScript JWT library. It does not require a framework.
It handles all cryptographic primitives correctly. Total auth implementation is
approximately 300-400 lines across:
- oauth.service.ts (PKCE flow, token exchange, user info)
- jwt.service.ts (signing, verification)
- auth routes (POST /api/auth/callback, /refresh, /logout)
- Updated authenticate middleware

**Electron OAuth callback:**
When Electron packaging is implemented, a custom URL scheme (e.g.
traveltracker://callback) must be registered in Electron main.ts to intercept
the OAuth redirect. The backend auth flow is unchanged; only Electron main needs
an additional URL scheme handler. This is deferred to Phase 1 release.

**New schema required:**
- users table (id TEXT UUID PK, email, display_name, oauth_provider, oauth_subject)
- refresh_tokens table (id, user_id FK, token_hash, expires_at, revoked_at)

**Implications:**
- BACKEND implements oauth.service.ts, jwt.service.ts, three new auth routes
- FRONTEND stores access token in memory only — this must be explicit in the spec
- authenticate middleware body is replaced (signature unchanged — existing routes
  receive req.user and require no modification beyond adding user scoping)
- DATABASE adds users and refresh_tokens tables

---

## ADL-18 — Multi-tenant query pattern: repository layer

**Date:** 2026-03-19
**Status:** Decided — resolves NR-14 design review Q3

**Decision:** A repository layer (`src/backend/repositories/`) wraps all Drizzle
queries for user-scoped tables (trips, items, trip_places). Route handlers call
repository functions — they do not write Drizzle queries directly against these
tables. Repository functions accept userId as an explicit parameter and always
include WHERE user_id = ? in the query condition.

**Options rejected:**
- Per-route explicit filtering: relies on every developer remembering to add the
  WHERE clause. No enforcement mechanism. History shows this is where cross-user
  leakage bugs originate. Rejected.
- Middleware query injection: Drizzle has no query interceptor API. Monkey-patching
  the db object is fragile and interferes with admin/seeding queries that run
  without a user context. Rejected.

**Repository structure:**
  src/backend/repositories/
    trips.repository.ts        — findAll(userId), findById(tripId, userId), etc.
    items.repository.ts        — findByTrip(tripId, userId), findById(itemId, userId)
    tripPlaces.repository.ts   — findByTrip(tripId, userId), findById(placeId, userId)

**Non-user-scoped tables (cities, admin lists, geographic hierarchy) remain as
direct Drizzle queries in route handlers or services — no repository needed.**

**Postgres RLS design-forward approach:**
Repository functions are designed to accept a db/tx parameter, enabling Phase 2
Postgres RLS integration via a withUserContext(userId, fn) wrapper that issues
SET LOCAL app.current_user_id = userId before executing queries. The WHERE user_id
= ? clause in every repository query serves as both the SQLite enforcement mechanism
and a fallback layer independent of RLS. The repository layer means RLS adoption in
Phase 2 is additive (add policies + withUserContext wrapper), not a refactor.

**Critical pre-live requirement:**
ALL of the following existing query patterns MUST be migrated to repositories before
multi-user access is enabled (current single-user behaviour is safe; multi-user
access with the current patterns would be a CRITICAL security defect):

1. trips.ts getTripOrThrow() — no user_id filter
2. items.ts GET/PATCH /:itemId — verifies tripId but not trip ownership
3. places.ts assertTripWritable() and all place endpoints — tripId only
4. cities.ts GET /:id/carry-forward — no user scoping (leaks cross-user next_time items)
5. cities.ts GET /:id/items — no user scoping (leaks cross-user completed items)
6. map.ts getAllCountryShading() — must scope to authenticated user's trips

**Implications:**
- BACKEND creates src/backend/repositories/ before enabling multi-user access
- Existing route handlers are refactored to use repository functions
- Database adds user_id columns per ADL-16 as a prerequisite
- Phase 2 Postgres RLS integration requires withUserContext() in db/index.ts —
  design the repository function signatures to accommodate this now

---

## ADL-19 — Schema anomaly: undocumented columns in trips and trip_places

**Date:** 2026-03-19
**Status:** Decided — flag and remove

**Discovery:**
Schema review for NR-14 revealed four columns in the current schema.ts that were not
in the approved ER schema v1.1 and were not reviewed or approved by Architect:
- trips.ownerAccountId (text, nullable)
- trips.subscriptionId (text, nullable)
- trips.createdByAccountId (text, nullable)
- trip_places.createdByAccountId (text, nullable)

These columns have no FK constraints, no documentation, no ADL entry, and no
corresponding migration documentation. Their intent is unknown.

**Decision:** Remove all four columns via Drizzle migration before NR-14 database
work begins. The proper multi-user ownership design is documented in ADL-16.
Layering a clean user_id implementation on top of undocumented columns would create
confusion and technical debt.

**Action required:**
- DATABASE to generate a migration removing all four columns
- Architect to review the migration before it is applied

**Note on process:**
This is a violation of Shared Standard 13: "no schema changes without Architect
review." The columns were introduced without Architect review. COO must identify
when and why this happened and ensure the process is followed going forward. All
schema changes — including adding nullable columns — require an ADL entry and
Architect sign-off.

---

## ADL-20 — Auth architecture: Clerk managed auth (supersedes ADL-17)

**Date:** 2026-03-20
**Status:** Decided — PO direction confirmed, Architect assessed no blocker

**Decision:** Clerk is the managed auth platform. Clerk issues JWTs (session tokens).
Express backend verifies them using jose against Clerk's JWKS endpoint. No Clerk SDK
in the backend. Frontend uses Clerk React SDK for sign-in UI and token acquisition.
refresh_tokens table is dropped. users table is retained with clerk_id column replacing
oauth_provider / oauth_subject.

**Why Clerk over roll-your-own (ADL-17 supersession rationale):**
- PO direction: consumer app at real-scale ambition. Clerk handles OAuth providers,
  token rotation, MFA, and magic links as a managed service. We do not own that
  security maintenance surface.
- Adding a provider (Apple, email+password, GitHub) is a Clerk dashboard toggle,
  not a code change. ADL-17 required a new oauth.service.ts branch per provider.
- Free tier covers early growth; pricing at real MAU is a good problem to have.

**Express compatibility:**
Standard JWT verification pattern. jose + Clerk JWKS URI. authenticate middleware
interface (req.user shape) is unchanged from ADL-17 specification — only the
verification body changes.

**Seam rule (MANDATORY):**
The backend must never import @clerk/* packages. The JWKS URI is an environment
variable (CLERK_JWKS_URI). Migrating to any other JWKS-compatible provider is a
one-line env change. This is a hard architectural constraint — violations must be
flagged immediately.

**Electron flow:**
system browser (shell.openExternal) → Clerk hosted sign-in → custom URL scheme
callback (traveltracker://auth/callback) → Electron main intercepts and passes
session token to renderer. Deferred to Phase 1 packaging. Dev/beta flow is unchanged.

**iOS Capacitor flow:**
Clerk React SDK works in Capacitor WebView. Hosted backend is unchanged. No
Capacitor-specific auth code required. Deferred to Phase 3.

**Lock-in exposure:**
- Backend: minimal (JWKS URL + one middleware function)
- Frontend: Clerk React SDK for sign-in page and getToken() calls. Use hosted
  Clerk sign-in page rather than embedded `<SignIn />` component to keep the
  replacement surface small.
- Migration cost if we leave Clerk: user export + clerk_id column rename +
  JWKS URL change. Estimated at under one day if seam rule is respected.

**Schema changes from ADL-17:**
- users table: DROP oauth_provider, oauth_subject; ADD clerk_id TEXT NOT NULL UNIQUE
- refresh_tokens table: DO NOT CREATE (Clerk owns token lifecycle)
- All ADL-16 user_id FK decisions: UNCHANGED
- All ADL-18 repository layer decisions: UNCHANGED
- ADL-19 undocumented column removal: UNCHANGED

**New users table shape:**
  id           TEXT PRIMARY KEY (UUID v4)
  clerk_id     TEXT NOT NULL UNIQUE
  email        TEXT NOT NULL
  display_name TEXT
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())

**Backend auth surface (complete):**
  authenticate middleware — jose jwtVerify against Clerk JWKS; populates req.user
  userRepository.findOrCreateByClerkId(clerkId, email) — upsert on first sign-in
  NO /api/auth/callback, /refresh, or /logout routes required

**Implications:**
- DATABASE creates users table (new shape above); does NOT create refresh_tokens
- BACKEND implements authenticate middleware (jose only) + findOrCreateByClerkId
- FRONTEND installs @clerk/react; uses useAuth().getToken() for API calls
- COO must create Clerk account and supply CLERK_PUBLISHABLE_KEY + CLERK_JWKS_URI
  before backend or frontend can proceed

---

## ADL-21 — Node.js runtime version: standardise on Node 22 LTS

**Date:** 2026-03-21
**Status:** Decided — resolves COO inbox 2026-03-21 14:00

**Decision:** Standardise on Node.js 22 LTS across CI, local development, and
production. CI workflows (`ci.yml`, `security.yml`) must be updated from
`node-version: "20"` to `node-version: "22"`. An `engines` field must be added
to `package.json` declaring `"node": ">=22"`.

**Options considered:**
- Stay on Node 20 (current) — rejected: active support ends April 2026; deprecation
  warnings already appearing in CI from `actions/checkout@v4` and
  `gitleaks/gitleaks-action@v2`; GitHub Actions deadline June 2, 2026.
- Node 22 LTS — selected (see rationale below).
- Node 24 — rejected: Node 24 does not enter LTS until October 2026; it is a
  "current release" as of the decision date. Adopting pre-LTS on a production
  trajectory is unnecessary risk given Node 22 covers all requirements.

**Rationale:**
Node 22 became LTS in October 2024. Its active support window runs to October 2026;
maintenance support extends to April 2028. This gives more than two years of active
support from the decision date, well past the anticipated Phase 2 (hosted)
deployment. Node 22 resolves all GitHub Actions deprecation warnings and comfortably
clears the June 2, 2026 deadline. Node 24 is the next logical step but should be
adopted only once it reaches LTS (October 2026) — there is no blocking reason to
jump ahead of the LTS track.

**Stack compatibility assessment:**

All production dependencies were reviewed against Node 22. No compatibility issues
were found. Specific notes:

- **Express 5.2** — fully compatible with Node 22. Express 5 is the current release
  and was developed and tested against modern Node LTS versions.
- **Drizzle ORM 0.38 + drizzle-kit 0.31.9** — compatible. The four patched
  drizzle-kit bugs (ADL-15) are in drizzle-kit's SQLite diff engine and are not
  Node version–sensitive. The patch applies against the binary; no Node 22
  regression is expected.
- **@libsql/client 0.14** — compatible. libsql ships prebuilt native binaries for
  all major platforms; Node 22 binaries are published.
- **Vite 7 + Vitest 4** — both require Node 18+ and are actively tested on Node 22.
  No issues.
- **@clerk/clerk-react 5** — Clerk React SDK targets modern browsers/Node; Node 22
  is within its supported range.
- **jose 6** — pure TypeScript/JavaScript; no native bindings. Node 22 compatible.
- **tsx 4** — compatible; tsx is a thin wrapper over esbuild and supports Node 22.
- **patch-package 8** — compatible with Node 22.
- **@types/node**: currently pinned at `^20.11.5`. Must be updated to `^22.x` when
  the CI change is made to avoid type mismatches against Node 22 built-ins.

**No `engines` field currently in `package.json`:** One must be added alongside the
CI change to make the Node version constraint explicit and machine-readable.

**Migration steps (for the engineer executing the CI change):**
1. Update `node-version: "20"` → `node-version: "22"` in all jobs in `ci.yml` and
   `security.yml` (5 jobs across the two files).
2. Add `"engines": { "node": ">=22" }` to `package.json`.
3. Update `"@types/node": "^20.11.5"` → `"@types/node": "^22.0.0"` in
   `devDependencies`.
4. Run `npm install` (updates `@types/node` in `package-lock.json`).
5. Run full pre-push checklist (`type:check`, `test:backend`, `test:frontend`) and
   confirm CI passes.

**Timeline:** Must be completed before June 2, 2026. No urgency to rush — Node 20
remains on maintenance support through April 2027 — but blocking CI deprecation
warnings sooner is preferable. Target: next available engineering slot.

**Implications:**
- CI workflows require mechanical updates (step 1 above) — no logic changes.
- `@types/node` version bump is the only dependency change required.
- devcontainer Node version should be aligned to Node 22 at the same time (not
  blocking, but keeps local and CI environments in sync).

---

## ADL-22 — E2E testing infrastructure: Playwright + baked Chromium (Option B)

**Date:** 2026-03-21
**Status:** Decided — resolves COO inbox 2026-03-21 18:00

**Decision:** Adopt Playwright for E2E testing. Chromium-only (headless). Browsers
baked into the Docker image at build time (Option B). Separate `e2e.db` SQLite
file for test isolation. On-demand execution only (`npm run test:e2e`) — not in CI
for now.

---

### Container constraint resolution

The devcontainer firewall (`init-firewall.sh`) runs at `postStartCommand` — after
the image is built. The Docker image build phase has unrestricted internet access.
Therefore, downloading Playwright browser binaries during the Dockerfile build is
the correct approach.

**Options considered:**
- **Option A — system Chromium via apt:** rejected. The Debian `chromium` package
  version lags Playwright's expected Chromium revision. Version mismatches produce
  subtle rendering failures (missing CSS features, JS API differences) that are
  hard to diagnose. Not suitable for a reliable E2E suite.
- **Option B — bake Playwright browsers into Dockerfile:** selected. `npx
  playwright install --with-deps chromium` runs during the Docker build. Exact
  version match between `@playwright/test` in `package.json` and the installed
  browser binary. Reproducible. No CDN access at runtime.
- **Option C — add `playwright.azureedge.net` to firewall allowlist:** rejected.
  The firewall's purpose is to constrain the attack surface. Adding a Microsoft CDN
  domain for runtime downloads on every container start introduces both a network
  dependency and an additional allowed outbound domain. Option B is strictly better.

**Playwright system library dependency:** Playwright requires a significant set of
Chromium native libraries (`libatk`, `libgbm`, `libnss3`, `libxss1`, etc.). The
`--with-deps` flag in `playwright install --with-deps chromium` handles all of
these automatically via `apt-get` during the Docker build. This is the canonical
Playwright Docker installation procedure.

---

### Required Dockerfile changes

The following changes must be made to `.devcontainer/Dockerfile`:

1. **Update base image from `node:20` to `node:22`** (per ADL-21 — this change
   should accompany or precede the Playwright addition).

2. **Add Playwright browser installation** as a build-time step, immediately after
   the `USER root` block and before the final `USER node`:

```dockerfile
# Install Playwright Chromium and all required system libraries
# IMPORTANT: PLAYWRIGHT_VERSION must match @playwright/test in package.json
ARG PLAYWRIGHT_VERSION=1.52.0
RUN npx --yes @playwright/test@${PLAYWRIGHT_VERSION} install --with-deps chromium
```

**Sync contract:** The `PLAYWRIGHT_VERSION` ARG in the Dockerfile MUST match the
`@playwright/test` version in `package.json` at all times. When QA bumps
`@playwright/test`, they must also update this ARG and trigger a container rebuild.

---

### Database strategy

**Separate SQLite file:** E2E tests use `SQLITE_PATH=./e2e.db` (a dedicated file
isolated from `dev.db`). This prevents tests from corrupting development data.

**Schema bootstrap:** The `test:e2e` npm script runs `db:migrate` against `e2e.db`
before Playwright starts. This ensures the schema is current without manual steps.

**Seeding:** Tests create their own data via API calls during test setup. No
separate seed script infrastructure is required. Test helpers (`src/e2e/helpers/`)
should provide typed factory functions wrapping `fetch` calls for common entities
(trips, places, items). Rely on `BYPASS_AUTH=true` so API calls require no token.

**Cleanup policy (confirmed by COO + PO):** Data persists after a run. The
`test:e2e:clean` script deletes `e2e.db` and allows a fresh start. Do NOT auto-clean
on run completion — persisted data enables failure triage.

```bash
# Cleanup invocation: drops and recreates e2e.db (schema re-applied on next run)
npm run test:e2e:clean   # → rm -f ./e2e.db
```

---

### playwright.config.ts (skeleton — QA to build on)

Location: `/workspace/playwright.config.ts`

See the committed skeleton at that path. Key decisions encoded in the config:
- `testDir: 'src/e2e'` — consistent with `src/backend/`, `src/frontend/` structure
- `workers: 1` — sequential execution; tests share one e2e.db, parallelism would
  cause race conditions on the shared database
- `retries: 0` — E2E tests must be deterministic; flakiness should be fixed, not
  retried away
- `timeout: 30_000` — generous for local dev; Vite startup can take a few seconds
- `webServer` — starts BOTH backend (port 3001) and frontend (port 5173) with
  `reuseExistingServer: false` so tests always get a clean server state
- `BYPASS_AUTH=true` — set in webServer env so the backend skips auth for all E2E
  requests

---

### npm scripts (to be added to package.json by QA)

```json
"test:e2e":       "SQLITE_PATH=./e2e.db npm run db:migrate && playwright test",
"test:e2e:clean": "rm -f ./e2e.db"
```

---

### Future CI path (non-blocking)

When E2E tests are added to CI:
1. Add an `e2e` job in `ci.yml`, gated on `test:backend` and `test:frontend` passing.
2. The job runs on the devcontainer image (or equivalent). Playwright browsers are
   already baked in, so no `playwright install` step is needed in CI.
3. Set `BYPASS_AUTH=true`, `SQLITE_PATH=./e2e.db`, and `MAPTILER_KEY` (or a test
   key) in GitHub Actions secrets.
4. The `test:e2e` script handles schema bootstrap automatically.

---

### Implications

- **QA:** installs `@playwright/test` (`npm install -D @playwright/test@1.52.0`),
  implements `playwright.config.ts` from the committed skeleton, writes critical-path
  test files in `src/e2e/`, and adds the `test:e2e` / `test:e2e:clean` scripts.
- **Dockerfile:** must be updated (`FROM node:22`, Playwright install step). QA or
  COO should coordinate the container rebuild with the engineer updating CI for ADL-21.
- **`.gitignore`:** add `e2e.db` to prevent the test database from being committed.
- **`BYPASS_AUTH`:** must be set in `.env.local` (or inline in `test:e2e` script)
  for the backend to accept unauthenticated requests during E2E runs.

---

## ADL-23 — trip_countries junction table: schema, shading, and API design

**Date:** 2026-03-21
**Status:** Decided — resolves COO inbox 2026-03-21 19:00 (GitHub #31)

**Decision:** Add a `trip_countries` junction table as the authoritative source for
explicit country associations on a trip. Managed independently from `trip_places`.
No new shading tier. Country shading is computed from the union of `trip_countries`
and the `trip_places → cities → countries` chain. Endpoints: inline country_codes
on trip create/update, plus sub-resource endpoints for incremental changes.

---

### 1. Schema design

```
trip_countries
  trip_id      INTEGER  NOT NULL  REFERENCES trips(id) ON DELETE CASCADE
  country_code TEXT     NOT NULL  REFERENCES countries(country_code) ON DELETE RESTRICT
  created_at   TEXT     NOT NULL  DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  PRIMARY KEY (trip_id, country_code)
  INDEX: idx_trip_countries_country ON trip_countries(country_code)
  INDEX: idx_trip_countries_trip ON trip_countries(trip_id)   -- covered by PK in most engines
```

**Why no `updated_at`:** Junction table. A row either exists or it doesn't — no
update operation is meaningful.

**Why RESTRICT on country delete:** Countries are shared reference data seeded at
app launch. A country should never be deleted while a trip references it. RESTRICT
makes the FK constraint loud if this is ever attempted.

**Why CASCADE on trip delete:** A deleted trip should clean up its country
associations atomically. Consistent with all other trip junction tables.

**Independence from trip_places (confirmed):** `trip_countries` is managed
exclusively by the user. Adding a place to a city does NOT auto-populate
`trip_countries`. Removing the last place from a country does NOT auto-remove its
`trip_countries` row. This is the correct product decision because:
- The core use case is pre-planning: "I'm going to Japan" before any cities are chosen.
- Auto-sync would create a hidden coupling that surprises users and complicates the
  remove-place flow (what does the country-level state mean?).
- Users are in direct control of their country associations at all times.

---

### 2. Map shading: v1.2 amendment

**No new shading tier.** The existing six states (`planned`, `active`,
`visited_once`, etc.) correctly capture the semantics. A country explicitly
associated with a `planning` trip should show as `planned`. Adding a seventh state
(e.g., `mentioned`) would require new seed data, new UI config, and new FRONTEND
logic — an unjustified cost when the existing tiers already carry the right meaning.

**Rule change (v1.2):** Country shading is now computed from the **union** of two
trip sources per country:
- Path A: `trip_places → cities → countries` (existing)
- Path B: `trip_countries` (new)

A trip that appears in both paths for the same country is counted only once
(UNION semantics, not UNION ALL).

**Region-tier logic update (§4.0 case addition):**

For countries with `region_tier_enabled = 1`, the existing cases (b) and (c) are
joined by a new case (d):

| Case | Condition | State computation |
|------|-----------|-------------------|
| **(a)** | `region_tier_enabled = 0` | UNION(Path A, Path B) trips |
| **(b)** | `region_tier_enabled = 1` AND unregioned cities have trip_places | Path A unregioned trips only |
| **(c)** | `region_tier_enabled = 1` AND all regions visited | UNION(Path A, Path B) trips |
| **(d)** NEW | `region_tier_enabled = 1` AND trip_countries exist AND (b)/(c) don't apply | Path B trips only |

Decision order: hasActive check (from UNION) → case (c) → case (b) → case (d) → `never_visited`.

**Rationale for case (d):** If a user associates Japan (which has a region tier)
with a planning trip but has added no Japanese cities yet, Japan should display as
`planned`. Without case (d), Japan would return `never_visited` despite the explicit
association. Case (d) closes this gap without undermining the region-tier granularity
logic for cases (b) and (c).

**Shading spec amendment:** `jobs/architect/tech/20260307-map-shading-spec.md`
updated to v1.2. §4.0 and §4.1 revised. See that file for updated SQL.

---

### 3. API contract additions

**Trip create/update (inline):**

```
POST /api/trips
  body: { name, start_date, end_date, status?, country_codes?: string[] }
  → creates trip + inserts trip_countries rows atomically

PATCH /api/trips/:id
  body: { ..., country_codes?: string[] }
  → if country_codes present: REPLACES the full country list for the trip
  → if country_codes absent: country list is unchanged (not cleared)
```

**Sub-resource endpoints (incremental management):**

```
POST   /api/trips/:id/countries
  body: { country_codes: string[] }   ← add one or more countries (idempotent)
  → 200 { countries: [{ country_code, name }] }

DELETE /api/trips/:id/countries/:code
  → 204 No Content
  → 404 if association does not exist
```

**GET responses:**

```
GET /api/trips/:id   (TripDetail)
  → add: countries: [{ country_code: string, name: string }]

GET /api/trips       (TripSummary list)
  → add: country_codes: string[]   (lightweight — for map filtering and chips)
```

**BACKEND notes:**
- `POST /api/trips` must insert `trip_countries` rows in the same transaction as
  the trip row. If any `country_code` is invalid (not in `countries` table), reject
  the whole request with 422.
- `PATCH /api/trips/:id` with `country_codes` present: DELETE existing rows for
  this trip_id, INSERT new rows — all in one transaction.
- Locked trips: country associations follow the existing locked-trip rule (TR-06,
  TR-07). Attempting to modify countries on a locked trip returns 409.

---

### 4. Filtering

`GET /api/trips?country=XX` must match trips where:
- `trip_countries.country_code = XX`, OR
- `trip_places → cities.country_code = XX`

The union of both sources. A trip with Japan in `trip_countries` but no Japanese
cities must appear in `?country=JP` results.

```sql
-- Correct filter (UNION to avoid double-counting)
WHERE trips.id IN (
  SELECT trip_id FROM trip_countries WHERE country_code = :code
  UNION
  SELECT tp.trip_id FROM trip_places tp
  JOIN cities c ON c.id = tp.city_id
  WHERE c.country_code = :code
)
```

---

### Implications

- **DATABASE:** generate and apply migration adding `trip_countries` table with
  all constraints and indexes. Export `TripCountry` / `NewTripCountry` TypeScript
  types.
- **BACKEND:** update `trips.ts` route (create/update inline), add country sub-resource
  router, update `TripDetail` and `TripSummary` response shapes, update country
  filter logic.
- **BACKEND (shading.service.ts):** update `getAllCountryShading()` and
  `getCountryShading()` to union `trip_countries` with the existing city chain.
  Add `case (d)` logic to `computeCountryState()`. See shading spec v1.2 §4.
- **FRONTEND:** add country picker to trip create form; remove activities and photo
  album from create dialog (per GitHub #31 brief); add post-create navigation.
- **Tests:** backend tests for the new endpoints; update shading service unit tests
  to cover `trip_countries` contributions and case (d).

---

## ADL-24 — Place date ranges: schema, API, ordering, and DP-04 precedence

**Date:** 2026-03-20
**Status:** Decided — full design ready for implementation, no further Architect input needed
**BRD ref:** DP-05 (v2.5); DP-04 (v2.4)

**Decision:** Add nullable `arrived_on` / `departed_on` (`text`, ISO 8601 `YYYY-MM-DD`)
columns to `trip_places` for optional, explicit place-level dates — distinct from
DP-04's hotel-derived *display* dates. New `PATCH /api/trips/:tripId/places/:placeId`
endpoint required (does not currently exist). Chronological ordering of place
sections is a frontend client-side sort (nulls last, stable). DP-04's date-range
display now follows a three-source precedence: explicit place dates > hotel
check-in/check-out > trip start/end.

---

### 1. Schema change

**Column naming — `arrived_on` / `departed_on`:** `date_from`/`date_to` reads like
an internal filter range, not a semantic travel event. `start_date`/`end_date` is
already the vocabulary on `trips` — reusing it on `trip_places` would create a
misleading symmetry (a trip has a definitive, gating start/end; a place arrival/
departure is optional and advisory). `arrived_on`/`departed_on` is domain-precise
("I arrived in Paris on…") and consistent in spirit with `item_hotels`'
`check_in_date`/`check_out_date`.

**Data type — `text` ISO 8601:** Consistent with every other date column in the
schema (`trips.start_date/end_date`, `item_hotels.check_in_date/check_out_date`).
ISO 8601 strings sort correctly with lexicographic ordering, so `ORDER BY
arrived_on` needs no casting. Integer epoch would add conversion overhead for a
date-only value with no benefit. `text` also gives a mechanical, no-transform
migration path to PostgreSQL `DATE` in Phase 2.

**Nullability:** Both columns nullable, no default — nullability *is* the
"optional date" mechanism. No DB-level CHECK enforcing `arrived_on <= departed_on`
(SQLite CHECK constraints on cross-column text-date comparisons are unreliable,
per the `trips` table precedent — validated at the backend service layer
instead). No CHECK requiring both columns set together — partial dates (only
`arrived_on` set) are a valid, expected use case (§6).

```typescript
arrivedOn:  text('arrived_on'),   // ISO 8601 date 'YYYY-MM-DD', NULL = not set
departedOn: text('departed_on'),  // ISO 8601 date 'YYYY-MM-DD', NULL = not set
```

No index — ordering is only ever within one trip's places (2–20 rows typically);
a full-table index would go unused. Add one later only if cross-trip "places by
date" queries become a real requirement.

**Migration:** Two plain `ALTER TABLE ADD COLUMN` statements — no table
recreation, so none of the patched drizzle-kit bugs (ADL-15) are triggered.
Backward-compatible (existing rows get NULL), idempotent, no backfill needed.

```sql
ALTER TABLE trip_places ADD COLUMN arrived_on TEXT;
ALTER TABLE trip_places ADD COLUMN departed_on TEXT;
```

### 2. API changes

| Endpoint | Change |
|----------|--------|
| `GET /api/trips/:tripId/places` | Return `arrived_on`, `departed_on` on each place |
| `POST /api/trips/:tripId/places` | Accept optional `arrived_on`, `departed_on` |
| `PATCH /api/trips/:tripId/places/:placeId` | **New endpoint** — required for DP-05 date edits; does not currently exist |
| `GET /api/trips/:id` | Return `arrived_on`, `departed_on` on each place in the `places` array |

Both fields optional on POST; on PATCH, explicit `null` clears the value,
omitting the field leaves it unchanged (standard partial-update semantics).
`CreatePlaceSchema` gains both fields (regex-validated `YYYY-MM-DD`, optional +
nullable); a new `UpdatePlaceSchema` backs the PATCH handler. Service layer
validates `arrived_on <= departed_on` when both are non-null (422 otherwise) —
no constraint requiring both to be set together.

`placeRepository.create()` and `findByTrip()` (plus the `PlaceWithCity` type)
must select/persist the new columns; a new `placeRepository.update()` backs the
PATCH endpoint using the existing `assertWritable` write-guard pattern.
`tripRepository.getPlaces()` must expose the same columns for `GET /api/trips/:id`.

### 3. Frontend ordering — client-side sort

Chronological ordering is applied on the frontend, not the API, because the trip
detail response already returns the full place set regardless of order, a
client-side `places.sort(byArrivedOn)` adds no backend complexity or API-contract
risk, and the BRD frames ordering as a trip-detail *view* concern. A future API
consumer (e.g. iOS) can apply the same sort client-side, or the API can grow an
optional `?sort=arrived_on` param later without breaking the existing contract.

```
places.sort((a, b) => {
  const aDate = a.arrived_on ?? null;
  const bDate = b.arrived_on ?? null;
  if (aDate === null && bDate === null) return 0;  // preserve insertion order
  if (aDate === null) return 1;   // nulls last
  if (bDate === null) return -1;  // nulls last
  return aDate.localeCompare(bDate);  // lexicographic = chronological for YYYY-MM-DD
})
```

Stable sort (ES2019+) preserves insertion order for equal keys (both null, or
same `arrived_on`) — matches the BRD's "existing insertion order is preserved."

### 4. Interaction with DP-04 — three-source precedence

**Explicit place dates > hotel dates > trip dates.**

```
displayDateRange(place, hotelItems, trip):
  if place.arrived_on IS NOT NULL OR place.departed_on IS NOT NULL:
    return { from: place.arrived_on ?? null, to: place.departed_on ?? null }
  else if hotelItems.length > 0:
    return { from: min(check_in_date), to: max(check_out_date) }  // across hotels at this place
  else:
    return { from: trip.start_date, to: trip.end_date }
```

Explicit place dates win because DP-05 is a direct, deliberate user statement
("I was in Paris June 1–5") that should not be silently overridden by a hotel
booking; the user controls this by leaving the fields null if they want hotel
dates to show instead. If only `arrived_on` is set, the display shows an
open-ended range ("from June 1") rather than falling back to the trip end date —
the user has explicitly started a date record for this place. Ordering
(`arrived_on`, frontend sort) and display (`resolvePlaceDateRange(place, items,
trip)`, a pure utility) are kept as separate concerns in code; no derived/computed
date-range column is stored.

### 5. Edge cases

- **Partial dates:** `arrived_on` without `departed_on` is valid (e.g. arrival
  known, departure not yet decided). `departed_on` without `arrived_on` is also
  schema-permitted but treated as undated for sort purposes (nulls last) — if
  this proves confusing in practice, a service-layer rule ("`departed_on` implies
  `arrived_on`") can be added without a schema change.
- **Overlapping place dates across a trip:** No validation. Same-day
  transitions in multi-city trips are legitimate; enforcing non-overlap would be
  incorrect.
- **Dates outside the trip's date range:** Warn, don't block. A `warnings: [...]`
  field in the response body surfaces the discrepancy (e.g. side-trip extends
  past the trip window) without losing data or affecting HTTP status.
- **Trip dates change after place dates are set:** No retroactive validation or
  clearing — consistent with how hotel check-in/check-out already behaves when
  trip dates change.
- **Deleting a place:** Dates live on the `trip_places` row and are removed
  atomically with it — no orphan concern.

### Implications

- **DATABASE:** add `arrivedOn`/`departedOn` to `tripPlaces` in `schema.ts`;
  generate + review + apply the migration (`ALTER TABLE ADD COLUMN` only).
- **BACKEND:** update `CreatePlaceSchema`, add `UpdatePlaceSchema`; update
  `placeRepository` (`create`, `findByTrip`, new `update`) and
  `tripRepository.getPlaces()`; add the `PATCH /:placeId` route handler; return
  the new fields from every place-read response.
- **FRONTEND:** add `arrived_on`/`departed_on` date pickers to the place
  create/edit UI; add the `byArrivedOn` client-side sort in the trip detail
  component; update `resolvePlaceDateRange()` with the three-source precedence
  rule; surface the out-of-range warning in the UI.
- **Effort:** ~10 hours total across backend + frontend — additive schema change,
  one new endpoint, no table recreation. Full estimate breakdown in
  `jobs/architect/tech/ADL-24-place-date-ranges.md` (superseded by this entry;
  retained for the detailed effort table only).

---

## ADL-25 — Backend db typing: narrow to SQLite now; Postgres migration is a Phase 2 cutover

**Date:** 2026-03-21
**Status:** Decided — resolves COO inbox 2026-03-21 22:00
**Triggered by:** ~40–50 TypeScript type errors across `repositories/` and `routes/` from the `AppDatabase = LibSQLDb | PgDb` union type

---

### 1. Problem

`src/backend/db/index.ts` exports `AppDatabase = LibSQLDb | PgDb` (a union of the Drizzle libSQL and node-postgres instances). TypeScript cannot call Drizzle query-builder methods on this union because `LibSQLDatabase` and `NodePgDatabase` belong to completely separate class hierarchies with no shared callable ancestor — `LibSQLDatabase` extends `BaseSQLiteDatabase<'async', ResultSet, TSchema>` (sqlite-core) while `NodePgDatabase` extends `PgDatabase<NodePgQueryResultHKT, TSchema>` (pg-core). Every call site that does `const db = getDb(); db.select()...` produces TS2349.

---

### 2. Option C ruled out — no usable generic Drizzle db type

Investigation of `node_modules/drizzle-orm` type definitions confirms:

- `BaseSQLiteDatabase` (sqlite-core/db.d.ts) and `PgDatabase` (pg-core/db.d.ts) do **not** share a common abstract base class or interface in Drizzle's type system.
- There is no exported `AnyDatabase`, `BaseDatabase`, or dialect-agnostic query-builder type in Drizzle ORM that covers both SQLite and PostgreSQL.
- Both classes define `.select()`, `.insert()`, `.update()`, `.delete()` etc. independently — the signatures are not intersectable by TypeScript because the table type parameters (`SQLiteTable` vs `PgTable`) are different and not related by inheritance.

**Option C is not viable.** No Drizzle generic type exists that would allow calling query methods on a variable typed as "either SQLite or Postgres."

---

### 3. Timeline decision: Postgres migration is a Phase 2 cutover, not near-term work

The iOS scope decision (2026-03-11) states "Drizzle schema should target both SQLite and Postgres/Turso." This is a schema design constraint — it means the table definitions in `schema.ts` must be written in a way that can be re-expressed in PostgreSQL when Phase 2 arrives. It does **not** mean the runtime database connection must support both dialects simultaneously today.

The current phase is Phase 1. There is no timeline for Phase 2 (hosted/cloud). The application runs exclusively against SQLite via libSQL. There is no Postgres deployment, no Postgres test environment, and no near-term work item that requires a live Postgres connection.

**Decision: the Postgres migration timeline is indefinite — it is Phase 2 work, not planned work.**

Paying the abstraction cost of Option B (a typed repository interface satisfying both dialects) before a Postgres deployment exists would be engineering for a speculative future. The interface would need to be tested against real Postgres behaviour to be meaningful; untested, it provides false confidence. The right time to build the dual-dialect abstraction is when Phase 2 begins and a Postgres instance is available.

---

### 4. Decision: Option A — narrow `getDb()` to return `LibSQLDb` now

**Fix:**

1. Change `getDb()`'s return type from `AppDatabase` (the union) to `LibSQLDb` (the SQLite instance type only).
2. The `AppDatabase` union type alias and the `PgDb` type alias may be retained as documentation, or removed. If retained, they must **not** be used as parameter/return types at any call site.
3. The Postgres branch (`createPostgresDb()`) in `db/index.ts` remains in the file — it is the Phase 2 entrypoint and deleting it would require re-writing it later. It simply does not affect the type of `getDb()`.

**Concrete TypeScript pattern for `db/index.ts`:**

```typescript
type LibSQLDb = ReturnType<typeof drizzleLibSQL<typeof schema>>;
type PgDb     = ReturnType<typeof drizzlePG<typeof schema>>;

// AppDatabase is retained as a documentation alias only.
// It is NOT used as the return type of getDb().
export type AppDatabase = LibSQLDb | PgDb;

let _db: LibSQLDb | null = null;

export function getDb(): LibSQLDb {
  if (_db) return _db;
  // ... sqlite branch only populates _db
}
```

All repository files and route files that call `const db = getDb()` will automatically resolve `db` to `LibSQLDb` — a concrete `BaseSQLiteDatabase<'async', ResultSet, typeof schema>` — and the TS2349 errors will clear without any changes to the call sites.

---

### 5. What "schema must target both dialects" means in practice

The iOS scope constraint is satisfied at the **schema definition** level, not the runtime type level:

- `schema.ts` uses `sqliteTable`, `text`, `integer`, `real` — all of which have PostgreSQL analogs in Drizzle (`pgTable`, `varchar`/`text`, `integer`, `real`). When Phase 2 begins, a parallel `schema.pg.ts` (or inline `if DB_TYPE === 'postgres'` branch) can be generated mechanically from the existing definitions. Column names and relationships are identical; only the builder imports change. This is what ADL-04 already specifies.
- The existing `DB_TYPE` environment variable switch in `db/index.ts` is the correct Phase 2 entrypoint. When Phase 2 starts: (a) generate the Postgres schema file, (b) update `getDb()` to return `LibSQLDb | PgDb` (the union), (c) fix the type errors that emerge at that point using Option B or C (whichever is feasible with the Drizzle version then in use). That is the correct sequencing.

---

### 6. Why not Option B now?

Option B (typed repository interface) is the correct long-term architecture if dual-dialect support is required simultaneously (e.g. running tests against SQLite while production runs Postgres). It is not warranted today because:

- The test environment also uses SQLite (`DB_TYPE=sqlite`, `SQLITE_PATH=./dev.db` or `./e2e.db`). There is no scenario in the current phase where two dialect implementations of the interface would be exercised.
- The interface boundary would be unverified against Postgres. A typed interface that has never been tested against the second implementation is a liability, not an asset — it creates the illusion of portability.
- The ADL-18 repository layer already provides the correct seam: when Phase 2 arrives and a Postgres instance exists, the repositories are the right place to introduce a dialect-aware abstraction. The current `getDb()` factory is the right place to return the correct concrete type.

Option B is deferred to Phase 2, not rejected permanently.

---

### 7. Implications

- **BACKEND (immediate):** Change `getDb()` return type from `AppDatabase` to `LibSQLDb`. No other file changes are required — the 40–50 type errors are all downstream of the return type of `getDb()` and will clear automatically.
- **db/index.ts:** `AppDatabase` union alias may remain as a comment / future marker. `PgDb` alias and `createPostgresDb()` function remain unchanged (Phase 2 entrypoint).
- **schema.ts:** No change required. The SQLite schema definitions already satisfy the "must be re-expressible in Postgres" constraint per ADL-04.
- **Phase 2 (future):** When Postgres deployment begins, restore the union return type, expose both dialect implementations, and address the resulting type errors at that time using Option B (repository interface) or whatever Drizzle generic type support exists in the then-current version.
- **No other ADL is affected.** ADL-04, ADL-18, and the iOS scope decision are all consistent with this approach.

---

## ADL-26 — Region-aware map click filtering

**Date:** 2026-03-21
**Status:** Decided
**Tracker:** MAP-01 | **GitHub:** #52
**Full ADL:** `jobs/architect/tech/ADL-26-region-aware-map-filtering.md`

**Decision:** Filter granularity for map clicks is determined by which MapLibre layer was clicked (`countries-fill` vs `regions-fill`), not by zoom level or an API flag. A region click filters by ISO 3166-2 code (`?region=US-CA`); a country click filters by country code (`?country=US`).

**Key finding:** The `City` object in the trip summary API response does not currently expose `iso_3166_2`. The backend must add `region_iso: string | null` to the city serialisation (joined from `cities → regions`). The frontend filter matches `place.city.region_iso === regionFilter`.

**`filterAndSortTrips` change:** Replace the `_regionFilter` stub with a `regionFilter !== null` branch that uses `places.some((p) => p.city.region_iso === regionFilter)`, with priority order: city > region > country.

**No new endpoints. No schema migration. No shading API changes.**

**Implications:**
- **Backend:** Add `regions` join to the trips summary query; include `region_iso` in city serialisation.
- **Frontend:** Add `region_iso: string | null` to the `City` type; implement `regionFilter` matching in `filterAndSortTrips`; rename parameter from `_regionFilter` to `regionFilter`.
- Both agents are unblocked on MAP-01 immediately.


---

## ADL-27 — Admin panel role model

**Date:** 2026-03-23
**Status:** Decided
**Tracker:** OP-06, NR-14
**Full ADL:** `jobs/architect/tech/ADL-27-admin-role-model.md`

**Decision:** Add `is_owner: integer NOT NULL DEFAULT 0` to the `users` table. Owner status is seeded at startup from `OWNER_CLERK_ID` env var using an idempotent `setOwner()` call. A new `requireOwner` middleware checks `req.user.isOwner === 1` and returns 403 otherwise. Applied to all admin writes, shading config updates, and city creation.

**Key rationale:** DB enforcement (not env var comparison per request) is the primary control. Survives misconfiguration safely (lockout not escalation). Adds no extra query per request — `is_owner` is returned as part of the existing `findOrCreateByClerkId` user row lookup during auth.

**Implications:**
- Schema migration: `ALTER TABLE users ADD is_owner integer NOT NULL DEFAULT 0`
- New `requireOwner` middleware in `src/backend/middleware/auth.ts`
- `req.user` type extended with `isOwner: number`
- `OWNER_CLERK_ID` env var documented in `.env.local.example`
- Contract tests must seed `is_owner = 1` for owner-required tests

---

## ADL-28 — Per-user map shading config and companions

**Date:** 2026-03-23
**Status:** Decided
**BRD refs:** AD-07, AD-08, AD-09 | **Depends on:** ADL-27
**Full ADL:** `jobs/architect/tech/ADL-28-per-user-shading-companions.md`

*(Backfilled pointer, 2026-07-07 — the full ADL was delivered 2026-03-23/24 and referenced
from the tracker, but this log entry was never appended; gap flagged by the doc-integrity
audit, `audits/session-a-doc-integrity.md` §17.)*

**Decision:** Map shading config and companions become per-user. `map_shading_config` gains
a `userId` FK with composite PK (`state_key`, `user_id`) and lazy per-user seeding on first
access; `companions` gains a `userId` FK with UNIQUE (`user_id`, `name`) and moves from
`/api/admin/companions` (`requireOwner`) to a new `/api/companions` router (`requireAuth`).
Categories and activities stay global (AD-09). Cross-user companion assignment is validated
in `tripRepository`.

---

## ADL-29 — Security enforcement mechanisms

**Date:** 2026-03-23
**Status:** Decided
**Tracker:** OP-06, NR-14
**Links:** OP-06 hardening checklist (`jobs/architect/tech/OP-06-hardening-checklist.md`), ADL-27

**Decision:** Two enforcement layers are adopted to prevent OP-06 compliance regressions on new work:

1. **Security regression test suite** — a dedicated contract test file `src/backend/routes/__tests__/security.access-matrix.test.ts` that exercises every route in the access matrix against three scenarios: unauthenticated (401), non-owner authenticated (403 on owner-only routes), and cross-user data isolation (SE-02/SE-03/SE-04/SE-05). These tests run as part of `npm run test:contract` on every PR.

2. **Custom Semgrep rules** — project-specific rules at `.semgrep/security.yml` integrated into the existing `security.yml` CI workflow. Rule 1 flags Express route handlers in `src/backend/routes/` that lack auth middleware. Rule 2 flags Drizzle `db.select().from(trips/trip_places/items)` calls without a `userId` scope in the `where` clause.

**Rationale:** The OP-06 checklist is a point-in-time audit. It establishes the security baseline but provides no enforcement guarantee for future work. A new route added next week receives zero coverage unless a CI gate exists. The two layers are complementary: the regression tests catch runtime failures (wrong status codes, data leaking across users); Semgrep catches structural failures at static analysis time before the code even runs. Together they close the gap between "we audited this once" and "we enforce this on every commit".

**Alternatives considered:**
- Point-in-time manual re-audit — rejected: does not scale, not triggered by PRs, depends on human discipline.
- Contract tests only, no Semgrep — rejected: tests verify existing routes but cannot catch a new route that was never added to the test file.
- Semgrep only — rejected: static patterns are imprecise (false positives on router-level middleware); runtime tests provide ground truth.

**Implications:**
- `src/backend/routes/__tests__/security.access-matrix.test.ts` — new file, implemented by Backend/QA agent per spec in `jobs/COO/inbox/20260323T000000Z-ARCHITECT-security-enforcement.md`
- `.semgrep/security.yml` — new file, implemented by Backend agent per spec in same inbox file
- `.github/workflows/security.yml` — add `--config .semgrep/security.yml` to the Semgrep step
- Both enforcement artefacts must be kept current when the route table changes; the implementing agent brief must note this maintenance obligation

---

## ADL-30 — DEP-01: drizzle-orm 0.45.2 upgrade ruling & drizzle-kit residual acceptance

**Date:** 2026-07-07
**Status:** Decided
**Tracker:** DEP-01 | **GitHub:** #98 | **Depends on:** ADL-15
**Full ADL:** `jobs/architect/tech/ADL-30-dep01-drizzle-upgrade.md`

*(Numbering note: the dispatching brief assigned ADL-29 to this ruling, but ADL-29 was
already taken above; this ruling is ADL-30. Next free number: ADL-31.)*

**Decision 1 — drizzle-orm 0.38.4 → `^0.45.2`, upgraded NOW inside the DEP-01 pass.**
Resolves HIGH advisory GHSA-gpj5-g38j-94v9 (identifier-escaping SQL injection). Our code
never hits the vulnerable path (zero `sql.identifier()`/`.as()`/`sql.raw()` usage; all
`orderBy` calls use static column refs), but accepting a HIGH would leave the
`npm audit --audit-level=high` CI gate permanently red. Cost is low: **no drizzle-kit bump
required** — kit 0.31.9 requires ORM `compatibilityVersion = 10` and orm 0.45.2 still
exports 10 (verified against the published tarball), so the ADL-15 patch
(`patches/drizzle-kit+0.31.9.patch`) remains valid. Changelog survey 0.39→0.45 found no
SQLite/libSQL breaking changes; the one behavior change (0.44.0 `DrizzleQueryError`
wrapping driver errors) is inert here because the backend never matches on driver error
codes.

**Decision 2 — drizzle-kit/esbuild moderate cluster (4 findings): residual ACCEPTED.**
Dev-only esbuild dev-server advisory reached via drizzle-kit's deprecated esbuild-kit
config loader; drizzle-kit never runs esbuild's serve mode and is not in the runtime
bundle. npm's suggested fix (`drizzle-kit@0.18.1`) is a downgrade violating ADL-15 —
rejected. Moderates do not fail the `--audit-level=high` gate, so no gate exception is
needed. Revisit trigger: drizzle 1.0 GA → paired orm+kit upgrade as its own tracked issue,
with mandatory re-verification of the four patched SQLite bugs.

**Implications:**
- Backend DEP-01 brief: pin `drizzle-orm@^0.45.2`, keep `drizzle-kit@0.31.9` exact,
  verify patch-package applies, `db:generate` reports no schema changes, full test suites
  plus constraint-error spot check, update `_project/security-backlog.md` npm-audit
  section in the same PR (accepted residuals recorded with rationale). Full checklist in
  ADL-30 §Instructions.
- `db:push` remains forbidden; Node/CI runner versions untouched (out of scope).

---

## ADL-31 — OP-16: main-branch push-triggered CI stall ruled transient GitHub-side incident

**Date:** 2026-07-19
**Status:** Decided — issue closed, no code change
**Tracker:** OP-16 | **GitHub:** #144 (closed) | **Related:** OP-17/#146 (distinct root cause, see note)

**Decision:** Close OP-16 as a **transient GitHub-side incident**, not a repo defect. On
`main`, push-triggered `CI` and `Security Checks` runs (`on: push: branches: ["**"]`) stopped
firing after commit 911eccf (OP-13, 2026-07-19 05:18 UTC). Five squash-merges over the next
~18.5 hours (OP-14 #134, BRD v3.0 #130, BUG-28 #139, BUG-10 #141, BUG-29 #142, all ~18:02–18:18 UTC)
produced no push-triggered run on main. Delivery then resumed on its own with BUG-27 #140
(2026-07-19 23:50 UTC) and has fired correctly for every subsequent merge — #140, #145, #147,
#148, #149: **five consecutive clean push-triggered runs, all `success`**, spanning and closing
the incident window. No repo-side change was made to cause the resumption.

**Why transient and not a config defect — the evidence combination, not the count alone:**
- The original COO report exhaustively eliminated every repo-controllable cause: workflow
  files byte-identical across the gap, both workflows `state: active`, Actions permissions
  `enabled: true`/`allowed_actions: all`, no branch protection on main, identical authorship
  (ryanv11) to the last commit that *did* trigger, and not a general outage (PR-triggered and
  feature-branch push-triggered runs fired normally throughout). With no repo-side lever left,
  the residual explanation is provider-side by elimination.
- A confirmed same-night GitHub Actions API incident correlates: repeated 503s
  ("No server is currently available") across `actions/runs/{id}`, `actions/jobs/{id}/logs`,
  and `actions/workflows/{id}` while the plain REST API responded normally — i.e. degradation
  isolated to the Actions subsystem, the same subsystem that delivers push-trigger events.
- The symptom was a binary ON→OFF→ON state change with a well-defined start and a
  self-resolution requiring no intervention — the signature of an incident, not a latent
  misconfiguration (which would not spontaneously heal).
- Zero recurrence across five consecutive merges after resumption.

This is why 5-for-5 is sufficient here and a larger N is not required: this is not a flaky-test
false-positive-rate problem where samples buy statistical confidence. The repo-config hypothesis
was already dead (nothing repo-side changed, yet behaviour changed twice); what remained was to
confirm the OFF state neither persisted nor recurred, and five clean fires across the incident's
close does exactly that. Confidence: High that this is not a repo-config defect; High that no
further action is warranted. The one honest residual is the *specific* attribution to that
night's Actions incident — a strong confirmed correlation, not proof of causation — which does
not change the disposition.

---

## ADL-32 — Hosted deployment: Railway (compute) + Turso (database), resolves OQ-04

**Date:** 2026-07-20
**Status:** Decided — Backend (PR #176) and Database (PR #175) implications both merged
2026-07-21; pending live Railway deploy verification against §10 success criteria and the
§6 Clerk-origin follow-up (see BRD-NF09 tracker entry for the current punch list)
**Tracker:** BRD-NF09 | **BRD ref:** NF-09, NF-03, OQ-04

**Triggered by:** PO request (2026-07-20) to work through a hosted deployment plan.
BRD v3.0 promoted hosting (NF-09) to the near-term roadmap and opened OQ-04 (hosting
platform + hosted-libSQL vs. file DB) as a precondition — per the BRD gate rule, BRD-NF09
cannot be briefed until OQ-04 is resolved by an Architect ADL.

### 1. Problem

The app currently runs as two local dev processes (Vite on 5173, Express on 3001) against
a local SQLite file (`SQLITE_PATH=file:./dev.db`). NF-09 requires this to become a hosted
web app reachable from the PO's devices over the internet with real Clerk authentication,
while keeping local development fully supported. Two decisions were open: (a) which
compute platform hosts the Express service, and (b) whether the database stays file-based
on that host or moves to a hosted libSQL provider (Turso), per NF-03.

### 2. Compute platform — options considered

| Option | Cost (personal, low-traffic) | Assessment |
|---|---|---|
| Fly.io | ~$0–3/mo, usage-based | Cheapest; autostop/autostart has a short (~1–2s) cold-start on wake; GH Actions deploy is hand-rolled (`flyctl deploy` step) |
| **Railway** | ~$5/mo flat (Hobby plan) | No cold starts on Hobby; native GitHub integration (auto-deploy `main`, **automatic PR preview environments**); less deploy glue to hand-write |
| Render | $0 free / $7/mo always-on | Free tier sleeps after 15min idle with ~30–60s cold start — conflicts with MB-01/MB-02 (phone lookup while travelling); ruled out |
| VPS (Hetzner/DO) | ~$4–6/mo | Full control, but owner carries OS patching, TLS, process supervision — pure ops burden with no benefit for a single-user app |

**Decision: Railway (Hobby plan).** Render is ruled out by its own cold-start behaviour
against MB-01/MB-02. A VPS adds ops burden with no compensating benefit for a one-user
app. Fly.io is marginally cheaper, but Railway's native per-PR preview environments are a
direct answer to a recurring project pain point (changes that work locally but break only
once actually deployed/running as a live server — CORS against a real origin, static-asset
serving, migration behaviour against a real remote DB) that CI's test suites do not catch
because they never run the app as a live hosted server. That capability, plus zero cold
starts and less deploy glue to maintain, is judged worth the ~$5/mo over Fly.io's ~$0–3/mo.
PO confirmed 2026-07-20.

### 3. Database — options considered

| Option | Assessment |
|---|---|
| Stay file-based (Railway volume) | Zero code change, but ties DB lifecycle to one compute instance/region and the owner must build their own backup/snapshot discipline for what becomes irreplaceable real trip data |
| **Turso (hosted libSQL)** | Free tier is ample for personal use; managed backups/point-in-time recovery without building it; decouples DB from compute. Migration cost is trivial — `@libsql/client`'s `createClient()` already accepts a remote `libsql://` URL + `authToken` natively (`src/backend/db/index.ts:110`), so this is a one-line change to the existing SQLite branch, not a schema or ORM rewrite |

**Decision: Turso**, for both the production database and a second, separate **staging**
database used only by PR preview environments (see §6). This directly satisfies NF-03
("hosting may move this to a hosted libSQL service (e.g. Turso)").

### 4. Confirms ADL-25 is unaffected

ADL-25 narrowed `getDb()` to return `LibSQLDb` (not the `AppDatabase` union) because there
was no near-term Postgres deployment. Turso does not change this: it is still libSQL,
still the same `@libsql/client` / `BaseSQLiteDatabase` type, reached via a remote URL
instead of a local file path. No dialect union, no repository-layer changes, no schema
changes. ADL-25's reasoning and `db:generate`/`db:migrate` workflow (ADL-15) both carry
over unchanged to the hosted database.

### 5. Deployment topology

- **Single Railway service** serves both the API and the built frontend
  (`express.static` on the Vite `dist/` build + SPA fallback for client-side routes) —
  simplest topology for a single user; avoids a second static host with its own
  CORS/domain surface.
- **Production environment:** tracks `main`; env vars point at the production Turso
  database.
  > SUPERSEDED (2026-07-21) by ADL-35 — the Production environment now watches a long-lived
  > `production` branch, promoted by explicit fast-forward from a soaked `main` commit, not
  > `main` directly. The production Turso env-var binding is unchanged. Retained for history.
- **Preview environments:** Railway auto-deploys one per open PR; env vars point at a
  **separate, shared staging Turso database**, seeded via the existing `npm run db:seed`.
  Preview environments must never hold production Turso credentials — this is the
  guardrail that keeps a broken preview build (or QA poking around in one) from touching
  real trip history.
- `HOST` is set to `0.0.0.0` in both hosted environments (the code comment in
  `.env.example` already anticipated this: "Set 0.0.0.0 in Phase 2 behind proxy"). Local
  dev is unaffected and stays `127.0.0.1`.
- Migrations: `npm run db:migrate` runs before the server starts, in both production and
  preview, against whichever Turso instance that environment's env vars target —
  preserving the migrate-only rule (ADL-15, no `db:push`) in hosted environments too.

### 6. Open implementation risk — Clerk origins for dynamic preview URLs

Each Railway PR preview gets a unique generated URL. The backend's own CORS/`azp`
allowlist (`ALLOWED_ORIGINS`, HC-02) can likely reference Railway's per-environment domain
variable and be set dynamically per preview. **Unverified:** whether Clerk's own allowed
origins/redirect configuration (a separate list, not `ALLOWED_ORIGINS`) supports dynamic
or wildcard preview domains on the current Clerk plan. Whoever implements this brief must
verify against Railway's actual generated URL pattern and Clerk's dashboard options. If
Clerk cannot be configured for dynamic preview origins, the fallback is scoping
`BYPASS_AUTH=true` to preview environments only (the same mechanism already used for
contract tests/CI) — but that would mean preview environments don't exercise real auth,
which narrows what they're useful for catching. This is flagged as an open risk, not a
blocker to the platform decision.

### 7. Env vars — new / changed

- New: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (production); a second pair of the same
  for the staging instance, scoped to the preview environment only
- Changed: `SQLITE_PATH` becomes the Turso `libsql://` URL in hosted environments
  (`DB_TYPE` stays `sqlite` — no change to the `DB_TYPE` switch in `db/index.ts`)
- Changed: `HOST=0.0.0.0`, `NODE_ENV=production` in hosted environments
- Changed: `ALLOWED_ORIGINS` includes the Railway-assigned domain per environment
- Unchanged/carried over: `CLERK_JWKS_URI`, `CLERK_ISSUER`, `OWNER_CLERK_ID` — set per
  environment via Railway's variable store, never in a committed file
- `BYPASS_AUTH` remains unset in production (existing fatal-error guard on
  `NODE_ENV === 'production'` stays as-is)

### 8. Cost

Railway Hobby: ~$5/mo flat (includes usage credit). Turso: $0 (both production and
staging databases fit comfortably within the free tier for personal-use volumes).
**Total: ~$5/month.**

### 9. Implications

- **BACKEND:**
  - Add `express.static` serving of the Vite `dist/` build with SPA fallback routing (no
    static serving exists today — dev only runs the two-process Vite/Express split)
  - `src/backend/db/index.ts`: add `authToken` to the `createClient({ url, authToken })`
    call in the SQLite branch, reading `TURSO_AUTH_TOKEN` from the environment (optional,
    undefined for local file-based dev)
  - Confirm `ALLOWED_ORIGINS` / `azp` validation (HC-02) works against a Railway-assigned
    domain, and resolve the Clerk dynamic-preview-origin question in §6
- **DATABASE:** Provision the staging Turso database and seed strategy (`db:seed` on
  creation; document a reset cadence so preview environments don't accumulate cruft)
  — **delivered** (chore/nf09-staging-seed-strategy): `db:seed` confirmed to need no
  changes (already transport-agnostic via `getDb()`); `db:migrate` verified clean
  against a fresh empty database; new `npm run db:reset-staging` script + reset
  cadence documented in `jobs/database/tech/20260721-staging-reset-runbook.md`. That
  thread also found and fixed a gap this bullet didn't cover: `drizzle.config.ts`
  (drizzle-kit's own connection, separate from `db/index.ts`'s runtime one) had no
  path to a Turso auth token and needs `dialect: 'turso'` (not `'sqlite'`) to accept
  one at all — see the runbook §4 for detail. `db/index.ts` itself untouched (Backend's
  parallel brief, per ADL-32 §9 above).
- **No FRONTEND changes** beyond the existing `npm run build` output — the build step is
  unchanged, only where it's served from is new

### 10. Success criteria (BRD-NF09 / NF-09)

Required before BRD-NF09 can be marked done — added per the "success criteria before
dispatch" gate, since none existed for NF-09 previously:

- [ ] Production URL reachable over HTTPS from a phone browser on cellular data (not
      same-network/VPN)
- [ ] Clerk sign-in works end-to-end against the production instance (owner account)
- [ ] Data persists across a deploy — a trip created before a deploy is still present
      after it
- [ ] A PR preview environment deploys automatically for an open PR and is reachable at
      its generated URL
- [ ] Preview environment's database is confirmed isolated from production (writes made
      in a preview never appear in the production Turso database)
- [ ] CI green + Railway deploy succeeds on merge to `main`

### 11. Next steps

- **PO/Ryan:** create Railway account + project; create two Turso databases (production,
  staging); obtain connection URLs and auth tokens
- **COO:** dispatch a Backend brief (static serving, `db/index.ts` authToken support,
  migrate-on-deploy, §6 Clerk-origin verification) and a Database brief (staging DB seed
  strategy) once the above provisioning exists
- **COO:** BRD version bump and tracker update for this decision (this session,
  `chore/adl-32-hosted-deployment`)

**Alternatives considered:**
- Longer observation window (e.g. 10–15 more merges) before closing — rejected: the marginal
  evidence is low-value once the repo-config hypothesis is eliminated and the external correlate
  is confirmed; the recurrence-reopen clause below already covers the tail risk at zero cost.
- Escalate to GitHub Support now — rejected: the incident self-resolved and left no reproducer;
  support has nothing actionable to investigate. Re-escalation is warranted only on recurrence.
- Keep open indefinitely as "unexplained" — rejected: "started working again" plus an eliminated
  repo-side cause and a confirmed external correlate is an adequate explanation for a P2 CI
  observability issue; an open ticket with no owner action is worse hygiene than a documented close.

**Implications:**
- Interim mitigation is **retained as cheap standing insurance**: post-merge verification falls
  back to a throwaway no-op PR probe against main's tip when `gh run list --branch main` shows
  nothing new since the last known-good run. This costs nothing and de-risks any future silent
  stall regardless of cause. (Documented in the OP-16 tracker note and the COO post-merge check.)
- **Recurrence-reopen clause:** if push-triggered main CI silently stalls again, reopen OP-16;
  the original report's repo-side ruling-outs still stand, and recurrence would move this from
  "transient incident" to a reproducible pattern warranting direct Architect + GitHub Support
  investigation.
- No source, workflow, or config change. `.github/workflows/ci.yml` and `security.yml` untouched.
- OP-17/#146 (Gitleaks license failure) is explicitly **not** correlated evidence for OP-16: its
  root cause is a missing `GITLEAKS_LICENSE` secret after a gitleaks-action breaking change, fixed
  by running the pinned OSS binary directly. The 503 the Gitleaks action surfaced was incidental;
  the job would have failed regardless of Actions API health. That correlation was raised and then
  retracted by the PO on #144 — recorded here so it is not silently re-conflated later.

---

## ADL-33 — Agent read-only diagnostic access to Railway, Turso, and Clerk

**Date:** 2026-07-21
**Status:** Decided — design only; **no code/config committed with this ADL**. Firewall +
credential wiring is a follow-up COO/Backend action gated on PO provisioning the tokens
called for below. Not implemented this session.
**Tracker:** operational — needs an OP-series tracker entry (suggest **OP-21**); COO to
create. No BRD requirement ID (see §8). **BRD ref:** none — this is dev-operational
tooling, not a product requirement.

**Triggered by:** PO request (2026-07-21). While the COO was debugging a live Railway
deploy stuck "queued due to upstream GitHub issues" with no visible logs, the only way to
see error output was Ryan pasting logs back and forth by hand. Ryan asked that the
COO/Claude Code agent be given **read-only** diagnostic access to Railway, Turso, and Clerk
directly so future debugging doesn't depend on manual log-relay. Builds on ADL-32 (the
Railway + Turso + Clerk hosted stack). Scope was pre-negotiated with Ryan and is binding:
Railway read-only (logs, build status, env-var *names* not values), Turso read-only SELECT
(never write/migrate), Clerk read-only dashboard config (never write to auth config).

### 0. Summary

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| 1 | **Turso** read-only DB access | **GRANT.** Genuinely read-only is achievable — `turso db tokens create <db> --read-only` is a real DB-scoped, read-only token. Allowlist the DB connection hosts only; invoke via a `@libsql/client` script (already a dependency). Do **not** provision a platform token or allowlist `api.turso.tech`. | High |
| 2 | **Railway** read-only ops access | **GRANT WITH CAVEAT.** Railway has **no read-only token scope** — every token type carries the full permissions of its scope (a Project token can still deploy/redeploy/delete). "Read-only" is behavioural only, not enforceable. Use a **Project-scoped token** (narrowest blast radius) and treat it as a write-capable secret. | High |
| 3 | **Clerk** read-only config access | **DO NOT GRANT (recommend against).** Clerk has **no read-only credential** — the only Backend-API credential is the Secret Key (`sk_*`), which carries full write to the identity provider's config *and* full user CRUD (all PII). "Read-only Clerk config" as scoped is **not achievable**. Keep the manual-paste workflow for the rare config lookup. | High |
| 4 | Credential storage | **Separate gitignored file** (`.env.agent-diagnostics`), **not** `.env.local`. Agent-operator secrets have a different blast radius and lifecycle than the app's runtime secrets and must not be loaded into the running app process. | High |
| 5 | Invocation | Turso: `@libsql/client` one-off script (no new dep, no CLI). Railway: `@railway/cli` authenticated via `RAILWAY_TOKEN`. Proportionate — diagnostic tooling for a solo project, not infra. | High |

### 1. Problem

The sandbox firewall (`.devcontainer/init-firewall.sh`) is a default-DROP outbound
allowlist — only GitHub, npm, the Anthropic API, and a short static domain list are
reachable. None of Railway, Turso's platform/DB hosts, or Clerk's management API are
reachable, so the agent cannot read a deploy log, run a debugging SELECT, or check an
auth-config value without Ryan copying it in by hand. The ask is to close that gap
**read-only**. Two things have to be true for each service: (a) the API/DB host must be
allowlistable, and (b) a genuinely read-only credential must exist — otherwise granting
API reach necessarily hands over more power than "read-only" implies. The three services
answer (b) very differently, which is the whole substance of this decision.

### 2. Turso — GRANT (clean read-only)

**Hosts to allowlist:** the two database connection hosts only —
`libsql://<db>-<org>.turso.io` and its regional form `<db>-<org>.<region>.turso.io`
(HTTP form `https://<db>-<org>.turso.io`), for **both** the production and staging
databases provisioned under ADL-32. The firewall resolves and pins A-records, so both the
prod and staging hostnames must be listed explicitly.

**Read-only is real and DB-scoped.** `turso db tokens create <database-name> --read-only`
(`-r`) mints a token restricted to read-only access on that one database (verified against
current Turso CLI docs). This is the one service where the requested scope is achievable
exactly as asked: read-only, per-database, no broader reach.

**Deliberately NOT included:** the Turso **Platform API** (`api.turso.tech`) and any
platform/account token. The Platform API is infrastructure management (create/destroy
databases, rotate tokens, read org billing) — an account-scoped token there is *not*
read-only and is not needed to run a debugging SELECT. Keeping `api.turso.tech` off the
allowlist and using only per-DB `--read-only` tokens means the agent can read data but has
no path to touch database lifecycle. This is strictly better than the naive "give the agent
Turso access" and costs nothing.

**Prefer staging over production.** For schema/shape/logic debugging, point queries at the
**staging** database (seeded, no real trip data). Only query the production Turso database
when the bug is specifically about production data — see §6 residual risk.

### 3. Railway — GRANT WITH CAVEAT (no enforceable read-only)

**Host to allowlist:** `backboard.railway.com` — this is both the GraphQL API
(`https://backboard.railway.com/graphql/v2`) and the host the `railway` CLI streams deploy
logs from (over WebSocket). Older docs reference `backboard.railway.app`; the implementer
must confirm the exact host(s) the installed CLI actually dials (a quick check of CLI
traffic) and allowlist what it uses — do not assume from docs alone.

**No read-only scope exists — this is the finding to flag, not paper over.** Railway's
token model has three types (Account, Workspace, Project) and none is read-only: each
carries the full permissions of its scope. A Project token — the narrowest — can still
trigger deploys, redeploys, and deletions within that project. There is no scope, service
account, or fine-grained permission control that yields "logs + status + var names, nothing
else." Per Ryan's binding scope decision (read-only) and the "don't quietly widen scope"
instruction, I am **not** working around this by pretending a Project token is read-only.
Instead:

- **Use a Project-scoped token** for the single production Railway project. This does not
  make it read-only, but it bounds the blast radius to that one project (vs. an Account
  token's reach across the whole Railway account/workspace).
- **The "read-only" guarantee is behavioural:** the agent issues only read operations
  (`railway logs`, `railway status`, `railway variables` for names). This is an operating
  convention, not an enforced boundary — the token *could* deploy or delete. It must
  therefore be treated as a **privileged, write-capable secret** in storage and handling
  (§5, §6), even though its intended use is read-only.

Net: Railway access is worth granting for the log-relay pain it removes, but with eyes open
that the read-only property is a discipline, not a wall. If Railway ships read-only tokens
later, switch to one and drop the caveat.

### 4. Clerk — DO NOT GRANT (read-only not achievable; highest stakes)

**Would-be host:** `api.clerk.com` (Backend API v1). *This is distinct from
`just-raptor-89.clerk.accounts.dev` already in the firewall* — that existing entry is the
app's runtime JWKS endpoint for verifying Clerk tokens, and it does **not** provide any
management/config read.

**There is no read-only Clerk credential.** The only credential that authenticates the
Backend API is the Secret Key (`sk_*`), and it is all-permissions: the same key that
`GET`s instance config also `PATCH`es `allowed_origins`, and carries full user CRUD — read
every user's PII, create users, delete users. Clerk's newer "API keys" feature is
machine-auth for *the app's own end users*, not a scoping mechanism for management/dashboard
access, so it does not help here. "Read-only Clerk config" as Ryan scoped it is therefore
**not achievable** — any API reach into Clerk is write reach into the identity provider.

**Recommendation: do not provision a Clerk token for the agent.** Clerk is the highest-stakes
of the three (it is the identity provider), the diagnostic need is low-frequency (allowed
origins / redirect URLs, checked occasionally, e.g. the ADL-32 §6 preview-origin question),
and all of that config is visible in the Clerk dashboard for Ryan to read or paste on the
rare occasion it is needed. Placing a full-write identity-provider secret inside the sandbox
to save a handful of manual lookups per quarter is a bad trade. This is the honest finding:
the read-only ask cannot be met for Clerk, so the correct move is to decline Clerk API
access, not to smuggle in a write-capable `sk_*` key under a "read-only" label. If a
recurring, concrete Clerk-debugging need emerges that the dashboard/paste flow genuinely
cannot serve, reopen this as its own decision with that evidence.

### 5. Credential storage

**Do not reuse `.env.local`.** `.env.local` holds the running app's runtime secrets
(loaded into the Express process via dotenv). The agent-diagnostic tokens are operator
credentials with a different blast radius and lifecycle — the app process has no reason to
carry them, and loading them there needlessly widens where they are exposed and blurs the
"these are the app's secrets" boundary.

Use a **separate, gitignored** file — `.env.agent-diagnostics` at the repo root (or under a
`.secrets/` dir) — **not** referenced by the app's dotenv load, sourced only when the agent
runs a diagnostic command. It must be added to `.gitignore` in the same PR that introduces
it (verify the ignore actually matches before any token is written into it — `.env.local`
is already ignored, but a new filename is not covered unless the pattern includes it).
Given §3, the Railway token in this file is write-capable; the file must never be echoed
into logs, PRs, or completion reports.

### 6. Residual risk (even under the granted read-only scopes)

- **Turso (granted):** read-only prevents mutation, **not disclosure** — a debugging SELECT
  against the production DB returns real user PII (trip data, and the `users` table carries
  email). Mitigation: default to the **staging** database; touch production only for
  production-data-specific bugs; query narrowly (no `SELECT *` dumps of `users`). On token
  leak the worst case is *read* of trip data on one database — the token cannot alter data
  or reach database lifecycle (no platform token, §2).
- **Railway (granted, weakest link):** deploy/build logs can leak secrets **if the app ever
  logs something sensitive** (env values, an Authorization header, a token). That is a
  separate app-hygiene concern, but it means log access is not risk-free. And per §3 the
  token itself can deploy/delete within the project — on leak, an attacker could take down
  or tamper with the deployment. Mitigations: Project-scoped token (bounds reach to one
  project), stored only in the §5 gitignored file, never echoed; treat as privileged.
- **Clerk (not granted):** no new residual risk is introduced precisely because no token is
  provisioned. For the record, had an `sk_*` key been placed in the sandbox, a leak would be
  full identity-provider compromise (read all users, create/delete users, repoint
  `allowed_origins` to enable a redirect/social-engineering attack). Declining the grant is
  what removes this risk class entirely — the reason it is the recommended call.

### 7. Deployment mechanics (why this is a next-session-boundary change)

Adding hostnames to `init-firewall.sh` only takes effect on the **next container start** —
`postStartCommand` re-runs the script (`sudo /usr/local/bin/init-firewall.sh`) at container
boot, rebuilding the ipset from scratch. **It cannot be hot-applied mid-session:** even
after the file is edited and merged, the *current* container keeps its existing ruleset
until it restarts. So the agent gains this access at the next session boundary, not the
moment the PR merges.

Second caveat for the implementer: the firewall pins **A-records resolved at start time**.
Railway and Turso sit behind CDNs (Cloudflare) that rotate edge IPs; a single start-time
`dig` snapshot may not cover every edge IP the CDN later hands out, which can cause
intermittent reachability failures within a long session — a limitation the existing
`clerk.accounts.dev` entry already shares. This is an implementation risk to validate
(confirm connectivity holds after the firewall change), not a blocker to the decision.

### 8. BRD / tracker classification

**No new BRD requirement ID.** The BRD holds product/business requirements — things a user
experiences and that get UAT'd against success criteria. Agent diagnostic access is
dev-operational tooling with no user-facing behaviour, in the same class as ADL-22 (E2E
infra) and ADL-31 (a CI incident), neither of which took a BRD ID. Creating a BRD
requirement for it would misfile operational tooling as product scope. It also answers no
open BRD question (OQ-03/OQ-05 remain the live ones; OQ-04 was hosting, closed by ADL-32),
so there is no open-question closure to record. It **does** warrant an **operational tracker
entry** (OP series — latest is OP-20, so suggest OP-21) to track PO provisioning +
follow-up implementation, mirroring OP-16/OP-20. COO to create.

### 9. Invocation mechanism (proportionate — solo-project diagnostics)

- **Turso:** a one-off Node script using the already-installed `@libsql/client`
  (`createClient({ url, authToken })` → `client.execute('SELECT …')`), reading URL + the
  `--read-only` token from `.env.agent-diagnostics`. No new dependency, no `turso` CLI (the
  CLI would drag in platform auth we deliberately avoid, §2). SQL-over-HTTP `curl` to
  `https://<db>-<org>.turso.io/v2/pipeline` is an equivalent fallback.
- **Railway:** install `@railway/cli` (`npm i -g @railway/cli`), authenticate via
  `RAILWAY_TOKEN` (the Project token) from `.env.agent-diagnostics`, use `railway logs`
  (`--build` / `--deployment`), `railway status`, `railway variables` (names). Direct
  GraphQL `curl` to `backboard.railway.com/graphql/v2` is the fallback.
- **Clerk:** not applicable — not granted (§4). Manual dashboard read / paste stays the
  flow for the rare config lookup.

### 10. Implications / next steps

- **PO / Ryan — provision before COO can implement:**
  1. **Turso:** run `turso db tokens create <prod-db> --read-only` and
     `turso db tokens create <staging-db> --read-only`; supply both tokens + both
     `libsql://…turso.io` connection URLs.
  2. **Railway:** create a **Project token** (not Account/Workspace) for the production
     project; supply it. Understand it is not technically read-only (§3).
  3. **Clerk:** nothing to provision — recommended decline (§4). If you disagree and want
     Clerk API access anyway, that is a conscious acceptance of placing a full-write `sk_*`
     identity-provider secret in the sandbox; say so explicitly and it becomes its own
     tracked decision, not a silent widening of this one.
- **COO — after provisioning exists:**
  1. Create the OP-21 (or next) tracker entry for this work (§8).
  2. Dispatch a Backend/infra brief to: add `backboard.railway.com` and the two Turso DB
     hosts to `init-firewall.sh`'s domain loop; create `.env.agent-diagnostics` + `.gitignore`
     entry; drop in the provisioned tokens; add a short runbook for the two invocation
     patterns (§9). Validate reachability after the next container start (§7), including the
     CDN A-record caveat.
  3. Do **not** add `api.turso.tech` or `api.clerk.com` to the allowlist (§2, §4).
- **No source/config change ships with this ADL.** The firewall and credential wiring are
  the follow-up brief's deliverable, gated on PO provisioning. This entry is the design
  decision only.

---

## ADL-34 — Firewall fail-open bug: init-firewall.sh aborted before applying lockdown

**Date:** 2026-07-21
**Status:** Decided and implemented — fixed as part of the ADL-33/OP-21 implementation branch,
authorized directly by PO in real-time conversation (not a separate Architect dispatch, given
the severity and that the fix is a well-contained, mechanical reordering).
**Tracker:** OP-21 (folded into the same tracker entry as ADL-33's implementation — this is
infrastructure remediation discovered while implementing that decision, not a separate product
requirement). **BRD ref:** none — operational/infra, same class as ADL-33.

**Triggered by:** while implementing ADL-33's firewall allowlist additions (adding the Turso and
Railway hosts), COO tested reachability against the *running* container and found it could reach
arbitrary external hosts (`example.com`, `api.clerk.com`) that should have been blocked entirely
by `.devcontainer/init-firewall.sh`'s intended default-deny posture.

### 1. Root cause

`init-firewall.sh` ran under `set -euo pipefail`. Its structure was: flush all iptables rules →
bootstrap DNS/SSH/localhost → fetch GitHub IP ranges → **resolve a static list of ~10 other
allowed domains, one by one, exiting the whole script (`exit 1`) if any single one failed to
resolve** → *only then* apply the default-DROP policy and the final allowlist-match/REJECT rule.

`statsig.anthropic.com`, one entry in that static list, currently resolves to a genuine `NXDOMAIN`
(confirmed via `dig`/`nslookup` — not a transient blip; likely a decommissioned/renamed telemetry
subdomain, given `statsig.com` is separately and correctly listed). Hitting that resolution
failure triggered `exit 1` — which happened *after* `iptables -F` had already flushed every prior
rule, but *before* the script ever reached the default-DROP/REJECT lines at the bottom. Net effect:
one dead domain in a static list silently left the container's outbound network **completely
unrestricted** instead of the intended GitHub/npm/Anthropic-only allowlist. This runs via
`postStartCommand` on every container start (`devcontainer.json`), so this was the actual live
state of the running container this whole session, not a one-off test artifact.

The script's own final verification block (checking `example.com` is unreachable and
`api.github.com` is reachable) was specifically designed to catch exactly this failure mode — but
it could never run, because the fatal exit happened earlier in the script. The safety check
existed; the control flow just never let it execute.

### 2. Fix

Restructured so the restrictive posture is established as early as possible, and everything after
that point is purely additive:

1. Flush rules, bootstrap DNS/SSH/localhost/host-network (as before — these are prerequisites for
   the script itself to function, not external services that can rot).
2. Create the (empty) `allowed-domains` ipset.
3. **Apply the default-DROP policy, the allowed-domains match-ACCEPT rule, and the explicit REJECT
   rule immediately** — before any external domain resolution is attempted.
4. Fetch GitHub IP ranges and resolve the static domain list, adding successfully-resolved
   entries to the (already-enforced) ipset as they come in.

Because the ipset is referenced by an iptables rule that's already active, adding entries to it
later works identically to adding them before — enforcement is dynamic, not a one-time snapshot.
This means no single domain, CIDR, or IP failure can ever leave the container in an open state
again: at worst, that one host stays unreachable (a loud, legible failure downstream — e.g. a
`git push` erroring with a connection failure) rather than a silent total loss of the firewall.

Every per-item failure path was changed from `exit 1` to a warning that's collected and printed
in a summary at the end (`FAILED_ITEMS` array), then the loop `continue`s to the next item rather
than aborting. `set -e` was removed script-wide (kept `-uo pipefail`) for the same reason — no
future edit should be able to reintroduce an early exit that skips the lockdown lines.

Also removed the dead `statsig.anthropic.com` entry (confirmed `NXDOMAIN`) rather than leaving it
in the list to print a warning on every single container start indefinitely; `statsig.com` (kept)
resolves correctly and was already separately listed.

The final `example.com`-unreachable / `api.github.com`-reachable verification block is unchanged
and still runs (and can still legitimately `exit 1` on failure) — but it now runs *after* lockdown
is already durably established, so a failure there is a "something didn't get allowlisted
correctly, go check" signal, not a symptom of an open firewall.

### 3. Verification performed

- `bash -n` syntax check: clean.
- Confirmed the original bug empirically: `sudo -n /usr/local/bin/init-firewall.sh` (the
  currently-installed, pre-fix copy — passwordless sudo is scoped to exactly that path) reproduced
  the exact failure (`ERROR: Failed to resolve statsig.anthropic.com`, script aborted).
- Confirmed `statsig.anthropic.com` is genuinely `NXDOMAIN` via `dig`/`nslookup` (not a resolver
  hiccup) and that `statsig.com` resolves correctly.
- Dry-ran the corrected control flow with `iptables`/`ipset` mocked as no-ops, injecting both a
  total GitHub-fetch failure and one broken domain among several real ones: confirmed the script
  reaches its end, collects both failures into the warning summary, and does not abort.
- **Not verified live end-to-end in this container**: the passwordless sudo grant is scoped
  specifically to the already-built `/usr/local/bin/init-firewall.sh` (root-owned, not writable by
  the `node` user), not the repo copy this ADL modifies. The corrected script will first run for
  real via `postStartCommand` on the *next* container start/rebuild (same deployment-mechanics
  caveat as ADL-33 §7) — that first real run is the outstanding verification step, not yet done.

### 4. Implications

- No app code touched — this is entirely within `.devcontainer/init-firewall.sh`.
- Ships in the same PR/branch as the ADL-33 implementation (Turso/Railway hosts added to the
  allowlist, `.env.agent-diagnostics` credential file, diagnostic script) — both were being worked
  in the same session and the bug was found while implementing ADL-33's own firewall change.
- **Next container start is the real verification point.** Confirm the startup log shows "Firewall
  configuration complete" and both final verification checks pass; if any `FAILED_ITEMS` warnings
  appear, check whether they're expected (e.g. a genuinely offline host) or a new regression.

### 5. Follow-up (2026-07-21, same day): §3's outstanding verification point fired, and found a second bug in this same fix

The container rebuild happened (Dockerfile `COPY` confirmed identical between `/usr/local/bin/
init-firewall.sh` and the repo copy — the ADL-34 fix above was live). Its first real run produced
exactly the `FAILED_ITEMS` scenario §4 said to watch for, but the failing item was GitHub itself:

```
FIREWALL WARNING: 1 item(s) could NOT be allowlisted... - GitHub (meta API fetch failed)
...
Firewall verification passed - unable to reach https://example.com as expected
ERROR: Firewall verification failed - unable to reach https://api.github.com
```

**Root cause:** this fix's own reordering — lockdown (step 5) now applies *before* GitHub's IP
ranges are fetched (step 6) — created a bootstrapping deadlock the dry-run mock in §3 couldn't
catch (it no-op'd `iptables`/`ipset`, so it never actually enforced anything against the fetch).
Step 6's `curl https://api.github.com/meta` is a real HTTPS connection to `api.github.com` — and
since that host's IPs aren't in `allowed-domains` yet (populating them is the whole point of this
curl call), the already-active default-DROP lockdown blocks the fetch itself. Confirmed live:
`curl https://api.github.com` failed (`Couldn't connect to server`) while `getent hosts
api.github.com` resolved fine — DNS (UDP/53, allowed pre- and post-lockdown per step 3) worked,
only the HTTPS connection was blocked. This did not surface under the old fail-open script because
that curl ran before any lockdown existed at all.

**Fix:** before the meta-API curl, resolve `api.github.com`'s current A record via `dig` (same
DNS-bootstrap pattern already used for the Turso/Railway/Clerk domains in step 7, which don't hit
this problem because they use `dig` rather than `curl` to establish reachability) and temporarily
allow that IP so the bootstrap fetch can succeed. The full official ranges added immediately after
are a superset and remain in the ipset regardless.

**Verification:** `bash -n` clean; `dig +noall +answer A api.github.com` output format confirmed
to match the existing `awk '$4 == "A" {print $5}'` parse used elsewhere in the script. Same
live-verification limitation as §3 applies — passwordless sudo is scoped to the already-built
`/usr/local/bin/init-firewall.sh`, so full end-to-end confirmation needs another container
rebuild. **That rebuild is the new outstanding verification step.**

Found and fixed directly by COO (same class of well-contained, mechanical fix as the original
ADL-34 fix; no new architectural decision — the lockdown-before-resolution ordering itself is
unchanged and correct, this only fixes step 6's own bootstrap sequencing).

---

## ADL-35 — Environment promotion model: `main`→staging (continuous), `production` branch→prod (explicit fast-forward)

**Date:** 2026-07-21
**Status:** Decided — design only. **No Railway config or CLAUDE.md change is committed with
this ADL.** Going live requires two manual actions gated on PO/COO: (a) repointing the Railway
Production environment's watched branch in the dashboard, and (b) the CLAUDE.md git-workflow
addition described in §8. Until both are done, prod continues to track `main` (the state this
ADL replaces). Suggested tracker home: **OP-22** (operational, no BRD requirement ID) — COO to
create, same pattern as ADL-33/OP-21.
**Tracker:** BRD-NF09 (context) · OP-22 (suggested, this decision) | **BRD ref:** NF-09 (deployment operations)

**Triggered by:** PO flagged (2026-07-21, D-05 dialogue context) that both the Railway
production and staging environments currently deploy from `main`, so every merge to `main`
immediately redeploys production with zero soak time. This was an acceptable bootstrap shortcut
while the only goal was getting hosting working at all (ADL-32), but with merge frequency and the
real-user count both about to grow, a merge going straight to prod with no chance to catch a
deploy-only regression on staging first is a real risk. This ADL defines the promotion gate.

### 1. Problem

Railway's native GitHub integration auto-deploys an environment whenever its **watched branch**
receives a push (gated on GitHub CI passing — see §3). Today both the Production and the Staging
environments watch `main`, so there is no promotion step: `main` *is* prod. The whole value of a
separate staging environment — a live, hosted running instance to soak a change on before real
users see it — is lost when staging and prod redeploy from the same ref at the same instant.

The class of bug this is meant to catch is exactly the one that dominated the 2026-07-21 deploy
shakedown (BRD-NF09 tracker, five sequential blockers): defects that only appear when the app runs
as a real hosted server (CSP against Clerk's real SDK, `VITE_API_BASE_URL` resolution, static-asset
serving, migrate-on-deploy) — none of which CI's test suites catch, because CI never runs the app
as a live hosted server. A soak ring is the only place these surface before production.

### 2. Decision — three deploy rings, driven by Railway branch-watching

| Ring | Railway env | Watched ref | Trigger | Database |
|---|---|---|---|---|
| **Staging** (soak) | Staging (persistent) | `main` | Continuous — every merge to `main`, CI-gated | Staging Turso (ADL-32 §3) |
| **Production** | Production (persistent) | **`production`** branch | Explicit — only when `production` is fast-forwarded to a soaked `main` commit and pushed | Production Turso (ADL-32 §3) |
| **Preview** (pre-merge, optional) | per-PR ephemeral | PR head | Auto per open PR (ADL-32 §5) — orthogonal to this decision, not required by it | Staging Turso |

**The mechanism is a long-lived `production` branch, not tags and not a hand-rolled deploy step.**
Staging keeps watching `main` (continuous soak). Production is repointed to watch a new,
long-lived `production` branch. Promotion is a single git operation — fast-forward `production` to
the soaked `main` commit and push — which Railway then treats as an ordinary branch push and
deploys (through the same CI gate). The `production` branch ref is, by construction, an exact record
of what is running in prod.

### 3. Interaction with the existing CI gate (layers on, does not replace)

Railway's dashboard deploy trigger already gates every deploy on GitHub CI passing for the pushed
commit (`reference_railway_ci_gated_deploy.md`; a deploy appearing after a merge is that gate
firing, not a race). This model sits **on top of** that, unchanged:

- Merge to `main` → CI runs on `main` → green → Railway deploys **Staging**. (Unchanged from today.)
- Promote → `production` fast-forwarded to that same commit + pushed → Railway deploys **Production**,
  gated on CI green for that commit.

Because GitHub check-runs are keyed to the **commit SHA, not the branch**, a fast-forward carries
the commit's *already-green* checks from when it was on `main`. Railway's gate reads the SHA's
existing status and is satisfied immediately — **no redundant CI run, gate still fully honoured.**
Corollary: do **not** add a `push: [production]` trigger to the CI workflows — it would re-run CI
pointlessly on a SHA that already passed. Rely on the SHA-attached status. (If a future workflow is
ever made branch-filtered to `main` only, this property still holds — the SHA keeps its `main` run's
checks.)

### 4. Why a `production` branch, not tags or a GitHub Action

- **Uses Railway's native branch-watching for *both* environments — zero deploy glue.** This is the
  decisive factor. ADL-32 chose Railway over Fly.io specifically to avoid hand-rolled `flyctl`-style
  deploy steps; a tag-triggered or API-triggered prod deploy would reintroduce exactly the GitHub
  Action / `railway up` glue that decision paid ~$2–5/mo to avoid. Railway watches *branches*
  first-class; tag-pattern triggers are not equivalently first-class and would need a CI job to call
  Railway's API/CLI on tag push.
- **Promotion is legible, atomic, and revertable in git.** `git log production..main` is a precise
  "what is about to ship" diff; the `production` ref itself is the "what is live right now" answer.
  No dashboard archaeology.
- **Fast-forward-only forward promotion makes an unsoaked commit in prod structurally impossible.**
  Every commit on `production` is an ancestor of `main` (it got there from `main`), so it necessarily
  passed through the staging ring first. You cannot promote something that was never on `main`.
- **Rollback is trivial** (§6).
- **Right-sized for scale.** Solo→small-team, one Railway project, one real user growing slowly. A
  branch fast-forward is the simplest thing that adds a genuine gate without an enterprise
  release-management apparatus.

**Optional lightweight release marker:** COO *may* annotate each promotion with a tag
(`git tag -a prod-2026.07.21 -m "…"`) for a human-legible release ledger and easier rollback
targeting. Recommended but not load-bearing — the `production` branch ref already carries the
authoritative "what's live" state; tagging is convenience, not mechanism. Do not build tooling
around tags.

### 5. Promotion workflow (concrete COO/PO steps)

Promotion is a **COO/PO-only** operation — the same authority boundary as merging a PR
(agents never merge their own PRs; agents likewise never promote). Steps:

```bash
git fetch origin
git checkout production
git merge --ff-only origin/main          # or --ff-only <specific-soaked-SHA> if newer,
git push origin production               #   unsoaked commits already sit on main
# optional release marker:
# git tag -a prod-2026.07.21 -m "promote: <summary>" && git push origin prod-2026.07.21
```

`--ff-only` is deliberate: it *fails loudly* rather than creating a merge commit if `production`
has somehow diverged from `main`'s history — which should never happen, and if it does, that's a
signal to investigate, not to paper over. Promote to a specific soaked SHA (not blindly `main`'s
tip) whenever `main` has accumulated newer commits that haven't had their own staging soak yet.

Promotion is gated on judgement, not a fixed timer: promote once the change has been observed
working on the live staging environment (the soak). For a batch of low-risk changes that's minutes;
for a risky deploy-shape change (CSP, env-var, migration, static-serving) give it a real look on
staging first — those are precisely the ones CI cannot vouch for.

### 6. Rollback

Two equivalent paths, prefer the first for speed:

1. **Railway "redeploy previous deployment"** on the Production environment — immediate, no git
   operation, reverts the running prod to the prior good build.
2. **Git branch reset:** `git checkout production && git reset --hard <previous-prod-SHA> &&
   git push --force-with-lease origin production` — Railway redeploys prod at the older commit.
   A force-push to `production` is acceptable **for rollback only**: `production` is a deploy-control
   ref, not shared development history, and it is COO/PO-owned. (Never force-push `main`.)

The two stay consistent: after a Railway-side rollback, reset the `production` branch to match so
the ref keeps telling the truth about what's live.

### 7. What this does NOT change — branch-per-brief workflow (explicit)

The CLAUDE.md branch-per-brief workflow is **unchanged**. This decision is only about what happens
to `main` *after* merge; it does not touch how branches are created or reviewed:

- `feat/` / `fix/` / `chore/` branches still branch off `main`, PR back to `main`, COO squash-merges
  to `main`. `main` remains the single integration branch and the single PR target.
- The `production` branch is **never** a PR target, **never** receives direct commits or feature
  work, and is **never** branched from for briefs. It only ever fast-forwards to a `main` commit.
- Agents do not interact with `production` at all — it is COO/PO-only, exactly like merge authority.
  No agent brief should ever check out, target, or push `production`.

Anyone reading this later: if you find a `feat/*` branch based off `production`, that is a mistake,
not a supported pattern.

### 8. Config / doc changes required to make this live (for COO — not done in this PR)

**Railway dashboard (manual — Ryan/COO, per the infra-change-needs-Architect-ADL guardrail this
ADL satisfies):**
1. Create the `production` branch at the current `main` tip so prod's first tracked state equals
   what is live now: `git branch production main && git push origin production`. (Must exist before
   Railway can watch it.)
2. Production environment → change watched/deploy branch from `main` → `production`.
3. Staging environment → confirm it watches `main` (no change expected).
4. Confirm the CI-gate-on-deploy setting stays enabled for both environments.
5. Confirm environment-scoped env vars are correct after the repoint: Production keeps the
   **production** Turso credentials, Staging keeps the **staging** Turso credentials (ADL-32 §7).
   The whole model's safety rests on that separation already being in place.

**CLAUDE.md git-workflow section (COO):** add an "Environment promotion (prod vs staging)"
subsection stating: `main` = staging (continuous, CI-gated); `production` branch = prod (explicit
fast-forward promotion, CI-gated on the SHA's existing checks); promotion + rollback are COO/PO-only;
agents never touch `production`; branch-per-brief is unchanged (§7). Point it at this ADL. Apply
this **at the same time** as the Railway repoint, not before — until Railway is repointed, prod still
tracks `main`, and CLAUDE.md must not assert a model that isn't live yet (document-lifecycle rule).

### 9. Related but explicitly out of scope

- **D-05 (separate prod/staging Clerk applications)** — deferred by PO (open-dialogues.md). This
  decision separates deploy *timing* and *database* (DB was already separate per ADL-32 §3); it does
  **not** separate the Clerk auth *application*. Residual to be aware of: until D-05 is decided,
  staging and production may share one Clerk app, so **sign-ins on staging land in the same Clerk
  user pool as production**. That's a hygiene wrinkle, not a blocker to this promotion model, and is
  D-05's to resolve — not folded in here.
- **ADL-32 §6 (Clerk dynamic per-PR preview origins)** — still open, orthogonal. Concerns whether
  Clerk's allowed-origins config supports Railway's generated preview URLs; unrelated to the
  staging↔prod promotion gate.

### 10. Supersession

Supersedes the "Production environment: tracks `main`" bullet in **ADL-32 §5** (stamped there in
this PR). ADL-32's platform choice (Railway + Turso), topology (single service serving API + built
frontend), database split (prod/staging Turso), and env-var model (§7) all stand unchanged — this
ADL only changes *which branch the Production environment watches* and *what triggers a prod deploy*.

**Alternatives considered:**
- **Tag-based prod trigger (Railway deploys on `v*` / `release-*` tags):** rejected — not
  first-class in Railway's branch-oriented GitHub integration; would need a GitHub Action calling
  Railway's API/CLI on tag push, reintroducing the exact deploy glue ADL-32 chose Railway to avoid.
  Tags are kept only as an optional human release marker (§4), not as the deploy mechanism.
- **Promotion via a `main`→`production` pull request each release:** rejected as default — heavier
  than needed for this scale (a PR + review per release), and the "what's shipping" diff is already
  available as `git log production..main`. COO *may* opt into a promotion PR when batching many
  changes and wanting an explicit review/record surface, but it is not the standard path.
- **Railway's built-in environment "promote" / clone feature:** rejected — couples the record of
  "what's in prod" to Railway dashboard state instead of a git ref; less legible and less portable
  than a branch, for no saving over a fast-forward.
- **Keep both environments on `main` (status quo):** rejected — this is the exact risk the PO
  flagged; no soak ring, every merge is a prod deploy.
- **Manual timed soak (fixed N-minute/N-merge delay before auto-promoting):** rejected — automating
  the promotion defeats the point (the gate exists so a human can *look* at staging); a fixed timer
  soaks unwatched. Promotion stays a judgement call (§5).

**Implications:**
- No source or CI-workflow change. `.github/workflows/*` untouched (and must stay untouched per §3 —
  no `production` push trigger).
- One-time repo change: create the `production` branch (§8.1). Ongoing: one extra COO git step per
  release (§5), which is the intended cost of the gate.
- Rollback posture improves (§6) — prod is now a movable, git-legible ref rather than "whatever
  `main` was at deploy time".
- Preview environments (ADL-32 §5) remain compatible and orthogonal; this decision neither requires
  nor blocks them.

---

## ADL-36 — `items.carriedFromItemId` FK gets `onDelete: 'set null'` (BUG-39)

**Date:** 2026-07-21
**Status:** Decided — **Implemented** (Database, 2026-07-21, branch
`fix/bug39-carry-forward-fk-ondelete`, refs #209). `items.carriedFromItemId` FK now
`onDelete: 'set null'`; migration `0011_majestic_nehzno.sql` applied (items table
recreation — self-FK, partial index `idx_items_carried`, and all three
`chk_items_*` CHECK constraints verified intact through the generated SQL).
Regression test added to `trips.delete.test.ts` per this ADL's success criterion.
No backend/frontend change required, confirmed. See
`jobs/database/park-docs/20260721-DATABASE-park-bug39.txt` for full detail.

**Trigger:** BUG-39 / GitHub #209, discovered 2026-07-21 by the WP-03/WP-04 Frontend brief
(PR #208) while writing E2E coverage for the carried-forward tag. `items.carriedFromItemId`
is a self-referencing FK (`.references((): AnySQLiteColumn => items.id)`, schema.ts ~L432) with
**no `.onDelete(...)` clause**. `@libsql/client` enforces foreign keys by default (empirically
confirmed, BUG-38), so the omitted clause defaults to **RESTRICT**: `DELETE /api/trips/:id` 500s
whenever any of the trip's items was ever used as a carry-forward source for an item in *any other*
trip, independent of that trip's status. Same 500 also blocks a direct `DELETE .../items/:itemId`
of a source item. Dispatched to Architect for review + ADL before Database implements, per the
CLAUDE.md schema-change-review rule.

**Decision:** Adopt Frontend's proposed fix — set the clause to **`onDelete: 'set null'`**:
```ts
carriedFromItemId: integer('carried_from_item_id')
  .references((): AnySQLiteColumn => items.id, { onDelete: 'set null' })
```
Deleting a source item clears the derived item's provenance pointer; it does **not** cascade-delete
the derived item, which is a first-class item living on another trip with its own
user-edited status/notes/rating.

**Options considered:**
- **`set null` — selected.** Preserves the derived item; drops only the now-unresolvable provenance
  link. Column is already nullable (no NOT NULL to fight).
- **`cascade` — rejected.** Would silently delete a real item on a *different* trip (potentially
  locked/reviewed, with post-visit edits) when its unrelated source is deleted. Destroys user data;
  violates the principle that a carried-forward item is independent once created.
- **`restrict` / `no action` (explicit) — rejected.** This is the current de-facto behavior and *is*
  the bug — an unrecoverable 500 on a normal user operation (deleting an old trip).
- **App-level pre-clear in the delete path (mirroring BUG-32's reassign-to-null for `tripPlaceId`)
  — rejected as the primary fix.** BUG-32 needed app logic because it reassigns to a *meaningful*
  target (trip level) as a product behavior; here the target is simply NULL and the DB expresses it
  declaratively with no query to maintain, no ordering hazard, and correct behavior for the direct
  item-delete path too. Declarative FK semantics beat imperative cleanup when the semantics are exactly
  "null it out."

**Interaction with the ADL-13 carry-forward invariant (important — do not "fix" the result later):**
schema.ts (~L413) and the create-path validation (`items.schemas.ts` refine; `routes/items.ts`
L78–83) enforce that `is_carried_forward = 1` and `carried_from_item_id IS NOT NULL` are set
**together**. `set null` will produce rows where `is_carried_forward = 1` **and**
`carried_from_item_id IS NULL` after a source deletion. **This is intended and correct**, not a new
inconsistency to chase:
- `is_carried_forward` is a **permanent historical fact** ("this item originated as a carry-forward").
- `carried_from_item_id` is a **nullable provenance pointer** ("…from this specific source, while it
  still exists"). The redundant boolean flag (schema.ts L428) exists precisely so the historical fact
  survives loss of the pointer — `set null` makes that flag *more* justified, not less.
- The coupling is therefore a **create-time invariant only**. Verified it cannot be violated after the
  fact by application code: `UpdateItemSchema` (`items.schemas.ts` L67) does not expose
  `is_carried_forward` or `carried_from_item_id`, so PATCH can never touch or re-validate them; the
  frontend "carried forward" tag reads the `is_carried_forward` boolean, not the FK
  (`ItemCard.tsx` L98); no read path dereferences `carried_from_item_id` assuming non-null; the
  partial index `idx_items_carried` is already `WHERE carried_from_item_id IS NOT NULL`. **No backend
  or frontend code change is required** — `set null` is safe against every current consumer.

**FK-audit finding — BUG-39 is ISOLATED, not a pattern:** audited every `.references(...)` in
schema.ts for the same "deletable parent + no `onDelete` + no app-level handling" shape.
- `items.carriedFromItemId` → `items.id` (self) — **the bug.** `items` is routinely hard-deleted
  through a normal user path (trip delete cascades to items; direct item delete). RESTRICT fires in
  normal operation. Fixed here.
- `items.tripPlaceId` → `tripPlaces.id` (no `onDelete`) — **intentional, confirmed.** BUG-32 / PR #166
  reassigns items to trip level (`tripPlaceId = NULL`) in `places.ts` `delete()` (L185–198) *before*
  deleting the place, deliberately to preserve logged items rather than cascade them. RESTRICT is the
  backstop if that app-level step is ever skipped. Reading independently verified — not the same gap.
- `tripCategoriesMap.categoryId`, `tripCompanionsMap.companionId`, `tripActivitiesMap.activityId`,
  `tripPlaceActivitiesMap.activityId` → admin-list tables (no `onDelete`) — **not the same shape.**
  Admin lists are **soft-deleted only** (`admin.ts` DELETE sets `is_active = 0`, L124–141; "never
  hard-delete", AD-06). The parent row is never removed, so RESTRICT never fires. Correct as-is.
- `cities.regionId` → `regions.id`, `tripPlaces.cityId` → `cities.id` (no `onDelete`) — **not the same
  shape.** Regions are seed/static; cities are find-or-created and persistent. Neither has any delete
  route (none in routes/ or repositories/). No reachable hard-delete path, so RESTRICT never fires.
- Cascades already correct: `trips`→junctions/`tripPlaces`/`items`, `tripPlaces`→
  `tripPlaceActivitiesMap`, `items`→all extension tables — all `onDelete: 'cascade'`, unaffected.
- `tripCountries.countryCode` → `countries.countryCode` is explicit `onDelete: 'restrict'` (ADL-23),
  deliberate.

**Conclusion:** no follow-up bug tracker entry is warranted — BUG-39 is the sole live instance.
**General rule recorded for future schema work:** every FK's delete behavior must be an *explicit,
documented* decision; an omitted `onDelete` silently means RESTRICT, which is safe **only** where the
parent is never hard-deleted (soft-delete-only or seed/static tables). The moment a future feature
adds a hard-delete route for cities, regions, or an admin list, that table's referencing FKs must be
revisited under this same rule. This is guidance, not a defect — no tracker entry.

**Implications for Database (implementation spec):**
- Change is the FK clause on `items.carriedFromItemId` only — add `{ onDelete: 'set null' }`.
- Generate via `npm run db:generate` + apply via `npm run db:migrate` (never `db:push`, ADL-15).
  SQLite cannot alter a constraint in place, so drizzle-kit will emit a **12-step `items` table
  recreation** (new table + copy + drop + rename + index rebuild). This is exactly the
  table-recreation path the committed `drizzle-kit@0.31.9` patch guards (duplicate CREATE INDEX,
  CHECK-constraint truncation, partial-index WHERE) — after generating, **eyeball the SQL**: confirm
  the self-referencing FK is re-declared with `ON DELETE SET NULL`, the partial index
  `idx_items_carried (… WHERE carried_from_item_id IS NOT NULL)` and all three `chk_items_*` CHECK
  constraints survive intact, and existing `is_carried_forward = 1` rows keep their data through the
  copy.
- Update the schema.ts doc comment (~L412–415, ~L428–432) to record that `carried_from_item_id` is a
  nullable-after-source-deletion provenance pointer and that `is_carried_forward = 1` /
  `carried_from_item_id IS NULL` is a legitimate post-deletion state (per the invariant note above),
  so a future reader does not flag it as corruption.
- No backend or frontend code change required (see invariant analysis). A regression test asserting
  `DELETE /api/trips/:id` succeeds (204) when one of its items is a carry-forward source elsewhere,
  and that the derived item survives with `carried_from_item_id = NULL` / `is_carried_forward = 1`,
  is the success criterion for closing BUG-39.

**Supersession:** none. Refines ADL-13's carry-forward model (clarifies the two-field coupling is a
create-time invariant, not a permanent one) without overturning it — no stamp required; ADL-13's
create-time enforcement stands unchanged.

---

## ADL-37 — Express `trust proxy` = `1` (single Railway edge hop) (BUG-60)

**Date:** 2026-07-22
**Status:** Decided — **Implemented** (Architect, 2026-07-22, branch `fix/bug60-trust-proxy`,
refs #221). `app.set('trust proxy', 1)` added to `src/backend/server.ts` (before the
SEC-07 rate-limiter middleware) and mirrored into `src/backend/server-test-app.ts` to keep the
two app builders' pipelines identical. Regression test:
`src/backend/__tests__/trust-proxy.test.ts` (asserts the setting is the integer `1` and that the
compiled trust predicate trusts exactly hop 0, not hop 1). Single-file infra config change, no
backend hand-off.

**Trigger:** BUG-60, found 2026-07-21 while verifying BUG-59's fix by reviewing Railway
deployment logs. Both environments' logs show `express-rate-limit` throwing
`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` once shortly after boot — staging deployment `12e1e764`
and prod `f60d623b` (i.e. already present in prod before that session's changes). Railway sits a
TLS-terminating edge proxy in front of the container and sets `X-Forwarded-For` on every request;
`server.ts` never called `app.set('trust proxy', ...)`, so Express defaulted to `false` (do not
trust the header). Not a hard block on traffic (fires at startup, not per-request; both
environments otherwise functional), but SEC-07's IP attribution is unreliable in that state — the
reason this was routed to Architect for an ADL rather than fixed unilaterally, per the standing
"runtime/infra config needs an Architect decision first" rule.

**Decision:** Set `trust proxy` to the **integer hop count `1`** — trust exactly one proxy hop
(Railway's edge), no more. Not `true`, not `false`, not a CIDR allowlist.

**Why the value matters in both directions (this is the whole reason it's an ADL, not a
one-liner):** the two ways to get this wrong are the two errors `express-rate-limit` guards, and
they map exactly onto the two directions of misconfiguration:
- **`false` (the current default) — the bug.** With a proxy present but untrusted, `req.ip`
  resolves to the *socket peer* (Railway's edge) for **every** request, so all clients look like
  one IP. `express-rate-limit` detects the mismatch (X-Forwarded-For present + `trust proxy`
  off) and throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`. Effect if it didn't throw: the whole
  internet shares one rate-limit bucket — the limiter is simultaneously useless (one attacker
  exhausts everyone's quota) and hostile (legitimate users collide).
- **`true` — the security hole in the other direction.** `true` trusts the *entire*
  X-Forwarded-For chain, so Express walks it fully left and returns the **leftmost** value as
  `req.ip`. A client can forge `X-Forwarded-For: <anything>`; Railway's edge appends the real
  peer to the right, but with `true` Express still honours the forged leftmost entry — so the
  client picks its own apparent IP and rotates it to **bypass rate limiting entirely**.
  `express-rate-limit` rejects this configuration outright with
  `ERR_ERL_PERMISSIVE_TRUST_PROXY` precisely because it is spoofable.
- **`1` — correct.** Express strips exactly one trusted hop from the right (Railway's edge, the
  immediate socket peer) and takes the *last-appended* address as `req.ip` — that is the real
  client IP that Railway's edge itself wrote. A forged prefix from the client sits deeper in the
  chain (to the left of Railway's appended value) and is **ignored**, because Express only trusts
  one hop. This satisfies the limiter, attributes IPs correctly, and is not spoofable — assuming
  Railway's edge *appends* the connecting IP (standard, XFF-conformant reverse-proxy behaviour),
  which is the same assumption every "`trust proxy: 1` behind one reverse proxy" deployment
  (Heroku, nginx, Cloudflare-to-single-origin) relies on.

**Why `1` and not a higher count or a CIDR allowlist:**
- Railway's public networking is a **single** edge tier in front of the app container from the
  app's `X-Forwarded-For` perspective — one hop to trust. A hop count of `2+` would strip a hop
  Railway doesn't add, handing the attacker back a spoofable position; the count must match the
  real topology exactly, and that count is `1`.
- A CIDR/IP allowlist (trusting Railway's edge subnet) is the theoretically tightest option but
  requires a **stable, documented** set of Railway edge IPs to pin; Railway does not publish a
  committed egress/edge CIDR, and pinning to observed IPs would silently break (start throwing
  again) whenever they rotate. The hop-count form needs no such list and degrades safely: if
  Railway ever inserted a second hop, the symptom would resurface as a *visible* boot error, not
  a *silent* trust gap — the fail-loud direction. `1` is the correct, maintainable choice.
- Firewall note: Railway's own edge-topology docs were not fetchable from inside the devcontainer
  (allowlist is GitHub/npm/Anthropic only), so the hop count is reasoned from the standard
  single-reverse-proxy model that Railway's TLS-terminating edge fits, plus the observed error
  signature (`UNEXPECTED`, i.e. header-present-but-untrusted — consistent with exactly one
  untrusted hop). Confidence: **High** on the direction and the `1`-vs-`true` security argument;
  **Medium** only on the residual "could Railway ever be >1 hop" — mitigated by the fail-loud
  property above.

**Prod vs staging:** identical. Both run the same image on the same Railway platform with the
same single-edge topology (confirmed: the error appears in both deployments' logs with the same
signature). One value, hardcoded, covers both — no env-var gating. It is also safe in **local dev
and CI**: with no `X-Forwarded-For` present, `req.ip` simply falls back to the socket peer and the
limiter never trips, so the setting is inert outside a proxied deployment. Hardcoding (not
env-driven) is deliberate — the value is a property of the Railway platform, not of a particular
environment's config, so it should not be something an env var can silently get wrong.

**Placement:** `app.set('trust proxy', 1)` is registered immediately after `express()` and
before the rate-limiter (and all other) middleware in `server.ts`. `express-rate-limit` reads the
resolved `req.ip`, so the app-level setting must be in effect before the limiter runs; setting it
first removes any ordering ambiguity.

**Implications for other jobs:**
- **Backend:** none — no route or repository change. Any *future* code that reads `req.ip` (audit
  logging, per-IP throttles, geo) now gets the real client IP behind Railway, correctly; code
  should continue to use `req.ip` rather than parsing `X-Forwarded-For` by hand.
- **The two app builders must stay in sync.** `server.ts` and `server-test-app.ts` duplicate the
  middleware chain by design (the test export documents this). Any future change to proxy/trust
  handling must touch both, or the test pipeline silently diverges from production. The added test
  guards the test-app side of that.

**Supersession:** none. Additive server configuration; no prior ADL addressed `trust proxy`.
Complements SEC-07 (rate limiting) by making its client-IP resolution correct and non-spoofable
behind the ADL-32 Railway deployment.

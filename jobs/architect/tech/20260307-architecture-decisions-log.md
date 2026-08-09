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

> SUPERSEDED IN PART (2026-07-27) by ADL-41 — retained for history.
> The **ordering** decision only ("Chronological ordering of place sections is a frontend
> client-side sort (nulls last, stable)" below, and §4.1/§4.2 of
> `jobs/architect/tech/ADL-24-place-date-ranges.md`). ADL-41 moves `trip_places` to one row
> per *visit*, which makes the place list a sequence rather than a set — ordering stops
> being cosmetic and a nulls-last client sort destroys the itinerary for the mixed
> dated/undated case (Glasgow(–) → Edinburgh(dated) → Glasgow(–)). Ordering moves to a
> persisted, server-assigned `sort_order` column with an `ORDER BY` in `findByTrip`.
> **Everything else in ADL-24 remains current** — the `arrived_on`/`departed_on` columns,
> the `PATCH` endpoint, and specifically the DP-04 three-source display precedence below,
> which ADL-41 does not touch.

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

> **AMENDED (2026-08-03) by ADL-49 — retained in full; nothing below is withdrawn.** ADL-49 adds
> `nominatim.openstreetmap.org` to the §7 allowlist and, in doing so, extends this ADL's scope: every
> host here is an **agent read-only diagnostic** host, whereas the geocoder is the **app's own
> runtime** dependency, which is a new category with usage-policy obligations §4 never had to
> consider. §2's and §4's exclusions (`api.turso.tech`, `api.clerk.com`) are **unchanged and still
> binding**. §7's CDN IP-rotation caveat is **measured rather than restated** in ADL-49 §2.2:
> Nominatim is Fastly *anycast* with a single stable A record, materially less rotation-prone than
> the Cloudflare-fronted Turso/Railway entries this section was written about — the caveat applies
> but bites less hard. ADL-49 §2.3 also records the first check of this script's IPv4-only posture:
> not a live gap (the container has no IPv6 route), latent if the Docker network ever gains one.

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

> **STANDING CONDITION — added 2026-08-04 by ADL-49 §10.11.3 (PR #394). Read this before
> provisioning any Clerk credential for this container.** It is filed here, rather than in
> `.devcontainer/init-firewall.sh` where it was first drafted, because *this* is the document
> someone re-opens when they want Clerk access — nobody about to edit `.env.local`,
> `.env.agent-diagnostics` or a Railway variable set reads the firewall script.
>
> **The decision above is now the ONLY control, not one of two.** ADL-49 §10.8 established by
> live probe that this container's firewall matches **IP addresses, not hostnames**, and that
> `api.clerk.com` is Cloudflare-proxied and therefore **reachable today** via any allowlisted
> Cloudflare edge address — it answers `404` on `/` and **`401` on `/v1/users`**. The host is
> reachable; only the absent credential stands between this container and full user CRUD over all
> PII. There is no network backstop and there never was one for this host.
>
> Under the PO's stated threat model (2026-08-04 — *"the purpose of the container is primarily to
> stop **changes** to sensitive information … we restrict changes through API permissions … least
> privilege model where a case is made for any access required"*), that is the **intended design**
> rather than a gap: writes are controlled at the credential. But it means the margin for error here
> is zero.
>
> **Therefore: provisioning an `sk_*` key into this container is not a configuration step. It is a
> re-taking of this decision**, and it also invalidates ADL-49 §10.4.1's *"these entries grant no
> data access"* argument for the Railway app domains. Both must be re-taken **before** the credential
> is created, not after. Verified 2026-08-04 by three independent probes that no Clerk secret is
> present: no `CLERK_SECRET_KEY` among `.env.local`'s keys, no `sk_test_`/`sk_live_` pattern in any
> env file, and no `@clerk/backend`/`clerkClient` consumer in non-test backend source.

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

---

## ADL-38 — Countries/regions are global reference data: READ = requireAuth, WRITE = requireOwner (BUG-61)

**Date:** 2026-07-22
**Status:** Decided — **Implemented** (Architect, 2026-07-22, branch `fix/bug61-country-picker-auth`,
refs #225). Change confined to `src/backend/routes/admin.ts`: the two country/region GET routes
are moved above the router-level `requireOwner` guard; all writes stay below it. Regression
coverage added to `src/backend/routes/__tests__/security.access-matrix.test.ts` (Part E). No
schema, migration, or backend hand-off.

**Trigger:** BUG-61 (GitHub #225), found 2026-07-22 live in staging — Ryan signed in as a
non-owner test account and could not create a trip: the TripForm country picker
(`src/frontend/components/TripDetail/TripForm.tsx` → `useCountries` in
`src/frontend/hooks/useAdmin.ts`, `GET /api/admin/countries`) rendered empty because the route
403'd. Root cause: `admin.ts` registered `GET /countries` and `GET /countries/:countryCode/regions`
directly on `adminRouter`, and `adminRouter.use(requireOwner)` gated the **whole router** — reads
included. A non-owner therefore hit the practical ceiling on "share the app with a friend to test":
they could not get past country selection at all.

**Decision:** Split read from write for the countries/regions resources.
- **Reads** (`GET /api/admin/countries`, `GET /api/admin/countries/:countryCode/regions`) require
  only authentication — `requireAuth`, already applied globally to all of `/api/*` in `server.ts`.
- **Writes** (`PATCH /countries/:countryCode`, `POST /countries/:countryCode/regions`,
  `PATCH /countries/:countryCode/regions/:regionId`) stay owner-only, unchanged.

**Why this is correct (GE-04 / GE-05):** every country ships as a global, pre-seeded default with
its region-tier config applied automatically on first launch — the same data tier as AD-09's
categories/activities, seeded by `seedCountries()`/`seedRegions()` at startup, not owner-configured
per-user data. Gating the *read* of global defaults behind owner status was simply wrong: it made a
resource every user needs to create a trip visible only to the owner. The write operations are
genuinely an owner-admin function (editing the shared region-tier config, adding regions), so they
correctly stay owner-gated.

**Distinct from ADL-28 (BRD-AD07 / BRD-AD08) — do not conflate.** ADL-28 is about making
genuinely owner-only data (map-shading config, companions) work *per-user* via a `userId` FK — that
work is still "awaiting Backend implementation brief." BUG-61 is the opposite shape: global,
already-shared data that was *incorrectly* gated as owner-only. No `userId` scoping is involved
here; countries/regions have no per-user dimension. This brief touched countries/regions
read-access only and did not enter ADL-28's territory.

**Implementation shape — why carve-out-above-the-guard, not per-route `requireOwner`:** I kept the
router **fail-closed by default**. The two options were (a) register the read routes above the
blanket `requireOwner` guard and leave the guard covering everything else, or (b) remove the blanket
guard and apply `requireOwner` per write route. Option (b) is fail-*open*: a future author who adds a
new write route and forgets `requireOwner` leaves it unprotected — exactly the class of mistake this
project's security checklist and OP-06/ADL-27 exist to prevent (cf. BUG-22, where `requireOwner` was
missing on `PATCH /api/cities/:id`). Option (a) keeps the invariant "a newly added admin route is
owner-gated unless deliberately moved into the small, clearly-labelled reads block above the guard,"
so the reads are the enumerable exception and writes are protected by default. Chosen (a). The guard
block carries an explicit FAIL-CLOSED comment stating only global-reference-data reads may live
above it.

**Access matrix after this change (audit record):**

| Route | Middleware | Rationale |
| --- | --- | --- |
| `GET /api/admin/countries` | `requireAuth` | global reference data (GE-04/05) — every user reads it to create a trip |
| `GET /api/admin/countries/:countryCode/regions` | `requireAuth` | same — region list for the picker |
| `PATCH /api/admin/countries/:countryCode` | `requireAuth` + `requireOwner` | edits shared region-tier config — owner admin |
| `POST /api/admin/countries/:countryCode/regions` | `requireAuth` + `requireOwner` | adds to shared region set — owner admin |
| `PATCH /api/admin/countries/:countryCode/regions/:regionId` | `requireAuth` + `requireOwner` | edits shared region — owner admin |
| `GET/POST/PATCH/DELETE /api/admin/{categories,activities,companions}` | `requireAuth` + `requireOwner` | unchanged — owner-only list admin |

`requireAuth` remains globally applied in `server.ts` before `/api/admin` is mounted, so all six
routes still return 401 when unauthenticated (Part A of the access-matrix suite is unchanged).

**Verification:** access-matrix suite green (67 passed, 1 pre-existing skip); Part E added asserting
non-owner `GET` → 200 and non-owner writes → 403. Manual live check with a non-owner bypass user
(`BYPASS_AUTH=true`, `OWNER_CLERK_ID` set to a non-matching value → `isOwner:0`) against a seeded DB:
`GET /api/admin/countries` → 200 with the 250-country list, `GET .../US/regions` → 200,
`PATCH .../US` → 403, `POST .../US/regions` → 403, and `GET /api/admin/categories` → 403 (fail-closed
default intact).

**Supersession:** partially supersedes ADL-27's "all admin routes require owner status" for the two
country/region GET routes only — the ADL-27 standalone file's blanket statement is stamped in this
PR. The router-level guard and the owner-only status of every write route are unchanged.

**Implications for other jobs:**
- **Frontend:** the trip-create country picker now populates for any authenticated user — the
  reported BUG-61 symptom is resolved end to end. No frontend change was required.
- **Backend:** the fail-closed invariant is now load-bearing and documented in `admin.ts`. Any new
  admin route must stay below the `requireOwner` guard unless it is a read of global reference data;
  writes never move above the guard.

---

## ADL-39 — Move the dev environment's host location off OneDrive to `~/Projects/travel-tracker`

**Date:** 2026-07-23
**Status:** Decided — **execution pending** on the Mac host (Ryan). This is an infrastructure
decision reviewed by the Architect per the standing guardrail (`feedback_architect_involvement.md`
— Node/runtime/infrastructure changes need an Architect ADL before the COO acts). No code change
ships in the PR that carries this entry; the physical move happens on the host, outside any tool's
reach. Tracked as D-10 in `jobs/COO/open-dialogues.md`.

**Trigger:** Two documented incidents of OneDrive Files-On-Demand damaging the repo, which lives
inside OneDrive sync (`~/Library/CloudStorage/OneDrive-Personal/Work/ClaudeCode/my-project`,
bind-mounted into the devcontainer at `/workspace`):
1. **2026-07-02** — OneDrive dehydrated idle files to cloud-only placeholders; any read from inside
   the container hit `EDEADLK` / "Resource deadlock avoided" (memory `project_onedrive_dehydration.md`).
2. **2026-07-23** — recurred *despite* the Finder "Always Keep on This Device" workaround applied
   after incident 1: OneDrive silently rewrote 213 `.git/refs/*` files to the null SHA, blocking
   `git fetch`/`git pull` outright until the COO manually `rm -f`'d the corrupted refs (git's own
   `update-ref -d` also deadlocked — it must read before delete). The first incident hit regular
   project files; the second corrupted git's own internals. The stopgap Finder workaround is not
   durable — this is now a priority move, not "someday" debt.

**Decision:** Relocate the working copy off any cloud-sync scope to a plain local folder,
**`~/Projects/travel-tracker`**. `devcontainer.json` needs **no edit**: `workspaceMount` uses
`source=${localWorkspaceFolder}` (VS Code's dynamic "wherever this window is opened" variable), not a
hardcoded OneDrive path — verified this session. The migration is therefore host-side (relocate the
folder, reopen VS Code at the new path, let the devcontainer rebuild against the new mount source)
followed by in-container verification. No repo config, CI file, or committed script depends on the
absolute OneDrive path **except one** (see follow-up F1 below).

**Recommended migration method — fresh `git clone`, not a physical `mv`.** `main` is confirmed clean
and fully pushed (`cea9ad1` at time of decision). Given that, the lowest-risk migration is a fresh
`git clone` of origin into `~/Projects/travel-tracker`, then hand-copy the untracked-but-needed files
(`.env.local`; the local `dev.db` only if the dev DB state is wanted), then reopen VS Code there and
let `postCreateCommand: npm ci` repopulate `node_modules`. This sidesteps three hazards that an
in-place `mv` from OneDrive would drag along:
- **The null-ref corruption class itself** — a fresh clone pulls clean refs from origin, rather than
  copying the possibly-still-corrupt `.git` that OneDrive already damaged once.
- **1.7 GB of orphaned worktrees** under `.claude/worktrees/` — 29 physical checkout directories
  (untracked — see correction below) of which `git worktree list` actively tracks only 2; the rest are
  orphaned checkouts with stale gitdir links (cleanup debt, cf. D-09). A physical `mv` copies all
  1.7 GB and, worse, forces OneDrive to *hydrate* any dehydrated placeholders among them during the
  copy — the exact operation that has twice triggered `EDEADLK`. A clone brings none of it.
- **Stale `.git/worktrees` admin state.**

> **CORRECTION (2026-07-26)** — this entry said the worktrees under `.claude/worktrees/` were
> "gitignored". They were **not**; they were merely *untracked*, which looks identical in
> `git status` right up until someone runs `git add -A` from the main checkout and stages
> entire duplicate copies of the repo (~492 MB at the time of discovery). Nothing had ever
> been committed — verified via an empty `git ls-files .claude/worktrees/` — so no history
> cleanup was needed. A real `.gitignore` rule was added in PR #255, making the original
> claim true after the fact. The migration reasoning above is unaffected: a fresh clone
> still brings none of this along, which was the point being argued. Noted because this is
> the **second** ADL-39 assumption to be contradicted in practice (F2, the config-volume
> re-keying, was the first — and it materialized exactly as predicted, so the entry's
> track record is mixed rather than poor).

Trade-off, stated honestly: a clone does **not** carry untracked files, so `.env.local` (and any
wanted `dev.db`) must be copied by hand, and before discarding the OneDrive tree one should confirm
no orphan worktree holds un-pushed commits worth keeping (low risk — known cleanup debt — but
non-zero). A physical `mv` is the fallback *only* if some un-pushed local state must be preserved
wholesale; it is slower and re-exposes the corruption risk. Either way, the "backup before the move"
insurance the COO already planned is best realized as the clone-from-origin itself (origin is the
real backup, everything is pushed) rather than a Finder copy of a `.git` that may already be corrupt;
if a physical snapshot is still wanted, use `git bundle create <path> --all` (which fails loudly on
corrupt refs) plus a clean `git fsck`, not a plain file copy.

**Going-forward rule (this is the durable outcome, not just the one-time move):**
> **No committed file may hardcode a host filesystem path.** Host locations belong in dynamic
> variables (`${localWorkspaceFolder}`), env vars, or relative paths — never a literal absolute path
> baked into a tracked file. A hardcoded host path is a latent break the next time the working copy
> moves, and it silently ties the repo to one machine's layout.

**Alternatives considered:**
- *Keep the repo on OneDrive, exclude it from sync via OneDrive settings.* Rejected — the "Always
  Keep on This Device" exclusion is exactly the workaround that already failed (incident 2 recurred
  with it applied). Relying on OneDrive's own controls to not touch a folder it is syncing is not a
  durable guarantee; moving fully outside sync scope is.
- *Physical `mv` in place (preserve everything).* Available as a fallback but not recommended — see
  the three hazards above.
- *Edit `devcontainer.json` to a hardcoded new path.* Unnecessary and itself a violation of the
  going-forward rule; `${localWorkspaceFolder}` already does the right thing.

**Implementation implications / follow-ups (for the COO to sequence — none block the move itself):**
- **F1 (HIGH — do with the move):** `.claude/notify/host-setup/claude-notify-watch.sh` line 10
  hardcodes `WATCH_DIR="/Users/ryanv/Library/CloudStorage/OneDrive-Personal/Work/ClaudeCode/my-project/.claude/notify/queue"`.
  This is the **only** committed file whose hardcoded OneDrive path is load-bearing (the macOS
  notification bridge, memory `project_macos_notification_bridge.md`). After the move: (a) the
  committed template is stale, and (b) the *installed* host copy running as the LaunchAgent
  `com.ryanv.claude-notify.plist` keeps watching the old, now-nonexistent queue dir → notifications
  silently stop. Both the committed file and the installed LaunchAgent copy must be updated to the
  new path — or, better and in line with the going-forward rule, the script should derive its path
  rather than hardcode it. (`com.ryanv.claude-notify.plist` itself points only at `~/claude-notify-watch.sh`,
  so the plist needs no change — only the watch script's internal `WATCH_DIR`.)
- **F2 (MEDIUM/HIGH — verify after rebuild, back up before):** the devcontainer's two named volumes
  are keyed by `${devcontainerId}` (`claude-code-config-${devcontainerId}` → `/home/node/.claude`,
  and `claude-code-bashhistory-${devcontainerId}`). `devcontainerId` is derived from the workspace
  identity, so relocating the host folder can produce a **new** id → the rebuilt container mounts
  fresh empty volumes and Claude's auth, permission `settings.json`, and the auto-memory
  `MEMORY.md` (which lives at `/home/node/.claude/projects/-workspace/memory/MEMORY.md`, inside that
  config volume) appear *reset*. The data is not destroyed — the old volume persists, just unmounted —
  but it will not be visible. Mitigation: **before** the move, back up the config volume
  (`docker run --rm -v <config-vol>:/data -v "$PWD":/backup alpine tar czf /backup/claude-config.tgz -C /data .`);
  **after** the rebuild, verify `MEMORY.md` and `settings.json` are present, and if not, restore from
  that backup or copy from the old volume. The Clerk/Claude auth token is not reconstructable from
  git, so this backup is the real insurance, distinct from the repo backup.
- **F3 (MEDIUM):** the 1.7 GB / 29-dir orphan-worktree backlog under `.claude/worktrees/` is the same
  cleanup debt noted in memory `project_worktree_cleanup_debt.md` and D-09 — still live. The fresh-clone
  method retires it for free; if a physical `mv` is chosen instead, prune it first
  (`git worktree prune`, then `rm -rf` the leftover checkout dirs after confirming no un-pushed work).
- **F4 (LOW — separate doc-cleanup pass, not a migration blocker):** committed docs still advise
  putting the SQLite DB *on OneDrive for sync* — `.env.example` lines 10–13 and the header comments in
  `src/backend/db/index.ts` (lines ~10, 23–24, 100). Given the corruption history and the Turso
  migration (ADL-32), that advice is now actively harmful and should be scrubbed. The live
  `.env.local` `SQLITE_PATH` is relative, so the local dev DB survives the move regardless; this is a
  documentation hygiene item, and a candidate for the same `/pre-push` hardcoded-host-path check the
  going-forward rule implies.

**Supersession:** none. This is new infrastructure guidance; no prior ADL addressed the repo's host
location or OneDrive. It complements ADL-32 (Railway + Turso hosting) — that decision moved the
*deployed* data off local/OneDrive; this one moves the *developer working copy* off OneDrive too,
closing the last place OneDrive sync can still corrupt the project.

---

## ADL-40 — Time-varying checks must not gate deploys: `production` excluded from the Security Checks push trigger

**Date:** 2026-07-26
**Status:** Decided **and implemented** in the PR carrying this entry
(`.github/workflows/security.yml`). Infrastructure/CI decision made by the PO directly
rather than via an Architect dispatch — the standing guardrail
(`feedback_architect_involvement.md`) exists to ensure infra changes get a reasoned,
recorded decision before the COO acts, and the PO is the deciding authority here; this
entry is that record.

**Trigger:** Production deploys were blocked and the PO could not ship. `Security Checks`
failed on `production` at `299ab5c` (run 30210259329, 2026-07-26T16:22Z) on
GHSA-v422-hmwv-36x6 (`body-parser`, HIGH — DoS via an invalid `limit` silently disabling
size enforcement). Railway gates production deploys on GitHub CI green
(`reference_railway_ci_gated_deploy.md`), so the red check stopped all prod deploys.

The decisive evidence is that **the identical tree produced opposite verdicts**:

| Commit | Branch | Date | Security Checks |
|---|---|---|---|
| `299ab5c` | main | 2026-07-24 | success |
| `299ab5c` | production | 2026-07-26 | **failure** |

`git diff 299ab5c 3889436 -- package-lock.json package.json` is empty; the only files
changed between those commits were `.planning/drift-ledger.jsonl`, `_project/STATUS.md`,
`_project/tracker.json` and a COO park doc. Nothing about the code, the dependency tree,
or the promotion caused the failure — `npm audit` queries the GitHub Advisory Database at
run time, so the advisory's publication date changed the answer.

**Decision:** `security.yml`'s push trigger changes from `branches: ["**"]` to
`branches-ignore: ["production"]`. Every other branch, and the `pull_request` trigger, are
unchanged. `ci.yml` is **not** modified — it keeps `branches: ["**"]` and continues to gate
production.

**Rationale — deterministic vs. time-varying checks.** A deploy gate is only sound if it is
a pure function of the commit. Three of the four checks are: `CI` (tests, typecheck, build,
E2E), `Secret Scanning (Gitleaks)` (scans the commit's history) and `Static Analysis
(Semgrep)` (scans the commit's code) all return the same verdict for a given SHA forever.
`npm audit` alone is a function of commit **and date**, which makes *deployability a
function of the calendar* — it breaks the property the promotion model depends on, that a
commit verified green on `main` stays promotable.

The failure mode is worse than a nuisance: the gate blocks new deploys but does **not**
remove the vulnerable code already running in production. During the window between an
advisory landing and remediation, prod stays exposed *and* loses the ability to ship —
including the ability to ship an unrelated urgent rollback or hotfix.

**Why this does not weaken security.** GitHub check runs attach to a **commit SHA, not a
branch**, and per CLAUDE.md `production` is only ever fast-forwarded from `main` and is
never a PR target. Every promoted SHA has therefore already run this workflow on `main` and
carries its green statuses. Skipping the re-run does not remove the security verdict from
the promoted commit — it **freezes that verdict at the point it was earned**, converting a
time-varying gate into a point-in-time one. Detection is fully retained: the scan still runs
on every PR and every push to `main`, which is how DEP-01 and DEP-02 were both found. The
gate contributed the block, not the detection.

**Alternatives considered:**
1. *Split `dependency-scan` into its own workflow and gate production on the other two
   security jobs.* Rejected — Railway's CI gate is all-or-nothing about which checks count,
   so it cannot be told to ignore one workflow. It also buys nothing: Gitleaks and Semgrep
   are deterministic, so a fast-forwarded SHA already carries their green statuses from
   `main`; re-running them on `production` is pure redundancy.
2. *Remove the Railway CI gate entirely.* Rejected by the PO — it would let production
   deploy code that never passed tests, a far larger exposure than the one being solved.
3. *Promote more frequently so the drift window stays small.* Good practice and still
   worth doing, but not a fix: it shrinks the window rather than removing the failure mode,
   and an advisory can publish inside any window.
4. *Move the audit to a scheduled nightly job on `main` that opens an issue.* Not adopted
   now, but compatible with this decision and worth revisiting — it would catch advisories
   against an unchanged `main` between PRs, which neither the current nor the new
   configuration does.

**Implementation implications:**
- `.github/workflows/security.yml` — push trigger scoped via `branches-ignore`; the
  rationale is duplicated as a comment at the trigger so the next reader does not "fix" it
  back to `["**"]`.
- `.github/workflows/ci.yml` — unchanged, deliberately. It remains production's deploy gate.
- **Known residual gap:** a commit pushed *directly* to `production` without passing through
  `main` would never be security-scanned. This is contained by process, not by the workflow
  — CLAUDE.md's promotion rule makes `production` fast-forward-only and off-limits to agents.
  If direct pushes to `production` ever become possible, this exclusion must be revisited.
- Operationally unchanged: promotion is still the manual
  `git push origin origin/main:refs/heads/production` fast-forward (ADL-35/OP-22).

**Supersession:** none. ADL-35/OP-22 established the two-environment promotion model and is
unaffected — this refines which checks evaluate on the `production` branch, not how
promotion works.

---

> **ADL-41 … ADL-45 are RESERVED numbers, allocated by the COO on 2026-07-27 ahead of the
> Wave 0 scoping dispatch** (`jobs/COO/backlog-clearance-plan.md` §3). Five Architect agents
> run concurrently, and worktree isolation does not stop five of them from each reading this
> log and independently picking "the next number" — the same collision class as the shared
> `refs/stash` incident in OP-20. Pre-allocating here removes the race.
>
> **Each dispatched Architect edits its own stub below in place** — it must not append a new
> entry at the end of the file and must not touch any other stub. This is deliberate: five
> agents appending to the tail of this file would conflict with each other in every pairing,
> whereas five agents rewriting five well-separated blocks merge cleanly. A long design may
> additionally live in a standalone `ADL-NN-<slug>.md`, but per `/record-decision` the entry
> below is still required — the standalone file supplements it, never replaces it.
>
> A stub still reading RESERVED after its brief has landed means that brief did not record
> its decision; treat it as an incomplete deliverable, not as a spare number.

## ADL-41 — Trip-place identity: one row per *visit*; declared FK cascades are enforced and TR-14 keeps relying on them

**Date:** 2026-07-27
**Status:** **Decided, implementation pending.** No schema, migration or route change is
made by the PR carrying this entry — it is spec output only. Downstream briefs are scoped
in §10 of the supplementing file.
**Trigger:** Wave 0 scoping brief S1 (`jobs/COO/backlog-clearance-plan.md` §3), GitHub
issue #271, resolving BRD §10 **OQ-05**. Gates BUG-40 (TR-15) and BUG-50 (TR-14).
**Supplemented by:** `jobs/architect/tech/ADL-41-trip-place-identity.md` — delete ordering,
API shapes, migration SQL and downstream brief scoping. This entry is the authoritative
record; that file carries the implementation detail.

### Decision summary

| # | Decision | Recommendation | Confidence |
|---|----------|----------------|------------|
| 1 | Trip-place identity | **One row per visit.** Drop `uniqueIndex('uniq_trip_places_trip_city')` (`src/backend/db/schema.ts:362`). `trip_places.id` stays the identity; a row now means "a stay in a city", not "a city on the trip" | High |
| 2 | Accidental-duplicate protection | Keep it, move it up a layer. `POST .../places` returns 409 carrying the existing rows unless the caller passes `allow_revisit: true`. Replace the dropped unique index with a plain composite index | High |
| 3 | Map shading | **No change required.** Every shading aggregate already counts `DISTINCT trips.id` / `DISTINCT regions.id` — verified line-by-line in both spec and implementation. Add a binding rule so it stays true | High |
| 4 | Ordering (DP-05) | Add `sort_order INTEGER NOT NULL DEFAULT 0` as the canonical order; `arrived_on` drives it at write time rather than render time | High |
| 5 | DP-06 first-place inheritance | Fires only on the empty-trip → first-place transition. A revisit row never inherits | High |
| 6 | Item attachment | An item belongs to exactly one *visit*. No implicit re-parenting, ever. Disambiguation is a UI concern, not a data-model one | High |
| 7 | Merge / split | Specified in the supplementing file, **not scheduled**. Not required by TR-14, TR-15 or OQ-05 | Medium |
| 8 | TR-14 cascade semantics | **Keep relying on the declared `ON DELETE CASCADE`.** FK enforcement *is* on — verified empirically, see below. Do **not** hand-roll an ordered delete batch | High |
| 9 | Guarding decision 8 | Add a **startup assertion** that `PRAGMA foreign_keys` returns 1 on the application connection and fails loudly if not. Cheap; converts silent orphaning into a boot failure | High |
| 10 | TR-15 "reassign to trip level" | Means `items.trip_place_id = NULL`, unchanged by the identity change. The choice becomes a **required** request parameter, not a UI convention | High |
| 11 | NR-12 non-foreclosure | One service-layer entry point for deletion; NR-12 uses a new nullable `archived_at` column, **never** a new `trips.status` value | High |

### The core decision (1)

`trip_places` moves from one row per (trip, city) to one row per visit segment. Nothing
else about the table's shape changes: `items.trip_place_id` (`schema.ts:461`) and
`trip_place_activities_map.trip_place_id` (`schema.ts:379-381`) keep pointing at
`trip_places.id`; only the *referent* sharpens from "the city on this trip" to "this stay
in this city on this trip". No FK moves, no join rewires, no ID remapping — which is why a
change to the core entity has a small blast radius.

The unique index was buying two things and only one was real. Shading double-count
protection was **not** real (decision 3). Accidental-double-add protection **was** real,
but is already enforced a layer up by `placeRepository.create`'s pre-check
(`src/backend/repositories/places.ts:147-153`, `ConflictError('Trip already has this
city')`). That is a UX concern, and guarding a UX concern with a DB constraint that also
forbids a legitimate real-world fact is the wrong instrument.

**Alternatives rejected:** a separate `visits` child table (adds a second nullable FK on
`items` and forces every consumer to choose a grain); a `visit_count` ordinal on the
existing row (cannot carry per-visit dates or per-visit items, which are the two points);
and status quo (corrupts the data — Glasgow "3–9 June" when the user was in Edinburgh on
the 6th).

### Decisions 8 and 9 — this reverses the S1 draft, on evidence

The killed S1 dispatch's draft asserted that the application connection never issues
`PRAGMA foreign_keys=ON`, therefore every declared `onDelete: 'cascade'` is "documentation
of intent, not enforced runtime behaviour", and therefore TR-14 must hand-roll an
eight-step ordered delete. **The premise is false and the conclusion falls with it.**

The premise's first half is literally true — `createLibSQLDb` (`src/backend/db/index.ts:108`)
issues no `PRAGMA`. But `@libsql/client@0.14.0` **enables foreign keys by default**, a
deliberate libSQL divergence from stock SQLite. Probed directly against the installed
client on `:memory:`, `file::memory:` and a `file:` path:

- `PRAGMA foreign_keys` returns **1** on a fresh connection with no PRAGMA issued.
- A `NO ACTION` FK **blocks** a parent delete (`SQLITE_CONSTRAINT_FOREIGNKEY`).
- Replaying the real FK shape (trips → trip_places CASCADE, trips → items CASCADE,
  trip_places → `items.trip_place_id` NO ACTION, `items.carried_from_item_id` SET NULL,
  trip_places → tpam CASCADE, items → item_hotels CASCADE), a bare
  `DELETE FROM trips WHERE id = 1` **succeeds** and leaves zero rows in `trip_places`,
  `items`, `item_hotels` and `trip_place_activities_map` — while a *derived* item on
  another trip survives with `carried_from_item_id = NULL` and `is_carried_forward = 1`,
  which is exactly the intended ADL-36 post-deletion state, reached automatically.

So the declared cascades work, and the existing `tripRepository.delete`
(`src/backend/repositories/trips.ts:195-202`) is correct as written. An eight-step ordered
delete would have been **worse architecture**, not belt-and-braces: it duplicates FK
knowledge in application code, and the copy goes stale the first time a child table is
added and missed — silently orphaning rows the declared cascade would have covered for
free. It also buys nothing on the Phase 2 Postgres path, where FKs are always enforced.

What the draft's instinct *did* correctly identify is that the guarantee is currently
**implicit** — a driver default, not a stated dependency. Two residual gaps, which
decision 9 closes cheaply:

1. A `@libsql/client` major bump could change the default, and nothing would fail loudly.
2. The **remote Turso (`libsql://`) path is unverified here** — production uses
   `TURSO_DATABASE_URL`, and this environment's firewall permits no Turso host, so the
   probes above cover the embedded driver only. A PRAGMA issued once at connect would not
   reliably stick on a stateless HTTP connection anyway, which is precisely why the guard
   must be an *assertion*, not a *set*.

Decision 9 is therefore: at startup, execute `PRAGMA foreign_keys` on the real application
connection and fail the boot (or log at ERROR in dev) if it is not 1. It reads actual
connection state, so it is correct on embedded and remote alike, and it turns the worst
failure mode — a trip delete silently orphaning every dependent row in production — into a
boot failure. Sizing: one query in `startup.service.ts`.

`src/backend/db/reset-staging.ts:30-35` deliberately does *not* assume FK enforcement and
deletes child-before-parent by hand. That remains correct for a destructive operator-run
script against an environment it does not control, and is not evidence that enforcement is
off. It is not superseded.

### Correction to a fact the backlog is currently being planned from

The S1 draft, `jobs/COO/backlog-clearance-plan.md` §6, and the **BUG-50 tracker note** all
state there is no delete route for a trip. There is:

- `tripsRouter.delete('/:id', ...)` — `src/backend/routes/trips.ts:429-454`, with `userId`
  scoping via `findByIdOrThrow`, a `LockError` guard for locked trips (BUG-27), and 204.
- `tripRepository.delete(userId, tripId)` — `src/backend/repositories/trips.ts:195-202`.
- Frontend: `useDeleteTrip` wired into bulk delete with a 5-second undo window in
  `src/frontend/components/TripList/DesktopTripsLayout.tsx:75,173` and
  `MobileTripsLayout.tsx:78,166`.
- Tests: `src/backend/routes/__tests__/trips.delete.test.ts`, including a cascade assertion.

The earlier claim came from grepping `router.delete` against a file whose router is named
`tripsRouter`. TR-14 is therefore **mostly shipped**, and what remains is narrower and
mostly frontend: a delete affordance **reachable from the trip detail view** (only bulk
select in the trip list exists today), confirmation text that **names what will be lost**
(current text is `Delete N trips? This cannot be undone.` — it does not name places or
items), and surfacing the 403 lock refusal with a message directing the user to unlock.
BUG-50's note is corrected in the PR carrying this entry; the COO should re-size B7 before
dispatching it as fullstack.

### Implementation implications

- **Database:** drop `uniq_trip_places_trip_city`; add `index('idx_trip_places_trip_city')`
  on `(trip_id, city_id)` — the revisit pre-check queries exactly that pair on every place
  creation and would otherwise lose its index; add `sort_order` with a backfill that
  reproduces today's visible order. All three are additive or index-level — **no table
  recreation**, which keeps this clear of the drizzle-kit SQLite bugs in ADL-15. Rewrite the
  `trip_places` doc comment at `schema.ts:331-341`, which currently asserts "UNIQUE
  (trip_id, city_id): a trip visits each city at most once".
- **Backend (places):** `allow_revisit` + enriched 409 payload; `sort_order` assignment and
  `.orderBy` on `findByTrip` (`src/backend/repositories/places.ts:52`, which has no
  `ORDER BY` at all today); DP-06 as a one-shot; TR-15's required `items` parameter,
  failing closed with 400 rather than defaulting.
- **Backend (TR-14):** decision 9's startup assertion. No change to the delete path itself.
- **Binding rule for all future shading work:** any query deriving shading state from
  `trip_places` MUST aggregate `DISTINCT` on `trips.id` or on the geographic entity id, and
  MUST NOT count `trip_places.id` or bare rows. Before ADL-41 this was a nice property;
  after it, it is the only thing standing between the model and double-shaded countries.
  **ADL-44 (BUG-48) touches this exact query path and must not regress it.**

### Supersession and closure

- **ADL-24 §4.1/§4.2** (client-side sort by `arrived_on`, nulls last) is superseded by
  decision 4 — ordering becomes persisted and server-assigned. ADL-24 §5.2 (display date
  precedence: explicit place dates > hotel dates > trip dates) is **unaffected and remains
  current**. Both the ADL-24 log entry and `jobs/architect/tech/ADL-24-place-date-ranges.md`
  are stamped in the PR carrying this entry.
- **BRD §10 OQ-05** is closed in the same PR. No BRD version bump and no new requirement
  IDs are introduced by this entry — the COO owns that gate.

## ADL-42 — Booking item shape: multi-leg flights and multi-traveller seats

**Date:** 2026-07-27
**Status:** **Decided, implementation pending.** No schema, migration or code change was made
by this ADL — it is the design that unblocks those briefs. **Blocked on a COO BRD bump before
any brief dispatches** (see "COO action required" below).
**Trigger:** Wave 0 scoping brief S2, GitHub issue #272. Tracker BUG-41 and BUG-42, both
raised at the 2026-07-21 Scotland dogfood UAT.
**BRD refs:** §5.5 IT-01–IT-11, §5.6 FL-01–FL-04, CR-01–CR-02.
**Full ADL:** `jobs/architect/tech/ADL-42-booking-item-shape.md` — the standalone file carries
the table definitions, migration SQL, API shape and rejected alternatives. This entry is the
decision of record.

**Problem.** BUG-41 (multi-leg flights on one booking) and BUG-42 (multiple companions/seats
per booking) are one defect, not two: the booking item is flat. It models one segment of
travel carrying one implicit traveller. A Seattle→London→Glasgow itinerary on a single PNR
must today be two unrelated `flight` items (BRD FL-01, echoed at `src/backend/db/schema.ts:507`),
duplicating the booking reference with nothing keeping them equal and giving one booking two
statuses. Separately, `item_flights.seat` is one `TEXT` column and **no per-item companion
link exists anywhere in the schema** — companions attach to trips only, via
`trip_companions_map`. Neither is fixable alone: a seat belongs to a person on a leg.

**Decisions.**

| # | Decision | Recommendation | Confidence |
|---|----------|----------------|------------|
| D1 | Booking shape | New `item_flight_legs` child table under **one** flight item; `item_flights` retained as the booking-level extension row | High |
| D2 | Leg ordering | Explicit 1-based contiguous `leg_order`, full-replace on write — **not** sorted by `departure_datetime` | High |
| D3 | Parent vs leg fields | Parent: `booking_reference` (the PNR). Leg: airline, flight number, both airports, both datetimes | High |
| D4 | Traveller / seat model | **One** table `item_travellers` with a **nullable `leg_id`** selecting the scope; row presence = travels this scope; `seat` on the row | High |
| D5 | The owning user | `companion_id` **nullable**, `NULL` = "me". Do not synthesise a "Me" companion | High |
| D6 | Manifest mode | Per item, traveller rows are all leg-scoped (flights) or all booking-scoped (all other types) — never mixed | High |
| D7 | Cross-user companion guard | Mandatory `companionRepository.validateOwnership` (ADL-28 R4) at the new write path; `userId` is the repository's first argument | High |
| D8 | Does a leg have a status? | **No.** Status stays item-level (IT-03, FL-03) | High |
| D9 | Cost | Booking-level whenever introduced, never per-leg. Not added — no BRD requirement exists | High |
| D10 | Migration | **Two** files: additive create-and-backfill, then a separate destructive shrink of `item_flights` | High |
| D11 | API read path | Legs/travellers fetched in a **second batched query** — never `leftJoin`ed into `fetchItemsWithExtensions` | High |
| D12 | Compatibility shim | **None.** Backend and frontend land together | Medium |
| D13 | Traveller scope by type | `item_travellers` open to all item types; legs flight-only | High |

**Why one table for travellers (D4/D5/D6) — the load-bearing choice.** Three requirements
pull apart: multiple seats per leg, a companion who is on some legs but not others, and
non-flight items that have travellers but no legs. Having both a booking-level and a
leg-level junction is the trap — two homes for one fact, and "on the booking but no row on
leg 2" becomes ambiguous between *not travelling that leg* and *seat unknown*. A single table
with a nullable `leg_id` resolves it: **row presence is the assertion**, `seat IS NULL` means
"on this leg, seat unknown", and for flights the booking roster is derived
(`SELECT DISTINCT companion_id ... WHERE item_id = ?`), never stored, so a stored roster and
manifest cannot disagree. Uniqueness needs **four partial unique indexes**, because SQLite
treats NULLs as distinct and a plain composite unique would accept the same traveller twice;
the cheaper two-index alternative (a `0` self-sentinel) was rejected because `0` cannot carry
an FK to `companions.id` — referential integrity outranks index count.

`companion_id` must be nullable because **`companions` is a list of *other* people — the user
is not in it.** Today's single `seat` column *is* the user's own seat, implicitly; a
`NOT NULL companion_id` junction would have nowhere to put it, making the "fix" a regression.

**Why no leg status (D8).** A PNR is confirmed or cancelled as a unit. Per-leg status has no
correct aggregate (leg 1 Completed, leg 2 Cancelled → what does the item show?) and every
consumer reads one status: `itemRepository.findByTrip`'s `filters.status`, IT-06 bulk review,
IT-08/IT-09 rating filters, PL-03 planning-stage grouping. The real need behind it — "the
airline cancelled my second leg" — is an operational disruption, not a planning stage, and
belongs on its own nullable per-leg marker if the PO ever asks.

**Alternatives rejected:** legs as separate items joined by a `booking_group_id` (leaves N
statuses per booking); widening `item_flights` with `leg2_*`/`leg3_*` columns (hard cap,
unindexable); a JSON `legs` array (ADL-11 rejected JSON for item fields precisely because
SQLite cannot index JSON paths, and leg departure dates are queried —
`20260307-tech-blueprint.md:292`); and a generalised `item_segments` table spanning flights,
hotels and car rentals — the most elegant option and the wrong one, since it requires
migrating three extension tables and rewriting every route, helper, test and component to buy
a second segment for types that will never have one. Rejected on cost, not taste.

**Implementation implications.**
- Two new tables; `item_flights` shrinks to `(item_id, booking_reference)`. `items`,
  `item_hotels`, `item_car_rentals`, `item_restaurants` and `item_experiences` are untouched —
  blast radius stays small and ADL-11's pattern stays intact.
- **The most likely implementation bug:** `fetchItemsWithExtensions`
  (`src/backend/routes/items-helper.ts:82`) left-joins five **1:1** tables into one flat row.
  Legs and travellers are **1:N** — joining them multiplies rows (a 3-leg flight with 2
  travellers returns 6 rows for one item) and silently corrupts `effectiveRating`, the rating
  sort and the `minRating` filter. Second batched query, always.
- `item_travellers.companion_id` is a second write path to `companions.id` and therefore a
  path around AD-08. The repository signature must be
  `itemTravellerRepository.replace(userId, itemId, assignments)` — `userId` first and
  mandatory, so the junction cannot be written without the scoping value. Cross-user IDs are
  **400, not 404**, matching ADL-28. The Backend brief must mirror ADL-28's rejection tests
  from `src/backend/repositories/__tests__/trips.test.ts` into
  `src/backend/repositories/__tests__/items.test.ts`.
- Migration is **two files**: file 1 creates the tables and backfills one leg per existing
  flight plus the legacy `seat` as the owning user's seat on leg 1; file 2 drops the seven
  moved columns. Steps in file 1 read columns file 2 destroys, and Drizzle cannot know the
  ordering — two files make inverting it structurally impossible and leave a safe, reversible
  resting point. Verify row counts on staging between them. `db:push` remains forbidden (ADL-15).
- `patches/drizzle-kit+0.31.9.patch` Bug 4 (partial-index `WHERE` reading) is **load-bearing**
  for the four partial unique indexes; without it drizzle-kit will churn these migrations.
  Verified expressible: `uniqueIndex()` and `index()` share one builder in the installed
  drizzle-orm (`sqlite-core/indexes.d.ts`, `IndexBuilder.where()`).
- **BUG-45/ADL-43 cross-dependency:** `airline` moves to `item_flight_legs`. The sourced
  airline dropdown must target `item_flight_legs.airline`, not `item_flights.airline`, or that
  brief will need reworking.
- No back-compat shim, so the Database brief may merge alone (additive), but the Backend and
  Frontend changes must land on one branch as a single brief —
  `src/frontend/types/api.ts:133–141`, `ItemCard.tsx`, `ItemForm.tsx` and `useItems.ts` all
  read the flat flight keys that disappear.
- **Naive datetimes make one UI feature unsafe:** leg datetimes carry no timezone, so layover
  and total-journey durations computed across legs are wrong whenever a connection crosses a
  timezone — which is the norm for the itinerary that motivated BUG-41. The frontend must not
  display connection durations until timezone data exists (depends on airport reference data,
  ADL-43's territory).

**Drift found while checking, flagged not fixed:** BRD IT-03 (v3.0) lists **Shortlisted** as
an item status, but `chk_items_status` (`src/backend/db/schema.ts:499`) permits only
`consider, confirmed, completed, cancelled, next_time` and the string `shortlisted` appears
nowhere in `src/`. It was added to the BRD and never implemented; its home is the
deprioritized planning-core tracker entry. ADL-42 does not rebuild the `items` table so it
neither depends on nor resolves this.
> **RESOLVED (2026-07-28) — BRD v3.11 (QUAL-09).** PO direction: `Shortlisted` is removed
> from the BRD rather than added to the schema. Consider vs Confirmed is the whole planning
> loop. `chk_items_status` stands unchanged; no migration owed.

**COO action required before any brief dispatches** (CLAUDE.md BRD gate): **FL-01 is
superseded** — "Each flight is logged as an individual leg" is the exact model this replaces —
and must be rewritten and stamped `> SUPERSEDED (2026-07-27) by ADL-42 — retained for history.`
FL-02 must move `seat` off the flight field list. BUG-41 and BUG-42 both have empty `brdRefs`
and need new requirement IDs with measurable success criteria. **The BRD was deliberately not
edited here** — the FL-01 stamp belongs in the COO's BRD-bump PR alongside the new IDs and the
header/§13 changelog bump, not split across two PRs leaving the BRD internally inconsistent in
between. The implementing Database brief must also rewrite `src/backend/db/schema.ts:507`,
which still asserts the superseded FL-01 model; `jobs/database/tech/schema.ts:507` is a stale
copy carrying the same claim and needs refreshing or a HISTORICAL banner.
`jobs/architect/tech/20260307-ER-schema.md:303` repeats it but already has a HISTORICAL banner
and needs no further stamp.

**Supersession:** no ADL entry is superseded. **ADL-11** (base + extension tables) is preserved
and extended — `item_flights` remains the 1:1 booking extension and the leg table is a new 1:N
child beneath it. **ADL-28** (per-user companions) is reinforced — its `validateOwnership`
guard becomes mandatory at a second write path. The one supersession is BRD FL-01, stamped by
the COO per the paragraph above.

**Out of scope:** BUG-43 (Apple Wallet `.pkpass` import) — not designed. Two notes only for
whoever picks up the spike: a boarding pass carries exactly *(flight number, both airports,
both times, seat, passenger name, PNR)*, mapping 1:1 onto one leg row plus one traveller row,
so this design is import-shaped by construction; and an importer would dedupe on
`booking_reference`, so that column must **not** be made globally unique — dedupe within
`(user_id, booking_reference)` at the application layer.

## ADL-43 — Sourced reference data: ISO 3166-2 subdivisions, airlines, car rental providers

**Date:** 2026-07-27
**Status:** **Decided, implementation pending.** No schema, migration, seed data or code change
was made by this ADL — it is the design that unblocks those briefs. **Blocked on a COO BRD
bump before any brief dispatches** for the BUG-45 half (see "COO action required" below); the
OQ-06 half needs no new BRD ID (§9/§10 of the standalone file).
**Trigger:** Wave 0 scoping brief S3, GitHub issue #273. Tracker `BUG-45` and `OQ-06`.
**BRD refs:** §5.2 GE-01–GE-15, §5.6 FL-01/FL-02, CR-01/CR-02.
**Full ADL:** `jobs/architect/tech/ADL-43-sourced-reference-data.md` — the standalone file
carries the evidence (measured row counts, verified license text, sampled dataset structure),
full per-list reasoning, and rejected alternatives. This entry is the decision of record.

**Problem.** `BUG-45` (airline/car-rental-provider free text → dropdown with "Other" fallback)
and `OQ-06` (ISO 3166-2 subdivision seeding vs. hand-seeding gaps, as `BUG-30` did for GB) are
posed as one decision: does this project source reference data from a maintained dataset, or
keep patching gaps one at a time? Evidence gathered this session shows the honest answer is
**"it depends which list"** — two of three lists have a suitable external source, one does not,
and the two that do have materially different licensing obligations. `data/regions.json` holds
76 rows across 4 countries while `data/countries.json` marks **26** countries
`region_tier_enabled = 1` — **22 of those 26 have zero seeded regions today**, meaning any of
them can reproduce `BUG-30`'s exact failure the moment a user logs a trip there.

**Decisions.**

| # | Decision | Recommendation | Confidence |
|---|----------|-----------------|------------|
| S1 | Subdivisions: source | `country-region-data` (npm, MIT, verified license/size) generates `data/regions.json` — does not replace `countries.region_tier_enabled` config | High |
| S2 | Subdivisions: scope | Generate for the 26 currently-enabled countries only (940 rows, measured), not all 249 (4,387 rows) | Medium |
| S3 | Subdivisions: per-country override | A small, committed override table for category mismatches — **GB is a confirmed, verified case** (see below), not hypothetical | High |
| S4 | Subdivisions: storage | Unchanged — same `data/regions.json` shape, same `regions` table, same startup-seed path. No new table | High |
| A1 | Airlines: source | `airline-codes` (npm) → OpenFlights `airlines.dat`, filtered to active + IATA-coded (978 rows, measured) | Medium |
| A2 | Airlines: storage | **New `airlines` table**, admin-list pattern (`trip_categories`/`activities`), queried via a backend search endpoint — **not** a bundled frontend JSON | High |
| A3 | Airlines: licensing | OpenFlights data is **ODbL**, not MIT — the npm wrapper's MIT claim covers its own code only (verified against `jpatokal/openflights/data/LICENSE` on GitHub). Attribution + license text required. Flagged for re-confirmation — `openflights.org` itself unreachable through this container's firewall | Medium |
| C1 | Car rental providers: source | **None exists** — checked npm this session, no equivalent to OpenFlights/ISO 3166-2 | High |
| C2 | Car rental providers: mechanism | Hand-curated list (~20–30 major brands), same admin-list pattern as airlines — this is the negative case proving "source everything" isn't a blanket policy | High |

**Why not just reuse the Natural Earth boundary data already bundled for GE-10 (ADL-09) —
the load-bearing finding.** Both Natural Earth's `geo/regions.json` (already in this repo) and
`country-region-data` (the recommended new source) were checked against GB directly and **both
return 217 UK county/unitary-authority codes, and neither includes `GB-ENG`/`GB-SCT`/`GB-WLS`/
`GB-NIR`** — the exact four codes `BUG-30` needed. This is not a defect in either dataset; ISO
3166-2 assigns multiple coexisting category levels per country, and any systematic source picks
one. It happens to match this app's state/province intent for the US/CA/AU/DE style of country
and is wrong for GB. **The per-country override table (S3) is therefore not a "handle GB, done"
patch — it is the standing mechanism for the next country that hits this same mismatch,** and
should be built as such. This converts an unbounded, discovery-driven hand-seeding backlog into
a small, reviewable exception list — which is the actual improvement OQ-06 asked for.

**Why airlines and car rental providers don't collapse into "the same fix" as subdivisions.**
Three genuinely different mechanisms, not one, once the evidence is in:
1. Subdivisions — external source + mandatory override table, generated into the existing
   `data/regions.json`/`regions` table shape. No new table.
2. Airlines — external source (OpenFlights) into a **new** admin-list table, carrying an ODbL
   attribution/share-alike obligation that subdivisions (MIT/public domain) do not.
3. Car rental providers — **no external source exists**; hand-curated into the same table
   *pattern* as airlines, but the provenance step is categorically different.
The one thing genuinely shared is a principle — prefer a maintained source when one exists,
verify its licensing and granularity against actual product intent before adopting it, fall
back to the existing `AD-09` curated-list pattern when none exists — not a single pipeline.

**Alternatives rejected:** reusing `geo/regions.json` directly for the `regions` DB table
(wrong GB granularity, verified); seeding all 249 countries now instead of the 26 enabled ones
(speculative — no consumer until GE-07 enables a country); bundling the filtered airline list as
a frontend JSON array mirroring `geo/countries.json` (this project has a live, same-batch
cautionary tale about exactly this shape of mistake — `ADL-44`, `geo/regions.json` at 39–40 MB
slowing the map); adding `airline_id`/`provider_id` FK columns instead of keeping free text
(unneeded — `BUG-45`'s own spec requires an unconstrained "Other" value to keep working
regardless); treating this as one dataset decision covering all three lists as the brief poses
it (collapses genuinely different licensing regimes and data availability into one answer).

**Implementation implications.**
- No changes to `item_flights`, `item_flight_legs` (ADL-42), or `item_car_rentals` — the
  `airline`/`provider` columns stay plain `TEXT`; the dropdown is a frontend concern backed by a
  new read-only reference endpoint writing the same string shape the API accepts today.
- **Cross-dependency on ADL-42:** the airline dropdown's real target is
  `item_flight_legs.airline` (not yet in `schema.ts` — ADL-42 is decided, implementation
  pending). The flight half of `BUG-45` cannot land until ADL-42's Database brief ships; the
  car-rental-provider half has no such dependency.
- New tables (illustrative shape, Database brief to formalize): `airlines(id, name, iata_code,
  icao_code, is_active, created_at, updated_at)` and `car_rental_providers(id, name, is_active,
  created_at, updated_at)` — both follow the existing `trip_categories`/`activities` pattern
  (`src/backend/db/schema.ts:141-167`) exactly: global, seeded, owner-deactivatable (`AD-09`,
  not the per-user `AD-08` pattern).
- New read-only routes: `GET /api/reference/airlines?q=` (search, backend-filtered — keeps the
  978-row list off the client, learning `ADL-44`'s lesson rather than repeating it) and
  `GET /api/reference/car-rental-providers` (small enough to return in full). `requireAuth`
  only, no `userId` scoping — global lists, same access shape as trip categories/activities.
- Generation scripts (devDependency-only) regenerate `data/regions.json` and an airlines seed
  source on demand; output is committed and reviewed, never fetched live — GE-10/11–13's
  offline guarantee is unaffected because all three lists land as DB rows via the existing
  seed-on-first-launch path, same as `trip_categories`/`activities`/`regions` today.
- License/attribution addition required before shipping airlines: an in-repo notice (alongside
  the existing Natural Earth credit in `README.md`) plus the ODbL license text committed
  somewhere reachable. Not needed for `country-region-data` (MIT) or Natural Earth (public
  domain, unaffected by this ADL).
- Recommend a `BUG-30`-class regression check: assert every `region_tier_enabled = 1` country
  has at least one `regions` row — one query, catches the next silent gap automatically.

**Drift found while checking, flagged not fixed:** none beyond the GB granularity point above,
which is the decision's own subject rather than incidental drift.

**COO action required before any brief dispatches** (CLAUDE.md BRD gate): `BUG-45` changes
user-facing behaviour (free text → dropdown) and has empty `brdRefs`. Suggest new §5.6
requirements (e.g. `FL-06` for airline — `FL-05` is already taken by ADL-42's leg-ordering
requirement, BRD v3.9 — and `CR-03` for car rental provider) with success criteria — see the
standalone file §9 for suggested wording. **Not added here** — the COO owns the BRD gate
and bump. `OQ-06` is an internal sourcing decision, not a new user-facing requirement; recommend
closing it as answered without a new BRD ID (judgement call for COO to confirm, not asserted as
settled).

**Supersession:** none. `ADL-09` (Natural Earth boundary data) is unaffected and reinforced —
this ADL explicitly distinguishes boundary/shading data (GE-10, `geo/*.json`, ADL-09's
territory) from region/airline/provider reference data (this ADL's territory) so the two are
not conflated later, which is exactly the mistake the GB check above caught in this project's
own existing data. `BUG-30`'s migration stands as the historical GB fix; this ADL's override
table is the mechanism for the next country, not a retroactive change to that migration.

**Out of scope:** the override-table schema/DDL, the generation scripts, the `airlines`/
`car_rental_providers` migration, the reference-endpoint route handlers, and the frontend
dropdown component — all spec-level only per this brief's scope. Database and Backend briefs
implement from the standalone file's §8 once the COO BRD gate above clears.

## ADL-44 — Region-shading geometry payload: per-country split, not a lower threshold

**Date:** 2026-07-27
**Status:** **Decided, implementation pending.** No code, asset, or schema change was made
by this ADL — it is the design that unblocks the implementing brief.
**Tracker:** BUG-48 | **GitHub:** #275 | **Full ADL:** `jobs/architect/tech/ADL-44-region-shading-payload.md`

**Trigger:** Wave 0 scoping brief S5. BUG-48 reads as "lower the zoom threshold" — it is
not. `MapView.tsx:28` sets `REGION_ZOOM_THRESHOLD = 3`, but region shading's geometry
fetch (`RegionLayer.tsx:16,77`, `/geo/regions.json`) pulls **one unscoped, uncompressed,
world-covering file for all 241 countries** on every threshold crossing. Lowering the
threshold fires that fetch sooner and more often — it makes the reported latency worse
while appearing to fix the complaint in a quick manual test.

**Verified, not assumed** (full measurements in the standalone doc §2): the file is
40,726,851 bytes (38.8 MiB) — the COO's "39 MB" probe was correct. No compression
middleware exists on the `/geo` static mount (`server.ts:195`) and no cache headers are
set. The fetch is not scoped by country (`REGIONS_GEOJSON_URL` is a constant), even
though the shading-*state* API it pairs with already is
(`GET /api/map/shading/regions/:countryCode`). Grouped by country, the same source data
is 30×–400× smaller per country than the world file (median 92 KB; worst case Russia
3.26 MB; the bug's own US example, 1.39 MB) — the per-country split is the load-bearing
fix, not a nice-to-have. The bundled file is also ~10× the tech blueprint's own original
budget (`20260307-tech-blueprint.md:227-236`, ~4 MB estimate for the 10 m admin-1
extract) — stamped superseded, see below.

**Decision:** Split `geo/regions.json` into one static, still-fully-bundled file per
country (`geo/regions/{ISO_A2}.json`), fetched lazily for only the visible country.
Combine with: property whitelist (`iso_3166_2` + `name` only — 119 of 121 Natural Earth
columns are dead weight, nothing else is read by the frontend), topology-preserving
geometry simplification for the handful of large/complex countries (Russia, Canada, US,
GB, Indonesia, Philippines), `compression` middleware + long-lived `Cache-Control` on the
`/geo` static mount. No server/DB compute involved (Railway/Turso irrelevant — this stays
a build-time static-asset problem). `REGION_ZOOM_THRESHOLD` itself is left at `3` in this
ADL; further tuning is a product-feel call for a follow-up PO/UAT once the payload no
longer confounds it.

**GE-10 compliance (the hardest constraint) — addressed directly, not glossed:**
per-country files are generated once at build time and committed as static assets exactly
like today's single file; they are served by the app's own Express instance
(`express.static`), the same trust boundary already used for `geo/countries.json` and
every `/api/*` route, whether that server is `localhost` (offline Electron) or the hosted
Railway deployment. Today's implementation already issues a network fetch to a locally
bundled file (MapLibre's GeoJSON `Source` XHRs `/geo/regions.json`) — GE-10 has never
meant zero HTTP requests, only zero dependency on the internet or a third-party host.
Splitting one locally-served file into many locally-served files does not change that
guarantee. What *would* violate GE-10 — fetching geometry from a third-party geodata host
or MapTiler-hosted vector tiles at render time — was considered and explicitly rejected
(standalone doc §5).

**ADL-41 DISTINCT invariant:** no conflict. This ADL never touches
`shading.service.ts` or any SQL aggregate — it changes only how boundary *geometry*
reaches the client, never how shading *state* is computed. The implementing brief's diff
to `shading.service.ts` must be zero lines; that is a stated success criterion (standalone
doc §7).

**Supersession:** `20260307-tech-blueprint.md` §2.3 (single-file ~4 MB estimate,
"loaded once … cached in memory for the session" delivery model) stamped
`> SUPERSEDED (2026-07-27) by ADL-44` in this PR. `20260307-map-shading-spec.md` was
checked in full and found to specify only shading-state SQL, never geometry delivery —
no stamp applied, nothing there is affected.

**Drift flagged, not fixed (spec-only scope):** `MapView.tsx:6` documents region shading
loading "at zoom >= 4"; the constant at line 28 is `3`. Whoever implements this brief and
touches `MapView.tsx` must correct the comment.

**Implications:** see standalone doc §6 for the full implementation surface
(`RegionLayer.tsx` URL parameterisation and a `<Source>` re-fetch-on-country-change risk
to verify, `server.ts:195` / `server-test-app.ts:112` static options, the new build-time
preprocessing step) and §7 for measurable success criteria (per-country payload budget,
render-latency target, simplification QA checklist) satisfying the CLAUDE.md
success-criteria-before-dispatch gate. No new BRD requirement ID needed — reported to
COO per §8, not added by this ADL.

## ADL-45 — Item map URL: base-table column, https-only + no host allowlist, reuse (don't fork) the existing sanitiser

**Date:** 2026-07-27
**Status:** Decided, implementation pending.
**Trigger:** GitHub issue #276 (Wave 0 scoping brief S6). BRD §5.5 IT-10 (added v3.1,
2026-07-20 UAT) — each item can optionally store a Google Maps URL; when present it
surfaces a one-click map/directions link and no separate address/phone fields are required.
**BRD refs:** §5.5 IT-10 (success criteria already stated — unchanged by this decision).
Unblocks BRD-IT10 (tracker) and feeds BRD-MB0102 (§5.15 MB-02, directions link on phone).
**Depends on:** ADL-11 (base + extension table split), ADL-15 (migrate-only workflow),
security-spec.md SEC-12 (output encoding / URL sanitisation, Phase 1).
**Supersedes:** nothing. Extends SEC-12's scope from one field (`trips.photo_album_ref`) to
two; does not change SEC-12's rule.

---

### Summary table

| # | Decision | Recommendation | Confidence |
|---|----------|-----------------|------------|
| D1 | Column placement | New nullable `map_url` on the **base** `items` table, not on any `item_*` extension table. | High |
| D2 | Column name/type | `map_url text`, nullable, no default. Not `google_maps_url` — see D4 on why. | High |
| D3 | Length cap | Zod `.max(2048)` at the validation layer only. No DB `CHECK(LENGTH(...))` — matches the existing `zName` precedent (75-char cap, zod-only, no DB check). | High |
| D4 | Host restriction | **No** Google-host allowlist. Accept any well-formed `https://` URL. | High |
| D5 | Scheme allowlist | `https://` only — narrower than the existing `sanitiseUrl()` (`https:`/`file:`). `file://` is dropped for this field. | High |
| D6 | Where validation runs | Both. Server (Zod, new `zMapUrl` in `common.ts`) is authoritative and rejects on write (400). Client re-validates at render via `sanitiseUrl()` before using the value as an `href` — never trust a stored value just because it once passed the server check. | High |
| D7 | Sanitiser implementation | **Extend** `src/frontend/utils/urlSanitiser.ts`'s `sanitiseUrl()` to take an optional allowed-scheme list (default preserves current `https:`/`file:` behaviour for `photo_album_ref`); call it with `['https:']` for `map_url`. Do not write a second sanitiser. | High |
| D8 | Rendered anchor attributes | `target="_blank" rel="noopener noreferrer"`. Mandatory, not optional. | High |
| D9 | Migration | One additive file, `db:generate` + `db:migrate`. Plain `ALTER TABLE items ADD COLUMN map_url text` — no table recreation, no backfill, no two-file split (unlike ADL-42). | High |
| D10 | Overlap with §5.6 structured fields | None. `map_url` is additive; existing fields (`item_hotels.address` etc.) are untouched and can coexist with a populated `map_url`. | High |

---

### D1 — column placement: base `items` table

**Recommendation:** `map_url` belongs on `items`, alongside `notes`, not on any of the five
`item_*` extension tables (`src/backend/db/schema.ts:453-503`).

- IT-10's own text is type-agnostic ("each item can optionally store…"); the brief's
  framing confirms it — this applies to restaurants, hotels and experiences, not only
  flights. A base-table column is the only placement that covers all six `item_type`
  values without a per-type migration times five.
- `notes` (`schema.ts:464`) is the direct precedent: a field IT-04 requires on *all* item
  types lives on `items`, not duplicated into every extension table. `map_url` is the same
  shape of requirement.
- Every `item_type` value, including `note`, gets the column. No per-type conditional is
  needed anywhere in the schema or in Zod — `notes`-type items simply leave it unset. This
  is a deliberate non-decision: special-casing `note` out would need a CHECK SQLite cannot
  express against another table's data (`items.item_type`), the same class of constraint
  ADL-42 D13 already declined to add for `item_travellers`.
- Rejected: adding `map_url` independently to `item_hotels`, `item_restaurants`,
  `item_car_rentals`, `item_experiences` and (for symmetry) `item_flights`. Five migrations
  instead of one, and a base-table field would still be needed for `note`/uncovered future
  types — no actual benefit for the extra tables touched.

### D2/D3 — name, type, length

**Recommendation:** `map_url text`, nullable, no DB default. Length capped at 2048 chars,
enforced only in the Zod schema (`common.ts`), not via a DB `CHECK`.

- `google_maps_url` was considered and rejected — see D4, the column deliberately does not
  enforce a Google-only constraint, so a name promising one would mislead the next reader.
- 2048 is the conventional practical URL length ceiling (the historical IE limit, still
  the norm most apps borrow) — generous for any real Google Maps share link (which run to a
  few hundred characters) while bounding storage and JSON payload size.
- No DB `CHECK` for length: `zName` (`common.ts:12-16`) caps trip/item names at 75 chars
  and there is no matching `CHECK(LENGTH(name) <= 75)` anywhere in `schema.ts` — confirmed,
  `grep -n "LENGTH(" src/backend/db/schema.ts` returns nothing. This project's existing
  split is: relational/enum invariants (`chk_items_item_type`, `chk_items_status`,
  `chk_items_is_carried_forward`) get a DB `CHECK`; field-level formatting and length
  constraints are Zod-only. A URL length cap is the latter kind. Following the split also
  avoids forcing SQLite table recreation for a `CHECK`-constrained column add (see D9).

### D4/D5 — validation: scheme allowlist, no host allowlist

This is the security-relevant decision the brief exists for.

**D5 — scheme: `https://` only, narrower than the existing sanitiser.**
`src/frontend/utils/urlSanitiser.ts` already implements exactly this class of control for
`trips.photo_album_ref`, per SEC-12 (`_project/security-spec.md:330-331`: "only `https://`
and `file://` schemes are permitted... Reject `javascript:` and `data:` schemes"). Reuse it
(D7) rather than invent a second control — but narrow the allowed set for this field:
`file://` is dropped. A local file path is a legitimate way to reference a photo album on
the same machine; it is never a legitimate value for a "get directions" link a user taps
from their phone (BRD MB-02). Widening the accepted scheme set beyond what the field can
legitimately use only grows the injection surface for no product benefit.

**D4 — no Google-host allowlist. Accept any well-formed `https://` URL.**

- Real Google Maps links are not one host. `google.com/maps`, `maps.google.com`,
  `goo.gl/maps`, `maps.app.goo.gl` and `g.page` have all been live Google-issued share-link
  domains at different times (the BRD's own §12 example note uses `maps.google.com`). A
  host allowlist is a maintenance liability that silently breaks the feature the day Google
  issues a link from a domain not on the list — a false rejection is a worse failure mode
  for this field than accepting a non-Google link, because it makes IT-10 *appear* broken.
- The security control this field needs is scheme allowlisting, not host allowlisting.
  Rendering `<a href>` to an attacker-controlled `https://` host is not an XSS vector — the
  browser navigates the tab (or a new one, per D8), it does not execute injected script or
  read local files. `javascript:`/`data:`/`vbscript:` are the vectors SEC-12 exists to
  block, and scheme allowlisting blocks all of them regardless of host.
- IT-10's text names "a Google Maps URL" as the illustrative, expected case, not an
  exclusivity requirement — nothing in the requirement or its success criteria says a
  non-Google link must be rejected. Staying host-agnostic also leaves room for an Apple
  Maps or other provider link without a future schema/validation change, which is exactly
  the kind of foreclosure this project's future-proofing principle exists to avoid.
- Rejected alternative: allowlist `google.com`, `maps.google.com`, `goo.gl`,
  `maps.app.goo.gl`, `g.page` (suffix-matched). Considered and set aside — it adds ongoing
  maintenance risk (new Google short-domains have appeared before) for a control that does
  not address the actual threat model (scheme, not host) and BRD IT-10 does not ask for it.

### D6/D7 — where validation runs, and reusing the existing control

**Server-side (authoritative):** add `zMapUrl` to `src/backend/validation/common.ts`,
alongside `zName`/`zHexColor`/`zCountryCode`:

```typescript
export const zMapUrl = z
  .string()
  .trim()
  .url()
  .max(2048, 'Map URL must be 2048 characters or fewer')
  .refine((u) => u.startsWith('https://'), {
    message: 'Map URL must use https://',
  })
  .optional();
```

Wire it into `CreateItemSchema` and `UpdateItemSchema`
(`src/backend/validation/items.schemas.ts:10-17`, `itemBase`) as `map_url: zMapUrl` —
base-table field, so it belongs in `itemBase`, not `extensionFields`.

**Finding, flagged not fixed:** `trips.photo_album_ref` — the field SEC-12 was written for
— has **no** server-side scheme validation today. `CreateTripSchema`/`UpdateTripSchema`
(`src/backend/validation/trips.schemas.ts:22,37`) both type it as plain `zOptionalString`.
The only enforcement point that exists is the frontend `sanitiseUrl()`, and (next finding)
that function is not currently called from any component —
`grep -rln "sanitiseUrl" src/frontend` returns only the utility file and its own test file.
So `photo_album_ref` can be written today with a `javascript:` value and the server accepts
it; it happens to be harmless only because nothing renders it as a link yet. This is a
pre-existing gap this ADL does not fix (`photo_album_ref` is out of scope for IT-10), but it
should not be repeated for `map_url` — `zMapUrl` above is the authoritative check this field
gets that its predecessor didn't. Recommend a small follow-up tracker item: add the same
scheme check to `photo_album_ref`'s schema and wire `sanitiseUrl()` into wherever it is
(or will be) rendered.

**Client-side (defense in depth, not authoritative):** extend `sanitiseUrl()`:

```typescript
export function sanitiseUrl(
  url: string | null | undefined,
  allowedSchemes: string[] = ['https:', 'file:'],
): string | null {
  if (!url) return null;
  try {
    const scheme = new URL(url).protocol; // throws on unparseable input
    return allowedSchemes.includes(scheme) ? url : null;
  } catch {
    return null;
  }
}
```

(Switching from `startsWith` string checks to `new URL(url).protocol` is optional hardening
noted here for completeness, not mandatory — `startsWith('https://')` remains correct for
this use since scheme confusion tricks like `https:/\evil` are a redirect/parsing concern,
not a script-execution one. Either implementation satisfies this ADL; do not block the
brief on this detail.) Call it as `sanitiseUrl(item.map_url, ['https:'])` wherever the item
card renders the map affordance (`src/frontend/components/TripDetail/ItemCard.tsx`, near the
existing `item.notes` rendering at line 132). Update the file's header comment — it
currently says "The only Phase 1 user-supplied URL field is trip.photo_album_ref"
(`urlSanitiser.ts:9`), which becomes false the moment this lands.

**Why one function, not two:** ADL-42 (D4-D6) rejected a two-junction traveller model
specifically because two homes for one fact make later disagreement possible and silent.
The same argument applies here at smaller scale — a second, independently-written
`sanitiseMapUrl()` is one more place the scheme allowlist can drift out of sync with SEC-12
the next time either field's rule changes. One function, parameterised, is not just less
code; it is the only version of this control that structurally cannot disagree with itself.

### D8 — rendered anchor attributes

**Recommendation:** every rendered map-link anchor carries `target="_blank"
rel="noopener noreferrer"`. Not optional.

- `target="_blank"` without `rel="noopener"` lets the opened page reach back into
  `window.opener` and repoint the original tab (reverse tabnabbing) — a standard,
  well-documented control for exactly this pattern (user-supplied external link, opened in
  a new tab). `noreferrer` additionally suppresses the `Referer` header, which is a
  reasonable default when the destination host is unvalidated (D4).
- There is no existing anchor-rendering code in this app to pattern-match against —
  `sanitiseUrl()` is written and tested but never called from a component (D6 finding), so
  IT-10 is the first place this pattern is actually established, not just specified. Being
  explicit here is why this ADL states it rather than leaving it to be re-derived.

### D9 — migration

**Recommendation:** one migration file via `npm run db:generate` + `npm run db:migrate`.
`db:push` remains forbidden (ADL-15).

Because `map_url` is nullable with no default and adds no new `CHECK` constraint, SQLite's
native `ALTER TABLE items ADD COLUMN map_url text` applies directly — no table recreation is
needed (recreation is only required when a new `CHECK`/`NOT NULL` needs backfill, or an
existing constraint must be redefined). This is a second, independent reason (besides the
D3 reasoning) to skip a DB-level scheme or length `CHECK` on this column: adding one would
force the same expensive recreate-and-copy migration path, touching the same
`patches/drizzle-kit+0.31.9.patch`-dependent CHECK-regex machinery ADL-15 documents as
previously buggy, for a control that is already authoritatively enforced at the Zod layer
(D6). Unlike ADL-42, this does not need a two-file split — there is no data to backfill and
nothing later in the same change destroys columns the first step reads.

### D10 — relationship to §5.6 structured confirmation fields

**Recommendation:** no conflict, no schema change to any `item_*` extension table.

IT-10's "no separate address or phone fields are required when a URL is set" describes
*optionality*, not field removal: a hotel item can still populate `item_hotels.address`
(HT-01, `travel-tracker-BRD.md:180`) independently of `map_url`, and neither field implies
or requires the other. No BRD field is a phone number anywhere in §5.6 today (restaurants,
hotels, car rentals, experiences — none list one), so there is nothing to reconcile there
either; the BRD clause is forward cover for a field that does not yet exist, not a
description of a current overlap. Nothing in this ADL asks the COO to touch §5.6.

---

### What this ADL does not decide

- **Whether `photo_album_ref` gets the same server-side scheme check.** Flagged in D6 as a
  pre-existing gap; fixing it is a separate, small follow-up, not bundled into IT-10's
  brief.
- **Wiring `sanitiseUrl()` into an actual `photo_album_ref` render.** Same status — flagged,
  not actioned. Whoever picks up `map_url` will write the first real caller of this
  function; extending it to `photo_album_ref` at the same time would be a reasonable, small
  scope increase for that brief to accept, but is not required by this decision.
- **Any change to `security-spec.md` SEC-12 itself.** The rule text ("URL fields (e.g.
  `photo_album_ref`)...") already reads as illustrative, not exhaustive, so `map_url` fits
  under it without an edit. The implementing brief should still add `map_url` as a second
  named example there, for the next reader — noted as a nice-to-have, not gating.

---

**Implementation implications:**
- `src/backend/db/schema.ts` — add `mapUrl: text('map_url')` to the `items` table
  definition (`schema.ts:453-503`), nullable, no default, no CHECK.
- `src/backend/migrations/` — one new file (`db:generate`), e.g.
  `00NN_adl45_item_map_url.sql`.
- `src/backend/validation/common.ts` — add `zMapUrl` (D6).
- `src/backend/validation/items.schemas.ts` — add `map_url: zMapUrl` to `itemBase`
  (`items.schemas.ts:10-17`).
- `src/frontend/types/api.ts` — add `map_url: string | null` to `Item`
  (`api.ts:114`).
- `src/frontend/utils/urlSanitiser.ts` — extend `sanitiseUrl()` with an optional
  allowed-scheme parameter (D7); update its stale header comment.
- `src/frontend/components/TripDetail/ItemCard.tsx` — render the map/directions affordance
  when `sanitiseUrl(item.map_url, ['https:'])` is non-null; `target="_blank"
  rel="noopener noreferrer"` (D8). No affordance when null (covers both "not set" and
  "failed validation" — same rendering for both is correct, a rejected scheme should never
  surface as a broken or suspicious link).
- `src/frontend/components/TripDetail/ItemForm.tsx` — add the optional URL input field.
- `_project/security-spec.md` SEC-12 — optional, non-blocking addition of `map_url` as a
  second named example (see "What this ADL does not decide").

**Supersession:** none.

---

## ADL-46 — Per-user access model: resource tier × role, city creation, and external egress policy

**Date:** 2026-07-28
**Status:** Decided — **spec only, implementation pending.** Backend **and Database** briefs
specified but not yet dispatched; no code, schema or migration changed by this decision.
**Trigger:** GitHub issue #326. BUG-63 (P1 — a non-owner cannot add a place to a trip at all,
reproduced on staging with the browser console captured), bundled with BUG-55, BRD-AD09 and
D-12 item 1 because all four are one question: which surfaces are reachable by whom.
**PO direction mid-task (recorded because it changed the outcome):** the PO decided AD-09
outright — categories and activities become **per-user**, lazy-seeded from the global defaults
so a new user is never blank; countries stay owner-only. **This reversed the Architect's draft
position**, which had kept creation owner-only and deferred per-user entries; that draft
objection (any user writing irreversibly into every other user's global pickers) is entirely
dissolved by the per-user model, and the draft is withdrawn. The PO also split city creation out
of SE-03 and directed that questions 3 and 5 be answered together.
**BRD refs:** §5.11 SE-01, SE-03; §5.10 AD-09 — all three amended (proposed text in the
standalone doc §6, for the COO to apply as v3.13). One new ID **flagged, not invented**:
**GE-16** (city create-on-demand — **blocking**, it is the BRD home for the cities decision).
*(A deferred AD-10 was proposed in the draft to hold per-user entries; the PO's direction
promotes that capability into AD-09 itself, so AD-10 is no longer needed.)*
**Standalone doc:** `jobs/architect/tech/ADL-46-non-owner-access-model.md` — full analysis,
proposed BRD text, the test-assertion change list, the phasing and both brief specs live there.

**The finding that reframes it.** BUG-63 is not a forgotten gate. **SE-03 and AD-09 contradict
each other in the BRD**, on the same routes: SE-03 names "city creation" an owner-only admin
operation and AD-09 says "any user can add custom entries" for categories/activities. The code
implements SE-03 faithfully; AD-09's clause was never built (established by two independent
probes — a structural code read of the router mounts, and a table-symbol grep across the whole
backend that does not depend on router naming). SE-03 was *already* stale in two of its five
clauses: AD-07 and AD-08 moved map-shading config and companions to per-user `requireAuth` and
SE-03 was never updated. And **ADL-38 named categories/activities as "the same data tier" as the
countries/regions it opened, in writing, and stopped one step short** — BUG-63 is the predictable
consequence six days later.

**Decision (9 parts).**
1. **D1 — access is determined by resource *tier* × operation, not role alone.** Three tiers:
   global reference data (countries, regions, cities — read `requireAuth`, write `requireOwner`
   bar an explicitly-specified constrained path), per-user data (trips, places, items, companions,
   shading config, **and now categories + activities** — `requireAuth` + `userId` scoping), and
   instance administration (`requireOwner`). Unstated tier defaults to instance administration.
   **This is the load-bearing decision** — a rule that classifies *future* routes is the only thing
   that stops a fourth recurrence after BUG-61/62/63. URL prefix is not a tier
   (`/api/admin/countries` is tier 1; `PATCH /api/cities/:id` is tier 3).
2. **D2 — non-owner READ of active categories/activities opens** (`requireAuth`), extending
   ADL-38's read/write split unchanged. Only `/active`; the unfiltered admin lists stay owner-only.
   **Explicitly temporary scaffolding** — S3 moves these resources off `/api/admin/*` entirely and
   deletes the carve-out in the same release, so it never reaches production.
3. **D3 — categories and activities become PER-USER** (PO-decided): `userId NOT NULL` FK with
   cascade, global `UNIQUE(name)` → `UNIQUE(user_id, name)`, existing rows migrated to the owner
   via ADL-28's CROSS JOIN pattern, lazy-seeded from the global defaults on first access. Routes
   move to `/api/categories` + `/api/activities`, exactly as ADL-28 moved companions. **Rejected:
   a nullable `user_id` "NULL = shared default" model** — it cannot express AD-03/AD-06 per-user
   without an override table, and SQLite treats NULLs as distinct in a unique index, so a user
   could silently duplicate a global default in their own picker.
4. **D4 — city CURATION splits from city CREATION** (PO-directed). Owner curates the shared
   catalogue (`PATCH`/deactivate — unchanged, `requireOwner`); any authenticated user creates on
   demand while logging a trip. The original gate was not wrong so much as **under-specified**:
   SE-03 bundled two different verbs under one word.
5. **D5 — city creation is validated by RESOLVE-THEN-CREATE.** The backend resolves the name
   against the geocoder and builds the row from the *canonical response*, running find-or-create a
   second time against the canonical name — which converges `"Denverr"`, `"denver co"` and
   diacritic variants that `COLLATE NOCASE` alone cannot. Unresolvable input still creates (GE-12,
   offline-safe) as `geocode_status='pending'` and stays **creator-private until it resolves**;
   promotion is automatic via the existing 15-minute server-side queue, so junk that never resolves
   never goes global. Costs one nullable `cities.created_by_user_id` and one WHERE clause.
   Rejected: per-user city scoping (fragments the join key behind carry-forward, LB-01 aggregation
   and city shading aggregates), owner-moderated pending rows (converts a 403 into an indefinite
   wait on a human), geocode-*gated* creation (violates GE-12, breaks CI), and a separate
   `city_suggestions` table (`geocodeStatus` already is that state machine).
6. **D6 — SE-01 and SE-03 rewritten.** After this ADL **SE-03 retains none of its original five
   clauses**, which is the clearest available statement that the requirement was never maintained.
7. **D7 — BUG-55 is fixed by a backend proxy route, not a widened CSP allowlist.** Decisive:
   `User-Agent` is a forbidden header name for browser `fetch()`, so the direct browser call can
   *never* be compliant with Nominatim's usage policy — and a fully compliant client already exists
   server-side (`geocoding.service.ts`: correct UA, 1.1 s delay, ADL-10). The frontend hook is a
   non-compliant duplicate of a client we already own. Rate limiting is only enforceable at a
   server-side chokepoint. **Same route serves D5's validation** — the convergence the PO identified.
8. **D8 — the CSP allowlist is a closed, per-entry-justified register; proxy or disable by
   default.** No change to the current `connectSrc` recommended. QUAL-19 must cover **third-party
   SDK egress as well as first-party source** — the staging console showed two violations from
   different sources, and a source-grep-only test catches Nominatim but misses `clerk-telemetry.com`.
9. **D9 — ONE release.** *(Amended after PO ruling — the Architect recommended four separately
   dispatched phases and was overridden.)* All of it ships together: fewer UAT rounds, no
   half-migrated intermediate state, one review. The four stages survive as **internal build order
   and dependency constraints**, not dispatch rounds: S1 opens the reads and the city write, S2 adds
   the proxy + resolve-then-create, S3 is the per-user migration, S4 is city containment. **Two
   orderings are load-bearing**: S3 *deletes* the carve-out S1 adds (leave it in and the scaffolding
   ships), and S4's containment is meaningless without S2 promoting rows. Retained as an emergency
   fallback rather than the plan: **S1 alone would clear the P1 with no schema change.**

10. **D10 — classify the geocode failure, don't just count it** *(added after OP-27 review F5;
    refined by PO direction)*. Opening city creation converts a bounded retry queue into an unbounded
    one — `processQueue` has no attempt counter, no backoff and no terminal state. The COO's first
    instruction was a count-cap; **the PO refined it and the refinement is better**: *"retry when
    there is an integration error or something recoverable. A response where the lookup returned no
    match shouldn't ever be re-tried."* A pure cap still burns N attempts on every `"asdf"`.
    **Adopted: two classes, two mechanisms.** *Terminal* — the geocoder answered 200 with an empty
    result set — sets a new `geocode_status = 'unresolvable'` on the **first** attempt and is never
    retried. *Recoverable* — unreachable, 4xx/5xx, network exception — stays `'pending'` and
    increments `geocode_attempts` to a cap. **The distinction already exists in the code and is
    discarded**: `resolveCity` has four distinct failure branches (`geocoding.service.ts:85`,
    `:107-110`, `:115-119`, `:137-140`) that all `return false`, and the terminal one even carries
    the comment *"leave as pending, will retry on next queue run"*. Rejected a boolean flag and an
    attempts-sentinel: `geocodeStatus` **is** the state machine (§4.5 rejects a second one on the
    same grounds), and only a status value lets the partial index
    `idx_cities_geocode WHERE geocode_status = 'pending'` stop indexing dead rows.
    `isOnline()`-false and `GEOCODING_ENABLED=false` must **not** increment — they are global
    conditions, and counting them would burn every city's budget in one offline weekend.
    **Cost: amending the CHECK constraint is a table recreation, so S4 stops being a cheap
    `ADD COLUMN` and this release now carries three recreations, not two.**
11. **D11 — the correction path for a mistyped city lives at the *place* level** *(PO-directed;
    mechanism chosen here)*. §4.4's containment plus D10's terminal state together **create a trap
    this release did not previously have**: a user who types `"Denvr"` owns a row that is invisible,
    never retried, and — today — uneditable and undeletable by them (`PATCH /api/cities/:id` is
    owner-only and accepts only `region_id`; there is no `DELETE` route at all, verified by four
    independent probes; and `trip_places.cityId` is `.notNull()` with no `onDelete`, so the row
    cannot be deleted while the place exists). **Decision: make `city_id` updatable on a place**, so
    correcting a typo means re-pointing your own place through the existing find-or-create flow.
    Chosen over opening `PATCH /api/cities` to the creator because it has **no uniqueness-collision
    case** (correcting `"Denvr"`→`"Denver"` when `"Denver"` exists violates
    `uniq_cities_name_country_ci`, and the natural repair *is* re-pointing), it **preserves the
    place's items and activity tags** (both hang off `trip_place_id`), and it **never writes to a
    shared global row** — which matters because a pending city is genuinely shared: a second user
    posting the same name gets the first user's row back (OP-27 review P2).
    **Delete-and-re-add, the PO's accepted fallback, already works and needs no build**
    (`places.ts:112` plus the ordinary create flow). Deferred: orphan cleanup on place removal —
    right shape, but **`BUG-40`/`TR-15` is actively redesigning place deletion** with a three-way
    prompt, so briefing it now would design against a flow about to change; and creator
    `PATCH /api/cities/:id` + re-resolve. **Not built:** a public `DELETE /api/cities/:id`, and
    **never** `ON DELETE CASCADE` on `trip_places.cityId`.
    **Framing correction recorded in D1:** this is a **provisional visibility state, not a tier
    transition.** A city is tier-1 global reference data for its whole life — global uniqueness from
    creation, shareable while pending, surviving its creator — and write access never leaves the
    owner. D1 deliberately does not gain a lifetime-varying tier.
12. **D12 — wrong geocoder matches: constrain the lookup, and let the user's selection win**
    *(PO-raised gap)*. D5's containment (§4.4) gates on `pending`, so it protects against cities that
    **never** resolve and does nothing about cities that resolve to the **wrong place** — likelier and
    worse, because `resolved` bypasses containment and enters the shared catalogue as authoritative on
    first write. **The minimum adopted, and it is cheap because the data is already there:**
    `CreateCitySchema` already *requires* `country_code` and accepts `region_id`, while `resolveCity`
    sends a bare `q` string with no filter (`geocoding.service.ts:97-103`) — **the backend already
    holds the disambiguating answer and does not use it.** Four rules: pass Nominatim's
    `countrycodes=` filter from the validated `country_code` (this alone removes the
    London-UK-vs-Ontario class); disambiguate by `region_id` where present; **an explicit user
    selection is never overwritten by the lookup** — the lookup may supply coordinates and a canonical
    name only; and ambiguity surviving both constraints creates `'pending'` rather than guessing.
    **Deliberately not done:** no fourth status — separating *"the geocoder answered"* from *"this row
    is fit for the catalogue"* needs a verification **actor**, and at two users there isn't one, so
    **`resolved` explicitly means "a match was returned", not "verified correct"**, recorded in
    GE-16. No interactive disambiguation UI (its own piece of work, and the release is already large).
    **Pre-existing constraint surfaced, not fixed:** `uniq_cities_name_country_ci` is on
    `(name, country_code)` with **no region** (`schema.ts:126`), so the catalogue cannot hold
    Springfield IL *and* Springfield MO — widening the key does not work as-is, because `region_id`
    is often NULL and NULLs are distinct in a SQLite unique index, which is the exact defect BUG-33
    closed. Follow-on. **Accepted residual risk:** a confidently-wrong match surviving both
    constraints enters the catalogue with wrong coordinates and is currently unrepairable by anyone
    (`PatchCitySchema` accepts only `region_id`) — the user's own experience *is* repairable via D11,
    and owner coordinate-repair folds into the already-deferred creator-PATCH work. Judged acceptable
    at two users; should not survive many.
    **One inversion the COO feared does not exist**, and D11 is why: the correction path is at the
    *place* level and is gated on place ownership only, so it works identically for a wrong match and
    a no-match. Rejecting the tier-transition framing bought that for free.
13. **D13 — a city's identity is `(name, country_code, COALESCE(region_id, 0))`** *(PO pulled into
    scope 2026-07-30: "the unique cities name without a region is the exact example of something
    that'll become a headache later")*. The catalogue must hold Springfield IL **and** Springfield MO.
    **The naive widening re-opens BUG-33**: `cities.region_id` is nullable and SQLite treats NULLs as
    distinct in a unique index, so `UNIQUE(name, country_code, region_id)` would permit unlimited
    duplicates for every non-region-tier country. **The `COALESCE(region_id, 0)` sentinel is what
    prevents that** — `0` is safe because `regions.id` is `AUTOINCREMENT`, which starts at 1 and never
    issues 0. Two properties make this far safer than it sounds: the new key is **strictly more
    permissive** than the one it replaces, so no existing row can violate it (no backfill, no
    conflict handling); and `region_id` *must* be NULL when `region_tier_enabled = 0`
    (`cities.ts:106-108`), so for those countries the expression is invariantly `0` and the index
    degenerates to today's `(name, country_code)` — **the BUG-33 guarantee is preserved exactly where
    it matters.** **The risky half is not the index, it is the lookup:** `cities.ts:126-130` must
    become a three-step find-or-create — exact match on the region key, then **wildcard-upgrade** a
    region-less row (adopt it by setting its region) rather than inserting a duplicate, then insert.
    Omitting the middle step re-creates BUG-33 through the front door. The reverse case — no region
    supplied while several same-name rows exist — has no safe automatic answer and is routed to D14.
    **Migration cost: absorbed.** The index change lands inside the `cities` recreation D10 already
    forces; no fourth migration.
14. **D14 — multiple geocoder candidates: ask, through the region control that already exists**
    *(PO-raised 2026-07-30; both answers were explicitly permitted, the choice is the Architect's)*.
    Zero candidates create `pending`; exactly one is accepted; **two or more populate the region
    selector `AddPlaceFlow` already renders** (labelled by region name) instead of one being chosen
    silently. Chosen over "take the best match" for three reasons: **D13 changes the consequence of
    guessing** — duplicate names across regions are now legal, so a wrong pick creates a plausible
    second entry rather than colliding with the first; it is **the cheapest fix for the stale-entry
    problem**, since an entry never created needs no repair tool; and it keeps **name, region and
    coordinates internally consistent**, because all three come from one chosen candidate. "Ambiguous"
    is defined as *more than one settlement-type candidate after the country constraint* —
    deliberately no confidence threshold, because that is a number nobody can justify and everybody
    re-tunes. **GE-12 is not regressed:** declining, dismissing, or being offline all still create a
    usable `pending` record. The smaller alternative (auto-accept the top candidate) is recorded as
    the first thing to cut if the release must shrink.

    > **SUPERSEDED (2026-08-06) in part** — ADL-46 §4.3.2 (D14) established that ambiguous city
    > disambiguation is **region-first** (narrow the region `<select>` to the candidate regions). For
    > the branch where the geocode lookup returns **positive identity evidence** (≥2 candidates carrying
    > distinct `(osm_type, osm_id)`), the place-level `CityPicker` is now **primary** and the region
    > `<select>` no longer pre-empts it. D14's region-narrowing `<select>` is **retained unchanged** as
    > the fallback for the **no-`osm_id`** case (legacy / partial responses / ADL-46 F1/F2 parity).
    > Rationale and evidence:
    > `jobs/architect/tech/20260806-BUG75-pickerprecedence-and-ux12-entry.md` §5–§6, reviewed
    > `jobs/architect/tech/20260806-BUG75-pickerprecedence-design-review.md`. Region-first was
    > structurally unable to separate two distinct places sharing one region (the two GB-ENG Newports),
    > which is the BUG-75 defect. The reorder shipped in the PR that lands this stamp (BUG-75/UX-12
    > build) as `src/frontend/utils/decideCityDisambiguation.ts`. Retained for history.
    >
    > **Open-questions closure check (document-lifecycle rule, item 4):** two probes run — a grep of
    > `_project/travel-tracker-BRD.md`'s Open Questions table (OQ-01..OQ-05) for any entry referencing
    > D14/picker-precedence, and a grep of this ADL-46 section for a "resolves OQ-" note tied to D14 —
    > neither found one. D14 was PO-raised with both answers explicitly permitted (see above), not an
    > answer to an open BRD question, so there is no open-questions section for this stamp to close.

**Framing correction adopted 2026-07-30 (PO: *"I don't want to be architecting based on the current
user base"*).** "Acceptable at two users" had been used to justify at least four judgements in this
ADL; the justification is withdrawn wherever it appeared. Each was re-weighed to either a real fix
(D13, D14) or an explicit follow-on **with a trigger** — the owner catalogue-repair surface, tracked
to land *before a third account exists*. Note one deliberate exception: the **disposable-data**
constraint is a fact about today's database contents rather than an assumption about eventual user
count, so the downgrades it justified (F10's revert posture, F1's data-disposition half) stand.

**Stale-entry lifecycle answered in full (§4.4.3)**, since the PO asked what happens to a shared
entry after a user corrects their own list. **Most leftovers are not defects:** a wrongly-matched
Springfield IL is a *real city with correct coordinates* that nobody has visited yet —
indistinguishable from a seeded entry nobody has visited yet — so it stays, and that is right.
Unresolved creator-owned orphans are collected by the deferred place-removal hook. **The genuine gap
is the internally-wrong resolved row**, which nothing collects and nobody can repair
(`PatchCitySchema` accepts only `region_id`). D14 prevents most of these at source; the remainder
needs the owner repair surface, specified in §4.4.3 as a **soft delete (`is_active`, matching AD-06)
rather than a hard one**, so it can never orphan a trip place via the `trip_places.cityId` FK. The
column is deliberately **not** added now despite the table being open — an `is_active` nobody sets or
reads is speculative generality, and adding it later is a plain `ADD COLUMN`.

**Alternatives considered:** see standalone §3.2 (the rejected nullable-`user_id` model), §4.5
(four rejected city models) and §13 (confidence register).

**OP-27 fresh-eyes review — completed 2026-07-29, `jobs/architect/tech/ADL-46-review.md` (PR #328).**
Verdict: **sound with named corrections.** The reviewer attempted to break D1, D3, D4, D5 and D7 —
including looking specifically for a reason to prefer the Option B this ADL rejected — and **would
not change any of those decisions.** Every finding was coverage or execution, not architecture.
**All ten findings accepted and folded into the spec**, marked inline. The two blocking ones:

- **F1 — a third junction table this ADL never named.** §3.3 claimed `trip_activities_map` covered
  "both trip and place level"; **false** — place-level activities live in `trip_place_activities_map`
  (`schema.ts:376-387`) and join via `trip_places`, not `trips`. The error propagated into the
  pre-migration check (which returned a **false zero**, reproduced on a scratch DB), the test list,
  and the COO's own live-data query, which inherited the two-table set. The durable half is a **write
  path with no validation at all**: `POST /api/trips/:t/places/:p/activities`
  (`routes/places.ts:242-280`) validates the place and then inserts a caller-supplied `activity_id`
  unchecked — a permanent hole in the access model that survives the disposable-data constraint.
- **F2 — `db:generate` emits a migration that cannot be applied.** It produces
  `ALTER TABLE … ADD COLUMN user_id text NOT NULL REFERENCES users(id)`, which fails with *"Cannot
  add a NOT NULL column with default value NULL"* — SQLite's NOT-NULL and REFERENCES requirements are
  mutually exclusive. This ADL's stated reason for hand-writing was also the wrong mechanism:
  `name.unique()` is a **standalone index** here (`0000_open_electro.sql:10,171`), which drizzle
  drops happily. Corrected instruction: **discard the generated file, do not review it**; hand-write
  from `0012_grey_ultimates.sql`, and re-point the ADL-15 warning at the hand-written recreation.

**The reviewer executed rather than argued the highest-risk item, and it came out sound.** §13's
headline question — does the S3 migration preserve `id`? — was answered by hand-writing the
recreation and running it via `drizzle-kit migrate` against a scratch DB built from the real
migration chain: **`id` preserved, `trip_categories_map` intact, `PRAGMA foreign_key_check` clean**,
FK correctly re-bound after `RENAME`, and FK-disabling confirmed working on **both** libSQL
transports including remote Turso. The validated SQL is appended to the review document.

**Both of this ADL's own named review targets resolved differently than predicted**, which is the
methodological lesson worth keeping: the migration question was answerable only by *running* it, and
the data-assumption question was well-posed against a **table set that was already wrong three
sections earlier**. A correct answer to the wrong query. The negative-findings rule catches "X does
not exist"; it does not catch "X exists and there are three of them" — **enumerations deserve the
same two-probe treatment as absences**, and the cheap second probe here was one grep for
`activity_id` across the schema.

**Non-blocking findings, all accepted:** F3 (the containment clause had no `IS NULL` branch, so a
pending row with no known creator was invisible to everyone permanently — durable, because
`ON DELETE SET NULL` regenerates the condition on every user deletion); F4 (D7's "reuse the existing
limiter" premise is false — there is only a `sleep` in one loop, `resolveCity` is unthrottled from
`POST /api/cities`, and each call makes two requests; the release must **build** the chokepoint);
F5 (→ D10 above); F6 (§8 covered 1 of 4 test files that break at S3); F7 (the lazy-seed trigger was
unspecified and the obvious row-count implementation silently denies defaults to a user who writes
before reading); F8 (the new proxy route was missing from the OP-06 matrix, contradicting SE-01's own
success criteria); F9 (multi-owner `CROSS JOIN … LIMIT 1` picks arbitrarily); F10 (no revert posture
documented — Low under disposable data, but the lever expires at merge).

**PO rulings closing the three items this ADL flagged (2026-07-28, standalone §0.1).** Two confirmed
the Architect's recommendation, one overrode it — recorded because the ADL was written with all three
open and a later reader would otherwise re-open them:
1. **Deactivation scope — CONFIRMED as recommended.** A user deactivates entries in their **own**
   list; the owner's retained authority is over global reference data only. The deciding argument was
   AD-03 ("add, edit, rename, or deactivate items in any structured list"), which is unsatisfiable
   for a non-owner under the alternative. AD-09's proposed text stands unchanged. The ambiguity came
   from the COO's compression of the direction, not the PO's wording.
2. **Pending-city containment — ADOPTED as specified.** Creator-private while `pending`, automatic
   promotion on resolution, `cities.created_by_user_id` nullable FK `ON DELETE SET NULL`. Chosen over
   "global immediately, curate later" with the Architect's own low confidence stated; the
   **self-maintaining** property decided it — junk never resolves, so it never goes global, with no
   moderation queue. **GE-16 stands as written.**
3. **Phasing — OVERRIDDEN**, see D9 above.

Consequence worth noting: **the Phase 1/2 validation gap the ADL flagged as one of its two weakest
points no longer exists** — shipping together means there is no window in which `POST /api/cities` is
open without resolve-then-create behind it. The override removed the weakness rather than answering
it. With both flagged weak points closed, §13's register now points the OP-27 reviewer at **S3's
migration execution** (does it preserve `id`?) and at **§3.3's unverified data assumption**, which is
the only remaining place where being wrong corrupts data rather than costing a re-run.

**The trap this decision exists to clear.** `security.access-matrix.test.ts` asserts the three
offending 403s as *correct behaviour* and is green — the suite actively encodes the defect as the
intended security contract. The spec therefore had to move before the code. Standalone §7 lists
every assertion current → intended so the Backend brief inherits authority to change them rather
than appearing to weaken a security test on its own initiative. It also found a **stale
`it.skip`** at line ~457 (`PATCH /api/cities/1 → 403`, skipped pending BUG-22, which has since
merged — `citiesRouter.patch(` is at `cities.ts:223` with `requireOwner` at `:225`, and BUG-22 is
`done` in the tracker, so **that security assertion has not run since it merged**) suppressing an
assertion that D4 makes
load-bearing.

**Implementation implications.** **One release, two briefs** — Database and Backend are still
separately authored, sequenced Database → Backend → Frontend, since the backend cannot query columns
that do not exist. **S1 needs no schema change, no migration and no new columns**; that separability
is what makes it a usable emergency fallback if the P1 ever needs unblocking ahead of the release.
**The Database brief covers S3 and S4:** S3 is two SQLite table recreations (`UNIQUE(name)` →
`UNIQUE(user_id, name)` cannot be done with `ALTER TABLE`), following ADL-28 Question 3 as prior
art — **preserving `id` through the CROSS JOIN**, which is essential because `trip_categories_map`
FKs to it and existing mappings must survive; S4 is **two** nullable/defaulted `ADD COLUMN`s with no
backfill (`created_by_user_id` and, per D10, `geocode_attempts`).
`db:generate`/`db:migrate` only; **`db:push` forbidden (ADL-15)**, and the generated SQL must be
hand-reviewed because drizzle-kit's four patched bugs are specifically around table recreation — S3's
exact shape. S3 also adds the ADL-28-shaped ownership validation to
`tripRepository.replaceAssociations` for `category_id`/`activity_id` (cross-user IDs → 400).
**Blocking pre-migration check:** query staging for category/activity mappings on non-owner trips —
expected zero (the picker has always 403'd) but that is an *inference* with a named blind spot, since
`POST /api/trips` accepts `category_ids` under `requireAuth` alone. Frontend needs no change for
BUG-63; BUG-55 repoints `lookupCityCountry` at the proxy and deletes the forbidden `User-Agent`
header. **ENV-01 carries into the brief:** Nominatim is unreachable from this devcontainer — probed
here (`curl` exit 7, with `api.github.com` returning 200 from the same shell as a control), so the
proxy must be verified against a mocked upstream locally and confirmed on staging.

**Premise corrected rather than inherited.** The direction stated the pending/resolve machinery is
"driven from the browser." **It is not** — two independent probes: `useGeocodeRetryQueue.ts`'s only
network call is `apiGet('/api/cities/:id')` and its comment says "polling is read-only (BUG-29) —
the backend re-runs geocoding itself every 15 minutes"; and `processQueue`
(function at `geocoding.service.ts:152`) is imported at `server.ts:47`, invoked at `server.ts:325`
and rescheduled by a 15-minute `setInterval` at `server.ts:330`. The only browser-driven geocoding
is `lookupCityCountry` — the BUG-55 path, nothing else. **This makes stage S2 materially smaller
than the direction implied:** D7 replaces one function, not a subsystem. *(Accepted by the COO on
independent re-verification, 2026-07-28.)*

**Supersession:** partially supersedes **ADL-27**'s "Routes to protect with `requireOwner`" list —
`GET /api/admin/{categories,activities}/active` and `POST /api/cities` leave the owner-only set, and
S3 removes categories/activities from `/api/admin/*` altogether. The router-level guard, the
fail-closed default and every remaining write route's owner-only status are unchanged. ADL-27's
standalone file is stamped in this PR. Also supersedes **ADL-28 Question 5**, which recorded
"`trip_categories` and `activities` tables are unaffected by this ADL… if the COO wants to open
category/activity creation to non-owners per AD-09, that is a separate brief" — this is that brief,
and the answer is per-user rather than open-creation. Amends the **OP-06 hardening checklist §2**
access matrix (new §2.1 appended in place — the original table keeps its existing SUPERSEDED stamp
and its history). **Extends ADL-38** rather than superseding it: same mechanism, same fail-closed
invariant, two more enumerated reads above the guard — removed again at S3. **Consistent with
ADL-43**, whose §6.2 ODbL finding applies to Nominatim-derived data; a README attribution notice is
flagged as a separate item (single-probe finding, marked as such in the standalone §4.6).

**Open question closed:** D-12 item 1 in `jobs/COO/open-dialogues.md` ("the three-role model has
drifted from reality") is answered by D1/D5. Items 2–4 remain open.

**AMENDMENT (2026-08-01) — D13 and D14 refined pre-merge after the second OP-27 review.
Ruling: `jobs/architect/tech/20260801-ADL46-F1-F2-ruling.md`. Status: decided, backend
implementation pending; no schema change, no migration, no BRD amendment, no new requirement ID.**
The OP-27 fresh-eyes review of the *assembled release*
(`jobs/architect/tech/20260731-ADL46-release-fresh-eyes-review.md`, PR #342) returned SHIP WITH
FOLLOW-ONS with one HIGH finding. Three rulings, all amending rather than superseding:

- **D14 — the ambiguity discriminator was wrong, and the queue was never specified.** "More than one
  remaining candidate" is replaced by **"more than one distinct non-null `region_iso` among the
  eligible candidates"**: Nominatim returns one real city at several administrative granularities,
  so the count marks nearly everything ambiguous, and the region set is the discriminator because
  the region selector is the control D14 asks through. Country eligibility takes a **set** of
  permitted codes (empty = unconstrained) so the trip-declared-countries follow-on needs no
  unpicking. The rule is deliberately identical to the one the frontend already computes — parity is
  a contract. Separately, §4.3.2 never said what `processQueue`/the on-create trigger do with an
  ambiguous name, and the implementation resolved that silence with the pre-existing `candidates[0]`
  auto-pick (`pickBest`), undoing D14 roughly one second after a user declined to choose and
  breaking two GE-16 success criteria. **`pickBest` is deleted; one classifier serves both callers**
  — two decision procedures for one question is the root cause and would diverge again. An ambiguous
  verdict leaves the row `pending` with no coordinates and consumes the existing `geocode_attempts`
  budget (bounded, never retried forever); it is **never** `unresolvable`, which GE-16 reserves for a
  geocoder "no match" and defines as terminal. **The retry budget is attached to the question:**
  setting `region_id` resets it, because a region constraint can collapse an ambiguity — and
  deliberately does *not* reset for an `unresolvable` row, where a region cannot turn zero candidates
  into some. Also ruled: a row that *has* a region and no candidate matching it stays `pending`
  rather than taking a candidate from a different region — the field survived but the coordinates
  contradicted the user's explicit selection.
- **D13 — step 2's wildcard upgrade gains a predicate** (review F2, a genuine spec conflict, not an
  implementation bug: the code follows §4.2.1 verbatim). As specified, any authenticated user could
  mutate a **`resolved`, globally visible** row — or another creator's private one — on a
  `requireAuth` path, which SE-03/GE-16 make owner-only and which §4.4.2's own reasoning rejects.
  Step 2 is restricted to `geocode_status IN ('pending','unresolvable')` **and**
  `created_by_user_id = caller OR IS NULL`. The principle, stated because it is what makes the
  asymmetry with step 1 defensible: **read-through is global because the unique index is global;
  write-through is scoped because nothing forces it to be.** Steps 1 and 2b stay creator- and
  status-blind — a filtered step 1 would miss and then collide on
  `uniq_cities_name_country_region_ci`. The duplicate class the restriction admits is **bounded at
  one row** (the index permits at most one region-less row per name+country, the fallback insert
  lands on a key step 1 proved vacant, and a repeat request hits step 1) and its residue is
  §4.4.3's already-triggered owner-repair follow-on. It is **not** the BUG-33 class, which was
  unbounded duplication on an identical key. There is no version of adopting a `resolved` row that a
  non-owner can perform *correctly*, because correcting it means rewriting shared coordinates.
- **Direction this is step one of** (PO, post-release): *`resolved` should ultimately mean the
  user's explicit selection and the geocoder independently agree; a selection the geocoder cannot
  confirm stays `pending`.* The ruling implements that for **country and region** — the two
  dimensions a user can select today. **Name canonicalisation ("Roma"/"Rome") is deliberately not
  ruled on**: the name sits inside D13's identity key, and whether that model survives depends on a
  UX brief being written first, by design, so the data model serves the experience rather than the
  reverse.

**One finding surfaced while ruling that neither the review nor the COO's chain had:** the *happy
path* is already broken on the branch. `resolveCityName` returns `'ambiguous'` whenever two or more
candidates match the requested region (`geocoding.service.ts:99-101`), and UX-04 auto-populates the
region — so a common city returning `city` + `municipality` hits produces a `pending` row today. The
new discriminator fixes it. It is invisible in CI for the same reason F1 was (review F4: every route
suite mocks the geocoder away), which is why the ruling carries explicit service-level test
obligations. **Frequency is UNVERIFIED** — the devcontainer firewall (GitHub/npm/Anthropic only)
blocks live Nominatim; the mechanism is established by code reading, the real-world rate is not, and
it must be exercised during the staging shakedown.

**UAT consequence, recorded so it is not logged as a false product bug (OP-32).** Shading reads
`country_code`/`region_id` and never `geocode_status` or coordinates (`shading.service.ts`); pins
require both `resolved` and coordinates (`CityMarkers.tsx:52-58`). So a pending city shades its
country, shows no pin — and, because `multi-region` ambiguity by definition means no region was
chosen, contributes to **no region shading either**: three simultaneous gaps for one place, not one.
The net change in pending volume is **not** monotonic — the happy-path case above moves the other
way and is the more common one. **Framing the PO set, recorded and deliberately not solved here:**
*the user never sees coordinates — a pin in the wrong place is reported as a bug exactly as fast as a
missing pin.* "Stay pending" trades one user-visible defect class for another; it is the right trade
only because a wrong `resolved` row is shared, global, never re-queried and owner-only to repair,
while a `pending` row stays in its creator's own reach via D11. That argument expires the moment the
affordance is missing — and it is: the three states are surfaced nowhere in the UI, and GE-16's
correction-by-re-point works but is undiscoverable. **This is the premise for the UX brief, not a
defect to log.**

---

## ADL-47 — Expand/contract as the default for breaking schema migrations; integration-branch delivery when a release can't be atomized

**Date:** 2026-07-30
**Status:** ADOPTED as the standing default for future breaking migrations. **Not retrofitted to
ADL-46**, which ships this once via the integration-branch mechanism below (rationale in the
alternatives). PO-approved in session (2026-07-30).

**Trigger.** The ADL-46 S3 database brief (#332, PR #333) was correct, validated, and *red by
design*: making `trip_categories.user_id` / `activities.user_id` `NOT NULL` in one step breaks every
backend insert site until the Backend brief catches up, so 4 CI jobs (Type Check, Backend Tests,
Contract, E2E) fail on the DB PR alone. Merging it to `main` would have put the trunk in exactly the
broken, backend-can't-boot state that both the single-release decision (ADL-46 §9.1) and the
never-red-main rule (CLAUDE.md, BUG-24) forbid. The COO surfaced this as a release-strategy decision;
the PO asked whether never-red-main was too strict and what industry practice is.

**Decision — two parts.**

1. **Expand/contract (parallel change) is the default pattern for any breaking schema migration going
   forward.** A breaking change is never a single hard cutover. It is staged so *each step is
   independently green and independently deployable*: **expand** (add the new column nullable / add
   the new structure alongside the old, backward-compatible — trunk stays green), **migrate + switch
   code** (backfill; update every read/write site to the new shape — trunk stays green), **contract**
   (make `NOT NULL`, swap the unique/FK constraint, drop the old — trunk stays green). This is the
   pattern that scales to real users and continuous production deploys, and it removes the red-trunk
   tension at its source rather than routing around it.

2. **When a release genuinely cannot be atomized into green steps (or the effort isn't warranted),
   keep the coordinated work off `main` on an integration branch** (`release/<slug>`), assembled to
   green there, then merged to `main` in one PR. The intermediate broken states never touch the
   trunk. This is what ADL-46 uses.

**never-red-main is NOT too strict, and was explicitly kept.** It is the core invariant of
trunk-based development and load-bearing *here specifically* because `main` auto-deploys to staging
(CLAUDE.md env-promotion): a red `main` = broken staging = no UAT and no prod fast-forward. Two
clarifications resolve the friction and are now on the record: (a) **the rule governs `main`, not
every branch** — an integration branch sitting transiently red while a release is assembled is the
rule working as intended, not a violation; (b) the tension we hit was **self-inflicted** by splitting
a hard cutover across briefs, not a flaw in the rule.

**Alternatives considered.**
- *Retrofit expand/contract onto ADL-46 now* — rejected for this release only. The S3/S4 migrations
  are already hand-written and validated (executed against a scratch DB from the real chain by the
  OP-27 reviewer), staging and production data are both disposable, and prod promotion is a **manual**
  fast-forward — so expand/contract's payoff (zero-downtime, no coordinated release) buys ~nothing
  today, while the retrofit means discarding validated work for a multi-step sequence. Take the
  integration branch here; make expand/contract the default for the *next* breaking migration.
- *Relax never-red-main / accept a transiently red trunk* — rejected. Breaks the staging deploy and
  the prod-promotion path; industry-standard trunk-based development mandates a green trunk.
- *Stacked PRs* (Backend off the DB branch, Frontend off Backend, final head → main) — viable and
  equivalent for trunk safety, but chain-rebases are fiddlier to manage than one integration branch;
  not chosen, kept as a known alternative.
- *Feature flags* — decouple deploy from release at the app layer, but do not help a `NOT NULL` DDL
  cutover; complementary, not a substitute.

**Implementation implications.**
- CLAUDE.md "Schema changes (Drizzle ORM)" section gains a pointer to this ADL so the next
  Database/Architect agent starts from expand/contract rather than rediscovering the tension.
- ADL-46 delivery: integration branch `release/adl46-access-model` created off `main`; PR #333
  (DB stage) merged into it; Backend then Frontend build on it; one final PR → `main` when the whole
  release is green. `main` never red.
- No code or schema change from this ADL itself — it is a process decision.

**Supersession:** none. Complements ADL-15 (drizzle-kit migrate workflow, `db:push` forbidden) and
ADL-32 (Railway/Turso staging-watches-main promotion model) — expand/contract is the *authoring*
discipline that keeps that auto-deploy path safe.

---

## ADL-48 — Bundled local gazetteer: buy the reference data, keep the geocoder for the tail

**Date:** 2026-08-01
**Status:** Decided. **No schema, migration, seed data or code change was
made by this ADL** — it is the design that unblocks those briefs. Full evidence, table shapes,
measurements and rejected alternatives: `jobs/architect/tech/ADL-48-bundled-gazetteer.md`.

> **IMPLEMENTATION STATUS (updated 2026-08-02, BUG-77 / issue #367).**
> **S1 — IMPLEMENTED.** `data/regions.json` 76 → **714** rows (not 716: two upstream subdivisions
> carry an empty ISO code and are filtered, see below); `seedRegions()` in
> `src/backend/services/startup.service.ts` re-gated from row count to content hash. **No schema
> change and no migration were required.** All 76 pre-existing codes preserved with their ids.
> **S2 — not started.** Blocked on the BRD gate (GE-17/GE-18) and the §8.3 Turso timing probe.
> **S3 — not started.** **S0 (the BUG-75 coordinate bucket) — rejected**, see the OP-27 fresh-eyes
> review of the feasibility spike; it was never part of this ADL.
>
> **Two corrections this ADL should be read with:**
> 1. **§8.1's delete-and-reload is NOT the S1 mechanism**, and §11's S1 row invokes it by name.
>    `cities.region_id` REFERENCES `regions.id`, which is AUTOINCREMENT, so a delete-and-reload
>    re-issues ids and repoints existing cities at different subdivisions. S1 shipped as a
>    hash-gated **additive upsert** (`ON CONFLICT (iso_3166_2) DO UPDATE SET name, country_code`)
>    instead. §8.1's own safety argument — *"nothing references `gazetteer_cities`"* — is what
>    makes delete-and-reload correct there and incorrect here.
> 2. **`iso3166-2-db` is not a `devDependency`.** It unpacks to 283 MB / 42,268 files for one
>    3.35 MB file this repo installs per worktree and per CI run. The file is vendored at
>    `data/vendor/iso3166-2.json` with its provenance in `data/vendor/README.md`.
**Trigger.** The PO, after a day of geocoding defect-fighting: *"Are we over-engineering this?
Wouldn't it be easier just to store a full cities list in a DB table? If we are querying a list via
API anyway?"* Folded in: execution-queue Tier 2 item 13 (ISO 3166-2 reference-data build-vs-buy).
**Tracker:** OQ-06 · BUG-30 (class) · D-14 · D-19 · BUG-71 · BUG-74 · BUG-69 · ENV-01 · QUAL-21/22 · UX-12 · BUG-45 (explicitly *not* closed).
**BRD:** §5.2. **Two new IDs proposed (GE-17, GE-18) with success criteria, plus a required GE-16
amendment** — see the standalone file §12. The BRD gate blocks stages S2/S3, **not** S1.

**Decision — the PO is substantially right, with one material correction.**

1. **Bundle a gazetteer, as a local-first *index* — not as a replacement for the geocoder.** The
   geocoder is demoted from "the only path" to "the tail path". A pure replacement was tested
   against real place names and **fails this project's own flagship use case**: of 16 Scottish
   places probed, Glasgow / Edinburgh / Inverness / Ullapool / Aviemore / Portree / Tarbert are
   present in both candidate datasets, but **Plockton, Applecross, Shieldaig, Lochinver, Durness,
   Kyleakin, Gairloch, Dornie and Braemar are absent from both** — and BUG-30's own note records
   that the Scotland dogfood trial is the trigger requirement. The coverage floor is real and it
   bites exactly where this project travels.
2. **Sources: `cities.json`** (npm, **CC-BY-4.0**, GeoNames-derived, 170,540 cities / 246 countries,
   published **monthly** — verified from the registry's 65 publish timestamps, not the README) **and
   `iso3166-2-db`** (npm, MIT, 3,940 subdivisions) as a **`devDependency`** build-time generator.
   Both reachable over the npm registry, so **no ADL-33 firewall amendment is required.**
   `all-the-cities` rejected: declares MIT over CC-BY GeoNames data, six years stale, and its own
   "population ≥ 1000" claim is false for 22,913 of its rows. `country-state-city` rejected: GPL-3.0.
3. **Load-bearing structural finding.** **GeoNames `admin1` codes are not ISO 3166-2 codes** — the
   naive concatenation `"<CC>-"+admin1` is correct for exactly **2 of the 26** `region_tier_enabled`
   countries (GB, US); 20 are purely numeric (`AU`→`08`, `CA`→`01`, `DE`→`15`). A build that assumed
   the "same source family" would have written `AU-08` where the app expects `AU-NSW`, silently, and
   passed every test written against the only two countries with seeded regions today.
   **`iso3166-2-db` carries the crosswalk** (`admin` = GeoNames code, `iso` = ISO suffix):
   **99.28 %** of city rows in enabled countries join, and **all 76 currently-seeded region codes
   match exactly** — so the region set is a strict superset and **no user-row backfill is needed.**
4. **Topology: a new `gazetteer_cities` reference table. `cities` is not replaced and not migrated.**
   No FK ever points at the gazetteer; user rows are *created from* it through the unchanged ADL-46
   find-or-create. That is what makes a delete-and-reload refresh safe by construction.
5. **Seed: content-hash-gated startup seed** extending `startup.service.ts`. Steady-state boot cost is
   one indexed `SELECT`. Measured cold seed against local libSQL: **618 ms, 12.47 MB, ambiguity
   `GROUP BY` in < 1 ms.** (Repo precedent: `geo/regions.json` is already 40 MB.)
6. **Refresh: on-demand and trigger-driven, not scheduled** — a monthly bot PR of a 17 MB artifact
   trains reviewers to rubber-stamp. **Attribution is a real CC-BY obligation** and surfaces on a new
   in-product About/Credits surface (GeoNames CC BY 4.0 · OpenStreetMap ODbL · Natural Earth),
   discharging an obligation ADL-43 §6.2 and BUG-55 both already flagged and neither closed.

**Alternatives considered.** *Gazetteer replaces the geocoder entirely* — rejected, §2's coverage
floor. *Manual entry with no pin for the tail* — rejected: trades a user-visible product regression
for an internal simplification, on precisely the places the PO travels to. *Load the gazetteer into
`cities`* — rejected: a refreshable dataset must never be FK-referenced by user data, and it would
dilute GE-16's three end states to nothing. *Do nothing and rely on the BUG-71 fix* — rejected, but
**only partly**: the BUG-71 fix is correct and should ship now (below); it makes the common case
*blank* rather than wrong, and the gazetteer is the only proposal that makes the common case
correct *and* better.

**What it closes, and what it does not.** Closes **OQ-06**'s implementation, the **BUG-30 class**
(22 latent instances → 0) and **D-14 tier 2** (ISO alpha-2/alpha-3 ship in `iso3166-2-db`).
Substantially closes **ENV-01's test blindness on the primary path** — the single strongest argument
here, because it moves the common case *inside* the CI-testable boundary, which no amount of
test-writing against the current architecture achieves. Re-scopes **D-19** from a design problem to
an `ORDER BY`. **Does NOT close: BUG-45** (different dataset, zero source overlap — execution-queue
item 13 wrongly bundles them), **BUG-69**, **BUG-74**, **QUAL-22**, **UX-12**, **ENV-02**. Takes **no
credit** for **BUG-55** or **BUG-33**, both already closed by other work.

**Implementation implications.**
- **Three independently-green stages (ADL-47 satisfied without an integration branch):** **S1**
  subdivisions (`data/regions.json` 76 → 716 rows, purely additive — *independently worth shipping
  even if the cities half is declined*); **S2** `gazetteer_cities` + seed (no route reads it yet —
  this is where the Turso timing question gets answered before anything depends on it); **S3**
  local-first lookup. **S1 must precede S2** — the crosswalk writes region codes that must exist.
- **UNVERIFIED and gating S2:** cold-seed cost and storage headroom against **Turso** (all timings
  are local libSQL). **UNVERIFIED and gating the whole tail strategy:** that Nominatim actually *has*
  Plockton/Shieldaig/Dornie — ENV-01 blocks the probe from here. If it does not, the tail decision
  must be re-taken.
- New in-product About/Credits surface (small Frontend item) and `data/gazetteer-meta.json` provenance.

**Supersession.**
- **ADL-43 §2 S1 and S3 are amended** (stamped in this PR): the subdivision source becomes
  `iso3166-2-db`, not `country-region-data`. ADL-43 §6.1 was **right** that Natural Earth and
  `country-region-data` both return 217 GB council-tier rows with none of `GB-ENG/SCT/WLS/NIR`
  — re-verified independently here — but it did not find that a third source returns **exactly those
  four**. S3's mandatory per-country override table therefore loses its one confirmed case; the
  mechanism is kept for VN/ET/KZ but is no longer load-bearing on day one. S2/S4/S5 stand, adopted.
- **The BUG-71 ruling and its OP-27 review are NARROWED, not superseded** (stamped in this PR).
  **Ship the BUG-71 fix now — do not hold a live P1 behind this multi-stage build.**
  `classifyDiscovery` survives as the *tail-path* classifier, and the review's three-valued output is
  *strengthened*: a complete local set can never be "incomplete but undivided", so `'suggested'`
  becomes precisely and only the tail-path state.
- **Execution-queue Tier 2 item 13 is partly stale** and should be corrected: OQ-06 was already
  decided by ADL-43 on 2026-07-27 (what remained was implementation, and now a source correction),
  and BUG-45 does not belong in the same item.

---

## ADL-49 — Geocoder allowlist amendment to ADL-33, recorded-response replay fixtures, and a reassessment of GE-17's remaining case

**Date:** 2026-08-03
**Status:** **Decided — design only. NO code, config or firewall change ships with this ADL.** The
`.devcontainer/init-firewall.sh` diff is **quoted verbatim, not applied** (standalone §3.5); it
requires a container rebuild and is the COO's to take after PO approval. Full analysis, probe
outputs, fixture design and decision tables: `jobs/architect/tech/ADL-49-geocoder-allowlist-and-replay-fixtures.md`.
**Amends:** ADL-33 §2/§7/§10.3 (stamped in this PR). **Supersedes nothing.**
**Tracker:** ENV-01 · BUG-76 · QUAL-22 · QUAL-18/19/20 · QUAL-25 · open-dialogue D-21.
**BRD:** GE-11/GE-15/GE-16/GE-17/GE-18 at v3.15 — **no BRD change proposed.** §6 asks the PO to
*re-take* a decision the BRD already records; it does not edit a requirement.

**Triggered by:** PO direction 2026-08-03 — *"because the firewall blocks the geocoder isn't a good
argument because we should be whitelisting services we need access to in local dev."* The PO is
right, and the record should say why it matters beyond one domain entry: **ENV-01 sat in the tracker
as `accepted` / "no fix needed" for a year, and by 2026-08-01 that accepted environment constraint
had become one of four arguments for a 170,540-row bundled dataset** (BRD v3.15's GE-17 changelog
entry states it explicitly). An environment gap left permanent had started deciding product
architecture. That is the durable finding, independent of how GE-17 is eventually decided.

### Summary

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D1 | Allowlist `nominatim.openstreetmap.org` | **ADOPT** — one entry in the existing domain loop; diff quoted, not applied | High |
| D2 | Allowlist MapTiler | **DEFER** — the firewall is not what blocks the map testing it would supposedly unblock | High |
| D3 | Usage-policy obligations | In-process limiter binds all 3 app call sites; **that is not sufficient** — separate processes each start a fresh 1 req/s budget | High |
| D4 | Fixture seam | **Record the wire response at `fetch`**, never the parsed `NominatimCandidate[]` | High |
| D5 | Interception | ~50-line in-repo replay double, **not** MSW | Medium |
| D6 | Drift detection | On-demand from the devcontainer; **never a CI gate**; semantic projection, not bytes | High |
| D7 | BUG-76 probe | Record `class` **and** `type` per candidate; a result-count probe is a false pass | High |
| D8 | Does this weaken GE-17? | **YES, materially — not fatally.** Two of four arguments dead; the third rests on a premise false for 2 of 3 call sites | Medium-High |
| D9 | Sequencing | Cheap-first wave (allowlist → probe → 3 query changes → fixtures) **before** re-taking S2/S3 | Medium-High |

**Decisions.**

1. **D1 — add `nominatim.openstreetmap.org`, and nothing else.** It is the only Nominatim host in
   the codebase (`nominatim-client.ts:31`, sole occurrence of the literal in `src/`). Blocked today,
   established by two probes that fail differently plus a working control (standalone §2.1). ADL-34's
   fail-open fix means an added entry carries no lockdown risk. **Still excluded, with reasons kept
   in the script comment:** MapTiler, the OSM raster tile servers, and (unchanged) `api.turso.tech`
   and `api.clerk.com`.
2. **D2 — defer MapTiler.** Three findings, any one sufficient: the firewall does not reach the host
   browser the PO does visual testing in; **BUG-34 is `done` and BUG-49 is `done_pending_uat`**, so
   the two bugs D-21 cites as blocked are already fixed; and in CI the blocker is a missing
   `VITE_MAPTILER_KEY` (three probes), not the firewall — the E2E job consumes no repository secrets
   at all. Better answer for map assertions: a local inline MapLibre style with no third-party host.
   Cheap and safe to add anyway if the PO wants it; this is a value argument, not a risk one.
3. **D3 — the limiter binds the app, not the environment.** All three call sites (`geocode.ts:50`,
   `geocoding.service.ts:185` and `:250`) route through the serialized chokepoint — two independent
   probes (import graph; literal-host grep). But `chain`/`lastRequestAt` are **module scope = process
   scope**, so a capture script, a vitest worker, or an ad-hoc `curl` each start a fresh budget
   against **one shared egress IP**. Rules: all deliberate egress goes through the capture script;
   the script refuses under `CI`, requires `ALLOW_LIVE_NOMINATIM=1`, and refuses if the dev API is
   answering on :3001; test doubles **throw** on unmatched requests rather than passing through.
   Also: widen the `User-Agent` to carry a contact URL — the policy wants a contact route, and
   `(personal-use-app)` has none.
4. **D4/D5 — fixtures record the wire, replayed by an in-repo `fetch` double.** Recording
   `NominatimCandidate[]` would bake BUG-76 into the fixture and make it structurally unobservable —
   the same shape as QUAL-18's CSP blind spot. Fixtures live in `tests/fixtures/nominatim/` with a
   checked-in `requests.json` (the reviewable statement of what we ask a donated service for), an
   order-independent canonical query key, and a loud throw on a miss. **Mocking `nominatimSearch` is
   forbidden in the new suites** — that is QUAL-22's exact error. Frontend fixtures are *derived* by
   running the recorded responses through the real proxy handler, never authored.
5. **D6 — drift detection never gates CI.** `npm run fixtures:nominatim:drift`, on demand from the
   devcontainer, comparing a semantic projection (`class`, `type`, name, country, region ISO, lat/lon
   to 3 dp, count, order) rather than bytes. Named triggers replace a schedule. A scheduled Action was
   rejected: a runner's egress IP is shared with all of GitHub Actions, which is exactly what a public
   geocoder rate-limits indiscriminately.
6. **D7 — the BUG-76 probe must read the raw array.** 17 names (10 tail + 7 controls) × 3 variants
   (unconstrained/`limit=10`; `countrycodes=gb`/`limit=10`; `countrycodes=gb`/`limit=40`) ≈ 56 s of
   egress, plus a 4-request `Springfield`/`us` completeness probe at `limit=10/20/40/50`. The
   standalone §7.4 decision table states what each outcome implies — present-and-mistyped means widen
   the filter (`class`-aware, not a flat set); present only as `boundary/administrative` means tier it;
   present only as a natural feature means do **not** widen; absent at `limit=40` means a genuine
   coverage gap and ADL-48 §15.1's gating item fires. Every response is also a fixture — the probe and
   the capture are one run.
7. **D8 — GE-17's case is materially weakened.** *"Works offline"* was already withdrawn (BRD v3.15).
   *"The primary path can't be tested"* is dismantled by D4 — and its stated **reason** is inaccurate:
   the devcontainer firewall has nothing to do with CI, which sets `GEOCODING_ENABLED=false` for
   ADL-10 policy reasons. *(`ci.yml:76`'s "CI firewall doesn't allow Nominatim" comment is marked
   **UNVERIFIED**, not corrected — I cannot probe a runner from here; see standalone §6.2 for the
   positive evidence and its blind spot.)* The third argument, **ambiguity completeness, rests on a
   premise that is false for two of three call sites**: `resolveCityName` and `resolveCity` already
   pass `countrycodes`; only the **discovery** call (`useCities.ts:42`, no `country_code`) is global,
   which is the path BUG-71 travelled. Three one-line changes close most of the residual gap —
   (A) record the discarded raw pre-filter count (`nominatim-client.ts:136-143`), (B) raise `limit`
   on the constrained paths so `rawCount < limit` becomes a *positive* completeness determination,
   (C) pass the trip's declared countries on discovery (D-19, as one query parameter). What survives
   for GE-17: provider independence (ENV-02 class), queue depth, common-case latency/coverage — none
   of which are the arguments it is currently carried by.
8. **The finding the PO most needs, and it reorders the priorities.** ADL-48 §2's own words: the ten
   tail places are *"absent from both"* **candidate gazetteer datasets**. Under GE-17 as designed they
   resolve **only** through the geocoder. So the flagship Scottish trip is not covered by the
   gazetteer under either architecture, and **BUG-76 — our own `SETTLEMENT_TYPES` filter — is the only
   change under discussion that could make Plockton work at all.** It is also the cheapest. If the
   probe instead shows Nominatim genuinely lacks them, GE-17 does not rescue that either, and the
   answer becomes a different and larger decision.
9. **D9 — sequence, do not re-litigate.** W1 apply the diff + rebuild → W2 run the probe (~60 s) →
   W3 widen/tier `SETTLEMENT_TYPES` and land (A)+(B) → W4 land the fixtures recorded in W2 → **W5
   re-take the GE-17 S2/S3 decision with measurements instead of estimates.** ~a day of work against
   a multi-stage dataset build. This ADL takes **no position on W5's outcome** — only on the evidence
   it should be taken with. "Approved in principle" is not a reason to soften §6, and equally not a
   reason to reverse three benefits this document leaves untouched.

**Alternatives considered.** *Quietly edit `init-firewall.sh`* — rejected; ADL-33's omissions are
load-bearing and an extension must inherit their reasoning. *Live-call the geocoder in CI* — rejected:
non-deterministic (upstream data and ranking change), rate-limited, and an abuse of a donated service.
*MSW instead of an in-repo double* — rejected for now (one URL prefix, one method; the property that
matters is a throwing miss); switch trigger stated. *A scheduled drift Action* — rejected on shared
runner egress IP and on red-CI desensitisation; `workflow_dispatch` is the next step if needed.
*Add a Nominatim check to the script's closing verification block* — rejected: it would put a third
party on the critical path of container start. *A cross-process file lock for the rate limiter* —
rejected as over-engineering; the dev-API guard plus a single entry point covers the realistic cases.

**Implementation implications.**
- **COO/PO:** approve or decline the §3.5 diff; on approval apply, rebuild, and run all three
  verification commands (including the `example.com`-must-fail one, which is the one people skip).
  **Reopen ENV-01** — its "no fix needed" resolution is the root of the framing problem above.
  Decide MapTiler explicitly. Do **not** correct `ci.yml:76` on inference — it needs one probe from a
  runner first.
- **Backend brief (after rebuild):** run the probe, publish the table, commit the 55 fixtures, widen
  or tier `SETTLEMENT_TYPES`, land (A) and (B) *if* the measured `limit` cap supports (B), export
  `NOMINATIM_BASE`/`USER_AGENT` and widen the UA (**declare it — it is an egress-behaviour change**).
  Security checklist: no new routes, no new user-data columns, no auth surface touched.
- **QA brief (parallel):** the fixture scaffold, replay double, setup wiring, hash check, synthetic
  quarantine, and the drift script with its guards.
- **Known unverified, by design:** Nominatim's `limit` cap, whether de-duplication runs before or
  after the limit, and OSM's typing of the ten tail places are all **unverifiable from this
  container** (host blocked, six probes) and are what the §7.2 probe measures. Treat D8's
  quantification as **conditional on the probe** — if the cap turns out to be 10, change (B) is dead
  and D8 weakens considerably. The §8 coverage finding survives regardless, being read from ADL-48's
  own text.

**Weakest points, named for the OP-27 review** (standalone §9.2): (1) the whole D8/D7 quantification
rests on assumptions about a service this container cannot reach; (2) *"the browser runs on the
host"* is the load-bearing premise of the MapTiler deferral and is **inferred from the devcontainer
topology, not observed**. A third, offered because a self-named weakness is a hypothesis rather than
a confession: §5.6's fixture-honesty mechanisms may be theatre around the real property, which is
simply that a genuine 40-field Nominatim response is expensive to fake convincingly.

---

## ADL-50 — ATDD-first (independent acceptance tests before implementation) for Architect-spawned briefs

**Date:** 2026-08-05 · **Author:** COO (promoting open-dialogue D-17 on PO ratification) ·
**Status:** ADOPTED & implemented in this entry's PR — CLAUDE.md OP-35, the Architect-prompt marking,
and the `atdd-first-guard.sh` warn-hook. Supersedes the "ON TRIAL" state of open-dialogue D-17.

**Trigger.** D-17 ran ATDD-first as a trial across the ADL-46 access-model release (2026-07-30 →
close 2026-08-01) and reached a positive-but-qualified verdict; the formal verdict + promotion was due
at release close and was never written. PO confirmed 2026-08-05 (*"trial passed, we just didn't promote
it"*). This entry writes the verdict and promotes the rule.

**The rule.** For an implementation brief that an Architect spec spawns, the COO dispatches **QA first**
to turn the success criteria into *red* acceptance/integration tests — handed to the implementer as the
executable definition of done — before the implementation brief runs. This is ATDD / acceptance-test-first
(independent specification of behaviour), **not** the per-developer TDD inner loop implementers already do.
Its value is breaking the closed loop where the implementer writes both the code and the tests that certify
it: an independent QA author means a misread of the spec cannot produce code and tests that agree with each
other while both diverge from intent — the same principle as OP-27 fresh-eyes and the negative-findings
two-probe rule.

**The trigger is objective — keyed to Architect involvement, not a subjective "complexity" judgement.**
Required for the implementation briefs an Architect spec spawns; not required for briefs that never reach
the Architect. "Goes to Architect" already gates exactly the high-stakes classes: access-matrix /
ownership-scoping changes (ADL-27), data-integrity invariants (schema / migration / uniqueness / FK /
dedup), a multi-brief release exposing a contract other briefs consume, and any risk the Architect
explicitly named as "get this wrong and it breaks silently." Underlying principle: apply it when *a wrong
implementation would be silent-and-plausible* AND *the intended behaviour is precisely specifiable in
advance* — Architect-involvement is the objective proxy, and it self-widens (more routes → bigger access
matrix, more tables → more integrity invariants).

**Deliberate coverage gap (recorded, not hidden).** Complex *frontend/behavioural* work that legitimately
never sees the Architect (filter logic, date-defaults, cross-screen behaviour) is excluded: its failures
are visible and recoverable — they surface in UAT — not silent-and-costly, so ATDD's extra dispatch round
does not pay back there; it leans on implementer tests + UAT + OP-32 (which forces the test the *second*
time it breaks). Revisit trigger: if UAT starts catching complex-frontend logic bugs that slipped
implementer tests, promote this trigger back.

**Verdict (the honest finding, which the promoted rule must carry).** Both promotion conditions were met:
QA-first caught at least one behavioural divergence the implementer's own tests would have missed (the HC-06
spec-inventory gap; the D13 reverse single-match duplicate, caught by layered review even where QA's own
suite missed it), and the cost — one QA dispatch + one fix-cycle, no rebuilds — was proportionate.
**QUALIFIED:** on the same release the 32-test ATDD suite was partly "green for the wrong reason" — a
geocoding mock omitted `resolveCityName`, so the route's try/catch swallowed the resulting TypeError and a
group of tests passed without exercising what they claimed (QUAL-22). The honest claim is therefore
narrower than "ATDD works": *writing tests first prevented them being bent to fit the implementation, which
is worth having; it did not by itself make them good tests.* **Consequence for the rule — an ATDD brief
must carry a mock-fidelity check:** the test doubles must export/behave like the real dependency, so a
suite cannot pass vacuously.

**Placement (implemented this entry).**
- **CLAUDE.md OP-35** — the operating rule, the objective trigger, the mock-fidelity requirement, and the
  COO's one-line duty (dispatch QA before the implementer when a spec marks a brief ATDD-first).
- **Architect system prompt** (`jobs/architect/architect-system-prompt.txt`) — the Architect marks each
  implementation brief its spec spawns `ATDD-first: yes/no`, so the flag reaches the COO pre-set. Home
  chosen so the rule is loaded only when the Architect runs — i.e. only for the complex work it governs.
- **Warn-hook backstop** (`.claude/hooks/atdd-first-guard.sh`, registered PostToolUse) — fires when a
  brief authored into a `gh issue create` / `gh pr create` body, or into a `*brief*` file under `jobs/**`,
  touches `schema.ts`, `migrations/`, or `require(Owner|Auth)` WITHOUT a stated ATDD decision. Warn-not-block
  (OP-26/OP-28 precedent). **Known blind spot, stated honestly:** PostToolUse hooks see `Write`/`Edit`/`Bash`,
  NOT Agent-tool dispatch prompts, so a brief dispatched directly through the Agent tool is invisible to this
  hook — the Architect-prompt marking + the COO duty are the primary controls there; the hook backs up the
  `gh`-issue and brief-file channels. Canary added to `/coo-startup`.

**Alternatives considered.** (1) Blanket TDD on every brief — rejected: pure ceremony where failures are
visible/recoverable (the coverage gap above). (2) A subjective "enough complexity" threshold — rejected: it
would be re-litigated every session; the Architect-involvement proxy is objective and self-widening. (3)
Keeping the rule out of CLAUDE.md (the trial-era placement idea, to avoid an always-on read cost) — narrowed:
a short CLAUDE.md handle (OP-35) is added for discoverability and one-canonical-home, with the full record
here and the operational marking in the Architect prompt.

**Implementation status.** IMPLEMENTED in this PR. First application: the BUG-75 Round-4 build
(Architect-spec'd, schema + migration, access-adjacent) — QA-first, on Opus 5.

---

## ADL-51 — Geocoder accept-rule re-keyed to `addresstype`, and the BUG-74 `/api/geocode` status contract

**Date:** 2026-08-07 · **Author:** Architect · **Status:** DESIGN — pending OP-27 fresh-eyes
review, then ATDD-first implementation. NOT yet implemented. Full design + fixtures:
`jobs/architect/tech/20260807-BUG76-accept-rule-design.md`; ground-truth captures at
`src/backend/services/__tests__/fixtures/nominatim/bug76/`.

**Trigger.** BUG-76 (P1), root cause verified 2026-08-07 by a live Nominatim probe. The
geocoder's settlement filter (`nominatim-client.ts:116/230/267`) keys on Nominatim's
class-`type` (`administrative`), while prominent cities are OSM admin-boundary relations
(`type=administrative`, `addresstype=city`) — so Denver (which has *no* place-node in OSM)
and the famous Springfields (IL/MO/MA/OH) are silently discarded and never geocode. BUG-74
(P2) rides along: `geocode.ts:86` maps a non-ok/empty client result to `[]` at HTTP 200, so
"upstream failed" / "filtered everything out" / "no such city" are indistinguishable — which
is *why* BUG-76 was invisible.

**Decision.**
1. **Re-key the accept-rule from `type` to `addresstype`.** Capture `addresstype` in
   `parseCandidate`; admit `addresstype ∈ {city, town, village, hamlet, municipality}`,
   retaining the "discriminator absent → admit" passthrough. Apply via one shared predicate
   at *both* the search (`:230`) and lookup (`:267`) call sites — the bug is present at both.
2. **Edge cases:** reject `suburb` (sub-municipal; reversible/tunable) and `census` (a US CDP
   artifact that in-fixture duplicates a real `city` row); admit `municipality`.
3. **Discovery query stays unconstrained** — country-constraining it is structurally
   impossible on the discovery path and product-wrong for an international app; independent of
   and not bundled with the accept-rule fix.
4. **BUG-74 contract:** add `status: 'ok' | 'error' | 'disabled'` to the `/api/geocode` body
   (additive, backward-compatible), keep HTTP 200 in all three cases; the frontend half maps
   `error`/`disabled` → `failed:true`. Exact three-state *copy* remains BUG-71's.

**Alternatives considered.** `place_rank` as discriminator — **rejected**: Denver CO
(`city`) and Cook County (`county`) are both `place_rank=12`, so no rank threshold separates
them (guarded by success-criterion AC-6). `admin_level` — rejected: absent from our payload,
would need a request-shape change for a signal `addresstype` already gives. HTTP 502/503 for
the error/disabled states — rejected: collapses "our backend unreachable" and "upstream
unreachable" into one signal; always-200-plus-`status` keeps the layers distinct.

**Implementation implications.**
- `src/backend/services/nominatim-client.ts`: add `addressType` to `NominatimCandidate` and
  `addresstype` to `RawNominatimResult`; replace `SETTLEMENT_TYPES` gate with a shared
  `isAcceptedSettlement` predicate keyed on `addressType`; `NominatimSearchResult.status`
  already exists and is what the route must stop discarding.
- `src/backend/routes/geocode.ts:86`: stop collapsing `result.status`; serialize `status`.
- `src/frontend/types/api.ts`: add `status` to `GeocodeResult`. Frontend consumption
  (`useCities.ts` `lookupCityCountry` → `failed`) is BUG-74's frontend half.
- Blast radius verified small: nothing outside the filter reads `candidate.type`/`.class`
  (`geocoding.service.ts` uses only name/coords/osm identity).
- **UNVERIFIED:** whether the `/lookup` response carries `addresstype` (no `/lookup` fixture
  captured; firewall). The null-passthrough makes the rule correct either way; blind spot and
  probe stated in the design doc §3.4.

**Supersession / open questions.** Reinforces ADL-48 §2.1/§15.1 (geocoder-as-tail) by
removing a filter defect that would have partially undermined it — no ADL-48 decision
re-opened. Settles the BUG-76 "is it a regression" question: no — latent gap (OP-32). No BRD
requirement ID is introduced by this design; COO to confirm a BRD home before dispatch per
the standing BRD-gate rule.

**Spawns implementation brief — `ATDD-first: yes`** (Architect-involved, silent-and-plausible
geocode failure, precisely specifiable against committed real fixtures — OP-35 trigger met).

**CORRECTION (2026-08-07, post-OP-27 fresh-eyes review).** The OP-27 review
(`20260807-BUG76-accept-rule-design-OP27-review.md`) was reconciled by the COO against live
Nominatim probes; the corrected design-of-record is design-doc §9. Amendments to this entry:

1. **Fixtures are `format=json`, and production stays on `format=json`.** The OP-27 review's
   C1 (switch production to `format=jsonv2`) is **wrong** and is NOT adopted: `format=json&
   addressdetails=1` (production's exact params, `nominatim-client.ts:214`/`:256`) *does*
   return `addresstype` (Denver→`city`, Cook County→`county`, Colorado→`state`), and
   `parseCandidate` reads `raw.class` (`:294`) — a `json` field that `jsonv2` renames to
   `category`, so switching would break it. The genuine defect was that the *committed
   fixtures* had been captured as jsonv2; they are **replaced with the `format=json` set**
   (carrying `class`/`addresstype`/`address`). No production request-shape change. Verified
   accept-rule under json: Denver 4/4, Springfield US 19/20 (census dropped, city twin
   survives), Cook County 0, Colorado 0, all four CDP twins survive.
2. **`parseCandidate` must read `addressType: raw.addresstype`**; the ATDD mock-fidelity
   gate must assert the outgoing URL carries `format=json&addressdetails=1` (new AC-0).
3. **Edge cases (Decision 2), corrected:** reject `addresstype ∈ {census, statistical}` —
   `statistical` is a real second variant (found on Bethesda/Silver Spring MD). Confidence
   **downgraded from high to reversible/tunable**, grounded in four live CDP probes
   (Paradise NV, McLean VA, Bethesda MD, Silver Spring MD) each retaining a `town`/`city`
   twin. The affirmative reason to reject: the statistical row (a `relation`) and its
   settlement twin (a `node`) have **different `(osm_type, osm_id)`**, so BUG-75 dedup
   cannot merge them — admitting both yields an un-dedupable duplicate. The reverse-widen,
   if ever needed, is **candidate-set-aware** (admit census/statistical only when no
   settlement twin exists in the same result set), NOT a blanket add. Paradise NV fixture +
   AC-8b pin this. (Original §4 D5 "dedup handles it" rationale was circular — corrected.)
4. **UNVERIFIED `/lookup` `addresstype` — RESOLVED.** The lookup call site sets
   `addressdetails: '1'` identically to search, so `/lookup` returns `addresstype`; the
   shared predicate applies cleanly at both sites. The "UNVERIFIED" implementation
   implication above is superseded by this.
5. **Townships — explicit ADMIT ruling** added (they carry a settlement `addresstype` under
   json); see §9.7.

This correction is an incorporation of settled OP-27 findings; it did **not** require a
second OP-27 pass.

## ADL-52 — OP-27 refinements: settle the author's open questions before fresh-eyes; review the whole amended document

**Date:** 2026-08-08 · **Author:** COO (PO direction) · **Status:** IMPLEMENTED this PR —
CLAUDE.md OP-27 section amended and the OP-27 tracker note updated. No code change.

**Trigger.** The open-dialogues curation (PO direction: that file holds only
undecided/untracked topics) surfaced two adopted-in-principle process refinements that had
sat as open-dialogues **D-16** and **D-25**. The PO ruled: adopt both, and fold D-25's first
clause in as the second's *rationale* rather than as a separate gate.

**Decision.** Two clauses added to OP-27 (the Architect fresh-eyes review rule). Both prevent
one silent failure — a review that comes back clean because it spent itself on the wrong
target is indistinguishable from one that genuinely found nothing:

1. *(from D-16)* Before dispatching the fresh-eyes reviewer, resolve the authoring agent's own
   flagged open questions — PO decisions taken, spec amended — **if any**. Origin: the ADL-46
   review, where the PO stopped the COO from dispatching the reviewer at a spec carrying three
   author-flagged items and a phasing plan the PO then overrode.
2. *(from D-25 2b)* A review of an **amended** document reviews the whole document and
   explicitly checks the **seam** between the amendment and the sections it did not touch —
   asking whether the amendment invalidated an earlier **verdict**, **method**, or **reason**
   there. Origin: all four blocking findings against ADL-49 §10 lived in that seam, caught
   only because the review brief happened to scope the whole document.

**Alternatives considered.**
- *D-25 2a as a standalone amendment-time gate* ("an amendment must re-walk the sections it
  didn't intend to change"). **Declined as a separate gate** — the team is already
  process-rich (the same reasoning deferred D-26 this cycle) and it overlaps OP-28 + the
  negative-findings discipline. Its substance (the verdict/method/reason check) is **folded
  into clause 2 as its rationale**, keeping the "why" without a distinct checkpoint.
- *Mint a new OP number for the refinement.* Declined — it refines OP-27, so it amends OP-27
  in place (CLAUDE.md section + the OP-27 tracker note) rather than standing up OP-38.

**Implementation implications.**
- CLAUDE.md `### Architect fresh-eyes review (mandatory, OP-27)` carries both clauses (this PR).
- OP-27's tracker note records the 2026-08-08 refinement and this ADL (this PR).
- open-dialogues **D-16** and **D-25** move from Open → Resolved, pointing here (this PR).
- No behaviour/code change; it binds COO dispatch sequencing and reviewer-brief scoping.

## ADL-53 — Narrow the add-place picker by the trip's declared country SET (hard filter)

**Date:** 2026-08-08 · **Author:** Architect · **Status:** DESIGN — pending OP-27 fresh-eyes, GE-20
BRD promotion, and implementation. No production code. Full design:
`jobs/architect/tech/ADL-53-trip-country-picker-filter.md`.
**Tracker:** BUG-87 · **BRD:** proposes **GE-20** (COO to formalize) · **Interacts:** GE-14/15/16,
BUG-90, BUG-91.

**Trigger.** 2026-08-08 owner UAT (findings 1.2 + 6.2), PO-directed: "Newport" on a UK trip returns
USA Newports because the picker narrows by the country the geocoder auto-detects, not the trip's
declared countries. PO decision: use the trip's country set as a **hard filter** (not a rank); the
set is declared at trip creation and editable; to add an off-country place, edit the trip's
countries first; the picker carries a visible "filtered by" note.

**Decision (summary — see standalone file for the table and per-decision reasoning).**
- **The machinery already exists.** Probed and disproved the load-bearing risk that `trip_countries`
  is *derived from places* (the stale schema comment): the only write path is user declaration —
  `POST/PATCH /api/trips` + the `trip-countries` sub-router — and `TripForm` already renders a
  country multi-select. `places.ts` writes no country row on place-add, so the hard filter is **not
  circular**. BUG-87 is missing read-path wiring, not missing infrastructure.
- **Contract (D1):** add a **new** `country_codes` (comma-joined ISO alpha-2) query param to
  `GET /api/cities` and `GET /api/geocode`, distinct from the existing single `country_code` (the
  D12 create-constraint). Nominatim's `countrycodes` natively takes the comma list.
- **Semantics (D2):** non-empty set ⇒ `inArray(cities.countryCode, set)` for the DB search,
  `countrycodes=<set>` for geocode. Union across a multi-country set; nothing outside it.
- **Zero-country trip (D3, OPEN Q1):** `country_codes` is optional at create, so an empty set is
  real. Recommend empty ⇒ *unconstrained + a prompt to add countries*, never a hard-empty result.
- **Off-country add (D4, OPEN Q2):** recommend a day-one static empty-state linking to the trip's
  country editor (reuse TripForm / countries sub-router); an inline discovery-probe "add France?"
  affordance is a flagged fast-follow.
- **Note (D5):** "Showing places in: `<names>`" from `trip.countries` (already in the trip payload).
- **BUG-90 seam (D7):** filter at ISO-country granularity only; `trip_countries.country_code`
  FK-RESTRICTs to ISO, so BUG-90 maps "Scotland" → `GB` before storing and a Scotland trip admits
  all UK cities (PO-accepted). **No ship-order dependency** between BUG-87 and BUG-90.
- **Schema (D8):** none — read-path query params only; no migration.
- **Security (D9):** no new scoping; `country_codes` narrows global reference data and is not an
  authz boundary; GE-16 creator-scoping preserved and orthogonal.
- **ATDD-first (D10):** backend contract brief **yes** (silent-and-plausible, precisely specifiable,
  shared contract); frontend wiring/affordances brief **no** (UAT-visible, OP-35 frontend exclusion).

**Alternatives considered.** Overload `country_code` to take a list (rejected — conflates two
semantics + `string|string[]` footgun); rank-not-filter (rejected by PO; the "loses valid results"
concern is answered by the *editable* set); backend derives the trip's countries itself (rejected —
re-introduces the disproved derived model and couples stateless lookups to trip ownership); filter at
region granularity for BUG-90 trips (deferred, out of scope).

**Implementation implications.** Brief A (backend contract, QA-first) extends the two Zod schemas +
wires `inArray`/`countrycodes`, caps the set (~≤10), corrects the stale `trip_countries` doc comment;
Brief B (frontend) threads `trip.countries` into `AddPlaceFlow`/`MobileTripDetailView` and renders
the note + zero-country prompt + empty-state. GE-20 proposed with success criteria for COO to
formalize (BRD §5.1 + version bump + BUG-87 `brdRefs`). Open product calls Q1/Q2/Q3 to PO before
fresh-eyes (OP-27 refinement 1). No code merges from this ADL until fresh-eyes clears it.

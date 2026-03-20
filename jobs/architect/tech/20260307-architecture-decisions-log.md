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


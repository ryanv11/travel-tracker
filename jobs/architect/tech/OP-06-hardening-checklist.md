# OP-06 — Security Hardening Checklist
**Date:** 2026-03-23
**Author:** Architect
**Status:** Initial issue — current state assessment included inline
**Tracker:** OP-06, NR-14
**GitHub:** #23 (Clerk firewall)

This document is the authoritative pre-condition for NR-14. NR-14 passes only when every
checklist item below is marked PASS. Items currently assessed FAIL or PARTIAL constitute
the NR-14 implementation backlog.

---

## 1. Trust Boundaries

### 1.1 Boundary map

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │  OUTSIDE (untrusted)                                                │
  │  - Any HTTP client (browser, mobile, tool)                          │
  │  - Clerk IdP — trusted for JWT signature verification via JWKS     │
  │    only. Claims in the payload are trusted only after explicit      │
  │    validation (iss, aud, exp, nbf). Authorization decisions are     │
  │    made entirely by the application — Clerk has no role in them.   │
  └────────────────────────────┬────────────────────────────────────────┘
                               │ HTTPS — /api/* only
  ┌────────────────────────────▼────────────────────────────────────────┐
  │  TRUST BOUNDARY — Express auth middleware (requireAuth)             │
  │  Entry condition: JWT signature valid + required claims pass        │
  │  What crosses: req.user = { id, clerkId, email }                   │
  │    id       → users.id (UUID v4) — authoritative application        │
  │               principal; used for all ownership and scoping         │
  │    clerkId  → payload.sub — stable external identity key;          │
  │               used only to look up / create the internal user       │
  │    email    → informational only; must not become                   │
  │               authorization-bearing at any layer                    │
  └────────────────────────────┬────────────────────────────────────────┘
                               │
  ┌────────────────────────────▼────────────────────────────────────────┐
  │  INSIDE (trusted execution environment)                             │
  │  - Express route handlers                                           │
  │  - Repository layer (user-scoped queries by users.id)              │
  │  - SQLite database (dev) / LibSQL (hosted)                          │
  └─────────────────────────────────────────────────────────────────────┘

  OUTSIDE TRUST BOUNDARY (static, no auth):
  - /geo/* — GeoJSON boundary files (see item 1.2)
  - /health — liveness probe only
```

### 1.3 Principal hierarchy

Three identity concepts exist in the system and must not be conflated:

| Concept | Source | Scope |
|---|---|---|
| `payload.sub` (clerkId) | Clerk JWT | External identity key. Stable per Clerk account. Used in `findOrCreateByClerkId` to look up the internal user. Never used directly for ownership scoping after that point. |
| `users.id` (UUID v4) | Application DB | Authoritative application principal. All ownership columns (`trips.user_id`, `trip_places.user_id`, `items.user_id`) reference this value. All repository WHERE clauses use this value. |
| `payload.email` | Clerk JWT | Informational only — stored for display and admin identification. Must not be used as a trust signal, an access control key, or a uniqueness constraint for authorization purposes. Email is not guaranteed unique across Clerk accounts, is user-modifiable, and is not validated by the backend independently. |

Authorization decisions use only `users.id`. Routes and repositories must never branch on `email` or `clerkId` for access control.

### 1.2 Static file boundary gap — `/geo/*`

`/geo` is served by `express.static` before `requireAuth`. GeoJSON boundary files for
national/regional polygons are globally published data (not user data), but they are
accessible without authentication. This is an accepted risk — the data is not sensitive
and is required for the map to render before the auth flow completes in the browser.

**Accepted risk** — document explicitly. Not a NR-14 blocker.

---

## 2. Resource/Action Access Matrix

For the three authenticated roles defined in the brief:
- **Owner** — the user_id that created each resource
- **Explicitly shared** — Phase 3+ only; no grant mechanism exists yet (see §7)
- **Authenticated-but-ungranted** — valid Clerk token, no explicit grants

Unauthenticated requests are rejected before this matrix applies (see §3).

| Resource | Owner | Explicitly shared | Authenticated-but-ungranted |
|---|---|---|---|
| **Trips** (own) | Full CRUD | N/A (Phase 3+) | Denied — empty list returned |
| **Trip detail** (own) | Full CRUD | N/A (Phase 3+) | Denied — 404 (see §4) |
| **Places** (own trip) | Full CRUD | N/A (Phase 3+) | Denied — 404 via trip ownership |
| **Items** (own trip) | Full CRUD | N/A (Phase 3+) | Denied — 404 via trip ownership |
| **Map shading** | Read (own trips — NOT YET SCOPED) | N/A | Read — **FAIL: currently aggregate of all users** |
| **Shading config** | Read + Update | N/A — not per-user yet (AD-07 unimplemented) | Read + Update — **FAIL: no owner guard** |
| **Admin: categories** | Read + Write | N/A for NR-14 | Read + Write — **FAIL: no owner guard** |
| **Admin: activities** | Read + Write | N/A for NR-14 | Read + Write — **FAIL: no owner guard** |
| **Admin: companions** | Read + Write | N/A for NR-14 | Read + Write — **FAIL: no owner guard** |
| **Admin: country config** | Read + Update | N/A for NR-14 | Read + Update — **FAIL: no owner guard** |
| **Admin: regions** | Read + Write | N/A for NR-14 | Read + Write — **FAIL: no owner guard** |
| **Cities** (GET — search) | Read | Read | Read — accepted (seed data, not user data) |
| **Cities** (POST — create) | Write | Write? | Write — **FLAG: any authed user can create cities** |
| **Geo static files** | Read | Read | Read (unauthenticated) — accepted risk |

**Flags requiring explicit scoping decisions before NR-14:**

- **Map shading**: Must scope to `req.user.id`. Currently aggregate of all users.
- **Admin panel writes**: Must be owner-only. Requires an owner determination mechanism (see ADL-27).
- **City creation**: POST `/api/cities` is a privileged write. Should be owner-only to prevent pollution of the global cities seed by ungranted users.

---

## 3. Token / Claim Validation

### 3.1 Validation sequence

```
1. Extract Authorization header
   → If missing: 401 {"error":"Unauthorized"}, no logging, terminate
   → If present but not "Bearer <token>": 401, terminate

2. Call createRemoteJWKSet(CLERK_JWKS_URI) [lazy init, jose-cached]
   → If CLERK_JWKS_URI not set: throws at startup; server fails to start

3. jwtVerify(token, jwks)
   → jose validates: signature, expiry (exp), not-before (nbf)
   → If any validation fails: catch → 401 {"error":"Unauthorized"}, terminate

4. Extract payload.sub (clerkId) and payload.email
   → sub is the Clerk user ID (always present in Clerk JWTs)
   → email may be absent (defaults to '')

5. userRepository.findOrCreateByClerkId(clerkId, email)
   → Creates internal user record on first sign-in (UUID v4 id)
   → Returns { id, clerkId, email }

6. Attach req.user = { id, clerkId, email }
   → next() — route handler proceeds
```

### 3.2 Claims validated by jose/Clerk

- **Signature** — verified against JWKS
- **exp** — token expiry enforced by jose
- **nbf** — not-before enforced by jose
- **iss** — NOT explicitly validated (see 3.3)
- **aud** — NOT explicitly validated (see 3.3)

### 3.3 Gaps in claim validation

**PARTIAL: `iss` and `aud` not validated explicitly.**
jose's `jwtVerify` by default does not enforce `issuer` or `audience` unless passed
as options. Clerk JWTs include `iss` (the Clerk instance URL) and `aud` (the frontend
domain). These should be validated to prevent token reuse from other Clerk instances.

**Remediation:** Pass `{ issuer: process.env.CLERK_ISSUER, audience: process.env.CLERK_AUDIENCE }`
to `jwtVerify`. Requires adding `CLERK_ISSUER` and `CLERK_AUDIENCE` env vars.

**FAIL: BYPASS_AUTH in local dev** — see §4 failure modes.

### 3.4 BYPASS_AUTH scope

`BYPASS_AUTH=true` is the escape hatch for CI contract tests and agent sessions.
- Hardcodes `req.user` to test user UUID
- Production guard exists: throws if `NODE_ENV === 'production'`
- Local dev: `BYPASS_AUTH=true` persists in `.env.local` because the Clerk JWKS endpoint
  is blocked by the devcontainer firewall

**FAIL until resolved** — real JWT auth must work in local dev for NR-14.

---

## 4. Failure Behaviour and Response Minimisation

### 4.1 Authentication failures (before application logic)

| Failure mode | Status | Body | Logged | Session |
|---|---|---|---|---|
| Missing Authorization header | 401 | `{"error":"Unauthorized"}` | Not logged | Terminated |
| Malformed Bearer token | 401 | `{"error":"Unauthorized"}` | Not logged (catch-all) | Terminated |
| Invalid signature | 401 | `{"error":"Unauthorized"}` | Not logged | Terminated |
| Expired token | 401 | `{"error":"Unauthorized"}` | Not logged | Terminated |

**Assessment: PASS** — all four are caught by the single `catch` block and return 401
with an opaque error body. No stack trace, no token content, no indication of failure mode.

**Gap:** Auth failures are not logged at all — no server-side visibility into attack patterns.
For NR-14 this is an accepted gap (personal app), but logging at WARN level (without token
content) is recommended before companion access opens.

### 4.2 Authorisation failures (after valid token confirmed)

| Failure mode | Status | Body | Logged | Notes |
|---|---|---|---|---|
| Valid token, trip not owned by user | 404 | `{"error":"Not found"}` | Not logged | Via `findByIdOrThrow(userId, tripId)` — correct |
| Valid token, item not found | 404 | `{"error":"Not found"}` | Not logged | Via trip ownership check first |
| Valid token, trip locked | 403 | `{"error":"LockError..."}` | Not logged | Correct — lock rejection |
| Valid token, no grants (admin) | **200 / write succeeds** | N/A | N/A | **FAIL — no owner guard** |
| Valid token, map shading | 200 (all users' data) | Aggregate response | N/A | **FAIL — not user-scoped** |

### 4.3 Response minimisation

**Trips and places: PASS** — `findByIdOrThrow(userId, tripId)` throws `NotFoundError` when
the trip exists but is owned by a different user. The 404 does not distinguish between
"does not exist" and "exists but not yours" — correct response minimisation.

**List endpoints: PASS** — `findAll(userId, filters)` returns only the authenticated user's
trips. An ungranted user receives an empty array, not a 403. This is correct — it does not
confirm or deny the existence of trips owned by others.

**Count metadata: PASS** — no endpoint returns total trip count or aggregate statistics
across all users.

**Admin panel: FAIL** — any authenticated user can read all admin data (categories, activities,
companions, shading config, country config, regions) and write to any of it. No filtering
by owner. This leaks the owner's custom categories/companions/shading config to any
authenticated-but-ungranted user.

**Map shading: FAIL** — `getCountryShading()` and `getAllCountryShading()` join trips to
places without a `WHERE trips.user_id = ?` predicate. Any authenticated user receives
the map shading computed from all users' trip data combined.

---

## 5. Isolation Enforcement Layers

### 5.1 Route guards

**What they do:** `requireAuth` middleware attached at `app.use('/api/', requireAuth)`.
Every `/api/*` route receives a validated `req.user.id` (internal UUID) or the request
is rejected before reaching the handler.

**What they assume:** Route handlers extract `req.user!.id` and pass it to the repository
layer. The `!` non-null assertion is safe because `requireAuth` either sets `req.user` or
terminates the request.

**Gap:** Route handlers do NOT enforce ownership beyond passing userId to the repo. There
is no route-level access matrix or role check. Admin routes do not check whether the
authenticated user is the owner. This is a route-level gap — the repo layer is also
unscoped for admin (see §5.3).

**Assessment: PARTIAL** — auth boundary is solid; ownership is enforced only for trip/place/item
routes via repository pass-through. Admin routes have no ownership enforcement at any layer.

### 5.2 Repository scoping

**Trip/place/item repositories: PASS** — every mutating operation and every read in
`tripRepository`, `placesRepository`, and `itemsRepository` takes `userId` as a parameter
and includes `eq(trips.userId, userId)` or `eq(tripPlaces.userId, userId)` in the WHERE
clause. `findByIdOrThrow(userId, tripId)` returns 404 rather than the row if ownership
doesn't match.

**Carry-forward (items):** `executeCarryForward` in the items service uses the userId for
ownership checks on both source and destination trips.

**Admin repositories: FAIL** — admin routes call `getDb()` directly (not through a repository)
and perform no userId scoping. There is no admin repository.

**Shading service: FAIL** — shading queries join `trips` without a `WHERE trips.user_id = ?`
predicate. All shading is computed from all users' data.

**Users repository: PASS** — `findOrCreateByClerkId` is internal to auth middleware. No
user listing endpoint exists.

### 5.3 Query predicates

**Trips: PASS** — `WHERE trips.user_id = <userId>` present on all trip reads and writes.

**Trip places: PASS** — `WHERE trip_places.user_id = <userId>` present in place mutations;
place reads are gated by the trip ownership check.

**Items: PASS** — `WHERE items.user_id = <userId>` present on item reads and writes.

**Shading: FAIL** — no `WHERE trips.user_id = ?` in shading queries.

**Admin tables (categories, activities, companions, shading_config, countries, regions):
FAIL** — no user_id columns; no scoping possible with current schema. This is intentional
for global tables (categories, activities per AD-09) but is a gap for companions (AD-08
says per-user) and shading config (AD-07 says per-user).

### 5.4 Database constraints

**Trips/places/items: PARTIAL** — `user_id` columns exist on `trips`, `trip_places`, and
`items` as nullable FKs to `users.id`. The nullable design is intentional (ADL-16:
`NULL = no owner yet` for pre-auth seed data). This means the DB constraint does NOT
enforce non-null ownership — a bug in application code that omits userId would silently
create ownerless records that are never returned by any scoped query.

**Recommendation (ADL-27 pending):** The "no owner yet" null pattern should be retired
before NR-14. All new records must carry a non-null userId. Existing NULL rows are
the owner's legacy data (set to owner UUID at migration time).

**Admin tables:** No user_id columns. No DB-level enforcement possible for per-user
admin data until schema is extended.

**Cascade behaviour: PASS** — trip deletion cascades to trip_places, items, and their
extension tables. No orphaned records.

### 5.5 Combination rationale

| Layer | Trip/Place/Item | Admin | Shading |
|---|---|---|---|
| Route guard (auth) | Primary: auth boundary | Primary: auth boundary | Primary: auth boundary |
| Repository scoping | Primary: ownership | Absent — FAIL | Absent — FAIL |
| Query predicates | Primary: WHERE user_id | Absent — FAIL | Absent — FAIL |
| DB constraints | Defence-in-depth (partial — nullable) | Not applicable | Not applicable |

For trip data: three layers working in combination. If route guard fails (BYPASS_AUTH
in CI), repository and query predicate still enforce ownership. If userId were corrupted
somehow, the DB FK ensures it references a real user.

For admin data and shading: only the auth boundary exists. If a second user authenticates,
they have full read/write access to all admin data and see combined shading. This is the
primary remediation target for NR-14.

---

## 6. Checklist Items with Verification Criteria

---

### HC-01 — Clerk JWKS reachable in local dev

**Requirement:** Real JWT auth must work in local dev. `BYPASS_AUTH=true` must not be
required in `.env.local` for the PO's manual testing session.

**Current state: FAIL** — Clerk JWKS endpoint (`just-raptor-89.clerk.accounts.dev`) is
blocked by the devcontainer firewall (`init-firewall.sh`). `BYPASS_AUTH=true` is
permanent in `.env.local`.

**Remediation:**
1. Add `just-raptor-89.clerk.accounts.dev` to the allowed-domains loop in
   `.devcontainer/init-firewall.sh`.
2. Remove `BYPASS_AUTH=true` from `.env.local` (keep it available in `.env.local.example`
   for CI/agent sessions).
3. IP rotation risk: Clerk uses a CDN. The firewall resolves hostnames to IPs at container
   startup. If Clerk rotates IPs mid-session, auth calls will fail — cost is a container
   restart. This is acceptable for local dev. No mitigation required.

**Verification:**

The firewall change is a necessary condition for HC-01 — it is not sufficient. HC-01
closes only when real-auth is verified end-to-end by the PO under UAT. Configuration
change alone does not constitute closure.

Required UAT steps (all must pass):
1. Start devcontainer with `BYPASS_AUTH` unset or absent from `.env.local`.
2. Open the app in a browser. Confirm the Clerk sign-in screen appears and completes
   successfully (no JWKS fetch error in the server log).
3. Confirm `GET /api/trips` returns 200 with the owner's real trip data.
4. Confirm the owner can perform an admin write (e.g. create a category) — confirming
   owner role resolution works with a real Clerk token.
5. Sign in as a second Clerk account (non-owner). Confirm `GET /api/trips` returns
   `200 []` (empty, not the owner's data). Confirm `POST /api/admin/categories` returns
   403. This verifies that authenticated-but-ungranted behaviour is correct under real auth.
6. Confirm the server log shows no BYPASS_AUTH warnings during the session.

- Code review: Confirm `init-firewall.sh` contains the Clerk domain.
- UAT sign-off: PO records pass/fail for each step above in the UAT log.

---

### HC-02 — JWT issuer and audience validated

**Requirement:** `jwtVerify` must validate `iss` and `aud` to prevent token reuse across
Clerk instances or apps.

**Current state: PARTIAL** — jose's `jwtVerify` is called without `issuer` or `audience`
options. Signature and expiry are validated; issuer and audience are not.

**Remediation:**
1. Add `CLERK_ISSUER` and `CLERK_AUDIENCE` to `.env.local` and document in `.env.local.example`.
2. Pass `{ issuer: process.env.CLERK_ISSUER, audience: process.env.CLERK_AUDIENCE }` to
   `jwtVerify` in `auth.ts`.

**Concrete env var values:**

- `CLERK_ISSUER=https://just-raptor-89.clerk.accounts.dev`
  This is the Clerk instance URL. Clerk sets `iss` in every JWT to the instance's base URL.
  The format is always `https://<instance-slug>.clerk.accounts.dev` for Clerk-hosted instances.

- `CLERK_AUDIENCE` — Clerk sets `aud` to the Frontend API URL for the instance. For this
  project the value is `https://just-raptor-89.clerk.accounts.dev`. In some Clerk
  configurations `aud` may be set to the published domain or a custom audience configured
  in the JWT template. **Backend agent must verify the actual `aud` value by:**
  1. Decoding a real Clerk JWT from the running app (e.g. with `jwt.io`) and reading the
     `aud` claim directly.
  2. Cross-checking against Clerk Dashboard → JWT Templates → Default template → Audience.
  Document the confirmed value in `.env.local.example` before implementation.

- **BYPASS_AUTH sessions:** When `BYPASS_AUTH=true`, the middleware short-circuits before
  any token is parsed — `jwtVerify` is never called. `CLERK_ISSUER` and `CLERK_AUDIENCE`
  env vars are not read during BYPASS_AUTH sessions. Contract tests that use `BYPASS_AUTH`
  do not need these vars set and are unaffected by this validation addition.

**Verification:**
- Contract test: Supply a JWT signed by a different Clerk instance (or forge `iss`); confirm 401.
- Contract test: Supply a JWT with a mismatched `aud`; confirm 401.
- Code review: Confirm `jwtVerify` options include issuer and audience.
- Code review: Confirm BYPASS_AUTH short-circuit runs before `jwtVerify` is called.

---

### HC-03 — Map shading scoped to authenticated user

**Requirement:** `GET /api/map/shading`, `GET /api/map/shading/:code`, and
`GET /api/map/shading/:code/regions` must return shading computed only from the
authenticated user's trips.

**Current state: FAIL** — shading queries join trips without `WHERE trips.user_id = ?`.
All shading functions in `shading.service.ts` are not user-aware.

**Remediation:**
1. Add `userId: string` parameter to `getAllCountryShading`, `getCountryShading`, and
   `getRegionShading` in `shading.service.ts`.
2. Add `eq(trips.userId, userId)` to all three shading queries.
3. Route handlers in `map.ts` must extract `req.user!.id` and pass it to shading functions.

**Verification:**
- Backend unit test: Create trips under two different userId values; confirm shading for
  userId-A does not include trips under userId-B.
- Contract test: Authenticate as user-A; confirm shading response excludes user-B's trips.

---

### HC-04 — All admin routes are owner-only for NR-14

**Requirement:** All admin endpoints — reads and writes — are restricted to the owner
for the purposes of NR-14. This includes GET routes on categories, activities, companions,
shading config, country config, and regions.

**Rationale for locking reads:** The admin panel exposes the owner's custom categories,
companion names, shading colour scheme, and country/region configuration. A non-owner
authenticated user accessing these reads would see:
- The owner's companion names (personally identifiable — AD-08 says per-user)
- The owner's shading colour configuration (personalised — AD-07 says per-user)
- Custom category and activity names created by the owner (personalisation)
- Country region-tier configuration (low sensitivity, but no reason to expose)

Deferring read access restriction with "for now" is not acceptable at a gate artefact.
The position for NR-14 is: all admin routes require `requireOwner`. If a future brief
proposes opening specific read routes to shared users (e.g. shared-trip companions
reading category names), that requires an explicit security spec at that time.

**Current state: FAIL** — all admin routes are protected by `requireAuth` only. Any
authenticated user can read and write all admin data.

**Remediation:** Apply `requireOwner` middleware to all admin routes (GET and write).
See ADL-27 for the owner determination model.

**Verification:**
- Contract test: Authenticate as non-owner; confirm GET `/api/admin/categories` → 403.
- Contract test: Authenticate as non-owner; confirm GET `/api/admin/companions` → 403.
- Contract test: Authenticate as non-owner; confirm POST/PATCH to any admin route → 403.
- Code review: Confirm `requireOwner` is applied at the router level in `adminRouter`,
  not per-handler, so it cannot be missed by a future route addition.

---

### HC-05 — Companion and shading config not readable by non-owners

**Requirement:** Companions list and shading config are owner-private (AD-07, AD-08).
HC-05 is subsumed by HC-04 for NR-14 — if HC-04 passes, HC-05 passes by construction.
It is retained as a named item so future scope changes to HC-04 (e.g. opening category
reads) cannot silently reopen companion or shading config reads without an explicit
assessment against HC-05.

**Current state: FAIL** — same root cause as HC-04.

**Verification:**
- HC-04 passing is necessary but not sufficient. Verify specifically:
- Contract test: Authenticate as non-owner; confirm GET `/api/admin/companions` → 403.
- Contract test: Authenticate as non-owner; confirm GET/PATCH to shading config → 403.

---

### HC-06 — City creation is owner-only

**Requirement:** `POST /api/cities` creates a new city in the global cities seed. This is
a privileged write that should not be available to ungranted users.

**Current state: FAIL** — city creation is behind `requireAuth` only.

**Remediation:** Apply owner guard (per ADL-27) to `POST /api/cities`.

**Verification:**
- Contract test: Authenticate as non-owner; confirm POST `/api/cities` returns 403.

---

### HC-07 — Null ownership is fully characterised and eliminated

This item has four independent sub-assessments. All four must pass for HC-07 to pass.

---

#### HC-07a — Are null-owned records a migration artifact or a real business state?

**Assessment:** Null ownership is a migration artifact only. ADL-16 records that
`user_id IS NULL` means "no owner yet" — a transitional state for records created before
the auth system was implemented. There is no user-facing feature that depends on null
ownership. A trip with no owner is not a valid business state; it is a record that was
created before a user could be assigned.

**Implication:** Null-owned records are safe to backfill with the owner's UUID.
No business logic consultation is needed. The backfill is a mechanical operation.
The "null = no owner yet" pattern must be formally retired in the schema (NOT NULL
constraint) so it cannot re-emerge after a future refactor.

**Verification:**
- Code review: Confirm no route handler, service, or test relies on `user_id IS NULL`
  as a meaningful state (as opposed to a test setup artefact).

---

#### HC-07b — Existing null-owned records in the database

**Current state: UNKNOWN** — pre-auth data may exist. This must be audited against
the production database before NR-14 closes.

**Remediation:**

Step 1 — Audit (identify whether backfill is needed):
```sql
SELECT 'trips' AS tbl, COUNT(*) AS null_count FROM trips WHERE user_id IS NULL
UNION ALL
SELECT 'trip_places', COUNT(*) FROM trip_places WHERE user_id IS NULL
UNION ALL
SELECT 'items', COUNT(*) FROM items WHERE user_id IS NULL;
```

Step 2 — Backfill (run only if any count from Step 1 is non-zero):
```sql
-- Backfill trips
UPDATE trips
SET user_id = (SELECT id FROM users WHERE clerk_id = '<OWNER_CLERK_ID>')
WHERE user_id IS NULL;

-- Backfill trip_places
UPDATE trip_places
SET user_id = (SELECT id FROM users WHERE clerk_id = '<OWNER_CLERK_ID>')
WHERE user_id IS NULL;

-- Backfill items
UPDATE items
SET user_id = (SELECT id FROM users WHERE clerk_id = '<OWNER_CLERK_ID>')
WHERE user_id IS NULL;
```

Replace `<OWNER_CLERK_ID>` with the value from `OWNER_CLERK_ID` in `.env.local`
(e.g. `user_2abc...`). This subquery resolves the owner's internal UUID from their
Clerk ID and assigns it to all un-owned rows.

Step 3 — Post-backfill verification: re-run the Step 1 audit query and confirm all
three counts return 0 before proceeding to HC-07c. Do not apply the NOT NULL migration
while any null-owned records remain — the migration will fail with a constraint violation.

**Verification:**
- The Step 1 audit query run against production returns 0 for all three tables.

---

#### HC-07c — Schema allows future null-owned records

**Current state: FAIL** — `trips.user_id`, `trip_places.user_id`, and `items.user_id`
are declared as nullable FK columns in `schema.ts`. No application-layer or DB-level
constraint prevents a future route or migration from inserting a null user_id.

**Remediation:** Change userId column declarations in `schema.ts` from nullable to
`.notNull().references(() => users.id)` on all three tables. Generate and apply a
migration. This requires HC-07b to be resolved first (no nulls in the data before the
NOT NULL constraint is applied).

**Verification:**
- Code review: `schema.ts` shows `.notNull()` on userId in trips, trip_places, items.
- After running `db:generate`, review the generated migration file in
  `src/backend/migrations/` before running `db:migrate`. Confirm the migration contains
  the expected `ALTER TABLE` statements for trips, trip_places, and items — and nothing
  else. Given the known drizzle-kit patch history (ADL-15, patches/drizzle-kit+0.31.9.patch),
  verify the generated SQL does not include unintended table recreations, duplicate index
  creation, or truncated CHECK constraints. Only run `db:migrate` once the generated SQL
  has been reviewed and confirmed correct.
- `db:migrate` completes without error on a DB where HC-07b backfill has already been applied.

---

#### HC-07d — Can current routes surface or mutate null-owned rows?

**Current state: PARTIAL** — repository queries use `eq(trips.userId, userId)` which
will never match a null userId (SQL equality `user_id = ?` does not match NULL). Null-owned
trips are therefore invisible to all scoped reads. However:

- **Mutation risk:** No current write path explicitly sets user_id to NULL. The risk is
  defensive — a future bug or migration that omits userId would silently create invisible
  records with no error. The NOT NULL constraint (HC-07c) is the correct mitigation.
- **Admin/shading risk:** Admin queries and shading queries do not scope by user_id at all
  (separate FAIL items HC-04, HC-03). If a null-owned trip exists, it is counted in shading
  aggregates today. After HC-03 is remediated (shading scoped to userId), null-owned trips
  will be excluded from shading too — which is correct but means the owner's pre-auth
  trips would disappear from the map until HC-07b backfill is done. **Remediation order
  matters: HC-07b backfill must precede HC-03 shading scope fix.**

**Verification:**
- Contract test: Manually insert a trip with user_id = NULL; confirm it does not appear
  in GET `/api/trips` for any authenticated user.
- Code review: Confirm no repository function uses `IS NULL` or `OR user_id IS NULL`
  as an ownership fallback.

---

### HC-08 — BYPASS_AUTH has no path to production

**Requirement:** `BYPASS_AUTH=true` must be impossible in production.

**Current state: PASS** — `server.ts` startup guard throws if `BYPASS_AUTH === 'true'` and
`NODE_ENV === 'production'`.

**Verification:**
- Code review: Confirm startup guard is present in `server.ts` (not `server-test-app.ts`).
- Deployment checklist: `.env.local` not committed; production environment does not set
  `BYPASS_AUTH`.

---

### HC-09 — Authentication failures do not leak information

**Requirement:** 401 responses for missing, invalid, expired, or malformed tokens must
all return the same opaque body. No failure mode must be distinguishable from the outside.

**Current state: PASS** — all authentication failures in `requireAuth` hit the same
catch block and return `401 {"error":"Unauthorized"}`.

**Verification:**
- Contract test: Missing token → 401 `{"error":"Unauthorized"}`
- Contract test: Malformed token → 401 `{"error":"Unauthorized"}`
- Contract test: Expired token → 401 `{"error":"Unauthorized"}`
- Code review: Single catch block with no conditional branching on error type.

---

### HC-10 — Cross-user trip access returns 404 not 403

**Requirement:** Accessing a trip that belongs to a different user must return 404 (not 403)
to prevent confirming the existence of resources the requesting user does not own.

**Current state: PASS** — `tripRepository.findByIdOrThrow(userId, tripId)` throws
`NotFoundError` (→ 404) when the trip exists but is owned by a different user, because
the WHERE clause includes both `trip_id = ?` and `user_id = ?`.

**Verification:**
- Contract test: Authenticate as user-A; request a trip belonging to user-B; confirm 404.

---

### HC-11 — List endpoints return empty arrays for ungranted users

**Requirement:** `GET /api/trips` for a user with no trips (or no grants) must return
`[]` — not a 403, not a count, not any metadata about other users' trips.

**Current state: PASS** — `tripRepository.findAll(userId, filters)` scopes to userId.
A new user with no trips receives `[]`.

**Verification:**
- Contract test: Authenticate as a fresh user with no trips; GET `/api/trips` → `200 []`.

---

### HC-13 — Explicitly-shared role is non-operative and cannot be triggered implicitly

**Requirement:** The explicitly-shared role does not exist in the current implementation
and must not come into existence through any fallback, default, or implicit behaviour.
Any authenticated user who is not the owner is unconditionally treated as
authenticated-but-ungranted. There is no code path, configuration, or data state that
can cause a non-owner user to receive access to owner-controlled resources.

This item exists to make a negative constraint explicit rather than leaving it as an
unstated assumption. Future work that implements companion access (Phase 3+) must be
preceded by a full security spec — it cannot be bootstrapped by relaxing existing controls.

**Current state: PASS** — no grants table exists. There is no mechanism at any layer
(route, repository, query predicate, or schema) by which a non-owner authenticated user
could acquire access to owner resources. The access paths are:
- `tripRepository.findAll(userId)` — scopes strictly to the authenticated userId
- `tripRepository.findByIdOrThrow(userId, tripId)` — 404 if userId doesn't match
- `requireOwner` (pending ADL-27) — will block admin writes unconditionally for non-owners

No fallback exists that widens access (e.g. "if no owner is set, allow all" — the startup
guard and owner seeding prevent this). The `findOrCreateByClerkId` call creates a user
record for any Clerk token, but user record creation does not grant access to any resource.

**Verification:**
- Code review: Confirm no `OR user_id IS NULL` clause appears in any trip/place/item query.
- Code review: Confirm no route handler falls back to returning unowned resources when
  userId-scoped lookup returns empty.
- Contract test: Authenticate as a second (non-owner) user; confirm GET `/api/trips` → `200 []`,
  GET `/api/trips/:ownerTripId` → `404`, POST `/api/admin/categories` → `403` (after HC-04 lands).
- Code review (ongoing): Any future PR that adds a grants table or expands the access model
  must be preceded by a security spec. This checklist item is the gate — it must be
  explicitly re-evaluated before any companion access work is dispatched.

---

### HC-12 — Geo static files contain no user data

**Requirement:** `/geo/*` static files served without authentication must contain only
publicly available geographic boundary data — no user trip data, no user metadata.

**Current state: PASS** — `/geo` directory contains GeoJSON boundary files sourced from
public geographic datasets. Server generates no user-specific content in this directory.

**Verification:**
- Code review: `/geo` directory contains only `.geojson` files with country/region polygon
  geometry.

---

## 7. NR-14 Gate Definition

NR-14 PASSES when all of the following are GREEN:

| Item | Requirement | Current |
|---|---|---|
| HC-01 | Clerk JWKS reachable in local dev | FAIL |
| HC-02 | JWT issuer + audience validated | PARTIAL |
| HC-03 | Map shading user-scoped | FAIL |
| HC-04 | Admin writes owner-only | FAIL |
| HC-05 | Companion + shading config not leaked | FAIL |
| HC-06 | City creation owner-only | FAIL |
| HC-07 | No null userId records | PARTIAL |
| HC-08 | BYPASS_AUTH blocked in production | PASS |
| HC-09 | Auth failures opaque | PASS |
| HC-10 | Cross-user trip → 404 | PASS |
| HC-11 | List endpoints scoped | PASS |
| HC-12 | Geo files are public data only | PASS |
| HC-13 | Explicitly-shared role non-operative (no implicit fallback) | PASS |

**NR-14 status: BLOCKED** — 4 FAIL, 2 PARTIAL

---

## 8. ADL Decisions Required

### ADL-27 — Admin panel role model

Required before HC-04, HC-05, HC-06 can be remediated. See `ADL-27-admin-role-model.md`.

### ADL amendment — Retire ADL-16 null userId allowance

ADL-16 recorded that `user_id IS NULL` means "no owner yet" for pre-auth seed data.
This null pattern must be formally retired before NR-14. A migration must backfill all
null rows and make the columns NOT NULL. The ADL amendment should be recorded as a note
on ADL-16 rather than a new ADL.

---

## 9. Future Requirements Security Review

### §5.10 Admin and Settings Panel (AD-01–09)

| Item | Security question that must be answered before spec |
|---|---|
| AD-07 (per-user shading config) | Schema extension required: add user_id to map_shading_config or create a per-user override table. Decision: new table (shading_config_overrides with user_id) vs user_id column on existing table. Must be decided before any agent implements AD-07. |
| AD-08 (per-user companions) | Same pattern: add user_id to companions or create a per-user companions table. Must be decided before any agent implements AD-08. |
| AD-09 (global categories/activities, owner-only deactivation) | "Only deactivated by the app owner" must be specified at the route level. Who is the owner? Determined by ADL-27. |

### §6 Non-Functional Requirements (NF-05–08)

| Item | Security question |
|---|---|
| NF-05 (hosted web app) | Public URL means any Clerk user can sign in. The authenticated-but-ungranted role is no longer theoretical — it must be enforced before public deployment. |
| NF-06 (iOS) | Same auth model (Clerk JWT). The same `requireAuth` middleware applies. No new security decision needed, but the owner determination model (ADL-27) must be compatible with a mobile client. |
| NF-07 (trip companion access) | This is the highest-risk future feature. It requires: (a) a grants table (`trip_grants: trip_id, grantee_user_id, access_level`), (b) repository-level grant checks on every trip/place/item read for non-owners, (c) a response minimisation policy for resources the grantee cannot see within a shared trip. No implementation may start without a full security spec for this feature. |

### §9 Future Features (Phase 3+)

| Feature | Security question |
|---|---|
| Recommendation sharing via link | A share link bypasses Clerk auth — it is a bearer credential. Must specify: link entropy (min 128 bits), expiry (should be limited), scope (place-level only — no trip metadata), what happens on link revocation. |
| Trip companion access — invite flow | See NF-07 above. Additionally: invite links must be single-use and time-limited. A user who accepts an invite must have the grant created atomically with invite consumption — no TOCTOU window. |
| Companion endorsements | Companions can annotate other users' places. This is a write from a non-owner into an owner's trip. Requires explicit write-grant scoping separate from the read grant. |
| Companion invite model (linked accounts) | An unlinked placeholder companion being linked to a real user account must not grant that user any access beyond what was explicitly shared. The linking step must be owner-triggered, not self-service by the invitee. |

### NR-09–13 (deferred multi-user requirements)

These requirements must not be implemented without a full security spec analogous to this
document produced beforehand. The questions in NF-07 and §9 above are the mandatory inputs
to any NR-09–13 brief.

---

## Revision history

| Date | Change |
|---|---|
| 2026-03-23 | Initial issue — current state assessment included |

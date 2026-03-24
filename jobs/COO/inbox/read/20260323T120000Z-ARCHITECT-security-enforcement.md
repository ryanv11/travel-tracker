# ARCHITECT → COO: Security Enforcement Mechanisms

**Date:** 2026-03-23
**From:** Architect
**To:** COO inbox
**ADL:** ADL-29 (appended to `jobs/architect/tech/20260307-architecture-decisions-log.md`)
**Implements:** OP-06 / NR-14 — ongoing enforcement for new work

---

## Summary

Two CI-gated enforcement layers are specified here. Neither is implemented — these are specs for implementing agents:

- **Deliverable 1** → Backend/QA agent implements `src/backend/routes/__tests__/security.access-matrix.test.ts`
- **Deliverable 2** → Backend agent implements `.semgrep/security.yml` and updates `.github/workflows/security.yml`
- **ADL-29** → appended to `jobs/architect/tech/20260307-architecture-decisions-log.md` (done)

---

## Deliverable 1: Security Regression Test Suite Spec

### File to create

`src/backend/routes/__tests__/security.access-matrix.test.ts`

### Setup pattern

Follow the exact pattern from `src/backend/routes/__tests__/owner-access.test.ts`:

- In-memory libSQL database created fresh per test (`createTestDb()` with all DDL inline)
- `vi.mock('../../middleware/auth.js', ...)` — the mock sets `req.user` using a module-level `mockIsOwner` variable and a `mockUserId` variable, so individual tests can control which user is active
- `vi.mock('../../db/index.js', ...)` — `getDb()` returns the in-memory instance
- Mock the shading service to avoid DB dependency: `vi.mock('../../services/shading.service.js', ...)`
- `import app from '../../server-test-app.js'` and `import supertest from 'supertest'` (dynamic import after mocks, same pattern as owner-access.test.ts)

### Two test users needed

The test setup must define two distinct user identities:

```
USER_A_ID = 'user-a-00000000-0000-0000-0000-000000000000'  (owner)
USER_B_ID = 'user-b-00000000-0000-0000-0000-000000000000'  (non-owner, different user)
```

The mock auth middleware must support switching `activeUserId` and `mockIsOwner` between tests. Use module-level `let` variables, reset in `beforeEach`.

For the unauthenticated tests (Part A), the mock middleware must support a `mockAuthEnabled = false` mode where it responds 401 and calls no next(). Alternatively, make a separate supertest request with no Authorization header against the real server (requires BYPASS_AUTH=false) — but since contract tests run with BYPASS_AUTH=true, the cleanest approach is to **not** use the mock for unauthenticated tests and instead test the `requireAuth` middleware directly with no token in a separate describe block that bypasses the mock. See implementation note below.

**Implementation note on unauthenticated tests:** The BYPASS_AUTH pattern makes it impossible to test 401 behaviour through the mocked auth — the bypass always provides a user. There are two viable approaches:

1. **Preferred:** Add a third mock mode `mockAuthEnabled = false` that makes the mock middleware call `res.status(401).json({ error: 'Unauthorized' })` instead of calling `next()`. This is not testing real JWT behaviour but validates the route-level structure assumption.
2. **Alternative:** Test `requireAuth` itself in a dedicated unit test rather than via supertest. The unauthenticated 401 tests then live in `auth.middleware.test.ts`, not in the access matrix test.

The implementing agent must choose option 1 or 2 and note the choice in a comment. The test case table below is written for option 1.

---

### Test case table

Each row is one `it(...)` block. Group into `describe` blocks by Part (A/B/C).

#### Part A — Unauthenticated rejection (SE-04 / SE-05)

*All `/api/*` routes must return 401 with no token. Note: with mock option 1, these verify the structural assumption that requireAuth fires before handlers; they do not test real JWT validation.*

| Route | Method | Scenario | Expected status |
|---|---|---|---|
| `/api/trips` | GET | no auth token (mockAuthEnabled=false) | 401 |
| `/api/trips` | POST | no auth token | 401 |
| `/api/trips/1` | GET | no auth token | 401 |
| `/api/trips/1` | PATCH | no auth token | 401 |
| `/api/trips/1` | DELETE | no auth token | 401 |
| `/api/trips/1/places` | GET | no auth token | 401 |
| `/api/trips/1/places` | POST | no auth token | 401 |
| `/api/trips/1/items` | GET | no auth token | 401 |
| `/api/trips/1/items` | POST | no auth token | 401 |
| `/api/cities` | GET | no auth token | 401 |
| `/api/cities` | POST | no auth token | 401 |
| `/api/cities/1/carry-forward` | GET | no auth token | 401 |
| `/api/cities/1/items` | GET | no auth token | 401 |
| `/api/map/shading` | GET | no auth token | 401 |
| `/api/map/shading/config` | GET | no auth token | 401 |
| `/api/map/shading/config/visited` | PATCH | no auth token | 401 |
| `/api/map/shading/countries/US` | GET | no auth token | 401 |
| `/api/map/shading/regions/US` | GET | no auth token | 401 |
| `/api/admin/categories` | GET | no auth token | 401 |
| `/api/admin/categories` | POST | no auth token | 401 |
| `/api/admin/activities` | GET | no auth token | 401 |
| `/api/admin/activities` | POST | no auth token | 401 |
| `/api/admin/companions` | GET | no auth token | 401 |
| `/api/admin/companions` | POST | no auth token | 401 |
| `/api/admin/countries` | GET | no auth token | 401 |
| `/api/admin/countries/US` | PATCH | no auth token | 401 |
| `/api/admin/countries/US/regions` | GET | no auth token | 401 |
| `/api/admin/countries/US/regions` | POST | no auth token | 401 |

**Exempt from Part A (accepted public routes):**

| Route | Reason |
|---|---|
| `/health` | Liveness probe — intentionally public (OP-06 §1.1) |
| `/geo/*` | Static GeoJSON — accepted risk documented in OP-06 §1.2 |

---

#### Part B — Owner-only routes: non-owner receives 403 (SE-03)

*mockIsOwner = 0, USER_A_ID active. Seed USER_A in DB with isOwner=0.*

| Route | Method | Scenario | Expected status | Expected body |
|---|---|---|---|---|
| `/api/admin/categories` | GET | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/categories` | POST | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/categories/1` | PATCH | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/categories/1` | DELETE | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/activities` | GET | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/activities` | POST | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/activities/1` | PATCH | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/activities/1` | DELETE | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/companions` | GET | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/companions` | POST | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/companions/1` | PATCH | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/companions/1` | DELETE | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/countries` | GET | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/countries/US` | PATCH | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/countries/US/regions` | GET | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/countries/US/regions` | POST | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/admin/countries/US/regions/1` | PATCH | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/map/shading` | GET | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/map/shading/config` | GET | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/map/shading/config/visited` | PATCH | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |
| `/api/cities` | POST | authenticated, isOwner=0 | 403 | `{ error: 'Forbidden' }` |

**Note on admin/active sub-routes:** `GET /api/admin/categories/active`, `GET /api/admin/activities/active`, and `GET /api/admin/companions/active` are sub-paths mounted under the same router with `adminRouter.use(requireOwner)`. They must also return 403 for non-owner. Add three additional cases:

| Route | Method | Scenario | Expected status |
|---|---|---|---|
| `/api/admin/categories/active` | GET | authenticated, isOwner=0 | 403 |
| `/api/admin/activities/active` | GET | authenticated, isOwner=0 | 403 |
| `/api/admin/companions/active` | GET | authenticated, isOwner=0 | 403 |

---

#### Part C — Cross-user data isolation (SE-02)

*Two users seeded in DB: USER_A (owner, has trips/data) and USER_B (non-owner, no trips). Tests run as USER_B and verify USER_A's data is not visible.*

Seed data required for Part C:
- USER_A: 1 trip (`trip_a_id`) with `status='planning'`, `user_id = USER_A_ID`
- USER_B: no trips
- Both users seeded in the `users` table

| Route | Method | Active user | Scenario | Expected status | Expected behaviour |
|---|---|---|---|---|---|
| `/api/trips` | GET | USER_B | List trips as user B | 200 | Response is an empty array — does NOT contain USER_A's trip |
| `/api/trips/:tripAId` | GET | USER_B | Fetch USER_A's trip by ID | 404 | `{ error: 'Not found' }` — opaque (SE-05, not 403) |
| `/api/trips/:tripAId` | PATCH | USER_B | Update USER_A's trip | 404 | `{ error: 'Not found' }` |
| `/api/trips/:tripAId` | DELETE | USER_B | Delete USER_A's trip | 404 | `{ error: 'Not found' }` |
| `/api/map/shading` | GET | USER_B (isOwner=0) | Map shading for non-owner | 403 | Non-owner cannot see shading. This test verifies the owner gate is in place. A separate integration test (out of scope for this file) would verify scoping for the owner themselves. |

**Note on map shading isolation:** Full shading scoping (SE-02) is verified at the service/repository layer, not purely at the route contract level. The contract test verifies the route-level gate (403 for non-owner). A deeper test verifying that `getAllCountryShading()` only returns data for the authenticated user's trips belongs in a service unit test (`shading.service.test.ts`) — this is out of scope for the access matrix contract test.

**Note on items and places isolation:** Items and places are accessed only via `/api/trips/:tripId/...` — the trip ownership check gates all sub-resource access. `GET /api/trips/:tripAId` returning 404 to USER_B is sufficient to establish that all nested routes under that trip are also inaccessible. No separate item/place cross-user tests are needed in this file.

---

### Maintenance note for implementing agent

This test file is a living access matrix. When a new route is added to the backend:
1. Add a Part A row (unauthenticated 401)
2. If the route requires `requireOwner`, add a Part B row (non-owner 403)
3. If the route accesses user-owned data, verify the cross-user case in Part C or the relevant repository unit test

The file header comment must state this obligation explicitly.

---

## Deliverable 2: Custom Semgrep Rules Spec

### File to create

`.semgrep/security.yml`

### CI integration

In `.github/workflows/security.yml`, add `--config .semgrep/security.yml` to the existing `semgrep` run step:

```yaml
- name: Semgrep SAST
  run: |
    semgrep \
      --config p/typescript \
      --config p/react \
      --config p/nodejs \
      --config p/owasp-top-ten \
      --config .semgrep/security.yml \
      --error \
      --quiet
```

### Rule 1 — Express route without auth middleware

**Intent:** Flag any `router.get/post/put/patch/delete(...)` call in `src/backend/routes/` where the route file does not apply `requireAuth` or `requireOwner` in the middleware chain. This catches a new route file that forgets auth entirely.

**Limitation:** Semgrep cannot reliably reason about router-level `app.use('/api/', requireAuth)` applied in `server.ts` — it only sees individual files. The rule must therefore focus on detecting route files that have zero reference to auth middleware (either via import or direct call). Files that import neither `requireAuth` nor `requireOwner` are the primary target.

**False positive mitigation:** The `/geo` static route and `/health` are not in `src/backend/routes/` — they are defined in `server.ts`. Route files in `src/backend/routes/` are always behind `app.use('/api/', requireAuth)`. So this rule does not need to fire on `server.ts`. The rule should be scoped to `src/backend/routes/*.ts` only, excluding `__tests__/`.

**Suppression comment:** `// nosemgrep: travel-tracker.express-route-no-auth -- reason: <justification>`

**Rule YAML:**

```yaml
rules:
  - id: express-route-no-auth
    patterns:
      - pattern: |
          $ROUTER.$METHOD($PATH, ...)
      - pattern-not-inside: |
          import { requireAuth } from ...
      - pattern-not-inside: |
          import { requireOwner } from ...
    message: >
      Express route handler in src/backend/routes/ with no reference to requireAuth or
      requireOwner. All routes under /api/ must be protected. If this route is legitimately
      public, add a nosemgrep suppression with justification.
    languages: [typescript]
    severity: ERROR
    paths:
      include:
        - src/backend/routes/*.ts
      exclude:
        - src/backend/routes/__tests__/**
```

**Known limitation to document in the rule comment:** This rule fires at the file level (does any file import auth middleware), not at the individual route level. A file that imports `requireAuth` but only applies it to some routes will not be caught. Rule 2 (repository scoping) is the backstop for that case. A future rule improvement could use `metavariable-pattern` to check that each `router.$METHOD` call includes an auth middleware argument — but this requires more complex Semgrep patterns and risks false positives on router-level `router.use(requireOwner)` patterns. The current file-level check is the safer starting point.

---

### Rule 2 — Drizzle query on user-owned table without userId scoping

**Intent:** Flag `db.select().from(trips)`, `db.select().from(tripPlaces)`, or `db.select().from(items)` calls that do not chain a `.where(...)` containing `userId`. This catches service or route code that queries user-owned tables without scoping to the authenticated user.

**Limitation — shading service JOIN pattern:** `shading.service.ts` joins the `trips` table using `userId` in a JOIN condition rather than a standalone `.where(eq(trips.userId, ...))`. Semgrep pattern matching does not reliably distinguish WHERE from JOIN. The shading service should carry a suppression comment on its `db.select().from(trips)` calls:

```typescript
// nosemgrep: travel-tracker.drizzle-unscoped-user-table -- reason: userId applied via JOIN condition in shading service, not WHERE clause
```

**Limitation — admin queries:** Admin tables (`tripCategories`, `activities`, `companions`, etc.) have no `user_id` column. They are global seed tables (per ADL-27 / AD-09) and legitimately have no userId scope. This rule only targets `trips`, `tripPlaces`, and `items`. Admin table queries are out of scope for this rule.

**Rule YAML:**

```yaml
  - id: drizzle-unscoped-user-table
    patterns:
      - pattern: |
          $DB.select(...).from($TABLE).$METHOD(...)
      - metavariable-pattern:
          metavariable: $TABLE
          patterns:
            - pattern-either:
                - pattern: trips
                - pattern: tripPlaces
                - pattern: items
      - pattern-not: |
          $DB.select(...).from($TABLE).where(...userId...)
      - pattern-not: |
          $DB.select(...).from($TABLE).$CHAIN.where(...userId...)
    message: >
      Drizzle query on user-owned table ($TABLE) without userId scoping detected.
      Add .where(eq($TABLE.userId, userId)) or suppress with nosemgrep if userId
      is applied via JOIN condition.
    languages: [typescript]
    severity: WARNING
    paths:
      include:
        - src/backend/**/*.ts
      exclude:
        - src/backend/routes/__tests__/**
        - src/backend/db/**
        - src/backend/migrations/**
```

**Severity note:** Rule 2 is WARNING (not ERROR) because the pattern matching is imprecise and false positives are more likely (e.g. the shading JOIN case, or aggregate count queries). The implementing agent should validate the rule against the current codebase and confirm zero false positives before setting to ERROR. If too many legitimate exceptions surface, document them and keep at WARNING — the human code reviewer is the backstop.

**Implementation note:** Semgrep's metavariable-pattern matching for Drizzle's fluent API chains is not guaranteed to work perfectly with the patterns above — the chained method call pattern (`$DB.select().from($TABLE).where(...)`) may require multiple pattern variants to handle intermediate chaining (e.g. `.select({...}).from(trips).innerJoin(...).where(...)`). The implementing agent must test the rule with `semgrep --config .semgrep/security.yml src/backend/` and iterate on the pattern until it catches the intended cases without excessive false positives. The patterns above are starting points, not guaranteed-working Semgrep YAML.

---

### Full `.semgrep/security.yml` structure

```yaml
# Travel Tracker — Custom Semgrep Rules
# ADL-29: Security enforcement for OP-06 compliance
#
# These rules enforce the access control model established by ADL-27 and OP-06.
# Run automatically as part of the security.yml CI workflow alongside generic rulesets.
#
# Maintenance: Update rules when new route files are added or when the auth middleware
# pattern changes. See ADL-29 for rationale.
#
# Suppression format:
#   // nosemgrep: travel-tracker.<rule-id> -- reason: <justification>

rules:
  - id: express-route-no-auth
    # ... (as above)

  - id: drizzle-unscoped-user-table
    # ... (as above)
```

---

## Gaps and ambiguities for implementing agents

### Contract test file

1. **Unauthenticated test approach (Part A):** Must choose between mock option 1 (mock returns 401) or option 2 (separate auth middleware unit test). Either is acceptable — document choice in the test file header comment.

2. **`/api/map/shading/countries/:countryCode` and `/api/map/shading/regions/:countryCode` auth coverage:** These routes do NOT have `requireOwner` — they are authenticated-but-not-owner-restricted. Any authenticated user can access them. They should appear in Part A (401 when unauthenticated) but NOT in Part B. This is intentional per the access matrix. The test file comment should note this.

3. **`PATCH /api/cities/:id` is not owner-only:** It is authenticated (behind `app.use('/api/', requireAuth)`) but not behind `requireOwner`. Any authenticated user can patch a city. This may be a gap — the implementing agent should flag this to the COO for review rather than silently adding a test that says 200. The route is currently not in ADL-27's `requireOwner` list, but the rationale for allowing non-owner city patches is not documented. Recommend raising a GitHub issue.

4. **`GET /api/cities/:id/carry-forward` and `GET /api/cities/:id/items` scoping:** These queries use `req.user!.id` in the WHERE clause — they are correctly scoped. No cross-user isolation test is needed beyond confirming the query structure. The implementing agent can add a simple smoke test confirming USER_B gets an empty array for a city whose items belong to USER_A.

5. **`DELETE /api/admin/countries/:countryCode/regions/:regionId`:** The ADL-27 route list mentions `DELETE /api/admin/regions/:id` as a protected route. Looking at `admin.ts`, the actual route is `DELETE /api/admin/countries/:countryCode/regions/:regionId` (regions are nested under countries). The Part B test should use the correct path. The implementing agent must check the actual Express route registration in `admin.ts` before writing the test.

### Semgrep rules

6. **Rule 2 pattern viability:** The Drizzle fluent API chain pattern is the hardest thing to match with Semgrep's structural pattern matching. If the implementing agent cannot get Rule 2 working reliably, downgrade it to a documentation note and raise a GitHub issue. Rule 1 (file-level auth import check) is higher value and should not be blocked by Rule 2 difficulties.

7. **Semgrep version compatibility:** The `metavariable-pattern` feature requires Semgrep >= 0.60. The `semgrep/semgrep` Docker image in `security.yml` uses `latest` — confirm version supports this feature before relying on it.

8. **Rule 1 scope:** The current rule fires if a file in `src/backend/routes/` does not import either auth middleware. `items-helper.ts` and `trip-countries.ts` are route support files that are mounted via `tripsRouter` — they do not independently import auth middleware. The rule needs to either exclude helper files (by naming convention or a `paths.exclude` list) or the implementing agent must add `nosemgrep` suppressions to those files with a note that auth is applied at the parent router level.

---

## ADL-29 status

Appended to `jobs/architect/tech/20260307-architecture-decisions-log.md`. No other files changed by this brief.

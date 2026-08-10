# QUAL-43 Stage 1 — Cross-tenant row-level isolation matrix (ADL-53 §5.1)

**Tracker:** QUAL-43 (design-reflection R1, Stage 1) · **BRD:** n/a (test coverage, no requirement)
**Branch:** `feat/qual43-stage1-crosstenant-matrix` (off `main`) · **Date:** 2026-08-10
**Design:** `jobs/architect/tech/ADL-53-userid-scoping-chokepoint.md` (on
`origin/feat/adl53-userid-scoping-chokepoint`, not yet merged to `main`) §5.1 / §6 Stage 1 / §R2 F4

## What this is

The OP-35 ATDD red bar for the ADL-53 userId-scoping chokepoint build. Extends
`src/backend/routes/__tests__/security.access-matrix.test.ts` with a new **Part F**, naming
every §5.1 user-owned `getDb()` path by file:line and asserting the F4 expected shape per
endpoint class: **empty result** for cross-tenant reads, **404** (never 403, opaque per SE-05)
for cross-tenant mutations. This is the regression net Stages 0/2/3/4 (Backend) must stay
green against, and must go RED if any relocation drops a predicate or a prior ownership
assertion.

## §5.1 path → test mapping

| §5.1 path | Route | Class (F4) | Test |
|---|---|---|---|
| `trips.ts:198/223` (trip-detail items) | `GET /api/trips/:id` | predicate-composed read | "trip-detail items are scoped to the caller, not just the trip/place" |
| `places.ts:231/253` (carry-forward, SEC-02) | `POST /api/trips/:tripId/places/:placeId/carry-forward` | assertion-guarded (trip/place) **then** predicate-composed (source items) | two tests: cross-tenant trip/place → 404; SEC-02 cross-tenant item id → 400 |
| `places.ts:289` (activity tag) | `POST /api/trips/:tripId/places/:placeId/activities` | assertion-guarded | cross-tenant place → 404 |
| `places.ts:352` (activity untag) | `DELETE /api/trips/:tripId/places/:placeId/activities/:activityId` | assertion-guarded | cross-tenant place → 404 + sanity that the tag was NOT removed |
| `cities.ts:703/748` (city carry-forward, IT-07) | `GET /api/cities/:id/carry-forward` | predicate-composed read | cross-tenant caller → empty list, + positive control |
| `cities.ts:766/792` (city items, SEC-01) | `GET /api/cities/:id/items` | predicate-composed read | cross-tenant caller → empty list, + positive control |

`items-helper.ts:87` (`fetchItemsWithExtensions`) has no route of its own — it is exercised
transitively via the `trips.ts:198` and both `cities.ts` tests above (its three call sites).
`trips.ts:207-216`'s `tripPlaceActivitiesMap` join has no `userId` column and inherits
isolation from the prior `tripRepository.findByIdOrThrow` ownership check (ADL-53 F2:
"assertion-guarded, composes nothing") — `placeIds` fed into that join are already scoped to
the caller's own trip by the time it runs, so there is no independent cross-tenant vector to
construct a red assertion against. This is a structural reading of the code (findByIdOrThrow
throws before the join ever runs for a non-owner), not a coverage gap — noted in-file too.

## Real-libSQL / two-user seeding (non-negotiable per the brief)

Reused the file's existing harness rather than building a parallel one:
- `testDb` comes from `createTestDb()` (`repositories/__tests__/test-db.ts`) — a real
  `@libsql/client` `:memory:` connection with `PRAGMA foreign_keys = ON` and the schema
  produced by **replaying the real migration files** (not a hand-written DDL copy), so the
  partial unique indexes (`uniq_cities_osm_ref`, `uniq_cities_pending_per_creator`) and every
  FK are live. `getDb()` is mocked only at the "which instance do I hand back" plumbing level
  (`vi.mock('../../db/index.js', ...)` already present in the file) — the SQL engine itself is
  real SQLite via libSQL, not an in-memory JS mock of the ORM.
- Every Part F test seeds **two distinct real `users` rows** (`USER_A_ID`/`USER_B_ID`, the
  file's existing constants) via the existing `seedUser` helper, and switches
  `mockUserId`/`mockIsOwner` between calls to authenticate as each in turn.
- New seed helpers added (`seedCity`, `seedTripPlace`, `seedItem`, `seedActivity`) follow the
  same direct-schema-insert pattern as the file's existing `seedTrip`/`seedCountry`.

## Anti-vacuous verification (mutation-tested, not just reasoned about)

Per the brief's requirement to prove at least one assertion "genuinely fires by construction,"
two of the sharpest assertions were mutation-tested by temporarily editing the production
predicate they exist to guard, confirming a clean AssertionError (not a vacuous pass), then
reverting:

1. **`trips.ts:223`** — removed `drizzleEq(items.userId, userId)` from `tripItemsCondition`,
   leaving only the `tripId` filter. Result: the "trip-detail items are scoped to the caller"
   test failed with `expected [2, 1] to not include 2` — the rogue USER_B item leaked into
   USER_A's own trip-detail view, exactly the silent cross-tenant read the predicate exists to
   prevent.
2. **`places.ts:253`** — removed `eq(items.userId, userId)` from the SEC-02 source-item
   ownership check, leaving only `inArray(items.id, sourceItemIds)`. Result: the SEC-02 test
   failed with `expected 201 to be 400` — USER_B's carry-forward call, which should reject an
   item it doesn't own, instead succeeded and would have duplicated USER_A's item onto USER_B's
   trip.

Both mutations were reverted immediately after observing the red failure;
`git diff --stat` against the committed state showed only the test file changed before commit
— no production code shipped in this PR. Full backend suite (808 tests) and `type:check:all`
confirmed green again after reverting.

## Result: current main is GREEN on every §5.1 path (expected, not a finding of "nothing to do")

All 8 new Part F assertions pass on current `main` — consistent with ADL-53 F5 ("no active
cross-tenant hole ... isolation holds by convention today, not structurally"). This is the
expected Stage 1 outcome per the brief: the matrix now stands as the regression net for
Stages 0/2/3/4's relocations, not evidence the relocation work is unnecessary. No RED path on
current main to report to the COO as a latent gap.

## Verification run

- `npm run test:backend` — 808/808 passed (51 test files), including the new Part F (8 tests)
  inside the now-70-test `security.access-matrix.test.ts`.
- `npm run type:check:backend` / `type:check:all` — clean.
- `npm run check` (Biome) — clean (one pre-existing formatting nit in the new code, fixed via
  `biome format --write`; 5 pre-existing INFO-level notices elsewhere, unrelated to this change).
- `npm run status:check` / `npm run tracker:check` — both OK, no doc/tracker drift introduced.
- `npm audit` was run as part of `npm install` in the fresh worktree: 6 MODERATE severity
  advisories reported (no HIGH/CRITICAL). Reported to COO per frameworks.txt rule 20 — not a
  package change made by this thread, and MODERATE does not block thread closure; COO decides
  disposition.

## Scope discipline honoured

No `scope.ts`, no repository/route relocation, no production code shipped — this thread is the
test matrix only, as scoped. The two production-file edits described above were mutation-test
probes, reverted before commit (confirmed via `git diff --stat` showing zero production changes
in the final commit).

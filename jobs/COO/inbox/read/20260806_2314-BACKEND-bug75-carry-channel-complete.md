# BACKEND — BUG-75 city-identity carry channel — COMPLETE

**Branch:** `feat/bug75-backend` (off `origin/release/bug75-city-identity`), pushed. **No PR opened** per
brief — COO merges into the release branch.
**Commit:** `9d69e00` — "feat(BUG-75): backend city-identity carry channel (F1/M-A/M-B/M1-F3)"
**Spec:** `jobs/architect/tech/20260806-BUG75-round4-identity-design-v3.md` (v3) +
`…-v3-review.md` (delta review, SOUND-WITH-CORRECTIONS) + `20260806-BUG75-build-brief.md`.

## What shipped

1. **`nominatim-client.ts`** — parsed `osm_type`/`osm_id`/`address.county` (with `state_district`
   fallback) into `RawNominatimResult` + `NominatimCandidate` + `parseCandidate`. Extracted a shared
   `enqueue()` chokepoint (m-2 hardening) that both `nominatimSearch` and the new `nominatimLookup`
   (`/lookup?osm_ids=`) call — one physical code path owns `chain`/`lastRequestAt`, so the second
   endpoint cannot become a second, uncoordinated egress site.
2. **`geocode.ts`** — the `GET /api/geocode` proxy now surfaces `osm_type`/`osm_id` on each candidate
   (`display_name` was already there).
3. **`cities.schemas.ts`** — `CreateCitySchema` accepts an optional carried
   `{osm_type, osm_id, display_name}` (`region_id` already existed), refined to require
   `osm_type`/`osm_id` together or not at all. Still `.strict()` — no client coordinates accepted.
4. **`geocoding.service.ts`**:
   - `resolveByOsmId(osmType, osmId)` (F1) — canonicalize-by-id via `/lookup`, candidate-or-null.
   - `resolveCity`'s carried-ref branch reads the row's stored `osm_type`/`osm_id` and canonicalizes
     deterministically via `/lookup` instead of the constrained name search; a `200`-empty result
     (stale/reclassified OSM object) is **terminal `unresolvable`** (M-B), distinct from
     disabled/error (which stay pending, unchanged D10 semantics).
   - **M-A**: every resolve — carried or name-search — now stamps the winning candidate's
     `osm_type`/`osm_id`/`display_name` (restores v2 §7 rule 2c, which v3's delta had dropped per
     the review's M-A finding). Without this, two users resolving the same non-ambiguous city land
     as duplicate NULL-`osm_id` rows once the global name/country/region unique index is gone.
   - `commitResolvedOrMerge` / `mergeIntoWinner` (M1) — a resolve that collides with an
     already-resolved twin under `uniq_cities_osm_ref` repoints `trip_places` from the loser onto the
     winner and deletes the loser, converging to one row.
5. **`cities.ts`**:
   - A carried `osm_type`/`osm_id` on `POST /api/cities` bypasses the legacy
     (name, country, region) find-or-create entirely (B2) via `createOrReuseCarriedCity`: reuse an
     existing row carrying that exact ref (no extra `/lookup` call); else canonicalize by ID and
     INSERT resolved; else (offline/error/stale-object alike, M-B) INSERT pending carrying the ref —
     the standing 15-minute queue's `resolveCity` is what later distinguishes offline (retries) from
     a confirmed-stale object (terminal).
   - Both create-path INSERTs — the legacy resolved INSERT (M-A stamped) and the legacy pending
     INSERT, plus both carried-branch INSERTs — go through `insertCityOrReuse`'s caught-unique-
     violation → re-select-and-reuse pattern (F3).
   - New `src/backend/services/db-errors.ts`: `isUniqueViolation(err)`, checking both
     `err.code` and `err.cause.code` for `'SQLITE_CONSTRAINT_UNIQUE'` — verified with two live probes
     (a raw `@libsql/client` insert throws the code directly; the same violation through
     `drizzle-orm/libsql`'s `db.insert()` wraps it in `DrizzleQueryError` with the real code one level
     down at `.cause.code`).

## Deliberate deviation from the brief's literal wording (declared, OP-28-adjacent)

The brief and design describe M1/F3 as "transaction + caught unique-violation." I did **not** wrap
these in `db.transaction()`. A live probe against this project's libSQL `:memory:` test client
(the same one every backend test uses) showed `db.transaction()` **nulls out the client's internal
connection** — a query issued after the transaction completes reports "no such table" on a client
that had the table a moment before. This is the exact finding already recorded in
`repositories/trips.ts`'s comment ("`db.transaction()` nulls out the client's internal `#db`
reference, causing subsequent queries on the same client to open a fresh empty connection") — I
reproduced it independently before touching this file, so it's a two-probe-confirmed environment
landmine, not a guess. Using it here would have broken every sequential-POST test in the target
files (several tests do two `POST`s against the same `testDb` in one test).

The correctness argument: a single `INSERT`/`UPDATE` is already atomic w.r.t. a unique index in
SQLite — there is no partial-write state a wrapping transaction would additionally protect against.
The catch-and-reselect/merge pattern I implemented is the same *outcome* the design specifies
(concurrent same-place adds converge to one row, never a 500); it just doesn't route through the
`db.transaction()` API that would break the test harness. Flagging this explicitly per CLAUDE.md's
negative-findings and OP-28 spirit rather than silently deviating.

## Security checklist (CLAUDE.md, mandatory)

No new Express routes were added — `POST /api/cities` was modified in place (a carried-pick branch
was added inside the existing handler), and no other route changed.

1. **Auth middleware** — `POST /api/cities` remains gated only by the global `requireAuth`
   (`app.use('/api/', requireAuth)`), unchanged: city **create** stays non-owner-addable (GE-16),
   confirmed by the existing + new access tests (`access: a NON-owner CAN create a city` passes).
   `PATCH /api/cities/:id` / `DELETE` are untouched and remain `requireOwner`
   (`access: a NON-owner PATCH ... is still 403` passes).
2. **userId scoping** — cities are global reference data (ADL-46's existing model), not per-user
   data, so the existing `createdByUserId`-based *containment* (not access-scoping) logic is
   unchanged. The one new cross-cutting query, `mergeIntoWinner`'s `trip_places` repoint
   (`geocoding.service.ts`), is **not** a per-request user-data read — it's internal catalog-merge
   bookkeeping triggered when two duplicate city rows collapse into one, and it must touch every
   `trip_places` row referencing the loser city regardless of which user owns that trip (otherwise
   their trip would dangle a reference to a row about to be deleted). Same class as the existing
   creator-blind `findOrUpgradeCity` step 1 — global reference-table plumbing, not a user-data
   access-control boundary.
3. **New FK columns** — none added. `osm_type`/`osm_id`/`display_name` are Database's columns
   (migrations 0016/0017, already merged into the release branch); I did not touch `schema.ts` or
   `migrations/`.

## Target-test status

- `src/backend/routes/__tests__/cities.identity-carry.test.ts` — **19/19 green**, unmodified.
- `src/backend/services/__tests__/geocoding.resolveByOsmId.test.ts` — green, unmodified (counted in
  the 19 above; both files run together in one pass).
- Mock-fidelity gates in both files pass (the mocked `nominatim-client.js` double's exported function
  set matches the real module's: `nominatimSearch`, `nominatimLookup`, `__resetChokepointForTests`).

## Chokepoint confirmation (task requirement)

`resolveByOsmId` → `lookupByOsmId` → `nominatimLookup` → the shared `enqueue()` function in
`nominatim-client.ts`, the **same** function `nominatimSearch` calls. `enqueue()` is the sole owner
of the module-level `chain`/`lastRequestAt` state; there is no second delay/serialization
implementation anywhere. One request per create-with-pick, one per pending-retry — same request
budget as the existing `resolveCityName`/`resolveCity` path, just a different endpoint on the same
chokepoint.

## Full verification run

- `npm run test:backend` — **739/740 pass**. The 1 failure
  (`bug75-identity-migration.test.ts > multiple NULL-osm_id rows do NOT collide...`) is the
  pre-documented QA test-seeding defect named in the brief ("Known — do NOT touch": the test inserts
  FK-referencing `user-x`/`user-y` without seeding them) — confirmed by re-reading the failure
  (`SQLITE_CONSTRAINT_FOREIGNKEY` on an unseeded `created_by_user_id`), not something I touched
  (I did not edit `schema.ts` or `migrations/`).
- `npm run type:check:backend` / `npm run type:check:all` — clean.
- `npm run check` (biome) — **0 errors**. 5 pre-existing infos (`useLiteralKeys`, computed-vs-literal
  object key style) live entirely inside the two QA-authored target test files I was told not to
  edit — not introduced by me, not blocking (`biome ci` exit code 0).
- `npm run status:check` — up to date, no action needed.
- `npm run test:frontend` — 270/273 pass. The 3 failures are all in
  `AddPlaceFlow.city-picker.test.tsx`, QA's RED target for the **Frontend** agent's not-yet-built
  `CityPicker` component (build brief §4 sequencing item 4) — I did not touch any frontend file
  (`git status` confirms only `src/backend/**` changed). Blocked-by-another-team, not a regression
  from this brief.

## Negative-findings / scope notes

- No absence claims made without a second probe: the `db.transaction()` landmine was independently
  reproduced (not just inherited from the `trips.ts` comment) before I built around it; the
  drizzle-wrapped unique-violation error shape (`DrizzleQueryError` → `.cause.code`) was also
  live-probed, not assumed from a raw `@libsql/client` test alone.
- Did not touch `schema.ts`, `migrations/`, or any frontend file, per brief scope.
- No source file was rewritten wholesale — all changes are targeted edits; one new small file
  (`db-errors.ts`) was created, not a rewrite of anything existing.

## Files changed

- `/workspace/.claude/worktrees/agent-a68c5b7b952a891c9/src/backend/services/nominatim-client.ts`
- `/workspace/.claude/worktrees/agent-a68c5b7b952a891c9/src/backend/routes/geocode.ts`
- `/workspace/.claude/worktrees/agent-a68c5b7b952a891c9/src/backend/validation/cities.schemas.ts`
- `/workspace/.claude/worktrees/agent-a68c5b7b952a891c9/src/backend/services/geocoding.service.ts`
- `/workspace/.claude/worktrees/agent-a68c5b7b952a891c9/src/backend/routes/cities.ts`
- `/workspace/.claude/worktrees/agent-a68c5b7b952a891c9/src/backend/services/db-errors.ts` (new)

**Tracker home:** BUG-75 / UX-12. **Requirement:** GE-16 (v3.19). Ready for COO to assemble on
`release/bug75-city-identity` alongside Database's (already merged) and Frontend's (pending)
deliverables.

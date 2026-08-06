# DATABASE — BUG-75 city-identity migration — complete

**Date:** 2026-08-06 · **Branch:** `feat/bug75-migration` (off `origin/release/bug75-city-identity`, pushed)
**Tracker:** BUG-75 / UX-12 · **Requirement:** GE-16 (v3.19) · **Commit:** `9c4be49`

Scope: `src/backend/db/schema.ts` + `src/backend/migrations/**` only. No routes, services, or
frontend touched. `db:push` not used anywhere (ADL-15) — `db:generate` + hand-edit + `db:migrate`.

## Migration files created

- **`src/backend/migrations/0016_bug75_identity_expand.sql`** — EXPAND (ADL-47 stage 1).
  drizzle-generated, unmodified. Three nullable `ALTER TABLE cities ADD COLUMN`s
  (`osm_type text`, `osm_id integer`, `display_name text`). No table recreation, no index/CHECK
  change — independently green and deployable alone, verified by applying it standalone before
  generating stage 2.
- **`src/backend/migrations/0017_bug75_identity_switch.sql`** — SWITCH (ADL-47 stage 2, design v3
  §B2 as corrected by review F2/m-1/m-2/m-3). Hand-edited table recreation (needed because the new
  CHECK constraint requires one — SQLite has no `ALTER TABLE ADD CONSTRAINT`). Drops
  `uniq_cities_name_country_region_ci`; adds both new partial unique indexes; adds the m-3 CHECK.
- `src/backend/migrations/meta/0016_snapshot.json`, `0017_snapshot.json`, and
  `meta/_journal.json` updated to match (renamed drizzle's auto-generated tags to
  `0016_bug75_identity_expand` / `0017_bug75_identity_switch` for readability; content otherwise
  drizzle's own snapshot state).
- `src/backend/db/schema.ts` updated in place (Edit, not Write — OP-28) to the same end state:
  `osmType`/`osmId`/`displayName` columns; `uniq_cities_osm_ref` and
  `uniq_cities_pending_per_creator` partial unique indexes; `chk_cities_osm_both_or_neither` CHECK.
  The old `uniq_cities_name_country_region_ci` `uniqueIndex(...)` block is removed (not just
  commented) — schema.ts is the single source of truth (ADL-15) and no longer describes the
  dropped index.

## Exact DDL landed (verified by direct `sqlite_master` inspection after `db:migrate`, not just read back from the SQL file)

```sql
-- resolved-by-OSM identity
CREATE UNIQUE INDEX `uniq_cities_osm_ref` ON `cities` (`osm_type`,`osm_id`) WHERE osm_id IS NOT NULL;

-- pending-per-creator identity
CREATE UNIQUE INDEX `uniq_cities_pending_per_creator` ON `cities`
  ("name" COLLATE NOCASE, `country_code`, COALESCE("region_id", 0), COALESCE("created_by_user_id", ''))
  WHERE geocode_status = 'pending';

-- m-3 both-or-neither guard, on the cities table itself
CONSTRAINT "chk_cities_osm_both_or_neither"
  CHECK(("cities"."osm_type" IS NULL) = ("cities"."osm_id" IS NULL))
```

`uniq_cities_name_country_region_ci` confirmed absent from `sqlite_master` post-migration.

**One deliberate deviation from raw `db:generate` output, beyond the mandated m-2 hand-edit:** the
WHERE clauses on both new partial indexes are written as bare column references
(`WHERE osm_id IS NOT NULL`, `WHERE geocode_status = 'pending'`) rather than drizzle's default
table-qualified form (`WHERE "cities"."osm_id" IS NOT NULL`). Both are valid, equivalent SQLite —
this was needed to satisfy QA's own test regexes (`/osm_id\s+is\s+not\s+null/i` etc.), which don't
tolerate a `"` character sitting between the column name and the following whitespace. Functionally
identical; noting it because it's a real (if cosmetic) divergence from what an unmodified
`db:generate` would emit.

## Bugs hit and fixed (m-2, ADL-15 bug 4 — confirmed reproduced, not just theoretical)

1. **COALESCE-comma-split**, `uniq_cities_pending_per_creator`: drizzle-kit split
   `COALESCE(region_id, 0)` and `COALESCE(created_by_user_id, '')` on their internal commas into
   bogus separate quoted identifiers (`` `COALESCE("region_id"` ``, `` ` 0)` ``, etc.) — invalid
   SQL. Hand-corrected against `0015_fluffy_payback.sql`'s working `COALESCE("region_id", 0)`
   syntax, per m-2's mandate.
2. **Stale-old-table INSERT bug avoided by staging**: generating the whole end-state as one
   migration (my first attempt, discarded) reproduced 0015's original bug — the `INSERT ...
   SELECT` pulled `osm_type`/`osm_id`/`display_name` from the *old* `cities` table, which doesn't
   have them yet. Splitting into EXPAND (0016) then SWITCH (0017) — generated in that order, each
   against the schema state that follows the previous migration — avoided this: by the time 0017's
   recreation runs, those columns already exist on the pre-recreation table.

## Migration-test status: 8/9 GREEN

`npx vitest run --config vitest.config.backend.ts src/backend/migrations/__tests__/bug75-identity-migration.test.ts`
— 8 passed, 1 failed. Test file **not edited** (per brief).

**The 1 remaining failure is a QA test defect, not a schema/migration defect** — flagging per the
negative-findings rule (two independent probes below), not fixing (out of scope; would require
editing QA's test file).

- Test: `multiple NULL-osm_id rows do NOT collide on the resolved-by-OSM index (partial WHERE
  osm_id IS NOT NULL)` (`bug75-identity-migration.test.ts:166-184`).
- Failure: `INSERT INTO cities (..., created_by_user_id) VALUES ('Oldtown','GB','pending','user-x')`
  throws `SQLITE_CONSTRAINT_FOREIGNKEY` — `created_by_user_id` FKs to `users.id` (existing,
  deliberate, ADL-46 §9.2, untouched by this migration), and neither `'user-x'` nor `'user-y'` is
  ever inserted into `users` anywhere the test can reach.
- **Probe 1:** the raw SQLite error names the FK constraint directly (`SQLITE_CONSTRAINT_FOREIGNKEY`
  on the `created_by_user_id` insert).
- **Probe 2 (independent — could fail differently):** `grep -rn "user-x\|user-y"` across
  `src/backend` finds only the two literal INSERTs inside this test file itself, and
  `vitest.config.backend.ts` has no `setupFiles`/`globalSetup` that could seed them.
- Both probes agree: no code path creates these users before the test references them by FK. This
  is intrinsic to the test's own SQL, independent of the index/CHECK DDL — the other 3 tests in the
  same `describe` block (which don't touch `created_by_user_id`) and the 5 EXPAND/SWITCH-shape
  tests all pass, isolating the fault to this one test's fixture data.
- **Not a Database fix**: the FK is existing, correct, and deliberate (cities are global reference
  data with an optional nullable creator, ADL-46 §9.2) — weakening or removing it is not authorized
  by this brief and would be a real regression, not a fix. **Recommend**: QA/COO add
  `INSERT INTO users (id, clerk_id, email, is_owner, created_at, updated_at) VALUES (...)` for
  `'user-x'` and `'user-y'` (or omit `created_by_user_id` and drop it from the assertion's intent)
  before the two `cities` inserts.

## Regression check: `npm run test:backend` — no regressions from this change

739 pre-existing tests: all still pass. 15 failing tests, all pre-existing RED ATDD acceptance
tests QA committed *before* my branch started (`c7dd08d`, confirmed via `git log`), all in
Backend's scope, not mine:
- `src/backend/routes/__tests__/cities.identity-carry.test.ts` (11 failures) — needs the carry
  channel, `resolveByOsmId`, find-or-create rewrite (M-A/B2), twin-merge txn (M1/F3).
- `src/backend/services/__tests__/geocoding.resolveByOsmId.test.ts` (4 failures) — needs
  `resolveByOsmId` itself, which doesn't exist yet.

`npm run type:check:backend` — clean, no errors.

## What Backend's brief depends on from this migration (informational, not asking Backend to act — just documenting the contract)

- `cities.osmType` / `cities.osmId` / `cities.displayName` are nullable columns on the Drizzle
  schema now — safe for Backend to read/write immediately.
- The **resolved-by-OSM unique index** is what makes a caught-unique-violation on
  `(osm_type, osm_id)` the correct signal for "this OSM place already exists → re-select and
  reuse/merge" (M1/F3). It fires for **any** insert/update that sets a non-null `osm_id` matching
  an existing row's `(osm_type, osm_id)` pair — covers the resolve stamp and both create-path
  INSERTs per the design.
- The **pending-per-creator index** replaces the old global uniqueness guarantee for *pending* rows
  only — Backend's `findOrUpgradeCity` step 1 needs to be creator-scoped (v2 §7) to match, exactly
  as M-A/B2 in the build brief specify. Resolved rows with NULL `osm_id` are governed by **neither**
  new index (a gap that is intentional per M-A's fix: every resolve, carried or not, must stamp
  `osm_type`/`osm_id` — that's what brings a resolved row under the resolved-by-OSM index and lets
  the merge fire; this migration does not and cannot enforce that application-level discipline).
- The `chk_cities_osm_both_or_neither` CHECK will reject any insert/update that sets exactly one of
  `osm_type`/`osm_id` — Backend's Zod refine at the API boundary (design v3 §2.3) should already be
  catching this earlier with a cleaner error, but the DB will now also reject it hard if that
  boundary is ever bypassed.

## Files touched
- `/workspace/.claude/worktrees/agent-a6ae6e526bdb65805/src/backend/db/schema.ts`
- `/workspace/.claude/worktrees/agent-a6ae6e526bdb65805/src/backend/migrations/0016_bug75_identity_expand.sql`
- `/workspace/.claude/worktrees/agent-a6ae6e526bdb65805/src/backend/migrations/0017_bug75_identity_switch.sql`
- `/workspace/.claude/worktrees/agent-a6ae6e526bdb65805/src/backend/migrations/meta/0016_snapshot.json`
- `/workspace/.claude/worktrees/agent-a6ae6e526bdb65805/src/backend/migrations/meta/0017_snapshot.json`
- `/workspace/.claude/worktrees/agent-a6ae6e526bdb65805/src/backend/migrations/meta/_journal.json`

Committed (`9c4be49`) and pushed to `feat/bug75-migration`. No PR opened (per brief — COO merges
into the release branch).

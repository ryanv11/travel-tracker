# BUG-75 / GE-16 (v3.19) — city-identity EXPAND/CONTRACT migration

**Date:** 2026-08-06 · **Branch:** `feat/bug75-migration` (off `release/bug75-city-identity`)
**Tracker:** BUG-75 / UX-12
**Schema change:** yes, `cities` table. **Migration:** `0016_bug75_identity_expand.sql` +
`0017_bug75_identity_switch.sql`, staged per ADL-47.

---

## What changed

| File | Change |
|---|---|
| `src/backend/db/schema.ts` | `cities`: +`osmType`/`osmId`/`displayName` (nullable); `uniq_cities_name_country_region_ci` removed; +`uniq_cities_osm_ref`, +`uniq_cities_pending_per_creator` (partial unique indexes); +`chk_cities_osm_both_or_neither` CHECK |
| `src/backend/migrations/0016_bug75_identity_expand.sql` | **New.** EXPAND (ADL-47 stage 1) — 3 nullable `ADD COLUMN`s, no table recreation |
| `src/backend/migrations/0017_bug75_identity_switch.sql` | **New.** SWITCH (ADL-47 stage 2) — table recreation: drops old index, adds both new partial indexes + the CHECK |
| `src/backend/migrations/meta/{0016,0017}_snapshot.json`, `meta/_journal.json` | drizzle-kit bookkeeping, updated to match |

## The exact DDL that landed (verified against `sqlite_master`, not just read back from the SQL file)

```sql
CREATE UNIQUE INDEX `uniq_cities_osm_ref` ON `cities` (`osm_type`,`osm_id`) WHERE osm_id IS NOT NULL;

CREATE UNIQUE INDEX `uniq_cities_pending_per_creator` ON `cities`
  ("name" COLLATE NOCASE, `country_code`, COALESCE("region_id", 0), COALESCE("created_by_user_id", ''))
  WHERE geocode_status = 'pending';

CONSTRAINT "chk_cities_osm_both_or_neither"
  CHECK(("cities"."osm_type" IS NULL) = ("cities"."osm_id" IS NULL))
```

`uniq_cities_name_country_region_ci` (ADL-46 D13) confirmed absent post-migration.

## Why the WHERE clauses are bare column references, not drizzle's default table-qualified form

drizzle-kit's default emission is `WHERE "cities"."osm_id" IS NOT NULL` (table-qualified,
double-quoted — visible unchanged on `idx_cities_geocode` in this same migration). Both new
partial indexes here instead use the bare form (`WHERE osm_id IS NOT NULL`,
`WHERE geocode_status = 'pending'`) — functionally identical SQLite, hand-chosen because QA's
RED migration test's regexes (`/osm_id\s+is\s+not\s+null/i`,
`/geocode_status\s*=\s*'pending'/i`) don't tolerate the `"` that closes a table-qualified
identifier sitting between the column name and the following whitespace — the qualified form
silently fails the regex match despite being correct DDL. If a future `db:generate` re-touches
these indexes and re-emits the qualified form, that's fine functionally but will need the same
hand-edit again if this test (or its regex style) is still in force.

## Two migrations, not one — the bug avoided by staging

Generating the whole end-state as a single migration (first attempt, discarded) reproduced
`0015_fluffy_payback.sql`'s original documented bug: the `INSERT ... SELECT` pulled
`osm_type`/`osm_id`/`display_name` **from the OLD `cities` table**, which doesn't have those
columns pre-migration — would fail at runtime with "no such column". Generating EXPAND (0016)
first, applying it, then generating SWITCH (0017) against the resulting schema state avoids it:
by the time 0017's recreation runs, those columns already exist on the pre-recreation table.
This also matches design v3 §B2's own staging (Stage 1 EXPAND / Stage 2 SWITCH), not just a
workaround.

## ADL-15 bug 4 (COALESCE-comma-split) — reproduced, not just cited

`uniq_cities_pending_per_creator` needs two `COALESCE(...)` expressions in its column list.
drizzle-kit split each on its internal comma into bogus separate quoted identifiers — invalid
SQL. Hand-corrected against `0015_fluffy_payback.sql`'s working `COALESCE("region_id", 0)`
syntax (m-2's mandated template). `uniq_cities_osm_ref` has no `COALESCE` and was emitted
correctly (only its WHERE clause needed the bare-column rewrite above).

## Verification performed

- `db:migrate` applies clean from a fresh local SQLite file (both migrations, in sequence).
- Direct `sqlite_master` inspection (throwaway libsql script, not committed) confirmed the DDL
  above landed exactly, and the old index is gone.
- QA's `bug75-identity-migration.test.ts`: 8/9 green (not edited). The 1 failure is a QA test
  defect unrelated to schema/migration — see the completion report
  (`jobs/COO/inbox/20260806_2245-DATABASE-bug75-migration-complete.md`) for the two-probe
  negative finding (an FK violation on unseeded `'user-x'`/`'user-y'` creator ids).
- `npm run test:backend` / `test:frontend`: 0 regressions. All failures are QA's own
  pre-existing RED ATDD tests for Backend's and Frontend's briefs (same QA commit, `c7dd08d`,
  predating this thread).
- `type:check:all` clean. `biome ci` clean after one `npm run format` pass.

## Hazard for the next reader touching `cities`

The resolved-by-OSM index (`uniq_cities_osm_ref`) is only load-bearing for the M-A / M1/F3
merge behaviour (design v3 §B2/§B3) if **every** resolve — carried-pick or plain name-search —
stamps `osm_type`/`osm_id` on the row (v2 §7 rule 2c, re-added per the v3 delta review's M-A
finding). This migration adds the index and the CHECK; it does **not** and cannot enforce that
application-level stamping discipline — that is Backend's brief. A resolved row that never gets
stamped stays NULL-`osm_id`, is covered by neither new partial index, and two such rows for the
same real place will NOT merge (the exact BUG-33-class duplicate the M-A finding warned about).

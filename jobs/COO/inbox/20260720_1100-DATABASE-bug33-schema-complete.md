# Completion Report — BUG-33: cities dedup (schema half)

> UPDATE (2026-07-20, same-day renumbering thread): after PR #168 (BUG-30) merged
> to main first, this branch was rebased and its two migrations renumbered from
> 0008/0009 to 0009/0010 to resolve an index collision — both PRs had independently
> generated a migration at idx 8 from the same pre-merge main commit. Migration
> content is unchanged; only the numbers below are superseded. See
> `jobs/database/context/current.txt` "RENUMBERING THREAD" section for detail.

**Tracker:** BUG-33 · **GitHub:** issue #157 · **BRD:** GE-11 · **Branch:** `fix/bug33-city-dedup-schema`

## What was built
Two migrations: (1) `0008_bug33_dedupe_cities_data.sql` merges existing duplicate
`cities` rows (canonical = lowest id, geocode fields coalesced from the best-resolved
duplicate), re-pointing `trip_places`/`items`/`trip_place_activities_map` off any
duplicate before deleting it — including a real collision case in the dev data where
two `trip_places` rows for the same trip resolved to the same canonical city.
(2) `0009_stiff_meltdown.sql` adds `UNIQUE(name COLLATE NOCASE, country_code)` on
`cities` (schema.ts: `uniq_cities_name_country_ci`) to prevent recurrence.

Approach (collation mechanism + collision handling) reviewed with Architect before
implementation, per the no-schema-change-without-review rule.

## Acceptance criteria
- Unique constraint on cities(name, country_code), case-insensitive: PASS
- Existing duplicates merged, no data loss (items/activity tags preserved): PASS
- trip_places FK references correctly repointed, including collision case: PASS
- Migration via db:generate + db:migrate (no db:push): PASS
- Schema-change reviewed by Architect before implementation: PASS

## Migration verified
db:generate (custom + schema-diff) + db:migrate ran clean; re-running db:generate
after produced "No schema changes" (stable snapshot). Verified against the real dev
duplicate data set (2x Glasgow/GB, 3x Seattle/US) — merge output matched design exactly.
Unique index confirmed to block a case-variant duplicate insert while still allowing
distinct cities.

## CI
Not yet pushed — filing this report before push per role workflow; `gh pr checks` will
be confirmed green before this is considered fully done. (See below — pushing now.)

## Open issues or blockers
None blocking. Two flags for awareness:
1. No `PRAGMA foreign_keys = ON` in `src/backend/db/index.ts` — declared
   `onDelete: 'cascade'` FKs aren't actually enforced by SQLite today. Pre-existing,
   out of scope here; the cleanup migration handles child rows explicitly rather than
   relying on it. Worth an Architect/Backend look.
2. `jobs/database/context/current.txt` and `jobs/database/tech/` had gone stale since
   2026-03-07 despite months of schema changes landing via other roles. Recommend a
   decision: resume maintaining the mirror, or stamp it HISTORICAL per the Document
   Lifecycle rule.

## What is now unblocked
Backend's parallel brief (`fix/bug33-city-dedup-logic`) can proceed — the unique index
and cleanup are in place. Backend's find-or-create lookup must use a case-insensitive
WHERE (matching COLLATE NOCASE) or it will miss the canonical row post-merge. QA can
re-verify the autocomplete once both halves merge.

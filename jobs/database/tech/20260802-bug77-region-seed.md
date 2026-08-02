# BUG-77 / ADL-48 S1 — subdivision seed for all 26 region-tier countries

**Date:** 2026-08-02 · **Branch:** `fix/bug77-region-subdivisions-seed` · **Issue:** #367
**Schema change:** none. **Migration:** none. This is seed data plus startup logic only.

---

## What changed

| File | Change |
|---|---|
| `data/regions.json` | 76 → **714** rows. Pure append: every pre-existing row is byte-identical and in its original position |
| `data/vendor/iso3166-2.json` | **New.** Vendored upstream input, 3.35 MB, MIT. Provenance in `data/vendor/README.md` |
| `data/vendor/iso3166-2.LICENSE`, `data/vendor/README.md` | **New.** Licence text + source/version/hash/refresh procedure |
| `src/backend/services/startup.service.ts` | `seedRegions()` re-gated from row count to content hash; insert changed to an additive upsert |
| `scripts/generate-gazetteer.mjs` | S1-only mode (cities input optional); stable output ordering; coverage proof added to the safety gate |
| `.gitignore` | `data/vendor/` narrowed so the three vendored files are tracked |
| `src/backend/services/__tests__/startup.service.test.ts` | 11 new `seedRegions()` tests |

## The hazard this design exists to avoid

`regions` **must never be deleted and reloaded.**

- `cities.region_id` REFERENCES `regions.id` — `src/backend/db/schema.ts` line 101; migration
  `0000_open_electro.sql` line 23; confirmed at runtime by `PRAGMA foreign_key_list('cities')`.
- `regions.id` is `AUTOINCREMENT` — schema.ts line 72; migration `0000` line 145; confirmed at
  runtime in `sqlite_master`.
- FK enforcement is **on** at boot and asserted by `assertForeignKeysEnabled()`.

So a `DELETE` + reload either aborts on the FK, or — if enforcement were ever off — silently
repoints every existing city at a different subdivision. Nothing would report it; a user would
eventually notice their city had moved state.

ADL-48 §8.1 defines hash-gated seeding *only* as `DELETE` + batch-insert, and §11's S1 row invokes
that mechanism by name. **§8.1's own safety argument is "nothing references `gazetteer_cities`",
and that precondition is false for `regions`.** Both sections now carry a stamp saying so.

## The mechanism as shipped

```
gate:   hash(bundled file) == hash(table rows restricted to bundled codes) ?  -> skip
write:  INSERT ... ON CONFLICT (iso_3166_2) DO UPDATE SET name, country_code, updated_at
        WHERE the row genuinely differs        (drizzle `setWhere`)
```

- **Gate = one read, zero writes.** A single `SELECT` of three columns over 714 rows (~30 KB, one
  round trip), then an in-memory hash comparison. Measured 3 ms locally.
- **No stored hash, therefore no schema change.** Persisting one would need a new meta table;
  `regions` has nowhere to put it, and no meta or key-value table exists (checked two ways: the
  `sqliteTable` exports in `schema.ts`, and every `CREATE TABLE` across all 16 migrations).
  Hashing the table's own contents is also strictly stronger than trusting a stored marker — it
  detects drift applied directly to the database, which a stored hash would vouch for.
- **`DO UPDATE`, not `DO NOTHING`, for convergence.** Under `DO NOTHING` an upstream *name*
  correction would leave the table's hash permanently different from the file's, so the seed would
  re-run on every boot forever without ever fixing the row it keeps noticing. `setWhere` narrows the
  UPDATE to genuinely-differing rows, so a purely additive run does not touch — or bump `updated_at`
  on — a single existing row (verified: 0 touched).
- **Rows in the table but absent from the file are never deleted.** One could already be referenced
  by a city, and a seed has no safe way to know it is not.
- **Chunked at 200 rows** (600 bound parameters) so a 714-row single statement cannot hit a
  conservative `SQLITE_MAX_VARIABLE_NUMBER` of 999.

## Why the gate had to change at all

The old gate returned early on `existingCount > 0`. Staging and production each hold exactly 76
regions, so a regenerated 714-row file **would never have applied to either** — the 638 new
subdivisions would have shipped and done nothing. This is the same row-count-gating trap that made
BUG-30 require a hand-written patch migration (`0008_bug30_uk_region_seed.sql`, whose own comments
describe fighting this gate).

## Data correctness

**Empty ISO codes are filtered, generally.** Two upstream subdivisions in the enabled set carry an
empty `iso` field and would seed as `"ID-"` (West Papua) and `"PH-"` (Negros Island Region) —
non-null and distinct, so they pass `NOT NULL` and the unique index and land as permanently
unmatchable garbage. The generator drops them and **names them in its output**. The filter is a
general `iso === ''` test, not a two-row special case: **196 such rows exist across 29 of the 234
countries**, so the problem grows the moment GE-07 enables another country.

## Regenerating

```bash
node scripts/generate-gazetteer.mjs      # writes data/regions.generated.json (gitignored)
cp data/regions.generated.json data/regions.json
```

The script exits non-zero unless every S1 safety proof passes: no currently-seeded code missing, no
name or country drift on an existing code, no duplicate `iso_3166_2`, no region-tier country left
with zero subdivisions, and the output at least as large as the file it replaces. Refreshing the
upstream dataset is documented in `data/vendor/README.md`.

Output ordering is stable: rows already in `data/regions.json` keep their position and new rows
append. That makes a regeneration a **pure-append diff** — the "all existing codes preserved
byte-for-byte" claim is then visible in the diff itself rather than taken on trust from the script's
own output — and it keeps AUTOINCREMENT id assignment on a fresh database unchanged for the
pre-existing codes.

## Not mirrored here

`data/regions.json` is deliberately **not** copied into this folder. It is a generated artifact with
a canonical home and a generator that reproduces it; a second copy would drift silently and there
would be no way to tell which was right. Same reasoning for `startup.service.ts`, which sits under
`services/` and has never been part of this mirror (prior threads' convention).

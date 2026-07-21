-- BUG-30 (GitHub #154): UK constituent countries unavailable when adding a place.
--
-- Root cause: GB was present in the countries seed with region_tier_enabled = 0,
-- so the Region tier (GE-01/GE-02) never surfaced Scotland/England/Wales/Northern
-- Ireland — they are not ISO 3166-1 countries, they are regions under GB, same
-- tier as US states / AU states (GE-02, GE-06).
--
-- This is a data-only fix (no DDL — countries.region_tier_enabled/label and
-- regions.iso_3166_2 already exist per migration 0001_bug02_iso3166_seam_columns).
-- Generated via `drizzle-kit generate --custom` since drizzle-kit only diffs
-- schema.ts, not seed data (ADL-15 — db:push forbidden, but there is also no
-- DDL diff here for `generate` to pick up automatically).
--
-- This migration only PATCHES INSTALLS THAT HAVE ALREADY RUN THE APP-LEVEL SEED
-- (src/backend/services/startup.service.ts). data/countries.json and
-- data/regions.json are corrected in this same PR so GE-04/05 ("ships
-- pre-configured", "applied automatically on first launch") holds for brand
-- new installs without this migration doing anything on them.
--
-- Guard rationale: seedCountries()/seedRegions() gate on "table already has
-- >0 rows -> skip entirely" (idempotent first-launch seed). Migrations always
-- run before the server boots (npm run db:migrate is a deploy step ahead of
-- server start), so on a FRESH install this migration runs against EMPTY
-- countries/regions tables. The countries UPDATE is naturally a no-op there
-- (no GB row exists yet). But an unconditional regions INSERT would NOT be a
-- no-op — it would seed 4 rows into an otherwise-empty regions table, tripping
-- seedRegions()'s "non-empty -> skip" guard and permanently starving fresh
-- installs of the other 72 US/AU/CA regions. The `WHERE EXISTS (SELECT 1 FROM
-- regions LIMIT 1)` guard below keeps the INSERTs scoped to installs that have
-- already been seeded at least once, leaving genuinely fresh installs to pick
-- up all regions (incl. the 4 new GB ones) from the corrected JSON via the
-- normal first-launch seed path.
--
-- Idempotent: safe to re-run.

UPDATE countries
SET region_tier_enabled = 1,
    region_tier_label = 'Constituent Country',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE country_code = 'GB';
--> statement-breakpoint

INSERT INTO regions (country_code, name, iso_3166_2)
SELECT 'GB', 'England', 'GB-ENG'
WHERE EXISTS (SELECT 1 FROM regions LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM regions WHERE iso_3166_2 = 'GB-ENG');
--> statement-breakpoint

INSERT INTO regions (country_code, name, iso_3166_2)
SELECT 'GB', 'Scotland', 'GB-SCT'
WHERE EXISTS (SELECT 1 FROM regions LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM regions WHERE iso_3166_2 = 'GB-SCT');
--> statement-breakpoint

INSERT INTO regions (country_code, name, iso_3166_2)
SELECT 'GB', 'Wales', 'GB-WLS'
WHERE EXISTS (SELECT 1 FROM regions LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM regions WHERE iso_3166_2 = 'GB-WLS');
--> statement-breakpoint

INSERT INTO regions (country_code, name, iso_3166_2)
SELECT 'GB', 'Northern Ireland', 'GB-NIR'
WHERE EXISTS (SELECT 1 FROM regions LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM regions WHERE iso_3166_2 = 'GB-NIR');

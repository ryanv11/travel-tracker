/**
 * Travel Tracker — Startup Service
 *
 * Runs once at server startup to ensure all seed data is present.
 * All operations are idempotent — safe to call on every startup.
 *
 * Updated startup sequence (Corrections message, 2026-03-07):
 *   1. seedAdminData()  — trip_categories, activities, companions, map_shading_config
 *   2. seedCountries()  — countries table from data/countries.json
 *   3. seedRegions()    — regions table from data/regions.json (US, AU, CA)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, sql } from 'drizzle-orm';
import { activities, countries, getDb, regions, tripCategories } from '../db/index.js';

// Re-import seed data from the DATABASE seed script to avoid duplication
import { ACTIVITIES, TRIP_CATEGORIES } from '../db/seed-data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ----------------------------------------------------------------
// FK enforcement assertion (QUAL-11, ADL-41 §7.2.1 decision 9)
// ----------------------------------------------------------------

/**
 * Asserts — does NOT set — that foreign-key enforcement is active on the
 * real application connection, and fails loudly at boot if it is not.
 *
 * Every declared ON DELETE CASCADE / SET NULL in schema.ts (trips → items,
 * trips → trip_places, items.carried_from_item_id, etc. — see ADL-41 §7) is
 * only enforced because `@libsql/client` currently enables FK enforcement by
 * default. That is a driver default nothing in this repo states, tests, or
 * would notice changing — a future major-version bump could silently flip
 * it, and the symptom would be silent orphaning in production discovered
 * months later.
 *
 * Per ADL-41 §7.2/§7.2.1: the fix is NOT to issue `PRAGMA foreign_keys=ON`
 * at connect. On the remote libsql:// HTTP transport each statement is
 * independently dispatched, so a PRAGMA set once at connect time has no
 * reliable session to persist into — it would look like a fix and guarantee
 * nothing. Instead this reads the actual per-statement enforcement state,
 * which is correct on both the embedded and remote transports because it
 * reflects the condition every real cascade executes under.
 *
 * Postgres (DB_TYPE=postgres) always enforces declared FK constraints —
 * there is no PRAGMA equivalent and no driver-default risk — so this is a
 * deliberate no-op there.
 *
 * @throws {Error} if DB_TYPE=sqlite and PRAGMA foreign_keys does not return 1.
 */
export async function assertForeignKeysEnabled(): Promise<void> {
  if (process.env.DB_TYPE !== 'sqlite') {
    console.info(
      '[STARTUP] FK enforcement check skipped — DB_TYPE=postgres always enforces declared FKs',
    );
    return;
  }

  const db = getDb();
  const row = await db.get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
  const value = row?.foreign_keys;

  if (value !== 1) {
    throw new Error(
      `[STARTUP] FATAL: PRAGMA foreign_keys returned ${JSON.stringify(value)}, expected 1. ` +
        'Foreign-key enforcement is OFF on the application connection — every declared ' +
        'ON DELETE CASCADE / SET NULL in schema.ts (see ADL-41 §7) would silently stop ' +
        'firing, orphaning child rows instead of cascading. Refusing to start. See ADL-41 ' +
        '§7.2.1 decision 9.',
    );
  }

  console.info('[STARTUP] FK enforcement: OK (PRAGMA foreign_keys = 1)');
}

// ----------------------------------------------------------------
// Admin data seed
// ----------------------------------------------------------------

/**
 * Seeds trip_categories and activities with default values if any are
 * missing. Uses onConflictDoNothing() — idempotent, safe on every startup.
 *
 * ADL-28 (AD-07/AD-08): companions and map_shading_config used to be seeded
 * here too, but both are now per-user (userId NOT NULL FK) — there is no
 * single global row set to seed at server startup any more. companions has
 * no default list post-migration; map_shading_config is lazily seeded
 * per-user on first access to the shading config endpoint
 * (shadingConfigRepository.seedDefaults, ADL-28 repository section —
 * Backend brief, not yet implemented). trip_categories and activities
 * remain global seeded defaults (AD-09, unaffected by this ADL).
 */
export async function seedAdminData(): Promise<void> {
  const db = getDb();

  // -- trip_categories --
  await db
    .insert(tripCategories)
    .values([...TRIP_CATEGORIES])
    .onConflictDoNothing();
  console.info('[STARTUP] Admin data: trip_categories seeded');

  // -- activities --
  await db
    .insert(activities)
    .values([...ACTIVITIES])
    .onConflictDoNothing();
  console.info('[STARTUP] Admin data: activities seeded');
}

// ----------------------------------------------------------------
// Country seed (GE-04, GE-05, GE-06)
// ----------------------------------------------------------------

/**
 * Populates the countries table from data/countries.json if the table is empty.
 * Skips silently if already populated.
 */
export async function seedCountries(): Promise<void> {
  const db = getDb();

  const [{ value: existingCount }] = await db.select({ value: count() }).from(countries);
  if (existingCount > 0) {
    console.info('[STARTUP] Countries already seeded, skipping');
    return;
  }

  const dataPath = join(__dirname, '../../../data/countries.json');
  const rawData = readFileSync(dataPath, 'utf-8');
  const countryData = JSON.parse(rawData) as Array<{
    country_code: string;
    name: string;
    region_tier_enabled: number;
    region_tier_label: string | null;
  }>;

  await db
    .insert(countries)
    .values(
      countryData.map((c) => ({
        countryCode: c.country_code,
        name: c.name,
        regionTierEnabled: c.region_tier_enabled,
        regionTierLabel: c.region_tier_label,
      })),
    )
    .onConflictDoNothing();

  console.info(`[STARTUP] ✓ Countries seeded (${countryData.length} rows)`);
}

// ----------------------------------------------------------------
// Region seed (Correction 2 — US, AU, CA pre-populated)
// ----------------------------------------------------------------

/**
 * Populates the regions table from data/regions.json if the table is empty.
 * Seeds US (51), AU (8), and CA (13) entries — 72 total.
 * Skips silently if already populated.
 */
export async function seedRegions(): Promise<void> {
  const db = getDb();

  const [{ value: existingCount }] = await db.select({ value: count() }).from(regions);
  if (existingCount > 0) {
    console.info('[STARTUP] Regions already seeded, skipping');
    return;
  }

  const dataPath = join(__dirname, '../../../data/regions.json');
  const rawData = readFileSync(dataPath, 'utf-8');
  const regionData = JSON.parse(rawData) as Array<{
    country_code: string;
    name: string;
    iso_3166_2: string;
  }>;

  await db
    .insert(regions)
    .values(
      regionData.map((r) => ({
        countryCode: r.country_code,
        name: r.name,
        iso3166_2: r.iso_3166_2,
      })),
    )
    .onConflictDoNothing();

  console.info(`[STARTUP] ✓ Regions seeded (${regionData.length} rows)`);
}

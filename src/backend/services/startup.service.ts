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

import { count } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  activities,
  companions,
  countries,
  getDb,
  mapShadingConfig,
  regions,
  tripCategories,
} from '../db/index.js';

// Re-import seed data from the DATABASE seed script to avoid duplication
import { ACTIVITIES, COMPANIONS, MAP_SHADING_CONFIG, TRIP_CATEGORIES } from '../db/seed-data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ----------------------------------------------------------------
// Admin data seed
// ----------------------------------------------------------------

/**
 * Seeds trip_categories, activities, companions, and map_shading_config
 * with default values if any are missing.
 * Uses onConflictDoNothing() — idempotent, safe on every startup.
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

  // -- companions --
  await db
    .insert(companions)
    .values([...COMPANIONS])
    .onConflictDoNothing();
  console.info('[STARTUP] Admin data: companions seeded');

  // -- map_shading_config --
  await db
    .insert(mapShadingConfig)
    .values([...MAP_SHADING_CONFIG])
    .onConflictDoNothing();
  console.info('[STARTUP] Admin data: map_shading_config seeded');
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

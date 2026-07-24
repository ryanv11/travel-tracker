/**
 * Travel Tracker — Seed Data Loader (CLI script)
 *
 * Populates default admin list values on first launch.
 * Seed constants are in seed-data.ts to allow reuse by startup.service.ts.
 *
 * IDEMPOTENT: Safe to run multiple times. Uses onConflictDoNothing()
 * so existing rows are never overwritten and no duplicates are created.
 *
 * Usage:
 *   npm run db:seed
 *
 * This script is run once after `npm run db:push` sets up the schema.
 * The server auto-seeds on startup — manual db:seed is no longer required
 * for first-launch setup, but remains available for development use.
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

import { getDb } from './index.js';
import { activities, tripCategories } from './schema.js';
import { ACTIVITIES, TRIP_CATEGORIES } from './seed-data.js';

/**
 * Seeds all default admin list tables.
 * Each insert uses onConflictDoNothing() — safe to repeat without side effects.
 *
 * ADL-28 (AD-07/AD-08): companions and map_shading_config are no longer
 * global-seeded here. Both tables are now per-user (userId NOT NULL FK).
 * companions has no default list post-migration (users build their own from
 * an empty list); map_shading_config is lazily seeded per-user on first
 * access to the shading config endpoint (shadingConfigRepository.seedDefaults,
 * ADL-28 repository section — Backend brief, not yet implemented). Only
 * trip_categories and activities remain global seeded defaults (AD-09,
 * unaffected by this ADL).
 */
async function seed(): Promise<void> {
  console.log('[SEED] Starting seed...\n');
  const db = getDb();

  await db
    .insert(tripCategories)
    .values([...TRIP_CATEGORIES])
    .onConflictDoNothing();
  console.log(`✓ trip_categories seeded (${TRIP_CATEGORIES.length} rows attempted)`);

  await db
    .insert(activities)
    .values([...ACTIVITIES])
    .onConflictDoNothing();
  console.log(`✓ activities seeded (${ACTIVITIES.length} rows attempted)`);

  console.log('\n[SEED] Complete.');
}

seed().catch((err: unknown) => {
  console.error('[SEED] Error:', err);
  process.exit(1);
});

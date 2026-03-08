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
import { tripCategories, activities, companions, mapShadingConfig } from './schema.js';
import {
  TRIP_CATEGORIES,
  ACTIVITIES,
  COMPANIONS,
  MAP_SHADING_CONFIG,
} from './seed-data.js';

/**
 * Seeds all default admin list tables.
 * Each insert uses onConflictDoNothing() — safe to repeat without side effects.
 */
async function seed(): Promise<void> {
  console.log('[SEED] Starting seed...\n');
  const db = getDb();

  await db.insert(tripCategories).values([...TRIP_CATEGORIES]).onConflictDoNothing();
  console.log(`✓ trip_categories seeded (${TRIP_CATEGORIES.length} rows attempted)`);

  await db.insert(activities).values([...ACTIVITIES]).onConflictDoNothing();
  console.log(`✓ activities seeded (${ACTIVITIES.length} rows attempted)`);

  await db.insert(companions).values([...COMPANIONS]).onConflictDoNothing();
  console.log(`✓ companions seeded (${COMPANIONS.length} rows attempted)`);

  await db.insert(mapShadingConfig).values([...MAP_SHADING_CONFIG]).onConflictDoNothing();
  console.log(`✓ map_shading_config seeded (${MAP_SHADING_CONFIG.length} rows attempted)`);

  console.log('\n[SEED] Complete.');
}

seed().catch((err: unknown) => {
  console.error('[SEED] Error:', err);
  process.exit(1);
});

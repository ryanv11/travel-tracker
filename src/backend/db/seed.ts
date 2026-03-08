/**
 * Travel Tracker — Seed Data Loader
 *
 * Populates default admin list values on first launch.
 * Source: _project/seed-data.txt
 *
 * IDEMPOTENT: Safe to run multiple times. Uses onConflictDoNothing()
 * so existing rows are never overwritten and no duplicates are created.
 * Running this script twice produces exactly the same database state.
 *
 * Usage:
 *   npm run db:seed
 *
 * This script is run once after `npm run db:push` sets up the schema.
 * It can be re-run safely at any time without data loss.
 */

import { config } from 'dotenv';
config({ path: '.env.local' }); // Explicit load — dotenv/config only reads .env by default
import { getDb } from './index.js';
import {
  tripCategories,
  activities,
  companions,
  mapShadingConfig,
} from './schema.js';

// ----------------------------------------------------------------
// Seed data — matches _project/seed-data.txt exactly
// ----------------------------------------------------------------

/** Default trip categories (11 rows) */
const TRIP_CATEGORIES = [
  { name: 'Ski Trip' },
  { name: 'Honeymoon' },
  { name: 'Summer Holiday' },
  { name: 'City Break' },
  { name: 'Road Trip' },
  { name: 'Business' },
  { name: 'Family' },
  { name: 'Adventure' },
  { name: 'Beach Holiday' },
  { name: 'Cultural' },
  { name: 'Other' },
] as const;

/** Default activities (17 rows) */
const ACTIVITIES = [
  { name: 'Skiing' },
  { name: 'Snowboarding' },
  { name: 'Dining' },
  { name: 'Hiking' },
  { name: 'Beach Day' },
  { name: 'Cooking Class' },
  { name: 'Wine Tasting' },
  { name: 'Sightseeing' },
  { name: 'Museum' },
  { name: 'Cycling' },
  { name: 'Sailing' },
  { name: 'Surfing' },
  { name: 'Snorkelling / Diving' },
  { name: 'Shopping' },
  { name: 'Live Music / Events' },
  { name: 'Spa / Wellness' },
  { name: 'Other' },
] as const;

/** Default companions (7 rows) */
const COMPANIONS = [
  { name: 'Solo' },
  { name: 'Partner' },
  { name: 'Partner + Friends' },
  { name: 'Family' },
  { name: 'Friends' },
  { name: 'Work / Conference' },
  { name: 'Other' },
] as const;

/**
 * Default map shading configuration (6 rows).
 *
 * state_key values are application constants — never user-editable.
 * display_name and color_hex are user-configurable via the admin panel (MP-04).
 * Default colours from _project/seed-data.txt.
 *
 * NOTE: 'never_visited' is intentionally absent — it has no shading (MP-05).
 */
const MAP_SHADING_CONFIG = [
  {
    stateKey: 'active',
    displayName: 'Active',
    colorHex: '#2196F3', // Bright blue
  },
  {
    stateKey: 'planned',
    displayName: 'Planned',
    colorHex: '#CE93D8', // Light purple
  },
  {
    stateKey: 'visited_once',
    displayName: 'Visited once',
    colorHex: '#A5D6A7', // Light green
  },
  {
    stateKey: 'visited_once_planning',
    displayName: 'Visited once + planning',
    colorHex: '#66BB6A', // Medium green
  },
  {
    stateKey: 'visited_multiple',
    displayName: 'Visited multiple times',
    colorHex: '#2E7D32', // Dark green
  },
  {
    stateKey: 'visited_multiple_planning',
    displayName: 'Visited multiple times + planning',
    colorHex: '#F9A825', // Gold
  },
] as const;

// ----------------------------------------------------------------
// Seed runner
// ----------------------------------------------------------------

/**
 * Seeds all default admin list tables.
 * Each insert uses onConflictDoNothing() to skip rows that already exist,
 * making the operation safe to repeat without side effects.
 *
 * @returns void — exits process with code 1 on any error
 */
async function seed(): Promise<void> {
  console.log('[SEED] Starting seed...\n');

  const db = getDb();

  // -- trip_categories ----------------------------------------
  await db
    .insert(tripCategories)
    .values([...TRIP_CATEGORIES])
    .onConflictDoNothing();
  console.log(
    `✓ trip_categories seeded (${TRIP_CATEGORIES.length} rows attempted)`,
  );

  // -- activities ---------------------------------------------
  await db
    .insert(activities)
    .values([...ACTIVITIES])
    .onConflictDoNothing();
  console.log(`✓ activities seeded (${ACTIVITIES.length} rows attempted)`);

  // -- companions ---------------------------------------------
  await db
    .insert(companions)
    .values([...COMPANIONS])
    .onConflictDoNothing();
  console.log(`✓ companions seeded (${COMPANIONS.length} rows attempted)`);

  // -- map_shading_config -------------------------------------
  await db
    .insert(mapShadingConfig)
    .values([...MAP_SHADING_CONFIG])
    .onConflictDoNothing();
  console.log(
    `✓ map_shading_config seeded (${MAP_SHADING_CONFIG.length} rows attempted)`,
  );

  console.log('\n[SEED] Complete.');
}

// Run and handle errors
seed().catch((err: unknown) => {
  console.error('[SEED] Error:', err);
  process.exit(1);
});

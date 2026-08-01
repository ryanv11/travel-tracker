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

import { activityRepository } from '../repositories/activities.js';
import { tripCategoryRepository } from '../repositories/tripCategories.js';
import { getDb } from './index.js';
import { users } from './schema.js';

/**
 * Seeds default per-user admin lists for every existing user.
 * Each per-user seed uses onConflictDoNothing() — safe to repeat.
 *
 * ADL-46 (AD-09, D3): trip_categories and activities are per-user now
 * (userId NOT NULL FK) — there is no global default list to seed. This script
 * back-fills the default categories/activities for every existing user; new
 * users are lazily seeded on first access (repositories' ensureSeeded).
 *
 * ADL-28 (AD-07/AD-08): companions and map_shading_config are likewise per-user;
 * companions have no default list post-migration, and map_shading_config is
 * lazily seeded per-user on first access to the shading config endpoint.
 */
async function seed(): Promise<void> {
  console.log('[SEED] Starting seed...\n');
  const db = getDb();

  const allUsers = await db.select({ id: users.id }).from(users);
  for (const u of allUsers) {
    await tripCategoryRepository.ensureSeeded(u.id);
    await activityRepository.ensureSeeded(u.id);
  }
  console.log(`✓ per-user categories/activities seeded for ${allUsers.length} user(s)`);

  console.log('\n[SEED] Complete.');
}

seed().catch((err: unknown) => {
  console.error('[SEED] Error:', err);
  process.exit(1);
});

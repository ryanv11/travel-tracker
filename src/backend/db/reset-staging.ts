/**
 * Travel Tracker — Staging Database Reset (CLI script)
 *
 * Wipes all user-owned / trip data from a Turso database (users, trips, and
 * everything that cascades from a trip) so that PR preview environments do
 * not accumulate test-data cruft across sessions. Reference/admin data
 * (trip_categories, activities, companions, map_shading_config, countries,
 * regions, cities) is intentionally left untouched — see the "what is NOT
 * reset" note below.
 *
 * SAFETY MODEL (this deletes real rows, so it defaults to inert):
 *   1. Dry run by default. Pass --yes to actually delete anything.
 *   2. When the resolved SQLITE_PATH is a remote (libsql:// or https://) URL,
 *      the script refuses to run — even with --yes — unless the URL contains
 *      the substring "staging". This is a deliberate blunt guardrail against
 *      fat-fingering this against the production Turso database: it is not
 *      a security control, just a footgun-removal check. Pass
 *      --i-know-what-im-doing to bypass it (e.g. if Ryan ever renames the
 *      staging DB). file: URLs (local dev) are exempt — low stakes, already
 *      gitignored, throwaway.
 *   3. Deletes are issued in explicit child-before-parent order via Drizzle's
 *      query builder (never raw/concatenated SQL — Shared Standard 21). This
 *      does NOT rely on SQLite's ON DELETE CASCADE actually firing, because
 *      whether libSQL enforces FK constraints (PRAGMA foreign_keys) is a
 *      connection-level setting this script does not control or want to
 *      assume — see the reset runbook for detail.
 *
 * WHAT IS NOT RESET: countries, regions, cities, trip_categories, activities,
 * companions, map_shading_config. These are reference/admin data, not test
 * cruft — cities in particular grows from real place names entered during
 * testing, but it is deduplicated (BUG-33 unique index) and naturally
 * bounded by real-world geography, not worth truncating. Admin/reference
 * tables also self-heal on every server boot (seedAdminData/seedCountries/
 * seedRegions in startup.service.ts are idempotent, insert-if-missing) and
 * `users` self-heals on next sign-in (findOrCreateByClerkId) — so this
 * script does not strictly need to re-seed anything after deleting; it does
 * so anyway for immediacy rather than waiting on the next Railway restart or
 * sign-in.
 *
 * Usage:
 *   npm run db:reset-staging                        # dry run — prints counts only
 *   npm run db:reset-staging -- --yes                # actually deletes + reseeds
 *   npm run db:reset-staging -- --yes --i-know-what-im-doing   # bypass the "staging" name check
 *
 * See jobs/database/tech/20260721-staging-reset-runbook.md for the full
 * reset cadence this script implements.
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

import { getDb } from './index.js';
import {
  activities,
  companions,
  itemCarRentals,
  itemExperiences,
  itemFlights,
  itemHotels,
  itemRestaurants,
  items,
  mapShadingConfig,
  tripActivitiesMap,
  tripCategories,
  tripCategoriesMap,
  tripCompanionsMap,
  tripCountries,
  tripPlaceActivitiesMap,
  tripPlaces,
  trips,
  users,
} from './schema.js';
import { ACTIVITIES, COMPANIONS, MAP_SHADING_CONFIG, TRIP_CATEGORIES } from './seed-data.js';

// Ordered child-before-parent. Every entry here must appear before anything
// it references via a FK. Update this list if the schema grows new tables
// that hang off trips/items/users.
const RESET_TABLES = [
  { name: 'item_flights', table: itemFlights },
  { name: 'item_hotels', table: itemHotels },
  { name: 'item_car_rentals', table: itemCarRentals },
  { name: 'item_restaurants', table: itemRestaurants },
  { name: 'item_experiences', table: itemExperiences },
  { name: 'items', table: items },
  { name: 'trip_place_activities_map', table: tripPlaceActivitiesMap },
  { name: 'trip_places', table: tripPlaces },
  { name: 'trip_countries', table: tripCountries },
  { name: 'trip_activities_map', table: tripActivitiesMap },
  { name: 'trip_companions_map', table: tripCompanionsMap },
  { name: 'trip_categories_map', table: tripCategoriesMap },
  { name: 'trips', table: trips },
  { name: 'users', table: users },
] as const;

/**
 * Refuses to proceed if the resolved connection URL looks like it could be
 * the production Turso database. See module docstring for the exact rule.
 */
function assertSafeTarget(url: string, bypass: boolean): void {
  const isRemote = url.startsWith('libsql://') || url.startsWith('https://');
  if (!isRemote) return; // local file: URL — exempt, low stakes

  if (!url.toLowerCase().includes('staging') && !bypass) {
    throw new Error(
      `[RESET] Refusing to run: connection URL ("${url}") is a remote URL that does ` +
        'not contain "staging". This script is only meant to run against the staging ' +
        'Turso database. If this really is the intended target, re-run with ' +
        '--i-know-what-im-doing.',
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--yes');
  const bypassNameCheck = args.includes('--i-know-what-im-doing');

  // Same resolution priority as getDb() (src/backend/db/index.ts): a remote
  // TURSO_DATABASE_URL wins if set, otherwise fall back to local SQLITE_PATH.
  const url = process.env.TURSO_DATABASE_URL || process.env.SQLITE_PATH;
  if (!url) {
    throw new Error(
      '[RESET] Neither TURSO_DATABASE_URL nor SQLITE_PATH is set — nothing to reset against.',
    );
  }
  assertSafeTarget(url, bypassNameCheck);

  console.log(`[RESET] Target: ${url}`);
  console.log(
    `[RESET] Mode: ${confirmed ? 'LIVE (--yes passed)' : 'DRY RUN (pass --yes to delete)'}\n`,
  );

  const db = getDb();

  // Dry run: report row counts per table, delete nothing.
  if (!confirmed) {
    for (const { name, table } of RESET_TABLES) {
      const rows = await db.select().from(table as never);
      console.log(`  ${name}: ${rows.length} row(s) would be deleted`);
    }
    console.log('\n[RESET] Dry run complete. No rows were deleted. Pass --yes to apply.');
    return;
  }

  // Live: delete in child-before-parent order.
  for (const { name, table } of RESET_TABLES) {
    await db.delete(table as never);
    console.log(`  ✓ cleared ${name}`);
  }

  // Reseed admin/reference lists immediately rather than waiting on the next
  // Railway restart's idempotent startup seed. Safe to repeat — onConflictDoNothing.
  await db
    .insert(tripCategories)
    .values([...TRIP_CATEGORIES])
    .onConflictDoNothing();
  await db
    .insert(activities)
    .values([...ACTIVITIES])
    .onConflictDoNothing();
  await db
    .insert(companions)
    .values([...COMPANIONS])
    .onConflictDoNothing();
  await db
    .insert(mapShadingConfig)
    .values([...MAP_SHADING_CONFIG])
    .onConflictDoNothing();

  console.log('\n[RESET] Complete. Trip/user data cleared; admin lists re-seeded.');
  console.log('[RESET] countries/regions/cities were left untouched (see module docstring).');
}

main().catch((err: unknown) => {
  console.error('[RESET] Error:', err);
  process.exit(1);
});

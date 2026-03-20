/**
 * Integration tests for getAllCountryShading() — ADL-23 case (d).
 *
 * Case (d): a country appears in trip_countries but has NO city visits
 * (no trip_places rows). Before ADL-23, such a country would show as
 * 'never_visited' because getAllCountryShading() only joined through
 * trip_places. After ADL-23 the service must union trip_countries,
 * so a planning trip linked via trip_countries gets 'planned'.
 *
 * These tests use an in-memory libSQL database. They exercise the
 * real getAllCountryShading() function (not mocked), so they will
 * fail if the Backend API agent's ADL-23 implementation is not yet
 * merged — that is expected and is documented in the PR description.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../../db/schema.js';

// ----------------------------------------------------------------
// In-memory DB factory
// ----------------------------------------------------------------

async function createTestDb() {
  const client = createClient({ url: ':memory:' });
  await client.execute('PRAGMA foreign_keys = ON;');

  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS countries (
      country_code TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      region_tier_enabled INTEGER DEFAULT 0 NOT NULL,
      region_tier_label TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      country_code TEXT NOT NULL,
      name TEXT NOT NULL,
      iso_3166_2 TEXT NOT NULL DEFAULT 'XX-UNKNOWN',
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      FOREIGN KEY (country_code) REFERENCES countries(country_code)
    )`,
    `CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      country_code TEXT NOT NULL,
      region_id INTEGER,
      name TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      geocode_status TEXT DEFAULT 'pending' NOT NULL,
      geocode_attempted_at TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      FOREIGN KEY (country_code) REFERENCES countries(country_code),
      FOREIGN KEY (region_id) REFERENCES regions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      clerk_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'planning' NOT NULL,
      photo_album_ref TEXT,
      user_id TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS trip_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS trip_categories_map (
      trip_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (trip_id, category_id),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES trip_categories(id)
    )`,
    `CREATE TABLE IF NOT EXISTS companions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS trip_companions_map (
      trip_id INTEGER NOT NULL,
      companion_id INTEGER NOT NULL,
      PRIMARY KEY (trip_id, companion_id),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (companion_id) REFERENCES companions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS trip_activities_map (
      trip_id INTEGER NOT NULL,
      activity_id INTEGER NOT NULL,
      PRIMARY KEY (trip_id, activity_id),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (activity_id) REFERENCES activities(id)
    )`,
    `CREATE TABLE IF NOT EXISTS trip_places (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      trip_id INTEGER NOT NULL,
      city_id INTEGER NOT NULL,
      user_id TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (city_id) REFERENCES cities(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS trip_place_activities_map (
      trip_place_id INTEGER NOT NULL,
      activity_id INTEGER NOT NULL,
      PRIMARY KEY (trip_place_id, activity_id),
      FOREIGN KEY (trip_place_id) REFERENCES trip_places(id) ON DELETE CASCADE,
      FOREIGN KEY (activity_id) REFERENCES activities(id)
    )`,
    `CREATE TABLE IF NOT EXISTS trip_countries (
      trip_id INTEGER NOT NULL,
      country_code TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      PRIMARY KEY (trip_id, country_code),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (country_code) REFERENCES countries(country_code) ON DELETE RESTRICT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_trip_countries_country ON trip_countries (country_code)`,
    `CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      trip_id INTEGER NOT NULL,
      trip_place_id INTEGER,
      item_type TEXT NOT NULL,
      status TEXT DEFAULT 'consider' NOT NULL,
      notes TEXT,
      is_carried_forward INTEGER DEFAULT 0 NOT NULL,
      carried_from_item_id INTEGER,
      user_id TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (trip_place_id) REFERENCES trip_places(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS item_flights (
      item_id INTEGER PRIMARY KEY NOT NULL,
      airline TEXT, flight_number TEXT, departure_airport TEXT, arrival_airport TEXT,
      departure_datetime TEXT, arrival_datetime TEXT, booking_reference TEXT, seat TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS item_hotels (
      item_id INTEGER PRIMARY KEY NOT NULL,
      property_name TEXT, address TEXT, check_in_date TEXT, check_out_date TEXT,
      booking_reference TEXT, confirmation_number TEXT, rating INTEGER, post_visit_notes TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS item_car_rentals (
      item_id INTEGER PRIMARY KEY NOT NULL,
      provider TEXT, pickup_location TEXT, dropoff_location TEXT,
      pickup_datetime TEXT, dropoff_datetime TEXT, booking_reference TEXT, vehicle_class TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS item_restaurants (
      item_id INTEGER PRIMARY KEY NOT NULL,
      name TEXT, neighbourhood_area TEXT, cuisine_type TEXT, source TEXT,
      rating INTEGER, post_visit_notes TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS item_experiences (
      item_id INTEGER PRIMARY KEY NOT NULL,
      rating INTEGER, post_visit_notes TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS map_shading_config (
      state_key TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      color_hex TEXT NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    )`,
  ];

  for (const sql of ddlStatements) {
    await client.execute(sql);
  }

  return drizzle(client, { schema });
}

// ----------------------------------------------------------------
// Mock getDb
// ----------------------------------------------------------------

let testDb: Awaited<ReturnType<typeof createTestDb>> | null = null;

vi.mock('../../db/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../db/index.js')>();
  return {
    ...real,
    getDb: () => {
      if (!testDb) throw new Error('[TEST] testDb not initialised');
      return testDb;
    },
  };
});

// Import after mock is declared (Vitest hoists vi.mock above imports)
const { getAllCountryShading, invalidateConfigCache } = await import('../shading.service.js');

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

const TEST_USER_ID = 'test-user-id';

async function seedTestUser(db: Awaited<ReturnType<typeof createTestDb>>) {
  const now = Date.now();
  await db.insert(schema.users).values({
    id: TEST_USER_ID,
    clerkId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }).onConflictDoNothing();
}

describe('getAllCountryShading() — ADL-23 case (d): trip_countries path', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    // Invalidate the in-memory config cache so each test starts clean
    invalidateConfigCache();
  });

  afterEach(() => {
    testDb = null;
    invalidateConfigCache();
  });

  it('returns "planned" for JP when a planning trip has a trip_countries row for JP but no city visits', async () => {
    const db = testDb!;

    // Seed JP country
    await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });

    // Seed a planning trip — no trip_places, only a trip_countries row
    const [trip] = await db.insert(schema.trips).values({
      name: 'Japan Planning Trip',
      startDate: '2026-09-01',
      endDate: '2026-09-14',
      status: 'planning',
      userId: TEST_USER_ID,
    }).returning();

    await db.insert(schema.tripCountries).values({
      tripId: trip.id,
      countryCode: 'JP',
    });

    const results = await getAllCountryShading();

    const jpResult = results.find((r) => r.countryCode === 'JP');
    expect(jpResult).toBeDefined();
    expect(jpResult!.stateKey).toBe('planned');
  });

  it('returns "never_visited" for JP when there are no trips or trip_countries rows', async () => {
    const db = testDb!;
    await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });

    const results = await getAllCountryShading();

    const jpResult = results.find((r) => r.countryCode === 'JP');
    expect(jpResult).toBeDefined();
    expect(jpResult!.stateKey).toBe('never_visited');
  });

  it('returns "visited_once" for JP when a locked trip has a trip_countries row for JP and no city visits', async () => {
    const db = testDb!;
    await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });

    const [trip] = await db.insert(schema.trips).values({
      name: 'Japan Completed Trip',
      startDate: '2025-06-01',
      endDate: '2025-06-14',
      status: 'locked',
      userId: TEST_USER_ID,
    }).returning();

    await db.insert(schema.tripCountries).values({
      tripId: trip.id,
      countryCode: 'JP',
    });

    const results = await getAllCountryShading();

    const jpResult = results.find((r) => r.countryCode === 'JP');
    expect(jpResult).toBeDefined();
    expect(jpResult!.stateKey).toBe('visited_once');
  });

  it('trip_countries path does not affect countries with no trip association', async () => {
    const db = testDb!;
    await db.insert(schema.countries).values([
      { countryCode: 'JP', name: 'Japan' },
      { countryCode: 'DE', name: 'Germany' },
    ]);

    // JP has a planning trip via trip_countries
    const [trip] = await db.insert(schema.trips).values({
      name: 'Japan Trip',
      startDate: '2026-09-01',
      endDate: '2026-09-14',
      status: 'planning',
      userId: TEST_USER_ID,
    }).returning();

    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    const results = await getAllCountryShading();

    // JP should be planned; DE should be never_visited
    const jpResult = results.find((r) => r.countryCode === 'JP');
    const deResult = results.find((r) => r.countryCode === 'DE');

    expect(jpResult!.stateKey).toBe('planned');
    expect(deResult!.stateKey).toBe('never_visited');
  });
});

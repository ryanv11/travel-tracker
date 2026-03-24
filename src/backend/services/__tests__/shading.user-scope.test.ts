/**
 * Unit tests for HC-03 — user-scoped shading queries.
 *
 * Verifies that getAllCountryShading(), getCountryShading(), and getRegionShading()
 * return data scoped to the given userId, i.e. user A cannot see user B's trips.
 *
 * Uses an in-memory libSQL database (same approach as shading.trip-countries.test.ts).
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';

// ----------------------------------------------------------------
// In-memory DB factory (duplicated from shading.trip-countries.test.ts)
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
      is_owner INTEGER DEFAULT 0 NOT NULL,
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
      arrived_on TEXT,
      departed_on TEXT,
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
const { getAllCountryShading, getCountryShading, getRegionShading, invalidateConfigCache } =
  await import('../shading.service.js');

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

const OWNER_USER_ID = 'owner-user-id';
const OTHER_USER_ID = 'other-user-id';

async function seedUsers(db: Awaited<ReturnType<typeof createTestDb>>) {
  const now = Date.now();
  await db.insert(schema.users).values([
    {
      id: OWNER_USER_ID,
      clerkId: 'clerk_owner',
      email: 'owner@example.com',
      isOwner: 1,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
    {
      id: OTHER_USER_ID,
      clerkId: 'clerk_other',
      email: 'other@example.com',
      isOwner: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
  ]);
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('HC-03 — shading queries scoped to userId', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedUsers(testDb);
    invalidateConfigCache();
  });

  afterEach(() => {
    testDb = null;
    invalidateConfigCache();
  });

  // ----------------------------------------------------------------
  // getAllCountryShading
  // ----------------------------------------------------------------

  describe('getAllCountryShading(userId)', () => {
    it('owner sees their own trips — country shows visited_once', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });
      const city = await db
        .insert(schema.cities)
        .values({ countryCode: 'JP', name: 'Tokyo' })
        .returning();

      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'Japan Trip',
          startDate: '2025-06-01',
          endDate: '2025-06-14',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();

      await db.insert(schema.tripPlaces).values({ tripId: trip.id, cityId: city[0].id });

      const results = await getAllCountryShading(OWNER_USER_ID);
      const jp = results.find((r) => r.countryCode === 'JP');
      expect(jp).toBeDefined();
      expect(jp!.stateKey).toBe('visited_once');
    });

    it('other user sees never_visited for country visited only by owner (city-visit path)', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });
      const city = await db
        .insert(schema.cities)
        .values({ countryCode: 'JP', name: 'Tokyo' })
        .returning();

      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'Japan Trip',
          startDate: '2025-06-01',
          endDate: '2025-06-14',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();

      await db.insert(schema.tripPlaces).values({ tripId: trip.id, cityId: city[0].id });

      const results = await getAllCountryShading(OTHER_USER_ID);
      const jp = results.find((r) => r.countryCode === 'JP');
      expect(jp).toBeDefined();
      expect(jp!.stateKey).toBe('never_visited');
    });

    it('other user sees never_visited for country visited only by owner (trip_countries path)', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });

      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'Japan Trip',
          startDate: '2025-06-01',
          endDate: '2025-06-14',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();

      await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

      const results = await getAllCountryShading(OTHER_USER_ID);
      const jp = results.find((r) => r.countryCode === 'JP');
      expect(jp).toBeDefined();
      expect(jp!.stateKey).toBe('never_visited');
    });

    it('two users have independent shading — each sees only their own trips', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values([
        { countryCode: 'JP', name: 'Japan' },
        { countryCode: 'DE', name: 'Germany' },
      ]);

      const [jpCity] = await db
        .insert(schema.cities)
        .values({ countryCode: 'JP', name: 'Tokyo' })
        .returning();
      const [deCity] = await db
        .insert(schema.cities)
        .values({ countryCode: 'DE', name: 'Berlin' })
        .returning();

      // Owner visited JP
      const [ownerTrip] = await db
        .insert(schema.trips)
        .values({
          name: 'Owner Japan Trip',
          startDate: '2025-06-01',
          endDate: '2025-06-14',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();
      await db.insert(schema.tripPlaces).values({ tripId: ownerTrip.id, cityId: jpCity.id });

      // Other user visited DE
      const [otherTrip] = await db
        .insert(schema.trips)
        .values({
          name: 'Other Germany Trip',
          startDate: '2025-07-01',
          endDate: '2025-07-10',
          status: 'locked',
          userId: OTHER_USER_ID,
        })
        .returning();
      await db.insert(schema.tripPlaces).values({ tripId: otherTrip.id, cityId: deCity.id });

      // Owner sees JP visited, DE never visited
      const ownerResults = await getAllCountryShading(OWNER_USER_ID);
      expect(ownerResults.find((r) => r.countryCode === 'JP')!.stateKey).toBe('visited_once');
      expect(ownerResults.find((r) => r.countryCode === 'DE')!.stateKey).toBe('never_visited');

      // Other user sees DE visited, JP never visited
      const otherResults = await getAllCountryShading(OTHER_USER_ID);
      expect(otherResults.find((r) => r.countryCode === 'JP')!.stateKey).toBe('never_visited');
      expect(otherResults.find((r) => r.countryCode === 'DE')!.stateKey).toBe('visited_once');
    });
  });

  // ----------------------------------------------------------------
  // getCountryShading
  // ----------------------------------------------------------------

  describe('getCountryShading(countryCode, userId)', () => {
    it('owner sees visited_once for their own trip', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values({ countryCode: 'FR', name: 'France' });
      const [city] = await db
        .insert(schema.cities)
        .values({ countryCode: 'FR', name: 'Paris' })
        .returning();
      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'France Trip',
          startDate: '2025-05-01',
          endDate: '2025-05-07',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();
      await db.insert(schema.tripPlaces).values({ tripId: trip.id, cityId: city.id });

      const result = await getCountryShading('FR', OWNER_USER_ID);
      expect(result).not.toBeNull();
      expect(result!.stateKey).toBe('visited_once');
    });

    it('other user sees never_visited for country visited only by owner', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values({ countryCode: 'FR', name: 'France' });
      const [city] = await db
        .insert(schema.cities)
        .values({ countryCode: 'FR', name: 'Paris' })
        .returning();
      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'France Trip',
          startDate: '2025-05-01',
          endDate: '2025-05-07',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();
      await db.insert(schema.tripPlaces).values({ tripId: trip.id, cityId: city.id });

      const result = await getCountryShading('FR', OTHER_USER_ID);
      expect(result).not.toBeNull();
      expect(result!.stateKey).toBe('never_visited');
    });
  });

  // ----------------------------------------------------------------
  // getRegionShading
  // ----------------------------------------------------------------

  describe('getRegionShading(countryCode, userId)', () => {
    it('owner sees visited_once for their own trip in a region', async () => {
      const db = testDb!;
      await db
        .insert(schema.countries)
        .values({ countryCode: 'AU', name: 'Australia', regionTierEnabled: 1 });
      const [region] = await db
        .insert(schema.regions)
        .values({ countryCode: 'AU', name: 'New South Wales', iso3166_2: 'AU-NSW' })
        .returning();
      const [city] = await db
        .insert(schema.cities)
        .values({ countryCode: 'AU', name: 'Sydney', regionId: region.id })
        .returning();
      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'AU Trip',
          startDate: '2025-03-01',
          endDate: '2025-03-07',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();
      await db.insert(schema.tripPlaces).values({ tripId: trip.id, cityId: city.id });

      const results = await getRegionShading('AU', OWNER_USER_ID);
      const nsw = results.find((r) => r.iso3166_2 === 'AU-NSW');
      expect(nsw).toBeDefined();
      expect(nsw!.stateKey).toBe('visited_once');
    });

    it('other user sees never_visited for region visited only by owner', async () => {
      const db = testDb!;
      await db
        .insert(schema.countries)
        .values({ countryCode: 'AU', name: 'Australia', regionTierEnabled: 1 });
      const [region] = await db
        .insert(schema.regions)
        .values({ countryCode: 'AU', name: 'New South Wales', iso3166_2: 'AU-NSW' })
        .returning();
      const [city] = await db
        .insert(schema.cities)
        .values({ countryCode: 'AU', name: 'Sydney', regionId: region.id })
        .returning();
      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'AU Trip',
          startDate: '2025-03-01',
          endDate: '2025-03-07',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();
      await db.insert(schema.tripPlaces).values({ tripId: trip.id, cityId: city.id });

      const results = await getRegionShading('AU', OTHER_USER_ID);
      const nsw = results.find((r) => r.iso3166_2 === 'AU-NSW');
      expect(nsw).toBeDefined();
      expect(nsw!.stateKey).toBe('never_visited');
    });
  });
});

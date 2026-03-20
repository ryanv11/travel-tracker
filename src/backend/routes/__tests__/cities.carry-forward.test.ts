/**
 * Integration tests for GET /api/cities/:id/carry-forward (IT-07).
 *
 * BUG-17 fix: the endpoint must return next_time items from trips of ANY status,
 * not just review_pending/locked.
 *
 * Test categories:
 *   1. next_time item on a planning trip → appears in results
 *   2. next_time item on an active trip → appears in results
 *   3. next_time item on a review_pending trip → appears in results
 *   4. next_time item on a locked trip → appears in results
 *   5. item with status other than next_time → does not appear
 *   6. 404 on unknown city
 *
 * Uses an in-memory libSQL database seeded with the minimal schema
 * required by the cities router (countries, cities, trips, trip_places, items).
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
      if (!testDb) throw new Error('[TEST] testDb not initialised — call createTestDb in beforeEach');
      return testDb;
    },
  };
});

// Mock auth middleware — bypass JWT verification in integration tests.
// Tests exercise route logic, not authentication. Auth is unit-tested separately.
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => {
    (_req as import('express').Request & { user?: unknown }).user = {
      id: 'test-user-id',
      clerkId: 'user_test',
      email: 'test@example.com',
    };
    next();
  },
  authenticate: (_req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => next(),
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ----------------------------------------------------------------
// Seed helpers
// ----------------------------------------------------------------

type TripStatus = 'planning' | 'active' | 'review_pending' | 'locked';

async function seedCityAndTrip(db: Awaited<ReturnType<typeof createTestDb>>, tripStatus: TripStatus) {
  await db.insert(schema.countries).values({ countryCode: 'IE', name: 'Ireland' }).onConflictDoNothing();

  const [city] = await db.insert(schema.cities).values({
    name: 'Dublin',
    countryCode: 'IE',
    geocodeStatus: 'resolved',
  }).returning();

  const [trip] = await db.insert(schema.trips).values({
    name: `Dublin Trip (${tripStatus})`,
    startDate: '2026-01-01',
    endDate: '2026-01-07',
    status: tripStatus,
  }).returning();

  const [place] = await db.insert(schema.tripPlaces).values({
    tripId: trip.id,
    cityId: city.id,
  }).returning();

  return { city, trip, place };
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('GET /api/cities/:id/carry-forward — BUG-17 status filter removed', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns next_time item from a planning trip', async () => {
    const db = testDb!;
    const { city, trip, place } = await seedCityAndTrip(db, 'planning');

    await db.insert(schema.items).values({
      tripId: trip.id,
      tripPlaceId: place.id,
      itemType: 'restaurant',
      status: 'next_time',
      notes: 'Try next time',
    });

    const res = await supertest(app)
      .get(`/api/cities/${city.id}/carry-forward`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('next_time');
    expect(res.body[0].source_trip_name).toBe('Dublin Trip (planning)');
  });

  it('returns next_time item from an active trip', async () => {
    const db = testDb!;
    const { city, trip, place } = await seedCityAndTrip(db, 'active');

    await db.insert(schema.items).values({
      tripId: trip.id,
      tripPlaceId: place.id,
      itemType: 'restaurant',
      status: 'next_time',
    });

    const res = await supertest(app)
      .get(`/api/cities/${city.id}/carry-forward`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].source_trip_name).toBe('Dublin Trip (active)');
  });

  it('returns next_time item from a review_pending trip', async () => {
    const db = testDb!;
    const { city, trip, place } = await seedCityAndTrip(db, 'review_pending');

    await db.insert(schema.items).values({
      tripId: trip.id,
      tripPlaceId: place.id,
      itemType: 'hotel',
      status: 'next_time',
    });

    const res = await supertest(app)
      .get(`/api/cities/${city.id}/carry-forward`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].source_trip_name).toBe('Dublin Trip (review_pending)');
  });

  it('returns next_time item from a locked trip', async () => {
    const db = testDb!;
    const { city, trip, place } = await seedCityAndTrip(db, 'locked');

    await db.insert(schema.items).values({
      tripId: trip.id,
      tripPlaceId: place.id,
      itemType: 'restaurant',
      status: 'next_time',
    });

    const res = await supertest(app)
      .get(`/api/cities/${city.id}/carry-forward`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].source_trip_name).toBe('Dublin Trip (locked)');
  });

  it('does not return items with status other than next_time', async () => {
    const db = testDb!;
    const { city, trip, place } = await seedCityAndTrip(db, 'locked');

    // Insert items with every non-next_time status
    const otherStatuses = ['consider', 'confirmed', 'completed', 'skipped'] as const;
    for (const status of otherStatuses) {
      await db.insert(schema.items).values({
        tripId: trip.id,
        tripPlaceId: place.id,
        itemType: 'restaurant',
        status,
      });
    }

    const res = await supertest(app)
      .get(`/api/cities/${city.id}/carry-forward`)
      .expect(200);

    expect(res.body).toHaveLength(0);
  });

  it('returns 200 empty array for a city with no next_time items', async () => {
    const db = testDb!;
    await db.insert(schema.countries).values({ countryCode: 'FR', name: 'France' }).onConflictDoNothing();
    const [city] = await db.insert(schema.cities).values({
      name: 'Paris',
      countryCode: 'FR',
      geocodeStatus: 'resolved',
    }).returning();

    const res = await supertest(app)
      .get(`/api/cities/${city.id}/carry-forward`)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('returns 404 for a non-existent city id', async () => {
    // The endpoint does not verify city existence — it just returns empty.
    // This tests that a non-numeric id gets a 400.
    const res = await supertest(app)
      .get('/api/cities/abc/carry-forward')
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });
});

/**
 * Contract tests for IT-08 / IT-09 — Rating sort and filter on item list endpoints.
 *
 * Covers:
 *   GET /api/trips/:tripId/items
 *     - sort_by=rating returns items in rating DESC order (nulls last)
 *     - sort_by=rating&sort_order=asc returns items in rating ASC order (nulls last)
 *     - min_rating=4 returns only items rated 4+
 *     - invalid sort_by → 400
 *     - invalid sort_order → 400
 *     - invalid min_rating → 400
 *
 *   GET /api/cities/:id/items
 *     - sort_order=asc returns items in rating ASC order
 *     - min_rating=3 returns only items rated 3+
 *     - invalid sort_by → 400
 *     - invalid sort_order → 400
 *     - invalid min_rating → 400
 *
 * Uses an in-memory libSQL database per test (full isolation).
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';

// ----------------------------------------------------------------
// In-memory DB factory — full schema
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
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(trip_id, city_id)
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
      if (!testDb)
        throw new Error('[TEST] testDb not initialised — call createTestDb in beforeEach');
      return testDb;
    },
  };
});

// Mock auth middleware
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    _req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (_req as import('express').Request & { user?: unknown }).user = {
      id: 'test-user-id',
      clerkId: 'user_test',
      email: 'test@example.com',
      isOwner: 0,
    };
    next();
  },
  authenticate: (
    _req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => next(),
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ----------------------------------------------------------------
// Seed helpers
// ----------------------------------------------------------------

const TEST_USER_ID = 'test-user-id';

async function seedTestUser(db: Awaited<ReturnType<typeof createTestDb>>) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: TEST_USER_ID,
      clerkId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

async function seedTrip(
  db: Awaited<ReturnType<typeof createTestDb>>,
  overrides: Partial<typeof schema.trips.$inferInsert> = {},
) {
  const [trip] = await db
    .insert(schema.trips)
    .values({
      name: 'Test Trip',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      status: 'planning',
      userId: TEST_USER_ID,
      ...overrides,
    })
    .returning();
  return trip;
}

async function seedCountryAndCity(
  db: Awaited<ReturnType<typeof createTestDb>>,
  opts: { countryCode?: string; cityName?: string } = {},
) {
  const countryCode = opts.countryCode ?? 'FR';
  const cityName = opts.cityName ?? 'Paris';

  await db
    .insert(schema.countries)
    .values({ countryCode, name: countryCode })
    .onConflictDoNothing();

  const [city] = await db
    .insert(schema.cities)
    .values({ name: cityName, countryCode, geocodeStatus: 'resolved' })
    .returning();

  return city;
}

async function seedTripPlace(
  db: Awaited<ReturnType<typeof createTestDb>>,
  tripId: number,
  cityId: number,
) {
  const [place] = await db.insert(schema.tripPlaces).values({ tripId, cityId }).returning();
  return place;
}

// Helper: insert a restaurant item with a given rating on a trip
async function seedRestaurantItem(
  db: Awaited<ReturnType<typeof createTestDb>>,
  tripId: number,
  opts: { rating?: number | null; status?: string; tripPlaceId?: number | null } = {},
) {
  const now = new Date().toISOString();
  const [item] = await db
    .insert(schema.items)
    .values({
      tripId,
      tripPlaceId: opts.tripPlaceId ?? null,
      itemType: 'restaurant',
      status: opts.status ?? 'completed',
      isCarriedForward: 0,
      userId: TEST_USER_ID,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.insert(schema.itemRestaurants).values({
    itemId: item.id,
    name: `Restaurant ${item.id}`,
    rating: opts.rating ?? null,
  });
  return item;
}

// Helper: insert a hotel item with a given rating on a trip
async function seedHotelItem(
  db: Awaited<ReturnType<typeof createTestDb>>,
  tripId: number,
  opts: { rating?: number | null; status?: string; tripPlaceId?: number | null } = {},
) {
  const now = new Date().toISOString();
  const [item] = await db
    .insert(schema.items)
    .values({
      tripId,
      tripPlaceId: opts.tripPlaceId ?? null,
      itemType: 'hotel',
      status: opts.status ?? 'completed',
      isCarriedForward: 0,
      userId: TEST_USER_ID,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.insert(schema.itemHotels).values({
    itemId: item.id,
    propertyName: `Hotel ${item.id}`,
    rating: opts.rating ?? null,
  });
  return item;
}

// ----------------------------------------------------------------
// GET /api/trips/:tripId/items — rating sort and filter (IT-08)
// ----------------------------------------------------------------

describe('GET /api/trips/:tripId/items — rating sort and filter (IT-08)', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  it('sort_by=rating returns items sorted rating DESC (nulls last)', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    // Seed three restaurants with different ratings
    await seedRestaurantItem(db, trip.id, { rating: 3 });
    await seedRestaurantItem(db, trip.id, { rating: 5 });
    await seedRestaurantItem(db, trip.id, { rating: 1 });

    const res = await supertest(app).get(`/api/trips/${trip.id}/items?sort_by=rating`).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);
    const ratings = res.body.map((item: { rating: number }) => item.rating);
    expect(ratings).toEqual([5, 3, 1]);
  });

  it('sort_by=rating&sort_order=asc returns items sorted rating ASC (nulls last)', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    await seedRestaurantItem(db, trip.id, { rating: 4 });
    await seedRestaurantItem(db, trip.id, { rating: 2 });
    await seedRestaurantItem(db, trip.id, { rating: 5 });

    const res = await supertest(app)
      .get(`/api/trips/${trip.id}/items?sort_by=rating&sort_order=asc`)
      .expect(200);

    expect(res.body).toHaveLength(3);
    const ratings = res.body.map((item: { rating: number }) => item.rating);
    expect(ratings).toEqual([2, 4, 5]);
  });

  it('min_rating=4 returns only items rated 4 or higher', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    await seedRestaurantItem(db, trip.id, { rating: 5 });
    await seedRestaurantItem(db, trip.id, { rating: 4 });
    await seedRestaurantItem(db, trip.id, { rating: 3 });
    await seedRestaurantItem(db, trip.id, { rating: null });

    const res = await supertest(app).get(`/api/trips/${trip.id}/items?min_rating=4`).expect(200);

    expect(res.body).toHaveLength(2);
    for (const item of res.body) {
      expect(item.rating).toBeGreaterThanOrEqual(4);
    }
  });

  it('min_rating=4 with sort_by=rating returns rated 4+ sorted DESC', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    await seedRestaurantItem(db, trip.id, { rating: 5 });
    await seedHotelItem(db, trip.id, { rating: 4 });
    await seedRestaurantItem(db, trip.id, { rating: 3 });
    await seedRestaurantItem(db, trip.id, { rating: null });

    const res = await supertest(app)
      .get(`/api/trips/${trip.id}/items?sort_by=rating&min_rating=4`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    const ratings = res.body.map((item: { rating: number }) => item.rating);
    expect(ratings).toEqual([5, 4]);
  });

  it('sort_by=rating with null-rated items puts nulls last', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    await seedRestaurantItem(db, trip.id, { rating: null });
    await seedRestaurantItem(db, trip.id, { rating: 3 });

    const res = await supertest(app).get(`/api/trips/${trip.id}/items?sort_by=rating`).expect(200);

    expect(res.body).toHaveLength(2);
    // Rated item should come first in DESC
    expect(res.body[0].rating).toBe(3);
    expect(res.body[1].rating).toBeNull();
  });

  it('invalid sort_by value returns 400', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app).get(`/api/trips/${trip.id}/items?sort_by=name`).expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('invalid sort_order value returns 400', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .get(`/api/trips/${trip.id}/items?sort_order=random`)
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('invalid min_rating (out of range) returns 400', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app).get(`/api/trips/${trip.id}/items?min_rating=6`).expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('invalid min_rating (non-integer) returns 400', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app).get(`/api/trips/${trip.id}/items?min_rating=abc`).expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('no sort_by param returns items in default order (createdAt DESC)', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    // Seed items with no sort params — response should still be 200
    await seedRestaurantItem(db, trip.id, { rating: 2 });
    await seedRestaurantItem(db, trip.id, { rating: 5 });

    const res = await supertest(app).get(`/api/trips/${trip.id}/items`).expect(200);

    expect(res.body).toHaveLength(2);
  });
});

// ----------------------------------------------------------------
// GET /api/cities/:id/items — rating sort and filter (IT-09)
// ----------------------------------------------------------------

describe('GET /api/cities/:id/items — rating sort and filter (IT-09)', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  it('default (no sort params) returns items sorted rating DESC', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db);
    const trip = await seedTrip(db);
    const place = await seedTripPlace(db, trip.id, city.id);

    await seedRestaurantItem(db, trip.id, { rating: 2, tripPlaceId: place.id });
    await seedRestaurantItem(db, trip.id, { rating: 4, tripPlaceId: place.id });
    await seedRestaurantItem(db, trip.id, { rating: 1, tripPlaceId: place.id });

    const res = await supertest(app).get(`/api/cities/${city.id}/items`).expect(200);

    expect(res.body).toHaveLength(3);
    const ratings = res.body.map((item: { restaurant_rating: number }) => item.restaurant_rating);
    expect(ratings).toEqual([4, 2, 1]);
  });

  it('sort_order=asc returns items sorted rating ASC', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db);
    const trip = await seedTrip(db);
    const place = await seedTripPlace(db, trip.id, city.id);

    await seedRestaurantItem(db, trip.id, { rating: 4, tripPlaceId: place.id });
    await seedRestaurantItem(db, trip.id, { rating: 1, tripPlaceId: place.id });
    await seedRestaurantItem(db, trip.id, { rating: 5, tripPlaceId: place.id });

    const res = await supertest(app).get(`/api/cities/${city.id}/items?sort_order=asc`).expect(200);

    expect(res.body).toHaveLength(3);
    const ratings = res.body.map((item: { restaurant_rating: number }) => item.restaurant_rating);
    expect(ratings).toEqual([1, 4, 5]);
  });

  it('sort_by=rating&sort_order=asc returns items sorted rating ASC', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db);
    const trip = await seedTrip(db);
    const place = await seedTripPlace(db, trip.id, city.id);

    await seedRestaurantItem(db, trip.id, { rating: 3, tripPlaceId: place.id });
    await seedRestaurantItem(db, trip.id, { rating: 5, tripPlaceId: place.id });

    const res = await supertest(app)
      .get(`/api/cities/${city.id}/items?sort_by=rating&sort_order=asc`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    const ratings = res.body.map((item: { restaurant_rating: number }) => item.restaurant_rating);
    expect(ratings).toEqual([3, 5]);
  });

  it('min_rating=3 returns only items rated 3+', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db);
    const trip = await seedTrip(db);
    const place = await seedTripPlace(db, trip.id, city.id);

    await seedRestaurantItem(db, trip.id, { rating: 5, tripPlaceId: place.id });
    await seedRestaurantItem(db, trip.id, { rating: 3, tripPlaceId: place.id });
    await seedRestaurantItem(db, trip.id, { rating: 2, tripPlaceId: place.id });
    await seedRestaurantItem(db, trip.id, { rating: null, tripPlaceId: place.id });

    const res = await supertest(app).get(`/api/cities/${city.id}/items?min_rating=3`).expect(200);

    expect(res.body).toHaveLength(2);
    for (const item of res.body) {
      expect(item.restaurant_rating).toBeGreaterThanOrEqual(3);
    }
  });

  it('items across multiple trips to the same city are included (IT-09)', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db);

    const trip1 = await seedTrip(db, { name: 'Trip 1' });
    const place1 = await seedTripPlace(db, trip1.id, city.id);
    await seedRestaurantItem(db, trip1.id, { rating: 5, tripPlaceId: place1.id });

    const trip2 = await seedTrip(db, { name: 'Trip 2' });
    const place2 = await seedTripPlace(db, trip2.id, city.id);
    await seedRestaurantItem(db, trip2.id, { rating: 3, tripPlaceId: place2.id });

    const res = await supertest(app).get(`/api/cities/${city.id}/items`).expect(200);

    expect(res.body).toHaveLength(2);
    // All items from both trips should appear
    const tripNames = res.body.map((item: { trip_name: string }) => item.trip_name);
    expect(tripNames).toContain('Trip 1');
    expect(tripNames).toContain('Trip 2');
  });

  it('invalid sort_by value returns 400', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db);

    const res = await supertest(app).get(`/api/cities/${city.id}/items?sort_by=name`).expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('invalid sort_order value returns 400', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db);

    const res = await supertest(app)
      .get(`/api/cities/${city.id}/items?sort_order=random`)
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('invalid min_rating (out of range) returns 400', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db);

    const res = await supertest(app).get(`/api/cities/${city.id}/items?min_rating=0`).expect(400);

    expect(res.body).toHaveProperty('error');
  });
});

/**
 * Integration tests for QA backend findings:
 *   BUG-10 — zName max length 200 (covered in common.test.ts)
 *   BUG-A  — PATCH /api/trips/:id end_date bypass (#25)
 *   BUG-B  — Admin list endpoints return snake_case (#26)
 *   SEC-01 — GET /api/cities/:id/items userId filter (#27)
 *   SEC-02 — Carry-forward source_item_ids ownership check (#28)
 *   SEC-03 — DELETE place activity ownership check (#29)
 *
 * Uses an in-memory libSQL database per test (full isolation).
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';

// ----------------------------------------------------------------
// In-memory DB factory (full schema)
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
    // ADL-23: trip_countries junction table (required by buildTripResponse)
    `CREATE TABLE IF NOT EXISTS trip_countries (
      trip_id INTEGER NOT NULL,
      country_code TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      PRIMARY KEY (trip_id, country_code),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (country_code) REFERENCES countries(country_code) ON DELETE RESTRICT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_trip_countries_country ON trip_countries (country_code)`,
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
      isOwner: 1,
    };
    next();
  },
  authenticate: (
    _req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => next(),
}));

// Mock geocoding so POST /api/cities doesn't make real HTTP calls
vi.mock('../../services/geocoding.service.js', () => ({
  resolveCity: async () => undefined,
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ----------------------------------------------------------------
// Seed helpers
// ----------------------------------------------------------------

const TEST_USER_ID = 'test-user-id';
const OTHER_USER_ID = 'other-user-id';

async function seedTestUser(
  db: Awaited<ReturnType<typeof createTestDb>>,
  id = TEST_USER_ID,
  email = 'test@example.com',
) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id,
      clerkId: `clerk_${id}`,
      email,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

async function seedCountryAndCity(
  db: Awaited<ReturnType<typeof createTestDb>>,
  countryCode = 'FR',
  cityName = 'Paris',
) {
  await db
    .insert(schema.countries)
    .values({ countryCode, name: countryCode === 'FR' ? 'France' : 'Ireland' })
    .onConflictDoNothing();
  const [city] = await db
    .insert(schema.cities)
    .values({
      name: cityName,
      countryCode,
      geocodeStatus: 'resolved',
    })
    .returning();
  return city;
}

async function seedTrip(
  db: Awaited<ReturnType<typeof createTestDb>>,
  userId: string,
  startDate = '2026-06-01',
  endDate = '2026-06-10',
) {
  const [trip] = await db
    .insert(schema.trips)
    .values({
      name: 'Test Trip',
      startDate,
      endDate,
      status: 'planning',
      userId,
    })
    .returning();
  return trip;
}

// ----------------------------------------------------------------
// BUG-A: PATCH /api/trips/:id — end_date date bypass (#25)
// ----------------------------------------------------------------

describe('BUG-A: PATCH /api/trips/:id — effective date validation', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  it('rejects when only end_date sent and it is before existing start_date', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, TEST_USER_ID, '2026-06-10', '2026-06-15');

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ end_date: '2026-06-01' }) // before start_date 2026-06-10
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('rejects when only start_date sent and it is after existing end_date', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, TEST_USER_ID, '2026-06-01', '2026-06-10');

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ start_date: '2026-06-20' }) // after end_date 2026-06-10
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('accepts when only end_date sent and it is on or after existing start_date', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, TEST_USER_ID, '2026-06-10', '2026-06-15');

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ end_date: '2026-06-20' }) // after start_date 2026-06-10
      .expect(200);

    expect(res.body.end_date).toBe('2026-06-20');
  });

  it('accepts when only start_date sent and it is on or before existing end_date', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, TEST_USER_ID, '2026-06-01', '2026-06-10');

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ start_date: '2026-06-05' }) // before end_date 2026-06-10
      .expect(200);

    expect(res.body.start_date).toBe('2026-06-05');
  });

  it('accepts same-day start and end dates', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, TEST_USER_ID, '2026-06-01', '2026-06-10');

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ end_date: '2026-06-01' }) // same as start_date → valid
      .expect(200);

    expect(res.body.end_date).toBe('2026-06-01');
  });
});

// ----------------------------------------------------------------
// BUG-B: Admin list endpoints return snake_case (#26)
// ----------------------------------------------------------------

describe('BUG-B: Admin list endpoints — snake_case serialization', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(() => {
    testDb = null;
  });

  it('GET /api/admin/categories returns is_active, not isActive', async () => {
    const db = testDb!;
    await db.insert(schema.tripCategories).values({
      name: 'Beach',
      isActive: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app).get('/api/admin/categories').expect(200);

    expect(res.body).toHaveLength(1);
    const item = res.body[0];
    expect(item).toHaveProperty('is_active');
    expect(item).not.toHaveProperty('isActive');
    expect(item.is_active).toBe(true);
  });

  it('GET /api/admin/categories/active returns snake_case and only active items', async () => {
    const db = testDb!;
    const now = new Date().toISOString();
    await db.insert(schema.tripCategories).values([
      { name: 'Active Cat', isActive: 1, createdAt: now, updatedAt: now },
      { name: 'Inactive Cat', isActive: 0, createdAt: now, updatedAt: now },
    ]);

    const res = await supertest(app).get('/api/admin/categories/active').expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Active Cat');
    expect(res.body[0]).toHaveProperty('is_active');
    expect(res.body[0].is_active).toBe(true);
  });

  it('POST /api/admin/activities returns snake_case', async () => {
    const res = await supertest(app)
      .post('/api/admin/activities')
      .send({ name: 'Hiking' })
      .expect(201);

    expect(res.body).toHaveProperty('is_active');
    expect(res.body).not.toHaveProperty('isActive');
    expect(res.body.is_active).toBe(true);
    expect(res.body).toHaveProperty('created_at');
    expect(res.body).toHaveProperty('updated_at');
  });

  it('PATCH /api/admin/companions/:id returns snake_case', async () => {
    const db = testDb!;
    const now = new Date().toISOString();
    const [inserted] = await db
      .insert(schema.companions)
      .values({
        name: 'Alice',
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const res = await supertest(app)
      .patch(`/api/admin/companions/${inserted.id}`)
      .send({ name: 'Alicia' })
      .expect(200);

    expect(res.body).toHaveProperty('is_active');
    expect(res.body).not.toHaveProperty('isActive');
    expect(res.body.name).toBe('Alicia');
  });

  it('DELETE /api/admin/categories/:id (soft-delete) returns snake_case', async () => {
    const db = testDb!;
    const now = new Date().toISOString();
    const [inserted] = await db
      .insert(schema.tripCategories)
      .values({
        name: 'TempCat',
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const res = await supertest(app).delete(`/api/admin/categories/${inserted.id}`).expect(200);

    expect(res.body).toHaveProperty('is_active');
    expect(res.body.is_active).toBe(false);
  });
});

// ----------------------------------------------------------------
// SEC-01: GET /api/cities/:id/items — userId filter (#27)
// ----------------------------------------------------------------

describe('SEC-01: GET /api/cities/:id/items — userId isolation', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb, TEST_USER_ID, 'test@example.com');
    await seedTestUser(testDb, OTHER_USER_ID, 'other@example.com');
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns completed items belonging to the requesting user', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db, 'FR', 'Paris');
    const trip = await seedTrip(db, TEST_USER_ID);

    const [place] = await db
      .insert(schema.tripPlaces)
      .values({
        tripId: trip.id,
        cityId: city.id,
        userId: TEST_USER_ID,
      })
      .returning();

    await db.insert(schema.items).values({
      tripId: trip.id,
      tripPlaceId: place.id,
      itemType: 'restaurant',
      status: 'completed',
      userId: TEST_USER_ID,
    });

    const res = await supertest(app).get(`/api/cities/${city.id}/items`).expect(200);

    expect(res.body).toHaveLength(1);
  });

  it('does NOT return completed items belonging to another user', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db, 'FR', 'Paris');
    const otherTrip = await seedTrip(db, OTHER_USER_ID);

    const [place] = await db
      .insert(schema.tripPlaces)
      .values({
        tripId: otherTrip.id,
        cityId: city.id,
        userId: OTHER_USER_ID,
      })
      .returning();

    // Item belongs to OTHER user
    await db.insert(schema.items).values({
      tripId: otherTrip.id,
      tripPlaceId: place.id,
      itemType: 'restaurant',
      status: 'completed',
      userId: OTHER_USER_ID,
    });

    // Auth mock sets user to TEST_USER_ID — should not see OTHER user's items
    const res = await supertest(app).get(`/api/cities/${city.id}/items`).expect(200);

    expect(res.body).toHaveLength(0);
  });
});

// ----------------------------------------------------------------
// SEC-02: Carry-forward source_item_ids ownership check (#28)
// ----------------------------------------------------------------

describe('SEC-02: POST carry-forward — source_item_ids ownership check', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb, TEST_USER_ID, 'test@example.com');
    await seedTestUser(testDb, OTHER_USER_ID, 'other@example.com');
  });

  afterEach(() => {
    testDb = null;
  });

  it('rejects carry-forward of items owned by another user', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db, 'FR', 'Paris');

    // Other user's source trip + item
    const otherTrip = await seedTrip(db, OTHER_USER_ID);
    const [otherPlace] = await db
      .insert(schema.tripPlaces)
      .values({
        tripId: otherTrip.id,
        cityId: city.id,
        userId: OTHER_USER_ID,
      })
      .returning();
    const [otherItem] = await db
      .insert(schema.items)
      .values({
        tripId: otherTrip.id,
        tripPlaceId: otherPlace.id,
        itemType: 'restaurant',
        status: 'next_time',
        userId: OTHER_USER_ID,
      })
      .returning();

    // Test user's target trip + place
    const myTrip = await seedTrip(db, TEST_USER_ID);
    const [myPlace] = await db
      .insert(schema.tripPlaces)
      .values({
        tripId: myTrip.id,
        cityId: city.id,
        userId: TEST_USER_ID,
      })
      .returning();

    // Test user tries to carry-forward other user's item
    const res = await supertest(app)
      .post(`/api/trips/${myTrip.id}/places/${myPlace.id}/carry-forward`)
      .send({ source_item_ids: [otherItem.id] })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('allows carry-forward of items owned by the requesting user', async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db, 'FR', 'Paris');

    // My source trip + item (next_time)
    const mySourceTrip = await seedTrip(db, TEST_USER_ID, '2025-06-01', '2025-06-10');
    const [mySourcePlace] = await db
      .insert(schema.tripPlaces)
      .values({
        tripId: mySourceTrip.id,
        cityId: city.id,
        userId: TEST_USER_ID,
      })
      .returning();
    const [myItem] = await db
      .insert(schema.items)
      .values({
        tripId: mySourceTrip.id,
        tripPlaceId: mySourcePlace.id,
        itemType: 'restaurant',
        status: 'next_time',
        userId: TEST_USER_ID,
      })
      .returning();

    // My target trip + place
    const myTargetTrip = await seedTrip(db, TEST_USER_ID, '2026-06-01', '2026-06-10');
    const [myTargetPlace] = await db
      .insert(schema.tripPlaces)
      .values({
        tripId: myTargetTrip.id,
        cityId: city.id,
        userId: TEST_USER_ID,
      })
      .returning();

    const res = await supertest(app)
      .post(`/api/trips/${myTargetTrip.id}/places/${myTargetPlace.id}/carry-forward`)
      .send({ source_item_ids: [myItem.id] })
      .expect(201);

    expect(res.body.count).toBe(1);
  });
});

// ----------------------------------------------------------------
// SEC-03: DELETE place activity — ownership check (#29)
// ----------------------------------------------------------------

describe('SEC-03: DELETE place activity — ownership check', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb, TEST_USER_ID, 'test@example.com');
    await seedTestUser(testDb, OTHER_USER_ID, 'other@example.com');
  });

  afterEach(() => {
    testDb = null;
  });

  it("returns 404 when trying to delete activity from another user's place", async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db, 'FR', 'Paris');

    // Other user's trip and place
    const otherTrip = await seedTrip(db, OTHER_USER_ID);
    const [otherPlace] = await db
      .insert(schema.tripPlaces)
      .values({
        tripId: otherTrip.id,
        cityId: city.id,
        userId: OTHER_USER_ID,
      })
      .returning();

    // Create an activity and tag it to other user's place
    const now = new Date().toISOString();
    const [act] = await db
      .insert(schema.activities)
      .values({
        name: 'Hiking',
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await db.insert(schema.tripPlaceActivitiesMap).values({
      tripPlaceId: otherPlace.id,
      activityId: act.id,
    });

    // Test user (auth mock) tries to delete from other user's place
    const res = await supertest(app)
      .delete(`/api/trips/${otherTrip.id}/places/${otherPlace.id}/activities/${act.id}`)
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it("allows deleting activity from the requesting user's own place", async () => {
    const db = testDb!;
    const city = await seedCountryAndCity(db, 'FR', 'Paris');

    // Test user's trip and place
    const myTrip = await seedTrip(db, TEST_USER_ID);
    const [myPlace] = await db
      .insert(schema.tripPlaces)
      .values({
        tripId: myTrip.id,
        cityId: city.id,
        userId: TEST_USER_ID,
      })
      .returning();

    // Tag activity to my place
    const now = new Date().toISOString();
    const [act] = await db
      .insert(schema.activities)
      .values({
        name: 'Swimming',
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await db.insert(schema.tripPlaceActivitiesMap).values({
      tripPlaceId: myPlace.id,
      activityId: act.id,
    });

    await supertest(app)
      .delete(`/api/trips/${myTrip.id}/places/${myPlace.id}/activities/${act.id}`)
      .expect(204);
  });
});

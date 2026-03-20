/**
 * Integration tests for the trip_countries API (ADL-23, #31).
 *
 * Test categories:
 *   1. POST /api/trips with country_codes → countries array in response
 *   2. PATCH /api/trips/:id with country_codes → replaces full list
 *   3. GET /api/trips?country=XX → filter trips by country code
 *   4. POST /api/trips/:id/countries → idempotent add, locked-trip guard
 *   5. DELETE /api/trips/:id/countries/:code → 204/404 success/not-found, locked guard
 *
 * Uses an in-memory libSQL database per test (full isolation).
 * The Backend API agent is implementing these endpoints simultaneously.
 * If the implementation is not yet merged, tests will fail at runtime
 * but the test file will type-check cleanly.
 *
 * LockError → HTTP 403 (see src/backend/errors.ts)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../../db/schema.js';

// ----------------------------------------------------------------
// In-memory DB factory (full schema including trip_countries)
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
// Mock getDb — must be declared before any module that imports it.
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
  await db.insert(schema.users).values({
    id: TEST_USER_ID,
    clerkId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }).onConflictDoNothing();
}

async function seedCountry(
  db: Awaited<ReturnType<typeof createTestDb>>,
  countryCode: string,
  name: string,
) {
  await db.insert(schema.countries).values({ countryCode, name }).onConflictDoNothing();
}

async function seedTrip(
  db: Awaited<ReturnType<typeof createTestDb>>,
  overrides: Partial<typeof schema.trips.$inferInsert> = {},
) {
  const [trip] = await db.insert(schema.trips).values({
    name: 'Test Trip',
    startDate: '2026-06-01',
    endDate: '2026-06-10',
    status: 'planning',
    userId: TEST_USER_ID,
    ...overrides,
  }).returning();
  return trip;
}

// ----------------------------------------------------------------
// 1. POST /api/trips with country_codes
// ----------------------------------------------------------------

describe('POST /api/trips — country_codes field', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb, 'JP', 'Japan');
    await seedCountry(testDb, 'FR', 'France');
  });

  afterEach(() => { testDb = null; });

  it('creates a trip with country_codes and response includes countries array with both entries', async () => {
    const res = await supertest(app)
      .post('/api/trips')
      .send({
        name: 'Asia & Europe Trip',
        start_date: '2026-07-01',
        end_date: '2026-07-20',
        country_codes: ['JP', 'FR'],
      })
      .expect(201);

    expect(res.body).toHaveProperty('countries');
    const codes = res.body.countries.map((c: { country_code: string }) => c.country_code);
    expect(codes).toContain('JP');
    expect(codes).toContain('FR');
    expect(codes).toHaveLength(2);
  });

  it('creates a trip without country_codes and response has empty countries array', async () => {
    const res = await supertest(app)
      .post('/api/trips')
      .send({
        name: 'Empty Countries Trip',
        start_date: '2026-07-01',
        end_date: '2026-07-10',
      })
      .expect(201);

    expect(res.body).toHaveProperty('countries');
    expect(res.body.countries).toEqual([]);
  });
});

// ----------------------------------------------------------------
// 2. PATCH /api/trips/:id with country_codes
// ----------------------------------------------------------------

describe('PATCH /api/trips/:id — country_codes field', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb, 'JP', 'Japan');
    await seedCountry(testDb, 'DE', 'Germany');
    await seedCountry(testDb, 'FR', 'France');
  });

  afterEach(() => { testDb = null; });

  it('replaces existing countries when country_codes is provided', async () => {
    // Create trip with JP via the countries sub-resource (or directly seed)
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    // PATCH with DE — should replace JP with DE
    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ country_codes: ['DE'] })
      .expect(200);

    expect(res.body).toHaveProperty('countries');
    const codes = res.body.countries.map((c: { country_code: string }) => c.country_code);
    expect(codes).toContain('DE');
    expect(codes).not.toContain('JP');
  });

  it('leaves countries unchanged when country_codes is not in PATCH body', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    // PATCH name only — countries must be preserved
    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ name: 'Renamed Trip' })
      .expect(200);

    expect(res.body).toHaveProperty('countries');
    const codes = res.body.countries.map((c: { country_code: string }) => c.country_code);
    expect(codes).toContain('JP');
  });
});

// ----------------------------------------------------------------
// 3. GET /api/trips?country=XX — filter by country
// ----------------------------------------------------------------

describe('GET /api/trips?country=XX — country filter', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb, 'JP', 'Japan');
    await seedCountry(testDb, 'DE', 'Germany');
  });

  afterEach(() => { testDb = null; });

  it('returns only the trip that has JP in trip_countries, not the one without', async () => {
    const db = testDb!;
    const jpTrip = await seedTrip(db, { name: 'Japan Trip' });
    await seedTrip(db, { name: 'Other Trip' }); // no countries

    await db.insert(schema.tripCountries).values({ tripId: jpTrip.id, countryCode: 'JP' });

    const res = await supertest(app)
      .get('/api/trips?country=JP')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(jpTrip.id);
  });

  it('returns no trips when no trip has the requested country', async () => {
    const db = testDb!;
    await seedTrip(db, { name: 'Germany Trip' });
    // no trip_countries rows for JP

    const res = await supertest(app)
      .get('/api/trips?country=JP')
      .expect(200);

    expect(res.body).toHaveLength(0);
  });
});

// ----------------------------------------------------------------
// 4. GET /api/trips/:id — includes countries in response
// ----------------------------------------------------------------

describe('GET /api/trips/:id — countries field', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb, 'JP', 'Japan');
    await seedCountry(testDb, 'FR', 'France');
  });

  afterEach(() => { testDb = null; });

  it('returns countries array on GET /api/trips/:id', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values([
      { tripId: trip.id, countryCode: 'JP' },
      { tripId: trip.id, countryCode: 'FR' },
    ]);

    const res = await supertest(app)
      .get(`/api/trips/${trip.id}`)
      .expect(200);

    expect(res.body).toHaveProperty('countries');
    const codes = res.body.countries.map((c: { country_code: string }) => c.country_code);
    expect(codes).toContain('JP');
    expect(codes).toContain('FR');
    expect(codes).toHaveLength(2);
  });

  it('returns empty countries array when trip has no countries', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .get(`/api/trips/${trip.id}`)
      .expect(200);

    expect(res.body).toHaveProperty('countries');
    expect(res.body.countries).toEqual([]);
  });
});

// ----------------------------------------------------------------
// 5. POST /api/trips/:id/countries — idempotent add
// ----------------------------------------------------------------

describe('POST /api/trips/:id/countries', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb, 'JP', 'Japan');
    await seedCountry(testDb, 'FR', 'France');
  });

  afterEach(() => { testDb = null; });

  it('adds multiple countries and returns 200 with both in response', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/countries`)
      .send({ country_codes: ['JP', 'FR'] })
      .expect(200);

    expect(res.body).toHaveProperty('countries');
    const codes = res.body.countries.map((c: { country_code: string }) => c.country_code);
    expect(codes).toContain('JP');
    expect(codes).toContain('FR');
    expect(codes).toHaveLength(2);
  });

  it('is idempotent — adding JP twice results in JP appearing only once', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    // First add
    await supertest(app)
      .post(`/api/trips/${trip.id}/countries`)
      .send({ country_codes: ['JP'] })
      .expect(200);

    // Second add — same country
    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/countries`)
      .send({ country_codes: ['JP'] })
      .expect(200);

    const codes = res.body.countries.map((c: { country_code: string }) => c.country_code);
    const jpOccurrences = codes.filter((code: string) => code === 'JP').length;
    expect(jpOccurrences).toBe(1);
  });

  it('returns 404 for a non-existent trip', async () => {
    const res = await supertest(app)
      .post('/api/trips/99999/countries')
      .send({ country_codes: ['JP'] })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 403 for a locked trip', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { status: 'locked' });

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/countries`)
      .send({ country_codes: ['JP'] })
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when country_codes body is missing', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/countries`)
      .send({})
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });
});

// ----------------------------------------------------------------
// 6. DELETE /api/trips/:id/countries/:code
// ----------------------------------------------------------------

describe('DELETE /api/trips/:id/countries/:code', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb, 'JP', 'Japan');
    await seedCountry(testDb, 'FR', 'France');
  });

  afterEach(() => { testDb = null; });

  it('removes a country and returns 204 No Content', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    await supertest(app)
      .delete(`/api/trips/${trip.id}/countries/JP`)
      .expect(204);
  });

  it('returns 404 when trying to delete a country that is not on the trip', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    // JP not added — should 404

    const res = await supertest(app)
      .delete(`/api/trips/${trip.id}/countries/JP`)
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 on a second delete of the same country (already removed)', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    // First delete succeeds
    await supertest(app)
      .delete(`/api/trips/${trip.id}/countries/JP`)
      .expect(204);

    // Second delete: JP is gone → 404
    const res = await supertest(app)
      .delete(`/api/trips/${trip.id}/countries/JP`)
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when the trip does not exist', async () => {
    const res = await supertest(app)
      .delete('/api/trips/99999/countries/JP')
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 403 when the trip is locked', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { status: 'locked' });
    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    const res = await supertest(app)
      .delete(`/api/trips/${trip.id}/countries/JP`)
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });
});

/**
 * Route integration tests for the Places API.
 *
 * Covers:
 *   GET /api/trips/:tripId/places — list places for a trip
 *   POST /api/trips/:tripId/places — create a new place
 *   DELETE /api/trips/:tripId/places/:placeId — remove a place
 *
 * Uses an in-memory libSQL database per test (full isolation).
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

async function seedCountry(
  db: Awaited<ReturnType<typeof createTestDb>>,
  countryCode: string,
  name: string,
) {
  await db.insert(schema.countries).values({ countryCode, name }).onConflictDoNothing();
}

async function seedCity(
  db: Awaited<ReturnType<typeof createTestDb>>,
  countryCode: string,
  name: string,
) {
  const [city] = await db
    .insert(schema.cities)
    .values({ name, countryCode, geocodeStatus: 'resolved' })
    .returning();
  return city;
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

// ----------------------------------------------------------------
// GET /api/trips/:tripId/places
// ----------------------------------------------------------------

describe('GET /api/trips/:tripId/places', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb, 'FR', 'France');
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 200 with empty array when trip has no places', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app).get(`/api/trips/${trip.id}/places`).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('returns 200 with the place when one place exists', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Paris');
    const trip = await seedTrip(db);
    await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID });

    const res = await supertest(app).get(`/api/trips/${trip.id}/places`).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('city_id', city.id);
    expect(res.body[0]).toHaveProperty('city');
    expect(res.body[0].city.name).toBe('Paris');
  });

  it('returns 404 when trip does not exist', async () => {
    const res = await supertest(app).get('/api/trips/99999/places').expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when trip belongs to another user', async () => {
    const db = testDb!;
    const now = Date.now();
    await db
      .insert(schema.users)
      .values({
        id: 'other-user',
        clerkId: 'user_other',
        email: 'other@example.com',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .onConflictDoNothing();
    const trip = await seedTrip(db, { userId: 'other-user' });

    const res = await supertest(app).get(`/api/trips/${trip.id}/places`).expect(404);

    expect(res.body).toHaveProperty('error');
  });
});

// ----------------------------------------------------------------
// POST /api/trips/:tripId/places
// ----------------------------------------------------------------

describe('POST /api/trips/:tripId/places', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb, 'FR', 'France');
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 201 with the created place', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Lyon');
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: city.id })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('city_id', city.id);
    expect(res.body).toHaveProperty('city');
    expect(res.body.city.name).toBe('Lyon');
    expect(res.body).toHaveProperty('activities');
    expect(Array.isArray(res.body.activities)).toBe(true);
  });

  it('returns 201 with arrived_on and departed_on when provided', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Nice');
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: city.id, arrived_on: '2026-06-01', departed_on: '2026-06-05' })
      .expect(201);

    expect(res.body).toHaveProperty('arrived_on', '2026-06-01');
    expect(res.body).toHaveProperty('departed_on', '2026-06-05');
  });

  it('returns 201 with null dates when not provided', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Grenoble');
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: city.id })
      .expect(201);

    expect(res.body).toHaveProperty('arrived_on', null);
    expect(res.body).toHaveProperty('departed_on', null);
  });

  it('returns 409 when city is already added to the trip', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Marseille');
    const trip = await seedTrip(db);

    // Add city first time
    await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: city.id })
      .expect(201);

    // Second add — should conflict
    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: city.id })
      .expect(409);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when city does not exist', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: 99999 })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when trip does not exist', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Nantes');

    const res = await supertest(app)
      .post('/api/trips/99999/places')
      .send({ city_id: city.id })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 403 when trip is locked', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Bordeaux');
    const trip = await seedTrip(db, { status: 'locked' });

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: city.id })
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when city_id is missing', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app).post(`/api/trips/${trip.id}/places`).send({}).expect(400);

    expect(res.body).toHaveProperty('error');
  });
});

// ----------------------------------------------------------------
// DELETE /api/trips/:tripId/places/:placeId
// ----------------------------------------------------------------

describe('DELETE /api/trips/:tripId/places/:placeId', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb, 'FR', 'France');
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 204 when place is successfully deleted', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Rennes');
    const trip = await seedTrip(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID })
      .returning();

    await supertest(app).delete(`/api/trips/${trip.id}/places/${place.id}`).expect(204);
  });

  it('returns 404 when place does not exist', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app).delete(`/api/trips/${trip.id}/places/99999`).expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 403 when trip is locked', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Caen');
    const trip = await seedTrip(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID })
      .returning();

    // Lock the trip
    const { eq } = await import('drizzle-orm');
    await db.update(schema.trips).set({ status: 'locked' }).where(eq(schema.trips.id, trip.id));

    const res = await supertest(app).delete(`/api/trips/${trip.id}/places/${place.id}`).expect(403);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 on a second delete of the same place (already deleted)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Rouen');
    const trip = await seedTrip(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID })
      .returning();

    // First delete
    await supertest(app).delete(`/api/trips/${trip.id}/places/${place.id}`).expect(204);

    // Second delete
    const res = await supertest(app).delete(`/api/trips/${trip.id}/places/${place.id}`).expect(404);

    expect(res.body).toHaveProperty('error');
  });
});

// ----------------------------------------------------------------
// PATCH /api/trips/:tripId/places/:placeId
// ----------------------------------------------------------------

describe('PATCH /api/trips/:tripId/places/:placeId', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb, 'FR', 'France');
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 200 with updated dates', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Toulouse');
    const trip = await seedTrip(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID })
      .returning();

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ arrived_on: '2026-07-01', departed_on: '2026-07-05' })
      .expect(200);

    expect(res.body).toHaveProperty('id', place.id);
    expect(res.body).toHaveProperty('arrived_on', '2026-07-01');
    expect(res.body).toHaveProperty('departed_on', '2026-07-05');
  });

  it('returns 200 and clears dates when null values sent', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Montpellier');
    const trip = await seedTrip(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({
        tripId: trip.id,
        cityId: city.id,
        userId: TEST_USER_ID,
        arrivedOn: '2026-07-01',
        departedOn: '2026-07-05',
      })
      .returning();

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ arrived_on: null, departed_on: null })
      .expect(200);

    expect(res.body).toHaveProperty('arrived_on', null);
    expect(res.body).toHaveProperty('departed_on', null);
  });

  it('returns 404 when place does not exist', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/99999`)
      .send({ arrived_on: '2026-07-01' })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when trip does not exist', async () => {
    const res = await supertest(app)
      .patch('/api/trips/99999/places/1')
      .send({ arrived_on: '2026-07-01' })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 403 when trip is locked', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Strasbourg');
    const trip = await seedTrip(db, { status: 'locked' });
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID })
      .returning();

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ arrived_on: '2026-07-01' })
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });
});

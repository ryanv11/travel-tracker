/**
 * Route integration tests for trips CRUD endpoints not covered elsewhere.
 *
 * Covered here:
 *   GET /api/trips — list all trips for authenticated user
 *   GET /api/trips/:id — get trip detail
 *   POST /api/trips — create a new trip
 *   PATCH /api/trips/:id — update trip fields
 *
 * Existing coverage (skip here):
 *   DELETE /api/trips/:id — trips.delete.test.ts
 *   trip_countries endpoints — trip-countries.test.ts
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

// ----------------------------------------------------------------
// GET /api/trips
// ----------------------------------------------------------------

describe('GET /api/trips', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 200 with empty array when user has no trips', async () => {
    const res = await supertest(app).get('/api/trips').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('returns 200 with all trips for the user', async () => {
    const db = testDb!;
    await seedTrip(db, { name: 'Trip A' });
    await seedTrip(db, { name: 'Trip B' });

    const res = await supertest(app).get('/api/trips').expect(200);

    expect(res.body).toHaveLength(2);
    const names = res.body.map((t: { name: string }) => t.name);
    expect(names).toContain('Trip A');
    expect(names).toContain('Trip B');
  });

  it('each trip in list has expected response shape', async () => {
    const db = testDb!;
    await seedTrip(db, { name: 'Shape Trip' });

    const res = await supertest(app).get('/api/trips').expect(200);

    const trip = res.body[0];
    expect(trip).toHaveProperty('id');
    expect(trip).toHaveProperty('name', 'Shape Trip');
    expect(trip).toHaveProperty('start_date');
    expect(trip).toHaveProperty('end_date');
    expect(trip).toHaveProperty('status');
    expect(trip).toHaveProperty('categories');
    expect(trip).toHaveProperty('companions');
    expect(trip).toHaveProperty('activities');
    expect(trip).toHaveProperty('places');
    expect(trip).toHaveProperty('countries');
  });

  it('does not return trips belonging to another user', async () => {
    const db = testDb!;
    const now = Date.now();
    await db.insert(schema.users).values({
      id: 'other-user',
      clerkId: 'user_other',
      email: 'other@example.com',
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
    await seedTrip(db, { userId: 'other-user', name: 'Other Trip' });

    const res = await supertest(app).get('/api/trips').expect(200);

    expect(res.body).toHaveLength(0);
  });

  it('filters by status query param', async () => {
    const db = testDb!;
    await seedTrip(db, { name: 'Planning Trip', status: 'planning' });
    await seedTrip(db, { name: 'Active Trip', status: 'active' });

    const res = await supertest(app).get('/api/trips?status=active').expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Active Trip');
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await supertest(app).get('/api/trips?status=bogus').expect(400);

    expect(res.body).toHaveProperty('error');
  });
});

// ----------------------------------------------------------------
// GET /api/trips/:id
// ----------------------------------------------------------------

describe('GET /api/trips/:id', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 200 with full trip detail', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { name: 'My Trip', photoAlbumRef: 'https://photos.test' });

    const res = await supertest(app).get(`/api/trips/${trip.id}`).expect(200);

    expect(res.body.id).toBe(trip.id);
    expect(res.body.name).toBe('My Trip');
    expect(res.body.photo_album_ref).toBe('https://photos.test');
    expect(res.body).toHaveProperty('places');
    expect(res.body).toHaveProperty('categories');
    expect(res.body).toHaveProperty('countries');
  });

  it('returns 404 when trip does not exist', async () => {
    const res = await supertest(app).get('/api/trips/99999').expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when trip belongs to another user', async () => {
    const db = testDb!;
    const now = Date.now();
    await db.insert(schema.users).values({
      id: 'other-user',
      clerkId: 'user_other',
      email: 'other@example.com',
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
    const trip = await seedTrip(db, { userId: 'other-user' });

    const res = await supertest(app).get(`/api/trips/${trip.id}`).expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when id is not numeric', async () => {
    const res = await supertest(app).get('/api/trips/abc').expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('trip detail has null photo_album_ref when not set', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app).get(`/api/trips/${trip.id}`).expect(200);

    expect(res.body.photo_album_ref).toBeNull();
  });
});

// ----------------------------------------------------------------
// POST /api/trips
// ----------------------------------------------------------------

describe('POST /api/trips', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 201 with the created trip', async () => {
    const res = await supertest(app)
      .post('/api/trips')
      .send({
        name: 'New Adventure',
        start_date: '2026-09-01',
        end_date: '2026-09-14',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('New Adventure');
    expect(res.body.start_date).toBe('2026-09-01');
    expect(res.body.end_date).toBe('2026-09-14');
    expect(res.body.status).toBe('planning');
    expect(res.body).toHaveProperty('places');
    expect(res.body).toHaveProperty('countries');
  });

  it('stores photo_album_ref when provided', async () => {
    const res = await supertest(app)
      .post('/api/trips')
      .send({
        name: 'Photo Trip',
        start_date: '2026-10-01',
        end_date: '2026-10-07',
        photo_album_ref: 'https://photos.example.com/album1',
      })
      .expect(201);

    expect(res.body.photo_album_ref).toBe('https://photos.example.com/album1');
  });

  it('returns 400 when name is missing', async () => {
    const res = await supertest(app)
      .post('/api/trips')
      .send({ start_date: '2026-09-01', end_date: '2026-09-14' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when start_date is missing', async () => {
    const res = await supertest(app)
      .post('/api/trips')
      .send({ name: 'Test', end_date: '2026-09-14' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when end_date is before start_date', async () => {
    const res = await supertest(app)
      .post('/api/trips')
      .send({
        name: 'Bad Dates',
        start_date: '2026-09-14',
        end_date: '2026-09-01',
      })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('accepts same-day start and end dates', async () => {
    const res = await supertest(app)
      .post('/api/trips')
      .send({
        name: 'Day Trip',
        start_date: '2026-09-01',
        end_date: '2026-09-01',
      })
      .expect(201);

    expect(res.body.start_date).toBe('2026-09-01');
    expect(res.body.end_date).toBe('2026-09-01');
  });
});

// ----------------------------------------------------------------
// PATCH /api/trips/:id
// ----------------------------------------------------------------

describe('PATCH /api/trips/:id', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 200 with updated trip name', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { name: 'Original Name' });

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ name: 'Updated Name' })
      .expect(200);

    expect(res.body.name).toBe('Updated Name');
    expect(res.body.id).toBe(trip.id);
  });

  it('returns 200 with updated dates', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ start_date: '2027-01-01', end_date: '2027-01-15' })
      .expect(200);

    expect(res.body.start_date).toBe('2027-01-01');
    expect(res.body.end_date).toBe('2027-01-15');
  });

  it('returns 400 when end_date before start_date after partial update', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { startDate: '2026-06-01', endDate: '2026-06-10' });

    // Send only end_date that is before existing start_date
    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ end_date: '2026-05-01' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when trip does not exist', async () => {
    const res = await supertest(app)
      .patch('/api/trips/99999')
      .send({ name: 'Ghost Trip' })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 403 when trip is locked', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { status: 'locked' });

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ name: 'Updated' })
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });

  it('updates photo_album_ref when provided', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}`)
      .send({ photo_album_ref: 'https://example.com/album' })
      .expect(200);

    expect(res.body.photo_album_ref).toBe('https://example.com/album');
  });
});

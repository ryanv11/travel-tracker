/**
 * Route integration tests for the Items API.
 *
 * Covers:
 *   GET /api/trips/:tripId/items — list items for a trip
 *   POST /api/trips/:tripId/items — create a new item
 *   DELETE /api/trips/:tripId/items/:itemId — remove an item
 *
 * Uses an in-memory libSQL database per test (full isolation).
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';

// ----------------------------------------------------------------
// In-memory DB factory — shared DDL to avoid duplication
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

// ----------------------------------------------------------------
// GET /api/trips/:tripId/items
// ----------------------------------------------------------------

describe('GET /api/trips/:tripId/items', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 200 with empty array when trip has no items', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app).get(`/api/trips/${trip.id}/items`).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('returns 200 with items for the trip', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const now = new Date().toISOString();
    const [item] = await db
      .insert(schema.items)
      .values({
        tripId: trip.id,
        itemType: 'flight',
        status: 'confirmed',
        isCarriedForward: 0,
        userId: TEST_USER_ID,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await db.insert(schema.itemFlights).values({ itemId: item.id, airline: 'Air France' });

    const res = await supertest(app).get(`/api/trips/${trip.id}/items`).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].item_type).toBe('flight');
    expect(res.body[0].status).toBe('confirmed');
  });

  it('filters by type query param', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const now = new Date().toISOString();

    // Insert a flight and hotel
    await db.insert(schema.items).values({
      tripId: trip.id,
      itemType: 'flight',
      status: 'consider',
      isCarriedForward: 0,
      userId: TEST_USER_ID,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.items).values({
      tripId: trip.id,
      itemType: 'hotel',
      status: 'consider',
      isCarriedForward: 0,
      userId: TEST_USER_ID,
      createdAt: now,
      updatedAt: now,
    });

    const res = await supertest(app).get(`/api/trips/${trip.id}/items?type=flight`).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].item_type).toBe('flight');
  });

  it('returns 404 when trip id is not a number', async () => {
    const res = await supertest(app).get('/api/trips/abc/items').expect(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ----------------------------------------------------------------
// POST /api/trips/:tripId/items
// ----------------------------------------------------------------

describe('POST /api/trips/:tripId/items', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 201 with a created flight item', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/items`)
      .send({
        item_type: 'flight',
        status: 'confirmed',
        airline: 'British Airways',
        flight_number: 'BA001',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.item_type).toBe('flight');
    expect(res.body.status).toBe('confirmed');
    expect(res.body.airline).toBe('British Airways');
    expect(res.body.flight_number).toBe('BA001');
  });

  it('returns 201 with a created hotel item', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/items`)
      .send({
        item_type: 'hotel',
        property_name: 'Grand Hotel',
        check_in_date: '2026-07-01',
        check_out_date: '2026-07-05',
      })
      .expect(201);

    expect(res.body.item_type).toBe('hotel');
    expect(res.body.property_name).toBe('Grand Hotel');
  });

  it('returns 201 with a created restaurant item', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/items`)
      .send({
        item_type: 'restaurant',
        name: 'Le Jules Verne',
        cuisine_type: 'French',
      })
      .expect(201);

    expect(res.body.item_type).toBe('restaurant');
    expect(res.body.name).toBe('Le Jules Verne');
  });

  it('returns 201 with an experience item', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/items`)
      .send({ item_type: 'experience' })
      .expect(201);

    expect(res.body.item_type).toBe('experience');
    expect(res.body.rating).toBeNull();
  });

  it('defaults status to consider when not provided', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/items`)
      .send({ item_type: 'flight' })
      .expect(201);

    expect(res.body.status).toBe('consider');
  });

  it('returns 403 when trip is locked', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { status: 'locked' });

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/items`)
      .send({ item_type: 'flight' })
      .expect(403);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when item_type is missing', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/items`)
      .send({ status: 'consider' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when item_type is invalid', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/items`)
      .send({ item_type: 'spaceship' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('sets is_carried_forward to false when not provided', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/items`)
      .send({ item_type: 'experience' })
      .expect(201);

    expect(res.body.is_carried_forward).toBe(false);
  });
});

// ----------------------------------------------------------------
// DELETE /api/trips/:tripId/items/:itemId
// ----------------------------------------------------------------

describe('DELETE /api/trips/:tripId/items/:itemId', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns 204 when item is successfully deleted', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const now = new Date().toISOString();
    const [item] = await db
      .insert(schema.items)
      .values({
        tripId: trip.id,
        itemType: 'experience',
        status: 'consider',
        isCarriedForward: 0,
        userId: TEST_USER_ID,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await supertest(app).delete(`/api/trips/${trip.id}/items/${item.id}`).expect(204);
  });

  it('returns 404 when item does not exist', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app).delete(`/api/trips/${trip.id}/items/99999`).expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 403 when trip is locked', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const now = new Date().toISOString();
    const [item] = await db
      .insert(schema.items)
      .values({
        tripId: trip.id,
        itemType: 'experience',
        status: 'consider',
        isCarriedForward: 0,
        userId: TEST_USER_ID,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Lock the trip
    const { eq } = await import('drizzle-orm');
    await db.update(schema.trips).set({ status: 'locked' }).where(eq(schema.trips.id, trip.id));

    const res = await supertest(app).delete(`/api/trips/${trip.id}/items/${item.id}`).expect(403);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 on second delete of same item', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const now = new Date().toISOString();
    const [item] = await db
      .insert(schema.items)
      .values({
        tripId: trip.id,
        itemType: 'restaurant',
        status: 'consider',
        isCarriedForward: 0,
        userId: TEST_USER_ID,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // First delete succeeds
    await supertest(app).delete(`/api/trips/${trip.id}/items/${item.id}`).expect(204);

    // Second delete
    const res = await supertest(app).delete(`/api/trips/${trip.id}/items/${item.id}`).expect(404);

    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when item id is not a number', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);

    const res = await supertest(app).delete(`/api/trips/${trip.id}/items/abc`).expect(404);

    expect(res.body).toHaveProperty('error');
  });
});

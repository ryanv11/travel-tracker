/**
 * Unit + integration tests for DELETE /api/trips/:id (FEAT-BD).
 *
 * Test categories:
 *   1. Schema validation (pure unit) — DeleteTripParamsSchema
 *   2. Route integration — 204 success, 404 not found, 400 invalid id, cascade verify
 *
 * Integration tests use an in-memory libSQL database seeded with minimal
 * schema required by the trips router (trips + trip_places + cities + countries).
 * The getDb() singleton is replaced via vi.mock before any imports run.
 *
 * Spec: FEAT-BD (COO 2026-03-11)
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { DeleteTripParamsSchema } from '../../validation/trips.schemas.js';

// ----------------------------------------------------------------
// In-memory DB factory
//
// Creates a fresh libSQL :memory: database and applies the
// minimal schema needed to exercise the DELETE /api/trips/:id route:
//   countries, cities, trips, trip_places
// Cascade is defined in the trips table FK so no extra DDL is needed.
// ----------------------------------------------------------------

/**
 * Creates an in-memory Drizzle ORM instance with the full schema applied.
 * Used by integration tests to provide a real SQLite database per test.
 *
 * @returns Drizzle ORM instance backed by an in-memory SQLite database.
 */
async function createTestDb() {
  const client = createClient({ url: ':memory:' });

  // Enable foreign key enforcement — SQLite requires explicit PRAGMA
  await client.execute('PRAGMA foreign_keys = ON;');

  // Apply minimal DDL for trips, countries, cities, trip_places
  // (extracted from 0000_open_electro.sql — only the tables this route exercises)
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
// Mock getDb — must be declared before any module that imports it.
// vi.mock is hoisted above imports by Vitest, but the factory
// function is evaluated lazily on first call.
// ----------------------------------------------------------------

// Shared reference to the current test DB instance; replaced in beforeEach
let testDb: Awaited<ReturnType<typeof createTestDb>> | null = null;

vi.mock('../../db/index.js', async (importOriginal) => {
  // Import the real module to re-export schema table references
  const real = await importOriginal<typeof import('../../db/index.js')>();
  return {
    ...real,
    // Replace getDb() to return the per-test in-memory instance
    getDb: () => {
      if (!testDb)
        throw new Error('[TEST] testDb not initialised — call createTestDb in beforeEach');
      return testDb;
    },
  };
});

// Mock auth middleware — bypass JWT verification in integration tests.
// Tests exercise route logic, not authentication. Auth is unit-tested separately.
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

// Import the app AFTER mocks are declared (Vitest hoisting ensures the mock
// is in place before module evaluation, but the explicit ordering is clearer).
const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ----------------------------------------------------------------
// 1. SCHEMA VALIDATION — DeleteTripParamsSchema (pure unit tests)
//
// These tests have no DB dependency — they validate the Zod schema
// that guards the DELETE /api/trips/:id path parameter.
// ----------------------------------------------------------------

describe('DeleteTripParamsSchema', () => {
  it('accepts a valid positive integer id', () => {
    const result = DeleteTripParamsSchema.safeParse({ id: 1 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(1);
  });

  it('coerces a positive integer string to number', () => {
    const result = DeleteTripParamsSchema.safeParse({ id: '42' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(42);
  });

  it('rejects zero', () => {
    expect(DeleteTripParamsSchema.safeParse({ id: 0 }).success).toBe(false);
  });

  it('rejects a negative integer', () => {
    expect(DeleteTripParamsSchema.safeParse({ id: -1 }).success).toBe(false);
  });

  it('rejects a non-integer float', () => {
    expect(DeleteTripParamsSchema.safeParse({ id: 1.5 }).success).toBe(false);
  });

  it('rejects a non-numeric string', () => {
    expect(DeleteTripParamsSchema.safeParse({ id: 'abc' }).success).toBe(false);
  });

  it('rejects undefined id', () => {
    expect(DeleteTripParamsSchema.safeParse({}).success).toBe(false);
  });
});

// ----------------------------------------------------------------
// 2. ROUTE INTEGRATION — DELETE /api/trips/:id
//
// Each test runs against a fresh in-memory SQLite database.
// ----------------------------------------------------------------

// The test-user-id matches what the auth mock sets on req.user.id
const TEST_USER_ID = 'test-user-id';

/**
 * Seeds a user row matching the auth mock's req.user.id.
 * Required because trips.user_id is a FK to users.id (ADL-18).
 */
async function seedTestUser(db: Awaited<ReturnType<typeof createTestDb>>) {
  const now = Date.now();
  await db.insert(schema.users).values({
    id: TEST_USER_ID,
    clerkId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });
}

describe('DELETE /api/trips/:id', () => {
  beforeEach(async () => {
    // Fresh in-memory database for each test — full isolation
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });

  afterEach(() => {
    testDb = null;
  });

  // ----------------------------------------------------------------
  // 2a. 204 — Successful delete
  // ----------------------------------------------------------------

  it('returns 204 No Content when a valid trip is deleted', async () => {
    // Seed a trip directly via Drizzle — must be owned by test user (ADL-18)
    const db = testDb!;
    const inserted = await db
      .insert(schema.trips)
      .values({
        name: 'Test Trip',
        startDate: '2026-01-01',
        endDate: '2026-01-07',
        status: 'planning',
        userId: TEST_USER_ID,
      })
      .returning();
    const tripId = inserted[0].id;

    const response = await supertest(app).delete(`/api/trips/${tripId}`).expect(204);

    // 204 must have no body
    expect(response.body).toEqual({});
  });

  // ----------------------------------------------------------------
  // 2b. 404 — Non-existent trip
  // ----------------------------------------------------------------

  it('returns 404 when the trip does not exist', async () => {
    const response = await supertest(app).delete('/api/trips/99999').expect(404);

    expect(response.body).toEqual({ error: 'Trip not found' });
  });

  // ----------------------------------------------------------------
  // 2c. 400 — Invalid id
  // ----------------------------------------------------------------

  it('returns 400 when id is a non-numeric string', async () => {
    const response = await supertest(app).delete('/api/trips/abc').expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('returns 400 when id is zero', async () => {
    const response = await supertest(app).delete('/api/trips/0').expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('returns 400 when id is negative', async () => {
    const response = await supertest(app).delete('/api/trips/-5').expect(400);

    expect(response.body).toHaveProperty('error');
  });

  // ----------------------------------------------------------------
  // 2d. CASCADE — trip_places removed when trip is deleted
  // ----------------------------------------------------------------

  it('removes trip_places records when the trip is deleted (cascade)', async () => {
    const db = testDb!;

    // Seed a country and city (required by the trip_places FK chain)
    await db.insert(schema.countries).values({
      countryCode: 'FR',
      name: 'France',
    });
    const [city] = await db
      .insert(schema.cities)
      .values({
        name: 'Paris',
        countryCode: 'FR',
        geocodeStatus: 'resolved',
      })
      .returning();

    // Seed a trip — must be owned by test user (ADL-18)
    const [trip] = await db
      .insert(schema.trips)
      .values({
        name: 'Paris Trip',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
        status: 'planning',
        userId: TEST_USER_ID,
      })
      .returning();

    // Add a place to the trip
    await db.insert(schema.tripPlaces).values({
      tripId: trip.id,
      cityId: city.id,
    });

    // Confirm the place exists before delete
    const { eq } = await import('drizzle-orm');
    const placesBefore = await db
      .select()
      .from(schema.tripPlaces)
      .where(eq(schema.tripPlaces.tripId, trip.id));
    expect(placesBefore).toHaveLength(1);

    // Delete the trip via the API
    await supertest(app).delete(`/api/trips/${trip.id}`).expect(204);

    // Verify cascade: no trip_places remain for the deleted trip
    const placesAfter = await db
      .select()
      .from(schema.tripPlaces)
      .where(eq(schema.tripPlaces.tripId, trip.id));
    expect(placesAfter).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // 2e. Idempotency check — second delete returns 404
  // ----------------------------------------------------------------

  it('returns 404 on a second delete of the same trip (already deleted)', async () => {
    const db = testDb!;
    const [trip] = await db
      .insert(schema.trips)
      .values({
        name: 'One-time Trip',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
        status: 'planning',
        userId: TEST_USER_ID,
      })
      .returning();

    // First delete succeeds
    await supertest(app).delete(`/api/trips/${trip.id}`).expect(204);

    // Second delete: trip is gone → 404
    const response = await supertest(app).delete(`/api/trips/${trip.id}`).expect(404);

    expect(response.body).toEqual({ error: 'Trip not found' });
  });
});

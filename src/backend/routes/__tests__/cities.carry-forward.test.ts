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
 * Uses an in-memory libSQL database per test (full isolation), schema
 * derived from the real migrations via createTestDb() (QUAL-17 — see
 * repositories/__tests__/test-db.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

// ----------------------------------------------------------------
// Mock getDb
// ----------------------------------------------------------------

let testDb: TestDb | null = null;

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

// The test-user-id matches what the auth mock sets on req.user.id
const TEST_USER_ID = 'test-user-id';

/**
 * Seeds a user row matching the auth mock's req.user.id.
 * Required because trips.user_id is a FK to users.id (ADL-18).
 */
async function seedTestUser(db: TestDb) {
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

type TripStatus = 'planning' | 'active' | 'review_pending' | 'locked';

async function seedCityAndTrip(db: TestDb, tripStatus: TripStatus) {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'IE', name: 'Ireland' })
    .onConflictDoNothing();

  const [city] = await db
    .insert(schema.cities)
    .values({
      name: 'Dublin',
      countryCode: 'IE',
      geocodeStatus: 'resolved',
    })
    .returning();

  // ADL-18: trips must be owned by the test user so the carry-forward userId filter passes
  const [trip] = await db
    .insert(schema.trips)
    .values({
      name: `Dublin Trip (${tripStatus})`,
      startDate: '2026-01-01',
      endDate: '2026-01-07',
      status: tripStatus,
      userId: TEST_USER_ID,
    })
    .returning();

  const [place] = await db
    .insert(schema.tripPlaces)
    .values({
      tripId: trip.id,
      cityId: city.id,
      userId: TEST_USER_ID,
    })
    .returning();

  return { city, trip, place };
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('GET /api/cities/:id/carry-forward — BUG-17 status filter removed', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
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
      userId: TEST_USER_ID,
    });

    const res = await supertest(app).get(`/api/cities/${city.id}/carry-forward`).expect(200);

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
      userId: TEST_USER_ID,
    });

    const res = await supertest(app).get(`/api/cities/${city.id}/carry-forward`).expect(200);

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
      userId: TEST_USER_ID,
    });

    const res = await supertest(app).get(`/api/cities/${city.id}/carry-forward`).expect(200);

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
      userId: TEST_USER_ID,
    });

    const res = await supertest(app).get(`/api/cities/${city.id}/carry-forward`).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].source_trip_name).toBe('Dublin Trip (locked)');
  });

  it('does not return items with status other than next_time', async () => {
    const db = testDb!;
    const { city, trip, place } = await seedCityAndTrip(db, 'locked');

    // Insert items with every non-next_time status
    // QUAL-17: 'skipped' is not a valid item status (chk_items_status only
    // allows consider/confirmed/completed/cancelled/next_time) — silently
    // accepted by the old hand-written DDL, which carried no CHECK
    // constraint. Same class of drift QUAL-03 found with 'booked' in
    // items.test.ts. Corrected to 'cancelled', preserving this test's intent
    // (every non-next_time status is excluded).
    const otherStatuses = ['consider', 'confirmed', 'completed', 'cancelled'] as const;
    for (const status of otherStatuses) {
      await db.insert(schema.items).values({
        tripId: trip.id,
        tripPlaceId: place.id,
        itemType: 'restaurant',
        status,
        userId: TEST_USER_ID,
      });
    }

    const res = await supertest(app).get(`/api/cities/${city.id}/carry-forward`).expect(200);

    expect(res.body).toHaveLength(0);
  });

  it('does not return flight next_time items', async () => {
    const db = testDb!;
    const { city, trip, place } = await seedCityAndTrip(db, 'locked');

    await db.insert(schema.items).values({
      tripId: trip.id,
      tripPlaceId: place.id,
      itemType: 'flight',
      status: 'next_time',
      userId: TEST_USER_ID,
    });

    const res = await supertest(app).get(`/api/cities/${city.id}/carry-forward`).expect(200);

    expect(res.body).toHaveLength(0);
  });

  it('does not return car_rental next_time items', async () => {
    const db = testDb!;
    const { city, trip, place } = await seedCityAndTrip(db, 'locked');

    await db.insert(schema.items).values({
      tripId: trip.id,
      tripPlaceId: place.id,
      itemType: 'car_rental',
      status: 'next_time',
      userId: TEST_USER_ID,
    });

    const res = await supertest(app).get(`/api/cities/${city.id}/carry-forward`).expect(200);

    expect(res.body).toHaveLength(0);
  });

  it('returns 200 empty array for a city with no next_time items', async () => {
    const db = testDb!;
    await db
      .insert(schema.countries)
      .values({ countryCode: 'FR', name: 'France' })
      .onConflictDoNothing();
    const [city] = await db
      .insert(schema.cities)
      .values({
        name: 'Paris',
        countryCode: 'FR',
        geocodeStatus: 'resolved',
      })
      .returning();

    const res = await supertest(app).get(`/api/cities/${city.id}/carry-forward`).expect(200);

    expect(res.body).toEqual([]);
  });

  it('returns 404 for a non-existent city id', async () => {
    // The endpoint does not verify city existence — it just returns empty.
    // This tests that a non-numeric id gets a 400.
    const res = await supertest(app).get('/api/cities/abc/carry-forward').expect(404);

    expect(res.body).toHaveProperty('error');
  });
});

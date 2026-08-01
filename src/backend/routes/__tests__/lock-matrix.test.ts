/**
 * Lock Enforcement Matrix — Regression Test Suite
 * BUG-27 / BRD TR-06, TR-07 / GitHub #135
 *
 * PO ruling: "Locked should be read only. You'd need to move it out of a locked
 * state to make changes." Every mutating endpoint that touches a locked trip's
 * data must reject with 403 via LockError ({ error: 'Trip is locked' }).
 * The ONLY permitted mutations on a locked trip are the unlock actions:
 *   PATCH /api/trips/:id/unlock                       (convenience alias)
 *   PATCH /api/trips/:id/status { status: 'review_pending' }
 *
 * This file is a LIVING LOCK MATRIX. When a new mutating route is added under
 * /api/trips (trip CRUD, places, items, activity tagging, country junctions),
 * add a row to LOCKED_WRITE_MATRIX below. Global reference-data routes
 * (/api/cities, /api/admin, /api/map) do not touch trip data and are out of
 * scope — they are covered by security.access-matrix.test.ts instead.
 *
 * Note (audit invariant 17): ownership checks run BEFORE lock checks in every
 * route — lock helpers (assertNotLocked) do not verify ownership. Cross-user
 * behaviour is covered by security.access-matrix.test.ts Part C.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb } from '../../repositories/__tests__/test-db.js';

// ----------------------------------------------------------------
// Mocks — getDb() → per-test in-memory DB; requireAuth → static test user
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
    req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (req as import('express').Request & { user?: unknown }).user = {
      id: 'test-user-id',
      clerkId: 'user_test',
      email: 'test@example.com',
      isOwner: 0,
    };
    next();
  },
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

const TEST_USER_ID = 'test-user-id';

// ----------------------------------------------------------------
// Seed fixture — one locked trip with a place, tagged activity, item,
// and a country association, so every nested mutating route has a
// real target to aim at.
// ----------------------------------------------------------------

interface Fixture {
  tripId: number;
  placeId: number;
  cityId: number; // city already on the trip
  otherCityId: number; // city NOT on the trip (for POST /places)
  activityId: number; // activity tagged to the place
  otherActivityId: number; // activity NOT tagged (for POST /activities)
  itemId: number;
}

let fx: Fixture;

async function seedLockedTripFixture(
  db: Awaited<ReturnType<typeof createTestDb>>,
): Promise<Fixture> {
  const now = new Date().toISOString();

  await db.insert(schema.users).values({
    id: TEST_USER_ID,
    clerkId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(schema.countries).values([
    { countryCode: 'FR', name: 'France' },
    { countryCode: 'DE', name: 'Germany' },
  ]);

  const [paris] = await db
    .insert(schema.cities)
    .values({ name: 'Paris', countryCode: 'FR', geocodeStatus: 'resolved' })
    .returning();
  const [berlin] = await db
    .insert(schema.cities)
    .values({ name: 'Berlin', countryCode: 'DE', geocodeStatus: 'resolved' })
    .returning();

  const [hiking] = await db
    .insert(schema.activities)
    .values({ userId: TEST_USER_ID, name: 'Hiking' })
    .returning();
  const [museums] = await db
    .insert(schema.activities)
    .values({ userId: TEST_USER_ID, name: 'Museums' })
    .returning();

  const [trip] = await db
    .insert(schema.trips)
    .values({
      name: 'Locked Trip',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      status: 'locked',
      userId: TEST_USER_ID,
    })
    .returning();

  const [place] = await db
    .insert(schema.tripPlaces)
    .values({ tripId: trip.id, cityId: paris.id, userId: TEST_USER_ID })
    .returning();

  await db
    .insert(schema.tripPlaceActivitiesMap)
    .values({ tripPlaceId: place.id, activityId: hiking.id });

  const [item] = await db
    .insert(schema.items)
    .values({
      tripId: trip.id,
      tripPlaceId: place.id,
      itemType: 'experience',
      status: 'consider',
      isCarriedForward: 0,
      userId: TEST_USER_ID,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'FR' });

  return {
    tripId: trip.id,
    placeId: place.id,
    cityId: paris.id,
    otherCityId: berlin.id,
    activityId: hiking.id,
    otherActivityId: museums.id,
    itemId: item.id,
  };
}

beforeEach(async () => {
  testDb = await createTestDb();
  fx = await seedLockedTripFixture(testDb);
});

afterEach(() => {
  testDb = null;
});

// ----------------------------------------------------------------
// THE MATRIX — every mutating route under /api/trips must 403 on a
// locked trip with the LockError body { error: 'Trip is locked' }.
// ----------------------------------------------------------------

interface MatrixRow {
  name: string;
  method: 'post' | 'patch' | 'delete';
  path: (f: Fixture) => string;
  body?: (f: Fixture) => Record<string, unknown>;
}

const LOCKED_WRITE_MATRIX: MatrixRow[] = [
  // --- trip CRUD ---
  {
    name: 'PATCH /api/trips/:id (edit trip fields)',
    method: 'patch',
    path: (f) => `/api/trips/${f.tripId}`,
    body: () => ({ name: 'Renamed' }),
  },
  {
    name: 'DELETE /api/trips/:id (delete trip)',
    method: 'delete',
    path: (f) => `/api/trips/${f.tripId}`,
  },
  // --- trip status machine (non-unlock transitions) ---
  {
    name: 'PATCH /api/trips/:id/status → active',
    method: 'patch',
    path: (f) => `/api/trips/${f.tripId}/status`,
    body: () => ({ status: 'active' }),
  },
  {
    name: 'PATCH /api/trips/:id/status → planning',
    method: 'patch',
    path: (f) => `/api/trips/${f.tripId}/status`,
    body: () => ({ status: 'planning' }),
  },
  // --- places ---
  {
    name: 'POST /api/trips/:tripId/places (add place)',
    method: 'post',
    path: (f) => `/api/trips/${f.tripId}/places`,
    body: (f) => ({ city_id: f.otherCityId }),
  },
  {
    name: 'PATCH /api/trips/:tripId/places/:placeId (edit dates)',
    method: 'patch',
    path: (f) => `/api/trips/${f.tripId}/places/${f.placeId}`,
    body: () => ({ arrived_on: '2026-06-02', departed_on: '2026-06-04' }),
  },
  {
    name: 'DELETE /api/trips/:tripId/places/:placeId (remove place)',
    method: 'delete',
    path: (f) => `/api/trips/${f.tripId}/places/${f.placeId}`,
  },
  {
    name: 'POST /api/trips/:tripId/places/:placeId/carry-forward',
    method: 'post',
    path: (f) => `/api/trips/${f.tripId}/places/${f.placeId}/carry-forward`,
    body: (f) => ({ source_item_ids: [f.itemId] }),
  },
  // --- place activity tagging (the BUG-27 audit gap) ---
  {
    name: 'POST /api/trips/:tripId/places/:placeId/activities (tag)',
    method: 'post',
    path: (f) => `/api/trips/${f.tripId}/places/${f.placeId}/activities`,
    body: (f) => ({ activity_id: f.otherActivityId }),
  },
  {
    name: 'DELETE /api/trips/:tripId/places/:placeId/activities/:activityId (untag)',
    method: 'delete',
    path: (f) => `/api/trips/${f.tripId}/places/${f.placeId}/activities/${f.activityId}`,
  },
  // --- items ---
  {
    name: 'POST /api/trips/:tripId/items (create item)',
    method: 'post',
    path: (f) => `/api/trips/${f.tripId}/items`,
    body: () => ({ item_type: 'flight' }),
  },
  {
    name: 'PATCH /api/trips/:tripId/items/:itemId (edit item)',
    method: 'patch',
    path: (f) => `/api/trips/${f.tripId}/items/${f.itemId}`,
    body: () => ({ notes: 'updated' }),
  },
  {
    name: 'DELETE /api/trips/:tripId/items/:itemId (delete item)',
    method: 'delete',
    path: (f) => `/api/trips/${f.tripId}/items/${f.itemId}`,
  },
  // --- country junction writes ---
  {
    name: 'POST /api/trips/:tripId/countries (add countries)',
    method: 'post',
    path: (f) => `/api/trips/${f.tripId}/countries`,
    body: () => ({ country_codes: ['DE'] }),
  },
  {
    name: 'DELETE /api/trips/:tripId/countries/:code (remove country)',
    method: 'delete',
    path: (f) => `/api/trips/${f.tripId}/countries/FR`,
  },
];

describe('Lock matrix — every mutating route 403s on a locked trip (BUG-27)', () => {
  it.each(
    LOCKED_WRITE_MATRIX.map((row) => [row.name, row] as const),
  )('%s → 403 LockError', async (_name, row) => {
    let req = supertest(app)[row.method](row.path(fx));
    if (row.body) req = req.send(row.body(fx));

    const res = await req.expect(403);
    expect(res.body).toEqual({ error: 'Trip is locked' });
  });

  // ----------------------------------------------------------------
  // Persistence spot-checks for the two audit gaps — a rejected write
  // must leave no trace in the database.
  // ----------------------------------------------------------------

  it('DELETE on a locked trip leaves the trip in the database', async () => {
    await supertest(app).delete(`/api/trips/${fx.tripId}`).expect(403);

    const { eq } = await import('drizzle-orm');
    const rows = await testDb!
      .select({ id: schema.trips.id, status: schema.trips.status })
      .from(schema.trips)
      .where(eq(schema.trips.id, fx.tripId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('locked');
  });

  it('activity tag/untag on a locked trip leaves the mapping unchanged', async () => {
    await supertest(app)
      .post(`/api/trips/${fx.tripId}/places/${fx.placeId}/activities`)
      .send({ activity_id: fx.otherActivityId })
      .expect(403);
    await supertest(app)
      .delete(`/api/trips/${fx.tripId}/places/${fx.placeId}/activities/${fx.activityId}`)
      .expect(403);

    const { eq } = await import('drizzle-orm');
    const mappings = await testDb!
      .select()
      .from(schema.tripPlaceActivitiesMap)
      .where(eq(schema.tripPlaceActivitiesMap.tripPlaceId, fx.placeId));
    expect(mappings).toHaveLength(1);
    expect(mappings[0].activityId).toBe(fx.activityId);
  });
});

// ----------------------------------------------------------------
// Permitted mutations — unlocking a locked trip must still work (TR-07)
// ----------------------------------------------------------------

describe('Lock matrix — permitted mutations on a locked trip (TR-07)', () => {
  it('PATCH /api/trips/:id/unlock → 200, status becomes review_pending', async () => {
    const res = await supertest(app).patch(`/api/trips/${fx.tripId}/unlock`).expect(200);
    expect(res.body.status).toBe('review_pending');
  });

  it('PATCH /api/trips/:id/status { status: review_pending } → 200 (unlock transition)', async () => {
    const res = await supertest(app)
      .patch(`/api/trips/${fx.tripId}/status`)
      .send({ status: 'review_pending' })
      .expect(200);
    expect(res.body.status).toBe('review_pending');
  });

  it('trip becomes writable again after unlock', async () => {
    await supertest(app).patch(`/api/trips/${fx.tripId}/unlock`).expect(200);

    const res = await supertest(app)
      .patch(`/api/trips/${fx.tripId}`)
      .send({ name: 'Editable Again' })
      .expect(200);
    expect(res.body.name).toBe('Editable Again');
  });

  // Documented edge: locking an already-locked trip is a no-op transition
  // rejected as a ValidationError (400 'Trip is already locked'), not a
  // LockError — it does not modify trip data either way.
  it('PATCH /api/trips/:id/lock on an already-locked trip → 400', async () => {
    const res = await supertest(app).patch(`/api/trips/${fx.tripId}/lock`).expect(400);
    expect(res.body).toEqual({ error: 'Trip is already locked' });
  });
});

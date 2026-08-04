/**
 * Route integration tests for the Places API.
 *
 * Covers:
 *   GET /api/trips/:tripId/places — list places for a trip
 *   POST /api/trips/:tripId/places — create a new place
 *   DELETE /api/trips/:tripId/places/:placeId — remove a place
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

async function seedCountry(db: TestDb, countryCode: string, name: string) {
  await db.insert(schema.countries).values({ countryCode, name }).onConflictDoNothing();
}

async function seedCity(
  db: TestDb,
  countryCode: string,
  name: string,
  overrides: Partial<typeof schema.cities.$inferInsert> = {},
) {
  const [city] = await db
    .insert(schema.cities)
    .values({ name, countryCode, geocodeStatus: 'resolved', ...overrides })
    .returning();
  return city;
}

// BUG-80 (#388): seeds a region row for a country already inserted via
// seedCountry — used to prove both the standalone GET /api/trips/:tripId/places
// list and the POST create response carry region_name/region_iso, not just
// region_id (repositories/places.ts's findByTrip and this route's POST both
// previously omitted the two fields entirely).
async function seedRegion(db: TestDb, countryCode: string, name: string, iso: string) {
  const [region] = await db
    .insert(schema.regions)
    .values({ countryCode, name, iso3166_2: iso })
    .returning();
  return region;
}

async function seedTrip(db: TestDb, overrides: Partial<typeof schema.trips.$inferInsert> = {}) {
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

  // BUG-80 (#388): repositories/places.ts's findByTrip already joined `cities`
  // but never `regions` — region_id was present, region_iso/region_name were
  // not. This endpoint has no current frontend consumer (confirmed by grep +
  // a full read of usePlaces.ts), but it's still a city-shaped payload the
  // brief calls out for consistency.
  it('BUG-80: place.city carries region_name/region_iso for a regioned city', async () => {
    const db = testDb!;
    const region = await seedRegion(db, 'FR', 'Île-de-France', 'FR-IDF');
    const city = await seedCity(db, 'FR', 'Paris', { regionId: region.id });
    const trip = await seedTrip(db);
    await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID });

    const res = await supertest(app).get(`/api/trips/${trip.id}/places`).expect(200);

    expect(res.body[0].city.region_id).toBe(region.id);
    expect(res.body[0].city.region_name).toBe('Île-de-France');
    expect(res.body[0].city.region_iso).toBe('FR-IDF');
  });

  it('BUG-80: place.city has null region_name/region_iso for a region-less city', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Lyon');
    const trip = await seedTrip(db);
    await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID });

    const res = await supertest(app).get(`/api/trips/${trip.id}/places`).expect(200);

    expect(res.body[0].city.region_id).toBeNull();
    expect(res.body[0].city.region_name).toBeNull();
    expect(res.body[0].city.region_iso).toBeNull();
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

  // BUG-80 (#388): this route built its own inline city object (a bare
  // `cities` select, no join at all) — region_id was present, region_iso/
  // region_name were entirely absent from the shape. The frontend doesn't
  // render this response's city fields directly today (useAddPlace
  // invalidates and re-fetches trip detail instead — confirmed by reading
  // usePlaces.ts in full), but it's still a city-shaped payload.
  it('BUG-80: created place.city carries region_name/region_iso for a regioned city', async () => {
    const db = testDb!;
    const region = await seedRegion(db, 'FR', 'Île-de-France', 'FR-IDF');
    const city = await seedCity(db, 'FR', 'Paris', { regionId: region.id });
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: city.id })
      .expect(201);

    expect(res.body.city.region_id).toBe(region.id);
    expect(res.body.city.region_name).toBe('Île-de-France');
    expect(res.body.city.region_iso).toBe('FR-IDF');
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

  it('returns 400 when arrived_on is after departed_on (BUG-28)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Lille');
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: city.id, arrived_on: '2026-06-10', departed_on: '2026-06-05' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
    expect(JSON.stringify(res.body)).toContain('departed_on must be on or after arrived_on');
  });

  it('returns 201 when arrived_on equals departed_on (same-day allowed, BUG-28)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Dijon');
    const trip = await seedTrip(db);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: city.id, arrived_on: '2026-06-03', departed_on: '2026-06-03' })
      .expect(201);

    expect(res.body).toHaveProperty('arrived_on', '2026-06-03');
    expect(res.body).toHaveProperty('departed_on', '2026-06-03');
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

  // BUG-32: items logged under a place must survive the place's deletion —
  // reassigned to trip-level (trip_place_id = NULL), not cascade-deleted.
  // Before this fix, deleting a place with items attached threw an unhandled
  // FK constraint violation (500) under FK enforcement, and would have left
  // a dangling trip_place_id reference where enforcement is off.
  it('reassigns items under the deleted place to trip-level (trip_place_id = null)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Nice');
    const trip = await seedTrip(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID })
      .returning();
    const now = new Date().toISOString();
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

    await supertest(app).delete(`/api/trips/${trip.id}/places/${place.id}`).expect(204);

    const { eq } = await import('drizzle-orm');
    const itemsAfter = await db.select().from(schema.items).where(eq(schema.items.id, item.id));
    expect(itemsAfter).toHaveLength(1);
    expect(itemsAfter[0].tripPlaceId).toBeNull();

    const placesAfter = await db
      .select()
      .from(schema.tripPlaces)
      .where(eq(schema.tripPlaces.id, place.id));
    expect(placesAfter).toHaveLength(0);
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

  it('preserves departed_on when only arrived_on is sent (BUG-28)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Avignon');
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
      .send({ arrived_on: '2026-07-02' })
      .expect(200);

    expect(res.body).toHaveProperty('arrived_on', '2026-07-02');
    expect(res.body).toHaveProperty('departed_on', '2026-07-05');
  });

  it('preserves arrived_on when only departed_on is sent (BUG-28)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Annecy');
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
      .send({ departed_on: '2026-07-08' })
      .expect(200);

    expect(res.body).toHaveProperty('arrived_on', '2026-07-01');
    expect(res.body).toHaveProperty('departed_on', '2026-07-08');
  });

  it('clears only the field explicitly set to null, preserving the other (BUG-28)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Biarritz');
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
      .send({ arrived_on: null })
      .expect(200);

    expect(res.body).toHaveProperty('arrived_on', null);
    expect(res.body).toHaveProperty('departed_on', '2026-07-05');
  });

  it('returns 400 when arrived_on is after departed_on in the same body (BUG-28)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Colmar');
    const trip = await seedTrip(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID })
      .returning();

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ arrived_on: '2026-07-10', departed_on: '2026-07-05' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
    expect(JSON.stringify(res.body)).toContain('departed_on must be on or after arrived_on');
  });

  it('returns 400 when a single-field patch violates ordering against the stored value (BUG-28)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Nancy');
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

    // arrived_on alone, after the stored departed_on → merged result invalid
    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ arrived_on: '2026-07-10' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
    expect(JSON.stringify(res.body)).toContain('departed_on must be on or after arrived_on');

    // departed_on alone, before the stored arrived_on → merged result invalid
    const res2 = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ departed_on: '2026-06-28' })
      .expect(400);

    expect(res2.body).toHaveProperty('error');

    // stored row untouched by the rejected patches
    const { eq } = await import('drizzle-orm');
    const [row] = await db
      .select()
      .from(schema.tripPlaces)
      .where(eq(schema.tripPlaces.id, place.id));
    expect(row.arrivedOn).toBe('2026-07-01');
    expect(row.departedOn).toBe('2026-07-05');
  });

  it('returns 200 when arrived_on equals departed_on (same-day allowed, BUG-28)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Chamonix');
    const trip = await seedTrip(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID })
      .returning();

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ arrived_on: '2026-07-03', departed_on: '2026-07-03' })
      .expect(200);

    expect(res.body).toHaveProperty('arrived_on', '2026-07-03');
    expect(res.body).toHaveProperty('departed_on', '2026-07-03');
  });

  it('allows clearing a date via null even when the other date is stored (BUG-28)', async () => {
    const db = testDb!;
    const city = await seedCity(db, 'FR', 'Arles');
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
      .send({ departed_on: null })
      .expect(200);

    expect(res.body).toHaveProperty('arrived_on', '2026-07-01');
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

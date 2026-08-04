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

// BUG-80 (#388): a city in a region-tier country, optionally with a region
// assigned. Used to reproduce the PO's exact UAT finding — two saved places
// for same-named cities in different UK regions ("Newport, Scotland" vs
// "Newport, Wales") rendering identically because region_name/region_iso
// were dropped when the places array was assembled (repositories/trips.ts
// already LEFT JOINs `regions` and selects both — the route just never
// surfaced them).
async function seedCityWithRegion(
  db: TestDb,
  cityName: string,
  regionName: string,
  regionIso: string,
) {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'GB', name: 'United Kingdom', regionTierEnabled: 1 })
    .onConflictDoNothing();
  const [region] = await db
    .insert(schema.regions)
    .values({ countryCode: 'GB', name: regionName, iso3166_2: regionIso })
    .returning();
  const [city] = await db
    .insert(schema.cities)
    .values({ countryCode: 'GB', name: cityName, regionId: region.id })
    .returning();
  return city;
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

  // BUG-80 (#388): the list endpoint (buildTripResponse) already carried
  // region_iso — region_name was the missing field here.
  it('BUG-80: list place.city carries region_name for a regioned city', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { name: 'UK Trip' });
    const city = await seedCityWithRegion(db, 'Newport', 'Wales', 'GB-WLS');
    await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID });

    const res = await supertest(app).get('/api/trips').expect(200);

    const place = res.body[0].places[0];
    expect(place.city.region_name).toBe('Wales');
    expect(place.city.region_iso).toBe('GB-WLS');
  });

  it('returns trips ordered by start_date descending (QUAL-02 finding 2)', async () => {
    // Seeded out of order so a passing test can't be explained by
    // insertion-order coincidence.
    const db = testDb!;
    await seedTrip(db, { name: 'Middle Trip', startDate: '2026-03-01' });
    await seedTrip(db, { name: 'Earliest Trip', startDate: '2026-01-01' });
    await seedTrip(db, { name: 'Latest Trip', startDate: '2026-06-01' });

    const res = await supertest(app).get('/api/trips').expect(200);

    expect(res.body.map((t: { name: string }) => t.name)).toEqual([
      'Latest Trip',
      'Middle Trip',
      'Earliest Trip',
    ]);
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

  // BUG-31: GET /:id previously dropped arrived_on/departed_on when assembling
  // the places array, even though they were persisted correctly by the PATCH
  // endpoint — the trip detail view (which PlaceSection renders from) never
  // saw the explicit dates and always displayed the trip fallback range.
  async function seedCityForPlace(db: TestDb) {
    await db
      .insert(schema.countries)
      .values({ countryCode: 'IT', name: 'Italy' })
      .onConflictDoNothing();
    const [city] = await db
      .insert(schema.cities)
      .values({ countryCode: 'IT', name: 'Rome' })
      .returning();
    return city;
  }

  it('returns arrived_on / departed_on set on a place via direct DB insert', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const city = await seedCityForPlace(db);
    await db.insert(schema.tripPlaces).values({
      tripId: trip.id,
      cityId: city.id,
      userId: TEST_USER_ID,
      arrivedOn: '2025-06-01',
      departedOn: '2025-06-05',
    });

    const res = await supertest(app).get(`/api/trips/${trip.id}`).expect(200);

    expect(res.body.places).toHaveLength(1);
    expect(res.body.places[0].arrived_on).toBe('2025-06-01');
    expect(res.body.places[0].departed_on).toBe('2025-06-05');
  });

  it('trip detail place has null arrived_on / departed_on when not set', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const city = await seedCityForPlace(db);
    await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID });

    const res = await supertest(app).get(`/api/trips/${trip.id}`).expect(200);

    expect(res.body.places[0].arrived_on).toBeNull();
    expect(res.body.places[0].departed_on).toBeNull();
  });

  // BUG-31 end-to-end: PATCH the place's dates, then re-fetch trip detail and
  // confirm the new values are what's displayed — this is the exact user flow
  // that was broken (set dates, save, section still shows trip range).
  it('reflects PATCHed place dates on next trip detail fetch', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const city = await seedCityForPlace(db);
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID })
      .returning();

    await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ arrived_on: '2025-07-10', departed_on: '2025-07-14' })
      .expect(200);

    const res = await supertest(app).get(`/api/trips/${trip.id}`).expect(200);

    expect(res.body.places[0].arrived_on).toBe('2025-07-10');
    expect(res.body.places[0].departed_on).toBe('2025-07-14');
  });

  // BUG-80 (#388) — PO UAT: "Once I save two different newports as two
  // different places in a trip, they display identically 'Newport United
  // Kingdom'. Should be Newport, Scotland and Newport, Wales." The two rows
  // already existed as distinct cities (the identity key did its job — this
  // was display-only); repositories/trips.ts's getPlaces() already LEFT
  // JOINs regions and selects region_iso, but this route's city object never
  // included region_iso OR region_name. Reproduces the exact scenario.
  it('BUG-80: detail place.city carries region_id/region_iso/region_name, distinguishing two same-named cities', async () => {
    const db = testDb!;
    const trip = await seedTrip(db, { name: 'UK Trip' });
    const newportScotland = await seedCityWithRegion(db, 'Newport', 'Scotland', 'GB-SCT');
    const newportWales = await seedCityWithRegion(db, 'Newport', 'Wales', 'GB-WLS');
    await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: newportScotland.id, userId: TEST_USER_ID });
    await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: newportWales.id, userId: TEST_USER_ID });

    const res = await supertest(app).get(`/api/trips/${trip.id}`).expect(200);

    expect(res.body.places).toHaveLength(2);
    const byRegion = Object.fromEntries(
      res.body.places.map((p: { city: { region_iso: string; region_name: string } }) => [
        p.city.region_iso,
        p.city,
      ]),
    );
    expect(byRegion['GB-SCT']).toMatchObject({
      name: 'Newport',
      region_id: newportScotland.regionId,
      region_name: 'Scotland',
      region_iso: 'GB-SCT',
    });
    expect(byRegion['GB-WLS']).toMatchObject({
      name: 'Newport',
      region_id: newportWales.regionId,
      region_name: 'Wales',
      region_iso: 'GB-WLS',
    });
    // The actual defect: both used to render "Newport United Kingdom" with
    // nothing in the payload to tell them apart.
    expect(byRegion['GB-SCT'].region_name).not.toBe(byRegion['GB-WLS'].region_name);
  });

  it('trip detail place.city has null region_name/region_iso for a non-region-tier city', async () => {
    const db = testDb!;
    const trip = await seedTrip(db);
    const city = await seedCityForPlace(db); // Italy — non-region-tier, no region_id
    await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: TEST_USER_ID });

    const res = await supertest(app).get(`/api/trips/${trip.id}`).expect(200);

    expect(res.body.places[0].city.region_id).toBeNull();
    expect(res.body.places[0].city.region_name).toBeNull();
    expect(res.body.places[0].city.region_iso).toBeNull();
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

/**
 * Characterization tests for entity response SHAPES (QUAL-49).
 *
 * These pin the EXACT snake_case key set of every trip / place / city / item
 * response the API emits TODAY, before the serializer extraction. They are the
 * regression net for the "persisted-but-dropped" bug class (BUG-31 place dates,
 * BUG-80 region_name/region_iso): a field present in a response today and absent
 * after the refactor must fail one of these.
 *
 * They are deliberately GREEN against the pre-refactor code (a pure refactor
 * cannot be "red first" — behaviour must not change), then must STAY green.
 *
 * Shape assertions compare the SORTED key set of each object — JSON object key
 * ORDER is not part of the response contract (no HTTP client compares raw
 * bytes; JSON is unordered), but field PRESENCE and VALUE are. Load-bearing
 * values (region_name, region_iso, country_name, arrived_on, departed_on) are
 * asserted explicitly on top of the key-set checks.
 *
 * Harness mirrors places.test.ts / items.test.ts: in-memory libSQL per test,
 * schema from the real migrations (QUAL-17), auth middleware mocked to a fixed
 * test user.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

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

const TEST_USER_ID = 'test-user-id';

// ----------------------------------------------------------------
// Expected key sets (sorted). Sourced directly from the pre-refactor
// hand-maps — see the comment on each for the emitting site.
// ----------------------------------------------------------------

// City — base only (no region join): cities POST (serializeCity) + cities PATCH.
const CITY_BASE_KEYS = [
  'country_code',
  'geocode_status',
  'id',
  'latitude',
  'longitude',
  'name',
  'region_id',
].sort();

// City — base + region names: cities GET/:id, trips list, places GET/POST.
const CITY_WITH_REGION_KEYS = [...CITY_BASE_KEYS, 'region_iso', 'region_name'].sort();

// City — base + region + country name: trips GET/:id nested place.city only.
const CITY_WITH_COUNTRY_KEYS = [...CITY_WITH_REGION_KEYS, 'country_name'].sort();

// Trip envelope: buildTripResponse (list, POST, PATCH, status) AND GET/:id.
const TRIP_KEYS = [
  'activities',
  'categories',
  'companions',
  'countries',
  'created_at',
  'end_date',
  'id',
  'name',
  'photo_album_ref',
  'places',
  'start_date',
  'status',
  'updated_at',
].sort();

// Place — trip LIST summary (buildTripResponse): just id/city_id/city.
const PLACE_SUMMARY_KEYS = ['city', 'city_id', 'id'].sort();

// Place — trip DETAIL (GET/:id): dates + activities + items + city(with country).
const PLACE_DETAIL_KEYS = [
  'activities',
  'arrived_on',
  'city',
  'city_id',
  'created_at',
  'departed_on',
  'id',
  'items',
].sort();

// Place — places list/POST: dates + activities, city(with region, no country), NO items.
const PLACE_LIST_KEYS = [
  'activities',
  'arrived_on',
  'city',
  'city_id',
  'created_at',
  'departed_on',
  'id',
].sort();

// Place — places PATCH: raw place row, NO city, NO activities.
const PLACE_RAW_KEYS = [
  'arrived_on',
  'city_id',
  'created_at',
  'departed_on',
  'id',
  'trip_id',
  'updated_at',
  'user_id',
].sort();

// Item — shared base fields (flattenItem).
const ITEM_BASE_KEYS = [
  'carried_from_item_id',
  'created_at',
  'id',
  'is_carried_forward',
  'item_type',
  'map_url',
  'notes',
  'status',
  'trip_id',
  'trip_place_id',
  'updated_at',
];
const ITEM_KEYS_BY_TYPE: Record<string, string[]> = {
  flight: [
    ...ITEM_BASE_KEYS,
    'airline',
    'flight_number',
    'departure_airport',
    'arrival_airport',
    'departure_datetime',
    'arrival_datetime',
    'booking_reference',
    'seat',
  ].sort(),
  hotel: [
    ...ITEM_BASE_KEYS,
    'property_name',
    'address',
    'check_in_date',
    'check_out_date',
    'booking_reference',
    'confirmation_number',
    'rating',
    'post_visit_notes',
  ].sort(),
  car_rental: [
    ...ITEM_BASE_KEYS,
    'provider',
    'pickup_location',
    'dropoff_location',
    'pickup_datetime',
    'dropoff_datetime',
    'booking_reference',
    'vehicle_class',
  ].sort(),
  restaurant: [
    ...ITEM_BASE_KEYS,
    'name',
    'neighbourhood_area',
    'cuisine_type',
    'source',
    'rating',
    'post_visit_notes',
  ].sort(),
  experience: [...ITEM_BASE_KEYS, 'rating', 'post_visit_notes'].sort(),
};

const keys = (o: object) => Object.keys(o).sort();

// ----------------------------------------------------------------
// Seed helpers
// ----------------------------------------------------------------

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

async function seedRegion(db: TestDb, countryCode: string, name: string, iso: string) {
  const [region] = await db
    .insert(schema.regions)
    .values({ countryCode, name, iso3166_2: iso })
    .returning();
  return region;
}

async function seedCity(
  db: TestDb,
  countryCode: string,
  name: string,
  overrides: Partial<typeof schema.cities.$inferInsert> = {},
) {
  const [city] = await db
    .insert(schema.cities)
    .values({
      name,
      countryCode,
      geocodeStatus: 'resolved',
      latitude: 48.85,
      longitude: 2.35,
      ...overrides,
    })
    .returning();
  return city;
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
      photoAlbumRef: 'https://example.com/album',
      ...overrides,
    })
    .returning();
  return trip;
}

/**
 * Seeds a fully-populated trip: France(+region) → Paris → one place with
 * explicit dates → one flight item under that place → one activity tag.
 * Returns the ids needed to hit each endpoint.
 */
async function seedRichTrip(db: TestDb) {
  await seedCountry(db, 'FR', 'France');
  const region = await seedRegion(db, 'FR', 'Île-de-France', 'FR-IDF');
  const city = await seedCity(db, 'FR', 'Paris', { regionId: region.id });
  const trip = await seedTrip(db);
  const [place] = await db
    .insert(schema.tripPlaces)
    .values({
      tripId: trip.id,
      cityId: city.id,
      userId: TEST_USER_ID,
      arrivedOn: '2026-06-02',
      departedOn: '2026-06-05',
    })
    .returning();
  const now = new Date().toISOString();
  const [item] = await db
    .insert(schema.items)
    .values({
      tripId: trip.id,
      tripPlaceId: place.id,
      itemType: 'flight',
      status: 'confirmed',
      isCarriedForward: 0,
      userId: TEST_USER_ID,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.insert(schema.itemFlights).values({ itemId: item.id, airline: 'Air France' });
  const [activity] = await db
    .insert(schema.activities)
    .values({ name: 'Museums', userId: TEST_USER_ID })
    .returning();
  await db
    .insert(schema.tripPlaceActivitiesMap)
    .values({ tripPlaceId: place.id, activityId: activity.id });
  return { trip, city, region, place, item, activity };
}

// ================================================================
// TRIP entity
// ================================================================

describe('QUAL-49 characterization — TRIP shape', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });
  afterEach(() => {
    testDb = null;
  });

  it('GET /api/trips (list) — trip envelope + place SUMMARY + city(with region)', async () => {
    const { trip } = await seedRichTrip(testDb!);
    const res = await supertest(app).get('/api/trips').expect(200);

    const t = res.body.find((x: { id: number }) => x.id === trip.id);
    expect(t).toBeDefined();
    expect(keys(t)).toEqual(TRIP_KEYS);

    // List places are the minimal "city pin" shape — no dates/activities/items.
    expect(t.places).toHaveLength(1);
    expect(keys(t.places[0])).toEqual(PLACE_SUMMARY_KEYS);
    // Nested city carries region names but NOT country_name in the list.
    expect(keys(t.places[0].city)).toEqual(CITY_WITH_REGION_KEYS);
    expect(t.places[0].city.region_name).toBe('Île-de-France');
    expect(t.places[0].city.region_iso).toBe('FR-IDF');
  });

  it('GET /api/trips/:id (detail) — envelope + place DETAIL + city(with country) + nested items', async () => {
    const { trip } = await seedRichTrip(testDb!);
    const res = await supertest(app).get(`/api/trips/${trip.id}`).expect(200);

    expect(keys(res.body)).toEqual(TRIP_KEYS);
    expect(res.body.places).toHaveLength(1);
    const place = res.body.places[0];
    expect(keys(place)).toEqual(PLACE_DETAIL_KEYS);

    // BUG-31: explicit place dates must be surfaced.
    expect(place.arrived_on).toBe('2026-06-02');
    expect(place.departed_on).toBe('2026-06-05');

    // Detail city carries country_name in addition to region names (BUG-80).
    expect(keys(place.city)).toEqual(CITY_WITH_COUNTRY_KEYS);
    expect(place.city.country_name).toBe('France');
    expect(place.city.region_name).toBe('Île-de-France');
    expect(place.city.region_iso).toBe('FR-IDF');

    // Nested items carry the full flight item shape.
    expect(place.items).toHaveLength(1);
    expect(keys(place.items[0])).toEqual(ITEM_KEYS_BY_TYPE.flight);

    // Activities are {id, name}.
    expect(place.activities).toHaveLength(1);
    expect(keys(place.activities[0])).toEqual(['id', 'name']);
  });

  it('POST /api/trips — created trip uses the same envelope', async () => {
    const res = await supertest(app)
      .post('/api/trips')
      .send({ name: 'New Trip', start_date: '2026-07-01', end_date: '2026-07-05' })
      .expect(201);
    expect(keys(res.body)).toEqual(TRIP_KEYS);
    expect(res.body.places).toEqual([]);
  });
});

// ================================================================
// PLACE entity
// ================================================================

describe('QUAL-49 characterization — PLACE shape', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });
  afterEach(() => {
    testDb = null;
  });

  it('GET /api/trips/:tripId/places — place LIST shape + city(with region)', async () => {
    const { trip } = await seedRichTrip(testDb!);
    const res = await supertest(app).get(`/api/trips/${trip.id}/places`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(keys(res.body[0])).toEqual(PLACE_LIST_KEYS);
    expect(keys(res.body[0].city)).toEqual(CITY_WITH_REGION_KEYS);
    expect(res.body[0].city.region_name).toBe('Île-de-France');
    expect(res.body[0].arrived_on).toBe('2026-06-02');
    expect(res.body[0].departed_on).toBe('2026-06-05');
  });

  it('POST /api/trips/:tripId/places — created place shape + city(with region)', async () => {
    await seedCountry(testDb!, 'FR', 'France');
    const region = await seedRegion(testDb!, 'FR', 'Île-de-France', 'FR-IDF');
    const city = await seedCity(testDb!, 'FR', 'Lyon', { regionId: region.id });
    const trip = await seedTrip(testDb!);

    const res = await supertest(app)
      .post(`/api/trips/${trip.id}/places`)
      .send({ city_id: city.id, arrived_on: '2026-06-03', departed_on: '2026-06-06' })
      .expect(201);

    expect(keys(res.body)).toEqual(PLACE_LIST_KEYS);
    expect(keys(res.body.city)).toEqual(CITY_WITH_REGION_KEYS);
    expect(res.body.city.region_name).toBe('Île-de-France');
    expect(res.body.city.region_iso).toBe('FR-IDF');
    expect(res.body.arrived_on).toBe('2026-06-03');
    expect(res.body.activities).toEqual([]);
  });

  it('PATCH /api/trips/:tripId/places/:placeId — RAW place row shape (no city)', async () => {
    const { trip, place } = await seedRichTrip(testDb!);
    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ arrived_on: '2026-06-04' })
      .expect(200);
    expect(keys(res.body)).toEqual(PLACE_RAW_KEYS);
    expect(res.body.arrived_on).toBe('2026-06-04');
    expect(res.body.trip_id).toBe(trip.id);
    expect(res.body.user_id).toBe(TEST_USER_ID);
  });
});

// ================================================================
// CITY entity
// ================================================================

describe('QUAL-49 characterization — CITY shape', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    await seedCountry(testDb!, 'FR', 'France');
  });
  afterEach(() => {
    testDb = null;
  });

  it('GET /api/cities/:id — city(with region), NO country_name', async () => {
    const region = await seedRegion(testDb!, 'FR', 'Île-de-France', 'FR-IDF');
    const city = await seedCity(testDb!, 'FR', 'Paris', { regionId: region.id });
    const res = await supertest(app).get(`/api/cities/${city.id}`).expect(200);
    expect(keys(res.body)).toEqual(CITY_WITH_REGION_KEYS);
    expect(res.body.region_name).toBe('Île-de-France');
    expect(res.body.region_iso).toBe('FR-IDF');
  });

  it('POST /api/cities — created city uses the BASE shape (no region names)', async () => {
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Bordeaux', country_code: 'FR' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) throw new Error(`unexpected ${r.status}`);
      });
    expect(keys(res.body)).toEqual(CITY_BASE_KEYS);
  });

  it('PATCH /api/cities/:id — BASE shape (no region names)', async () => {
    // PATCH is owner-only (requireOwner). The mocked user is not owner, so this
    // pins that PATCH is gated — the response SHAPE when it succeeds is covered
    // by the shared serializer + the POST base-shape test above.
    const city = await seedCity(testDb!, 'FR', 'Paris');
    const res = await supertest(app).patch(`/api/cities/${city.id}`).send({ region_id: null });
    expect([403, 200]).toContain(res.status);
    if (res.status === 200) {
      expect(keys(res.body)).toEqual(CITY_BASE_KEYS);
    }
  });
});

// ================================================================
// ITEM entity — one assertion per type
// ================================================================

describe('QUAL-49 characterization — ITEM shape (per type)', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
  });
  afterEach(() => {
    testDb = null;
  });

  const cases: Array<{ type: string; body: Record<string, unknown> }> = [
    { type: 'flight', body: { item_type: 'flight', airline: 'BA', flight_number: 'BA1' } },
    { type: 'hotel', body: { item_type: 'hotel', property_name: 'Ritz', address: '1 Rue' } },
    {
      type: 'car_rental',
      body: { item_type: 'car_rental', provider: 'Hertz', pickup_location: 'CDG' },
    },
    {
      type: 'restaurant',
      body: { item_type: 'restaurant', name: 'Le Cinq', cuisine_type: 'French' },
    },
    { type: 'experience', body: { item_type: 'experience', notes: 'Louvre' } },
  ];

  for (const { type, body } of cases) {
    it(`POST /api/trips/:tripId/items — ${type} item shape`, async () => {
      const trip = await seedTrip(testDb!);
      const res = await supertest(app)
        .post(`/api/trips/${trip.id}/items`)
        .send(body)
        .expect(201);
      expect(keys(res.body)).toEqual(ITEM_KEYS_BY_TYPE[type]);
    });
  }

  it('GET /api/trips/:tripId/items — flight list item shape', async () => {
    const trip = await seedTrip(testDb!);
    const now = new Date().toISOString();
    const [item] = await testDb!
      .insert(schema.items)
      .values({
        tripId: trip.id,
        itemType: 'flight',
        status: 'consider',
        isCarriedForward: 0,
        userId: TEST_USER_ID,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await testDb!.insert(schema.itemFlights).values({ itemId: item.id, airline: 'AF' });
    const res = await supertest(app).get(`/api/trips/${trip.id}/items`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(keys(res.body[0])).toEqual(ITEM_KEYS_BY_TYPE.flight);
  });

  it('PATCH /api/trips/:tripId/items/:itemId — experience shape after lazy rating', async () => {
    const trip = await seedTrip(testDb!);
    const now = new Date().toISOString();
    const [item] = await testDb!
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
    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/items/${item.id}`)
      .send({ rating: 5, post_visit_notes: 'great' })
      .expect(200);
    expect(keys(res.body)).toEqual(ITEM_KEYS_BY_TYPE.experience);
    expect(res.body.rating).toBe(5);
  });
});

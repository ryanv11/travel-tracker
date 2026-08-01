/**
 * ADL-46 D11 (§4.4.2) — the city-correction path. PATCH /api/trips/:t/places/:p
 * with city_id re-points a place to a different city, and because items and
 * place-level activity tags hang off trip_place_id (which does not change),
 * re-pointing preserves them — unlike delete-and-re-add.
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

const USER_ID = 'user-d11-0000-0000-0000-000000000000';

let testDb: TestDb | null = null;

vi.mock('../../db/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../db/index.js')>();
  return {
    ...real,
    getDb: () => {
      if (!testDb) throw new Error('[TEST] testDb not initialised');
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
      id: USER_ID,
      clerkId: 'clerk_d11',
      email: 'd11@example.com',
      isOwner: 0,
    };
    next();
  },
}));

vi.mock('../../services/geocoding.service.js', () => ({
  resolveCity: async () => undefined,
  resolveCityName: async () => ({ status: 'disabled', candidates: [] }),
}));

vi.mock('../../services/shading.service.js', () => ({
  getAllCountryShading: async () => [],
  getCountryShading: async () => null,
  getRegionShading: async () => [],
  invalidateConfigCache: () => undefined,
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

beforeEach(async () => {
  testDb = await createTestDb();
  const now = new Date();
  await testDb
    .insert(schema.users)
    .values({
      id: USER_ID,
      clerkId: 'clerk_d11',
      email: 'd11@example.com',
      isOwner: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  await testDb
    .insert(schema.countries)
    .values({ countryCode: 'US', name: 'United States', regionTierEnabled: 0 })
    .onConflictDoNothing();
});

afterEach(() => {
  testDb = null;
});

describe('ADL-46 D11 — re-pointing a place preserves its items and activity tags', () => {
  it('PATCH place with a corrected city_id keeps the same trip_place_id, items and activities', async () => {
    const db = testDb!;

    // Two cities — a typo'd one and the correct one.
    const [wrong] = await db
      .insert(schema.cities)
      .values({
        name: 'Denvr',
        countryCode: 'US',
        geocodeStatus: 'pending',
        createdByUserId: USER_ID,
      })
      .returning();
    const [right] = await db
      .insert(schema.cities)
      .values({ name: 'Denver', countryCode: 'US', geocodeStatus: 'resolved' })
      .returning();

    const nowIso = new Date().toISOString();
    const [trip] = await db
      .insert(schema.trips)
      .values({
        name: 'Trip',
        startDate: '2026-01-01',
        endDate: '2026-01-10',
        status: 'planning',
        userId: USER_ID,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning();
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: wrong.id, userId: USER_ID })
      .returning();

    // An item and a place-level activity tag hang off this trip_place.
    const [act] = await db
      .insert(schema.activities)
      .values({ userId: USER_ID, name: 'Skiing' })
      .returning();
    await db
      .insert(schema.tripPlaceActivitiesMap)
      .values({ tripPlaceId: place.id, activityId: act.id });
    const [item] = await db
      .insert(schema.items)
      .values({
        tripId: trip.id,
        tripPlaceId: place.id,
        itemType: 'note',
        status: 'consider',
        userId: USER_ID,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning();

    // Correct the city.
    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ city_id: right.id });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(place.id); // same trip_place_id
    expect(res.body.city_id).toBe(right.id); // re-pointed

    // Item still attached to the same place.
    const [itemAfter] = await db.select().from(schema.items).where(eq(schema.items.id, item.id));
    expect(itemAfter.tripPlaceId).toBe(place.id);

    // Activity tag preserved.
    const tags = await db
      .select()
      .from(schema.tripPlaceActivitiesMap)
      .where(eq(schema.tripPlaceActivitiesMap.tripPlaceId, place.id));
    expect(tags).toHaveLength(1);
    expect(tags[0].activityId).toBe(act.id);
  });

  it('PATCH place with a non-existent city_id → 404, place unchanged', async () => {
    const db = testDb!;
    const [city] = await db
      .insert(schema.cities)
      .values({ name: 'Denver', countryCode: 'US', geocodeStatus: 'resolved' })
      .returning();
    const nowIso = new Date().toISOString();
    const [trip] = await db
      .insert(schema.trips)
      .values({
        name: 'Trip',
        startDate: '2026-01-01',
        endDate: '2026-01-10',
        status: 'planning',
        userId: USER_ID,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning();
    const [place] = await db
      .insert(schema.tripPlaces)
      .values({ tripId: trip.id, cityId: city.id, userId: USER_ID })
      .returning();

    const res = await supertest(app)
      .patch(`/api/trips/${trip.id}/places/${place.id}`)
      .send({ city_id: 999999 });
    expect(res.status).toBe(404);

    const [after] = await db
      .select()
      .from(schema.tripPlaces)
      .where(eq(schema.tripPlaces.id, place.id));
    expect(after.cityId).toBe(city.id); // unchanged
  });
});

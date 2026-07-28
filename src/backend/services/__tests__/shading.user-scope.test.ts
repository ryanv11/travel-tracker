/**
 * Unit tests for HC-03 — user-scoped shading queries.
 *
 * Verifies that getAllCountryShading(), getCountryShading(), and getRegionShading()
 * return data scoped to the given userId, i.e. user A cannot see user B's trips.
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
      if (!testDb) throw new Error('[TEST] testDb not initialised');
      return testDb;
    },
  };
});

// Import after mock is declared (Vitest hoists vi.mock above imports)
const { getAllCountryShading, getCountryShading, getRegionShading, invalidateConfigCache } =
  await import('../shading.service.js');

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

const OWNER_USER_ID = 'owner-user-id';
const OTHER_USER_ID = 'other-user-id';

async function seedUsers(db: TestDb) {
  const now = Date.now();
  await db.insert(schema.users).values([
    {
      id: OWNER_USER_ID,
      clerkId: 'clerk_owner',
      email: 'owner@example.com',
      isOwner: 1,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
    {
      id: OTHER_USER_ID,
      clerkId: 'clerk_other',
      email: 'other@example.com',
      isOwner: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
  ]);
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('HC-03 — shading queries scoped to userId', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedUsers(testDb);
    invalidateConfigCache();
  });

  afterEach(() => {
    testDb = null;
    invalidateConfigCache();
  });

  // ----------------------------------------------------------------
  // getAllCountryShading
  // ----------------------------------------------------------------

  describe('getAllCountryShading(userId)', () => {
    it('owner sees their own trips — country shows visited_once', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });
      const city = await db
        .insert(schema.cities)
        .values({ countryCode: 'JP', name: 'Tokyo' })
        .returning();

      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'Japan Trip',
          startDate: '2025-06-01',
          endDate: '2025-06-14',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();

      await db
        .insert(schema.tripPlaces)
        .values({ tripId: trip.id, cityId: city[0].id, userId: OWNER_USER_ID });

      const results = await getAllCountryShading(OWNER_USER_ID);
      const jp = results.find((r) => r.countryCode === 'JP');
      expect(jp).toBeDefined();
      expect(jp!.stateKey).toBe('visited_once');
    });

    it('other user sees never_visited for country visited only by owner (city-visit path)', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });
      const city = await db
        .insert(schema.cities)
        .values({ countryCode: 'JP', name: 'Tokyo' })
        .returning();

      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'Japan Trip',
          startDate: '2025-06-01',
          endDate: '2025-06-14',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();

      await db
        .insert(schema.tripPlaces)
        .values({ tripId: trip.id, cityId: city[0].id, userId: OWNER_USER_ID });

      const results = await getAllCountryShading(OTHER_USER_ID);
      const jp = results.find((r) => r.countryCode === 'JP');
      expect(jp).toBeDefined();
      expect(jp!.stateKey).toBe('never_visited');
    });

    it('other user sees never_visited for country visited only by owner (trip_countries path)', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });

      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'Japan Trip',
          startDate: '2025-06-01',
          endDate: '2025-06-14',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();

      await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

      const results = await getAllCountryShading(OTHER_USER_ID);
      const jp = results.find((r) => r.countryCode === 'JP');
      expect(jp).toBeDefined();
      expect(jp!.stateKey).toBe('never_visited');
    });

    it('two users have independent shading — each sees only their own trips', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values([
        { countryCode: 'JP', name: 'Japan' },
        { countryCode: 'DE', name: 'Germany' },
      ]);

      const [jpCity] = await db
        .insert(schema.cities)
        .values({ countryCode: 'JP', name: 'Tokyo' })
        .returning();
      const [deCity] = await db
        .insert(schema.cities)
        .values({ countryCode: 'DE', name: 'Berlin' })
        .returning();

      // Owner visited JP
      const [ownerTrip] = await db
        .insert(schema.trips)
        .values({
          name: 'Owner Japan Trip',
          startDate: '2025-06-01',
          endDate: '2025-06-14',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();
      await db
        .insert(schema.tripPlaces)
        .values({ tripId: ownerTrip.id, cityId: jpCity.id, userId: OWNER_USER_ID });

      // Other user visited DE
      const [otherTrip] = await db
        .insert(schema.trips)
        .values({
          name: 'Other Germany Trip',
          startDate: '2025-07-01',
          endDate: '2025-07-10',
          status: 'locked',
          userId: OTHER_USER_ID,
        })
        .returning();
      await db
        .insert(schema.tripPlaces)
        .values({ tripId: otherTrip.id, cityId: deCity.id, userId: OTHER_USER_ID });

      // Owner sees JP visited, DE never visited
      const ownerResults = await getAllCountryShading(OWNER_USER_ID);
      expect(ownerResults.find((r) => r.countryCode === 'JP')!.stateKey).toBe('visited_once');
      expect(ownerResults.find((r) => r.countryCode === 'DE')!.stateKey).toBe('never_visited');

      // Other user sees DE visited, JP never visited
      const otherResults = await getAllCountryShading(OTHER_USER_ID);
      expect(otherResults.find((r) => r.countryCode === 'JP')!.stateKey).toBe('never_visited');
      expect(otherResults.find((r) => r.countryCode === 'DE')!.stateKey).toBe('visited_once');
    });
  });

  // ----------------------------------------------------------------
  // getCountryShading
  // ----------------------------------------------------------------

  describe('getCountryShading(countryCode, userId)', () => {
    it('owner sees visited_once for their own trip', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values({ countryCode: 'FR', name: 'France' });
      const [city] = await db
        .insert(schema.cities)
        .values({ countryCode: 'FR', name: 'Paris' })
        .returning();
      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'France Trip',
          startDate: '2025-05-01',
          endDate: '2025-05-07',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();
      await db
        .insert(schema.tripPlaces)
        .values({ tripId: trip.id, cityId: city.id, userId: OWNER_USER_ID });

      const result = await getCountryShading('FR', OWNER_USER_ID);
      expect(result).not.toBeNull();
      expect(result!.stateKey).toBe('visited_once');
    });

    it('other user sees never_visited for country visited only by owner', async () => {
      const db = testDb!;
      await db.insert(schema.countries).values({ countryCode: 'FR', name: 'France' });
      const [city] = await db
        .insert(schema.cities)
        .values({ countryCode: 'FR', name: 'Paris' })
        .returning();
      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'France Trip',
          startDate: '2025-05-01',
          endDate: '2025-05-07',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();
      await db
        .insert(schema.tripPlaces)
        .values({ tripId: trip.id, cityId: city.id, userId: OWNER_USER_ID });

      const result = await getCountryShading('FR', OTHER_USER_ID);
      expect(result).not.toBeNull();
      expect(result!.stateKey).toBe('never_visited');
    });
  });

  // ----------------------------------------------------------------
  // getRegionShading
  // ----------------------------------------------------------------

  describe('getRegionShading(countryCode, userId)', () => {
    it('owner sees visited_once for their own trip in a region', async () => {
      const db = testDb!;
      await db
        .insert(schema.countries)
        .values({ countryCode: 'AU', name: 'Australia', regionTierEnabled: 1 });
      const [region] = await db
        .insert(schema.regions)
        .values({ countryCode: 'AU', name: 'New South Wales', iso3166_2: 'AU-NSW' })
        .returning();
      const [city] = await db
        .insert(schema.cities)
        .values({ countryCode: 'AU', name: 'Sydney', regionId: region.id })
        .returning();
      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'AU Trip',
          startDate: '2025-03-01',
          endDate: '2025-03-07',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();
      await db
        .insert(schema.tripPlaces)
        .values({ tripId: trip.id, cityId: city.id, userId: OWNER_USER_ID });

      const results = await getRegionShading('AU', OWNER_USER_ID);
      const nsw = results.find((r) => r.iso3166_2 === 'AU-NSW');
      expect(nsw).toBeDefined();
      expect(nsw!.stateKey).toBe('visited_once');
    });

    it('other user sees never_visited for region visited only by owner', async () => {
      const db = testDb!;
      await db
        .insert(schema.countries)
        .values({ countryCode: 'AU', name: 'Australia', regionTierEnabled: 1 });
      const [region] = await db
        .insert(schema.regions)
        .values({ countryCode: 'AU', name: 'New South Wales', iso3166_2: 'AU-NSW' })
        .returning();
      const [city] = await db
        .insert(schema.cities)
        .values({ countryCode: 'AU', name: 'Sydney', regionId: region.id })
        .returning();
      const [trip] = await db
        .insert(schema.trips)
        .values({
          name: 'AU Trip',
          startDate: '2025-03-01',
          endDate: '2025-03-07',
          status: 'locked',
          userId: OWNER_USER_ID,
        })
        .returning();
      await db
        .insert(schema.tripPlaces)
        .values({ tripId: trip.id, cityId: city.id, userId: OWNER_USER_ID });

      const results = await getRegionShading('AU', OTHER_USER_ID);
      const nsw = results.find((r) => r.iso3166_2 === 'AU-NSW');
      expect(nsw).toBeDefined();
      expect(nsw!.stateKey).toBe('never_visited');
    });
  });
});

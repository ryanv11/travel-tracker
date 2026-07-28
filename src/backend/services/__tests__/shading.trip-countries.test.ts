/**
 * Integration tests for getAllCountryShading() — ADL-23 case (d).
 *
 * Case (d): a country appears in trip_countries but has NO city visits
 * (no trip_places rows). Before ADL-23, such a country would show as
 * 'never_visited' because getAllCountryShading() only joined through
 * trip_places. After ADL-23 the service must union trip_countries,
 * so a planning trip linked via trip_countries gets 'planned'.
 *
 * These tests use an in-memory libSQL database. They exercise the
 * real getAllCountryShading() function (not mocked), so they will
 * fail if the Backend API agent's ADL-23 implementation is not yet
 * merged — that is expected and is documented in the PR description.
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
const { getAllCountryShading, invalidateConfigCache } = await import('../shading.service.js');

// ----------------------------------------------------------------
// Tests
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

describe('getAllCountryShading() — ADL-23 case (d): trip_countries path', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedTestUser(testDb);
    // Invalidate the in-memory config cache so each test starts clean
    invalidateConfigCache();
  });

  afterEach(() => {
    testDb = null;
    invalidateConfigCache();
  });

  it('returns "planned" for JP when a planning trip has a trip_countries row for JP but no city visits', async () => {
    const db = testDb!;

    // Seed JP country
    await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });

    // Seed a planning trip — no trip_places, only a trip_countries row
    const [trip] = await db
      .insert(schema.trips)
      .values({
        name: 'Japan Planning Trip',
        startDate: '2026-09-01',
        endDate: '2026-09-14',
        status: 'planning',
        userId: TEST_USER_ID,
      })
      .returning();

    await db.insert(schema.tripCountries).values({
      tripId: trip.id,
      countryCode: 'JP',
    });

    const results = await getAllCountryShading(TEST_USER_ID);

    const jpResult = results.find((r) => r.countryCode === 'JP');
    expect(jpResult).toBeDefined();
    expect(jpResult!.stateKey).toBe('planned');
  });

  it('returns "never_visited" for JP when there are no trips or trip_countries rows', async () => {
    const db = testDb!;
    await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });

    const results = await getAllCountryShading(TEST_USER_ID);

    const jpResult = results.find((r) => r.countryCode === 'JP');
    expect(jpResult).toBeDefined();
    expect(jpResult!.stateKey).toBe('never_visited');
  });

  it('returns "visited_once" for JP when a locked trip has a trip_countries row for JP and no city visits', async () => {
    const db = testDb!;
    await db.insert(schema.countries).values({ countryCode: 'JP', name: 'Japan' });

    const [trip] = await db
      .insert(schema.trips)
      .values({
        name: 'Japan Completed Trip',
        startDate: '2025-06-01',
        endDate: '2025-06-14',
        status: 'locked',
        userId: TEST_USER_ID,
      })
      .returning();

    await db.insert(schema.tripCountries).values({
      tripId: trip.id,
      countryCode: 'JP',
    });

    const results = await getAllCountryShading(TEST_USER_ID);

    const jpResult = results.find((r) => r.countryCode === 'JP');
    expect(jpResult).toBeDefined();
    expect(jpResult!.stateKey).toBe('visited_once');
  });

  it('trip_countries path does not affect countries with no trip association', async () => {
    const db = testDb!;
    await db.insert(schema.countries).values([
      { countryCode: 'JP', name: 'Japan' },
      { countryCode: 'DE', name: 'Germany' },
    ]);

    // JP has a planning trip via trip_countries
    const [trip] = await db
      .insert(schema.trips)
      .values({
        name: 'Japan Trip',
        startDate: '2026-09-01',
        endDate: '2026-09-14',
        status: 'planning',
        userId: TEST_USER_ID,
      })
      .returning();

    await db.insert(schema.tripCountries).values({ tripId: trip.id, countryCode: 'JP' });

    const results = await getAllCountryShading(TEST_USER_ID);

    // JP should be planned; DE should be never_visited
    const jpResult = results.find((r) => r.countryCode === 'JP');
    const deResult = results.find((r) => r.countryCode === 'DE');

    expect(jpResult!.stateKey).toBe('planned');
    expect(deResult!.stateKey).toBe('never_visited');
  });
});

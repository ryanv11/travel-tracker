/**
 * Direct unit tests for the city identity algebra
 * (src/backend/services/cityIdentityService.ts) — the testability prize
 * ADL-53 §4/D3 names: this logic was previously reachable only through HTTP,
 * on the project's single most-churned surface (BUG-72/74/75/76/79/80/81/85).
 *
 * MOCK FIDELITY (QUAL-22, ADL-53 §6 Stage 2). Every unique-violation assertion
 * below runs against a REAL libSQL instance built by replaying the REAL
 * migrations, so the two partial unique indexes are live and doing the work:
 *
 *   uniq_cities_osm_ref            UNIQUE (osm_type, osm_id) WHERE osm_id IS NOT NULL
 *   uniq_cities_pending_per_creator UNIQUE (name COLLATE NOCASE, country_code,
 *                                   COALESCE(region_id,0), COALESCE(created_by_user_id,''))
 *                                   WHERE geocode_status = 'pending'
 *
 * Nothing here stubs `insertCityOrReuse`'s catch path: the violations are
 * produced by the database itself. A double that returned a canned "conflict"
 * would specify nothing — it would pass identically against an index that had
 * been dropped. Foreign keys are ON in the same fixture, which is what makes
 * the "a non-unique constraint error is rethrown, not swallowed" case real.
 *
 * NOT asserted here: cross-tenant OWNERSHIP isolation on `cities`. There is
 * none to assert — cities are global reference data (ADL-53 D3/F3), and a test
 * pretending otherwise would pass vacuously. The creator-scoped rules that DO
 * exist on this table (who may UPGRADE a row) are asserted below; cross-tenant
 * ownership on the user-owned tables is the Stage 1 matrix's job.
 */

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import {
  createTestDb,
  OTHER_USER_ID,
  seedCountry,
  seedTestUser,
  TEST_USER_ID,
  type TestDb,
} from '../../repositories/__tests__/test-db.js';

// ----------------------------------------------------------------
// Mocks
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

// The geocoder is mocked, not the database. The identity algebra's own calls
// into it (the wildcard-upgrade re-ask, the carried-ref canonicalization) are
// part of what these tests assert, so they are observed, not exercised.
const geo = vi.hoisted(() => ({
  resolveCity: vi.fn(),
  resolveByOsmId: vi.fn(),
  resolveCityName: vi.fn(),
}));

vi.mock('../geocoding.service.js', () => geo);

const { citiesRepository } = await import('../../repositories/cities.js');
const { createOrReuseCarriedCity, findOrUpgradeCity, insertCityOrReuse } = await import(
  '../cityIdentityService.js'
);

// ----------------------------------------------------------------
// Fixture
// ----------------------------------------------------------------

const COUNTRY = 'US';
let regionId: number;
let otherRegionId: number;

async function insertCity(values: Partial<typeof schema.cities.$inferInsert> = {}) {
  const [row] = await testDb!
    .insert(schema.cities)
    .values({ name: 'Springfield', countryCode: COUNTRY, geocodeStatus: 'pending', ...values })
    .returning();
  return row;
}

beforeEach(async () => {
  testDb = await createTestDb();
  geo.resolveCity.mockReset().mockResolvedValue(true);
  geo.resolveByOsmId.mockReset().mockResolvedValue(null);

  await seedTestUser(testDb, TEST_USER_ID, 'user_a');
  await seedTestUser(testDb, OTHER_USER_ID, 'user_b');
  await seedCountry(testDb, COUNTRY, 'United States');
  const [r1] = await testDb
    .insert(schema.regions)
    .values({ countryCode: COUNTRY, name: 'Illinois', iso3166_2: 'US-IL' })
    .returning();
  const [r2] = await testDb
    .insert(schema.regions)
    .values({ countryCode: COUNTRY, name: 'Massachusetts', iso3166_2: 'US-MA' })
    .returning();
  regionId = r1.id;
  otherRegionId = r2.id;
});

// ----------------------------------------------------------------
// insertCityOrReuse — the M1/F3 caught-violation → re-select-and-reuse pattern
// ----------------------------------------------------------------

describe('insertCityOrReuse (real libSQL, live partial unique indexes)', () => {
  it('reports created=true when the insert wins', async () => {
    const { row, created } = await insertCityOrReuse(
      () => citiesRepository.insert({ name: 'Newport', countryCode: COUNTRY }),
      async () => null,
    );

    expect(created).toBe(true);
    expect(row.name).toBe('Newport');
  });

  it('catches a real uniq_cities_osm_ref violation and reuses the winner row', async () => {
    const winner = await insertCity({
      name: 'Newport',
      geocodeStatus: 'resolved',
      osmType: 'node',
      osmId: 111,
    });

    const { row, created } = await insertCityOrReuse(
      // Different name, SAME osm ref — only the osm-ref index can fire here
      // (the pending-per-creator index is partial on geocode_status='pending').
      () =>
        citiesRepository.insert({
          name: 'Newport Beach',
          countryCode: COUNTRY,
          geocodeStatus: 'resolved',
          osmType: 'node',
          osmId: 111,
        }),
      () => citiesRepository.findByOsmRef('node', 111),
    );

    expect(created).toBe(false);
    expect(row.id).toBe(winner.id);
    expect(row.name).toBe('Newport');

    const all = await testDb!.select().from(schema.cities);
    expect(all).toHaveLength(1);
  });

  it('catches a real uniq_cities_pending_per_creator violation and reuses the winner row', async () => {
    const winner = await insertCity({
      name: 'Springfield',
      geocodeStatus: 'pending',
      createdByUserId: TEST_USER_ID,
    });

    const { row, created } = await insertCityOrReuse(
      () =>
        citiesRepository.insert({
          name: 'Springfield',
          countryCode: COUNTRY,
          geocodeStatus: 'pending',
          createdByUserId: TEST_USER_ID,
        }),
      () => findOrUpgradeCity('Springfield', COUNTRY, null, TEST_USER_ID),
    );

    expect(created).toBe(false);
    expect(row.id).toBe(winner.id);
  });

  it('rethrows a constraint error that is NOT a unique violation', async () => {
    // Foreign keys are ON in this fixture, so an unknown country_code raises
    // SQLITE_CONSTRAINT_FOREIGNKEY. Swallowing that into the reuse branch
    // would turn a genuine bug into a silent wrong-row response.
    const reselect = vi.fn(async () => null);

    await expect(
      insertCityOrReuse(
        () => citiesRepository.insert({ name: 'Nowhere', countryCode: 'ZZ' }),
        reselect,
      ),
    ).rejects.toThrow();

    expect(reselect).not.toHaveBeenCalled();
  });

  it('rethrows the original violation when the re-select finds nothing', async () => {
    await insertCity({
      name: 'Newport',
      geocodeStatus: 'resolved',
      osmType: 'node',
      osmId: 111,
    });

    await expect(
      insertCityOrReuse(
        () =>
          citiesRepository.insert({
            name: 'Newport Beach',
            countryCode: COUNTRY,
            geocodeStatus: 'resolved',
            osmType: 'node',
            osmId: 111,
          }),
        async () => null,
      ),
    ).rejects.toThrow();
  });
});

// ----------------------------------------------------------------
// findOrUpgradeCity — ADL-46 D13 three-step find-or-create
// ----------------------------------------------------------------

describe('findOrUpgradeCity — step 1 (exact identity key)', () => {
  it('matches case-insensitively and is deliberately creator-blind', async () => {
    // The unique index is global, so step 1 MUST be able to return another
    // user's pending row — a creator-filtered step 1 would miss it and the
    // follow-on insert would collide on the index instead.
    const other = await insertCity({
      name: 'Springfield',
      geocodeStatus: 'pending',
      createdByUserId: OTHER_USER_ID,
    });

    const found = await findOrUpgradeCity('sPrInGfIeLd', COUNTRY, null, TEST_USER_ID);

    expect(found?.id).toBe(other.id);
  });

  it('keys on COALESCE(region_id, 0), so a differently-regioned row is not a match', async () => {
    await insertCity({ name: 'Springfield', regionId: otherRegionId, geocodeStatus: 'resolved' });

    // Region requested, no row on that key, and the only same-name row is
    // regioned (so not a wildcard-upgrade candidate) → genuine insert needed.
    const found = await findOrUpgradeCity('Springfield', COUNTRY, regionId, TEST_USER_ID);

    expect(found).toBeNull();
  });
});

describe('findOrUpgradeCity — step 2 (wildcard upgrade)', () => {
  it('adopts a region-less pending row, resets the retry budget and re-asks the geocoder', async () => {
    const regionless = await insertCity({
      name: 'Springfield',
      geocodeStatus: 'pending',
      geocodeAttempts: 4,
      createdByUserId: TEST_USER_ID,
    });

    const found = await findOrUpgradeCity('Springfield', COUNTRY, regionId, TEST_USER_ID);

    expect(found?.id).toBe(regionless.id);
    expect(found?.regionId).toBe(regionId);
    expect(found?.geocodeAttempts).toBe(0);
    expect(geo.resolveCity).toHaveBeenCalledWith(regionless.id);

    // Specialised in place — no duplicate row was created.
    const all = await testDb!.select().from(schema.cities);
    expect(all).toHaveLength(1);
  });

  it('adopts an unresolvable row WITHOUT re-asking the geocoder', async () => {
    // Ruling §2.5 asymmetry: the geocoder returned zero candidates, and adding
    // a region constraint cannot turn zero into some.
    const regionless = await insertCity({
      name: 'Springfield',
      geocodeStatus: 'unresolvable',
      createdByUserId: TEST_USER_ID,
    });

    const found = await findOrUpgradeCity('Springfield', COUNTRY, regionId, TEST_USER_ID);

    expect(found?.id).toBe(regionless.id);
    expect(found?.regionId).toBe(regionId);
    expect(geo.resolveCity).not.toHaveBeenCalled();
  });

  it('adopts a region-less row with NO known creator', async () => {
    const seeded = await insertCity({ name: 'Springfield', geocodeStatus: 'pending' });

    const found = await findOrUpgradeCity('Springfield', COUNTRY, regionId, TEST_USER_ID);

    expect(found?.id).toBe(seeded.id);
  });

  it("declines another user's region-less pending row and leaves it untouched", async () => {
    // Read-through is global (the index is global); write-through is scoped.
    const other = await insertCity({
      name: 'Springfield',
      geocodeStatus: 'pending',
      createdByUserId: OTHER_USER_ID,
    });

    const found = await findOrUpgradeCity('Springfield', COUNTRY, regionId, TEST_USER_ID);

    expect(found).toBeNull();
    const [after] = await testDb!
      .select()
      .from(schema.cities)
      .where(eq(schema.cities.id, other.id));
    expect(after.regionId).toBeNull();
  });

  it('declines a resolved region-less row (status whitelist, not `<> resolved`)', async () => {
    await insertCity({
      name: 'Springfield',
      geocodeStatus: 'resolved',
      createdByUserId: TEST_USER_ID,
    });

    const found = await findOrUpgradeCity('Springfield', COUNTRY, regionId, TEST_USER_ID);

    expect(found).toBeNull();
  });

  it('does NOT fall through to the reverse branch when a region was requested', async () => {
    // Exactly one same-name row exists, so the no-region reverse branch would
    // return it. A region-bearing request must not reach that branch.
    await insertCity({
      name: 'Springfield',
      regionId: otherRegionId,
      geocodeStatus: 'resolved',
    });

    expect(await findOrUpgradeCity('Springfield', COUNTRY, regionId, TEST_USER_ID)).toBeNull();
    expect(await findOrUpgradeCity('Springfield', COUNTRY, null, TEST_USER_ID)).not.toBeNull();
  });
});

describe('findOrUpgradeCity — step 2b (reverse single-match)', () => {
  it('returns the single (name, country) match regardless of its region', async () => {
    // The BUG-33-through-the-reverse-door case: a region-tier country holding
    // exactly one *regioned* row must not get a second, region-less duplicate.
    const only = await insertCity({
      name: 'Springfield',
      regionId,
      geocodeStatus: 'resolved',
    });

    const found = await findOrUpgradeCity('Springfield', COUNTRY, null, TEST_USER_ID);

    expect(found?.id).toBe(only.id);
  });

  it('returns null when two rows match, leaving disambiguation to D14', async () => {
    await insertCity({ name: 'Springfield', regionId, geocodeStatus: 'resolved' });
    await insertCity({ name: 'Springfield', regionId: otherRegionId, geocodeStatus: 'resolved' });

    expect(await findOrUpgradeCity('Springfield', COUNTRY, null, TEST_USER_ID)).toBeNull();
  });
});

// ----------------------------------------------------------------
// createOrReuseCarriedCity — BUG-75 v3 carried-OSM identity
// ----------------------------------------------------------------

describe('createOrReuseCarriedCity', () => {
  const carried = {
    osmType: 'node' as const,
    osmId: 999,
    displayName: 'Newport, Rhode Island, USA',
    name: 'Newport',
    countryCode: COUNTRY,
    regionId: null,
    userId: TEST_USER_ID,
  };

  it('reuses a row already carrying the ref without calling the geocoder', async () => {
    const existing = await insertCity({
      name: 'Newport',
      geocodeStatus: 'resolved',
      osmType: 'node',
      osmId: 999,
    });

    const { city, created } = await createOrReuseCarriedCity(carried);

    expect(created).toBe(false);
    expect(city.id).toBe(existing.id);
    expect(geo.resolveByOsmId).not.toHaveBeenCalled();
  });

  it('inserts a resolved row from the canonical lookup, keeping the user country/region', async () => {
    geo.resolveByOsmId.mockResolvedValue({
      name: '  Newport  ',
      latitude: 41.49,
      longitude: -71.31,
      osmType: 'node',
      osmId: 999,
      displayName: 'Newport, RI, United States',
    });

    const { city, created } = await createOrReuseCarriedCity({ ...carried, regionId });

    expect(created).toBe(true);
    expect(city.name).toBe('Newport'); // canonical, trimmed
    expect(city.latitude).toBe(41.49);
    expect(city.longitude).toBe(-71.31);
    expect(city.geocodeStatus).toBe('resolved');
    // D12 rule 3 — the lookup never overrides the user's country/region.
    expect(city.countryCode).toBe(COUNTRY);
    expect(city.regionId).toBe(regionId);
    expect(city.createdByUserId).toBe(TEST_USER_ID);
  });

  it('degrades to a pending row that retains the carried ref when the lookup returns nothing', async () => {
    geo.resolveByOsmId.mockResolvedValue(null);

    const { city, created } = await createOrReuseCarriedCity(carried);

    expect(created).toBe(true);
    expect(city.geocodeStatus).toBe('pending');
    expect(city.osmType).toBe('node');
    expect(city.osmId).toBe(999);
    expect(city.displayName).toBe(carried.displayName);
    expect(city.latitude).toBeNull();
  });

  it('merges onto the winner when a concurrent request wins the insert race', async () => {
    // The race is real, not simulated at the boundary: the competing row is
    // written between the ref check and this request's insert, so the live
    // uniq_cities_osm_ref index is what rejects the second insert.
    let winnerId = 0;
    geo.resolveByOsmId.mockImplementation(async () => {
      const winner = await insertCity({
        name: 'Newport',
        geocodeStatus: 'resolved',
        osmType: 'node',
        osmId: 999,
        createdByUserId: OTHER_USER_ID,
      });
      winnerId = winner.id;
      return {
        name: 'Newport',
        latitude: 41.49,
        longitude: -71.31,
        osmType: 'node',
        osmId: 999,
        displayName: 'Newport, RI, United States',
      };
    });

    const { city, created } = await createOrReuseCarriedCity(carried);

    expect(created).toBe(false);
    expect(city.id).toBe(winnerId);

    const all = await testDb!.select().from(schema.cities);
    expect(all).toHaveLength(1);
  });
});

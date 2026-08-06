/**
 * BUG-75 / GE-16 (v3.19) — canonicalize-by-id (F1) + M-B terminal state, SERVICE layer.
 *
 * ATDD-first RED acceptance tests (OP-35). Authored BEFORE implementation.
 *
 * This file exercises geocoding.service FOR REAL against a test DB, mocking only
 * the Nominatim egress chokepoint (nominatim-client) — the same boundary the
 * existing geocoding.service.test.ts uses. It targets the two pieces of the F1
 * mechanism that live in the service, not the route:
 *
 *   • resolveByOsmId(osmType, osmId) — the not-yet-built canonicalize-by-id call
 *     (v3 §B1.2) that resolves a carried pick via nominatimLookup(/lookup?osm_ids=)
 *     rather than a constrained name re-search. Deterministic: the carried ref IS
 *     the query.
 *   • resolveCity's pending→resolved branch when the row carries a stored osm_id
 *     (v3 §B1.4): it must canonicalize by /lookup, and — the M-B delta-review
 *     finding — when /lookup returns 200-empty (stale/deleted/reclassified OSM
 *     object) it must land in a DEFINED terminal state, never a 500, never an
 *     infinite-pending loop, and (per the review's chosen resolution for the
 *     pending-retry path) become terminal 'unresolvable' rather than a wrong pin.
 *
 * Mock fidelity (QUAL-22): the nominatim-client double exports every function the
 * real module exports; the `mock fidelity` test below asserts that mechanically,
 * so a route/service call to an omitted method cannot be swallowed into a vacuous
 * green. nominatimLookup returns the real NominatimSearchResult contract.
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';
import type { NominatimSearchResult } from '../nominatim-client.js';

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

let nextSearchResult: NominatimSearchResult = { status: 'ok', candidates: [] };
let lookupResultFor: Record<string, NominatimSearchResult> = {};
let defaultLookupResult: NominatimSearchResult = { status: 'ok', candidates: [] };
let lookupCalls: string[][] = [];

vi.mock('../nominatim-client.js', () => ({
  nominatimSearch: vi.fn(async () => nextSearchResult),
  nominatimLookup: vi.fn(async (osmIds: string[]) => {
    lookupCalls.push(osmIds);
    for (const id of osmIds) {
      if (id in lookupResultFor) return lookupResultFor[id];
    }
    return defaultLookupResult;
  }),
  __resetChokepointForTests: vi.fn(() => undefined),
}));

// resolveByOsmId does not exist yet — importing it is part of the RED contract.
const geocodingService = await import('../geocoding.service.js');
const { resolveCity } = geocodingService;

function candidate(overrides: {
  name?: string;
  osmType?: 'node' | 'way' | 'relation';
  osmId?: number;
  displayName?: string;
  lat?: number;
  lon?: number;
  countryCode?: string | null;
  regionIso?: string | null;
}) {
  return {
    displayName: overrides.displayName ?? `${overrides.name ?? 'Testville'}, Test Country`,
    name: overrides.name ?? 'Testville',
    latitude: overrides.lat ?? 1,
    longitude: overrides.lon ?? 1,
    countryCode: overrides.countryCode ?? 'GB',
    regionIso: overrides.regionIso ?? null,
    class: 'place',
    type: 'city',
    osmType: overrides.osmType ?? 'node',
    osmId: overrides.osmId ?? 1,
  };
}

async function seedGbEng(db: TestDb): Promise<number> {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'GB', name: 'United Kingdom', regionTierEnabled: 1 })
    .onConflictDoNothing();
  const [region] = await db
    .insert(schema.regions)
    .values({ countryCode: 'GB', name: 'England', iso3166_2: 'GB-ENG' })
    .returning();
  return region.id;
}

/** Seed a pending city carrying a stored osm ref (columns must exist → RED). */
async function seedPendingWithOsm(db: TestDb, regionId: number, osmId: number): Promise<number> {
  const [row] = await db
    .insert(schema.cities)
    .values({
      name: 'Newport',
      countryCode: 'GB',
      regionId,
      geocodeStatus: 'pending',
      // These columns are added by the EXPAND migration — absent now (RED).
      osmType: 'node',
      osmId,
      displayName: 'Newport, England, UK',
    } as typeof schema.cities.$inferInsert)
    .returning();
  return row.id;
}

async function statusOf(db: TestDb, id: number): Promise<string> {
  const [row] = await db
    .select({ s: schema.cities.geocodeStatus })
    .from(schema.cities)
    .where(eq(schema.cities.id, id));
  return row.s;
}

beforeEach(async () => {
  testDb = await createTestDb();
  vi.stubEnv('GEOCODING_ENABLED', 'true');
  nextSearchResult = { status: 'ok', candidates: [] };
  lookupResultFor = {};
  defaultLookupResult = { status: 'ok', candidates: [] };
  lookupCalls = [];
});

afterEach(() => {
  testDb = null;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('BUG-75 mock fidelity (service layer)', () => {
  it('the nominatim-client double exports a function for every function the real module exports', async () => {
    const realModule =
      await vi.importActual<typeof import('../nominatim-client.js')>('../nominatim-client.js');
    const mockedModule = await import('../nominatim-client.js');
    const realFns = Object.entries(realModule)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k);
    const mockFns = Object.entries(mockedModule)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k);
    for (const name of realFns) {
      expect(mockFns, `mock missing real export "${name}"`).toContain(name);
    }
  });
});

describe('BUG-75 F1 — resolveByOsmId canonicalizes a carried pick by /lookup (deterministic)', () => {
  it('exports resolveByOsmId', () => {
    expect(
      (geocodingService as Record<string, unknown>).resolveByOsmId,
      'geocoding.service must export resolveByOsmId (v3 §B1.2)',
    ).toBeTypeOf('function');
  });

  it('maps node/way/relation → N/W/R and returns the single canonical candidate from /lookup', async () => {
    lookupResultFor['N26700978'] = {
      status: 'ok',
      candidates: [candidate({ osmType: 'node', osmId: 26700978, lat: 50.7, lon: -1.29 })],
    };
    const resolveByOsmId = (
      geocodingService as unknown as {
        resolveByOsmId?: (t: string, i: number) => Promise<unknown>;
      }
    ).resolveByOsmId;
    expect(resolveByOsmId).toBeTypeOf('function');

    const result = (await resolveByOsmId!('node', 26700978)) as {
      latitude?: number;
      longitude?: number;
    } | null;

    // It went through /lookup with the type-prefixed id — the determinism property.
    expect(lookupCalls.flat()).toContain('N26700978');
    expect(result).not.toBeNull();
    expect(result?.latitude).toBeCloseTo(50.7);
    expect(result?.longitude).toBeCloseTo(-1.29);
  });
});

describe('BUG-75 F1/M-B — resolveCity on a pending row carrying an osm_id', () => {
  it('resolves deterministically via /lookup (not the constrained name search)', async () => {
    const engId = await seedGbEng(testDb!);
    const cityId = await seedPendingWithOsm(testDb!, engId, 26700978);
    lookupResultFor['N26700978'] = {
      status: 'ok',
      candidates: [candidate({ osmType: 'node', osmId: 26700978, lat: 50.7, lon: -1.29 })],
    };
    // If the row's osm_id is (wrongly) ignored and the name-search path runs,
    // this empty search would leave it pending — so asserting 'resolved' proves
    // the /lookup path was taken.
    nextSearchResult = { status: 'ok', candidates: [] };

    const ok = await resolveCity(cityId);
    expect(ok).toBe(true);
    expect(lookupCalls.flat()).toContain('N26700978');
    expect(await statusOf(testDb!, cityId)).toBe('resolved');
  });

  it('M-B: /lookup 200-empty for the stored id → terminal unresolvable (never 500, never infinite-pending, never a wrong pin)', async () => {
    const engId = await seedGbEng(testDb!);
    const cityId = await seedPendingWithOsm(testDb!, engId, 99999999);
    // Stale/deleted/reclassified object: 200 OK, zero candidates.
    lookupResultFor['N99999999'] = { status: 'ok', candidates: [] };

    // Must not throw (no 500-equivalent at the service).
    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);
    // Anti-vacuous-green guard (QUAL-22): the terminal verdict must be reached
    // via /lookup on the STORED osm_id, NOT the old name-search path. Without
    // this, a row whose osm_id was ignored reaches 'unresolvable' through the
    // existing name-search unresolved branch and the test passes proving nothing.
    expect(
      lookupCalls.flat(),
      'resolveCity did not canonicalize the pending row by /lookup — the stored osm_id was ignored (M-B path not wired)',
    ).toContain('N99999999');
    // Terminal — a deleted/reclassified OSM object will not come back as a
    // settlement; it must drop out of the retry queue, not loop pending forever.
    expect(await statusOf(testDb!, cityId)).toBe('unresolvable');
  });
});

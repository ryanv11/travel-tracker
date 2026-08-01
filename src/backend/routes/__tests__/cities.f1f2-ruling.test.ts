/**
 * ADL-46 F1/F2 ruling (2026-08-01) — route-level test obligations §4, items 4 and 5.
 *
 * Review finding F4 established that every existing route suite (cities.test.ts,
 * cities-find-or-create.test.ts, adl46-access-model.test.ts) mocks
 * geocoding.service.js away wholesale — which is exactly why F1 and the shipped
 * multi-region regression reached this branch behind green tests. A fix landing
 * behind the same mocks proves nothing (ruling §4).
 *
 * This file deliberately does NOT mock geocoding.service.js. It mocks only the
 * Nominatim egress chokepoint (nominatim-client.js) with a controllable
 * candidate-returning fake, so findOrUpgradeCity's step 2 predicate,
 * classifyCandidates, and resolveCity all execute for real through the route.
 *
 * Covers:
 *   §4 item 4 — findOrUpgradeCity step 2: declines on a resolved row (original
 *     untouched including coordinates), declines on another creator's pending
 *     row, succeeds on a NULL-creator pending row, succeeds on the caller's own
 *     with geocode_attempts reset.
 *   §4 item 5 — step 2b's two-or-more path does not violate the unique index
 *     (ruling §3.3 amendment 2: step 1 and step 2b stay creator/status-blind on
 *     purpose, precisely to avoid this).
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';
import type { NominatimSearchResult } from '../../services/nominatim-client.js';

const USER_A_ID = 'user-f1f2-a-0000-0000-0000-000000000000';
const USER_B_ID = 'user-f1f2-b-0000-0000-0000-000000000000';

let testDb: TestDb | null = null;
let mockUserId = USER_A_ID;
let nextResult: NominatimSearchResult = { status: 'ok', candidates: [] };

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
      id: mockUserId,
      clerkId: 'clerk_f1f2',
      email: 'f1f2@example.com',
      isOwner: 0,
    };
    next();
  },
}));

// The ONLY geocoding-adjacent mock in this file — a controllable candidate
// fake at the Nominatim egress chokepoint. geocoding.service.js (resolveCity,
// resolveCityName, classifyCandidates) runs for real.
vi.mock('../../services/nominatim-client.js', () => ({
  nominatimSearch: vi.fn(async () => nextResult),
}));

vi.mock('../../services/shading.service.js', () => ({
  getAllCountryShading: async () => [],
  getCountryShading: async () => null,
  getRegionShading: async () => [],
  invalidateConfigCache: () => undefined,
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

function candidate(
  overrides: {
    name?: string;
    lat?: number;
    lon?: number;
    countryCode?: string | null;
    regionIso?: string | null;
  } = {},
) {
  return {
    displayName: overrides.name ?? 'Testville',
    name: overrides.name ?? 'Testville',
    latitude: overrides.lat ?? 1,
    longitude: overrides.lon ?? 1,
    countryCode: overrides.countryCode ?? 'US',
    regionIso: overrides.regionIso ?? null,
    class: 'place',
    type: 'city',
  };
}

async function seedUser(db: TestDb, id: string) {
  const now = new Date();
  await db
    .insert(schema.users)
    .values({
      id,
      clerkId: `clerk_${id}`,
      email: `${id}@example.com`,
      isOwner: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

async function seedRegionTierCountry(db: TestDb) {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'US', name: 'United States', regionTierEnabled: 1 })
    .onConflictDoNothing();
}

async function seedRegion(db: TestDb, name: string, iso: string): Promise<number> {
  const [r] = await db
    .insert(schema.regions)
    .values({ countryCode: 'US', name, iso3166_2: iso })
    .returning({ id: schema.regions.id });
  return r.id;
}

async function seedCity(
  db: TestDb,
  overrides: Partial<typeof schema.cities.$inferInsert> & { name: string },
) {
  const [row] = await db
    .insert(schema.cities)
    .values({ countryCode: 'US', ...overrides })
    .returning();
  return row;
}

beforeEach(async () => {
  testDb = await createTestDb();
  vi.stubEnv('GEOCODING_ENABLED', 'true');
  mockUserId = USER_A_ID;
  nextResult = { status: 'ok', candidates: [] };
  await seedUser(testDb, USER_A_ID);
  await seedUser(testDb, USER_B_ID);
  await seedRegionTierCountry(testDb);
});

afterEach(() => {
  testDb = null;
  vi.unstubAllEnvs();
});

describe('ADL-46 F1/F2 ruling — findOrUpgradeCity step 2 predicate (§4 item 4)', () => {
  it('declines to upgrade a RESOLVED region-less row: new row inserted, original untouched including its coordinates', async () => {
    const coId = await seedRegion(testDb!, 'Colorado', 'US-CO');
    const resolved = await seedCity(testDb!, {
      name: 'Denver',
      regionId: null,
      geocodeStatus: 'resolved',
      latitude: 39.7,
      longitude: -104.9,
      createdByUserId: USER_A_ID,
    });

    // Caller is the row's own creator, and even so a resolved row must not be
    // upgraded (§3.1: resolved is a bar for step 2, not a grant).
    mockUserId = USER_A_ID;
    nextResult = { status: 'ok', candidates: [] }; // resolve-then-create degrades to pending
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Denver', country_code: 'US', region_id: coId });

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(resolved.id);

    const [originalAfter] = await testDb!
      .select()
      .from(schema.cities)
      .where(eq(schema.cities.id, resolved.id));
    expect(originalAfter.regionId).toBeNull();
    expect(originalAfter.geocodeStatus).toBe('resolved');
    expect(originalAfter.latitude).toBeCloseTo(39.7);
    expect(originalAfter.longitude).toBeCloseTo(-104.9);
  });

  it("declines to upgrade another creator's PENDING row: new row inserted, the other user's row untouched", async () => {
    const coId = await seedRegion(testDb!, 'Colorado', 'US-CO');
    const otherPending = await seedCity(testDb!, {
      name: 'Denver',
      regionId: null,
      geocodeStatus: 'pending',
      createdByUserId: USER_A_ID,
    });

    mockUserId = USER_B_ID;
    nextResult = { status: 'ok', candidates: [] };
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Denver', country_code: 'US', region_id: coId });

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(otherPending.id);

    const [originalAfter] = await testDb!
      .select()
      .from(schema.cities)
      .where(eq(schema.cities.id, otherPending.id));
    expect(originalAfter.regionId).toBeNull(); // untouched
    expect(originalAfter.geocodeAttempts).toBe(0);
  });

  it('succeeds on a NULL-creator PENDING row: adopted (same id, region now set)', async () => {
    const coId = await seedRegion(testDb!, 'Colorado', 'US-CO');
    const orphanPending = await seedCity(testDb!, {
      name: 'Denver',
      regionId: null,
      geocodeStatus: 'pending',
      // createdByUserId intentionally omitted → NULL
    });

    mockUserId = USER_B_ID; // any caller — the row belongs to nobody
    nextResult = { status: 'ok', candidates: [] };
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Denver', country_code: 'US', region_id: coId });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orphanPending.id);
    expect(res.body.region_id).toBe(coId);
  });

  it("succeeds on the caller's own PENDING row, resetting geocode_attempts", async () => {
    const coId = await seedRegion(testDb!, 'Colorado', 'US-CO');
    const ownPending = await seedCity(testDb!, {
      name: 'Denver',
      regionId: null,
      geocodeStatus: 'pending',
      geocodeAttempts: 3,
      createdByUserId: USER_A_ID,
    });

    mockUserId = USER_A_ID;
    // Region-constrained re-ask fires on adoption (ruling §3.3 amendment 3) —
    // give it a candidate that confirms the newly-set region so it resolves
    // rather than looping back to pending (irrelevant to this assertion, but
    // keeps the fire-and-forget call from logging a spurious ambiguous case).
    nextResult = { status: 'ok', candidates: [candidate({ name: 'Denver', regionIso: 'US-CO' })] };
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Denver', country_code: 'US', region_id: coId });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ownPending.id);
    expect(res.body.region_id).toBe(coId);

    const [row] = await testDb!
      .select()
      .from(schema.cities)
      .where(eq(schema.cities.id, ownPending.id));
    expect(row.geocodeAttempts).toBe(0);
  });
});

describe('ADL-46 F1/F2 ruling — step 2b two-or-more path, no unique-index violation (§4 item 5)', () => {
  it('two existing regioned rows (IL+MO), no region requested → ambiguous fallback insert lands on a distinct key, no crash', async () => {
    const ilId = await seedRegion(testDb!, 'Illinois', 'US-IL');
    const moId = await seedRegion(testDb!, 'Missouri', 'US-MO');
    await seedCity(testDb!, {
      name: 'Springfield',
      regionId: ilId,
      geocodeStatus: 'pending',
      createdByUserId: USER_A_ID,
    });
    await seedCity(testDb!, {
      name: 'Springfield',
      regionId: moId,
      geocodeStatus: 'pending',
      createdByUserId: USER_A_ID,
    });

    // Step 1 misses (no region-less row exists). Step 2 is skipped (no
    // region_id in the request). Step 2b (creator/status-blind by ruling
    // §3.3 amendment 2) finds 2 rows sharing the name+country → declines
    // (returns null) rather than picking one. The geocoder also can't help
    // (no candidates), so the route falls to step 4c and inserts a THIRD,
    // region-less pending row. That insert must succeed — it lands on the
    // COALESCE(region_id,0)=0 key, which step 1 already proved was vacant —
    // not violate uniq_cities_name_country_region_ci.
    mockUserId = USER_A_ID;
    nextResult = { status: 'ok', candidates: [] };
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Springfield', country_code: 'US' });

    expect(res.status).toBe(201); // no 500 from a unique-index violation
    expect(res.body.region_id).toBeNull();

    const allSpringfields = await testDb!
      .select({ id: schema.cities.id, regionId: schema.cities.regionId })
      .from(schema.cities)
      .where(eq(schema.cities.name, 'Springfield'));
    expect(allSpringfields).toHaveLength(3);
    expect(allSpringfields.filter((r) => r.regionId === null)).toHaveLength(1);
  });
});

/**
 * ADL-46 D13 (§4.2.1) — backend-owned find-or-create regression tests.
 *
 * These complement (do NOT duplicate or touch) QA's frozen acceptance spec
 * adl46-access-model.test.ts. Focus: the REVERSE single-match case §4.2.1
 * flagged as the trap — a no-region POST against a region-tier country that
 * holds exactly one *regioned* row of that (name, country) must return that
 * row, not insert a duplicate. It regressed once because step 1 keys on
 * COALESCE(region_id,0) and a regioned row never has key 0.
 */

import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

const USER_ID = 'user-d13-0000-0000-0000-000000000000';

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
      clerkId: 'clerk_d13',
      email: 'd13@example.com',
      isOwner: 0,
    };
    next();
  },
}));

// No geocoder in this suite — resolve-then-create degrades to pending, so the
// find-or-create logic is what is under test (mirrors the CI GEOCODING_ENABLED=false path).
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

async function seedUser(db: TestDb) {
  const now = new Date();
  await db
    .insert(schema.users)
    .values({
      id: USER_ID,
      clerkId: 'clerk_d13',
      email: 'd13@example.com',
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

async function cityCount(db: TestDb, name: string): Promise<number> {
  const rows = await db
    .select({ id: schema.cities.id })
    .from(schema.cities)
    .where(and(eq(schema.cities.countryCode, 'US'), eq(schema.cities.name, name)));
  return rows.length;
}

beforeEach(async () => {
  testDb = await createTestDb();
  await seedUser(testDb);
  await seedRegionTierCountry(testDb);
});

afterEach(() => {
  testDb = null;
});

describe('ADL-46 D13 — reverse single-match (region-tier country, no region requested)', () => {
  it('exactly one existing REGIONED row → returns it, no duplicate (§4.2.1 no-regression case)', async () => {
    const db = testDb!;
    const ilId = await seedRegion(db, 'Illinois', 'US-IL');
    const [existing] = await db
      .insert(schema.cities)
      .values({ name: 'Springfield', countryCode: 'US', regionId: ilId, geocodeStatus: 'pending' })
      .returning();

    // No region_id in the request — the case the old (name, country) unique
    // index used to match. Must NOT insert a second region-less Springfield.
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Springfield', country_code: 'US' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(existing.id);
    expect(res.body.region_id).toBe(ilId); // returned unchanged, not blanked
    expect(await cityCount(db, 'Springfield')).toBe(1);
  });

  it('two existing regioned rows (IL + MO), no region requested → does NOT silently pick one, does NOT duplicate either', async () => {
    const db = testDb!;
    const ilId = await seedRegion(db, 'Illinois', 'US-IL');
    const moId = await seedRegion(db, 'Missouri', 'US-MO');
    const [il] = await db
      .insert(schema.cities)
      .values({ name: 'Springfield', countryCode: 'US', regionId: ilId, geocodeStatus: 'pending' })
      .returning();
    const [mo] = await db
      .insert(schema.cities)
      .values({ name: 'Springfield', countryCode: 'US', regionId: moId, geocodeStatus: 'pending' })
      .returning();

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Springfield', country_code: 'US' });

    // Ambiguous → the two existing regioned rows must be untouched, and neither
    // is returned as an unambiguous exact match.
    if (res.status === 200) {
      expect([il.id, mo.id]).not.toContain(res.body.id);
    }
    const ilRows = await db
      .select({ id: schema.cities.id })
      .from(schema.cities)
      .where(eq(schema.cities.regionId, ilId));
    const moRows = await db
      .select({ id: schema.cities.id })
      .from(schema.cities)
      .where(eq(schema.cities.regionId, moId));
    expect(ilRows).toHaveLength(1);
    expect(moRows).toHaveLength(1);
  });

  it('has-region path unchanged: a region-bearing request still wildcard-upgrades a region-less row', async () => {
    const db = testDb!;
    const coId = await seedRegion(db, 'Colorado', 'US-CO');
    const [existing] = await db
      .insert(schema.cities)
      .values({ name: 'Denver', countryCode: 'US', regionId: null, geocodeStatus: 'pending' })
      .returning();

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Denver', country_code: 'US', region_id: coId });

    // Step 2 wildcard-upgrade: same row, region now set — NOT the reverse branch.
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(existing.id);
    expect(res.body.region_id).toBe(coId);
    expect(await cityCount(db, 'Denver')).toBe(1);
  });

  it('has-region path unchanged: a region-bearing request does NOT collapse onto a different-region row', async () => {
    const db = testDb!;
    const ilId = await seedRegion(db, 'Illinois', 'US-IL');
    const moId = await seedRegion(db, 'Missouri', 'US-MO');
    const [il] = await db
      .insert(schema.cities)
      .values({ name: 'Springfield', countryCode: 'US', regionId: ilId, geocodeStatus: 'pending' })
      .returning();

    // Request Springfield in MO while only the IL row exists → must create a new
    // row, not return the IL one (the reverse single-match branch must NOT run).
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Springfield', country_code: 'US', region_id: moId });

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(il.id);
    expect(res.body.region_id).toBe(moId);
    expect(await cityCount(db, 'Springfield')).toBe(2);
  });
});

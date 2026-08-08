/**
 * ADL-46 — Per-user access model: ATDD acceptance tests (QA, pre-implementation)
 *
 * Source of truth: jobs/architect/tech/ADL-46-non-owner-access-model.md
 *   §7   — revised access matrix
 *   §8   — security.access-matrix.test.ts assertions that must change (S1-S3)
 *   §8.1 — stale skip / coverage-hole regression (PATCH /api/cities/:id → 403)
 *   §8.2 — the other three files that break at S3 (not edited here — Backend's job)
 *   §4.2.1 (D13) — find-or-create three-step lookup, wildcard upgrade, ambiguity
 *   §4.4 (D5/GE-16) — pending vs resolved city containment
 *
 * THIS FILE IS DELIBERATELY RED. It is written BEFORE the Backend stage (S1-S4)
 * lands on this integration branch, and encodes the END-STATE behaviour ADL-46
 * specifies. Red here is the correct, expected outcome — these are the executable
 * definition-of-done the Backend brief is built against, not a report of a bug in
 * today's code.
 *
 * A handful of assertions below are edge/regression guards that are ALREADY GREEN
 * today (e.g. GET /api/cities/:id already carries no containment because no
 * containment exists yet at all). Each such case is commented at the point of the
 * assertion — they are included deliberately because they must STAY true after
 * Backend implements this, not because they are red now.
 *
 * Caller-identity note (judgement call — see QA completion report): Group B (D13)
 * tests run as the OWNER, not a non-owner. POST /api/cities is still requireOwner
 * on this branch (D4/S1 has not landed), so a non-owner caller would fail at the
 * auth gate before ever reaching the find-or-create logic under test, conflating
 * D13's correctness with D4's access-model change. Running Group B as owner
 * isolates the two concerns; D13's own text is caller-identity-agnostic. The one
 * exception is B6, which is explicitly listed in ADL-46 §8 row 4 as a non-owner
 * case and is written as such on purpose.
 */

import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';
import type { CityResolution } from '../../services/geocoding.service.js';

// ----------------------------------------------------------------
// Test user constants
// ----------------------------------------------------------------

const USER_A_ID = 'user-a-00000000-0000-0000-0000-000000000000'; // owner, isOwner=1
const USER_B_ID = 'user-b-00000000-0000-0000-0000-000000000000'; // non-owner, isOwner=0

// ----------------------------------------------------------------
// Module-level mock control variables
// ----------------------------------------------------------------

let testDb: TestDb | null = null;
let mockIsOwner = 1;
let mockUserId = USER_A_ID;
let mockAuthEnabled = true;

// QUAL-22 (review finding F8): the resolveCityName result the mocked
// geocoding service returns from POST /api/cities's resolve-then-create step.
// Defaults to 'disabled' — the same terminal outcome the route's own
// try/catch produced when this mock omitted resolveCityName entirely (a
// TypeError swallowed by cities.ts's catch), so every test that does not
// explicitly set this keeps its original, already-verified behaviour. Group
// B tests that exist specifically to prove the 'ambiguous' verdict is
// handled (B4) now set this to a real 'ambiguous' CityResolution instead of
// relying on that accidental fallback — see B4 below.
let mockCityResolution: CityResolution = { status: 'disabled', candidates: [] };
// Spies so a test can assert resolveCityName/resolveCity were actually
// INVOKED (and with what), not just infer it from downstream DB state —
// QUAL-22's own point is that an un-exercised mock can still produce a
// result that "looks plausible", so the fix asserts the call itself.
const resolveCityNameSpy = vi.fn(async (): Promise<CityResolution> => mockCityResolution);
const resolveCitySpy = vi.fn(async () => undefined);

// ----------------------------------------------------------------
// Module mocks — must be declared before any imports that use them
// ----------------------------------------------------------------

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
    res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    if (!mockAuthEnabled) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    (req as import('express').Request & { user?: unknown }).user = {
      id: mockUserId,
      clerkId: mockUserId === USER_A_ID ? 'clerk_user_a' : 'clerk_user_b',
      email: mockUserId === USER_A_ID ? 'usera@example.com' : 'userb@example.com',
      isOwner: mockIsOwner,
    };
    next();
  },
}));

// QUAL-22 (review finding F8) — the drifted mock. This factory used to export
// ONLY resolveCity, but cities.ts's POST handler also imports resolveCityName
// and resolveByOsmId (routes/cities.ts:27). Calling an undefined export threw
// a TypeError that the route's own try/catch around resolveCityName silently
// swallowed into `{ status: 'disabled', candidates: [] }` — so every Group B
// test exercised the disabled/pending fallback path regardless of what it
// claimed to test, and resolveByOsmId would have thrown uncaught if any test
// had exercised the carried-ref branch. Both are now exported for real,
// matching the module's actual surface (verified against
// services/geocoding.service.ts's `export` lines, not assumed).
vi.mock('../../services/geocoding.service.js', () => ({
  resolveCity: resolveCitySpy,
  resolveCityName: resolveCityNameSpy,
  // Group B never sends osm_type/osm_id (see file header), so the carried-ref
  // branch that calls this is never reached here — exported anyway so a
  // future test cannot silently repeat the same drift by adding one.
  resolveByOsmId: async () => null,
}));

vi.mock('../../services/shading.service.js', () => ({
  getAllCountryShading: async () => [],
  getCountryShading: async () => null,
  getRegionShading: async () => [],
  invalidateConfigCache: () => undefined,
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ----------------------------------------------------------------
// Seed helpers
// ----------------------------------------------------------------

async function seedUser(
  db: TestDb,
  userId: string,
  clerkId: string,
  email: string,
  isOwner: number,
) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: userId,
      clerkId,
      email,
      isOwner,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

async function seedCountry(
  db: TestDb,
  countryCode = 'US',
  name = 'United States',
  regionTierEnabled = 0,
) {
  await db
    .insert(schema.countries)
    .values({ countryCode, name, regionTierEnabled })
    .onConflictDoNothing();
}

async function seedRegion(db: TestDb, countryCode: string, name: string, iso: string) {
  const inserted = await db
    .insert(schema.regions)
    .values({ countryCode, name, iso3166_2: iso })
    .returning({ id: schema.regions.id });
  return inserted[0].id;
}

async function seedTrip(db: TestDb, userId: string): Promise<number> {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.trips)
    .values({
      name: 'Test Trip',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
      status: 'planning',
      userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.trips.id });
  return inserted[0].id;
}

async function seedCity(
  db: TestDb,
  overrides: Partial<typeof schema.cities.$inferInsert> & { countryCode: string; name: string },
) {
  const inserted = await db.insert(schema.cities).values(overrides).returning();
  return inserted[0];
}

async function seedPlace(db: TestDb, tripId: number, cityId: number, userId: string) {
  const inserted = await db
    .insert(schema.tripPlaces)
    .values({ tripId, cityId, userId })
    .returning({ id: schema.tripPlaces.id });
  return inserted[0].id;
}

async function seedCategory(db: TestDb, userId: string, name: string) {
  const inserted = await db
    .insert(schema.tripCategories)
    .values({ userId, name })
    .returning({ id: schema.tripCategories.id });
  return inserted[0].id;
}

async function seedActivity(db: TestDb, userId: string, name: string) {
  const inserted = await db
    .insert(schema.activities)
    .values({ userId, name })
    .returning({ id: schema.activities.id });
  return inserted[0].id;
}

async function cityCountByNameCountry(db: TestDb, name: string, countryCode: string) {
  const rows = await db
    .select({ id: schema.cities.id })
    .from(schema.cities)
    .where(and(eq(schema.cities.countryCode, countryCode), eq(schema.cities.name, name)));
  return rows.length;
}

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  mockAuthEnabled = true;
  mockIsOwner = 1;
  mockUserId = USER_A_ID;
  mockCityResolution = { status: 'disabled', candidates: [] };
  resolveCitySpy.mockClear();
  resolveCityNameSpy.mockClear();
});

afterEach(() => {
  testDb = null;
  mockAuthEnabled = true;
  mockIsOwner = 1;
  mockUserId = USER_A_ID;
  mockCityResolution = { status: 'disabled', candidates: [] };
});

// ================================================================
// GROUP A — Access matrix (ADL-46 §7 / §8 end-state, S1+S3)
// ================================================================

describe('ADL-46 Group A — access matrix', () => {
  describe('Per-user category/activity routes (S3) — GET /api/categories, /api/activities', () => {
    it("GET /api/categories → 200 with the caller's own list", async () => {
      await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
      await seedCategory(testDb!, USER_A_ID, 'Ski Trip');

      const res = await supertest(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Ski Trip' })]),
      );
    });

    it("GET /api/activities → 200 with the caller's own list", async () => {
      await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
      await seedActivity(testDb!, USER_A_ID, 'Skiing');

      const res = await supertest(app).get('/api/activities');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Skiing' })]),
      );
    });

    it("per-user isolation (AD-09): user A's custom category is absent from user B's list", async () => {
      await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
      await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
      await seedCategory(testDb!, USER_A_ID, 'Owner-Only Category');

      mockIsOwner = 0;
      mockUserId = USER_B_ID;
      const res = await supertest(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Owner-Only Category' })]),
      );
    });

    it("per-user isolation (AD-09): user A's custom activity is absent from user B's list", async () => {
      await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
      await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
      await seedActivity(testDb!, USER_A_ID, 'Owner-Only Activity');

      mockIsOwner = 0;
      mockUserId = USER_B_ID;
      const res = await supertest(app).get('/api/activities');
      expect(res.status).toBe(200);
      expect(res.body).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Owner-Only Activity' })]),
      );
    });
  });

  describe('Cross-user association writes are rejected (ADL-46 §3.3 / F1)', () => {
    it("POST /api/trips with another user's category_id → 400", async () => {
      await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
      await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
      const categoryAId = await seedCategory(testDb!, USER_A_ID, "A's Category");

      mockIsOwner = 0;
      mockUserId = USER_B_ID;
      const res = await supertest(app)
        .post('/api/trips')
        .send({
          name: 'B Trip',
          start_date: '2026-02-01',
          end_date: '2026-02-05',
          category_ids: [categoryAId],
        });
      expect(res.status).toBe(400);
    });

    it("PATCH /api/trips/:id with another user's category_id → 400", async () => {
      await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
      await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
      const categoryAId = await seedCategory(testDb!, USER_A_ID, "A's Category");
      const tripBId = await seedTrip(testDb!, USER_B_ID);

      mockIsOwner = 0;
      mockUserId = USER_B_ID;
      const res = await supertest(app)
        .patch(`/api/trips/${tripBId}`)
        .send({ category_ids: [categoryAId] });
      expect(res.status).toBe(400);
    });

    // F1(c) — the place-level write path. ADL-46 §3.3 names this as the half of
    // F1 that survives the disposable-data constraint: replaceAssociations gets
    // ownership validation for trip-level category/activity ids, but the
    // place-level activities route (places.ts POST /:placeId/activities) has no
    // equivalent check at all today. Without this assertion nothing in CI
    // catches that hole.
    it("POST /api/trips/:t/places/:p/activities with another user's activity_id → 400", async () => {
      await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
      await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
      await seedCountry(testDb!, 'US', 'United States', 0);
      const activityAId = await seedActivity(testDb!, USER_A_ID, "A's Activity");
      const tripBId = await seedTrip(testDb!, USER_B_ID);
      const city = await seedCity(testDb!, { countryCode: 'US', name: 'Testville' });
      const placeId = await seedPlace(testDb!, tripBId, city.id, USER_B_ID);

      mockIsOwner = 0;
      mockUserId = USER_B_ID;
      const res = await supertest(app)
        .post(`/api/trips/${tripBId}/places/${placeId}/activities`)
        .send({ activity_id: activityAId });
      expect(res.status).toBe(400);
    });
  });

  describe('City creation opens to non-owner (D4)', () => {
    it('POST /api/cities as a non-owner → 201 for a genuinely new city', async () => {
      await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
      await seedCountry(testDb!, 'US', 'United States', 0);

      mockIsOwner = 0;
      mockUserId = USER_B_ID;
      const res = await supertest(app)
        .post('/api/cities')
        .send({ name: 'Non-Owner City', country_code: 'US' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Non-Owner City', country_code: 'US' });
    });
  });

  // ==============================================================
  // Fail-closed regression guard — these rows must stay 403 through this whole
  // release. ADL-46 §8: "a careless 'open the admin router' fix" is exactly the
  // failure this section exists to catch. All of these are ALREADY GREEN today
  // (requireOwner still gates the admin router) and MUST remain green after S3 —
  // adminRouter.use(requireOwner) is router-level middleware, so a non-owner
  // still hits it even once the categories/activities sub-router mounts are
  // removed (ADL-46 §8.2 "verified counterpoint"). Included here as an explicit
  // acceptance criterion, not because it is expected to go red.
  // ==============================================================
  describe('Fail-closed: admin CRUD and country/region writes stay 403 for non-owner', () => {
    beforeEach(async () => {
      mockIsOwner = 0;
      mockUserId = USER_B_ID;
      await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
      await seedCountry(testDb!, 'US', 'United States', 0);
    });

    it('GET /api/admin/categories → 403', async () => {
      const res = await supertest(app).get('/api/admin/categories');
      expect(res.status).toBe(403);
    });
    it('POST /api/admin/categories → 403', async () => {
      const res = await supertest(app).post('/api/admin/categories').send({ name: 'X' });
      expect(res.status).toBe(403);
    });
    it('PATCH /api/admin/categories/1 → 403', async () => {
      const res = await supertest(app).patch('/api/admin/categories/1').send({ name: 'X' });
      expect(res.status).toBe(403);
    });
    it('DELETE /api/admin/categories/1 → 403', async () => {
      const res = await supertest(app).delete('/api/admin/categories/1');
      expect(res.status).toBe(403);
    });
    it('GET /api/admin/activities → 403', async () => {
      const res = await supertest(app).get('/api/admin/activities');
      expect(res.status).toBe(403);
    });
    it('POST /api/admin/activities → 403', async () => {
      const res = await supertest(app).post('/api/admin/activities').send({ name: 'X' });
      expect(res.status).toBe(403);
    });
    it('PATCH /api/admin/activities/1 → 403', async () => {
      const res = await supertest(app).patch('/api/admin/activities/1').send({ name: 'X' });
      expect(res.status).toBe(403);
    });
    it('DELETE /api/admin/activities/1 → 403', async () => {
      const res = await supertest(app).delete('/api/admin/activities/1');
      expect(res.status).toBe(403);
    });
    it('PATCH /api/admin/countries/US → 403 (city curation stays owner-only)', async () => {
      const res = await supertest(app).patch('/api/admin/countries/US').send({});
      expect(res.status).toBe(403);
    });
    it('POST /api/admin/countries/US/regions → 403', async () => {
      const res = await supertest(app).post('/api/admin/countries/US/regions').send({});
      expect(res.status).toBe(403);
    });
  });

  // ==============================================================
  // §8.1 — coverage-hole regression: PATCH /api/cities/:id → 403 for a non-owner.
  // Corresponding skip in security.access-matrix.test.ts:457 is removed as part
  // of this same PR (declared in the QA completion report). ALREADY GREEN today
  // (BUG-22's requireOwner guard is present and unrelated to this integration
  // branch's DB-stage changes) — the point of this test is that it was silently
  // NOT RUNNING, not that the behaviour is missing. City curation staying
  // owner-only is the premise D4 relies on to make city CREATION safe to open.
  // ==============================================================
  it('§8.1: PATCH /api/cities/1 → 403 for a non-owner (city curation stays owner-only)', async () => {
    await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    const res = await supertest(app).patch('/api/cities/1').send({ region_id: null });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  describe('Part A parity — 401 unauthenticated on the newly-opened routes', () => {
    beforeEach(() => {
      mockAuthEnabled = false;
    });

    it('GET /api/categories → 401', async () => {
      const res = await supertest(app).get('/api/categories');
      expect(res.status).toBe(401);
    });

    it('GET /api/activities → 401', async () => {
      const res = await supertest(app).get('/api/activities');
      expect(res.status).toBe(401);
    });
    // POST /api/cities → 401 is already covered by the existing Part A suite
    // (security.access-matrix.test.ts:223) and is intentionally not duplicated.
  });
});

// ================================================================
// GROUP B — D13 find-or-create invariants (ADL-46 §4.2.1)
// ================================================================

describe('ADL-46 Group B — D13 find-or-create invariants (POST /api/cities)', () => {
  beforeEach(async () => {
    // Owner caller throughout (except B6) — see file header for why.
    mockIsOwner = 1;
    mockUserId = USER_A_ID;
    await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
    // Region-tier country with three US-style regions for the Denver/Springfield
    // examples ADL-46 §4.2.1 itself uses.
    await seedCountry(testDb!, 'US', 'United States', 1);
  });

  it('B1 — exact match: repeating (name, country, region) returns the existing row (200), row count unchanged', async () => {
    const coId = await seedRegion(testDb!, 'US', 'Colorado', 'US-CO');

    const first = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Denver', country_code: 'US', region_id: coId });
    expect(first.status).toBe(201);

    const second = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Denver', country_code: 'US', region_id: coId });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    expect(await cityCountByNameCountry(testDb!, 'Denver', 'US')).toBe(1);
  });

  it('B2 — wildcard upgrade: a region-less existing row is ADOPTED (region set), not duplicated', async () => {
    const coId = await seedRegion(testDb!, 'US', 'Colorado', 'US-CO');
    // Pre-existing region-less Denver, as if it predates regions being resolved.
    const existing = await seedCity(testDb!, { countryCode: 'US', name: 'Denver', regionId: null });

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Denver', country_code: 'US', region_id: coId });

    // D13 step 2: adopt the existing row — same id, region_id now set to the
    // request's region. Current code returns the existing row unchanged
    // (region_id still null) because it deliberately never overwrites region_id
    // on a find — that "deliberate" behaviour is exactly what D13 changes.
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(existing.id);
    expect(res.body.region_id).toBe(coId);

    expect(await cityCountByNameCountry(testDb!, 'Denver', 'US')).toBe(1);
  });

  it('B3 — same name, different region are both allowed (Springfield IL vs MO)', async () => {
    const ilId = await seedRegion(testDb!, 'US', 'Illinois', 'US-IL');
    const moId = await seedRegion(testDb!, 'US', 'Missouri', 'US-MO');

    const first = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Springfield', country_code: 'US', region_id: ilId });
    expect(first.status).toBe(201);

    const second = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Springfield', country_code: 'US', region_id: moId });
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);

    expect(await cityCountByNameCountry(testDb!, 'Springfield', 'US')).toBe(2);
  });

  it('B4 — ambiguous no-region request does not silently pick one of two existing regioned rows, and does not duplicate either', async () => {
    const ilId = await seedRegion(testDb!, 'US', 'Illinois', 'US-IL');
    const moId = await seedRegion(testDb!, 'US', 'Missouri', 'US-MO');
    const il = await seedCity(testDb!, { countryCode: 'US', name: 'Springfield', regionId: ilId });
    const mo = await seedCity(testDb!, { countryCode: 'US', name: 'Springfield', regionId: moId });

    // QUAL-22 fix: before the mock exported resolveCityName at all, calling it
    // threw and the route's catch degraded to 'disabled' — this test then
    // "passed" via the pending-fallback branch (step 4c) without ever
    // exercising resolveCityName's 'ambiguous' verdict, which is the thing its
    // own name and comment claim to prove. Now the geocoder double is told to
    // actually return 'ambiguous' (two distinct region_iso candidates,
    // multi-region — the real shape classifyCandidates would produce for two
    // real Springfields with no region requested).
    mockCityResolution = {
      status: 'ambiguous',
      reason: 'multi-region',
      candidates: [
        {
          displayName: 'Springfield, Illinois, United States',
          name: 'Springfield',
          latitude: 39.8,
          longitude: -89.64,
          countryCode: 'US',
          regionIso: 'US-IL',
          addressType: 'city',
        },
        {
          displayName: 'Springfield, Missouri, United States',
          name: 'Springfield',
          latitude: 37.21,
          longitude: -93.29,
          countryCode: 'US',
          regionIso: 'US-MO',
          addressType: 'city',
        },
      ],
    };

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Springfield', country_code: 'US' }); // no region_id

    // Non-vacuous check: resolveCityName was actually called (not skipped via
    // an early pass-1 match) and with the arguments D12 §4.3.1 requires —
    // the user's submitted name/country, no region. Without this the test
    // could still pass by short-circuiting before ever reaching the mock.
    expect(resolveCityNameSpy).toHaveBeenCalledWith('Springfield', 'US', { regionIso: null });

    // Judgement call (flagged in QA report): ADL-46 states this case explicitly
    // has "no safe automatic answer" and must not guess, but does not prescribe
    // an exact status code or response shape — it says the mechanism is shared
    // with D14 (§4.3.2), which is a frontend-facing candidate list, not specified
    // at this route's contract level. So this test asserts only the two
    // invariants D13's own text commits to, not a specific status code:
    //   (a) it must not silently return either existing regioned row as if it
    //       were an unambiguous exact match;
    //   (b) it must not duplicate either existing row.
    if (res.status === 200) {
      expect([il.id, mo.id]).not.toContain(res.body.id);
    }
    const ilRows = await testDb!
      .select({ id: schema.cities.id })
      .from(schema.cities)
      .where(eq(schema.cities.regionId, ilId));
    const moRows = await testDb!
      .select({ id: schema.cities.id })
      .from(schema.cities)
      .where(eq(schema.cities.regionId, moId));
    expect(ilRows).toHaveLength(1);
    expect(moRows).toHaveLength(1);

    // ADL-46 F1/F2 ruling §2.6 (route comment, cities.ts:570-577): an
    // 'ambiguous' verdict must SKIP the fire-and-forget resolveCity
    // re-resolution — the route already holds the verdict; re-firing it burns
    // a second Nominatim request for a provably identical answer. This is the
    // one behavioural difference between the 'ambiguous' and 'disabled'
    // outcomes that the pre-fix accidental fallback could never distinguish
    // (both landed in the same step-4c pending-insert branch), so it is the
    // most direct proof this test now exercises 'ambiguous' for real.
    expect(resolveCitySpy).not.toHaveBeenCalled();
  });

  it('B5 — exactly one row matches name+country with no region requested → returns it (no regression)', async () => {
    // Non-region-tier country — mirrors "today's behaviour, unchanged" per D13.
    await seedCountry(testDb!, 'JP', 'Japan', 0);
    const existing = await seedCity(testDb!, { countryCode: 'JP', name: 'Tokyo' });

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Tokyo', country_code: 'JP' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(existing.id);
    expect(await cityCountByNameCountry(testDb!, 'Tokyo', 'JP')).toBe(1);
  });

  // §8 row 4 — what makes city creation safe rather than merely permitted.
  // Explicitly the non-owner case (unlike B1-B5), per ADL-46 §8's own listing.
  it('B6 — POST with an existing name in different casing, as a non-owner → 200, row count unchanged', async () => {
    await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
    await seedCountry(testDb!, 'GB', 'United Kingdom', 0);
    const existing = await seedCity(testDb!, { countryCode: 'GB', name: 'Glasgow' });

    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'GLASGOW', country_code: 'GB' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(existing.id);
    expect(await cityCountByNameCountry(testDb!, 'Glasgow', 'GB')).toBe(1);
  });
});

// ================================================================
// GROUP C — Containment / GE-16 (ADL-46 §4.4)
// ================================================================

describe('ADL-46 Group C — pending vs resolved city containment (GE-16)', () => {
  beforeEach(async () => {
    await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
    await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
    await seedCountry(testDb!, 'US', 'United States', 0);
  });

  it("C1 — a pending city is visible in its creator's search but absent from another user's search", async () => {
    await seedCity(testDb!, {
      countryCode: 'US',
      name: 'Nowheresville',
      geocodeStatus: 'pending',
      createdByUserId: USER_A_ID,
    });

    mockIsOwner = 1;
    mockUserId = USER_A_ID;
    const asCreator = await supertest(app).get('/api/cities').query({ q: 'Nowheres' });
    expect(asCreator.status).toBe(200);
    expect(asCreator.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Nowheresville' })]),
    );

    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    const asOther = await supertest(app).get('/api/cities').query({ q: 'Nowheres' });
    expect(asOther.status).toBe(200);
    expect(asOther.body).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Nowheresville' })]),
    );
  });

  it("C2 — a resolved city is visible in every user's search (already-satisfied anchor — must stay true)", async () => {
    await seedCity(testDb!, {
      countryCode: 'US',
      name: 'Resolvedton',
      geocodeStatus: 'resolved',
      createdByUserId: USER_A_ID,
    });

    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    const res = await supertest(app).get('/api/cities').query({ q: 'Resolvedton' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Resolvedton' })]),
    );
  });

  // F3 regression test (OP-27 review). A NULL creator must be treated as global,
  // not as "belongs to nobody, so it's invisible to everybody" — the exact defect
  // the first ADL-46 draft's query had before the IS NULL branch was added. CI
  // runs GEOCODING_ENABLED=false so every freshly-created city via the API is
  // pending; the fixture below seeds directly with createdByUserId left
  // unset (NULL) so the NULL-creator branch is genuinely exercised rather than
  // accidentally satisfied by "everything is pending" alone.
  it("C3 — a pending city with created_by_user_id IS NULL is visible in every user's search", async () => {
    await seedCity(testDb!, {
      countryCode: 'US',
      name: 'Orphantown',
      geocodeStatus: 'pending',
      // createdByUserId intentionally omitted → NULL
    });

    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    const res = await supertest(app).get('/api/cities').query({ q: 'Orphantown' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Orphantown' })]),
    );
  });

  it('C4 — GET /api/cities/:id carries no containment: returns the row regardless of creator/status (already-satisfied anchor — must stay true)', async () => {
    const city = await seedCity(testDb!, {
      countryCode: 'US',
      name: 'PrivatePending',
      geocodeStatus: 'pending',
      createdByUserId: USER_A_ID,
    });

    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    const res = await supertest(app).get(`/api/cities/${city.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: city.id, name: 'PrivatePending' });
  });

  // Bonus coverage beyond the brief's explicit list — ADL-46 §8 row 6 / OP-27
  // review P2, named in the spec as "nowhere stated" before this ADL. Flagged in
  // the QA report as extra coverage added because it is directly adjacent to C1
  // and is exactly the kind of interaction a narrower reading of the brief could
  // miss: search-invisibility and POST-return-visibility of a pending row are
  // two different code paths, and this is the only place they meet.
  it("bonus — user B posting a name matching user A's PENDING city gets A's row back (200), not a new row, even though B cannot see it in search", async () => {
    const pending = await seedCity(testDb!, {
      countryCode: 'US',
      name: 'SharedPending',
      geocodeStatus: 'pending',
      createdByUserId: USER_A_ID,
    });

    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'SharedPending', country_code: 'US' });

    // Today this 403s outright (POST /api/cities is still owner-only) — red for
    // the D4 reason, not the containment reason, but it is the same assertion
    // that will need to hold once D4 lands, so it belongs here rather than in
    // Group A: once POST is open, correctness depends on pass 1 of find-or-create
    // being creator-unscoped (per ADL-46 §8 row 6), which is Group C's concern.
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(pending.id);
    expect(await cityCountByNameCountry(testDb!, 'SharedPending', 'US')).toBe(1);
  });
});

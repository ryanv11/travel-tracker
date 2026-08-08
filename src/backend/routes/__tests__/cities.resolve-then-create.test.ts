/**
 * QUAL-21 — route-level coverage for the resolve-then-create SUCCESS path
 * (POST /api/cities, ADL-46 §4.3 steps 3-4a/4b).
 *
 * Review finding F4 (jobs/architect/tech/20260731-ADL46-release-fresh-eyes-review.md):
 * every existing route-level suite that exercises POST /api/cities mocks
 * `resolveCityName` to `{ status: 'disabled', candidates: [] }` (see
 * adl46-access-model.test.ts and cities-find-or-create.test.ts — both
 * deliberately, so as not to depend on live geocoding for THEIR concerns).
 * That means `resolution.status === 'ok'` — the canonical-name convergence
 * branch that is the entire point of "resolve-THEN-create" — has never been
 * reached by a green CI run at the route level. This is the root cause named
 * in the tracker entry as already having shipped two real defects (F1, and
 * the ambiguous-status regression) invisibly.
 *
 * Mock-fidelity (avoids repeating QUAL-22's mistake one level up): this file
 * does NOT mock `resolveCityName` — it mocks only `global.fetch`, the exact
 * boundary Nominatim egress crosses, with a real captured Nominatim response
 * fixture loaded verbatim off disk. The REAL nominatimSearch, REAL
 * classifyCandidates/isAcceptedSettlement accept-rule, and REAL
 * resolveCityName all run — the same pattern
 * routes/__tests__/bug76-geocode-e2e.test.ts already established for exactly
 * this reason (a mocked resolveCityName return value cannot tell a correctly
 * wired route from one wired to a broken resolver, since the result is
 * already pre-decided by the mock). `resolveCity` (the fire-and-forget
 * background re-resolution at cities.ts:579) IS mocked to a no-op — it is
 * irrelevant to what this file tests and, left real, would race the test's
 * fetch-call-count assertions with a second, non-deterministic egress call.
 *
 * Fixture: services/__tests__/fixtures/nominatim/bug76/springfield_il.json —
 * a single, unambiguous settlement candidate (Springfield, Illinois,
 * addresstype=city), chosen specifically so classifyCandidates reaches 'ok'
 * without needing a region_id in the request (regionIsos.length === 1) and
 * without colliding with the multi-candidate denver_us.json fixture used
 * elsewhere (which resolves to TWO distinct region_isos and would go
 * 'ambiguous' unless a region_id narrows it).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';
import { __resetChokepointForTests } from '../../services/nominatim-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRINGFIELD_IL_FIXTURE = path.join(
  __dirname,
  '../../services/__tests__/fixtures/nominatim/bug76/springfield_il.json',
);

const USER_ID = 'user-qual21-0000-0000-0000-000000000000';

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
      clerkId: 'clerk_qual21',
      email: 'qual21@example.com',
      isOwner: 0, // ADL-46 D4: city creation is open to any authenticated user
    };
    next();
  },
}));

// resolveCityName / resolveByOsmId are deliberately REAL (see file header) —
// only resolveCity's fire-and-forget background re-check is neutralised.
vi.mock('../../services/geocoding.service.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/geocoding.service.js')>();
  return {
    ...real,
    resolveCity: async () => undefined,
  };
});

vi.mock('../../services/shading.service.js', () => ({
  getAllCountryShading: async () => [],
  getCountryShading: async () => null,
  getRegionShading: async () => [],
  invalidateConfigCache: () => undefined,
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

async function seedUser(db: TestDb) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: USER_ID,
      clerkId: 'clerk_qual21',
      email: 'qual21@example.com',
      isOwner: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

async function seedCountry(db: TestDb, countryCode: string, name: string) {
  await db
    .insert(schema.countries)
    .values({ countryCode, name, regionTierEnabled: 0 })
    .onConflictDoNothing();
}

async function cityRows(db: TestDb, name: string, countryCode: string) {
  return db
    .select()
    .from(schema.cities)
    .where(and(eq(schema.cities.countryCode, countryCode), eq(schema.cities.name, name)));
}

describe('POST /api/cities — resolve-then-create SUCCESS path (QUAL-21, real fetch-boundary mock)', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await seedUser(testDb);
    await seedCountry(testDb, 'US', 'United States');

    __resetChokepointForTests();
    vi.stubEnv('GEOCODING_ENABLED', 'true');

    const springfieldBody = JSON.parse(readFileSync(SPRINGFIELD_IL_FIXTURE, 'utf-8'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => springfieldBody,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    testDb = null;
  });

  it('branch A — resolves to an EXISTING record: pass-1 misses on the submitted spelling, the geocoder canonicalizes it, pass-2 finds the pre-existing canonical row (200, no insert)', async () => {
    const db = testDb!;
    // Pre-existing row under the CANONICAL name the geocoder will return —
    // never under the typo the request submits, so a match here can only
    // come from the resolve step's pass-2 canonical-name lookup, not pass-1.
    const [existing] = await db
      .insert(schema.cities)
      .values({
        name: 'Springfield',
        countryCode: 'US',
        geocodeStatus: 'resolved',
        latitude: 39.799,
        longitude: -89.644,
      })
      .returning();

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Springfeild', country_code: 'US' }); // deliberate typo

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(existing.id);
    expect(res.body.name).toBe('Springfield');

    // No new row inserted — the canonical lookup found and reused the
    // existing row rather than creating a second one under the typo'd name
    // or a duplicate under the canonical name.
    expect(await cityRows(db, 'Springfield', 'US')).toHaveLength(1);
    expect(await cityRows(db, 'Springfeild', 'US')).toHaveLength(0);
  });

  it('branch B — CREATES a new record: pass-1 AND pass-2 both miss, so the row is inserted from the canonical geocoder response (201, geocode_status=resolved)', async () => {
    const db = testDb!;
    // No pre-existing Springfield row at all in this test.

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Springfeild', country_code: 'US' }); // deliberate typo

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(201);
    // Built from the CANONICAL candidate name, not the submitted typo (§4.3
    // step 4b — this is the actual convergence work resolve-then-create
    // exists to do).
    expect(res.body.name).toBe('Springfield');
    expect(res.body.country_code).toBe('US');
    expect(res.body.geocode_status).toBe('resolved');
    expect(res.body.latitude).toBeCloseTo(39.7990175, 5);
    expect(res.body.longitude).toBeCloseTo(-89.6439575, 5);

    // Exactly one row exists — under the canonical name, not the typo — and
    // it carries the geocoder's OSM ref (D12/M-A: stamped on every resolve so
    // the row is discoverable by the resolved-by-OSM merge mechanism).
    expect(await cityRows(db, 'Springfeild', 'US')).toHaveLength(0);
    const rows = await cityRows(db, 'Springfield', 'US');
    expect(rows).toHaveLength(1);
    expect(rows[0].osmType).toBe('relation');
    expect(rows[0].osmId).toBe(126326);
    expect(rows[0].createdByUserId).toBe(USER_ID);
  });
});

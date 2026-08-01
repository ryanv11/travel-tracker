/**
 * BUG-72 (GitHub #351, BRD GE-16) — backend-owned regression tests for GET
 * /api/cities region enrichment.
 *
 * These complement (do NOT duplicate or touch) QA's frozen acceptance spec
 * adl46-access-model.test.ts — that file is QA's ATDD suite, authored
 * spec-first and deliberately frozen as the evidence base for the D-17 ATDD
 * trial verdict, so post-hoc backend regression coverage belongs in its own
 * file rather than appended there (mirrors the precedent set by
 * cities-find-or-create.test.ts for the ADL-46 D13 backend stage). Setup
 * (seedUser/seedCountry/seedRegion/seedCity, the mockUserId/mockIsOwner auth
 * mock) is mirrored from adl46-access-model.test.ts rather than imported, so
 * that file stays byte-for-byte unchanged.
 *
 * Focus: GET /api/cities (search) now LEFT JOINs `regions` and returns
 * region_name / region_iso alongside the existing region_id integer, so the
 * frontend can render "city, state, country" instead of a bare region_id it
 * cannot resolve client-side (it only loads the region list for one selected
 * country at a time). LEFT JOIN — not INNER — is the load-bearing choice: an
 * INNER join would silently drop every row with a NULL region_id (any city
 * in a non-region-tier country, or a region-tier city not yet assigned a
 * region) out of search results, narrowing the GE-16 containment predicate
 * (cities.ts:60-64, untouched by this change) this query sits next to.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

// ----------------------------------------------------------------
// Test user constants
// ----------------------------------------------------------------

const USER_A_ID = 'user-a-00000000-0000-0000-0000-000000000000';

// ----------------------------------------------------------------
// Module-level mock control variables
// ----------------------------------------------------------------

let testDb: TestDb | null = null;
let mockIsOwner = 1;
let mockUserId = USER_A_ID;

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
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (req as import('express').Request & { user?: unknown }).user = {
      id: mockUserId,
      clerkId: 'clerk_user_a',
      email: 'usera@example.com',
      isOwner: mockIsOwner,
    };
    next();
  },
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ----------------------------------------------------------------
// Seed helpers — mirrored from adl46-access-model.test.ts (not imported,
// so QA's frozen suite is never touched by backend regression work)
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

async function seedCity(
  db: TestDb,
  overrides: Partial<typeof schema.cities.$inferInsert> & { countryCode: string; name: string },
) {
  const inserted = await db.insert(schema.cities).values(overrides).returning();
  return inserted[0];
}

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  mockIsOwner = 1;
  mockUserId = USER_A_ID;
});

afterEach(() => {
  testDb = null;
  mockIsOwner = 1;
  mockUserId = USER_A_ID;
});

// ================================================================
// BUG-72 (GitHub #351) — GET /api/cities region enrichment
//
// Extends each search row with region_name / region_iso (via LEFT JOIN
// regions) so the frontend can render "city, state, country" instead of a
// bare region_id. The LEFT JOIN must not narrow the GE-16 containment result
// set (covered separately in adl46-access-model.test.ts Group C) — a
// region-less row (NULL region_id, the common case for non-region-tier
// countries) must still appear, with both new fields null rather than the
// row being dropped or the request erroring.
// ================================================================
describe('BUG-72 — GET /api/cities region enrichment', () => {
  beforeEach(async () => {
    await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
    mockIsOwner = 1;
    mockUserId = USER_A_ID;
  });

  it('a region-tier city carries its region name and ISO code alongside region_id', async () => {
    await seedCountry(testDb!, 'US', 'United States', 1);
    const coId = await seedRegion(testDb!, 'US', 'Colorado', 'US-CO');
    await seedCity(testDb!, {
      countryCode: 'US',
      name: 'Denver',
      regionId: coId,
      geocodeStatus: 'resolved',
    });

    const res = await supertest(app).get('/api/cities').query({ q: 'Denver' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Denver',
          region_id: coId,
          region_name: 'Colorado',
          region_iso: 'US-CO',
        }),
      ]),
    );
  });

  it('a region-less city (NULL region_id, e.g. non-region-tier country) still appears, with region fields null — proves the LEFT JOIN does not narrow GE-16 containment', async () => {
    await seedCountry(testDb!, 'JP', 'Japan', 0);
    await seedCity(testDb!, {
      countryCode: 'JP',
      name: 'Kyoto',
      regionId: null,
      geocodeStatus: 'resolved',
    });

    const res = await supertest(app).get('/api/cities').query({ q: 'Kyoto' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Kyoto',
          region_id: null,
          region_name: null,
          region_iso: null,
        }),
      ]),
    );
  });

  it('mixed results: a region-tier country search returns both a regioned row and a region-less row from the same country in one response', async () => {
    await seedCountry(testDb!, 'US', 'United States', 1);
    const ilId = await seedRegion(testDb!, 'US', 'Illinois', 'US-IL');
    await seedCity(testDb!, {
      countryCode: 'US',
      name: 'Springville',
      regionId: ilId,
      geocodeStatus: 'resolved',
    });
    await seedCity(testDb!, {
      countryCode: 'US',
      name: 'Springville Heights',
      regionId: null,
      geocodeStatus: 'resolved',
    });

    const res = await supertest(app).get('/api/cities').query({ q: 'Springville' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Springville',
          region_name: 'Illinois',
          region_iso: 'US-IL',
        }),
        expect.objectContaining({
          name: 'Springville Heights',
          region_name: null,
          region_iso: null,
        }),
      ]),
    );
  });
});

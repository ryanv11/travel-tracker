/**
 * GE-20 (BUG-87) — implementation guards for GET /api/cities?country_codes=...
 * that QA's ATDD bar (ge20-cities-country-filter.test.ts) deliberately did
 * NOT red-test (see jobs/qa/tech/20260808-ge20-atdd-red-tests.md, "Not
 * added" section): ADL-54 §4 recommends schema-level rejection of malformed
 * country codes and a ~10-code cap as Brief A IMPLEMENTATION DETAILS, not
 * enumerated in QA's 7-item dispatch list. Backend owns these tests per the
 * dispatch brief ("add them + your own tests").
 *
 * Also covers the fresh-eyes F4 seam: the cities-path precedence contract
 * when BOTH country_code (singular, D12) and country_codes (plural, the
 * trip filter set) are present on the SAME GET /api/cities request — the
 * ADL states this precedence for /api/geocode but was silent for
 * /api/cities; this backend brief states it explicitly (single wins).
 *
 * This is a NEW, backend-owned sibling file — QA's ge20-cities-country-
 * filter.test.ts is a frozen ATDD suite and is not touched here (same
 * precedent as cities.search-region-enrichment.test.ts alongside
 * adl46-access-model.test.ts).
 *
 * Design: jobs/architect/tech/ADL-54-trip-country-picker-filter.md (D1/D2).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

const USER_A_ID = 'ge20-guards-user-a-0000-0000-000000000000';

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
      id: USER_A_ID,
      clerkId: 'clerk_ge20_guards_user_a',
      email: 'ge20-guards-usera@example.com',
      isOwner: 1,
    };
    next();
  },
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

async function seedUser(db: TestDb, userId: string, clerkId: string, email: string) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: userId,
      clerkId,
      email,
      isOwner: 1,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

async function seedCountry(db: TestDb, countryCode: string, name: string) {
  await db.insert(schema.countries).values({ countryCode, name }).onConflictDoNothing();
}

async function seedCity(
  db: TestDb,
  overrides: Partial<typeof schema.cities.$inferInsert> & { countryCode: string; name: string },
) {
  const inserted = await db
    .insert(schema.cities)
    .values({ geocodeStatus: 'resolved', ...overrides })
    .returning();
  return inserted[0];
}

beforeEach(async () => {
  testDb = await createTestDb();
  await seedUser(testDb, USER_A_ID, 'clerk_ge20_guards_user_a', 'ge20-guards-usera@example.com');
});

afterEach(() => {
  testDb = null;
  vi.clearAllMocks();
});

describe('GE-20 — GET /api/cities country_codes: malformed-code and cap guards (ADL-54 §4, not in QA red bar)', () => {
  it('rejects a 3-letter code with 400 (not ISO alpha-2 shape)', async () => {
    const res = await supertest(app)
      .get('/api/cities')
      .query({ q: 'Newport', country_codes: 'GBR' });
    expect(res.status).toBe(400);
  });

  it('rejects a numeric code with 400', async () => {
    const res = await supertest(app)
      .get('/api/cities')
      .query({ q: 'Newport', country_codes: '12' });
    expect(res.status).toBe(400);
  });

  it('rejects one malformed code even alongside otherwise-valid ones (no silent partial drop)', async () => {
    const res = await supertest(app)
      .get('/api/cities')
      .query({ q: 'Newport', country_codes: 'GB,XYZ' });
    expect(res.status).toBe(400);
  });

  it('ADL-54 D2: rejects a set of 11 distinct codes (over the ~10 cap) with 400', async () => {
    const codes = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ', 'KK'].join(',');
    const res = await supertest(app)
      .get('/api/cities')
      .query({ q: 'Newport', country_codes: codes });
    expect(res.status).toBe(400);
  });

  it('ADL-54 D2: accepts a set of exactly 10 distinct codes (at the cap, not over it)', async () => {
    await seedCountry(testDb!, 'GB', 'United Kingdom');
    await seedCity(testDb!, { countryCode: 'GB', name: 'Newport' });
    const codes = ['GB', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ'].join(',');
    const res = await supertest(app)
      .get('/api/cities')
      .query({ q: 'Newport', country_codes: codes });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  // ----------------------------------------------------------------
  // F4 — cities-path precedence when BOTH country_code and country_codes
  // are present. The ADL states this contract for /api/geocode but was
  // silent for /api/cities (fresh-eyes finding). This backend brief states
  // it explicitly: the single, narrower, user-confirmed country_code wins.
  // ----------------------------------------------------------------
  it('F4 — when BOTH country_code and country_codes are present, the single country_code wins (cities-path precedence)', async () => {
    await seedCountry(testDb!, 'GB', 'United Kingdom');
    await seedCountry(testDb!, 'FR', 'France');
    const gb = await seedCity(testDb!, { countryCode: 'GB', name: 'Newport' });
    await seedCity(testDb!, { countryCode: 'FR', name: 'Newport' });

    // country_code=GB (singular) should win over country_codes=FR (plural) —
    // the GB row comes back, not the FR one.
    const res = await supertest(app)
      .get('/api/cities')
      .query({ q: 'Newport', country_code: 'GB', country_codes: 'FR' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(gb.id);
  });
});

/**
 * GE-20 (BUG-87) — ATDD RED bar for the trip-country-scoped picker's DB
 * search half: GET /api/cities?q=...&country_codes=...
 *
 * Design: jobs/architect/tech/ADL-54-trip-country-picker-filter.md (D1/D2/D3).
 * Fresh-eyes review: jobs/architect/tech/20260808-ADL54-fresh-eyes-review.md
 * (F1 — the inArray([]) empty-set footgun; F4 — the cities-path precedence
 * seam vs the existing single `country_code`).
 * BRD: GE-20 (approved v3.21), success criteria at _project/travel-tracker-BRD.md §5.1.
 *
 * Written BEFORE Backend implements anything (OP-35 ATDD-first — Brief A is
 * marked ATDD-first: yes). Every test below that targets NEW behaviour is
 * asserted against current `main`, where `country_codes` is not read by the
 * route at all (SearchCitiesQuerySchema has no such field, so Zod strips it
 * silently — no 400, just a no-op). Tests that pin EXISTING, unchanged
 * behaviour are explicitly labelled REGRESSION GUARD and are expected to
 * already pass on main; they are not part of the red bar, but they pin the
 * "no interference" contract this feature must not break.
 *
 * DB pattern mirrored from cities.search-region-enrichment.test.ts (real
 * migration-backed :memory: DB via test-db.ts, real query execution) rather
 * than a query-builder mock — the whole point of GE-20 is a WHERE-clause
 * change, so the RED bar has to be a real query against real seeded rows,
 * not a stubbed repository.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

// ----------------------------------------------------------------
// Test user constants
// ----------------------------------------------------------------

const USER_A_ID = 'ge20-user-a-0000-0000-0000-000000000000';

// ----------------------------------------------------------------
// Module-level mock control variables
// ----------------------------------------------------------------

let testDb: TestDb | null = null;

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
      id: USER_A_ID,
      clerkId: 'clerk_ge20_user_a',
      email: 'ge20-usera@example.com',
      isOwner: 1,
    };
    next();
  },
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ----------------------------------------------------------------
// Seed helpers — mirrored (not imported) from cities.search-region-
// enrichment.test.ts / adl46-access-model.test.ts, same reasoning: keep
// each frozen/independent ATDD suite byte-for-byte free of cross-imports.
// ----------------------------------------------------------------

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

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  await seedUser(testDb, USER_A_ID, 'clerk_ge20_user_a', 'ge20-usera@example.com');
});

afterEach(() => {
  testDb = null;
  vi.clearAllMocks();
});

describe('GE-20 — GET /api/cities country_codes hard filter', () => {
  // --------------------------------------------------------------
  // Test 1 — single-country narrowing (GE-20 success criterion #1).
  // "Newport" exists in GB, FR and US; a trip declaring only GB must see
  // only the GB row.
  // --------------------------------------------------------------
  it('country_codes=GB returns only the GB Newport — no US or FR Newport (RED on main: param is a no-op today)', async () => {
    await seedCountry(testDb!, 'GB', 'United Kingdom');
    await seedCountry(testDb!, 'US', 'United States');
    await seedCountry(testDb!, 'FR', 'France');
    await seedCity(testDb!, { countryCode: 'GB', name: 'Newport' });
    await seedCity(testDb!, { countryCode: 'US', name: 'Newport' });
    await seedCity(testDb!, { countryCode: 'FR', name: 'Newport' });

    const res = await supertest(app)
      .get('/api/cities')
      .query({ q: 'Newport', country_codes: 'GB' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: 'Newport', country_code: 'GB' });
  });

  // --------------------------------------------------------------
  // Test 2 — multi-country UNION (GE-20 success criterion #2). Exactly the
  // brief's example set: GB,FR must return the union of those two, and
  // nothing from a third declared-absent country (US).
  // --------------------------------------------------------------
  it('country_codes=GB,FR returns the union of GB+FR Newports, excluding US (RED on main)', async () => {
    await seedCountry(testDb!, 'GB', 'United Kingdom');
    await seedCountry(testDb!, 'FR', 'France');
    await seedCountry(testDb!, 'US', 'United States');
    const gb = await seedCity(testDb!, { countryCode: 'GB', name: 'Newport' });
    const fr = await seedCity(testDb!, { countryCode: 'FR', name: 'Newport' });
    await seedCity(testDb!, { countryCode: 'US', name: 'Newport' });

    const res = await supertest(app)
      .get('/api/cities')
      .query({ q: 'Newport', country_codes: 'GB,FR' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const ids = res.body.map((r: { id: number }) => r.id).sort();
    expect(ids).toEqual([gb.id, fr.id].sort());
    expect(
      res.body.every((r: { country_code: string }) => ['GB', 'FR'].includes(r.country_code)),
    ).toBe(true);
  });

  // --------------------------------------------------------------
  // Test 4 (cities half) — F1: present-but-EMPTY country_codes must SHOW
  // ALL (PO Q1 ruling), NOT zero rows. This is the exact input a
  // zero-country trip's frontend sends ([].join(',') === ''), and it is
  // the ONE input that trips Drizzle's inArray(col, []) -> sql`false`
  // footgun the fresh-eyes review flagged (F1). Deliberately DISTINCT from
  // the absent-param case below (test 5) — an implementer who only
  // branches on `req.query.country_codes === undefined` and pushes
  // inArray unconditionally otherwise will pass test 5 but fail THIS one,
  // silently inverting the PO's ruling.
  //
  // NOT RED on main — it passes today VACUOUSLY (main has no filtering
  // logic at all yet, so "shows all" is trivially true regardless of what
  // country_codes is set to). It stays in the suite anyway because it is
  // the ONLY case in this file that would catch the specific F1 naive-
  // implementation footgun once Brief A lands: an implementer who always
  // pushes `inArray(cities.countryCode, set)` without branching on
  // `set.length` would pass tests 1/2/6 (non-empty sets) and pass test 5
  // (absent — never reaches the inArray branch) while silently returning
  // ZERO rows here, inverting the PO's Q1 ruling with every other test
  // still green. Per the BUG-76 ATDD precedent, a test that already holds
  // on main is documented as a guard, not miscounted as part of the red
  // bar.
  // --------------------------------------------------------------
  it('GUARD (passes today, vacuously) — country_codes="" (present, empty) returns ALL matches unfiltered, SHOW ALL not zero rows; pins the F1 inArray([])->false footgun for Brief A', async () => {
    await seedCountry(testDb!, 'GB', 'United Kingdom');
    await seedCountry(testDb!, 'US', 'United States');
    await seedCountry(testDb!, 'FR', 'France');
    await seedCity(testDb!, { countryCode: 'GB', name: 'Newport' });
    await seedCity(testDb!, { countryCode: 'US', name: 'Newport' });
    await seedCity(testDb!, { countryCode: 'FR', name: 'Newport' });

    const res = await supertest(app).get('/api/cities?q=Newport&country_codes=');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  // --------------------------------------------------------------
  // Test 5 (cities half) — absent country_codes: unchanged/backward
  // compatible. REGRESSION GUARD — already true on main (the param
  // doesn't exist yet, so "absent" and "today's behaviour" are the same
  // thing by construction). Kept as an explicit pin so a future
  // implementation can't regress it while chasing tests 1/2/4 above.
  // --------------------------------------------------------------
  it('REGRESSION GUARD — no country_codes param at all returns every match, unfiltered (already true on main)', async () => {
    await seedCountry(testDb!, 'GB', 'United Kingdom');
    await seedCountry(testDb!, 'US', 'United States');
    await seedCity(testDb!, { countryCode: 'GB', name: 'Newport' });
    await seedCity(testDb!, { countryCode: 'US', name: 'Newport' });

    const res = await supertest(app).get('/api/cities').query({ q: 'Newport' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  // --------------------------------------------------------------
  // Test 6 (cities half) — off-country: a name whose only real match is
  // outside the declared set returns empty (the D4a empty-state trigger;
  // the empty-state UX itself is Brief B / frontend, out of scope here).
  // --------------------------------------------------------------
  it('a name that only exists outside the declared set returns an empty array (RED on main: unfiltered today would return the DE row)', async () => {
    await seedCountry(testDb!, 'DE', 'Germany');
    await seedCountry(testDb!, 'GB', 'United Kingdom');
    await seedCity(testDb!, { countryCode: 'DE', name: 'Berlin' });

    const res = await supertest(app).get('/api/cities').query({ q: 'Berlin', country_codes: 'GB' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // --------------------------------------------------------------
  // Test 7 — seam (fresh-eyes F4): the existing single-value D12 create
  // constraint (POST /api/cities body.country_code) must be completely
  // unaffected by this GET-path filter feature — separate params, no
  // interference. Both assertions are REGRESSION GUARDS (true on main
  // already): (a) create behaviour is untouched; (b) CreateCitySchema is
  // `.strict()`, so an errant `country_codes` field on the create BODY is
  // structurally rejected, not silently absorbed — the two concepts
  // cannot bleed into each other even if a caller tried.
  // --------------------------------------------------------------
  describe('REGRESSION GUARD — seam vs the POST /api/cities D12 single country_code create constraint (F4)', () => {
    it('POST /api/cities with body.country_code (D12) still creates a city scoped to that country, unaffected by the GET country_codes feature', async () => {
      await seedCountry(testDb!, 'GB', 'United Kingdom');

      const res = await supertest(app)
        .post('/api/cities')
        .send({ name: 'Cardiff', country_code: 'GB' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Cardiff', country_code: 'GB' });
    });

    it('POST /api/cities rejects an errant country_codes field in the body with 400 (.strict() schema — no cross-talk with the GET-path plural param)', async () => {
      await seedCountry(testDb!, 'GB', 'United Kingdom');

      const res = await supertest(app)
        .post('/api/cities')
        .send({ name: 'Cardiff', country_code: 'GB', country_codes: 'GB,FR' });

      expect(res.status).toBe(400);
    });
  });
});

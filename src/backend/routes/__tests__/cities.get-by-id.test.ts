/**
 * Integration tests for GET /api/cities/:id (BUG-29; BUG-80 region fields).
 *
 * The frontend geocode retry queue polls this endpoint to check whether a
 * pending city has been geocoded — replacing the previous empty-PATCH poll
 * (a write used as a read). The endpoint must:
 *   1. Return the city with its geocode_status (200) for any authenticated
 *      user — the mock auth user here is a NON-owner, proving no owner gate
 *   2. Return 404 for an unknown city id (drives queue entry removal)
 *   3. Return 404 for a non-numeric id
 *   4. Not modify the row (no updated_at bump — it is a pure read)
 *   5. (BUG-80) LEFT JOIN `regions` so this city-shaped payload also carries
 *      region_name/region_iso — same pattern as GET /api/cities (search,
 *      BUG-72) and the trip list/detail city objects. A NULL region_id must
 *      still return the row (LEFT, not INNER).
 *
 * Uses an in-memory libSQL database, schema derived from the real migrations
 * via createTestDb() (QUAL-17 — see repositories/__tests__/test-db.ts).
 */

import { eq } from 'drizzle-orm';
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
      if (!testDb)
        throw new Error('[TEST] testDb not initialised — call createTestDb in beforeEach');
      return testDb;
    },
  };
});

// Mock auth middleware — bypass JWT verification in integration tests.
// The mocked user is a NON-owner (isOwner: 0), which proves the endpoint is
// readable by any authenticated user (no requireOwner gate — BUG-29 brief).
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    _req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (_req as import('express').Request & { user?: unknown }).user = {
      id: 'test-user-id',
      clerkId: 'user_test',
      email: 'test@example.com',
      isOwner: 0,
    };
    next();
  },
  authenticate: (
    _req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => next(),
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ----------------------------------------------------------------
// Seed helpers
// ----------------------------------------------------------------

async function seedCity(db: TestDb, overrides: Partial<typeof schema.cities.$inferInsert> = {}) {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'IE', name: 'Ireland' })
    .onConflictDoNothing();

  const [city] = await db
    .insert(schema.cities)
    .values({
      name: 'Dublin',
      countryCode: 'IE',
      geocodeStatus: 'pending',
      ...overrides,
    })
    .returning();

  return city;
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('GET /api/cities/:id — BUG-29 read-based geocode status poll', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(() => {
    testDb = null;
  });

  it('returns a pending city with its geocode_status for a non-owner user', async () => {
    const city = await seedCity(testDb!);

    const res = await supertest(app).get(`/api/cities/${city.id}`).expect(200);

    expect(res.body).toEqual({
      id: city.id,
      name: 'Dublin',
      country_code: 'IE',
      region_id: null,
      // BUG-80: LEFT JOIN regions — a NULL region_id must resolve to
      // region_name/region_iso both null, not undefined/omitted (that would
      // be the "never joined" case this route no longer is in).
      region_name: null,
      region_iso: null,
      latitude: null,
      longitude: null,
      geocode_status: 'pending',
    });
  });

  it('BUG-80: returns region_name/region_iso when the city has a region_id', async () => {
    // Country row must exist before the region FK — seedCity would normally
    // create it, but the region needs to be inserted first here so the city
    // can reference it, so it's created explicitly (onConflictDoNothing
    // matches seedCity's own idempotent insert).
    await testDb!
      .insert(schema.countries)
      .values({ countryCode: 'IE', name: 'Ireland' })
      .onConflictDoNothing();
    const [region] = await testDb!
      .insert(schema.regions)
      .values({ countryCode: 'IE', name: 'Leinster', iso3166_2: 'IE-L' })
      .returning();
    const city = await seedCity(testDb!, { regionId: region.id });

    const res = await supertest(app).get(`/api/cities/${city.id}`).expect(200);

    expect(res.body.region_id).toBe(region.id);
    expect(res.body.region_name).toBe('Leinster');
    expect(res.body.region_iso).toBe('IE-L');
  });

  it('returns a resolved city with coordinates', async () => {
    const city = await seedCity(testDb!, {
      geocodeStatus: 'resolved',
      latitude: 53.3498,
      longitude: -6.2603,
    });

    const res = await supertest(app).get(`/api/cities/${city.id}`).expect(200);

    expect(res.body.geocode_status).toBe('resolved');
    expect(res.body.latitude).toBeCloseTo(53.3498);
    expect(res.body.longitude).toBeCloseTo(-6.2603);
  });

  it('returns 404 for an unknown city id', async () => {
    const res = await supertest(app).get('/api/cities/99999');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-numeric city id', async () => {
    const res = await supertest(app).get('/api/cities/not-a-number');
    expect(res.status).toBe(404);
  });

  it('does not modify the city row (pure read — no updated_at bump)', async () => {
    const city = await seedCity(testDb!);

    const before = await testDb!
      .select({ updatedAt: schema.cities.updatedAt })
      .from(schema.cities)
      .where(eq(schema.cities.id, city.id));

    await supertest(app).get(`/api/cities/${city.id}`).expect(200);

    const after = await testDb!
      .select({ updatedAt: schema.cities.updatedAt })
      .from(schema.cities)
      .where(eq(schema.cities.id, city.id));

    expect(after[0].updatedAt).toBe(before[0].updatedAt);
  });
});

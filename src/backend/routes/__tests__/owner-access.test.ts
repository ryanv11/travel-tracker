/**
 * Contract tests for ADL-27 requireOwner middleware.
 *
 * Verifies HC-04 / HC-06 from OP-06 hardening checklist:
 *   HC-04: Admin routes (categories, activities, countries, regions) require owner
 *   HC-06: POST /api/cities requires owner
 *
 * HC-05 (map shading config routes require owner) is SUPERSEDED (2026-07-23) by
 * ADL-28 (AD-07) — shading config and shading reads are now per-user (requireAuth
 * only, userId-scoped), not owner-only. Coverage for the new behaviour lives in
 * services/__tests__/shading.user-scope.test.ts (per-user query isolation) and
 * routes/__tests__/map.test.ts (requireAuth-only route behaviour, lazy seeding,
 * per-user cache invalidation).
 *
 * Companion admin routes (GET/POST/PATCH/DELETE /api/admin/companions) are also
 * SUPERSEDED by ADL-28 (AD-08) — companions moved to /api/companions (requireAuth
 * only, userId-scoped, not an admin/owner resource). Coverage lives in
 * routes/__tests__/companions.test.ts.
 *
 * Test structure:
 *   - Non-owner tests: req.user.isOwner = 0 → expect 403 Forbidden
 *   - Owner tests:     req.user.isOwner = 1 → expect 200/201 (success)
 *
 * Uses an in-memory libSQL database per test (full isolation), schema
 * derived from the real migrations via createTestDb() (QUAL-17 — see
 * repositories/__tests__/test-db.ts).
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

// ----------------------------------------------------------------
// Module mocks
// ----------------------------------------------------------------

let testDb: TestDb | null = null;

// Controls what isOwner value the mock requireAuth sets on req.user
let mockIsOwner = 0;

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
    _req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    (_req as import('express').Request & { user?: unknown }).user = {
      id: 'test-user-id',
      clerkId: 'user_test',
      email: 'test@example.com',
      isOwner: mockIsOwner,
    };
    next();
  },
}));

vi.mock('../../services/geocoding.service.js', () => ({
  resolveCity: async () => undefined,
}));

// Mock shading service to avoid DB dependency in map shading GET test
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

const TEST_USER_ID = 'test-user-id';

async function seedTestUser(db: TestDb, isOwner = 0) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: TEST_USER_ID,
      clerkId: 'user_test',
      email: 'test@example.com',
      isOwner,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

async function seedCountry(db: TestDb, countryCode = 'US', name = 'United States') {
  await db.insert(schema.countries).values({ countryCode, name }).onConflictDoNothing();
}

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  mockIsOwner = 0; // Default: non-owner
});

afterEach(() => {
  testDb = null;
  mockIsOwner = 0;
});

// ================================================================
// HC-04: Admin routes require owner
// ================================================================

describe('HC-04: Non-owner authenticated user receives 403 on admin routes', () => {
  it('GET /api/admin/categories → 403 for non-owner', async () => {
    mockIsOwner = 0;
    await seedTestUser(testDb!, 0);
    const res = await supertest(app).get('/api/admin/categories');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/admin/categories → 403 for non-owner', async () => {
    mockIsOwner = 0;
    await seedTestUser(testDb!, 0);
    const res = await supertest(app).post('/api/admin/categories').send({ name: 'New Category' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });
});

describe('HC-04: Owner user receives 200/201 on admin routes', () => {
  it('GET /api/admin/categories → 200 for owner', async () => {
    mockIsOwner = 1;
    await seedTestUser(testDb!, 1);
    const res = await supertest(app).get('/api/admin/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/admin/categories → 201 for owner', async () => {
    mockIsOwner = 1;
    await seedTestUser(testDb!, 1);
    const res = await supertest(app).post('/api/admin/categories').send({ name: 'Owner Category' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Owner Category' });
  });
});

// ================================================================
// HC-06: POST /api/cities requires owner
// ================================================================

describe('HC-06: POST /api/cities requires owner', () => {
  it('POST /api/cities → 403 for non-owner', async () => {
    mockIsOwner = 0;
    await seedTestUser(testDb!, 0);
    await seedCountry(testDb!);
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'New City', country_code: 'US' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/cities → 201 for owner', async () => {
    mockIsOwner = 1;
    await seedTestUser(testDb!, 1);
    await seedCountry(testDb!);
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Owner City', country_code: 'US' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Owner City', country_code: 'US' });
  });
});

// ================================================================
// BUG-33: POST /api/cities find-or-create (no duplicate rows)
// ================================================================

describe('BUG-33: POST /api/cities find-or-create', () => {
  beforeEach(async () => {
    mockIsOwner = 1;
    await seedTestUser(testDb!, 1);
    await seedCountry(testDb!);
  });

  it('returns the existing city (200) on an exact-name repeat instead of inserting a duplicate', async () => {
    const first = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Glasgow', country_code: 'US' });
    expect(first.status).toBe(201);

    const second = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Glasgow', country_code: 'US' });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const rows = await testDb!
      .select()
      .from(schema.cities)
      .where(eq(schema.cities.countryCode, 'US'));
    expect(rows).toHaveLength(1);
  });

  it('matches an existing city case-insensitively (e.g. "glasgow" vs "Glasgow")', async () => {
    const first = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Glasgow', country_code: 'US' });
    expect(first.status).toBe(201);

    const second = await supertest(app)
      .post('/api/cities')
      .send({ name: 'glasgow', country_code: 'US' });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.name).toBe('Glasgow'); // returns the stored casing, not the request's

    const rows = await testDb!
      .select()
      .from(schema.cities)
      .where(eq(schema.cities.countryCode, 'US'));
    expect(rows).toHaveLength(1);
  });

  it('does not match a same-named city in a different country', async () => {
    await seedCountry(testDb!, 'GB', 'United Kingdom');

    const first = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Glasgow', country_code: 'GB' });
    expect(first.status).toBe(201);

    const second = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Glasgow', country_code: 'US' });
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);

    const rows = await testDb!.select().from(schema.cities);
    expect(rows).toHaveLength(2);
  });
});

// ================================================================
// BUG-22: PATCH /api/cities/:id requires owner (SE-03)
// ================================================================

describe('BUG-22: PATCH /api/cities/:id requires owner', () => {
  it('PATCH /api/cities/1 → 403 for non-owner', async () => {
    mockIsOwner = 0;
    await seedTestUser(testDb!, 0);
    const res = await supertest(app).patch('/api/cities/1').send({ region_id: null });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('PATCH /api/cities/1 → 404 for owner (city does not exist, but auth gate passes)', async () => {
    mockIsOwner = 1;
    await seedTestUser(testDb!, 1);
    const res = await supertest(app).patch('/api/cities/1').send({ region_id: null });
    expect(res.status).toBe(404);
  });
});

/**
 * Security Access Matrix — Regression Test Suite
 * BRD §5.11 SE-01 through SE-07 / OP-06 hardening checklist
 *
 * This file is a LIVING ACCESS MATRIX. When a new route is added:
 *   1. Add a Part A row (unauthenticated → 401)
 *   2. If requireOwner: add a Part B row (non-owner → 403)
 *   3. If route accesses user-owned data: verify cross-user case in Part C or service unit test
 *
 * Exempt from Part A: /health (liveness probe), /geo/* (public static — OP-06 §1.2)
 * Not in Part B: /api/map/shading/countries/:code and /api/map/shading/regions/:code
 *   are requireAuth only (not owner-restricted) — intentional per OP-06 §2 access matrix.
 *   GET /api/me is also requireAuth only (BUG-26) — every authenticated user may ask
 *   who they are; see Part D for its shape/isOwner coverage.
 *   GET /api/admin/countries and GET /api/admin/countries/:code/regions are requireAuth
 *   only too (BUG-61 / ADL-38) — global pre-seeded reference data (GE-04/GE-05) that every
 *   user reads to create a trip; only the country/region WRITES stay owner-only. Positive
 *   read coverage is in Part E; the writes remain in Part B.
 *   ALL of /api/companions/* and /api/map/shading/* (including /config) are requireAuth
 *   only too as of ADL-28 (AD-07/AD-08, 2026-07-23) — companions and map shading config
 *   moved from owner-only admin resources to per-user, userId-scoped resources. They are
 *   NOT in Part B for the same reason. Cross-user isolation coverage for these two
 *   resources lives in routes/__tests__/companions.test.ts and
 *   services/__tests__/shading.user-scope.test.ts (plus the Part C rows below).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

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

vi.mock('../../services/geocoding.service.js', () => ({
  resolveCity: async () => undefined,
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

async function seedCountry(db: TestDb, countryCode = 'US', name = 'United States') {
  await db.insert(schema.countries).values({ countryCode, name }).onConflictDoNothing();
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

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------

beforeEach(async () => {
  testDb = await createTestDb();
  // Default: authenticated as USER_A (owner)
  mockAuthEnabled = true;
  mockIsOwner = 1;
  mockUserId = USER_A_ID;
});

afterEach(() => {
  testDb = null;
  mockAuthEnabled = true;
  mockIsOwner = 1;
  mockUserId = USER_A_ID;
});

// ================================================================
// Part A — Unauthenticated rejection (28 cases)
//
// All /api/* routes must return 401 when auth is disabled.
// Exempt: /health (liveness probe), /geo/* (public static — OP-06 §1.2)
// ================================================================

describe('Part A — Unauthenticated rejection: all API routes return 401', () => {
  beforeEach(() => {
    mockAuthEnabled = false;
  });

  it('GET /api/trips → 401', async () => {
    const res = await supertest(app).get('/api/trips');
    expect(res.status).toBe(401);
  });

  it('POST /api/trips → 401', async () => {
    const res = await supertest(app).post('/api/trips').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/trips/1 → 401', async () => {
    const res = await supertest(app).get('/api/trips/1');
    expect(res.status).toBe(401);
  });

  it('PATCH /api/trips/1 → 401', async () => {
    const res = await supertest(app).patch('/api/trips/1').send({});
    expect(res.status).toBe(401);
  });

  it('DELETE /api/trips/1 → 401', async () => {
    const res = await supertest(app).delete('/api/trips/1');
    expect(res.status).toBe(401);
  });

  it('GET /api/trips/1/places → 401', async () => {
    const res = await supertest(app).get('/api/trips/1/places');
    expect(res.status).toBe(401);
  });

  it('POST /api/trips/1/places → 401', async () => {
    const res = await supertest(app).post('/api/trips/1/places').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/trips/1/items → 401', async () => {
    const res = await supertest(app).get('/api/trips/1/items');
    expect(res.status).toBe(401);
  });

  it('POST /api/trips/1/items → 401', async () => {
    const res = await supertest(app).post('/api/trips/1/items').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/cities → 401', async () => {
    const res = await supertest(app).get('/api/cities').query({ q: 'test' });
    expect(res.status).toBe(401);
  });

  it('POST /api/cities → 401', async () => {
    const res = await supertest(app).post('/api/cities').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/cities/1 → 401', async () => {
    const res = await supertest(app).get('/api/cities/1');
    expect(res.status).toBe(401);
  });

  it('GET /api/cities/1/carry-forward → 401', async () => {
    const res = await supertest(app).get('/api/cities/1/carry-forward');
    expect(res.status).toBe(401);
  });

  it('GET /api/cities/1/items → 401', async () => {
    const res = await supertest(app).get('/api/cities/1/items');
    expect(res.status).toBe(401);
  });

  it('GET /api/map/shading → 401', async () => {
    const res = await supertest(app).get('/api/map/shading');
    expect(res.status).toBe(401);
  });

  it('GET /api/map/shading/config → 401', async () => {
    const res = await supertest(app).get('/api/map/shading/config');
    expect(res.status).toBe(401);
  });

  it('PATCH /api/map/shading/config/visited → 401', async () => {
    const res = await supertest(app).patch('/api/map/shading/config/visited').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/map/shading/countries/US → 401', async () => {
    const res = await supertest(app).get('/api/map/shading/countries/US');
    expect(res.status).toBe(401);
  });

  it('GET /api/map/shading/regions/US → 401', async () => {
    const res = await supertest(app).get('/api/map/shading/regions/US');
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/categories → 401', async () => {
    const res = await supertest(app).get('/api/admin/categories');
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/categories → 401', async () => {
    const res = await supertest(app).post('/api/admin/categories').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/activities → 401', async () => {
    const res = await supertest(app).get('/api/admin/activities');
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/activities → 401', async () => {
    const res = await supertest(app).post('/api/admin/activities').send({});
    expect(res.status).toBe(401);
  });

  // Companions — ADL-28 (AD-08): moved from /api/admin/companions to /api/companions
  it('GET /api/companions → 401', async () => {
    const res = await supertest(app).get('/api/companions');
    expect(res.status).toBe(401);
  });

  it('POST /api/companions → 401', async () => {
    const res = await supertest(app).post('/api/companions').send({});
    expect(res.status).toBe(401);
  });

  it('PATCH /api/companions/1 → 401', async () => {
    const res = await supertest(app).patch('/api/companions/1').send({});
    expect(res.status).toBe(401);
  });

  it('DELETE /api/companions/1 → 401', async () => {
    const res = await supertest(app).delete('/api/companions/1');
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/countries → 401', async () => {
    const res = await supertest(app).get('/api/admin/countries');
    expect(res.status).toBe(401);
  });

  it('PATCH /api/admin/countries/US → 401', async () => {
    const res = await supertest(app).patch('/api/admin/countries/US').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/countries/US/regions → 401', async () => {
    const res = await supertest(app).get('/api/admin/countries/US/regions');
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/countries/US/regions → 401', async () => {
    const res = await supertest(app).post('/api/admin/countries/US/regions').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/me → 401', async () => {
    const res = await supertest(app).get('/api/me');
    expect(res.status).toBe(401);
  });
});

// ================================================================
// Part B — Owner-only routes: non-owner gets 403 (25 cases)
//
// Authenticated as USER_B (isOwner=0). All owner-gated routes must
// return 403 { error: 'Forbidden' }.
//
// NOT included here (requireAuth only, not requireOwner):
//   GET /api/map/shading/countries/:code
//   GET /api/map/shading/regions/:code
//   GET /api/admin/countries                   (BUG-61 / ADL-38 — see Part E)
//   GET /api/admin/countries/:code/regions     (BUG-61 / ADL-38 — see Part E)
//   /api/companions/*                          (ADL-28 AD-08 — see Part C)
//   /api/map/shading, /api/map/shading/config  (ADL-28 AD-07 — see Part C)
// ================================================================

describe('Part B — Non-owner authenticated user receives 403 on owner-only routes', () => {
  beforeEach(async () => {
    mockAuthEnabled = true;
    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
  });

  // Admin — categories
  it('GET /api/admin/categories → 403', async () => {
    const res = await supertest(app).get('/api/admin/categories');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/admin/categories → 403', async () => {
    const res = await supertest(app).post('/api/admin/categories').send({ name: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('PATCH /api/admin/categories/1 → 403', async () => {
    const res = await supertest(app).patch('/api/admin/categories/1').send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('DELETE /api/admin/categories/1 → 403', async () => {
    const res = await supertest(app).delete('/api/admin/categories/1');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('GET /api/admin/categories/active → 403', async () => {
    const res = await supertest(app).get('/api/admin/categories/active');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // Admin — activities
  it('GET /api/admin/activities → 403', async () => {
    const res = await supertest(app).get('/api/admin/activities');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/admin/activities → 403', async () => {
    const res = await supertest(app).post('/api/admin/activities').send({ name: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('PATCH /api/admin/activities/1 → 403', async () => {
    const res = await supertest(app).patch('/api/admin/activities/1').send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('DELETE /api/admin/activities/1 → 403', async () => {
    const res = await supertest(app).delete('/api/admin/activities/1');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('GET /api/admin/activities/active → 403', async () => {
    const res = await supertest(app).get('/api/admin/activities/active');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // Admin — countries (WRITES only; the GET reads moved to Part E per BUG-61)
  it('PATCH /api/admin/countries/US → 403', async () => {
    const res = await supertest(app).patch('/api/admin/countries/US').send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/admin/countries/US/regions → 403', async () => {
    const res = await supertest(app).post('/api/admin/countries/US/regions').send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // Admin — regions PATCH
  // Confirmed path from admin.ts: PATCH /api/admin/countries/:countryCode/regions/:regionId
  it('PATCH /api/admin/countries/US/regions/1 → 403', async () => {
    const res = await supertest(app)
      .patch('/api/admin/countries/US/regions/1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  // Cities — CREATION is no longer owner-only (ADL-46 D4/§8 row 3). City
  // create-on-demand is available to any authenticated user; curation (PATCH,
  // below) stays owner-only. A non-owner POST now creates a city → 201, not 403.
  // The full find-or-create / containment behaviour is covered by the ADL-46
  // acceptance suite (adl46-access-model.test.ts Group A/B); this assertion just
  // confirms the access gate flipped from owner-only to requireAuth here in the
  // access matrix.
  it('POST /api/cities → 201 for a non-owner (ADL-46 D4: creation opened)', async () => {
    await seedCountry(testDb!);
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Test City', country_code: 'US' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Test City', country_code: 'US' });
  });

  // PATCH /api/cities/:id — BUG-22 (GitHub issue #91) merged and the requireOwner
  // guard has been present ever since (src/backend/routes/cities.ts:225), but this
  // assertion stayed skipped and unrun the whole time (ADL-46 §8.1 — a live
  // security-coverage hole found en route to the ADL-46 spec, not introduced by
  // it). Unskipped here as part of the ADL-46 QA ATDD pass: city curation staying
  // owner-only is the premise D4 relies on to make city CREATION safe to open to
  // non-owners, so the one assertion protecting that premise should not be the
  // one silently switched off.
  it('PATCH /api/cities/1 → 403 (ADL-46 §8.1: unskipped — coverage hole, guard already present)', async () => {
    const res = await supertest(app).patch('/api/cities/1').send({ region_id: null });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });
});

// ================================================================
// Part C — Cross-user data isolation (5 cases)
//
// Seed USER_A's trip. Run all tests as USER_B.
// USER_B should see empty trip list, 404 on USER_A's trip, and
// 403 on owner-gated routes regardless of trip ownership.
// ================================================================

describe('Part C — Cross-user data isolation', () => {
  let tripAId: number;

  beforeEach(async () => {
    // Seed both users
    await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
    await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);

    // Seed a trip owned by USER_A
    tripAId = await seedTrip(testDb!, USER_A_ID);

    // Run all Part C tests as USER_B (non-owner)
    mockAuthEnabled = true;
    mockIsOwner = 0;
    mockUserId = USER_B_ID;
  });

  it('GET /api/trips → 200 with empty list (USER_B cannot see USER_A trips)', async () => {
    const res = await supertest(app).get('/api/trips');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/trips/:tripAId → 404 (opaque, not 403 per SE-05)', async () => {
    const res = await supertest(app).get(`/api/trips/${tripAId}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /api/trips/:tripAId → 404 (opaque, not 403 per SE-05)', async () => {
    const res = await supertest(app).patch(`/api/trips/${tripAId}`).send({ name: 'Hijack' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/trips/:tripAId → 404 (opaque, not 403 per SE-05)', async () => {
    const res = await supertest(app).delete(`/api/trips/${tripAId}`);
    expect(res.status).toBe(404);
  });

  // ADL-28 (AD-07): shading is requireAuth only now, not owner-gated — USER_B
  // (non-owner) can access it (200), scoped to their own (empty) trip data.
  // Query-level cross-user isolation (USER_B's response not containing USER_A's
  // trips) is covered in services/__tests__/shading.user-scope.test.ts; this row
  // just confirms the route itself is no longer 403ing a non-owner.
  it('GET /api/map/shading → 200 for non-owner (ADL-28: no longer owner-gated)', async () => {
    const res = await supertest(app).get('/api/map/shading');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ADL-28 (AD-08): companions are per-user, not owner-gated — USER_B sees an
  // empty list because only USER_A has companions (cross-user isolation).
  it('GET /api/companions → 200 with empty list (USER_B cannot see USER_A companions)', async () => {
    await testDb!.insert(schema.companions).values({
      userId: USER_A_ID,
      name: 'Owner Companion',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app).get('/api/companions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // Cross-user WRITE isolation on nested resources — a create must not attach
  // child rows to another user's trip (regression for the items-POST ownership hole).
  it('POST /api/trips/:tripAId/items → 404 (USER_B cannot add items to USER_A trip)', async () => {
    const res = await supertest(app)
      .post(`/api/trips/${tripAId}/items`)
      .send({ item_type: 'flight', status: 'confirmed', airline: 'BA', flight_number: 'BA001' });
    expect(res.status).toBe(404);
  });

  it('POST /api/trips/:tripAId/places → 404 (USER_B cannot add places to USER_A trip)', async () => {
    const res = await supertest(app).post(`/api/trips/${tripAId}/places`).send({ city_id: 1 });
    expect(res.status).toBe(404);
  });
});

// ================================================================
// Part D — GET /api/me identity endpoint (BUG-26 / SE-02)
//
// requireAuth only (NOT requireOwner — every authenticated user may
// ask who they are). Returns exactly { id, email, isOwner } echoed
// from the middleware-resolved req.user. No DB queries of its own.
// ================================================================

describe('Part D — GET /api/me returns the caller identity with isOwner flag', () => {
  it('owner: 200 with { id, email, isOwner: 1 }', async () => {
    mockAuthEnabled = true;
    mockIsOwner = 1;
    mockUserId = USER_A_ID;

    const res = await supertest(app).get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: USER_A_ID,
      email: 'usera@example.com',
      isOwner: 1,
    });
  });

  it('non-owner: 200 with { id, email, isOwner: 0 } — NOT 403', async () => {
    mockAuthEnabled = true;
    mockIsOwner = 0;
    mockUserId = USER_B_ID;

    const res = await supertest(app).get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: USER_B_ID,
      email: 'userb@example.com',
      isOwner: 0,
    });
  });

  it('response contains no fields beyond id, email, isOwner (no clerkId leak)', async () => {
    mockAuthEnabled = true;
    mockIsOwner = 1;
    mockUserId = USER_A_ID;

    const res = await supertest(app).get('/api/me');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['email', 'id', 'isOwner']);
  });
});

// ================================================================
// Part E — Global reference-data READS: countries/regions readable by
//          any authenticated user (BUG-61 / ADL-38 / GE-04 / GE-05)
//
// Regression for BUG-61: GET /api/admin/countries (and .../regions) were
// wrongly gated by the router-level requireOwner, so a non-owner's trip-create
// country picker 403'd and rendered empty — no non-owner could create a trip.
// These are global, pre-seeded defaults (GE-04/GE-05), so their READS require
// only auth. The matching WRITES stay owner-only (asserted here + in Part B).
//
// Run as USER_B (isOwner=0).
// ================================================================

describe('Part E — Non-owner can READ global countries/regions; WRITES stay owner-only', () => {
  beforeEach(async () => {
    mockAuthEnabled = true;
    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
    await seedCountry(testDb!, 'US', 'United States');
  });

  it('GET /api/admin/countries → 200 with the country list (was 403 pre-BUG-61)', async () => {
    const res = await supertest(app).get('/api/admin/countries');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ country_code: 'US', name: 'United States' }),
      ]),
    );
  });

  it('GET /api/admin/countries/US/regions → 200 (empty list ok, was 403 pre-BUG-61)', async () => {
    const res = await supertest(app).get('/api/admin/countries/US/regions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // Read/write split — the same resources' WRITES remain owner-gated.
  it('PATCH /api/admin/countries/US → 403 (write still owner-only)', async () => {
    const res = await supertest(app)
      .patch('/api/admin/countries/US')
      .send({ region_tier_enabled: true });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/admin/countries/US/regions → 403 (write still owner-only)', async () => {
    const res = await supertest(app)
      .post('/api/admin/countries/US/regions')
      .send({ name: 'California', iso3166_2: 'US-CA' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('PATCH /api/admin/countries/US/regions/1 → 403 (write still owner-only)', async () => {
    const res = await supertest(app)
      .patch('/api/admin/countries/US/regions/1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });
});

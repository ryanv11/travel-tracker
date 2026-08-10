/**
 * Security Access Matrix — Regression Test Suite
 * BRD §5.11 SE-01 through SE-07 / OP-06 hardening checklist
 *
 * This file is a LIVING ACCESS MATRIX. When a new route is added:
 *   1. Add a Part A row (unauthenticated → 401)
 *   2. If requireOwner: add a Part B row (non-owner → 403)
 *   3. If route accesses user-owned data: verify cross-user case in Part C or service unit test
 *
 * Part F (QUAL-43 / ADL-53) is the ATDD row-level cross-tenant matrix for the
 * §5.1 user-owned getDb() paths specifically — a deeper dimension than Part C's
 * per-route spot checks: it names every §5.1 path and asserts the expected
 * shape per endpoint class (empty result for reads, 404 for mutations).
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

import { eq } from 'drizzle-orm';
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
// Part F seed helpers (QUAL-43 / ADL-53 §5.1 — cross-tenant matrix)
// ----------------------------------------------------------------

/** Cities are global reference data (ADL-53 F3) — no userId column. */
async function seedCity(db: TestDb, countryCode = 'US', name = 'Test City'): Promise<number> {
  const rows = await db
    .insert(schema.cities)
    .values({ name, countryCode, geocodeStatus: 'resolved' })
    .returning({ id: schema.cities.id });
  return rows[0].id;
}

async function seedTripPlace(
  db: TestDb,
  tripId: number,
  cityId: number,
  userId: string,
): Promise<number> {
  const now = new Date().toISOString();
  const rows = await db
    .insert(schema.tripPlaces)
    .values({ tripId, cityId, userId, createdAt: now, updatedAt: now })
    .returning({ id: schema.tripPlaces.id });
  return rows[0].id;
}

async function seedItem(
  db: TestDb,
  opts: {
    tripId: number;
    tripPlaceId: number | null;
    userId: string;
    itemType?: string;
    status?: string;
  },
): Promise<number> {
  const now = new Date().toISOString();
  const rows = await db
    .insert(schema.items)
    .values({
      tripId: opts.tripId,
      tripPlaceId: opts.tripPlaceId,
      userId: opts.userId,
      itemType: opts.itemType ?? 'note',
      status: opts.status ?? 'confirmed',
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.items.id });
  return rows[0].id;
}

async function seedActivity(db: TestDb, userId: string, name = 'Test Activity'): Promise<number> {
  const now = new Date().toISOString();
  const rows = await db
    .insert(schema.activities)
    .values({ userId, name, isActive: 1, createdAt: now, updatedAt: now })
    .returning({ id: schema.activities.id });
  return rows[0].id;
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

// ================================================================
// Part F — QUAL-43 / ADL-53 Stage 1: cross-tenant row-level isolation
// matrix for the §5.1 user-owned read/mutate paths.
//
// This is the OP-35 red bar for the userId-scoping chokepoint build
// (ADL-53). It names every §5.1 user-owned path explicitly and asserts
// the F4 expected shape per endpoint class: EMPTY RESULT for
// cross-tenant reads, 404 (never 403 — SE-05, opaque) for cross-tenant
// mutations. Runs against the same real libSQL (:memory:) instance as
// the rest of this file (createTestDb() — real FKs, real migrations,
// real partial unique indexes; see repositories/__tests__/test-db.ts).
// Seeds TWO distinct real users (USER_A/USER_B) throughout.
//
// items-helper.ts:87 (fetchItemsWithExtensions) has no route of its
// own — it is exercised transitively here via trips.ts:198 (F1 below)
// and cities.ts:703/766 (F3/F4 below), its three call sites.
//
// trips.ts:207-216's tripPlaceActivitiesMap join (trip-detail place
// activities) carries no userId column and inherits isolation from the
// prior tripRepository.findByIdOrThrow ownership check (ADL-53 F2:
// "assertion-guarded, composes nothing") — placeIds passed into that
// join are already scoped to the caller's own trip, so there is no
// independent cross-tenant vector to construct a red assertion against;
// this is a structural read of the code, not a gap in this matrix.
// ================================================================

describe('Part F — Cross-tenant row-level isolation (QUAL-43 / ADL-53 §5.1)', () => {
  beforeEach(async () => {
    await seedUser(testDb!, USER_A_ID, 'clerk_user_a', 'usera@example.com', 1);
    await seedUser(testDb!, USER_B_ID, 'clerk_user_b', 'userb@example.com', 0);
    await seedCountry(testDb!, 'US', 'United States');
  });

  // --------------------------------------------------------------
  // F1 — trips.ts:198 trip-detail assembly (predicate-composed items read)
  //
  // Expected shape (F4): the read isolates by construction — this is not
  // a cross-tenant CALLER test (Part C already covers GET /api/trips/:id
  // → 404 for a non-owner caller) but a proof that the inline
  // `eq(items.userId, userId)` predicate at trips.ts:223 is load-bearing
  // for the OWNER's own view. A second item is inserted directly against
  // the DB with the SAME trip/place but a DIFFERENT userId (a
  // hypothetical write-path anomaly) to construct the exact condition the
  // predicate exists to guard. ANTI-VACUOUS: if that predicate were
  // dropped (i.e. the assembly filtered on trip_place_id alone), the
  // rogue item would appear in USER_A's own trip-detail response — this
  // assertion fires on that removal.
  // --------------------------------------------------------------
  it('GET /api/trips/:id — trip-detail items are scoped to the caller, not just the trip/place (trips.ts:198/223)', async () => {
    const tripAId = await seedTrip(testDb!, USER_A_ID);
    const cityId = await seedCity(testDb!);
    const placeAId = await seedTripPlace(testDb!, tripAId, cityId, USER_A_ID);
    const ownItemId = await seedItem(testDb!, {
      tripId: tripAId,
      tripPlaceId: placeAId,
      userId: USER_A_ID,
    });
    // Rogue row: same trip_id/trip_place_id, but owned by USER_B — constructs
    // the exact shape the eq(items.userId, userId) predicate must exclude.
    const rogueItemId = await seedItem(testDb!, {
      tripId: tripAId,
      tripPlaceId: placeAId,
      userId: USER_B_ID,
    });

    mockAuthEnabled = true;
    mockIsOwner = 1;
    mockUserId = USER_A_ID;

    const res = await supertest(app).get(`/api/trips/${tripAId}`);
    expect(res.status).toBe(200);

    const place = res.body.places.find((p: { id: number }) => p.id === placeAId);
    const itemIds = place.items.map((i: { id: number }) => i.id);
    expect(itemIds).toContain(ownItemId);
    expect(itemIds).not.toContain(rogueItemId);
  });

  // --------------------------------------------------------------
  // F2 — places.ts:231 carry-forward POST (SEC-02)
  //
  // (a) Full cross-tenant call: mutation → 404 (opaque, SE-05), via
  //     placeRepository.assertWritable's ownership check.
  // (b) The SEC-02 predicate itself: USER_B, acting entirely within their
  //     OWN trip/place, supplies USER_A's item id as a source_item_id.
  //     Expected: 400 (source item not found/owned), never a silent
  //     carry-forward of another user's data. ANTI-VACUOUS: this is the
  //     `eq(items.userId, userId)` filter at places.ts:253 firing —
  //     if dropped, foundItems.length would equal sourceItemIds.length
  //     and USER_A's item would be duplicated onto USER_B's trip (201).
  // --------------------------------------------------------------
  it('POST /api/trips/:tripId/places/:placeId/carry-forward — cross-tenant trip/place → 404, never 403', async () => {
    const tripAId = await seedTrip(testDb!, USER_A_ID);
    const cityId = await seedCity(testDb!);
    const placeAId = await seedTripPlace(testDb!, tripAId, cityId, USER_A_ID);
    const itemAId = await seedItem(testDb!, {
      tripId: tripAId,
      tripPlaceId: placeAId,
      userId: USER_A_ID,
      status: 'next_time',
    });

    mockAuthEnabled = true;
    mockIsOwner = 0;
    mockUserId = USER_B_ID;

    const res = await supertest(app)
      .post(`/api/trips/${tripAId}/places/${placeAId}/carry-forward`)
      .send({ source_item_ids: [itemAId] });
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('POST .../carry-forward — SEC-02: caller cannot carry forward ANOTHER user\'s item into their own trip', async () => {
    const tripAId = await seedTrip(testDb!, USER_A_ID);
    const cityId = await seedCity(testDb!);
    const placeAId = await seedTripPlace(testDb!, tripAId, cityId, USER_A_ID);
    const itemAId = await seedItem(testDb!, {
      tripId: tripAId,
      tripPlaceId: placeAId,
      userId: USER_A_ID,
      status: 'next_time',
    });

    // USER_B's OWN trip/place — the write-gate ownership check passes;
    // only the item-ownership predicate stands between USER_B and
    // carrying USER_A's item onto their own trip.
    const tripBId = await seedTrip(testDb!, USER_B_ID);
    const placeBId = await seedTripPlace(testDb!, tripBId, cityId, USER_B_ID);

    mockAuthEnabled = true;
    mockIsOwner = 0;
    mockUserId = USER_B_ID;

    const res = await supertest(app)
      .post(`/api/trips/${tripBId}/places/${placeBId}/carry-forward`)
      .send({ source_item_ids: [itemAId] });
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(201);
  });

  // --------------------------------------------------------------
  // F3 — cities.ts:703 GET /:id/carry-forward (predicate-composed read, SE-05/IT-07)
  //
  // Cities are global reference data (ADL-53 F3/D3) — the route itself is
  // reachable by any authenticated user (no 404 expected). Isolation is
  // enforced by the eq(trips.userId, userId) predicate at cities.ts:748.
  // Expected shape (F4): EMPTY RESULT for the cross-tenant caller.
  // Positive control (USER_A) proves the fixture/status/type filters are
  // actually satisfiable — an always-empty response for the wrong reason
  // (e.g. a bad status literal) would otherwise pass vacuously.
  // --------------------------------------------------------------
  it('GET /api/cities/:id/carry-forward — cross-tenant caller sees an empty list, not the owner\'s next_time items', async () => {
    const tripAId = await seedTrip(testDb!, USER_A_ID);
    const cityId = await seedCity(testDb!);
    const placeAId = await seedTripPlace(testDb!, tripAId, cityId, USER_A_ID);
    const itemAId = await seedItem(testDb!, {
      tripId: tripAId,
      tripPlaceId: placeAId,
      userId: USER_A_ID,
      itemType: 'restaurant',
      status: 'next_time',
    });

    // Positive control: the owner sees their own next_time item at this city.
    mockAuthEnabled = true;
    mockIsOwner = 1;
    mockUserId = USER_A_ID;
    const ownerRes = await supertest(app).get(`/api/cities/${cityId}/carry-forward`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.map((r: { id: number }) => r.id)).toContain(itemAId);

    // Cross-tenant: same city (global data), different caller → empty.
    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    const res = await supertest(app).get(`/api/cities/${cityId}/carry-forward`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // --------------------------------------------------------------
  // F4 — cities.ts:766 GET /:id/items (predicate-composed read, SEC-01/IT-09)
  //
  // Same shape as F3: global route, isolation via eq(items.userId, userId)
  // at cities.ts:792. Expected shape (F4): EMPTY RESULT cross-tenant.
  // --------------------------------------------------------------
  it('GET /api/cities/:id/items — cross-tenant caller sees an empty list, not the owner\'s completed items (SEC-01)', async () => {
    const tripAId = await seedTrip(testDb!, USER_A_ID);
    const cityId = await seedCity(testDb!);
    const placeAId = await seedTripPlace(testDb!, tripAId, cityId, USER_A_ID);
    const itemAId = await seedItem(testDb!, {
      tripId: tripAId,
      tripPlaceId: placeAId,
      userId: USER_A_ID,
      itemType: 'restaurant',
      status: 'completed',
    });

    // Positive control.
    mockAuthEnabled = true;
    mockIsOwner = 1;
    mockUserId = USER_A_ID;
    const ownerRes = await supertest(app).get(`/api/cities/${cityId}/items`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.map((r: { id: number }) => r.id)).toContain(itemAId);

    // Cross-tenant.
    mockIsOwner = 0;
    mockUserId = USER_B_ID;
    const res = await supertest(app).get(`/api/cities/${cityId}/items`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // --------------------------------------------------------------
  // F5 — places.ts:289/352 activity tag/untag (assertion-guarded, no
  // userId column on the join table — ownership inherited from a prior
  // placeRepository.findById(userId, placeId) call).
  //
  // Expected shape (F4): 404 for both cross-tenant mutations, never 403.
  // --------------------------------------------------------------
  it('POST /api/trips/:tripId/places/:placeId/activities — cross-tenant place → 404, never 403 (places.ts:289)', async () => {
    const tripAId = await seedTrip(testDb!, USER_A_ID);
    const cityId = await seedCity(testDb!);
    const placeAId = await seedTripPlace(testDb!, tripAId, cityId, USER_A_ID);
    const activityAId = await seedActivity(testDb!, USER_A_ID);

    mockAuthEnabled = true;
    mockIsOwner = 0;
    mockUserId = USER_B_ID;

    const res = await supertest(app)
      .post(`/api/trips/${tripAId}/places/${placeAId}/activities`)
      .send({ activity_id: activityAId });
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('DELETE /api/trips/:tripId/places/:placeId/activities/:activityId — cross-tenant place → 404, never 403 (places.ts:352)', async () => {
    const tripAId = await seedTrip(testDb!, USER_A_ID);
    const cityId = await seedCity(testDb!);
    const placeAId = await seedTripPlace(testDb!, tripAId, cityId, USER_A_ID);
    const activityAId = await seedActivity(testDb!, USER_A_ID);
    await testDb!
      .insert(schema.tripPlaceActivitiesMap)
      .values({ tripPlaceId: placeAId, activityId: activityAId });

    mockAuthEnabled = true;
    mockIsOwner = 0;
    mockUserId = USER_B_ID;

    const res = await supertest(app).delete(
      `/api/trips/${tripAId}/places/${placeAId}/activities/${activityAId}`,
    );
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);

    // Sanity: the tag USER_B just 404'd against still exists — the request
    // was rejected before any mutation, not silently no-op'd on someone
    // else's row. Confirms this is a real ownership gate, not a delete
    // that happened to affect zero rows for an unrelated reason.
    const stillTagged = await testDb!
      .select()
      .from(schema.tripPlaceActivitiesMap)
      .where(eq(schema.tripPlaceActivitiesMap.tripPlaceId, placeAId));
    expect(stillTagged.length).toBe(1);
  });
});

/**
 * GE-19 / BUG-85 — ATDD RED BAR for the geocode status-lifecycle model.
 * Acceptance criteria 4, 5, 8, 10 from ADL-55 §7 (API level, the derived
 * userId-scoped queue endpoint GET /api/geocode-queue — ADL-55 §5, OQ-5).
 *
 * ALL FOUR ARE RED on current main: the endpoint does not exist (two probes:
 * (1) grep across routes/ + server-test-app.ts finds no geocode-queue
 * registration; (2) this suite hits it and gets 404). Each is committed
 * `describe.skip` with the RED-BAR marker so CI stays green; the Backend brief
 * un-skips each block as it builds the endpoint.
 *
 * SECURITY BAR (OP-06, criterion 4): cross-user isolation of the queue —
 * composes the QUAL-43 cross-tenant matrix pattern (ADL-53 §5.1). Seeds two
 * distinct real users (USER_A / USER_B) and proves USER_B's solely-referenced
 * stuck city never appears for USER_A. This is the exact class a vacuous double
 * passes silently, so it runs against a real libSQL instance with the partial
 * unique indexes live (createTestDb), NOT a stubbed repository (QUAL-22).
 *
 * ASSUMED RESPONSE CONTRACT (pins the ADL-55 §5.1 columns): a JSON array of
 * city objects, each carrying at least `id` (number) and `geocode_status`
 * (snake_case, matching the existing GET /api/cities search shape). If the
 * Backend chooses a different envelope it must reconcile these assertions in
 * the un-skip diff — that reconciliation is the contract negotiation, and a
 * silently-weakened assertion shows there. Endpoint path is `/api/geocode-queue`
 * per OQ-5.
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

const USER_A_ID = 'user-a-00000000-0000-0000-0000-000000000000';
const USER_B_ID = 'user-b-00000000-0000-0000-0000-000000000000';

let testDb: TestDb | null = null;
let mockUserId = USER_A_ID;
let mockIsOwner = 1;
let mockAuthEnabled = true;

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
// Seed helpers (mirrors security.access-matrix.test.ts Part F)
// ----------------------------------------------------------------

async function seedUser(db: TestDb, userId: string, isOwner: number) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: userId,
      clerkId: userId === USER_A_ID ? 'clerk_user_a' : 'clerk_user_b',
      email: `${userId}@example.com`,
      isOwner,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

async function seedCountry(db: TestDb) {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'US', name: 'United States' })
    .onConflictDoNothing();
}

async function seedTrip(db: TestDb, userId: string): Promise<number> {
  const now = new Date().toISOString();
  const [trip] = await db
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
  return trip.id;
}

/** Cities are global reference data — no userId column. */
async function seedCity(
  db: TestDb,
  name: string,
  overrides: Partial<typeof schema.cities.$inferInsert> = {},
): Promise<number> {
  const [city] = await db
    .insert(schema.cities)
    .values({ name, countryCode: 'US', geocodeStatus: 'needs_attention', ...overrides })
    .returning({ id: schema.cities.id });
  return city.id;
}

async function seedTripPlace(
  db: TestDb,
  tripId: number,
  cityId: number,
  userId: string,
): Promise<number> {
  const now = new Date().toISOString();
  const [place] = await db
    .insert(schema.tripPlaces)
    .values({ tripId, cityId, userId, createdAt: now, updatedAt: now })
    .returning({ id: schema.tripPlaces.id });
  return place.id;
}

/** ids present in a queue response, tolerant of an empty/absent body. */
function idsOf(body: unknown): number[] {
  return Array.isArray(body) ? body.map((c: { id: number }) => c.id) : [];
}

beforeEach(async () => {
  testDb = await createTestDb();
  mockAuthEnabled = true;
  mockIsOwner = 1;
  mockUserId = USER_A_ID;
  await seedUser(testDb, USER_A_ID, 1);
  await seedUser(testDb, USER_B_ID, 0);
  await seedCountry(testDb);
});

afterEach(() => {
  testDb = null;
  mockAuthEnabled = true;
  mockIsOwner = 1;
  mockUserId = USER_A_ID;
});

// ================================================================
// Criterion 4 (ADL-55 §7.4 / §5.1) — THE SECURITY BAR. Cross-user isolation:
// the queue returns only cities referenced by the requester's own trips/places;
// a needs_attention city referenced SOLELY by USER_B never appears for USER_A.
// ================================================================
// GE-19 RED BAR (BUG-85) — unskip when implemented
describe('GE-19 RED BAR (BUG-85) §7.4 — GET /api/geocode-queue is userId-scoped (SECURITY)', () => {
  it("USER_A's queue contains their own stuck city and NEVER USER_B's solely-referenced stuck city", async () => {
    // USER_A's stuck city.
    const tripA = await seedTrip(testDb!, USER_A_ID);
    const cityA = await seedCity(testDb!, 'AlphaTown', { geocodeCause: 'ambiguous' });
    await seedTripPlace(testDb!, tripA, cityA, USER_A_ID);

    // USER_B's stuck city — referenced ONLY by USER_B.
    const tripB = await seedTrip(testDb!, USER_B_ID);
    const cityB = await seedCity(testDb!, 'BravoCity', { geocodeCause: 'ambiguous' });
    await seedTripPlace(testDb!, tripB, cityB, USER_B_ID);

    mockUserId = USER_A_ID;
    const res = await supertest(app).get('/api/geocode-queue');

    expect(res.status).toBe(200);
    const ids = idsOf(res.body);
    expect(ids).toContain(cityA); // own stuck city visible
    expect(ids).not.toContain(cityB); // another user's stuck city is invisible
  });

  it("USER_B does not see USER_A's stuck city either (symmetry)", async () => {
    const tripA = await seedTrip(testDb!, USER_A_ID);
    const cityA = await seedCity(testDb!, 'AlphaTown', { geocodeCause: 'ambiguous' });
    await seedTripPlace(testDb!, tripA, cityA, USER_A_ID);

    mockUserId = USER_B_ID;
    mockIsOwner = 0;
    const res = await supertest(app).get('/api/geocode-queue');

    expect(res.status).toBe(200);
    expect(idsOf(res.body)).not.toContain(cityA);
  });
});

// ================================================================
// Criterion 5 (ADL-55 §7.5 / §5.1) — the queue EXCLUDES resolved cities and
// cities the user no longer references (the last referencing place removed).
// ================================================================
// GE-19 RED BAR (BUG-85) — unskip when implemented
describe('GE-19 RED BAR (BUG-85) §7.5 — queue excludes resolved and no-longer-referenced cities', () => {
  it('a resolved city and an unreferenced city are absent; a still-referenced stuck city is present', async () => {
    const tripA = await seedTrip(testDb!, USER_A_ID);

    // Still referenced + stuck → present.
    const cityStuck = await seedCity(testDb!, 'StuckTown', { geocodeCause: 'ambiguous' });
    await seedTripPlace(testDb!, tripA, cityStuck, USER_A_ID);

    // Referenced but resolved → excluded (query is WHERE status <> 'resolved').
    const cityResolved = await seedCity(testDb!, 'ResolvedTown', {
      geocodeStatus: 'resolved',
      latitude: 1,
      longitude: 2,
    });
    await seedTripPlace(testDb!, tripA, cityResolved, USER_A_ID);

    // Stuck, but its only referencing place is then removed → excluded.
    const cityUnref = await seedCity(testDb!, 'AbandonedTown', { geocodeCause: 'ambiguous' });
    const placeUnref = await seedTripPlace(testDb!, tripA, cityUnref, USER_A_ID);
    // The user removes the last place referencing it (the DELETE-place recovery
    // lever); modelled here as the row removal that lever performs.
    await testDb!.delete(schema.tripPlaces).where(eq(schema.tripPlaces.id, placeUnref));

    mockUserId = USER_A_ID;
    const res = await supertest(app).get('/api/geocode-queue');

    expect(res.status).toBe(200);
    const ids = idsOf(res.body);
    expect(ids).toContain(cityStuck);
    expect(ids).not.toContain(cityResolved); // resolved cities never in the queue
    expect(ids).not.toContain(cityUnref); // no longer referenced → left the queue
  });
});

// ================================================================
// Criterion 8 (ADL-55 §7.8) — RE-POINT RECOVERY. Re-pointing the last place off
// a stuck city onto a corrected city drops the abandoned stuck city from the
// user's queue. Uses the REAL GE-16 re-point route.
//
// NOTE (QA finding): the ADL/brief/tracker cite the re-point path as
// `PATCH /api/places/:id`, but no such route exists — placesRouter is mounted
// under trips (trips.ts:47), so the built path is
// `PATCH /api/trips/:tripId/places/:placeId` (places.ts:121, accepting city_id
// via UpdatePlaceDatesSchema). This suite uses the real path.
// ================================================================
// GE-19 RED BAR (BUG-85) — unskip when implemented
describe('GE-19 RED BAR (BUG-85) §7.8 — re-point drops the abandoned stuck city from the queue', () => {
  it('after re-pointing the last place onto a corrected city, the stuck city leaves the queue', async () => {
    const tripA = await seedTrip(testDb!, USER_A_ID);
    const cityStuck = await seedCity(testDb!, 'MistypedTown', { geocodeCause: 'ambiguous' });
    const place = await seedTripPlace(testDb!, tripA, cityStuck, USER_A_ID);
    const cityGood = await seedCity(testDb!, 'CorrectTown', {
      geocodeStatus: 'resolved',
      latitude: 1,
      longitude: 2,
    });

    mockUserId = USER_A_ID;

    // Re-point the place onto the corrected city (the real GE-16 recovery lever).
    const patchRes = await supertest(app)
      .patch(`/api/trips/${tripA}/places/${place}`)
      .send({ city_id: cityGood });
    expect(patchRes.status).toBe(200); // re-point route works on main

    // The abandoned stuck city is now referenced by nothing of USER_A's.
    const res = await supertest(app).get('/api/geocode-queue');
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).not.toContain(cityStuck);
  });
});

// ================================================================
// Criterion 10 (ADL-55 §7.10 / §4) — needs_attention AND unresolvable rows are
// counted in the NEEDS-ATTENTION bucket, not the in-progress/resolving count.
// The endpoint returns each city's geocode_status so the client can split
// status='pending' (in-progress) from status IN ('needs_attention',
// 'unresolvable') (needs-attention) without conflation.
// ================================================================
// GE-19 RED BAR (BUG-85) — unskip when implemented
describe('GE-19 RED BAR (BUG-85) §7.10 — needs_attention/unresolvable bucketed apart from in-progress', () => {
  it('returns pending, needs_attention and unresolvable rows distinguishably so the two buckets never conflate', async () => {
    const tripA = await seedTrip(testDb!, USER_A_ID);

    const cityPending = await seedCity(testDb!, 'PendingTown', { geocodeStatus: 'pending' });
    await seedTripPlace(testDb!, tripA, cityPending, USER_A_ID);

    const cityNeedsAttn = await seedCity(testDb!, 'AttnTown', {
      geocodeStatus: 'needs_attention',
      geocodeCause: 'ambiguous',
    });
    await seedTripPlace(testDb!, tripA, cityNeedsAttn, USER_A_ID);

    const cityUnresolvable = await seedCity(testDb!, 'NoMatchTown', {
      geocodeStatus: 'unresolvable',
    });
    await seedTripPlace(testDb!, tripA, cityUnresolvable, USER_A_ID);

    mockUserId = USER_A_ID;
    const res = await supertest(app).get('/api/geocode-queue');

    expect(res.status).toBe(200);
    const body = res.body as Array<{ id: number; geocode_status: string }>;
    const ids = body.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([cityPending, cityNeedsAttn, cityUnresolvable]));

    const inProgress = body.filter((c) => c.geocode_status === 'pending');
    const needsAttention = body.filter((c) =>
      ['needs_attention', 'unresolvable'].includes(c.geocode_status),
    );
    expect(inProgress.map((c) => c.id)).toEqual([cityPending]); // exactly the pending row
    expect(needsAttention.map((c) => c.id).sort()).toEqual(
      [cityNeedsAttn, cityUnresolvable].sort((a, b) => a - b),
    );
  });
});

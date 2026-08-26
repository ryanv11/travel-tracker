/**
 * ADL-56 / GE-21 (BRD v3.22) — Slice 1 RED acceptance bar, BACKEND half of
 * §10 test **4** (D3/P2): the ONE additive API field.
 *
 * ATDD-first (OP-35): authored BEFORE any implementer is briefed.
 *
 * ── WHAT THIS PINS AND WHY IT IS LOAD-BEARING ────────────────────────────────
 * P2 (§5) requires that a live candidate which IS a shown cached row be
 * represented ONCE, as the cached row. The frontend can only do that if it can
 * match a cached row to a live candidate BY IDENTITY. Today it cannot: the
 * `GET /api/cities` search projection selects
 * `id, name, country_code, region_id, region_name, region_iso, latitude,
 * longitude, geocode_status` and nothing else (`repositories/cities.ts`
 * `search`) — no `osm_type`, no `osm_id`. The only alternative left to the
 * frontend is matching on name text, which is exactly the fragile key ADL-56
 * §2/§5 rules out (two distinct real places routinely share a name, which is
 * the whole premise of this feature family).
 *
 * ADL-56 §9 scopes the change precisely: additive fields on the search
 * projection + the frontend `City` type. No new route, no DB change, no
 * migration, no index.
 *
 * ── SECURITY (OP-06, verbatim from ADL-56 §9) ────────────────────────────────
 * "Preserve the existing GE-16 containment predicate on the `GET /api/cities`
 * search unchanged." The last two blocks below assert exactly that, and are
 * GREEN on `main` — they are live guards the field addition must not disturb,
 * not part of the red bar. `osm_type`/`osm_id` are public OpenStreetMap
 * identifiers, not user data, and are already returned by `POST /api/cities`
 * via `serializeCity`.
 *
 * ── RED-BAR CARRIAGE ─────────────────────────────────────────────────────────
 * The red block is committed `describe.skip` with a RED-BAR marker, the
 * convention the GE-19/ADL-55 red bar used (`geocoding.ge19-lifecycle.test.ts`
 * and siblings): CI stays green, and the implementer un-skips it as they green
 * it, so a weakened assertion shows up in that diff. It was run un-skipped
 * before commit; the observed failure is recorded in
 * `jobs/qa/tech/20260826-ADL56-slice1-red-bar.md`.
 *
 * ── MOCK FIDELITY (QUAL-22) ──────────────────────────────────────────────────
 * Real libSQL (`:memory:`) built from the real migrations, real repository,
 * real route, real serializer. Nothing about the projection under test is
 * doubled — only auth and the DB handle are.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';

const USER_A_ID = 'user-adl56a-0000-0000-0000-000000000000';
const USER_B_ID = 'user-adl56b-0000-0000-0000-000000000000';

let testDb: TestDb | null = null;
let mockUserId = USER_A_ID;

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
      clerkId: 'clerk_adl56',
      email: 'adl56@example.com',
      isOwner: 0,
    };
    next();
  },
}));

vi.mock('../../services/shading.service.js', () => ({
  getAllCountryShading: async () => [],
  getCountryShading: async () => null,
  getRegionShading: async () => [],
  invalidateConfigCache: () => undefined,
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

async function seedUser(db: TestDb, id: string, clerkId: string) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id,
      clerkId,
      email: `${clerkId}@example.com`,
      isOwner: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
}

beforeEach(async () => {
  testDb = await createTestDb();
  mockUserId = USER_A_ID;
  await seedUser(testDb, USER_A_ID, 'clerk_adl56a');
  await seedUser(testDb, USER_B_ID, 'clerk_adl56b');
  await testDb
    .insert(schema.countries)
    .values({ countryCode: 'US', name: 'United States', regionTierEnabled: 1 })
    .onConflictDoNothing();
  const [oregon] = await testDb
    .insert(schema.regions)
    .values({ countryCode: 'US', name: 'Oregon', iso3166_2: 'US-OR' })
    .returning({ id: schema.regions.id });
  // The Newport, Oregon catalogue row from the PO's BUG-97 case, carrying the
  // OSM ref the real geocoder stamps on it (relation 186468 — captured
  // 2026-08-26, see services/__tests__/fixtures/nominatim/adl56/newport_us.json).
  await testDb.insert(schema.cities).values({
    name: 'Newport',
    countryCode: 'US',
    regionId: oregon.id,
    geocodeStatus: 'resolved',
    latitude: 44.636755,
    longitude: -124.053442,
    osmType: 'relation',
    osmId: 186468,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  testDb = null;
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 4, backend half.
// ═════════════════════════════════════════════════════════════════════════════
describe('[S1][RED-BAR] ADL-56 §9/D3-P2 — GET /api/cities search exposes the OSM identity pair', () => {
  it('returns osm_type and osm_id on a resolved catalogue row', async () => {
    const res = await supertest(app).get('/api/cities?q=Newport&country_codes=US');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    // The identity the frontend needs to collapse this row against its live
    // twin — matched by identity, never by name text (§5 P2).
    expect(res.body[0]).toMatchObject({ osm_type: 'relation', osm_id: 186468 });
  });

  it('returns them as NULL — present but empty — for a row that carries no OSM ref (the §2 H1 population)', async () => {
    // H1: legacy / pending / seeded rows have no osm ref. The field must be
    // PRESENT and null, not absent: the frontend has to distinguish "this row
    // cannot be identity-matched" from "this response never carried the field",
    // the same distinction `region_name` already documents on the City type.
    await testDb!.insert(schema.cities).values({
      name: 'Newportville',
      countryCode: 'US',
      geocodeStatus: 'pending',
      createdByUserId: USER_A_ID,
    });

    const res = await supertest(app).get('/api/cities?q=Newportville&country_codes=US');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('osm_type', null);
    expect(res.body[0]).toHaveProperty('osm_id', null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE GUARD (green on main) — §9 says the change is ADDITIVE. This is the
// assertion that makes "additive" mean something: every field the projection
// returns today must still be returned afterwards. Deliberately NOT inside the
// red block above — it passes on `main`, and a green test parked among reds is
// how a red bar quietly becomes decorative.
// ─────────────────────────────────────────────────────────────────────────────
describe('[S1][GUARD] the search projection change is additive — no existing field is dropped', () => {
  it('leaves every pre-existing projection field intact', async () => {
    const res = await supertest(app).get('/api/cities?q=Newport&country_codes=US');

    expect(res.body[0]).toMatchObject({
      name: 'Newport',
      country_code: 'US',
      region_name: 'Oregon',
      region_iso: 'US-OR',
      geocode_status: 'resolved',
    });
    expect(res.body[0].id).toEqual(expect.any(Number));
    expect(res.body[0].latitude).toBeCloseTo(44.636755, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE GUARDS (green on main) — the OP-06 line ADL-56 §9 states verbatim.
// These are NOT red; they exist so the field addition cannot quietly widen
// what the search returns to whom.
// ─────────────────────────────────────────────────────────────────────────────
describe('[S1][GUARD] the GE-16 creator-visibility containment predicate is unchanged', () => {
  it("another user's pending city stays invisible in this user's search", async () => {
    await testDb!.insert(schema.cities).values({
      name: 'Newporthaven',
      countryCode: 'US',
      geocodeStatus: 'pending',
      createdByUserId: USER_B_ID,
    });

    const res = await supertest(app).get('/api/cities?q=Newporthaven&country_codes=US');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('a resolved city is globally visible, and a NULL-creator pending city stays global (the F3 branch)', async () => {
    await testDb!.insert(schema.cities).values({
      name: 'Newportglobal',
      countryCode: 'US',
      geocodeStatus: 'pending',
      createdByUserId: null,
    });
    mockUserId = USER_B_ID;

    const resolved = await supertest(app).get('/api/cities?q=Newport&country_codes=US');
    expect(resolved.body.map((c: { name: string }) => c.name)).toContain('Newport');

    const globalPending = await supertest(app).get('/api/cities?q=Newportglobal&country_codes=US');
    expect(globalPending.body).toHaveLength(1);
  });
});

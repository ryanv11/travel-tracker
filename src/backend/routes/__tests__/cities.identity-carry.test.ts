/**
 * BUG-75 / UX-12 / GE-16 (v3.19) — city-identity carry channel, BACKEND layer.
 *
 * ATDD-first RED acceptance tests (OP-35 / ADL-50). Authored by QA BEFORE any
 * implementation exists; handed to Database/Backend as the executable definition
 * of done. These MUST be red now and go green only when the carry channel,
 * canonicalize-by-id, M-A stamp, M-B terminal state, and the twin-merge txn are
 * built per the v3 design + its delta review.
 *
 * ── Layer choice (the v1-review trap) ─────────────────────────────────────────
 * The v1 review's decisive finding: backend tests that INJECT osm_ids into a DB
 * double pass green over a feature the user can never trigger. This file avoids
 * BOTH halves of that trap:
 *   1. It does NOT mock geocoding.service.js away. geocoding.service (resolveCity,
 *      resolveCityName, classifyCandidates, and the not-yet-built resolveByOsmId)
 *      run FOR REAL through the actual POST /api/cities route — same pattern as
 *      the existing cities.f1f2-ruling.test.ts. Only the Nominatim EGRESS
 *      (nominatim-client.js) is mocked, with a controllable fake.
 *   2. The carried {osm_type, osm_id, display_name, region_id} arrives through the
 *      REAL request body and REAL CreateCitySchema — exactly the channel the
 *      frontend CityPicker will use. Nothing is hand-inserted into the DB to
 *      manufacture a pre-chosen identity for the create path under test.
 * The user-TRIGGERABILITY half (does the picker fire and carry the pick?) lives at
 * the frontend layer — AddPlaceFlow.city-picker.test.tsx. Coexistence #1 and
 * ask-to-choose #4 are proven on BOTH sides; this file proves the backend half.
 *
 * ── Mock fidelity (QUAL-22 — why this is on the top model) ─────────────────────
 * The D-17 trial went green for the wrong reason: a geocoder mock omitted a
 * function the route called, the route's try/catch swallowed the TypeError, and
 * tests passed without exercising anything. This file's mock of nominatim-client
 * exports EVERY function the real module exports (nominatimSearch, the
 * not-yet-built nominatimLookup, __resetChokepointForTests) and each returns a
 * real NominatimSearchResult-shaped value. The `mock fidelity` describe block
 * below MECHANICALLY asserts the mock's function-export set is a superset of the
 * real module's, so the day the implementer adds nominatimLookup to the real
 * client, an omission here fails loudly instead of passing vacuously.
 */

import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';
import type { NominatimSearchResult } from '../../services/nominatim-client.js';

const USER_A_ID = 'user-bug75-a-0000-0000-0000-000000000000';
const USER_B_ID = 'user-bug75-b-0000-0000-0000-000000000000';

let testDb: TestDb | null = null;
let mockUserId = USER_A_ID;

// Controllable egress fakes. `nextSearchResult` drives nominatimSearch (the
// existing name-search path); `lookupResultFor` drives the not-yet-built
// nominatimLookup (/lookup?osm_ids=) keyed by the requested type-prefixed id
// (e.g. 'N26700977'), falling back to `defaultLookupResult`. Both return the
// SAME NominatimSearchResult contract the real client returns.
let nextSearchResult: NominatimSearchResult = { status: 'ok', candidates: [] };
let lookupResultFor: Record<string, NominatimSearchResult> = {};
let defaultLookupResult: NominatimSearchResult = { status: 'ok', candidates: [] };
/** Every osm_ids arg nominatimLookup was called with — proves it is exercised. */
let lookupCalls: string[][] = [];

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
      clerkId: 'clerk_bug75',
      email: 'bug75@example.com',
      isOwner: 0,
    };
    next();
  },
}));

// The ONLY geocoding-adjacent mock — a controllable fake at the Nominatim egress
// chokepoint. geocoding.service (resolveCity/resolveCityName/classifyCandidates/
// resolveByOsmId) runs for real. Exports the FULL real surface (QUAL-22).
vi.mock('../../services/nominatim-client.js', () => ({
  nominatimSearch: vi.fn(async () => nextSearchResult),
  // Not-yet-built in the real client. Modelled against the v3 design §B1: takes a
  // type-prefixed osm_ids array, returns a NominatimSearchResult (ok/disabled/
  // error). Behaves like the real chokepoint contract so resolveByOsmId can run.
  nominatimLookup: vi.fn(async (osmIds: string[]) => {
    lookupCalls.push(osmIds);
    for (const id of osmIds) {
      if (id in lookupResultFor) return lookupResultFor[id];
    }
    return defaultLookupResult;
  }),
  __resetChokepointForTests: vi.fn(() => undefined),
}));

vi.mock('../../services/shading.service.js', () => ({
  getAllCountryShading: async () => [],
  getCountryShading: async () => null,
  getRegionShading: async () => [],
  invalidateConfigCache: () => undefined,
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

// ── candidate builders — RawNominatimResult-faithful via the client's parsed shape ──
/** A parsed NominatimCandidate as the real client would emit it. */
function candidate(overrides: {
  name?: string;
  osmType?: 'node' | 'way' | 'relation';
  osmId?: number;
  displayName?: string;
  lat?: number;
  lon?: number;
  countryCode?: string | null;
  regionIso?: string | null;
  type?: string;
}) {
  return {
    displayName: overrides.displayName ?? `${overrides.name ?? 'Testville'}, Test Country`,
    name: overrides.name ?? 'Testville',
    latitude: overrides.lat ?? 1,
    longitude: overrides.lon ?? 1,
    countryCode: overrides.countryCode ?? 'GB',
    regionIso: overrides.regionIso ?? null,
    class: 'place',
    type: overrides.type ?? 'city',
    // Carried identity — the fields the design adds to NominatimCandidate.
    osmType: overrides.osmType ?? 'node',
    osmId: overrides.osmId ?? 1,
  };
}

// The two same-region Newports — the real unhandled case (v3 §1.2): both GB-ENG,
// distinct osm_ids. Isle of Wight vs Telford and Wrekin.
const NEWPORT_IOW = {
  osmType: 'node' as const,
  osmId: 26700978,
  name: 'Newport',
  displayName: 'Newport, Isle of Wight, England, PO30 1JU, UK',
  countryCode: 'GB',
  regionIso: 'GB-ENG',
  lat: 50.7,
  lon: -1.29,
};
const NEWPORT_TELFORD = {
  osmType: 'node' as const,
  osmId: 27459103,
  name: 'Newport',
  displayName: 'Newport, Telford and Wrekin, England, TF10 7AG, UK',
  countryCode: 'GB',
  regionIso: 'GB-ENG',
  lat: 52.77,
  lon: -2.38,
};

async function seedUser(db: TestDb, id: string) {
  const now = new Date();
  await db
    .insert(schema.users)
    .values({
      id,
      clerkId: `clerk_${id}`,
      email: `${id}@example.com`,
      isOwner: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

async function seedGb(db: TestDb) {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'GB', name: 'United Kingdom', regionTierEnabled: 1 })
    .onConflictDoNothing();
}

async function seedRegion(db: TestDb, name: string, iso: string): Promise<number> {
  const [r] = await db
    .insert(schema.regions)
    .values({ countryCode: 'GB', name, iso3166_2: iso })
    .returning({ id: schema.regions.id });
  return r.id;
}

/** Read the raw osm_id column off a city row (column does not exist yet → RED). */
async function osmIdOf(db: TestDb, cityId: number): Promise<unknown> {
  const rows = await db.all(sql`SELECT osm_id FROM cities WHERE id = ${cityId}`);
  return (rows[0] as { osm_id?: unknown })?.osm_id ?? null;
}

beforeEach(async () => {
  testDb = await createTestDb();
  vi.stubEnv('GEOCODING_ENABLED', 'true');
  mockUserId = USER_A_ID;
  nextSearchResult = { status: 'ok', candidates: [] };
  lookupResultFor = {};
  defaultLookupResult = { status: 'ok', candidates: [] };
  lookupCalls = [];
  await seedUser(testDb, USER_A_ID);
  await seedUser(testDb, USER_B_ID);
  await seedGb(testDb);
});

afterEach(() => {
  testDb = null;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// MOCK FIDELITY (QUAL-22) — mechanical gate, not a comment.
// ────────────────────────────────────────────────────────────────────────────
describe('BUG-75 mock fidelity — the nominatim-client double covers the real surface', () => {
  it('exports a function for every function the REAL nominatim-client exports (no omitted method the route could call and have swallowed)', async () => {
    const realModule = await vi.importActual<typeof import('../../services/nominatim-client.js')>(
      '../../services/nominatim-client.js',
    );
    const mockedModule = await import('../../services/nominatim-client.js');

    const realFnExports = Object.entries(realModule)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .sort();
    const mockFnExports = Object.entries(mockedModule)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k);

    for (const name of realFnExports) {
      expect(
        mockFnExports,
        `mock is missing real export "${name}" — a route calling it would hit a TypeError the try/catch swallows (D-17 vacuous-green)`,
      ).toContain(name);
    }
  });

  it('nominatimLookup, once built, is REACHED by the carried-id create path (proves the double is not dead code)', async () => {
    // A carried osm_id create MUST cause the server to canonicalize by /lookup
    // (v3 §B1). If the implementation never calls nominatimLookup, lookupCalls
    // stays empty and this fails — the exact "mock present but never exercised"
    // hole QUAL-22 is about.
    const coId = await seedRegion(testDb!, 'England', 'GB-ENG');
    lookupResultFor[`N${NEWPORT_IOW.osmId}`] = {
      status: 'ok',
      candidates: [candidate(NEWPORT_IOW)],
    };

    await supertest(app).post('/api/cities').send({
      name: 'Newport',
      country_code: 'GB',
      region_id: coId,
      osm_type: 'node',
      osm_id: NEWPORT_IOW.osmId,
      display_name: NEWPORT_IOW.displayName,
    });

    expect(
      lookupCalls.flat(),
      'the carried-id create path never called nominatimLookup — canonicalize-by-id (v3 §B1) is not wired',
    ).toContain(`N${NEWPORT_IOW.osmId}`);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Criterion #1 — Coexistence (two distinct real places, same name+country+region)
// ────────────────────────────────────────────────────────────────────────────
describe('BUG-75 #1 coexistence — two same-region Newports (distinct osm_id) both persist', () => {
  it('creating Newport(IoW) then Newport(Telford), both GB-ENG, yields TWO distinct cities carrying their own osm_id', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    lookupResultFor[`N${NEWPORT_IOW.osmId}`] = {
      status: 'ok',
      candidates: [candidate(NEWPORT_IOW)],
    };
    lookupResultFor[`N${NEWPORT_TELFORD.osmId}`] = {
      status: 'ok',
      candidates: [candidate(NEWPORT_TELFORD)],
    };

    const res1 = await supertest(app).post('/api/cities').send({
      name: 'Newport',
      country_code: 'GB',
      region_id: engId,
      osm_type: 'node',
      osm_id: NEWPORT_IOW.osmId,
      display_name: NEWPORT_IOW.displayName,
    });
    expect([200, 201]).toContain(res1.status);

    const res2 = await supertest(app).post('/api/cities').send({
      name: 'Newport',
      country_code: 'GB',
      region_id: engId,
      osm_type: 'node',
      osm_id: NEWPORT_TELFORD.osmId,
      display_name: NEWPORT_TELFORD.displayName,
    });
    expect([200, 201]).toContain(res2.status);

    // Two DISTINCT rows — the global (name,country,region) unique index that
    // used to forbid this must be gone (F2 SWITCH stage), and each row carries
    // its own osm_id.
    expect(res2.body.id).not.toBe(res1.body.id);

    const newports = await testDb!
      .select({ id: schema.cities.id })
      .from(schema.cities)
      .where(
        and(
          sql`${schema.cities.name} = 'Newport' COLLATE NOCASE`,
          eq(schema.cities.countryCode, 'GB'),
          eq(schema.cities.regionId, engId),
        ),
      );
    expect(newports).toHaveLength(2);

    expect(await osmIdOf(testDb!, res1.body.id)).toBe(NEWPORT_IOW.osmId);
    expect(await osmIdOf(testDb!, res2.body.id)).toBe(NEWPORT_TELFORD.osmId);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Criterion #2 — Same-place merge (same osm_id repeat → existing row, no new row)
// ────────────────────────────────────────────────────────────────────────────
describe('BUG-75 #2 same-place merge — a repeat of the SAME osm_id reuses the existing row', () => {
  it('adding the same Newport(IoW) twice returns the same city id and creates no second row', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    lookupResultFor[`N${NEWPORT_IOW.osmId}`] = {
      status: 'ok',
      candidates: [candidate(NEWPORT_IOW)],
    };

    const body = {
      name: 'Newport',
      country_code: 'GB',
      region_id: engId,
      osm_type: 'node' as const,
      osm_id: NEWPORT_IOW.osmId,
      display_name: NEWPORT_IOW.displayName,
    };

    const first = await supertest(app).post('/api/cities').send(body);
    expect(first.status).toBe(201);

    const second = await supertest(app).post('/api/cities').send(body);
    // Same real place → reuse, not a new row.
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const all = await testDb!
      .select({ id: schema.cities.id })
      .from(schema.cities)
      .where(sql`${schema.cities.name} = 'Newport' COLLATE NOCASE`);
    expect(all).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Criterion #3 — M-A: stamp osm_id on EVERY resolve (the delta-review regression)
// ────────────────────────────────────────────────────────────────────────────
describe('BUG-75 #3 M-A — a non-ambiguous city resolved by two users merges to ONE osm_id-stamped row', () => {
  it('a single non-carried, non-ambiguous resolve STAMPS the winning candidate osm_id (v2 §7 rule 2c)', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    // Single, unambiguous candidate carrying its osm identity — the name-search
    // path (no carried pick, picker never fires) must stamp it.
    nextSearchResult = {
      status: 'ok',
      candidates: [
        candidate({ ...NEWPORT_IOW, name: 'Bristol', regionIso: 'GB-ENG', osmId: 987654 }),
      ],
    };

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Bristol', country_code: 'GB', region_id: engId });
    expect(res.status).toBe(201);
    expect(res.body.geocode_status).toBe('resolved');

    // The core of M-A: a freshly-resolved NON-carried row is NOT a NULL-osm_id
    // row (v3's dropped stamp). It must carry the candidate's osm_id.
    expect(await osmIdOf(testDb!, res.body.id)).toBe(987654);
  });

  it('two users adding the same non-ambiguous city end with ONE resolved row carrying osm_id — never two NULL-osm_id duplicates', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    nextSearchResult = {
      status: 'ok',
      candidates: [candidate({ name: 'Bath', regionIso: 'GB-ENG', osmType: 'node', osmId: 55555 })],
    };

    mockUserId = USER_A_ID;
    const a = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Bath', country_code: 'GB', region_id: engId });
    expect([200, 201]).toContain(a.status);

    mockUserId = USER_B_ID;
    const b = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Bath', country_code: 'GB', region_id: engId });
    expect([200, 201]).toContain(b.status);

    // Invariant (M-A definition of done): exactly one resolved row for this real
    // place, carrying a non-null osm_id; zero NULL-osm_id resolved duplicates.
    const resolved = await testDb!
      .select({ id: schema.cities.id })
      .from(schema.cities)
      .where(
        and(
          sql`${schema.cities.name} = 'Bath' COLLATE NOCASE`,
          eq(schema.cities.countryCode, 'GB'),
          eq(schema.cities.geocodeStatus, 'resolved'),
        ),
      );
    expect(resolved).toHaveLength(1);
    expect(await osmIdOf(testDb!, resolved[0].id)).toBe(55555);

    const nullOsmResolved = await testDb!.all(
      sql`SELECT id FROM cities WHERE name = 'Bath' COLLATE NOCASE AND geocode_status = 'resolved' AND osm_id IS NULL`,
    );
    expect(nullOsmResolved).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Criterion #5 — M-B: /lookup returns zero rows for a carried id → defined terminal state
// ────────────────────────────────────────────────────────────────────────────
describe('BUG-75 #5 M-B — a carried id whose /lookup returns zero rows lands in a defined state (never 500, never a wrong unresolvable)', () => {
  it('create with a carried osm_id whose /lookup is 200-empty does NOT 500; it degrades to a pending row that retains the carried ref (self-heals on retry)', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    // Stale/deleted/reclassified OSM object: HTTP 200, zero candidates → NOT
    // 'error'/'disabled' (that is the offline case) but an empty ok.
    lookupResultFor.N99999999 = { status: 'ok', candidates: [] };

    const res = await supertest(app).post('/api/cities').send({
      name: 'Ghosttown',
      country_code: 'GB',
      region_id: engId,
      osm_type: 'node',
      osm_id: 99999999,
      display_name: 'Ghosttown, England, UK',
    });

    // Must be a defined success, not an unhandled 500.
    expect(res.status).not.toBe(500);
    expect([200, 201]).toContain(res.status);
    // Design M-B create-path choice: pending, so a transient reclassification
    // self-heals — NOT terminal 'unresolvable' on the create path.
    expect(res.body.geocode_status).toBe('pending');
    // The carried ref is retained so a retry can canonicalize it.
    expect(await osmIdOf(testDb!, res.body.id)).toBe(99999999);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Criterion #6 — Concurrency (M1/F3): concurrent same-place adds merge, never 500
// ────────────────────────────────────────────────────────────────────────────
describe('BUG-75 #6 concurrency (M1/F3) — two concurrent same-osm_id creates merge to one row, never 500', () => {
  it('two POSTs for the same carried osm_id fired concurrently resolve to a single row; the loser is a caught-violation reuse, not a crash', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    lookupResultFor[`N${NEWPORT_IOW.osmId}`] = {
      status: 'ok',
      candidates: [candidate(NEWPORT_IOW)],
    };
    const body = {
      name: 'Newport',
      country_code: 'GB',
      region_id: engId,
      osm_type: 'node' as const,
      osm_id: NEWPORT_IOW.osmId,
      display_name: NEWPORT_IOW.displayName,
    };

    const [r1, r2] = await Promise.all([
      supertest(app).post('/api/cities').send(body),
      supertest(app).post('/api/cities').send(body),
    ]);

    expect(r1.status).not.toBe(500);
    expect(r2.status).not.toBe(500);
    expect([200, 201]).toContain(r1.status);
    expect([200, 201]).toContain(r2.status);
    // Both converge on the same id.
    expect(r1.body.id).toBe(r2.body.id);

    const all = await testDb!
      .select({ id: schema.cities.id })
      .from(schema.cities)
      .where(sql`${schema.cities.name} = 'Newport' COLLATE NOCASE`);
    expect(all).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Criterion #7 — Pending/GE-16 carry-overs (containment, no client coords, D12, access)
// ────────────────────────────────────────────────────────────────────────────
describe('BUG-75 #7 carry-overs — containment, no client coords, D12 rule 3, access matrix', () => {
  it('no client-supplied coordinates are accepted: latitude/longitude in the POST body are rejected by the strict schema', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    // Only valid fields + coords — so the 400 is unambiguously about the coords,
    // not about the (separately-tested) osm carry fields. Client must NOT be
    // trusted for coordinates (v3 §2.3 — the server re-derives them).
    const res = await supertest(app).post('/api/cities').send({
      name: 'Newport',
      country_code: 'GB',
      region_id: engId,
      latitude: 0.0,
      longitude: 0.0,
    });
    expect(res.status).toBe(400);
  });

  it('the stored coordinates come from the SERVER lookup, not any client value', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    lookupResultFor[`N${NEWPORT_IOW.osmId}`] = {
      status: 'ok',
      candidates: [candidate(NEWPORT_IOW)],
    };
    const res = await supertest(app).post('/api/cities').send({
      name: 'Newport',
      country_code: 'GB',
      region_id: engId,
      osm_type: 'node',
      osm_id: NEWPORT_IOW.osmId,
      display_name: NEWPORT_IOW.displayName,
    });
    expect([200, 201]).toContain(res.status);
    // Server-canonical coords from the /lookup response.
    expect(res.body.latitude).toBeCloseTo(NEWPORT_IOW.lat);
    expect(res.body.longitude).toBeCloseTo(NEWPORT_IOW.lon);
  });

  it('D12 rule 3: the user-selected region_id is never overwritten by the lookup', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    // Lookup canonical says GB-ENG; user submitted engId. Even if the lookup
    // carried a different region, the request's region_id is ground truth.
    lookupResultFor[`N${NEWPORT_IOW.osmId}`] = {
      status: 'ok',
      candidates: [candidate({ ...NEWPORT_IOW, regionIso: 'GB-WLS' })],
    };
    const res = await supertest(app).post('/api/cities').send({
      name: 'Newport',
      country_code: 'GB',
      region_id: engId,
      osm_type: 'node',
      osm_id: NEWPORT_IOW.osmId,
      display_name: NEWPORT_IOW.displayName,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.region_id).toBe(engId);
  });

  it('pending containment holds: a pending row created by user A is invisible in user B search, visible to A', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    // Force a pending outcome: offline lookup for the carried id.
    lookupResultFor.N424242 = { status: 'disabled' };
    defaultLookupResult = { status: 'disabled' };
    nextSearchResult = { status: 'disabled' };

    mockUserId = USER_A_ID;
    const created = await supertest(app).post('/api/cities').send({
      name: 'Hiddenton',
      country_code: 'GB',
      region_id: engId,
      osm_type: 'node',
      osm_id: 424242,
      display_name: 'Hiddenton, England, UK',
    });
    expect([200, 201]).toContain(created.status);
    expect(created.body.geocode_status).toBe('pending');

    mockUserId = USER_B_ID;
    const bSearch = await supertest(app).get('/api/cities?q=Hiddenton');
    expect(bSearch.body.map((c: { id: number }) => c.id)).not.toContain(created.body.id);

    mockUserId = USER_A_ID;
    const aSearch = await supertest(app).get('/api/cities?q=Hiddenton');
    expect(aSearch.body.map((c: { id: number }) => c.id)).toContain(created.body.id);
  });

  it('access: a NON-owner CAN create a city (POST is not owner-gated) — no 403', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    nextSearchResult = {
      status: 'ok',
      candidates: [candidate({ name: 'Leeds', regionIso: 'GB-ENG', osmId: 71717 })],
    };
    mockUserId = USER_A_ID; // isOwner: 0
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Leeds', country_code: 'GB', region_id: engId });
    expect(res.status).not.toBe(403);
    expect([200, 201]).toContain(res.status);
  });

  it('access: a NON-owner PATCH /api/cities/:id (curation) is still 403', async () => {
    const engId = await seedRegion(testDb!, 'England', 'GB-ENG');
    const [city] = await testDb!
      .insert(schema.cities)
      .values({
        name: 'Manchester',
        countryCode: 'GB',
        regionId: engId,
        geocodeStatus: 'resolved',
      })
      .returning();

    mockUserId = USER_A_ID; // isOwner: 0
    const res = await supertest(app).patch(`/api/cities/${city.id}`).send({ region_id: engId });
    expect(res.status).toBe(403);
  });
});

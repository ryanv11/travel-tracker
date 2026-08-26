/**
 * ADL-56 / GE-21 (BRD v3.22) — Slice 1 RED acceptance bar: §10 test **5**
 * (D4/N5), the region backfill, CREATE-PATH write site.
 *
 * The companion write site — `commitResolvedOrMerge` on the background
 * resolver — is pinned in
 * `src/backend/services/__tests__/geocoding.adl56-region-backfill.test.ts`,
 * including N5's merge-branch exclusion. §6b names BOTH sites; splitting them
 * across two files is only because they need different module doubles (this
 * one keeps `resolveCityName` REAL and doubles `fetch`; the other doubles the
 * nominatim client to drive `resolveCity`'s branches).
 *
 * ATDD-first (OP-35): authored BEFORE any implementer is briefed.
 *
 * ── THE BUG (BUG-98) ─────────────────────────────────────────────────────────
 * Melbourne saved as "Australia, no state set" although the geocoder
 * unambiguously knew the region. `routes/cities.ts:191` inserts
 * `regionId: region_id ?? null` — the user left it blank, so the row is created
 * region-null even though the resolve returned a single distinct `region_iso`.
 * D4: backfilling a NULL is not overwriting a user value — D12 rule-3 protects
 * a SUPPLIED region, and NULL is the absence of one (PO confirmed 2026-08-11,
 * recorded in ADL-46 §4.3.1).
 *
 * ── N5(b), THE PRECISION THAT DECIDES THIS TEST ──────────────────────────────
 * `classifyCandidates` returns `best = eligible[0]` (`geocoding.service.ts:192`),
 * and `eligible[0]` CAN carry a NULL `region_iso` while the resolve is still
 * region-unambiguous. A backfill that reads `best.regionIso` silently misses
 * that case; one that derives from the single distinct non-null `region_iso`
 * across `eligible` does not. The last test in the red block below is the only
 * assertion that separates the two implementations, so it is the one that
 * matters most.
 *
 * ── MOCK FIDELITY (QUAL-22) ──────────────────────────────────────────────────
 * Same boundary as `cities.resolve-then-create.test.ts` (QUAL-21's F4 fix):
 * `resolveCityName`, `classifyCandidates`, `isAcceptedSettlement` and
 * `nominatimSearch` all run FOR REAL against a REAL captured Nominatim response
 * loaded verbatim off disk; only `global.fetch` (the actual egress boundary),
 * the DB handle, auth, and `resolveCity`'s fire-and-forget background re-check
 * are doubled. A mocked `resolveCityName` cannot tell a correctly-wired
 * backfill from one wired to a broken resolver, because the verdict would
 * already be pre-decided by the mock.
 *
 * Fixture: `services/__tests__/fixtures/nominatim/adl56/melbourne_au.json` —
 * captured live 2026-08-26 with production's exact params. Three raw rows; the
 * `suburb` row is rejected by the real admission gate, leaving the `city`
 * relation (4246124) and the `municipality` relation (2404870), BOTH carrying
 * `AU-VIC`. That is precisely the ADL-56 §6a shape: two distinct osm_ids (so
 * the frontend picker fires) but ONE distinct region_iso (so the resolve is
 * region-unambiguous and the backfill is correct).
 *
 * ── RED-BAR CARRIAGE ─────────────────────────────────────────────────────────
 * Committed `describe.skip` with a RED-BAR marker per the GE-19/ADL-55
 * convention; run un-skipped before commit, observed failures recorded in
 * `jobs/qa/tech/20260826-ADL56-slice1-red-bar.md`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';
import { __resetChokepointForTests } from '../../services/nominatim-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MELBOURNE_FIXTURE = path.join(
  __dirname,
  '../../services/__tests__/fixtures/nominatim/adl56/melbourne_au.json',
);

const USER_ID = 'user-adl56d4-0000-0000-0000-000000000000';

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
      id: USER_ID,
      clerkId: 'clerk_adl56d4',
      email: 'adl56d4@example.com',
      isOwner: 0,
    };
    next();
  },
}));

// resolveCityName / classifyCandidates stay REAL — only the fire-and-forget
// background re-resolution is neutralised, exactly as QUAL-21's suite does, so
// it cannot race this file's fetch-count and row assertions.
vi.mock('../../services/geocoding.service.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/geocoding.service.js')>();
  return { ...real, resolveCity: async () => undefined };
});

vi.mock('../../services/shading.service.js', () => ({
  getAllCountryShading: async () => [],
  getCountryShading: async () => null,
  getRegionShading: async () => [],
  invalidateConfigCache: () => undefined,
}));

const { default: app } = await import('../../server-test-app.js');
const supertest = (await import('supertest')).default;

/** The raw captured Melbourne response, unmodified. */
function melbourneRaw(): unknown[] {
  return JSON.parse(readFileSync(MELBOURNE_FIXTURE, 'utf-8'));
}

/**
 * N5(b) — the same REAL capture with the `ISO3166-2-lvl4` key DELETED from the
 * first accepted row (the `city` relation), and nothing else changed.
 *
 * This is a DERIVED fixture, not a captured one, and it is derived here in the
 * test source rather than committed as a JSON file so a reader cannot mistake
 * it for upstream ground truth. Two things justify the derivation:
 *   • The shape is reachable in production by construction — `parseCandidate`
 *     reads `regionIso` as `raw.address?.['ISO3166-2-lvl4'] ?? null`
 *     (`nominatim-client.ts`), Nominatim's ranking decides which row lands at
 *     index 0 independently of whether that row carries the key, and real
 *     responses DO contain accepted rows without it (four of the 31 accepted
 *     rows in the pre-existing `springfield_global.json` capture lack it).
 *   • It is UNVERIFIED at position 0 in the wild: across 23 live captures made
 *     while authoring this bar (15 countries), no response put a key-less row
 *     first. Probe run: `q=<name>&countrycodes=<cc>&limit=10&format=json&
 *     addressdetails=1` for each; blind spot: a small, English-biased sample of
 *     well-known cities. So the frequency is unknown; the reachability is not.
 * ADL-56 §6b(2) names this exact shape as the derivation hazard, so it is
 * pinned regardless of how often upstream produces it.
 */
function melbourneFirstRowMissingRegionIso(): unknown[] {
  const rows = melbourneRaw() as { addresstype?: string; address?: Record<string, unknown> }[];
  const firstAccepted = rows.find((r) => r.addresstype === 'city');
  if (!firstAccepted?.address) {
    throw new Error('[TEST] Melbourne fixture shape changed — no accepted `city` row with address');
  }
  delete firstAccepted.address['ISO3166-2-lvl4'];
  return rows;
}

function stubFetchWith(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }),
  );
}

async function seedAu(db: TestDb, opts: { seedVictoria?: boolean } = {}) {
  const { seedVictoria = true } = opts;
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: USER_ID,
      clerkId: 'clerk_adl56d4',
      email: 'adl56d4@example.com',
      isOwner: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
  await db
    .insert(schema.countries)
    .values({ countryCode: 'AU', name: 'Australia', regionTierEnabled: 1 })
    .onConflictDoNothing();
  const regionValues = [{ countryCode: 'AU', name: 'New South Wales', iso3166_2: 'AU-NSW' }];
  if (seedVictoria)
    regionValues.unshift({ countryCode: 'AU', name: 'Victoria', iso3166_2: 'AU-VIC' });
  const inserted = await db
    .insert(schema.regions)
    .values(regionValues)
    .returning({ id: schema.regions.id, iso: schema.regions.iso3166_2 });
  return Object.fromEntries(inserted.map((r) => [r.iso, r.id])) as Record<string, number>;
}

async function melbourneRows(db: TestDb) {
  return db
    .select()
    .from(schema.cities)
    .where(and(eq(schema.cities.countryCode, 'AU'), eq(schema.cities.name, 'Melbourne')));
}

beforeEach(async () => {
  testDb = await createTestDb();
  __resetChokepointForTests();
  vi.stubEnv('GEOCODING_ENABLED', 'true');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  testDb = null;
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 5 / §6b, create-path write site.
// ═════════════════════════════════════════════════════════════════════════════
describe('[S1][RED-BAR] ADL-56 test 5 — POST /api/cities backfills a blank region from an unambiguous resolve', () => {
  it('a region-tier country with the region left blank is saved carrying the resolved region', async () => {
    const db = testDb!;
    const regions = await seedAu(db);
    stubFetchWith(melbourneRaw());

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Melbourne', country_code: 'AU' }); // region deliberately omitted

    expect(res.status).toBe(201);
    expect(res.body.geocode_status).toBe('resolved');
    // GE-21's last success criterion, and the whole of BUG-98: not
    // "Australia (no state set)".
    expect(res.body.region_id).toBe(regions['AU-VIC']);

    const rows = await melbourneRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].regionId).toBe(regions['AU-VIC']);
  });

  it('N5(b) — backfills from the single distinct ELIGIBLE region_iso, not from best.regionIso', async () => {
    // `best = eligible[0]` carries a NULL region_iso here, while the OTHER
    // eligible candidate carries the single distinct 'AU-VIC'. A backfill
    // derived from `best.regionIso` reads null and silently skips; one derived
    // from `distinctRegionIsos(eligible)` (length 1) still backfills. This
    // assertion is the ONLY thing in the suite that tells those two
    // implementations apart.
    const db = testDb!;
    const regions = await seedAu(db);
    stubFetchWith(melbourneFirstRowMissingRegionIso());

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Melbourne', country_code: 'AU' });

    expect(res.status).toBe(201);
    expect(res.body.geocode_status).toBe('resolved');
    expect(res.body.region_id).toBe(regions['AU-VIC']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE GUARDS (green on main) — the two ways D4 could go WRONG. Neither is a
// red bar; both must survive the build unchanged, and both are the reason D4
// is a refinement of D12 rule-3 rather than an exception to it.
// ─────────────────────────────────────────────────────────────────────────────
describe('[S1][GUARD] D12 rule-3 and the GE-15 best-effort fallback are preserved', () => {
  it('an explicitly SUPPLIED region is never overwritten by the resolve', async () => {
    const db = testDb!;
    const regions = await seedAu(db);
    stubFetchWith(melbourneRaw());

    // The user says New South Wales; the geocoder says Victoria. D12 rule-3:
    // the user has ground truth about where they went. The row keeps NSW.
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Melbourne', country_code: 'AU', region_id: regions['AU-NSW'] });

    expect([200, 201]).toContain(res.status);
    expect(res.body.region_id).toBe(regions['AU-NSW']);

    const rows = await melbourneRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].regionId).toBe(regions['AU-NSW']);
  });

  it('an UNSEEDED resolved region leaves region_id NULL and still creates the city (BUG-30 class)', async () => {
    const db = testDb!;
    await seedAu(db, { seedVictoria: false });
    stubFetchWith(melbourneRaw());

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Melbourne', country_code: 'AU' });

    // Best-effort, never blocking — identical graceful fallback to the
    // frontend's (§6, GE-15 parity).
    expect(res.status).toBe(201);
    expect(res.body.region_id).toBeNull();
    const rows = await melbourneRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].geocodeStatus).toBe('resolved');
  });
});

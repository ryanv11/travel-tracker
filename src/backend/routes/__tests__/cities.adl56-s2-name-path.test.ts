/**
 * ADL-56 / GE-21 (BRD v3.22) — **SLICE 2** specification, plus the live
 * tripwire that keeps the Slice-1 → Slice-2 interim from going quiet.
 *
 * Covers ADL-56 §10 tests **2** (D2, backend name-path defense-in-depth) and
 * the BACKEND half of test **3** (the shared golden-fixture set). Both are
 * `[S2]` — they are NOT part of the Slice-1 red bar and must NOT be un-skipped
 * by a Slice-1 implementer.
 *
 * ── WHY THESE ARE HERE AT ALL, RATHER THAN OMITTED ───────────────────────────
 * GE-21's stamped interim (BRD v3.22; ADL-56 §10a) says the frontend and
 * backend apply one identical ambiguity definition only after Slice 2. Until
 * then, a bare plain-name create reaching the backend OUTSIDE the frontend
 * surface — an offline queue replay, a direct API call — can still resolve to
 * `eligible[0]` without disambiguating.
 *
 * That creates a specific hazard the COO named in the dispatch brief: after
 * Slice 1 ships, "the backend name-path still silently resolves an ambiguous
 * plain name" is simultaneously the DOCUMENTED INTERIM and exactly what a
 * mock-fidelity failure would look like. From a green board the two are
 * indistinguishable, and that is how an interim quietly becomes permanent.
 *
 * ── HOW THAT IS ANSWERED HERE (two mechanisms, deliberately) ─────────────────
 * 1. **The `[S2]` specs below, skipped.** They keep Slice 2's definition of
 *    done in the suite output as PENDING rather than absent, so the gap is
 *    visible in every run's skipped list, not merely in a document.
 * 2. **The live INTERIM TRIPWIRE at the bottom, un-skipped.** It asserts
 *    today's interim behaviour and is GREEN. It exists to fail LOUDLY the
 *    moment Slice 2 lands — because at that point the interim it encodes is
 *    over, and closing it out means someone must delete this block and
 *    re-stamp the §10a / BRD v3.22 interim as closed. A skipped test can be
 *    ignored forever; a green test that turns red cannot.
 *    A skipped marker records an intention. The tripwire creates an obligation.
 *
 * ── MOCK FIDELITY (QUAL-22) ──────────────────────────────────────────────────
 * Real DB from real migrations; REAL `nominatimSearch`, REAL admission gate,
 * REAL `classifyCandidates`, REAL `resolveCityName`. Only `global.fetch`, the
 * DB handle, auth and the fire-and-forget `resolveCity` are doubled. The
 * candidates are the GB-ENG subset of a REAL captured Nominatim response
 * (`fixtures/nominatim/adl56/newport_gb.json`, captured 2026-08-26) — the two
 * same-region Newports (Isle of Wight node 2386521, Telford and Wrekin node
 * 27459103) that ADL-56 §1 names as the case region-level distinctness misses.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';
import { classifyCandidates } from '../../services/geocoding.service.js';
import type { NominatimCandidate } from '../../services/nominatim-client.js';
import { __resetChokepointForTests } from '../../services/nominatim-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEWPORT_GB_FIXTURE = path.join(
  __dirname,
  '../../services/__tests__/fixtures/nominatim/adl56/newport_gb.json',
);

const USER_ID = 'user-adl56s2-0000-0000-0000-000000000000';

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
      clerkId: 'clerk_adl56s2',
      email: 'adl56s2@example.com',
      isOwner: 0,
    };
    next();
  },
}));

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

/**
 * The GB-ENG subset of the real captured `q=Newport&countrycodes=gb` response:
 * Isle of Wight (node 2386521) and Telford and Wrekin (node 27459103). Two
 * DISTINCT real places, ONE region_iso — the exact shape region-level
 * distinctness cannot see. A filtered subset of captured data, never
 * hand-written rows.
 */
function sameRegionNewportsRaw(): unknown[] {
  const rows = readFileSync(NEWPORT_GB_FIXTURE, 'utf-8');
  const parsed = JSON.parse(rows) as {
    addresstype?: string;
    address?: Record<string, unknown>;
  }[];
  const subset = parsed.filter(
    (r) => r.addresstype === 'town' && r.address?.['ISO3166-2-lvl4'] === 'GB-ENG',
  );
  if (subset.length !== 2) {
    throw new Error(
      `[TEST] Expected exactly 2 GB-ENG town rows in the captured Newport fixture, got ${subset.length}`,
    );
  }
  return subset;
}

function stubFetchWith(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }),
  );
}

async function seedGb(db: TestDb) {
  const now = Date.now();
  await db
    .insert(schema.users)
    .values({
      id: USER_ID,
      clerkId: 'clerk_adl56s2',
      email: 'adl56s2@example.com',
      isOwner: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing();
  await db
    .insert(schema.countries)
    .values({ countryCode: 'GB', name: 'United Kingdom', regionTierEnabled: 1 })
    .onConflictDoNothing();
  await db
    .insert(schema.regions)
    .values({ countryCode: 'GB', name: 'England', iso3166_2: 'GB-ENG' })
    .onConflictDoNothing();
}

async function newportRows(db: TestDb) {
  return db
    .select()
    .from(schema.cities)
    .where(and(eq(schema.cities.countryCode, 'GB'), eq(schema.cities.name, 'Newport')));
}

beforeEach(async () => {
  testDb = await createTestDb();
  __resetChokepointForTests();
  vi.stubEnv('GEOCODING_ENABLED', 'true');
  await seedGb(testDb);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  testDb = null;
});

// ═════════════════════════════════════════════════════════════════════════════
// [S2] ADL-56 §10 test 2 — SLICE 2 ONLY. Do NOT un-skip in Slice 1.
//
// GE-21 interim (BRD v3.22 / ADL-56 §10a): until Slice 2's place-level
// classifier lands, this is EXPECTED to fail. Un-skipping it proves the "FE and
// BE apply one identical ambiguity definition" half of GE-21 and is the signal
// to re-stamp that interim closed.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S2][INTERIM — Slice 2 only] ADL-56 test 2 — a plain-name create for a live-ambiguous name does not silently bind eligible[0]', () => {
  it('two same-region Newports resolve to needs_attention, not to whichever candidate ranked first', async () => {
    const db = testDb!;
    stubFetchWith(sameRegionNewportsRaw());

    // The offline / direct-API path: a bare name, no osm ref, no region. In
    // Slice 1 the frontend surface stops itself from SENDING this for an
    // ambiguous name; this pins the backend's own defense-in-depth, so the
    // contract is correct in isolation rather than FE-enforced only (§3).
    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Newport', country_code: 'GB' });

    expect([200, 201]).toContain(res.status);
    const rows = await newportRows(db);
    expect(rows).toHaveLength(1);
    // Not 'resolved' — the backend saw two distinct real places and must not
    // choose between them (GE-19 lifecycle, ADL-55).
    expect(rows[0].geocodeStatus).toBe('needs_attention');
    expect(rows[0].geocodeCause).toBe('ambiguous');
    // …and specifically it has NOT stamped either candidate's identity.
    expect(rows[0].osmId).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// [S2] ADL-56 §10 test 3, BACKEND half — the shared golden-fixture set.
//
// FLAGGED FOR SLICE 2'S DESIGN: §4 requires ONE golden fixture set that BOTH
// trees run against, because `decideCityDisambiguation` (frontend) and
// `classifyCandidates` (backend) live in separate TS build trees and cannot
// import one module. The golden cases are declared inline here and again in
// `src/frontend/utils/__tests__/decideCityDisambiguation.adl56-s2.test.ts`;
// collapsing the two copies into one shared module is Slice-2 design work and
// is deliberately NOT pre-empted here. Two inline copies is exactly the drift
// risk §4 names — recorded in the QA completion report as an open item.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S2][INTERIM — Slice 2 only] ADL-56 test 3 (backend half) — classifyCandidates applies the place-level definition', () => {
  const permitted = new Set(['GB']);

  /** Real captured GB-ENG Newports, in the backend's candidate shape. */
  function sameRegionNewports(): NominatimCandidate[] {
    return [
      {
        displayName: 'Newport, Isle of Wight, England, PO30 5HD, United Kingdom',
        name: 'Newport',
        latitude: 50.7003707,
        longitude: -1.2952039,
        countryCode: 'GB',
        regionIso: 'GB-ENG',
        addressType: 'town',
        osmType: 'node',
        osmId: 2386521,
      },
      {
        displayName: 'Newport, Telford and Wrekin, England, TF10 7AG, United Kingdom',
        name: 'Newport',
        latitude: 52.7688594,
        longitude: -2.3783676,
        countryCode: 'GB',
        regionIso: 'GB-ENG',
        addressType: 'town',
        osmType: 'node',
        osmId: 27459103,
      },
    ];
  }

  /** Real captured Melbourne twins — ONE real place at two granularities. */
  function melbourneTwins(): NominatimCandidate[] {
    return [
      {
        displayName: 'Melbourne, Victoria, Australia',
        name: 'Melbourne',
        latitude: -37.8142454,
        longitude: 144.9631732,
        countryCode: 'AU',
        regionIso: 'AU-VIC',
        addressType: 'city',
        osmType: 'relation',
        osmId: 4246124,
      },
      {
        displayName: 'City of Melbourne, Victoria, Australia',
        name: 'City of Melbourne',
        latitude: -37.8123825,
        longitude: 144.9482613,
        countryCode: 'AU',
        regionIso: 'AU-VIC',
        addressType: 'municipality',
        osmType: 'relation',
        osmId: 2404870,
      },
    ];
  }

  it('golden case A — two same-region Newports are AMBIGUOUS (distinct places, one region)', () => {
    const verdict = classifyCandidates(sameRegionNewports(), permitted, null);
    expect(verdict.status).toBe('ambiguous');
  });

  it('golden case B — Melbourne city + municipality COLLAPSE to one place and resolve ok', () => {
    const verdict = classifyCandidates(melbourneTwins(), new Set(['AU']), null);
    expect(verdict.status).toBe('ok');
  });

  it('golden case C — a single unambiguous candidate stays ok', () => {
    const verdict = classifyCandidates([sameRegionNewports()[0]], permitted, null);
    expect(verdict.status).toBe('ok');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LIVE INTERIM TRIPWIRE — un-skipped, green today, MUST go red when Slice 2
// lands. See this file's header for why this exists alongside the skipped
// specs rather than instead of them.
//
// WHEN THIS TURNS RED: that is Slice 2 working. Delete this block, un-skip the
// `[S2]` specs above, and re-stamp the GE-21 interim closed in ADL-56 §10a and
// BRD v3.22's GE-21 row. Do NOT "fix" it by relaxing the assertion.
// ═════════════════════════════════════════════════════════════════════════════
describe('[INTERIM][GE-21 Slice 1→2] the backend name path still resolves a same-region ambiguity — documented, not accidental', () => {
  it('two same-region Newports currently resolve to eligible[0] (BRD v3.22 GE-21 interim; closes in Slice 2)', async () => {
    const db = testDb!;
    stubFetchWith(sameRegionNewportsRaw());

    const res = await supertest(app)
      .post('/api/cities')
      .send({ name: 'Newport', country_code: 'GB' });

    expect([200, 201]).toContain(res.status);
    const rows = await newportRows(db);
    expect(rows).toHaveLength(1);
    // TODAY: region-level distinctness sees one GB-ENG, calls it unambiguous,
    // and binds the first-ranked candidate. This is the interim the BRD stamps.
    expect(rows[0].geocodeStatus).toBe('resolved');
    expect(rows[0].osmId).toBe(2386521);
  });
});

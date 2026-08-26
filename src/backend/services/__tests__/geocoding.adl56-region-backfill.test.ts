/**
 * ADL-56 / GE-21 (BRD v3.22) — Slice 1 RED acceptance bar: §10 test **5**
 * (D4/N5), BACKGROUND-RESOLVER write site.
 *
 * The create-path write site is pinned in
 * `src/backend/routes/__tests__/cities.adl56-region-backfill.test.ts`. §6b names
 * BOTH sites and both must backfill, so a build that fixes only the create path
 * leaves every city that resolved through the 15-minute queue still showing
 * "no state set".
 *
 * ATDD-first (OP-35): authored BEFORE any implementer is briefed.
 *
 * ── THE TWO N5 PRECISIONS, ONE RED AND ONE GUARD ─────────────────────────────
 * §6b(1) — PLACEMENT. The backfill belongs ONLY in `commitResolvedOrMerge`'s
 * try-block direct update (`geocoding.service.ts:297-316`), the branch that
 * updates THIS row. The `catch` → `mergeIntoWinner` branch (`:321`) repoints
 * trip_places onto a PRE-EXISTING winner and deletes the loser — and that
 * winner may hold a user-supplied region (D12 rule-3). Backfilling there would
 * overwrite a user value while nominally "filling a blank". That is a GUARD
 * below (green on `main`, because no backfill exists yet at all) rather than a
 * red bar, and it is the assertion most likely to be broken by a careless
 * implementation of the red one directly above it.
 *
 * §6b(2) — DERIVATION. `commitResolvedOrMerge` receives only the single
 * `candidate`, so the backfill cannot be computed from `candidate` alone: the
 * CALLER holds the verdict and must derive the region from the single distinct
 * non-null `region_iso` across `eligible`, not from `best.regionIso`
 * (`best = eligible[0]` can be NULL-regioned while the resolve is
 * region-unambiguous). That is the second red test.
 *
 * ── MOCK FIDELITY (QUAL-22) ──────────────────────────────────────────────────
 * Real libSQL (`:memory:`) from the real migrations — real partial unique
 * indexes, real CHECK constraints, so the `uniq_cities_osm_ref` collision that
 * drives the merge branch is a REAL constraint violation, not a simulated one.
 * The REAL `nominatimSearch`, REAL `parseCandidate`/`isAcceptedSettlement`
 * admission gate and REAL `classifyCandidates` all run; only `global.fetch` is
 * doubled, with a REAL captured Nominatim response
 * (`fixtures/nominatim/adl56/melbourne_au.json`, captured 2026-08-26 with
 * production's exact params) loaded verbatim off disk.
 *
 * ── RED-BAR CARRIAGE ─────────────────────────────────────────────────────────
 * Committed `describe.skip` with a RED-BAR marker per the GE-19/ADL-55
 * convention; run un-skipped before commit, observed failures recorded in
 * `jobs/qa/tech/20260826-ADL56-slice1-red-bar.md`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';
import { __resetChokepointForTests } from '../nominatim-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MELBOURNE_FIXTURE = path.join(__dirname, 'fixtures/nominatim/adl56/melbourne_au.json');

/** The osm ref of the `place/city` relation in the captured response — the
 *  candidate `classifyCandidates` returns as `best`. */
const MELBOURNE_CITY_OSM_ID = 4246124;

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

const { resolveCity } = await import('../geocoding.service.js');

function melbourneRaw(): unknown[] {
  return JSON.parse(readFileSync(MELBOURNE_FIXTURE, 'utf-8'));
}

/**
 * N5(b) — the same REAL capture with `ISO3166-2-lvl4` deleted from the first
 * accepted row, and nothing else changed. Derived here in the test source
 * rather than committed as a JSON file so no reader can mistake it for
 * upstream ground truth. Reachability and the sampling caveat are documented
 * on the identical helper in `routes/__tests__/cities.adl56-region-backfill.test.ts`.
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

async function seedAu(db: TestDb) {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'AU', name: 'Australia', regionTierEnabled: 1 })
    .onConflictDoNothing();
  const inserted = await db
    .insert(schema.regions)
    .values([
      { countryCode: 'AU', name: 'Victoria', iso3166_2: 'AU-VIC' },
      { countryCode: 'AU', name: 'New South Wales', iso3166_2: 'AU-NSW' },
    ])
    .returning({ id: schema.regions.id, iso: schema.regions.iso3166_2 });
  return Object.fromEntries(inserted.map((r) => [r.iso, r.id])) as Record<string, number>;
}

/** A region-null pending Melbourne — the row the queue picks up. */
async function seedPendingMelbourne(db: TestDb): Promise<number> {
  const [city] = await db
    .insert(schema.cities)
    .values({ name: 'Melbourne', countryCode: 'AU', geocodeStatus: 'pending', regionId: null })
    .returning();
  return city.id;
}

async function cityById(db: TestDb, id: number) {
  const rows = await db.select().from(schema.cities).where(eq(schema.cities.id, id)).limit(1);
  return rows[0] ?? null;
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
// RED-BAR (Slice 1) — §6b(1) direct-update success path + §6b(2) derivation.
// ═════════════════════════════════════════════════════════════════════════════
describe('[S1][RED-BAR] ADL-56 §6b — the background resolver backfills a blank region on the direct-update path', () => {
  it('a region-null pending city resolved by the queue is left carrying the resolved region', async () => {
    const db = testDb!;
    const regions = await seedAu(db);
    const cityId = await seedPendingMelbourne(db);
    stubFetchWith(melbourneRaw());

    await expect(resolveCity(cityId)).resolves.toBe(true);

    const row = await cityById(db, cityId);
    expect(row?.geocodeStatus).toBe('resolved');
    // The M-A osm stamp still happens (unchanged behaviour)…
    expect(row?.osmId).toBe(MELBOURNE_CITY_OSM_ID);
    // …and now so does the region (D4).
    expect(row?.regionId).toBe(regions['AU-VIC']);
  });

  it('N5(b) — derives from the single distinct ELIGIBLE region_iso, not from best.regionIso', async () => {
    const db = testDb!;
    const regions = await seedAu(db);
    const cityId = await seedPendingMelbourne(db);
    stubFetchWith(melbourneFirstRowMissingRegionIso());

    await expect(resolveCity(cityId)).resolves.toBe(true);

    const row = await cityById(db, cityId);
    expect(row?.geocodeStatus).toBe('resolved');
    // `best = eligible[0]` carries NULL here; the single distinct eligible
    // region_iso is still AU-VIC. Reading `best.regionIso` silently misses it.
    expect(row?.regionId).toBe(regions['AU-VIC']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE GUARDS (green on main) — the two boundaries D4 must not cross.
// ─────────────────────────────────────────────────────────────────────────────
describe('[S1][GUARD] §6b(1) — the caught-violation merge branch never touches the winner’s region', () => {
  it("a resolve that merges into a pre-existing winner leaves that winner's user-supplied region alone", async () => {
    const db = testDb!;
    const regions = await seedAu(db);

    // The WINNER: already resolved, already holding this exact osm ref, and
    // carrying a user-supplied New South Wales (deliberately NOT the region the
    // geocoder reports — so a stray backfill here would be visible).
    const [winner] = await db
      .insert(schema.cities)
      .values({
        name: 'Melbourne',
        countryCode: 'AU',
        regionId: regions['AU-NSW'],
        geocodeStatus: 'resolved',
        osmType: 'relation',
        osmId: MELBOURNE_CITY_OSM_ID,
        latitude: -37.81,
        longitude: 144.96,
      })
      .returning();

    // The LOSER: a second, region-null pending row for the same real place,
    // created before the winner existed (the H1/legacy shape).
    const [loser] = await db
      .insert(schema.cities)
      .values({
        name: 'Melbourne City',
        countryCode: 'AU',
        geocodeStatus: 'pending',
        regionId: null,
      })
      .returning();

    stubFetchWith(melbourneRaw());
    await resolveCity(loser.id);

    // The merge branch really did run — the loser is gone, not merely updated.
    expect(await cityById(db, loser.id)).toBeNull();

    // D12 rule-3: the winner's SUPPLIED region survives untouched. This is the
    // assertion a backfill placed in the wrong branch breaks.
    const winnerAfter = await cityById(db, winner.id);
    expect(winnerAfter?.regionId).toBe(regions['AU-NSW']);
  });
});

describe('[S1][GUARD] a resolve that is region-AMBIGUOUS still backfills nothing', () => {
  it('needs_attention rows keep their NULL region — the backfill fires only on an unambiguous resolve', async () => {
    const db = testDb!;
    await seedAu(db);
    const cityId = await seedPendingMelbourne(db);

    // Two eligible AU candidates in DIFFERENT regions — the resolve is
    // region-ambiguous, so §6 says do not backfill (it is a D1/D2 picker case).
    const raw = melbourneRaw() as { addresstype?: string; address?: Record<string, unknown> }[];
    const second = raw.find((r) => r.addresstype === 'municipality');
    if (!second?.address) throw new Error('[TEST] Melbourne fixture shape changed');
    second.address['ISO3166-2-lvl4'] = 'AU-NSW';
    stubFetchWith(raw);

    await resolveCity(cityId);

    const row = await cityById(db, cityId);
    expect(row?.geocodeStatus).toBe('needs_attention');
    expect(row?.regionId).toBeNull();
  });
});

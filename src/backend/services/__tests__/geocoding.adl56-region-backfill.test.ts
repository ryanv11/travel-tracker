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

/**
 * The real captured `place/city` relation row, alone in an array — the body
 * Nominatim's `/lookup?osm_ids=R4246124` returns.
 *
 * DERIVED, and the derivation is only the FRAMING: the row itself is lifted
 * verbatim from `melbourne_au.json` (no field edited), and it is presented as a
 * one-element response because that is what `/lookup` is — "queried BY the exact
 * object(s) requested … it cannot exclude the pick the way a constrained top-N
 * name search can" (`nominatim-client.ts` `nominatimLookup`). A `/search` body
 * would be the wrong shape for this branch. Throws loudly if the fixture moves,
 * so this can never silently degrade into an empty lookup.
 */
function melbourneLookupBody(): unknown[] {
  const row = (melbourneRaw() as { osm_id?: number }[]).find(
    (r) => r.osm_id === MELBOURNE_CITY_OSM_ID,
  );
  if (!row) {
    throw new Error('[TEST] Melbourne fixture shape changed — no place/city relation row');
  }
  return [row];
}

/**
 * A region-null PENDING Melbourne that already CARRIES its OSM ref — the M-B
 * shape, and a real production row, not a contrived one.
 *
 * `createOrReuseCarriedCity` branch (c)/(d): when a user picks a candidate but
 * the create-time `/lookup` canonicalization fails (offline, geocoder error, or
 * a stale/reclassified id), the row is inserted **pending carrying the ref** and
 * its own doc comment names the recovery — "the standing 15-minute queue picks it
 * up via resolveCity's carried-ref branch". That branch is the write site these
 * two blocks cover.
 */
async function seedCarriedPendingMelbourne(
  db: TestDb,
  regionId: number | null = null,
): Promise<number> {
  const [city] = await db
    .insert(schema.cities)
    .values({
      name: 'Melbourne',
      countryCode: 'AU',
      geocodeStatus: 'pending',
      regionId,
      osmType: 'relation',
      osmId: MELBOURNE_CITY_OSM_ID,
    })
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

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — the CARRIED-OSM-REF resolve path.
//
// ADDED DURING IMPLEMENTATION (2026-08-26, PR #542), closing a gap in the
// ADL-56 §10 set. §6 names two write sites, "the create-time resolved insert
// and the background commitResolvedOrMerge" — but commitResolvedOrMerge has TWO
// callers inside resolveCity: the name-search verdict-ok path, and the
// carried-OSM-ref path that canonicalizes an already-chosen place by id. The
// original bar pinned only the first. Backfilling the second is required (see
// the derivation below) yet shipped unpinned, which inside an ATDD slice means
// code with no acceptance test. This block is that test.
//
// THE ASSERTION IS DERIVED FROM THE SPEC, NOT FROM THE IMPLEMENTATION.
// ADL-56 §6a path (A): "user picks one Melbourne → the osm_id →
// createOrReuseCarriedCity → canonical resolve → AU-VIC (region set via the
// pick's region_iso→region_id map and/or D4)", and §6a's net — "in EVERY Slice-1
// path Melbourne ends WITH its region".
//
// Walking that "and/or" honestly, because it decides what this test may claim:
//   • ONLINE pick — createOrReuseCarriedCity canonicalizes at create time and
//     inserts 'resolved' with the CALLER's regionId. The region arrives via the
//     FE half of the "and/or": buildCreateCityDataFromCandidate maps the
//     candidate's region_iso onto a loaded regions row. So §6a path (A) is
//     already satisfied there and D4 owes it nothing. NOT this test's subject.
//   • DEGRADED pick (M-B) — canonicalization failed at create time, so the row
//     is inserted PENDING carrying the ref and region-null. The FE map has
//     already had its only chance. When the queue later resolves that row
//     through resolveCity's carried-ref branch, **D4 is the only remaining
//     mechanism** — so §6a's "every Slice-1 path ends with a region" is a claim
//     ABOUT THIS PATH, and it is the half that was neither implemented nor
//     pinned before. That is what these tests assert.
//
// The resolve is region-unambiguous by construction here — /lookup is queried BY
// the chosen object and returns that one place (§B1.2, "it can never re-derive
// an ambiguous verdict for an already-chosen place") — so the §6 precondition
// holds without needing a distinctness computation over a candidate set.
// ═════════════════════════════════════════════════════════════════════════════
describe('[S1][RED-BAR] ADL-56 §6a path (A) — a carried-OSM-ref resolve backfills a blank region too', () => {
  it('a region-null pending city carrying an OSM ref ends the queue resolve carrying its region', async () => {
    const db = testDb!;
    const regions = await seedAu(db);
    const cityId = await seedCarriedPendingMelbourne(db);
    stubFetchWith(melbourneLookupBody());

    await expect(resolveCity(cityId)).resolves.toBe(true);

    const row = await cityById(db, cityId);
    expect(row?.geocodeStatus).toBe('resolved');
    // The carried ref is preserved by the canonicalization (unchanged behaviour) …
    expect(row?.osmId).toBe(MELBOURNE_CITY_OSM_ID);
    expect(row?.osmType).toBe('relation');
    // … and §6a's "ends WITH its region" is satisfied on the one path where D4
    // is the only mechanism left. Without the backfill on this branch the row
    // resolves region-null and STAYS region-null forever: resolveCity
    // early-returns on a 'resolved' row, so the queue never revisits it.
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

describe('[S1][GUARD] D12 rule-3 holds on the carried-OSM-ref path too', () => {
  it('a carried-ref resolve never overwrites the region the user supplied on the pick', async () => {
    // Paired deliberately with the carried-ref red block above: that block adds
    // a write to a branch which previously wrote no region at all, so the
    // boundary it must not cross needs pinning on the SAME branch. The user
    // chose New South Wales; the geocoder's canonical answer for this object is
    // Victoria. D12 rule-3 — the user has ground truth — so NSW survives.
    // Green before and after the backfill (before: no write; after: gate 1 of
    // deriveRegionBackfill returns null on a non-null region_id), which is
    // exactly what a boundary guard should be.
    const db = testDb!;
    const regions = await seedAu(db);
    const cityId = await seedCarriedPendingMelbourne(db, regions['AU-NSW']);
    stubFetchWith(melbourneLookupBody());

    await expect(resolveCity(cityId)).resolves.toBe(true);

    const row = await cityById(db, cityId);
    expect(row?.geocodeStatus).toBe('resolved');
    expect(row?.regionId).toBe(regions['AU-NSW']);
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

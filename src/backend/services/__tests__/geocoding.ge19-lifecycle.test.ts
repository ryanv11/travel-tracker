/**
 * GE-19 / BUG-85 — ATDD RED BAR for the geocode status-lifecycle model.
 * Acceptance criteria 1, 2, 3 from ADL-55 §7 (service level, resolveCity).
 *
 * These are the executable definition of done the Backend brief builds against.
 * Criteria 1 and 2 assert the NEW terminal-state transitions and are RED on
 * current main (the transitions are unbuilt — a stuck row stays 'pending').
 * They are committed with `describe.skip` + a per-block RED-BAR marker so CI
 * stays green (skipped tests do not execute); the Backend brief un-skips each
 * block as it greens it, and a weakened assertion shows in that diff.
 *
 * Criterion 3 is an UNCHANGED-behaviour regression guard (ADL-55 §7.3 / §3.2:
 * no-match → 'unresolvable' is D10 behaviour, disabled increments nothing) — it
 * is GREEN on main and is therefore left UN-SKIPPED as a live guard, not a red
 * bar. It must survive the build. See the QA completion report for the split.
 *
 * MOCK FIDELITY (QUAL-22): runs against a real libSQL (:memory:) instance built
 * from the real migrations (createTestDb — real CHECK constraints incl. the
 * merged `needs_attention`/`geocode_cause` substrate, real partial unique
 * indexes). Only the Nominatim egress chokepoint (nominatim-client) is mocked,
 * so the verdict each branch of resolveCity sees is controllable without a
 * network — the identical pattern to geocoding.service.test.ts. Both
 * nominatimSearch (name-search path) and nominatimLookup (carried-OSM path)
 * are faked because criterion 2 covers BOTH recoverable-error sites (ADL-55 §R
 * F2: geocoding.service.ts ~:413 carried-OSM and ~:458 name-search).
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../repositories/__tests__/test-db.js';
import type { NominatimSearchResult } from '../nominatim-client.js';

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

// Controllable chokepoint — each test sets what the next name-search AND the
// next id-lookup return. resolveCity uses nominatimSearch on the non-carried
// path and nominatimLookup on the carried-osm-ref path.
let nextSearchResult: NominatimSearchResult = { status: 'ok', candidates: [] };
let nextLookupResult: NominatimSearchResult = { status: 'ok', candidates: [] };
vi.mock('../nominatim-client.js', () => ({
  nominatimSearch: vi.fn(async () => nextSearchResult),
  nominatimLookup: vi.fn(async () => nextLookupResult),
}));

const { resolveCity } = await import('../geocoding.service.js');

// ----------------------------------------------------------------
// Seed helpers (self-contained — mirrors geocoding.service.test.ts)
// ----------------------------------------------------------------

/** Region-less US city (non-region-tier), driven via the name-search path. */
async function seedPlainCity(
  db: TestDb,
  overrides: Partial<typeof schema.cities.$inferInsert> = {},
): Promise<number> {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'US', name: 'United States', regionTierEnabled: 0 })
    .onConflictDoNothing();
  const [city] = await db
    .insert(schema.cities)
    .values({ name: 'Testville', countryCode: 'US', geocodeStatus: 'pending', ...overrides })
    .returning();
  return city.id;
}

/** Region-tier US city carrying US-CO, needed to drive the region-aware
 * ambiguity branch (region-unconfirmed). */
async function seedRegionCity(
  db: TestDb,
  overrides: Partial<typeof schema.cities.$inferInsert> = {},
): Promise<number> {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'US', name: 'United States', regionTierEnabled: 1 })
    .onConflictDoNothing();
  const [region] = await db
    .insert(schema.regions)
    .values({ countryCode: 'US', name: 'Colorado', iso3166_2: 'US-CO' })
    .returning();
  const [city] = await db
    .insert(schema.cities)
    .values({
      name: 'Denver',
      countryCode: 'US',
      regionId: region.id,
      geocodeStatus: 'pending',
      ...overrides,
    })
    .returning();
  return city.id;
}

function candidate(
  overrides: { name?: string; regionIso?: string | null; lat?: number; lon?: number } = {},
) {
  return {
    displayName: overrides.name ?? 'Testville',
    name: overrides.name ?? 'Testville',
    latitude: overrides.lat ?? 1,
    longitude: overrides.lon ?? 1,
    countryCode: 'US',
    regionIso: overrides.regionIso ?? null,
    class: 'place',
    type: 'city',
  };
}

async function readCity(cityId: number) {
  const [row] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
  return row;
}

beforeEach(async () => {
  testDb = await createTestDb();
  vi.stubEnv('GEOCODING_ENABLED', 'true');
  nextSearchResult = { status: 'ok', candidates: [] };
  nextLookupResult = { status: 'ok', candidates: [] };
});

afterEach(() => {
  testDb = null;
  vi.unstubAllEnvs();
});

// ================================================================
// Criterion 1 (ADL-55 §7.1 / D1a / OQ-3) — an AMBIGUOUS verdict is terminal on
// the FIRST verdict: the row lands needs_attention/ambiguous, coordinates stay
// NULL, and NO further retry budget is consumed (attempts unchanged).
// ================================================================
// GE-19 RED BAR (BUG-85) — unskip when implemented
describe('GE-19 RED BAR (BUG-85) §7.1 — ambiguous verdict → needs_attention/ambiguous, no retries', () => {
  it('an ambiguous verdict marks the row needs_attention with cause=ambiguous and does NOT increment attempts', async () => {
    const cityId = await seedRegionCity(testDb!, { geocodeAttempts: 0 }); // regionIso = US-CO
    // Two candidates that disagree with the row's selected region (US-CO) and
    // with each other → classifyCandidates returns ambiguous/region-unconfirmed.
    nextSearchResult = {
      status: 'ok',
      candidates: [
        candidate({ name: 'Denver', regionIso: 'US-TX' }),
        candidate({ name: 'Denver', regionIso: 'US-NY' }),
      ],
    };

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);

    const row = await readCity(cityId);
    // TARGET (RED on main — today this branch increments attempts and stays 'pending').
    expect(row.geocodeStatus).toBe('needs_attention');
    expect(row.geocodeCause).toBe('ambiguous');
    expect(row.geocodeAttempts).toBe(0); // OQ-3: deterministic answer — no retry spent
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
  });

  it('a needs_attention row is terminal — resolveCity does not re-resolve it against its will (§R F3)', async () => {
    // Seed a row already in the target terminal state (the substrate admits it).
    const cityId = await seedRegionCity(testDb!, {
      geocodeStatus: 'needs_attention',
      geocodeCause: 'ambiguous',
    });
    // Even a resolvable answer waiting in the chokepoint must not touch it,
    // because resolveCity early-returns on a needs_attention row (ADL-55 §R F3).
    nextSearchResult = {
      status: 'ok',
      candidates: [candidate({ name: 'Denver', regionIso: 'US-CO' })],
    };

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false); // not re-resolved against its will

    const row = await readCity(cityId);
    expect(row.geocodeStatus).toBe('needs_attention');
    expect(row.latitude).toBeNull();
  });
});

// ================================================================
// Criterion 2 (ADL-55 §7.2 / §R F2) — a row hitting GEOCODE_ATTEMPT_CAP
// RECOVERABLE errors transitions to needs_attention/unreachable rather than
// sitting 'pending'-at-cap forever. BOTH recoverable-error sites are covered:
// the name-search path (~geocoding.service.ts:458) and the carried-OSM path
// (~:413). Cap is 5; seed attempts=4 so the next failing attempt is the cap.
// ================================================================
// GE-19 RED BAR (BUG-85) — unskip when implemented
describe('GE-19 RED BAR (BUG-85) §7.2 — recoverable error at cap → needs_attention/unreachable (both sites)', () => {
  it('name-search site: an error at the attempt cap transitions to needs_attention/unreachable, never pending-at-cap', async () => {
    const cityId = await seedPlainCity(testDb!, { geocodeAttempts: 4 });
    nextSearchResult = { status: 'error' }; // recoverable (network/timeout/5xx/429)

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);

    const row = await readCity(cityId);
    // TARGET (RED on main — today it increments to 5 and stays 'pending' forever).
    expect(row.geocodeStatus).toBe('needs_attention');
    expect(row.geocodeCause).toBe('unreachable');
    expect(row.geocodeAttempts).toBe(5); // the failing attempt still counts
  });

  it('carried-OSM site: a lookup error at the attempt cap transitions to needs_attention/unreachable', async () => {
    // A row carrying an OSM ref is canonicalized via nominatimLookup, not search.
    const cityId = await seedPlainCity(testDb!, {
      geocodeAttempts: 4,
      osmType: 'node',
      osmId: 12345,
    });
    nextLookupResult = { status: 'error' }; // recoverable on the /lookup path

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);

    const row = await readCity(cityId);
    // TARGET (RED on main — today the carried-ref error branch increments and
    // stays 'pending' at cap, ADL-55 §R F2 site ~:413).
    expect(row.geocodeStatus).toBe('needs_attention');
    expect(row.geocodeCause).toBe('unreachable');
    expect(row.geocodeAttempts).toBe(5);
  });
});

// ================================================================
// Criterion 3 (ADL-55 §7.3 / §3.2) — UNCHANGED behaviour (D10). This is a
// REGRESSION GUARD, GREEN on main, deliberately LEFT UN-SKIPPED so it protects
// the invariant continuously through the GE-19 build. It is NOT a red bar.
//   - no-match ('the geocoder answered, zero usable') → 'unresolvable', terminal.
//   - a disabled/global condition increments nothing.
// ================================================================
describe('GE-19 REGRESSION GUARD (BUG-85) §7.3 — no-match unchanged; disabled increments nothing (GREEN on main)', () => {
  it("no-match marks the row 'unresolvable' and does not consume a recoverable attempt", async () => {
    const cityId = await seedPlainCity(testDb!, { geocodeAttempts: 0 });
    nextSearchResult = { status: 'ok', candidates: [] }; // geocoder answered, nothing usable

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);

    const row = await readCity(cityId);
    expect(row.geocodeStatus).toBe('unresolvable');
    expect(row.geocodeAttempts).toBe(0);
  });

  it('GEOCODING_ENABLED=false (global) does NOT increment geocode_attempts', async () => {
    const cityId = await seedPlainCity(testDb!, { geocodeAttempts: 2 });
    vi.stubEnv('GEOCODING_ENABLED', 'false');

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);

    const row = await readCity(cityId);
    expect(row.geocodeStatus).toBe('pending');
    expect(row.geocodeAttempts).toBe(2); // unchanged — offline is not a per-city failure
  });
});

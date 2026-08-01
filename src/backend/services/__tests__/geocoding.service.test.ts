/**
 * ADL-46 D10 (§4.4.1) + D12/D14 (§4.3.1/§4.3.2) — geocoding classification and
 * name-resolution unit tests.
 *
 * The Nominatim egress chokepoint (nominatim-client) is mocked so the failure
 * class each branch returns is controllable without any network. GEOCODING_ENABLED
 * is toggled per-test with vi.stubEnv because the service reads it live.
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

// Controllable chokepoint — each test sets what the next search returns.
let nextResult: NominatimSearchResult = { status: 'ok', candidates: [] };
vi.mock('../nominatim-client.js', () => ({
  nominatimSearch: vi.fn(async () => nextResult),
}));

const { resolveCity, resolveCityName, processQueue, classifyCandidates } = await import(
  '../geocoding.service.js'
);

async function seedCountryAndCity(
  db: TestDb,
  opts: { status?: 'pending' | 'resolved' | 'unresolvable'; attempts?: number } = {},
): Promise<number> {
  await db
    .insert(schema.countries)
    .values({ countryCode: 'US', name: 'United States', regionTierEnabled: 0 })
    .onConflictDoNothing();
  const [city] = await db
    .insert(schema.cities)
    .values({
      name: 'Testville',
      countryCode: 'US',
      geocodeStatus: opts.status ?? 'pending',
      geocodeAttempts: opts.attempts ?? 0,
    })
    .returning();
  return city.id;
}

/** Like seedCountryAndCity, but the city carries a region (US-CO by default),
 * needed to exercise resolveCity's region-aware classification. */
async function seedCountryAndCityWithRegion(
  db: TestDb,
  opts: { status?: 'pending' | 'resolved' | 'unresolvable'; attempts?: number } = {},
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
      geocodeStatus: opts.status ?? 'pending',
      geocodeAttempts: opts.attempts ?? 0,
    })
    .returning();
  return city.id;
}

beforeEach(async () => {
  testDb = await createTestDb();
  vi.stubEnv('GEOCODING_ENABLED', 'true');
  nextResult = { status: 'ok', candidates: [] };
});

afterEach(() => {
  testDb = null;
  vi.unstubAllEnvs();
});

describe('ADL-46 D10 — resolveCity failure classification', () => {
  it("no-match (geocoder answered, empty) marks the row 'unresolvable' and processQueue never re-selects it", async () => {
    const cityId = await seedCountryAndCity(testDb!);
    nextResult = { status: 'ok', candidates: [] };

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);

    const [row] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
    expect(row.geocodeStatus).toBe('unresolvable');
    expect(row.geocodeAttempts).toBe(0); // terminal — not counted as a recoverable attempt

    // processQueue selects only pending rows → this terminal row is skipped.
    nextResult = { status: 'ok', candidates: [candidate()] };
    await processQueue();
    const [after] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
    expect(after.geocodeStatus).toBe('unresolvable'); // untouched
  });

  it("recoverable failure leaves the row 'pending' and increments geocode_attempts", async () => {
    const cityId = await seedCountryAndCity(testDb!);
    nextResult = { status: 'error' };

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);

    const [row] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
    expect(row.geocodeStatus).toBe('pending');
    expect(row.geocodeAttempts).toBe(1);
  });

  it('GEOCODING_ENABLED=false (global) does NOT increment geocode_attempts', async () => {
    const cityId = await seedCountryAndCity(testDb!, { attempts: 2 });
    vi.stubEnv('GEOCODING_ENABLED', 'false');

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);

    const [row] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
    expect(row.geocodeStatus).toBe('pending');
    expect(row.geocodeAttempts).toBe(2); // unchanged — offline is not a per-city failure
  });

  it('a successful resolution sets coordinates and status resolved', async () => {
    const cityId = await seedCountryAndCity(testDb!);
    nextResult = { status: 'ok', candidates: [candidate({ lat: 39.7, lon: -104.9 })] };

    const ok = await resolveCity(cityId);
    expect(ok).toBe(true);

    const [row] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
    expect(row.geocodeStatus).toBe('resolved');
    expect(row.latitude).toBeCloseTo(39.7);
    expect(row.longitude).toBeCloseTo(-104.9);
  });

  it('processQueue does not re-select a row that has exhausted its recoverable-retry cap', async () => {
    // attempts already at the cap (5) — must not be picked up again.
    const cityId = await seedCountryAndCity(testDb!, { attempts: 5 });
    nextResult = { status: 'ok', candidates: [candidate()] };

    await processQueue();

    const [row] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
    expect(row.geocodeStatus).toBe('pending'); // never resolved — was skipped
  });
});

describe('ADL-46 D12/D14 — resolveCityName', () => {
  it("disabled (GEOCODING_ENABLED=false) returns status 'disabled' with no candidates", async () => {
    vi.stubEnv('GEOCODING_ENABLED', 'false');
    const r = await resolveCityName('Denver', 'US');
    expect(r.status).toBe('disabled');
  });

  it("exactly one candidate resolves to 'ok' with that candidate", async () => {
    nextResult = { status: 'ok', candidates: [candidate({ name: 'Denver' })] };
    const r = await resolveCityName('Denver', 'US');
    expect(r.status).toBe('ok');
    expect(r.best?.name).toBe('Denver');
  });

  it("D14: two or more comparable candidates return 'ambiguous' rather than auto-selecting", async () => {
    nextResult = {
      status: 'ok',
      candidates: [
        candidate({ name: 'Springfield', regionIso: 'US-IL' }),
        candidate({ name: 'Springfield', regionIso: 'US-MO' }),
      ],
    };
    const r = await resolveCityName('Springfield', 'US');
    expect(r.status).toBe('ambiguous');
    expect(r.candidates).toHaveLength(2);
    expect(r.best).toBeUndefined();
  });

  // ADL-46 F1/F2 ruling §1/§2.2 — THE SHIPPED REGRESSION, and its fix, exercised
  // through the real pre-existing call site (resolveCityName), not the new
  // classifyCandidates export, so this test is meaningful both BEFORE and
  // AFTER the fix. Pre-fix: geocoding.service.ts:99-101's `regionMatches.length
  // > 1` branch marked this 'ambiguous' even though every match agrees with
  // the region the user selected — Nominatim routinely returns one real city
  // at several administrative granularities (city + municipality) sharing one
  // region_iso. Post-fix (R2 step 3): count is irrelevant once a region was
  // requested and at least one candidate matches it — 'ok'.
  //
  // Demonstrated failing pre-fix by reverting ONLY the production diff
  // (geocoding.service.ts + cities.ts) via `git apply -R` on a scratch patch
  // (never `git stash` — refs/stash is shared across this repo's worktrees)
  // and re-running this test in isolation; see the Backend completion report
  // for the exact commands and output.
  it('REGRESSION (§4.1): two candidates sharing the REQUESTED region resolve to ok, not ambiguous', async () => {
    nextResult = {
      status: 'ok',
      candidates: [
        candidate({ name: 'Denver', regionIso: 'US-CO' }), // e.g. Nominatim's "city" hit
        candidate({ name: 'Denver', regionIso: 'US-CO' }), // e.g. Nominatim's "municipality" hit
      ],
    };
    const r = await resolveCityName('Denver', 'US', { regionIso: 'US-CO' });
    expect(r.status).toBe('ok');
    expect(r.best?.regionIso).toBe('US-CO');
  });

  it('D12: a supplied region ISO disambiguates two same-name candidates', async () => {
    nextResult = {
      status: 'ok',
      candidates: [
        candidate({ name: 'Springfield', regionIso: 'US-IL' }),
        candidate({ name: 'Springfield', regionIso: 'US-MO' }),
      ],
    };
    const r = await resolveCityName('Springfield', 'US', { regionIso: 'US-MO' });
    expect(r.status).toBe('ok');
    expect(r.best?.regionIso).toBe('US-MO');
  });

  it("no candidates resolves to 'unresolved'", async () => {
    nextResult = { status: 'ok', candidates: [] };
    const r = await resolveCityName('Nowhereville', 'US');
    expect(r.status).toBe('unresolved');
  });
});

// ================================================================
// ADL-46 F1/F2 ruling (2026-08-01) §2.1/§2.2/§4.1 — classifyCandidates.
// THE single shared classifier: both resolveCityName (above) and resolveCity
// (below) delegate to this function exclusively. Table-driven, one case per
// branch of the algorithm as specified by the ruling.
// ================================================================
describe('ADL-46 F1/F2 ruling — classifyCandidates (single shared classifier)', () => {
  it('empty permitted set → unconstrained: every candidate is eligible regardless of country', () => {
    const verdict = classifyCandidates(
      [candidate({ name: 'Anywhere', countryCode: 'FR', regionIso: null })],
      new Set(),
      null,
    );
    expect(verdict.status).toBe('ok');
  });

  it('a candidate with a null countryCode is EXCLUDED when the permitted set is non-empty', () => {
    // Built directly rather than via candidate() — that helper's `?? 'US'`
    // default would silently turn an explicit `null` back into 'US'.
    const nullCountryCandidate = {
      displayName: 'Mystery',
      name: 'Mystery',
      latitude: 1,
      longitude: 1,
      countryCode: null,
      regionIso: null,
      class: 'place',
      type: 'city',
    };
    const verdict = classifyCandidates([nullCountryCandidate], new Set(['US']), null);
    // Zero eligible (the sole candidate was dropped) → terminal unresolved,
    // not a guess at a candidate we cannot attribute to the user's country.
    expect(verdict.status).toBe('unresolved');
  });

  it('REGRESSION (§4.1): two candidates sharing the REQUESTED region → ok, count is irrelevant', () => {
    const verdict = classifyCandidates(
      [
        candidate({ name: 'Denver', countryCode: 'US', regionIso: 'US-CO' }),
        candidate({ name: 'Denver', countryCode: 'US', regionIso: 'US-CO' }),
      ],
      new Set(['US']),
      'US-CO',
    );
    expect(verdict.status).toBe('ok');
    if (verdict.status === 'ok') {
      expect(verdict.best.regionIso).toBe('US-CO');
    }
  });

  it("zero region matches with a region requested → ambiguous/'region-unconfirmed' (R3)", () => {
    const verdict = classifyCandidates(
      [
        candidate({ name: 'Springfield', countryCode: 'US', regionIso: 'US-IL' }),
        candidate({ name: 'Springfield', countryCode: 'US', regionIso: 'US-NY' }),
      ],
      new Set(['US']),
      'US-MO', // the user's selection matches neither candidate
    );
    expect(verdict.status).toBe('ambiguous');
    if (verdict.status === 'ambiguous') {
      expect(verdict.reason).toBe('region-unconfirmed');
      expect(new Set(verdict.regionIsos)).toEqual(new Set(['US-IL', 'US-NY']));
    }
  });

  it("two distinct regions, none requested → ambiguous/'multi-region'", () => {
    const verdict = classifyCandidates(
      [
        candidate({ name: 'Springfield', countryCode: 'US', regionIso: 'US-IL' }),
        candidate({ name: 'Springfield', countryCode: 'US', regionIso: 'US-MO' }),
      ],
      new Set(['US']),
      null,
    );
    expect(verdict.status).toBe('ambiguous');
    if (verdict.status === 'ambiguous') {
      expect(verdict.reason).toBe('multi-region');
      expect(new Set(verdict.regionIsos)).toEqual(new Set(['US-IL', 'US-MO']));
    }
  });

  it('two candidates both with null regionIso → ok (accepted, pinned limit — §2.2)', () => {
    // Non-region-tier-country shape: no candidate carries a region_iso at all,
    // so the distinct-region-set is empty (not >1) and step 4 resolves to the
    // first eligible candidate. This is a known, accepted guess (ruling §2.2)
    // — pinned here so a future change to it is deliberate, not accidental.
    const verdict = classifyCandidates(
      [
        candidate({ name: 'Springfield', countryCode: 'AU', regionIso: null }),
        candidate({ name: 'Springfield', countryCode: 'AU', regionIso: null }),
      ],
      new Set(['AU']),
      null,
    );
    expect(verdict.status).toBe('ok');
  });
});

// ================================================================
// ADL-46 F1/F2 ruling §2.4/§2.5 (R2/R3/R4) — resolveCity's ambiguity handling.
// F4: every route suite mocks the geocoder away, which is why this branch of
// resolveCity had no service-level coverage before now. These tests run
// against the real classifyCandidates through resolveCity, with only the
// Nominatim chokepoint faked.
// ================================================================
describe('ADL-46 F1/F2 ruling — resolveCity ambiguity (R2/R3/R4)', () => {
  it('a multi-region fake leaves the row pending, coordinates NULL, attempts incremented, status NOT unresolvable', async () => {
    const cityId = await seedCountryAndCityWithRegion(testDb!); // regionIso = US-CO
    // Two candidates that do NOT match the city's selected region (US-CO) and
    // disagree with each other → ambiguous/region-unconfirmed.
    nextResult = {
      status: 'ok',
      candidates: [
        candidate({ name: 'Denver', regionIso: 'US-TX' }),
        candidate({ name: 'Denver', regionIso: 'US-NY' }),
      ],
    };

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);

    const [row] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
    expect(row.geocodeStatus).toBe('pending'); // NOT unresolvable — the geocoder did not say "no match"
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
    expect(row.geocodeAttempts).toBe(1); // R4: the ambiguity budget was consumed
  });

  it('a row at attempts = CAP is not re-selected by processQueue, even with a multi-region fake available', async () => {
    const cityId = await seedCountryAndCityWithRegion(testDb!, { attempts: 5 });
    nextResult = {
      status: 'ok',
      candidates: [
        candidate({ name: 'Denver', regionIso: 'US-TX' }),
        candidate({ name: 'Denver', regionIso: 'US-NY' }),
      ],
    };

    await processQueue();

    const [row] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
    expect(row.geocodeStatus).toBe('pending'); // never touched — was skipped by the CAP predicate
    expect(row.geocodeAttempts).toBe(5); // unchanged — processQueue never called resolveCity for it
  });

  // Bonus coverage beyond the mandatory five (R3, not separately enumerated in
  // ruling §4 but directly exercises the rule stated in §2.2 step 3 / §2.4).
  it('bonus — R3: a region was requested but no candidate matches it → stays pending, never resolves outside the selected region', async () => {
    const cityId = await seedCountryAndCityWithRegion(testDb!); // regionIso = US-CO
    nextResult = {
      status: 'ok',
      candidates: [candidate({ name: 'Denver', regionIso: 'US-WA' })], // disagrees with US-CO
    };

    const ok = await resolveCity(cityId);
    expect(ok).toBe(false);

    const [row] = await testDb!.select().from(schema.cities).where(eq(schema.cities.id, cityId));
    expect(row.geocodeStatus).toBe('pending');
    expect(row.latitude).toBeNull();
    expect(row.geocodeAttempts).toBe(1);
  });
});

function candidate(
  overrides: {
    name?: string;
    lat?: number;
    lon?: number;
    countryCode?: string | null;
    regionIso?: string | null;
  } = {},
) {
  return {
    displayName: overrides.name ?? 'Testville',
    name: overrides.name ?? 'Testville',
    latitude: overrides.lat ?? 1,
    longitude: overrides.lon ?? 1,
    countryCode: overrides.countryCode ?? 'US',
    regionIso: overrides.regionIso ?? null,
    class: 'place',
    type: 'city',
  };
}

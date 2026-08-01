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

const { resolveCity, resolveCityName, processQueue } = await import('../geocoding.service.js');

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

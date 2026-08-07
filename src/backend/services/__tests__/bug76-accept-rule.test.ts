/**
 * BUG-76 (P1) — Geocoder accept-rule ATDD suite (OP-35, ATDD-first).
 *
 * RED-FIRST, PRE-IMPLEMENTATION. QA authored this suite against `main` before
 * Backend's fix lands. It encodes AC-0..AC-10 from the design doc:
 * jobs/architect/tech/20260807-BUG76-accept-rule-design.md §7 (as amended by
 * §9.9). Do NOT loosen an assertion to make it pass — a red run here is the
 * point; Backend turns these green.
 *
 * MOCK-FIDELITY (OP-35 / QUAL-22, non-negotiable — design doc §7 preamble,
 * §9.2): every fixture below is the EXACT captured `format=json&addressdetails=1`
 * JSON body committed at
 * src/backend/services/__tests__/fixtures/nominatim/bug76/*.json, loaded
 * verbatim off disk (never hand-authored). The test double is `global.fetch`
 * itself — the same boundary `fetchNominatim` (nominatim-client.ts) calls —
 * NOT a stub that hands `parseCandidate` already-shaped candidates. This is
 * the same technique nominatim-client.test.ts already uses for the BUG-79
 * truncation suite; the design doc README explicitly blesses it as the
 * QUAL-22 antidote. Every test also asserts `fetch` was called exactly once,
 * as a sanity check that the double is actually exercised and not bypassed by
 * a swallowed exception (the QUAL-22 failure mode: a mock that's silently
 * never hit still lets the test go green for the wrong reason).
 *
 * WHY SOME "REJECT" ACs (AC-4/5/7/8/8b) ALREADY PASS ON MAIN — flagged, not
 * hidden: the CURRENT bug keys on Nominatim's `type` field, and every row in
 * these negative fixtures happens to carry `type=administrative` (or
 * `type=census`/`type=waterway`), none of which is in the current
 * SETTLEMENT_TYPES set — so the current (over-broad) filter already drops
 * them, for the wrong reason (it drops the true positives too, which is the
 * actual bug). These tests are legitimate regression guards for the
 * CORRECTED addresstype-keyed rule (they pin against a future over-widening
 * that admits a county/state/suburb/census row) — they are not, by
 * themselves, red specifications of this fix. AC-0/1/3/6/9/10 (and AC-2 in
 * the companion e2e route file) are the genuinely red, load-bearing spec.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetChokepointForTests,
  nominatimLookup,
  nominatimSearch,
} from '../nominatim-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'nominatim', 'bug76');

function loadFixture(name: string): unknown[] {
  const raw = readFileSync(path.join(FIXTURE_DIR, name), 'utf-8');
  return JSON.parse(raw) as unknown[];
}

function mockFetch(data: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => data,
    }),
  );
}

function calledUrl(): string {
  const mock = fetch as unknown as { mock: { calls: unknown[][] } };
  expect(mock.mock.calls.length).toBeGreaterThan(0);
  return mock.mock.calls[0][0] as string;
}

describe('BUG-76 — geocoder accept-rule (ATDD, RED against main)', () => {
  beforeEach(() => {
    __resetChokepointForTests();
    vi.stubEnv('GEOCODING_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // ------------------------------------------------------------------
  // AC-0 — mock-fidelity gate (already true on main; a precondition, not a
  // fix-behaviour spec — see file header).
  // ------------------------------------------------------------------
  describe('AC-0 — outgoing request carries format=json & addressdetails=1', () => {
    it('nominatimSearch', async () => {
      mockFetch(loadFixture('denver_us.json'));
      await nominatimSearch({ q: 'denver', countrycodes: 'us', limit: '10' });

      expect(fetch).toHaveBeenCalledTimes(1);
      const url = calledUrl();
      expect(url).toContain('format=json');
      expect(url).toContain('addressdetails=1');
    });

    it('nominatimLookup', async () => {
      mockFetch(loadFixture('denver_us.json'));
      await nominatimLookup(['R1411339']);

      expect(fetch).toHaveBeenCalledTimes(1);
      const url = calledUrl();
      expect(url).toContain('format=json');
      expect(url).toContain('addressdetails=1');
    });
  });

  // ------------------------------------------------------------------
  // AC-1 — Denver. RED today: current filter admits 0/4 rows (all
  // type=administrative). Must admit Denver CO.
  // ------------------------------------------------------------------
  it('AC-1 — denver_us.json: Denver CO admitted (today: 0 candidates survive)', async () => {
    mockFetch(loadFixture('denver_us.json'));
    const result = await nominatimSearch({ q: 'denver', countrycodes: 'us', limit: '10' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.candidates.length).toBeGreaterThan(0);
    const denverCO = result.candidates.find((c) => c.regionIso === 'US-CO');
    expect(denverCO).toBeDefined();
    expect(denverCO?.countryCode).toBe('US');
    expect(Number.isFinite(denverCO?.latitude)).toBe(true);
    expect(Number.isFinite(denverCO?.longitude)).toBe(true);
  });

  // ------------------------------------------------------------------
  // AC-3 — Springfield US capitals. RED today: only the pre-existing VA
  // `city` node survives (1 candidate); IL/MO/MA (type=administrative) are
  // dropped. Must admit >=12, including IL/MO/MA by regionIso.
  // ------------------------------------------------------------------
  it('AC-3 — springfield_us.json: IL/MO/MA admitted alongside the VA twin, >=12 total', async () => {
    mockFetch(loadFixture('springfield_us.json'));
    const result = await nominatimSearch({ q: 'springfield', countrycodes: 'us', limit: '20' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.candidates.length).toBeGreaterThanOrEqual(12);
    const regions = result.candidates.map((c) => c.regionIso);
    expect(regions).toContain('US-IL');
    expect(regions).toContain('US-MO');
    expect(regions).toContain('US-MA');
    // The pre-existing survivor (VA city node) must still be present.
    expect(regions).toContain('US-VA');
  });

  // ------------------------------------------------------------------
  // AC-4 — county rejected. NOT independently red on main (see file header):
  // all 3 rows are type=administrative, already dropped by the current
  // over-broad filter. Regression guard for the corrected rule.
  // ------------------------------------------------------------------
  it('AC-4 — neg_cook_county.json: no county admitted as a city', async () => {
    mockFetch(loadFixture('neg_cook_county.json'));
    const result = await nominatimSearch({ q: 'cook county', countrycodes: 'us', limit: '10' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.candidates).toEqual([]);
  });

  // ------------------------------------------------------------------
  // AC-5 — state/county/river rejected. NOT independently red on main (same
  // reason as AC-4). Regression guard.
  // ------------------------------------------------------------------
  it('AC-5 — neg_colorado_state.json: no state/county/river admitted', async () => {
    mockFetch(loadFixture('neg_colorado_state.json'));
    const result = await nominatimSearch({ q: 'colorado', countrycodes: 'us', limit: '10' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.candidates).toEqual([]);
  });

  // ------------------------------------------------------------------
  // AC-6 — place_rank cannot discriminate (guards against a lazy fix). RED
  // today via the Denver-admitted half (Cook-County-rejected half already
  // holds, same as AC-4).
  // ------------------------------------------------------------------
  it('AC-6 — Denver CO (place_rank=12) admitted WHILE Cook County (place_rank=12) rejected', async () => {
    const denverRaw = loadFixture('denver_us.json') as Array<{
      addresstype: string;
      place_rank: number;
    }>;
    const cookRaw = loadFixture('neg_cook_county.json') as Array<{ place_rank: number }>;

    // Sanity on the fixtures themselves — the rank collision this AC exists
    // to guard against.
    const denverCityRow = denverRaw.find((r) => r.addresstype === 'city');
    expect(denverCityRow?.place_rank).toBe(12);
    expect(cookRaw.every((r) => r.place_rank === 12)).toBe(true);

    mockFetch(denverRaw);
    const denverResult = await nominatimSearch({ q: 'denver', countrycodes: 'us', limit: '10' });
    expect(denverResult.status).toBe('ok');
    if (denverResult.status === 'ok') {
      expect(denverResult.candidates.some((c) => c.regionIso === 'US-CO')).toBe(true);
    }

    __resetChokepointForTests();
    mockFetch(cookRaw);
    const cookResult = await nominatimSearch({ q: 'cook county', countrycodes: 'us', limit: '10' });
    expect(cookResult.status).toBe('ok');
    if (cookResult.status === 'ok') {
      expect(cookResult.candidates).toEqual([]);
    }
  });

  // ------------------------------------------------------------------
  // AC-7 — suburb rejected. NOT independently red on main (same reason as
  // AC-4/5: type=administrative already dropped today). Regression guard —
  // D4 is explicitly reversible/tunable, so this pins the current ruling.
  // ------------------------------------------------------------------
  it('AC-7 — springfield_global.json: no addresstype=suburb row admitted', async () => {
    mockFetch(loadFixture('springfield_global.json'));
    const result = await nominatimSearch({ q: 'springfield', limit: '40' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    // The 3 suburb rows (Chelmsford GB rel 3180630, Queensland AU rel
    // 11675581, NSW AU rel 6039399) must never appear.
    const suburbOsmIds = new Set([3180630, 11675581, 6039399]);
    const admittedOsmIds = result.candidates.map((c) => c.osmId).filter((id) => id != null);
    for (const id of suburbOsmIds) {
      expect(admittedOsmIds).not.toContain(id);
    }
  });

  // ------------------------------------------------------------------
  // AC-8 — census/statistical rejected, settlement twin kept, no dupe. NOT
  // independently red on main for the springfield_us case (VA city node
  // already survives type-keyed filtering today; the census row is already
  // dropped). Regression guard. Also covers the `statistical` variant via
  // the Bethesda MD CDP fixture (design doc §9.9 amendment).
  // ------------------------------------------------------------------
  it('AC-8 — springfield_us.json: Springfield VA appears exactly once (city node, not census)', async () => {
    mockFetch(loadFixture('springfield_us.json'));
    const result = await nominatimSearch({ q: 'springfield', countrycodes: 'us', limit: '20' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const vaRows = result.candidates.filter((c) => c.regionIso === 'US-VA');
    expect(vaRows).toHaveLength(1);
    expect(vaRows[0]?.osmId).toBe(158396042); // the `city` node, not the census relation (206834)
    expect(Number.isFinite(vaRows[0]?.latitude)).toBe(true);
  });

  it('AC-8 (statistical variant) — cdp_bethesda_md.json: statistical relation rejected, city node twin admitted', async () => {
    mockFetch(loadFixture('cdp_bethesda_md.json'));
    const result = await nominatimSearch({ q: 'Bethesda, Maryland' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.osmId).toBe(158248181); // the `city` node twin
    expect(result.candidates.map((c) => c.osmId)).not.toContain(133482); // the `statistical` relation
  });

  // ------------------------------------------------------------------
  // AC-8b — Paradise NV CDP twin. NOT independently red on main: the census
  // relation is already dropped (type=census) and the town NODE twin is
  // already admitted (type=town is in today's SETTLEMENT_TYPES). Both
  // halves already hold pre-fix — a regression guard, not a red spec.
  // ------------------------------------------------------------------
  it('AC-8b — cdp_paradise_nv.json: census relation rejected, town node twin admitted', async () => {
    mockFetch(loadFixture('cdp_paradise_nv.json'));
    const result = await nominatimSearch({ q: 'Paradise, Nevada' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.osmId).toBe(3139480510); // the `town` node twin
    expect(result.candidates.map((c) => c.osmId)).not.toContain(170053); // the `census` relation
  });

  // ------------------------------------------------------------------
  // AC-9 — municipality admitted. RED today: "Town of Springfield, Dane
  // County, Wisconsin" is type=administrative (dropped today).
  // ------------------------------------------------------------------
  it('AC-9 — springfield_global.json: addresstype=municipality row admitted (Town of Springfield, WI)', async () => {
    mockFetch(loadFixture('springfield_global.json'));
    const result = await nominatimSearch({ q: 'springfield', limit: '40' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const admittedOsmIds = result.candidates.map((c) => c.osmId);
    expect(admittedOsmIds).toContain(4014903); // "Town of Springfield, Dane County, Wisconsin" — addresstype=municipality
  });

  // ------------------------------------------------------------------
  // AC-10 — /lookup applies the same accept-rule. RED today: a Denver
  // admin-boundary `city` row (type=administrative) fed through
  // nominatimLookup is dropped by the same current filter as nominatimSearch.
  // ------------------------------------------------------------------
  it('AC-10 — nominatimLookup: admin-boundary city row admitted (reused Denver row)', async () => {
    const denverRaw = loadFixture('denver_us.json') as Array<{ addresstype: string }>;
    const denverCityRow = denverRaw.filter((r) => r.addresstype === 'city');
    expect(denverCityRow).toHaveLength(1); // sanity: exactly one `city` row in the fixture

    mockFetch(denverCityRow);
    const result = await nominatimLookup(['R1411339']);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.some((c) => c.regionIso === 'US-CO')).toBe(true);
  });
});

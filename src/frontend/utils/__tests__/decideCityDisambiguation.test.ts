/**
 * BUG-75 / UX-12 / GE-16 — `decideCityDisambiguation` pure-function decision table.
 *
 * ATDD-first RED acceptance tests (OP-35). Authored BEFORE the function exists,
 * as the executable definition of done handed to Frontend.
 *
 * ── WHAT THIS UNIT IS (design §9, review MINOR-1) ─────────────────────────────
 * The single source of truth for picker-vs-region precedence, extracted out of
 * `AddPlaceFlow.tsx:389-409` so AddPlace and the UX-12 ChangeCityModal cannot
 * drift. Frontend must create:
 *
 *   src/frontend/utils/decideCityDisambiguation.ts
 *
 *   export type CityDisambiguation =
 *     | { mode: 'picker';    candidates: GeocodeCandidate[] }  // >=2 distinct osm_id
 *     | { mode: 'region';    regionIsos: string[] }            // multi-region, no osm_id
 *     | { mode: 'suggested'; regionIso: string }               // single candidate (BUG-71)
 *     | { mode: 'none' };
 *
 *   // MINOR-1: `regionIso` is a SEPARATE resolved input (lookupCityCountry
 *   // returns it top-level, useCities.ts:87-101) — it is NOT derivable from
 *   // `candidatesForCountry`. A signature that drops it regresses AC-5.
 *   export function decideCityDisambiguation(
 *     candidatesForCountry: GeocodeCandidate[],
 *     regionIso: string | null,
 *   ): CityDisambiguation;
 *
 * ── THE REORDER THIS PINS (the defect) ────────────────────────────────────────
 * On `main`, AddPlaceFlow evaluates the region branch FIRST
 * (`sameCountryRegionIsos.length > 1`) and mutually-exclusively pre-empts the
 * picker. This function must evaluate POSITIVE identity evidence
 * (`distinctOsmIds.size > 1`) first. AC-1 is the test that a spanning-region set
 * returns `mode: 'picker'`, NOT `mode: 'region'` — the exact behaviour region-first
 * gets wrong. RED now because the unit does not exist; it must be red on the
 * MISSING-UNIT reason (a net-new pure function is legitimately red-until-built),
 * then green only once the reorder is correct.
 */
import { describe, expect, it } from 'vitest';
import {
  multiRegionNoOsm,
  sameRegionNewports,
  singleRegionNoOsm,
  singleUnambiguousDenver,
  spanningRegionNewports,
} from '../../components/TripDetail/__tests__/fixtures/newportGeocode';
import type { GeocodeCandidate } from '../../types/api';
// RED: this module does not exist on `main`. Frontend creates it (see header).
import { decideCityDisambiguation } from '../decideCityDisambiguation';

describe('decideCityDisambiguation — AC-1 spanning-region (headline)', () => {
  it('returns mode "picker" (NOT "region") for Newport spanning GB-ENG + GB-WLS with >=2 distinct osm_id', () => {
    const result = decideCityDisambiguation(spanningRegionNewports(), 'GB-ENG');
    // The precise failure of region-first: for this set it returns 'region'.
    // Positive identity evidence must win.
    expect(result.mode).toBe('picker');
  });

  it('carries every distinct-osm_id candidate into the picker set', () => {
    const result = decideCityDisambiguation(spanningRegionNewports(), 'GB-ENG');
    expect(result.mode).toBe('picker');
    if (result.mode !== 'picker') return;
    expect(result.candidates).toHaveLength(3);
    const osmIds = result.candidates.map((c: GeocodeCandidate) => c.osm_id).sort();
    expect(osmIds).toEqual([26700977, 26700978, 27459103]);
  });
});

describe('decideCityDisambiguation — AC-2 same-region twins', () => {
  it('returns mode "picker" for two GB-ENG Newports with distinct osm_id — a region select would collapse them', () => {
    const result = decideCityDisambiguation(sameRegionNewports(), 'GB-ENG');
    expect(result.mode).toBe('picker');
    if (result.mode !== 'picker') return;
    expect(result.candidates.map((c: GeocodeCandidate) => c.osm_id).sort()).toEqual([
      26700978, 27459103,
    ]);
  });
});

describe('decideCityDisambiguation — AC-3 Springfield many-region (PENDING real capture)', () => {
  // BUILD-BLOCKER (review): AC-3 must NOT be authored against an invented
  // Springfield fixture — that reproduces exactly the QUAL-22 vacuous-pass class
  // this suite exists to prevent. Nominatim is unreachable from this container
  // (firewall-regressed; connection-refused on two prior probes), so a REAL
  // captured Springfield /lookup response cannot be taken this session. A
  // post-rebuild session must capture it, drop it into the fixtures module, and
  // un-skip this test. Structure retained so the DoD is visible and enforceable.
  it.skip('returns mode "picker" listing all N Springfields by region-qualified display_name — PENDING real Nominatim capture', () => {
    // const springfields = capturedSpringfields(); // TODO: real capture, N>=2 distinct osm_id across N regions
    // const result = decideCityDisambiguation(springfields, 'US-IL');
    // expect(result.mode).toBe('picker');
    // if (result.mode !== 'picker') return;
    // expect(result.candidates).toHaveLength(springfields.length);
  });
});

describe('decideCityDisambiguation — AC-4 F1/F2 parity (no false picker)', () => {
  it('returns mode "region" for multi-region candidates that carry NO osm_id', () => {
    // Positive-identity gate untouched: no osm_id => distinctOsmIds.size <= 1 =>
    // the picker must NOT fire; the D14 region <select> fallback handles it.
    const result = decideCityDisambiguation(multiRegionNoOsm(), null);
    expect(result.mode).toBe('region');
    if (result.mode !== 'region') return;
    expect(result.regionIsos.sort()).toEqual(['US-IL', 'US-MO']);
  });

  it('returns mode "suggested" for a single-region no-osm candidate with a resolved regionIso', () => {
    const result = decideCityDisambiguation(singleRegionNoOsm(), 'GB-ENG');
    expect(result.mode).toBe('suggested');
    if (result.mode !== 'suggested') return;
    expect(result.regionIso).toBe('GB-ENG');
  });

  it('does NOT fire the picker when only ONE candidate carries a distinct osm_id even across two regions', () => {
    // One osm-bearing candidate + one bare candidate in a different region:
    // distinctOsmIds.size == 1 (not > 1), so this is region ambiguity, not
    // place-level identity ambiguity. The picker must NOT pre-empt here.
    const [iow] = sameRegionNewports();
    const bareWales = {
      name: 'Newport',
      display_name: 'Newport, Wales, United Kingdom',
      country_code: 'GB',
      region_iso: 'GB-WLS',
      latitude: 51.588,
      longitude: -2.997,
    };
    const result = decideCityDisambiguation([iow, bareWales], 'GB-ENG');
    expect(result.mode).toBe('region');
  });
});

describe('decideCityDisambiguation — AC-5 single unambiguous (Denver)', () => {
  it('returns mode "suggested" for one real place in one region, even carrying an osm_id (BUG-71 tentative)', () => {
    const result = decideCityDisambiguation(singleUnambiguousDenver(), 'US-CO');
    // A single distinct identity is NOT place-level ambiguity — it is a tentative
    // suggestion, never a forced pick.
    expect(result.mode).toBe('suggested');
    if (result.mode !== 'suggested') return;
    expect(result.regionIso).toBe('US-CO');
  });

  it('returns mode "none" for an empty candidate set with no resolved regionIso', () => {
    const result = decideCityDisambiguation([], null);
    expect(result.mode).toBe('none');
  });
});

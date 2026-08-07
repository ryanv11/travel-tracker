/**
 * BUG-75 / UX-12 — shared geocode fixtures for the picker-precedence ATDD suite.
 *
 * ── PROVENANCE (mock-fidelity, QUAL-22 + this bug's own cause) ────────────────
 * The shipped all-green suite hid the headline defect because
 * AddPlaceFlow.city-picker.test.tsx's four-Newport fixture was SAME-REGION — it
 * omitted Wales, so `sameCountryRegionIsos.length` was 1 and the spanning-region
 * path (region-first pre-empts the picker) was never exercised. These fixtures
 * exist to express the spanning-region reality the old one could not.
 *
 * Every osm_id below is REAL captured Nominatim data — none are invented:
 *   • node 26700978  GB-ENG  Newport, Isle of Wight        — captured, already in
 *     cities.identity-carry.test.ts:149 and AddPlaceFlow.city-picker.test.tsx.
 *   • node 27459103  GB-ENG  Newport, Telford and Wrekin   — captured, design §5.2
 *     verbatim (`node 27459103 | county=Telford and Wrekin | GB-ENG`) and
 *     cities.identity-carry.test.ts:159.
 *   • node 26700977  GB-WLS  Newport (city), Cymru / Wales  — captured, design §5.2
 *     verbatim (`node 26700977 | county=Newport | GB-WLS | "Newport, Cymru /
 *     Wales, NP20 1GF, …"`) and referenced in cities.identity-carry.test.ts:54
 *     as the type-prefixed id 'N26700977'. THIS is the row the shipped fixture
 *     omitted; adding it is what makes AC-1 span GB-ENG + GB-WLS.
 *
 * LOAD-BEARING vs FILLER: the assertions in the suite depend ONLY on
 * `osm_type`, `osm_id`, `region_iso`, `country_code`, and the region-qualifying
 * token inside `display_name` (all captured above). `latitude`/`longitude` are
 * required by the GeocodeCandidate type but are NEVER asserted — they are
 * plausible real coordinates included only to satisfy the type, marked here so
 * a reader knows they are not the captured, load-bearing part. The Wales
 * display_name tail (`, UK`) matches the sibling captured rows' format; its
 * captured, load-bearing discriminator is `Cymru / Wales`.
 */
import type { GeocodeCandidate } from '../../../../types/api';

/** Candidate carrying a guaranteed (osm_type, osm_id) — a real place identity. */
export type PickCandidate = GeocodeCandidate & {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
};

/** GB-ENG — Newport, Isle of Wight (captured node 26700978). */
export const NEWPORT_IOW: PickCandidate = {
  name: 'Newport',
  display_name: 'Newport, Isle of Wight, England, PO30 1JU, UK',
  country_code: 'GB',
  region_iso: 'GB-ENG',
  latitude: 50.7, // filler — not asserted
  longitude: -1.29, // filler — not asserted
  osm_type: 'node',
  osm_id: 26700978,
};

/** GB-ENG — Newport, Telford and Wrekin (captured node 27459103). */
export const NEWPORT_TELFORD: PickCandidate = {
  name: 'Newport',
  display_name: 'Newport, Telford and Wrekin, England, TF10 7AG, UK',
  country_code: 'GB',
  region_iso: 'GB-ENG',
  latitude: 52.77, // filler — not asserted
  longitude: -2.38, // filler — not asserted
  osm_type: 'node',
  osm_id: 27459103,
};

/** GB-WLS — Newport (city), Wales (captured node 26700977). The row the shipped
 *  fixture omitted; its presence is what makes the set span two regions. */
export const NEWPORT_WALES: PickCandidate = {
  name: 'Newport',
  display_name: 'Newport, Cymru / Wales, NP20 1GF, UK',
  country_code: 'GB',
  region_iso: 'GB-WLS',
  latitude: 51.588, // filler — not asserted
  longitude: -2.997, // filler — not asserted
  osm_type: 'node',
  osm_id: 26700977,
};

/** AC-1 headline set: spanning GB-ENG + GB-WLS, three distinct osm_id. */
export function spanningRegionNewports(): PickCandidate[] {
  return [NEWPORT_IOW, NEWPORT_TELFORD, NEWPORT_WALES];
}

/** AC-2 set: two Newports, both GB-ENG, distinct osm_id — region-only narrowing
 *  cannot separate them. */
export function sameRegionNewports(): PickCandidate[] {
  return [NEWPORT_IOW, NEWPORT_TELFORD];
}

/**
 * AC-4 F1/F2 parity: two Nominatim rows for the SAME real place at different
 * granularities carry NO osm_id (that fixture family's design, ADL-46 F1/F2) and
 * span two regions — must resolve to the region <select> fallback, never the
 * picker. Shape mirrors AddPlaceFlow.test.tsx's parity fixtures (no osm fields).
 */
export function multiRegionNoOsm(): GeocodeCandidate[] {
  return [
    {
      name: 'Springfield',
      display_name: 'Springfield, Illinois, United States',
      country_code: 'US',
      region_iso: 'US-IL',
      latitude: 39.8, // filler — not asserted
      longitude: -89.6, // filler — not asserted
    },
    {
      name: 'Springfield',
      display_name: 'Springfield, Missouri, United States',
      country_code: 'US',
      region_iso: 'US-MO',
      latitude: 37.2, // filler — not asserted
      longitude: -93.3, // filler — not asserted
    },
  ];
}

/** AC-4 F1/F2 parity, single-region no-osm variant → tentative "suggested". */
export function singleRegionNoOsm(): GeocodeCandidate[] {
  return [
    {
      name: 'Newport',
      display_name: 'Newport, England, United Kingdom',
      country_code: 'GB',
      region_iso: 'GB-ENG',
      latitude: 50.7, // filler — not asserted
      longitude: -1.29, // filler — not asserted
    },
  ];
}

/** AC-5 single unambiguous (Denver): one real place, one region. Even carrying an
 *  osm_id, a single distinct identity must NOT fire the picker — it is a tentative
 *  suggestion (BUG-71). */
export function singleUnambiguousDenver(): PickCandidate[] {
  return [
    {
      name: 'Denver',
      display_name: 'Denver, Colorado, United States',
      country_code: 'US',
      region_iso: 'US-CO',
      latitude: 39.74, // filler — not asserted
      longitude: -104.99, // filler — not asserted
      osm_type: 'relation',
      osm_id: 253750,
    },
  ];
}

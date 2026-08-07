/**
 * BUG-75 / UX-12 — AC-3 Springfield many-region fixture.
 *
 * ── PROVENANCE (mock-fidelity, QUAL-22) ───────────────────────────────────────
 * REAL captured Nominatim data — none invented. Captured 2026-08-07 via the
 * exact query the geocode proxy issues (`nominatim-client.ts`'s `nominatimSearch`):
 *
 *   q=Springfield&countrycodes=us&format=json&addressdetails=1&limit=40
 *
 * then passed through the app's own `SETTLEMENT_TYPES` filter
 * (`src/backend/services/nominatim-client.ts:116`, `{city,town,village,hamlet,
 * municipality}`). The raw response carries ~32 rows; only 4 survive the
 * filter. The famous Springfield, Illinois is an OSM **administrative
 * relation** (`type: 'administrative'`, `class: 'boundary'`) — it does NOT
 * survive `SETTLEMENT_TYPES` and is correctly absent here. That is
 * pre-existing, correct proxy behaviour, not a gap this fixture works around.
 *
 * Captured TWICE independently (two-probe, per CLAUDE.md's negative/positive
 * findings discipline even though this is a positive finding — mock-fidelity
 * demands it match live behaviour, not just the COO's paste):
 *   1. COO capture, pasted into the BUG-75 AC-3 close-out brief (2026-08-07).
 *   2. QA capture, same session, direct `curl` against
 *      `nominatim.openstreetmap.org/search` with the identical query string,
 *      filtered through the identical `SETTLEMENT_TYPES` set in this repo.
 * Both captures returned the SAME 4 osm_id, SAME types, SAME display_name
 * strings, byte-for-byte — zero discrepancy. `region_iso` values below
 * (`ISO3166-2-lvl4`) come from QA's own capture, since the COO's paste did not
 * include that raw field (it only had `address.state`); the mapping
 * (Virginia→US-VA, West Virginia→US-WV, Indiana→US-IN, Wisconsin→US-WI) is
 * NOT a guess — it is Nominatim's own `address['ISO3166-2-lvl4']` field, the
 * exact field `parseCandidate` reads (`nominatim-client.ts:293`).
 *
 * LOAD-BEARING vs FILLER, same convention as `newportGeocode.ts`: assertions
 * depend only on `osm_type`, `osm_id`, `region_iso`, `country_code`, and the
 * region-qualifying token inside `display_name`. `latitude`/`longitude` are
 * real captured coordinates (not invented) but are not asserted on.
 */
import type { GeocodeCandidate } from '../../../../types/api';

/** Candidate carrying a guaranteed (osm_type, osm_id) — a real place identity. */
export type PickCandidate = GeocodeCandidate & {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
};

/** US-VA — Springfield, Fairfax County, Virginia (captured node 158396042). */
export const SPRINGFIELD_VIRGINIA: PickCandidate = {
  name: 'Springfield',
  display_name: 'Springfield, Fairfax County, Virginia, 22150, United States',
  country_code: 'US',
  region_iso: 'US-VA',
  latitude: 38.7791227,
  longitude: -77.1861196,
  osm_type: 'node',
  osm_id: 158396042,
};

/** US-WV — Springfield, Hampshire County, West Virginia (captured node 157579394). */
export const SPRINGFIELD_WEST_VIRGINIA: PickCandidate = {
  name: 'Springfield',
  display_name: 'Springfield, Hampshire County, West Virginia, 26763, United States',
  country_code: 'US',
  region_iso: 'US-WV',
  latitude: 39.4506494,
  longitude: -78.6936272,
  osm_type: 'node',
  osm_id: 157579394,
};

/** US-IN — Springfield, LaPorte County, Indiana (captured node 153751916). */
export const SPRINGFIELD_INDIANA: PickCandidate = {
  name: 'Springfield',
  display_name: 'Springfield, LaPorte County, Indiana, United States',
  country_code: 'US',
  region_iso: 'US-IN',
  latitude: 41.7153192,
  longitude: -86.7775264,
  osm_type: 'node',
  osm_id: 153751916,
};

/** US-WI — Springfield, Town of Lyons, Walworth County, Wisconsin (captured node 153356201). */
export const SPRINGFIELD_WISCONSIN: PickCandidate = {
  name: 'Springfield',
  display_name: 'Springfield, Town of Lyons, Walworth County, Wisconsin, 53176, United States',
  country_code: 'US',
  region_iso: 'US-WI',
  latitude: 42.6416831,
  longitude: -88.4120405,
  osm_type: 'node',
  osm_id: 153356201,
};

/**
 * AC-3 set: the full realistic Springfield candidate set post-filter — 4
 * distinct settlements, 4 distinct states/regions, 4 distinct osm_id. NOT the
 * ~20 an earlier estimate guessed (that estimate predated a real capture and
 * didn't account for the SETTLEMENT_TYPES filter dropping administrative
 * relations like Springfield, IL).
 */
export function capturedSpringfields(): PickCandidate[] {
  return [
    SPRINGFIELD_VIRGINIA,
    SPRINGFIELD_WEST_VIRGINIA,
    SPRINGFIELD_INDIANA,
    SPRINGFIELD_WISCONSIN,
  ];
}

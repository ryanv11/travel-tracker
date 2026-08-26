/**
 * ADL-56 / GE-21 Slice 1 — geocode fixtures for the red acceptance bar.
 *
 * ── PROVENANCE (mock-fidelity, QUAL-22) ──────────────────────────────────────
 * These are NOT hand-written mocks. Every object below is the exact
 * `GET /api/geocode` response body the REAL backend emits for a REAL captured
 * Nominatim response, derived mechanically:
 *
 *   1. Captured live from `nominatim.openstreetmap.org/search` on 2026-08-26
 *      with production's exact params (`format=json&addressdetails=1`), and
 *      committed verbatim under
 *      `src/backend/services/__tests__/fixtures/nominatim/adl56/` —
 *      `newport_us.json`, `newport_gb.json`, `melbourne_au.json`
 *      (see that directory's README.md for the queries and per-row analysis).
 *   2. Replayed through the REAL `parseCandidate` + `isAcceptedSettlement`
 *      admission gate (`services/nominatim-client.ts`) and the REAL response
 *      serializer in `routes/geocode.ts` — so `status`, `candidates[]` (with
 *      `osm_type`/`osm_id`/`state`/`country`/`county`), `country_code`,
 *      `region_iso` and `truncated` all carry the field names, nullability and
 *      values the live route produces, not the ones a test author assumed.
 *
 * The shape is the whole point: ADL-56 §10's mock-fidelity clause says a double
 * that returns a convenient shape makes the suite pass vacuously. The doubles
 * in the ADL-56 suites therefore serve THESE objects from a mocked `apiGet`,
 * i.e. at the same boundary the browser crosses, rather than stubbing
 * `lookupCityCountry` (which would also hard-code today's imperative call
 * shape into tests that must survive the D8 §3b(6) move to a query-keyed hook).
 *
 * `truncated` is likewise derived, not asserted-by-hand: the geocode route asks
 * for `limit=10` when exactly one country code is sent (CONSTRAINED_LIMIT,
 * `routes/geocode.ts:63/106`), so the 10-row US capture comes back
 * `truncated: true` and the 4-row GB / 2-row AU captures come back `false`.
 *
 * ── WHAT EACH FIXTURE ESTABLISHES ────────────────────────────────────────────
 * • NEWPORT_US — 10 accepted settlements across 9 distinct `region_iso`,
 *   including **Oregon** (relation 186468) and **Rhode Island** (relation
 *   191230). This is the PO's actual BUG-97 case: the catalogue holds exactly
 *   one "Newport, Oregon" row, and nine other real Newports exist that the
 *   cache knows nothing about.
 * • NEWPORT_GB — 4 accepted settlements spanning GB-WLS + GB-ENG, including
 *   the Wales city (node 26700977) and Telford and Wrekin (node 27459103) that
 *   ADL-56 §1/§4 name by id. Two of the four are same-region (both GB-ENG), the
 *   case a region `<select>` structurally cannot separate.
 * • MELBOURNE_AU — the ADL-56 §6a case, confirmed against live data: the
 *   `city` relation (4246124) and the `municipality` relation (2404870) BOTH
 *   survive the settlement admission gate and BOTH carry `AU-VIC`, so
 *   `decideCityDisambiguation` sees `distinctOsmIds.size === 2` and renders the
 *   two-option picker the PO saw, while `distinctRegionIsos` is length 1 (the
 *   resolve is region-UNAMBIGUOUS — which is what makes the D4 backfill
 *   correct and the saved region-null wrong). The `suburb` row in the raw
 *   capture is rejected by the admission gate and is absent here.
 *
 * ── DRIFT NOTE (flagged, not fixed) ──────────────────────────────────────────
 * The pre-existing `newportGeocode.ts` fixture in this directory gives Newport
 * (Isle of Wight) as node **26700978**. Today's live capture returns node
 * **2386521** for that place and contains no 26700978 at all (two probes: the
 * per-row dump of `newport_gb.json`, and `grep -c 26700978` over the raw
 * capture returning 0). That older fixture is left untouched — it is
 * load-bearing for green BUG-75/UX-12 suites and its own header records a
 * different capture — but ADL-56 suites use the 2026-08-26 ids above.
 */
import type { GeocodeCandidate, GeocodeResult } from '../../../../types/api';

/** The `GET /api/geocode` body shape, with `status`/`truncated` non-optional —
 *  the live route always sends both (`routes/geocode.ts`), and pinning them as
 *  required here is what stops a fixture from silently omitting the field the
 *  D5 message states (S4 vs S5) route on. */
export type LiveGeocodeResponse = GeocodeResult & {
  status: 'ok' | 'error' | 'disabled';
  truncated: boolean;
};

/** Candidate carrying a guaranteed (osm_type, osm_id) — a real place identity. */
export type IdentifiedCandidate = GeocodeCandidate & {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// NEWPORT — United States (q=Newport&countrycodes=us&limit=10, 2026-08-26)
// ─────────────────────────────────────────────────────────────────────────────

export const NEWPORT_RHODE_ISLAND: IdentifiedCandidate = {
  name: 'Newport',
  display_name: 'Newport, Newport County, Rhode Island, 02840, United States',
  country_code: 'US',
  region_iso: 'US-RI',
  latitude: 41.4899827,
  longitude: -71.3137707,
  osm_type: 'relation',
  osm_id: 191230,
  state: 'Rhode Island',
  country: 'United States',
  county: 'Newport County',
};

export const NEWPORT_KENTUCKY: IdentifiedCandidate = {
  name: 'Newport',
  display_name: 'Newport, Campbell County, Kentucky, 41071, United States',
  country_code: 'US',
  region_iso: 'US-KY',
  latitude: 39.0889469,
  longitude: -84.4919524,
  osm_type: 'relation',
  osm_id: 130502,
  state: 'Kentucky',
  country: 'United States',
  county: 'Campbell County',
};

/** The place the catalogue already holds as a cached row in the B1 tests. */
export const NEWPORT_OREGON: IdentifiedCandidate = {
  name: 'Newport',
  display_name: 'Newport, Lincoln County, Oregon, United States',
  country_code: 'US',
  region_iso: 'US-OR',
  latitude: 44.636755,
  longitude: -124.053442,
  osm_type: 'relation',
  osm_id: 186468,
  state: 'Oregon',
  country: 'United States',
  county: 'Lincoln County',
};

export const NEWPORT_VERMONT: IdentifiedCandidate = {
  name: 'Newport',
  display_name: 'Newport, Orleans County, Vermont, 05855, United States',
  country_code: 'US',
  region_iso: 'US-VT',
  latitude: 44.9367172,
  longitude: -72.2055988,
  osm_type: 'relation',
  osm_id: 199080,
  state: 'Vermont',
  country: 'United States',
  county: 'Orleans County',
};

/** The full 10-candidate US response, in the live ranking order. */
export function newportUsResponse(): LiveGeocodeResponse {
  return {
    status: 'ok',
    candidates: [
      NEWPORT_RHODE_ISLAND,
      NEWPORT_KENTUCKY,
      NEWPORT_OREGON,
      NEWPORT_VERMONT,
      {
        name: 'Newport',
        display_name: 'Newport, Jackson County, Arkansas, United States',
        country_code: 'US',
        region_iso: 'US-AR',
        latitude: 35.6067154,
        longitude: -91.2830334,
        osm_type: 'relation',
        osm_id: 6699500,
        state: 'Arkansas',
        country: 'United States',
        county: 'Jackson County',
      },
      {
        name: 'Newport',
        display_name: 'Newport, New Castle County, Delaware, United States',
        country_code: 'US',
        region_iso: 'US-DE',
        latitude: 39.7137238,
        longitude: -75.6093709,
        osm_type: 'relation',
        osm_id: 2662188,
        state: 'Delaware',
        country: 'United States',
        county: 'New Castle County',
      },
      {
        name: 'Newport',
        display_name: 'Newport, Sullivan County, New Hampshire, United States',
        country_code: 'US',
        region_iso: 'US-NH',
        latitude: 43.3653447,
        longitude: -72.1974318,
        osm_type: 'relation',
        osm_id: 2016816,
        state: 'New Hampshire',
        country: 'United States',
        county: 'Sullivan County',
      },
      {
        name: 'Newport',
        display_name: 'Newport, Cocke County, East Tennessee, Tennessee, 37821, United States',
        country_code: 'US',
        region_iso: 'US-TN',
        latitude: 35.9670412,
        longitude: -83.1876578,
        osm_type: 'relation',
        osm_id: 197362,
        state: 'Tennessee',
        country: 'United States',
        county: 'Cocke County',
      },
      {
        name: 'Village of Newport',
        display_name:
          'Village of Newport, Town of Newport, Herkimer County, New York, United States',
        country_code: 'US',
        region_iso: 'US-NY',
        latitude: 43.185904,
        longitude: -75.014648,
        osm_type: 'relation',
        osm_id: 175868,
        state: 'New York',
        country: 'United States',
        county: 'Herkimer County',
      },
      {
        name: 'Town of Newport',
        display_name: 'Town of Newport, Herkimer County, New York, 13431, United States',
        country_code: 'US',
        region_iso: 'US-NY',
        latitude: 43.185904,
        longitude: -75.014648,
        osm_type: 'relation',
        osm_id: 3157122,
        state: 'New York',
        country: 'United States',
        county: 'Herkimer County',
      },
    ],
    country_code: 'US',
    region_iso: 'US-RI',
    // raw rows (10) >= requested CONSTRAINED_LIMIT (10) — derived, not assumed.
    truncated: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NEWPORT — United Kingdom (q=Newport&countrycodes=gb&limit=10, 2026-08-26)
// ─────────────────────────────────────────────────────────────────────────────

export const NEWPORT_WALES: IdentifiedCandidate = {
  name: 'Newport',
  display_name: 'Newport, Cymru / Wales, NP20 1GF, United Kingdom',
  country_code: 'GB',
  region_iso: 'GB-WLS',
  latitude: 51.5882332,
  longitude: -2.9974967,
  osm_type: 'node',
  osm_id: 26700977,
  state: 'Cymru / Wales',
  country: 'United Kingdom',
  county: 'Newport',
};

export const NEWPORT_ISLE_OF_WIGHT: IdentifiedCandidate = {
  name: 'Newport',
  display_name: 'Newport, Isle of Wight, England, PO30 5HD, United Kingdom',
  country_code: 'GB',
  region_iso: 'GB-ENG',
  latitude: 50.7003707,
  longitude: -1.2952039,
  osm_type: 'node',
  osm_id: 2386521,
  state: 'England',
  country: 'United Kingdom',
  county: 'Isle of Wight',
};

export const NEWPORT_TELFORD: IdentifiedCandidate = {
  name: 'Newport',
  display_name: 'Newport, Telford and Wrekin, England, TF10 7AG, United Kingdom',
  country_code: 'GB',
  region_iso: 'GB-ENG',
  latitude: 52.7688594,
  longitude: -2.3783676,
  osm_type: 'node',
  osm_id: 27459103,
  state: 'England',
  country: 'United Kingdom',
  county: 'Telford and Wrekin',
};

export const NEWPORT_PEMBROKESHIRE: IdentifiedCandidate = {
  name: 'Newport',
  display_name: 'Newport, Pembrokeshire, Cymru / Wales, SA42 0TJ, United Kingdom',
  country_code: 'GB',
  region_iso: 'GB-WLS',
  latitude: 52.0162866,
  longitude: -4.8328962,
  osm_type: 'node',
  osm_id: 203628404,
  state: 'Cymru / Wales',
  country: 'United Kingdom',
  county: 'Pembrokeshire',
};

export function newportGbResponse(): LiveGeocodeResponse {
  return {
    status: 'ok',
    candidates: [NEWPORT_WALES, NEWPORT_ISLE_OF_WIGHT, NEWPORT_TELFORD, NEWPORT_PEMBROKESHIRE],
    country_code: 'GB',
    region_iso: 'GB-WLS',
    truncated: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MELBOURNE — Australia (q=Melbourne&countrycodes=au&limit=10, 2026-08-26)
// ─────────────────────────────────────────────────────────────────────────────

/** The `place/city` relation — one of the two granularities of ONE real place. */
export const MELBOURNE_CITY: IdentifiedCandidate = {
  name: 'Melbourne',
  display_name: 'Melbourne, Victoria, Australia',
  country_code: 'AU',
  region_iso: 'AU-VIC',
  latitude: -37.8142454,
  longitude: 144.9631732,
  osm_type: 'relation',
  osm_id: 4246124,
  state: 'Victoria',
  country: 'Australia',
  county: null,
};

/** The `boundary/administrative` + `addresstype=municipality` relation — the
 *  SAME real place at a different granularity. Slice 2's ε-collapse folds this
 *  into MELBOURNE_CITY; in Slice 1 the two still drive a 2-option picker. */
export const MELBOURNE_MUNICIPALITY: IdentifiedCandidate = {
  name: 'City of Melbourne',
  display_name: 'City of Melbourne, Victoria, Australia',
  country_code: 'AU',
  region_iso: 'AU-VIC',
  latitude: -37.8123825,
  longitude: 144.9482613,
  osm_type: 'relation',
  osm_id: 2404870,
  state: 'Victoria',
  country: 'Australia',
  county: null,
};

export function melbourneAuResponse(): LiveGeocodeResponse {
  return {
    status: 'ok',
    candidates: [MELBOURNE_CITY, MELBOURNE_MUNICIPALITY],
    country_code: 'AU',
    region_iso: 'AU-VIC',
    truncated: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// D5 terminal outcomes (§7 S4 / S5) — the SAME response shape, different
// `status`/`candidates`. These are the two states today's surface cannot tell
// apart from "no saved match".
// ─────────────────────────────────────────────────────────────────────────────

/** S4 — the geocoder answered and genuinely found nothing. */
export function liveEmptyResponse(): LiveGeocodeResponse {
  return { status: 'ok', candidates: [], country_code: null, region_iso: null, truncated: false };
}

/** S5 — the upstream geocoder itself failed (the backend still answers 200). */
export function liveFailedResponse(): LiveGeocodeResponse {
  return {
    status: 'error',
    candidates: [],
    country_code: null,
    region_iso: null,
    truncated: false,
  };
}

/** S5 variant — GEOCODING_ENABLED=false upstream. Same user-facing state. */
export function liveDisabledResponse(): LiveGeocodeResponse {
  return {
    status: 'disabled',
    candidates: [],
    country_code: null,
    region_iso: null,
    truncated: false,
  };
}

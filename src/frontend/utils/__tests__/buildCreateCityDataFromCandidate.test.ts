/**
 * BUG-75 / UX-12 — the candidate->city identity-carry mapping, extracted ONCE.
 *
 * ATDD-first RED acceptance tests (OP-35). Pins AC-12 (MAJOR-1) and AC-6.
 *
 * ── WHY THIS EXISTS (review MAJOR-1, the anti-drift AC) ───────────────────────
 * On `main` the candidate->CreateCityData identity carry lives inside
 * `AddPlaceFlow.handleSelectPickerCandidate` (AddPlaceFlow.tsx:295-321) — a
 * COMPONENT-LOCAL function. A second component (ChangeCityModal) cannot "reuse
 * it unchanged"; left as-is it would be re-implemented, and a drift THERE
 * (forgetting to forward osm_id, or deriving region_id from a stale selector)
 * re-introduces the exact BUG-75 identity defect. The reviewer's fix: lift the
 * mapping into a shared unit consumed by BOTH flows, so the identity carry
 * exists in exactly one place.
 *
 * Frontend must create:
 *
 *   src/frontend/utils/buildCreateCityDataFromCandidate.ts
 *
 *   export function buildCreateCityDataFromCandidate(
 *     candidate: GeocodeCandidate,
 *     cityName: string,
 *     regions: Region[],
 *     fallbackCountryCode?: string,
 *   ): CreateCityData | null;   // null when no country can be resolved
 *
 * Behaviour (must match handleSelectPickerCandidate:297-313 exactly):
 *   • country_code = candidate.country_code ?? fallbackCountryCode (null if neither)
 *   • region_id    = regions.find(r => r.iso_3166_2 === candidate.region_iso)?.id
 *                    — derived from THIS candidate's region_iso, incomplete-seed
 *                      leaves it undefined (NEVER invents an id)
 *   • osm_type/osm_id/display_name forwarded only when the candidate carries a
 *     real identity (osm_type present AND osm_id != null)
 *
 * RED now because the module does not exist (net-new shared unit).
 */
import { describe, expect, it } from 'vitest';
import {
  NEWPORT_IOW,
  NEWPORT_WALES,
} from '../../components/TripDetail/__tests__/fixtures/newportGeocode';
import type { Region } from '../../types/api';
// RED: this module does not exist on `main`. Frontend creates it (see header).
import { buildCreateCityDataFromCandidate } from '../buildCreateCityDataFromCandidate';

const ENGLAND: Region = {
  id: 5,
  country_code: 'GB',
  name: 'England',
  iso_3166_2: 'GB-ENG',
  created_at: '',
  updated_at: '',
};
const WALES: Region = {
  id: 6,
  country_code: 'GB',
  name: 'Wales',
  iso_3166_2: 'GB-WLS',
  created_at: '',
  updated_at: '',
};

describe('buildCreateCityDataFromCandidate — AC-12 identity carry (defined once)', () => {
  it('forwards the chosen candidate osm_type/osm_id/display_name into CreateCityData', () => {
    const data = buildCreateCityDataFromCandidate(NEWPORT_IOW, 'Newport', [ENGLAND, WALES]);
    expect(data).toMatchObject({
      name: 'Newport',
      country_code: 'GB',
      osm_type: 'node',
      osm_id: 26700978,
      display_name: 'Newport, Isle of Wight, England, PO30 1JU, UK',
    });
  });
});

describe('buildCreateCityDataFromCandidate — AC-6 region_id alignment (F4)', () => {
  it('derives region_id from THAT candidate region_iso, never a sibling region', () => {
    // The Wales pick must derive Wales (id 6), never England (id 5) — the exact
    // "carried with a stale/wrong region_id" failure AC-6 guards against.
    const data = buildCreateCityDataFromCandidate(NEWPORT_WALES, 'Newport', [ENGLAND, WALES]);
    expect(data?.region_id).toBe(6);
    expect(data?.osm_id).toBe(26700977);
  });

  it('leaves region_id undefined (NULL, not invented) when the pick region_iso is unseeded', () => {
    // Incomplete-seed fallback: only England is seeded; a Wales pick must NOT
    // borrow England's id and must NOT invent one.
    const data = buildCreateCityDataFromCandidate(NEWPORT_WALES, 'Newport', [ENGLAND]);
    expect(data?.region_id).toBeUndefined();
    // ...but identity is still carried so the server can canonicalize by osm_id.
    expect(data?.osm_id).toBe(26700977);
  });

  it('returns null when neither the candidate nor a fallback resolves a country', () => {
    const noCountry = { ...NEWPORT_IOW, country_code: null };
    expect(buildCreateCityDataFromCandidate(noCountry, 'Newport', [ENGLAND, WALES])).toBeNull();
  });
});

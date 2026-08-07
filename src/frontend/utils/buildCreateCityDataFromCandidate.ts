/**
 * BUG-75 / UX-12 — the candidate→city identity-carry mapping, extracted ONCE
 * (review MAJOR-1, the anti-drift AC).
 *
 * On `main` this mapping lived inline inside `AddPlaceFlow.handleSelectPickerCandidate`
 * (`:295-321`) — a component-local function a second component (`ChangeCityModal`)
 * could not "reuse unchanged" (the design's original §1 reuse-table claim, corrected
 * by the review). A drift here — forgetting to forward `osm_id`, or deriving
 * `region_id` from a stale selector value instead of the pick's own `region_iso` —
 * re-introduces the exact BUG-75 identity defect. Lifting it to a plain, shared
 * utility means the mapping exists in exactly one place, consumed identically by
 * AddPlace and Change-city (AC-12).
 *
 * Behaviour matches `handleSelectPickerCandidate:297-313` exactly:
 *   - country_code = candidate.country_code ?? fallbackCountryCode (null → no
 *     country resolvable → returns null, no city can be built)
 *   - region_id = regions.find(r => r.iso_3166_2 === candidate.region_iso)?.id —
 *     derived from THIS candidate's own region_iso; an unseeded region_iso
 *     leaves region_id undefined (F4/incomplete-seed fallback — NEVER invents one)
 *   - osm_type/osm_id/display_name forwarded only when the candidate carries a
 *     real identity (osm_type present AND osm_id != null)
 */
import type { CreateCityData } from '../hooks/useCities';
import type { GeocodeCandidate, Region } from '../types/api';

export function buildCreateCityDataFromCandidate(
  candidate: GeocodeCandidate,
  cityName: string,
  regions: Region[],
  fallbackCountryCode?: string,
): CreateCityData | null {
  const countryCode = candidate.country_code ?? fallbackCountryCode ?? null;
  if (!countryCode) return null;

  const regionId = candidate.region_iso
    ? (regions.find((r) => r.iso_3166_2 === candidate.region_iso)?.id ?? undefined)
    : undefined;

  return {
    name: cityName,
    country_code: countryCode,
    region_id: regionId,
    ...(candidate.osm_type && candidate.osm_id != null
      ? {
          osm_type: candidate.osm_type,
          osm_id: candidate.osm_id,
          display_name: candidate.display_name,
        }
      : {}),
  };
}

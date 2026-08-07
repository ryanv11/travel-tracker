/**
 * BUG-75 / UX-12 / GE-16 — the single source of truth for city-disambiguation
 * precedence (design §9, review MINOR-1).
 *
 * Extracted from `AddPlaceFlow.tsx`'s `handleOpenNewCityForm` (pre-extraction:
 * `:395-409`) so AddPlace and the UX-12 `ChangeCityModal` consume byte-identical
 * logic and cannot drift (design §9 / review MAJOR-1's sibling concern for the
 * *decision*, as opposed to MAJOR-1's own concern for the identity-carry
 * mapping — see `buildCreateCityDataFromCandidate.ts`).
 *
 * THE REORDER (the actual BUG-75 fix, design §6): on `main`, the region branch
 * (`sameCountryRegionIsos.length > 1`) was evaluated FIRST and mutually
 * exclusively pre-empted the place-level picker — so a spanning-region name
 * like "Newport" (GB-ENG + GB-WLS) never reached the picker, and the region
 * `<select>` silently collapsed two distinct GB-ENG Newports (Isle of Wight vs
 * Telford and Wrekin) into one indistinguishable choice. This function
 * evaluates POSITIVE identity evidence (`distinctOsmIds.size > 1`) FIRST —
 * positive `osm_id` evidence is strictly more specific than a region cut, so
 * it always wins when present (design §6.4's completeness argument). The
 * region `<select>` is preserved unchanged as the fallback for the no-`osm_id`
 * case (legacy/partial responses, the ADL-46 F1/F2 parity fixture family).
 */
import type { GeocodeCandidate } from '../types/api';

export type CityDisambiguation =
  | { mode: 'picker'; candidates: GeocodeCandidate[] }
  | { mode: 'region'; regionIsos: string[] }
  | { mode: 'suggested'; regionIso: string }
  | { mode: 'none' };

/**
 * Decides which disambiguation control (if any) should present the given
 * candidates, per the reordered D14/BUG-75 precedence.
 *
 * @param candidatesForCountry - Geocode candidates already filtered to the
 *   resolved country (the caller's job — this function is agnostic to how the
 *   country was resolved).
 * @param regionIso - The lookup's top-level resolved region ISO (MINOR-1: a
 *   SEPARATE input from `lookupCityCountry`, `useCities.ts:87-101` — NOT
 *   derivable from `candidatesForCountry`, since the single-candidate
 *   `'suggested'` mode needs it even when candidates carry no `region_iso` of
 *   their own).
 */
export function decideCityDisambiguation(
  candidatesForCountry: GeocodeCandidate[],
  regionIso: string | null,
): CityDisambiguation {
  const sameCountryRegionIsos = [
    ...new Set(candidatesForCountry.filter((c) => c.region_iso).map((c) => c.region_iso as string)),
  ];

  // Positive identity evidence: candidates carrying a real, distinct
  // (osm_type, osm_id) pair — the code's actual disambiguation signal.
  const distinctOsmIds = new Set(
    candidatesForCountry
      .filter((c) => c.osm_id != null)
      .map((c) => `${c.osm_type ?? ''}:${c.osm_id}`),
  );

  if (distinctOsmIds.size > 1) {
    return { mode: 'picker', candidates: candidatesForCountry };
  }
  if (sameCountryRegionIsos.length > 1) {
    return { mode: 'region', regionIsos: sameCountryRegionIsos };
  }
  if (regionIso) {
    return { mode: 'suggested', regionIso };
  }
  return { mode: 'none' };
}

/**
 * CityPicker — shared place-level candidate picker (BUG-75 / UX-12, v3 §1.3/§B5).
 *
 * Renders a set of geocode candidates by `display_name` and reports the
 * chosen candidate back to the caller. Exists because region-only
 * disambiguation is structurally insufficient: two distinct real places can
 * share a region (the two GB-ENG Newports — Isle of Wight and Telford and
 * Wrekin), so a region `<select>` collapses them into one indistinguishable
 * option. `display_name` is the discriminator a region selector throws away.
 *
 * ONE component, TWO call sites (v3 §A "Shared CityPicker reuse plan",
 * carried unchanged from v2 §8):
 *   1. BUG-75 — AddPlaceFlow's new-city form, when the geocode lookup
 *      resolves an ambiguous name to 2+ distinct-identity candidates that a
 *      region select cannot separate (AddPlaceFlow.tsx's
 *      `handleOpenNewCityForm`/`handleSelectPickerCandidate`).
 *   2. UX-12 — the "Change city" re-point flow (D11 `city_id` re-point,
 *      backend already on main). NOT wired to a concrete call site in this
 *      brief — UX-12 has no existing frontend surface to attach to yet (no
 *      "Change city" control exists anywhere in the frontend; verified by a
 *      `grep` for "Change city"/"ChangeCity" across src/frontend and a
 *      directory listing of every Place-related component, both turning up
 *      nothing — same conclusion the UX-12 tracker note already recorded via
 *      its own two probes). This component's prop surface (a generic
 *      `candidates`/`onSelect`/`truncated` contract, no AddPlaceFlow-specific
 *      state) is deliberately call-site-agnostic so a future UX-12 brief can
 *      consume it without changes here — see the BUG-75 frontend completion
 *      report for the full flag to COO.
 *
 * Visual/interaction pattern reused from AddPlaceFlow's existing city
 * search-results list (AddPlaceFlow.tsx ~:422-444) — same bordered
 * container, same per-row classes, same hover/cursor affordance — rather
 * than extracted out of that live block, to avoid touching working,
 * regression-tested code for an unrelated data shape (City rows with an
 * `id` vs. pre-creation GeocodeCandidates that don't have one yet).
 *
 * Inherits the BUG-79 `lookupTruncated` caveat (v3 §B5 m1): the picker is
 * fed by the same discovery lookup that carries `truncated` (useCities.ts /
 * geocode.ts), so "there may be more matches not shown" still applies here,
 * same as the region-select and Suggested-caption caveats it sits alongside.
 */
import type { GeocodeCandidate } from '../../types/api';

export interface CityPickerProps {
  /** Distinct-identity candidates to present, in the order given. */
  candidates: GeocodeCandidate[];
  /** Called with the chosen candidate — its carried identity is the caller's job to forward. */
  onSelect: (candidate: GeocodeCandidate) => void;
  /** BUG-79 (v3 §B5 m1): the lookup that produced `candidates` may have had
   *  more matches upstream than shown here — never present this list as exhaustive. */
  truncated?: boolean;
  /** Disables selection while a pick is being submitted (e.g. city creation in flight). */
  disabled?: boolean;
}

/** Stable key for a candidate: prefers its carried OSM identity, falls back
 *  to display_name + index for the (should-not-happen) case a picker
 *  candidate lacks one. */
function candidateKey(candidate: GeocodeCandidate, index: number): string {
  if (candidate.osm_type && candidate.osm_id != null) {
    return `${candidate.osm_type}:${candidate.osm_id}`;
  }
  return `${candidate.display_name}:${index}`;
}

export function CityPicker({ candidates, onSelect, truncated, disabled }: CityPickerProps) {
  return (
    <div>
      <div className="border border-gray-200 rounded-md overflow-hidden">
        {candidates.map((candidate, index) => (
          <div
            key={candidateKey(candidate, index)}
            className="px-3 py-2.5 cursor-pointer border-b border-gray-100 text-sm hover:bg-gray-50 last:border-b-0"
            onClick={() => {
              if (!disabled) onSelect(candidate);
            }}
          >
            {candidate.display_name}
          </div>
        ))}
      </div>
      {/* BUG-79 (v3 §B5 m1): carried into the picker — matches the phrasing
          already used for the region-select/Suggested-caption caveats. */}
      {truncated && (
        <p className="mt-1 text-xs text-amber-600">There may be more matches not shown.</p>
      )}
    </div>
  );
}

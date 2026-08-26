/**
 * CityPicker — shared place-level candidate picker (BUG-75 / UX-12, v3 §1.3/§B5).
 *
 * Renders a set of geocode candidates and reports the chosen candidate back
 * to the caller. Exists because region-only disambiguation is structurally
 * insufficient: two distinct real places can share a region (the two GB-ENG
 * Newports — Isle of Wight and Telford and Wrekin), so a region `<select>`
 * collapses them into one indistinguishable option.
 *
 * BUG-81 (UAT finding on the BUG-76 build, 2026-08-07): row labels used to be
 * the raw Nominatim `display_name`, which crams in county AND postcode plus
 * occasional cruft, making a long list (Springfield ~20 US rows) hard to
 * skim. Labels are now composed from the candidate's structured `name`/
 * `state`/`country` fields via `composeCandidateLabels`
 * (`../../utils/composeCandidateLabel.ts`) — "City, State, Country" by
 * default, county added only to rows that collide on (name, state, country),
 * a coordinate discriminator as the rare last resort, and `display_name`
 * (cleaned of postcode-looking segments) as the fallback for candidates that
 * carry no structured fields at all (legacy/fixture shapes). See that
 * module's doc comment for the full rule — this component just maps
 * candidates through it by index.
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
import { composeCandidateLabels } from '../../utils/composeCandidateLabel';

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
  /**
   * ADL-56 §10 / QA red bar §5.4 — emits `data-testid="<prefix>-<osm_type>-<osm_id>"`
   * on each row that carries a real OSM identity. The prescribed prefixes are
   * `add-place-live-option` and `change-city-live-option`; the testid is the
   * seam that lets the Slice-1 acceptance suites pin WHICH candidate is
   * rendered without pinning UX's row copy (D6 owns the label text, which
   * `composeCandidateLabels` produces). Omitted → no testid, which is the
   * existing new-city-form call site, unchanged.
   */
  testIdPrefix?: string;
  /** Marks the row for this candidate as the currently held selection (D7). */
  selectedKey?: string | null;
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

export function CityPicker({
  candidates,
  onSelect,
  truncated,
  disabled,
  testIdPrefix,
  selectedKey,
}: CityPickerProps) {
  const labels = composeCandidateLabels(candidates);
  return (
    <div>
      {/* BUG-81: outer border/rounding stays on this wrapper so the rounded
          corners still clip visually; the scroll itself lives on the INNER
          div so a long list (Springfield ~20) scrolls within the picker
          instead of pushing the page. max-h-72 (~18rem) shows roughly 6-8
          rows at this row height before scrolling kicks in. */}
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <div className="max-h-72 overflow-y-auto">
          {candidates.map((candidate, index) => {
            const identity =
              candidate.osm_type && candidate.osm_id != null
                ? `${candidate.osm_type}-${candidate.osm_id}`
                : null;
            const isSelected = selectedKey != null && candidateKey(candidate, index) === selectedKey;
            return (
              <div
                key={candidateKey(candidate, index)}
                data-testid={testIdPrefix && identity ? `${testIdPrefix}-${identity}` : undefined}
                className={`px-3 py-2.5 cursor-pointer border-b border-gray-100 text-sm last:border-b-0 ${
                  isSelected ? 'bg-teal-50 font-semibold' : 'hover:bg-gray-50'
                }`}
                onClick={() => {
                  if (!disabled) onSelect(candidate);
                }}
              >
                {labels[index]}
              </div>
            );
          })}
        </div>
      </div>
      {/* BUG-79 (v3 §B5 m1): carried into the picker — matches the phrasing
          already used for the region-select/Suggested-caption caveats. */}
      {truncated && (
        <p className="mt-1 text-xs text-amber-600">There may be more matches not shown.</p>
      )}
    </div>
  );
}

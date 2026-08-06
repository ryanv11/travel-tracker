# CityPicker — BUG-75 / UX-12 shared component

**File:** `src/frontend/components/shared/CityPicker.tsx`
**Consumer today:** `src/frontend/components/TripDetail/AddPlaceFlow.tsx` (BUG-75 add-place flow)
**Not yet consumed by:** UX-12's "Change city" re-point — no call site exists in the frontend yet
(see park doc `20260806-FRONTEND-bug75-citypicker-park.txt` for the two probes confirming this).

## Contract

```ts
interface CityPickerProps {
  candidates: GeocodeCandidate[];
  onSelect: (candidate: GeocodeCandidate) => void;
  truncated?: boolean; // BUG-79 lookupTruncated caveat
  disabled?: boolean;  // while a pick is being submitted
}
```

Deliberately AddPlaceFlow-agnostic — no props reference trip/place IDs or any AddPlaceFlow
state. A future UX-12 consumer supplies its own `candidates` (from whatever lookup it runs) and
its own `onSelect` (which would PATCH `city_id` via the D11 re-point endpoint, already on `main`,
rather than `POST /api/cities`).

## Rendering

Renders `candidates` as a bordered, clickable list keyed by `osm_type:osm_id` (falls back to
`display_name:index` if identity is absent — shouldn't happen for a real geocode response, but
keeps the component safe against a partial/legacy candidate shape). Visual classes match
`AddPlaceFlow.tsx`'s existing search-results list exactly (same bordered container, same
per-row `px-3 py-2.5 cursor-pointer border-b border-gray-100 text-sm hover:bg-gray-50` — see
that file ~:422-444) — a deliberate visual-consistency reuse, not a code extraction (different
underlying data shape: post-creation `City` rows with an `id` vs. pre-creation
`GeocodeCandidate`s that don't have one yet).

When `truncated` is true, renders "There may be more matches not shown." below the list —
the BUG-79 caveat, same phrasing family as the region-select/Suggested-caption caveats
elsewhere in `AddPlaceFlow.tsx`.

## AddPlaceFlow's ambiguity-detection trigger (where the caller decides to render it)

`AddPlaceFlow.tsx`'s `handleOpenNewCityForm` fires the picker only when 2+ candidates for the
resolved country carry **distinct `osm_id`** (positive identity evidence) — never inferred from
`region_iso`/`display_name` alone. See that file's inline comment above `distinctOsmIds` and the
park doc's "THE SCOPE DECISION" section for why this is narrower than a naive "any 2+ candidates"
trigger would be (a currently-green regression-parity test — Denver/Denver County sharing one
region with no `osm_id` — requires it).

## Extending to a second call site (UX-12)

When UX-12 is briefed:
1. Build the "Change city" control + modal shell (UX spec
   `jobs/ux/tech/20260801-UX-city-entry-and-disambiguation-spec.md` §12 MVP).
2. Run a geocode lookup for the typed replacement name (reuse `lookupCityCountry` from
   `useCities.ts` — same function AddPlaceFlow already uses).
3. Render `<CityPicker candidates={...} onSelect={...} truncated={...} />` unchanged.
4. `onSelect`'s handler PATCHes the place's `city_id` (D11 re-point, already on `main`) with the
   candidate's carried identity — mirrors `handleSelectPickerCandidate`'s derivation of
   `region_id` from `region_iso` via the seeded region map, but targets the re-point endpoint
   instead of `POST /api/cities`.

No change to `CityPicker.tsx` itself should be required for this — if one turns out to be needed,
that's a signal the component's contract was under-specified here, not a routine follow-on edit.

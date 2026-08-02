# BUG-71 stopgap + BUG-72 — city ambiguity surfacing in Add Place

Date: 2026-08-02 · GitHub issue #363 · Tracker BUG-71/BUG-72 · BRD GE-16

Both changes live entirely in `src/frontend/components/TripDetail/AddPlaceFlow.tsx`.
For the broader component tree see `20260308-frontend-component-reference.md`
(marked partial/stale — this file documents only what this thread added).

## Governing spec

`jobs/ux/tech/20260801-UX-city-entry-and-disambiguation-spec.md` §3.2 (the
"Suggested:" chip pattern) and the brief's explicit framing that this is a
minimal stopgap, not the fuller §11/§12 resolution design. No badge, no
"Change City" control, no map counter exist after this PR.

## BUG-71 — `regionIsSuggested` state

New boolean state, alongside the pre-existing `autoRegionIso`/
`candidateRegionIsos`. Set `true` only inside the single-candidate auto-fill
branch:

```ts
if (sameCountryRegionIsos.length > 1) {
  setCandidateRegionIsos(sameCountryRegionIsos); // D14 — unchanged
} else if (regionIso) {
  setAutoRegionIso(regionIso);
  setRegionIsSuggested(true); // BUG-71 — new
}
```

Mutually exclusive with `regionChoiceIsAmbiguous` (`candidateRegionIsos !==
null`) by construction — only one branch of the `if`/`else if` ever runs per
lookup. The render condition is `regionIsSuggested && !regionChoiceIsAmbiguous
&& suggestedRegionName`, where `suggestedRegionName` is a derived lookup
(`countryRegions.find(r => r.id === newCityRegionId)?.name`) rather than
separately-tracked state — one less thing to keep in sync.

Reset to `false` in three places, matching where the existing
`autoRegionIso`/`candidateRegionIsos` resets already lived:
1. `handleOpenNewCityForm` (fresh lookup)
2. Country `<select>` onChange (country change invalidates the whole
   auto-detected state)
3. Region `<select>` onChange (an explicit user pick is never "just a
   suggestion" again — UX spec §1 tier 1)

Why every single-candidate auto-fill is treated as tentative, not just the
literal Springfield-shaped case: the frontend has no way to distinguish "this
name genuinely has one region" (Denver — multiple Nominatim hits, one real
region, already covered by the D14 parity test in AddPlaceFlow.test.tsx) from
"this name is globally ambiguous but got truncated to one region by
Nominatim's 10-slot limit + the non-null-region_iso filter" (Springfield ->
Virginia). Both take the identical code path. Distinguishing them would need
either a changed geocode request (out of scope — explicitly named in the
brief) or truncation detection (also out of scope). Treating both uniformly
as "suggested, not committed" is the correct behaviour under both today's
geocoder and a possible future local city dataset (per the brief) — nothing
built here is throwaway.

## BUG-72 — `formatCitySubtitle()`

```ts
function formatCitySubtitle(
  city: { country_code: string; region_name?: string | null },
  countries: Country[],
): string {
  const country = countries.find((c) => c.country_code === city.country_code);
  if (!country?.region_tier_enabled) return city.country_code;
  if (city.region_name) return `${city.region_name}, ${city.country_code}`;
  const label = (country.region_tier_label ?? 'region').toLowerCase();
  return `${city.country_code} (no ${label} set)`;
}
```

Three output shapes, deliberately distinct strings (never just "present vs.
absent region" collapsing to the same visual weight):
- Regioned, region-tier country: `Illinois, US`
- No region, region-tier country: `US (no state set)`
- Non-region-tier country (unchanged): `US`

Consumes the existing `countries` list AddPlaceFlow already loads via
`useCountries()` — no new query. Backend data source: `GET /api/cities`'s
search handler (`src/backend/routes/cities.ts`) LEFT JOINs `regions` and
selects `region_name`/`region_iso` — shipped in PR #353, independently
re-verified in this thread (route read directly, not taken from the brief).

### `City.region_name` — optional, not required

Added to `src/frontend/types/api.ts` as `region_name?: string | null`,
**optional**. It is genuinely absent (not merely `null`) from every other
`City`-shaped response in the codebase — `serializeCity` (cities.ts,
POST/PATCH responses) and the trip-detail/map `City` shapes never select the
column. Marking it required broke `type:check:all` at five unrelated test
fixture call sites (CityMarkers, ReviewPanel, PlaceSection, TripDetail,
filterAndSortTrips); optional is both the accurate contract and avoids
touching five files outside this bug's scope.

## Test files

- `__tests__/AddPlaceFlow.bug71.test.tsx` — 4 tests, mocks `lookupCityCountry`
  directly (same pattern as the existing D14 file).
- `__tests__/AddPlaceFlow.bug72.test.tsx` — 3 tests, mocks `useCitySearch` to
  return a controllable fixture array (the existing D14 file always returns
  `[]`, so this is a new mocking shape for this component's test suite).
  Added `data-testid="city-search-result-{id}"` to each row since no prior
  test queried into this render path.

Both files are new and separate from `AddPlaceFlow.test.tsx` (D14) and
`AddPlaceFlow.geocodeFailure.test.tsx` (BUG-73) — same precedent BUG-73's own
thread set: touch only surrounding lines, not either file, while multiple
bugs are in flight on one component.

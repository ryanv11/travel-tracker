# AddPlaceFlow trip-country filter (BUG-87 / GE-20)

New shared util: `src/frontend/utils/formatCountriesFilterNote.ts`
Changed: `src/frontend/hooks/useCities.ts`, `AddPlaceFlow.tsx`,
`useTripDetailController.ts`, `TripDetail.tsx`, `MobileTripDetailView.tsx`

## Problem it solves

The add-place picker's two lookups — the DB city search (`GET /api/cities`)
and the geocode discovery lookup that auto-populates country/region on
"+Add new" (`GET /api/geocode`) — were unfiltered by the trip's declared
countries. Searching "Newport" on a UK-only trip returned USA Newports.
Backend contract (`country_codes` on both endpoints, comma-joined ISO
alpha-2, present-but-empty = unconstrained) already shipped; this thread is
the frontend consumer.

## `useCities.ts` API changes

```ts
useCitySearch(query: string, countryCodes: string[] = []): UseQueryResult<City[]>
lookupCityCountry(cityName: string, countryCodes: string[] = []): Promise<{...}>
```

Both send `country_codes=<countryCodes.join(',')>` on every request —
**always present**, even as an empty string. This is the mechanism behind
GE-20's "cannot be bypassed from within the picker" guarantee: a
zero-country trip still sends the filter param, it just resolves to
unconstrained on the backend (documented contract), rather than the
frontend silently omitting it.

`countryCodes` defaults to `[]` so callers outside GE-20's scope —
`ChangeCityModal.tsx`'s `useCitySearch(debouncedQuery)` call, the "Change
City" re-point flow — keep compiling and keep their exact pre-existing
unconstrained behaviour with zero call-site change required.

## `AddPlaceFlow.tsx` new props

```ts
interface AddPlaceFlowProps {
  // ...existing props...
  tripCountries: { country_code: string; name: string }[]; // trip.countries, already on the payload
  onManageCountries: () => void; // opens the trip's country editor
}
```

`countryCodes = tripCountries.map(c => c.country_code)` is derived once per
render and passed into both `useCitySearch` and the `lookupCityCountry` call
inside `handleOpenNewCityForm` — this is the one code path both lookups
share, so there is no way to update one without the other.

Three render states above the search input (search step only,
`!showNewCityForm`):
- `tripCountries.length > 0` → "Filtered to: `<names>`" note
  (`formatCountriesFilterNote`).
- `tripCountries.length === 0` → unconstrained prompt + "Add countries"
  button (`onManageCountries`).
- A settled, non-loading, zero-result search with `tripCountries.length > 0`
  → "No matches in `<names>`." + "Add a different country to this trip"
  button, rendered above the existing "+ Add new" row (which stays
  functional — an empty DB search can't tell "not catalogued yet, still
  in-set" apart from "genuinely out of set").

## `formatCountriesFilterNote(countries)`

```ts
function formatCountriesFilterNote(
  countries: { country_code: string; name: string }[],
): string
```

`''` for zero countries. Full names joined by `", "` for up to 2 countries.
Beyond 2, the first 2 names plus a `+N` count for the remainder — e.g. 4
declared countries render as `"United Kingdom, France +2"`. One formatter
shared by both the note and the empty-state so the truncation rule can't
drift between the two render sites (same precedent as
`formatCitySubtitle.ts`).

## `useTripDetailController.handleManageCountries`

```ts
const handleManageCountries = useCallback(() => {
  setShowAddPlace(false);
  setShowEdit(true);
}, []);
```

Closes `AddPlaceFlow`, opens the existing `TripForm` edit modal — that modal
already renders the country multi-select (`TripForm.tsx:56/115`), so this is
the "trip's country editor" GE-20 refers to. Reused, not duplicated: both
`TripDetail.tsx` (desktop) and `MobileTripDetailView.tsx` (mobile) pass
`c.handleManageCountries` as `AddPlaceFlow`'s `onManageCountries`, rather
than each defining its own two-line inline callback.

## Call sites

- `src/frontend/components/TripDetail/TripDetail.tsx` — desktop.
- `src/frontend/components/TripDetail/MobileTripDetailView.tsx` — mobile.

There is one `AddPlaceFlow` component, not two "twins" — both call sites
render the same component with `tripCountries={trip.countries}` and
`onManageCountries={c.handleManageCountries}`.

## Known scope boundaries (not bugs — deliberate, flagged to COO/PO)

- `ChangeCityModal.tsx` (the "Change City" re-point flow) is **not**
  filtered — GE-20 and ADL-54 D6 both scope this feature to adding a new
  place, not re-pointing an existing one.
- The "+Add new" city-creation form's manual country `<select>` (every
  country, unfiltered) is **not** restricted to the trip's declared set —
  a narrow way a determined user could still create an out-of-trip-country
  city today. Neither ADL-54 nor its fresh-eyes review scoped "the picker"
  to include this manual fallback.

## Extending this

Adding a third lookup surface that should honour the trip's country filter:
compute its `countryCodes` the same way (`tripCountries.map(c =>
c.country_code)`) and pass it through, rather than re-deriving from
`trip.countries` inline at a new call site.

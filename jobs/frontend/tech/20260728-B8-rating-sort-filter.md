# B8 — Rating Sort/Filter (IT-08/IT-09)

Date: 2026-07-28 · GitHub issue #317 · PR #318 · Tracker BRD-IT0809

New pieces added by this brief. For the broader component tree see
`20260308-frontend-component-reference.md` (marked partial/stale — this file
documents only what B8 added, not a re-sync of that tree).

## `applyRatingSortFilter` (src/frontend/hooks/useItems.ts)

Pure function: `(items: Item[], state: RatingSortFilterState) => Item[]`.

```ts
type RatingSortOrder = 'asc' | 'desc' | null; // null = no sort applied
interface RatingSortFilterState {
  sortOrder: RatingSortOrder;
  minRating: number | null; // null = no filter applied
}
const DEFAULT_RATING_SORT_FILTER: RatingSortFilterState = { sortOrder: null, minRating: null };
```

Semantics (matched to the backend's own sort_by=rating/min_rating behaviour
in `src/backend/routes/items-helper.ts` and `cities.ts`):
- A `minRating` filter drops any item with `rating === null` — never
  coerces null to 0.
- A `sortOrder` sort always places `rating === null` items last, regardless
  of asc/desc direction.
- `DEFAULT_RATING_SORT_FILTER` is a no-op — returns the input list as-is.
- Does not mutate its input.

Used by `PlaceSection.tsx` as client-side local state (see "Why client-side"
below). Not a React hook itself — safe to import and call anywhere a
plain `Item[]` is available.

## `RatingSortFilterControls` (src/frontend/components/shared/RatingSortFilterControls.tsx)

Controlled, presentational only — no internal state, no data fetching.

```tsx
<RatingSortFilterControls
  sortOrder={state.sortOrder}
  minRating={state.minRating}
  onSortOrderChange={(sortOrder) => setState((s) => ({ ...s, sortOrder }))}
  onMinRatingChange={(minRating) => setState((s) => ({ ...s, minRating }))}
/>
```

Renders a sort `<select>` (aria-label "Sort by rating"), a minimum-rating
`<select>` (aria-label "Minimum rating filter"), and a "Clear" button shown
only when either control has a non-default value — clicking it calls both
change handlers with `null`. Used identically by `PlaceSection.tsx`
(client-side application) and `CityItemsPage.tsx` (server-side application
via query params) so both surfaces present the same control shape — this is
what makes them "behave identically" per IT-09's success criteria; the
component itself is agnostic to how its onChange values get applied.

## `useCityItems` (src/frontend/hooks/useCities.ts)

```ts
function useCityItems(
  cityId: number | undefined,
  params?: { sortOrder?: RatingSortOrder; minRating?: number | null },
): UseQueryResult<CityItem[]>
```

Wraps `GET /api/cities/:id/items`. Always sends `sort_by=rating`; sends
`sort_order`/`min_rating` only when set (the endpoint already defaults to
rating DESC unfiltered with neither param). Query key:
`['cities', cityId, 'items', sortOrder ?? null, minRating ?? null]`.

## `CityItemsPage` (src/frontend/pages/CityItemsPage.tsx)

New page at route `/cities/:id` (registered in `App.tsx`). Renders every
completed restaurant/hotel/experience item across every trip that visited
the city (IT-09), each attributed to its source trip via a
`trip_name · trip_start_date` badge (`CityItem` carries these fields
directly, no join needed client-side).

The page's heading (city name + country) comes from `useLocation().state`,
passed by the `<Link>` in `PlaceSection.tsx` — the `CityItem` API response
itself carries no city name/country (it's scoped by `:id` in the URL, so the
backend doesn't repeat it per row). A direct or refreshed visit with no
router state falls back to a generic "This city" heading. **If a second
entry point into this page is ever added** (e.g. a city search/index) that
doesn't come from a `<Link state={...}>`, it will hit this fallback — either
pass equivalent state or add a `useCity(cityId)` fetch (there's a raw
`apiGet<City>('/api/cities/:id')` call pattern already in
`useGeocodeRetryQueue.ts` to model a hook on, no such hook exists yet).

## Why PlaceSection is client-side, CityItemsPage is server-side

`PlaceSection.tsx` receives `place.items` pre-loaded, nested inside the
trip detail fetch (`GET /api/trips/:id`, consumed by `TripDetail.tsx` /
`MobileTripDetailView.tsx` via whatever hook they use — not `useTripLevelItems`,
that's `TripItemsSection.tsx`'s separate flat-endpoint hook for trip-level
items only). That nested endpoint has no `sort_by`/`min_rating` query
support (`src/backend/routes/trips.ts`'s `buildTripResponse` doesn't
reference either param). Sorting/filtering client-side over the array
already in hand avoids restructuring that data flow into N per-place
fetches — and incidentally gives "sort/filter state doesn't leak between
trips" for free, since each `PlaceSection` instance's local `useState`
naturally resets when React remounts it under a different trip's different
place IDs.

`CityItemsPage.tsx` calls `GET /api/cities/:id/items` directly — a
dedicated flat endpoint with no nested-response constraint — so
`useCityItems`'s params pass straight through as real server-side query
params.

## Item list views enumerated for IT-08 ("all item list views")

| View | Controls | Rationale |
|---|---|---|
| `PlaceSection.tsx` | Yes | Only place rateable items (restaurant/hotel/experience) render |
| `TripItemsSection.tsx` | No | Flight/Car Rental only — `ItemCard.hasRating` never true for either |
| `CityItemsPage.tsx` (new) | Yes | IT-09's cross-trip view |
| `ReviewPanel.tsx`/`ReviewItemRow.tsx` | No | Rating-assignment flow (pre-completion), not a browse view |

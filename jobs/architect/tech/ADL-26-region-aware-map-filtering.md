# ADL-26 — Region-aware map click filtering

**Date:** 2026-03-21
**Status:** Decided
**Tracker:** MAP-01
**GitHub:** #52
**Author:** Architect

---

## 1. Context

The world map highlights countries and individual regions (states/provinces) with colour shading. When a user clicks a highlighted polygon, the trip list should filter to show only trips that include that location. The filter routing via URL params (`?country=XX`, `?region=XX-YY`, `?city=NNN`) is already in place. `filterAndSortTrips` already accepts a `_regionFilter` parameter, but its implementation is intentionally stubbed (`_` prefix, no matching logic).

This ADL resolves the four open questions recorded in the MAP-01 tracker notes and specifies exactly what must be implemented to close the feature.

---

## 2. Findings from codebase inspection

### 2.1 Click event shape from MapLibre

`MapView.tsx` registers two interactive polygon layers: `countries-fill` and `regions-fill`. The `handleMapClick` handler already branches on `feature.layer.id`:

**Country click (`countries-fill`):**
- Property available: `feature.properties.ISO_A2` — ISO 3166-1 alpha-2 code (e.g. `"US"`)
- Source: Natural Earth country boundary GeoJSON
- Current behaviour: navigates to `/trips?country=US`
- No change needed to the click handler for country clicks

**Region click (`regions-fill`):**
- Property available: `feature.properties.iso_3166_2` — ISO 3166-2 subdivision code (e.g. `"US-CA"`, `"AU-NSW"`)
- Source: Natural Earth admin-1 (state/province) boundary GeoJSON
- Current behaviour: navigates to `/trips?country=US&region=US-CA` (country extracted via `isoCode.split('-')[0]`)
- The URL already carries both `country` and `region` params on a region click

The URL param shape is already correct. `TripsLayout` already reads both `countryFilter` (from `?country=`) and `regionFilter` (from `?region=`) from `useSearchParams`.

### 2.2 City-to-region field: `cities.region_id` → `regions.iso_3166_2`

The schema chain is:

```
cities.region_id  →  regions.id
regions.iso_3166_2  (e.g. "US-CA")
```

In the `cities` table, `region_id` is a nullable FK to `regions.id`. It is `NULL` for cities in countries where `region_tier_enabled = 0` (no region tier). For countries where `region_tier_enabled = 1` (USA, Australia, Canada, etc.), `region_id` points to the matching row in the `regions` table, which carries `iso_3166_2`.

The `TripSummaryPlace` shape (used by `filterAndSortTrips`) currently includes:

```typescript
interface TripSummaryPlace {
  id: number;
  city_id: number;
  city: City;
}

interface City {
  id: number;
  name: string;
  country_code: string;
  country_name: string | null;
  region_id: number | null;      // ← present, but not sufficient alone
  latitude: number | null;
  longitude: number | null;
  geocode_status: GeocodeStatus;
}
```

`City` carries `region_id` (the numeric FK), but **not** `iso_3166_2`. The `regionFilter` URL param is the ISO 3166-2 string (e.g. `"US-CA"`). Matching by numeric `region_id` alone would require a secondary lookup from `region_id → iso_3166_2` on the frontend, which the frontend does not have.

**Resolution:** The backend `/api/trips` summary endpoint must include `iso_3166_2` on the `city` object inside each `TripSummaryPlace`. This is a minimal additive change to the API response — one new field on the `City` type. The frontend filter can then match directly:

```
place.city.region_iso === regionFilter
```

### 2.3 Does the map shading API return `region_tier_enabled`?

The `GET /api/map/shading` endpoint (all-country shading) returns:

```json
{ "country_code": "US", "state_key": "visited_multiple", "color_hex": "#...", "display_name": "..." }
```

It does **not** return `region_tier_enabled`. The frontend has no current mechanism to know whether a given country has region-tier shading enabled.

However — this does not block filter correctness. The click handler in `MapView.tsx` already distinguishes country clicks from region clicks by `feature.layer.id`. A region polygon only appears in the `regions-fill` layer if the backend has region data for that country (the `useRegionShading` hook is only invoked for `region_tier_enabled` countries). There is no scenario where the `regions-fill` layer fires for a country without `region_tier_enabled = 1`.

Therefore, **no change to the shading API is required** to support filter granularity. The click event layer ID is a reliable discriminator.

---

## 3. Decisions

### Decision 1 — Filter granularity is determined by click layer, not zoom or API flag

When `feature.layer.id === 'regions-fill'`, the filter is by region (`iso_3166_2`).
When `feature.layer.id === 'countries-fill'`, the filter is by country code.

This is already implemented in `MapView.tsx` via the URL params it writes. No change to the click handler or shading API is needed.

### Decision 2 — `iso_3166_2` must be added to the `City` type in the API response

The `GET /api/trips` endpoint (list and summary) must include `region_iso` (the `iso_3166_2` value from the `regions` table) on the embedded `city` object within each place. This field is `null` when `region_id` is `null`.

**New field name:** `region_iso` (type: `string | null`)

The field is added to:
- The SQL query in the trips repository (join `cities` → `regions`, select `regions.iso_3166_2 as region_iso`)
- The backend serialisation of the trip summary response
- The `City` interface in `src/frontend/types/api.ts`

### Decision 3 — `filterAndSortTrips` region filter matching logic

The `_regionFilter` parameter (currently ignored) is implemented as follows:

```typescript
// Replace the existing country/city filter block:

if (cityFilter !== null) {
  result = result.filter((t) => t.places.some((p) => p.city_id === cityFilter));
} else if (regionFilter !== null) {
  // Region filter: match trips where any place's city is in the clicked region
  result = result.filter((t) =>
    t.places.some((p) => p.city.region_iso === regionFilter)
  );
} else if (countryFilter !== null) {
  result = result.filter((t) =>
    t.places.some((p) => p.city.country_code === countryFilter)
  );
}
```

Priority order: city > region > country. This matches the existing priority of city over country, and region logically sits between the two.

When `regionFilter` is non-null, `countryFilter` is also present in the URL (the click handler writes both), but the region filter alone is applied — there is no need to apply both, since every city in a region is already in that country.

---

## 4. API changes required

### 4.1 Trips summary endpoint — add `region_iso` to city

**Endpoint:** `GET /api/trips`
**Change:** Add `region_iso: string | null` to the `city` object inside each `TripSummaryPlace`.

This requires:
1. **Backend (repository):** Join `cities` → `regions` in the trip summary query and select `regions.iso_3166_2`. This join already exists in `shading.service.ts` (line ~47) so the pattern is established.
2. **Backend (serialisation):** Include `region_iso` in the place/city serialisation block.
3. **Frontend (types):** Add `region_iso: string | null` to the `City` interface in `src/frontend/types/api.ts`.

No new endpoints. No schema changes. No migration needed.

### 4.2 No changes to the shading API

`GET /api/map/shading` and `GET /api/map/shading/regions/:code` do not need modification.

---

## 5. Edge cases

### 5.1 Trips with no places

A trip with an empty `places` array does not match any location filter. It is correctly excluded from city, region, and country filters by the `Array.prototype.some()` predicate returning `false`. No special handling needed.

### 5.2 Cities with `region_id = null` (no region data)

Cities in countries where `region_tier_enabled = 0` have `region_id = null`, so `region_iso` will be `null`. These cities will never match a region filter (because a region click can only come from a country with `region_tier_enabled = 1`, which will have a non-null `iso_3166_2`). The `null !== "US-CA"` comparison is safe — no special null guard is needed beyond what JavaScript provides.

### 5.3 Trips with places in both region-tier and non-region-tier cities of the same country

Example: a US road trip with stops in California (`region_iso = "US-CA"`) and a national park whose city record has `region_id = null`. Clicking "California" on the map should return this trip because at least one place matches `region_iso === "US-CA"`. The `Array.prototype.some()` predicate handles this correctly — the trip is included if any place matches.

### 5.4 Clicking a country that has `region_tier_enabled = 1`

When the user clicks the country polygon for the USA (zoom < `REGION_ZOOM_THRESHOLD`, so no region layer is rendered), `feature.layer.id === 'countries-fill'` fires and navigates to `?country=US`. The country filter applies, matching all trips with any US city regardless of region. This is the correct fallback — the region layer is not visible at low zoom, so country-level filtering is appropriate.

When zoomed in, the region polygons overlay the country polygons. MapLibre returns the topmost interactive feature — `regions-fill` sits above `countries-fill` in the layer stack, so a click on a rendered region returns the region feature, not the country feature. The existing layer ordering in `MapView.tsx` already handles this correctly.

### 5.5 Display label for region filter in the trip list UI

`TripsLayout` already shows `Region: {regionFilter}` when a region filter is active, using the raw ISO 3166-2 code (e.g. `Region: US-CA`). This is functional but not user-friendly. Improving the label to show a human-readable name (e.g. `Region: California`) is a UX enhancement outside the scope of this ADL. MAP-01 implementation should use the ISO code label as-is; a follow-up ticket can improve display if desired.

---

## 6. Implementation summary for agents

### Backend agent

1. In the trips repository (`src/backend/repositories/trips.ts` or equivalent): join `trip_places` → `cities` → `regions`, select `regions.iso_3166_2` aliased as `region_iso`.
2. Include `region_iso` in the trip summary response serialisation for each place's city.
3. Ensure `region_iso` is `null` (not omitted) when `cities.region_id` is `null`.

### Frontend agent

1. Add `region_iso: string | null` to the `City` interface in `src/frontend/types/api.ts`.
2. In `filterAndSortTrips` (`src/frontend/components/TripList/TripList.tsx`): replace the `_regionFilter` stub with the matching logic in Decision 3 above, and rename the parameter from `_regionFilter` to `regionFilter`.

No schema migration, no new API endpoint, no shading API changes.

---

## 7. Options considered and rejected

**Option: infer filter granularity from current zoom level**
Rejected per COO session 7 direction. Zoom-based inference is fragile — the same zoom level renders differently at different geographic scales (e.g. zoom 4 over the continental USA is very different from zoom 4 over Luxembourg). The data-driven approach (click layer ID) is reliable and already implemented.

**Option: add `region_tier_enabled` to the `/api/map/shading` response and use it in the click handler**
Rejected as unnecessary. The click layer ID is a perfectly reliable discriminator. Adding `region_tier_enabled` to the shading response would require the frontend to maintain a lookup map, add complexity for no gain.

**Option: pass `region_id` (numeric) instead of `iso_3166_2` (string) on the city response**
Rejected. The URL param from the MapLibre click event is the ISO 3166-2 string (`feature.properties.iso_3166_2`). Matching numerically would require a secondary client-side lookup from `region_id` to the ISO code, which introduces an additional data dependency. String comparison against `iso_3166_2` is direct and requires only one new field.

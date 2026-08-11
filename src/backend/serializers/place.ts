/**
 * Travel Tracker — Place serializers (QUAL-49)
 *
 * The single home for turning a trip_place row into its snake_case API shape,
 * closing the "persisted-but-dropped" bug class (BUG-31 place dates).
 *
 * The API emits FOUR distinct place shapes today and QUAL-49 preserves each
 * byte-for-byte. They are NOT one shape mapped four ways — the differences are
 * deliberate (list summary vs. detail) or reflect which columns the query joined:
 *   - serializePlaceSummary   trips LIST — {id, city_id, city}; a minimal
 *                             "city pin" (no dates/activities/items). The nested
 *                             city carries region names but not country_name.
 *   - serializePlaceListItem  places list & create — adds dates + activities;
 *                             nested city has region names, no country_name; no items.
 *   - serializePlaceDetail    trips DETAIL — adds dates + activities + items;
 *                             nested city ALSO carries country_name.
 *   - serializePlaceRaw       places PATCH — the raw trip_place row (trip_id,
 *                             user_id, updated_at); no nested city or activities.
 *
 * The caller chooses the matching city serializer (city.ts) and passes it in, so
 * the place shape and its city shape stay explicit at each call site. The
 * date-bearing place core is written once here.
 *
 * IMPORTANT (QUAL-49): summary and list/detail are intentionally different — do
 * NOT unify them. Adding dates/activities/items to the trips LIST response, or
 * country_name to the places list response, is a behaviour change.
 */

/** The trip_place fields the date-bearing place shapes surface. */
export interface PlaceCoreRow {
  id: number;
  cityId: number;
  arrivedOn: string | null;
  departedOn: string | null;
  createdAt: string;
}

/** {id, city_id, arrived_on, departed_on, created_at} — shared by list & detail. */
function placeCoreWithDates(p: PlaceCoreRow) {
  return {
    id: p.id,
    city_id: p.cityId,
    arrived_on: p.arrivedOn ?? null,
    departed_on: p.departedOn ?? null,
    created_at: p.createdAt,
  };
}

export interface PlaceActivity {
  id: number | null;
  name: string | null;
}

/**
 * trips LIST place — minimal "city pin": {id, city_id, city}. `city` is a
 * pre-serialized city object (region variant — NOT country, the list omits it).
 */
export function serializePlaceSummary(p: { id: number; cityId: number }, city: object) {
  return {
    id: p.id,
    city_id: p.cityId,
    city,
  };
}

/**
 * places list & create place — dates + activities, no items. `city` is a
 * pre-serialized city object (region variant).
 */
export function serializePlaceListItem(p: PlaceCoreRow, city: object, activities: PlaceActivity[]) {
  return {
    ...placeCoreWithDates(p),
    city,
    activities,
  };
}

/**
 * trips DETAIL place — dates + activities + items. `city` is a pre-serialized
 * city object (country variant — the detail response carries country_name).
 */
export function serializePlaceDetail(
  p: PlaceCoreRow,
  city: object,
  activities: PlaceActivity[],
  items: Record<string, unknown>[],
) {
  return {
    ...placeCoreWithDates(p),
    city,
    activities,
    items,
  };
}

/** The raw trip_place row returned by PATCH /api/trips/:tripId/places/:placeId. */
export interface RawPlaceRow {
  id: number;
  tripId: number;
  cityId: number;
  userId: string;
  arrivedOn: string | null;
  departedOn: string | null;
  createdAt: string;
  updatedAt: string;
}

/** places PATCH — the raw place row; no nested city, no activities. */
export function serializePlaceRaw(place: RawPlaceRow) {
  return {
    id: place.id,
    trip_id: place.tripId,
    city_id: place.cityId,
    user_id: place.userId,
    arrived_on: place.arrivedOn ?? null,
    departed_on: place.departedOn ?? null,
    created_at: place.createdAt,
    updated_at: place.updatedAt,
  };
}

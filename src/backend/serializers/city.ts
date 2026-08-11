/**
 * Travel Tracker — City serializers (QUAL-49)
 *
 * The single home for turning a city DB row into its snake_case API shape,
 * closing the "persisted-but-dropped" bug class (BUG-80 region_name/region_iso).
 * Before this, the same city object literal was hand-written at six sites; a
 * dropped `region_iso: … ?? null` in any one of them was a silent field-drop.
 *
 * Three COMPOSED variants, because the API genuinely emits three different city
 * shapes today and QUAL-49 preserves each byte-for-byte (they are NOT
 * interchangeable — routing a base-shape response through the region variant, or
 * vice-versa, would add or drop a field):
 *   - serializeCity            base fields only — the query did not join `regions`
 *                              (POST /api/cities, PATCH /api/cities/:id).
 *   - serializeCityWithRegion  + region_iso / region_name — query LEFT JOINed
 *                              `regions` (GET /api/cities/:id, the nested city on
 *                              places list/create and the trips LIST response).
 *   - serializeCityWithCountry + country_name — query also LEFT JOINed `countries`
 *                              (the nested city on the trips DETAIL response only).
 *
 * The variants compose (WithCountry → WithRegion → base) so the snake_case key
 * mapping and the `?? null` normalisation live in exactly one place. Callers pass
 * a canonical camelCase row; `cityRowFromPlaceJoin` adapts the `city*`-prefixed
 * rows the place/trip joins return.
 */

/** Canonical camelCase city row — the base fields every city query returns. */
export interface CityBaseRow {
  id: number;
  name: string | null;
  countryCode: string | null;
  regionId: number | null;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: string | null;
}

/** A city row whose query LEFT JOINed `regions`. */
export interface CityRegionRow extends CityBaseRow {
  regionIso: string | null;
  regionName: string | null;
}

/** A city row whose query also LEFT JOINed `countries`. */
export interface CityCountryRow extends CityRegionRow {
  countryName: string | null;
}

/** Base city shape — no region names. */
export function serializeCity(row: CityBaseRow) {
  return {
    id: row.id,
    name: row.name,
    country_code: row.countryCode,
    region_id: row.regionId,
    latitude: row.latitude,
    longitude: row.longitude,
    geocode_status: row.geocodeStatus,
  };
}

/** Base + region_iso / region_name. */
export function serializeCityWithRegion(row: CityRegionRow) {
  return {
    ...serializeCity(row),
    region_iso: row.regionIso ?? null,
    region_name: row.regionName ?? null,
  };
}

/** Base + region + country_name. */
export function serializeCityWithCountry(row: CityCountryRow) {
  return {
    ...serializeCityWithRegion(row),
    country_name: row.countryName ?? null,
  };
}

/**
 * The `city*`-prefixed columns a place/trip join returns (see
 * `tripRepository.getPlaces` and `placeRepository.findByTrip`). `cityCountryName`
 * is present only when the query LEFT JOINed `countries` (getPlaces does;
 * findByTrip does not) — it is optional here and defaults to null, which the
 * region variant ignores anyway.
 */
export interface CityPlaceJoinRow {
  cityId: number;
  cityName: string | null;
  cityCountryCode: string | null;
  cityCountryName?: string | null;
  cityRegionId: number | null;
  cityRegionIso: string | null;
  cityRegionName: string | null;
  cityLatitude: number | null;
  cityLongitude: number | null;
  cityGeocodeStatus: string | null;
}

/** Adapts a `city*`-prefixed join row to the canonical camelCase city row. */
export function cityRowFromPlaceJoin(p: CityPlaceJoinRow): CityCountryRow {
  return {
    id: p.cityId,
    name: p.cityName,
    countryCode: p.cityCountryCode,
    regionId: p.cityRegionId,
    regionIso: p.cityRegionIso ?? null,
    regionName: p.cityRegionName ?? null,
    countryName: p.cityCountryName ?? null,
    latitude: p.cityLatitude,
    longitude: p.cityLongitude,
    geocodeStatus: p.cityGeocodeStatus,
  };
}

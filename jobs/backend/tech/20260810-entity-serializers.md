# Entity serializers — src/backend/serializers/ (QUAL-49)

The single home for turning a DB row into its snake_case API response shape.
Closes the "persisted-but-dropped-from-response" bug class (BUG-31 place dates,
BUG-80 region_name/region_iso): a field the DB persists but the response omits.
Before this, the same city/place object literal was hand-written at many sites,
so a dropped `region_iso: … ?? null` in any one was a silent field-drop.

Rule for any new response emitting these entities: **import the serializer; never
hand-write the object.**

## Modules

### `city.ts`
Three composed variants — because three different city query shapes exist today,
each preserved byte-for-byte. Pick the one matching what your query joined:

| function | fields | use when the query… |
|---|---|---|
| `serializeCity(row)` | id, name, country_code, region_id, latitude, longitude, geocode_status | did NOT join `regions` (POST /api/cities, PATCH /api/cities/:id) |
| `serializeCityWithRegion(row)` | + region_iso, region_name | LEFT JOINed `regions` (GET /api/cities/:id, places GET/POST, trips LIST) |
| `serializeCityWithCountry(row)` | + country_name | ALSO LEFT JOINed `countries` (trips GET/:id nested city only) |

Input is a canonical camelCase row (`CityBaseRow`/`CityRegionRow`/`CityCountryRow`).
For the `city*`-prefixed rows a place/trip join returns, adapt with
`cityRowFromPlaceJoin(joinRow)` first.

### `place.ts`
Four distinct place shapes — deliberately different (list summary vs. detail) or
reflecting which columns the query joined. Do **not** unify them.

| function | shape | endpoint |
|---|---|---|
| `serializePlaceSummary(p, city)` | {id, city_id, city} | trips LIST — minimal city pin |
| `serializePlaceListItem(p, city, activities)` | + arrived_on, departed_on, created_at, activities | places GET / POST |
| `serializePlaceDetail(p, city, activities, items)` | + items | trips GET/:id |
| `serializePlaceRaw(place)` | {id, trip_id, city_id, user_id, arrived_on, departed_on, created_at, updated_at} | places PATCH (raw row, no nested city) |

`city` is passed in already-serialized so the city variant is explicit at the
call site (trips LIST uses WithRegion; trips DETAIL uses WithCountry).

### `trip.ts`
`serializeTrip(trip, { associations, places, countries })` — the envelope shared
by the trips list and detail handlers. `places` is the already-serialized array
(summary for list, detail for GET/:id); that array is the only difference
between the two responses.

### `item.ts`
`serializeItem(row)` + `ItemRow` — moved verbatim from `repositories/items-helper.ts`.
Base fields always present; the type block is chosen by `item_type` (flight /
hotel / car_rental / restaurant / experience). Every item response already flows
through it via `fetchItemsWithExtensions`.

## Preserved divergences (candidate follow-ups, NOT closed here)
- **cities POST/PATCH omit region_iso/region_name** (their queries don't join
  regions). Every city site except trips DETAIL omits **country_name**. Making
  the city shape uniform would change those responses — out of scope for a
  byte-identical refactor. If the PO wants them closed, it needs the queries to
  join regions/countries plus a deliberate shape change.
- **trips LIST vs DETAIL place shape** is intentionally different (minimal pin
  vs. full). Not a bug; do not collapse.

## Regression net
`routes/__tests__/serializer-characterization.test.ts` pins the exact key set of
every entity response + the load-bearing values. Written before the extraction,
green throughout. A dropped field fails it.

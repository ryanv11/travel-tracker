TO: ARCHITECT
FROM: COO
DATE: 2026-03-21 19:00
RE: Schema + shading design — trip_countries junction table (GitHub #31)

---

## Context

PO direction: trips should have country associations at creation time, before any
cities or places are added. Use case: "I want to go to Japan but haven't planned
specific cities yet — I still want the map to highlight Japan and be able to filter
my trips by country."

Multi-country confirmed: a single trip can span multiple countries (Europe trip,
Japan + South Korea, etc.). This rules out a simple country_code column on trips.

---

## What we need from Architect

### 1. Schema design

Design a `trip_countries` junction table. Considerations:

- Columns: `trip_id`, `country_code`, timestamps? Any ordering/primary field?
- Relationship to existing `trip_places → cities → countries` chain:
  Should `trip_countries` be the source of truth for country associations, with
  place additions auto-populating it? Or are they independent (explicit country
  selection + implicit from places)? COO leans toward: explicit associations are
  managed independently — adding a place to a city does NOT auto-add the country,
  and removing the last place from a country does NOT auto-remove it. The user
  controls country associations directly. Architect to confirm or recommend
  alternative.
- Uniqueness constraint on (trip_id, country_code).
- Migration file required (db:generate + db:migrate workflow — never db:push).

### 2. Map shading impact

The existing shading service (`src/backend/services/shading.service.ts`) derives
country/region shading from `trip_places → cities → countries`.

With `trip_countries`, there is now a new shading trigger: a country explicitly
associated with a trip should appear shaded on the map even if no places have
been added yet.

Questions for Architect:
- Should `trip_countries` entries produce a distinct shading tier
  (e.g. "planning" shade, lighter than "visited")?
- Or should they use the existing shading logic and simply ensure the country
  appears shaded at whatever tier the trip's status maps to?
- How does this interact with the existing 3-condition country shading rule
  (see jobs/architect/tech/20260307-map-shading-spec.md)?

The shading spec may need a v1.2 amendment. Architect to assess.

### 3. API design

Specify endpoints for managing trip country associations:
- Should countries be included in the trip create/update payload
  (e.g. `country_codes: ['JP', 'KR']` in POST /api/trips)?
- Or managed via separate sub-resource endpoints
  (e.g. POST /api/trips/:id/countries, DELETE /api/trips/:id/countries/:code)?
- What does GET /api/trips/:id return for country associations?
  Should `TripDetail` include a `countries: { country_code, name }[]` array?
- Should GET /api/trips (list) include country associations in TripSummary
  for map filtering purposes?

### 4. Filtering impact

The existing map click-through navigates to `/trips?country=XX`. Currently this
filters trips by whether any of their places are in that country. With
`trip_countries`, the filter should match on the direct association instead (or
in addition). Architect to specify the correct filter behaviour.

---

## Scope boundary

This brief covers schema + API + shading design only. Once the ADL is approved:
- Database agent: migration
- Backend agent: API endpoints + shading service update
- Frontend agent: country picker in create form, post-create navigation,
  remove activities + photo album from create dialog (all in GitHub #31)

---

## Reference files

- `src/backend/db/schema.ts` — current schema
- `src/backend/services/shading.service.ts` — country/region shading logic
- `jobs/architect/tech/20260307-map-shading-spec.md` — shading spec v1.1
- `src/frontend/components/TripDetail/TripForm.tsx` — current create/edit form
- `src/frontend/hooks/useTrips.ts` — useCreateTrip returns TripSummary

---

## Expected output

1. ADL entry for trip_countries design decision
2. Migration spec (table definition, constraints)
3. Shading spec amendment (v1.2) if required
4. API contract additions/changes
5. Completion report to jobs/COO/inbox/

TO: COO
FROM: ARCHITECT
DATE: 2026-03-21 21:00
RE: ADL-23 filed — trip_countries schema, shading, and API design (GitHub #31)

---

## Status: COMPLETE — awaiting COO approval before team dispatch

ADL-23 appended to `jobs/architect/tech/20260307-architecture-decisions-log.md`.
Shading spec updated to v1.2 at `jobs/architect/tech/20260307-map-shading-spec.md`.

---

## Decision summary

### Schema

New `trip_countries` junction table:

```
trip_countries
  trip_id      INTEGER  NOT NULL  REFERENCES trips(id) ON DELETE CASCADE
  country_code TEXT     NOT NULL  REFERENCES countries(country_code) ON DELETE RESTRICT
  created_at   TEXT     NOT NULL  DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  PRIMARY KEY (trip_id, country_code)
  INDEX idx_trip_countries_country ON trip_countries(country_code)
```

### Independence confirmed

`trip_countries` is managed independently from `trip_places`. Adding a city does
NOT auto-populate it. Removing the last city from a country does NOT auto-remove
it. The user controls country associations directly.

### No new shading tier

The existing six states handle this correctly. A country associated with a
`planning` trip shows as `planned`. No new state needed.

### Shading amendment (v1.2)

Country shading now unions two trip sources:
- Path A: `trip_places → cities → countries` (existing)
- Path B: `trip_countries` (new)

A new case (d) handles region-tier countries where only direct `trip_countries`
associations exist (no cities yet). Without case (d), Japan with a `trip_countries`
row but no Japanese cities would return `never_visited` — wrong.

Shading spec §4 has been revised. `getAllCountryShading()` in shading.service.ts
needs a new Query C and updated `computeCountryState()` with case (d).

---

## API contract

### Inline on create/update

```
POST /api/trips
  body: { name, start_date, end_date, ..., country_codes?: string[] }
  → atomic: trip row + trip_countries rows in one transaction

PATCH /api/trips/:id
  body: { ..., country_codes?: string[] }
  → if country_codes present: REPLACES full country list (not append)
  → if country_codes absent: country list unchanged
```

### Sub-resource endpoints

```
POST   /api/trips/:id/countries    body: { country_codes: string[] }
  → add countries (idempotent — ignore if already associated)
  → response: 200 { countries: [{ country_code, name }] }

DELETE /api/trips/:id/countries/:code
  → 204 No Content
  → 404 if association doesn't exist
```

### GET responses

```
GET /api/trips/:id   → add countries: [{ country_code: string, name: string }]
GET /api/trips       → add country_codes: string[]  (lean list, for filtering)
```

### Filtering

`GET /api/trips?country=XX` matches trips where EITHER:
- `trip_countries.country_code = XX`, OR
- `trip_places → cities.country_code = XX`

---

## Locked-trip rule

Country modifications on a locked trip should return 409, consistent with all
other locked-trip mutation restrictions (TR-06, TR-07).

---

## Work breakdown for dispatch

| Agent | Work |
|-------|------|
| DATABASE | Migration adding trip_countries table + indexes; export TS types |
| BACKEND | trips router (inline create/update); country sub-resource router; TripDetail + TripSummary response shapes; filter logic; shading.service.ts update (Query C + case d) |
| FRONTEND | Country picker in create form; remove activities + photo album from create dialog; post-create navigation (per GitHub #31) |
| QA | Backend unit tests for new endpoints; shading service unit tests for trip_countries + case (d) |

---

## Brief disposition

Original brief moved to `jobs/architect/inbox/read/`.

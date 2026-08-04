# Travel Tracker — Backend API Reference

**Version:** 1.6
**Date:** 2026-08-04 (updated: QUAL-26 — `GET /health` documented, now returning the running
build's commit SHA alongside `status`)
**Previously:** 1.5, 2026-07-23 (ADL-28 AD-07/AD-08 — companions moved to /api/companions
requireAuth-only; map shading routes dropped requireOwner for requireAuth + per-user scoping)
**Base URL:** `http://localhost:3001`
**Author:** BACKEND

This document is the authoritative contract between BACKEND and FRONTEND. FRONTEND must be able to implement entirely from this document without asking BACKEND for clarification.

---

## Table of Contents

1. [Conventions](#conventions)
2. [Trips](#trips)
3. [Places (nested under Trips)](#places)
4. [Trip Countries (nested under Trips)](#trip-countries)
5. [Items (nested under Trips)](#items)
5. [Cities](#cities)
6. [Map Shading](#map-shading)
7. [Companions](#companions)
8. [Admin](#admin)
9. [Static Assets](#static-assets)
10. [Health](#health)
11. [Error Reference](#error-reference)

---

## Conventions

### Base URL
All API endpoints are prefixed with `/api`. The server runs on `http://localhost:3001` by default.

### Authentication
Since NR-14 (ADL-20), **all `/api/*` routes require a Clerk-issued JWT**. Send it as a bearer token:

```
Authorization: Bearer <clerk_jwt>
```

- Missing/invalid/expired token → **401 Unauthorized** (`{ "error": "Unauthorized" }`).
- The token is verified server-side against Clerk's JWKS (jose); the `iss` claim must match `CLERK_ISSUER`.
- Exempt (no token): `GET /health` and the `/geo/*` static assets — these sit outside `/api/`.
- **Owner-only routes** additionally require the caller to be the app owner (ADL-27); a non-owner
  gets **403 Forbidden** (`{ "error": "Forbidden" }`). These are: `/api/admin/categories`,
  `/api/admin/activities`, `/api/admin/countries` and `/api/admin/countries/:code/regions`
  **writes** (the two matching GET reads are requireAuth-only, ADL-38), and `POST /api/cities`.
  As of ADL-28 (2026-07-23), `/api/companions/*` and all of `/api/map/shading/*` (including
  `/config`) are **requireAuth only, not owner-gated** — see the Companions and Map Shading
  sections below.
- Cross-user access to another user's resource returns **404** (opaque, per SE-05), not 403.
- **Local/CI bypass:** with `BYPASS_AUTH=true` (backend) the server injects a fixed test user and
  skips verification. Contract tests run this way. Never set it in production (the server refuses
  to boot with it under `NODE_ENV=production`).

### Date Format
All dates are ISO 8601 strings:
- **Date only:** `"2026-06-01"` (YYYY-MM-DD) — used for trip dates, check-in/out dates
- **Timestamp:** `"2026-03-07T14:30:00.000Z"` (ISO 8601 with time) — used for `created_at`, `updated_at`

### Null Values
Fields with no data are returned as `null` (not omitted).

### Response Conventions
| Status | Meaning |
|--------|---------|
| `200 OK` | Successful GET or PATCH |
| `201 Created` | Successful POST |
| `204 No Content` | Successful DELETE — no body |
| `400 Bad Request` | Validation failure or invalid input |
| `401 Unauthorized` | Missing, invalid, or expired auth token |
| `403 Forbidden` | Trip is locked (write rejected), or owner-only route accessed by a non-owner |
| `404 Not Found` | Resource does not exist |
| `409 Conflict` | Uniqueness violation |
| `500 Internal Server Error` | Unexpected server error |

### Validation Errors (400)
When validation fails, the response includes a `details` array with per-field errors:
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "end_date", "message": "end_date must be on or after start_date" },
    { "field": "name", "message": "String must contain at least 1 character(s)" }
  ]
}
```
The `field` property uses dot notation for nested fields (e.g. `"items.0.name"`). Root-level errors use `"_root"`.

### Other Error Responses
All errors return JSON with an `error` string:
```json
{ "error": "Trip not found" }
{ "error": "Trip is locked" }
{ "error": "Trip already has this city" }
{ "error": "Internal server error" }
```

---

## Trips

### Item Types
Items attached to trip places have one of these types. Each has type-specific fields (described in Items section):

| `item_type` | Extension fields |
|-------------|-----------------|
| `"flight"` | `airline`, `flight_number`, `departure_airport`, `arrival_airport`, `departure_datetime`, `arrival_datetime`, `booking_reference`, `seat` |
| `"hotel"` | `property_name`, `address`, `check_in_date`, `check_out_date`, `booking_reference`, `confirmation_number`, `rating`, `post_visit_notes` |
| `"car_rental"` | `provider`, `pickup_location`, `dropoff_location`, `pickup_datetime`, `dropoff_datetime`, `booking_reference`, `vehicle_class` |
| `"restaurant"` | `name`, `neighbourhood_area`, `cuisine_type`, `source`, `rating`, `post_visit_notes` |
| `"experience"` | `rating`, `post_visit_notes` |
| `"note"` | *(no extension fields)* |

### Item Status Values
| `status` | Meaning |
|---------|---------|
| `"consider"` | On the shortlist, not yet decided |
| `"confirmed"` | Confirmed/booked |
| `"completed"` | Done — visited/used |
| `"cancelled"` | Decided not to do |
| `"next_time"` | Flagged for a future trip to this city |

### Trip Status Values
| `status` | Meaning |
|---------|---------|
| `"planning"` | Trip is being planned |
| `"active"` | Trip is currently underway |
| `"review_pending"` | Trip is complete; waiting for post-trip review |
| `"locked"` | Trip is fully reviewed and locked — no further edits |

### Trip Status Transitions
Only these transitions are allowed. All others return `400`.

| From | To | Allowed? |
|------|----|---------|
| `planning` | `active` | ✅ |
| `planning` | `review_pending` | ✅ (skip active for past trips) |
| `active` | `review_pending` | ✅ |
| `review_pending` | `locked` | ✅ |
| `review_pending` | `planning` | ✅ (cancel review) |
| `locked` | `review_pending` | ✅ (unlock — TR-07) |
| Any other | Any other | ❌ → 400 |

---

### GET /api/trips

List all trips with their associations.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by trip status. One of: `planning`, `active`, `review_pending`, `locked` |
| `category_id` | integer | No | Filter to trips that include this category |
| `activity_id` | integer | No | Filter to trips that include this activity |

**Response: `200 OK`**
```json
[
  {
    "id": 1,
    "name": "Europe Summer 2026",
    "start_date": "2026-06-01",
    "end_date": "2026-06-15",
    "status": "planning",
    "photo_album_ref": null,
    "created_at": "2026-03-07T14:30:00.000Z",
    "updated_at": "2026-03-07T14:30:00.000Z",
    "categories": [{ "id": 4, "name": "City Break" }],
    "companions": [{ "id": 2, "name": "Partner" }],
    "activities": [{ "id": 3, "name": "Dining" }, { "id": 7, "name": "Sightseeing" }],
    "places": [
      {
        "id": 1,
        "city_id": 1,
        "city": {
          "id": 1,
          "name": "Paris",
          "country_code": "FR",
          "region_id": null,
          "region_iso": null,
          "region_name": null,
          "latitude": 48.8566,
          "longitude": 2.3522,
          "geocode_status": "resolved"
        }
      }
    ]
  }
]
```

> **Note on `places` in list response:** The list endpoint includes a minimal `places` array (city coordinates only — no `activities` or `items`) to support map city-pin rendering without requiring a full trip detail fetch.

> **`region_name` on `places[].city` (BUG-80, GitHub #388, 2026-08-03):** the joined
> `regions` row's `name`, alongside the pre-existing `region_iso`. Both `null` when
> `region_id` is `null` (LEFT JOIN — a region-less city is never dropped). Before this fix,
> two saved places for same-named cities in different regions of one country (e.g. "Newport"
> in Scotland vs Wales) rendered identically — `tripRepository.getPlaces()` already joined
> `regions`, but this route never surfaced the result. See also `GET /api/cities` (BUG-72),
> which added the same two fields to search results.

Returns an empty array `[]` if no trips match.

**Example:**
```
GET /api/trips?status=planning
GET /api/trips?category_id=4
```

---

### POST /api/trips

Create a new trip.

**Request Body:**
```json
{
  "name": "Europe Summer 2026",
  "start_date": "2026-06-01",
  "end_date": "2026-06-15",
  "photo_album_ref": null,
  "category_ids": [4],
  "companion_ids": [2],
  "activity_ids": [3, 7]
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | **Yes** | 1–75 chars, trimmed (BUG-10, corrected 2026-07-20 — was 200) |
| `start_date` | string | **Yes** | YYYY-MM-DD format |
| `end_date` | string | **Yes** | YYYY-MM-DD format; must be ≥ `start_date` |
| `photo_album_ref` | string \| null | No | URL or reference string |
| `category_ids` | integer[] | No | Array of valid category IDs |
| `companion_ids` | integer[] | No | Array of valid companion IDs |
| `activity_ids` | integer[] | No | Array of valid activity IDs |

**Response: `201 Created`**

Same shape as a single item from `GET /api/trips`, with all associations and `places` included. On creation, `places` will be `[]`.

```json
{
  "id": 1,
  "name": "Europe Summer 2026",
  "start_date": "2026-06-01",
  "end_date": "2026-06-15",
  "status": "planning",
  "photo_album_ref": null,
  "created_at": "2026-03-07T14:30:00.000Z",
  "updated_at": "2026-03-07T14:30:00.000Z",
  "categories": [{ "id": 4, "name": "City Break" }],
  "companions": [{ "id": 2, "name": "Partner" }],
  "activities": [{ "id": 3, "name": "Dining" }, { "id": 7, "name": "Sightseeing" }],
  "places": []
}
```

**Errors:**
- `400` — validation failure (missing required fields, bad dates, end_date < start_date)

---

### GET /api/trips/:id

Get a single trip with full nested data (places, cities, items).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Trip ID |

**Response: `200 OK`**
```json
{
  "id": 1,
  "name": "Europe Summer 2026",
  "start_date": "2026-06-01",
  "end_date": "2026-06-15",
  "status": "planning",
  "photo_album_ref": null,
  "created_at": "2026-03-07T14:30:00.000Z",
  "updated_at": "2026-03-07T14:30:00.000Z",
  "categories": [{ "id": 4, "name": "City Break" }],
  "companions": [{ "id": 2, "name": "Partner" }],
  "activities": [{ "id": 3, "name": "Dining" }],
  "places": [
    {
      "id": 1,
      "city_id": 1,
      "arrived_on": "2026-06-01",
      "departed_on": "2026-06-05",
      "created_at": "2026-03-07T14:31:00.000Z",
      "city": {
        "id": 1,
        "name": "Paris",
        "country_code": "FR",
        "country_name": "France",
        "region_id": null,
        "region_iso": null,
        "region_name": null,
        "latitude": 48.8566,
        "longitude": 2.3522,
        "geocode_status": "resolved"
      },
      "activities": [{ "id": 3, "name": "Dining" }],
      "items": [
        {
          "id": 1,
          "item_type": "restaurant",
          "status": "consider",
          "notes": "Michelin starred — try the tasting menu",
          "is_carried_forward": false,
          "carried_from_item_id": null,
          "created_at": "2026-03-07T14:32:00.000Z",
          "updated_at": "2026-03-07T14:32:00.000Z",
          "name": "Le Jules Verne",
          "neighbourhood_area": "7th arr.",
          "cuisine_type": "French",
          "source": "Michelin Guide",
          "rating": null,
          "post_visit_notes": null
        }
      ]
    }
  ]
}
```

> **`region_iso` / `region_name` on `places[].city` (BUG-80, GitHub #388, 2026-08-03):** both
> were entirely missing from this endpoint's `city` object before this fix — unlike the list
> endpoint (`GET /api/trips`), which already had `region_iso`. `tripRepository.getPlaces()`
> (shared by both endpoints) already LEFT JOINs `regions` and selected `region_iso`; this
> route's response assembly just never included either field. `country_name` was already
> present and is included in this example for completeness — see the PO UAT finding
> reproduced by the fix: two saved places for same-named cities in different regions of one
> country (e.g. "Newport" in Scotland vs Wales) rendered identically with nothing in the
> payload to distinguish them.

> **`arrived_on` / `departed_on` on each place (ADL-24 / BUG-31):** `null` when
> not explicitly set on the place. These drive `resolvePlaceDateRange`'s
> highest-precedence source on the frontend (explicit > hotel dates > trip
> dates — ADL-24 §5). Fixed 2026-07-20 (BUG-31, #155): this endpoint's
> `getPlaces()` query previously omitted both columns entirely, so explicit
> place dates set via `PATCH /api/trips/:tripId/places/:placeId` never
> reached the trip detail view even though they were persisted correctly.

**Errors:**
- `404` — trip not found

---

### PATCH /api/trips/:id

Update an existing trip (partial update). Cannot update a locked trip.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Trip ID |

**Request Body** (all fields optional):
```json
{
  "name": "Europe Summer 2026 — Updated",
  "start_date": "2026-06-02",
  "end_date": "2026-06-16",
  "photo_album_ref": "https://photos.example.com/album/123",
  "category_ids": [4, 5],
  "companion_ids": [2],
  "activity_ids": [3, 7, 12]
}
```

> **Note on associations:** When `category_ids`, `companion_ids`, or `activity_ids` are provided, they **replace** the entire existing association set (delete + reinsert). To remove all categories, send `"category_ids": []`.

**Response: `200 OK`** — updated trip in same shape as `GET /api/trips` (includes `places`)

**Errors:**
- `400` — validation failure
- `403` — trip is locked
- `404` — trip not found

---

### PATCH /api/trips/:id/status

Transition a trip's status. See [Trip Status Transitions](#trip-status-transitions) for allowed transitions.

**Request Body:**
```json
{ "status": "active" }
```

**Response: `200 OK`** — updated trip

**Errors:**
- `400` — invalid status value or invalid transition (message: `"Invalid status transition from planning to locked"`)
- `404` — trip not found

---

### PATCH /api/trips/:id/lock

Convenience shortcut for transitioning status to `locked`. Equivalent to `PATCH /api/trips/:id/status` with `{ "status": "locked" }`.

**Request Body:** None required.

**Response: `200 OK`** — updated trip

**Errors:**
- `400` — trip is already locked, or transition not allowed from current status
- `404` — trip not found

---

### PATCH /api/trips/:id/unlock

Convenience shortcut for transitioning status back to `review_pending` from `locked`. Trip must currently be `locked`.

**Request Body:** None required.

**Response: `200 OK`** — updated trip

**Errors:**
- `400` — trip is not locked
- `404` — trip not found

---

### DELETE /api/trips/:id

Hard-delete a trip and all its related data. No soft-delete — trips are personal data owned entirely by the user.

Frontend issues individual DELETE calls per trip; no bulk delete endpoint exists.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Trip ID — must be a positive integer |

**Request Body:** None.

**Query Parameters:** None.

**Cascade behaviour:** SQLite CASCADE removes all child records automatically:
- `trip_categories_map` (via `trip_id`)
- `trip_companions_map` (via `trip_id`)
- `trip_activities_map` (via `trip_id`)
- `trip_places` (via `trip_id`)
- `trip_place_activities_map` (via `trip_place_id` on `trip_places`)
- `items` (via `trip_id`)
- `item_flights`, `item_hotels`, `item_car_rentals`, `item_restaurants`, `item_experiences` (via `item_id` on `items`)

**Response: `204 No Content`** — no body.

**Errors:**
- `400` — `id` is not a positive integer (non-numeric, zero, or negative)
- `404` — trip does not exist

**Example:**
```
DELETE /api/trips/42
→ 204 No Content
```

---

## Places

Places are nested under trips. The parent trip's `id` is always required.

### GET /api/trips/:tripId/places

List all places on a trip with their city details and activity tags.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |

**Response: `200 OK`**
```json
[
  {
    "id": 1,
    "city_id": 1,
    "created_at": "2026-03-07T14:31:00.000Z",
    "city": {
      "id": 1,
      "name": "Paris",
      "country_code": "FR",
      "region_id": null,
      "region_name": null,
      "region_iso": null,
      "latitude": 48.8566,
      "longitude": 2.3522,
      "geocode_status": "resolved"
    },
    "activities": [
      { "id": 3, "name": "Dining" },
      { "id": 7, "name": "Sightseeing" }
    ]
  }
]
```

`region_name` / `region_iso` (BUG-80, GitHub #388, 2026-08-03) — same `LEFT JOIN` onto
`regions` as every other city-shaped payload touched by this fix. This endpoint has no
current frontend consumer (the trip detail page uses `GET /api/trips/:id` instead), added
here for payload consistency.

**Errors:**
- `404` — trip not found

---

### POST /api/trips/:tripId/places

Add a city to a trip as a place.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |

**Request Body:**
```json
{ "city_id": 1 }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `city_id` | integer | **Yes** | ID of an existing city |

**Response: `201 Created`**
```json
{
  "id": 1,
  "city_id": 1,
  "created_at": "2026-03-07T14:31:00.000Z",
  "city": {
    "id": 1,
    "name": "Paris",
    "country_code": "FR",
    "region_id": null,
    "region_name": null,
    "region_iso": null,
    "latitude": 48.8566,
    "longitude": 2.3522,
    "geocode_status": "resolved"
  },
  "activities": []
}
```

`region_name` / `region_iso` (BUG-80, GitHub #388, 2026-08-03) — same as `GET
/api/trips/:tripId/places` above. The frontend's `useAddPlace` only reads `id`/`warnings`
off this response and re-fetches trip detail for display; added for payload consistency.

**Errors:**
- `400` — validation failure
- `403` — trip is locked
- `404` — trip or city not found
- `409` — trip already has this city

---

### DELETE /api/trips/:tripId/places/:placeId

Remove a place from a trip. This also deletes all items and activity tags associated with that place (CASCADE).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |
| `placeId` | integer | Place ID |

**Response: `204 No Content`**

**Errors:**
- `403` — trip is locked
- `404` — place not found on trip

---

### PATCH /api/trips/:tripId/places/:placeId

Update a place's date range (UX-02). Both fields are optional and nullable.

> Note: this is a full-replace PATCH — a field omitted from the body is set to `null`, not left
> unchanged (unlike the other PATCH endpoints in this API). Send both fields to preserve both.
> *(Whether this replace-semantics is intended is Session B Q6, pending PO confirmation.)*

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |
| `placeId` | integer | Place ID |

**Request Body:**
```json
{ "arrived_on": "2026-06-01", "departed_on": "2026-06-05" }
```
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `arrived_on` | string \| null | No | ISO date (YYYY-MM-DD) the traveller arrived |
| `departed_on` | string \| null | No | ISO date (YYYY-MM-DD) the traveller departed |

**Response: `200 OK`** — the updated place object.

**Errors:**
- `403` — trip is locked
- `404` — place not found on trip

---

### POST /api/trips/:tripId/places/:placeId/activities

Tag an activity to a trip place.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |
| `placeId` | integer | Place ID |

**Request Body:**
```json
{ "activity_id": 3 }
```

**Response: `201 Created`**
```json
{ "trip_place_id": 1, "activity_id": 3 }
```

**Errors:**
- `400` — validation failure
- `404` — place not found on trip
- `409` — activity already tagged to this place

---

### DELETE /api/trips/:tripId/places/:placeId/activities/:activityId

Remove an activity tag from a trip place.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |
| `placeId` | integer | Place ID |
| `activityId` | integer | Activity ID |

**Response: `204 No Content`**

---

### POST /api/trips/:tripId/places/:placeId/carry-forward

Execute carry-forward — create `consider` items on the target trip/place from selected `next_time` items at the source city. Used in the CarryForward flow (IT-07) after the user selects items from `GET /api/cities/:id/carry-forward`.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Target trip ID |
| `placeId` | integer | Target place ID (must belong to `tripId`) |

**Request Body:**
```json
{
  "source_item_ids": [14, 17, 22]
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `source_item_ids` | integer[] | **Yes** | Array of item IDs to carry forward. Must have at least 1 element. All IDs must exist. |

**Behaviour:**

For each source item, a new item is created with:
- `status = "consider"`
- `is_carried_forward = 1` (true)
- `carried_from_item_id = <source item ID>`
- `item_type` and `notes` copied from source
- Type-specific extension fields copied (restaurant: name, neighbourhood_area, cuisine_type, source; hotel: property_name, address, check_in/out dates, booking_reference, confirmation_number)
- `rating` and `post_visit_notes` are **NOT** copied (start fresh on new trip)

**Response: `201 Created`**
```json
{
  "created_item_ids": [45, 46, 47],
  "count": 3
}
```

**Errors:**
- `400` — `source_item_ids` is empty, contains non-integer values, or one or more IDs do not exist
- `403` — target trip is locked
- `404` — trip or place not found (or place does not belong to trip)

---

## Trip Countries

Countries associated with a trip (ADL-23). This denormalised set drives map shading independently
of the trip's places. Nested under a trip; both writes reject a locked trip.

### POST /api/trips/:tripId/countries

Add one or more ISO 3166-1 alpha-2 country codes to a trip. Idempotent per code.

**Request Body:**
```json
{ "country_codes": ["AU", "NZ"] }
```
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `country_codes` | string[] | Yes | One or more 2-letter country codes (min 1) |

**Response: `200 OK`**
```json
{ "countries": ["AU", "NZ"] }
```

**Errors:**
- `400` — validation failure (empty array, or a code not exactly 2 characters)
- `403` — trip is locked
- `404` — trip not found (or not owned by the caller)

---

### DELETE /api/trips/:tripId/countries/:code

Remove a single country association from a trip.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |
| `code` | string | ISO 3166-1 alpha-2 country code |

**Response: `204 No Content`**

**Errors:**
- `403` — trip is locked
- `404` — trip not found, or the country is not associated with the trip

---

## Items

Items are nested under trips. Each item has a `trip_place_id` (optional — if null, the item is a trip-level item not tied to a specific place).

### Flat Field Response

All item responses use a **flat response shape** — type-specific extension fields are merged into the top-level object alongside base item fields. Fields that don't apply to the item's type are `null`.

---

### GET /api/trips/:tripId/items

List all items on a trip.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `place_id` | integer | No | Filter to items at a specific place |
| `type` | string | No | Filter by `item_type` |
| `status` | string | No | Filter by item status |

**Response: `200 OK`**
```json
[
  {
    "id": 1,
    "item_type": "restaurant",
    "status": "consider",
    "notes": "Try the tasting menu",
    "map_url": null,
    "is_carried_forward": false,
    "carried_from_item_id": null,
    "created_at": "2026-03-07T14:32:00.000Z",
    "updated_at": "2026-03-07T14:32:00.000Z",
    "trip_place_id": 1,
    "name": "Le Jules Verne",
    "neighbourhood_area": "7th arr.",
    "cuisine_type": "French",
    "source": "Michelin Guide",
    "rating": null,
    "post_visit_notes": null,
    "airline": null,
    "flight_number": null,
    "departure_airport": null,
    "arrival_airport": null,
    "departure_datetime": null,
    "arrival_datetime": null,
    "booking_reference": null,
    "seat": null,
    "property_name": null,
    "address": null,
    "check_in_date": null,
    "check_out_date": null,
    "confirmation_number": null,
    "provider": null,
    "pickup_location": null,
    "dropoff_location": null,
    "pickup_datetime": null,
    "dropoff_datetime": null,
    "vehicle_class": null
  }
]
```

> **Note:** All extension fields for all item types are always present in the response, with `null` for fields that don't apply. This simplifies FRONTEND rendering.

---

### POST /api/trips/:tripId/items

Create a new item on a trip.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |

**Request Body:**

Base fields (all item types):
```json
{
  "trip_place_id": 1,
  "item_type": "restaurant",
  "status": "consider",
  "notes": "Try the tasting menu",
  "map_url": "https://maps.google.com/?q=Le+Jules+Verne",
  "is_carried_forward": false,
  "carried_from_item_id": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trip_place_id` | integer \| null | No | Place on this trip. If null, item is trip-level |
| `item_type` | string | **Yes** | One of: `flight`, `hotel`, `car_rental`, `restaurant`, `experience`, `note` |
| `status` | string | No | Default: `"consider"`. See [Item Status Values](#item-status-values) |
| `notes` | string \| null | No | Free-text notes |
| `map_url` | string \| null | No | Optional map/directions link (IT-10, ADL-45). Must be a well-formed `https://` URL (no other scheme, no host allowlist), max 2048 chars. No DB-level check — enforced only by Zod (`zMapUrl`), rejects on write with `400`. |
| `is_carried_forward` | boolean | No | Default: `false`. Must be `true` if `carried_from_item_id` is set |
| `carried_from_item_id` | integer \| null | No | Source item ID if this is a carry-forward copy |

**Type-specific fields** (include only for the relevant `item_type`):

**Flight:**
```json
{
  "airline": "Air France",
  "flight_number": "AF1234",
  "departure_airport": "LHR",
  "arrival_airport": "CDG",
  "departure_datetime": "2026-06-01T09:00:00",
  "arrival_datetime": "2026-06-01T11:30:00",
  "booking_reference": "ABC123",
  "seat": "14A"
}
```

**Hotel** (rating and post_visit_notes are NOT settable on create — use PATCH after the stay):
```json
{
  "property_name": "Hotel de Crillon",
  "address": "10 Place de la Concorde, 75008 Paris",
  "check_in_date": "2026-06-01",
  "check_out_date": "2026-06-05",
  "booking_reference": "HTLREF001",
  "confirmation_number": "CONF-9876"
}
```

**Car Rental:**
```json
{
  "provider": "Hertz",
  "pickup_location": "CDG Airport T2",
  "dropoff_location": "Paris city centre",
  "pickup_datetime": "2026-06-01T12:00:00",
  "dropoff_datetime": "2026-06-05T10:00:00",
  "booking_reference": "CARREF001",
  "vehicle_class": "Economy"
}
```

**Restaurant** (rating and post_visit_notes are NOT settable on create — use PATCH after dining):
```json
{
  "name": "Le Jules Verne",
  "neighbourhood_area": "7th arr.",
  "cuisine_type": "French",
  "source": "Michelin Guide"
}
```

**Experience:** No type-specific fields on create. Extension row is created lazily when first rating or post_visit_notes is set via PATCH.

**Note:** No type-specific fields.

**Response: `201 Created`** — full item with all extension fields (same shape as GET)

**Errors:**
- `400` — validation failure (including carry-forward consistency: `is_carried_forward=true` requires `carried_from_item_id`, and vice versa)
- `403` — trip is locked
- `404` — trip not found

---

### PATCH /api/trips/:tripId/items/:itemId

Update an item. All fields are optional. Trip must not be locked.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |
| `itemId` | integer | Item ID |

**Request Body** (any combination of base and type-specific fields):

Base fields:
```json
{
  "status": "completed",
  "notes": "Updated notes",
  "map_url": "https://maps.google.com/?q=Le+Jules+Verne"
}
```

Adding post-visit review to a restaurant:
```json
{
  "rating": 5,
  "post_visit_notes": "Exceptional tasting menu, perfect service"
}
```

> **Experience items:** If setting `rating` or `post_visit_notes` on an `experience` item for the first time, the extension row is created automatically (lazy creation).

> **Hotels and restaurants:** `rating` and `post_visit_notes` are only set via PATCH (not on create). Ratings are integers 1–5.

**Response: `200 OK`** — updated full item (same shape as GET)

**Errors:**
- `400` — validation failure
- `403` — trip is locked
- `404` — item not found on trip

---

### DELETE /api/trips/:tripId/items/:itemId

Delete an item. The extension row is deleted automatically (CASCADE).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tripId` | integer | Trip ID |
| `itemId` | integer | Item ID |

**Response: `204 No Content`**

**Errors:**
- `403` — trip is locked
- `404` — item not found on trip

---

## Cities

### GET /api/cities

Search cities by name. Returns local database results only (Nominatim is not queried from this endpoint).

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | **Yes** | Search string (minimum 2 characters). Case-insensitive substring match. |
| `country_code` | string | No | ISO 3166-1 alpha-2 code (e.g. `"FR"`) to restrict results to a country |

**Response: `200 OK`**
```json
[
  {
    "id": 1,
    "name": "Paris",
    "country_code": "FR",
    "region_id": null,
    "region_name": null,
    "region_iso": null,
    "latitude": 48.8566,
    "longitude": 2.3522,
    "geocode_status": "resolved"
  },
  {
    "id": 2,
    "name": "Springfield",
    "country_code": "US",
    "region_id": 14,
    "region_name": "Illinois",
    "region_iso": "US-IL",
    "latitude": 39.7817,
    "longitude": -89.6501,
    "geocode_status": "resolved"
  }
]
```

`geocode_status` values: `"pending"` | `"resolved"` | `"unresolvable"`

`region_name` / `region_iso` (BUG-72, GitHub #351, 2026-08-01) — the joined `regions` row's
`name` and `iso_3166_2`, added so the frontend can disambiguate same-named cities (e.g. two
"Springfield" rows) without a client-side lookup, which cannot work across countries since the
region list is only loaded for one selected country at a time. Both are `null` when
`region_id` is `null` (non-region-tier country, or a region-tier city not yet assigned a
region) — a `LEFT JOIN`, so a region-less row is never dropped from results. `region_id`
itself is unchanged and still present for existing consumers.

**Errors:**
- `400` — `q` is missing or fewer than 2 characters

**Example:**
```
GET /api/cities?q=par
GET /api/cities?q=new&country_code=US
```

---

### POST /api/cities

Find-or-create a city (BUG-33, GitHub #157 — 2026-07-20). Looks up an existing
city by `(name, country_code)` case-insensitively (`COLLATE NOCASE`) before inserting;
only inserts when genuinely not found. This is a defense-in-depth measure against
duplicate `cities` rows (UAT found "Glasgow" listed twice in the place autocomplete) —
GE-14 already asks the frontend to search before offering "add new city", but that's a
UX nicety, not a guarantee against a case-mismatched query, a stale search-results list,
or a double-submit reaching this route.

The companion database brief (migration `0010_bug33_add_unique_index.sql`, merged) added
`uniq_cities_name_country_ci` — `UNIQUE(name COLLATE NOCASE, country_code)` — as the
DB-level backstop. This route's lookup matches that collation exactly (`COLLATE NOCASE`),
so it always finds the row the constraint would otherwise reject a duplicate of; the two
are aligned, not independent, though the route's check-then-insert still holds even in a
deployment that hasn't run that migration yet (defense in depth).

Geocoding is attempted immediately and asynchronously on a genuine insert; the response
may have `geocode_status: "pending"` if the server is offline.

**Request Body:**
```json
{
  "name": "Sydney",
  "country_code": "AU",
  "region_id": 5
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | **Yes** | 1–200 chars, trimmed |
| `country_code` | string | **Yes** | Must exist in countries table |
| `region_id` | integer \| null | No | If provided, must belong to the given country. **Must be `null`** if country has `region_tier_enabled = false`. Optional even if country has `region_tier_enabled = true`. Ignored when an existing city is matched — only used on a genuine insert. |

**Response: `201 Created`** — a new city was inserted.
```json
{
  "id": 5,
  "name": "Sydney",
  "country_code": "AU",
  "region_id": 5,
  "latitude": -33.8698439,
  "longitude": 151.2082848,
  "geocode_status": "resolved"
}
```

**Response: `200 OK`** — an existing city matched `(name, country_code)` case-insensitively;
no row was created. Same body shape, reflecting the existing row (its stored `name`
casing, `region_id`, and geocode state — not the values from this request).

**Errors:**
- `400` — validation failure, or `region_id` provided for a non-region-tier country
- `404` — country or region not found

---

### PATCH /api/cities/:id

Update a city's `region_id`. Useful when a city was created without a region and the region is later assigned, or to correct a region assignment.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | City ID |

**Request Body** (all fields optional — only `region_id` is patchable):
```json
{
  "region_id": 5
}
```

To clear the region:
```json
{
  "region_id": null
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `region_id` | integer \| null | No | If provided (non-null), must exist in the `regions` table. If null, clears the region association. If omitted entirely, region is unchanged. |

**Response: `200 OK`**
```json
{
  "id": 5,
  "name": "Sydney",
  "country_code": "AU",
  "region_id": 5,
  "latitude": -33.8698439,
  "longitude": 151.2082848,
  "geocode_status": "resolved"
}
```

**Errors:**
- `400` — validation failure, or `region_id` does not exist in regions table
- `404` — city not found

---

### GET /api/cities/:id

Read-only single-city fetch (BUG-29, GitHub #155). Used by the frontend geocode retry queue
to poll `geocode_status` without issuing a write. Never triggers geocoding (ADL-10) — the
backend queue owns re-resolution. Readable by any authenticated user, same as `GET /api/cities`
(no owner gate — cities are global reference data).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | City ID |

**Response: `200 OK`**
```json
{
  "id": 5,
  "name": "Newport",
  "country_code": "GB",
  "region_id": 9,
  "region_name": "Wales",
  "region_iso": "GB-WLS",
  "latitude": 51.5842,
  "longitude": -2.9977,
  "geocode_status": "resolved"
}
```

`region_name` / `region_iso` (BUG-80, GitHub #388, 2026-08-03) — same `LEFT JOIN` onto
`regions` as `GET /api/cities` (search, BUG-72). Both `null` when `region_id` is `null`.
This endpoint itself (and this doc section) predates BUG-80; it was undocumented before
this fix — added here as part of the same brief that touched its response shape.

**Errors:**
- `404` — city not found, or `id` is not numeric

---

### GET /api/cities/:id/carry-forward

Get items from past trips to this city that have `status = "next_time"` — these are candidates to carry forward to a new trip. Used to pre-populate a new trip with recommendations from prior visits.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | City ID |

**Response: `200 OK`**
```json
[
  {
    "id": 14,
    "item_type": "restaurant",
    "status": "next_time",
    "notes": "Couldn't get a reservation this time",
    "source_trip_name": "Paris 2024",
    "source_trip_end_date": "2024-09-20",
    "restaurant_name": "Septime",
    "hotel_property_name": null
  }
]
```

Only trips with status `review_pending` or `locked` are included (completed trips only). Results are ordered by `source_trip_end_date` DESC.

---

### GET /api/cities/:id/items

Get all completed items at this city across all trips. Useful for building a "best of" view for a destination.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | City ID |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Filter by `item_type` (e.g. `"restaurant"`) |
| `min_rating` | integer | No | Only include items with rating ≥ this value (1–5) |
| `sort_by` | string | No | `rating` — sort by effective rating (IT-08) |
| `sort_order` | string | No | `asc` or `desc` (default `desc`); applies when `sort_by` is set |

**Response: `200 OK`**
```json
[
  {
    "id": 1,
    "item_type": "restaurant",
    "status": "completed",
    "notes": "Outstanding",
    "trip_name": "Paris 2024",
    "trip_start_date": "2024-09-10",
    "restaurant_name": "Septime",
    "restaurant_rating": 5,
    "restaurant_post_visit_notes": "Book 2 months ahead. Wednesday lunch is quietest.",
    "hotel_property_name": null,
    "hotel_rating": null,
    "hotel_post_visit_notes": null,
    "experience_rating": null,
    "experience_post_visit_notes": null
  }
]
```

Results are ordered by effective rating DESC (NULLS LAST) across all item types.

Only items with `status = "completed"` and `item_type` in (`restaurant`, `hotel`, `experience`) are returned.

---

## Map Shading

Map shading states represent how much a user has visited each country or region.

> **Per-user (ADL-28 / AD-07, 2026-07-23):** every route in this section is `requireAuth`
> only — **not** owner-gated. Shading is computed only from the caller's own trips
> (`req.user.id`), and `/api/map/shading/config` is the caller's own 6 colour/label rows,
> lazily created (via defaults) on first access if they don't exist yet. Two different users
> never see each other's trip-derived shading or config colours.

### Shading State Keys
| `state_key` | Meaning |
|------------|---------|
| `"never_visited"` | No trips to this country. Not stored in config table — handled in code. |
| `"planned"` | Only planning-status trips to this country |
| `"active"` | At least one active trip in this country |
| `"visited_once"` | Exactly one completed trip, no upcoming planned trips |
| `"visited_once_planning"` | One completed trip + at least one planned trip |
| `"visited_multiple"` | Two or more completed trips, no planned |
| `"visited_multiple_planning"` | Two or more completed + at least one planned |

> **"Completed" includes:** trips with status `review_pending` OR `locked`.

---

### GET /api/map/shading

Get shading state for all countries. Returns one entry per country in the countries table.

**Response: `200 OK`**
```json
[
  {
    "country_code": "FR",
    "state_key": "visited_once",
    "color_hex": "#3B82F6",
    "display_name": "Visited once"
  },
  {
    "country_code": "US",
    "state_key": "never_visited",
    "color_hex": null,
    "display_name": "Never visited"
  }
]
```

`color_hex` is `null` and `display_name` is `"Never visited"` for `never_visited` countries (not stored in config table).

---

### GET /api/map/shading/countries/:countryCode

Get shading state for a single country, plus region-level breakdown if the country has `region_tier_enabled = true`.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `countryCode` | string | ISO 3166-1 alpha-2 (e.g. `"US"`) |

**Response: `200 OK`**
```json
{
  "country_code": "US",
  "state_key": "visited_multiple",
  "color_hex": "#1D4ED8",
  "display_name": "Visited multiple times",
  "regions": [
    {
      "region_id": 1,
      "region_name": "California",
      "state_key": "visited_multiple",
      "color_hex": "#1D4ED8",
      "display_name": "Visited multiple times"
    },
    {
      "region_id": 2,
      "region_name": "New York",
      "state_key": "visited_once",
      "color_hex": "#3B82F6",
      "display_name": "Visited once"
    }
  ]
}
```

`regions` is an empty array `[]` if `region_tier_enabled = false` for this country.

---

### GET /api/map/shading/regions/:countryCode

Get shading state for all regions of a country.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `countryCode` | string | ISO 3166-1 alpha-2 (e.g. `"US"`) |

**Response: `200 OK`**
```json
[
  {
    "region_id": 1,
    "region_name": "California",
    "state_key": "visited_multiple",
    "color_hex": "#1D4ED8",
    "display_name": "Visited multiple times"
  }
]
```

**Errors:**
- `400` — country does not have `region_tier_enabled`
- `404` — country not found

---

### GET /api/map/shading/config

Get all map shading configuration (colors and display names for each state).

**Response: `200 OK`**
```json
[
  {
    "state_key": "active",
    "display_name": "Currently visiting",
    "color_hex": "#F59E0B",
    "updated_at": "2026-03-07T14:00:00.000Z"
  },
  {
    "state_key": "planned",
    "display_name": "Planned",
    "color_hex": "#A3E635",
    "updated_at": "2026-03-07T14:00:00.000Z"
  },
  {
    "state_key": "visited_once",
    "display_name": "Visited once",
    "color_hex": "#3B82F6",
    "updated_at": "2026-03-07T14:00:00.000Z"
  },
  {
    "state_key": "visited_once_planning",
    "display_name": "Visited once + planning return",
    "color_hex": "#6366F1",
    "updated_at": "2026-03-07T14:00:00.000Z"
  },
  {
    "state_key": "visited_multiple",
    "display_name": "Visited multiple times",
    "color_hex": "#1D4ED8",
    "updated_at": "2026-03-07T14:00:00.000Z"
  },
  {
    "state_key": "visited_multiple_planning",
    "display_name": "Visited multiple times + planning return",
    "color_hex": "#4338CA",
    "updated_at": "2026-03-07T14:00:00.000Z"
  }
]
```

Note: `never_visited` is not stored in this table. It is handled in code with `color_hex: null` and `display_name: "Never visited"`.

---

### PATCH /api/map/shading/config/:stateKey

Update the color or display name for a shading state.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `stateKey` | string | One of the 6 configurable state keys (not `never_visited`) |

**Request Body:**
```json
{
  "color_hex": "#FF6B6B",
  "display_name": "Been there!"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `color_hex` | string | No | Must be `#RRGGBB` format (6-digit hex) |
| `display_name` | string | No | 1–100 chars |

**Response: `200 OK`** — updated config row (same shape as GET /config item)

**Errors:**
- `400` — validation failure (invalid hex format)
- `404` — state key not found for the caller. Note: this repository does not auto-seed on
  PATCH — call `GET /api/map/shading/config` at least once first (it lazily seeds the
  caller's 6 default rows) before PATCHing a fresh account's config.

---

## Companions

Per-user list of trip companion types (e.g. "Partner", "Solo", "Family"). Moved off
`/api/admin/companions` to its own router as of ADL-28 (AD-08, 2026-07-23) — **requireAuth
only, not owner-gated.** Every route is scoped to the caller (`req.user.id`); two users may
each have a companion of the same name without conflict (`UNIQUE(user_id, name)`), and
neither can see or modify the other's companions. Soft-delete only (`is_active = 0`, AD-06)
— matches the Admin List Pattern below in shape, just without the owner gate.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/companions` | List all (active + inactive) owned by the caller |
| `GET` | `/api/companions/active` | List active only, owned by the caller |
| `POST` | `/api/companions` | Create, owned by the caller |
| `PATCH` | `/api/companions/:id` | Update name or active status — 404 if owned by another user |
| `DELETE` | `/api/companions/:id` | Soft-delete — 404 if owned by another user |

**Response shape (all routes):**
```json
{
  "id": 2,
  "name": "Partner",
  "is_active": true,
  "created_at": "2026-03-07T14:00:00.000Z",
  "updated_at": "2026-03-07T14:00:00.000Z"
}
```

**POST body:** `{ "name": "Partner" }` — `name` required, 1–75 chars.
**PATCH body:** `{ "name"?: string, "is_active"?: boolean }` — at least one field, both optional.

**Errors:**
- `400` — validation failure, or DELETE on an already-inactive companion
- `404` — companion not found, or owned by a different user (opaque, per SE-05)
- `409` — duplicate `name` for the caller (a different user with the same name is fine)

**Cross-user assignment guard:** when a trip's `companion_ids` are set (`POST`/`PATCH
/api/trips/:id`), the backend validates every ID belongs to the caller before inserting —
any companion ID belonging to another user is rejected with **400** (not 404 — the
companion may genuinely exist, just under a different account). See ADL-28 R4.

---

## Admin

Admin endpoints manage the reference lists used throughout the app: trip categories, activities, countries, and regions — all owner-only (SE-03). **Companions moved out of this
group** as of ADL-28 (AD-08, 2026-07-23) — see the [Companions](#companions) section above;
they are no longer an admin/owner-only resource.

### Admin List Pattern

Categories and activities share the same CRUD pattern:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/{resource}` | List all (active + inactive) |
| `GET` | `/api/admin/{resource}/active` | List active only |
| `POST` | `/api/admin/{resource}` | Create new |
| `PATCH` | `/api/admin/{resource}/:id` | Update name or active status |
| `DELETE` | `/api/admin/{resource}/:id` | Soft-delete (set `is_active = 0`) |

**Resources:** `categories`, `activities`

---

### GET /api/admin/categories

List all trip categories (active + inactive).

**Response: `200 OK`**
```json
[
  { "id": 1, "name": "Ski Trip", "is_active": 1, "created_at": "...", "updated_at": "..." },
  { "id": 2, "name": "Honeymoon", "is_active": 1, "created_at": "...", "updated_at": "..." }
]
```

**GET /api/admin/categories/active** — same shape, only items where `is_active = 1`.

---

### POST /api/admin/categories

Create a new trip category.

**Request Body:**
```json
{ "name": "Backpacking" }
```

**Response: `201 Created`** — created category object

**Errors:**
- `400` — name missing or empty
- `409` — name already exists

---

### PATCH /api/admin/categories/:id

Update a category's name or active status.

**Request Body:**
```json
{
  "name": "Ski & Snowboard",
  "is_active": false
}
```

**Response: `200 OK`** — updated category object

**Errors:**
- `400` — validation failure
- `404` — not found

---

### DELETE /api/admin/categories/:id

Soft-delete a category (sets `is_active = 0`). Cannot hard-delete.

**Response: `200 OK`** — updated category with `is_active: 0`

**Errors:**
- `400` — already inactive
- `404` — not found

---

The same pattern applies identically to:
- **`/api/admin/activities`** — activities (e.g. Skiing, Dining, Hiking)

(Companion types, e.g. Solo/Partner/Family, use the same shape but live at
`/api/companions` — requireAuth only, not owner-gated. See [Companions](#companions).)

---

### GET /api/admin/countries

List all countries.

**Response: `200 OK`**
```json
[
  {
    "country_code": "AU",
    "name": "Australia",
    "region_tier_enabled": true,
    "region_tier_label": "State"
  },
  {
    "country_code": "FR",
    "name": "France",
    "region_tier_enabled": false,
    "region_tier_label": null
  }
]
```

Ordered by `name` ASC. Returns all 250 countries.

---

### PATCH /api/admin/countries/:countryCode

Enable/disable the region tier for a country, and set the label.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `countryCode` | string | ISO 3166-1 alpha-2 (e.g. `"FR"`) |

**Request Body:**
```json
{
  "region_tier_enabled": true,
  "region_tier_label": "Department"
}
```

**Response: `200 OK`** — updated country object

**Errors:**
- `400` — validation failure
- `404` — country not found

---

### GET /api/admin/countries/:countryCode/regions

List all regions for a country.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `countryCode` | string | ISO 3166-1 alpha-2 |

**Response: `200 OK`**
```json
[
  { "id": 1, "country_code": "US", "name": "Alabama", "created_at": "...", "updated_at": "..." },
  { "id": 2, "country_code": "US", "name": "Alaska", "created_at": "...", "updated_at": "..." }
]
```

---

### POST /api/admin/countries/:countryCode/regions

Add a new region to a country. Country must have `region_tier_enabled = true`.

**Request Body:**
```json
{ "name": "Île-de-France" }
```

**Response: `201 Created`** — created region object

**Errors:**
- `400` — country does not have region tier enabled
- `404` — country not found

---

### PATCH /api/admin/countries/:countryCode/regions/:regionId

Rename a region.

**Request Body:**
```json
{ "name": "Île-de-France (updated)" }
```

**Response: `200 OK`** — updated region object

**Errors:**
- `400` — validation failure
- `404` — region not found for this country

---

## Static Assets

GeoJSON boundary files for map rendering. Served directly as static files.

### GET /geo/countries.json

Natural Earth admin-0 country boundary GeoJSON (~839 KB). Feature `properties.ISO_A2` matches `country_code` values.

### GET /geo/regions.json

Natural Earth admin-1 states/provinces GeoJSON (~40 MB). Feature `properties.iso_3166_2` is the ISO 3166-2 region reference.

---

## Health

Liveness plus the identity of the build serving the response. Added to this document 2026-08-04
(QUAL-26, issue #396).

### GET /health

**Not under `/api`, and intentionally unauthenticated** — it is the deployment's own liveness
endpoint (OP-06 §1.2 exempts it from the access matrix). It is the only endpoint FRONTEND calls
outside `/api`.

**Response 200:**

```json
{
  "status": "ok",
  "commit": "b93bf9b",
  "commitFull": "b93bf9b510a2abe375450c763d17cee5e14d1d96",
  "builtAt": "2026-08-04T18:25:26.865Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `status` | `"ok"` | Unchanged and always present. Anything already depending on it keeps working. |
| `commit` | `string` | Short (7-char) commit SHA, or the literal `"unknown"` when no SHA could be resolved. |
| `commitFull` | `string \| null` | Full 40-char SHA, or `null` when unknown. |
| `builtAt` | `string \| null` | ISO-8601 build timestamp, or `null`. Only present when the build baked one AND it belongs to the same commit as `commit` — a timestamp is never paired with a SHA from a different build. |

**Errors:** none. This endpoint does not fail on an unidentifiable build; it reports
`"unknown"` and still returns 200.

**How the SHA is resolved**, in order — `BUILD_COMMIT_SHA` (operator override) →
`RAILWAY_GIT_COMMIT_SHA` (platform-injected on GitHub-sourced deploys) → a file baked at build
time by `scripts/generate-build-info.js` → `"unknown"`. See `src/backend/services/build-info.ts`
for why the resolution is layered rather than a single lookup.

**What is deliberately NOT here.** This is a public endpoint, so the payload is build identity and
nothing else: no environment values, no config, no filesystem paths, no dependency versions. The
GitHub repository is public, so the commit SHA discloses nothing that is not already public — that
reasoning covers the SHA and does not extend to anything else. `routes/__tests__/health.test.ts`
asserts the exact key set so a future addition fails a test rather than shipping.

**Consumers:** `src/frontend/components/shared/BuildStamp.tsx` (nav build stamp) and check 5 of
`src/e2e-shakedown/shakedown.spec.ts` (post-deploy verification of which build is live).

---

## Error Reference

### Complete Error Catalog

| Status | Error message | Cause |
|--------|--------------|-------|
| `400` | `"Validation failed"` (+ `details` array) | Schema validation failure |
| `400` | `"end_date must be on or after start_date"` | Date range invalid |
| `400` | `"Invalid status transition from X to Y"` | Disallowed trip status change |
| `400` | `"Trip is already locked"` | PATCH /lock on an already-locked trip |
| `400` | `"Trip is not locked"` | PATCH /unlock on a non-locked trip |
| `400` | `"carried_from_item_id required when is_carried_forward is true"` | Carry-forward inconsistency |
| `400` | `"is_carried_forward must be true when carried_from_item_id is set"` | Carry-forward inconsistency |
| `400` | `"region_id must not be provided for countries without region tier"` | Region ID on non-region-tier country |
| `400` | `"region_id does not exist"` | PATCH /api/cities/:id with a region_id not in regions table |
| `400` | `"One or more source_item_ids do not exist"` | POST carry-forward with invalid item IDs |
| `400` | `"Country does not have region tier enabled"` | POST region on non-region-tier country |
| `400` | `"[Resource] is already inactive"` | DELETE on already-inactive admin item |
| `403` | `"Trip is locked"` | Write to a locked trip |
| `404` | `"Trip not found"` | Trip ID does not exist |
| `404` | `"City not found"` | City ID does not exist |
| `404` | `"Country not found"` | Country code does not exist |
| `404` | `"Region not found"` | Region ID does not exist or wrong country |
| `404` | `"Place not found"` | Place ID does not exist on trip |
| `404` | `"Item not found"` | Item ID does not exist on trip |
| `404` | `"Category not found"` | Category ID does not exist |
| `404` | `"Activity not found"` | Activity ID does not exist |
| `404` | `"Companion not found"` | Companion ID does not exist |
| `409` | `"Trip already has this city"` | Duplicate city on trip |
| `409` | `"Activity already tagged to this place"` | Duplicate activity tag |
| `409` | `"[Resource] '[name]' already exists"` | Duplicate admin item name |
| `500` | `"Internal server error"` | Unexpected server error (details logged server-side only) |

### FEAT-BD additions (v1.3)
| Status | Error message | Cause |
|--------|--------------|-------|
| `400` | `"Trip not found"` | DELETE /api/trips/:id — id is not a positive integer (non-numeric, zero, or negative) |
| `404` | `"Trip not found"` | DELETE /api/trips/:id — trip does not exist |

---

*API Reference v1.3 — Travel Tracker BACKEND — 2026-03-19 (FEAT-BD: DELETE /api/trips/:id)*

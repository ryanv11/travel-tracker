# Travel Tracker — Backend API Reference

**Version:** 1.3
**Date:** 2026-03-19 (updated: FEAT-BD — DELETE /api/trips/:id endpoint)
**Base URL:** `http://localhost:3001`
**Author:** BACKEND

This document is the authoritative contract between BACKEND and FRONTEND. FRONTEND must be able to implement entirely from this document without asking BACKEND for clarification.

---

## Table of Contents

1. [Conventions](#conventions)
2. [Trips](#trips)
3. [Places (nested under Trips)](#places)
4. [Items (nested under Trips)](#items)
5. [Cities](#cities)
6. [Map Shading](#map-shading)
7. [Admin](#admin)
8. [Static Assets](#static-assets)
9. [Error Reference](#error-reference)

---

## Conventions

### Base URL
All API endpoints are prefixed with `/api`. The server runs on `http://localhost:3001` by default.

### Authentication
Phase 1: No authentication required. All endpoints are open. Phase 2 will add token-based auth — the `Authorization` header is reserved.

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
| `403 Forbidden` | Trip is locked; write rejected |
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
| `name` | string | **Yes** | 1–200 chars, trimmed |
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
      "created_at": "2026-03-07T14:31:00.000Z",
      "city": {
        "id": 1,
        "name": "Paris",
        "country_code": "FR",
        "region_id": null,
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
    "latitude": 48.8566,
    "longitude": 2.3522,
    "geocode_status": "resolved"
  },
  "activities": []
}
```

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
  "notes": "Updated notes"
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
    "latitude": 48.8566,
    "longitude": 2.3522,
    "geocode_status": "resolved"
  }
]
```

`geocode_status` values: `"pending"` | `"resolved"` | `"failed"`

**Errors:**
- `400` — `q` is missing or fewer than 2 characters

**Example:**
```
GET /api/cities?q=par
GET /api/cities?q=new&country_code=US
```

---

### POST /api/cities

Create a new city. Geocoding is attempted immediately and asynchronously; the response may have `geocode_status: "pending"` if the server is offline.

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
| `region_id` | integer \| null | No | If provided, must belong to the given country. **Must be `null`** if country has `region_tier_enabled = false`. Optional even if country has `region_tier_enabled = true`. |

**Response: `201 Created`**
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
- `404` — state key not found

---

## Admin

Admin endpoints manage the reference lists used throughout the app: trip categories, activities, companions, countries, and regions.

### Admin List Pattern

Categories, activities, and companions share the same CRUD pattern:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/{resource}` | List all (active + inactive) |
| `GET` | `/api/admin/{resource}/active` | List active only |
| `POST` | `/api/admin/{resource}` | Create new |
| `PATCH` | `/api/admin/{resource}/:id` | Update name or active status |
| `DELETE` | `/api/admin/{resource}/:id` | Soft-delete (set `is_active = 0`) |

**Resources:** `categories`, `activities`, `companions`

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
- **`/api/admin/companions`** — companion types (e.g. Solo, Partner, Family)

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

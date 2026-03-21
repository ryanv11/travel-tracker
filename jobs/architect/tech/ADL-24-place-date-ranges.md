# ADL-24 — Place date ranges: schema, API, ordering, and DP-04 precedence

**Date:** 2026-03-20
**Status:** Decided
**BRD ref:** DP-05 (v2.5); DP-04 (v2.4)
**Scope:** `trip_places` schema, places API endpoints, frontend ordering, and
           interaction with DP-04 hotel-derived date range display

---

## Context

BRD DP-05 (v2.5) introduces optional explicit arrival and departure dates at the
place level. These are distinct from DP-04's hotel-derived display dates: DP-04
drives the *display* of a date range in the place section UI; DP-05 enables the
user to record an *actual* place itinerary, which also drives chronological
ordering of place sections within the trip detail.

Prior to this ADL there are no date columns on `trip_places`. The `trips` table
carries `start_date` / `end_date` (ISO 8601 text, `YYYY-MM-DD`). Hotel items carry
`check_in_date` / `check_out_date` on `item_hotels` (also ISO text). Neither of
those columns lives on `trip_places`, which currently has only `id`, `trip_id`,
`city_id`, `user_id`, `created_at`, `updated_at`.

---

## 1. Schema change

### 1.1 Column naming

**Decision: `arrived_on` / `departed_on`**

Rationale:

- `date_from` / `date_to` is generic; it reads like an internal filter range, not
  a semantic travel event.
- `start_date` / `end_date` is already the vocabulary used on the `trips` table.
  Using the same names on `trip_places` would create a misleading symmetry — a
  trip has a definitive start/end that gates the whole record; a place arrival/
  departure is optional and advisory.
- `arrived_on` / `departed_on` is semantically precise, matches domain language
  ("I arrived in Paris on…"), and is unambiguous when read in queries.
- The naming is consistent with `check_in_date` / `check_out_date` on
  `item_hotels` in spirit (event-named dates) while keeping the past-tense
  participle form that signals "this is when the event occurred."

### 1.2 Data type

**Decision: `text` storing ISO 8601 date strings (`YYYY-MM-DD`)**

Rationale:

- All existing date columns in the schema use this convention: `trips.start_date`,
  `trips.end_date`, `item_hotels.check_in_date`, `item_hotels.check_out_date`,
  `item_flights.departure_datetime`, etc. Consistency is the primary driver.
- ISO 8601 date strings sort correctly with standard lexicographic ordering,
  making `ORDER BY arrived_on` queries correct without any casting.
- Integer epoch timestamps would require conversion on every read/write for a
  date-only value (no time component needed), adding overhead without benefit.
- The schema is designed to migrate to PostgreSQL (Phase 2, per schema header
  comment). PostgreSQL's `DATE` type accepts ISO 8601 strings directly; the
  migration from SQLite `TEXT` to PostgreSQL `DATE` is a mechanical column-type
  change with no data transformation needed.

### 1.3 Nullability and constraints

Both columns are **nullable with no default**. Nullability is the core
mechanism for "optional date" (BRD: "can have optional arrival and departure
dates"). No `NOT NULL` constraint, no default.

**No DB-level CHECK constraint enforcing `arrived_on <= departed_on`:**

SQLite CHECK constraints with cross-column date comparisons on text columns are
unreliable (see trips table comment in schema.ts: "BACKEND must also validate
start_date <= end_date"). The backend validates this at the service layer, matching
the existing pattern.

**No DB-level CHECK requiring both columns set together:**

Partial dates (only `arrived_on` set, `departed_on` NULL) are a valid use case
(see §6 Edge cases). The schema permits this; business rules are backend-enforced.

### 1.4 Proposed column additions to `trip_places`

```typescript
arrivedOn:  text('arrived_on'),   // ISO 8601 date 'YYYY-MM-DD', NULL = not set
departedOn: text('departed_on'),  // ISO 8601 date 'YYYY-MM-DD', NULL = not set
```

No index is needed on `arrived_on` at this stage. Ordering by `arrived_on` is
only performed within a single trip's places (the set is small — typically 2–20
rows). A full-table index would not be used. If a future requirement calls for
cross-trip "places by date" queries, an index can be added at that point.

---

## 2. Migration approach

### 2.1 Workflow (ADL-15 / CLAUDE.md)

The project prohibits `db:push`. The only approved workflow is:

```bash
npm run db:generate   # drizzle-kit generates a new migration SQL file
npm run db:migrate    # applies pending migrations
```

`db:push` is removed from `package.json` scripts. `drizzle-kit@0.31.9` has four
known SQLite bugs, all patched via `patches/drizzle-kit+0.31.9.patch`, which
`patch-package` re-applies automatically on `npm install` (ADL-15).

### 2.2 Schema edit required

Add `arrivedOn` and `departedOn` columns to the `tripPlaces` table definition in
`src/backend/db/schema.ts`, then run `db:generate`.

### 2.3 What the migration SQL will contain

Adding nullable columns with no default to an existing SQLite table is an
`ALTER TABLE … ADD COLUMN` statement. SQLite supports this without table
recreation, so there is no risk of the "duplicate CREATE INDEX" bug (Bug 1 in
ADL-15). The patched bugs (2 and 3) are triggered only by table recreations from
CHECK constraint diffs — adding nullable columns avoids that path entirely.

Expected generated SQL:

```sql
ALTER TABLE trip_places ADD COLUMN arrived_on TEXT;
ALTER TABLE trip_places ADD COLUMN departed_on TEXT;
```

### 2.4 Safety notes

- The migration is backward-compatible: all existing rows will have NULL for both
  columns, which is the intended "not set" state.
- No data backfill is required.
- The migration is idempotent: running `db:migrate` twice will not reapply it.
- After generating, review the migration file before applying — confirm it
  contains only `ALTER TABLE ADD COLUMN` statements, not a table drop/recreate.

---

## 3. API changes

### 3.1 Endpoints affected

Four endpoints touch place data and must be updated:

| Endpoint | Change |
|----------|--------|
| `GET /api/trips/:tripId/places` | Return `arrived_on`, `departed_on` in each place object |
| `POST /api/trips/:tripId/places` | Accept optional `arrived_on`, `departed_on` in request body |
| `PATCH /api/trips/:tripId/places/:placeId` | **New endpoint** — update place fields including dates |
| `GET /api/trips/:id` (trip detail) | Return `arrived_on`, `departed_on` on each place in the `places` array |

**Note:** `PATCH /api/trips/:tripId/places/:placeId` does not currently exist.
DP-05 requires editing existing place dates, which necessitates creating this
endpoint. This is the only net-new endpoint in this feature.

### 3.2 Request body shape for POST and PATCH

```jsonc
{
  "city_id": 42,           // required on POST, absent on PATCH
  "arrived_on": "2025-06-01",   // optional ISO date string
  "departed_on": "2025-06-05"   // optional ISO date string
}
```

Both `arrived_on` and `departed_on` are optional. On PATCH, sending `null`
explicitly clears the value; omitting the field leaves the existing value
unchanged (standard partial-update semantics).

### 3.3 Response shape additions

Wherever a place object is returned, add:

```jsonc
{
  "id": 7,
  "city_id": 42,
  "arrived_on": "2025-06-01",   // null if not set
  "departed_on": "2025-06-05",  // null if not set
  "created_at": "...",
  "city": { ... },
  "activities": [ ... ]
}
```

### 3.4 Validation schema changes

`CreatePlaceSchema` in `src/backend/validation/places.schemas.ts` must accept:

```typescript
arrived_on:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
departed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
```

A new `UpdatePlaceSchema` must be created for the PATCH endpoint.

Backend service layer must validate:
- If both are provided and non-null: `arrived_on <= departed_on` (return 422 if not)
- No constraint requiring both to be set together (partial dates are allowed)

### 3.5 Repository changes

`placeRepository.create()` must accept and persist `arrivedOn` / `departedOn`.

A new `placeRepository.update()` method must be added for the PATCH endpoint,
applying the same write-guard pattern (`assertWritable`).

`placeRepository.findByTrip()` and the `PlaceWithCity` interface must be updated
to select and expose `arrivedOn` / `departedOn`.

`tripRepository.getPlaces()` must similarly select and expose the new columns for
use in `GET /api/trips/:id`.

### 3.6 Places router changes

- Add `arrived_on` / `departed_on` to the `POST /` response body.
- Add `PATCH /:placeId` handler.
- All read responses (GET list, POST, PATCH) must include the two new fields.

---

## 4. Frontend ordering logic

### 4.1 Decision: sort client-side

**Decision: chronological ordering of places is applied on the frontend, not in
the API response.**

Rationale:

- The trip detail (`GET /api/trips/:id`) already fetches all places in a single
  response. The frontend receives the full set regardless of sort order.
- Client-side sort is a pure function: `places.sort(byArrivedOn)`. It adds no
  backend complexity and no risk of breaking the API contract for other consumers.
- API-side sorting would require `ORDER BY arrived_on NULLS LAST` in the query
  and a secondary sort key to stabilise insertion-order for NULL rows. This is
  doable but tightly couples the ordering concern to the query layer.
- The BRD specifies "place sections in the trip detail are ordered
  chronologically." The trip detail view is a frontend responsibility. The
  underlying data does not have an inherent canonical order.
- If a future API consumer (e.g. iOS app) needs sorted places, it can apply the
  same sort rule client-side, or the API can add an optional `?sort=arrived_on`
  query parameter at that point without breaking the existing contract.

### 4.2 Sort algorithm

```
places.sort((a, b) => {
  const aDate = a.arrived_on ?? null;
  const bDate = b.arrived_on ?? null;

  if (aDate === null && bDate === null) return 0;  // preserve relative insertion order
  if (aDate === null) return 1;   // nulls last
  if (bDate === null) return -1;  // nulls last
  return aDate.localeCompare(bDate);  // lexicographic = chronological for YYYY-MM-DD
})
```

**Nulls last:** Places without an arrival date appear after all dated places,
preserving the existing insertion order among undated places. This matches the
BRD: "When not set, the existing insertion order is preserved."

**Stable sort:** JavaScript's `Array.prototype.sort` is guaranteed stable as of
ES2019 (Node 12+, all modern browsers). Insertion order is preserved for equal
keys (both null, or same arrival date).

**Same arrival date:** Two places with the same `arrived_on` retain their
insertion order relative to each other. No tiebreaker on `id` is required, but if
a deterministic tiebreaker is ever needed, `id` ascending is the natural choice.

### 4.3 Where in the frontend

The sort should be applied in the trip detail component/hook that assembles the
places array for rendering, not buried in a utility function — this keeps the
ordering behaviour visible and easy to test.

---

## 5. Interaction with DP-04

### 5.1 Background

DP-04 specifies that each place section displays a date range derived from:
- Hotel check-in/check-out dates (if a hotel item exists for the place), OR
- Trip start/end dates (fallback)

DP-05 introduces a third source: explicit `arrived_on` / `departed_on` on the
place itself.

### 5.2 Precedence rule

**Explicit place dates > hotel dates > trip dates**

Formally:

```
displayDateRange(place, hotelItems, trip):
  if place.arrived_on IS NOT NULL OR place.departed_on IS NOT NULL:
    return {
      from: place.arrived_on ?? null,
      to:   place.departed_on ?? null
    }
  else if hotelItems.length > 0:
    return {
      from: min(hotel.check_in_date for all hotels at this place),
      to:   max(hotel.check_out_date for all hotels at this place)
    }
  else:
    return { from: trip.start_date, to: trip.end_date }
```

**Why explicit place dates take highest precedence:**

DP-05 is a direct user action: the user is stating "I was in Paris from June 1 to
June 5." This is an authoritative, deliberate record that should not be silently
overridden by a hotel booking. The user controls the display by setting explicit
dates. If they want hotel dates shown instead, they leave `arrived_on` /
`departed_on` null.

**Partial date handling in display:**

If only `arrived_on` is set (no `departed_on`), the display shows a range with no
end date (e.g. "from June 1"). The frontend renders this gracefully — not as
trip end date fallback, since the user has explicitly started a date record for
this place.

**Multiple hotels at a place:**

If no explicit place dates are set and multiple hotel items exist for the same
place (different stays, same city), the hotel date range spans `min(check_in_date)`
to `max(check_out_date)`. This is the correct DP-04 behaviour.

### 5.3 Ordering vs. display

The `arrived_on` column drives **both** ordering (DP-05) and the primary source
for date range display (precedence rule above). These are separate concerns in
code:

- Ordering is a presentation concern in the frontend sort algorithm.
- Display date range computation is a pure utility function: `resolvePlaceDateRange(place, items, trip)`.

There is no need to store a derived or computed date range column — the derivation
is cheap and should stay in application code.

---

## 6. Edge cases

### 6.1 Partial dates (only arrived_on set)

**Allowed.** `arrived_on` without `departed_on` is valid. Use cases:
- "I arrived in Berlin on June 10 but haven't set a departure date yet."
- A one-day stop where only the arrival is known.

The sort algorithm places a partial-dated place in chronological position by
arrival. The display shows the arrival date only. The backend validates nothing
about `departed_on` being null when `arrived_on` is set.

**Only `departed_on` set (no `arrived_on`):** Also permitted by the schema. The
display shows a departure date only. The sort treats this place as undated (null
`arrived_on` → nulls last). This edge case is unusual but the schema should not
constrain it unnecessarily. If the product team determines this is confusing, a
backend validation rule "if departed_on is set, arrived_on must also be set" can
be added in the service layer without a schema change.

### 6.2 Date conflicts between places

Two places in the same trip may have overlapping date ranges (e.g. overlapping
arrivals/departures in a multi-city trip with same-day transitions). **No
validation or warning is applied.** Real travel often involves same-day
transitions; enforcing non-overlap would be incorrect. The dates are advisory
records, not an enforced itinerary.

### 6.3 Place dates outside trip date range

**Warn, do not block.**

If `arrived_on` is before `trip.start_date` or `departed_on` is after
`trip.end_date`, the backend emits a warning in the response body (e.g. a
`warnings: ["arrived_on is before trip start date"]` field) but persists the data.

Rationale: users may log a place date before finalising the trip date range, or
may intentionally extend a side-trip beyond the main trip window. Blocking would
be hostile. A warning surfaces the discrepancy without data loss.

**Implementation note:** The warning is cosmetic — it does not affect HTTP status
(still 200/201/204). The frontend should display it prominently (e.g. a toast or
inline callout). The warning is not persisted to the database.

### 6.4 Trip date range changes after place dates are set

If the user changes `trips.start_date` / `trips.end_date` after place dates have
been set, the backend does NOT retroactively validate or clear place dates.
The warning logic applies at write time for the place, not on trip update.

This is consistent with the hotel date range model: changing the trip dates does
not alter hotel check-in/check-out dates.

### 6.5 Deleting a place clears dates (no orphan concern)

`arrived_on` / `departed_on` are columns on `trip_places`. Deleting the
`trip_places` row removes them atomically. No orphan data concern.

---

## 7. Effort estimate

| Area | Scope | Estimate |
|------|-------|----------|
| Schema (`schema.ts`) | Add 2 columns to `tripPlaces` | 0.25 h |
| Migration | `db:generate` + review + `db:migrate` | 0.5 h |
| Validation schemas | Update `CreatePlaceSchema`; add `UpdatePlaceSchema` | 0.5 h |
| Repository layer | Update `PlaceWithCity` type; update `create()`; add `update()`; update `findByTrip()` | 1.5 h |
| Trip repository | Update `getPlaces()` to select new columns | 0.5 h |
| API route — POST places | Accept + persist dates; return in response | 0.5 h |
| API route — PATCH places (new) | New handler: validate, call `placeRepository.update()`, return response | 1.0 h |
| API route — GET trip detail | Pass new columns through `places` array | 0.25 h |
| Frontend — sort | `byArrivedOn` sort in trip detail component | 0.5 h |
| Frontend — place edit UI | Date pickers for arrived_on / departed_on on create + edit forms | 2.0 h |
| Frontend — DP-04 display | Update `resolvePlaceDateRange()` utility with new precedence rule | 0.5 h |
| Frontend — out-of-range warning | Display backend warning in UI | 0.5 h |
| Tests | Backend unit tests for validation + repository; frontend unit tests for sort + date resolution | 2.0 h |
| **Total** | | **~10 h** |

**Sizing note:** This is a contained, low-risk feature. The schema change is
additive (no existing columns modified). The only structural addition is the new
PATCH endpoint. The largest unknown is the frontend edit UI if date picker
accessibility and mobile responsiveness are in scope.

---

## Decisions summary

| Decision | Choice | Key rationale |
|----------|--------|---------------|
| Column names | `arrived_on` / `departed_on` | Domain-accurate; distinct from trip `start_date`/`end_date` vocabulary |
| Data type | `text` ISO 8601 | Consistent with all other date columns; sorts correctly; clean PostgreSQL migration path |
| Nullability | Both nullable, no default | Optional feature; partial dates allowed |
| Cross-column validation | Backend service layer only | Matches existing pattern for `start_date <= end_date` on trips |
| DB index | None | Ordering within a single trip's places; set is too small to warrant an index |
| Migration safety | `ADD COLUMN` only; no table recreation | Avoids drizzle-kit Bug 1; backward-compatible |
| Ordering location | Client-side sort | Places already fetched in full; clean separation of concerns |
| Null ordering | Nulls last | Preserves insertion order for undated places per BRD |
| DP-04 precedence | Explicit > hotel > trip | User's explicit record takes highest authority |
| Out-of-range dates | Warn, do not block | Advisory data; blocking would be hostile |
| Overlapping place dates | No validation | Legitimate travel pattern |

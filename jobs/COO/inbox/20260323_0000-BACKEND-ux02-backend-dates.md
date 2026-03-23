# UX-02 Backend — Place Date Ranges Completion Report

**Date:** 2026-03-23
**Branch:** `feat/ux-02-backend-place-dates`
**PR:** #69 — https://github.com/ryanv11/travel-tracker/pull/69
**CI:** All jobs green (CI + Security Checks)

## What was implemented

### 1. Schema (`src/backend/db/schema.ts`)
Added `arrivedOn`/`departedOn` nullable text columns to the `tripPlaces` table after `userId`.

### 2. Migration
File: `src/backend/migrations/0005_perpetual_bedlam.sql`
SQL: `ALTER TABLE trip_places ADD arrived_on text; ALTER TABLE trip_places ADD departed_on text;`

Note: `db:migrate` was not applied in the worktree (no `.env.local`/DB URL available). Migration file is generated and ready to apply.

### 3. Validation schemas (`src/backend/validation/places.schemas.ts`)
- Updated `CreatePlaceSchema` to accept optional `arrived_on`/`departed_on` fields (was strict `city_id` only — this was the root cause of every place creation failure)
- Added new `UpdatePlaceDatesSchema` for the PATCH endpoint

### 4. Repository (`src/backend/repositories/places.ts`)
- Updated `PlaceWithCity` interface to include `arrivedOn`/`departedOn`
- Updated `findByTrip()` to select and return date fields
- Updated `create()` signature to accept optional `arrivedOn`/`departedOn`
- Added new `updateDates(userId, tripId, placeId, arrivedOn, departedOn)` method with ownership + lock validation

### 5. Routes (`src/backend/routes/places.ts`)
- GET `/api/trips/:tripId/places` — response now includes `arrived_on`/`departed_on` per place
- POST `/api/trips/:tripId/places` — reads dates from body, stores them, returns them in 201 response
- PATCH `/api/trips/:tripId/places/:placeId` — new endpoint; validates with `UpdatePlaceDatesSchema`, calls `updateDates()`, returns full place row

### 6. Tests
- `src/backend/routes/__tests__/places.test.ts`: 6 new tests (POST with dates, POST without dates, PATCH updates, PATCH clears, PATCH 404 not found, PATCH 404 trip, PATCH 403 locked)
- `src/backend/repositories/__tests__/places.test.ts`: 8 new tests (create with dates, create without dates, updateDates happy path, updateDates clears, updateDates 404, updateDates 404 trip, updateDates locked)
- Fixed `trip_places` DDL in 4 test files that were missing the new columns: `trips.delete.test.ts`, `cities.carry-forward.test.ts`, `qa-backend-fixes.test.ts`, `trip-countries.test.ts`

## Test results
- `npm run check`: clean
- `npm run type:check:all`: clean
- `npm run test:backend`: 356 passed (342 pre-existing + 14 new)
- `npm run test:frontend`: 78 passed

## Issues encountered
None. The root cause was straightforward: `CreatePlaceSchema` was `.strict()` with only `city_id`, so any body containing `arrived_on`/`departed_on` triggered a 422 validation error. Fixed by adding the optional fields.

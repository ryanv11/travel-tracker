# QA Contract Test Coverage Plan
**Date:** 2026-03-09
**Author:** QA
**Status:** Active

This document is the QA test backlog for the contract test layer.
Tests live in `tests/contract/`. Run with: `npm run test:contract`

---

## Setup note

Contract tests require the backend server to be running:
```
npm run dev:api        # start backend
npm run test:contract  # run in another terminal
```

The `requireServer()` helper in `tests/contract/_setup.ts` will fail fast
with a descriptive message if the server is not reachable.

---

## Completed — trips.contract.test.ts (27 tests, all passing)

| Endpoint | Scenario | Status |
|----------|----------|--------|
| POST /api/trips | 201 valid body | ✅ |
| POST /api/trips | 400 missing name | ✅ |
| POST /api/trips | 400 missing start_date | ✅ |
| POST /api/trips | 400 end_date before start_date | ✅ |
| POST /api/trips | 400 invalid date format | ✅ |
| POST /api/trips | BUG-10: name > 200 chars (currently accepted — defect) | ✅ documented |
| GET /api/trips | 200 returns array | ✅ |
| GET /api/trips | 200 shape: id, name, status, dates, associations | ✅ |
| GET /api/trips | 200 ?status=planning filter | ✅ |
| GET /api/trips | 400 invalid status enum in query | ✅ |
| GET /api/trips/:id | 200 full nested shape with places | ✅ |
| GET /api/trips/:id | 404 non-existent ID | ✅ |
| GET /api/trips/:id | non-integer ID handled (no 500) | ✅ |
| PATCH /api/trips/:id | 200 update name | ✅ |
| PATCH /api/trips/:id | 400 invalid date range | ✅ |
| PATCH /api/trips/:id | 404 non-existent trip | ✅ |
| PATCH /api/trips/:id | 403 locked trip rejection | ✅ |
| PATCH /api/trips/:id/status | 200 planning → active | ✅ |
| PATCH /api/trips/:id/status | 200 active → review_pending | ✅ |
| PATCH /api/trips/:id/status | 200 review_pending → planning (NR-05/BUG-04 regression) | ✅ |
| PATCH /api/trips/:id/status | 400 invalid status value | ✅ |
| PATCH /api/trips/:id/status | 400 invalid transition (planning → locked) | ✅ |
| PATCH /api/trips/:id/lock | 200 locks trip | ✅ |
| PATCH /api/trips/:id/unlock | 200 unlocks to review_pending | ✅ |
| PATCH /api/trips/:id/lock | 400 already locked | ✅ |
| GET /api/trips/:id/summary | shape check (BUG-01 regression) | ✅ permissive until BC-01 |
| GET /api/trips/:id/summary | places include city coords | ✅ permissive until BC-01 |

---

## Backlog — pending implementation

Priority order matches open bug and correction status.

### places.contract.test.ts

| Endpoint | Scenario | Notes |
|----------|----------|-------|
| POST /api/trips/:tripId/places | 201 valid city_id | |
| POST /api/trips/:tripId/places | 400 missing city_id | |
| POST /api/trips/:tripId/places | 404 trip not found | |
| POST /api/trips/:tripId/places | 404 city not found | |
| POST /api/trips/:tripId/places | 409 city already on trip | |
| POST /api/trips/:tripId/places | 403 trip is locked | |
| GET /api/trips/:tripId/places | 200 returns array with city shape | |
| GET /api/trips/:tripId/places | 404 trip not found | |
| DELETE /api/trips/:tripId/places/:placeId | 204 success | |
| DELETE /api/trips/:tripId/places/:placeId | 403 trip is locked | |
| DELETE /api/trips/:tripId/places/:placeId | 404 place not found | |
| POST .../carry-forward | 201 creates items with is_carried_forward=true | BUG-03 regression |
| POST .../carry-forward | 400 empty source_item_ids | |
| POST .../carry-forward | 400 non-existent item ID | |
| POST .../carry-forward | 403 target trip is locked | |

### items.contract.test.ts

| Endpoint | Scenario | Notes |
|----------|----------|-------|
| GET /api/trips/:tripId/items | 200 returns flat item shape | |
| GET /api/trips/:tripId/items | 200 all extension fields present (null for non-matching type) | |
| GET /api/trips/:tripId/items | 200 ?type= filter | |
| GET /api/trips/:tripId/items | 200 ?status= filter | |
| POST /api/trips/:tripId/items | 201 restaurant | |
| POST /api/trips/:tripId/items | 201 hotel | |
| POST /api/trips/:tripId/items | 201 flight | |
| POST /api/trips/:tripId/items | 201 car_rental | |
| POST /api/trips/:tripId/items | 201 experience | |
| POST /api/trips/:tripId/items | 201 note | |
| POST /api/trips/:tripId/items | 400 invalid item_type | |
| POST /api/trips/:tripId/items | 400 invalid status — "booked"/"skipped" rejected (FLAG-F1 regression) | Verify confirmed/cancelled accepted |
| PATCH /api/trips/:tripId/items/:id | 200 update status | |
| PATCH /api/trips/:tripId/items/:id | 403 trip is locked | |
| DELETE /api/trips/:tripId/items/:id | 204 success | |
| DELETE /api/trips/:tripId/items/:id | 403 trip is locked | |

### cities.contract.test.ts

| Endpoint | Scenario | Notes |
|----------|----------|-------|
| POST /api/cities | 201 valid city | |
| POST /api/cities | 400 missing name | |
| POST /api/cities | 400 invalid country_code | |
| GET /api/cities/:id/carry-forward | 200 returns next_time items | IT-07 |
| GET /api/cities/:id/carry-forward | 200 returns empty array when no next_time items | |
| PATCH /api/cities/:id | 200 update region (C2 regression) | |
| POST /api/cities (rate limit) | 429 on 21st request within 60s | C3 regression |

### shading.contract.test.ts

| Endpoint | Scenario | Notes |
|----------|----------|-------|
| GET /api/map/shading | 200 returns country shading array | |
| GET /api/map/shading | Each country has: country_code, shading_state | |
| GET /api/map/shading | Each region has: iso_3166_2 (BUG-02 regression — add after fix lands) | |
| GET /api/map/shading | Never-visited countries are absent or marked correctly | |

### admin.contract.test.ts

| Endpoint | Scenario | Notes |
|----------|----------|-------|
| GET /api/admin/categories | 200 returns seeded categories | |
| POST /api/admin/categories | 201 creates category | |
| PATCH /api/admin/categories/:id | 200 updates | |
| GET /api/admin/activities | 200 | |
| GET /api/admin/companions | 200 | |
| GET /api/admin/shading-config | 200 returns 6 shading states | |
| PATCH /api/admin/shading-config/:state | 200 updates colour | |
| GET /api/admin/countries | 200 returns countries with region config | |
| PATCH /api/admin/countries/:code | 200 toggles region tier | |

---

## Findings from first run (2026-03-09)

### BUG-10 (new — backend) — name validation allows > 200 chars
- `zName` in `src/backend/validation/common.ts` uses `max(255)`.
- API reference and BRD document max 200 chars.
- A 201-character name is accepted with 201 Created.
- **Fix:** Change `max(255)` to `max(200)` in `zName`.
- Test location: `trips.contract.test.ts` — marked with BUG-10 comment.

### Behavior verified — strict status enum validation on query params
- `GET /api/trips?status=invalid_value` returns 400 (not empty array).
- `ListTripsQuerySchema` uses `zTripStatus.optional()` which rejects unknown enum values.
- This is correct strict validation behaviour. No defect.
- API reference does not document this case — recommend adding.

### Behavior verified — locked trip returns 403 (not 423)
- `LockError` has `statusCode = 403`.
- COO spec mentioned 423 — this was an error in the spec.
- Tests written to 403 (matching actual code).
- Flagged to COO.

---

## Known limitations

### No DELETE /api/trips endpoint
Tests cannot clean up created trips. Test data accumulates in the dev database.
Each test uses a unique timestamp-based name prefix (`[TEST-<timestamp>]`) to avoid
interference. A `DELETE /api/trips/:id` endpoint would make test isolation cleaner —
recommend adding in a future iteration.

### Tests require a running server
Contract tests are integration tests against a live process. They cannot be run in CI
without a server startup step. Recommend adding a CI job that:
1. Starts the server (`npm run dev:api &`)
2. Waits for health check
3. Runs `npm run test:contract`
4. Kills the server

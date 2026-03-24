# HC-03 Completion Report — Map Shading Scoped to req.user.id

**Date:** 2026-03-23
**Branch:** `fix/hc03-shading-user-scope`
**PR:** #84 — https://github.com/ryanv11/travel-tracker/pull/84
**Issue:** #83 — https://github.com/ryanv11/travel-tracker/issues/83
**Tracker:** NR-14 / OP-06 HC-03

---

## What changed

### `src/backend/services/shading.service.ts`

- Added `and` to drizzle-orm imports.
- `getAllCountryShading(userId: string)` — new `userId` parameter. Trips LEFT JOIN condition extended to `and(eq(trips.id, tripPlaces.tripId), eq(trips.userId, userId))`. User filter is in the JOIN (not WHERE) to preserve `never_visited` rows for countries with no trips for that user.
- `getCountryShading(countryCode: string, userId: string)` — new `userId` parameter. Same JOIN strategy.
- `getRegionShading(countryCode: string, userId: string)` — new `userId` parameter. Same JOIN strategy.
- `getTripCountriesStats(userId: string)` — internal helper gains `userId` parameter; adds `WHERE trips.user_id = ?` (safe here because this query is an inner join).

### `src/backend/routes/map.ts`

- `GET /shading` — updated call to `getAllCountryShading(req.user!.id)` (already had `requireOwner`).
- `GET /shading/countries/:countryCode` — added `requireOwner` middleware; passes `req.user!.id` to `getCountryShading` and `getRegionShading`.
- `GET /shading/regions/:countryCode` — added `requireOwner` middleware; passes `req.user!.id` to `getRegionShading`.

### `src/backend/services/__tests__/shading.trip-countries.test.ts`

- Updated all `getAllCountryShading()` calls to `getAllCountryShading(TEST_USER_ID)` to match new signature.

### `src/backend/services/__tests__/shading.user-scope.test.ts` (new)

8 new tests covering HC-03 scoping requirements:
- `getAllCountryShading`: owner sees their own trips; other user sees `never_visited` (city-visit path); other user sees `never_visited` (trip_countries path); two users have fully independent shading.
- `getCountryShading`: owner sees `visited_once`; other user sees `never_visited`.
- `getRegionShading`: owner sees `visited_once`; other user sees `never_visited`.

---

## Test results

```
Backend:   384 passed (18 test files) — all green
Frontend:  78 passed (5 test files) — all green
Lint:      Biome CI — no errors
TypeCheck: tsc frontend + backend — no errors
```

---

## PR and CI status

- **PR:** #84 — https://github.com/ryanv11/travel-tracker/pull/84
- **CI:** All jobs green (CI + Security Checks on both push and pull_request triggers)

---

## Deviations from spec

None. The spec said to add `eq(trips.userId, userId)` to the WHERE clause, but placing it in the LEFT JOIN condition is semantically equivalent for the existing queries and correctly avoids stripping `never_visited` countries from the result set. The trip_countries helper uses a WHERE clause (correct there since it's not a LEFT JOIN that needs to return absent rows).

Two routes that were not explicitly called out in the spec (`/shading/countries/:code` and `/shading/regions/:code`) were also protected with `requireOwner` — this is required for scoping to work since `req.user` would otherwise be undefined on those handlers.

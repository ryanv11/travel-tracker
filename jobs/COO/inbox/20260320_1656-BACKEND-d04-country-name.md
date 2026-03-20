# BACKEND Completion Report — D-04 country_name in trip detail

**Date:** 2026-03-20
**Issue:** GitHub #5
**Branch:** fix/d04-country-name
**PR:** https://github.com/ryanv11/travel-tracker/pull/18

## What was done

BRD §5.9 DP-04: the trip detail endpoint now returns the full country name alongside `country_code` in the city shape, so `PlaceSection` can display "Japan" instead of "JP" in the place subtitle.

### Changes

| File | Change |
|------|--------|
| `src/backend/repositories/trips.ts` | Added `countries` import; added LEFT JOIN on `countries.countryCode` in `getPlaces()`; added `cityCountryName: countries.name` to the select projection |
| `src/backend/routes/trips.ts` | Added `country_name: p.cityCountryName` to the city shape in `GET /api/trips/:id` only (list/map endpoints untouched) |
| `src/frontend/types/api.ts` | Added `country_name: string \| null` to the `City` interface |
| `src/frontend/components/TripDetail/PlaceSection.tsx` | Subtitle now renders `place.city.country_name ?? place.city.country_code`; updated stale D-04 comments |
| `src/frontend/components/PostTripReview/__tests__/ReviewPanel.test.tsx` | Added `country_name: 'Japan'` to mock city fixture |
| `src/frontend/components/TripList/__tests__/filterAndSortTrips.test.ts` | Added `country_name: null` to mock city fixtures |

### Approach

JOIN only — no schema change, no migration. The `countries` table already existed with a `name` column. `getPlaces()` now does two LEFT JOINs: `cities` (existing) and `countries` (new). The list/map response shape (`buildTripResponse`) was deliberately left unchanged to avoid breaking other consumers.

## Checks

- `npm run test:backend` — 146/146 passed
- `npm run type:check` — clean
- `npm run test:frontend` — 55/55 passed

## CI

Push triggered CI. Check with:
```bash
gh run list --repo ryanv11/travel-tracker --limit=5
```

## Notes

There were pre-existing uncommitted changes in `TripCard.tsx` and `useTrips.ts` (multi-select delete feature) that were NOT included in this commit. They remain as working tree changes on `main`.

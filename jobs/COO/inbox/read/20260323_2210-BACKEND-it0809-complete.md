# Completion Report — IT-08/IT-09 Rating Sort and Filter

**Date:** 2026-03-23
**Branch:** `feat/it0809-rating-sort-filter`
**PR:** https://github.com/ryanv11/travel-tracker/pull/90
**Issue:** https://github.com/ryanv11/travel-tracker/issues/89
**CI:** All jobs green

---

## What was implemented

### GET /api/trips/:tripId/items (IT-08)

New query params:
- `sort_by=rating` — sorts by effective rating (`COALESCE(restaurant_rating, hotel_rating, experience_rating)`) DESC; nulls last
- `sort_order=asc|desc` — controls direction when `sort_by=rating` is present; defaults to `desc`
- `min_rating=1-5` — filters to items with effective rating >= N

### GET /api/cities/:id/items (IT-09)

Extended with:
- `sort_by=rating` — makes the previously hardcoded rating sort explicit; optional, defaulting to existing DESC behaviour for backwards compat
- `sort_order=asc|desc` — allows ascending sort (previously always DESC)
- `min_rating` — already existed; now validated properly via Zod schema

### Input validation
All three params validated via Zod:
- `sort_by`: must be `rating` if present; other values → 400
- `sort_order`: must be `asc` or `desc`; other values → 400
- `min_rating`: integer 1–5; out-of-range or non-integer → 400

---

## Files changed

- `src/backend/validation/items.schemas.ts` — `ListItemsQuerySchema` extended
- `src/backend/validation/cities.schemas.ts` — `CityItemsQuerySchema` extended
- `src/backend/routes/items-helper.ts` — `fetchItemsWithExtensions` supports sort/filter opts
- `src/backend/repositories/items.ts` — `findByTrip` forwards sort/filter opts
- `src/backend/routes/items.ts` — extracts and passes new query params
- `src/backend/routes/cities.ts` — parameterized rating sort
- `src/backend/routes/__tests__/items.rating-sort-filter.test.ts` — 18 new contract tests

---

## Test results

- Backend: 394 passed (376 pre-existing + 18 new)
- Frontend: 78 passed
- Type check: clean
- Biome lint/format: clean
- CI: both jobs green on PR #90

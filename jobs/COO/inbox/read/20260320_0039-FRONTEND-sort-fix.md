# FRONTEND Sort Fix — Completion Report
**Date:** 2026-03-20 00:39
**Agent:** FRONTEND
**Issue:** #11 — trip sort control missing (regression from pre-Tailwind version)

## What was done

Fixed `/workspace/src/frontend/components/TripList/TripsLayout.tsx`:

1. **State setter restored:** Changed `const [sortBy] = useState<SortOption>('date_desc')` to `const [sortBy, setSortBy] = useState<SortOption>('date_desc')`. The missing setter meant sort was permanently locked to `date_desc`.

2. **Sort control UI added:** Inserted a `<select>` dropdown in the left panel, below the status filter chips and above the map filter badge. Four options: Newest first (`date_desc`), Oldest first (`date_asc`), Name A–Z (`name_asc`), Name Z–A (`name_desc`). Styled with Tailwind consistent with the existing search field and chips.

## Checks
- `npm run type:check` — PASS
- `npm run test:frontend` — PASS (55 tests, 4 suites)

## Branch / PR
- Branch: `fix/sort-control`
- PR: https://github.com/ryanv11/travel-tracker/pull/13 (Closes #11)

## Notes
- `filterAndSortTrips` in `TripList.tsx` already handled all four sort modes correctly — no logic changes were needed, only the UI control was missing.

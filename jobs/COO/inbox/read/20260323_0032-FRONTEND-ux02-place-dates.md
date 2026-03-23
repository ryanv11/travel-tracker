# Completion Report: UX-02 Frontend — Place Date Ranges

**Agent:** Frontend
**Date:** 2026-03-23
**Branch:** `feat/ux-02-frontend-place-dates`
**PR:** #63 — https://github.com/ryanv11/travel-tracker/pull/63
**GitHub Issue:** #60 — feat(UX-02): place date ranges
**CI Status:** All green (CI + Security)

---

## What was changed

### `src/frontend/types/api.ts`
- Added optional `arrived_on?: string | null` and `departed_on?: string | null` to `TripPlace` interface
- Using optional (`?:`) rather than required-with-undefined to avoid breaking existing test fixtures that don't include these fields

### `src/frontend/utils/resolvePlaceDateRange.ts` (NEW)
- New utility implementing ADL-24 §5 three-source precedence model:
  1. Explicit place dates (`arrived_on` / `departed_on`) — highest priority
  2. Hotel item check-in/check-out dates (min check-in, max check-out)
  3. Trip start/end dates (fallback)
- Treats `undefined`, `null`, and absent fields as "not set"
- Partial explicit dates supported (only `arrived_on` set → `{ from, to: null }`)
- Returns `PlaceDateRange { from: string|null, to: string|null }`

### `src/frontend/utils/__tests__/resolvePlaceDateRange.test.ts` (NEW)
- 11 unit tests covering all three precedence sources and edge cases:
  - Both explicit dates set
  - Partial dates (arrived only, departed only)
  - Explicit dates override hotel items
  - `undefined` treated as not-set
  - Multiple hotels → min check-in / max check-out
  - Incomplete hotel items (missing check_in_date) excluded
  - Non-hotel items ignored
  - Trip date fallback

### `src/frontend/components/TripDetail/PlaceSection.tsx`
- Replaced `derivePlaceDateRange()` with `resolvePlaceDateRange()` from the new utility
- Explicit dates are displayed in teal (`text-teal-700 font-medium`) to indicate they're user-set, distinguishing them from hotel/trip fallback dates
- Added "Set dates" / "Edit dates" button (hidden when locked) that opens `PlaceDateForm`
- Added `showEditDates` state + `PlaceDateForm` modal rendering
- `formatDateRange()` helper handles null from/to gracefully ("From X", "Until X", "X – Y")

### `src/frontend/components/TripDetail/PlaceDateForm.tsx` (NEW)
- Modal for editing `arrived_on` / `departed_on` via `PATCH /api/trips/:tripId/places/:placeId`
- Two `<input type="date">` elements (no external library)
- Client-side validation: `arrived_on > departed_on` → inline error, blocks submit
- Backend `warnings` array displayed as amber callout with "OK, close" button; form stays open so user can acknowledge
- Uses `useUpdatePlaceDates` hook; shows `ErrorMessage` on mutation error

### `src/frontend/components/TripDetail/TripDetail.tsx`
- Added sort of places by `arrived_on` ascending (nulls last) before rendering
- Uses `[...trip.places].sort(...)` — non-destructive copy
- Sort logic is inline in the render (not buried in a utility), per ADL-24 spec note

### `src/frontend/components/TripDetail/AddPlaceFlow.tsx`
- Added optional "Arrival date" / "Departure date" `<input type="date">` fields to both the city-search step and the new-city form step
- Client-side validation: `arrivedOn > departedOn` → shows error, blocks city selection
- Backend `warnings` from POST response shown as amber callout before closing
- After place creation with warnings, a "Place Added / Warning" screen is shown; user dismisses with "OK"
- NR-06 geocoding retry still fires after successful non-warning add

### `src/frontend/hooks/usePlaces.ts`
- Updated `useAddPlace` to accept optional `arrivedOn` / `departedOn` params; only includes in POST body if not `undefined`
- Added `AddPlaceResult` interface with optional `warnings?: string[]`
- Added `useUpdatePlaceDates` mutation hook — PATCH endpoint, invalidates trip query on success
- Added `UpdatePlaceDatesResult` interface with `warnings?: string[]`
- Added `apiPatch` import

---

## Test results

```
npm run check (frontend only):  PASS — 54 files, no errors
npm run type:check:              PASS — clean
npm run test:frontend:           PASS — 72 tests, 5 test files
  (11 new tests in resolvePlaceDateRange.test.ts)
```

Backend tests not run (no backend changes; backend UX-02 work is on a separate PR).

---

## CI status

All jobs green on PR #63:
- Biome (lint + format): PASS
- Type Check: PASS
- Backend Tests: PASS
- Frontend Tests: PASS
- Security Checks: PASS

---

## Decisions made where ADL-24 left room for interpretation

1. **Type definition for `arrived_on` / `departed_on`**: Used `?: string | null` (optional) rather than `string | null | undefined` (required but possibly undefined). This avoids TypeScript errors in existing test fixtures that don't include these fields. Behavior is identical — both `undefined` and `null` mean "not set."

2. **"Set dates" vs "Edit dates" label**: The button in PlaceSection shows "Set dates" when no explicit dates are set, and "Edit dates" when they are. This provides clear affordance for first-time setting vs. updating.

3. **Visual differentiation**: Explicit dates are shown in teal to distinguish them from hotel/trip fallback dates. This was not specified in ADL-24 but improves usability.

4. **Warnings on place create flow**: When the backend returns warnings after a place is created (POST), the flow shows a "Place Added / Warning" screen rather than closing. This lets the user acknowledge the warning before returning. The carry-forward flow is not triggered in this case (warnings stop the flow).

5. **`resolvePlaceDateRange` utility location**: Created as `src/frontend/utils/resolvePlaceDateRange.ts` rather than co-locating in `PlaceSection.tsx`. This makes it testable in isolation and allows future use in other contexts (e.g., a future list view).

6. **Backend Biome failures**: `npm run check` on the full `src/` tree fails due to pre-existing formatting issues in backend files modified by the backend agent (`src/backend/middleware/auth.ts`, `src/backend/repositories/__tests__/`, etc.). These are not regressions from this PR. Frontend-only check passes clean. CI on the PR branch is green.

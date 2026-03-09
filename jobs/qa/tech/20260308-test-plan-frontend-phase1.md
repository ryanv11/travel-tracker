# QA Test Plan — Frontend Phase 1
**Date:** 2026-03-08
**Author:** QA
**Subject:** Travel Tracker React SPA — Phase 1 Acceptance Testing
**Version:** 1.0

---

## Scope

Static code review plus manual test plan for all 18 acceptance criteria from the
Frontend Phase 1 QA handoff (20260308_1430-FRONTEND-phase1-qa-handoff.txt).

Live testing requires:
- Backend running: `npm run dev:api` (port 3001)
- Frontend running: `npm run dev` (port 5173)
- `.env.local` with `VITE_MAPTILER_KEY` for map tile rendering

---

## Static Code Review — Completed

Static review of the following source files was completed before this document was
written:

| File | Status |
|------|--------|
| `src/frontend/types/api.ts` | Reviewed |
| `src/frontend/utils/urlSanitiser.ts` | Reviewed |
| `src/frontend/components/Map/MapView.tsx` | Reviewed |
| `src/frontend/components/Map/CountryLayer.tsx` | Reviewed |
| `src/frontend/components/Map/RegionLayer.tsx` | Reviewed |
| `src/frontend/components/Map/CityMarkers.tsx` | Reviewed |
| `src/frontend/components/TripList/TripCard.tsx` | Reviewed |
| `src/frontend/components/TripList/TripList.tsx` | Reviewed |
| `src/frontend/components/TripDetail/TripDetail.tsx` | Reviewed |
| `src/frontend/components/TripDetail/AddPlaceFlow.tsx` | Reviewed |
| `src/frontend/components/TripDetail/ItemForm.tsx` | Reviewed |
| `src/frontend/components/CarryForward/CarryForwardModal.tsx` | Reviewed |
| `src/frontend/components/PostTripReview/ReviewPanel.tsx` | Reviewed |
| `src/frontend/components/PostTripReview/ReviewItemRow.tsx` | Reviewed |
| `src/frontend/components/Admin/CountryTab.tsx` | Reviewed |
| `src/frontend/components/Admin/ShadingTab.tsx` | Reviewed |
| `src/frontend/hooks/useCities.ts` | Reviewed |
| `src/frontend/hooks/usePlaces.ts` | Reviewed |
| `src/frontend/hooks/useMapShading.ts` | Reviewed |
| `src/frontend/pages/MapPage.tsx` | Reviewed |
| `src/frontend/pages/TripDetailPage.tsx` | Reviewed |
| `src/backend/validation/common.ts` | Reviewed (FLAG-F1) |
| `src/backend/db/schema.ts` | Reviewed (FLAG-F1, BUG-02) |

---

## Bugs Found During Static Review

See `20260308-bug-report-frontend-phase1.md` for full reports.

| ID | Severity | Summary | AC Impacted |
|----|----------|---------|-------------|
| BUG-01 | MAJOR | City markers never displayed — TripSummary has no places | AC-05 |
| BUG-02 | MAJOR | Region shading ID mismatch — regions never shaded | MP-02 |
| BUG-03 | MAJOR | Carry-forward modal never shown — race condition | AC-12 |
| BUG-04 | MAJOR | No UI path to revert review_pending → planning | AC-13 |
| BUG-05 | MINOR | "Mark all Completed" incorrectly includes next_time items | AC-13 |
| BUG-06 | TRIVIAL | ShadingTab color picker uses defaultValue (uncontrolled) | AC-17 |
| FLAG-F1 | DOC | API reference uses wrong status terms (booked/skipped) | — |

---

## Acceptance Criteria Test Cases

### AC-01 — App starts on :5173 and :3001

| Step | Action | Expected |
|------|--------|----------|
| 1 | Run `npm run dev:api` | Server starts on :3001, no errors |
| 2 | Run `npm run dev` | Vite starts on :5173 |
| 3 | Open http://localhost:5173 | App loads, no blank page |

**Status after static review:** Needs live test

---

### AC-02 — /map renders MapLibre world map

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to /map | Map canvas renders |
| 2 | Zoom in/out | Map responds, no crash |
| 3 | Without MAPTILER_KEY | Blank canvas, no crash (expected fail mode per handoff) |

**Status after static review:** Needs live test (requires MAPTILER_KEY)

---

### AC-03 — Country shading via feature-state API

| Step | Action | Expected |
|------|--------|----------|
| 1 | Load /map with visited countries in DB | Visited countries display correct colour |
| 2 | Check never_visited country | Transparent (no fill), not black/white |
| 3 | Check active trip country | Active colour overrides other states |
| 4 | Update colour in Admin → Map Shading | Map colour updates (query invalidated) |

**Status after static review:** Code logic is correct. Needs live test.

---

### AC-04 — Region shading lazy-loads at zoom >= 4

**NOTE: BUG-02 is active — regions will NOT shade even if this flow works.**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Stay at zoom < 4, click country | Region API NOT called |
| 2 | Zoom to >= 4, click country | Region shading API called for that country |
| 3 | Zoom back below 4 | Region layer disappears |

**Status after static review:** Lazy-load trigger logic is correct (code). Region shading data will not apply correctly (BUG-02).

---

### AC-05 — City pins for geocode_status='resolved' cities

**NOTE: BUG-01 is active — city pins will NEVER appear.**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Load /map with trips that have resolved cities | City pins appear as markers |
| 2 | Pending geocode city | No pin shown (correct) |
| 3 | Failed geocode city | No pin shown (correct) |

**Status after static review:** BLOCKED by BUG-01. `MapPage` passes `TripSummary[]` (no places) to `CityMarkers`. No pins will ever render.

---

### AC-06 — /trips: trip list, filter bar, TripCards

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to /trips | List renders, cards visible |
| 2 | Filter by status | List filters correctly |
| 3 | Filter by category | List filters correctly |
| 4 | Filter by activity | List filters correctly |
| 5 | Clear filter | Full list restores |
| 6 | No trips in DB | Empty state message shown |

**Status after static review:** Code correct. Needs live test.

---

### AC-07 — New Trip modal

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "+ New Trip" | Modal opens |
| 2 | Fill name, dates, categories, companions, activities | Form accepts input |
| 3 | Submit with valid data | Trip created, list updates |
| 4 | Submit with end_date < start_date | Validation error shown |
| 5 | Submit with empty name | Validation error shown |

**Status after static review:** Needs live test.

---

### AC-08 — Edit trip + status transitions + locked banner

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open planning trip | "Mark Active" and "Move to Review" buttons shown |
| 2 | Open active trip | "Move to Review" button only |
| 3 | Open locked trip | Locked banner visible, Edit button hidden, no status buttons except unlock |
| 4 | Click "Lock Trip" | Confirm dialog appears before lock |
| 5 | Locked trip → edit | All write controls disabled |

**Status after static review:** Transitions code matches BRD. Confirm dialogs present. Needs live test.

---

### AC-09 — /trips/:id — city/place sections, Add Place flow

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open trip with places | Place sections render with items |
| 2 | Click "+ Add Place (City)" | Modal opens |
| 3 | Search 2+ chars | City results appear |
| 4 | Select existing city | Place added, places list updates |
| 5 | Click "+ Add new" | New city form opens |
| 6 | Submit new city | City created, place added |

**Status after static review:** Needs live test. BUG-03 will prevent carry-forward modal from appearing in step 4.

---

### AC-10 — Item creation: two-step form, 6 types

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click Add Item | Type selection grid shows 6 types |
| 2 | Select Restaurant | Restaurant-specific fields appear |
| 3 | Select Hotel | Hotel fields appear with date pickers |
| 4 | Select Flight | Flight fields appear |
| 5 | Select Car Rental | Car rental fields appear |
| 6 | Select Experience | Base fields only |
| 7 | Select Note | Base fields only (no type-specific) |
| 8 | Submit each type | Item created, appears in place section |

**Status after static review:** Code correct. Needs live test.

---

### AC-11 — Hotel stay duration; rating on completed items

| Step | Action | Expected |
|------|--------|----------|
| 1 | Hotel form: enter check-in and check-out | Duration label appears (e.g. "3 nights") |
| 2 | Hotel/restaurant/experience with status=completed | RatingStars + postVisitNotes textarea shown |
| 3 | Same types with status=consider or confirmed | No rating fields shown |
| 4 | Flight/car_rental/note with status=completed | No rating fields shown |

**Status after static review:** Code correct. Needs live test.

---

### AC-12 — Carry-forward modal

**NOTE: BUG-03 is active — modal will not appear.**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Add place for city with next_time items | Carry-forward modal appears |
| 2 | Modal: all items pre-selected | Checkboxes all checked |
| 3 | Deselect all items | "Carry Forward" button disabled |
| 4 | Partial selection, click Carry Forward | Items added, success message, modal closes |
| 5 | City with zero next_time items | Modal does not appear, flow closes |

**Status after static review:** BLOCKED by BUG-03. Race condition ensures modal never appears.

---

### AC-13 — Post-trip review and lock

**NOTE: BUG-04 is active — no path to revert to Planning from review_pending.**
**NOTE: BUG-05 is active — next_time items incorrectly included in bulk-complete.**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to review_pending trip | ReviewPanel renders |
| 2 | Per-item status dropdowns | Each change POPs PATCH immediately |
| 3 | Rating + notes for completed restaurant/hotel/experience | Visible and saveable |
| 4 | Click "Mark all as Completed" | consider + confirmed items → completed; next_time items NOT changed |
| 5 | Click "Complete Review & Lock Trip" | Confirm dialog appears |
| 6 | Confirm lock | Trip locked, navigate to /trips |
| 7 | Access locked trip | Read-only, no edit controls |
| 8 | Attempt to Return to Planning from review_pending | NO UI PATH — BUG-04 |

**Status after static review:** Steps 1–3, 5–7 appear correct in code. Step 4 fails (BUG-05). Step 8 impossible (BUG-04).

---

### AC-14 — Admin → Categories

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Admin → Categories | All categories listed |
| 2 | Add new category | Appears in list immediately |
| 3 | Inline edit name | Name updates on save |
| 4 | Deactivate | Removed from trip form dropdowns, stays in admin list |
| 5 | Re-activate | Returns to trip form dropdowns |

**Status after static review:** Needs live test.

---

### AC-15 — Admin → Activities
Same pattern as AC-14. Needs live test.

### AC-16 — Admin → Companions
Same pattern as AC-14. Needs live test.

---

### AC-17 — Admin → Map Shading: colour picker

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Admin → Map Shading | 6 shading states listed with swatches |
| 2 | Click colour picker, select new colour | Swatch and hex value update live |
| 3 | Navigate to /map | Map reflects new colour |
| 4 | Reload admin page | Saved colour persists |

**Status after static review:** Code calls PATCH on change and invalidates queries. One TRIVIAL note: colour picker uses `defaultValue` (uncontrolled) so the picker element itself may not re-sync after a remote change — swatch and hex text will update correctly. Needs live test.

---

### AC-18 — Admin → Countries: search + region_tier toggle

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Admin → Countries | All 250 countries listed |
| 2 | Type in search box | List filters in real time |
| 3 | Toggle region_tier_enabled for a country | PATCH called, checkbox updates |
| 4 | Toggled-on country | region_tier_label badge appears |
| 5 | Toggled-off country | Badge disappears |
| 6 | Rapid clicks on same checkbox | Double-fire mostly prevented (shared isPending) |
| 7 | Search "zzz" | "No countries match" empty state |

**Status after static review:** Code correct. Note on step 6: there is a tiny window before React re-render where a second rapid click could slip through — MINOR concern for a personal-use admin panel.

---

### SEC-12 — URL sanitisation

| Step | Action | Expected |
|------|--------|----------|
| 1 | Trip with photo_album_ref = "https://photos.example.com/..." | Rendered as clickable link |
| 2 | Trip with photo_album_ref = "javascript:alert(1)" | No link rendered; shown as plain text |
| 3 | Trip with photo_album_ref = "http://..." | No link rendered; shown as plain text (http rejected) |
| 4 | Trip with photo_album_ref = "file:///Users/ryan/..." | Rendered as clickable link |
| 5 | Trip with photo_album_ref = null | Nothing rendered |

**Status after static review:** `sanitiseUrl()` correctly implemented. `TripCard` correctly calls it before rendering. ✓

---

## FLAG-F1 — Item Status Terminology

**Finding:** The API reference document (`jobs/backend/tech/20260307-api-reference.md`, Item Status Values table) lists item statuses as:
- `booked` (instead of `confirmed`)
- `skipped` (instead of `cancelled`)

**Actual implementation (all in agreement):**
- Backend Zod schema (`src/backend/validation/common.ts`): `confirmed`, `cancelled`
- Database schema (`src/backend/db/schema.ts`): `confirmed`, `cancelled`
- Frontend types (`src/frontend/types/api.ts`): `confirmed`, `cancelled`
- BRD Section 4: Confirmed, Cancelled

**Verdict:** The API reference doc contains a documentation error. The code is correct and consistent. The API reference doc must be updated by BACKEND. This is not a blocker for Phase 1 testing — the actual API accepts the correct values.

---

## Test Priority Order

1. **BLOCKER — fix before any live testing:**
   BUG-01, BUG-02, BUG-03, BUG-04

2. **Fix before AC sign-off:**
   BUG-05

3. **Live test after blockers fixed:**
   AC-01, AC-02, AC-06 through AC-18

4. **Deferred (cosmetic):**
   BUG-06

---

*QA Engineer — 2026-03-08*

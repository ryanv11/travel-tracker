---
FROM: ARCHITECT
TO: COO
DATE: 2026-03-21 09:00
RE: BRD v2.4 Technical Review — TR-11, TR-10, DP-04
---

## Summary Table

| Item | Decision | Recommendation | Confidence |
|------|----------|----------------|------------|
| TR-11 Routing | URL-encoded, nested route pattern | `/trips` parent with `<Outlet />`, `/trips/:id` child | High |
| TR-10 Filter | Client-side for search; keep API-side for status/category/activity | No change to backend; search stays in React | High |
| DP-04 Date derivation | Frontend — no backend change needed | Derive in React from hotel items already in response | High |

---

## TR-11 — Two-Panel Routing

**Decision: URL-encoded selection with nested React Router routes.**

Use `/trips` as the parent route rendering the two-panel shell (left panel always visible). Use `/trips/:id` as a child route rendered into a right-panel `<Outlet />`. When no trip is selected, the right panel shows an empty/prompt state.

**Why URL-encoded, not client state only:**

Shareability and bookmarkability are minor wins, but the decisive reason is future-proofing for F-02/F-03 (per-trip tabs, currently deferred). When those tabs land, the URL will need to encode both the selected trip and the active tab — e.g. `/trips/:id/items` or `/trips/:id/map`. Starting with client state only means a later refactor to URL routing when tabs arrive. Starting with the nested route pattern now means adding tabs is a further nesting step, not a structural change.

**Pattern:**

```
/trips              → App.tsx renders <TripsPage>
                        TripsPage renders two-panel layout
                        Left panel: TripList (always rendered)
                        Right panel: <Outlet /> (or empty state if no :id)

/trips/:id          → React Router matches child route
                        Right panel renders TripDetail for the selected trip
```

The key change from the current implementation: `TripsPage` becomes the layout shell rather than a simple wrapper. `TripDetailPage` becomes the right-panel child route instead of a full-page sibling route. The left panel never unmounts on trip selection — React Router's nested outlet handles this natively.

**Current routing state:** App.tsx currently has `/trips` and `/trips/:id` as flat sibling routes, so selecting a trip navigates away from the list entirely. This matches the old single-panel design, not TR-11. Frontend must restructure these as nested routes.

**F-02/F-03 forward compatibility:** When per-trip tabs are added, they extend the nesting one level deeper: `/trips/:id` becomes the trip shell (with a tab bar), and `/trips/:id/items`, `/trips/:id/map` etc. become grandchild routes. The pattern chosen now accommodates that without structural rework.

**No impact on backend routing or API contract.** This is a pure frontend concern.

---

## TR-10 — Search + Status Filter API Contract

**Decision: Keep the split that already exists in the codebase — status/category/activity filtering stays API-side; name search stays client-side.**

The current implementation already implements the right pattern:
- `GET /api/trips?status=planning&category_id=2&activity_id=5` — backend already validates and applies these via `ListTripsQuerySchema` and the route handler
- Name search is already client-side in `filterAndSortTrips()` in TripList.tsx

**Why not move search to the API?** The dataset is small (single user, SQLite, dozens of trips). A `LIKE` query would work fine technically, but it adds a backend parameter, a schema change to `ListTripsQuerySchema`, and a new index consideration — for zero user-visible benefit at this scale. Client-side search over the already-fetched list array is instantaneous and simpler to reason about.

**Why keep status/category/activity API-side?** These are coarse filters that can significantly reduce the result set, and the infrastructure is already in place. Moving them client-side would mean always fetching the full list — fine now, but unnecessarily lazy given the backend already handles it correctly.

**Exact query param contract (for Backend reference — already implemented):**

| Param | Type | Values | Notes |
|-------|------|--------|-------|
| `status` | string enum | `planning`, `active`, `review_pending`, `locked` | Optional; omit for all |
| `category_id` | integer | positive integer | Optional; coerced by Zod |
| `activity_id` | integer | positive integer | Optional; coerced by Zod |

Search is not a query param. Frontend applies `name.toLowerCase().includes(searchText.trim().toLowerCase())` against the fetched array.

**NF-05/NF-06 future consideration:** If the dataset grows substantially (hosted multi-user, many trips), moving search to API-side is a straightforward additive change — add `search?: z.string().trim().optional()` to `ListTripsQuerySchema`, add `LIKE '%?%'` to the Drizzle query, and remove the client-side text filter. The client code that passes `searchText` as a query param requires no structural change to the component. No architectural debt is created by keeping it client-side now.

**Verdict:** No backend change required for TR-10. Frontend only adds the UI controls (search input already exists in TripList.tsx; status filter chips need to be added to the existing status dropdown pattern).

---

## DP-04 — Place Date Range Derivation

**Decision: Frontend derivation. No backend change required.**

The trip detail endpoint (`GET /api/trips/:id`) already includes all hotel items for each place in the response. The `fetchItemsWithExtensions()` helper left-joins `item_hotels` and returns `check_in_date` and `check_out_date` on every hotel item. These are nested under `place.items[]` in the response, with `item_type === 'hotel'`.

**Confirmed derivation logic for Frontend to implement:**

For each place in the trip detail response:
1. Filter `place.items` to items where `item_type === 'hotel'` and `check_in_date` is non-null
2. If any such items exist: `place_start_date = min(check_in_date)`, `place_end_date = max(check_out_date)`
3. If no hotel items with dates: `place_start_date = trip.start_date`, `place_end_date = trip.end_date`

This is a pure derive-from-existing-data operation. No new fields need to be added to the API response. No computed column or schema addition is needed.

**Why frontend and not backend?**

- The data is already in the response — adding a backend computed field would be a redundant transform of data that frontend already has access to.
- The derivation is display logic tied to the UI layout of PlaceSection. It belongs at the presentation layer.
- Backend computed fields add API surface area that must be documented, typed, and maintained. This one-liner derivation does not warrant that overhead.
- If the rule ever changes (e.g. "use flight arrival date instead of hotel check-in if no hotel exists"), changing a frontend utility function is simpler than changing an API contract.

**Data already confirmed present in response:**

From `items-helper.ts` `flattenItem()`, hotel items in the response include:
- `check_in_date` (ISO 8601 date string or null)
- `check_out_date` (ISO 8601 date string or null)

These are already nested under each `place.items[]` array in the `GET /api/trips/:id` response. **No backend enrichment needed.**

---

*All three questions are resolved with no backend schema changes and no new API endpoints. TR-11 requires a frontend routing restructure. TR-10 requires frontend UI additions only (status chips). DP-04 requires a frontend utility function only.*

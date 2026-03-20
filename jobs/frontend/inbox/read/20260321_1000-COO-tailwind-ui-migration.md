TO: FRONTEND
FROM: COO
DATE: 2026-03-21 10:00
RE: Tailwind migration + BRD v2.4 UI implementation

---

## OVERVIEW

This brief covers two interleaved workstreams that must be delivered together:

1. **Tailwind migration** — replace all inline `React.CSSProperties` with Tailwind utility classes
2. **BRD v2.4 UI changes** — implement all approved UI/feature items from the Option B mockup

Do not deliver the migration without the BRD v2.4 changes, and do not implement the BRD v2.4 changes on top of the old inline-style system. These ship together.

Current styling approach: **100% inline `React.CSSProperties`** — no CSS framework installed. This is the baseline you are migrating away from.

---

## PART 1 — TAILWIND SETUP

Install and configure Tailwind CSS v4 (latest). The project uses Vite — use the `@tailwindcss/vite` plugin.

```bash
npm install -D tailwindcss @tailwindcss/vite
```

Configure in `vite.config.ts`:
```ts
import tailwindcss from '@tailwindcss/vite'
// add to plugins array
```

Add to the top of `src/frontend/index.css` (or equivalent global CSS entry):
```css
@import "tailwindcss";
```

Remove the inline `<style>` tag injected in `main.tsx` — migrate any global styles it contains to the CSS file using Tailwind utilities or `@layer base`.

Color palette already in use (map to Tailwind equivalents or keep as CSS custom properties if non-standard):
- Primary: `#2563EB` → `blue-600`
- Text primary: `#111827` → `gray-900`
- Text secondary: `#374151` → `gray-700`, `#6B7280` → `gray-500`
- Borders: `#E5E7EB` → `gray-200`, `#D1D5DB` → `gray-300`
- Background subtle: `#F9FAFB` → `gray-50`, `#F3F4F6` → `gray-100`
- Warning: `#FEF3C7` → `yellow-100`, `#D97706` → `amber-600`

---

## PART 2 — ROUTING RESTRUCTURE (TR-11)

**Current state (flat siblings — wrong):**
```tsx
<Route path="/trips" element={<TripsPage />} />
<Route path="/trips/:id" element={<TripDetailPage />} />
```

**Required state (nested routes):**
```tsx
<Route path="/trips" element={<TripsLayout />}>
  <Route index element={<TripsPage />} />   // or just empty right panel
  <Route path=":id" element={<TripDetail />} />
</Route>
```

`TripsLayout` is the two-panel shell — it renders always. It owns the left panel (trip list) and an `<Outlet />` slot for the right panel.

When no trip is selected (`/trips`), the right panel shows an empty state or prompt ("Select a trip").
When a trip is selected (`/trips/:id`), the right panel renders `TripDetail` via `<Outlet />`.

Navigating from list item → trip must use `<Link to={trip.id.toString()}>` (relative) or `navigate(trip.id.toString())`, not a full page nav to `/trips/:id` that unmounts the left panel.

**Why URL-encoded (not client state):** Bookmarkable, shareable, back-button works. Also forward-compatible with future per-trip tabs (F-02/F-03) which will add `/trips/:id/items`, `/trips/:id/map` as deeper nested children — the structure nests cleanly without rework.

**TripDetailPage** (the old separate page component) can be retired or repurposed as `TripDetail` panel component.

---

## PART 3 — TWO-PANEL LAYOUT (F-01)

`TripsLayout` shell layout:

- Full viewport height, no scroll on the shell itself
- **Left panel:** fixed width (~360px), full height, scrollable internally, contains search + filter + trip list
- **Right panel:** fills remaining width, full height, scrollable internally, contains trip detail or empty state
- Panels are side-by-side on desktop (flex row)
- No mobile breakpoint required for this phase — desktop-only layout is acceptable

Left panel structure (top to bottom):
1. Header row: "Trips" title + trip count badge (D-05)
2. Search field (F-06)
3. Status filter chips (F-07): All / Planning / Active / Review / Locked
4. Scrollable trip card list

Right panel structure:
- `<Outlet />` — renders TripDetail when a trip is selected, empty state otherwise

---

## PART 4 — SEARCH + STATUS FILTER (TR-10 / F-06 / F-07)

**Architecture (from Architect review):**
- Status/category/activity filtering: already API-side via `ListTripsQuerySchema` query params. No backend change needed.
- Name search: already client-side in `filterAndSortTrips()`. No backend change needed.

**What to build:**

**F-06 — Search field:**
- Text input in left panel header area, below the "Trips" title
- Placeholder: "Search trips…"
- Controlled input wired to the existing client-side `filterAndSortTrips()` name filter
- No debounce required at this scale

**F-07 — Status filter chips:**
- Horizontal row of pill/chip buttons: All · Planning · Active · Review · Locked
- Single-select (selecting one deselects others; "All" clears the filter)
- Selected chip: filled `blue-600` background, white text
- Unselected chip: white background, `gray-600` text, `gray-200` border
- Wire to the existing API-side `status` query param on `GET /api/trips`
- "All" = no `status` param sent

---

## PART 5 — TRIP CARD ENHANCEMENTS

**D-05 — Trip count badge:**
- In the left panel header: "Trips (12)" or a small badge showing total count
- Count = total trips returned by current query (after any active filters)

**D-06 — Place name badges on cards:**
- Each trip card shows small pill badges for each place in that trip
- E.g. "Dublin · London · Paris" as soft gray pills
- Source: `trip.places[].name` — already in the list response
- If more than ~4 places, truncate with "+N more" pill

---

## PART 6 — TRIP DETAIL HEADER ENHANCEMENTS

The right panel trip detail header currently shows: title, dates, status badge.

Add the following (from mockup delta):

**D-01 — Companions:**
- Display companion names in a meta row below the title
- Source: `trip.companions[]` — check if already in trip detail response; if not, flag
- Format: icon + "Alice, Bob, Carol" or individual avatar-style initials chips

**D-02 — Category badges:**
- Show category (and optionally activity) as badge(s) in the header meta row
- Source: `trip.category.name`, `trip.activity.name`
- Style: small rounded pill, neutral gray background

**D-03 — Per-place date range in subtitle (DP-04):**
- Each `PlaceSection` subtitle shows the date range for that place
- **Derivation logic (frontend, no backend change):**
  - Find all hotel items (`item.type === 'hotel'` or equivalent) within `place.items[]`
  - If hotel items with dates exist: `place_start = min(check_in_date)`, `place_end = max(check_out_date)`
  - Fallback (no hotel items): use `trip.start_date` / `trip.end_date`
- Format: "12 Mar – 15 Mar 2026" (match existing date formatting convention in the codebase)

**D-04 — Country name in PlaceSection subtitle:**
- Show full country name alongside city in place section header
- Source: `place.country` or similar — check trip detail response shape
- Format: "Dublin, Ireland" or "Dublin · Ireland"

---

## PART 7 — PERSISTENT STATUS TRANSITION BAR (F-04 / TR-12)

A persistent action bar at the bottom of the trip detail right panel (not a floating modal — always visible when a trip is selected).

**Contents:**
- Current status label: "Status: Planning"
- CTA button: context-sensitive next action
  - Planning → "Mark as Active"
  - Active → "Move to Review"
  - Review → "Lock Trip"
  - Locked → (no CTA, or "Locked" disabled state)
- The bar replaces or absorbs any existing inline status-change UI in the detail view

**Behaviour:**
- Clicking CTA calls the existing status transition API endpoint
- Optimistic update or refetch on success (match existing pattern in the codebase)
- Bar is sticky to the bottom of the right panel (not the viewport)

---

## PART 8 — PHOTOS BUTTON (PH-03 / F-08)

- Add a "Photos" button to the trip detail action bar / header area
- For this phase: button is **present but non-functional** (disabled or shows a "Coming soon" toast)
- This is a placeholder — photos feature is post-MVP
- Style consistent with other action buttons in the header

---

## DELIVERY REQUIREMENTS

1. **All inline `React.CSSProperties`** replaced with Tailwind classes across every component touched. Do not leave a mixed codebase — if you touch a file, migrate it fully.
2. **Routing restructured** per TR-11 (nested routes, URL-encoded selection).
3. **All BRD v2.4 approved items** from Parts 3–8 implemented.
4. **Tests must pass:** `npm run test:frontend` and `npm run type:check` green before filing completion.
5. **Do not modify** backend files, schema, or API contracts. All changes are frontend-only.
6. If you discover the trip detail API response is missing `companions`, `category`, or `activity` data needed for D-01/D-02, **flag it in your completion report** rather than modifying the backend — the COO will dispatch a backend enrichment task separately.

---

## OUT OF SCOPE FOR THIS BRIEF

- F-02 / F-03 (per-trip tabs, per-trip map) — deferred
- FEAT-BD (multi-select delete) — separate brief to follow
- Mobile/responsive layout — desktop-only for this phase
- Photos feature implementation (PH-03 is placeholder only)
- Any backend or schema changes

---

## COMPLETION REPORT

File to: `/workspace/jobs/COO/inbox/` using standard filename format.

Include:
- Confirmation all Parts 1–8 delivered
- Test results (`test:frontend` pass count, `type:check` clean)
- Any flags (missing API fields, ambiguous specs, deferred items)
- Commit hash

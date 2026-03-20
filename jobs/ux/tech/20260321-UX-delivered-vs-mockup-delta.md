# UX Delta — Delivered UI vs Approved Option B Mockup
**Date:** 2026-03-21
**Author:** UX
**Trigger:** COO brief 2026-03-21 11:00, UAT session 2026-03-20 (verdict: PARTIAL, build 77a415b)
**Mockup source:** `jobs/ux/tech/mockup-option-b.html`
**Delivered files reviewed:**
- `src/frontend/components/TripList/TripsLayout.tsx`
- `src/frontend/components/TripList/TripCard.tsx`
- `src/frontend/components/TripDetail/TripDetail.tsx`
- `src/frontend/components/TripDetail/PlaceSection.tsx`
- `src/frontend/components/shared/StatusBadge.tsx`
- `src/frontend/App.tsx`
- `src/frontend/index.css`

**Reference:** Previous delta doc `jobs/ux/tech/20260320-UX-mockup-delta.md`

---

## How to read this document

Each item follows the structure requested in the COO brief:

- **Mockup spec** — what the approved Option B mockup specifies
- **Delivered** — what the delivered code actually does
- **Fix required** — specific, actionable instruction for Frontend
- **Tailwind tokens / colors** — exact class strings where applicable

Items are ordered by visual impact. All items are confirmed against the source files above — nothing is speculative.

---

## DELTA ITEMS

---

### DELTA-01 — Color theme: blue vs teal/green throughout

**Mockup spec:** The mockup's entire design system is built on a teal palette. Primary color token is `--primary: #0D9488` (Tailwind `teal-600`). Interactive elements (active nav link, selected trip card border, active filter chip, "+ New" button, status transition CTA, "Add Item" button) all use teal. Active state on filter chips uses `--primary-subtle: #CCFBF1` (teal-100) background with `--primary-text: #134E4A` text. Focus rings use teal. The `planning` status badge uses teal-100 / teal-900.

**Delivered:** The entire delivered UI uses blue. Specific instances:
- `TripsLayout.tsx` line 112: `bg-blue-600` for the "+ New" button
- `TripsLayout.tsx` line 125: `focus:ring-blue-500` on the search field
- `TripsLayout.tsx` line 144–148: active filter chip uses `bg-blue-600 text-white border-blue-600`
- `TripsLayout.tsx` line 158: map filter badge uses `bg-blue-50 border-blue-200 text-blue-700`
- `TripCard.tsx` line 47: selected card border `border-blue-500 ring-blue-500`
- `PlaceSection.tsx` line 112: "+ Add Item" button uses `bg-blue-600 hover:bg-blue-700`
- `TripDetail.tsx` line 228: status CTA button uses `bg-blue-600 text-white hover:bg-blue-700`
- `App.tsx` lines 39–40: active nav link uses `text-blue-600 bg-blue-50`
- `StatusBadge.tsx` line 35: `planning` status uses `bg-blue-100 text-blue-800`

**Fix required:** Replace all blue tokens with teal equivalents throughout. Full substitution map:

| Current (blue) | Correct (teal) | Context |
|---|---|---|
| `bg-blue-600` | `bg-teal-600` | "+ New" button, active filter chip, "+ Add Item" button, status CTA |
| `hover:bg-blue-700` | `hover:bg-teal-700` | All hover states on teal-600 buttons |
| `text-white` | `text-white` | No change — white text on teal-600 is correct |
| `border-blue-600` | `border-teal-600` | Active filter chip border |
| `focus:ring-blue-500` | `focus:ring-teal-500` | Search field focus ring |
| `border-blue-500 ring-1 ring-blue-500` | `border-teal-500 ring-1 ring-teal-500` | Selected trip card |
| `bg-blue-50 border-blue-200 text-blue-700` | `bg-teal-50 border-teal-200 text-teal-700` | Map filter badge |
| `text-blue-600 bg-blue-50` (nav active) | `text-teal-700 bg-teal-50` | Active nav link |
| `bg-blue-100 text-blue-800` (planning badge) | `bg-teal-100 text-teal-900` | StatusBadge: planning |
| `bg-blue-100 text-blue-700` (companion avatar) | `bg-teal-100 text-teal-800` | Companion initials circle in TripDetail |

The `active` trip status badge in `StatusBadge.tsx` (`bg-green-100 text-green-800`) is correct per the mockup (`--accent-subtle`/`--accent-text` amber was used for Active in the mockup — see DELTA-02 below).

**Tailwind tokens:** `teal-50`, `teal-100`, `teal-500`, `teal-600`, `teal-700`, `teal-900`

---

### DELTA-02 — StatusBadge: "Active" status color incorrect

**Mockup spec:** The `active` trip status badge uses amber styling: background `--accent-subtle: #FEF3C7` (amber-100), text `--accent-text: #92400E` (amber-800). The CSS class in the mockup is `.badge-active { background: var(--accent-subtle); color: var(--accent-text); }`.

**Delivered:** `StatusBadge.tsx` line 36: `active: 'bg-green-100 text-green-800'` — green, not amber.

**Fix required:** In `StatusBadge.tsx`, change the `active` status color from green to amber:

```
active: 'bg-amber-100 text-amber-800',
```

**Tailwind tokens:** `bg-amber-100 text-amber-800`

---

### DELTA-03 — StatusBadge: "Review Pending" label and color mismatch

**Mockup spec:** The review status badge in the mockup is labelled "Review" (not "Review Pending") and uses amber styling matching the Active badge: `.badge-review { background: var(--accent-subtle); color: var(--accent); }` — amber-100 bg, amber-600 text.

**Delivered:** `StatusBadge.tsx` line 29 labels it `'Review Pending'` and line 37 colors it `'bg-orange-100 text-orange-800'`. The label is verbose and the color token is orange rather than amber.

**Fix required:** Two changes in `StatusBadge.tsx`:
1. Change the label: `review_pending: 'Review'`
2. Change the color: `review_pending: 'bg-amber-100 text-amber-600'`

Note: the filter chip label in `TripsLayout.tsx` line 28 already reads `'Review'` — this is correct. Only the StatusBadge label needs changing.

**Tailwind tokens:** `bg-amber-100 text-amber-600`

---

### DELTA-04 — Trip detail header: element order and layout

**Mockup spec (`.detail-title-row`):**
```
[Title (h1, left, flex:1)]    [Status badge | Edit button | Photos button (right, flex-shrink-0)]
```
The status badge sits to the RIGHT of the title, inside `.detail-actions`. Order within `.detail-actions`: **Status badge → Edit → Photos**.

**Delivered (`TripDetail.tsx` lines 100–168):** The title (`h1`) and status badge are grouped together on the LEFT side inside a flex container (`flex items-center gap-3 flex-wrap`). The right-side actions group (`flex items-center gap-2 flex-shrink-0`) contains only **Photos → Edit** (Photos first, Edit second).

There are two discrepancies:
1. Status badge is on the LEFT with the title, not on the RIGHT with the action buttons.
2. Button order is Photos → Edit; mockup specifies Status → Edit → Photos.

**Fix required:**
- Move `<StatusBadge>` out of the title group and into the right-side actions div.
- Reorder the actions div to: `<StatusBadge>` first, then `Edit` button, then `Photos` button.
- The resulting right-side group structure should be: `[StatusBadge] [Edit button] [Photos button]`
- The title `h1` should remain alone in the left side of the header row.

The outer header row layout (`flex justify-between items-start gap-3`) is correct — keep it.

**Tailwind tokens / colors:** No color changes needed for this item. The status badge and button styles are addressed in other delta items.

---

### DELTA-05 — Trip detail meta row: stacked lines vs single inline row

**Mockup spec (`.detail-meta`):** All three pieces of metadata appear on a single horizontal flex row below the title row, separated by pipe `|` characters:

```
15 Mar 2026 – 24 Mar 2026  |  Sophie, James  |  [Road Trip badge]  [Culture badge]
```

The separator `|` is rendered as a `<span class="detail-meta-sep">` with color `var(--border-strong)` (#CBD5E1, Tailwind `slate-300`). Companions appear as plain text (comma-separated names). Category badges are violet chips.

**Delivered (`TripDetail.tsx` lines 108–146):** The metadata is rendered in three separate stacked blocks:
1. Date range as `<p>` (line 109–111)
2. Companions as a separate `<div>` with a "With" label and avatar circles + text (lines 114–130)
3. Categories/activities as a separate `<div>` (lines 133–146)

These are three distinct vertical elements, not one inline row.

**Fix required:** Collapse the three metadata elements into a single `<div>` with `flex items-center flex-wrap gap-3` and insert pipe separators between non-empty sections. Specific requirements:

- Date range: plain text, `text-xs text-slate-500` (or `text-gray-500`)
- Separator `|`: `<span className="text-slate-300">|</span>` — show only when the next section is non-empty
- Companions: plain comma-separated text — **no avatar circles**, no "With" label. Example: `Sophie, James`. Text style: `text-xs text-slate-500`
- Separator `|` before categories if companions are present
- Categories: violet chip badges — `bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full text-xs font-medium`
- Activities: same violet chip style (the mockup shows categories only, but activities should use the same chip style)
- The "With" label and the circular avatar initials are not in the mockup — remove them from the meta row

The companion avatar circles (`w-7 h-7 rounded-full bg-blue-100 text-blue-700`) are an addition not in the mockup. They should be removed from the header meta row entirely (they can be kept if a separate companions section is desired lower in the detail, but that is out of scope for this delta).

**Tailwind tokens:** `bg-violet-100 text-violet-800`, `text-slate-300` (for pipe separator)

---

### DELTA-06 — Status bar: position (bottom sticky vs below tabs)

**Mockup spec (`.status-bar`):** The status bar is positioned between the tab strip and the scrollable content area — it sits ABOVE the scrollable content as a persistent non-scrolling strip. In the mockup's DOM order: header → tabs → status-bar → scrollable content. The bar has `bg-subtle` (slate-100) background, `border-bottom`, 8px/24px padding. Content: left side shows `"Status:"` label + current status badge; right side shows the CTA button and the "Next:" hint text.

**Delivered (`TripDetail.tsx` lines 213–249):** The status bar is at the BOTTOM of the panel, below the scrollable content area — it is a sticky footer, not a sub-header strip. It uses `border-t border-gray-200 bg-white` (white background, top border). The content layout is left=status label, right=CTA button (matching intent), but there is no "Next:" hint text.

Additionally the CTA button for non-lock transitions uses `bg-blue-600 text-white hover:bg-blue-700` — should be `bg-emerald-600` / `btn-success` per the mockup (`.btn-success { background: var(--emerald-600); color: white; }`).

**Fix required:**

1. **Position:** Restructure `TripDetail.tsx` so the status bar renders as a non-scrolling strip between the tab area and the scrollable content div, not as a sticky bottom footer. The `flex-col h-full` layout should be: `[header zone] [status-bar] [scrollable content flex-1 overflow-y-auto]`.

2. **Background:** Change the status bar from `bg-white border-t` to `bg-slate-100 border-b border-slate-200` (or Tailwind equivalents `bg-gray-100 border-b border-gray-200`).

3. **CTA button color:** Change the non-lock CTA from `bg-blue-600 hover:bg-blue-700` to `bg-emerald-600 hover:bg-emerald-700 text-white` (Tailwind `emerald-600`).

4. **"Next:" hint text:** Add a hint span after the CTA button. For each status, the hint should read:
   - `planning → active`: `"Next: mark active → review → lock"`
   - `active → review_pending`: `"Next: post-trip review → lock"`
   - `review_pending → locked`: `"Next: lock trip"`
   Style: `text-xs text-gray-500 ml-2`

Note: The bottom-sticky position is a product/UX positioning decision confirmed against the mockup. The mockup clearly places the status bar as a sub-header. However, the current bottom position may have been an intentional product call — Frontend should confirm with PO before moving it if there is any ambiguity. The mockup spec is unambiguous on this point.

**Tailwind tokens:** `bg-gray-100 border-b border-gray-200` (bar), `bg-emerald-600 hover:bg-emerald-700` (CTA)

---

### DELTA-07 — Trip detail: tab strip absent

**Mockup spec:** A tab strip (`.detail-tabs`) sits at the bottom of `.detail-pane-header`, immediately above the status bar. Tabs: **Itinerary** | **Review** | **Map**. Active tab: bottom border in teal (`--primary`), teal text. Inactive tabs: `text-muted`.

**Delivered:** No tab strip exists in `TripDetail.tsx`. The component renders a flat list of places directly.

**Fix required (scope-limited per brief):** Implement the tab strip UI shell only — not the content of Review or Map tabs (that is deferred per COO brief scope note). Requirements for the shell:

- Three tabs: `Itinerary`, `Review`, `Map`
- Default active: `Itinerary`
- Active tab style: bottom border `border-b-2 border-teal-600`, text `text-teal-600 font-semibold`
- Inactive tab style: text `text-gray-500`, hover `text-gray-700`
- Tab strip container: `flex border-b border-gray-200 mt-0.5` (matches mockup `.detail-tabs`)
- Each tab: `px-4 py-2 text-sm font-medium cursor-pointer`
- When `Itinerary` is active, render the current places/items content
- When `Review` or `Map` is active, render a placeholder: `<div className="flex-1 flex items-center justify-center text-sm text-gray-400">Coming soon</div>`
- Tab state is local component state (no routing change required for the shell)

**Tailwind tokens:** `border-teal-600 text-teal-600` (active tab), `text-gray-500` (inactive)

---

### DELTA-08 — PlaceSection: city box shading absent

**Mockup spec (`.place-section`, `.place-header`):** Each city/place card is a distinct box with:
- Outer wrapper: `background: var(--bg-surface)` (white), `border: 1px solid var(--border-default)` (slate-200), `border-radius: 8px`, `box-shadow: 0 1px 2px rgba(0,0,0,0.06)` — a visible card with elevation
- Section header: `background: var(--bg-subtle)` (#F1F5F9, slate-100) — a visually distinct shaded header row inside the card
- The combination creates: white card body + shaded header band = clear visual grouping

**Delivered (`PlaceSection.tsx` line 79):** `className="border border-gray-200 rounded-lg overflow-hidden mb-4"` — the outer wrapper has a border and rounded corners, which is correct. However, the delivered code uses `bg-white` for the main content area (line 119: `px-4 py-3`) implicitly, and the header uses `bg-gray-50` (line 81: `bg-gray-50 px-4 py-3`). This is close but has two gaps:

1. **No box shadow on the outer card.** The mockup has `box-shadow: 0 1px 2px rgba(0,0,0,0.06)` which gives each city card subtle elevation/depth. The delivered wrapper has no shadow class.
2. **Header shading is `bg-gray-50` instead of `bg-gray-100` (slate-100).** The difference is subtle but `bg-gray-50` (#F9FAFB) is much lighter than `bg-gray-100` (#F3F4F6). The mockup uses `--bg-subtle: #F1F5F9` (Tailwind `slate-100` ≈ `gray-100`). The intended shading should be noticeably distinct from the card body.

**Fix required:**
1. Add `shadow-sm` to the outer `PlaceSection` wrapper div (equivalent to `box-shadow: 0 1px 2px rgba(0,0,0,0.06)`).
2. Change the place header background from `bg-gray-50` to `bg-gray-100` (or `bg-slate-100`).

**Tailwind tokens:** Add `shadow-sm` to outer wrapper; change `bg-gray-50` → `bg-gray-100` on the header div.

---

### DELTA-09 — PlaceSection: country code vs full country name

**Mockup spec (`.place-subtitle`):** The subtitle below the city name reads `"Ireland · 15–18 Mar"` — using the **full country name**, not a country code. Separator is a centered dot (`·`).

**Delivered (`PlaceSection.tsx` line 84–85):** The city name and country are rendered as separate spans with no separator: `{place.city.name}` followed by `{place.city.country_code}` with `ml-1.5 text-xs text-gray-500`. The country code is displayed (e.g. "IE"), not the full name. The date range is on a separate `<p>` below.

Note: The code comment at line 83 acknowledges this: "full country name not yet in API — see completion report". This is a known data dependency (D-04). The layout issue (country code inline vs subtitle format with dot separator) is separately fixable regardless of whether the API returns a code or full name.

**Fix required:**
1. **Separator:** Add a `·` separator between country and the date range. The subtitle should read: `{country_name} · {dateRange}` all on one line.
2. **Layout:** Combine the country and date range into a single subtitle line rather than two separate elements. Target format: `<p className="mt-0.5 text-xs text-gray-500">{place.city.country_code} · {formatDate(dateRange.start)} – {formatDate(dateRange.end)}</p>` (using country code until API provides full name).
3. When the API is updated to return a full country name field, swap `country_code` for that field.

**Tailwind tokens:** No change needed — `text-xs text-gray-500` is correct.

---

### DELTA-10 — Left panel: "My Trips" label vs "Trips"

**Mockup spec (`.left-panel-title`):** The left panel header reads **"My Trips"**.

**Delivered (`TripsLayout.tsx` line 102):** The heading reads simply `"Trips"`.

**Fix required:** Change the `<h2>` text content from `"Trips"` to `"My Trips"`.

**Tailwind tokens / colors:** None.

---

### DELTA-11 — Left panel width: 360px vs 320px

**Mockup spec:** Left panel is `width: 320px` (`w-[320px]`).

**Delivered (`TripsLayout.tsx` line 98):** Left panel is `w-[360px]` (360px).

**Fix required:** Change `w-[360px]` to `w-[320px]` on the left panel wrapper div.

**Note:** This is a minor layout metric difference. PO should be consulted if the wider panel was a deliberate product decision post-mockup. If no explicit decision was made, revert to 320px per spec.

**Tailwind tokens:** `w-[320px]`

---

### DELTA-12 — Left panel: trip count badge position and styling

**Mockup spec (`.trip-count-badge`, `.left-panel-title-row`):** The trip count badge is a pill next to the "My Trips" label: `background: var(--bg-muted)` (slate-200 / `#E2E8F0`), text `var(--text-muted)` (slate-500), rounded-full, `px-2 py-0.5 text-xs font-semibold`. The "+ New" button sits to the right of the badge on the same row.

**Delivered (`TripsLayout.tsx` lines 102–107):** The count badge is rendered inline inside the `<h2>` element itself: `<span className="ml-2 inline-flex ... bg-gray-100 text-gray-600">`. The background is `bg-gray-100` (lighter than mockup's slate-200) and text is `text-gray-600` (slightly lighter than mockup's slate-500/`text-muted`). The structure is functionally equivalent but the badge is embedded in the heading rather than being a sibling element.

**Fix required:**
1. Change badge background from `bg-gray-100` to `bg-gray-200` (closer to mockup's slate-200 `#E2E8F0`).
2. Change badge text from `text-gray-600` to `text-gray-500`.
3. The structural embedding inside `<h2>` is acceptable — no DOM restructuring required unless the developer prefers to match the mockup structure.

**Tailwind tokens:** `bg-gray-200 text-gray-500`

---

### DELTA-13 — TripCard: categories use gray chips vs violet chips

**Mockup spec (`.badge-category`):** Category badges on trip list cards use violet styling: `background: var(--violet-100)` (#EDE9FE), text `var(--violet-800)` (#5B21B6). Size: `font-size: 10px`.

**Delivered (`TripCard.tsx` line 114):** Category badges use `bg-gray-100 text-gray-600` — gray, not violet.

**Fix required:** Change category badge classes in `TripCard.tsx` from `bg-gray-100 text-gray-600` to `bg-violet-100 text-violet-800`.

**Note:** This also applies to the category badges in `TripDetail.tsx` line 136, where categories use `bg-gray-100 text-gray-600` instead of violet. Activities (purple) in `TripDetail.tsx` line 141 use `bg-purple-100 text-purple-700` which is close to the mockup's violet but should be standardised to `bg-violet-100 text-violet-800`.

**Tailwind tokens:** `bg-violet-100 text-violet-800 text-[10px]` (card), `bg-violet-100 text-violet-800` (detail header meta row)

---

### DELTA-14 — TripCard: companions displayed vs not in mockup

**Mockup spec (`.trip-item`):** The trip list card in the mockup shows: name, date, status badge, place badges. Companions are **not** shown on the list card — they appear only in the detail panel header.

**Delivered (`TripCard.tsx` lines 103–108):** Companions are displayed on the card as `"With: Sophie, James"` text.

**Fix required:** Remove the companions display from `TripCard.tsx`. The `With: {names}` block (lines 103–108) should be deleted. Companions belong in the detail panel header meta row (D-01, addressed in DELTA-05).

**Tailwind tokens / colors:** None.

---

### DELTA-15 — TripCard: Edit button on card not in mockup

**Mockup spec (`.trip-item`):** The trip list card shows name, date, status badge, and place badges. There is no inline Edit button on the card. Editing is accessed from the detail panel header.

**Delivered (`TripCard.tsx` lines 71–80):** An Edit button (`px-2.5 py-0.5 border border-gray-300 rounded text-xs`) is rendered inline on each card.

**Fix required:** Remove the Edit button from `TripCard.tsx` (lines 71–80). The `onEdit` prop and callback can be retained in the component API for now (it may be needed for the edit trigger from the detail header), but the button rendering on the card should be removed.

**Note:** If removing the card-level Edit button is the only way to edit a trip (i.e., the Edit button in the detail header doesn't yet exist as a functional entry point), defer this change until the detail header Edit button is confirmed working, to avoid stranding the edit capability.

**Tailwind tokens / colors:** None.

---

### DELTA-16 — TripCard: photo album link not in mockup

**Mockup spec:** No photo album link is shown on the trip list card.

**Delivered (`TripCard.tsx` lines 121–133):** A "📷 Photo album" link or "Photo ref: ..." text is conditionally rendered on the card.

**Fix required:** Remove the photo album link/ref display from `TripCard.tsx` (lines 121–133). Photo access is via the Photos button in the detail header (F-08).

**Tailwind tokens / colors:** None.

---

### DELTA-17 — Navigation bar: brand icon and styling

**Mockup spec (`.nav`, `.nav-brand`):** Nav bar height is 48px. Brand name is "Travel Tracker" with a teal square icon tile (26×26px, `background: var(--primary)`, border-radius 6px). Font is Inter, 15px, weight 700, teal color (`--primary`). Nav bar has `box-shadow: 0 1px 2px rgba(0,0,0,0.06)`. Nav links use teal for active state: `background: var(--primary-subtle)` (teal-100), `color: var(--primary-text)` (teal-900).

**Delivered (`App.tsx` lines 30–97):** Nav bar has no explicit height (uses padding `py-2`). Brand is `"✈️ Travel Tracker"` with an airplane emoji instead of the teal square icon tile. No box-shadow on the nav bar. Active nav links use `text-blue-600 bg-blue-50`.

**Fix required:**
1. Replace the `✈️` emoji with a teal square icon tile: `<span className="inline-flex items-center justify-center w-6 h-6 bg-teal-600 rounded text-white text-xs mr-2">✦</span>` (or any appropriate symbol/icon). Exact icon content is a designer call — the structural requirement is a square teal tile, not an emoji.
2. Make brand text teal: add `text-teal-600` to the brand span.
3. Add `shadow-sm` to the nav bar (the `<nav>` element).
4. Change active nav link styles from `text-blue-600 bg-blue-50` to `text-teal-700 bg-teal-50` (teal-50 = `#F0FDFA`).
5. Nav height: the mockup specifies 48px. Current padding-based height is approximate. If pixel-perfect height is needed, add `h-12` (48px) and change padding to `px-5` only.

**Tailwind tokens:** `bg-teal-600` (brand icon), `text-teal-600` (brand text), `shadow-sm` (nav), `text-teal-700 bg-teal-50` (active nav link)

---

### DELTA-18 — Right panel empty state: missing

**Mockup spec:** When no trip is selected, the right panel shows a centered empty state with: a muted circular icon (56px, `--bg-muted` background), title "Select a trip" (16px, `font-weight: 600`), description "Choose a trip from the list to view its details, places, and itinerary." (13px, max-width 260px). Background is the app base color.

**Delivered (`App.tsx` lines 108–112):** The empty state is a plain inline div: `<div className="flex items-center justify-center h-full text-gray-400 text-sm">Select a trip from the list</div>`. No icon, no description, no centered layout treatment.

**Fix required:** Replace the inline empty state element with a proper empty state component (or inline it in `TripsLayout.tsx`'s right panel). Structure:

```
<div className="flex flex-col items-center justify-center h-full text-gray-400 p-12 text-center">
  <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center mb-4 text-2xl text-gray-300">
    {/* icon — e.g. a map/luggage icon or the teal brand mark */}
  </div>
  <p className="text-base font-semibold text-gray-500 mb-1.5">Select a trip</p>
  <p className="text-sm text-gray-400 max-w-[260px] leading-relaxed">Choose a trip from the list to view its details, places, and itinerary.</p>
</div>
```

**Tailwind tokens:** `bg-gray-200` (icon circle), `text-gray-500` (title), `text-gray-400` (description)

---

## ITEMS CONFIRMED CORRECT (no fix required)

The following approved items were found to be correctly implemented against the mockup spec:

| Item | Verdict |
|------|---------|
| F-01: Two-panel layout (left 320px + right flex-1) | **Correct** — structure matches. Width delta noted in DELTA-11. |
| D-05: Trip count badge in left panel | **Correct** — present and functional. Minor styling delta in DELTA-12. |
| D-06: Place name badges on trip cards | **Correct** — implemented as `bg-gray-100 text-gray-600` chips. Rounded style matches mockup. |
| F-06: Search field in left panel | **Correct** — implemented as `type="search"` with placeholder "Search trips…". |
| F-07: Status filter chips | **Correct** — All / Planning / Active / Review / Locked chips present and functional. Active state needs teal fix (DELTA-01). |
| F-04: Persistent status bar present | **Correct** — present in code. Position and styling delta in DELTA-06. |
| F-08: Photos button in detail header | **Correct** — present. Color/ordering delta in DELTA-01 and DELTA-04. |
| D-01: Companions in detail header | **Present** — but layout is stacked, not inline row. See DELTA-05. |
| D-02: Category badges in detail header | **Present** — but color is gray not violet, and stacked not inline. See DELTA-05 and DELTA-13. |
| D-03: Per-place date range | **Correct** — derivation logic implemented in `PlaceSection.tsx`. |
| StatusBadge: `locked` color | **Correct** — `bg-gray-100 text-gray-700` matches mockup `.badge-locked`. |
| StatusBadge: `confirmed` item status | **Correct** — `bg-green-100 text-green-800` matches mockup `badge-item-confirmed`. |
| StatusBadge: `completed` item status | **Correct** — `bg-emerald-100 text-emerald-800` matches mockup `badge-item-completed`. |
| StatusBadge: `cancelled` item status | **Correct** — `bg-red-100 text-red-800` matches mockup `badge-item-cancelled`. |

---

## SUMMARY TABLE

| ID | Area | Severity | Fix type |
|----|------|----------|----------|
| DELTA-01 | Color theme: blue → teal throughout | HIGH | Multi-file token swap |
| DELTA-02 | StatusBadge: Active badge color (green → amber) | HIGH | 1-line change |
| DELTA-03 | StatusBadge: Review label + color | MEDIUM | 2-line change |
| DELTA-04 | Detail header: status badge and button order | HIGH | Layout restructure |
| DELTA-05 | Detail meta row: stacked → inline with pipes | HIGH | Layout restructure |
| DELTA-06 | Status bar: position (bottom → sub-header) + bg + CTA color + hint text | HIGH | Structural + styling |
| DELTA-07 | Tab strip: absent — implement shell only | HIGH | New component |
| DELTA-08 | PlaceSection: shadow + header shading | MEDIUM | 2 class additions |
| DELTA-09 | PlaceSection: country + date on one subtitle line with · | LOW | Minor layout |
| DELTA-10 | Left panel: "Trips" → "My Trips" | LOW | 1 word change |
| DELTA-11 | Left panel: width 360px → 320px | LOW | 1 class change |
| DELTA-12 | Trip count badge: color tweak | LOW | 2 class changes |
| DELTA-13 | Category chips: gray → violet | MEDIUM | Class swap |
| DELTA-14 | TripCard: companions — remove from card | LOW | Delete ~6 lines |
| DELTA-15 | TripCard: Edit button — remove from card | LOW | Delete ~10 lines |
| DELTA-16 | TripCard: photo album link — remove from card | LOW | Delete ~12 lines |
| DELTA-17 | Nav bar: brand icon, teal active state, shadow | MEDIUM | Multiple small changes |
| DELTA-18 | Empty state: replace placeholder text | LOW | New markup block |

**Total items: 18** — 1 multi-file sweep (DELTA-01), 1 structural rework (DELTA-05, DELTA-06), 1 new component (DELTA-07), remainder are small targeted fixes.

---

*This document is a design-to-delivered comparison only. No source code has been modified. All fixes are for Frontend to implement.*

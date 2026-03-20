# UX Mockup Delta — Option B vs Current BRD
**Date:** 2026-03-20
**Author:** UX (UI/UX Designer)
**Input mockup:** `jobs/ux/tech/mockup-option-b.html`
**BRD reference:** `_project/travel-tracker-BRD.md` v2.3
**Backlog reference:** `jobs/ux/tech/20260319-UX-backlog.md`
**Purpose:** Surface every element in the mockup that is not covered by the current approved BRD or existing backlog, for PO review and approval before build.

---

## How to read this document

Each item is classified as:

- **COSMETIC** — label or naming change only; no functional change, no schema or API impact
- **DATA** — the underlying data already exists in the schema; this is a display decision (showing it, or showing it somewhere new)
- **FEATURE** — requires new functionality, a new or changed API endpoint, or a schema addition

Effort scale: **XS** = < 30 min | **S** = < 1 day | **M** = 1–3 days | **L** = 3+ days

Items that are already in the backlog (even partially) are noted — they are included only where the mockup adds something beyond what the backlog item specifies.

---

## Section 1 — COSMETIC

---

### C-01 — Navigation item "Admin" renamed to "Settings"

**What:** The top navigation link currently labelled "Admin" is shown as "Settings" in the mockup. The underlying destination (the admin / configuration panel, BRD section 5.9) is unchanged.

**Where:** Top nav bar — rightmost nav link (`<button class="nav-link" id="nav-admin">`).

**Classification:** COSMETIC

**Effort:** XS

**Schema / API dependency:** No.

**Notes:** The BRD refers to this area as "Admin panel" throughout (AD-01 through AD-06) and Section 5.9 is titled "Admin and Settings Panel." "Settings" is more conventional consumer terminology. No functional change implied — this is purely a label decision for the PO to call.

---

### C-02 — Item type icons use letter abbreviations (H, R, T) instead of emoji

**What:** In the Itinerary view, each item row carries a small icon tile. The mockup uses single uppercase letter abbreviations: `H` (Hotel), `R` (Restaurant), `T` (Tour / Experience). The current app uses emoji (🏨, 🍽️, 🎫 etc.).

**Where:** Item rows within each PlaceSection in the Itinerary tab.

**Classification:** COSMETIC (the icon is presentational; it does not change what is stored or how items are typed)

**Effort:** XS

**Schema / API dependency:** No.

**Notes:** Backlog item P1-04 already calls for replacing emoji with Lucide icons. The mockup uses a different approach (letter abbreviations in a styled tile). The PO should indicate which direction is preferred — Lucide icons per P1-04, or the letter-tile pattern shown here.

---

## Section 2 — DATA

Items in this section use data that already exists in the schema. They represent a decision to display that data in a new location or at a new level of prominence.

---

### D-01 — Trip companions listed inline in the trip detail header

**What:** The detail pane header shows companion names ("Sophie, James") inline in the meta row directly below the trip title, separated by pipe characters from the date range and category badges.

**Where:** Trip detail right-panel header — `.detail-meta` row.

**Classification:** DATA

**Effort:** S

**Schema / API dependency:** No — companions are already stored and returned in the trip API response (BRD TR-02). This is a display decision only.

**Notes:** The current TripDetail screen shows companions elsewhere in the page body. The mockup promotes them to the header summary row. The BRD does not specify where companions appear in the detail view — this is a layout call.

---

### D-02 — Trip categories displayed as badge chips in the detail header

**What:** Category names are shown as violet-coloured badge chips ("Road Trip", "Culture") in the same meta row as the date range and companions.

**Where:** Trip detail right-panel header — `.detail-meta` row, `badge-category` chips.

**Classification:** DATA

**Effort:** S

**Schema / API dependency:** No — categories are already stored and returned (BRD TR-03). This is display placement only.

**Notes:** Current TripDetail also shows categories but as inline tags lower in the page. The mockup co-locates them with dates and companions at the top of the detail header for at-a-glance scanning. The P1-14 backlog item (consolidate CategoryChip component) is compatible with this; it does not specify where the chips appear.

---

### D-03 — Date range shown in each PlaceSection subtitle

**What:** Each city section within the Itinerary tab shows a subtitle beneath the city name in the format "Ireland · 15–18 Mar" — combining country name and the dates the user is in that place.

**Where:** PlaceSection headers within the Itinerary tab (`.place-subtitle`).

**Classification:** DATA

**Effort:** S

**Schema / API dependency:** No new schema required. Place-level date ranges are derivable from the items within the place (specifically hotel check-in/check-out and the trip dates). However, whether place-level date spans are stored explicitly or computed on the fly is worth confirming — if they are not stored as explicit `place.start_date` / `place.end_date` fields, a computation rule must be agreed.

**Notes:** The BRD defines Place (section 4) but does not specify per-place date storage. If the date range must be displayed without requiring the user to enter it explicitly, the derivation logic (e.g. "earliest item date to latest item date within this place") needs to be defined.

---

### D-04 — Country name displayed alongside city in PlaceSection subtitle

**What:** The place subtitle shows the country name in full ("Ireland") rather than the raw country code. This is a display improvement but uses data already present in the schema.

**Where:** PlaceSection subtitle (`.place-subtitle`).

**Classification:** DATA

**Effort:** XS

**Schema / API dependency:** No — this is exactly what backlog item P1-15 specifies. Included here because the mockup makes it visible at the PO level and the delta document should be comprehensive.

**Notes:** Already covered by backlog P1-15. No new decision needed unless the PO wants something different from P1-15's specification.

---

### D-05 — Trip count badge in the list panel header

**What:** A small pill badge showing the total number of trips ("5") appears next to the "My Trips" panel title.

**Where:** Left panel header — `.trip-count-badge` next to the "My Trips" label.

**Classification:** DATA

**Effort:** XS

**Schema / API dependency:** No — trip count is already available from the trips API response.

**Notes:** This is a minor affordance that helps the user quickly see how many trips match the current filter. No functional decision required beyond whether the PO wants it.

---

### D-06 — Place name badges shown on each trip list card

**What:** Each trip card in the left panel list shows small badges for the cities visited ("Dublin", "Galway", "Dingle"). These are the place names associated with the trip.

**Where:** Left panel trip list items — `.trip-item-footer`, `.badge-place` chips.

**Classification:** DATA

**Effort:** S

**Schema / API dependency:** No — place names are already available via the trips API response.

**Notes:** The current trips list does not show places on the card. Adding them gives the user a quick visual reminder of where a trip went without clicking in. The BRD does not specify what appears on the trip card — this is a display design decision for the PO.

---

## Section 3 — FEATURE

Items in this section require new or changed functionality, new UI components not currently built or planned, new API endpoints, or schema additions.

---

### F-01 — Two-panel layout as the primary UI architecture

**What:** The mockup replaces the current full-page trips list + separate trip detail page navigation pattern with a persistent two-panel layout: a fixed 320px left sidebar showing the trip list, and a full-height right panel showing the selected trip's detail. This is always-on — the two panels are visible simultaneously on desktop.

**Where:** Entire app shell — `.app-shell` / `.panels` layout.

**Classification:** FEATURE

**Effort:** L

**Schema / API dependency:** No schema change. May require routing changes (the right panel URL state must still be linkable / bookmarkable). The left panel list and right panel detail must be independently scrollable.

**Notes:** Backlog item P2-01 gestures toward "a split-pane layout" as one option among several. The mockup commits to the split-pane as the definitive architecture for the trips area. This is a significant structural decision — it affects routing, responsive behaviour, and how every screen inside `/trips` is composed. PO approval of this layout as the target architecture is required before any build work is scoped.

---

### F-02 — In-panel tab navigation within trip detail (Itinerary / Review / Map)

**What:** The trip detail right panel has a tab strip with three tabs: "Itinerary", "Review", and "Map". Selecting each tab changes the content of the right panel without navigating away. This keeps the trip list visible in the left panel throughout.

**Where:** Trip detail right-panel header — `.detail-tabs`.

**Classification:** FEATURE

**Effort:** M

**Schema / API dependency:** No schema change. The tabs surface existing content (the itinerary is current, the Review tab would show the post-trip review flow, the Map tab is addressed in F-03 below).

**Notes:** The current app navigates to a separate `/trips/:id/review` route for the review flow. Moving review into a tab within the same view is a UX and routing architecture decision. If adopted, the routing strategy for deep-linking to a specific tab (e.g. `/trips/42?tab=review`) needs to be agreed.

---

### F-03 — Map tab embedded within the trip detail view (per-trip map)

**What:** A "Map" tab within the trip detail panel shows a map scoped to the current trip — displaying only the cities in that trip, with pins. This is distinct from the global Map page (`/map`) which shows the user's full travel history.

**Where:** Trip detail right-panel — "Map" tab in `.detail-tabs`, renders `.map-panel` / `.map-placeholder`.

**Classification:** FEATURE

**Effort:** L

**Schema / API dependency:** Yes — requires a scoped map rendering API or frontend logic to filter city coordinates to only the cities in the selected trip. City coordinates are already stored (GE-11 / GE-13) but a per-trip filtered map view is not currently in scope anywhere in the BRD or backlog.

**Notes:** The BRD (MP-01 through MP-06) defines the map as a global view of all visited places. A per-trip scoped map is a meaningful additional capability. It would require the frontend to query city coordinates for the selected trip's places and render them as pins on a map initialised to the bounding box of those cities. The legend shown in the map tab (see F-05 below) would also apply here.

---

### F-04 — Status transition strip as a persistent bar between header and content

**What:** Below the tab strip and above the scrollable itinerary content, a persistent status bar shows the current trip status and a primary CTA to advance it ("Move to Review"). The strip also shows a hint about the next step in the workflow ("Next: post-trip review → lock").

**Where:** `.status-bar` — between `.detail-pane-header` and `.detail-content`.

**Classification:** FEATURE

**Effort:** S

**Schema / API dependency:** No — status transitions are already implemented. This is a new UI placement for the status transition action.

**Notes:** The current app's status transition buttons live within the trip detail body. The mockup promotes the primary status CTA to a persistent strip that is always visible regardless of scroll position. This is a UX pattern decision. The BRD requires status transitions (TR-05, TR-06) but does not specify where the controls appear. The specific CTA shown ("Move to Review") implies the transition from Active → Review, which maps to the existing status workflow. No new functionality — the question is where and how prominently it is surfaced.

---

### F-05 — Map legend with "Transited" and "Want to visit" shading states

**What:** The map legend overlay (addressing existing backlog item P1-13) shows five shading states: Visited, Active trip, Planning, **Transited**, and **Want to visit**. "Transited" and "Want to visit" are not in the current BRD's map shading state list (section 5.4).

**Where:** Map legend overlay — `.map-legend` within `.map-placeholder`, visible on the Map tab and the global Map page.

**Classification:** FEATURE (the legend overlay itself is already in backlog P1-13; the two new shading states are net-new features requiring BRD amendment)

**Effort:** S per new shading state (schema addition to the shading states table + colour picker in admin + map rendering logic for each)

**Schema / API dependency:** Yes — each new shading state requires a new row in the `shading_states` table (or equivalent) and a new colour configuration entry. The BRD currently defines exactly six states (section 5.4). Adding "Transited" and "Want to visit" changes the data model and the map rendering logic.

**Notes on "Transited":** This would represent a place passed through (airport connection, brief stop) that the user does not consider a visit. The BRD definition of "Place" (section 4) includes a judgment call on what counts as a visit, explicitly covering layovers with meaningful activity. "Transited" implies a distinct category below that threshold. If approved, the definition of what qualifies as a transit vs a visit needs to be specified.

**Notes on "Want to visit":** This would represent places the user wants to visit in the future but has no trip planned. This is outside the current data model — there is no trip associated with the place, so it is not logically attached to any existing trip record. It implies a new entity or a new place status independent of trips. This is the more significant of the two new states from a data model perspective.

---

### F-06 — Search field in the left panel trip list

**What:** A text input field labelled "Search trips…" appears in the left panel header, allowing the user to filter the trip list by name as they type.

**Where:** Left panel header — `.filter-input`.

**Classification:** FEATURE

**Effort:** S

**Schema / API dependency:** No schema change. Requires a search/filter parameter on the trips list API endpoint (or client-side filtering of already-fetched trips).

**Notes:** The BRD requires trips to be searchable (TR-10: "Trips are searchable and filterable by category and activity"). A name search field is consistent with TR-10's intent. However, TR-10 specifies search by category and activity — name search is an extension of that requirement. The positioning in the left panel sidebar is tied to the two-panel layout (F-01).

---

### F-07 — Status filter chips in the left panel

**What:** A row of pill-shaped filter chips — All / Planning / Active / Review / Locked — appears below the search field in the left panel, allowing the user to filter the trip list by trip status with a single click.

**Where:** Left panel header — `.filter-chips`.

**Classification:** FEATURE

**Effort:** S

**Schema / API dependency:** No schema change. Requires a status filter parameter on the trips list API endpoint (or client-side filtering).

**Notes:** The BRD (TR-10) specifies filtering by category and activity, not by status. Status filtering is a natural addition and logically consistent with the existing data model, but it is an extension beyond what TR-10 currently requires. The positioning in the left panel sidebar is tied to the two-panel layout (F-01). Backlog P2-02 covers consolidating filter controls into a single row but does not specifically call out status-chip filtering as a distinct pattern.

---

### F-08 — "Photos" button in the trip detail action bar

**What:** A "Photos" button appears in the trip detail header action bar alongside the "Edit" button.

**Where:** Trip detail right-panel header — `.detail-actions`, `<button class="btn btn-outline btn-sm">Photos</button>`.

**Classification:** FEATURE

**Effort:** S

**Schema / API dependency:** No schema change — photo album links are already in scope (BRD PH-01, PH-02: "User can link a photo album or folder reference to a trip"). This button would open the photo link management UI for the selected trip.

**Notes:** The BRD specifies photo linking (PH-01/PH-02) but the current UI does not have a dedicated surface for it in the TripDetail view. The "Photos" button in the mockup makes photo management directly accessible from the detail header. This is within approved BRD scope — the question is whether a dedicated button in the header is the right placement, or whether photo management belongs inside the Itinerary tab or behind the "Edit" flow.

---

## Summary Table

| ID | Item | Classification | Effort | Schema/API dep? | PO Decision |
|----|------|---------------|--------|-----------------|-------------|
| C-01 | "Admin" renamed to "Settings" in nav | COSMETIC | XS | No | REJECTED — keep "Admin" |
| C-02 | Item type letter tiles (H/R/T) instead of emoji | COSMETIC | XS | No | DESIGNER'S CALL — modern, expandable icon system |
| D-01 | Companions listed in detail header meta row | DATA | S | No | APPROVED |
| D-02 | Categories as badge chips in detail header | DATA | S | No | APPROVED |
| D-03 | Per-place date range in PlaceSection subtitle | DATA | S | No (but derivation rule needed) | APPROVED |
| D-04 | Country name (not code) in PlaceSection subtitle | DATA | XS | No | APPROVED |
| D-05 | Trip count badge in list panel header | DATA | XS | No | APPROVED |
| D-06 | Place name badges on trip list cards | DATA | S | No | APPROVED |
| F-01 | Two-panel layout as primary UI architecture | FEATURE | L | No (routing impact) | APPROVED |
| F-02 | In-panel tab navigation (Itinerary / Review / Map) | FEATURE | M | No (routing impact) | DEFERRED — future enhancement; requires region/area tagging first |
| F-03 | Map tab embedded in trip detail (per-trip scoped map) | FEATURE | L | Yes — per-trip coordinate query | DEFERRED — future enhancement; requires region/area tagging first |
| F-04 | Persistent status transition strip | FEATURE | S | No | APPROVED |
| F-05 | "Transited" and "Want to visit" shading states | FEATURE | S per state | Yes — schema + admin + map logic | REJECTED — planning covers want-to-visit; transited too granular |
| F-06 | Search field in left panel trip list | FEATURE | S | No (or minor API param) | APPROVED |
| F-07 | Status filter chips in left panel | FEATURE | S | No (or minor API param) | APPROVED |
| F-08 | "Photos" button in detail action bar | FEATURE | S | No | APPROVED |

---

## Items Noted as Already in Backlog (not new decisions)

The following mockup elements are already covered by an existing backlog item and are not listed as delta items:

- Map shading legend overlay → backlog P1-13
- Country name in PlaceSection → backlog P1-15 (also captured as D-04 above for completeness)
- Two-panel / wider layout direction → backlog P2-01 (gestured toward; the mockup commits to a specific approach — hence F-01 above is still a delta item requiring PO approval of the specific architecture)
- Filter controls into a single row → backlog P2-02 (the mockup's status chips go beyond what P2-02 specifies — hence F-07 above)

---

*This document is for PO review only. No recommendation is made on approval or rejection of any item. All decisions are the PO's.*

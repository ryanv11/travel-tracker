# Travel Tracker — Status

> **Generated** from `_project/tracker.json` — do not edit by hand.
> Regenerate with `npm run status`. Staleness is gated by `npm run status:check` (pre-push).

_Tracker last updated: 2026-07-28 (QUAL-11 remote-Turso half verified against staging + assertion assigned to B9; DEP-04 closed as leave-as-is with the analysis recorded. QUAL-09 resolved by BRD v3.11 — PO removed the never-implemented Shortlisted item status rather than building it; planning loop is two-stage, PL-02/PL-03 unblocked, zero code change. Previous: 2026-07-27 Wave 0 complete 6/6, ADL-41-45 + UX trip-list spec merged (PRs #278, #281-285), BRD v3.8-v3.10, QUAL-08..14 and DEP-04 logged)_

## Phases

| Phase | Title | Status |
|---|---|---|
| PHASE-0 | Foundation — Architecture & Blueprint | ✅ Done |
| PHASE-1 | Data Layer — Database Schema & Migrations | ✅ Done |
| PHASE-2 | API Layer — Backend REST API | ✅ Done |
| PHASE-3 | UI Layer — React Frontend SPA | ✅ Done |
| PHASE-4 | QA & Documentation | ✅ Done |
| PHASE-5 | Integrations — Notification Engine | ⬜ Pending |
| PHASE-6 | v3 Planning-First Delivery | ⬜ Pending |

## Open work (53)

### P0 — Blockers (1)

| ID | Title | Owner | Status |
|---|---|---|---|
| FEAT-IT | Item Logging | frontend | ◐ Partial |

### P1 — Critical (2)

| ID | Title | Owner | Status |
|---|---|---|---|
| BUG-50 | No way to delete an entire trip | frontend | ⬜ Pending |
| BUG-51 | Companion name edits in admin panel don't consistently propagate to trips | backend | ⬜ Pending |

### P2 — Important (29)

| ID | Title | Owner | Status |
|---|---|---|---|
| FUTURE-03 | Companion model — linked/unlinked users with invite flow | coo | ⬜ Pending |
| QUAL-03 | test-db.ts hand-mirrors 21 CREATE TABLE statements — silent schema-drift risk in every repository test | backend | ⬜ Pending |
| BRD-IT0809 | Rating sort and filter in item list views, cross-trip by city (IT-08/09) | frontend | ◐ Partial |
| BRD-AD09 | Categories/activities are global seeded defaults; deactivation is owner-only (AD-09) | backend | ◐ Partial |
| BRD-PH03 | Photo management accessible from trip detail header (PH-03) | frontend | ◐ Partial |
| BRD-FL04 | Flight number lookup — auto-populate fields from flight number + date (FL-04) | backend | ⬜ Pending |
| BRD-PL05 | Day-by-day itinerary layer for region-sequential trips (PL-05, Phase 2) | fullstack | ⬜ Pending |
| BRD-PL06 | Co-planning — companions contribute to idea pool on shared trips (PL-06, Phase 3) | architect | ⬜ Pending |
| BRD-LB01 | Destination recommendations view — aggregated across trips (LB-01) | fullstack | ⬜ Pending |
| BRD-MB0102 | Mobile reference mode — bookings readable + directions links on phone (MB-01–02) | frontend | ⬜ Pending |
| BRD-DP06 | First place added to a trip inherits the trip's date range (DP-06) | fullstack | ⬜ Pending |
| OQ-03 | Approximate/partial dates for shell trips — year-only or month-only, and their effect on shading and ordering | architect | ⬜ Pending |
| BUG-40 | Place deletion should prompt (delete all / move to trip-level / cancel) when the place has items | fullstack | ⬜ Pending |
| BUG-41 | Multi-leg / connecting flights within a single booking | database | ⬜ Pending |
| BUG-42 | Multiple companions/seats per booking item | database | ⬜ Pending |
| BUG-44 | Car rental pickup location should show as subtext under provider | frontend | ⬜ Pending |
| BUG-46 | Activities selector missing from trip create flow (only present on edit) | frontend | ⬜ Pending |
| BUG-48 | Country→state map shading zoom threshold too high / laggy | frontend | ⬜ Pending |
| BUG-49 | City markers render behind state shading layer | frontend | ⬜ Pending |
| BUG-52 | Trip search doesn't match on country name | backend | ⬜ Pending |
| BUG-53 | Trip list place display: show state (not country) under city, surface country separately | ux | ⬜ Pending |
| BUG-55 | City entry doesn't auto-populate country/state | backend | ⬜ Pending |
| BUG-57 | Intelligent date defaults across item entry, keyed off the trip's date range | fullstack | ⬜ Pending |
| BUG-58 | Moving a trip backward in the status workflow deselects it from the left panel | frontend | ⬜ Pending |
| BUG-62 | Admin panel is still fully owner-gated at the page/nav level — non-owner users can't reach the Companions tab even after AD-08 made companions per-user | frontend | ⬜ Pending |
| BUG-63 | Non-owner blocked from creating a trip with a "forbidden" error on mobile — not currently reproducible | unassigned | ⬜ Pending |
| QUAL-08 | sanitiseUrl() has zero call sites and photo_album_ref has no server-side scheme validation | fullstack | ⬜ Pending |
| QUAL-11 | Assert PRAGMA foreign_keys=1 at startup (remote Turso path verified 2026-07-28) | backend | ⬜ Pending |
| QUAL-12 | Concurrent role dispatches collide on the single shared jobs/<role>/context/current.txt | coo | ⬜ Pending |

### P3 — Minor (21)

| ID | Title | Owner | Status |
|---|---|---|---|
| OP-15 | Design pass for deferred skills — schema-change + backend-route-change | coo | ⬜ Pending |
| FUTURE-01 | Import booking confirmations — flights, hotels, etc. | coo | ⬜ Pending |
| BUG-37 | Flaky test — CarryForwardModal 'calls onClose immediately when Skip is clicked' | frontend | ⬜ Pending |
| FUTURE-02 | Companion endorsements — tag who added place/item, allow endorsements | coo | ⬜ Pending |
| QUAL-02 | Test assertion strength and edge case gaps (QA follow-up) | backend | ⬜ Pending |
| QUAL-04 | Dead code and one stale source comment left by the WP reskin and the ADL-28 companions migration | frontend | ⬜ Pending |
| BRD-LB02 | Stats and patterns view (LB-02, Phase 2) | frontend | ⬜ Pending |
| BRD-LB03 | Shareable recommendations link (LB-03, Phase 3) | architect | ⬜ Pending |
| BRD-IT10 | Optional Google Maps URL per item — one-click directions (IT-10) | architect | ⬜ Pending |
| UX-11 | Trip-list status pill colours should match map shading colours (admin-driven) | ux | ⬜ Pending |
| WP-05 | Waypoint reskin must not be reported as closing unrelated data/behavior gaps it only reskins the display of | coo | ⬜ Pending |
| BUG-43 | Apple Wallet (.pkpass) import to pre-populate booking details | integrations | ⬜ Pending |
| BUG-45 | Convert free-text airline/car-rental-provider fields to a sourced dropdown with Other fallback | coo | ⬜ Pending |
| BUG-47 | Auto-populate activities from trip/place content instead of manual pre-selection | architect | ⬜ Pending |
| BUG-54 | Category/activity color customization | ux | ⬜ Pending |
| BUG-56 | City name not auto-capitalized on entry | frontend | ⬜ Pending |
| QUAL-07 | Standing docs-vs-code audit — recurring Docs brief to catch prose/reality drift before someone trips over it | docs | ⬜ Pending |
| DEP-03 | GitHub Actions pinned to v4 target Node.js 20 — deprecated, force-run on Node 24 | unassigned | ⬜ Pending |
| QUAL-10 | jobs/database/tech/schema.ts is an unmaintained copy of the real schema | docs | ⬜ Pending |
| QUAL-13 | Stale unread COO->Architect inbox messages from March 2026 | coo | ⬜ Pending |
| QUAL-14 | MapView.tsx comment documents zoom >= 4 while the constant is 3 | frontend | ⬜ Pending |

## Coverage by type

| Type | Progress | Done | Open | Deferred/Closed |
|---|---|---|---|---|
| feature | `███████████▓░░░░░░░░` 29/54 | 29 | 25 | 3 |
| requirement | `███████████████████░` 32/33 | 32 | 1 | 6 |
| bug | `███████████████░░░░░` 43/57 | 43 | 14 | 4 |
| task | `████████████████████` 9/9 | 9 | 0 | 0 |
| chore | `█████████░░░░░░░░░░░` 9/21 | 9 | 12 | 1 |

<details>
<summary>Deferred (10)</summary>

| ID | Title | Owner |
|---|---|---|
| BUG-06 | ShadingTab colour picker uses uncontrolled defaultValue | frontend |
| NR-09 | Subscription admin boundary — separate from trip-level permissions | architect |
| NR-10 | Delegated trip management — trip-scoped permissions | architect |
| NR-11 | Global reference data protection | architect |
| NR-12 | Archive instead of hard delete for structured lists | architect |
| NR-13 | Global settings risk control — owner/admin only for destructive changes | architect |
| UX-05 | Photos — full implementation | frontend |
| ENV-01 | Geocoding retry queue stuck — Nominatim blocked by devcontainer firewall | coo |
| BRD-PL0104 | Planning core — idea pool → booked across all item types (PL-01–04) | fullstack |
| BRD-CU0103 | Shell trips — fast historic catch-up entry (CU-01–03) | fullstack |

</details>

<details>
<summary>Closed without change (4)</summary>

| ID | Title | Resolution |
|---|---|---|
| BUG-38 | SQLite foreign_keys pragma never enabled — declared cascade FKs not actually enforced | not-a-bug |
| BUG-17 | BUG-A untracked — trips.ts comment references unlogged issue | not-a-bug |
| OQ-06 | Adopt a systematic subdivision reference list (ISO 3166-2) instead of ad hoc per-country region seeding | closed |
| DEP-04 | Semgrep job pulls semgrep/semgrep:latest unpinned from Docker Hub | closed |

</details>

---

_124 done · 10 deferred · 4 closed · 53 open — 191 tracked items_

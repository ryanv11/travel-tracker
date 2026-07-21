# Travel Tracker — Status

> **Generated** from `_project/tracker.json` — do not edit by hand.
> Regenerate with `npm run status`. Staleness is gated by `npm run status:check` (pre-push).

_Tracker last updated: 2026-07-19 (session close: BUG-27/28/29/10 done, OP-16 raised, restart-preview mechanism installed)_

## Phases

| Phase | Title | Status |
|---|---|---|
| PHASE-0 | Foundation — Architecture & Blueprint | ✅ Done |
| PHASE-1 | Data Layer — Database Schema & Migrations | ✅ Done |
| PHASE-2 | API Layer — Backend REST API | ✅ Done |
| PHASE-3 | UI Layer — React Frontend SPA | ✅ Done |
| PHASE-4 | QA & Documentation | 🔄 In progress |
| PHASE-5 | Integrations — Notification Engine | ⬜ Pending |
| PHASE-6 | v3 Planning-First Delivery | ⬜ Pending |

## Open work (34)

### P0 — Blockers (1)

| ID | Title | Owner | Status |
|---|---|---|---|
| FEAT-IT | Item Logging | frontend | ◐ Partial |

### P1 — Critical (4)

| ID | Title | Owner | Status |
|---|---|---|---|
| BRD-PL0104 | Planning core — idea pool → shortlist → booked across all item types (PL-01–04) | fullstack | ⬜ Pending |
| BRD-CU0103 | Shell trips — fast historic catch-up entry (CU-01–03) | fullstack | ⬜ Pending |
| BRD-NF09 | Hosted deployment for personal use (NF-09) | backend | 🔄 In progress |
| OP-22 | Environment promotion model — main→staging (continuous), production branch→prod (explicit fast-forward) | coo | 🔄 In progress |

### P2 — Important (18)

| ID | Title | Owner | Status |
|---|---|---|---|
| OP-07 | UI/UX expert review of frontend | coo | ⬜ Pending |
| FUTURE-03 | Companion model — linked/unlinked users with invite flow | coo | ⬜ Pending |
| BRD-IT0809 | Rating sort and filter in item list views, cross-trip by city (IT-08/09) | frontend | 🔄 In progress |
| BRD-AD07 | Map shading configuration is per-user (AD-07) | backend | 🔄 In progress |
| BRD-AD08 | Companions list is per-user (AD-08) | backend | 🔄 In progress |
| BRD-AD09 | Categories/activities are global seeded defaults; deactivation is owner-only (AD-09) | backend | ◐ Partial |
| BRD-PH03 | Photo management accessible from trip detail header (PH-03) | frontend | ◐ Partial |
| BRD-FL04 | Flight number lookup — auto-populate fields from flight number + date (FL-04) | backend | ⬜ Pending |
| BRD-PL05 | Day-by-day itinerary layer for region-sequential trips (PL-05, Phase 2) | fullstack | ⬜ Pending |
| BRD-PL06 | Co-planning — companions contribute to idea pool on shared trips (PL-06, Phase 3) | architect | ⬜ Pending |
| BRD-LB01 | Destination recommendations view — aggregated across trips (LB-01) | fullstack | ⬜ Pending |
| BRD-MB0102 | Mobile reference mode — bookings readable + directions links on phone (MB-01–02) | frontend | ⬜ Pending |
| BRD-DP06 | First place added to a trip inherits the trip's date range (DP-06) | fullstack | ⬜ Pending |
| OQ-05 | Same-city revisit within a trip — trip_places one-row-per-city constraint | architect | ⬜ Pending |
| WP-01 | Product rename to "Waypoint" (in-app UI only) | frontend | ⬜ Pending |
| WP-02 | Waypoint design-system foundation — colors, type, icons, badges, buttons (Phase 1) | frontend | done_pending_uat |
| WP-03 | Trips screen (desktop) reskin using Waypoint tokens (Phase 2) | frontend | ⬜ Pending |
| WP-04 | Trips screen responsive mobile layout — net-new (Phase 2) | frontend | ⬜ Pending |

### P3 — Minor (11)

| ID | Title | Owner | Status |
|---|---|---|---|
| OP-15 | Design pass for deferred skills — schema-change + backend-route-change | coo | ⬜ Pending |
| FUTURE-01 | Import booking confirmations — flights, hotels, etc. | coo | ⬜ Pending |
| BUG-37 | Flaky test — CarryForwardModal 'calls onClose immediately when Skip is clicked' | frontend | ⬜ Pending |
| OP-21 | Agent read-only diagnostic access to Railway, Turso, Clerk (ADL-33) | coo | 🔄 In progress |
| FUTURE-02 | Companion endorsements — tag who added place/item, allow endorsements | coo | ⬜ Pending |
| QUAL-02 | Test assertion strength and edge case gaps (QA follow-up) | backend | ⬜ Pending |
| BRD-LB02 | Stats and patterns view (LB-02, Phase 2) | frontend | ⬜ Pending |
| BRD-LB03 | Shareable recommendations link (LB-03, Phase 3) | architect | ⬜ Pending |
| BRD-IT10 | Optional Google Maps URL per item — one-click directions (IT-10) | architect | ⬜ Pending |
| UX-11 | Trip-list status pill colours should match map shading colours (admin-driven) | ux | ⬜ Pending |
| WP-05 | Waypoint reskin must not be reported as closing unrelated data/behavior gaps it only reskins the display of | coo | ⬜ Pending |

## Coverage by type

| Type | Progress | Done | Open | Deferred/Closed |
|---|---|---|---|---|
| feature | `██████████▓▓▓░░░░░░░` 23/48 | 23 | 25 | 1 |
| requirement | `██████████████████▓░` 29/32 | 29 | 3 | 5 |
| bug | `███████████████████░` 37/38 | 37 | 1 | 4 |
| task | `████████████████████` 8/8 | 8 | 0 | 0 |
| chore | `█████████████▓▓░░░░░` 6/9 | 6 | 3 | 0 |

<details>
<summary>Deferred (8)</summary>

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

</details>

<details>
<summary>Closed without change (2)</summary>

| ID | Title | Resolution |
|---|---|---|
| BUG-38 | SQLite foreign_keys pragma never enabled — declared cascade FKs not actually enforced | not-a-bug |
| BUG-17 | BUG-A untracked — trips.ts comment references unlogged issue | not-a-bug |

</details>

---

_103 done · 8 deferred · 2 closed · 34 open — 147 tracked items_

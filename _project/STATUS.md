# Travel Tracker — Status

> **Generated** from `_project/tracker.json` — do not edit by hand.
> Regenerate with `npm run status`. Staleness is gated by `npm run status:check` (pre-push).

_Tracker last updated: 2026-07-19 (BRD v3.0 adopted — PHASE-6 planning-first + OP-13/14/15)_

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

## Open work (22)

### P0 — Blockers (1)

| ID | Title | Owner | Status |
|---|---|---|---|
| FEAT-IT | Item Logging | frontend | ◐ Partial |

### P1 — Critical (3)

| ID | Title | Owner | Status |
|---|---|---|---|
| BRD-PL0104 | Planning core — idea pool → shortlist → booked across all item types (PL-01–04) | fullstack | ⬜ Pending |
| BRD-CU0103 | Shell trips — fast historic catch-up entry (CU-01–03) | fullstack | ⬜ Pending |
| BRD-NF09 | Hosted deployment for personal use (NF-09) | architect | ⬜ Pending |

### P2 — Important (12)

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

### P3 — Minor (6)

| ID | Title | Owner | Status |
|---|---|---|---|
| OP-15 | Design pass for deferred skills — schema-change + backend-route-change | coo | ⬜ Pending |
| FUTURE-01 | Import booking confirmations — flights, hotels, etc. | coo | ⬜ Pending |
| FUTURE-02 | Companion endorsements — tag who added place/item, allow endorsements | coo | ⬜ Pending |
| QUAL-02 | Test assertion strength and edge case gaps (QA follow-up) | backend | ⬜ Pending |
| BRD-LB02 | Stats and patterns view (LB-02, Phase 2) | frontend | ⬜ Pending |
| BRD-LB03 | Shareable recommendations link (LB-03, Phase 3) | architect | ⬜ Pending |

## Coverage by type

| Type | Progress | Done | Open | Deferred/Closed |
|---|---|---|---|---|
| feature | `███████████▓▓▓░░░░░░` 23/41 | 23 | 18 | 1 |
| requirement | `███████████████████░` 29/31 | 29 | 2 | 5 |
| bug | `████████████████████` 24/24 | 24 | 0 | 3 |
| task | `████████████████████` 8/8 | 8 | 0 | 0 |
| chore | `████████████░░░░░░░░` 3/5 | 3 | 2 | 0 |

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
<summary>Closed without change (1)</summary>

| ID | Title | Resolution |
|---|---|---|
| BUG-17 | BUG-A untracked — trips.ts comment references unlogged issue | not-a-bug |

</details>

---

_87 done · 8 deferred · 1 closed · 22 open — 118 tracked items_

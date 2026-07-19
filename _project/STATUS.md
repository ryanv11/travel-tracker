# Travel Tracker — Status

> **Generated** from `_project/tracker.json` — do not edit by hand.
> Regenerate with `npm run status`. Staleness is gated by `npm run status:check` (pre-push).

_Tracker last updated: 2026-07-18 (OP-14 COO skills installed, OP-15 deferred-skills design pass)_

## Phases

| Phase | Title | Status |
|---|---|---|
| PHASE-0 | Foundation — Architecture & Blueprint | ✅ Done |
| PHASE-1 | Data Layer — Database Schema & Migrations | ✅ Done |
| PHASE-2 | API Layer — Backend REST API | ✅ Done |
| PHASE-3 | UI Layer — React Frontend SPA | ✅ Done |
| PHASE-4 | QA & Documentation | 🔄 In progress |
| PHASE-5 | Integrations — Notification Engine | ⬜ Pending |

## Open work (13)

### P0 — Blockers (1)

| ID | Title | Owner | Status |
|---|---|---|---|
| FEAT-IT | Item Logging | frontend | ◐ Partial |

### P2 — Important (8)

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

### P3 — Minor (4)

| ID | Title | Owner | Status |
|---|---|---|---|
| OP-15 | Design pass for deferred skills — schema-change + backend-route-change | coo | ⬜ Pending |
| FUTURE-01 | Import booking confirmations — flights, hotels, etc. | coo | ⬜ Pending |
| FUTURE-02 | Companion endorsements — tag who added place/item, allow endorsements | coo | ⬜ Pending |
| QUAL-02 | Test assertion strength and edge case gaps (QA follow-up) | backend | ⬜ Pending |

## Coverage by type

| Type | Progress | Done | Open | Deferred/Closed |
|---|---|---|---|---|
| feature | `██████████████▓▓▓▓░░` 23/33 | 23 | 10 | 1 |
| requirement | `███████████████████░` 29/30 | 29 | 1 | 5 |
| bug | `████████████████████` 24/24 | 24 | 0 | 3 |
| task | `████████████████████` 8/8 | 8 | 0 | 0 |
| chore | `██████████░░░░░░░░░░` 2/4 | 2 | 2 | 0 |

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

_86 done · 8 deferred · 1 closed · 13 open — 108 tracked items_

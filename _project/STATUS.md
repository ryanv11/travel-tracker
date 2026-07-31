# Travel Tracker — Status

> **Generated** from `_project/tracker.json` — do not edit by hand.
> Regenerate with `npm run status`. Staleness is gated by `npm run status:check` (pre-push).

_Tracker last updated: 2026-07-28 (B9 merged — QUAL-03 + QUAL-11 done, PR #292; QUAL-17 logged: 15 more test files hand-roll the same DDL, so route tests are not yet drift-safe. Negative-findings guard adopted into CLAUDE.md + all 8 role system prompts; QUAL-15 fixed — every role prompt's mandatory init step pointed at a nonexistent BRD path; QUAL-16 logged. QUAL-11 remote-Turso half verified against staging + assertion assigned to B9; DEP-04 closed as leave-as-is with the analysis recorded. QUAL-09 resolved by BRD v3.11 — PO removed the never-implemented Shortlisted item status rather than building it; planning loop is two-stage, PL-02/PL-03 unblocked, zero code change. Previous: 2026-07-27 Wave 0 complete 6/6, ADL-41-45 + UX trip-list spec merged (PRs #278, #281-285), BRD v3.8-v3.10, QUAL-08..14 and DEP-04 logged)_

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

## Open work (62)

### P0 — Blockers (1)

| ID | Title | Owner | Status |
|---|---|---|---|
| FEAT-IT | Item Logging | frontend | ◐ Partial |

### P1 — Critical (5)

| ID | Title | Owner | Status |
|---|---|---|---|
| BRD-GE16 | Any authenticated user can add a city via constrained find-or-create (GE-16) | backend | ⬜ Pending |
| BUG-50 | No way to delete an entire trip | frontend | done_pending_uat |
| BUG-51 | Companion name edits in admin panel don't consistently propagate to trips | frontend | done_pending_uat |
| BUG-63 | Non-owner cannot add a place to a trip — categories/activities /active reads and POST /api/cities are all owner-gated (REPRODUCED + ROOT-CAUSED) | architect | ⬜ Pending |
| QUAL-18 | E2E serves the frontend from vite preview, not Express — so no CSP header is ever under test | qa | ⬜ Pending |

### P2 — Important (31)

| ID | Title | Owner | Status |
|---|---|---|---|
| FUTURE-03 | Companion model — linked/unlinked users with invite flow | coo | ⬜ Pending |
| BRD-IT0809 | Rating sort and filter in item list views, cross-trip by city (IT-08/09) | frontend | done_pending_uat |
| BRD-AD09 | Categories/activities are global seeded defaults; deactivation is owner-only (AD-09) | backend | ◐ Partial |
| BRD-PH03 | Photo management accessible from trip detail header (PH-03) | frontend | ◐ Partial |
| BRD-FL04 | Flight number lookup — auto-populate fields from flight number + date (FL-04) | backend | ⬜ Pending |
| BRD-PL05 | Day-by-day itinerary layer for region-sequential trips (PL-05, Phase 2) | fullstack | ⬜ Pending |
| BRD-PL06 | Co-planning — companions contribute to idea pool on shared trips (PL-06, Phase 3) | architect | ⬜ Pending |
| BRD-LB01 | Destination recommendations view — aggregated across trips (LB-01) | fullstack | ⬜ Pending |
| BRD-MB0102 | Mobile reference mode — bookings readable + directions links on phone (MB-01–02) | frontend | ⬜ Pending |
| BRD-DP06 | First place added to a trip inherits the trip's date range (DP-06) | fullstack | done_pending_uat |
| OQ-03 | Approximate/partial dates for shell trips — year-only or month-only, and their effect on shading and ordering | architect | ⬜ Pending |
| OP-25 | Scheduled cloud health-check routines (daily CI/drift, weekly doc-lifecycle) + cron-flag surfacing in /coo-startup | coo | ⛔ Blocked |
| BUG-40 | Place deletion should prompt (delete all / move to trip-level / cancel) when the place has items | fullstack | ⬜ Pending |
| BUG-41 | Multi-leg / connecting flights within a single booking | database | ⬜ Pending |
| BUG-42 | Multiple companions/seats per booking item | database | ⬜ Pending |
| BUG-44 | Car rental pickup location should show as subtext under provider | frontend | done_pending_uat |
| BUG-46 | Activities selector missing from trip create flow (only present on edit) | frontend | ⬜ Pending |
| BUG-48 | Country→state map shading zoom threshold too high / laggy | frontend | ⬜ Pending |
| BUG-49 | City markers render behind state shading layer | frontend | done_pending_uat |
| BUG-52 | Trip search doesn't match on country name | frontend | done_pending_uat |
| BUG-53 | Trip list place display: show state (not country) under city, surface country separately | ux | ⬜ Pending |
| BUG-55 | City entry doesn't auto-populate country/state — CSP blocks the Nominatim call (deployment defect) | architect | ⬜ Pending |
| BUG-57 | Intelligent date defaults across item entry, keyed off the trip's date range | fullstack | done_pending_uat |
| BUG-58 | Moving a trip backward in the status workflow deselects it from the left panel | frontend | done_pending_uat |
| BUG-62 | Admin panel is still fully owner-gated at the page/nav level — non-owner users can't reach the Companions tab even after AD-08 made companions per-user | frontend | done_pending_uat |
| BUG-65 | A review_pending trip has no delete affordance — TR-14 is unreachable in that state | frontend | ⬜ Pending |
| BUG-66 | ReviewPanel's forward Lock path repeats BUG-58's onClose()-after-mutation pattern | frontend | ⬜ Pending |
| QUAL-08 | sanitiseUrl() has zero call sites and photo_album_ref has no server-side scheme validation | fullstack | ⬜ Pending |
| QUAL-12 | Concurrent role dispatches collide on the single shared jobs/<role>/context/current.txt | coo | ⬜ Pending |
| QUAL-19 | No test asserts that external origins the frontend fetches are present in the CSP allowlist | backend | ⬜ Pending |
| QUAL-20 | No post-deploy smoke check — nothing verifies the deployed build behaves like main | qa | ⬜ Pending |

### P3 — Minor (25)

| ID | Title | Owner | Status |
|---|---|---|---|
| OP-15 | Design pass for deferred skills — schema-change + backend-route-change | coo | ⬜ Pending |
| FUTURE-01 | Import booking confirmations — flights, hotels, etc. | coo | ⬜ Pending |
| BUG-37 | Flaky test — CarryForwardModal 'calls onClose immediately when Skip is clicked' | frontend | ⬜ Pending |
| FUTURE-02 | Companion endorsements — tag who added place/item, allow endorsements | coo | ⬜ Pending |
| QUAL-02 | Test assertion strength and edge case gaps (QA follow-up) | backend | ◐ Partial |
| QUAL-04 | Dead code and one stale source comment left by the WP reskin and the ADL-28 companions migration | frontend | ⬜ Pending |
| BRD-LB02 | Stats and patterns view (LB-02, Phase 2) | frontend | ⬜ Pending |
| BRD-LB03 | Shareable recommendations link (LB-03, Phase 3) | architect | ⬜ Pending |
| BRD-IT10 | Optional Google Maps URL per item — one-click directions (IT-10) | architect | done_pending_uat |
| UX-11 | Trip-list status pill colours should match map shading colours (admin-driven) | ux | ⬜ Pending |
| OP-31 | Set up a GitHub App for scheduled-routine GitHub write access — blocks OP-25's cron-flag issue creation | architect | ⬜ Pending |
| WP-05 | Waypoint reskin must not be reported as closing unrelated data/behavior gaps it only reskins the display of | coo | ⬜ Pending |
| BUG-43 | Apple Wallet (.pkpass) import to pre-populate booking details | integrations | ⬜ Pending |
| BUG-45 | Convert free-text airline/car-rental-provider fields to a sourced dropdown with Other fallback | coo | ⬜ Pending |
| BUG-47 | Auto-populate activities from trip/place content instead of manual pre-selection | architect | ⬜ Pending |
| BUG-54 | Category/activity color customization | ux | ⬜ Pending |
| BUG-56 | City name not auto-capitalized on entry | frontend | done_pending_uat |
| QUAL-07 | Standing docs-vs-code audit — recurring Docs brief to catch prose/reality drift before someone trips over it | docs | ⬜ Pending |
| BUG-67 | Locked-trip delete refusal is decided from client-held status, not re-checked at confirm time | frontend | ⬜ Pending |
| BUG-68 | Clerk's telemetry endpoint is CSP-blocked in deployed environments — console noise, no functional impact | unassigned | ⬜ Pending |
| DEP-03 | GitHub Actions pinned to v4 target Node.js 20 — deprecated, force-run on Node 24 | unassigned | ⬜ Pending |
| QUAL-10 | jobs/database/tech/schema.ts is an unmaintained copy of the real schema | docs | ⬜ Pending |
| QUAL-13 | Stale unread COO->Architect inbox messages from March 2026 | coo | ⬜ Pending |
| QUAL-14 | MapView.tsx comment documents zoom >= 4 while the constant is 3 | frontend | ⬜ Pending |
| QUAL-16 | Role system prompts' 'Read _shared/frameworks.txt' init step is ambiguous — two different docs share that filename | coo | ⬜ Pending |

## Coverage by type

| Type | Progress | Done | Open | Deferred/Closed |
|---|---|---|---|---|
| feature | `███████████▓░░░░░░░░` 29/55 | 29 | 26 | 3 |
| requirement | `███████████████████░` 32/33 | 32 | 1 | 6 |
| bug | `██████████████░░░░░░` 44/62 | 44 | 18 | 4 |
| task | `████████████████████` 9/9 | 9 | 0 | 0 |
| chore | `██████████▓░░░░░░░░░` 13/27 | 13 | 14 | 1 |

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

_135 done · 10 deferred · 4 closed · 62 open — 211 tracked items_

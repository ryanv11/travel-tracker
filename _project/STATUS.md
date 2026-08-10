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

## Open work (84)

### P1 — Critical (1)

| ID | Title | Owner | Status |
|---|---|---|---|
| QUAL-18 | E2E serves the frontend from vite preview, not Express — so no CSP header is ever under test | qa | ⬜ Pending |

### P2 — Important (45)

| ID | Title | Owner | Status |
|---|---|---|---|
| ENV-01 | Geocoding retry queue stuck — Nominatim blocked by devcontainer firewall | coo | ⬜ Pending |
| FUTURE-03 | Companion model — linked/unlinked users with invite flow | coo | ⬜ Pending |
| BRD-AD09 | Categories/activities are per-user lists, userId-scoped, owner-managed (AD-09) | backend | ◐ Partial |
| BRD-GE18 | Reference-data provenance and in-product attribution credits surface (GE-18) | frontend | ⬜ Pending |
| BRD-PH03 | Photo management accessible from trip detail header (PH-03) | frontend | ◐ Partial |
| BRD-FL04 | Flight number lookup — auto-populate fields from flight number + date (FL-04) | backend | ⬜ Pending |
| BRD-PL05 | Day-by-day itinerary layer for region-sequential trips (PL-05, Phase 2) | fullstack | ⬜ Pending |
| BRD-PL06 | Co-planning — companions contribute to idea pool on shared trips (PL-06, Phase 3) | architect | ⬜ Pending |
| BRD-LB01 | Destination recommendations view — aggregated across trips (LB-01) | fullstack | ⬜ Pending |
| BRD-MB0102 | Mobile reference mode — bookings readable + directions links on phone (MB-01–02) | frontend | ⬜ Pending |
| OQ-03 | Approximate/partial dates for shell trips — year-only or month-only, and their effect on shading and ordering | architect | ⬜ Pending |
| OP-25 | Scheduled cloud health-check routines (daily CI/drift, weekly doc-lifecycle) + cron-flag surfacing in /coo-startup | coo | ⛔ Blocked |
| BUG-40 | Place deletion should prompt (delete all / move to trip-level / cancel) when the place has items | fullstack | ⬜ Pending |
| BUG-41 | Multi-leg / connecting flights within a single booking | database | ⬜ Pending |
| BUG-42 | Multiple companions/seats per booking item | database | ⬜ Pending |
| BUG-46 | Activities selector missing from trip create flow (only present on edit) | frontend | ⬜ Pending |
| BUG-48 | Country→state map shading zoom threshold too high / laggy | frontend | ⬜ Pending |
| BUG-53 | Trip list place display: show state (not country) under city, surface country separately | ux | ⬜ Pending |
| BUG-55 | City entry doesn't auto-populate country/state — CSP blocks the Nominatim call (deployment defect) | architect | ⬜ Pending |
| BUG-58 | Moving a trip backward in the status workflow deselects it from the left panel | frontend | done_pending_uat |
| BUG-65 | A review_pending trip has no delete affordance — TR-14 is unreachable in that state | frontend | ⬜ Pending |
| BUG-66 | ReviewPanel's forward Lock path repeats BUG-58's onClose()-after-mutation pattern | frontend | ⬜ Pending |
| QUAL-08 | sanitiseUrl() has zero call sites and photo_album_ref has no server-side scheme validation | fullstack | ⬜ Pending |
| QUAL-12 | Concurrent role dispatches collide on the single shared jobs/<role>/context/current.txt | coo | ⬜ Pending |
| QUAL-19 | No test asserts that external origins the frontend fetches are present in the CSP allowlist | backend | ⬜ Pending |
| QUAL-20 | No post-deploy smoke check — nothing verifies the deployed build behaves like main | qa | done_pending_uat |
| DEP-05 | ip-address SSRF/trust-boundary advisories (HIGH, runtime via express-rate-limit) — fixed; react-router moderates deferred | coo | done_pending_uat |
| BUG-71 | Ambiguous city name silently auto-resolves and pre-fills a state — no disambiguation offered (GE-16 violation) | frontend | done_pending_uat |
| BUG-72 | City search dropdown shows name + country only — user selects a specific city blind | backend | done_pending_uat |
| BUG-73 | Geocode lookup failure is silent — user cannot distinguish 'picked Virginia' from 'lookup failed' | frontend | done_pending_uat |
| BUG-74 | BUG-73's failure signal covers only the browser↔backend hop — an upstream geocoder failure still reports as 'found nothing' | backend | done_pending_uat |
| BUG-81 | Disambiguation picker rows hard to skim — raw display_name shows county + postcode noise | frontend | done_pending_uat |
| BUG-84 | requireAuth catch{} swallows ALL errors into an unlogged 401 (config/JWKS/DB indistinguishable from a bad token) | backend | ⬜ Pending |
| BUG-85 | Stuck geocode-pending cities are invisible and unactionable — no visibility into the retry queue or its cause, no user recovery (GE-19) | architect | ⬜ Pending |
| BUG-87 | Add-place picker does not narrow/rank candidates by the trip's assigned country/countries | architect | done_pending_uat |
| BUG-90 | "Scotland" and other UK home nations not selectable in the add-trip country picker | architect | ⬜ Pending |
| BUG-91 | Trip-create form saves and closes prematurely when selecting from the picker (can't set dates in the same flow) | frontend | done_pending_uat |
| QUAL-25 | Spike — build ADL-48's gazetteer for real and measure it before committing to S1/S2/S3 | architect | done_pending_uat |
| QUAL-26 | You cannot tell which build staging is serving — put the commit SHA in /health, the UI and the shakedown | backend | done_pending_uat |
| ENV-02 | Staging 502s — Railway proxy 'connection dial timeout' to a single-replica service; app-side causes ruled out | coo | ⬜ Pending |
| OP-36 | Apply ADL-49 — Nominatim (+optional MapTiler) firewall allowlist + recorded replay fixtures, on next container rebuild | coo | ⬜ Pending |
| QUAL-37 | Backup posture — COO memory dir + Turso DBs are unversioned/reseed-only; back up before non-disposable UAT data | coo | ⬜ Pending |
| QUAL-38 | Goal-6 scorecard — one recurring PO-readable health report (escape/rework/flow/hook-violations/token-burn) | coo | ⬜ Pending |
| QUAL-39 | PO-journey Playwright pack — encode the PO's UAT checklist flows as E2E specs | qa | ⬜ Pending |
| QUAL-40 | react-hook-form + shared zod schemas in ItemForm — real client validation + retires several folded cleanups (Architect ADL first) | frontend | ⬜ Pending |

### P3 — Minor (38)

| ID | Title | Owner | Status |
|---|---|---|---|
| OP-15 | Design pass for deferred skills — schema-change + backend-route-change | coo | ⬜ Pending |
| FUTURE-01 | Import booking confirmations — flights, hotels, etc. | coo | ⬜ Pending |
| BUG-37 | Flaky test — CarryForwardModal 'calls onClose immediately when Skip is clicked' | frontend | ⬜ Pending |
| FUTURE-02 | Companion endorsements — tag who added place/item, allow endorsements | coo | ⬜ Pending |
| BRD-LB02 | Stats and patterns view (LB-02, Phase 2) | frontend | ⬜ Pending |
| BRD-LB03 | Shareable recommendations link (LB-03, Phase 3) | architect | ⬜ Pending |
| UX-11 | Trip-list status pill colours should match map shading colours (admin-driven) | ux | ⬜ Pending |
| OP-31 | Set up a GitHub App for scheduled-routine GitHub write access — blocks OP-25's cron-flag issue creation | architect | ⬜ Pending |
| WP-05 | Waypoint reskin must not be reported as closing unrelated data/behavior gaps it only reskins the display of | coo | ⬜ Pending |
| BUG-43 | Apple Wallet (.pkpass) import to pre-populate booking details | integrations | ⬜ Pending |
| BUG-45 | Convert free-text airline/car-rental-provider fields to a sourced dropdown with Other fallback | coo | ⬜ Pending |
| BUG-47 | Auto-populate activities from trip/place content instead of manual pre-selection | architect | ⬜ Pending |
| BUG-54 | Category/activity color customization | ux | ⬜ Pending |
| BUG-67 | Locked-trip delete refusal is decided from client-held status, not re-checked at confirm time | frontend | ⬜ Pending |
| BUG-68 | Clerk's telemetry endpoint is CSP-blocked in deployed environments — console noise, no functional impact | unassigned | ⬜ Pending |
| DEP-03 | GitHub Actions pinned to v4 target Node.js 20 — deprecated, force-run on Node 24 | unassigned | ⬜ Pending |
| QUAL-14 | MapView.tsx comment documents zoom >= 4 while the constant is 3 | frontend | ⬜ Pending |
| QUAL-23 | Migration 0014 preconditions are manual-only; zero-owner DB commits dangling FKs silently (review F3) | database | ⬜ Pending |
| BUG-69 | geocodeRetryQueue polls 'unresolvable' cities forever — no terminal branch | frontend | ⬜ Pending |
| BUG-70 | Companion.is_active typed number but serialized boolean (third instance of the class) | frontend | ⬜ Pending |
| BUG-82 | CityPicker rows keyboard-inaccessible (bare div onClick) + disabled has no visual state — a11y | frontend | ⬜ Pending |
| BUG-86 | "Back to trip" button in review status deselects the trip instead of returning to the active view | frontend | done_pending_uat |
| BUG-88 | Post-trip review has no trip-level or place-level rating (only item-level) | architect | ⬜ Pending |
| BUG-89 | Country/city geocode lookup is intolerant of misspellings and informal spellings | backend | ⬜ Pending |
| UX-13 | Grey out / lock the city name on the disambiguation picker screen (editing it there doesn't re-run the lookup) | frontend | ⬜ Pending |
| UX-14 | First place's dates render in blue while later places' dates don't (inconsistent styling) | frontend | done_pending_uat |
| BUG-92 | Companions are not seeded from a global starting list | architect | ⬜ Pending |
| BUG-93 | Newly-added place's map marker doesn't appear until a refresh (render lag on add) | frontend | done_pending_uat |
| BUG-94 | GE-20 bypass: the manual '+Add new' country dropdown in the picker isn't restricted to the trip's countries | frontend | ⬜ Pending |
| QUAL-44 | Stale file:line cross-references in comments — remaining low-value ones + adopt cite-symbols-not-lines | unassigned | ⬜ Pending |
| QUAL-28 | The devcontainer allowlist matches IPs, not hostnames — any Cloudflare-proxied origin is reachable by pinning it to an allowlisted CF edge | architect | ⬜ Pending |
| QUAL-34 | Shared-record append collisions — union-merge driver for the ledger + per-agent context files (never adopted, 3rd recording) | coo | ⬜ Pending |
| QUAL-35 | Lean the /coo-startup audit — gate heavy checks on a change-probe; de-inline UAT + open-dialogues | coo | ⬜ Pending |
| OP-37 | gh CLI has no persistent auth in the devcontainer — bridged by hand each session | coo | ⬜ Pending |
| QUAL-36 | Three BRD-wording open questions from the QUAL-05 sweep — import scope + MB-01 mobile scope, awaiting PO decision | coo | ⬜ Pending |
| QUAL-41 | Coverage visibility — vitest coverage as a per-area CI artifact, NO threshold gates | qa | ⬜ Pending |
| QUAL-42 | Architect review batch — DB_TYPE=postgres scaffolding (U13), transaction convention (U10), asyncHandler vestigiality (U15) | architect | ⬜ Pending |
| DEP-07 | Minor/patch dependency batch bump — biome, clerk, playwright, tailwind, tanstack-query, helmet, jose, etc. | coo | ⬜ Pending |

## Coverage by type

| Type | Progress | Done | Open | Deferred/Closed |
|---|---|---|---|---|
| feature | `█████████████▓░░░░░░` 36/57 | 36 | 21 | 4 |
| requirement | `███████████████████░` 32/33 | 32 | 1 | 6 |
| bug | `██████████████░░░░░░` 60/86 | 60 | 26 | 3 |
| task | `██████████████████░░` 11/12 | 11 | 1 | 0 |
| chore | `███████████░░░░░░░░░` 32/58 | 32 | 26 | 2 |

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
| BRD-PL0104 | Planning core — idea pool → booked across all item types (PL-01–04) | fullstack |
| BRD-CU0103 | Shell trips — fast historic catch-up entry (CU-01–03) | fullstack |
| QUAL-43 | Structural userId-scoping chokepoint + citiesRepository (design-reflection R1) | architect |

</details>

<details>
<summary>Closed without change (5)</summary>

| ID | Title | Resolution |
|---|---|---|
| BUG-38 | SQLite foreign_keys pragma never enabled — declared cascade FKs not actually enforced | not-a-bug |
| BUG-17 | BUG-A untracked — trips.ts comment references unlogged issue | not-a-bug |
| BRD-GE17 | Bundled city reference data — local list searched first, geocoder as backstop (GE-17) | closed |
| OQ-06 | Adopt a systematic subdivision reference list (ISO 3166-2) instead of ad hoc per-country region seeding | closed |
| DEP-04 | Semgrep job pulls semgrep/semgrep:latest unpinned from Docker Hub | closed |

</details>

---

_179 done · 10 deferred · 5 closed · 84 open — 278 tracked items_

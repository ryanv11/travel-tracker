# Travel Tracker - Proposed New Requirements BRD

**Status:** ACCEPTED — COO sign-off 2026-03-08
**Purpose:** Standalone delta document for COO review. This document includes only the newly discussed requirements and delivery changes, not the approved baseline BRD.

## 1. Scope of this document

- This document contains only new or changed requirements raised during the architecture and audit review.
- Items here are formal additions to the project baseline, adopted as a delta to BRD v2.3.
- Where a requirement depends on future hosted or multi-user capability, it is captured now so the Phase 1 design preserves the necessary seam.

## 2. Executive summary

**Decision:** Delta BRD accepted in full. Phase 1 delivery and security posture accepted as MVP-appropriate. The following forward-looking requirements are now part of the formal project baseline.

- Preserve account, subscription, and ownership seams in the data model now, even though shared access is out of scope for Phase 1.
- Do not treat live OneDrive sync of an active SQLite database as an assumed operating model; prefer a controlled sync/backup strategy.
- Define offline retry and reconnection behavior explicitly rather than leaving it as an implied implementation detail.
- Separate subscription-level administration from trip-level collaboration in the future access model.
- Bring QA forward in the delivery lifecycle — **operational changes OP-01 through OP-05 take effect immediately.**

## 3. Accepted requirements register

| ID | Requirement | Statement | Priority | Phase | COO Decision |
|---|---|---|---|---|---|
| NR-01 | Future tenancy seam | Preserve subscription_id and owner_account_id in the core model so the app can evolve from a single-owner beta into subscription-based shared access without structural rework. | High | Phase 1 | **ACCEPTED — MANDATORY FOR BETA.** Schema columns, not features. Cost to add now is a migration; cost post-beta is migration + data backfill + live data risk. Do it now. |
| NR-02 | Future identity seam | Preserve individual account concepts in the architecture so future users can have their own accounts, private trips, and shared-trip participation. | High | Phase 1 | **ACCEPTED — MANDATORY FOR BETA.** Do not implement full auth. Preserve the seam only. |
| NR-03 | Trip ownership metadata | Where low effort, record created_by_account_id and updated_by_account_id on core entities to support future collaboration and traceability. | Medium | Phase 1 | **ACCEPTED — lightweight only.** Two nullable columns if the effort is trivial. If this starts pulling in auth scaffolding, defer. |
| NR-04 | Carry-forward provenance | When an item is carried forward, retain a lightweight provenance marker showing it was pre-populated rather than manually created. | High | Phase 1 | **ACCEPTED — substantially already met.** Backend sets is_carried_forward and carried_from_item_id in executeCarryForward(). Confirm complete and close. |
| NR-05 | Soft trip lock semantics | Trip locking must remain a soft lock. A locked trip is read-only until a deliberate user unlock action is taken. | High | Phase 1 | **ACCEPTED — MANDATORY FOR BETA.** This is the design intent. BUG-04 (no UI path to revert review_pending → planning) is direct evidence this must be stated explicitly and enforced. |
| NR-06 | Offline retry policy | Background retry for connectivity-dependent operations must use progressive backoff, continue indefinitely unless cancelled, and allow a user-initiated manual retry/reset action. | High | Phase 1 | **ACCEPTED — MANDATORY FOR BETA.** Applies especially to geocoding and app reconnection. |
| NR-07 | App offline indicator | The application should expose a lightweight app-wide offline/reconnect affordance, such as a status banner with manual retry. | Medium | Phase 1 | **ACCEPTED — lightweight enforced.** Single status affordance, not a full connectivity management system. May slip slightly if scope pressure requires it. |
| NR-08 | SQLite + OneDrive operating constraint | The solution must not assume that an active SQLite file will be safely live-synced across devices. If OneDrive is used in Phase 1, the preferred operating model is controlled backup/export or deliberate single-user switching, not concurrent live sync. | High | Phase 1 | **ACCEPTED — MANDATORY FOR BETA. Strong agree.** This is a data corruption risk. Operating model must be stated explicitly in README and user-facing guidance before beta. Single-device active; OneDrive for backup/export only. |
| NR-09 | Subscription admin boundary | Future subscription-level administration must be separated from trip-level editing or planning permissions. | High | Phase 2 | **ACCEPTED as Phase 2 requirement.** Captured in baseline; not implemented in Phase 1. |
| NR-10 | Delegated trip management | Future collaborators may be allowed to manage a specific trip without receiving subscription-wide admin rights. | Medium | Phase 2 | **ACCEPTED as Phase 2 requirement.** Trip-scoped permissions only. |
| NR-11 | Global reference data protection | Global reference data and settings should support additive change safely, but destructive changes must be tightly controlled. | High | Phase 2 | **ACCEPTED as Phase 2 requirement.** |
| NR-12 | Archive instead of hard delete | For structured lists and other shared reference data, prefer deactivate/archive semantics over hard delete so historical trips remain valid. | High | Phase 2 | **ACCEPTED as Phase 2 requirement.** |
| NR-13 | Global settings risk control | Destructive or semantics-changing updates to subscription-wide settings must be owner/admin only in the future access model. | Medium | Phase 2 | **ACCEPTED as Phase 2 requirement.** |
| NR-14 | Pre-shared-access hardening gate | Before access is expanded to spouse, family, or friends, the project must complete a defined hardening gate covering auth, authorization, storage model, secrets, and operational controls. | High | Phase 1.5 | **ACCEPTED — MANDATORY before any non-owner access.** Formal go/no-go gate. Tied directly to OP-06 checklist. |
| NR-15 | Speed without rebuild principle | Phase 1 implementation decisions must optimize time to usable beta while avoiding decisions that would predictably double later Phase 2 rework. | High | Phase 1 | **ACCEPTED as standing design review criterion.** Gives formal grounds to push back on shortcuts that create predictable Phase 2 rework. Applied retroactively as a review lens. |

## 4. Accepted operational and delivery changes

| ID | Change | Operational requirement | Priority | Phase | COO Decision |
|---|---|---|---|---|---|
| OP-01 | Bring QA forward | QA should start before frontend completion. Test design should begin from the API contract and workflow rules while development is still in progress. | High | Phase 1 | **ACCEPTED — IN EFFECT IMMEDIATELY.** The current situation (4 MAJOR bugs found in static review, live testing blocked by environment) is exactly what this prevents. |
| OP-02 | Contract-based test design | Create test scenarios from the API contract and key state transitions now, including negative-path and lock-state tests. | High | Phase 1 | **ACCEPTED — IN EFFECT IMMEDIATELY.** |
| OP-03 | Shared regression pack | Replace purely informal developer unit checks with a shared regression pack covering carry-forward, trip lock/unlock, city creation, retry behavior, and structured list changes. | High | Phase 1 | **ACCEPTED — IN EFFECT IMMEDIATELY.** |
| OP-04 | Definition of done uplift | Update definition of done to require unit tests, peer review, and scenario validation for business-critical flows before a story is considered complete. | Medium | Phase 1 | **ACCEPTED — IN EFFECT IMMEDIATELY.** BUG-03 (carry-forward race condition) would have been caught by basic scenario testing. |
| OP-05 | Backend hotspot sign-off | Treat backend corrections affecting carry-forward, city patching, or write protection as release-relevant and explicitly sign them off before frontend closeout. | High | Phase 1 | **ACCEPTED — IN EFFECT IMMEDIATELY.** |
| OP-06 | Pre-access hardening checklist | Create a short checklist that must be complete before any non-owner access is enabled. | High | Phase 1.5 | **ACCEPTED.** Tied directly to NR-14. Single checklist, not two diverging lists. |

## 5. Minimum quality expectations for Phase 1

- Each developer may continue to perform unit testing, but this is not sufficient as the only quality control method for workflow-heavy features.
- Business-critical flows should have scenario-based validation across API, persistence, and UI behavior, especially around soft lock/unlock, carry-forward provenance, city creation/update behavior, and retry/reconnect handling.
- QA involvement should begin early enough to influence test coverage, not only to validate completed frontend screens.

## 6. Acceptance gates by phase

- **Phase 1 beta gate:** Single-user beta remains the operating boundary. The design preserves account/subscription seams (NR-01, NR-02), retry behavior is defined (NR-06), soft lock behavior is explicit (NR-05), SQLite/OneDrive operating model is documented (NR-08), and QA has validated core flows.
- **Phase 1.5 hardening gate (NR-14 / OP-06):** Before access expands beyond the owner, the project has implemented auth, authorization, a safe storage/sync model, secrets handling, and a basic operational support model. Formal go/no-go. Sign-off required.
- **Phase 2 collaboration gate:** Shared access introduces individual accounts, subscription membership, trip-level collaboration, and constrained subscription administration without exposing destructive global changes broadly.

## 7. COO sign-off record

- **Date:** 2026-03-08
- **Decision:** Full acceptance of proposed requirement set as formal delta to BRD v2.3.
- **Beta-mandatory Phase 1 items:** NR-01, NR-02, NR-05, NR-06, NR-08, NR-14 gate definition, OP-01 through OP-05.
- **Accepted but deferrable:** NR-03 (lightweight only), NR-07 (may slip under scope pressure).
- **Phase 2 baseline (no Phase 1 implementation):** NR-09, NR-10, NR-11, NR-12, NR-13.
- **Operational changes:** OP-01 through OP-05 take effect immediately as delivery governance.
- **NR-04:** Substantially met by existing backend implementation. Confirm and close.
- **NR-15:** Adopted as standing design review criterion, applied retroactively.

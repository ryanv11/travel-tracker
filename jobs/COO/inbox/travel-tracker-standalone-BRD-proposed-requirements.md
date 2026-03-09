# Travel Tracker - Proposed New Requirements BRD

**Status:** Proposed - not yet accepted into project baseline  
**Purpose:** Standalone delta document for COO review. This document includes only the newly discussed requirements and delivery changes, not the approved baseline BRD.

## 1. Scope of this document

- This document contains only new or changed requirements raised during the architecture and audit review.
- Items here should be treated as proposed additions, design constraints, or delivery changes for assessment and acceptance.
- Where a requirement depends on future hosted or multi-user capability, it is still captured now so the Phase 1 design preserves the necessary seam.

## 2. Executive summary

**Recommendation:** Accept the Phase 1 delivery and security posture as MVP-appropriate, but add a small set of forward-looking requirements now so Phase 2 becomes an expansion rather than a partial rebuild.

- Preserve account, subscription, and ownership seams in the data model now, even though shared access is out of scope for Phase 1.
- Do not treat live OneDrive sync of an active SQLite database as an assumed operating model; prefer a controlled sync/backup strategy.
- Define offline retry and reconnection behavior explicitly rather than leaving it as an implied implementation detail.
- Separate subscription-level administration from trip-level collaboration in the future access model.
- Bring QA forward in the delivery lifecycle instead of waiting until frontend completion.

## 3. Proposed requirements register

| ID | Requirement | Statement | Priority | Phase | Notes |
|---|---|---|---|---|---|
| NR-01 | Future tenancy seam | Preserve subscription_id and owner_account_id in the core model so the app can evolve from a single-owner beta into subscription-based shared access without structural rework. | High | Phase 1 | Accepted in design now, even if dormant in UI and permissions. |
| NR-02 | Future identity seam | Preserve individual account concepts in the architecture so future users can have their own accounts, private trips, and shared-trip participation. | High | Phase 1 | Do not implement full auth yet; preserve the seam. |
| NR-03 | Trip ownership metadata | Where low effort, record created_by_account_id and updated_by_account_id on core entities to support future collaboration and traceability. | Medium | Phase 1 | Keep lightweight in MVP. |
| NR-04 | Carry-forward provenance | When an item is carried forward, retain a lightweight provenance marker showing it was pre-populated rather than manually created. | High | Phase 1 | Source linkage should be lightweight; no full lineage UI required. |
| NR-05 | Soft trip lock semantics | Trip locking must remain a soft lock. A locked trip is read-only until a deliberate user unlock action is taken. | High | Phase 1 | Treat as workflow control, not immutable compliance control. |
| NR-06 | Offline retry policy | Background retry for connectivity-dependent operations must use progressive backoff, continue indefinitely unless cancelled, and allow a user-initiated manual retry/reset action. | High | Phase 1 | Applies especially to geocoding and app reconnection behavior. |
| NR-07 | App offline indicator | The application should expose a lightweight app-wide offline/reconnect affordance, such as a status banner with manual retry. | Medium | Phase 1 | Silent retries remain primary behavior. |
| NR-08 | SQLite + OneDrive operating constraint | The solution must not assume that an active SQLite file will be safely live-synced across devices. If OneDrive is used in Phase 1, the preferred operating model is controlled backup/export or deliberate single-user switching, not concurrent live sync. | High | Phase 1 | Avoid data-integrity risk. |
| NR-09 | Subscription admin boundary | Future subscription-level administration must be separated from trip-level editing or planning permissions. | High | Phase 2 | Prevents delegated planners from changing global settings. |
| NR-10 | Delegated trip management | Future collaborators may be allowed to manage a specific trip without receiving subscription-wide admin rights. | Medium | Phase 2 | Trip-scoped permissions only. |
| NR-11 | Global reference data protection | Global reference data and settings should support additive change safely, but destructive changes must be tightly controlled. | High | Phase 2 | Protects historical integrity. |
| NR-12 | Archive instead of hard delete | For structured lists and other shared reference data, prefer deactivate/archive semantics over hard delete so historical trips remain valid. | High | Phase 2 | Supports historical consistency. |
| NR-13 | Global settings risk control | Destructive or semantics-changing updates to subscription-wide settings must be owner/admin only in the future access model. | Medium | Phase 2 | Examples: deleting categories, changing shading logic, renaming values in use. |
| NR-14 | Pre-shared-access hardening gate | Before access is expanded to spouse, family, or friends, the project must complete a defined hardening gate covering auth, authorization, storage model, secrets, and operational controls. | High | Phase 1.5 | Formal go/no-go gate before external access. |
| NR-15 | Speed without rebuild principle | Phase 1 implementation decisions must optimize time to usable beta while avoiding decisions that would predictably double later Phase 2 rework. | High | Phase 1 | Architecture decision principle to be used in design reviews. |

## 4. Operational and delivery changes

| ID | Change | Operational requirement | Priority | Phase |
|---|---|---|---|---|
| OP-01 | Bring QA forward | QA should start before frontend completion. Test design should begin from the API contract and workflow rules while development is still in progress. | High | Phase 1 |
| OP-02 | Contract-based test design | Create test scenarios from the API contract and key state transitions now, including negative-path and lock-state tests. | High | Phase 1 |
| OP-03 | Shared regression pack | Replace purely informal developer unit checks with a shared regression pack covering carry-forward, trip lock/unlock, city creation, retry behavior, and structured list changes. | High | Phase 1 |
| OP-04 | Definition of done uplift | Update definition of done to require unit tests, peer review, and scenario validation for business-critical flows before a story is considered complete. | Medium | Phase 1 |
| OP-05 | Backend hotspot sign-off | Treat backend corrections affecting carry-forward, city patching, or write protection as release-relevant and explicitly sign them off before frontend closeout. | High | Phase 1 |
| OP-06 | Pre-access hardening checklist | Create a short checklist that must be complete before any non-owner access is enabled. | High | Phase 1.5 |

## 5. Minimum quality expectations for Phase 1

- Each developer may continue to perform unit testing, but this is not sufficient as the only quality control method for workflow-heavy features.
- Business-critical flows should have scenario-based validation across API, persistence, and UI behavior, especially around soft lock/unlock, carry-forward provenance, city creation/update behavior, and retry/reconnect handling.
- QA involvement should begin early enough to influence test coverage, not only to validate completed frontend screens.

## 6. Acceptance gates by phase

- **Phase 1 beta gate:** Single-user beta remains the operating boundary. The design preserves account/subscription seams, retry behavior is defined, soft lock behavior is explicit, and QA has validated core flows.
- **Phase 1.5 hardening gate:** Before access expands beyond the owner, the project has implemented auth, authorization, a safe storage/sync model, secrets handling, and a basic operational support model.
- **Phase 2 collaboration gate:** Shared access introduces individual accounts, subscription membership, trip-level collaboration, and constrained subscription administration without exposing destructive global changes broadly.

## 7. Decision requests for COO review

- Approve or reject the proposed requirement set as a formal delta to the baseline BRD.
- Nominate which Phase 1 items are mandatory for beta, and which Phase 1.5 controls are mandatory before shared access.
- Confirm whether the project should treat the proposed operational changes, especially earlier QA involvement, as immediate delivery governance changes.

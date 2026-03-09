# Test-First Development Policy
**ID:** OP-07
**Status:** Adopted
**Date:** 2026-03-08
**Author:** COO

---

## 1. Policy statement

From this point forward, all new backend services, business logic corrections, and
critical frontend flows must include tests written **before or alongside** implementation.
Tests are part of the deliverable — not an optional add-on.

This policy is **not retroactive**. Existing Phase 1 and Phase 2 shipped code,
and corrections already dispatched (BUG-01 through BUG-09, BC-01 through BC-07),
are exempt. The policy applies to all new work dispatched after 2026-03-08.

---

## 2. Scope

### What requires tests

| Layer | What | Framework | Owner |
|-------|------|-----------|-------|
| Backend — business logic | Services: carry-forward, shading, geocoding, status transitions, validation rules | Vitest | Backend (writes), QA (extends) |
| Backend — API routes | Contract tests: every documented status code, error shape, locked-trip rejection | Vitest + supertest | QA (owns) |
| Frontend — critical flows | Scenario tests: user journeys for carry-forward, lock/unlock, review, offline retry | Vitest + React Testing Library | Frontend (writes), QA (extends) |
| Cross-team contracts | Any interface boundary where one team consumes another's output | Vitest + supertest | QA (owns) |

### What does NOT require tests

- React UI components (presentation layer) — covered adequately by QA live testing
- Configuration files, migration scripts, seed data
- Retrospective tests on already-shipped Phase 1/2 code — not required, not expected

---

## 3. How it works in practice

### Agent workflow (Backend, Frontend)

1. COO dispatches a spec with acceptance criteria.
2. Agent writes tests first that assert the acceptance criteria.
3. Agent implements until `npm test` passes.
4. Agent's completion report includes: test file paths + `npm test` output confirming pass.
5. COO reviews test output as part of acceptance, not just the implementation.

### QA workflow

1. QA receives test files from agents alongside the implementation.
2. QA extends the test suite — adds edge cases, negative paths, and contract assertions not covered by the agent.
3. QA owns the contract test suite independently of frontend/backend agent work.
4. QA sign-off requires the full test suite (agent tests + QA extensions) to pass.

### COO workflow

1. Specs will include a **test spec section** defining the minimum test cases expected.
2. Acceptance criteria are written in a form that maps directly to test assertions.
3. `npm test` passing is a required gate, not a courtesy check.

---

## 4. Test framework

| Scope | Framework | Config file |
|-------|-----------|-------------|
| Backend unit + integration | Vitest | `vitest.config.backend.ts` |
| Backend API contract | Vitest + supertest | same config |
| Frontend flows | Vitest + React Testing Library | `vitest.config.frontend.ts` |

Setup tasks:
- **TASK-TEST-BE:** Backend to configure Vitest and prove setup with one sample test.
  Spec: `jobs/backend/inbox/20260308_1800-COO-test-framework-setup.txt`
- **TASK-TEST-QA:** QA to set up contract test harness and prove with one API contract test.
  Spec: `jobs/qa/inbox/20260308_1800-COO-contract-test-setup.txt`

---

## 5. What counts as sufficient test coverage

The goal is not 100% line coverage. It is **coverage of business rules and contract surfaces**.

Minimum for backend:

- Happy path for every public service method
- All documented error/rejection paths (invalid input, locked trip rejection, rate limit)
- State transition rules (planning → active → review_pending → locked → planning)
- Carry-forward: source item flagged, new item created with provenance markers
- City creation: geocode queued on failure, not blocking

Minimum for frontend critical flows:

- Carry-forward modal: appears when candidates exist, does not appear when empty
- Lock/unlock: locked trip is read-only; unlock restores editability
- Review: bulk status update excludes next_time items
- Offline retry: queue persists across reload; indicator appears; manual trigger works

Minimum for QA contract tests:

- Every API endpoint: 200/201 on valid input, 400 on invalid, 423 on locked-trip write
- TripSummary shape includes places array
- iso_3166_2 present on region objects (post BUG-02 fix)

---

## 6. Exemptions

A spec may explicitly exempt a deliverable from this policy if:

- It is purely a documentation or config change
- It is a trivial cosmetic fix (equivalent to BUG-06 severity)
- The COO records the exemption reason in the spec

All exemptions must be stated explicitly. Silence means tests are required.

---

## 7. Change log

| Date | Change |
|------|--------|
| 2026-03-08 | Initial adoption. Going-forward only. Exempt: all work dispatched before this date. |

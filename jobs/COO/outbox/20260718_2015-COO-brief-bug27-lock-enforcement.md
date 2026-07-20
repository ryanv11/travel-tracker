# Brief: BUG-27 — Locked trips fully read-only + lock-matrix contract test

**To:** Backend agent
**From:** COO
**Date:** 2026-07-18
**Tracker:** BUG-27 · **GitHub issue:** #135 · **BRD:** TR-06/TR-07 (§5.1)
**Branch:** `fix/bug27-lock-enforcement`

## Context
PO ruling (audit Q3, 2026-07-16): "Locked should be read only. You'd need to move it out
of a locked state to make changes." Audit Session B found two gaps where the stated rule
is not enforced (audits/session-b-code-safety.md, Area 3):

1. **Trip DELETE** currently allows deleting a locked trip.
2. **POST `/:placeId/activities`** and **DELETE `/:placeId/activities/:activityId`**
   (src/backend/routes/places.ts:216-281) verify ownership but never check lock status —
   activities can be tagged/untagged on a locked trip. The file header's claim "All
   writes check locked trip status" (places.ts:6) is false for these two handlers.

## Requirements
1. Every write endpoint touching a locked trip's data rejects with **403 via `LockError`**
   (the established idiom — not 423). The only allowed mutation on a locked trip is the
   unlock action itself (TR-07).
2. Fix the two known gaps above. Then audit ALL other mutating endpoints (trips, places,
   items, cities junction writes) for the same omission — the audit found three different
   lock-check idioms in use; do not assume coverage.
3. **Lock-matrix contract test** (audit invariant 18): a test that seeds a locked trip and
   asserts 403 for EVERY mutating endpoint against it, plus asserts unlock still works.
   Put it in `src/backend/routes/__tests__/` (supertest against server-test-app) so it
   runs in CI without a live server. Table-driven so new endpoints get added in one line.
4. Fix the places.ts:6 header comment if any handler legitimately remains exempt (there
   should be none except unlock).

## Success criteria
- DELETE on a locked trip → 403; activity tag/untag on locked trip → 403
- Lock-matrix test enumerates every mutating route and passes
- Unlock on a locked trip still works (TR-07)
- No previously-passing test broken

## Security checklist (mandatory — confirm each in completion report)
1. Auth middleware applied — `requireAuth` global; `requireOwner` where owner-only
2. All repository queries touching user data scoped by `userId` (`eq(table.userId, req.user.id)`)
3. Any new user-data FK columns `.notNull()`
Reference: jobs/architect/tech/OP-06-hardening-checklist.md §2 + ADL-27.
Note: ownership checks must run BEFORE lock checks/helpers — helpers below the route
layer (assertNotLocked etc.) do NOT verify ownership (audit invariant 17).

## Process
- Run `/pre-push` before pushing; PR title `fix(BUG-27): ... (#135)`, body `Closes #135`
- CI must be green (read the job logs, don't assume). Do not merge — COO merges
- Completion report → `jobs/COO/inbox/` with security checklist confirmations

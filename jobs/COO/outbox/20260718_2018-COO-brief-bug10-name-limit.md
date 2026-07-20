# Brief: BUG-10 — Enforce the 200-character trip-name limit

**To:** Backend agent
**From:** COO
**Date:** 2026-07-18
**Tracker:** BUG-10 (backfilled — historical label from the contract test) ·
**GitHub issue:** #138 · **BRD:** TR-01 (§5.1)
**Branch:** `fix/bug10-name-limit`

## Context
PO ruling (audit Q13): enforce it. The 200-char limit has been documented-but-unenforced
since March, "guarded" by a permanently-green contract test:
`tests/contract/trips.contract.test.ts:86-98` asserts
`expect([201, 400]).toContain(status)` — passes whatever the server does.

## Requirements
1. Trip name Zod schema gains `.max(200)` (find `zName` or equivalent in
   `src/backend/validation/`), with a clear 400 message. Applies to create and update.
2. Replace the hollow contract test with real assertions: 201 at exactly 200 chars,
   400 above 200. Remove the accept-either-outcome pattern entirely — audit Session B
   flagged it as teaching agents that always-passing assertions are acceptable.
3. Unit test at the schema/route layer too (contract tests only run against a live
   server; the unit layer is what CI exercises on every PR).
4. Check the frontend: if the trip form has no maxlength, add `maxLength={200}` to the
   name input so users hit a friendly limit, not a 400.

## Success criteria
- 201-char name rejected 400 on create and update; 200-char accepted
- No accept-either-outcome assertion remains in the touched test file
- No previously-passing test broken

## Security checklist (mandatory — confirm each in completion report)
1. `requireAuth` global; `requireOwner` where owner-only — no auth changes expected here,
   confirm nothing regressed
2. Repository queries scoped by `userId`
3. New user-data FK columns `.notNull()` — n/a expected, confirm

## Process
- Run `/pre-push` before pushing; PR title `fix(BUG-10): ... (#138)`, body `Closes #138`
- CI green (read the logs). Do not merge — COO merges
- Completion report → `jobs/COO/inbox/`

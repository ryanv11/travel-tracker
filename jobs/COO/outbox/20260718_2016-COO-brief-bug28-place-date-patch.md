# Brief: BUG-28 — Non-destructive place-date PATCH + arrival<=departure validation

**To:** Backend agent
**From:** COO
**Date:** 2026-07-18
**Tracker:** BUG-28 · **GitHub issue:** #136 · **BRD:** DP-05 (§5.9)
**Branch:** `fix/bug28-place-date-patch`

## Context
PO ruling (audit Q8): destructive PATCH is a bug, and the fields should always validate
that arrival is before or equal to departure.

Current behaviour (audit Session B Q6): updating a place's `arrived_on` alone clears
`departed_on` (and vice versa) — unlike every other PATCH in the app, which leaves
omitted fields untouched.

## Requirements
1. PATCH on place dates preserves omitted fields — only fields present in the request
   body are modified. Explicit `null` clears a field; absent leaves it alone (match the
   app's established PATCH semantics — verify against how trips PATCH handles this).
2. Cross-field validation: `arrived_on <= departed_on` (same day allowed), enforced at
   the Zod schema layer (`src/backend/validation/`) with a clear 400 message. The check
   must work when only one field is in the PATCH body (validate against the merged
   result, not just the request body).
3. Tests: unit tests for (a) single-field PATCH preserves the other field, (b) explicit
   null clears, (c) arrival > departure → 400 with message, (d) arrival == departure →
   accepted. Contract test if the endpoint contract changed.

## Success criteria
- PATCHing one date never wipes the other
- Invalid date ordering rejected 400 at create AND update, including single-field updates
- No previously-passing test broken

## Security checklist (mandatory — confirm each in completion report)
1. Auth middleware applied — `requireAuth` global; `requireOwner` where owner-only
2. All repository queries touching user data scoped by `userId`
3. Any new user-data FK columns `.notNull()`
Reference: jobs/architect/tech/OP-06-hardening-checklist.md §2 + ADL-27.
Note: ownership verification BEFORE mutation (audit invariant 17) — template from
places.ts existing handlers which do this correctly via assertWritable.

## Process
- Run `/pre-push` before pushing; PR title `fix(BUG-28): ... (#136)`, body `Closes #136`
- CI green (read the logs). Do not merge — COO merges
- Completion report → `jobs/COO/inbox/` with security checklist confirmations

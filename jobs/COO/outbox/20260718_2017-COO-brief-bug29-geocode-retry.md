# Brief: BUG-29 — Geocode retry queue: reachable 404 cleanup, no write-as-poll

**To:** Fullstack agent
**From:** COO
**Date:** 2026-07-18
**Tracker:** BUG-29 · **GitHub issue:** #137 · **BRD:** GE-12/GE-13 (§5.2)
**Branch:** `fix/bug29-geocode-retry`

## Context
PO ruling (audit Q12): fix it. Two defects (audit Session B, Area 5 MED + Q8):

1. **Dead cleanup branch:** `src/frontend/services/geocodeRetryQueue.ts:158-167` checks
   `(err as { status?: number }).status === 404`, but `utils/apiClient.ts:47-54` throws
   plain `Error(message)` objects that never carry `.status` — the branch is unreachable.
   Deleted cities are treated as network errors and retried every 10 minutes forever
   (persisted across reloads via localStorage). The file header documents behaviour that
   cannot occur.
2. **Write used as a read:** the retry itself is an owner-only `PATCH /api/cities/:id`
   with an empty body used as a poll — it bumps the city's `updated_at` on every poll,
   and any future non-owner flow would 403 forever.

## Requirements
1. Introduce `ApiError extends Error` carrying `status` (and response body if cheap) in
   `apiClient.ts`; all throw sites use it. Update the retry queue's 404 branch to match
   on it — deleted cities leave the queue permanently.
2. Replace the empty-PATCH poll with a **read** — e.g. GET the city and check whether
   coordinates are resolved, or a purpose-built lightweight endpoint if the existing GET
   doesn't serve it. No write requests for polling. If you add/modify a backend route,
   the security checklist below applies.
3. Respect ADL-10 Nominatim discipline (≤1 req/sec, never re-query resolved cities) —
   read `geocoding.service.ts` before changing anything that triggers geocoding.
4. Update the geocodeRetryQueue.ts header comment to describe the real behaviour.
5. Tests: unit tests for the 404-removal path (now reachable) and the poll path; check
   whether existing `useGeocodeRetryQueue` tests assert the old behaviour and fix them.
   `ApiError` change: verify no other catch site in the frontend breaks (grep for
   `.message` / `instanceof Error` handling of apiClient errors).

## Success criteria
- A 404 from the cities endpoint removes the city from the retry queue (test proves it)
- Polling issues no PATCH/write requests
- No regression in offline geocode queueing (GE-12/13 flows still pass)

## Security checklist (mandatory if any route added/modified — confirm in report)
1. `requireAuth` minimum; `requireOwner` only if genuinely owner-only — note the audit
   flagged that a retry/poll path should NOT be owner-only if companions will ever see
   pending cities; prefer read endpoints scoped to authenticated users
2. Repository queries scoped by `userId` where they touch user data
3. New user-data FK columns `.notNull()`
Reference: jobs/architect/tech/OP-06-hardening-checklist.md §2 + ADL-27.

## Process
- Run `/pre-push` before pushing; PR title `fix(BUG-29): ... (#137)`, body `Closes #137`
- CI green (read the logs). Do not merge — COO merges
- Completion report → `jobs/COO/inbox/`

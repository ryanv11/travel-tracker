# Completion Report — BUG-27: Locked trips fully read-only + lock-matrix test

**From:** Backend agent
**Date:** 2026-07-19
**Tracker:** BUG-27 · **GitHub:** issue #135, PR [#140](https://github.com/ryanv11/travel-tracker/pull/140)
**BRD:** TR-06 / TR-07
**Branch:** `fix/bug27-lock-enforcement` @ `aa36289` — **NOT merged** (COO to review/merge)

## Summary of changes

PO ruling implemented: locked = fully read-only; the only permitted mutation on a
locked trip is the unlock transition (TR-07).

### src/backend/routes/trips.ts
- `DELETE /api/trips/:id` — **audit gap 1 fixed**: now throws `LockError` (403) on a
  locked trip; previously hard-deleted it. Ownership (`findByIdOrThrow`) runs before
  the lock check (audit invariant 17).
- `PATCH /api/trips/:id/status` — on a locked trip, any target other than
  `review_pending` now throws `LockError` (403) instead of a 400 invalid-transition
  error. `status → review_pending` and `PATCH /:id/unlock` still work.
- JSDoc updated (403 documented on DELETE).

### src/backend/routes/places.ts
- `POST /:placeId/activities` and `DELETE /:placeId/activities/:activityId` —
  **audit gap 2 fixed**: both now call `assertNotLocked` AFTER the ownership check
  (`placeRepository.findById(userId, ...)`); previously they never checked lock.
- Header comment (line 6) corrected — the false claim "All writes check locked trip
  status" replaced with an accurate description of the ownership-then-lock pattern.

### src/backend/routes/items.ts
- `PATCH`/`DELETE /api/trips/:tripId/items/:itemId` — replaced the bare
  `assertNotLocked(tripId)` (which ran BEFORE any ownership check and is not
  user-scoped, so it leaked lock status of other users' trips) with
  `itemRepository.assertWritable(userId, tripId)`: ownership 404 first, then lock 403.
  Aligns with audit invariant 17. `POST` items already used `assertWritable`.

### Full-surface audit (brief requirement 2)
All mutating endpoints audited across the three lock idioms present in the codebase:
- `assertWritable` (ownership+lock in one call): places POST/PATCH/DELETE,
  carry-forward, items POST — already correct; items PATCH/DELETE converted to it.
- inline `trip.status === 'locked'` check after ownership lookup: trips PATCH,
  trip-countries POST/DELETE — already correct; trips DELETE and the status route
  fixed to match.
- `assertNotLocked` called after a separate ownership check: place-activity
  tag/untag — added (previously missing entirely).

Out of scope (carries no trip-owned data): `/api/cities`, `/api/admin`, `/api/map` —
global/owner reference-data routes, covered by `security.access-matrix.test.ts`, not
BUG-27.

Documented edge (asserted in the new test, not changed): `PATCH /:id/lock` on an
already-locked trip stays 400 `"Trip is already locked"` — a rejected no-op state
transition, not a data write, so it isn't a LockError case.

### Lock-matrix test (brief requirement 3)
`src/backend/routes/__tests__/lock-matrix.test.ts` — table-driven (supertest vs
`server-test-app`, schema via the shared `repositories/__tests__/test-db.ts` factory):
seeds one locked trip with a place, a tagged activity, an item, and a country
association, then asserts **403 `{ error: 'Trip is locked' }` for all 15 mutating
routes** under `/api/trips`:
trip PATCH/DELETE, status→active/planning, places POST/PATCH/DELETE, carry-forward,
place-activity tag/untag, items POST/PATCH/DELETE, countries POST/DELETE.
Plus: persistence spot-checks proving the two audit-gap routes leave no trace on a
rejected write, both unlock paths (`/unlock` alias and `status→review_pending`)
succeed and leave the trip writable again, and the lock-on-locked 400 edge. File is
marked as a LIVING LOCK MATRIX with instructions for adding a row when a new mutating
route is introduced.

### E2E fix (post-review correction)
The PR's first CI run showed the E2E job failing 6 specs — the newly-enforced
`DELETE /api/trips/:id` 403 on locked trips collided with
`src/e2e/helpers/factories.ts::deleteAllTrips`, which is called in every spec file's
`beforeEach` for isolation and previously assumed DELETE always succeeds. The
`trips-status.spec.ts` specs deliberately leave a trip locked; the next spec's
cleanup then hit 403 and threw, cascading failures into `trips.spec.ts`.
Fixed in the E2E layer, not by weakening enforcement: `deleteAllTrips` now unlocks
(`PATCH /:id/unlock`) any trip whose `status === 'locked'` before deleting it, and
fails loudly (matching the existing OP-11 isolation convention) if the unlock call
itself fails. Verified with a full local Playwright run (36/36 passing) before
re-pushing.

### Doc lifecycle
`audits/session-b-code-safety.md` — Area-3 MED finding, invariant-18 disposition, and
open question Q2 stamped RESOLVED citing BUG-27/#135 (same-PR update rule, per
CLAUDE.md Document lifecycle).

## Test counts
- New: 21 tests (lock-matrix), all passing.
- Backend suite: 512 passed / 1 skipped (previously 491/1 — no previously-passing
  test broken).
- Frontend suite: 89 passed.
- E2E suite (local, post-fix): 36/36 passed.
- Pre-push checklist (`npm run check`, `type:check:all`, `test:backend`,
  `test:frontend`, `status:check`) — all green locally.

## CI status — PR #140, commit `aa36289`
All 9 checks read directly via `gh pr checks 140`:

| Check | Result |
|---|---|
| Backend Tests | pass |
| Biome (lint + format) | pass |
| Contract Tests | pass |
| Dependency Vulnerability Scan | pass |
| E2E Tests | pass |
| Frontend Tests | pass |
| Secret Scanning (Gitleaks) | pass |
| Static Analysis (Semgrep) | pass |
| Type Check | pass |

9/9 green.

## Security checklist confirmations (per brief)
1. **Auth middleware:** no new routes added. All touched routes remain under the
   global `app.use('/api/', requireAuth)` in `server.ts`; none of the touched routes
   are owner-only, so no `requireOwner` addition was needed.
2. **userId scoping:** every touched handler verifies ownership via user-scoped
   repository calls (`tripRepository.findByIdOrThrow(userId, ...)`,
   `placeRepository.findById(userId, ...)` / `placeRepository.assertWritable(userId, ...)`,
   `itemRepository.assertWritable(userId, ...)`) BEFORE any lock check — lock helpers
   (`assertNotLocked`) are never relied on for ownership (audit invariant 17). The
   items PATCH/DELETE change is a strict improvement in scoping order (the previous
   ordering could leak the lock status of another user's trip via the 403 vs 404
   response).
3. **New FK columns:** none — this PR makes no schema changes.

## Files touched
- `src/backend/routes/trips.ts`
- `src/backend/routes/places.ts`
- `src/backend/routes/items.ts`
- `src/backend/routes/__tests__/lock-matrix.test.ts` (new)
- `src/e2e/helpers/factories.ts`
- `audits/session-b-code-safety.md`

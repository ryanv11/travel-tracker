# Completion Report — BUG-29: Geocode retry — reachable 404 cleanup, read-based poll

**Note:** Reconstructed by COO from PR #142's diff during merge review — the
implementing agent did not file a completion report before completion.
Content is accurate to what was actually merged, not a paraphrase.

**Tracker:** BUG-29 · **GitHub:** issue #137, PR #142 (merged 2026-07-19)
**BRD:** GE-12 / GE-13 · **Branch:** `fix/bug29-geocode-retry`

## Summary of changes
Both audit defects fixed: the unreachable 404-cleanup branch, and the
empty-PATCH-as-poll write.

- `utils/apiClient.ts` — new `ApiError extends Error` carrying `status`; all
  throw sites updated to use it.
- `services/geocodeRetryQueue.ts` — 404 branch now matches
  `err instanceof ApiError && err.status === 404`; deleted cities leave the
  queue instead of retrying every 10 minutes forever. Header comment
  corrected to describe actual behaviour.
- `routes/cities.ts` — new `GET /api/cities/:id`: read-only, authenticated
  (no owner gate — cities are global reference data, matches the existing
  `GET /api/cities` search route's scoping), never triggers geocoding
  (ADL-10 discipline preserved — resolution stays owned by the backend
  queue). Used by the frontend poll in place of the old empty PATCH.
- `hooks/useGeocodeRetryQueue.ts` — wired to the new read path.
- Tests: `routes/__tests__/cities.get-by-id.test.ts` (new),
  `hooks/__tests__/useGeocodeRetryQueue.test.tsx` (proves the poll issues
  only `apiGet`, never `apiPatch/apiPost/apiDelete`, and a 404 removes the
  city from the queue), `services/__tests__/geocodeRetryQueue.test.ts`,
  `utils/__tests__/apiClient.test.ts`, `routes/__tests__/security.access-matrix.test.ts`
  updated for the new route.
- `audits/session-b-code-safety.md` stamped RESOLVED citing PR #142.

## Security checklist (per brief)
1. New route uses `requireAuth` only (deliberately not owner-gated — audit
   note: a poll/retry path shouldn't be owner-only if companions eventually
   see pending cities). 2. No user-data scoping needed — cities are global.
   3. No new FK columns.

## CI — PR #142
9/9 checks pass (verified via `gh pr checks 142` before merge).

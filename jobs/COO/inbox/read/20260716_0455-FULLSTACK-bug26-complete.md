# FULLSTACK — BUG-26 hide admin panel from non-owner users — COMPLETE

**Tracker:** BUG-26 | **Issue:** #116 | **PR:** #117 (open, awaiting COO review/merge) | **Branch:** `fix/bug26-admin-nav-nonowner` | **BRD:** §5.11 SE-02
**Brief:** `jobs/COO/outbox/20260716_0443-COO-brief-bug26-admin-nav-nonowner.md`
*(Filed by COO on the agent's behalf — agent ran in an isolated worktree.)*

## What was delivered

**Backend**
- New `GET /api/me` (`src/backend/routes/me.ts`), mounted at `/api/me` in both `server.ts` and `server-test-app.ts`, behind the globally-mounted `requireAuth` (deliberately NOT `requireOwner`). Returns `{ id, email, isOwner }` echoed from the middleware-resolved `req.user` — zero DB queries, no schema changes.

**Frontend**
- `useMe` hook (`src/frontend/hooks/useMe.ts`) — TanStack Query v5, `queryKey ['me']`, `apiGet`, 5-min staleTime; `Me` type added to `src/frontend/types/api.ts`.
- Admin nav link in `App.tsx` renders only when `me.isOwner` is truthy; hidden while identity loads (default hidden — no flash).
- `/admin` route wrapped in a new `RequireOwner` guard: null while loading, not-authorised message for non-owners, `AdminPage` for the owner.

**Design decision (per brief "your call"):** non-owner `/admin` direct nav renders a small not-authorised message + "Back to the map" link, not a redirect — a redirect while identity is still resolving would bounce the owner off `/admin` on hard refresh, and an explicit message beats a mystery redirect. Panel never mounts for non-owners. Backend `requireOwner` enforcement unchanged.

## Tests added
- `security.access-matrix.test.ts` (living matrix): Part A row `GET /api/me → 401`; new Part D — owner `isOwner: 1`, non-owner `200` + `isOwner: 0` (not 403), response contains exactly `id`/`email`/`isOwner` (no `clerkId` leak). Header exemption note updated (requireAuth-only route).
- `tests/contract/me.contract.test.ts`: live shape check under CI bypass env (`BYPASS_AUTH=true` + `OWNER_CLERK_ID=test_clerk_id` → `isOwner: 1`).
- `src/frontend/__tests__/App.test.tsx` (new): Admin link owner/non-owner/loading; `/admin` guard owner/non-owner/loading (6 cases).

## Verification
- Pre-push suite: biome clean; `type:check:all` clean; test:backend 470 pass/1 skipped; test:frontend 84 pass (was 78 — 6 new).
- Contract: 101 pass (was 99) against a locally started CI-style bypass server; live curl of `/api/me` returned the correct body.
- Real-auth mode (no `BYPASS_AUTH`): `/api/me` returns **401** with no token and with a garbage token — success criterion verified live.
- Doc lifecycle: OP-06 §2 access matrix already stamped SUPERSEDED (2026-07-15); the living matrix (test file) updated in-PR. No other status/verdict doc affected.

## Security checklist (confirmed in PR body)
1. `requireAuth` covers `/api/me` via global mount; NOT `requireOwner` — confirmed (Part A/D tests).
2. No repository queries beyond middleware's own resolution — confirmed (route touches no DB).
3. No new user-data FK columns — n/a, confirmed (no schema changes).

## CI
PR #117: all 8 jobs green (CI: Backend/Frontend/Contract/Type Check/Biome; Security: Semgrep/Gitleaks/Dep Scan) on both push and pull_request runs. No failures, no fixes needed.

## Follow-ups / notes for COO
- Tracker: BUG-26 `notes` should cross-reference issue #116 / PR #117 on close (COO-maintained).
- PR #117 awaits COO review + squash merge; remember post-merge main CI check and local branch cleanup.

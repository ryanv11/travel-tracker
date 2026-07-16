# Brief: BUG-26 — Hide admin panel from non-owner users

**From:** COO
**To:** Fullstack agent (backend + frontend)
**Date:** 2026-07-16
**Tracker:** BUG-26 | **GitHub:** #116 | **Priority:** P3
**Branch:** `fix/bug26-admin-nav-nonowner`

## Context

Found during the Q5 real-auth UAT (see `jobs/PO/uat-log.md`, 2026-07-16 session).
A non-owner Clerk account sees the Admin button in the banner, can open `/admin`,
and every section renders "not authorised" (backend `requireOwner` correctly 403s).
Backend enforcement is correct — this is presentation-layer gating only. PO verdict:
"suboptimal pass."

Investigated state (verified 2026-07-16):
- The frontend has **no owner-awareness anywhere** (no `isOwner` reference in `src/frontend/`)
- The backend has **no `/api/me` endpoint** — `req.user.isOwner` exists on every
  authenticated request (`src/backend/middleware/auth.ts`) but is never exposed
- Admin nav link: `src/frontend/App.tsx:62-71`; route: `App.tsx:130` (`/admin` → `AdminPage`)
- Frontend data hooks live in `src/frontend/hooks/` (TanStack Query v5 conventions — follow them)

## Requirements

1. **Backend — `GET /api/me`** (new route, behind the global `requireAuth`):
   returns `{ id, email, isOwner }` from `req.user`. No DB query needed beyond what
   `requireAuth` already resolves. No new tables/columns.

2. **Frontend — owner-aware UI gating:**
   - New hook (e.g. `useMe`) following existing hook conventions
   - Admin nav link renders only when `isOwner` is truthy
   - Direct navigation to `/admin` as non-owner must not render the admin panel —
     redirect to `/` or render a small not-authorised message (your call, note it in the PR)
   - While `me` is loading, do not flash the admin link (default hidden)

3. **Tests:**
   - Backend: unit/contract coverage for `/api/me` — 401 unauthenticated; correct shape
     and `isOwner` values for owner and non-owner (see `security.access-matrix.test.ts`
     for the two-user pattern). Under `BYPASS_AUTH=true`, `isOwner` follows
     `OWNER_CLERK_ID=test_clerk_id` (see `auth.ts`).
   - Frontend: component test — admin nav hidden for non-owner, shown for owner.

## Security checklist (mandatory — confirm each in the PR)

1. Auth middleware applied: `requireAuth` covers `/api/me` (global mount) — confirm; it
   must NOT be `requireOwner` (every authenticated user may ask who they are)
2. No repository queries touching user data beyond the middleware's own resolution —
   confirm none added
3. No new user-data FK columns — n/a, confirm

## Success criteria (definition of done)

- Signed in as non-owner: no Admin button in the banner; `/admin` direct nav does not
  show the admin panel
- Signed in as owner: Admin button and panel behave exactly as today
- `GET /api/me` returns 401 without a token; `{ id, email, isOwner }` with one
- All pre-push checks green (`/pre-push`); CI green on the PR

## Workflow (per CLAUDE.md)

- Branch `fix/bug26-admin-nav-nonowner` off `main`
- All deliverables committed to the branch — nothing left uncommitted
- PR title: `fix(BUG-26): hide admin panel from non-owner users (#116)`;
  body: `Closes #116` + BRD ref SE-02 + the confirmed security checklist
- Verify PR CI green (`gh run list`), fix failures before reporting
- Do NOT merge — COO merges
- Completion report to `jobs/COO/inbox/` (timestamped, per convention)

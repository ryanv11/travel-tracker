# OP-08 — Security Access Matrix Regression Tests — Complete

**Branch:** `feat/op08-security-access-matrix-tests`
**PR:** https://github.com/ryanv11/travel-tracker/pull/93
**CI:** All jobs green (CI + Security Checks)

---

## Deliverable

Created `src/backend/routes/__tests__/security.access-matrix.test.ts` — a living access matrix enforcing the OP-06 / BRD SE-01–SE-07 access control model on every CI run.

## Final test counts

| Part | Cases | Status |
|---|---|---|
| A — Unauthenticated rejection | 28 | All pass |
| B — Non-owner → 403 | 26 active + 1 skipped | 26 pass, 1 skipped (BUG-22) |
| C — Cross-user data isolation | 5 | All pass |
| **Total** | **60** | **59 pass, 1 skip** |

## Deviations from spec

1. **BUG-22 test skipped (`it.skip`):** `PATCH /api/cities/1 → 403` currently returns 404 because `requireOwner` is missing on that route. The test is marked `it.skip` with a clear comment instructing the maintainer to unskip after `fix/bug22-cities-patch-owner` merges (PR #92). The test body and assertion are fully written — only the activation is deferred.

2. **No standalone DELETE for regions in Part B:** `admin.ts` only has `PATCH /api/admin/countries/:countryCode/regions/:regionId` — there is no DELETE for regions (soft-delete only per AD-06). The spec listed a DELETE row for regions but no such route exists; the PATCH row covers what admin.ts exposes. The 5 region-related Part B cases are: GET list, POST create, PATCH US region 1, plus the two PATCH/GET on countries themselves.

## Pre-push checklist

- `npm run check` — clean
- `npm run type:check:all` — clean
- `npm run test:backend` — 433 passed, 1 skipped
- `npm run test:frontend` — 78 passed

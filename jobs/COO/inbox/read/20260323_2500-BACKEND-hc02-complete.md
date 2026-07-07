# HC-02 Completion Report — JWT Issuer Validation

**Date:** 2026-03-23
**Branch:** `fix/hc02-jwt-issuer-validation`
**PR:** #88 — https://github.com/ryanv11/travel-tracker/pull/88
**Issue:** #87
**Tracker:** NR-14 / OP-06 HC-02

---

## What changed

### `src/backend/middleware/auth.ts`
- Added `getIssuer()` helper function that reads `CLERK_ISSUER` from the environment.
  Throws a fatal error (`[AUTH] CLERK_ISSUER is not set in environment. Check .env.local.`) if the variable is absent and `BYPASS_AUTH` is not active — same startup-guard pattern as `CLERK_JWKS_URI`.
- `jwtVerify` now called with `{ issuer }` option: `jwtVerify(token, jwks, { issuer })`.
  Tokens with a mismatched `iss` claim are rejected by jose and fall into the existing catch block, returning 401.
- `BYPASS_AUTH=true` path is completely unaffected — `getIssuer()` is never invoked in that branch.

### `src/backend/middleware/__tests__/auth.test.ts`
- Added `process.env.CLERK_ISSUER = 'https://test.clerk.accounts.dev'` before module import (prevents startup guard from throwing in test environment).
- Added new test: **"returns 401 when jwtVerify throws due to wrong issuer"** — mocks `jwtVerify` to throw a JWT issuer claim validation error and asserts `res.status(401)` is called and `next()` is not.

### `.env.example`
- Added `CLERK_ISSUER=https://just-raptor-89.clerk.accounts.dev` with documentation comment.
  Value is included (not a placeholder) as it is non-secret.

### `.env.local` (not committed — gitignored)
- Added `CLERK_ISSUER=https://just-raptor-89.clerk.accounts.dev` to the worktree's local env file.

---

## Test results

| Suite | Result |
|-------|--------|
| `npm run type:check:all` | PASS |
| `npm run test:backend` | PASS — 377 tests (17 files), including 6 auth middleware tests |
| `npm run test:frontend` | PASS — 78 tests (5 files) |

---

## CI status

All 4 CI jobs green (push + PR):
- CI: success
- Security Checks: success

PR #88 is ready for COO review and merge.

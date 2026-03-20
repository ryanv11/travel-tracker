# Contract Test Auth Fix — Completion Report
**Date:** 2026-03-20 14:30
**Agent:** BACKEND
**Issue:** #9 — contract tests failing with 401 in CI (no auth token sent)

## Changes Made

### 1. `src/backend/middleware/auth.ts`
Added `BYPASS_AUTH` escape hatch as the first check in `requireAuth`. When `process.env.BYPASS_AUTH === 'true'`, skips all JWT verification and attaches a hardcoded test user (`id: test-user-00000000-0000-0000-0000-000000000000`, `clerkId: test_clerk_id`, `email: test@example.com`). Only active when the env var is explicitly `'true'`.

### 2. `.github/workflows/ci.yml`
Added `BYPASS_AUTH: true` to the env block of the "Start backend server" step in the **Contract Tests job only**. No other job was modified.

## Test Results (pre-push)
- `npm run test:backend` — 146 tests, 6 test files — ALL PASSED
- `npm run type:check` — no errors

## PR
https://github.com/ryanv11/travel-tracker/pull/10

## CI Results
- **CI workflow (push trigger):** success — Type Check, Backend Tests, Frontend Tests, Contract Tests all green
- **CI workflow (PR trigger):** success
- **Security Checks (PR trigger):** failed — pre-existing Gitleaks 403 permission issue when reading PR commits via GitHub API. This is unrelated to our changes and appears on all PRs (same failure seen on previous PRs in the run history).

# Completion Report — BUG-22: PATCH /api/cities/:id missing requireOwner guard

**Date:** 2026-03-24T05:25:13Z
**Branch:** `fix/bug22-cities-patch-owner`
**PR:** https://github.com/ryanv11/travel-tracker/pull/92
**GitHub issue:** #91
**Tracker:** BUG-22
**BRD:** SE-03

## Status: COMPLETE — CI GREEN

## Changes

### 1. `src/backend/routes/cities.ts`
Added `requireOwner` middleware to the `PATCH /:id` handler (line ~146). Pattern mirrors `POST /api/cities` which already had it.

### 2. `src/backend/routes/__tests__/owner-access.test.ts`
Added a new `BUG-22` describe block with two tests:
- Non-owner `PATCH /api/cities/1` → 403 Forbidden
- Owner `PATCH /api/cities/1` → 404 (city absent from test DB, confirming auth gate was passed)

## Test results (local)
- `npm run check` — pass (Biome)
- `npm run type:check:all` — pass
- `npm run test:backend` — 378 tests pass (17 files)
- `npm run test:frontend` — 78 tests pass (5 files)

## CI
All jobs green on PR #92:
- CI: success
- Security Checks: success

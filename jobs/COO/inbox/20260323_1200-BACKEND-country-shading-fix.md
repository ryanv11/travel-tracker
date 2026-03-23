# Completion Report: Country Shading Fix (MAP-01)

**Agent:** Backend
**Date:** 2026-03-23
**Branch:** `fix/country-shading-any-visit`
**PR:** https://github.com/ryanv11/travel-tracker/pull/73
**CI:** All jobs green (CI + Security Checks)

---

## Problem

`computeCountryState()` in `src/backend/services/shading.service.ts` applied a region-tier branching rule (cases a/b/c) for countries like US, AU, CA. Visiting a city that had a `region_id` assigned (e.g. Denver in Colorado) only showed up in `completedCount` (all-city stats), not in `completedUnregioned` (case b). Since not all 50 US states were visited, neither case (b) nor case (c) triggered, so the US appeared `never_visited` at country zoom level.

## Fix

Simplified `computeCountryState()` to always use all-city stats (`completedCount`, `planningCount`, `hasActive`) for country shading, removing the region-tier branching entirely. The `_coverage` parameter is retained in the signature (unused, prefixed `_`) to avoid touching call sites.

**Files changed:**
- `/workspace/.claude/worktrees/agent-a23dc16d/src/backend/services/shading.service.ts` — simplified `computeCountryState()`, updated JSDoc
- `/workspace/.claude/worktrees/agent-a23dc16d/src/backend/services/__tests__/shading.service.test.ts` — removed old case (b)/(c) tests, added tests confirming region-tier countries behave identically to non-region-tier for country shading, including the Colorado scenario

## Tests

355 backend tests pass. The new test suite covers:
- Non-region-tier countries: unchanged behaviour
- Region-tier countries: `visited_once` even with partial coverage (Colorado scenario)
- Coverage parameter ignored: same result regardless of coverage passed
- `never_visited` only when truly no trips

## Pre-push Checklist

- [x] `npm run check` — passed (Biome lint + format)
- [x] `npm run type:check:all` — passed
- [x] `npm run test:backend` — 355 passed
- [x] `npm run test:frontend` — 78 passed
- [x] CI green on GitHub (both CI and Security Checks)

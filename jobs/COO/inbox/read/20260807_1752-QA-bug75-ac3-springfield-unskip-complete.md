# QA completion report — BUG-75 AC-3 Springfield un-skip

**Date:** 2026-08-07
**Branch:** `test/bug75-ac3-springfield`
**PR:** https://github.com/ryanv11/travel-tracker/pull/415 (all 18 CI checks green, not merged — COO merges)

## Outcome

**AC-3 is now green, running for real — no defect found.** The already-shipped
picker-precedence logic (`src/frontend/utils/decideCityDisambiguation.ts`, PR #413) passed
AC-3 as soon as it was un-skipped against a valid, real fixture. No product code was touched
or needed to be.

**Skipped-count: 0.** Repo-wide grep for `it.skip|describe.skip|xit(|xdescribe(` across
`src/frontend` and `src/backend` returns exactly one hit before this PR (the AC-3 skip
itself) and zero after. Full suites: frontend 43 files / 302 tests passed, 0 skipped;
backend 42 files / 740 tests passed, 0 skipped.

## What changed (test + fixture only, as scoped)

- **New file** `src/frontend/components/TripDetail/__tests__/fixtures/springfieldGeocode.ts`
  — reuses the `PickCandidate` shape/convention from `newportGeocode.ts` exactly (same field
  set, same "load-bearing vs filler" provenance-comment convention). Exports the four
  candidates plus a `capturedSpringfields()` factory, mirroring `spanningRegionNewports()`
  etc.
- **Un-skipped and extended** the AC-3 `describe` block in
  `src/frontend/utils/__tests__/decideCityDisambiguation.test.ts`: removed the `it.skip`
  stub, added two real tests — (1) picker mode fires, candidate count and region-qualified
  `display_name`s all carry through unchanged; (2) selecting the Virginia candidate carries
  *that* candidate's own distinct `(osm_type, osm_id)`, and that id is absent from every
  other candidate in the set (guards against the picker silently collapsing distinct
  places).
- `_project/tracker.json` and product code (`decideCityDisambiguation.ts` etc.) — **not
  touched**, per the brief.

## Fixture provenance — two independent captures, zero discrepancy

1. **COO capture** — pasted into the brief, taken via
   `q=Springfield&countrycodes=us&format=json&addressdetails=1&limit=40` against
   `nominatim.openstreetmap.org`, then the app's own `SETTLEMENT_TYPES` filter
   (`{city,town,village,hamlet,municipality}`, `src/backend/services/nominatim-client.ts:116`).
2. **QA independent re-capture** — I confirmed Nominatim is reachable from this worktree
   (it was not, in the prior BUG-75 session) and ran the *identical* query directly via
   `curl` against the live host, then applied the identical `SETTLEMENT_TYPES` filter myself
   in a scratch script. Raw response: 32 rows. Post-filter: 4 rows.
   **Result: byte-for-byte identical to the COO's paste** — same 4 `osm_id`
   (158396042 / 157579394 / 153751916 / 153356201), same `type`s (city/hamlet/village/village),
   same `display_name` strings, same coordinates.

   This also gave me the raw `address['ISO3166-2-lvl4']` field the COO's paste didn't
   include (it only had `address.state`) — `parseCandidate` in `nominatim-client.ts:293`
   reads that exact field for `region_iso`, so I used it rather than inferring a
   state→ISO mapping myself: **US-VA, US-WV, US-IN, US-WI**.

Two independent probes agreeing is stronger than the mandatory minimum for a *negative*
finding — this is a positive finding (data exists, is exactly 4 rows), but I ran the second
probe anyway since mock-fidelity is explicitly part of ATDD/OP-35 and I wanted the fixture's
`region_iso` field to be real, not guessed.

**Springfield, Illinois is confirmed correctly absent**, not an oversight: it's OSM node/
relation `126326`, `type: 'administrative'`, `class: 'boundary'` — visible in my own raw
capture — and `SETTLEMENT_TYPES` does not include `administrative`, so the proxy drops it
before the frontend ever sees it. This matches the brief's framing exactly; I did not add it
and it would not survive the filter if I tried.

## Pre-push checklist — all green

- `npm run check` (Biome) — 0 errors on the changed files (1 format issue I introduced —
  a stray single-quote-with-apostrophe in a test title — fixed before commit; the remaining
  5 "info"-level Biome notes are pre-existing in files I did not touch,
  `geocoding.resolveByOsmId.test.ts` and similar)
- `npm run type:check:all` — clean, frontend + backend
- `npm run test:backend` — 42 files / 740 tests passed
- `npm run test:frontend` — 43 files / 302 tests passed, 0 skipped
- `npm run status:check` — STATUS.md already in sync (this change doesn't touch tracker
  facts)
- PR #415 CI — 18/18 checks green (Backend Tests, Frontend Tests, Type Check, Biome, Contract
  Tests, E2E Tests, Static Analysis/Semgrep, Dependency Vulnerability Scan, Secret Scanning —
  all pass)

## Not done (out of scope, flagging so it isn't silently dropped)

- `_project/tracker.json` update — explicitly reserved for the COO this session per the
  brief.
- I did not touch `AddPlaceFlow.picker-precedence.test.tsx` — I grepped it for
  `Springfield|AC-3|it.skip` and got zero hits (confirmed by `ls` + a repo-wide skip grep
  as the second probe), so there was nothing there to un-skip. Two-probe: (1) targeted grep
  on that one file for Springfield/AC-3/skip patterns — no hits; (2) repo-wide grep for
  every skip-marker across all of `src/frontend` and `src/backend` — exactly one hit total,
  the AC-3 test I closed. Both probes agree: the only AC-3 Springfield `.skip` in the repo
  was the one in `decideCityDisambiguation.test.ts`.

## Files touched

- `src/frontend/components/TripDetail/__tests__/fixtures/springfieldGeocode.ts` (new)
- `src/frontend/utils/__tests__/decideCityDisambiguation.test.ts` (modified — un-skip + 2 new
  assertions)

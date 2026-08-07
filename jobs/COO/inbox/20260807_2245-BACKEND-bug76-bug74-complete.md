# BACKEND — BUG-76 (P1) / BUG-74 (P2) complete

Tracker: BUG-76, BUG-74 · BRD GE-11/GE-16 · Branch: `feat/bug76-accept-rule-fix-impl`
PR: #421 — https://github.com/ryanv11/travel-tracker/pull/421

## What was built
Re-keyed the geocoder's settlement accept-rule from Nominatim's `type`/`class` fields to
`addresstype` (BUG-76), via a single shared predicate `isAcceptedSettlement` applied at
both `nominatimSearch` and `nominatimLookup`. Added `status: 'ok'|'error'|'disabled'` to
`GET /api/geocode`'s response body, always HTTP 200 (BUG-74). Implemented to QA's
pre-written ATDD suite per design doc ADL-51 — no redesign.

## Acceptance criteria (AC-0…AC-13, QA's suite)
All 18 assertions across the 3 ATDD files: **PASS**. Verified: 10 previously-red now green,
8 regression-guards still green (matches QA's mapping doc exactly, both before and after).

## Security checklist (GET /api/geocode modified)
1. Auth middleware: `requireAuth` applied globally (`app.use('/api/', requireAuth)` in
   `server.ts`) — confirmed unchanged, pre-existing `nosemgrep` annotation on the route
   documents this.
2. userId scoping: n/a — proxy reads no user-owned table, no query added.
3. FK notNull: n/a — no schema change.

## CI
All 18 checks green (`scripts/ci-wait.sh pr 421` → PASS) at commit `5ea9a6b`: Backend
Tests, Frontend Tests, Type Check, Biome, Contract Tests, E2E Tests, Dependency
Vulnerability Scan, Secret Scanning, Static Analysis — no failures, no suppressions added.

## Also touched (declared, OP-28)
`src/backend/services/__tests__/nominatim-client.test.ts` (pre-existing BUG-79 suite, not
one of QA's 3 ATDD files) — its truncation test simulated filtered-out rows via the OLD
discriminator (`type: 'administrative'`); re-keyed to `addresstype: 'county'` to preserve
the test's actual intent under the corrected discriminator. Small targeted edit (1 helper
signature + 3 fixture rows), not a wholesale rewrite.

## Open issues / blockers
None. One thing flagged, not absorbed: no GitHub issue exists yet for BUG-76/BUG-74
specifically (searched by title and by the #382/#367/#393/#91 numbers referenced in tracker
notes — none match). PR body references tracker IDs directly rather than a fabricated
`Closes #N`. Frontend's half of BUG-74 (banner mapping `error`/`disabled` -> `failed:true`
in `useCities.ts`, plus typing `status` onto `GeocodeResult` in
`src/frontend/types/api.ts`) is explicitly out of scope here per the brief — noted as the
next unblocked step below.

## What is now unblocked
- Frontend: BUG-74's banner-mapping half (needs `status` typed + `lookupCityCountry`
  updated), and re-verifying BUG-75's picker against the now-wider candidate set (more
  admin-boundary cities surface, e.g. Springfield IL/MO/MA).
- QA: can UAT the PO's original Denver symptom directly once merged/deployed.
- COO: tracker BUG-76/BUG-74 status updates at merge (tracker.json is COO-maintained, not
  touched here).

Park doc: `jobs/backend/park-docs/20260807-BACKEND-park.txt`
API doc: `jobs/backend/tech/20260307-api-reference.md` (new "Geocode Proxy" section)

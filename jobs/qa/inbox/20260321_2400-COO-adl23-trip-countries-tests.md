TO: QA
FROM: COO
DATE: 2026-03-21 24:00
RE: ADL-23 — trip_countries backend unit tests (GitHub #31)

Database migration (PR #38) is merged. Backend trip_countries API brief is in flight
simultaneously. Write tests against the API contract from ADL-23 — they can land
in the same PR as the Backend work if timing allows, or as a follow-up PR.

Branch: `feat/adl23-trip-countries-tests` (or coordinate with Backend agent to include in their PR)

---

## What to test

Focus on unit tests for the new endpoints + shading case (d). No contract tests needed.

Test file locations (follow existing patterns):
- `src/backend/routes/__tests__/trips.test.ts` — extend existing trip tests for country fields
- `src/backend/services/__tests__/shading.test.ts` — new file for shading case (d) if it doesn't exist; otherwise extend

Read existing test files first to understand the mock/setup patterns used.

---

## 1. Trip CRUD — country_codes on create/update

**POST /api/trips with country_codes**
- Create trip with `country_codes: ['JP', 'FR']`
- Assert response contains `countries` array with both codes
- Assert country_codes stored (GET /api/trips/:id returns both)

**PATCH /api/trips/:id with country_codes**
- Create trip, then PATCH with `country_codes: ['DE']`
- Assert countries list is now only DE (full replace)

**PATCH /api/trips/:id without country_codes**
- Create trip with JP, PATCH name only
- Assert JP still associated (field absent = unchanged)

---

## 2. Country sub-resource

**POST /api/trips/:id/countries**
- Add ['JP', 'FR'] → 200, response has both
- Add ['JP'] again (duplicate) → 200, JP still only appears once (idempotent)
- Add to non-existent trip → 404
- Add to locked trip → 409 (or whatever LockError maps to — check existing tests)

**DELETE /api/trips/:id/countries/:code**
- Add JP, then DELETE JP → 204
- DELETE JP again → 404
- DELETE on non-existent trip → 404
- DELETE on locked trip → 409

---

## 3. GET /api/trips?country=XX filter

- Create trip with JP in trip_countries, create trip with city in JP via trip_places
  (if setting up trip_places is complex in unit tests, just test trip_countries path)
- Filter by JP → both trips returned
- Filter by DE (no trips) → empty array

---

## 4. Shading — case (d)

Test that a country with a trip_countries row but NO trip_places cities gets the
correct shading state (not never_visited).

In a unit test for `getAllCountryShading()` or `computeCountryState()`:

- Seed: trip_countries has (trip_id=1, country_code='JP'), trip 1 is status='planning'
- No trip_places for JP
- Assert JP shading state = 'planned' (not 'never_visited')

If the shading service has existing tests showing how to mock/seed db, follow that pattern.
If no shading tests exist, write a focused integration-style test that:
1. Calls `getAllCountryShading()` after seeding trip_countries row directly in test DB
2. Finds the JP entry in the result
3. Asserts its state key or color matches the 'planned' shading

---

## Pre-push checklist

```bash
npm run type:check
npm run test:backend
npm run test:frontend
```

---

## PR

If filing separately:
```bash
gh pr create --repo ryanv11/travel-tracker \
  --title "test: trip_countries backend unit tests (ADL-23, #31)" \
  --body "$(cat <<'EOF'
Part of #31

Unit tests for:
- POST/PATCH /api/trips with country_codes
- POST /api/trips/:id/countries (idempotent, locked-trip guard)
- DELETE /api/trips/:id/countries/:code (404 on missing, locked-trip guard)
- GET /api/trips?country=XX filter
- Shading case (d): trip_countries path produces correct state

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

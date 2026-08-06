# QA completion — BUG-75 / UX-12 / GE-16 (v3.19) RED acceptance baseline (ATDD-first)

**From:** QA · **Date:** 2026-08-06 · **Branch:** `release/bug75-city-identity` (pushed; no PR, no merge)
**Brief:** `jobs/architect/tech/20260806-BUG75-build-brief.md` §3 · **Requirement:** GE-16 (v3.19)
**Gate:** implementation does not start until this red baseline lands — it has. Commit `c7dd08d`.

Four test files committed (tests + fixtures only — no application source touched). `type:check:all`
and `biome ci` are clean on all four; existing cities/geocode/AddPlaceFlow suites are unaffected
(29 + 5 still green). The design/review branch refs named in the brief both resolved and were read in
full (`feat/bug75-round4-identity-design-v3`, `review/bug75-round4-design-v3`) — nothing missing.

## 1. Test inventory (criterion → file → layer)

| §3 crit | Behaviour | Test file | Layer |
|---|---|---|---|
| **#1** | Coexistence — two same-region Newports (distinct osm_id) both persist | `src/backend/routes/__tests__/cities.identity-carry.test.ts` | route + **real** geocoding.service; only Nominatim egress mocked |
| **#1** | User-triggerability — chosen candidate identity carried into create | `src/frontend/components/TripDetail/__tests__/AddPlaceFlow.city-picker.test.tsx` | frontend flow |
| **#2** | Same-place merge — same osm_id repeat reuses the row (200, no new row) | `cities.identity-carry.test.ts` | route (real service) |
| **#3** | M-A — non-carried resolve stamps osm_id; two users → one stamped row, no NULL-osm_id dups | `cities.identity-carry.test.ts` | route (real service) |
| **#4** | Ask-to-choose — place-level picker fires on **same-region** ambiguity, by display_name | `AddPlaceFlow.city-picker.test.tsx` | frontend flow |
| **#5** | M-B create path — carried id, `/lookup` 200-empty → pending w/ retained ref, never 500 | `cities.identity-carry.test.ts` | route (real service) |
| **#5** | M-B pending-retry — stored osm_id, `/lookup` 200-empty → terminal `unresolvable` | `src/backend/services/__tests__/geocoding.resolveByOsmId.test.ts` | service (real) |
| **F1** | `resolveByOsmId` canonicalizes by `/lookup` (node/way/relation → N/W/R), deterministic | `geocoding.resolveByOsmId.test.ts` | service (real) |
| **#6** | Concurrency (M1/F3) — two concurrent same-osm_id creates merge to one row, never 500 | `cities.identity-carry.test.ts` | route (real service) |
| **#7** | No client coords; pending containment (creator-scoped); D12 rule-3 region not overwritten; non-owner CAN add; PATCH 403 for non-owner | `cities.identity-carry.test.ts` | route (real service) |
| **m1** | Picker inherits BUG-79 `lookupTruncated` caveat | `AddPlaceFlow.city-picker.test.tsx` | frontend flow |
| **#8** | EXPAND columns + SWITCH index cutover (global idx dropped; 2 partial unique idx; both-or-neither CHECK) + coexist-succeeds / same-osm_id-collides | `src/backend/migrations/__tests__/bug75-identity-migration.test.ts` | real migrations via `createTestDb` |

**Layer discipline (the v1-review trap).** User-path criteria (#1, #2, #4) are proven on BOTH sides.
The backend file does **not** mock geocoding.service away and does **not** hand-insert an osm_id into a
DB double — the carried `{osm_type, osm_id, display_name, region_id}` arrives through the **real request
body and real CreateCitySchema**, the exact channel the frontend picker uses; geocoding.service runs for
real. The **user-triggerability** half (does the picker actually fire on same-region ambiguity and carry
the pick?) lives in the frontend file, because that is the surface the v1 review flagged as untriggerable
by a backend inject. Region-only narrowing structurally cannot disambiguate the two GB-ENG Newports; the
frontend test asserts a place-level picker rendering both `display_name`s.

## 2. Red baseline — what fails and why (root-caused, per the D-17 process note)

**26 of 31 new tests are RED**, each attributable to a concrete missing surface (not "not in my files"):

- **Carry channel absent (CreateCitySchema `.strict()`).** #1/#2/#6 and the M-B create case POST
  `osm_type/osm_id/display_name` → **400** today (strict schema rejects unknown keys). Root cause: the
  carry fields are not yet on `CreateCitySchema` / `POST /api/cities`.
- **osm columns + stamp absent.** #3 M-A asserts a resolved row carries a non-null `osm_id`; today the
  column does not exist and the resolve path does not stamp (this is the delta-review M-A regression the
  build brief §2 folds back in). Red.
- **`resolveByOsmId` not exported / `/lookup` path not wired.** The F1 service tests fail on the missing
  export; the pending-retry test fails because `resolveCity` still uses the name-search path (the stored
  osm_id is ignored). Root cause: F1 canonicalize-by-id unbuilt.
- **Migration not written.** #8 fails on absent `osm_type/osm_id/display_name` columns, the still-present
  global `uniq_cities_name_country_region_ci`, the two absent partial unique indexes, and the absent
  both-or-neither CHECK. The `NULL-osm_id rows do not collide` test currently fails because the *old*
  global index still forbids it — it goes green precisely when SWITCH drops that index.
- **CityPicker unbuilt.** All 3 frontend tests fail: the picker's `display_name` rows never render (today
  the same-region Newports collapse to a single GB-ENG region suggestion — exactly the defect).

**No pre-existing unrelated failures.** The three existing cities/geocode suites and the existing
AddPlaceFlow suite were re-run and remain green — the red count is entirely the new, intended baseline.

**5 green (correctly), not vacuous:**
- 2 × mock-fidelity guards (below) — green now, become load-bearing the moment `nominatimLookup` is added.
- 3 × §7 carry-over **regression guards** for invariants that must *stay* true: non-owner CAN create a
  city (not owner-gated), non-owner PATCH is 403, and the strict schema rejects client coordinates. These
  are not "red-pending-feature" — they protect existing behaviour and should be green.

## 3. Mock-fidelity verification (QUAL-22 — mandatory)

The double for `nominatim-client.js` exports **every function the real module exports** — `nominatimSearch`,
`nominatimLookup` (the not-yet-built `/lookup` call, modelled on the real `NominatimSearchResult` contract),
and `__resetChokepointForTests`. Fidelity is enforced **mechanically, not by comment**: each backend file
carries a `mock fidelity` test that `vi.importActual`s the real module and asserts the mock's function-export
set is a **superset** of the real module's. Today the real client has no `nominatimLookup`, so the check
passes trivially — but the day the implementer adds it, an omission in the mock fails that test loudly
instead of letting a route call hit a swallowed `TypeError` (the exact D-17 vacuous-green failure).

Two vacuous-greens were **caught and fixed during authoring** (this is the QUAL-22 work the top model was
dispatched for):
1. **M-B service test** initially passed because the seed's `osm_id` was silently dropped (column absent),
   so `resolveCity` reached `unresolvable` via the *old name-search path* — proving nothing about `/lookup`.
   Strengthened to assert `nominatimLookup` was called with `N99999999`, so it can only go green when the
   stored osm_id actually drives a `/lookup`.
2. **Frontend truncation-caveat test** initially passed because "other matches may exist" already renders
   on the legacy region-suggestion caption. Strengthened to require the picker's `display_name` rows first,
   coupling the caveat assertion to the picker existing at all.

The route/service files also assert `nominatimLookup` is **reached** by the carried-id create path
(`lookupCalls` must contain the type-prefixed id) — a mock that is present but never exercised is treated
as a failure, not a pass.

## 4. Notes for the implementers / COO

- **`resolveByOsmId` return shape.** The F1 service test expects `resolveByOsmId(osmType, osmId)` to return
  the single canonical candidate (with `latitude`/`longitude`) or `null`, and to route through
  `nominatimLookup` with the type-prefixed id (`N`/`W`/`R`). If the design intends a `NominatimSearchResult`
  wrapper instead of a bare candidate, flag it and I will realign — I encoded the v3 §B1.2 wording ("returns
  the single canonical candidate").
- **M-B create-path vs pending-retry split.** I encoded the delta review's stated resolution: create path →
  **pending** (retains the carried ref so a transient reclassification self-heals); pending-retry →
  **terminal `unresolvable`**. Both are asserted separately. If the build chooses differently, these two are
  the tests to revisit.
- **§7 "PATCH/DELETE still 403".** There is **no `DELETE /api/cities/:id` route** — verified with two probes
  (full read of `cities.ts` + `grep` for `citiesRouter.delete` / `router.delete`, both negative). I test
  non-owner **PATCH → 403** (real `requireOwner`); the "DELETE" half of the brief line has no route to guard.
  Not a gap in the build — flagging so the criterion is not read as requiring a delete route that does not
  exist.
- **Frontend picker testids.** The frontend tests locate candidates by `display_name` text (the contract the
  design specifies the picker renders). If the implementer prefers a `data-testid`, the tests still pass on
  the visible text — no testid dependency was baked in.
- Firewall/live-Nominatim limitation is unchanged from the existing suites: fixtures assert what the flow /
  route does with a given candidate set; that "newport" really returns these two osm_ids upstream is a
  staging/UAT confirmation, not something CI can prove (same documented posture as `AddPlaceFlow.bug78-79`).

**Definition-of-done handoff:** turn these 26 red tests green **without editing the QA spec files**
(build brief §4). The three files that distinguish v3's fixes from a would-be-green-but-wrong state are the
F1 `/lookup` determinism test, the M-A stamp test, and the concurrent-merge test.

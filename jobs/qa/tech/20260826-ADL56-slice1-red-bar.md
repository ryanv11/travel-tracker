# ADL-56 / GE-21 Slice 1 — the red acceptance bar

**Date:** 2026-08-26 · **Author:** QA · **Branch:** `test/adl56-slice1-red-bar`
**Tracker:** BUG-97 (home) · BUG-98 · BUG-99 · BUG-73 · GE-21 · **BRD:** GE-21 (v3.22)
**Design:** `jobs/architect/tech/ADL-56-cached-live-disambiguation-seam.md` §10 / §10a
**Issues:** #536 (BUG-97) · #537 (BUG-98) · #538 (BUG-99)

ATDD-first (OP-35). No implementer has been briefed; this document and the suites it describes are
the executable definition of done they build against.

---

## 1. How the red bar is carried (and why it is not left literally red in CI)

Every red block is committed **`describe.skip` with a `[S1][RED-BAR]` marker**. This is the repo's
existing convention for "specified, deliberately not yet met", established by the GE-19/ADL-55 red
bar — `services/__tests__/geocoding.ge19-lifecycle.test.ts`,
`services/__tests__/cityIdentity.ge19-reopen-reuse.test.ts`,
`routes/__tests__/geocode-queue.ge19.test.ts` all carry the identical banner ("committed with
`describe.skip` + a per-block RED-BAR marker so CI stays green; the Backend brief un-skips each block
as it greens it, and a weakened assertion shows in that diff"). Those files are green on `main`
today with the markers still in their headers — the convention has completed a full cycle.

**Every block was run UN-SKIPPED before commit** and its observed failure recorded in §3 below. The
mechanism used was a throwaway sibling `*.redcheck.test.*` with `describe.skip(` rewritten to
`describe(`, run, then deleted — the committed deliverable was never mutated to obtain the evidence.

**Verification the implementer owes back:** un-skipping a block is a diff. A block that goes green
with its assertions intact is done; a block that goes green with an assertion weakened is visible in
the same diff. That is the whole reason the convention exists.

### Blocks that are NOT red, and are deliberately not in a RED-BAR block

Some assertions ADL-56 §10 names are **already true on `main`** and must survive the build. Parking
a green test inside a red block is how a red bar quietly becomes decorative, so they are split out
into `[S1][GUARD]` describes that run un-skipped:

| Guard | Why it is a guard, not a red |
|---|---|
| GE-20 country filter still sent with `GET /api/cities` | Green today; the D8 merge rewires exactly this call site, so "the live merge dropped the trip-country filter" is this wave's most likely regression |
| Search projection change is additive (no field dropped) | Green today; makes "additive" (§9) mean something |
| GE-16 containment predicate unchanged on the search | The OP-06 SEC line ADL-56 §9 states verbatim |
| D12 rule-3: a **supplied** region is never overwritten | Green today; the boundary D4 must not cross |
| GE-15 best-effort: an unseeded region leaves `region_id` NULL and still creates the city | Green today; the BUG-30 incomplete-seed class |
| §6b(1): the caught-violation `mergeIntoWinner` branch never touches the winner's region | Green today **only because no backfill exists yet** — this is the assertion a careless implementation of the red test directly above it will break |
| A region-**ambiguous** resolve backfills nothing (`needs_attention`, region stays NULL) | Green today; §6's scoping of D4 |

---

## 2. Where each ADL-56 §10 test lives

| §10 | Slice | File | Block |
|---|---|---|---|
| 1 | S1 | `src/frontend/components/TripDetail/__tests__/AddPlaceFlow.adl56-merged-surface.test.tsx` | test 1 — B1 regression |
| 2 | **S2** | `src/backend/routes/__tests__/cities.adl56-s2-name-path.test.ts` | `[S2][INTERIM]` |
| 3 | **S2** | same file (backend half) + `src/frontend/utils/__tests__/decideCityDisambiguation.adl56-s2.test.ts` (frontend half) | `[S2][INTERIM]` |
| 4 | S1 | `AddPlaceFlow.adl56-merged-surface.test.tsx` (FE) · `ChangeCityModal.adl56-live-merge.test.tsx` (FE) · `src/backend/routes/__tests__/cities.adl56-search-osm-identity.test.ts` (BE projection) | test 4 |
| 5 | S1 | `src/backend/routes/__tests__/cities.adl56-region-backfill.test.ts` (create path) · `src/backend/services/__tests__/geocoding.adl56-region-backfill.test.ts` (queue path) | test 5 / §6b |
| 6 | S1 | `AddPlaceFlow.adl56-merged-surface.test.tsx` | test 6 — D5 states |
| 7 | S1 | `AddPlaceFlow.adl56-select-not-commit.test.tsx` | test 7 |
| 8 | S1 | `AddPlaceFlow.adl56-select-not-commit.test.tsx` | test 8 (+ COO ADDITION 3) |
| 9 | S1 | `AddPlaceFlow.adl56-select-not-commit.test.tsx` | test 9 |
| 10 | S1 | `AddPlaceFlow.adl56-live-trigger.test.tsx` | test 10 |
| 11 | S1 | `AddPlaceFlow.adl56-live-trigger.test.tsx` | test 11 |
| 12 | S1 | `AddPlaceFlow.adl56-select-not-commit.test.tsx` | test 12 — N3 |
| 13 | S1 | `ChangeCityModal.adl56-live-merge.test.tsx` | test 13 — N6 |
| NB-1 | S1 | `AddPlaceFlow.adl56-merged-surface.test.tsx` | GE-21 NB-1 in-flight cue |

Support: `.../__tests__/fixtures/adl56Geocode.ts` (derived response bodies + provenance),
`.../__tests__/fixtures/adl56Harness.tsx` (the `apiClient` router + render helpers),
`src/backend/services/__tests__/fixtures/nominatim/adl56/` (three raw captures + README).

---

## 3. Red-for-the-right-reason record

Each row: the assertion that fails, and the **actual current behaviour observed** when the block was
run un-skipped against this branch's `main` base (`e72a3cd`). None of these fail on a missing import,
a typo or a mis-scoped selector — the harness itself is proven live by the `[S1][GUARD]` blocks in
the same files, which pass in the same run.

### 3.1 Test 1 — B1, one exact cached match must not suppress the live lookup

| Assertion | Observed today |
|---|---|
| `router.hasLiveCallFor('Newport')` is true | `expected false to be true` — **zero `GET /api/geocode` calls are issued from the search step at all.** The live lookup only ever fires from `handleOpenNewCityForm` (`AddPlaceFlow.tsx:392,405-410`), i.e. on the "+ Add new" click |
| live alternatives rendered | `Unable to find [data-testid="add-place-live-option-relation-191230"]`. The rendered DOM contains exactly one option — the cached `city-search-result-4001` row ("Newport — Oregon, US") — plus the `+ Add new: "Newport"` row |
| nothing auto-bound (`writePaths() === []`) | Fails on its **precondition** (`hasLiveCallFor` false), not on the headline assertion. Recorded honestly: *no live call fires today, so "nothing is auto-bound while the choice is surfaced" is currently vacuous.* The precondition is what gives it meaning; the headline half is a guard that must survive the build |

### 3.2 Test 4 — identity dedup (P2)

| Assertion | Observed today |
|---|---|
| non-duplicate live candidate rendered (anti-vacuous guard) | `Unable to find [data-testid="add-place-live-option-relation-191230"]` — no live rows at all, so the dedup assertion below it can never pass vacuously |
| cached row present once, live twin `relation 186468` absent | not reached — guard fails first, by design |
| picking the deduped row posts `{city_id: 4001}` and no `POST /api/cities` | not reached — guard fails first |
| **backend**: `GET /api/cities` returns `osm_type`/`osm_id` | `expected { id: 1, name: 'Newport', …(7) } to match object { Object (osm_type, osm_id) }` — the projection selects nine fields and neither osm field is among them |
| **backend**: the fields are present-but-`null` for a NULL-osm row | `expected { id: 2, name: 'Newportville', …(7) } to have property "osm_type" with value null` |

### 3.3 Test 5 / §6b — the D4 region backfill

| Assertion | Observed today |
|---|---|
| create path: blank region + unambiguous resolve → `region_id` backfilled | `expected null to be 1` — `routes/cities.ts:191` inserts `regionId: region_id ?? null`; the row is created region-null although the real captured Melbourne response resolves unambiguously to `AU-VIC` |
| create path, **N5(b)**: `best.regionIso` is NULL while the single distinct eligible `region_iso` is `AU-VIC` → still backfills | `expected null to be 1`. This is the assertion that separates a `best.regionIso` implementation from a `distinctRegionIsos(eligible)` one — both fail identically today, and only the correct one passes afterwards |
| queue path: a region-null pending row resolved by `resolveCity` carries the region | `expected null to be 1` — `commitResolvedOrMerge` (`geocoding.service.ts:297-316`) writes coords/osm/status and never region |
| queue path, **N5(b)** | `expected null to be 1` |

Confirmed in the same run: the M-A osm stamp still happens (`osmId === 4246124`), and the
merge-branch guard genuinely exercises the `catch` path — the loser row is **deleted**, proving the
real `uniq_cities_osm_ref` partial unique index fires against the in-memory libSQL instance rather
than the branch being simulated.

### 3.4 Test 6 — D5 message states

| Assertion | Observed today |
|---|---|
| S2 `add-place-state-cache-empty` present and scoped to *saved* places | `Unable to find [data-testid="add-place-state-cache-empty"]` |
| S4 `add-place-state-live-empty` present, S5 absent | `Unable to find [data-testid="add-place-state-live-empty"]` |
| S5 `add-place-state-live-failed` present (both `error` and `disabled`) | `Unable to find [data-testid="add-place-state-live-failed"]` |
| S1 cache-hit still reports the live outcome (the B1 correction to §7) | `Unable to find [data-testid="add-place-state-live-failed"]` |

Underlying behaviour: **all three states render the identical line today** — `No matches in United
States.` — because that message reflects the cached search only and no live call is made from this
step. That is BUG-73 stated exactly.

### 3.5 Test 7 — cached-search pick selects, does not commit

| Assertion | Observed today |
|---|---|
| clicking a cached result issues no `POST /api/trips/1/places` | **`expected 1 to be +0`** — the click posted the place immediately. This is BUG-99's mechanism observed directly (`AddPlaceFlow.tsx:611-613` → `handleSelectCity` → `addPlace`) |
| an explicit `add-place-commit` control exists and carries the post-pick dates | `Unable to find [data-testid="add-place-commit"]` — the search step has no commit control at all |

### 3.6 Test 8 — picker pick selects; commit runs createCity→addPlace in order, once

| Assertion | Observed today |
|---|---|
| clicking a live candidate writes nothing | `Unable to find [data-testid="add-place-live-option-node-26700977"]` — the merged surface does not exist, so there is no live candidate to click |
| `writePaths()` equals `['/api/cities', '/api/trips/1/places']` | not reached |

**COO ADDITION 3 is implemented as asked**: the ordering oracle is `router.writePaths()`, the
recorded sequence of non-GET calls, asserted with `toEqual`. That fails on wrong order, on a double
fire, and on an extra write — all three of which a pair of `toHaveBeenCalledTimes(1)` assertions
would pass.

### 3.7 Test 9 — the Melbourne anti-silent-commit guard

| Assertion | Observed today |
|---|---|
| commit with the two-option choice shown and nothing picked writes nothing | `Unable to find [data-testid="add-place-live-option-relation-4246124"]` on the AddPlaceFlow surface |
| the `ChangeCityModal` twin of the same guard | **`expected [ '/api/cities', '/api/trips/1/places/77' ] to deeply equal []`** — reached through the path that exists on `main` ("+ Add new" → picker showing → "Change City"), and it **silently minted a city and re-pointed the place with nothing picked**. Direct live evidence of the §6a / §12-Q5 anti-pattern on the surface whose entire job is to *correct* a wrong city |
| "none of these — add as new" creates a plain-name pending row | `Unable to find [data-testid="add-place-none-of-these"]` — no explicit escape row exists |

### 3.8 Test 10 / 11 — D8/B1 trigger policy and staleness

| Assertion | Observed today |
|---|---|
| B1 at the call level: a live call is made for "Newport" | `expected [] to include 'newport'` |
| debounced: 7 keystrokes → 1 call | `expected 0 to be greater than 0` |
| min-length 2 gate, **paired with a positive control** | first half green (nothing fires), positive control `expected [] to equal ['newport']` — the pairing is deliberate: alone, the first half is a vacuous pass |
| per-query coalescing survives type→delete→retype (the R2-a stress) | `expected +0 to be 1` |
| two distinct settled queries fire one call each | `expected [] to include 'newport'` |
| staleness: A abandoned for B before A returns → A never renders | `expected false to be true` (no live call for A at all) |

Underlying behaviour for test 11 specifically: on `main` the live lookup is an imperative
`lookupCityCountry(...).then()` (`AddPlaceFlow.tsx:410`) with **no keying whatsoever** — whichever
promise resolves last wins. There is no last-query-wins mechanism to regress; there is none to
begin with.

### 3.9 Test 12 — N3 held-selection invalidation

All three assertions fail on `Unable to find [data-testid="add-place-live-option-node-26700977"]`.

**Recorded plainly:** test 12 is red for the *same underlying reason* as test 8 — on `main` a pick
IS the commit, so the pick→hold window D7 introduces does not exist yet and there is nothing to
invalidate. Test 12 does not add independent red evidence today; its value is entirely prospective,
as the assertion that will catch the N3 hazard **after** D7 lands. Each of its tests carries an
explicit anti-vacuous guard (`expect(router.writePaths()).toEqual([])` after the pick) so it cannot
pass by the hold never existing.

### 3.10 Test 13 — the correction surface

| Assertion | Observed today |
|---|---|
| typing "Newport" in `ChangeCityModal` fires a live lookup from the **search** step | `expected false to be true` — `ChangeCityModal.tsx:55` is `useCitySearch(debouncedQuery)`, cached-only; the live lookup fires only on the "+ Add new" click (`:124`) |
| live alternatives rendered next to the cached row | `Unable to find [data-testid="change-city-live-option-relation-191230"]` |
| dedup + reuse-by-`city_id` on this surface | guard fails first, by design |

### 3.11 NB-1 — the in-flight cue

All three assertions fail on `Unable to find [data-testid="add-place-live-inflight"]`. There is no
in-flight state on the search step today because there is no in-flight live call on the search step
today; `countryLookupPending` exists but is scoped to the new-city form's "detecting…" caption
(`AddPlaceFlow.tsx:688-690`).

### 3.12 `[S2]` tests 2 and 3 — red for the Slice-2 reason, correctly

| Assertion | Observed today |
|---|---|
| test 2: two same-region Newports → `needs_attention` | `expected 'resolved' to be 'needs_attention'` — the backend bound `node 2386521` (Isle of Wight), the first-ranked candidate, silently |
| test 3 backend golden case A | `expected 'ok' to be 'ambiguous'` |
| test 3 frontend golden case B (Melbourne twins collapse) | `expected 'picker' not to be 'picker'` |
| test 3 golden cases A (FE) and B/C (BE) | already green — the ε-collapse must not break them |

---

## 4. The mock-fidelity position (QUAL-22, ADL-56 §10)

### 4.1 The frontend double sits on `apiClient`, not on `hooks/useCities`

Every pre-existing `AddPlaceFlow` suite mocks the whole `hooks/useCities` module. That boundary
cannot express any Slice-1 contract, for three reasons stated in full in
`fixtures/adl56Harness.tsx`'s header:

1. **D8/B1 is a claim about network calls.** "Fires on the settled query regardless of a single exact
   cached match" and "at most one call per distinct settled query" are assertions about
   `GET /api/geocode` egress. A stub of `lookupCityCountry` can only report that the stub was
   called — and today it is called from a completely different trigger, so the assertion would be
   measuring the wrong event.
2. **The implementation shape is deliberately not pinned.** §3b(6) *recommends* lifting the live
   lookup into a React-Query hook keyed by `(settledQuery, countrySet)`. A test that stubs
   `lookupCityCountry` hard-codes today's call shape and would go red on the recommended refactor
   for reasons unrelated to behaviour.
3. **Fidelity.** `apiGet('/api/geocode?…')` resolves the real `{status, candidates, truncated,
   country_code, region_iso}` body. Stubbing `lookupCityCountry` returns that function's
   already-digested `{countryCode, regionIso, candidates, failed, truncated}` — with the `status`
   discriminator that D5's S4-vs-S5 routing depends on **erased by the double**.

So React Query, `useCitySearch`, the 300 ms debounce, and `lookupCityCountry`'s own retry and
`status`→`failed` mapping all run for real.

### 4.2 The response bodies are derived from real captures, not written

`fixtures/adl56Geocode.ts` objects were produced by replaying three live 2026-08-26 Nominatim
captures through the **real** `parseCandidate`, the **real** `isAcceptedSettlement` admission gate,
and the **real** `routes/geocode.ts` serializer. `truncated` is derived the same way (raw row count
vs the `CONSTRAINED_LIMIT` the route requests), not asserted by hand.

### 4.3 The backend doubles only `global.fetch`

Both backfill suites and the S2 name-path suite keep `nominatimSearch`, the admission gate,
`classifyCandidates` and `resolveCityName` real, against a real libSQL `:memory:` DB built from the
real migrations — the QUAL-21/F4 pattern. A mocked `resolveCityName` cannot tell a correctly-wired
backfill from one wired to a broken resolver.

### 4.4 Existing doubles checked against the real client

`nominatim-client.ts` exports `NominatimCandidate` and the `NominatimSearchResult` union
`{status:'ok', candidates, truncated?} | {status:'disabled'} | {status:'error'}`. The existing
`geocoding.ge19-lifecycle.test.ts` double returns that union type-checked and is faithful; nothing
needed fixing. The one fidelity defect found is a **data** drift, not a shape drift — the older
`newportGeocode.ts` Isle of Wight `osm_id` (§5.2 below).

---

## 5. Findings for the COO

### 5.1 ADL-56 line references — mostly accurate, two drifted

Checked by symbol against the live files on this branch:

| ADL-56 cite | Live | Verdict |
|---|---|---|
| `AddPlaceFlow.tsx:611-613` (pick = commit) | 611-613 | exact |
| `AddPlaceFlow.tsx:362` / `:289` / `:892` / `:82` / `:405` / `:695-715` / `:781-838` | same | exact |
| `cityIdentityService.ts:142-145` (step 2b) | 142 | exact |
| `routes/cities.ts:138` (`findOrUpgradeCity`) | 138 | exact |
| `geocoding.service.ts:192` (`best = eligible[0]`) | 192 | exact |
| `geocoding.service.ts:290-323` / `:297-316` / `:321` (`commitResolvedOrMerge`) | 290 / 297-316 / 321 | exact |
| `nominatim-client.ts:48,239-240` | 48, 239-240 | exact — the path is `src/backend/services/nominatim-client.ts` (§14 writes it bare) |
| **`geocoding.service.ts:158`** cited as "`resolveCityName`→`classifyCandidates`" | 158 is `classifyCandidates`; `resolveCityName` is **214** | **drifted** — the two symbols are conflated; the intended claim (step 2b returns before the classifier runs) is unaffected |
| **`geocoding.service.ts:188-190`** (`distinctRegionIsos(...).length > 1`) | **189-191** | **drifted by one line** |
| `repositories/cities.ts:127-142` (search projection) | 127-142 | exact |
| `repositories/cities.ts:278-285` (`findByNameAndCountry`, capped at 2) | 278-285 — exact, and the `.limit(2)` cap is on 284 | exact |

Nothing in §10's testable content is invalidated by either drift.

### 5.2 Mock-fidelity drift in a pre-existing fixture (flagged, not fixed)

`src/frontend/components/TripDetail/__tests__/fixtures/newportGeocode.ts` gives Newport (Isle of
Wight) as `node 26700978`. Today's live capture returns `node 2386521` for that place and contains
no `26700978`. **Two probes that fail differently:** (a) the per-row dump of the raw
`newport_gb.json` capture; (b) `grep -c 26700978` over that file returning `0`.

Left untouched deliberately — it is load-bearing for green BUG-75/UX-12 suites, its own header
documents a different capture, and changing it is out of scope for a red-bar brief. ADL-56 suites use
the 2026-08-26 ids. Recorded in the fixture README so the two id sets are not treated as
interchangeable.

### 5.3 Things ADL-56 specifies that this bar deliberately does **not** pin

- **§3b(7) the rollback seam** ("one isolated policy point", `enabled: 'auto' | 'manual'`). A
  structural property of the source, not an observable behaviour. Faking an assertion for it would
  pin an implementation shape §3b explicitly leaves open. Belongs in the implementer's brief and in
  code review.
- **Copy and affordance** (D6): S2/S4/S5 wording, the cached-vs-live badge, grouping/ordering,
  whether the commit control is disabled or merely inert while the guard is active. §10 marks pure
  presentation ATDD-no; the tests assert **which state is rendered**, never what it says.
- **Mobile.** `MobileTripDetailView` renders the same `AddPlaceFlow` component (§3a, verified) so it
  is auto-covered; no mobile-specific suite was written.

### 5.4 Prescribed testids — a contract the implementer must honour

Pinning D5's state *routing* without pinning D6's *copy* requires a seam, and the repo's existing
seam is `data-testid` (`city-search-result-<id>` already exists). This bar therefore prescribes:

`add-place-commit` · `add-place-none-of-these` · `add-place-country-select` ·
`add-place-city-name-input` · `add-place-live-option-<osm_type>-<osm_id>` ·
`add-place-state-cache-empty` · `add-place-state-live-empty` · `add-place-state-live-failed` ·
`add-place-live-inflight` · `change-city-live-option-<osm_type>-<osm_id>` ·
`change-city-live-inflight`

Existing testids are unchanged. If the implementer wants different names, that is a negotiation with
the COO, not a unilateral rename — the names are the only thing keeping these tests independent of
UX's copy.

### 5.5 Open item carried to Slice 2

§4 requires **one** golden fixture set that both trees run. The frontend and backend are separate TS
build trees and cannot import a common module today, so the three golden cases are declared inline
in both `cities.adl56-s2-name-path.test.ts` and `decideCityDisambiguation.adl56-s2.test.ts`.
**Two inline copies is itself the drift risk §4 names.** Collapsing them into a shared module is
Slice-2 design work and is deliberately not pre-empted here; it should be an explicit item in the
Slice-2 brief.

---

## 6. Suite state at commit

- `npm run test:frontend` — 425 passed, 41 skipped, 0 failed
- `npm run test:backend` — 879 passed, 10 skipped, 0 failed
- `npm run type:check:all` — clean

The 41 frontend / 10 backend skips include this bar's red blocks. **Vitest's default reporter prints
only a skip COUNT, not the names** — which is precisely why the GE-21 Slice-1→Slice-2 interim is
additionally carried by two live, un-skipped tripwire tests rather than by skipped markers alone
(see §5 of the completion report).

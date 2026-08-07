# QA completion — BUG-75 picker-precedence + UX-12: RED ATDD suite (OP-35)

**From:** QA · **Date:** 2026-08-07 · **Branch:** `feat/bug75-pickerprecedence-and-ux12`
**Role in the phase:** ATDD-first (OP-35) — I wrote the RED acceptance tests as the executable
definition of done. I did NOT write product code. Frontend continues on THIS branch and turns it green.
**Design under test:** `origin/feat/bug75-pickerprecedence-design` §11 + the OP-27 review
(`origin/review/bug75-pickerprecedence-design`: MAJOR-1, MAJOR-2, AC-3 build-blocker), all folded in.

---

## TL;DR

- **6 new files** on the branch: 5 test files + 1 shared fixtures module. All pushed.
- **RED confirmed:** 5 test files fail; 10 individual assertions fail; **2 pass** and those two are the
  intended paired *negative guards* (see "The two passing tests" below) — not false-greens.
- **Every RED test fails for the RIGHT reason** — verified per test (region `<select>` fires instead of
  the picker; country silently committed; no creation message; net-new units missing). Details below.
- **Mock fidelity verified** against the real `lookupCityCountry` shape; the spanning fixture **includes
  Wales** (the row the shipped suite omitted).
- **AC-3 (Springfield) is `.skip` pending a real Nominatim capture** — NOT fabricated. Nominatim is
  unreachable from this container (two prior probes + I did not re-probe; inherited-as-UNVERIFIED).
- **biome ci clean** on all 6 files. **type:check** shows exactly 3 errors, all the intended
  missing-module imports the Frontend build resolves.

---

## AC → test → RED-reason map

| AC | Layer / file | RED reason (verified) |
|---|---|---|
| **AC-1** spanning (headline) | composition — `AddPlaceFlow.picker-precedence.test.tsx` | On main the spanning fixture triggers the region branch (DOM shows `Region — multiple matches found, please choose`); picker label `Multiple places match` and the `Newport, Isle of Wight` / `Cymru / Wales` rows never render. **The defect itself.** |
| **AC-1** (pure) | `decideCityDisambiguation.test.ts` | returns `'picker'` not `'region'` for the spanning set — RED: unit not built. |
| **AC-2** same-region twins | `decideCityDisambiguation.test.ts` | `'picker'` for two GB-ENG Newports — RED: unit not built. (At the *composition* layer this case is already green on main — the existing `AddPlaceFlow.city-picker.test.tsx` covers it — so AC-2's red gate is the pure-function layer, by design.) |
| **AC-3** Springfield | `decideCityDisambiguation.test.ts` | **`it.skip` — PENDING real capture.** Structure authored; do NOT fabricate a Springfield fixture (that is the QUAL-22 vacuous-pass class). |
| **AC-4** F1/F2 parity | `decideCityDisambiguation.test.ts` | `'region'` for multi-region no-osm; `'suggested'` for single-region no-osm; one-osm-across-two-regions → `'region'` (positive-evidence gate). RED: unit not built. |
| **AC-5** single unambiguous (Denver) | `decideCityDisambiguation.test.ts` | `'suggested'` even with an osm_id; empty set → `'none'`. RED: unit not built. |
| **AC-6** region_id alignment | `buildCreateCityDataFromCandidate.test.ts` | region_id derived from THAT candidate; incomplete-seed → undefined (never invented). RED: unit not built. |
| **AC-7** truncation caveat | composition — `AddPlaceFlow.picker-precedence.test.tsx` | truncated *spanning* lookup: caveat must ride on the picker; RED because the picker never renders on main (region branch fires). |
| **AC-8** Change-city control | `PlaceSection.change-city.test.tsx` | `button[name=/change city/i]` not found on unlocked resolved/pending places. RED: control absent. |
| **AC-9** shared precedence (no drift) | `ChangeCityModal.test.tsx` | spanning fires the picker in Change-city too. RED: component missing. |
| **AC-10** re-point preserves data (D11) | `ChangeCityModal.test.tsx` | selecting a candidate calls the re-point mutation `{tripId,placeId,cityId}` (→ PATCH `…/places/:id` `{city_id}`). RED: component missing. |
| **AC-11** badge | `PlaceSection.change-city.test.tsx` | `Location not confirmed` badge absent for pending/failed; present-case fails. RED: badge absent. |
| **AC-12** (MAJOR-1) identity carry once | `buildCreateCityDataFromCandidate.test.ts` (pure) + `ChangeCityModal.test.tsx` (cross-flow behavioural) | pure mapping unit missing; and Change-city must carry the SAME osm identity + region_id AddPlace carries. RED: unit + component missing. |
| **AC-13** (MAJOR-2) country not silently committed | composition — `AddPlaceFlow.picker-precedence.test.tsx` | `Suggested: United Kingdom` (country tentative caption) not found — on main `AddPlaceFlow.tsx:360` silently commits the country; only the region ever gets a `Suggested:` caption. |
| **AC-14** (MAJOR-2) creation-time messaging | composition — `AddPlaceFlow.picker-precedence.test.tsx` | `still confirming this location` (UX §3.4 pending copy) not found — main just closes/shows warnings. |

Files:
- `src/frontend/utils/__tests__/decideCityDisambiguation.test.ts`
- `src/frontend/utils/__tests__/buildCreateCityDataFromCandidate.test.ts`
- `src/frontend/components/TripDetail/__tests__/AddPlaceFlow.picker-precedence.test.tsx`
- `src/frontend/components/TripDetail/__tests__/ChangeCityModal.test.tsx`
- `src/frontend/components/TripDetail/__tests__/PlaceSection.change-city.test.tsx`
- `src/frontend/components/TripDetail/__tests__/fixtures/newportGeocode.ts` (shared fixtures, not a test file)

---

## Mock-fidelity verification (QUAL-22 — mandatory)

**How I verified the double matches the real dependency:**
- Read `lookupCityCountry` at `src/frontend/hooks/useCities.ts:87-104`. Real return shape:
  `{ countryCode: string|null, regionIso: string|null, candidates: GeocodeCandidate[], failed: boolean,
  truncated: boolean }`. Every `mockLookupCityCountry.mockResolvedValue(...)` in the suite returns exactly
  those five keys — no missing field the code reads (a missing field inside the swallowing `.then/.catch`
  is precisely how the original bug hid).
- Read `useCreateCity`/`useAddPlace` (useMutation results) — doubles return `{mutateAsync, isPending,
  error}`; `useAddPlace` resolves `{id, warnings:[]}`. Matches the real hook surface.
- The candidates carry `osm_type`/`osm_id` — the code's REAL disambiguation signal
  (`AddPlaceFlow.tsx:389-393` computes `distinctOsmIds` from exactly these). A fixture without them
  specifies nothing.
- **The spanning fixture includes Wales.** `spanningRegionNewports()` = IoW (GB-ENG) + Telford (GB-ENG) +
  **Newport city (GB-WLS, node 26700977)**. This is the row `AddPlaceFlow.city-picker.test.tsx`'s
  `sameRegionNewports()` omitted; its presence is what makes `sameCountryRegionIsos.length > 1` and thus
  what turns the composition test red on the region-first order. Anti-vacuous by construction.

**Honest qualification (per OP-35):** writing these first stops them being bent to fit the code; it does
not by itself make them perfect. The composition tests assert *observable* behaviour (which control
renders, what `createCity` is called with) — they do not, and cannot at this layer, prove Nominatim's real
`newport` response carries these exact osm_ids (that is the backend/UAT layer's job — same documented
limitation the existing suite carries).

---

## Fixture provenance — real-captured vs pending

**Real captured (safe to gate on now):**
- `26700978` GB-ENG Newport, Isle of Wight — captured; already in `cities.identity-carry.test.ts:149`.
- `27459103` GB-ENG Newport, Telford and Wrekin — captured; design §5.2 verbatim + identity-carry:159.
- `26700977` GB-WLS Newport (city), `Cymru / Wales` — captured; design §5.2 verbatim
  (`"Newport, Cymru / Wales, NP20 1GF, …"`) and referenced as `N26700977` in identity-carry:54.
  This is the previously-omitted Wales row.

Per-osm_id provenance is documented in `fixtures/newportGeocode.ts`. **No osm_id is invented.**
`latitude`/`longitude` on each candidate are plausible real coordinates included only to satisfy the
required type field — they are **never asserted** and are marked as filler in the fixture. The load-bearing,
captured fields are `osm_type`/`osm_id`/`region_iso`/`country_code` and the region token in `display_name`.

**Pending real capture (NOT fabricated):**
- **AC-3 Springfield** is `it.skip` with the fixture placeholder commented out. Nominatim is unreachable
  from this container (firewall-regressed; connection-refused on two prior probes recorded in the design
  §5.2/§13 — I did **not** re-probe this session, so I inherit that as **UNVERIFIED**, blind spot: a single
  network state I did not re-establish). A post-rebuild session must capture a real Springfield `/lookup`
  response, drop it into the fixtures module, and un-skip. AC-1 + AC-2 (real captured Newport) are the RED
  gate in the meantime, exactly as the review's build-blocker directs.

---

## The two passing tests (why they are correct, not false-greens)

The run is `10 failed | 2 passed`. The two that pass are the **paired negative-space guards**:
1. `AC-8 … is hidden when the trip is locked` — passes because no Change-city control exists on main, so
   it is trivially absent when locked. It must STAY green after the build (control hidden under `isLocked`).
2. `AC-11 … shows NO badge for a resolved place` — passes because no badge exists on main. Must stay green
   after the build (resolved → no badge).

Both are the negative half of a positive/negative pair; their positive siblings (control present when
unlocked; badge present when not resolved) correctly FAIL now. This is intended coverage, not a test aimed
at the wrong thing.

---

## Precise handoff to Frontend — what to build to turn this green

Sequenced A → B (design §10). **The tests are the contract; signatures below are pinned by the test imports.**

**Brief A — precedence fix + shared extraction:**
1. Create `src/frontend/utils/decideCityDisambiguation.ts` — the pure decision function. Signature
   (MINOR-1: `regionIso` is a SEPARATE input, not derivable from candidates):
   `decideCityDisambiguation(candidatesForCountry: GeocodeCandidate[], regionIso: string | null): CityDisambiguation`
   with `CityDisambiguation = {mode:'picker',candidates} | {mode:'region',regionIsos} | {mode:'suggested',regionIso} | {mode:'none'}`.
   The reorder is the point: evaluate `distinctOsmIds.size > 1` (picker) BEFORE `sameCountryRegionIsos.length > 1` (region).
2. Create `src/frontend/utils/buildCreateCityDataFromCandidate.ts` (MAJOR-1 anti-drift) —
   `(candidate, cityName, regions, fallbackCountryCode?) => CreateCityData | null`. Lifts the identity
   carry out of `AddPlaceFlow.handleSelectPickerCandidate` so it exists ONCE. Must forward
   osm_type/osm_id/display_name and derive region_id from the candidate's own region_iso (incomplete-seed → undefined).
3. Rewire `AddPlaceFlow` to consume both (extraction + reorder, NOT a rewrite — no-wholesale-rewrite rule).
4. AC-13/AC-14 (MAJOR-2): country as a tentative `Suggested: <country> — from "<name>"` caption
   (UX §3.2) instead of the silent commit at line 360; and the geocode_status-keyed creation message
   (UX §3.4 — pending copy is verbatim in the AC-14 test).

**Brief B — UX-12 (reuse-only):**
5. `src/frontend/components/TripDetail/ChangeCityModal.tsx` — `{tripId, placeId, onClose}`. Reuses the
   extracted search step + shared precedence unit + shared identity carry; on select/create calls the
   D11 re-point. The AC-10 test targets a `useChangeCity()` seam calling `{tripId, placeId, cityId}`
   (→ PATCH `…/places/:placeId` `{city_id}`) — a thin sibling of `useUpdatePlaceDates`. If you instead
   extend `useUpdatePlaceDates` with an optional cityId, retarget that one mock; the observable contract
   (a PATCH with city_id) is what AC-10 pins.
6. `PlaceSection` — a standing `aria-label="Change city"` button on every unlocked place regardless of
   `geocode_status`, hidden under the same `isLocked` rule as Remove (AC-8); and a single
   `Location not confirmed` badge (existing `locked` hue) whenever `geocode_status !== 'resolved'` (AC-11).

Also required by the review's MINOR-2 (not a test I can author — it's a lifecycle stamp): the build PR must
stamp `ADL-46 §4.3.2` with the §7 SUPERSEDED banner.

---

## Findings to flag (two probes / marked UNVERIFIED as noted)

1. **GeocodeStatus type/enum mismatch (real, verified two probes).** Frontend
   `src/frontend/types/api.ts:22` declares `type GeocodeStatus = 'pending' | 'resolved' | 'failed'`, but
   the backend DB CHECK (`src/backend/db/schema.ts:144`) is `IN ('pending','resolved','unresolvable')`.
   The frontend has **no `'unresolvable'`** and the backend has **no `'failed'`**. The AC-11 badge rule
   (`!== 'resolved'`) is unaffected, but **UX §3.4's `unresolvable` creation message can never match the
   frontend type** — AC-14 as authored covers only the `pending` message for that reason. This is a latent
   defect the Frontend/COO should decide on (reconcile the type to the backend enum, or map at the boundary).
   Not mine to fix; flagged. (Probe 1: read the frontend type. Probe 2: read the backend schema CHECK.)
2. **AC-2 composition is green on main** (the existing same-region test already covers it) — so AC-2's red
   gate is the pure-function layer only. Stated so nobody reads "AC-2 passes at the flow layer" as a miss.
3. **`unresolvable` badge case** in AC-11 is authored as `'failed'` (the frontend's valid terminal value)
   to stay type-sound — see the inline comment in `PlaceSection.change-city.test.tsx`.

## What I could not verify
- **Real Springfield `/lookup` data** (AC-3) — Nominatim unreachable; inherited UNVERIFIED (blind spot: I
  did not re-run the network probe this session). Gated as `.skip`.
- **The exact in-modal chrome / hook name of `ChangeCityModal`** — Frontend's build detail. The tests pin
  the observable contract (search step present, picker fires, PATCH with city_id), not the internal shape;
  the `useChangeCity` seam is a recommendation, retarget note included above.

CI note: this branch is RED by design and must NOT be merged to main until Frontend turns it green — no PR opened.

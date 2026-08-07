# BUG-76 — Geocoder accept-rule design (ADL-51)

**Date:** 2026-08-07
**Author:** Architect
**Status of the defect:** BUG-76, P1, root cause VERIFIED (tracker note 2026-08-07; live
Nominatim probe reproduced twice while the firewall was up).
**Classification (OP-32):** latent **gap** in shipped behaviour — not a regression. Denver
has no settlement place-node in OSM, so it was never geocodable through this filter. The
filter is deliberate (it keeps non-settlement noise out of city results), so the fix is to
**re-key and widen** the accepted set, not to remove filtering.
**Related:** ADL-46 (geocode proxy), ADL-48 §2.1/§15.1 (geocoder-as-coverage-tail), BUG-74
(response-contract ride-along, P2), BUG-71 (three-state presentation copy), BUG-79
(`DISCOVERY_LIMIT`/`truncated`), D-21 (tail-coverage probe).
**Fresh-eyes review (OP-27):** REQUIRED before any implementation brief is dispatched.
**Spawns implementation brief — `ATDD-first: yes`** (Architect-involved + a wrong
implementation fails silently-and-plausibly + behaviour is precisely specifiable against
the committed fixtures — meets the OP-35 trigger squarely).

---

## 1. Summary table

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D1 | Accept-rule discriminator | Key on **`addresstype`**, not `type`; admit `addresstype ∈ {city, town, village, hamlet, municipality}`, retaining the "discriminator absent → admit" passthrough | **High** |
| D2 | Where the rule is applied | Extract one shared predicate; apply at **both** the search filter (`:230`) and the lookup filter (`:267`) — the bug is present at both call sites | **High** |
| D3 | Discriminator alternatives (`place_rank`, `admin_level`, `type`) | **Rejected as primary keys.** `place_rank` does not separate city from county; `admin_level` is absent from our payload and non-discriminating; `type` is the current wrong key | **High** |
| D4 | Edge case — `addresstype=suburb` | **Reject** (out of settlement set). Reversible/tunable; flagged | **Medium** |
| D5 | Edge case — `addresstype=census` | **Reject.** In-fixture it is a duplicate of a real `city` row; a US CDP artifact, not a settlement | **High** |
| D6 | Edge case — `addresstype=municipality` | **Admit** (in the settlement set; confirmed by fixture) | **High** |
| D7 | Country-constrain the discovery query? | **No.** Structurally impossible on the discovery path and product-wrong for an international app; keep the fix surgical | **High** |
| D8 | BUG-74 response contract | Add `status: 'ok' \| 'error' \| 'disabled'` to the `/api/geocode` body (additive); always HTTP 200; frontend maps `error`/`disabled` → `failed:true` | **High** |

---

## 2. The confirmed mechanism (input, not a claim to re-probe)

`parseCandidate` (`nominatim-client.ts:295`) sets `type: raw.type` — Nominatim's **class-type**
(`administrative`, `city`, `village`, …). The candidate predicate at `:230` (search) and
`:267` (lookup) is:

```ts
c !== null && (c.type == null || SETTLEMENT_TYPES.has(c.type))
```

with `SETTLEMENT_TYPES = {city, town, village, hamlet, municipality}` (`:116`).

Prominent cities are modelled in OSM as **admin-boundary relations**: `type=administrative`
with `addresstype=city`. `SETTLEMENT_TYPES.has('administrative')` is `false`, so they are
**dropped**. The fixtures prove it: all 4 Denvers and every famous Springfield (IL/MA/MO/OH)
are `type=administrative` and survive at a rate of 0–1 per query today.

**The filter keys on the wrong field.** The information that says "this is a city" lives in
`addresstype`, which `parseCandidate` never even captures.

---

## 3. D1 — The accept-rule

### 3.1 Definition

Capture `addresstype` in `parseCandidate`, then admit a candidate when:

```
SETTLEMENT_ADDRESSTYPES = { 'city', 'town', 'village', 'hamlet', 'municipality' }

accept(c) :=  c.addressType == null
           || SETTLEMENT_ADDRESSTYPES.has(c.addressType)
```

- **Key on `addresstype`, drop the `type`/`class` gate entirely.** `type`/`class` may remain
  as carried metadata on the candidate (they cost nothing), but they no longer decide
  admission. A repo-wide grep confirms nothing outside this filter reads `candidate.type`
  or `candidate.class` — `geocoding.service.ts` consumes only `name/displayName/lat/lon/
  osmType/osmId` — so re-keying the gate has no other blast radius. *(Probe: `grep -rn
  '\.type\b|\.class\b' src/backend` + read of `geocoding.service.ts:290-320`; two
  independent reads, same result.)*
- **Retain the "discriminator absent → admit" passthrough** (`c.addressType == null`),
  mirroring today's `c.type == null` clause. Its two justifications:
  1. **Legacy fixtures/callers** in this codebase build candidates without an addresstype
     (the `nominatim-client.test.ts` factory defaults `type:'city'` but sets no
     addresstype); the passthrough keeps them admitted, same as today.
  2. **The `/lookup` canonicalize-by-id path** (BUG-75 F1) queries by an exact osm_id the
     user already picked — filtering it out would discard a deliberate choice. Whether the
     `/lookup` response even carries `addresstype` is **UNVERIFIED** (see §3.4); the
     passthrough makes the rule correct either way.

### 3.2 Why `addresstype`, verified against the fixtures

| Fixture | Rows | Under the NEW rule | Correct? |
|---|---|---|---|
| `denver_us.json` | 4 | all 4 admitted (1 `city` + 3 `village`) | ✅ Denver CO now resolves; the 3 small Denvers are real villages, legitimately disambiguable |
| `springfield_us.json` | 20 | IL/MA/MO/OH (`city`), VT/TN (`town`), GA/… (`village`) admitted; the `census` VA row dropped, the `city` VA row kept | ✅ famous capitals surface; VA appears once, not twice |
| `springfield_global.json` | 36 | all city/town/village/hamlet/municipality admitted; 3 `suburb` + 1 `county` + 1 `census` dropped | ✅ (see edge-case rulings D4–D6) |
| `neg_cook_county.json` | 3 | **0 admitted** (all `county`) | ✅ no county posing as a city |
| `neg_colorado_state.json` | 3 | **0 admitted** (`state`/`county`/`river`) | ✅ no state/region posing as a city |

The design risk the brief names — **admitting a county or state as a "city"** — is closed
by construction: `state`, `county`, `region`, `river` are simply not in
`SETTLEMENT_ADDRESSTYPES`. Note the decisive confirmation that `addresstype` beats
name-based heuristics: `springfield_global.json` contains *"Rural **Municipality** of
Springfield, Manitoba"* with `addresstype=county` — the word "Municipality" is in its name,
but its `addresstype` correctly rejects it.

### 3.3 D3 — Why not `place_rank`, `admin_level`, or `type`

- **`place_rank` — rejected.** It does not discriminate. Denver CO (`addresstype=city`) and
  Cook County (`addresstype=county`) are **both `place_rank=12`** (fixtures). A rank
  threshold either admits counties (≤12) or rejects Denver (>12); there is no cut that
  separates them. It is not orthogonal to the thing we care about.
- **`admin_level` — rejected.** It is not present in the fields our request returns
  (`addressdetails=1` gives the `address{}` block, not `extratags`/`admin_level`), so keying
  on it would require a request-shape change for a signal `addresstype` already gives us
  cleanly. **UNVERIFIED** whether an `extratags=1` request would even surface it reliably per
  row; not worth the dependency.
- **`type` — rejected (it is the current bug).** `type=administrative` is shared by cities,
  counties, and states alike; it cannot distinguish them.

### 3.4 D2 — Apply at BOTH call sites, via one shared predicate

The identical predicate appears at `:230` (`nominatimSearch`) and `:267` (`nominatimLookup`).
**The bug is present at both.** A Denver canonicalized by id through `/lookup` would hit
`SETTLEMENT_TYPES.has('administrative') === false` and be dropped exactly as the search path
drops it. The fix must:

1. Extract a single `isAcceptedSettlement(candidate): boolean` (or inline-shared constant +
   predicate) used by both filters, so the two sites cannot drift apart later.
2. Apply the addresstype rule at both.

**UNVERIFIED — flagged for the implementer.** I have no `/lookup` fixture (firewall was up
only long enough to capture `/search`). It is *plausible but unconfirmed* that the `/lookup`
response carries `addresstype` per row. Two independent reasons this does not endanger the
fix: (a) the null-passthrough admits a lookup row whose `addresstype` is absent — which for a
deliberately-picked id is the desired behaviour anyway; (b) `/lookup` is queried by exact
osm_id, so even total filter passthrough there is safe. **Blind spot:** if `/lookup` *does*
return `addresstype` and returns something non-settlement for a legitimately-picked id, the
rule would (correctly) still admit it via neither clause — this cannot happen for a
`city`/`town` the user picked, but the implementer should add a `/lookup` fixture if the
firewall permits, and the ATDD suite must not *assume* `/lookup` carries `addresstype`.

---

## 4. Edge-case rulings (all present in the fixtures)

### D4 — `addresstype=suburb` → **REJECT** (Medium confidence, reversible)

Three suburb rows in `springfield_global.json`: Chelmsford GB (rank 20), Queensland AU and
NSW AU (rank 18). A `suburb` is a **sub-municipal** division — a district *inside* a
settlement, not a settlement. Admitting it:

- reintroduces exactly the granularity noise the filter exists to suppress, pushing toward
  neighbourhoods/quarters/city_districts posing as cities;
- risks a user picking "Springfield [a suburb of Ipswich, QLD]" when they meant a city.

**Verified there is no false-negative cost in-fixture:** every suburb row is a sub-district
of a larger place, none is a place that exists *only* as `suburb` with no city/town/village
row we would otherwise miss. This is the conservative direction on the one axis
(false-positives) the brief flags as the real risk.

**Marked reversible.** This is a data-driven boundary, not a deep invariant. If UAT surfaces
a genuine destination that OSM models *only* as `suburb` (some Australian master-planned
"cities" trend this way), adding `suburb` to the set is a one-line, low-risk change. The
success criteria (§6) pin the *reject* behaviour so a future widening is a deliberate,
tested decision rather than drift.

### D5 — `addresstype=census` → **REJECT** (High confidence)

Springfield VA appears as **two** rows: a `census` row (`type=census`, rank 25) *and* a real
`city` row (`type=city`, rank 16). A `census` addresstype is a US Census Designated Place —
a statistical artifact, not a civic settlement. Rejecting it:

- surfaces **no new place** — the VA `city` row is admitted, so Springfield VA still appears
  (exactly once);
- avoids a **duplicate** VA row in the picker (the census + city pair would otherwise both
  show).

This interacts cleanly with BUG-75's dedup: the accept-rule drops the census row *before*
dedup ever sees it, so there is no census/city collision to canonicalize. Net behaviour:
Springfield VA present, once, unchanged from today.

### D6 — `addresstype=municipality` → **ADMIT** (High confidence)

Already in the settlement set. Confirmed by `springfield_global.json`: *"Town of Springfield,
Dane County, Wisconsin"* is `addresstype=municipality` and is a real town. No change of intent
— just note that `municipality` now appears as an `addresstype` value, not only as a `type`
value as in the old set.

---

## 5. D7 — Discovery query: do NOT country-constrain (secondary, independent)

`GET /api/geocode` sends `q` with `DISCOVERY_LIMIT=40` and **no** `countrycodes` on the
discovery path (`geocode.ts:81`). The question is whether to constrain it by country.

**Recommendation: do not.** Three reasons, and this is *independent of and must not be
bundled with* the accept-rule fix:

1. **Structurally impossible on the path that matters.** The discovery lookup
   (`lookupCityCountry`, `useCities.ts`) runs *to discover* the country — it has no country
   to constrain by. Constraining it is circular.
2. **Product-wrong for an international app.** A hard `countrycodes` filter would break
   logging any foreign city — the core use case of a travel tracker. (Denver is US-only in
   the data regardless; the grab-bag concern is Springfield-shaped, not universal — see
   `denver_unconstrained.json`.)
3. **The grab-bag thinning is already mitigated.** BUG-79 raised `DISCOVERY_LIMIT` to 40 and
   added `truncated`; D14 narrows by region; BUG-71's `Suggested:` caption surfaces the
   tentative fill. **This accept-rule fix further mitigates it**: today the worldwide 40 slots
   are thinned to a handful of survivors by the broken filter, so the *same-country* set
   collapses; admitting the admin-boundary cities restores same-country density directly.

**Trade-off, stated honestly.** Not constraining means an ambiguous name still returns
cross-country candidates, and `candidates[0]` (the auto-populate source) can be a foreign
city. That residual is BUG-71's territory (surface the ambiguity), not BUG-76's (stop
dropping real cities). A future, *soft* improvement — **not** part of this fix — would be to
*re-rank* (not filter) same-country candidates first if a user home-country context ever
exists; a soft re-rank preserves foreign-city logging where a hard filter destroys it.

**Ruling: leave the discovery query unconstrained. Do not change its request shape in the
BUG-76 fix.**

---

## 6. D8 — BUG-74 response contract (ride-along)

### 6.1 The defect

`geocode.ts:86` collapses the client's discriminated union to an array:
`let candidates = result.status === 'ok' ? result.candidates : [];` and always returns HTTP
200. So `status:'error'` (Nominatim down), `status:'disabled'` (geocoding off), and
`status:'ok'` with an empty list (genuine no-match) are **indistinguishable** to the
frontend. `lookupCityCountry`'s `failed` flag (BUG-73) only trips when `apiGet` *throws* —
i.e. when the browser can't reach *our* backend — so an upstream failure reports as "found
nothing" and shows no banner. This is **why BUG-76 was invisible**: Denver returned
`candidates:[]` at 200, identical to a genuine miss.

### 6.2 The contract

**Propagate the status the client already computes** rather than discarding it. Add one field
to the `/api/geocode` response body:

```ts
// GeocodeResult (src/frontend/types/api.ts) + geocode.ts serialization
{
  status: 'ok' | 'error' | 'disabled',   // NEW — mirrors NominatimSearchResult.status
  candidates: GeocodeCandidate[],         // meaningful only when status === 'ok'
  country_code: string | null,
  region_iso: string | null,
  truncated?: boolean,
}
```

Route change (`geocode.ts`): stop collapsing; carry `result.status` through. When
`status !== 'ok'`, `candidates` is `[]`, `country_code`/`region_iso` are `null`, `truncated`
is `false` — same shape as today, now *labelled*.

**HTTP stays 200 in all three cases.** The alternative — 502 for `error`, 503 for `disabled`
— was **considered and rejected**: a non-2xx makes `apiGet` throw, collapsing "*our* backend
is unreachable" (a real transport failure) and "*Nominatim* is down but our backend answered
fine" into one signal, which is strictly *less* information than the body-status carries.
Always-200-plus-`status` keeps the two layers distinct:

| Frontend observation | Meaning | Copy owner |
|---|---|---|
| `apiGet` throws / non-2xx | our backend unreachable | existing BUG-73 banner |
| 200, `status:'error'` | upstream geocoder unavailable | BUG-71 three-state |
| 200, `status:'disabled'` | geocoding off (CI/non-prod; never prod) | BUG-71 / benign |
| 200, `status:'ok'`, `candidates:[]` | genuine no-match | BUG-71 three-state |
| 200, `status:'ok'`, `candidates:[…]` | show picker | — |

### 6.3 Split of work and the BUG-71 interaction

- **Backend (this fix, BUG-76):** add `status` to the serialization. **Additive and
  backward-compatible** — existing consumers ignore the new field, existing tests keep
  passing (`GeocodeResult.status` typed optional at first, same pattern as `truncated`, or
  required with fixtures updated — implementer's call, ATDD pins it either way).
- **Frontend (BUG-74's half):** `lookupCityCountry` maps `status:'error'` and
  `status:'disabled'` → `failed:true`, so the existing banner fires on an upstream failure.
  This is a small, separate frontend change; it is the piece that actually *closes* BUG-74.
- **BUG-71 owns the copy.** The exact three-state wording ("we couldn't confirm this
  automatically" vs "no city found" vs "try again") is BUG-71's `Suggested:`/three-state
  presentation, per the tracker note's explicit warning that the wording must be settled
  *with* BUG-71, not independently. This contract gives BUG-71 the signal it needs; it does
  not dictate the words.

**Optional, additive, deferred:** distinguishing "found only non-settlements" (`rawCount>0`
but 0 survivors — e.g. searching "Colorado") from "found nothing" (`rawCount===0`) would let
BUG-71 say *"'Colorado' is a state, not a city."* The contract can carry this later via an
optional `nonSettlementOnly: boolean` without a break. **Not required for the P1 fix** — do
not build it now; noted so the field name is reserved and the future extension is clean.

---

## 7. Success criteria — the ATDD spec (testable, against the committed fixtures)

The fixtures live at `src/backend/services/__tests__/fixtures/nominatim/bug76/`. Each
criterion is an assertion the QA ATDD suite writes **red first**. **Mock-fidelity rule
(OP-35/QUAL-22):** the test double for `fetchNominatim` must return these *exact captured
JSON bodies*, and the double must be verified to feed `parseCandidate` the same shape the
real `fetch(...).json()` does — a suite that stubs already-parsed candidates specifies
nothing.

### 7.1 Accept-rule — false-negatives fixed

- **AC-1 (Denver).** Feeding `denver_us.json` through `nominatimSearch`, `status==='ok'` and
  `candidates` is **non-empty**; the top candidate is Denver, CO with `countryCode==='US'`
  and `regionIso==='US-CO'` and finite lat/lon. *(Today: 0 candidates.)*
- **AC-2 (Denver end-to-end auto-populate).** Through `GET /api/geocode?q=denver`, the
  response `country_code==='US'` and `region_iso==='US-CO'` — country+state auto-populate.
  *(This is the exact PO symptom.)*
- **AC-3 (Springfield surfaces the capitals).** Feeding `springfield_us.json`, the admitted
  `candidates` include Springfield **IL**, **MO**, and **MA** (by `regionIso`
  `US-IL`/`US-MO`/`US-MA`) **alongside** the place-node survivors that pass today (VA). Count
  of admitted ≥ 12.

### 7.2 Accept-rule — false-positives rejected

- **AC-4 (county).** Feeding `neg_cook_county.json`, `candidates` is **empty** — no county
  admitted as a city.
- **AC-5 (state/region).** Feeding `neg_colorado_state.json`, `candidates` is **empty** — no
  `state`, `county`, or `river` admitted.
- **AC-6 (rank is not the discriminator — guard against a lazy fix).** A test asserts that
  Denver CO (`addresstype=city, place_rank=12`) is admitted **while** Cook County
  (`addresstype=county, place_rank=12`) is rejected — i.e. the rule cannot be satisfied by
  any `place_rank` threshold. This pins the *reason*, not just the outcome.

### 7.3 Edge cases

- **AC-7 (suburb rejected).** From `springfield_global.json`, no `addresstype=suburb` row
  (Chelmsford GB, QLD/NSW AU) appears in `candidates`.
- **AC-8 (census rejected, city kept, no dupe).** From `springfield_us.json`, Springfield VA
  appears **exactly once**, and it is the `type=city` row (finite coords), not the `census`
  row.
- **AC-9 (municipality admitted).** From `springfield_global.json`, the `addresstype=municipality`
  row ("Town of Springfield, WI") is present in `candidates`.

### 7.4 Both call sites

- **AC-10 (lookup path re-keyed).** `nominatimLookup` applies the same accept-rule: a fed
  admin-boundary `city` row (reuse a Denver row) is **admitted**, not dropped. If a `/lookup`
  fixture cannot be captured, the test constructs the row from a `/search` fixture row and
  documents that the `/lookup` `addresstype` presence is UNVERIFIED (§3.4).

### 7.5 BUG-74 contract

- **AC-11 (error distinct from empty).** When the underlying client returns `status:'error'`,
  `GET /api/geocode` responds **HTTP 200** with body `status:'error'`, `candidates:[]` — and
  a `status:'ok'` genuine-no-match responds **HTTP 200** with `status:'ok'`, `candidates:[]`.
  The two are distinguishable **by the `status` field** and only by it.
- **AC-12 (disabled distinct).** With `GEOCODING_ENABLED=false`, the response body is
  `status:'disabled'` (not `'ok'`).
- **AC-13 (additive/back-compat).** Existing `/api/geocode` consumers and fixtures that do
  not read `status` continue to type-check and pass — the field is additive.

**Definition of done:** AC-1…AC-13 green against the committed fixtures; `type:check:all`
clean; the shared `isAcceptedSettlement` predicate is the only admission gate at both
`nominatimSearch` and `nominatimLookup`; the mock-fidelity check (§7 preamble) is satisfied.

---

## 8. What this contradicts / amends in the existing record

- **ADL-48 §2.1/§15.1 — reinforced, with a caveat surfaced.** ADL-48 recommends keeping the
  geocoder to serve the coverage *tail* (Plockton et al.). That recommendation silently
  assumed the geocoder's accept-rule would *pass* what Nominatim returns. BUG-76 shows the
  accept-rule was itself dropping admin-boundary settlements — so "the geocoder serves the
  tail" rested on an unverified premise about this filter. This fix does **not** overturn
  ADL-48; it **removes a defect that would have partially undermined it** (a tail place
  modelled as an admin boundary would have been dropped). No ADL-48 decision is re-opened.
- **Tracker note (BUG-76, 2026-08-07) — fully consistent; one sharpening.** The note's
  "INFERRED, NOT PROVEN" hypothesis (SETTLEMENT_TYPES drops Denver) is now **proven** by the
  captured fixtures. The one addition the note did not carry: `place_rank` is an *attractive
  but wrong* discriminator (Denver and Cook County both rank 12) — the fixtures make this
  explicit and AC-6 guards against a future implementer "fixing" it with a rank threshold.
- **Nothing in D-21, ADL-46, or BUG-71 is re-decided.** BUG-71's copy ownership is respected
  (§6.3); BUG-79's `truncated`/limit choices are untouched (§5).

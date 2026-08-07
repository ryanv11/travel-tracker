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

> **CORRECTED DESIGN-OF-RECORD (2026-08-07, post-OP-27).** This design has been through
> OP-27 fresh-eyes review (`20260807-BUG76-accept-rule-design-OP27-review.md`) and its
> corrections — reconciled by the COO against **live Nominatim probes** — are folded in at
> **§9**. Where §9 supersedes a specific claim above, that claim carries an inline
> `> SUPERSEDED` stamp pointing to §9. **Read §9 for the current truth.** The single most
> important correction: **production stays on `format=json`** — the OP-27 review's C1
> conclusion to switch to `jsonv2` was wrong (jsonv2 returns `category`, breaking
> `parseCandidate`'s `raw.class` read); the real defect was that the *fixtures* were
> captured as jsonv2, and they have been replaced with the `format=json` set.

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

> SUPERSEDED (2026-08-07) by §9.8 — the `/lookup` `addresstype` question is **RESOLVED**,
> not unverified: the lookup call site (`nominatim-client.ts:256-258`) sets
> `addressdetails: '1'` identically to search, so `/lookup` returns `addresstype` too. The
> shared predicate applies cleanly at both sites. Retained for history.

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

> SUPERSEDED (2026-08-07) by §9.4–§9.6 — the ruling (reject) stands, but the **confidence
> is downgraded to reversible/tunable** (now grounded in four live CDP probes, not one
> in-fixture instance), `statistical` is added as a second rejected variant, and the dedup
> rationale below is **corrected** (it was circular/backwards; the affirmative reason is in
> §9.6). Retained for history.

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

> AMENDED (2026-08-07) by §9.9 — the ACs below run against the **`format=json`** fixtures
> (the committed fixtures were replaced from jsonv2; §9.1). §9.9 adds **AC-0** (assert the
> outgoing request URL carries `format=json&addressdetails=1` — the QUAL-22 mock-fidelity
> gate), **AC-8b** (Paradise NV: census relation rejected, town node twin admitted), and
> amends AC-8 (also `statistical`) and AC-10 (`/lookup` hedge removed).

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

---

## 9. CORRECTIONS FOLDED IN (2026-08-07, post-OP-27) — the corrected design-of-record

This section amends §§2–8 per the OP-27 fresh-eyes review
(`20260807-BUG76-accept-rule-design-OP27-review.md`) as reconciled by the COO against
**live Nominatim probes** (2026-08-07, firewall up). The text above is retained for
history; superseded claims carry inline `> SUPERSEDED`/`> AMENDED` stamps pointing here.
The corrections are settled — this is an incorporation, not a re-design, and did not go
through a second OP-27 pass.

### 9.1 Format fidelity — production stays on `format=json`; the *fixtures* were wrong, not the format (corrects OP-27 C1)

OP-27 C1 concluded the fix must switch production to `format=jsonv2`. **That conclusion is
wrong and must NOT be implemented.** Two probes with production's exact params
(`format=json&addressdetails=1` — the strings built at `nominatim-client.ts:214` and
`:256`) settle it:

- **`format=json&addressdetails=1` DOES return `addresstype`.** Denver→`city`, Cook
  County→`county`, Colorado→`state`. The C1 premise that `addresstype` is absent under
  `json` is false. *(Probe A: live capture of every committed fixture with these exact
  params — all carry `addresstype`. Probe B: the committed json fixtures on disk all carry
  `addresstype` **and** `class`, none carry `category` — two lines a single wrong
  assumption cannot both produce.)*
- **Switching to jsonv2 would BREAK `parseCandidate`.** It reads `raw.class` (`:294`);
  `format=json` returns `class`, `format=jsonv2` returns `category` instead — under jsonv2,
  `raw.class` is `undefined`. jsonv2 is not merely unnecessary; it is actively harmful.

**The genuine defect C1 detected, with the wrong cause diagnosed:** the *committed
fixtures* had been captured as `format=jsonv2` (carrying `category`, not `class`) while
production speaks `json` — a real QUAL-22 mock-fidelity gap. **Resolution: the fixtures are
replaced with the `format=json` set** (carrying `class`, `addresstype`, `address`),
captured/verified live against production's exact params. **No production request-shape
change is made by this fix.**

### 9.2 parseCandidate + mock-fidelity (implementation-binding)

- `parseCandidate` must additionally capture `addressType: raw.addresstype`. The accept
  predicate keys on `addressType` (§3.1) — the field is present under `json`.
- **Mock-fidelity clause (OP-35 / QUAL-22), corrected:** the ATDD suite must assert the
  **outgoing request URL contains `format=json` and `addressdetails=1`** (not `jsonv2`),
  and the test doubles must feed `parseCandidate` the raw `format=json` shape — an object
  carrying `class`, `addresstype`, and the `address{}` block — never a pre-parsed candidate
  stub. A suite that stubs already-parsed candidates, or that asserts `jsonv2`, specifies
  the wrong contract.

### 9.3 Verified accept-rule results under `format=json` (the committed fixtures)

Recomputed row-by-row against the json fixtures now on disk (rule: admit when
`addressType == null || addressType ∈ {city, town, village, hamlet, municipality}`):

| Fixture | Rows | Admitted | Notes |
|---|---|---|---|
| `denver_us.json` | 4 | **4** | 1 `city` + 3 `village`; Denver CO resolves |
| `springfield_us.json` | 20 | **19** | only the 1 `census` row dropped; a `city` twin (8 city rows present) survives |
| `springfield_global.json` | 36 | **31** | drops 3 `suburb` + 1 `county` + 1 `census` |
| `springfield_il.json` | 1 | 1 | canonical false-negative now admitted |
| `neg_cook_county.json` | 3 | **0** | all `county` |
| `neg_colorado_state.json` | 3 | **0** | `state`/`county`/`river` |
| `cdp_paradise_nv.json` | 2 | 1 | `census` relation dropped, `town` node twin admitted |
| `cdp_mclean_va.json` | 2 | 1 | `census` relation dropped, `town` node twin admitted |
| `cdp_bethesda_md.json` | 2 | 1 | `statistical` relation dropped, `city` node twin admitted |
| `cdp_silverspring_md.json` | 2 | 1 | `statistical` relation dropped, `city` node twin admitted |

### 9.4 census / statistical reject — data-grounded, reversible/tunable (corrects OP-27 C2; supersedes §4 D5 "High confidence")

D5's "High confidence" on a single in-fixture instance is **downgraded to
reversible/tunable**, matching D4 — and its grounding is now empirical:

- **Reject `addresstype ∈ {census, statistical}`.** `statistical` is a real variant D5 did
  not list; live probes found it on Bethesda MD and Silver Spring MD. Both are US
  statistical artifacts (CDP boundaries), not settlements.
- **Empirical grounding (four probes, not one):** the four highest-profile US CDPs —
  Paradise NV, McLean VA, Bethesda MD, Silver Spring MD — each returned a surviving
  `town`/`city` twin alongside the census/statistical row. Rejecting census/statistical
  therefore does **not** drop these places; the settlement twin resolves them.
- **Residual risk, stated honestly (OP-33):** four probes is not exhaustive. A
  *census-only* community — a CDP with no settlement twin in the same result set — could
  still be dropped. Hence reversible, with the correct widen specified in §9.5.

### 9.5 The reversibility knob is candidate-set-aware, not a blanket add (supersedes any "one-line widen" framing)

The knob is **not free in both directions.** A blanket "add census/statistical to the
accepted set" is one line but **reintroduces an un-dedupable duplicate for every place that
has both a statistical row and a settlement twin** (§9.6). Should UAT surface a genuinely
census-only destination being dropped, the correct widen is a **candidate-set-aware rule**:
admit a `census`/`statistical` row **only when no settlement-addresstype twin exists in the
same result set.** State it this way so no future reader flips it blindly.

### 9.6 Why reject census/statistical — dedup rationale corrected (corrects OP-27 C4; supersedes §4 D5's "interacts cleanly with dedup")

§4 D5's original rationale ("the accept-rule drops the census row before dedup ever sees
it… interacts cleanly with BUG-75's dedup") was **circular and factually backwards.** The
verified facts:

- The statistical row and its settlement twin have **different `(osm_type, osm_id)`
  identity** — the census/statistical row is a `relation`, the twin a `node`:
  Paradise NV `relation 170053` vs `node 3139480510`; McLean VA `relation 206832` vs
  `node 158521719`; Springfield VA `census relation 206834` vs `node 158396042`;
  Bethesda MD `relation 133482` vs `node 158248181`; Silver Spring MD `relation 133501`
  vs `node 158521614`. *(Verified against the committed fixtures.)*
- BUG-75 dedup keys on the carried `(osmType, osmId)`. Different identity → **dedup does
  NOT merge them.** Admitting both would produce a *visible, un-dedupable duplicate* — same
  place, two pickable rows.
- **This is the affirmative reason to reject `census`/`statistical` at the filter:** not
  "dedup handles it" (it cannot), but "admitting both yields a duplicate dedup cannot
  collapse, and the settlement twin already represents the place." Rejecting the statistical
  relation leaves exactly one correct pickable row.

### 9.7 Townships — explicit ruling: ADMIT (resolves OP-27 C3)

Under `format=json`, US townships carry `addresstype ∈ {town, city, village}` (e.g.
"Springfield Township, …, Pennsylvania" → `town`/`city`) and are therefore **admitted —
intentionally.** A township OSM tags with a settlement `addresstype` is a populated place;
admitting it is consistent with the "admit settlements, reject super-/sub-settlement units"
philosophy (far lower-harm than a county). A deliberate, low-harm inclusion — now ruled on
rather than left implicit. (This corrects the implied completeness of §3.2/§4: the township
class was not individually walked before; it is now. I have not re-walked *every* row of the
36-row global fixture and do not claim to — the settlement/non-settlement split there is
established by the §9.3 admitted-count reconciliation, not a per-row narrative.)

### 9.8 /lookup — UNVERIFIED gap RESOLVED (supersedes §3.4 UNVERIFIED)

The §3.4 "does `/lookup` return `addresstype`?" caveat is **resolved.** The lookup call
site (`nominatim-client.ts:256-258`) sets `addressdetails: '1'` **identically** to search —
same params, same response shape — so `/lookup` returns `addresstype` too. The shared
`isAcceptedSettlement` predicate applies cleanly at both sites with no per-site divergence.
A dedicated `/lookup` fixture is a nice-to-have, not required: the params are provably
identical by reading the two call sites.

### 9.9 Corrected acceptance criteria (amends §7)

The §7 ACs stand **except** that they run against the **`format=json`** fixtures (not
jsonv2). In addition:

- **AC-0 (format fidelity — NEW; the mock-fidelity gate).** The outgoing request URL built
  by `nominatimSearch` and `nominatimLookup` contains `format=json` and `addressdetails=1`.
  This is what makes the suite non-vacuous with respect to production — the QUAL-22 guard
  the jsonv2 fixtures silently defeated.
- **AC-8 (census/statistical), amended.** Covers both `census` and `statistical`. From
  `springfield_us.json`, Springfield VA appears exactly once — the `city` node, not the
  `census` relation.
- **AC-8b (CDP twin survives — NEW; Paradise fixture).** From `cdp_paradise_nv.json`, the
  `census` relation (osm_id 170053) is **rejected** AND the `town` node twin (osm_id
  3139480510) is **admitted** — the place still resolves. This turns the census/statistical
  ruling into tested behaviour.
- **AC-10 (lookup), amended.** The `/lookup` UNVERIFIED hedge is removed — `/lookup`
  returns `addresstype` (same params as search); the shared predicate applies at both sites.

**Definition of done (amended):** AC-0…AC-13 (incl. AC-8b) green against the committed
**`format=json`** fixtures; `type:check:all` clean; `parseCandidate` reads
`addressType: raw.addresstype`; the shared `isAcceptedSettlement` predicate keyed on
`addressType` is the only admission gate at both call sites; the AC-0 format assertion
holds; **no production request-format change.**

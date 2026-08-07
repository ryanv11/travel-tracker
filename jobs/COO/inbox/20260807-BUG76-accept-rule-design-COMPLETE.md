# BUG-76 accept-rule design — COMPLETE (Architect)

**Date:** 2026-08-07 · **Branch:** `feat/bug76-accept-rule-design` (NOT pushed/PR'd — your call)
**Design doc:** `jobs/architect/tech/20260807-BUG76-accept-rule-design.md` · **ADL:** ADL-51 (main log)
**Needs before dispatch:** OP-27 fresh-eyes (a 2nd, fresh Architect) → then ATDD-first (QA before Backend).

## 1. The accept-rule (one paragraph)
Key the settlement filter on **`addresstype`, not `type`**. `parseCandidate` currently records
`type = raw.type` (Nominatim's class-type, e.g. `administrative`) and the filter tests
`SETTLEMENT_TYPES.has(type)`; but prominent cities are OSM admin-boundary relations
(`type=administrative`, `addresstype=city`), so they are dropped. The fix captures `addresstype`
and admits `addresstype ∈ {city, town, village, hamlet, municipality}`, keeping the existing
"discriminator absent → admit" passthrough. **`addresstype` is the chosen discriminator because it
is the only one that separates a city from a county in the captured data**: `place_rank` does NOT —
Denver CO (`city`) and Cook County (`county`) are **both `place_rank=12`** — and `admin_level` is
not in our response payload. One shared predicate applies at **both** call sites (`nominatimSearch`
:230 and `nominatimLookup` :267 — the bug is present at both). Against the fixtures this admits all 4
Denvers and the famous Springfields (IL/MO/MA/OH) while admitting **zero** rows from the county/state
negative fixtures.

## 2. Edge-case + discovery rulings
- **`suburb` → REJECT.** Sub-municipal granularity; admitting it reintroduces the noise the filter
  exists to suppress. Marked **reversible/tunable** (Medium confidence) — if UAT finds a real
  destination OSM models *only* as `suburb`, adding it is a one-line change; the success criteria pin
  the reject so a future widen is deliberate, not drift.
- **`census` → REJECT.** A US Census-Designated-Place artifact. In-fixture (Springfield VA) it
  duplicates a real `city` row, so rejecting it surfaces no new place and avoids a duplicate. VA still
  appears exactly once.
- **`municipality` → ADMIT** (already in the set; confirmed by a real WI town in the fixture).
- **Country-constrain the discovery query → NO.** Structurally impossible (the discovery call's *job*
  is to discover the country) and product-wrong for an international travel app; the grab-bag concern
  is already mitigated by BUG-79 (limit 40 + `truncated`) + D14, and further by this fix. Independent
  of the accept-rule; **do not bundle**.

## 3. BUG-74 contract
Add **`status: 'ok' | 'error' | 'disabled'`** to the `/api/geocode` response body (mirrors the
`NominatimSearchResult` union the route currently *discards* at `geocode.ts:86`). **HTTP stays 200 in
all cases**; `candidates:[]` is meaningful only under `status:'ok'`. This makes the three states
distinguishable: upstream-failed (`status:'error'`), disabled (`status:'disabled'`), genuine no-match
(`status:'ok'` + empty). Rejected the 502/503 alternative because a non-2xx collapses "our backend
down" and "upstream down" into one signal. The field is **additive/backward-compatible** (existing
consumers ignore it). Backend adds the field (this fix); the **frontend half** (map `error`/`disabled`
→ `failed:true` in `lookupCityCountry`) is BUG-74's closing piece; the **three-state copy stays
BUG-71's** per its tracker note. An optional future `nonSettlementOnly` flag ("Colorado is a state,
not a city") is noted but explicitly out of scope for the P1.

## 4. Success-criteria checklist (the ATDD spec)
13 acceptance criteria (AC-1…AC-13), each written against the committed fixtures, in design doc §7.
Headlines, all your brief's required asserts covered:
- **AC-2** Denver `GET /api/geocode?q=denver` → `country_code=US`, `region_iso=US-CO` (the PO symptom).
- **AC-3** Springfield surfaces IL/MO/MA alongside today's place-node survivors (≥12 admitted).
- **AC-4/AC-5** Cook County and Colorado → **0 candidates** (no county/state as a city).
- **AC-6** guards a lazy `place_rank`-threshold fix (Denver-12 admitted while county-12 rejected).
- **AC-7/8/9** suburb rejected / census rejected + city kept once / municipality admitted.
- **AC-10** lookup path re-keyed (with the `/lookup`-addresstype UNVERIFIED caveat).
- **AC-11/12/13** error-vs-empty-vs-disabled distinguishable by `status`; additive back-compat.
- Preamble carries the **mock-fidelity requirement** (OP-35/QUAL-22): the `fetchNominatim` double must
  return the *exact captured JSON* and feed `parseCandidate` the raw shape — no pre-parsed stubs.

## 5. Branch + what's committed
Branch `feat/bug76-accept-rule-design`. Committed: the design doc, ADL-51 (main log), the architect
context block, this report, and **the 7 real Nominatim fixtures** (denver_us, denver_unconstrained,
springfield_us/global/il, neg_cook_county, neg_colorado_state) + README + capture-analysis at
`src/backend/services/__tests__/fixtures/nominatim/bug76/`. **Fixtures ARE committed** (they must be on
`main` before QA's ATDD step; firewall may not recover). No source code changed — design + fixtures
only, per the brief. `type:check:all` clean (no code touched, fixtures are JSON/MD).

## 6. Contradictions with the record
- **Nothing contradicts the tracker note** — its "INFERRED, NOT PROVEN" SETTLEMENT_TYPES hypothesis is
  now **proven** by the captured fixtures. One **sharpening the note lacked**: `place_rank` is an
  attractive-but-wrong discriminator (Denver and Cook County both rank 12); AC-6 guards it.
- **ADL-48 §2.1/§15.1 is reinforced, not contradicted** — but note the caveat: "the geocoder serves
  the tail" silently assumed the accept-rule *passes* what Nominatim returns; BUG-76 shows it was
  dropping admin-boundary settlements. This fix removes that defect; no ADL-48 decision is re-opened.
- **One UNVERIFIED item you should carry into the brief:** whether the `/lookup` response includes
  `addresstype` (no `/lookup` fixture — firewall). The null-passthrough makes the rule correct either
  way; design §3.4 states the probe and blind spot. Ask the implementer to capture a `/lookup` fixture
  if the firewall is up.
- **No new BRD requirement ID** is introduced by this design — but per the standing BRD-gate rule,
  confirm BUG-76/BUG-74 have a BRD home (or add one) before dispatching the implementation brief.

# BUG-76 accept-rule design — OP-27 fresh-eyes review

**Date:** 2026-08-07
**Reviewer:** Architect (second, fresh dispatch — OP-27)
**Design under review:** `jobs/architect/tech/20260807-BUG76-accept-rule-design.md` (branch
`feat/bug76-accept-rule-design`), ADL-51, and the 7 Nominatim fixtures under
`src/backend/services/__tests__/fixtures/nominatim/bug76/`.
**Mandate:** critique and stress-test, not confirm. Assume a flaw exists; find it.

---

## VERDICT: SAFE TO BUILD WITH CORRECTIONS

One of the corrections (C1) is a **hard blocker**: the design as written is not merely
incomplete, it would ship a *regression that admits counties/states/rivers as cities* while the
ATDD suite shows green. It is fully correctable with a specific, concrete change, so this is not
a redesign — but C1 is mandatory and the ATDD gate that should catch it is blinded by the same
defect, so it must be called out explicitly to the implementer, not left as a footnote.

The core architectural thesis — **key the filter on `addresstype`, not `type`, because `type`
and `place_rank` cannot separate a city from a county** — is **correct and well-evidenced**. The
fixtures bear it out row by row. The design fails on a *precondition it never states*: the field
it keys on does not exist in the response format the production code actually requests.

---

## Findings, ranked by severity

### C1 — BLOCKER. The fix keys on `addresstype`, but production requests `format=json`, which does not return `addresstype`. As written, the fix admits every county/state/river as a city, and the ATDD suite is green while production is broken (QUAL-22, exactly).

**The mismatch, verified by two independent probes:**

- **Probe A — the fixtures are `format=jsonv2`.** `README.md:6,11` state the captures used
  `format=jsonv2&addressdetails=1`. The field-name union across all 71 fixture rows is
  `{address, addresstype, boundingbox, category, display_name, importance, lat, licence, lon,
  name, osm_id, osm_type, place_id, place_rank, type}` — it carries `category`, `addresstype`,
  `place_rank`, top-level `name`, and **no `class`**. That is the documented **jsonv2** shape.
- **Probe B — production requests `format=json`, and `json` carries `class`+`type`, not
  `addresstype`.** `nominatim-client.ts:214` (`nominatimSearch`) and `:256` (`nominatimLookup`)
  both send `format: 'json'` — there is no `jsonv2` anywhere in `src/backend` (grep). The
  pre-existing test doubles that model a real `format=json` row —
  `nominatim-client.test.ts:29-30` (`class: 'place', type: 'city'`) and
  `geocoding.service.test.ts:267-268, 422-423` (same) — carry `class`+`type` and **no
  `addresstype`**. Two independent lines (README/fixtures + code/existing-mocks) that a single
  wrong assumption cannot both produce.

**Why this is fatal as written.** The design (§2, §3.1) frames `addresstype` as "a field
`parseCandidate` never captured" — implying it is present in the response and merely unread. It
is not present under `format=json`. If the implementer follows the design literally ("capture
`raw.addresstype`, key on it, keep everything else the same"), then on every real production row
`raw.addresstype === undefined`, so the retained passthrough clause `c.addressType == null`
evaluates **true for every candidate** — the filter admits **everything**, including Cook County,
Colorado (the state), and the Colorado River. That is **strictly worse than the current bug**:
today the `type`-keyed filter at least drops non-settlements; the new rule under `format=json`
drops nothing.

**Why the ATDD gate does not catch it.** The 13 ACs run against the **jsonv2** fixtures, which
*do* carry `addresstype=county` on the negative rows, so AC-4/AC-5 (counties/states rejected)
pass **green** against the fixtures — while production, speaking `json`, admits those same
counties. This is the QUAL-22 / OP-35 mock-fidelity failure the README explicitly claims to
defeat: the double does not behave like the real dependency. The design's own §7 preamble
demands "the double must feed `parseCandidate` the same shape the real `fetch(...).json()` does"
— taken seriously, that rule is **impossible to satisfy with these jsonv2 fixtures while the
request stays `format=json`**, which is precisely the tell.

**Why `type`/`class` cannot rescue it under `json`.** The design already proved `type` cannot
discriminate: under `json` a city-boundary and a county-boundary are *both* `class='boundary',
type='administrative'`. So there is no in-`json` field that separates Denver from Cook County —
which is *why* the captures were taken in jsonv2 in the first place. The fix therefore **requires**
jsonv2; it is not optional.

**Required correction (C1):** The fix MUST change the request from `format=json` to
`format=jsonv2` at **both** `nominatimSearch` (`:214`) and `nominatimLookup` (`:256`), and this
must be stated in the design as a load-bearing, mandatory step — not discovered by the
implementer. Additionally:
- The `§7` mock-fidelity check must **assert the production request string contains
  `format=jsonv2`** (e.g. capture the URL the client builds and assert on it), not merely that
  the mock returns the captured bodies. Without this assertion the suite passes vacuously.
- `parseCandidate`'s other reads are safe under jsonv2 — `lat/lon/osm_type/osm_id/display_name/
  address{country_code, ISO3166-2-lvl4, county, state_district}` are identical between `json`
  and `jsonv2`, and jsonv2 always supplies top-level `name` (present on all 71 rows), so the
  `raw.name ?? display_name.split(',')` fallback still holds. `geocoding.service.ts` consumes
  only `regionIso/countryCode/latitude/longitude/osmType/osmId/displayName/name` (grep) — none
  json-vs-jsonv2 sensitive — so the batch path is unaffected. **This must be verified by the
  implementer, not assumed**, but I found no blocker in it.
- The pre-existing `format=json`-shaped mocks (`nominatim-client.test.ts:29`,
  `geocoding.service.test.ts:267,422`) must be reconciled with the format switch, or explicitly
  left as-is with a note that they exercise the passthrough (`class/type` present, `addresstype`
  absent → `c.addressType == null` → admit), which is the intended legacy-caller behaviour.

### C2 — HIGH. `census` → REJECT is marked "High confidence" on a single positive instance; it silently drops a whole class of real US destinations (CDP-only places). The BUG-76-shaped hole, repeated.

D5 rejects `addresstype=census` and rates it **High confidence**, versus D4's `suburb` reject
which is (correctly) marked **reversible/tunable**. The asymmetry is **backwards** — `census`
has a *larger* real-destination false-negative surface than `suburb`.

- **The confidence rests on one in-fixture instance.** The *only* census row in the fixtures is
  Springfield, VA (`springfield_us[8]`), which happens to be paired with a real `city` row
  (`springfield_us[9]`). D5 generalizes "always a statistical artifact, never a civic
  settlement" from that single pair. This is the exact OP-33 anti-pattern this project's
  CLAUDE.md names: *"BUG-76 closed on one positive instance, reopened at P1 when Denver disproved
  it."* Rejecting `census` as "always an artifact" repeats the move.
- **Concrete failure mode, identical to the bug being fixed.** Many populous, real US
  destinations are unincorporated **Census Designated Places** that OSM may model *only* as a
  census boundary with no `place=city/town/village` twin — e.g. Paradise NV (the Las Vegas
  Strip), Bethesda MD, Silver Spring MD, McLean VA, Reston VA. If a user logs one of these and
  Nominatim returns a census-only row, this rule returns **zero candidates** — the precise
  BUG-76 symptom, now for CDPs. **UNVERIFIED** (the firewall blocks a live Nominatim probe for
  these queries; the fixtures contain no census-only place). Probe run: field/row inspection of
  all 7 fixtures — blind spot: no CDP-only query was captured, so I cannot confirm OSM returns
  census-only for these places, only that the design's "always a dup" premise is unproven beyond
  Springfield VA.
- **The stated dedup rationale is shaky (see C4) and should not prop up "High confidence."**

**Required correction (C2):** Downgrade D5 to **reversible/tunable**, matching D4's treatment
and language. Either (a) when the firewall permits, capture a CDP-only query (e.g.
`q=Paradise, Nevada`, `q=Bethesda`) and confirm a settlement still resolves — if it returns
census-only, `census` must be **admitted**, not rejected; or (b) if left as reject, record
"CDP-only destinations are a known coverage gap of the BUG-76 accept-rule" as an explicit
UNVERIFIED risk in the design and a tracker note, so it is not a silent BUG-76-shaped hole
waiting to be reopened at P1.

### C3 — MEDIUM. Townships are admitted but never ruled on; the "walked every row" completeness claim is overstated.

`springfield_us[17]` ("Springfield Township, Delaware County, Pennsylvania", `addresstype=town`)
and `springfield_global[17]/[22]` ("Springfield Township, …, Pennsylvania", `addresstype=town`
/ `city`) are **admitted** under the rule. A US township is a civil administrative division, not
necessarily a destination "city." Admitting it is defensible (far less harmful than admitting a
county, and townships are populated), so this is **not a blocker** — but the design claims to
have walked every fixture row and ruled on the edge cases (§3.2, §4), and it never mentions the
township class at all. The completeness claim is not fully honoured.

**Suggested correction (C3):** Add a one-line ruling — recommend **admit** (consistent with the
"admit settlements, reject super-/sub-settlement units" philosophy) — and note townships are an
accepted, low-harm inclusion so a future reader knows it was considered, not missed.

### C4 — MEDIUM. D5's dedup justification is partly circular and factually shaky; do not cite it as a "clean interaction."

D5 says rejecting `census` "avoids a duplicate VA row (the census + city pair would otherwise
both show)" and "interacts cleanly with BUG-75's dedup: the accept-rule drops the census row
before dedup ever sees it." Two problems:
- **Circular.** The census row would "both show" only if `census` were *admitted*. It is not in
  the settlement set under either the old or new rule, so the duplicate never arises *from this
  rule*. Rejecting census "to avoid a dup" describes avoiding a problem the rule itself would
  have to create first.
- **The "dedup would otherwise handle it" framing is false.** The census relation
  (`osm_id 206834`, `osm_type relation`) and the city node (`osm_id 158396042`, `osm_type node`)
  are **different identities**. BUG-75 dedup is identity-based (`osmType`+`osmId`), so it would
  **not** merge them — the two would appear as two distinct pickable entries if both were
  admitted. So census-reject is doing real work to suppress a *visible* duplicate; it is *not* a
  clean hand-off to dedup.

This does not change the ruling, but the rationale as written is wrong and should not be used to
justify "High confidence." (This finding reinforces C2: the honest statement is "we reject
census to suppress a duplicate for places that have a city twin, at the cost of dropping
CDP-only places — a tunable trade-off," not "census is always an artifact.")

---

## Claims that survived the attack (verified, not rubber-stamped)

- **The `addresstype` thesis is correct.** Row-by-row against all 7 fixtures: every settlement
  carries `addresstype ∈ {city, town, village, hamlet, municipality}`; every non-settlement
  carries `state/county/river`. `springfield_global` admits 31/36 and drops exactly the 3
  `suburb` + 1 `county` + 1 `census` the design claims; both negative fixtures admit **0**.
  The "Rural **Municipality** of Springfield, Manitoba" trap (`addresstype=county`, name says
  "Municipality") is correctly rejected — `addresstype` beats name heuristics, as claimed.
  **All of this is true only when the response is jsonv2 (C1).**
- **`place_rank` genuinely cannot discriminate.** Denver CO and Cook County are both
  `place_rank=12` (verified). AC-6, which pins the *reason* (rank-threshold-proof), is the
  strongest AC in the set and correctly guards against a lazy re-implementation.
- **`addresstype` is present on every fixture row (71/71).** The "discriminator absent →
  passthrough admits a county" hole does **not** manifest in the `/search` fixtures — *provided
  the request is jsonv2*. Under `format=json` the passthrough hole becomes universal (C1).
- **The `/lookup` UNVERIFIED reasoning is sound — it survives.** The BUG-75 picker only offers
  post-filter settlements, so a user cannot pick a non-settlement; `/lookup` then canonicalizes a
  settlement pick whose `addresstype` is a settlement value (jsonv2) or absent → admitted either
  way. Safe to ship UNVERIFIED. (Note: `/lookup` also uses `format=json` today, so under C1 it
  too returns no `addresstype` and passes everything through — benign for a by-id lookup, but it
  must still move to jsonv2 for consistency and so `nominatimSearch` works.)
- **BUG-74 contract is sound and cleanly separable.** `status: 'ok'|'error'|'disabled'` covers
  the client union exhaustively; the route already always returns HTTP 200 (`geocode.ts:98`), so
  adding `status` is genuinely additive and breaks no existing consumer or monitoring assumption.
  Deferring the frontend `failed:true` mapping leaves a **safe** half-state: an upstream error
  still shows today's (no-banner) behaviour — no regression — and the P1 is closed by the
  accept-rule alone, independent of the BUG-74 half. Scope split is correct.
- **D7 (do not country-constrain discovery) is correct.** The discovery lookup runs *to
  discover* the country, so constraining it is circular; a hard `countrycodes` filter would break
  foreign-city logging. Keeping it out of the BUG-76 fix is right. (Minor: `denver_us.json` and
  `denver_unconstrained.json` are byte-identical, so they do not independently exercise the
  constrained path — the design does not over-rely on them, so this is a non-issue.)

---

## The meta-point

Every AC in §7 is non-vacuous *against the jsonv2 fixtures* — but the whole suite is vacuous
*with respect to production* until C1 is fixed, because it exercises the wrong response format.
The design reasoned entirely from jsonv2 captures without noticing the code speaks `json`; the
fixtures and the runtime disagree, and the ATDD gate is built on the fixtures. That is the single
thing a careless build here must not get wrong, and the design as written walks straight into it.
Fix C1 (and make the mock-fidelity assertion catch it), address C2, and this is a clean,
well-argued, buildable fix.

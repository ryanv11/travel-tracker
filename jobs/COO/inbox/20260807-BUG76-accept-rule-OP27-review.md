# OP-27 fresh-eyes review — BUG-76 accept-rule design

**From:** Architect (second, fresh dispatch)
**Date:** 2026-08-07
**Branch:** `docs/bug76-op27-review` (review doc at
`jobs/architect/tech/20260807-BUG76-accept-rule-design-OP27-review.md`) — NOT merged.

## Verdict: SAFE TO BUILD WITH CORRECTIONS
Core thesis (key on `addresstype`, not `type`/`place_rank`) is correct and row-by-row
evidenced. But one correction is a **hard blocker** — without it the fix ships a regression
with a green ATDD suite. Do not dispatch the implementation brief until C1 and C2 are folded
into the design.

## Flaws found, ranked

**C1 — BLOCKER (QUAL-22, decisive).** The fix keys on `addresstype`, but production requests
`format=json` (`nominatim-client.ts:214` search, `:256` lookup), and `format=json` does **not**
return `addresstype` — it returns `class`+`type`. The captured fixtures are `format=jsonv2`
(README:6,11), which is *why* they carry `addresstype`. Two independent probes:
- Fixtures carry `category`/`addresstype`/`place_rank`/`name` and **no `class`** across all
  71 rows = documented jsonv2 shape.
- Code sends `format:'json'` (grep: no `jsonv2` in `src/backend`); pre-existing mocks
  (`nominatim-client.test.ts:29`, `geocoding.service.test.ts:267,422`) model json as
  `{class:'place', type:'city'}` with no `addresstype`.

Consequence if built literally: under `json`, `raw.addresstype` is `undefined` on every row, so
the retained passthrough `c.addressType == null` admits **everything** — Cook County, Colorado
state, Colorado River included. **Strictly worse than the current bug.** And the 13 ACs run
against the jsonv2 fixtures, so AC-4/AC-5 (reject counties/states) pass **green** while
production admits them — the exact mock-fidelity failure the README claims to defeat. `type`
cannot rescue it (city-boundary and county-boundary are both `type=administrative` under json —
which is why jsonv2 was captured). **Required fix:** switch both call sites to `format=jsonv2`,
state it as load-bearing in the design, and make the §7 mock-fidelity check assert the request
URL contains `format=jsonv2` (else the suite is vacuous). Other `parseCandidate` reads and
`geocoding.service.ts` are json/jsonv2-insensitive — safe, but implementer must verify.

**C2 — HIGH (UNVERIFIED, firewall).** `census`→REJECT is rated "High confidence" on a single
in-fixture instance (Springfield VA, which has a `city` twin), while the milder `suburb` reject
is (correctly) marked reversible. Backwards: CDP-only real destinations (Paradise NV = the Vegas
Strip, Bethesda MD, McLean VA) may be modelled census-only in OSM → this rule returns zero
candidates for them = the BUG-76 symptom, repeated. This is the OP-33 "closed on one positive
instance" pattern that already bit BUG-76 once. **Required fix:** downgrade D5 to
reversible/tunable; either verify a CDP-only query when firewall permits (admit `census` if it
returns census-only) or record the CDP coverage gap as an explicit UNVERIFIED risk + tracker
note. Probe blind spot: no CDP-only query in the fixtures; I could not hit live Nominatim.

**C3 — MEDIUM.** Townships (`Springfield Township, PA`, `addresstype=town`/`city`) are admitted
but never ruled on; the design's "walked every row" claim is overstated. Recommend adding an
explicit **admit** ruling (low-harm). Not a blocker.

**C4 — MEDIUM.** D5's dedup rationale is circular ("avoids a dup" that only exists if census is
admitted) and factually wrong ("dedup would otherwise handle it" — the census relation and city
node have different `osmType`/`osmId`, so BUG-75 identity-dedup would NOT merge them). Doesn't
change the ruling but shouldn't be cited to justify "High confidence." Reword.

## Claims that survived attack
- `addresstype` thesis correct row-by-row (31/36 global admits match; both negatives admit 0;
  the "Rural Municipality … `addresstype=county`" name-trap correctly rejected) — **but only
  under jsonv2 (C1)**.
- `place_rank` genuinely non-discriminating (Denver CO & Cook County both rank 12); AC-6 is the
  strongest AC and guards a lazy rank-threshold fix.
- `/lookup` UNVERIFIED passthrough reasoning is **sound** — picker only offers post-filter
  settlements, so a non-settlement can't be picked; safe to ship UNVERIFIED.
- BUG-74 contract sound & cleanly separable — HTTP 200 already the norm, `status` additive,
  frontend deferral leaves a safe no-regression half-state, P1 closed by accept-rule alone.
- D7 (don't country-constrain discovery) correct.

## Bottom line for dispatch
Fold C1 (blocker) and C2 into the design before the implementation brief goes out. C1 also means
the ATDD brief's mock-fidelity clause must assert `format=jsonv2` in the outgoing request, or the
gate is blind to the one thing that matters here.

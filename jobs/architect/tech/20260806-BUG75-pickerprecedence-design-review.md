# OP-27 fresh-eyes review — BUG-75 picker-precedence + UX-12 entry-point design

**Reviewer:** Architect (second, fresh context) · **Date:** 2026-08-06
**Under review:** `jobs/architect/tech/20260806-BUG75-pickerprecedence-and-ux12-entry.md` (PR #411, docs-only)
**Branch:** `review/bug75-pickerprecedence-design`
**Tracker:** BUG-75 (P1), UX-12 (P1) · **Requirement:** GE-16 (§5.2)
**Mode:** Adversarial. I was told to attack the design and not rubber-stamp it. Findings below are each
backed by a probe (code read / test read / tracker read / live probe), not an opinion.

---

## VERDICT

**SAFE TO BUILD WITH CORRECTIONS. Do NOT restart.**

The design's core is verified-correct against shipped code: the diagnosis (region-first pre-empts the picker
for spanning-region names → silent wrong pin) reproduces by reading `AddPlaceFlow.tsx:395-409` plus the
shipped `AddPlaceFlow.city-picker.test.tsx` fixture, and the fix (make the picker primary on positive
`osm_id` evidence) is a sound, minimal reorder. The D11 re-point reuse claim is **fully verified and already
test-backed**. The ATDD markings are correct and the mock-fidelity requirement is real.

The corrections are **spec-tightenings, not approach failures** — none invalidate the composition. Two MAJOR
items must be resolved in the build briefs before dispatch (they are drift-safety and scope-completeness
holes the design left open, not wrong decisions), and one build BLOCKER exists for a single acceptance
scenario (the Springfield ATDD fixture cannot be authored faithfully until a real Nominatim response is
captured — the design already says this; I am escalating it from "note" to "gate").

**Counts: 0 blocking-to-the-design · 2 MAJOR · 1 build-blocker (AC-scoped) · 4 MINOR.**

---

## What I verified as CORRECT (so the COO knows what NOT to re-litigate)

| Claim | Probe | Result |
|---|---|---|
| The defect: region branch pre-empts picker for spanning-region names | Read `AddPlaceFlow.tsx:395-409` — `sameCountryRegionIsos.length > 1` is the **first** `if`, mutually exclusive `else if` to the picker | **CONFIRMED.** Spanning-region set can never reach the picker branch on `main`. |
| The shipped picker test hid it via a same-region fixture | Read `AddPlaceFlow.city-picker.test.tsx:95-116` — `sameRegionNewports()` is **both GB-ENG** (IoW + Telford), so `sameCountryRegionIsos.length == 1`, picker fires, test green — spanning path never exercised | **CONFIRMED** — matches the tracker note ("omitted Newport Wales... went green while missing the spanning-region reality"). |
| Newport is ambiguity *both between and within* regions; Springfield is *between only* | Tracker: live capture "2 GB-ENG + 2 GB-WLS", "TWO NEWPORTS IN THE SAME REGION (Isle of Wight vs Telford)"; ADL-48 "Springfield... 21 rows, 21 distinct region groups" | **CONFIRMED** — the structural asymmetry is the load-bearing finding and it holds on evidence independent of live Nominatim. |
| The reorder is minimal (render keys off which state var is set) | Read `AddPlaceFlow.tsx:639-716` — the picker-vs-region render already branches on `placePickerCandidates` vs `candidateRegionIsos`; only `handleOpenNewCityForm`'s branch order changes | **CONFIRMED** ~3-line reorder in the decision; the extraction is separate. |
| D11 re-point present on `main` (city_id) | Read `places.schemas.ts:30-36` (`city_id` optional on `UpdatePlaceDatesSchema`), `places.ts:155-208` (validates city exists → 404, calls `updateDates(...,city_id)`), `repositories/places.ts:228-263` (only updates `tripPlaces` row) | **CONFIRMED — and stronger than the design states:** `place-repoint.test.ts:83-159` already asserts items + activity tags survive a re-point. AC-10 is pre-covered by an existing backend test. |
| §6.4 completeness (no case where region `<select>` *should* win over positive `osm_id` evidence) | Reasoned over the branch conditions: distinct `osm_id` == distinct real OSM objects, strictly more granular than region; collapsing to region is never *more* correct | **CONFIRMED on correctness.** The only cost is ergonomic (list length = Target 1), not correctness. |

---

## Independent ruling — Target 1 (is a flat ~20-row Springfield picker acceptable, or must in-picker grouping enter MVP?)

**I CONCUR with the author: flat is acceptable for MVP; in-picker region grouping is correctly deferred.**
I attacked this and it held. My independent reasoning (not a restatement of the author's):

- The flat picker is **functional, not broken**, for Springfield. The `CityPicker` renders each candidate's
  region-qualified `display_name` (verified: `CityPicker.tsx:70-80` renders `{candidate.display_name}`), so
  every row is individually distinguishable and independently selectable. Nothing is silently collapsed —
  which is the entire correctness bar GE-16 sets.
- Pulling grouping into MVP **enlarges a P1 fix for the non-broken case** at the cost of shipping the
  broken-case fix (Newport) later. That is structurally the same mistake that produced the bug (optimising
  the un-broken case). The author names grouping as a bounded, non-blocking enhancement gated on real UAT
  pain — that is the right lifecycle.

**One MINOR caveat the build must carry (not a reason to change the decision):** for Springfield
*specifically*, the reorder trades a native `<select>` (type-to-jump on a short state token) for a linear
scan of ~20 long `display_name` strings whose discriminating token (the state) sits **mid-string** after a
varying county (`"Springfield, Sangamon County, Illinois, United States"`). This is a genuine, if minor, UX
regression for that one case. It does not block, but Brief B / UAT should watch for it, and it is the concrete
trigger that would promote the deferred grouping. Recorded as MINOR-4.

## Independent ruling — Target 2 (is captured-analogy + UNVERIFIED acceptable for a DESIGN doc, or a build blocker?)

**Acceptable for the DESIGN. NOT acceptable for one of the acceptance scenarios it spawns — that is a build
BLOCKER, escalated below.**

- I re-ran the live probe myself (negative-findings rule — I did not inherit the author's claim):
  `curl https://nominatim.openstreetmap.org/status` → **`curl (7) Failed to connect ... port 443`** after
  ~4s. Nominatim is unreachable for me too. **Blind spot of my probe:** a single `curl` to one host; I did
  not independently re-verify the allowlist config (the author's second probe) — so my corroboration is
  one probe, and the "firewall regressed, needs rebuild" diagnosis is inherited, not re-established by me.
- For the **design decision**, the UNVERIFIED marker is honest and sufficient: the decisive structural
  finding (Springfield is between-region-only) rests on **ADL-48's dataset analysis**, which is independent
  of a live Nominatim capture, and the `display_name` shape is verified verbatim from the captured Newport
  `/lookup` rows. The decision does not hang on the missing Springfield strings.
- **Build BLOCKER (AC-scoped), see below:** AC-3 (Springfield many-region) cannot be written as a *faithful*
  red ATDD test against an *invented* fixture — that would reproduce exactly the QUAL-22 vacuous-pass class
  the design is trying to prevent. AC-3's fixture must be a **real captured Nominatim Springfield response**,
  which requires the container rebuild first.

---

## Findings

### MAJOR-1 — Drift-prevention is under-scoped: the identity-carry mapping is the highest-risk drift surface and is NOT actually shareable as "reused unchanged"

**The design's §9 extracts the precedence *decision* (`decideCityDisambiguation`) but leaves the
candidate→city creation (`handleSelectPickerCandidate`) as "reused unchanged" (§1 reuse table).** That is not
possible as stated, and it leaves the exact defect surface un-shared:

- `handleSelectPickerCandidate` (`AddPlaceFlow.tsx:295-321`) is a **component-local function** inside
  `AddPlaceFlow`. A separate `ChangeCityModal` component **cannot** "reuse it unchanged" — to be used by two
  components it must be **lifted** (extraction), which the design does not call out. "Reused unchanged" is
  overstated for this piece.
- This function is where the **identity carry** lives: it derives `region_id` from the pick's `region_iso`
  via the seeded map and forwards `{osm_type, osm_id, display_name}` into `POST /api/cities`
  (`:299-313`). **A drift *here* re-introduces precisely the BUG-75/identity defect** (e.g. Change-city
  forgets to forward `osm_id`, or derives `region_id` from a stale selector). The design's drift-prevention
  covers the *which-control* decision but leaves the *what-identity-do-we-persist* mapping to be
  re-implemented by Brief B.
- **The design under-scopes relative to its own cited source.** UX spec §12.1 (which the design says it
  "adopts") already mandates extracting the **search step** — "city search + the new-city
  name/country/region form, **extracted into a shared component**." That is the create surface, not just the
  decision. The design's §9 shared unit is narrower than the UX spec it adopts.

**Reviewer-specified fix:** The shared unit (`useCityDisambiguation`, or a sibling helper) must own the
**candidate→`CreateCityData` mapping and the `POST /api/cities` find-or-create**, handing each caller's
`onResolved` a **resolved `city_id`** (not a raw candidate). Then AddPlace's `onResolved` creates a place and
Change-city's `onResolved` PATCHes `city_id` — and the identity carry (osm forwarding + `region_id`
derivation) exists in exactly one place. Brief A must perform this extraction; Brief B must be pure
consumption. Add an explicit acceptance criterion: *"the candidate→city identity carry
(`osm_type`/`osm_id`/`display_name` + `region_id` derivation) is defined once and consumed by both flows; no
second copy exists in `ChangeCityModal`."*

### MAJOR-2 — The design adopts UX spec §12 MVP but is silent on two items §12 marks "stays in, NOT deferred"

§8 says *"UX spec §12 MVP scopes this precisely and I adopt it"* and then enumerates only the **§11** items as
deferred. But **§12.2 lists two items as explicitly MVP-included and non-deferred** that neither Brief A nor
Brief B covers:

1. **§12.2 #3 — §3.2's rule: never silently auto-commit a country.** I checked the current code: the country
   *is* still silently auto-committed — `AddPlaceFlow.tsx:360` `if (countryCode) setNewCityCountryCode(countryCode)`,
   and the only "Suggested:" tentative treatment is on the **region** (`regionIsSuggested`), never the
   country. So §3.2 appears **unimplemented**, and the UX spec marks it *"stays in, not deferred"* because it
   *"prevents Case 4's confidently-wrong-result class."* Probe scope: I did not exhaustively trace every
   country-set path; this is "grep + read of the one auto-set site," so treat "unimplemented" as
   **strongly-indicated, not two-probe-established** — the point stands either way because the design owes a
   disposition.
2. **§12.2 #4 — §3.4's creation-time messaging.** Also unaddressed by either brief.

I searched the tracker for a separate home for §3.2/§3.4 (the country-suggestion rule) and found none — so
"it's tracked elsewhere" is not currently supported.

**Reviewer-specified fix:** Before dispatch, the design must state the **disposition** of §12.2 items 3 & 4:
either fold them into Brief B's scope (they are cheap frontend-only changes with no backend dependency, per
the UX spec), or record an explicit, justified exclusion with a tracker home. A design that "adopts §12" while
silently dropping two of §12's non-deferred items is the classic lifecycle-drop shape (a scope item nobody
builds because no brief names it). This is a scope-reconciliation call for COO/UX, not a design-internal fix —
hence MAJOR (must resolve pre-dispatch), not blocking-to-the-approach.

### BUILD-BLOCKER (AC-scoped) — AC-3 (Springfield) cannot be authored as a faithful red test until a real Nominatim response is captured

Not a defect in the design's *decision*, but a hard gate on Brief A's ATDD. AC-3 asserts a Springfield
many-region set produces `mode: 'picker'` with `row count == candidate count` and distinct region qualifiers.
If QA authors that fixture from an **invented** Springfield shape, the test specifies nothing real — the exact
QUAL-22 vacuous-pass the design elsewhere forbids. The Springfield `display_name` strings and the true
discovery-`limit=40` US Springfield count are **UNVERIFIED** (my live probe failed too; §Target 2).

**Reviewer-specified fix:** Gate Brief A's AC-3 on a **captured real Nominatim Springfield `/lookup`
response** (post container-rebuild), stored as the fixture. Until captured, AC-1 (spanning Newport) and AC-2
(same-region twins) — both grounded in already-captured real Newport `osm_id`s — are sufficient to make the
*reorder* red-then-green; **AC-3 must not be written against a fabricated fixture.** The mock-fidelity gate
(QA verifies the double matches `lookupCityCountry`) must explicitly cover AC-3's fixture provenance.

### MINOR-1 — `decideCityDisambiguation` signature omits `regionIso`

§9 gives the pure function as `decideCityDisambiguation(candidatesForCountry: GeocodeCandidate[]): Disambiguation`,
but the `Disambiguation` union includes `{ mode: 'suggested'; regionIso: string }`. I verified in
`useCities.ts:87-101` that `lookupCityCountry` returns `regionIso` as a **separate top-level value**
(`result.region_iso`), not something derivable from `candidatesForCountry`. The current `suggested` branch
(`AddPlaceFlow.tsx:402` `else if (regionIso)`) consumes that top-level value. **Fix:** the signature must take
the resolved `regionIso` (and likely `countryCode`) as inputs, e.g.
`decideCityDisambiguation(candidatesForCountry, regionIso)`. A build agent copying the literal signature would
drop the `suggested` mode's input and regress AC-5.

### MINOR-2 — Promote the ADL-46 §4.3.2 supersession stamp to an explicit Brief A acceptance criterion

§7 correctly leaves ADL-46 unstamped until the build PR (the code still matches D14 on `main`, so ADL-46 is
not yet stale — leaving it until the same PR that changes the fact is *consistent* with the document-lifecycle
rule, confirmed). But §7 records the stamp as a prose "Action for the build PR," not a testable AC. This is
exactly the shape of the OP-06 lifecycle failure (a verdict/stamp that never flips because no gate enforced
it). **Fix:** add to Brief A's acceptance list: *"the PR stamps `ADL-46 §4.3.2` with the §7 SUPERSEDED banner
and records the resolution in any open-questions section D14 touches."*

### MINOR-3 — The "~20 rows" Springfield list-length ceiling is sourced from the wrong dataset

§5.2 uses ADL-48's "21 region groups" as the picker's row-count ceiling. But ADL-48's 21 is a
**gazetteer/identity-key dedup** figure, not the **Nominatim discovery-lookup** candidate set. The discovery
lookup is `limit=40`, settlement-filtered, country-filtered — it can legitimately return a *different* count
(townships/CDPs Nominatim tags as settlements, or multiple OSM objects per town). So "~20 rows" is **doubly
unverified** (unreachable live + provenance-mismatched source). It does not change the Target-1 decision, but
the ergonomic assumption behind "flat is fine" rests on a number from the wrong source. **Fix:** treat the
real captured Springfield count (BUILD-BLOCKER fixture) as the point where the flat-vs-grouped call is
re-confirmed; if the real count materially exceeds ~20, revisit the deferral.

### MINOR-4 — Record the Springfield type-to-jump → linear-scan regression as a UAT watch item

Per my Target-1 ruling: acceptable to ship, but the build/UAT should explicitly watch the one case that
degrades, so the deferred grouping has a concrete trigger. **Fix:** name it in Brief B's UAT notes.

---

## Confirmations the COO asked for (each backed by a probe)

- **Reuse claims:** *Mostly confirmed, one overstatement.* `CityPicker` (`CityPicker.tsx`), the region
  `<select>` + incomplete-seed fallback, the BUG-71 suggested caption, the BUG-79 truncation caveat, and the
  D11 backend are all genuinely reused (verified in-file). **The one overstatement is MAJOR-1:**
  `handleSelectPickerCandidate` cannot be "reused unchanged" by a second component — it must be extracted.
- **D11 re-point present on `main`:** **CONFIRMED** by a positive multi-probe (schema + route + repo +
  passing `place-repoint.test.ts`). The `city_id` field is on `UpdatePlaceDatesSchema`. No backend change is
  needed for UX-12. This is the strongest-verified claim in the design.
- **D14 supersession scoping:** **CONFIRMED sound.** Superseded *in part* (positive-`osm_id` branch only),
  region `<select>` retained as the no-`osm_id` fallback; leaving ADL-46 unstamped-until-build is consistent
  with the lifecycle rule because the code still matches D14 today. Only gap is enforcement → MINOR-2.
- **ATDD-first: yes on both briefs:** **CONFIRMED correct** against the OP-35 trigger. Both are
  Architect-involved, silent-and-plausible on failure (wrong pin / silent mis-point), and precisely
  specifiable (a pure decision table + a rendered composition). The frontend exclusion does not apply (these
  are the opposite of "never reaches the Architect / visible-recoverable failure").
- **Mock-fidelity forces a spanning-region fixture:** **CONFIRMED.** AC-1 requires GB-ENG + GB-WLS with ≥2
  distinct `osm_id` and asserts `mode: 'picker'` (not `'region'`) — which **fails on the current `main`
  order** (region-first would return `'region'`) and passes only after the reorder. That is a genuine red
  test, and it is exactly the spanning fixture the shipped same-region test omitted. Caveat: AC-3's
  Springfield fixture is the un-grounded one (BUILD-BLOCKER).

---

## Bottom line for the COO

Build it — the decision is right and verified. Before dispatching the briefs, require the Architect/COO to:
1. **MAJOR-1:** extend the shared unit to own the candidate→city identity carry (hand `onResolved` a
   `city_id`, not a candidate); add the "identity carry defined once" AC.
2. **MAJOR-2:** state the disposition of UX §12.2 items 3 (country non-auto-commit) & 4 (creation messaging)
   — fold into Brief B or record a justified exclusion with a tracker home.
3. **BUILD-BLOCKER:** gate AC-3 (Springfield) on a real captured Nominatim fixture; keep AC-1/AC-2 as the
   reorder's red tests in the meantime.
4. **MINOR 1-4:** widen the pure-function signature to take `regionIso`; promote the ADL-46 stamp to an AC;
   flag the "~20 rows" number as provenance-mismatched; record the Springfield scan regression as a UAT watch.

None require a redesign. The fresh-eyes attack on the two load-bearing judgment calls (Target 1 flat-picker,
Target 2 evidence-grounding) did not break them — the flat-picker call is sound for MVP and the
evidence-grounding is honest for a design, with the single caveat that one acceptance scenario inherits the
unverified gap and must not be faked.

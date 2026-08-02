# BUG-71 ruling — OP-27 fresh-eyes review

**Date:** 2026-08-01
**Reviewer:** Architect (fresh dispatch; no authorship of the BUG-71 ruling, the F1/F2 ruling, the UX spec, or any ADL-46 stage)
**Branch:** `chore/bug71-ruling-review`
**Under review:** `jobs/architect/tech/20260801-BUG71-discovery-ambiguity-ruling.md` (merged `3881d6b`, PR #355)
**Reviewed against:** `main` @ `375ca16` — i.e. **after** BUG-72 (#353) and BUG-73 (#354), both merged since the ruling was written against `a398d10`
**Also read:** `20260801-ADL46-F1-F2-ruling.md`; `jobs/ux/tech/20260801-UX-city-entry-and-disambiguation-spec.md` §§1, 3.2, 3.3, 10, 12.2; BRD GE-15 (line 126) / GE-16 (line 127); `geocode.ts`, `geocoding.service.ts`, `nominatim-client.ts`, `geocode.schemas.ts`, `common.ts`, `AddPlaceFlow.tsx`, `useCities.ts`, `cities.ts`

---

## 0. Verdict

> ## **SHIP WITH CORRECTIONS — and the corrections must land before the Backend brief is dispatched, not after.**

> **NARROWED (2026-08-01) by ADL-48 §13.2 — retained for history; this verdict stands and the
> BUG-71 work should SHIP NOW, not wait for ADL-48.** ADL-48 bundles a local city gazetteer
> consulted before Nominatim. Two effects on this review specifically: **(1) F2's "never-helps"
> failure mode is substantially answered** — categories **B** (Denver, Portland) and **C** (Paris,
> London, Tokyo), the ones this review correctly identified as the real cost and the ones the PO
> would notice, are precisely the names most certain to be present in a 170,540-row gazetteer, so
> they resolve locally from a *complete* set and are confirmable rather than blank. **(2) F1/F3's
> recommended three-valued output is strengthened and should still be adopted**: a complete local
> set can never be "incomplete but undivided", so `'suggested'` becomes precisely and only the
> **tail-path** state, which is a cleaner semantic than either document could give it. Findings
> F4–F10 and P1–P4 are unaffected. See `jobs/architect/tech/ADL-48-bundled-gazetteer.md`.

The ruling's core direction is right and I am not asking for it to be reversed. Moving the ambiguity decision out of a React component and into the backend (B6) is correct and overdue; "absence of disagreement is not agreement" (§2) is the correct diagnosis of BUG-71; leaving the resolution path alone (B9) is correctly reasoned and correctly scoped.

But the **output shape is wrong**, and it is wrong in a way that cannot be cheaply corrected once `DiscoveryConfidence` ships as an API contract. Three findings converge on the same clause:

1. The ruling's two-valued output (`confirmed` → value, everything else → `null`) **directly contradicts a merged UX spec's stated success criterion** on the same control, which the ruling elsewhere claims to be adopting rather than re-specifying (F1, HIGH).
2. `truncated` vetoes the **country** as well as the region, and truncation is measured on a raw page that is dominated by non-settlement noise — so for exactly the names users type most, GE-15 goes dark (F2, HIGH).
3. §3.2's headline robustness claim — *"the rule can therefore only fail toward a right answer… without knowing a single fact about the live payload"* — is **false as stated**. It rests on precisely one unstated and unprobeable fact about Nominatim, and it elides "no answer" as a failure mode (F3, HIGH).

All three are fixed by the same small change: make the confidence enum **three-valued** (`confirmed` / `suggested` / `ambiguous` / `none`) instead of two-valued. That is a one-member addition to a type the ruling already defines, it reconciles the ruling with the UX spec and with GE-15 simultaneously, and it does not reintroduce BUG-71.

---

## 1. Summary table

| # | Finding | Class | Severity | Blocks the Backend brief? |
|---|---|---|---|---|
| **F1** | B1's "confirmed or null" contradicts UX spec §3.2/§10's `Suggested:` rule for the country — a merged spec the ruling's own §10 says it "adopts, does not re-specify" | Defect | **HIGH** | **Yes** — the Frontend brief per §7.3 is self-contradictory as written |
| **F2** | `truncated` vetoes the **country** too, on a raw count inflated by non-settlement rows; GE-15 plausibly goes dark for common names. `limit 10→40` moves the threshold, it does not remove it | Defect | **HIGH** | **Yes** — changes `DiscoveryConfidence`'s shape |
| **F3** | §3.2's *"can only fail toward a right answer… without knowing a single fact about the live payload"* is unsound. It depends on one unprobeable Nominatim behaviour, and it excludes "no answer" from the definition of failure | Defect (reasoning) | **HIGH** | **Yes** — the claim is load-bearing for accepting B1 |
| **F4** | Nominatim transport failure (`status:'error'`/`'disabled'`) is collapsed into the same verdict as a genuine no-match. The ruling had the one chance to expose it and didn't — re-creating BUG-73's defect class one hop upstream | Defect | **MEDIUM** | No — but fix in the same brief |
| **F5** | §4.2 step 4 yields `country:'none'` + `region:'ambiguous'` + `regionOptions:[]` for an all-unattributed set. §7.3 item 4's frontend mapping then renders *"Multiple matches — choose one"* over nothing to choose | Defect | **MEDIUM** | No — one-line algorithm fix |
| **F6** | §6.2's "D-19 passes the trip's set through the parameter that exists" is **false**. `zCountryCode` is `.length(2)`, and `classifyDiscovery`'s `requestedCountryCode: string \| null` is singular where `classifyCandidates` already uses `PermittedCountries` | Defect | **MEDIUM** | No — but fix the signature now, it is free today |
| **F7** | §7.3's code sketch is written against pre-BUG-73 `AddPlaceFlow` and silently **deletes** BUG-73's `failed` early-return. All §7/§9.4 line citations are ~15 lines stale, and §7.4's "BUG-73 is open, not yet dispatched — do not run in parallel" is moot (merged #354) | Defect (staleness) | **MEDIUM** | No — Frontend brief only |
| **F8** | §3.3 calls §2.2's reason (ii) "narrowed"; it is **falsified**, and the resolution path's acceptance is silently re-founded on a *new* rationale (§5's cost argument). A future reader will read "still holds" as the frequency claim surviving | Defect (record integrity) | **LOW** | No |
| **F9** | `rawResultCount >= limitSent` is implementable exactly where §4.1 says (verified), and is the best available proxy — but it is a **heuristic**, not the "directly observable" fact B2 claims. Dedupe / importance-cutoff can produce a false `truncated=false` | Defect (overclaim) | **LOW** | No — restate, don't redesign |
| **F10** | §6.1's *"every additional request costs the user a **minimum** of 1.1 s"* is an overstatement — the delay is `1100 − elapsed`, so it is an **upper** bound, zero on an idle chain. The 0.909 req/s ceiling and the +33–50 % figure are both **correct** | Defect (precision) | **LOW** | No |
| **P1** | `classifyDiscovery` should take `PermittedCountries` + a separate `userSelectedCountryCode`, not one conflated param | Preference | — | No |
| **P2** | `featuretype` / `layer` on the discovery call is a better lever than `limit`, and is free on the same request | Preference | — | No |
| **P3** | The §9.5 staging probe should run **before** the threshold policy is fixed, not after | Preference | — | No |
| **P4** | The `[GEO]` log line interpolates unvalidated `q` — trivially forgeable log lines | Preference | — | No |

**Correctly ruled, attacked and survived:** B6 (move the decision to the backend), B9 (leave the resolution path alone — the "free where there is a control, expensive where there is not" distinction is the best paragraph in the document), B4 (reject two-phase; arithmetic re-derived and correct), B8 (never narrow a selector on a truncated set), the §4.4 drift invariant (I checked it algebraically — it holds, and the converse correctly fails on fixture 3), §7.1's branch trace (still correct post-BUG-73 — see §4), and every amendment stamp on the F1/F2 ruling (§9).

---

## 2. F1 — the ruling overrides a merged UX spec on the same control while claiming to adopt it

**This is the finding I would not merge without.**

The ruling's §10 reconciliation table says of the UX spec: *"**Adopted, not re-specified.** §7.3 item 4 defers to it for wording, option labelling and the `Suggested:` treatment."* It defers to §3.3 (region). It never reads §3.2 (country) — which decides the exact question B1 decides, and decides it the other way:

> **UX spec §3.2:** *"**Decision: the country field is never auto-committed without the user seeing and confirming it as a suggestion.**… If the trip has no associated countries (tier 3, the common case for a spontaneous trip), fall through to today's single-guess lookup — **but render it as a visibly tentative default, not a silent fill**: a small `Suggested` chip/caption directly under the dropdown, e.g. `Suggested: France — from "Rome"`."*
>
> **UX spec §10 (success criteria, for QA / Frontend DoD):** *"Opening 'Add new city' never silently commits a country the user hasn't seen; **a tier-3 fallback guess is visibly marked as a suggestion** and remains a normal editable dropdown."*
>
> **UX spec §12.2 item 3 (MVP scoping):** *"**§3.2's country-suggestion rule… stays in, not deferred.**"*

The BUG-71 ruling replaces the tier-3 fallback guess with `null`. There is then no guess to mark as a suggestion, and the UX spec's success criterion becomes unsatisfiable — not failed, *vacuous*. A Frontend agent handed §7.3 ("adopt the UX spec, do not re-invent it") and the UX spec together will hit a flat contradiction on the first field it touches.

Two things follow, and the second is the important one.

**(a) The document-lifecycle rule was not discharged.** The ruling correctly stamped the F1/F2 ruling in two places (§9 below — that part is well done) and correctly found the GE-15/GE-16 tension. It did neither for the UX spec, whose §3.2 and §10 are now partly superseded by a decision taken elsewhere. That is a same-PR obligation under lifecycle rule 2 and it is outstanding.

**(b) The UX spec's answer is better than the ruling's, and it dissolves F2.** UX §3.2's reasoning is that a value the user can see and change beats both a silent fill and a blank field. Applied to the truncation case, that gives the correction I recommend in §3.

**Severity: HIGH. Blocks the Frontend brief outright and should block the Backend brief, because it changes the response contract.**

---

## 3. F2 — the never-helps failure mode is real, and the fix is a third confidence value

### 3.1 Working the concern through concretely

The dispatch's worry was that auto-fill would never fire. I set out to defeat it and could not. Here is the mechanism, stated precisely.

`truncated = data.length >= limitSent` is computed on the **raw** array (§4.1) — deliberately, and the ruling's soundness reasoning for that is correct (Nominatim truncates before our `SETTLEMENT_TYPES` filter, so the filtered count cannot detect truncation). But the ruling never draws the consequence:

> **The truncation flag and the settlement filter are in direct opposition.** `data` is any OSM object whose name matches `q` — settlements, but also streets, hotels, townships, and businesses. The *more* noise Nominatim returns, the *more* likely `truncated` fires, and simultaneously the *fewer* real settlement candidates survive. The withhold rate is therefore driven by **junk density in Nominatim's ranking**, which has nothing to do with whether the city name is ambiguous.

That is the concrete engine of the never-helps failure. Now the categories. **Every frequency below is UNVERIFIED (ENV-01) — I ran no live query. What is verified is the code path each category traverses.**

| Category | Example | Raw page ≥ 40? | Country result | Region result | Net |
|---|---|---|---|---|---|
| **A — rare name, low noise** | Zermatt, Tromsø, Ouagadougou | Plausibly no | `confirmed` | `confirmed` if unanimous | **Auto-fill fires.** GE-15 preserved |
| **B — common name, one country** | Denver, Portland | Plausibly yes (city + its streets + namesakes) | `truncated` → `ambiguous` → **null** | short-circuits to `ambiguous` | **Both fields blank.** GE-15 dark |
| **C — global-capital / high-noise name** | Paris, London, Tokyo | Almost certainly yes | multi-country **and** truncated → **null** | → `ambiguous` | **Both fields blank.** Today these auto-fill *correctly* |
| **D — genuinely ambiguous** | Springfield | Yes | multi-country → null (correct) | divided → null (**correct — this is the fix**) | **Correct.** BUG-71 closed |
| **E — non-region-tier country** | Bergen (NO), Cusco (PE) | Depends | truncation vetoes | selector doesn't render | **Country blank**, and here §5's "the control is on screen" argument is weakest — that control has ~200 options |

Category D is the bug and the rule fixes it. **Categories B, C and E are the cost, and the ruling does not price them.** Category C is the one the PO will notice: "Paris" auto-populates France today and would go blank tomorrow. That reads as a regression regardless of how correct the reasoning behind it is.

The honest quantitative statement is this, and I would put it in the brief verbatim:

> The proposed rule fires auto-fill only for inputs whose **global raw result page is under 40 rows and unanimous by country**. The size of that set is unmeasured. But the rule's structure makes it **monotonically decreasing in name commonality and in OSM noise density** — i.e. least likely to fire for exactly the names users type most. That is the inversion of what GE-15 promises.

### 3.2 Does 10 → 40 resolve it? No — it is the ceiling of the wrong lever

Raising the limit does help in the right direction (for a fixed name, `truncated` fires at ≥10 rows before and ≥40 after — strictly fewer names trip it). But:

- It only rescues names with **fewer than 40 planet-wide OSM name matches**. For a real city name that is a low bar to clear, because the raw page counts streets and POIs.
- **40 is believed to be the ceiling** (Nominatim's documented `limit` maximum — **UNVERIFIED**, same firewall, and the ruling marks it so too). There is no further headroom on this lever.
- Springfield globally would plausibly exceed 40 as well — which is *fine* for Springfield, and exactly the problem for Denver.

**P2 (preference, but a strong one): the right lever is not `limit`, it is what counts as a row.** Nominatim's search endpoint exposes `featureType` (`country|state|city|settlement`) and, on 4.x+, `layer` (`address,poi,…`). Sending `featuretype=settlement` on the **discovery call only** would (i) make the raw page settlement-only, so `data.length` finally *means* "settlements named X", (ii) collapse the raw-vs-filtered gap that makes the truncation test coarse, and (iii) make `truncated=false` reachable for ordinary names — all on the same request, zero extra egress, exactly the shape of the ruling's own §6.2 correction. **UNVERIFIED:** parameter name, supported values, and whether `nominatim.openstreetmap.org` runs a version supporting `layer`. *Probe:* one `curl` from an allowlisted host, or read the Nominatim docs — both blocked here (ENV-01). *Blind spot:* `featuretype=settlement` uses address-rank ranges and may exclude places the current `type == null` pass-through accepts, so it must be scoped to the discovery call and validated by the §9.5 staging probe before adoption. **I am not asking the ruling to adopt this blind — I am asking that it be probed in the same staging pass and not silently foreclosed by hard-coding `DISCOVERY_LIMIT` as the sole knob.**

### 3.3 Should truncation block the country as well as the region? — the recommended correction

The dispatch asked this directly. My answer: **neither "block both" nor "block region only" is right. The correct output is not binary.**

Arguing it out:

- *Block both* (the ruling): safe, and kills GE-15 in categories B/C/E.
- *Block region only, auto-fill the country*: rescues GE-15's country half and does **not** reintroduce BUG-71 (Springfield's country is divided anyway, so it is blocked on `countryOptions.length > 1`, not on truncation). But it silently commits a country from an incomplete sample — the same silence GE-16 and UX §3.2 both object to, and the same silence that made BUG-71 a P1 rather than a nuisance. I do not recommend it.
- **Suggest, don't blank** (recommended): under *incomplete but undivided* evidence, populate the field **and mark it visibly as a suggestion**. This is not my invention — it is UX spec §3.2's already-decided treatment (F1), which the ruling cites and then doesn't use.

Concretely, split the ruling's `'confirmed'` into two and leave everything else alone:

| Evidence | Verdict | Field behaviour |
|---|---|---|
| Complete (`!truncated`), fully attributed, unanimous | `'confirmed'` | Populate silently — **GE-15 as written** |
| **Incomplete or partially unattributed, but undivided** (`optionsLength === 1`) | **`'suggested'`** | **Populate + visible `Suggested: X — from "<q>"` chip, freely changeable — UX §3.2, GE-16-safe** |
| Divided (`optionsLength > 1`) | `'ambiguous'` | Blank + *"Multiple matches — choose one"* — **GE-16, and this is BUG-71's case** |
| No information | `'none'` | Blank + *"We couldn't determine this"* |

Why this is the right shape:

- **It does not reintroduce BUG-71.** Springfield's region set is divided (`US-VA`, `US-IL`, `US-MO`, …) → `'ambiguous'` → blank. Unchanged from the ruling. The *only* case that moves is the undivided-but-incomplete one, which the ruling blanks and this suggests.
- **It reconciles all three documents** — GE-15 ("without further user input": a populated field satisfies it), GE-16 ("asked to choose rather than one selected for them": applies to the multi-candidate case, which stays blank), and UX §3.2/§10 ("a tier-3 fallback guess is visibly marked as a suggestion"). The ruling's §8 correctly found the GE-15/GE-16 tension and then resolved it by sacrificing GE-15 outright; a third value resolves it without a sacrifice, and probably **weakens the case for the GE-15 amendment in §8 rather than strengthening it** — see §8 below.
- **It is robust to not knowing.** This is the property §3.2 claims and does not have. Under the ruling, the entire user-facing outcome hinges on an unmeasured truncation frequency: get it wrong and the form is blank for most names. Under three-valued output, the worst case of a mis-tuned `truncated` is a **visible suggestion** rather than a blank form — the design degrades gracefully in *both* directions, which is what "robust to not knowing" actually means.
- **It costs one enum member.** `DiscoveryConfidence.country` / `.region` gain `'suggested'`; `countryCode`/`regionIso` are populated for it; the frontend renders a chip the UX spec has already designed. No new request, no new endpoint, no schema change.

**Severity: HIGH. Blocks the Backend brief** — not because the ruling's version is unsafe, but because `DiscoveryConfidence` is a wire contract and adding a state after implementation is a second breaking change to a surface that already has exactly one consumer and no route-level test.

---

## 4. F3 — "the rule can only fail toward a right answer" (attacked directly, as instructed)

§3.2 states: *"The rule can therefore only fail toward a right answer. That property holds without knowing a single fact about the live payload."*

**Both sentences are false.** Four constructions:

**(a) It fails toward *no answer*, and "no answer" is excluded from the definition of failure by fiat.** The enumeration in §3.2 proves the *soundness of a positive assertion* — if we auto-fill, we are right. It says nothing about the far larger branch where we assert nothing. Categories B/C/E in §3.1 are failures against GE-15 with a real user cost; the claim survives only by defining them as non-failures. This is the rhetorical move the ruling itself diagnoses one section earlier (§2's "absence of evidence promoted to evidence of absence") applied in the opposite direction.

**(b) It depends on exactly one fact about the live payload, and that fact is unprobeable from here.** The safety of the whole design rests on `truncated` being a *sound* completeness signal — i.e. on Nominatim returning **≥ `limit` rows whenever more matches exist**. If Nominatim's dedupe or importance cutoff can return, say, 6 rows for `q=springfield` at `limit=40` while the index holds hundreds, then `truncated=false`, and if those 6 happen to be unanimous the rule auto-fills "Virginia" — **BUG-71, reproduced exactly, through the fix meant to prevent it.** UNVERIFIED (ENV-01, no live query, no docs). *Probe:* the §9.5 staging line, reading `raw` for a name with a known-large namesake set. *Blind spot:* a single staging observation does not establish the general behaviour of dedupe across query shapes. This does not sink the design — it sinks the *claim*, and the claim is what the COO is being asked to accept B1 on.

**(c) It fails toward a wrong *displayed* answer.** See F5 (§6): an all-unattributed candidate set produces `country:'none'` with `region:'ambiguous'` and `regionOptions: []`, and §7.3 item 4's mapping then renders *"Multiple matches — choose one"* against an empty candidate set. That is a wrong statement shown to the user, not a withheld one.

**(d) The `requestedRegionIso` branch confirms with no completeness guard at all.** §4.2 step 4: `matches.length >= 1 → 'confirmed'`, regardless of `truncated` or attribution, justified as *"a user's explicit selection is ground truth."* But `region_iso` is a **query parameter on a public route**, not a user gesture — the code cannot tell the difference. It is inert today (the discovery call sends only `q` — verified at `useCities.ts:42`), but the ruling deletes `geocode.ts:55–60` in favour of this branch and §6.2 explicitly plans to route D-19 through the same parameter surface. Worth an explicit comment recording that the branch trusts the caller.

**What to do:** replace §3.2's absolute claim with the true, narrower one — *"when the rule does auto-fill, it is right, **conditional on `truncated` being a sound completeness signal**; when it does not, it withholds, and withholding has a cost that §3.1 prices."* Then adopt the three-valued output (§3.3), which is what actually delivers the robustness §3.2 asserts.

**Severity: HIGH** — the claim is the load-bearing justification for accepting B1's strictness and it does not hold.

---

## 5. F4 — a Nominatim outage is indistinguishable from a no-match, and the ruling had the fix in its hand

The route (both today and in §4.3's rewrite) does `const candidates = result.status === 'ok' ? result.candidates : []` — collapsing `'error'` (network/timeout/5xx/429) and `'disabled'` into the same empty array as a genuine "the geocoder answered: no match", then returns **HTTP 200** with nulls.

Downstream on current main, `lookupCityCountry` returns `failed: false` for that (it only sets `failed` when the *proxy* call itself throws — `useCities.ts:98–100`), so `AddPlaceFlow` shows no failure banner and no Retry button.

**So BUG-73's fix covers the browser↔backend hop and not the backend↔Nominatim hop.** Established two ways that fail differently: (1) reading `geocode.ts:50–51, 73–74` together with `useCities.ts:90–100` — a `status:'error'` produces a 200 that the catch never sees; (2) `AddPlaceFlow.geocodeFailure.test.tsx`'s own header, which scopes BUG-73 to *"a failed `GET /api/geocode` lookup"* and asserts *"confirming 'found nothing' still renders with no failure message at all"* — the geocoder-failed case falls in the second bucket by construction.

This is pre-existing, not caused by the ruling. But the ruling makes it **worse and more visible**: §7.3 item 4 maps `region:'none' + country:'none'` to *"We couldn't confirm this automatically — please choose"*, so a Nominatim outage now actively tells the user we looked and found nothing, when we never asked. That is BUG-73's defect class re-created one hop upstream, inside the very section (§7.2) that invokes BUG-73 as the reason a frontend change is mandatory.

**Fix, and it is cheap:** surface the client's status in the `confidence` block — e.g. `lookup: 'answered' | 'failed' | 'disabled'` — and have the frontend route `'failed'` into BUG-73's existing amber banner + Retry, which is already built and tested. Fold into the same Backend brief. **MEDIUM.**

---

## 6. F5 — an all-unattributed set produces an internally inconsistent verdict

§4.2 step 3 gives `countryOptions.length === 0 → country: 'none'`, `countryCode = null`. Step 4 then opens: *"If `countryCode == null` (country unsettled), return `region = 'ambiguous'`."*

So a candidate set where no candidate carries a `countryCode` yields `{ country: 'none', region: 'ambiguous', regionOptions: [] }` — which contradicts §4.2's own stated semantics (*"'none' means the geocoder offered no information on that dimension; 'ambiguous' means it offered conflicting or incomplete information"*). Nothing was offered on either dimension.

It is not cosmetic: §7.3 item 4 branches on `region === 'ambiguous'` **before** the combined `'none'` branch, so the user is shown *"Multiple matches — choose one"* with an empty `region_options` array — a prompt to choose between nothing. And §9.1 test 8 only covers *zero candidates*, so a table-driven suite built exactly to spec would encode the wrong behaviour as correct.

**Fix:** step 4's short-circuit becomes `region = (countryOptions.length === 0 ? 'none' : 'ambiguous')`, plus a test row for "candidates present, all with null `countryCode`". Reachable whenever Nominatim omits `address.country_code` (`nominatim-client.ts:172` — the field is optional in `RawNominatimResult`). **MEDIUM.**

---

## 7. F6 — the D-19 "zero cost" correction is right about egress and wrong about the interface

The ruling corrects the COO: *"(c) does **not** cost additional requests. `countrycodes` accepts a comma-joined list and `nominatimSearch` passes params through verbatim (`nominatim-client.ts:118–122`)."*

**The egress half is verified and correct.** `nominatimSearch` spreads `params` into `URLSearchParams` verbatim and only forces `format` and `addressdetails` (lines 118–122). A comma-joined `countrycodes` reaches the wire intact, on a request we already make. *(That Nominatim's `countrycodes` accepts a comma list is my strong recollection of the documented behaviour but is **UNVERIFIED** from here — probe: read the Nominatim search docs, or one live call, both ENV-01-blocked.)*

**The interface half is false**, and the ruling states it as the reason D-19 is cheap to land later:

> *"`classifyDiscovery` already takes `requestedCountryCode` — D-19 passes the trip's set through the parameter that exists."*

Three things block that, established by two independent probes (reading `geocode.schemas.ts` → `common.ts:34`, and reading the ruling's own §4.2 signature — different files, different failure modes):

1. **`zCountryCode = z.string().trim().length(2)`** (`common.ts:34`). A comma-joined list is rejected 400 at the route boundary. The schema must change.
2. **`requestedCountryCode: string | null` is singular.** A set cannot pass through it. `classifyCandidates` — written 24 hours earlier by the F1/F2 ruling — already solved this with `export type PermittedCountries = ReadonlySet<string>` and documented it as *"a future trip-declared-countries lookup would pass many"* (`geocoding.service.ts:60–66`). **`classifyDiscovery` regresses on an abstraction the sibling classifier introduced specifically for D-19.**
3. **The parameter is doing two jobs that diverge under D-19.** Today `requestedCountryCode` is both the eligibility filter *and* the "confirmed by fiat" ground truth (§4.2 step 3). A set of three trip countries is a legitimate eligibility filter but is **not** ground truth for which one — and the fiat branch would write `countryCode = "US,CA".toUpperCase()` into the response.

**P1 (preference, adopt now — it is free today and expensive later):**
```ts
export function classifyDiscovery(
  candidates: NominatimCandidate[],
  truncated: boolean,
  permitted: PermittedCountries,          // eligibility — mirrors classifyCandidates
  userSelectedCountryCode: string | null,  // ground truth by fiat — distinct concern
  requestedRegionIso: string | null,
): DiscoveryVerdict;
```
Today every caller passes `new Set()` / `null`. D-19 then genuinely is a parameter change. **MEDIUM** — non-blocking, but the ruling's own §6.2 sells D-19's cheapness on a premise that is not true, and the COO is being asked to sequence on it.

---

## 8. F7 — BUG-73 invalidated §7's citations, and §7.3's sketch would delete BUG-73's fix

The ruling was written against `a398d10`. I verified its line citations were **accurate then** (`git show a398d10:…AddPlaceFlow.tsx` — `if (countryCode)` at 243, `sameCountryRegionIsos` at 250–258, `> 1` at 260, `else if (regionIso)` at 263, exactly as cited). PR #354 shifted them ~15 lines. Current main:

| Ruling cites | Current main | Substance |
|---|---|---|
| `:243` `if (countryCode)` | `:258` | unchanged |
| `:250–258` `sameCountryRegionIsos` | `:265–273` | unchanged |
| `:260` `> 1` | `:275` | unchanged |
| `:263` `else if (regionIso)` | `:278` | unchanged |
| `:436–443` country-change handler | `:458–465` | unchanged |
| `:460–465` ambiguity hint | `:498+` | unchanged |
| `:125–131` narrowing block | `:131–137` (`:125–131` is now the comment) | unchanged; the *claim* (replaces rather than promotes) is correct |
| `AddPlaceFlow.test.tsx:227+` | `:227` | **still accurate** |
| — | **new `:253–257` `if (failed)` early-return** | **not in the ruling at all** |

**§7.1's conclusion survives — I re-traced it branch by branch on current main.** With the backend returning nulls: `:253 if (failed)` is false (a null-returning 200 is not a failure), `:258 if (countryCode)` false, `:265` ternary yields `[]`, `:275 > 1` false, `:278 else if (regionIso)` false → **nothing is auto-filled.** The GE-16 violation is closed by the backend brief alone, as claimed. ✅

**Two things are invalidated:**

1. **§7.3's code sketch omits the `failed` early-return.** A Frontend agent implementing item 3 literally — *"`if (countryCode) setNewCityCountryCode(countryCode); if (regionIso) setAutoRegionIso(regionIso);`… **Delete** the `sameCountryRegionIsos` computation"* — against current main would drop `:253–257` and regress BUG-73 to its silent state. The brief must say explicitly that the `failed` branch is preserved and runs first.
2. **§7.4 is moot.** Its central sequencing warning — *"BUG-73 (issue #352, **open, not yet dispatched**) rewrites the same function this ruling changes… Two independent briefs editing one function will conflict… **Do not run in parallel**"* — describes a collision that has already been resolved by BUG-73 merging first. And it resolved *well*: BUG-73's test file explicitly states it *"does not touch AddPlaceFlow.tsx:250-263's D14 ambiguity computation (BUG-71, in flight separately)"* and uses single/empty-candidate fixtures throughout. The §10 table row *"BUG-73 — unassigned. **COO decision required**"* should be struck.

**Severity: MEDIUM**, Frontend brief only. **§7.2's argument is meanwhile *strengthened* by BUG-73, in a way worth telling the COO:** now that a genuine transport failure renders an amber banner, a blank form with *no* banner reads to the user as "this succeeded and found nothing." Shipping the backend half alone is now *more* misleading than it would have been pre-BUG-73, not less.

---

## 9. F8/F9/F10 — the smaller ones

**F8 — "narrowed" understates what happened to §2.2 (LOW, record integrity).** The amendment stamps themselves are **correct and well-formed** — I checked all three against the document-lifecycle rule: a `PARTIALLY AMENDED (2026-08-01)` banner at the head of the F1/F2 ruling naming the successor and explicitly preserving R1–R5; an inline `SUPERSEDED (2026-08-01)… — retained for history` on the parity contract; an inline `NARROWED (2026-08-01)… — retained for history` on the accepted-limit clause. Old text retained throughout. Lifecycle rules 1, 2 and 4 are discharged on that document. Good work, and better than most.

My objection is to the word. §2.2's reason (ii) was a **frequency claim** — *"the case is dominated by non-region-tier countries."* BUG-71 firing in the United States falsifies that claim **on both paths**, because the resolution path serves the same countries. What actually survives on the resolution path is §5's *cost* argument ("declining produces a pending row with no affordance"), which is a **different and newer** justification. So the acceptance was not narrowed, it was **falsified and re-founded**. The distinction matters because a reader landing on §3.3's *"it remains defensible for the resolution path"* will reasonably infer the frequency claim survived there. It did not. Recommend the stamp say so, and that §10.3's trigger be described as compensating for a rationale that is now cost-based only.

**Is narrowing rather than reversing the right call?** Yes — the ruling is right not to touch `classifyCandidates`. §5's asymmetry ("refusing to guess is free where there is a control to ask through, and expensive where there is not") is genuinely the correct principle and the strongest reasoning in the document, and §10.3's trigger-with-an-owner is exactly the "acceptable today is not a justification" discipline this project adopted on 2026-07-30. Only the *label* is wrong.

**F9 — B2's "directly observable" is an overclaim (LOW).**
*Verified:* the computation is implementable exactly where §4.1 places it. `nominatim-client.ts:136–143` parses `data`, and `data.length` is read **before** `.map(parseCandidate).filter(…)`. §9.3 test 17 (40 raw → 3 filtered → `truncated:true`) is constructible as specified. `>=` over `===` is the right defensive choice. Making `limit` mandatory is right, though it needs a type change (`Record<string, string>` cannot express a required key — use `Record<string,string> & { limit: string }`).
*Overclaimed:* B2 says *"Truncation is **directly observable** and free."* It is **inferred**, from an undocumented server behaviour. §11.1 item 2 handles the over-cap direction (server caps below 40 → false `truncated=false`) and correctly argues the design survives it. It does **not** consider the same false negative arriving via **dedupe or importance cutoff**, a different mechanism with the same consequence — and that is the assumption F3(b) shows the whole safety argument rests on. Given no total-count field in the response, `>= limit` is the best available proxy and I would keep it. Restate it as a heuristic with a named assumption; do not redesign it.

**F10 — §6.1's arithmetic, re-derived (LOW).**
- **0.909 req/s ceiling: correct.** `REQUEST_DELAY_MS = 1100` (`:34`); `lastRequestAt = Date.now()` is assigned at `:116`, **before** the `fetch` at `:127`, so spacing is from request *start* as claimed; `chain.then(run, run)` at `:151` serializes module-wide. `1/1.1 = 0.9090…` req/s, `60/1.1 = 54.54` req/min. ✅ And correctly labelled a *ceiling* — the true inter-start is `max(1100 ms, previous request duration)` because the chain also waits for the prior `run` to settle.
- **"+33–50 %": correct.** 2–3 → 3–4 requests; `3/2 = +50 %`, `4/3 = +33 %`. ✅ Call sites verified: `cities.ts:312` `resolveCityName`, `cities.ts:218` and `:391` `resolveCity` — the ruling cites `:300`, `:379`, `:206`, which have drifted but point at the same three sites.
- **Wrong: *"every additional request costs the user a minimum of 1.1 s."*** The wait is `REQUEST_DELAY_MS − elapsed` (`:113–115`) — an **upper** bound, and **zero** when the chain has been idle >1.1 s. For a two-phase lookup specifically the two calls are back-to-back, so the cost approaches 1.1 s minus phase-1 duration; "up to 1.1 s" is the accurate phrasing. The rejection of (b) does not depend on it — the decisive objection ("(b) does not remove the need for B1") is correct and sufficient on its own, and I endorse **rejecting (b)** independently of the arithmetic.

**P4 — the `[GEO]` log line (preference).** §4.1's `console.info(\`[GEO] q="${params.q}" …\`)` interpolates a caller-controlled string that `GeocodeQuerySchema` constrains only to `min(2)` — a `q` containing a newline forges log lines in the one instrument §9.5 designates as authoritative for closing ENV-01. `JSON.stringify(params.q)` costs nothing. Not a security finding; a "don't corrupt your own instrument" finding.

---

## 10. §8 (BRD) — is the GE-15 amendment right, and is an existing ID enough?

**An existing-ID amendment is the right instrument, and I agree no new requirement ID is needed.** GE-16's success criteria already contain *"where a lookup returns more than one candidate the user is asked to choose rather than one being selected for them"* — verified at BRD line 127. That is the requirement BUG-71 violates. Nothing new is being built; a wrong behaviour is being removed. Dispatchable as a defect fix. ✅

**The tension the ruling identifies is real.** GE-15 (line 126) does say *"populates both country and region/state **without further user input**."* Verified.

**But the proposed amendment's scope is wrong, and F1/F2 change the answer.** The ruling proposes GE-15 concede *"where it cannot [confirm], GE-16's ask-don't-guess rule takes precedence and the field is left blank and editable."* Under the three-valued correction (§3.3), the ambiguous case is blank (GE-16 governs) but the **incomplete-but-undivided** case is *populated as a visible suggestion* — which satisfies GE-15's "without further user input" as written. The concession GE-15 must make shrinks from "blank whenever we cannot confirm" to "blank only when the candidates genuinely disagree." That is a much smaller amendment, it does not weaken a shipped guarantee across the board, and it is materially easier for the PO to accept.

**Three further points for the COO:**

1. **The amendment must cover the UX spec too.** §8 treats this as a two-document reconciliation (GE-15 vs GE-16). It is a **four**-document one: BRD GE-15, BRD GE-16, UX spec §3.2/§10, and this ruling. F1 is the missing leg and the amendment is incomplete without it.
2. **§8's dispatch consequence is correct and is the most operationally useful sentence in the document** — *"BUG-71's Backend brief is **not** blocked on this. The UAT verdict is."* Endorsed without qualification. Amend GE-15 before the UAT round or a correct fix is scored a failure against a stale criterion.
3. **Folding D-19's "likely a GE-15 amendment rather than a new ID" into the same bump** (§8's closing note) is right.

---

## 11. What I verified vs. what remains unverified

### 11.1 Verified, and how

- **Every line citation in the ruling's §2 mechanism table** — checked against `a398d10` (accurate as written) and against current `main` (drifted ~15 lines; substance unchanged). Method: `git show a398d10:<path>` plus a direct read of current main — two sources that fail differently.
- **§2's "sharpening"** (that `else if (regionIso)` can only fire when `candidates[0]` carries a region and the same-country distinct set is exactly 1) — re-derived independently from `geocode.ts:73–74` + `useCities.ts:93–94` + `AddPlaceFlow.tsx:265–278`. **Correct.**
- **§7.1's branch trace on current, post-BUG-73 `AddPlaceFlow`** — re-traced branch by branch (§8 above). **Conclusion survives.**
- **§4.1's truncation computation is implementable where stated** — `data.length` is read pre-filter at `nominatim-client.ts:136–143`.
- **The §4.4 drift invariant holds, and its converse correctly fails.** Checked algebraically against `classifyCandidates` (`geocoding.service.ts:122–157`): `region==='confirmed'` requires `!truncated ∧ allAttributed ∧ |regionOptions|===1`; `classifyCandidates(C, {countryCode}, null)` then has non-empty eligible and `distinctRegionIsos.length === 1`, so `status==='ok'`. Fixture (3) (two `US-CO`, `truncated=true`) gives discovery `'ambiguous'` / classify `'ok'` — the converse fails as §9.1 item 10 requires. ✅
- **The rate-limit chokepoint's timing and serialization** — read at `nominatim-client.ts:34, 49–51, 112–116, 151–152`. 0.909 req/s ceiling confirmed; "minimum 1.1 s" is wrong (F10).
- **`countrycodes` passes through verbatim** — `nominatim-client.ts:118–122`. ✅
- **`zCountryCode` is `.length(2)`** — `src/backend/validation/common.ts:34`, reached from `geocode.schemas.ts`. This is a **positive** finding (the constraint exists and I read it), so it self-verifies.
- **The amendment stamps on the F1/F2 ruling exist and are well-formed** — read directly at its head banner, §2.2 parity clause, and §2.2 accepted-limit clause.
- **The UX spec conflict** — positive finding, quoted verbatim from §3.2, §10 and §12.2 of the merged spec.
- **`GET /api/geocode` has one consumer and no backend route test.** Re-probed independently of the ruling, two ways that fail differently: (1) `grep -rn "api/geocode" src/` → the only non-type, non-test consumer is `useCities.ts:46`, and the only test hits are two *frontend* files; (2) `find src -iname "*geocode*"` → no file under `src/backend/**/__tests__`, and `grep -rn "geocodeRouter" src/` outside `routes/` returns only `server.ts:218` and `server-test-app.ts:33,125` — router mounted, never exercised. **The ruling's claim is confirmed.**

### 11.2 Unverified, with the probe and its blind spot

1. **Every candidate-volume and truncation-frequency number in §3.1 — UNVERIFIED.** I ran no live Nominatim query; ENV-01 (firewall) blocks it, the same blind spot that let BUG-71 ship. *Probe I would run:* `curl 'https://nominatim.openstreetmap.org/search?q=<name>&format=json&addressdetails=1&limit=40'` for ~15 names spanning categories A–E, recording raw count, post-`SETTLEMENT_TYPES` count, distinct `country_code`, and `ISO3166-2-lvl4` density. *Blind spot:* one sample of one moment; Nominatim's ranking and index change. **What is verified is the code path each category traverses — the mechanism, not the frequency.** My argument is deliberately structured to need only the mechanism: the withhold rate is *monotonic* in name commonality whatever its absolute value.
2. **`limit=40` as Nominatim's maximum — UNVERIFIED.** Inherited from the ruling, which inherited it from the dispatch. Not independently established. *Probe:* the docs, or a `limit=100` call observing where it plateaus. *Blind spot:* a silent server-side cap below 40 reads as `truncated=false` — F3(b).
3. **Nominatim's dedupe / importance-cutoff behaviour relative to `limit` — UNVERIFIED, and this is the load-bearing one.** Whether the server can return fewer than `limit` rows while more matches exist determines whether `truncated` is sound. *Probe:* compare `limit=10` and `limit=40` raw counts for the same broad query; if the 40-call returns <40 while the 10-call returned 10, post-limit filtering is in play. *Blind spot:* behaviour may differ by query shape.
4. **`featureType` / `layer` parameter support (P2) — UNVERIFIED.** Recollection of the documented API, not read. *Probe:* the docs, or one live call with `featuretype=settlement` comparing raw counts. *Blind spot:* the deployed version at `nominatim.openstreetmap.org` may differ from current docs. **I am recommending it be probed, not adopted blind.**
5. **`countrycodes` accepting a comma-joined list — UNVERIFIED** (F7). Strong recollection; the code-side pass-through is verified, the server-side acceptance is not.
6. **`type == null` pass-through in `SETTLEMENT_TYPES`** (`nominatim-client.ts:141`) — inherited unverified from the ruling's §11.1 item 3; not re-probed. Under the three-valued correction its bias is unchanged (toward `'ambiguous'`/`'suggested'`, the safe directions).
7. **No browser was driven, and I ran no test suite.** §8's branch trace is a line-by-line read of `AddPlaceFlow.tsx`, not an observation of the form. The ruling's §9.1–§9.4 test obligations are assessed for *constructibility from the spec*, not executed.

---

## 12. Recommended disposition for the COO

**Ship the ruling's direction. Apply four corrections to the Backend brief before dispatch, and two to the Frontend brief.**

**Backend brief — must land before dispatch:**
1. **Three-valued confidence** (F1/F2/F3): add `'suggested'`; populate the field and mark it in `confidence`. Wire contract — do not defer.
2. **Surface the lookup status** (F4): `confidence.lookup: 'answered' | 'failed' | 'disabled'`, routed into BUG-73's existing banner.
3. **Fix §4.2 step 4's short-circuit** (F5): `'none'` when `countryOptions.length === 0`, plus the missing test row.
4. **`classifyDiscovery(candidates, truncated, permitted: PermittedCountries, userSelectedCountryCode, requestedRegionIso)`** (F6/P1) — free today, expensive after D-19.

**Frontend brief:**
5. Re-anchor every line citation to current `main`, and state explicitly that **BUG-73's `failed` early-return is preserved and runs first** (F7). Strike §7.4's "do not run in parallel" and §10's "COO decision required" — BUG-73 merged cleanly and left the D14 branch untouched by design.
6. Render the `'suggested'` chip per UX spec §3.2 (`Suggested: France — from "Rome"`), which is already designed and already in MVP scope per UX §12.2 item 3.

**Documents:**
7. Stamp UX spec §3.2/§10 in whichever PR changes the behaviour (F1, lifecycle rule 2) — and reconcile *four* documents, not two.
8. Narrow the GE-15 amendment's scope per §10 above; it gets smaller under the three-valued output, not larger.
9. Correct §3.3's "narrowed" to record that reason (ii) was **falsified** and the resolution-path acceptance re-founded on §5's cost argument (F8).

**Sequencing (P3):** the §9.5 staging `[GEO]` probe is currently scheduled *after* the fix ships, yet the ruling itself says that one line *"answers every question §11 lists as unverified."* Adding the log line is a ~5-line, zero-behaviour-change PR. **Deploy it first, read `raw`/`limit`/`truncated` for a dozen real names, then set `DISCOVERY_LIMIT`, the truncation policy and the `featuretype` question with evidence.** This is the same discipline as the deployment-shakedown rule (OP-32): do not fix a threshold against an environment nobody has measured — that is the exact blind spot that let BUG-71 ship in the first place.

---

*Reviewer's note: I did not edit the ruling. Per OP-28 it is another agent's deliverable and these findings are filed separately for COO adjudication.*

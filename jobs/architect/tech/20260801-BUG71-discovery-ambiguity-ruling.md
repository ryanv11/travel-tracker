# BUG-71 — Architect ruling: giving the ambiguity discriminator real evidence

**Date:** 2026-08-01
**Author:** Architect (fresh dispatch; no authorship of ADL-46, of the F1/F2 ruling, or of any ADL-46 stage)
**Branch:** `chore/bug71-ambiguity-ruling`
**Tracker:** BUG-71 (P1) · related BUG-72, BUG-73, QUAL-21, QUAL-22, UX-12, D-19, ENV-01
**BRD:** GE-16 (violated), GE-15 (in tension — see §8)
**Inputs:** `jobs/architect/tech/20260801-ADL46-F1-F2-ruling.md` §2.2; `jobs/ux/tech/20260801-UX-city-entry-and-disambiguation-spec.md` §§1, 3.2, 3.3; `jobs/COO/open-dialogues.md` D-19; tracker BUG-71/72/73, QUAL-21/22; `main` @ `a398d10`.
**Status:** Decided. Backend-implementable as written; a Frontend brief must follow in the same release (§7).
**No schema change. No migration. No new requirement ID. One existing BRD success criterion (GE-15) must be amended or the correct fix fails its own UAT — §8.**

---

## 1. Summary table

| # | Decision | Ruling | Confidence |
|---|---|---|---|
| **B1** | How to give the discriminator enough evidence | **Invert the discriminator, don't feed it more.** Auto-fill only on **positive confirmation**; treat thin, truncated or unattributed evidence as *cannot confirm*, never as *unambiguous*. Costs **zero additional Nominatim requests** | **High** |
| **B2** | Detecting that the evidence is incomplete | **Truncation is directly observable and free.** `nominatimSearch` returns `truncated = rawResultCount >= limitSent`. Nominatim truncates before our settlement filter, so the raw count is the only valid basis | **High** |
| **B3** | Candidate approach (a) — raise `limit` | **Adopt, discovery call only: `limit=10 → 40`.** Same request count, no extra rate-limit exposure. It is an *enabler* for B1 (makes "not truncated" achievable), **not a fix on its own** — raising the limit without B1 still auto-resolves, just from a bigger sample | **High** (as enabler) / **Low** (as a fix — rejected in that role) |
| **B4** | Candidate approach (b) — two-phase lookup | **Reject.** Doubles interactive egress and adds ≥1.1 s to the form for a benefit that is itself unverified, and it **does not remove the need for B1** — a country-constrained query can truncate too. Arithmetic in §6.1 | **High** |
| **B5** | Candidate approach (c) — constrain by trip countries (D-19) | **Reject *as the BUG-71 fix*; endorse as the convergence point.** It is new product behaviour, needs a BRD home and the PO's scope call. Correcting the record: it costs **zero** extra requests (a param on a call we already make) — the reason to defer it is behavioural, not egress | **High** |
| **B6** | Where the decision lives | **Move it to the backend.** The proxy route currently makes no ambiguity decision at all and returns `candidates[0]` as an answer; the real discriminator is hand-rolled in a React component. Add `classifyDiscovery` beside `classifyCandidates`; the route returns a **verdict**, the frontend consumes it | **High** |
| **B7** | The F1/F2 §2.2 frontend/backend parity contract | **Honoured by elimination, and the clause is superseded.** The frontend stops computing the rule, so there are no longer two sides to keep in step. `classifyCandidates` steps 1–4 are **unchanged** | **High** |
| **B8** | Narrowing the region selector when evidence is truncated | **Never narrow on a truncated set.** A shortlist built from an incomplete sample can hide the user's actual region. Show the full list plus the ambiguity signal | **High** |
| **B9** | The resolution path (`classifyCandidates`, coordinate writes) | **Do not change it in this fix.** Instrument only (log `truncated`). It is already country-constrained, so its evidence is far less diluted, and tightening it costs pins with no affordance yet (F1/F2 §5.4) | **High** (scope) / **Medium** (that it needs no change *eventually* — §10.3) |
| **B10** | Does BUG-71's fix require a frontend change | **Yes — see §7.** The backend change alone stops the violation and is independently deployable; without the frontend change the user gets a blank, unexplained form, which is BUG-73's defect class applied to every ambiguous name | **High** |
| **B11** | BRD | **No new requirement ID. GE-15's success criteria must be amended** ("populates both country and region/state **without further user input**") or the correct behaviour fails GE-15 while satisfying GE-16 | **High** |

**Two findings surfaced while ruling, neither in the COO's mechanism nor in the F1/F2 ruling:**

- **The discovery path has no classifier at all — this is the structural root cause.** The F1/F2 ruling's §2.1 instruction ("one exported function, two call sites, never two decision procedures") was applied to `resolveCityName` and `resolveCity`. It never reached `GET /api/geocode`, which calls `nominatimSearch` directly and hand-rolls its own logic. Established by two independent probes: (1) reading `src/backend/routes/geocode.ts` in full — it imports `nominatimSearch` and nothing else from the geocoding layer; (2) a repo-wide grep for `classifyCandidates`, whose only non-test call sites are `geocoding.service.ts:197` and `:270`. So the ambiguity decision for the flow the PO actually used lives in `AddPlaceFlow.tsx:250–263` — a React component — and the backend contributes a `candidates[0]` guess.
- **§2.2's *acceptance* of this limit rested on a justification that BUG-71 falsifies.** The limit is described accurately, but the stated reason for accepting it was that *"the case is dominated by non-region-tier countries, where `region_id` must be NULL and the region selector does not render — so there is no control to ask through."* BUG-71 fired in the **United States**, a region-tier country, where the selector renders and the control exists. The acceptance is therefore **narrowed, not reversed**: it remains defensible for the resolution path in non-region-tier countries (B9), and it is not defensible on the discovery path. See §3.3.

---

## 2. Mechanism — verified, with one sharpening of the COO's statement

Every link in the COO's chain reproduced by code read. Line references are `main` @ `a398d10`.

| Step | Evidence | Verdict |
|---|---|---|
| Discovery lookup carries no country constraint | `useCities.ts:47` — `new URLSearchParams({ q: cityName })`, nothing else | **Confirmed** |
| Fired from `handleOpenNewCityForm` | `AddPlaceFlow.tsx:239–241`, inside the click handler — **once per form open, not per keystroke** | **Confirmed** |
| Proxy queries Nominatim globally at `limit:'10'` | `geocode.ts:47` — `{ q, limit: '10' }`; `countrycodes` is set **only** when `country_code` is supplied (`:48`) | **Confirmed** |
| Settlement filter thins the set | `nominatim-client.ts:137–142` — survives only if `type == null \|\| SETTLEMENT_TYPES.has(type)` | **Confirmed** |
| Frontend requires non-null `region_iso` among same-country candidates | `AddPlaceFlow.tsx:250–258` | **Confirmed** |
| `> 1` test fails → `else` branch auto-fills | `AddPlaceFlow.tsx:260–265` | **Confirmed** |

**Sharpening.** The COO writes that the surviving set "collapses to 1". Tracing the branches exactly, the auto-fill fires under a narrower and more specific condition than that phrasing implies, and the precise condition matters for the fix:

> `region_iso` in the response is `candidates[0].regionIso` (`geocode.ts:74`) — the **top global** candidate's region. `sameCountryRegionIsos` is computed over candidates sharing `candidates[0].countryCode`. Since `candidates[0]` is necessarily a member of that subset, the `else if (regionIso)` branch can only fire when `candidates[0]` carries a region **and** the same-country distinct set is **exactly 1**. A set of size 0 leaves `regionIso` null and fills nothing.

So the observed defect is: *the top global candidate was Springfield, Virginia, and no other US Springfield in the ten returned rows carried a differing `ISO3166-2-lvl4`.* Whether that was truncation, settlement-filtering, or missing `ISO3166-2-lvl4` **is not established from here** and the fix is deliberately built so that it does not need to be (§3.2, §11.1).

**The defect class, stated once.** The current rule asks *"do the candidates I happen to hold disagree?"* and reads **no disagreement as agreement**. That is absence of evidence promoted to evidence of absence — the same failure shape as this project's negative-findings rule, encoded in runtime logic instead of a deliverable.

---

## 3. B1/B2 — the ruling

### 3.1 The principle

> **Auto-fill a field only when the evidence positively confirms a unique answer. Anything else — truncated, unattributed, or divided evidence — is `cannot confirm`, and `cannot confirm` asks the user.**

This is the correct generalisation of what GE-16 already mandates and of tier 1 of the UX spec's three-tier precedence. It costs nothing on the discovery path because **the control is already on screen** — refusing to pre-fill a form field the user is looking at is free, which is exactly why the same strictness is *not* extended to the resolution path (B9, §5).

### 3.2 Why this is robust to not knowing what Nominatim returns

The brief requires a design that does not depend on Nominatim being generous. This one inverts the dependency:

- The **old** rule needed Nominatim to *volunteer* a second region before it would ask the user. Generosity was a precondition for correctness.
- The **new** rule needs Nominatim to volunteer a *complete, fully attributed, unanimous* set before it will answer for the user. Thin evidence now produces the safe outcome by construction.

The sharpest test of the design: **enumerate the conditions under which the new rule still auto-fills "Virginia" for "springfield".** All of these must hold simultaneously — Nominatim returned fewer rows than the limit we asked for (so we hold the complete set), every candidate is attributed to a country, they are all in one country, every one carries a `region_iso`, and every one is `US-VA`. In that world **Virginia is the only Springfield Nominatim knows**, and pre-filling it is correct. The rule can therefore only fail toward a right answer. That property holds without knowing a single fact about the live payload.

### 3.3 Amending F1/F2 §2.2 — precisely what changes and what does not

| F1/F2 §2.2 clause | Disposition |
|---|---|
| `classifyCandidates` steps 1–4 (the resolution path) | **Unchanged.** Not touched by this ruling |
| The accepted limit, *for the resolution path* | **Retained**, on its original reasoning (§5) |
| The stated *justification* for accepting it ("dominated by non-region-tier countries… no control to ask through") | **Narrowed.** True of the resolution path; false of the discovery path, where a control always exists. BUG-71 is the counter-example |
| The frontend/backend parity contract ("any future change to step 4 changes both sides or neither") | **Superseded (2026-08-01) by this ruling §4.** Satisfied in the strongest available way — by deleting one of the two sides. Step 4 is unchanged; the frontend no longer computes it |

---

## 4. B6 — `classifyDiscovery`: the algorithm

`classifyDiscovery` answers a **different question** from `classifyCandidates` — *"what may we pre-fill in a form the user is looking at?"* versus *"may we write coordinates to a shared catalogue row?"* — so §2.1's one-classifier instruction is honoured, not breached: that instruction forbids two procedures answering the *same* question differently. §4.4 pins the relationship between them with a testable invariant so they cannot drift.

### 4.1 `nominatim-client.ts` — carry the truncation signal

Truncation must be measured on the **raw** array, before the settlement filter: Nominatim truncates at `limit` and only then do we discard non-settlements. A raw set of 40 that filters down to 3 is still truncated evidence.

```ts
export type NominatimSearchResult =
  | { status: 'ok'; candidates: NominatimCandidate[]; truncated: boolean }
  | { status: 'disabled' }
  | { status: 'error' };
```

In `run()`, after parsing `data` and before filtering:

```ts
const limitSent = Number(params.limit);
const truncated = Number.isFinite(limitSent) && data.length >= limitSent;
console.info(`[GEO] q="${params.q}" raw=${data.length} limit=${limitSent} truncated=${truncated}`);
```

Three binding notes:

1. **`limit` becomes mandatory.** Both existing call sites already pass it; make it a required key so a future caller cannot silently inherit Nominatim's default and produce an unsound `truncated=false`.
2. **`>=`, not `===`.** Defensive against a server returning more than asked.
3. **The log line is deliberate and is the ENV-01 probe** (§11.2). It is the only instrument that tells us the real cap and the real payload shape, and it costs nothing. Do not remove it as noise.

### 4.2 `geocoding.service.ts` — the new classifier

```ts
/** What the discovery lookup is willing to assert. BUG-71 ruling §4.2. */
export interface DiscoveryConfidence {
  /** Nominatim returned at least the limit we asked for — the set may be incomplete. */
  truncated: boolean;
  country: 'confirmed' | 'ambiguous' | 'none';
  region: 'confirmed' | 'ambiguous' | 'none';
  /** Distinct upper-cased country codes across the eligible set. */
  countryOptions: string[];
  /** Distinct upper-cased region ISOs within the settled country; [] when none is settled. */
  regionOptions: string[];
}

export interface DiscoveryVerdict {
  confidence: DiscoveryConfidence;
  /** Confirmed country, or null. NEVER a guess. */
  countryCode: string | null;
  /** Confirmed region ISO, or null. NEVER a guess. */
  regionIso: string | null;
}

export function classifyDiscovery(
  candidates: NominatimCandidate[],
  truncated: boolean,
  requestedCountryCode: string | null,
  requestedRegionIso: string | null,
): DiscoveryVerdict;
```

**Algorithm — implement exactly this, in this order.**

1. **Eligibility.**
   `E = requestedCountryCode == null ? candidates : candidates.filter(c => c.countryCode?.toUpperCase() === requestedCountryCode.toUpperCase())`
   A candidate with a null `countryCode` is dropped when a country was requested — it cannot confirm the user's selection. (Same rule as `classifyCandidates` step 1.)

2. **Empty `E`** → `{ country:'none', region:'none', countryCode:null, regionIso:null, countryOptions:[], regionOptions:[], truncated }`. Terminal.

3. **Country.**
   - If `requestedCountryCode != null` → `country = 'confirmed'`, `countryCode = requestedCountryCode.toUpperCase()`, `countryOptions = [countryCode]`. *A user's explicit selection is ground truth (GE-16, D12 rule 3) — it is confirmed by fiat, not by the geocoder.*
   - Otherwise, let `countryOptions` = distinct non-null upper-cased `countryCode` over `E`, and `allAttributed = E.every(c => c.countryCode != null)`. Then:

     | Condition | `country` | `countryCode` |
     |---|---|---|
     | `countryOptions.length === 0` | `'none'` | `null` |
     | `!truncated && allAttributed && countryOptions.length === 1` | `'confirmed'` | `countryOptions[0]` |
     | otherwise | `'ambiguous'` | **`null`** |

4. **Region.** If `countryCode == null` (country unsettled), return `region = 'ambiguous'`, `regionIso = null`, `regionOptions = []` — a region is not a meaningful question until the country is settled. Otherwise let `Ec = E.filter(c => c.countryCode?.toUpperCase() === countryCode)`:
   - If `requestedRegionIso != null`: `matches = Ec.filter(c => c.regionIso?.toUpperCase() === requestedRegionIso.toUpperCase())`. `matches.length >= 1` → `region='confirmed'`, `regionIso = requestedRegionIso.toUpperCase()`. Zero matches → `region='ambiguous'`, `regionIso=null`, `regionOptions` = distinct over `Ec`. *(This subsumes and replaces the ad-hoc narrowing block at `geocode.ts:55–60`, which must be deleted — it currently mutates the candidate list as a side effect and does not report that it did.)*
   - Otherwise, let `regionOptions` = distinct non-null upper-cased `regionIso` over `Ec`, `allAttributed = Ec.every(c => c.regionIso != null)`:

     | Condition | `region` | `regionIso` |
     |---|---|---|
     | `regionOptions.length === 0` | `'none'` | `null` |
     | `!truncated && allAttributed && regionOptions.length === 1` | `'confirmed'` | `regionOptions[0]` |
     | otherwise | `'ambiguous'` | **`null`** |

**`'none'` is deliberately distinct from `'ambiguous'`.** `'none'` means the geocoder offered no information on that dimension; `'ambiguous'` means it offered conflicting or incomplete information. They warrant different messages ("we couldn't determine the state" vs "multiple matches — choose one"), and BUG-73 needs exactly this distinction to build its three-state presentation. Collapsing them would force BUG-73 to reintroduce it.

**`allAttributed` is the clause that fixes the sparse-`region_iso` half of BUG-71**, independent of truncation: one candidate carrying `US-VA` while four carry nothing is not a unanimous set, it is one data point and four unknowns.

### 4.3 `geocode.ts` — the route

```ts
const limit = String(DISCOVERY_LIMIT);            // 40 — see §4.5
const params: Record<string, string> = { q, limit };
if (country_code) params.countrycodes = country_code.toLowerCase();

const result = await nominatimSearch(params);
const candidates = result.status === 'ok' ? result.candidates : [];
const truncated = result.status === 'ok' ? result.truncated : false;

const verdict = classifyDiscovery(candidates, truncated, country_code ?? null, region_iso ?? null);

res.json({
  candidates: candidates.map(/* unchanged projection */),
  country_code: verdict.countryCode,   // semantics change: CONFIRMED or null
  region_iso: verdict.regionIso,       // semantics change: CONFIRMED or null
  confidence: {
    truncated: verdict.confidence.truncated,
    country: verdict.confidence.country,
    region: verdict.confidence.region,
    country_options: verdict.confidence.countryOptions,
    region_options: verdict.confidence.regionOptions,
  },
});
```

- **`candidates` stays the full projected list, unchanged and unfiltered.** The delete-the-narrowing instruction in §4.2 step 4 removes a side effect on this array, not the array.
- **`country_code` / `region_iso` keep their names and types; their *meaning* changes** from "the top candidate's value" to "a value the evidence confirms, or null". This is a breaking semantic change with exactly one consumer — established by two probes: a grep for `api/geocode` across `src/` (one call site, `useCities.ts:48`) and a grep for the `GeocodeResult` type (declared `types/api.ts:96`, consumed only by `lookupCityCountry`). Keeping the names is deliberate: it makes the backend-only deployment step of §7 behave correctly against the *unmodified* frontend.

### 4.4 The invariant that stops the two classifiers drifting

**`classifyDiscovery` must be strictly stricter than `classifyCandidates` in the confirm direction.** For any candidate set `C` and any resulting non-null `countryCode`:

> `classifyDiscovery(C, t, null, null).confidence.region === 'confirmed'`
> ⟹ `classifyCandidates(C, new Set([countryCode]), null).status === 'ok'`

The converse must **not** hold — that asymmetry is the whole fix. This is a test obligation (§9.1 item 7), not a comment.

### 4.5 B3 — the limit

```ts
/** Discovery lookups only. Same request count, larger payload. BUG-71 ruling §4.5. */
const DISCOVERY_LIMIT = 40;
```

- **Discovery call only.** `resolveCityName` (`geocoding.service.ts:188`) and `resolveCity` (`:253`) stay at `limit: '10'`. Raising them would widen `eligible`, which can flip `ok → ambiguous` and change coordinate-write behaviour — a resolution-path change this ruling explicitly does not authorise (B9). **Do not "tidy" these into a shared constant.**
- **Why it is not the fix.** Raising the limit alone changes *how much* evidence the broken discriminator misreads, not that it misreads it. It is adopted because it makes `truncated=false` reachable for ordinary names, which is what keeps the auto-fill convenience alive under B1.
- **`limit=40` as Nominatim's maximum is UNVERIFIED from this environment** (§11.1 item 2). The code does not depend on the claim: `truncated` compares against the limit *we sent*, and the §4.1 log line reports the real cap on first live use. If the observed raw count plateaus below 40, set `DISCOVERY_LIMIT` to the observed plateau so the `>=` test stays exact.

---

## 5. B9 — why the resolution path is deliberately left alone

The same completeness reasoning would apply to `classifyCandidates`, and it is **not** applied. The distinction is principled and must not be flattened later:

> **Refusing to guess is free where there is a control to ask through, and expensive where there is not.**

- **Discovery path:** the new-city form is open on screen. The country and region selects exist, are already populated, and the region field is already optional. Declining to pre-fill costs the user one interaction with a control they were already looking at.
- **Resolution path:** declining produces a `pending` row — a place with **no pin, no region shading, and no explanation anywhere in the UI** (F1/F2 §5.2, §5.4; the location-status affordance is UX-12, not yet built). F1/F2 §5.4 states the constraint directly: *"until there is an affordance, more pending is a real cost and not a safe default."*
- Additionally, the resolution path's evidence is **already country-constrained** (`countrycodes=` at `geocoding.service.ts:187` and `:252`), so it does not suffer the global dilution that is BUG-71's mechanism. The same defect is structurally much weaker there.

**What ships instead:** the §4.1 log line runs on the resolution path too, so we accumulate truncation evidence for it at zero cost and zero behaviour change. §10.3 states the trigger for revisiting.

---

## 6. B4/B5 — the rejected approaches, with the arithmetic

### 6.1 (b) Two-phase lookup — **Reject**

**The chokepoint, read rather than assumed** (`nominatim-client.ts:34, 46–51, 109–116, 149–152`): `REQUEST_DELAY_MS = 1100`; a single module-level serialized promise chain; spacing enforced from the **start** of the previous request. Ceiling therefore **≈ 0.909 req/s ≈ 54.5 req/min, application-wide**, shared by the 15-minute queue, resolve-then-create, and the interactive proxy.

**Current cost of one "add a new city" journey** (call sites verified: `cities.ts:300` `resolveCityName`, `cities.ts:379` and `:206` `resolveCity`):

| Step | Requests |
|---|---|
| Discovery proxy (once per form open) | 1 |
| `POST /api/cities` → `resolveCityName` | 1 |
| Fire-and-forget `resolveCity` (skipped when ambiguous, F1/F2 §2.6) | 0–1 |
| **Total** | **2–3** |

Two-phase makes that **3–4**, a **+33–50 %** increase on the interactive path, and every additional request costs the user a minimum of 1.1 s of "detecting…" *before* network time, on top of whatever slot the chain is already serving.

**But the decisive objection is not the cost — it is that (b) does not remove the need for B1.** A country-constrained phase 2 can truncate exactly as a global phase 1 can; the US alone holds many Springfields. So (b) buys better evidence, not a correct discriminator, and B1 would still have to ship. **A certain cost for an unverified benefit, on top of a fix that is already sufficient.**

*Also considered and rejected: a conditional second phase, fired only when the first lookup could not confirm and the user then picks a country manually.* Cheaper than blanket (b) — bounded by human interaction rate, far below 0.9 req/s — but B8 makes it unnecessary: when evidence is truncated the selector shows the full region list anyway, so the second request buys nothing the user cannot already reach. Recorded so it is not re-proposed as an oversight.

### 6.2 (c) Constrain by the trip's declared countries (D-19) — **Reject as this fix; endorse as the destination**

**A correction to the framing in the dispatch:** (c) does **not** cost additional requests. `countrycodes` accepts a comma-joined list and `nominatimSearch` passes params through verbatim (`nominatim-client.ts:118–122`), so constraining is a *parameter on a call we already make*. The reason to defer it is entirely behavioural.

Rejected as the BUG-71 fix because:

- **It is new product behaviour, not a defect fix.** It changes what the lookup means, introduces a degradation path when `trip_countries` is empty (the common case for a spontaneous trip — UX spec §1), and needs the shortlist-not-filter selection pattern to go with it. D-19 states plainly that it *"still needs a BRD home and the PO's call on scope."*
- **It would make BUG-71 wait on a design that has not started** — a P1 defect against an already-shipped success criterion held behind a BRD bump, an Architect design, and Backend + Frontend briefs.
- **It does not subsume B1 either.** A trip declaring only `US` still faces every US Springfield. Trip-country constraint improves the *sample*; only B1 fixes the *discriminator*.

**Endorsed as the destination.** B1 is a strict prerequisite for D-19 rather than a detour from it: D-19's item 3 (*"a selection the geocoder cannot confirm stays pending"*) is precisely the confirm-don't-guess principle, and `classifyDiscovery` already takes `requestedCountryCode` — D-19 passes the trip's set through the parameter that exists. QUAL-21 remains D-19's prerequisite; this ruling adds route-level coverage of the discovery path (§9.2), which is a down payment on it.

---

## 7. B10 — **Does BUG-71's fix require a frontend change?** (explicit answer for sequencing)

**Yes — but the two halves are separable, and the COO should sequence them as two briefs in one release.**

### 7.1 The backend change alone stops the violation, and is independently deployable

Traced branch by branch through the **unmodified** `AddPlaceFlow.tsx`, with the backend returning `country_code: null, region_iso: null` on an unconfirmed lookup:

| Line | Behaviour with the unmodified frontend |
|---|---|
| `:243` `if (countryCode)` | false → country not set. The user must choose |
| `:250–258` `sameCountryRegionIsos` | `countryCode` falsy → ternary yields `[]` |
| `:260` `length > 1` | false |
| `:263` `else if (regionIso)` | `regionIso` null → **nothing is auto-filled** |

**The GE-16 violation is closed by the backend brief alone.** This satisfies ADL-47's expand/contract discipline: the backend PR is independently green and independently correct.

### 7.2 It is not acceptable to stop there

Without the frontend change the user opens the form and finds country and state blank with **no explanation** — which is precisely BUG-73's defect ("the user cannot distinguish: the lookup confidently answered / found nothing / never completed"), now applied to every ambiguous name rather than only to infrastructure transients. It also discards the D14 selector-narrowing affordance that PR #341 already built.

### 7.3 The Frontend brief — scope

Small, and mostly deletion. All within `AddPlaceFlow.tsx` + `types/api.ts` + `useCities.ts`.

1. **`types/api.ts`** — add `confidence` to `GeocodeResult`; **`useCities.ts`** — return it from `lookupCityCountry`.
2. **Delete** the `sameCountryRegionIsos` computation (`AddPlaceFlow.tsx:250–258`) and the `> 1` test. This is the parity side being removed under B7.
3. **Consume the verdict:**
   ```ts
   if (countryCode) setNewCityCountryCode(countryCode);
   if (regionIso) setAutoRegionIso(regionIso);          // no longer an `else if`
   setCandidateRegionIsos(
     confidence.region === 'ambiguous' && !confidence.truncated && confidence.region_options.length
       ? confidence.region_options
       : null,
   );
   ```
   The `!confidence.truncated` guard is **B8** and is load-bearing: a shortlist derived from an incomplete sample can omit the user's actual region, and the existing narrowing replaces the option list rather than promoting within it (`AddPlaceFlow.tsx:125–131`). On a truncated set, show the full country list.
4. **Signal, three distinct states** — replacing the single `regionChoiceIsAmbiguous` hint at `:460–465`:
   - `region === 'confirmed'` → silent, as today.
   - `region === 'ambiguous'` → *"Multiple matches — choose one"* (UX spec §3.3 specifies this placeholder wording and the `Springfield — Illinois` option labelling; **adopt it, do not re-invent it**).
   - `region === 'none'` and `country === 'ambiguous' | 'none'` → *"We couldn't confirm this automatically — please choose."*
5. **The manual country-change handler (`:436–443`) must stop clearing `candidateRegionIsos` blindly.** With the country now often unconfirmed, a manual country pick is the *normal* path, and today's line 442 discards the candidate evidence at exactly that moment. Recompute the region projection for the newly chosen country from the `candidates` array already in hand — a pure projection, **not** a re-run of the ambiguity decision, and **not** a second network call (§6.1). If the response was `truncated`, do not narrow.

### 7.4 Ordering, and a collision the COO must resolve

> **BUG-73 (issue #352, open, not yet dispatched) rewrites the same function this ruling changes** — `lookupCityCountry`, `useCities.ts:41–57` — to add retry, and changes the same failure presentation in `AddPlaceFlow`. Two independent briefs editing one function will conflict.

Recommended sequence: **Backend (this ruling) → Frontend (§7.3) merged with BUG-73 as one brief.** They are the same surface and the same user question — BUG-73 supplies the "never completed" state, this ruling supplies "confidently answered" and "answered ambiguously". BUG-73's own tracker note already anticipates it: *"Pairs with BUG-71: once ambiguity is surfaced properly, these three states each need their own distinct presentation."* Splitting them will produce two partial pictures of one three-state control.

---

## 8. B11 — BRD position, stated plainly

**No new requirement ID. No new BRD home. But one existing success criterion must be amended, or the correct fix fails UAT.**

- **GE-16 already requires this fix.** Its criteria include *"where a lookup returns more than one candidate the user is asked to choose rather than one being selected for them, and declining to choose still creates a usable pending record"* and *"the country and region a user explicitly selected are never overwritten by the geocoding lookup."* This ruling adds no capability — it removes an incorrect one and reuses the D14 selector already shipped. **Dispatchable as a defect fix.**
- **GE-15's success criteria contradict it as written.** GE-15 (BRD line 126) states: *"entering a city in a Region-tier-enabled country populates both country and region/state **without further user input**."* Read literally, the correct behaviour **fails GE-15** whenever the lookup cannot confirm. GE-15 and GE-16 are in genuine tension in the ambiguous case, and GE-16 is both the newer requirement (v3.13 vs v3.12) and the more specific one.

**Required amendment — an existing-ID clarification, not a new ID.** GE-15's criteria should state that the auto-populate guarantee applies **when the lookup unambiguously confirms a single answer**, and that where it cannot, GE-16's ask-don't-guess rule takes precedence and the field is left blank and editable. Note that GE-15 already carries an adjacent clause of exactly this shape — *"a geocoding result that cannot be resolved to a seeded region leaves the region blank and editable rather than blocking city creation or inventing a region"* — so this extends a principle GE-15 has already accepted rather than reversing its intent.

**Consequence for dispatch, which is the part the COO needs:** BUG-71's Backend brief is **not** blocked on this. The UAT verdict is. Amend GE-15 before the UAT round, or a correct fix will be scored a failure against a stale criterion.

**D-19's sequencing note ("likely a GE-15 amendment rather than a new ID") is consistent with this** and should be folded into the same bump when D-19 is picked up, not duplicated.

---

## 9. Test obligations

QUAL-21 established that route suites mocking the geocoder away were the root cause of two shipped defects. **BUG-71 is the third, and it reached production through a surface with no backend test at all** — verified two ways: a repo-wide grep for `geocodeRouter|/api/geocode` in test files returns only a *frontend hook* test (`src/frontend/hooks/__tests__/useCities.geocode.test.tsx`), and a filename search for `*geocode*` finds no file under `src/backend/**/__tests__`. Probes fail differently: the first would catch a differently-named file, the second a differently-worded reference.

### 9.1 `classifyDiscovery` — table-driven, one row per branch (`geocoding.service.test.ts`)

1. **The BUG-71 fixture.** Ten candidates, `truncated=true`, one `US-VA` and the rest with null `regionIso` → `region: 'ambiguous'`, `regionIso: null`. **Must fail before the fix.**
2. Two candidates, `truncated=false`, both `US-CO` → `region: 'confirmed'`, `regionIso: 'US-CO'`. *(Preserves the F1/F2 §1 regression fix — the granularity-duplicate happy path must still auto-fill.)*
3. Same as (2) but `truncated=true` → `'ambiguous'`. **Truncation alone is sufficient to withhold.**
4. Same as (2) but one candidate has null `regionIso` → `'ambiguous'`. **Unattributed alone is sufficient.**
5. Candidates spanning `US` and `CA`, `truncated=false` → `country: 'ambiguous'`, `countryCode: null`, `region: 'ambiguous'`, `regionOptions: []`.
6. `requestedCountryCode='US'` supplied with mixed-country candidates → `country: 'confirmed'` (user's ground truth), eligibility filtered to US.
7. `requestedRegionIso` supplied, one match → `'confirmed'`; zero matches → `'ambiguous'` with `regionOptions` populated. *(Replaces the deleted `geocode.ts:55–60` behaviour.)*
8. Zero candidates → `country:'none'`, `region:'none'`.
9. All candidates carry null `regionIso`, `truncated=false` → `region: 'none'` (not `'ambiguous'`).
10. **The §4.4 invariant**, over the same fixtures as `classifyCandidates`' existing table: `region === 'confirmed'` ⟹ `classifyCandidates` returns `ok`. Assert the converse does **not** hold on fixture (3).

### 9.2 Route-level — `src/backend/routes/__tests__/geocode.test.ts` (new file; this is the QUAL-21 gap on this surface)

Against a **candidate-returning fake** of `nominatimSearch`, not a `disabled` stub:

11. Unconfirmed lookup → `country_code` and `region_iso` are **null** in the response body, `candidates` is still fully populated, `confidence` present.
12. Confirmed lookup → both fields populated.
13. `truncated` is propagated from the client into `confidence.truncated`.
14. The route sends `limit=40` and `countrycodes` only when `country_code` was supplied. *(Guards the §4.5 "discovery only" boundary.)*
15. `requireAuth` still gates the route (401 unauthenticated).

### 9.3 Client-level — `nominatim-client.test.ts`

16. `data.length === limitSent` → `truncated: true`; `data.length < limitSent` → `false`.
17. **Truncation is computed on the raw array, not the filtered one:** 40 raw rows of which 37 are non-settlements → `candidates.length === 3` **and** `truncated === true`.

### 9.4 Frontend

18. The existing parity tests (`AddPlaceFlow.test.tsx:227+`) **must be updated, not deleted.** Their fixtures need the new `confidence` block; the Denver case (2) must still auto-select and the Springfield case must still show the hint. Their *header comment* citing the F1/F2 parity contract must be restamped to reference B7's supersession.
19. `useCities.geocode.test.tsx` — `lookupCityCountry` returns `confidence`; the silent-failure contract still returns a safe default (coordinate with BUG-73 per §7.4).
20. A truncated-but-region-ambiguous response renders the **full** region list, not the narrowed one (B8).

### 9.5 Staging — the only probe that closes ENV-01 on this path

21. On the deployment shakedown, type `springfield` and read the `[GEO]` log line (§4.1). Record `raw`, `limit`, `truncated`. **This single line answers every question §11 lists as unverified** and tells us whether `DISCOVERY_LIMIT=40` is the effective cap.

---

## 10. Reconciliation with tracked follow-ons — what this ruling does and does not absorb

| Item | Relationship | Action |
|---|---|---|
| **QUAL-21** (resolve-then-create has no route-level coverage) | **Partly discharged, not closed.** §9.2 adds route-level coverage for the *discovery* route against a candidate-returning fake. The resolve-then-create path remains as QUAL-21 describes it | Keep open; note the discovery half is now covered |
| **QUAL-22** (QA geocoding mock drifted) | **Directly aggravated.** The `NominatimSearchResult` shape changes in §4.1, so any mock returning `{status:'ok', candidates}` without `truncated` is now stale in a *second* way | Fold the mock repair into the Backend brief — do not leave it to drift further |
| **BUG-73** (#352, silent failed lookup) | **Same function, same control, unassigned.** See §7.4 | **COO decision required:** merge with the Frontend brief, or sequence strictly. Do not run in parallel |
| **BUG-72** (#351, search dropdown shows no region) | Independent surface (catalogue search, not the geocode proxy), but the **same user need**: a Springfield the user cannot identify. It also needs a region join on `GET /api/cities` | No conflict. Ship in the same release if convenient |
| **UX-12** (no "Change city" control, no location-status badge) | **Unblocked-adjacent.** §5's argument for leaving the resolution path alone is explicitly conditional on UX-12 being absent | Note the dependency in B9's trigger |
| **D-19** | **B1 is its prerequisite, not its competitor.** §6.2 | Keep open; record that the "unmeasured ≠ rare" amendment is reinforced, not superseded |
| **ENV-01** | The §4.1 log line is the standing instrument | §9.5 |
| **UX spec §3.2/§3.3** | **Adopted, not re-specified.** §7.3 item 4 defers to it for wording, option labelling and the `Suggested:` treatment | The Frontend brief cites the UX spec directly |

### 10.3 The one deferred item, with a trigger (not an open-ended "later")

**The resolution path's own truncation exposure (B9).** `resolveCityName`/`resolveCity` query at `limit: '10'`, country-constrained. If the §4.1 log shows `truncated=true` on that path at a material rate, `classifyCandidates` step 4 is resolving coordinates from an incomplete sample and §2.2's accepted limit needs revisiting there too.

**Trigger:** any of — (i) staging logs show `truncated=true` on a resolution-path query; (ii) UX-12 ships, which removes §5's "no affordance" objection to more `pending` rows; (iii) D-19 proceeds, which makes this path primary. **Owner:** Architect. This is recorded rather than fixed because acting now would trade a rare wrong pin for a guaranteed missing one with nothing on screen to explain it — but "acceptable today" is not a justification, so it carries a trigger.

---

## 11. Verified vs. unverified

### 11.1 Unverified, with the probe and its blind spot

1. **Live Nominatim payload shape for `springfield` — UNVERIFIED.** I ran no live query. Whether the ten returned rows were truncated, thinned by `SETTLEMENT_TYPES`, or simply missing `ISO3166-2-lvl4` is **not established**, and this ruling deliberately does not depend on which (§3.2). *Probe run:* two independent network probes, below. *Blind spot:* the distribution of `ISO3166-2-lvl4` presence across countries, and the real frequency of each of §4.2's branches — i.e. **how often** the new rule will withhold the auto-fill in ordinary use. That is a UX-cost question, and §9.5 is the instrument.
2. **`limit=40` as Nominatim's documented maximum — UNVERIFIED.** Taken from the dispatch brief; I could not read the API documentation from here (same firewall). *Blind spot:* if the server silently caps below 40, a capped response reads as `truncated=false`. *Why the design survives it:* a false `truncated=false` still has to pass the `allAttributed` and unanimity clauses before anything is auto-filled, and a silently-capped set of Springfields would fail at least one. The §4.1 log line resolves it on first live use.
3. **`type == null` pass-through in the settlement filter** (`nominatim-client.ts:141`) — inherited unverified from F1/F2 §6.3, not re-probed. It widens the candidate set, which can only make `countryOptions`/`regionOptions` larger and therefore biases toward `'ambiguous'` — the safe direction under this ruling, where under the old rule it was the unsafe one.
4. **The frequency argument in §5** (that the resolution path's country-constrained query suffers less dilution) is a *structural* claim about query scope, which is verified; the claim that it therefore truncates *less often* is **UNVERIFIED** and is why §10.3 carries a trigger rather than a conclusion.
5. **No browser was driven.** The §7.1 branch trace is established by reading `AddPlaceFlow.tsx` line by line, not by observing the form. §9.4 is the corresponding test obligation.

### 11.2 Verified, and how

- **Nominatim is unreachable from this devcontainer (ENV-01).** Two probes that fail differently: (1) a TCP connect to `nominatim.openstreetmap.org:443` failed in **36 ms** — an immediate reject, not a timeout — while (2) `getent hosts` resolves the name correctly, so DNS is not the blocker, and the firewall allowlist at `/usr/local/bin/init-firewall.sh` (default-REJECT with an explicit domain loop, lines 140–149) contains **zero** matches for `nominatim` or `openstreetmap`. Probe (1) would still pass if the host were allowlisted under a CDN alias; probe (2) would still miss a raw IP added elsewhere. Together they establish it.
- **The discovery route makes no ambiguity decision.** Two probes: reading `geocode.ts` in full (its only geocoding-layer import is `nominatimSearch`), and a repo-wide grep for `classifyCandidates` whose non-test call sites are `geocoding.service.ts:197` and `:270` only.
- **There is no backend test for `GET /api/geocode`.** Two probes, §9 opening paragraph.
- **`/api/geocode` has exactly one consumer.** Two probes: grep for `api/geocode` across `src/`, and grep for the `GeocodeResult` type.
- **The chokepoint's timing and serialization** (§6.1) — read from `nominatim-client.ts:34, 46–51, 109–116, 149–152`, not assumed.
- **Every row of §2's mechanism table** — direct code read at the cited lines.
- **The `else if (regionIso)` sharpening in §2** — traced through `geocode.ts:73–74`, `useCities.ts:49–53` and `AddPlaceFlow.tsx:250–265` together, since the claim depends on all three agreeing about which candidate `region_iso` comes from.

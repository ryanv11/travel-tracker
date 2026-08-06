# BUG-75 (headline half) + UX-12 — picker-precedence composition & the "Change city" entry point

**Author:** Architect · **Date:** 2026-08-06
**Branch:** `feat/bug75-pickerprecedence-design`
**Tracker:** BUG-75 (P1), UX-12 (P1) · **Requirement:** GE-16 (`_project/travel-tracker-BRD.md` §5.2)
**Builds on (SETTLED, not re-opened):** PR #409 (carry channel + shared `CityPicker`, on `main` @ `fe23037`),
v3 identity design (`jobs/architect/tech/20260806-BUG75-round4-identity-design-v3.md`), ADL-46 §4.3.2 (D14).
**Status:** DESIGN ONLY — no application code written. Gated on an **OP-27 fresh-eyes review** before any
build brief. This is a design→build transition: it returns to COO + PO for a build check-in; the Architect
does not dispatch the build.

> **Scope discipline.** The identity *model* is fixed and forbidden from re-opening: identity is the CARRIED
> `(osm_type, osm_id)` OSM ref, `display_name` is render payload, distinct `osm_id` coexist, same `osm_id`
> merges, the migration (0016/0017) shipped. This pass designs exactly one thing the shipped build left
> broken — the **frontend picker-precedence composition** in `AddPlaceFlow.tsx` — plus the **UX-12
> "Change city" entry point**, which converges on the same component and must share the same precedence so
> the two flows cannot drift.

---

## 1. Reuse audit (stated up front, per the standing reuse preference)

### REUSE — exists on `main`, do NOT re-implement

| Asset | Location | How this design uses it |
|---|---|---|
| Shared `CityPicker` | `src/frontend/components/shared/CityPicker.tsx` | Renders candidates by region-qualified `display_name`; `onSelect`/`truncated`/`disabled`. Used **as-is** by both flows. |
| Lookup + candidate classification | `AddPlaceFlow.tsx:332-421` (`handleOpenNewCityForm`), `distinctOsmIds`/`sameCountryRegionIsos` computation `:389-393` | The lookup and the two candidate-set computations are correct and kept. Only the **branch order** changes (§6). |
| Pick → identity carry (F4 already shipped) | `handleSelectPickerCandidate` `:295-321` | Already derives `region_id` from the pick's `region_iso` via the seeded map and carries `(osm_type, osm_id, display_name)`. **Reused unchanged.** |
| Incomplete-seed region fallback | `narrowedRegionOptions`/`regionOptions` `:181-187` | Never auto-selects a lone survivor from a hand-seeded table. **Preserved.** |
| BUG-71 "Suggested:" tentative region | `regionIsSuggested`/`suggestedRegionName` `:115,197,708-713` | Single-candidate auto-fill stays tentative. **Preserved (do not touch).** |
| BUG-79 truncation caveat | `lookupTruncated` `:122,359`; `CityPicker` `truncated` prop | Carried into the picker. **Preserved.** |
| Re-point backend (D11) | `PATCH /api/trips/:tripId/places/:placeId` with `city_id` — `places.schemas.ts:36`, `places.ts:162-202` | **Verified present on `main`** (positive probe: schema field + route destructure + repoint block). UX-12 consumes it; **no backend change requested.** |
| Update-place mutation hook | `useUpdatePlaceDates` — `usePlaces.ts:101` | Extended to pass an optional `cityId` (or a thin sibling `useChangeCity`). Small. |
| Badge mechanism | `StatusBadge` / `BADGE_HUE_CLASSES` `'locked'` hue — `design/badges.ts:46,82` | The UX-12 "Location not confirmed" badge reuses the existing **`locked`** hue (grey, hue 80). **Zero new hues** (UX spec §12.2). |
| Edit/pencil glyph | Waypoint icon set (UX spec §5) | The "Change city" control's icon. No new asset. |

### ADD — net-new

- **`decideCityDisambiguation(candidatesForCountry)`** — a **pure** precedence-decision function (§6/§9). The single source of truth for the composition; the reorder lives here.
- **The reorder** — evaluate the picker branch *before* the region branch (§6).
- **A shared hook** (`useCityDisambiguation`) wrapping the lookup + the pure function, consumed by both flows (§9).
- **`ChangeCityModal`** — the UX-12 entry point (§8), reusing the hook + `CityPicker` + the D11 PATCH.
- **A standing "Change city" control** on `PlaceSection` (§8).
- **A single "Location not confirmed" badge** on `PlaceSection` (§8, UX spec §12 MVP).

### CHANGE — behaviour change, tests move (supersedes D14 for one branch)

- The multi-region region-`<select>` narrowing is **no longer primary**; it becomes the **no-`osm_id` fallback** (§6, §7). D14's region-**first** precedence is superseded for the positive-identity-evidence branch. Tests asserting region-first for a spanning-`osm_id` name move to assert picker-first.

---

## 2. The remaining defect, stated precisely (confirmed against shipped code)

`AddPlaceFlow.tsx:395-409` (on `main`, PR #409) resolves the two disambiguation branches **mutually
exclusively, region-first**:

```js
if (sameCountryRegionIsos.length > 1) {        // region-narrowing <select>
  setCandidateRegionIsos(sameCountryRegionIsos);
} else if (distinctOsmIds.size > 1) {          // place-level CityPicker
  setPlacePickerCandidates(candidatesForCountry);
} else if (regionIso) {                        // single-candidate tentative auto-fill
  setAutoRegionIso(regionIso); setRegionIsSuggested(true);
}
```

**Why the headline case is still broken.** A real "Newport" GB lookup returns candidates spanning **>1
region** (captured evidence, §5): so `sameCountryRegionIsos.length > 1` is **true** and the region branch
**pre-empts the picker, which never fires**. The user picks a region (England), but England still contains
**≥2 distinct Newports** (Isle of Wight vs Telford). The region `<select>` collapses those into one region
choice with no further disambiguation, and the specific England Newport **auto-resolves silently to the
wrong pin** — the exact BUG-75 defect class (silent wrong-town, same class as BUG-71). The shipped picker
only ever fires when **all** candidates already share one region.

This is a **system auto-population defect, not a user-choice issue** (the PO's framing, correct): the system
silently commits an identity the user never chose.

> **Absence claim, two-probe (OP-26).** "The place-picker never fires for a multi-region name." Probe 1:
> read the branch above — the region condition is evaluated first and is mutually exclusive (`else if`), so
> a multi-region candidate set can never reach the picker branch. Probe 2: the tracker note records the
> QA-verify live Nominatim probe that reproduced it (the all-green suite hid it because
> `AddPlaceFlow.city-picker.test.tsx`'s four-Newport fixture was **same-region** — it omitted Wales). Two
> independent probes, established.

---

## 3. The three proposals — evaluation

| # | Proposal | Verdict |
|---|---|---|
| **1** | Make the picker **primary** on positive identity ambiguity (≥2 distinct `osm_id`), checked **before** the region branch. One region-qualified pick disambiguates across **and** within regions. | **CHOSEN (refined, §6).** The only composition that fixes the actual defect in one control. Cost: supersedes D14's region-first precedence — resolved on evidence in §5. |
| **2** | Compose two-step: keep the region `<select>`, then re-fire the picker if ≥2 distinct `osm_id` remain in the chosen region. | **Rejected as primary (§5).** Preserves D14 verbatim but forces the *headline bug case* (Newport) through a mandatory extra region step that the picker's region-qualified rows already make redundant — optimising the composition for the case that isn't broken (Springfield) at the expense of the one that is. That is the region-first mistake restated. Its insight (region as a legibility aid for long lists) is retained as a **non-blocking future picker-internal enhancement** (§5). |
| **3** | Stopgap: when spanning-region + ≥2 distinct `osm_id`, create **PENDING** instead of silent auto-resolve. | **Rejected.** It stops the *wrong pin* but discharges nothing of GE-16's "presents all of them distinguishably" — it converts a silent-wrong into a silent-nothing and defers the real fix. Acceptable only as an emergency mitigation if the real fix could not ship; it can, so it should not. |

---

## 4. The load-bearing question (the reason this went to Architect)

D14 (ADL-46 §4.3.2) established a **region-first** disambiguation precedence — the "Springfield" case, where a
name recurs across many regions and region is the natural first cut. Proposal #1 makes the `display_name`
picker primary. **Does a single `display_name`-qualified picker cleanly subsume the region selector,
including for the many-candidate Springfield case, or is the two-step composition (proposal #2) genuinely
required to keep Springfield usable?** §5 resolves this on evidence, not assertion.

---

## 5. Resolution of the D14/Springfield question — on evidence

### 5.1 The decisive structural finding: Springfield and Newport are different ambiguity *shapes*

The captured evidence (below) shows the two canonical cases differ not in degree but in **kind**:

- **Springfield — ambiguity is entirely *between* regions.** ADL-48's own analysis (tracker note, verified
  by that doc's OP-27 reviewer over all rows): *"Springfield is genuinely clean — 21 rows, 21 distinct
  region groups."* One Springfield per state. **No region contains two Springfields.** A region cut is
  therefore **sufficient**: pick the state, and exactly one candidate remains.
- **Newport — ambiguity is *both* between and within regions.** Captured live Nominatim (v2 P1a capture +
  the COO's own probe, tracker note): 6 GB settlements — **2 GB-ENG (Isle of Wight, Telford and Wrekin) + 2
  GB-WLS (Newport-city, Pembrokeshire)** among the settlement survivors, with the wider capture showing up
  to 4 distinct England Newports. **A region contains ≥2 distinct Newports.** A region cut is **insufficient**
  — after picking England you still have two places and no way to tell them apart.

The current region-**first** code cannot distinguish these two shapes before it commits: it fires the region
selector for **both** (both span >1 region). For Springfield that is harmless (one candidate per region);
for Newport it is the bug (it pre-empts the only control that could separate the within-region twins).

### 5.2 Does the single `display_name` picker subsume Springfield? — Yes, on two axes

**Legibility.** The `CityPicker` renders each candidate's `display_name`, which Nominatim returns
**region-qualified** and hierarchical. The captured Newport rows confirm this directly — the v3 §B1
live-`/lookup` probe returned, verbatim:

```
node 26700977 | county=Newport            | GB-WLS | "Newport, Cymru / Wales, NP20 1GF, …"
node 27459103 | county=Telford and Wrekin | GB-ENG | "Newport, Telford and Wrekin, England, …"
```

Every row is distinct by its region component; the v2 P1a capture recorded that Newport `display_name`s
"render distinguishably" (they even carry postcodes — presentation, not identity). Springfield's rows are
**structurally identical** in shape (`"Springfield, <County>, <State>, United States"`), so each is
distinguishable by its state component exactly as the Newport rows are by county/nation.

> **UNVERIFIED (marked per OP-26/OP-34), with the probe run and its blind spot.** I could **not** live-probe
> Nominatim this session to capture the *exact* Springfield `display_name` strings or the *exact*
> discovery-limit-40 US Springfield count. Probe attempted: `curl` to `nominatim.openstreetmap.org/status`
> and `/search?q=Springfield…` → **connection refused (exit 7)**, port 443, ~5s. Second probe: the allowlist
> config **is** present (`.devcontainer/init-firewall.sh:213`) — so config says reachable, runtime refuses:
> the documented "firewall regressed, needs container rebuild" state (same two-hosts-fail-differently
> signature recorded for the v1 round). **Blind spot:** the Springfield legibility claim rests on
> Nominatim's *documented and captured* `display_name` contract (identical in shape to the verified Newport
> rows), not on a fresh Springfield capture. The build's ATDD suite must include a real Springfield
> fixture; if the fresh capture ever contradicts the shape, this subsumption argument must be re-checked.

**List length.** The discovery lookup is unconstrained `limit=40` (`geocode.ts:61`), settlement-filtered
(`SETTLEMENT_TYPES` = city/town/village/hamlet/municipality), then filtered to the resolved country. A US
Springfield picker therefore shows **up to ~20 rows** (ADL-48's 21 region groups is the ceiling) — the *same
order of magnitude* as D14's region `<select>` of ~20 candidate states, and each picker row carries **more**
disambiguating information than a bare state name. It is marginally more scanning than a native `<select>`
(which supports type-to-jump), but it is **not unusable** — it is the identical unbounded-list pattern the
existing city **search** results already use (`AddPlaceFlow.tsx:500-512`), which the project already accepts.

### 5.3 Verdict

**Proposal #1 subsumes the region selector for disambiguation, including Springfield.** Proposal #2 is
genuinely *viable* and would preserve D14 verbatim — but it buys a marginally shorter Springfield list by
imposing a mandatory extra region step on the **headline bug case** (Newport), whose region-qualified picker
rows already make that step redundant. Trading correctness ergonomics on the broken case to optimise the
un-broken case is the precise error that produced this bug. **Choose #1.**

**Retained from #2 as a bounded, non-blocking enhancement (not MVP):** if real UAT shows the many-region
Springfield list is painful, add **in-picker region grouping/ordering** (group rows under their region
inside the *one* `CityPicker`) — a picker-internal refinement that gives Springfield the region cut *and*
Newport the single pick, without reviving the broken region-first precedence or a second control. Named so
the option is on record; deliberately **out of MVP scope** to keep the build small and the fix honest.

---

## 6. The chosen composition — picker primary on positive identity evidence

**The change is minimal in code and load-bearing in decision.** Swap the order of the first two branches so
positive identity evidence (`osm_id`) wins over region ambiguity:

```js
// NEW ORDER (picker primary). The lookup and the two set computations are UNCHANGED.
if (distinctOsmIds.size > 1) {                 // ≥2 distinct real places by carried OSM identity → PICKER
  setPlacePickerCandidates(candidatesForCountry);
} else if (sameCountryRegionIsos.length > 1) { // multi-region but NO osm_id evidence → region <select> (D14 fallback)
  setCandidateRegionIsos(sameCountryRegionIsos);
} else if (regionIso) {                        // single candidate → tentative auto-fill (BUG-71, unchanged)
  setAutoRegionIso(regionIso); setRegionIsSuggested(true);
}
```

**Why this is correct and complete:**

1. **Positive identity evidence always wins.** `distinctOsmIds` is computed only from candidates that carry
   an `osm_id` (`:389-393`), so the picker fires **only** on genuine distinct-place evidence — it disambiguates
   across regions (Springfield) **and** within a region (the two GB-ENG Newports) in one pick, which is the
   whole point of a `display_name` (vs region) discriminator.
2. **The region `<select>` is not dead — it is the correct fallback.** When candidates span >1 region but
   carry **no** `osm_id` (legacy rows, a partial/older proxy response), `distinctOsmIds.size <= 1` and the
   second branch fires exactly as D14 specified. The mechanism survives; only its *precedence* changes.
3. **The ADL-46 F1/F2 parity case is preserved.** Two Nominatim rows for the *same* real place at different
   granularities carry **no** `osm_id` (that fixture's design) and collapse to one region → `distinctOsmIds.size
   = 0`, `sameCountryRegionIsos.length = 1` → falls through to the tentative auto-fill, **unchanged**. The
   reorder cannot make the picker fire falsely here, because the `osm_id` gate is untouched — only reordered.
4. **No new conflict is introduced.** The only set that satisfies *both* new-branch conditions
   (`distinctOsmIds.size > 1` AND `sameCountryRegionIsos.length > 1`) is exactly Springfield/Newport, and for
   that set the picker is unambiguously the correct control. There is no case where the region `<select>`
   *should* win over positive `osm_id` evidence.

The reorder itself is ~3 lines. Its correctness is why it needed an Architect pass, not a build brief: it
supersedes a prior ruling (§7).

---

## 7. Supersession of D14 (document-lifecycle rule)

> **SUPERSEDED (2026-08-06) in part** — ADL-46 §4.3.2 (D14) established that ambiguous city disambiguation is
> **region-first** (narrow the region `<select>` to the candidate regions). For the branch where the geocode
> lookup returns **positive identity evidence** (≥2 candidates carrying distinct `(osm_type, osm_id)`), the
> place-level `CityPicker` is now **primary** and the region `<select>` no longer pre-empts it. D14's
> region-narrowing `<select>` is **retained unchanged** as the fallback for the **no-`osm_id`** case (legacy /
> partial responses / ADL-46 F1/F2 parity). Rationale and evidence: this design §5–§6. Region-first was
> structurally unable to separate two distinct places sharing one region (the two GB-ENG Newports), which is
> the BUG-75 defect. Retained for history.

**Action for the build PR (not this docs-only pass):** the PR that lands the reorder must stamp ADL-46 §4.3.2
with the banner above (same-PR update rule), and record the resolution in any open-questions section D14
touches. This design doc is the canonical record of the decision until then. I am **not** editing ADL-46 in
this pass (it is a different decision's canonical home; no wholesale rewrite of a shared record).

---

## 8. UX-12 — the "Change city" entry point (folds into the same component)

UX-12 (P1): GE-16 grants the user the right to **correct** a wrong city on an existing place by re-pointing
to a different city, preserving items + activity tags. The **backend re-point shipped** (D11:
`PATCH …/places/:placeId` with `city_id`, verified §1). The shared `CityPicker` exists. **Missing:** the
entry point. UX spec §12 MVP scopes this precisely and I adopt it:

**8.1 The standing "Change city" control** (`PlaceSection.tsx`, next to the city-name link at `:161-169`):
- Always visible on every **unlocked** place, **regardless of `geocode_status`** (GE-16's correction right
  is not conditional on location status — even a `resolved`-but-wrong Rome-Georgia needs it, UX spec §5/§11.8).
- Hidden/disabled under the **same `isLocked` rule** as the existing Remove-place control (`:238`).
- Uses the Waypoint edit/pencil glyph, `aria-label="Change city"`.

**8.2 `ChangeCityModal`** — opens the **same** city-search + new-city (name/country/region) surface as
AddPlace, **minus the date/carry-forward chrome** (UX spec §12.1 verified this must not extend the
single-purpose `PlaceDateForm`). On select/create it calls the D11 PATCH with `city_id` instead of creating a
place. It consumes the **shared precedence unit** (§9) so its disambiguation is byte-identical to AddPlace.

**8.3 The badge** — a single "Location not confirmed" badge on `PlaceSection`, shown whenever
`place.city.geocode_status !== 'resolved'` (data already on the embedded `City`, `types/api.ts:168`), using
the existing **`locked`** hue. Zero new hues, no bucket split — UX spec §12.2 MVP exactly. Its purpose is
discoverability for the Change-city control (UX spec §12.4: a correction control with no passive signal is
undiscoverable).

Everything else in UX spec §11 (three-bucket split, one-tap Bucket-B picker, map "N places not located"
counter, Dismiss) is **deferred** per UX spec §12 — not required to discharge GE-16 or UX-12.

---

## 9. Drift-prevention — the shared precedence unit (why the two flows cannot diverge)

The brief's hard requirement: AddPlace and Change-city "cannot drift." The mechanism:

**Extract the precedence *decision* into a pure function** — the single source of truth:

```ts
// pure, no React, no I/O — the ONLY place the composition lives
type Disambiguation =
  | { mode: 'picker';    candidates: GeocodeCandidate[] }   // ≥2 distinct osm_id
  | { mode: 'region';    regionIsos: string[] }             // multi-region, no osm_id (D14 fallback)
  | { mode: 'suggested'; regionIso: string }                // single candidate (BUG-71)
  | { mode: 'none' };
function decideCityDisambiguation(candidatesForCountry: GeocodeCandidate[]): Disambiguation
```

Both flows consume it through a thin shared hook (`useCityDisambiguation`) that owns the `lookupCityCountry`
call + `lookupTruncated`, and renders the shared `CityPicker` / region `<select>` off the returned `mode`.
AddPlace's `onResolved` creates a place; Change-city's `onResolved` PATCHes `city_id`. **The composition
exists once**; a future change to precedence changes one pure function and both flows move together. The pure
function is also the ideal ATDD target (§10): a precisely-specifiable decision table whose wrong answer is
silent-and-plausible.

**Reuse discipline (no re-implementation):** the `CityPicker`, the region `<select>` + incomplete-seed
fallback, the BUG-71 suggested caption, the F4 pick→`region_id` derivation, and the BUG-79 caveat are all
**reused**, not rebuilt. The extraction moves existing logic into a shared seam; it does not fork it. If a
build agent finds itself rewriting `AddPlaceFlow` wholesale, that is a deviation to flag (no-wholesale-rewrite
rule) — the intended change is an *extraction* plus a *reorder*, not a rewrite.

---

## 10. Per-brief `ATDD-first` marking (OP-35)

I recommend **two sequenced briefs**, both **`ATDD-first: yes`**, sharing the extracted unit so UX-12 cannot
fork the precedence logic:

| Brief | Scope | `ATDD-first` | Reasoning |
|---|---|---|---|
| **A — Picker-precedence fix** | Extract `decideCityDisambiguation` + `useCityDisambiguation`; apply the reorder to `AddPlaceFlow`; stamp D14. Fixes the BUG-75 headline. | **YES** | Touches **identity auto-population where a wrong result is silent-and-plausible** (wrong pin — the exact defect), the behaviour is **precisely specifiable up front** (a pure decision table), and it **goes through the Architect** (this design). The OP-35 frontend exclusion is for *complex frontend that never reaches the Architect and whose failures are visible/recoverable* — this is the opposite on every axis. |
| **B — UX-12 entry point** | `ChangeCityModal` + standing "Change city" control + "Location not confirmed" badge, **consuming brief A's shared unit**. | **YES** | The re-point correctness is silent-and-plausible (a wrong pick silently mis-points a place), it **reuses the same precedence logic** (a drift here re-introduces the identity defect), and it goes through this design. The badge alone is cosmetic/visible and would not need ATDD, but it rides along with the re-point behaviour that does. |

**Sequencing:** A before B — A must land the shared extraction so B is reuse-only. **QA writes the red
acceptance tests first** at the defect's layer (the pure function + the rendered composition), handed to the
implementer as the executable DoD.

**Mock-fidelity is mandatory (QUAL-22, and this bug's own history).** The shipped all-green suite hid the
spanning-region defect because `AddPlaceFlow.city-picker.test.tsx`'s four-Newport fixture was **same-region**
(it omitted Wales). The ATDD suite's geocode-lookup double **must** return `osm_id`-bearing candidates that
match the real proxy's multi-region shape — a fixture that cannot express the spanning-region reality
specifies nothing. QA must verify the double behaves like `lookupCityCountry`/the geocode proxy before the
suite is trusted.

---

## 11. Success criteria / acceptance scenarios (measurable DoD for QA red tests)

Three headline scenarios are mandatory: spanning-region (Newport across GB-ENG + GB-WLS), same-region (two
Newports in GB-ENG), and the Springfield many-region case.

**Brief A — precedence:**

- **AC-1 — spanning-region (headline).** Lookup for "Newport" resolves country GB and returns candidates
  spanning GB-ENG and GB-WLS with ≥2 distinct `osm_id`. **Assert:** `decideCityDisambiguation` returns
  `mode: 'picker'` (not `'region'`); the `CityPicker` renders, the region `<select>` does **not**; every
  distinct-`osm_id` candidate is listed by region-qualified `display_name`; **no region auto-resolves**.
  Selecting "Newport, Isle of Wight" creates/points to a city carrying the IoW candidate's `(osm_type,
  osm_id)` and `region_id` derived from GB-ENG (or NULL if unseeded — never a Wales `region_id`).
- **AC-2 — same-region twins.** ≥2 candidates share GB-ENG with distinct `osm_id` (Isle of Wight vs Telford).
  **Assert:** both GB-ENG rows are present and independently selectable in the picker; selecting Telford
  yields Telford's `osm_id`, never IoW's; no silent collapse to one.
- **AC-3 — Springfield many-region.** "Springfield" resolves to US with N≥2 distinct-`osm_id` candidates
  across N regions. **Assert:** `mode: 'picker'` (not `'region'`); the picker lists all N by region-qualified
  `display_name`; row count == candidate count; each row's region qualifier is present and distinct;
  selecting "Springfield, Illinois" carries Illinois's `osm_id`.
- **AC-4 — F1/F2 parity preserved (no false picker).** Candidates with **no** `osm_id` collapsing to one
  region. **Assert:** `mode: 'suggested'` (or `'region'` if genuinely multi-region without `osm_id`); the
  picker does **not** fire; existing behaviour unchanged.
- **AC-5 — single unambiguous (Denver).** One-region, one-candidate lookup. **Assert:** `mode: 'suggested'`;
  `regionIsSuggested` true (BUG-71 tentative caption), no picker.
- **AC-6 — region_id alignment (F4).** Selecting any picker candidate submits `region_id` derived from **that
  candidate's** `region_iso` via the seeded map, never the stale selector value; incomplete-seed →
  `region_id` NULL, not invented.
- **AC-7 — truncation caveat (m1/BUG-79).** When the lookup was truncated, the picker renders the
  "there may be more matches not shown" caveat.

**Brief B — UX-12:**

- **AC-8 — entry point.** `PlaceSection` renders a "Change city" control on every **unlocked** place
  regardless of `geocode_status`; hidden/disabled under the same `isLocked` rule as Remove.
- **AC-9 — shared precedence (no drift).** `ChangeCityModal` runs the **same** `decideCityDisambiguation`;
  the spanning/same-region/Springfield scenarios (AC-1..3) behave identically to AddPlace. A wrong pick
  cannot silently mis-point.
- **AC-10 — re-point preserves data (D11).** Selecting/creating a city in Change-city calls `PATCH
  …/places/:placeId` with `city_id`; the place's items, notes, and activity tags are unchanged; only
  `city_id` changes.
- **AC-11 — badge.** Every place whose `city.geocode_status !== 'resolved'` shows the single "Location not
  confirmed" badge (`locked` hue, no new hue); a `resolved` place shows none.

---

## 12. Risks the fresh-eyes reviewer must stress-test

1. **The Springfield subsumption is the load-bearing judgment call, and it rests on captured — not
   freshly-probed — evidence** (§5.2 UNVERIFIED marker). Stress-test: is a ~20-row flat `display_name`
   picker genuinely acceptable, or should **in-picker region grouping** be pulled into MVP rather than
   deferred? I judged it acceptable and deferred grouping; a reviewer who disagrees should say so before the
   build, because it changes the picker's MVP shape.
2. **The reorder's completeness claim (§6.4)** — that no case exists where the region `<select>` *should* win
   over positive `osm_id` evidence. I believe this is airtight (positive identity evidence is strictly more
   specific than region), but it is an absence claim about counterexamples; confirm it independently.
3. **The extraction is a refactor of a heavily regression-tested file** (`AddPlaceFlow`, 273 green frontend
   tests, six BUG-specific suites). Confirm the ATDD tests pin the *existing* preserved behaviours
   (BUG-71/78/79, F1/F2 parity, incomplete-seed) before the reorder, so the extraction can't silently drop
   one. The no-wholesale-rewrite rule applies: this must be an extraction + reorder, not a rewrite.
4. **Two briefs vs one.** I recommend A→B sequenced; a reviewer may prefer a single combined brief to
   guarantee the shared unit is built once. Either is defensible; the invariant is that B is reuse-only.

## 13. What I could not verify

- **Live Nominatim (Springfield display_name strings + exact discovery-40 US Springfield count)** —
  connection refused this session (§5.2). Grounded on the captured Newport `/lookup` rows, the v2 P1a
  capture, the COO's recorded probe, and ADL-48's Springfield analysis; the build's ATDD suite must include a
  real Springfield fixture (captured post-rebuild) that the mock-fidelity gate validates.
- **The exact in-modal chrome of `ChangeCityModal`** beyond "search + name/country/region, no dates" — a
  Frontend/UX build detail, bounded by UX spec §12.1; not designed to the pixel here.

## 14. Out of scope (do not re-open)

The carried-`(osm_type, osm_id)` identity model; the dead coordinate bucket; the shipped 0016/0017 migration;
the backend carry channel, `resolveByOsmId`/`/lookup`, twin-merge, and legacy-fallback gating (all certified,
on `main`). The `address.county` "collapse" discriminator (parsed-but-dead; a separate QA-verify note in the
tracker) is not this pass's concern. This pass designs the frontend picker-precedence composition and the
UX-12 entry point only.

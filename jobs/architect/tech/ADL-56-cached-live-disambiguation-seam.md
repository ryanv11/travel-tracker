# ADL-56 — The cached-vs-live add-place disambiguation seam (BUG-97 / BUG-98 / BUG-99 / BUG-73)

**Date:** 2026-08-11 · **Author:** Architect · **Status:** DESIGN — **AMENDED R1 2026-08-11** (all four §12
open questions resolved by the PO + two new live-staging UAT directives folded in; slice phasing defined).
Pending (a) OP-27 fresh-eyes **Opus** review of the WHOLE amended document + the seam (HIGH stakes:
data-integrity/dedup invariant + a shared FE/BE contract — **never Fable**, it touches identity/dedup
reasoning that reads as security-adjacent), (b) an ATDD-first Slice-1 implementation wave. No production
code, no migration generated.

**Tracker:** BUG-97 (primary) · BUG-98 (folds in) · **BUG-99 (folds in — add-place picker selection
commits prematurely; the select≠commit fix, D7)** · BUG-73 message-copy contract (folds in) ·
**BRD:** refines GE-15, GE-16, GE-19, D12, D14; proposes **GE-21** (PROPOSED / see §11 — COO→PO gate).
**Reuses (no parallel path):** `classifyCandidates` (the live classifier), `decideCityDisambiguation`
(the FE decision), `cityIdentityService.findOrUpgradeCity` / `createOrReuseCarriedCity` (the find-or-create
algebra), GE-19's `needs_attention` lifecycle (ADL-55), the existing `CityPicker`, the `GET /api/cities`
search and `GET /api/geocode` proxy, the `TripForm` select-then-commit pattern (D7's target shape). **Zero
new routes. No new DB table, no new index.**

> **AMENDMENT R1 (2026-08-11) — what changed and where.** The PO resolved §12 Q1–Q4 and added two directives
> from live-staging UAT. Reconciled INTO the sections below (not appended), per OP-27 refinement 2:
> - **Q1 → CACHED-FIRST** (confirmed); **the cache/live merge is INVISIBLE** (new **D8 §3b** pins the silent
>   live-lookup trigger policy so "seamless" never becomes "live on every keystroke").
> - **BUG-99 → SELECT ≠ COMMIT** (new **D7 §3a**): picking a result *selects & populates*; a single explicit
>   "Add City & Place" button *commits*. `createCity` **and** `addPlace` both defer to that commit. Walked
>   through the dedup contract (§5) — **dedup-invariant**. Mirrors `TripForm`. Mobile is the **same component**
>   (auto-covered); `ChangeCityModal` shares the anti-silent-commit guard (flagged §12 Q5).
> - **Q2 → BACKFILL** (D4 confirmed); **Melbourne re-scoped** (§6 amendment): the PO SAW a 2-option picker and
>   selected neither, yet it saved region-null — entangling BUG-98 with the ε-collapse (Slice 2) AND D7.
> - **Q3 → TRUST THE CACHE** (no mandatory step-2b live-agreement gate — confirmed).
> - **Q4 → PHASE IT** (new **D9 §10a**): **Slice 1** (all PO-reported bugs, lower risk) ships first, ATDD-first;
>   **Slice 2** (the D2 ε-classifier reconciliation) is the higher-risk fast-follow. GE-21's "FE and BE agree"
>   criterion is fully met only after Slice 2 — a **documented, stamped interim divergence**, not a silent half-ship.

---

## §0 — Summary table

| # | Decision | Recommendation | Confidence |
|---|----------|----------------|-----------|
| D1 | **Routing rule** (the core) — how a live-ambiguous name reaches disambiguation even when one cached row exists | The cache may **reuse** an already-identified place but may **never SELECT** among candidate places. One disambiguation **surface** unions cached rows + live candidates; binding is by explicit pick only. The silent single-cache substitution loses its authority to auto-resolve an un-disambiguated name. *(R1: the "explicit pick" mechanism is now pinned by D7 — pick **selects**, the Add button **binds**.)* | High |
| D2 | **FE/BE ambiguity-definition reconciliation** (osm_id vs region_iso) | **ONE** definition: *more than one distinct real place*, where "distinct real place" = distinct `(osm_type, osm_id)` **after collapsing same-place multi-granularity duplicates**. Defined once, implemented in both trees, pinned by a **shared golden-fixture set** so they cannot drift. `region_iso` distinctness is demoted to the GE-15 auto-fill signal, not the ambiguity test. | High (definition) / Medium (touching `classifyCandidates`) |
| D3 | **Dedup guarantee** (VERIFY, load-bearing) | osm_id dedup is **REAL but PARTIAL** — enforced only for rows that carry a non-null `osm_id`. "Always show the picker → match by osm_id" is dedup-safe for the modern resolved population but **duplicates NULL-osm_id cached rows** (legacy / pending / terminal / seeded). Safety comes from the **surface reusing cached rows by `id`**, not from a DB constraint. **A new `(name,country,region)` unique index is the WRONG fix** (reopens BUG-33 / kills legitimate same-region coexistence). | High — two probes, §2 |
| D4 | **BUG-98 policy** (region-tier, null region, resolved) | **Backfill** `region_id` from the resolved candidate when the user left it NULL in a region-tier country **and** the resolve is region-unambiguous. Backfilling a NULL is **not** overwriting a user value — D12 rule-3 protects a *supplied* value, and NULL is the absence of one. Region-**ambiguous** resolves do not backfill (they are a D1/D2 picker case). *(R1: the PO's actual Melbourne case re-scoped in §6 — it was a **2-option picker the user didn't pick from** that saved region-null; BUG-98 is entangled with the D2 ε-collapse (Slice 2) AND with D7's select≠commit, not D4 alone.)* | High |
| D5 | **BUG-73 message contract** | Five behavioral states, three of which are conflated today: cache-empty ≠ live-empty ≠ live-failed. Define WHEN each fires; the cache-empty message must never imply the place is absent; the live-lookup escape hatch is always present. Exact copy → UX. | High |
| D6 | **UX delegation boundary** | ADL owns the behavioral/data contract (routing, identity/dedup, the ambiguity definition + collapse rule, region backfill, the message *state machine*, the API shape, **the select≠commit selection model D7, the silent-live-lookup trigger D8**). UX owns picker/label copy, the cached-vs-live badge, the "can't see your place?" affordance wording, message strings, visual grouping, **the affordance of the "Add City & Place" control and the "none of these — add as new" escape row**. | High |
| **D7** | **Selection model (BUG-99 — select ≠ commit)** *(R1, new)* | Every selection path — cached-search result, disambiguation picker, new-city form — **selects & populates** a definite city identity and reveals the date fields; a **single explicit "Add City & Place" button is the ONLY write**. **Both** `createCity` (live/pending picks) **and** `addPlace` **defer** to that commit — a pick performs **no** network write. Dedup-invariant (§5). Mirrors `TripForm`. Mobile = same component; `ChangeCityModal` shares the anti-silent-commit guard. | High |
| **D8** | **Invisible cache/live merge + silent-lookup trigger policy** *(R1, new — sharpens D1/D5)* | The live lookup fires **automatically** so the surface shows one seamless cached ∪ live list (no visible "do a full lookup" button). Trigger contract: **debounced** (≥ the existing search debounce), **min-length 2**, **cached-first-gated** (fires only when the cache does not already return a confident unambiguous single exact match — Q1), **coalesced** per `(query, countrySet)`. Fires **during** the debounced search (so live candidates appear in the surface), **not** deferred to submit. Pixels/copy → UX (D6). | High (contract) / Medium (the "confident single match" thinness threshold is a tunable) |
| **D9** | **Slice phasing (Q4 resolved)** *(R1, new)* | **Slice 1** (all PO-reported bugs; lower risk): D7 + D1 cached-first routing + D8 invisible merge + D3/P2 osm-id-on-search + D4 region backfill + D5 states. Ships first, ATDD-first for the data-integrity/shared-contract parts. **Slice 2** (higher-risk fast-follow): D2 ε-classifier reconciliation (`classifyCandidates` place-level + collapse ε). GE-21's "FE and BE agree" is met **only after Slice 2** — documented interim divergence (§10a). | High |

**One-line reconciliation of the BUG-72 tension the brief names:** *reuse the catalogue* (BUG-72) and *don't
auto-pick an ambiguous city* (BUG-97) are not in conflict — the cached rows are **shown as choices, never
chosen for the user.** BUG-72's dropdown is the reuse mechanism and stays; BUG-97's fix is to stop the cache
from *standing in for a choice the user never made*, on both the frontend and the backend.

---

## §1 — The seam, mechanism-verified (leads re-located by symbol, 2026-08-11)

Two independent defects live in one seam. Both were traced to live code this session.

**Defect 1 — the cache pre-empts the live classifier (BUG-97).**
`POST /api/cities` with a plain name (no osm ref) calls `findOrUpgradeCity` (`routes/cities.ts:138`).
With no region requested, that falls to **step 2b** (`cityIdentityService.ts:142-145`):
`findByNameAndCountry(name, country)` (capped at 2, `repositories/cities.ts:278-285`) →
`sameName.length === 1` **returns that row blind**, *before* `resolveCityName`→`classifyCandidates`
(`geocoding.service.ts:158`) ever runs. Springfield has 2+ cached rows → `length !== 1` → falls through
to the live classifier → multi-region ambiguous → `needs_attention`. Newport has exactly one cached row
("Newport, Oregon") → reused with zero geocoding. The cache **short-circuits** the classifier; it does not
feed it.

**Defect 2 — FE and BE disagree on what "ambiguous" means.**
The frontend picker fires on **place-level** distinctness — `distinctOsmIds.size > 1`
(`decideCityDisambiguation.ts:60`). The backend background resolver fires `needs_attention` on
**region-level** distinctness — `distinctRegionIsos(...).length > 1` (`geocoding.service.ts:188-190`).
So two same-state Newports (distinct `osm_id`, one `region_iso`) get a picker from the FE yet are
**silently resolved to `eligible[0]`** by the BE name path. Same-region distinct places are exactly the case
the FE picker exists to catch (`decideCityDisambiguation.ts:11-21`) and the BE classifier still misses.

**UNVERIFIED (inherited from the COO investigation, not laundered):** which reuse path fired for the PO's
specific Newport, and why the FE picker did not fire, are unproven — the staging DB rows and the live
Nominatim call were not inspected. Both mechanisms above are verified live-code paths that jointly account
for the symptom; the design fixes the seam, not one reproduction. If implementation finds a third mechanism,
re-open.

---

## §2 — D3 first: the dedup verdict (load-bearing — two independent probes)

The PO's redesign hypothesis ("always show the picker, then match the selection back to the cached DB so we
don't add duplicates — osm_id should stop duplicates anyway") rests entirely on the osm_id dedup premise.
It was verified with **two probes that fail differently**:

**Probe 1 — the ORM schema (`src/backend/db/schema.ts`, read directly, lines 181 / 189-196 / 202).**
The only two unique indexes on `cities` today are:
- `uniq_cities_osm_ref` = **PARTIAL** UNIQUE on `(osm_type, osm_id)` **WHERE `osm_id IS NOT NULL`**.
- `uniq_cities_pending_per_creator` = PARTIAL UNIQUE on `(name NOCASE, country_code, COALESCE(region_id,0),
  COALESCE(created_by_user_id,''))` **WHERE `geocode_status='pending'`**.
- `chk_cities_osm_both_or_neither` CHECK `((osm_type IS NULL) = (osm_id IS NULL))` closes the NULL-distinct
  hole in the first index's key. There is **no** unconditional `(name,country,region)` unique index.

**Probe 2 — the applied migration DDL history (independent of the ORM source).**
Migration `0015` created the unconditional `uniq_cities_name_country_region_ci`; migration `0017`
(`0017_bug75_identity_switch.sql`, header §1 + the CREATE statements) **DROPPED it** and created exactly the
two partials above — *"it was unconditional and forbade ANY two rows sharing (name, country, region), which
is exactly what prevented distinct real places (e.g. two same-region Newports) from coexisting."* A grep of
every `*.sql` migration confirms the two partials are the only surviving unique indexes on `cities` (`0018`
recreates them byte-identically). The two probes agree and could not both be wrong from a single mistaken
assumption (one reads TypeScript schema intent; the other reads applied SQLite DDL).

**The guarantee, stated precisely.**
> Dedup by `(osm_type, osm_id)` is **genuine and DB-enforced** (partial unique index + both-or-neither CHECK +
> the caught-violation merge in `commitResolvedOrMerge`/`mergeIntoWinner`, `geocoding.service.ts:290-359`).
> It covers **only rows that carry a non-null `osm_id`.** Every resolve stamps the winning candidate's
> osm ref (the M-A rule, `geocoding.service.ts:302-303` / `routes/cities.ts:194-195`), so two resolves of the
> same OSM place converge to one row. But three populations carry **NULL osm_id** and are invisible to the
> index: (H1) legacy rows resolved before BUG-75; (H2) any `pending`/`unresolvable`/`needs_attention` row that
> never resolved; (H3) seeded rows. `createOrReuseCarriedCity` dedups a live pick **only** by exact osm-ref
> (`findByOsmRef`, `repositories/cities.ts:183-195`) and deliberately does **not** fall back to a name match
> (the B2 rule, `cityIdentityService.ts:180-184`) — so a live pick carrying `osm_id=X` whose real place already
> exists as a NULL-osm_id cached row **inserts a second row**: a duplicate the index cannot catch.

**Verdict on the premise:** *PARTIALLY TRUE.* "osm_id stops duplicates" holds **between osm-bearing rows**
and for concurrent same-place resolves; it does **not** stop a live pick from duplicating a NULL-osm_id
cached row of the same place. Therefore **"always show the picker → match back by osm_id" is NOT dedup-safe
as floated.** It is made safe not by osm_id but by **showing the cached rows themselves as pick-by-`id` reuse
targets** (D1/D3) — for any place already in the catalogue the user reuses the row directly, never minting a
second one.

**The finding the brief asked for, inverted.** The brief anticipated that "if there is no uniqueness
constraint … likely a Database follow-up: a unique index." There **is** a uniqueness constraint (partial, on
osm_ref). The gap (NULL-osm_id rows) must **NOT** be closed with a new `(name,country,region)` unique index:
that is precisely the index `0017` removed, and re-adding it reopens BUG-33 and forbids the legitimate
coexistence of two same-region Newports that this whole feature-family exists to support. **The correct
"database" answer is: no new index. Dedup for the interactive path is a surface property (reuse-by-id), not a
constraint property.** This is the load-bearing correction of the PO's floated approach.

---

## §3 — D1 Routing rule (item 1)

**Recommendation.** Split the cache's two conflated jobs. The cache stays a **dedup** mechanism (reuse an
*already-identified* place) but loses its authority as a **selection** mechanism (choosing *which* place an
un-disambiguated name means). Concretely, the interactive add-place flow resolves a typed name through a
single **disambiguation surface** that unions cached catalogue rows and live geocode candidates, and **binds a
place only by explicit user selection.**

Reasoning:
- The distinguishing signal is *has the user made a place-level choice?* A picked candidate carries an
  `osm_id` → `createOrReuseCarriedCity` (osm-ref dedup/merge); a picked cached row carries an `id` → attach
  directly. A bare typed name carries **neither** — so it must not be silently mapped onto one cached row.
- The surface is shown whenever ≥2 distinct real places are available for the name (cached ∪ live, per the D2
  definition). This makes the cache **visible, never preemptive** — the PO's "show cached rows, never let them
  silently pre-empt the choice."
- The plain-name `POST /api/cities` (create pending from text) is retained **only** for the GE-12 offline /
  no-candidate case and the explicit "none of these — add as new" action. When the live lookup *did* surface
  candidates, the FE must route through the picker rather than a bare create — so `findOrUpgradeCity` step-2b
  never receives an ambiguous name it could silently collapse.
- **Backend defense-in-depth (so the contract is correct in isolation, not FE-enforced only — this is a
  shared-contract release):** step-2b's single-match reuse is safe *as convergence* but unsafe *as a silent
  substitution for an un-shown alternative*. The backend change is scoped and testable — see §9/§10 for the
  exact behavior QA pins. The recommended shape: step-2b continues to **reuse** a single exact match, but the
  *interactive* create path no longer relies on it to *decide ambiguity* — the FE surface owns that, and the
  backend's own name-path ambiguity test (D2, now place-level) means a plain-name create for a live-ambiguous
  name resolves to `needs_attention`, not a silent pick. (See §12-Q3: whether to additionally gate step-2b's
  reuse behind a live-agreement check is a flagged product/cost call.)

**Testable exit criterion (P1 — no silent pre-empt):** given a name with ≥2 distinct real places available
within the trip's countries, the flow presents them and binds none automatically; given exactly one available
place, auto-fill remains a *tentative, editable suggestion* (existing GE-15/BUG-71 behavior), never a silent
commit; given a single cached row where the live lookup reveals additional candidates, all are shown (the
cache does not hide the live alternatives).

**R1 sharpening — how "explicit pick" is mechanically realised.** D1 asserts *binding is by explicit pick
only*. On `main` that was violated in a second, subtler way than the cache short-circuit: the pick itself
**was** the commit (`onClick → handleSelectCity → addPlace`, `AddPlaceFlow.tsx:611-613`; the disambiguation
`CityPicker.onSelect → handleSelectPickerCandidate → createCity → handleSelectCity`, `:362/:289`). **D7 (§3a)
splits pick from bind** so D1's rule is real at the write layer, not just at the presentation layer.

---

## §3a — D7 Selection model: select ≠ commit (BUG-99, R1)

**Recommendation.** Separate **selection** from **commit** across every add-place entry path, mirroring the
already-correct `TripForm` shape (a country pick calls `setSelectedCountryCodes`; only the explicit
create/edit button commits). Concretely:

- **Picking anything selects & populates, and writes nothing.** A cached-search result, a disambiguation-
  `CityPicker` candidate, or a completed new-city form each resolve to a **held selection** carrying a definite
  city identity — a cached row's `id`, a live candidate's `(osm_type, osm_id, region_iso, …)`, or a plain-name
  `{name, country, region?}` — and reveal the (already-present) date fields.
- **A single explicit "Add City & Place" button is the only write.** The button already exists in the new-city
  form (`AddPlaceFlow.tsx:892`) — the PO's directive is explicit that it **stays**: *"removing the submit button
  isn't the answer — once we fix the bug and add dates there won't be a way to save and close."* The redesign
  makes it the sole commit trigger for **every** selection path (the cached-search step must gain the same
  held-selection + Add control it lacks today, so a cached pick no longer commits on click).
- **The commit does, in this order:** resolve the held selection to a `city_id` — reuse the cached `id`
  directly, or `createCity` for a live/pending selection — then `addPlace {city_id, arrived_on, departed_on}`,
  then the existing post-commit logic (backend warnings, the non-resolved `creationStatusMessage`, carry-forward
  enrolment). No selection path calls `addPlace` (or `createCity`) on the pick itself.

### D7 design-fork (a) — `createCity`/`addPlace` timing. **Resolved: defer BOTH to the explicit Add.**

The COO flagged this to probe: does identity resolve (`createCity`) on pick while `addPlace` waits, or does
everything wait for Add? **Recommendation: everything waits for Add** ("Design B"), over "resolve-on-pick"
("Design A"). Reasoning:

- **Dedup-invariant — this is the load-bearing reconciliation with §2/§3/§5.** Deferring `createCity` changes
  **no** dedup guarantee, because every dedup mechanism fires *at `createCity` time*, wherever that is on the
  clock: `createOrReuseCarriedCity` dedups a live pick by `findByOsmRef` before minting (`cityIdentityService.ts
  :212-213`); `findOrUpgradeCity` reuses by identity key (steps 1/2/2b) before minting; both INSERTs go through
  the caught-violation `insertCityOrReuse` re-select (`:163-176`). The osm-ref partial unique index enforces the
  same convergence regardless of *when* the row is written. A cached pick needs no `createCity` at all (reuse by
  `id`). So the pick→bind deferral is orthogonal to dedup — it neither strengthens nor weakens it.
- **Deferring strictly reduces speculative writes.** Design A mints/touches a city row on every pick; a user who
  picks then changes their mind (or picks "none of these") leaves an orphan catalogue row. Cities are global
  reference data (ADL-46 D4/D5) so an orphan is *tolerable*, not a data-integrity fault — but "write only on the
  explicit commit" is strictly cleaner and produces fewer rows to self-heal.
- **Symmetry.** Cached picks (`id`, no `createCity`) and live picks (`createCity`) commit through the same
  single button; Design A would make the write timing differ by source. Symmetry is the simpler contract.
- **No extra egress.** The live `resolveByOsmId` `/lookup` inside `createOrReuseCarriedCity` runs once, at
  commit, instead of on every trial pick — fewer Nominatim calls under the shared 1 req/s budget, not more.

### D7 escape hatch — the anti-silent-commit guard (this is where BUG-99 meets the Melbourne bug, §6).

Once a pick no longer auto-commits, the converse must also hold: **a commit with an ambiguity still open and no
selection made must not silently write a guess.** When the disambiguation surface/`CityPicker` is showing (≥2
distinct real places), the commit control is inactive **until the user makes an explicit choice** — either pick
a candidate, **or** pick an explicit **"none of these — add as new"** row (itself a selection, producing a
creator-private plain-name pending row, GE-12/GE-16). A bare Add with the picker showing and nothing selected is
**not** a valid action. This is GE-21 stated at the write layer ("binds a place only by explicit selection"),
and it is exactly what closes the Melbourne region-null save (§6). The *affordance* (button disabled vs the
"add as new" row being the only active path) is UX (D6); the *behavioral rule* — no bind without an explicit
selection, escape hatch always present — is the contract.

**Scope of the D7 build.** `AddPlaceFlow` is the surface with the dates and the PO-reported bug; the mobile view
**renders the same `AddPlaceFlow` component** (`MobileTripDetailView.tsx:32,280`) — verified, so the fix is
**one component, not two**, and needs no mobile-specific variant. `ChangeCityModal` re-points an existing
place and shares the same commit-on-pick anti-pattern (`ChangeCityModal.tsx:105/127/155`) **and** the P2 dedup
seam — but it has **no dates**, so it needs the anti-silent-commit guard + the P2 identity-matching, **not** a
dates/held-selection restructure. Scope confirmation flagged as §12 Q5.

**Testable (see §10 tests 7–9):** on the cached-search step, clicking a result populates a held selection and
does **not** call `addPlace`; only the explicit Add commits, carrying the current date-field values. On the
disambiguation picker, clicking a candidate populates the held selection and does **not** call `createCity`/
`addPlace`; only the explicit Add commits. With the picker showing and nothing picked, the commit path does not
write a region-null pending row (the Melbourne guard).

---

## §3b — D8 Invisible cache/live merge + silent-lookup trigger policy (R1)

**Recommendation (PO direction: one seamless list; the live lookup is invisible/automatic, not a visible
button).** This confirms D1's "one surface unions cached + live" and refines it: there is **no** visible "do a
full lookup" affordance — the live lookup fires on its own and augments the same list the cache populates. The
one thing that MUST be pinned so "seamless" does not become "live on every keystroke" (which would blow the
app-wide shared 1 req/s public-Nominatim budget) is **the trigger policy for the silent live call**:

1. **Debounced, never per-keystroke.** The live lookup fires only after the same typing-pause debounce the
   cached search already uses (`DEBOUNCE_MS = 300`, `AddPlaceFlow.tsx:82`) — one call per settled query, not one
   per character.
2. **Minimum length 2** — the existing `cityName.trim().length >= 2` gate (`:405`) applies unchanged.
3. **Cached-first-gated (this is Q1 = cached-first, realised).** The live call fires **only when the cache does
   not already answer confidently** — i.e. the cached search returned zero rows, or did not return a single
   exact-name unambiguous catalogue match. When the catalogue already resolves the typed name to one place, **no
   live call is made** (zero Nominatim cost on the common "already saved" path). The exact "confident single
   match" threshold is a **tunable** (default: fire when cached rows == 0, or when >1 distinct-identity cached
   rows match, or when the top cached row is not an exact case-insensitive name match).
4. **Coalesced** per `(query, countrySet)` — one in-flight live call per distinct settled query; a re-render or
   an unchanged debounced query must not re-fire it (React Query keying by value already gives the cached search
   this; the live lookup must be keyed identically).
5. **Fires during the debounced search, not on submit.** The PO wants the merged list visible *as the user
   chooses*, so live candidates must appear in the surface before commit — the live call is not deferred to a
   submit action. (This does not reintroduce per-keystroke firing: 1 + 3 + 4 bound it to at most one call per
   settled, cache-unanswered query.)

**Delegated to UX (D6):** whether a "searching online…" affordance shows while the live call is in flight, the
cached-vs-live badge, grouping/ordering of cached vs live rows, and all copy. D8 owns *when the call fires and
how it coalesces*; UX owns the pixels.

**Reconciliation with D5's message states (walked, per the brief).** Moving *when* the live call fires (from the
old explicit "+ Add new" click to the debounced search) does **not** collapse D5's five states, because each
state keys off the live call's **outcome**, which the `GET /api/geocode` `{status, candidates, failed}` shape
already carries (BUG-73/74): cache-empty + live-pending → transient "searching…"; cache-empty + live-`ok`-with-
candidates → S3; cache-empty + live-`ok`-zero → **S4 (live-empty)**; cache-empty + live-`error`/`disabled`/
retries-exhausted → **S5 (live-failed)**; cache-hit → **S1** (and if the cache answered confidently, no live
call fired at all — S2/S4/S5 do not arise). The auto-fire changes the *timing* of the live call, not the
*state machine*; S2 (cache-empty) stays distinct from S4 (live-empty) and S5 (live-failed) exactly as §7 defines.

---

## §4 — D2 FE/BE ambiguity reconciliation (item 2)

**Recommendation.** Adopt **one** definition of the ambiguity that must trigger a user choice:

> **A name is ambiguous when more than one *distinct real place* is available**, where two candidates are the
> **same** real place iff they share `(osm_type, osm_id)` **or** — for the multi-granularity case Nominatim
> routinely returns (a `city` node and a `municipality` relation for one town) — they share
> `(name NOCASE, country_code, region_iso)` **and** their coordinates are within a small epsilon ε. After this
> **same-place collapse**, count distinct places.

- This is **strictly place-level** and **subsumes** the old region_iso test: two places with distinct
  `region_iso` necessarily have distinct `osm_id`; the converse (two same-region places) is exactly the case
  region_iso missed. So one definition replaces two.
- The collapse rule is *why* the region_iso shortcut existed — `classifyCandidates`' own comment
  (`geocoding.service.ts:133-138`) says counting raw osm hits "would mark nearly every city ambiguous" because
  of the city+municipality duplication. Collapse handles that duplication **directly** (same name+region+≈coords
  → one place) instead of dodging it with a coarser key. Melbourne's `city`+`municipality` collapse to one →
  `ok`; the two GB-ENG Newports (~200 km apart) do not collapse → ambiguous. Both correct.
- `region_iso` distinctness is **demoted**, not deleted: it remains the GE-15 country/region auto-fill signal
  and a fast-path inside the collapse. It is no longer the ambiguity test.

**"Single" is mechanically verified, not asserted (frameworks std 32 / OP-27).** The frontend
(`decideCityDisambiguation.ts`) and backend (`classifyCandidates`) live in separate TS build trees and cannot
import one module. The invariant is kept single by a **shared golden-fixture set** (the existing
`newportGeocode.ts` family, extended) that BOTH implementations run against with identical expected verdicts —
a drift on either side turns a fixture red. This is the mechanically-verifiable "single" that standard 32
requires for a same-rule-many-sites consolidation whose failure (silent wrong-place binding) is severe.

**Highest-risk element, flagged for fresh-eyes (§13).** Changing `classifyCandidates` to place-level touches
the **background resolver** (`resolveCity`, the 15-minute queue) — a wrong ε over-collapses (silently binds two
real places as one) or under-collapses (floods `needs_attention`). ε is a **tunable QA must fixture-test at both
edges** (Melbourne city+municipality must collapse; two same-region Newports must not). This is the one change
in this ADL that can *silently corrupt* rather than merely cost a re-run, so it carries the ATDD bar.

**Considered and not recommended: relationship-only (leave `classifyCandidates` on region_iso).** Cheaper and
lower-risk, but it leaves the exact silent-wrong-place case the brief named (two same-region Newports created
via the offline plain-name path, auto-resolved to `eligible[0]`). Rejected as the baseline because "FE and BE
agree" is the explicit requirement and a residual silent-bind is the very bug class this ADL exists to close.
Offered to the PO as a phasing fallback in §12-Q4 if the ε work is deferred.

---

## §5 — D3 contract: how the surface stays dedup-safe (item 3, cont.)

The safety properties the merged surface MUST satisfy (testable; pixels delegated to UX in D6):

- **P2 (reuse-first dedup).** A live candidate that is the **same place** as a shown cached row (matched by
  `(osm_type, osm_id)`) is represented **once**, as the cached row (pick-by-`id`). This requires the **one
  additive API change** in this ADL: expose `osm_type`/`osm_id` on the `GET /api/cities` search projection
  (`repositories/cities.ts` `search`, lines 127-142) so the FE can match cached rows to live candidates **by
  identity**, not by fragile name text. Additive field, no DB change, no new route, no GE-16/containment change
  (osm ids are public OSM data). **This field is Slice 1 (D9)** — the invisible merge (D8) needs it to dedup the
  cached ∪ live union. **P2 must hold on BOTH consumers of the merged surface** — `AddPlaceFlow` *and*
  `ChangeCityModal` (both already consume the shared `decideCityDisambiguation` + `buildCreateCityDataFromCandidate`
  utils), so the search-projection change lands the dedup in both without a second code path.

- **P2-R1 (select≠commit is dedup-invariant — the §5 walk the brief requires).** Deferring `createCity`/`addPlace`
  to the explicit commit (D7) changes **no** P2/§2/§3 guarantee. Every dedup mechanism — the osm-ref partial
  unique index, `createOrReuseCarriedCity`'s `findByOsmRef` reuse, `findOrUpgradeCity`'s identity-key reuse, the
  `insertCityOrReuse` caught-violation re-select — fires **at `createCity` time**, and the deferral only moves
  *when* `createCity` runs, never *what row it resolves to*. A cached pick reuses by `id` and calls no
  `createCity` at all. So "always show the picker → match back by identity" is exactly as dedup-safe (and exactly
  as exposed to the H1 NULL-osm_id hole) under D7 as without it — the deferral is orthogonal. Full derivation in
  §3a fork (a).
- **P3 (explicit binding).** cached → `POST /api/trips/:id/places {city_id}`; live → `POST /api/cities {osm_type,
  osm_id, …}` (`createOrReuseCarriedCity`); "none of these / add anyway" → `POST /api/cities {name, country,
  region?}` pending (`findOrUpgradeCity`). All three already exist.
- **P4 (cache-empty ≠ place-absent).** Feeds the D5 message contract.

**The residual hole H1 (NULL-osm_id cached row + live candidate of the same place, not collapsible by osm_id
because the cached row has none).** Two dispositions:
- **(baseline, recommended) accept + self-heal.** The surface shows both; if the user picks the live one a
  duplicate is minted. This is bounded (legacy/never-resolved population only), **self-healing** (the next
  resolve stamps `osm_id` via M-A, after which the osm-ref index dedups), **detectable** (BUG-72 renders the
  region, making catalogue pollution visible), and consistent with the disposable-data posture. Costs nothing.
- **(optional hardening, fast-follow) best-effort collapse.** When a NULL-osm_id cached row shares
  `(name NOCASE, country, region_iso)` with exactly one live candidate, present them as one row backed by the
  cached `id` and, on selection, adopt the candidate's osm ref onto the cached row (a controlled backfill).
  **Risk:** two same-region distinct places would mis-collapse — the exact B2 hazard. Only adopt on a *unique*
  same-region match, and flag it as needing the same fresh-eyes scrutiny. Recommend as a fast-follow **only if
  UAT shows real duplicate pollution**, not day one (avoids over-building against a legacy population that
  disposable-data churn removes anyway).

---

## §6 — D4 BUG-98 region backfill (item 4)

**Recommendation.** When `region_id` is **NULL**, the country is region-tier, and the resolve is
**region-unambiguous** (exactly one distinct `region_iso` among eligible candidates, i.e. the D2 collapse
yields one place / `classifyCandidates` returns `ok`), **backfill `region_id`** from the resolved candidate's
`region_iso` via the seeded `regions` map. Applies at both write sites: the create-time resolved insert
(`routes/cities.ts:186-203`, currently `regionId: region_id ?? null`) and the background
`commitResolvedOrMerge` (`geocoding.service.ts:297-312`, currently sets coords/osm but never region).

Reasoning:
- **Backfilling a NULL is not overwriting a user value.** D12 rule-3 ("never overwrite the user's
  country/region") protects a *supplied* value from a geocoder override — its motivating hazard is the
  *ambiguous* case (resolve "Springfield US" to US-IL when the user meant US-MO). NULL is the **absence** of a
  supplied value; there is nothing to overwrite. Melbourne resolved unambiguously to AU-VIC and the geocoder
  *knew* the region — refusing to record it produces "Australia (no state set)" for a city it fully identified.
- **Reconciles cleanly with D2/D12.** Backfill fires **only** on the region-*unambiguous* resolve. A
  region-*ambiguous* resolve does not backfill — it is a D1/D2 picker/`needs_attention` case, so rule-3's real
  concern (guessing a region under ambiguity) is preserved untouched.
- **Best-effort, never blocking (GE-15 parity).** If the resolved `region_iso` is not a seeded `regions` row
  (the BUG-30 incomplete-seed class), `region_id` stays NULL and the city still saves — identical graceful
  fallback to the frontend's. The backfilled value remains user-editable (Change-city / `PATCH /api/cities`).
- **Refines D12 rule-3** — flagged for the COO to confirm the D12 wording amendment (§11 / §12-Q2). Not a new
  requirement; a precision on an existing rule.

**Testable:** adding a city in a region-tier country with the region left blank, whose lookup yields one
confident region, persists that `region_id`; the same with a region the user explicitly chose is never
overwritten; the same with an unseeded region leaves `region_id` NULL and still creates the city.

### §6a — Melbourne re-scoped (R1) — BUG-98's real mechanism, and why it spans two slices + D7

**The corrected mechanism (PO, live staging).** BUG-98's original note said "no picker, resolved ok." The PO's
actual case was the opposite: a disambiguation **picker DID show**, with **two "Melbourne — Victoria" options**
(both AU-VIC — the `city` node + `municipality` relation granularity duplication that D2's ε-collapse targets),
the PO selected **neither**, and it **still saved as region-null**. Mechanism, traced to live code: the
`CityPicker` renders when `distinctOsmIds.size > 1` (`decideCityDisambiguation.ts:60`) — two Melbourne osm ids →
picker — but the form's own **"Add City & Place" button stays present** and, clicked without a pick, runs
`handleCreateCity` → `createCity({name, country, region_id: newCityRegionId ?? undefined})` with `newCityRegionId`
still `null` → a plain-name create that saves region-null. **This is the Melbourne bug: the picker was advisory,
and the plain-name commit path bypassed it.** It is the same seam as BUG-99, seen from the "didn't pick" side.

**Two consequences, landing across the slices — reconciled, not appended:**

1. **BUG-98 is entangled with the D2 ε-collapse (Slice 2), not D4 alone.** With D2's same-place collapse, the two
   AU-VIC Melbournes (same `name+region_iso` + coords within ε) collapse to **one** distinct place → **no picker**
   → single confident region → D4 backfills AU-VIC → "Melbourne, Victoria." So the *spurious picker* disappears
   only in Slice 2. The original D4-only framing was incomplete; the summary-table D4 row is annotated accordingly.

2. **The region-null save is closed in Slice 1 by D7 *and* D4 together — the picker's granularity is a D2/Slice-2
   concern.** Trace every Slice-1 path with the two-option picker showing (ε-collapse not yet in): **(A)** user
   picks one Melbourne → the `osm_id` → `createOrReuseCarriedCity` → canonical resolve → AU-VIC (region set via
   the pick's `region_iso`→`region_id` map and/or D4). **(B)** user clicks "Add" without picking → **D7's
   anti-silent-commit guard blocks it** — the commit control is inactive until an explicit choice, so this path
   (the exact `handleCreateCity` region-null plain-name save) is **removed**. **(C)** user clicks "none of these —
   add as new" → plain-name create → the resolve is region-*unambiguous* (both granularities are AU-VIC → one
   `region_iso`) → **D4 backfills AU-VIC**. So in **every** Slice-1 path Melbourne ends **with** its region — D7
   removes the guess-without-a-pick path, D4 backfills the region on the unambiguous resolve. Slice 2's ε-collapse
   then removes the *spurious two-option picker itself* (the annoyance of being asked to choose between what is
   really one place), so Melbourne resolves seamlessly with no picker at all.

**Net (the honest phasing statement).** BUG-98's **region-null symptom is fully closed in Slice 1** (D7 removes
the guess-without-a-pick commit; D4 backfills the region on the unambiguous resolve — every path ends with a
region). What **Slice 2** adds is removing the **spurious two-option picker** (the D2 ε-collapse) so Melbourne
resolves seamlessly with no picker at all — a disambiguation-quality (BUG-97-family) improvement, not the
region-null fix. So: BUG-98 → Slice 1; the Melbourne *picker cosmetics* → Slice 2.

**PO's flagged sub-question — "is saving unresolved/region-null on dismiss correct, or should dismiss cancel/
hold?"** It **dissolves** under D7 rather than needing a new product ruling: there is no longer a "dismiss that
still saves." The only ways to leave a shown picker are (a) pick a candidate → binds that place; (b) pick "none of
these — add as new" → an explicit selection that creates a creator-private pending row (GE-12/GE-16, correct); or
(c) close the whole Add-Place modal → nothing saved (cancel). A stray commit that writes a guess is removed. This
follows directly from GE-21 ("binds only by explicit selection"); recorded here for the PO to confirm (they
raised it) but it is **not** a blocking new fork.

**Seam vs ADL-55 (walked — the §13 item 4 flag).** D4's backfill and the `findOrUpgradeCity` wildcard-upgrade /
`needs_attention` re-open path (`cityIdentityService.ts:95-135`, which also writes `region_id`) sit on **disjoint
branches** and do not collide: the wildcard upgrade fires **only when the request carries a region** (`regionId
!= null`, `:95`); D4's backfill fires **only when `region_id` is NULL**. A Melbourne pick routes through
`createOrReuseCarriedCity` (the osm-ref path), not the wildcard upgrade at all. No ADL-55 verdict is invalidated
by D4 or by the Melbourne re-scope.

---

## §7 — D5 BUG-73 message state machine (item 5)

**Recommendation.** Define five behavioral states and *when* each fires; exact copy is UX (D6). Three are
conflated today (the "No matches in <country>" line reflects the **cached** search only, yet "+Add new" then
runs a **live** lookup that may find results — misleading, BUG-73).

| State | Fires when | Behavioral contract |
|---|---|---|
| S1 cached-hit | `GET /api/cities` returned rows | Show them as reuse targets; no message needed. |
| S2 **cache-empty** | cached search returned nothing | Message MUST be scoped to *saved places* ("no **saved** places match…") and MUST NOT imply the place is absent; the live-lookup escape hatch is always offered. (Replaces today's absolute "No matches in <country>.") |
| S3 live-candidates | `GET /api/geocode` `status:'ok'`, candidates present | Picker / tentative suggestion (existing D1/D2/GE-15). |
| S4 **live-empty** | `GET /api/geocode` `status:'ok'`, zero candidates | "We looked and found no match for <name> in <country> — you can still add it as a new place." Distinct from S2 and S5; leads to the plain-name pending create. |
| S5 live-failed | `status:'error'`/`'disabled'`, or retries exhausted (`failed:true`) | Non-blocking "couldn't look this up right now — enter country/region manually." Manual entry stays (BUG-73/BUG-74 already built the `failed` flag; `geocodeLookupFailed` exists). |

Reasoning: S5 is already distinguished (BUG-73/BUG-74). The **new** behavioral requirement is separating S2
(cache-empty) from S4 (live-empty) — the source of the misleading message — and guaranteeing the escape hatch
in S2. The states are the contract; the strings are UX.

**R1 — the states survive D8's auto-firing live call.** Under D8, the live lookup fires automatically during the
debounced search rather than on an explicit "+ Add new" click. This does not collapse the five states: each keys
off the live call's `{status, candidates, failed}` **outcome**, not off *when* it was triggered — so cache-empty
+ live-pending ("searching…"), S3, S4, S5 remain individually distinguishable, and when the cache answers
confidently no live call fires so S2/S4/S5 don't arise. Full walk in §3b. (The S2 "cache-empty" copy still MUST
NOT imply the place is absent, since a live augment may follow.)

---

## §8 — D6 UX delegation boundary (item 6)

**This ADL fixes (the behavioral/data contract underneath):** the routing rule (D1); the identity/dedup
contract and the P2 osm-id-on-search addition (D3/§9); the single ambiguity definition + the collapse rule and
its shared-fixture verification (D2); the region-backfill policy (D4); the message **state machine** — which
states exist and when they fire (D5); the API/route shape (§9); the ATDD behaviors (§10).

**Delegated to UX (presentation, no behavioral authority):** picker row copy and labels; the **cached-vs-live
badge** ("saved" vs "found online"); the wording and placement of the "can't see your place? trigger a full
lookup" escape-hatch affordance; the exact strings for S2/S4/S5; visual grouping/ordering of cached vs live in
the surface. UX consumes the states and contract above; it does not decide when a place binds.

---

## §9 — API / schema / security surface

- **No new routes. No new DB table. No new index. No migration.** (The one anticipated "database follow-up" —
  a `(name,country,region)` unique index — is explicitly rejected; see §2.)
- **One additive API field (Slice 1):** `osm_type`, `osm_id` added to the `GET /api/cities` search projection
  (`repositories/cities.ts` `search` select) + the FE `City` type. Additive — existing consumers unaffected.
- **D7 adds NO endpoint (R1).** The select≠commit change is a pure **frontend re-sequencing** of the *existing*
  `createCity` (`POST /api/cities`) and `addPlace` (`POST /api/trips/:id/places`) calls — a pick sets FE state
  instead of calling them; the explicit button calls them. No route, contract, or payload changes for D7.
- **Behavioral code changes (all in existing modules):** the shared same-place-collapse function + place-level
  `classifyCandidates` and `decideCityDisambiguation` (D2, **Slice 2**); the region backfill in the create insert
  and `commitResolvedOrMerge` (D4, Slice 1); the FE unified surface + invisible-merge trigger + message states +
  select≠commit selection model (D1/D5/D7/D8, Slice 1).
- **Security checklist (OP-06) — named for the Slice-1 build brief.** No new routes ⇒ no new auth/scoping
  obligations. The one additive change is the `osm_type`/`osm_id` fields on the `GET /api/cities` search
  projection: **(1)** the endpoint stays exactly as `requireAuth`-scoped as today — the field addition does not
  touch auth; **(2)** the search's **GE-16 creator-visibility containment predicate** (`repositories/cities.ts
  :112-116`) is **unchanged and still applies** — this is the SEC line the brief carries verbatim: *"preserve the
  existing GE-16 containment predicate on the `GET /api/cities` search unchanged"*; **(3)** `osm_type`/`osm_id`
  are **public OpenStreetMap identifiers, not user data** — exposing them leaks nothing creator-scoped (they are
  already returned on `POST /api/cities` / `serializeCity`). `POST /api/cities` stays `requireAuth` (city creation
  is any-authenticated-user, ADL-46 D4); `cities` remains global reference data under GE-16 creator-**visibility**
  containment, not row ownership.

---

## §10 — ATDD-first marking + the behaviors QA must pin (OP-35)

**ATDD-first: YES** for the **Slice-1** backend/shared-contract brief (data-integrity + dedup invariant + a
shared FE/BE contract; a wrong implementation is silent-and-plausible — a wrong place binds and looks fine) —
and the **select≠commit selection model (D7)** is pinned ATDD-first too: a regression there is silent-and-
plausible (a place commits with the wrong/blank dates or bypasses the picker) and is precisely specifiable.
**ATDD-first: NO** for the pure-presentation work (badge/label/copy/grouping — visible and recoverable in UAT),
except the message-**state routing** (S2 vs S4 vs S5) and the **D8 trigger policy** (debounce/coalesce/cached-
first-gate), which are behavioral and ARE pinned. **Slice 2's** `classifyCandidates` ε-collapse is ATDD-first:
YES (it is the one change that can *silently corrupt*).

Red acceptance tests to author before any implementer (each maps to a decision; **`[S1]`/`[S2]` = which slice
owns it**; **mock-fidelity**: the geocode double must export/behave like `nominatim-client` — return the
`{status,candidates,truncated}` shape, or the suite passes vacuously, QUAL-22):
1. **`[S1]` (D1/D8/P1)** Name with 2+ distinct live places within the trip countries → the merged surface (cached
   ∪ live, deduped by identity) is shown, nothing auto-bound; single cached row + additional live candidates →
   all shown.
2. **`[S2]` (D2, BE name-path defense-in-depth)** A plain-name create that *bypasses the FE surface* (offline /
   direct API) for a live-ambiguous name resolves to `needs_attention`, not a silent `eligible[0]` (the Newport
   **backend** regression test). NOTE: in Slice 1 the FE surface already prevents the FE from *sending* such a
   bare ambiguous create; this test pins the backend defense-in-depth that Slice 2 adds.
3. **`[S2]` (D2)** Shared golden-fixture set: Melbourne `city`+`municipality` collapse → `ok` (both trees); two
   GB-ENG Newports do NOT collapse → ambiguous (both trees); Springfield IL+MO → ambiguous. Identical verdicts FE
   and BE. (This is the "FE and BE agree" criterion — met only after Slice 2.)
4. **`[S1]` (D3/P2)** A live candidate whose `(osm_type,osm_id)` equals a shown cached row appears once (the
   cached row); picking it attaches by `id` and creates no new row. Assert on BOTH `AddPlaceFlow` and
   `ChangeCityModal` surfaces.
5. **`[S1]` (D4)** Region-tier country, region left blank, unambiguous resolve → `region_id` backfilled; explicit
   user region never overwritten; unseeded region → `region_id` NULL and city still created.
6. **`[S1]` (D5)** cache-empty (S2), live-empty (S4), live-failed (S5) each render their own state; the escape
   hatch is present in S2.
7. **`[S1]` (D7, cached-search pick)** Clicking a cached-search result **selects & populates** and does **not**
   call `addPlace`; only the explicit "Add City & Place" button commits, and the committed place carries the
   current arrival/departure date-field values (BUG-99's core — a pick no longer commits with blank/wrong dates).
8. **`[S1]` (D7, disambiguation-picker pick)** Clicking a `CityPicker` candidate **selects & populates** and does
   **not** call `createCity` or `addPlace`; only the explicit button commits (then `createCity`→`addPlace` run in
   that order, once). Assert `addPlace`/`createPlace` call count is 0 until the button is pressed.
9. **`[S1]` (D7, Melbourne anti-silent-commit guard)** With a picker showing and **no** candidate selected, the
   commit path writes **no** region-null pending row; choosing the explicit **"none of these — add as new"** row
   creates a creator-private plain-name pending row (GE-12/GE-16). (Closes BUG-98's silent region-null save.)
10. **`[S1]` (D8, trigger policy)** The silent live lookup is **debounced** (one call per settled query, not per
    keystroke), **cached-first-gated** (no live call fires when the cached search already returns a confident
    single exact match), and **coalesced** (an unchanged debounced query does not re-fire it). Mock the geocode
    client and assert call count/timing.

---

## §10a — D9 Slice phasing (Q4 resolved: phase it, Slice 1 first) — R1

**Slice 1 — "close every PO-reported bug," lower risk, ships first (ATDD-first for the data-integrity/contract
parts).** Contents: **D7** select≠commit selection model (BUG-99) · **D1** cached-first routing (the cache reuses,
never selects) · **D8** invisible cache/live merge presentation + trigger policy · **D3/P2** expose
`osm_type`/`osm_id` on the `GET /api/cities` search + FE identity-matching (the one additive API field) · **D4**
region backfill (BUG-98's D4 half) · **D5** message states (BUG-73). Tests `[S1]`: 1, 4, 5, 6, 7, 8, 9, 10.
Likely brief split: **Brief A (backend/shared)** — the `osm_type`/`osm_id` search-projection field + D4 region
backfill at both write sites (ATDD-first: YES); **Brief B (frontend)** — the unified surface, the invisible-merge
trigger, the select≠commit selection model, the message states (ATDD-first: YES for the D7 selection model + the
message-state routing + the D8 trigger; NO for pure copy/badge/grouping).

**Slice 2 — the ε-classifier reconciliation, higher-risk fast-follow.** Contents: **D2** — one place-level
ambiguity definition + the same-place-collapse ε, implemented in **both** `classifyCandidates` (the background
resolver) and `decideCityDisambiguation` (the FE), pinned by the shared golden-fixture set. Tests `[S2]`: 2, 3.
This is the only change that can *silently corrupt* (over-collapse binds two real places as one; under-collapse
floods `needs_attention`) — it carries the full ATDD bar and is the primary aim of the fresh-eyes review (§13).

**The slice boundary and its interim, stamped (so it is not a silent half-ship).** After Slice 1 the user-visible
seam is closed **at the frontend**: the merged surface + select≠commit means the FE never silently binds an
ambiguous name, and a picked/added Melbourne carries its region. But the **backend name-path classifier still
keys on `region_iso`** (Defect 2) until Slice 2, so a bare plain-name create reaching the backend *outside* the FE
surface (offline queue, a direct API call) can still resolve to `eligible[0]`. Therefore:

> **INTERIM (Slice 1 → Slice 2), 2026-08-11.** GE-21's success criterion *"the app presents saved matches and
> live candidates together and binds a place only by explicit selection"* is met at ship of **Slice 1**. GE-21's
> companion property that **the frontend and backend apply one identical ambiguity definition** (the D2 "FE and
> BE agree" criterion) is met **only at ship of Slice 2**. This is a documented, deliberate divergence — Slice 1
> is independently green, deployable, and fixes every PO-reported symptom; Slice 2 removes the residual backend-
> only silent-resolve and the spurious Melbourne picker. Re-stamp this interim closed when Slice 2 merges.

This matches the ADL-47 expand/contract discipline: each slice is an independently green, deployable step; no
broken intermediate touches `main`.

---

## §11 — Proposed BRD requirement (FLAGGED, not invented — COO→PO gate)

Next free ID is **GE-21** (max is GE-20; verified against BRD + tracker). Proposed text for the COO to run
through the BRD gate with the PO — **amended R1** to carry the select≠commit selection model (BUG-99) and the
seamless invisible merge:

> **GE-21 — Add-place disambiguation is explicit; the catalogue is shown, never silently chosen; selecting is not
> committing.** When a user adds a place, the app presents saved catalogue matches and live lookup candidates
> **together as one seamless list** (the live lookup is automatic, not a manual step) and binds a place **only by
> explicit selection followed by an explicit save**. Choosing a result **selects** it and lets the user set
> optional dates; a **single explicit "Add" action** is the only thing that saves the place. A single cached
> match never pre-empts an available choice among distinct real places, and a shown-but-unresolved choice is
> never silently saved as a guess. *Success criteria:* a name with ≥2 distinct available places presents them and
> binds none automatically; **choosing a result populates the form but writes nothing until the explicit Add**;
> **the place saved carries the dates the user set after choosing** (not blank/stale ones); with a disambiguation
> choice shown and nothing chosen, the explicit save writes no guessed record — the user must pick a candidate or
> explicitly "add as new"; picking a saved place reuses it without minting a duplicate; picking a live candidate
> creates or reuses by identity; a name with one available place offers it as an editable suggestion; the states
> "no saved match", "looked and found nothing", and "lookup unavailable" are individually distinguishable.

**Phasing note (D9 / §10a) — GE-21 ships in two slices.** The explicit-selection + explicit-save + seamless-list
criteria are met at **Slice 1**. GE-21's companion property that **the frontend and backend apply one identical
ambiguity definition** is met only at **Slice 2** (the D2 ε-collapse). If the COO/PO want GE-21 to enter the BRD
now, it should note this interim (or Slice 2's "FE and BE agree" clause enters as a **spike-gated** sub-criterion
until the ε-collapse lands). The §10a INTERIM stamp is the record.

**OP-33 note:** GE-21 does **not** rest on an unverified premise — the load-bearing dedup premise it relies on
is verified in §2 (two probes), *including its holes*, and the design accounts for them. The R1 additions
(select≠commit, invisible merge) rest on **verified live-code mechanisms** (BUG-99's two commit paths traced to
`AddPlaceFlow.tsx:611-613/362/289`; the `TripForm` target pattern read directly), not on premises. So GE-21 may
enter **approved** rather than spike-gated **if** the COO/PO accept §2's verdict and the Slice-2 interim above.
BUG-98's D4 is a refinement of the existing GE-15/GE-16 + D12 rule-3 and needs no new ID — only a confirmed D12
wording amendment.

---

## §12 — Flagged open questions (OP-27 refinement 1)

**Q1–Q4 are RESOLVED (PO, 2026-08-11); reconciled into the sections above. One NEW item (Q5) is flagged for the
COO→PO before fresh-eyes.**

- **Q1 (PO, product — scope of the surface).** *Always live + merge* vs *cached-first + escape hatch*.
  Recommendation was **cached-first**.
  > **RESOLVED (2026-08-11) by PO — CACHED-FIRST.** No mandatory live lookup on every add (the shared 1 req/s
  > public-Nominatim budget reinforces it). Refined: the cache/live merge is **invisible/automatic** (D8 §3b),
  > not a visible "do a full lookup" button — the user sees one seamless list. D8 pins the silent-live-call
  > trigger (debounced + cached-first-gated + coalesced) so "seamless" ≠ "live on every keystroke".
- **Q2 (PO/COO — D12 rule-3 wording).** Confirm the D4 refinement: rule-3 protects a *supplied* region, NULL is
  backfillable from an unambiguous resolve.
  > **RESOLVED (2026-08-11) by PO — BACKFILL confirmed.** A blank region is not a supplied value; backfilling it
  > is not overwriting (D12 rule-3 preserved). COO to record the one-line D12 wording amendment at BRD-gate time.
- **Q3 (PO/cost — backend step-2b hardening depth).** Gate step-2b's single-cache reuse behind a live-agreement
  check? Recommendation was **no**.
  > **RESOLVED (2026-08-11) by PO — TRUST THE CACHE (no gate).** No mandatory backend live-agreement gate on
  > step-2b. The FE surface (Slice 1) + the D2 place-level name-path test (Slice 2) are the protection.
- **Q4 (phasing — the ε work).** Cut line if the `classifyCandidates` ε-collapse is deferred.
  > **RESOLVED (2026-08-11) by PO — PHASE IT, SLICE 1 FIRST.** Two slices with the boundary in **D9 §10a**.
  > Slice 1 fixes every PO-reported bug; Slice 2 is the ε-classifier reconciliation. GE-21's "FE and BE agree"
  > is met only after Slice 2 — the stamped §10a interim.

- **Q5 (NEW — scope of the D7 change; COO→PO before fresh-eyes).** BUG-99's note named `AddPlaceFlow`. Walking
  the seam (OP-27 refinement 2) surfaced that **`ChangeCityModal` shares the same commit-on-pick anti-pattern**
  (`ChangeCityModal.tsx:105/127/155`) **and** the P2 dedup seam, and both surfaces already consume the shared
  `decideCityDisambiguation` + `buildCreateCityDataFromCandidate` utils. **Recommendation:** in Slice 1, extend
  to `ChangeCityModal` **(a)** the P2 identity-matching (it lands automatically via the shared search-projection
  field + shared utils — near-zero extra work) and **(b)** the anti-silent-commit guard (no silent ambiguous
  re-point). **Do NOT** give it the full dates/held-selection restructure — a re-point has no dates, so BUG-99's
  premature-dates bug does not exist there. This is a small **scope confirmation**, not a product fork: the *why*
  is settled (GE-21 binds both surfaces); the only open call is whether ChangeCityModal is in Slice 1 or deferred.
  Recommend **in Slice 1** (cheap, and leaving a second surface committing-on-pick is an inconsistency a UAT will
  find). Flagged rather than assumed because it touches a surface the PO's BUG-99 note did not name.

---

## §13 — Where to aim the fresh-eyes Opus reviewer

The weakest / highest-consequence calls, named deliberately so the review spends its pass on blind spots.
**Scope the WHOLE amended document + the R1 seams (OP-27 refinement 2), not just the amendment.**

1. **§4 `classifyCandidates` → place-level + the collapse ε (Slice 2).** The only change that can *silently
   corrupt* (over-collapse binds two real places as one). Stress the ε at both edges and against real captured
   fixtures. Still the primary aim.
2. **§2 H1 disposition.** Is "accept + self-heal" actually acceptable, or does the legacy NULL-osm_id
   population make duplicate pollution likely enough to warrant the §5 best-effort collapse day one? Probe the
   real staging population if reachable.
3. **§3/§5 P2 seam.** Does exposing `osm_id` on search + FE identity-matching actually collapse the live/cached
   duplicate in every path (including the `ChangeCityModal` re-point reuse), or only in `AddPlaceFlow`? (R1 now
   asserts BOTH via shared utils — verify the assertion.)
4. **The whole-document seam (OP-27 refinement 2):** does D4's region backfill invalidate any earlier verdict
   in ADL-46 (D12/D13) or ADL-55 (the `needs_attention` re-open/wildcard-upgrade path in `findOrUpgradeCity`
   that also writes `region_id`)? Walk the knock-ons — an amendment's consequences routinely stop one step short.
   (R1 §6a walks this and concludes disjoint branches — verify that conclusion.)
5. **§3a D7 fork (a) — is the select≠commit deferral *really* dedup-invariant?** The load-bearing R1 claim is
   that deferring `createCity` to the explicit commit changes no dedup guarantee because every dedup mechanism
   fires at `createCity` time. Stress it: is there ANY path where a pick must resolve identity *before* commit
   for correctness (e.g. the carry-forward candidate lookup keyed on `addedCityId`, or a concurrent add racing
   the same osm-ref between two picks)? If deferral breaks a downstream invariant, this is where it hides.
6. **§6a Melbourne re-scope + §3a anti-silent-commit guard.** Does "no bind without an explicit selection"
   actually close the region-null save on *every* commit path (the plain-name Add, the picker-showing Add, the
   cached-search Add), or is there a fourth path that still writes a guess? And does the "none of these — add as
   new" escape hatch remain reachable in every state (so the guard never traps the user)?
7. **§10a slice boundary.** Is Slice 1 genuinely independently green and does it genuinely close every
   PO-reported symptom without Slice 2 — or does closing BUG-97's Newport actually depend on the Slice-2 BE
   place-level classifier in some path the FE surface doesn't cover? The interim stamp rests on Slice 1 being
   self-sufficient for the *reported* bugs; test that claim.

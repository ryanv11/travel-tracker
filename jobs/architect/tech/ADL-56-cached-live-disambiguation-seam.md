# ADL-56 — The cached-vs-live add-place disambiguation seam (BUG-97 / BUG-98 / BUG-73)

**Date:** 2026-08-11 · **Author:** Architect · **Status:** DESIGN — pending (a) COO→PO resolution of the
flagged open questions in §12, (b) OP-27 fresh-eyes **Opus** review (HIGH stakes: data-integrity/dedup
invariant + a shared FE/BE contract — **never Fable**, it touches identity/dedup reasoning that reads as
security-adjacent), (c) an ATDD-first implementation wave. No production code, no migration generated.

**Tracker:** BUG-97 (primary) · BUG-98 (folds in) · BUG-73 message-copy contract (folds in) ·
**BRD:** refines GE-15, GE-16, GE-19, D12, D14; proposes **GE-21** (PROPOSED / see §11 — COO→PO gate).
**Reuses (no parallel path):** `classifyCandidates` (the live classifier), `decideCityDisambiguation`
(the FE decision), `cityIdentityService.findOrUpgradeCity` / `createOrReuseCarriedCity` (the find-or-create
algebra), GE-19's `needs_attention` lifecycle (ADL-55), the existing `CityPicker`, the `GET /api/cities`
search and `GET /api/geocode` proxy. **Zero new routes. No new DB table, no new index.**

---

## §0 — Summary table

| # | Decision | Recommendation | Confidence |
|---|----------|----------------|-----------|
| D1 | **Routing rule** (the core) — how a live-ambiguous name reaches disambiguation even when one cached row exists | The cache may **reuse** an already-identified place but may **never SELECT** among candidate places. One disambiguation **surface** unions cached rows + live candidates; binding is by explicit pick only. The silent single-cache substitution loses its authority to auto-resolve an un-disambiguated name. | High |
| D2 | **FE/BE ambiguity-definition reconciliation** (osm_id vs region_iso) | **ONE** definition: *more than one distinct real place*, where "distinct real place" = distinct `(osm_type, osm_id)` **after collapsing same-place multi-granularity duplicates**. Defined once, implemented in both trees, pinned by a **shared golden-fixture set** so they cannot drift. `region_iso` distinctness is demoted to the GE-15 auto-fill signal, not the ambiguity test. | High (definition) / Medium (touching `classifyCandidates`) |
| D3 | **Dedup guarantee** (VERIFY, load-bearing) | osm_id dedup is **REAL but PARTIAL** — enforced only for rows that carry a non-null `osm_id`. "Always show the picker → match by osm_id" is dedup-safe for the modern resolved population but **duplicates NULL-osm_id cached rows** (legacy / pending / terminal / seeded). Safety comes from the **surface reusing cached rows by `id`**, not from a DB constraint. **A new `(name,country,region)` unique index is the WRONG fix** (reopens BUG-33 / kills legitimate same-region coexistence). | High — two probes, §2 |
| D4 | **BUG-98 policy** (region-tier, null region, resolved) | **Backfill** `region_id` from the resolved candidate when the user left it NULL in a region-tier country **and** the resolve is region-unambiguous. Backfilling a NULL is **not** overwriting a user value — D12 rule-3 protects a *supplied* value, and NULL is the absence of one. Region-**ambiguous** resolves do not backfill (they are a D1/D2 picker case). | High |
| D5 | **BUG-73 message contract** | Five behavioral states, three of which are conflated today: cache-empty ≠ live-empty ≠ live-failed. Define WHEN each fires; the cache-empty message must never imply the place is absent; the live-lookup escape hatch is always present. Exact copy → UX. | High |
| D6 | **UX delegation boundary** | ADL owns the behavioral/data contract (routing, identity/dedup, the ambiguity definition + collapse rule, region backfill, the message *state machine*, the API shape). UX owns picker/label copy, the cached-vs-live badge, the "can't see your place?" affordance wording, message strings, visual grouping. | High |

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
  (osm ids are public OSM data).
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
- **One additive API field:** `osm_type`, `osm_id` added to the `GET /api/cities` search projection
  (`repositories/cities.ts` `search` select) + the FE `City` type. Additive — existing consumers unaffected.
- **Behavioral code changes (all in existing modules):** the shared same-place-collapse function + place-level
  `classifyCandidates` and `decideCityDisambiguation` (D2); the region backfill in the create insert and
  `commitResolvedOrMerge` (D4); the FE unified surface + message states (D1/D5).
- **Security checklist (OP-06):** no new routes ⇒ no new auth/scoping obligations. `POST /api/cities` stays
  `requireAuth` (city creation is any-authenticated-user, ADL-46 D4); `cities` remains global reference data
  under GE-16 creator-**visibility** containment, **not** row ownership — the search's containment predicate
  (`repositories/cities.ts:112-116`) is unchanged and still applies. Exposing `osm_id` leaks no user data (public
  OSM identifiers). The implementation brief carries no new SEC line beyond "preserve the existing GE-16
  containment predicate on the search unchanged."

---

## §10 — ATDD-first marking + the behaviors QA must pin (OP-35)

**ATDD-first: YES** for the backend / shared-contract brief (data-integrity + dedup invariant + a shared FE/BE
contract; a wrong implementation is silent-and-plausible — a wrong place binds and looks fine).
**ATDD-first: NO** for the pure-presentation slice (badge/label/copy — visible and recoverable in UAT), except
the message-**state routing** (S2 vs S4 vs S5), which is behavioral and IS pinned.

Red acceptance tests to author before any implementer (each maps to a decision; **mock-fidelity**: the geocode
double must export/behave like `nominatim-client` — return the `{status,candidates,truncated}` shape, or the
suite passes vacuously, QUAL-22):
1. **(D1/P1)** Name with 2+ distinct live places within the trip countries → surface shown, nothing
   auto-bound; single cached row + additional live candidates → all shown.
2. **(D1)** Plain-name create for a live-ambiguous name resolves to `needs_attention`, not a silent single-cache
   reuse (the Newport regression test — one cached "Newport, Oregon" must NOT be returned blind when the name is
   live-ambiguous).
3. **(D2)** Shared golden-fixture set: Melbourne `city`+`municipality` collapse → `ok` (both trees); two GB-ENG
   Newports do NOT collapse → ambiguous (both trees); Springfield IL+MO → ambiguous. Identical verdicts FE and BE.
4. **(D3/P2)** A live candidate whose `(osm_type,osm_id)` equals a shown cached row appears once (the cached
   row); picking it attaches by `id` and creates no new row.
5. **(D4)** Region-tier country, region left blank, unambiguous resolve → `region_id` backfilled; explicit user
   region never overwritten; unseeded region → `region_id` NULL and city still created.
6. **(D5)** cache-empty (S2), live-empty (S4), live-failed (S5) each render their own state; the escape hatch is
   present in S2.

---

## §11 — Proposed BRD requirement (FLAGGED, not invented — COO→PO gate)

Next free ID is **GE-21** (max is GE-20; verified against BRD + tracker). Proposed text for the COO to run
through the BRD gate with the PO:

> **GE-21 — Add-place disambiguation is explicit; the catalogue is shown, never silently chosen.** When a user
> adds a place, the app presents saved catalogue matches and live lookup candidates together and binds a place
> only by explicit selection. A single cached match never pre-empts an available choice among distinct real
> places. *Success criteria:* a name with ≥2 distinct available places presents them and binds none
> automatically; picking a saved place reuses it without minting a duplicate; picking a live candidate creates
> or reuses by identity; a name with one available place offers it as an editable suggestion; the states
> "no saved match", "looked and found nothing", and "lookup unavailable" are individually distinguishable.

**OP-33 note:** GE-21 does **not** rest on an unverified premise — the load-bearing dedup premise it relies on
is verified in §2 (two probes), *including its holes*, and the design accounts for them. So GE-21 may enter
**approved** rather than spike-gated **if** the COO/PO accept §2's verdict. BUG-98's D4 is a refinement of the
existing GE-15/GE-16 + D12 rule-3 and needs no new ID — only a confirmed D12 wording amendment.

---

## §12 — Flagged open questions (genuine PO/product forks — resolve BEFORE fresh-eyes, OP-27 refinement 1)

- **Q1 (PO, product — the scope of the surface).** *Always run a live lookup and merge cached+live into one
  picker* (the PO's floated redesign) **vs.** *cached-first, live via the escape hatch* (my recommendation).
  Recommendation: **cached-first**. "Always live" adds a mandatory Nominatim call (1 req/s budget + latency) to
  every add, including the common case of a name already uniquely in the catalogue, for no gain there. The
  seam is closed either way by D1 (the cache can't pre-empt); "always live" is a cost/UX choice, not a
  correctness one. The PO floated it as a hypothesis — this is the call to confirm.
- **Q2 (PO/COO — D12 rule-3 wording).** Confirm the D4 refinement: rule-3 protects a *supplied* region from
  override, and NULL is backfillable from an unambiguous resolve. One-line amendment to D12's text.
- **Q3 (PO/cost — backend step-2b hardening depth).** Should the *interactive* create additionally gate
  step-2b's single-cache reuse behind a live-agreement check (never reuse a single cached row without confirming
  the live lookup shows no other place)? Recommendation: **no** by default — the FE surface + D2's place-level
  name-path test already prevent the silent bind; adding a mandatory live call at every create duplicates Q1's
  cost. Flag because it is the one place a reviewer might argue the backend is still FE-dependent.
- **Q4 (phasing — the ε work).** If the `classifyCandidates` collapse (D2, the highest-risk item) is deferred,
  ship the FE surface + D1 + D4 + D5 first and leave the background resolver on region_iso as a documented
  interim (the §4 "relationship-only" fallback), with GE-21's "FE and BE agree" criterion met in a later slice.
  Recommendation: **do the collapse** — but this is the natural cut line if the wave must be split.

---

## §13 — Where to aim the fresh-eyes Opus reviewer

The weakest / highest-consequence calls, named deliberately so the review spends its pass on blind spots:
1. **§4 `classifyCandidates` → place-level + the collapse ε.** The only change that can *silently corrupt*
   (over-collapse binds two real places as one). Stress the ε at both edges and against real captured fixtures.
2. **§2 H1 disposition.** Is "accept + self-heal" actually acceptable, or does the legacy NULL-osm_id
   population make duplicate pollution likely enough to warrant the §5 best-effort collapse day one? Probe the
   real staging population if reachable.
3. **§3 P2 seam.** Does exposing `osm_id` on search + FE identity-matching actually collapse the live/cached
   duplicate in every path (including the ChangeCityModal re-point reuse), or only in AddPlaceFlow?
4. **The whole-document seam (OP-27 refinement 2):** does D4's region backfill invalidate any earlier verdict
   in ADL-46 (D12/D13) or ADL-55 (the `needs_attention` re-open/wildcard-upgrade path in `findOrUpgradeCity`
   that also writes `region_id`)? Walk the knock-ons — an amendment's consequences routinely stop one step short.

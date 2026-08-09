# ADL-53 — Narrow the add-place picker by the trip's declared country SET (hard filter)

**Date:** 2026-08-08 · **Author:** Architect · **Status:** DESIGN — pending fresh-eyes (OP-27),
BRD promotion (GE-20), and implementation. No production code in this PR.
**Tracker:** BUG-87 (headline of the geocoder-picker bundle) · **BRD:** proposes **GE-20**
(to be formalized by COO before implementation) · **Interacts:** GE-14 / GE-15 / GE-16, BUG-90,
BUG-91.

---

## 0. Summary table

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D1 | Wire format for passing the trip's country set into the two lookups | Add a **new** `country_codes` param (comma-joined ISO alpha-2) to `GET /api/cities` and `GET /api/geocode`, distinct from the existing single `country_code`. Nominatim's `countrycodes` natively accepts the comma list. | High |
| D2 | Hard-filter semantics on a **non-empty** set | `inArray(cities.countryCode, set)` for the DB search; `countrycodes=<set>` for the geocode lookup. Only candidates in the set. | High |
| D3 | **Zero-declared-countries** trip (set is empty; `country_codes` is optional at create) | Empty set ⇒ treat as *not-yet-constrained* ⇒ run the lookup **unconstrained** (today's behaviour) **and** show a visible "add countries to filter" prompt. Do **not** hard-empty the result. **OPEN — PO to confirm** (§Open Q1). | Medium |
| D4 | **Editable set / off-country add** interaction | Day one: on an empty *filtered* result, show "No places found in `<trip countries>` — to add a place elsewhere, add its country to this trip," linking to the trip's country editor (reuse TripForm + the countries sub-router). The smart inline "`Paris` is in France — add France?" probe is a flagged enhancement. **OPEN — PO to choose** (§Open Q2). | Medium |
| D5 | UI affordance — the "filtered by" note | Persistent header line in the picker: "Showing places in: `<country names>`," sourced from `trip.countries` (already in the trip payload). Multi-country lists the names; a large set is counted/truncated. | High |
| D6 | Composition with GE-15 auto-populate | Constraining the geocode candidate space to the set is sufficient; the existing BUG-71/75 tentative-suggestion + place-picker machinery composes unchanged. Pre-*confirming* the country on a single-country trip is a flagged nice-to-have, not day one. | High |
| D7 | BUG-90 seam (a "Scotland" trip) | BUG-87 filters at **ISO alpha-2 country** granularity only. `trip_countries.country_code` FK-RESTRICTs to `countries` (ISO), so BUG-90 must map "Scotland" → `GB` before storing; a Scotland trip therefore filters to `GB` and admits all UK cities. Sub-country (region) narrowing is **explicitly out of scope** (PO-accepted). **No ordering dependency** between the two bugs. | High |
| D8 | Schema impact | **None.** Read-path query params only; no migration, no new columns, no expand/contract. | High |
| D9 | Security (OP-06) | No new user-data scoping. `country_codes` is a non-sensitive narrowing hint over **global reference data**; GE-16 creator-scoping on `cities` is orthogonal and preserved. Auth already applied globally. | High |
| D10 | ATDD-first (OP-35) | **YES** for the backend contract brief — a wrong filter is silent-and-plausible and precisely specifiable. Frontend wiring/affordances brief: **no** (UAT-visible, complex frontend excluded per OP-35). | High |

---

## 1. Problem (verified, not inherited)

Searching "Newport" while adding a place to a UK trip returns USA Newports. Two distinct picker
surfaces are both unfiltered by the trip's countries:

1. **DB city search** — `GET /api/cities?q=…` (AddPlaceFlow step 1, `useCitySearch`). Today it
   passes **no** country constraint (`useCities.ts:131` builds `/api/cities?q=…` only). It returns
   every catalogue city matching the name, across all countries.
2. **Geocode discovery lookup** — `GET /api/geocode?q=…` (fired on "+ Add new" to auto-populate
   country/region, `useCities.ts:42`, `lookupCityCountry`). Today it is the **unconstrained
   DISCOVERY path** (`geocode.ts:60-61`, `DISCOVERY_LIMIT`) — it narrows by the country the
   *geocoder auto-detects from its top candidate*, not the trip's. This is the root of the
   "USA Newport auto-detected on a UK trip" symptom.

**Classification (OP-32): GAP.** Trip-country narrowing was the ADL-48 spike's "recommended, not
day one" item; it was never built. Verified two ways: the two query builders above carry no
country-set param, and `AddPlaceFlow` is not passed the trip's countries at its call site
(`TripDetail.tsx:275-281` passes `tripId`, dates, `isFirstPlace` only).

### 1.1 The load-bearing premise I probed first — and it holds

The schema comment on `trip_countries` says it is *"Derived from trip_places via city →
country_code"* (`schema.ts:464-466`). If that were the live write path, the PO's model
("declared at trip creation, editable") would be wrong and a hard filter would be **circular**
(you couldn't add a place in a country until you'd added a place in it). **It is not the live
path.** Two independent probes:

- **Grep of write callers.** The only callers of `setCountries` / `addCountries` /
  `removeCountry` are `POST /api/trips` (create, `trips.ts:173`), `PATCH /api/trips/:id`
  (`trips.ts:328`), and the `trip-countries` sub-router (`trip-countries.ts` POST add / DELETE
  remove). **`places.ts` writes no country row** on place-add.
- **Reading the create/edit UI.** `TripForm.tsx` already renders a **country multi-select**
  (`selectedCountryCodes`, country chips, submits `country_codes` on both create and edit,
  `TripForm.tsx:56/115/199`). The set is **user-declared at trip creation and editable** — exactly
  the PO model.

So the machinery the PO described already exists end-to-end; BUG-87 is the missing **read-path
wiring** plus affordances. The schema comment is stale (aspirational "could be derived") and
should be corrected in the implementing PR to say the set is user-declared — flagged, not
changed here.

---

## 2. Decisions

### D1 — Wire format: a new `country_codes` param, distinct from `country_code`

Both endpoints already accept a single optional `country_code` (`geocode.schemas.ts`,
`cities.schemas.ts:34-37`). **Add a new `country_codes`** param — a comma-joined list of ISO
alpha-2 codes — rather than overloading `country_code`.

- The existing `country_code` on `/api/geocode` is the **D12 create-time constraint** (one
  user-selected country, `cities.ts` POST path via `resolveCityName`). "The trip's filter set" is
  a *different* semantic; overloading one param to mean both is a category error. Keep
  `country_code` = "the single country this create is constrained to (D12/GE-16)"; add
  `country_codes` = "the trip's filter set (BUG-87)."
- **Nominatim native fit:** `countrycodes` accepts a comma-separated list upstream, so
  `country_codes=gb,us` maps to `countrycodes=gb,us` with no per-country fan-out and one request.
- **Additive & backward-compatible:** existing single-`country_code` callers (the D12 create
  lookup) are untouched — the schema gains an optional field, nothing is removed.
- **Precedence if both are present** (a corner the picker never actually hits — discovery supplies
  the set, create supplies the single): the explicit single `country_code` wins (narrower,
  user-confirmed). State it so the contract is total; don't rely on "never both."

Zod: `country_codes: z.string().optional()` transformed to `string[]` (split on `,`, each
validated `zCountryCode`, deduped, capped — see §4 cap note). Backend joins for Nominatim / feeds
`inArray` for the DB.

### D2 — Hard-filter semantics (non-empty set)

- **DB search:** add `inArray(cities.countryCode, set)` to the existing `conditions` array in
  `GET /api/cities` (`cities.ts:52-53`), alongside — not replacing — the GE-16 `containment`
  clause. Only catalogue cities whose country is in the set match.
- **Geocode:** set `params.countrycodes = set.join(',').toLowerCase()`. Only candidates in the set
  come back. The limit tier: a non-empty set already restricts Nominatim's search space, so
  `CONSTRAINED_LIMIT` is defensible; but a **multi-country** set is broader than the single-country
  D12 case BUG-79 reasoned about. **Recommendation:** keep `CONSTRAINED_LIMIT` when the set has
  one country; use `DISCOVERY_LIMIT` when the set has ≥2 (more countries ⇒ more legitimate
  same-name candidates to separate in the picker). Low-risk either way — downstream already
  handles an arbitrary candidate count (`geocode.ts:44-49`).
- **A city whose country isn't in the set** ⇒ both lookups return empty ⇒ the empty-state
  affordance (D4) fires. This is the intended hard-filter behaviour, not an error.

### D3 — Zero declared countries (the empty set) — **OPEN Q1**

`country_codes` is **optional** at trip creation (`trips.schemas.ts:13`), so a trip can have an
empty `trip_countries` set, and existing trips created before this feature will. A literal hard
filter on an empty set returns **nothing** — a brand-new trip's picker would return no results
with no visible cause. That is a dead end.

**Recommendation:** an **empty set means "not yet constrained," not "constrain to nothing."** The
lookup runs unconstrained (exactly today's behaviour), and the picker shows a visible prompt:
"This trip has no countries yet — add countries to filter places" linking to the trip's country
editor. This preserves the feature's *intent* (once you declare countries you get the filter)
without bricking the new-trip flow.

- **Alternative A (require ≥1 country at trip creation)** closes the hole at the source but is
  **BUG-91's** territory, is a separate brief, and does **not** cover the existing empty-set trips
  — so the lookup layer must handle empty gracefully regardless. A create-time requirement can
  land later as defence-in-depth; it does not remove this decision.
- **Alternative B (hard-empty + prompt)** is the most literal reading of "hard filter" but trades
  a worse first-run UX for purity. I do not recommend it.

**This is a genuine product call — flagging rather than guessing** (per brief). My
recommendation is the unconstrained-plus-prompt fallback.

### D4 — Editable set / off-country add — **OPEN Q2**

The set is editable today (TripForm; `POST/DELETE /api/trips/:tripId/countries`). To add a place
in a country not on the trip, the PO's ruling is: **edit the trip's countries first.** Two ways to
surface it on an empty *filtered* result:

- **D4a (day-one, recommended): a static empty-state.** "No places found in `<trip countries>`.
  To add a place elsewhere, add its country to this trip," with a button opening the trip's country
  editor (reuse TripForm, or a lightweight inline country-add calling the countries sub-router —
  the GE-16/GE-19 re-point-path family). **Zero extra geocode calls**, guaranteed correct, reuses
  existing mechanisms.
- **D4b (flagged enhancement): a discovery probe.** On empty filtered results, run **one**
  *unconstrained* discovery geocode (the exact code that exists today) to learn what country the
  searched name is in, then offer "`Paris` is in France — add France to this trip?" that calls
  `POST /:tripId/countries` and re-runs the now-in-set search. Smoother, but adds one Nominatim
  call per empty filtered result (bounded — only on misses) and more frontend state.

**Recommendation:** ship **D4a** day one; hold **D4b** as a fast-follow the PO can green-light.
This is the "off-country-add UX" the brief asked me to flag — **OPEN, PO to choose.**

### D5 — The "filtered by your trip's countries" note (UI affordance)

A persistent line at the top of the picker: **"Showing places in: United Kingdom"** (or
"United Kingdom, United States" for multi-country). Data comes from `trip.countries`
(`{ country_code, name }[]`, already in the `GET /api/trips/:id` payload — no new fetch). For a
large set, show a count ("Showing places in your 6 trip countries") to avoid an unwieldy line.
Rendered above the search input in `AddPlaceFlow` (and its mobile twin
`MobileTripDetailView.tsx:280`). When the set is empty, this line is replaced by the D3 prompt.

### D6 — Composition with GE-14 / GE-15 / GE-16

- **GE-14 (DB-first search):** now country-filtered. The find-first-in-catalogue behaviour is
  unchanged except for the added `inArray`.
- **GE-15 (auto-populate country/region):** constraining the geocode candidate space to the set is
  the whole fix. `candidates[0].country_code` (the GE-15 suggestion source) can now only be an
  in-set country. The existing BUG-71 tentative-suggestion and BUG-75 place-level `CityPicker`
  machinery (`decideCityDisambiguation`) composes **unchanged** — cross-country candidates *within*
  the set surface in the picker exactly as same-country ones do today (each candidate carries its
  own `country_code`). **Nice-to-have (flagged, not day one):** when the trip has exactly one
  country, the country field could be pre-*confirmed* rather than merely *suggested* (it is a hard
  constraint, not a guess) — a small GE-15 polish, out of scope here to keep behaviour uniform.
- **GE-16 (find-or-create, re-point):** unaffected. Create still carries OSM identity; the D12
  single-`country_code` create constraint is a different param (D1) and keeps working. The re-point
  path is reused for the D4 country-add affordance.

### D7 — BUG-90 seam (the critical one)

`trip_countries.country_code` is `text('country_code').notNull().references(countries.countryCode,
{ onDelete: 'restrict' })` (`schema.ts:476-478`) — it can hold **only real ISO alpha-2 codes** that
exist in `countries`. Therefore:

- **BUG-90 owns the mapping** from a commonly-known-as-country ("Scotland") to its ISO code
  (`GB`) + optional region, and must store `GB` in `trip_countries`. It cannot store "Scotland"
  as-is without either a new pseudo-country row or a schema change — that is **BUG-90's** design
  question, not BUG-87's.
- **BUG-87 consumes the resulting ISO-code set** and filters at **ISO-country granularity**. A
  Scotland-declared trip filters to `GB` and therefore admits **all UK cities**, not only Scottish
  ones. The PO explicitly accepted this ("a GB trip country already admits all UK-nation cities;
  sub-country filtering is a separate question," BUG-90 note). **Region-level narrowing is
  out of scope for BUG-87.**
- **No ordering dependency.** A `GB`-declared trip already filters correctly with BUG-87 alone;
  BUG-90 only makes "Scotland" *declarable* (mapping to `GB`), which BUG-87 handles transparently.
  Ship order is free.

### D8 — Schema impact: none

This is a **read-path** change: two optional query params on two GET endpoints, plus frontend
threading of `trip.countries` into the picker. **No migration, no new columns, no expand/contract
(ADL-47) staging.** The only schema-adjacent action is a doc-comment correction on `trip_countries`
(D-1.1) — non-functional.

### D9 — Security (OP-06)

- **Auth:** both routes already sit under `app.use('/api/', requireAuth)` — never anonymous.
  Unchanged.
- **No new user-data scoping needed.** `country_codes` narrows results over **global reference
  data** (`cities`, `countries` are shared catalogues). It is not an authorization boundary: a
  client passing arbitrary country codes can only *narrow* which global cities it sees, never widen
  access or reach another user's private data. The GE-16 creator-scoping on `cities` (the
  `containment` clause: `resolved OR createdByUserId = me OR creator IS NULL`) is **orthogonal and
  preserved** — country filter and creator scope AND together.
- **No new user-referencing columns** ⇒ the `.notNull()` FK checklist item is N/A (no schema
  change).
- **Leak check:** the "filtered by" note and empty-state derive from `trip.countries`, already
  owner-scoped at `GET /api/trips/:id` (`findByIdOrThrow`). Nothing new is exposed.

### D10 — ATDD-first marking (OP-35)

**Backend contract brief: `ATDD-first: yes`.** A wrong filter is *silent-and-plausible* (too loose
= the bug persists; too tight = valid results silently vanish) and the behaviour is *precisely
specifiable up front*. It changes a **shared lookup contract** consumed by the picker. QA writes
red acceptance/integration tests **before** the implementer:

1. `GET /api/cities?q=Newport&country_codes=GB` returns only `country_code=GB` rows.
2. `GET /api/cities?q=Newport` (no `country_codes`) is byte-for-byte today's behaviour (no regression).
3. `GET /api/cities?q=…&country_codes=GB,US` returns the **union** (GB ∪ US), nothing else.
4. `GET /api/geocode?q=…&country_codes=gb,us` propagates `countrycodes=gb,us` to the Nominatim
   client (assert on the client call args) and returns only in-set candidates.
5. Empty / absent `country_codes` on `/api/geocode` ⇒ unconstrained DISCOVERY path unchanged.
6. A name whose only real matches are outside the set ⇒ empty candidate list (the D4 empty-state trigger).
7. `country_codes` with an invalid code ⇒ 400 (schema rejection), not a silent drop.

**Mock-fidelity (QUAL-22):** the `nominatim-client` test double **must** honour `countrycodes` —
a mock that ignores it makes test 4 pass vacuously and specifies nothing. State this in the QA brief.

**Frontend wiring/affordances brief: `ATDD-first: no`** — UAT-visible and recoverable; complex
frontend that never needed the Architect is the deliberate OP-35 exclusion. It still **consumes**
the backend contract tests as its definition of the API it calls.

---

## 3. Proposed GE-20 (for COO to formalize in the BRD before any implementation brief)

> **GE-20 — Trip-country-scoped place picker.** When a user adds a place to a trip, the place
> picker — both the existing-city database search (GE-14) and the geocoding lookup that
> auto-populates a new city (GE-15) — is **hard-filtered to the set of countries declared on that
> trip** (`trip_countries`, declared at trip creation and editable at any time via the trip form).
> Only candidate places in the trip's declared countries are offered; the filter is a constraint,
> not a ranking. The picker carries a **visible note** naming the countries it is filtering by. To
> add a place in a country not on the trip, the user **adds that country to the trip first**; the
> picker surfaces a discoverable path to do so from an empty result. A trip with **no** declared
> countries is treated as unconstrained (the picker filters nothing) and prompts the user to add
> countries. Filtering is at **ISO-country granularity** (a trip declaring a commonly-known-as
> country such as "Scotland" — BUG-90 — filters by its mapped ISO country, e.g. `GB`, and admits
> all cities in that country; sub-country/region narrowing is out of scope).
>
> **Success criteria:**
> - Searching a name that exists in multiple countries, on a trip declaring exactly one of them
>   (e.g. "Newport" on a `GB` trip), returns only that country's matches from both the database
>   search and the geocoding lookup — no out-of-country candidates appear.
> - On a trip declaring **multiple** countries, the picker returns the **union** across the declared
>   set and nothing outside it.
> - The picker displays a note naming the country/countries it is filtering by, sourced from the
>   trip's declared countries.
> - Searching a name whose only real match is a country **not** on the trip returns an empty result
>   that offers a discoverable action to add that country to the trip (rather than a silent blank).
> - A trip with **no** declared countries returns unfiltered results and shows a prompt to add
>   countries; adding a country then narrows subsequent searches.
> - Removing all out-of-set narrowing is impossible without editing the trip's countries — the
>   filter cannot be bypassed from within the picker (the editable set is the only escape hatch).
> - No place already addable today becomes unaddable **except** by the country filter, and any
>   filtered-out place becomes addable again once its country is added to the trip.
> - The existing single-country create constraint (GE-16/D12) and identity-carry (BUG-75) behaviour
>   is unchanged.

*(BRD housekeeping the COO owns per the gates: add GE-20 to §5.1, bump the header + §13 changelog
to the next version, and create/confirm the BUG-87 tracker entry's `brdRefs: ["GE-20"]`.
Per OP-33 GE-20 rests on **no unverified premise** — the trip_countries write path, the editable
set, and the Nominatim multi-country capability are all verified in §1.1/§2 — so it may enter as
**approved**, not spike-gated. The one remaining open items are UX product calls (Q1, Q2), not
premises.)*

---

## 4. Implementation shape (for the COO to brief — not built here)

Recommended split (both off `main`, PR back to `main`; no schema ⇒ no expand/contract):

- **Brief A — Backend contract (`ATDD-first: yes`).** Extend `GeocodeQuerySchema` and
  `SearchCitiesQuerySchema` with optional `country_codes`; wire `inArray` in `GET /api/cities`
  and `countrycodes` in `GET /api/geocode` (limit-tier per D2); cap the set size (recommend ≤10
  distinct codes — a trip realistically spans a handful; the cap bounds the Nominatim
  `countrycodes` length and the `IN` list) and reject invalid codes at the schema. Correct the
  `trip_countries` doc comment (D-1.1). QA writes the §D10 red tests first.
- **Brief B — Frontend wiring + affordances (`ATDD-first: no`).** Pass `trip.countries` into
  `AddPlaceFlow` (and `MobileTripDetailView`); thread the code set through `useCitySearch` and
  `lookupCityCountry`; render the D5 "filtered by" note, the D3 zero-country prompt, and the D4a
  empty-state country-add path. Consumes Brief A's contract.
- **UX input:** the note copy, the empty-state, and the zero-country prompt want a short UX pass
  (independent of Frontend, per role split) — small, but it is genuine user-facing copy/flow.

**Sequencing:** Brief A (QA-first → implement) → Brief B. BUG-90 has no ordering dependency (D7).

---

## 5. Open questions (COO to resolve with PO **before** fresh-eyes, per OP-27 refinement 1)

1. **Q1 — Zero-declared-countries behaviour (D3).** Confirm: empty set ⇒ *unconstrained + prompt*
   (recommended), or *hard-empty + prompt* (literal)? A create-time "≥1 country" requirement
   (BUG-91) is a separate, non-blocking follow-up either way.
2. **Q2 — Off-country-add UX (D4).** Day-one static empty-state linking to the trip country editor
   (D4a, recommended), or the inline discovery-probe "add France?" affordance (D4b, one extra
   Nominatim call per miss)?
3. **Q3 — "Filtered by" note for large sets (D5).** Confirm the count-and-truncate treatment for a
   trip with many countries is acceptable, vs. always listing every name.

Non-blocking (record, don't gate): the GE-15 single-country **pre-confirm** polish (D6) and the
Brief-A **set-size cap** value (§4) are Architect defaults the PO can override but need not decide.

---

## 6. Alternatives considered (rejected)

- **Overload the existing `country_code` to accept a list.** Rejected (D1): it conflates the D12
  create-constraint with the trip filter set — two different semantics — and risks the
  `string | string[]` Express-query footgun on the existing single-value callers.
- **Rank-not-filter (soft narrowing).** Rejected by PO decision (hard filter). Recorded here only
  because the ADL-48 spike raised "a hard filter loses valid results" — that concern is answered by
  the **editable set**: results aren't lost, the constraint is user-editable.
- **Backend derives the trip's countries itself (join trip → cities → country) instead of the
  client passing them.** Rejected: (a) it re-introduces the stale "derived" model §1.1 disproved
  (the declared set ≠ the set of countries of already-added places — that is the whole point of a
  filter for places *not yet added*); (b) it couples the stateless reference-lookup endpoints to
  trip ownership for no security gain (D9). The client already holds `trip.countries`; passing it
  is correct and cheaper.
- **Filter at region granularity for BUG-90 trips.** Deferred, not rejected — out of scope per PO
  (D7); revisit if "only Scottish cities on a Scotland trip" is later required.

---

## 7. Definition-of-done checklist (record-decision)

- [x] Standalone ADL file written; main log gets a summary + pointer entry (same PR).
- [x] Implementation status stated (DESIGN — pending fresh-eyes/BRD/impl).
- [ ] Superseded text: none (no prior ADL/spec section invalidated; `trip_countries` doc-comment
      correction is deferred to the implementing PR, noted D-1.1).
- [ ] Open-question closure: GE-20 is *new*, not answering an existing BRD §10 OQ; N/A.
- [ ] BRD: GE-20 formalized + version bump — **COO action**, not this PR.
- [ ] Success criteria stated (§3) + BUG-87 tracker `brdRefs` update — **COO action**.
- [x] File paths cited verified to exist (geocode.ts, cities.ts, trips.ts, trip-countries.ts,
      TripForm.tsx, AddPlaceFlow.tsx, schema.ts, the two schema files).

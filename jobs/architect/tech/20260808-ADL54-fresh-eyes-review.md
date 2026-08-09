# ADL-54 — OP-27 fresh-eyes review (second, fresh Architect)

**Date:** 2026-08-08 · **Reviewer:** Architect (fresh context — did NOT author ADL-54)
**Target:** `jobs/architect/tech/ADL-54-trip-country-picker-filter.md` (on
`origin/feat/bug87-trip-country-picker-filter`, PR #463), INCLUDING its "COO Adjudication"
(Q1/Q2/Q3) section · **Tracker:** BUG-87 · **BRD:** GE-20 (approved, v3.21)
**Mandate:** critique and stress-test — scope the whole ADL (ADL-52 clause 2), check the seam vs
GE-14/15/16 and the D12 single-`country_code` create-constraint, re-probe the load-bearing factual
claims, stress-test the edge cases and the Q1/Q2/Q3 resolutions and the ATDD-first marks.

---

## VERDICT: SOUND & READY FOR BUILD — no blocking findings.

The design is correct and its three load-bearing factual premises independently re-verify (two
probes each, below). The seam against GE-14/15/16 and the D12 create-constraint is clean — the new
`country_codes` read-path param genuinely does not contradict or double-apply against the existing
single `country_code`. Security (D9) holds. I found **zero blocking issues** and **six non-blocking
refinements** the COO should fold into the two implementation briefs before dispatch — the most
important of which (F1) is an implementation footgun that, if hit, silently produces the *exact
opposite* of the PO's Q1 ruling. None require a redesign; all are brief-level guardrails.

---

## 0. Summary table

| # | Finding | Severity | Disposition |
|---|---|---|---|
| P1 | `trip_countries` is user-declared/editable, not derived on place-add | VERIFIED (2 probes) | Premise holds — design correct |
| P2 | Nominatim `countrycodes` accepts a comma list | UNVERIFIED by probe (firewall) | Documented + non-silent failure; flag for early staging check |
| P3 | Filter narrows global reference data; no new user-scoping | VERIFIED (2 probes) | D9 correct, no leak |
| F1 | Drizzle `inArray(col, [])` → `sql\`false\`` — a naive impl of the empty set returns ZERO rows (contradicts Q1 SHOW-ALL) | Non-blocking (impl risk) | Brief A must branch on `set.length`; add an explicit **empty-string** ATDD case for BOTH endpoints |
| F2 | "Cannot be bypassed from within the picker" is enforced by the *frontend* passing the param, but Brief B is ATDD-first: no → the headline guarantee has an untested link | Non-blocking | Require one Brief-B test pinning "param sent on both lookup paths" |
| F3 | BUG-90 forward seam: BUG-87 assumes `trip_countries.country_code` ⊆ `cities.country_code` code-space | Non-blocking (cross-bug invariant) | Carry into BUG-90's brief; do not let BUG-90 introduce a parallel code-space |
| F4 | `cities.ts` precedence when BOTH `country_code` and `country_codes` are present is unspecified (geocode precedence IS specified) | Non-blocking (never hit today) | State the cities-path total contract in Brief A |
| F5 | D2 single-country discovery uses `CONSTRAINED_LIMIT` (10) with no region picked yet | Non-blocking (tunable, not a regression) | Consider `DISCOVERY_LIMIT` for the region-unpicked discovery path |
| F6 | PR #463 title says "ADL-53"; the deliverable is ADL-54 (renumbered) | Cosmetic | Fix PR title before merge |

---

## 1. Independent re-probe of the load-bearing premises (I did NOT inherit them)

### P1 — `trip_countries` is a user-declared, editable set (NOT derived on place-add). **VERIFIED.**
This is the premise the whole design rests on; if it were derived, a hard filter would be circular.
Two probes that fail differently:
- **Probe A — write-caller grep.** The only writers of the country junction are
  `tripRepository.setCountries` (called at `trips.ts:174` POST create, `trips.ts:329` PATCH) and
  `addCountries`/`removeCountry` (the sub-router, `trip-countries.ts:34`/`:49`). Definitions at
  `repositories/trips.ts:378/389/402`.
- **Probe B — full-symbol grep for `tripCountries`/`trip_countries` across `src/backend`.**
  `places.ts` and the place repository do **not** appear; the place-add path (`places.ts` →
  `placeRepository.create`) writes no country row (I also read `places.ts:75-120` — it only
  *reads* `cities.countryCode` for the response payload). The schema doc-comment at
  `schema.ts:464-466` ("Derived from trip_places via city → country_code") is **stale**; the live
  path is user-declared. The ADL's §1.1 conclusion and its "correct the comment in the impl PR"
  (D-1.1) are both right.
- Corroborated on the frontend: `TripForm.tsx:55/115` holds `selectedCountryCodes` and submits
  `country_codes` on both create and edit — the editable declared set the PO described.

### P2 — Nominatim `countrycodes` natively accepts a comma-separated list. **UNVERIFIED by probe.**
The firewall blocks reaching Nominatim from this environment (a constraint the codebase already
documents at `geocode.ts:42-45`). What I *can* verify: the existing single-code path already sets
`params.countrycodes = country_code.toLowerCase()` (`geocode.ts:83`) and `nominatim-client.ts:268`
passes it verbatim through `URLSearchParams`, so `country_codes=gb,us` would go out as
`countrycodes=gb%2Cus`. Nominatim's documented behaviour is to accept a comma list here, and
comma-URL-encoding is standard, so this is very likely correct — but **it is a documentation claim,
not a probe result from this box.** Blind spot: if Nominatim rejects or mis-parses the encoded
comma, the multi-country geocode union silently returns wrong/empty candidates. Crucially, **ATDD
test 4 asserts on the client CALL ARGS, not on Nominatim's response** — so the red-test bar cannot
catch a Nominatim-side misbehaviour either. Failure mode is **visible in staging UAT** (empty/odd
geocode results), not silent-and-plausible in prod. **Recommendation:** have QA/impl exercise a real
multi-country geocode against staging early, before this is trusted in a UAT verdict. Non-blocking.

### P3 — The filter narrows global reference data; no new user-data scoping (D9). **VERIFIED.**
- `cities` and `countries` are global catalogues; `GET /api/cities` and `GET /api/geocode` sit under
  the app-level `requireAuth` and carry no per-user *authorization* gate on country. A client
  passing arbitrary `country_codes` can only **narrow** which globally-readable cities it sees —
  never widen access or reach another user's private rows. No privilege boundary is crossed.
- The GE-16 creator-containment clause on `cities` search (`cities.ts:64-68`) ANDs with the new
  `inArray` and is preserved — `where(and(...conditions, containment))` (`cities.ts:93`) keeps it
  intact when `inArray` joins `conditions`.
- The "filtered by" note and empty-state derive from `trip.countries`, which comes from
  `GET /api/trips/:id` behind `findByIdOrThrow(userId, tripId)` (owner-scoped). Nothing new is
  exposed. **D9 is correct — no leak, no new scoping owed, `.notNull()` FK item N/A (no schema
  change).**

**Schema-change gate:** D8 is right that this is read-path only — no migration, no new column, no
expand/contract. I confirm no schema change is proposed; the only schema-adjacent action is the
non-functional doc-comment correction (D-1.1).

---

## 2. Seam analysis (ADL-52 clause 2 — the whole document, and the joints)

**Does `country_codes` (filter) contradict or double-apply against `country_code` (D12 create
constraint)? No.** They are genuinely separate params on separate paths:
- `country_code` (single) is the D12 create-time constraint, consumed by the POST create path
  (`cities.ts:404+`, `resolveCityName`) and `geocode.schemas.ts`. `country_codes` (the trip set) is
  consumed only by the two GET read lookups. **No frontend caller sends `country_code` to either GET
  today** (probe: the only frontend hits are `useCities.ts:131` `/api/cities?q=` and
  `:46` `/api/geocode?q=` — both send `q` only; `useCities.ts:106/193` merely *read* `country_code`
  off responses / type a POST body). So the "both params present" case the ADL makes total (D1:
  single wins) is purely theoretical — a genuine strength, not a gap, and the totality is good
  hygiene. **F4:** the ADL states the precedence for `/api/geocode` but is silent on `/api/cities`,
  where naive addition yields `eq(country_code) AND inArray(country_codes)` = intersection. Harmless
  (and never hit), but Brief A should state the cities-path contract explicitly so the implementer
  doesn't guess.
- **GE-14 (DB-first search):** unchanged except the added `inArray` in the `conditions` array
  (`cities.ts:52`). Find-first-in-catalogue behaviour preserved.
- **GE-15 (auto-populate):** constraining the geocode candidate space is the whole fix;
  `candidates[0].country_code` (`geocode.ts:140`) can now only be an in-set country. The BUG-71/75
  tentative-suggestion + `CityPicker` machinery composes unchanged — each candidate carries its own
  `country_code`. No earlier verdict invalidated.
- **GE-16 (find-or-create / re-point):** unaffected; the re-point path is *reused* for the D4a
  country-add affordance, consistent with GE-19's re-point reuse.

**F5 (limit tier vs BUG-79).** D2 keeps `CONSTRAINED_LIMIT` (10) for a single-country set and
`DISCOVERY_LIMIT` (40) for ≥2. This is *consistent* with `geocode.ts:36-39` ("a country-constrained
call keeps the original narrow limit — countrycodes already restricts the search space"), so it is
**not** a BUG-79 regression — the "slots spread across countries" failure mode cannot occur once
`countrycodes` pins the country. Residual, smaller risk: the picker's discovery call runs *before a
region is picked*, so a single-country trip in a large country searching a very common name (e.g.
"Springfield" on a US trip) could exceed 10 in-country same-name matches and truncate the intended
one (the D14 candidate the user needs). It degrades gracefully (`truncated` is surfaced,
`geocode.ts:149`) and is still better than today's unconstrained-40. **Non-blocking, tunable** — I'd
lean toward `DISCOVERY_LIMIT` whenever the discovery lookup is country-constrained-but-region-unpicked
(i.e. always, in the picker path), but the ADL already flags the choice as low-risk and I agree.

**F3 — BUG-90 forward seam (the one worth carrying forward).** D7 is correct *today*:
`trip_countries.country_code` FK-RESTRICTs to `countries.countryCode` (`schema.ts:476-478`), so it
can hold only real ISO codes, a Scotland trip stores `GB`, and BUG-87 filters `GB` → all UK cities
(PO-accepted). No ordering dependency — confirmed. **But BUG-87's hard filter silently assumes
`trip_countries.country_code` is drawn from the same code-space as `cities.country_code`.** If a
future BUG-90 design introduces a parallel "commonly-known-as-country" code-space (its tracker note
floats "expose home nations as selectable 'countries'" and "a curated list … that aren't strict ISO
country entries"), and any such code lands in `trip_countries` that does **not** exist in
`cities.country_code`, then `inArray(cities.countryCode, ['<pseudo>'])` matches **zero** cities and a
Scotland trip's picker goes silently empty. This is not a BUG-87 defect — BUG-87 is correct as
designed — but it is a **cross-bug invariant** the COO must carry into BUG-90's brief: *whatever
BUG-90 stores in `trip_countries` must resolve to codes that exist in `cities.country_code`.*

---

## 3. Edge cases (the hard-filter behaviours the ADL designs)

**F1 (most important — an implementation footgun that inverts Q1).** Q1's PO ruling is SHOW-ALL +
nudge for a zero-country trip. I verified directly in the installed Drizzle source
(`node_modules/drizzle-orm/sql/expressions/conditions.js:73`) that `inArray(column, [])` returns
`` sql`false` ``. So an implementer who naively "always pushes `inArray(cities.countryCode, set)`
from the param" produces `WHERE … false` for an empty set → **zero rows returned** — the literal
hard-empty behaviour the PO *rejected*, and it would read as a mystifying "new trip shows nothing."
The ADL's D3 specifies the correct behaviour (empty ⇒ run unconstrained), so this is not a design
error; it is an implementation hazard the brief must nail down:
- **Brief A must branch on `set.length`** — only push `inArray` / set `countrycodes` when the set is
  non-empty — on *both* endpoints.
- **The ATDD bar (D10) must add an explicit present-but-empty case** (`country_codes=` empty string)
  for **both** `/api/cities` and `/api/geocode`, distinct from the "absent" cases (tests 2/5). The
  empty-string input is exactly what a zero-country trip's frontend would send (`[].join(',') === ''`),
  and it is the *only* input that trips the `inArray([])` → `false` footgun. Without this red test the
  Q1 guarantee is unpinned.

**F2 — "cannot be bypassed from within the picker" has an untested link.** This GE-20 success
criterion is a genuine end-to-end guarantee, but its enforcement straddles both briefs: the backend
only filters *when the param is present* (Brief A, ATDD-tested), and the frontend must *always send
the param on both lookup paths* (Brief B, `useCitySearch` + the geocode lookup). Brief B is
ATDD-first: no, so the load-bearing "param is always sent" link has **no red test**. A future
frontend refactor could drop the param on one path and silently reopen BUG-87 with every backend
test still green. **Recommendation (non-blocking):** keep Brief B ATDD-first: no for the affordances,
but require at least one Brief-B component/integration test asserting the picker passes the trip's
`country_codes` to both lookup calls — the executable guard for the "cannot be bypassed" criterion.
This is a refinement to D10's rationale, not an override of it.

**Off-country add (Q2 / D4a) and multi-country union:** sound. Union is a plain `inArray`; the empty
*filtered* result (a real city whose only match is off-trip) correctly falls to the static empty-state
linking the trip country editor (reusing TripForm / the sub-router — a legitimate reuse, consistent
with the project's reuse-not-duplication preference).

---

## 4. Q1 / Q2 / Q3 resolutions and the ATDD-first marks

- **Q1 (SHOW-ALL + nudge):** correct and lower-risk than hard-empty; matches GE-20. The *only* caveat
  is the F1 implementation guard above — the ruling is right, the code must not betray it.
- **Q2 (static empty-state + editor link, day one; inline "add [country]?" a fast-follow):** sound.
  Zero extra geocode calls, guaranteed correct, reuses the GE-16/GE-19 re-point family. The deferred
  D4b probe is a legitimate fast-follow, not a hidden dependency.
- **Q3 (name-and-truncate the "filtered by" note):** fine; pure presentation, correctly punted to the
  frontend/UX brief.
- **ATDD-first marks (D10): correct.** Backend contract = yes (a wrong filter is silent-and-plausible
  — too loose keeps the bug, too tight vanishes valid results — and precisely specifiable; it changes
  a shared lookup contract). Frontend affordances = no (UAT-visible, complex frontend, the deliberate
  OP-35 exclusion). The mock-fidelity call-out (the `nominatim-client` double must honour
  `countrycodes` or test 4 passes vacuously, QUAL-22) is exactly right and must stay in the QA brief.
  My only additions are F1 (empty-string case) and F2 (one frontend param-sent guard) — refinements to
  the *contents* of the ATDD bar, not to the yes/no marks.

---

## 5. GE-20 success criteria — testability & brief split

All eight GE-20 success criteria are measurable and testable (single-country narrowing, multi-country
union, the note, off-country empty-state, zero-country unconstrained+prompt, no-bypass, addability
reversibility, and GE-16/D12/BUG-75 unchanged). The **backend contract (Brief A) → frontend wiring
(Brief B)** split is coherent, off `main`, no expand/contract needed (D8). Sequencing QA(ATDD) →
Brief A → Brief B is correct; BUG-90 has no ordering dependency (D7, F3 caveat noted). The only
criterion whose *test* currently lives in a brief with no red-test bar is "cannot be bypassed" — see
F2.

---

## 6. Disposition

**Ready to build.** The COO should fold F1 and F2 into the brief dispatch (F1 into Brief A's ATDD bar
+ implementation notes; F2 into Brief B), carry F3 into BUG-90's future brief, add the one-line F4
cities-precedence statement to Brief A, treat F5 as a tunable default the impl can pick, fix the PR
title (F6), and have QA/impl run an early real-staging multi-country geocode to close P2's blind spot.
None of these gate the design; ADL-54 is architecturally sound and its premises are independently
verified.

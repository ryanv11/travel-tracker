# ADL-56 / GE-21 Slice 1 — the merged add-place surface (frontend component notes)

**Date:** 2026-08-26 · **Author:** Frontend · **Branch:** `feat/adl56-slice1-frontend`
**Tracker:** BUG-97 (home) · BUG-98 · BUG-99 · BUG-73 · UX-13 · **BRD:** GE-21 (v3.22)
**Design:** `jobs/architect/tech/ADL-56-cached-live-disambiguation-seam.md`
**Acceptance bar:** `jobs/qa/tech/20260826-ADL56-slice1-red-bar.md`

Written so the next engineer can extend this surface without a handover. It documents
structure and the reasons a few non-obvious choices are load-bearing — it does not restate
ADL-56, which stays the canonical home for the decisions themselves.

---

## 1. Module map

| Module | Role | New? |
|---|---|---|
| `hooks/useLiveCityLookup.ts` | The live geocode lookup, keyed by `(settledQuery, countrySet)`. **The single trigger-policy point** (§3b item 7) and the `auto \| manual` rollback seam. | **new** |
| `utils/mergeLiveCandidates.ts` | §5 P2 identity dedup of cached ∪ live. Shared by both surfaces. | **new** |
| `components/shared/CityPicker.tsx` | Unchanged component, two new optional props: `testIdPrefix`, `selectedKey`. | extended |
| `components/TripDetail/AddPlaceFlow.tsx` | The merged surface + D7 select≠commit + D5 states + NB-1 + N3 + UX-13. | extended |
| `components/TripDetail/ChangeCityModal.tsx` | Same merge + dedup + §3a guard (N6 / §12-Q5). | extended |
| `hooks/useAdmin.ts` | `fetchCountryRegions()` — the imperative twin of `useCountryRegions`. | extended |
| `types/api.ts` | `City.osm_type` / `City.osm_id` (the one additive backend field, §9). | extended |

Unchanged and deliberately reused as-is: `decideCityDisambiguation`,
`buildCreateCityDataFromCandidate`, `useCityDisambiguation`, `useCitySearch`,
`lookupCityCountry`, `formatCitySubtitle`, `composeCandidateLabels`.

## 2. The live lookup, and the one thing never to add to it

`useLiveCityLookup(settledQuery, countryCodes)` takes an **already-debounced** query and
issues at most one `GET /api/geocode` per distinct `(query, countrySet)` for the life of
the session (`staleTime: Infinity`). Four properties fall out of React Query's keying
rather than being hand-rolled, which is why the imperative
`lookupCityCountry(...).then(setState)` on `main` was replaced rather than patched:

- **Coalescing** — one in-flight call per key; type → delete → retype does not re-fire.
- **Last-query-wins** — the component reads the *current* key's data, so a late response
  for an abandoned query is never the active data. It cannot mis-render even though it
  stays cached.
- **The in-flight cue** is `isFetching` for the current key, so it never resurrects an
  abandoned query's spinner.
- **Rollback** is `LIVE_LOOKUP_MODE` plus rendering a control; nothing else moves.

> **The one rule.** The cache's *answer* is not, and must never become, an input to this
> hook. A cached-first gate is what the first OP-27 fresh-eyes review found (B1): a single
> cached "Newport, Oregon" row is indistinguishable from "the only Newport that exists", so
> suppressing the lookup on a confident cache hit re-creates BUG-97 exactly. Tests 1 and 10
> are the regression tests for this.

## 3. The selection model (D7)

```
HeldSelection = { kind: 'cached'; city }   // reuse by id — mints nothing
              | { kind: 'live'; candidate } // create-or-reuse by (osm_type, osm_id)
              | { kind: 'plain' }           // plain-name pending row (GE-12/GE-16)
```

Every path on the search screen **selects**; `handleCommit` is the only writer. `null`
means no explicit choice — and per §3a that is precisely when the commit must not write,
which is the Melbourne guard. The name and country of a non-cached selection live in
`selectionName` / `selectionCountryCode`, kept **separate** from the manual form's
`newCityName` / `newCityCountryCode`: only one screen renders at a time, and sharing them
would let a `handleOpenNewCityForm` reset silently clear a selection made elsewhere.

### N3 degrades rather than clears

Editing Country or Name on a held **live** selection turns it into `plain`. The safety
property is identical to clearing — the candidate's `osm_id` can no longer reach
`createCity` under a country it does not belong to, which is what stops a Welsh place being
filed in France via `createOrReuseCarriedCity`'s caller-supplied `countryCode`. Degrading
additionally keeps the user's typing and leaves the surface on screen so the choice is
re-offered. A plain-name create is the low-harm outcome §3a/N4 already sanctions.

### `handleCommit` awaits its regions

The held candidate's country is only known once the user picks, so `useCountryRegions` may
not have fetched that country's seeded list when Add is pressed. `handleCommit` therefore
awaits `fetchCountryRegions(countryCode)` before calling the shared
`buildCreateCityDataFromCandidate`. **Do not "optimise" this back onto the hook** — racing
it drops the region silently, which is BUG-98's symptom.

## 4. Two escape rows that look redundant and are not

The search surface renders both:

- `add-place-none-of-these` — "None of these — add "X" as a new place". An **in-surface
  selection**: holds a `plain` selection (name from the query, country from the live
  lookup's resolved `country_code`) and leaves you on the surface with the dates.
- `+ Add new: "X"` — unchanged: navigates to the **manual form** with country/region
  controls and its own lookup.

They cannot be merged. Making `+ Add new` count as the explicit add-as-new choice would
pre-satisfy the manual form's guard and re-open the Melbourne region-null save through that
path; nine existing suites also depend on `+ Add new` opening the form. Copy and affordance
are UX's under D6 — the *behaviour* of each is the contract. Flagged to the COO as the one
place where the built surface has visible redundancy.

## 5. D5 message states

| testid | Fires when |
|---|---|
| `add-place-state-cache-empty` | catalogue search settled with zero rows. Copy scoped to **saved** places — it may never assert the place is absent, because a live augment may still land. |
| `add-place-state-live-empty` | live settled, `status: 'ok'`, zero candidates. |
| `add-place-state-live-failed` | live settled, `failed` (`status: 'error' \| 'disabled'`, or retries exhausted). |
| `add-place-live-inflight` | live in flight **and** the catalogue search has settled — see §6. |

S4 and S5 render independently of whether cached rows exist: under B1 the live call always
fires, so its outcome layers on top of a cache hit rather than being skipped (the B1
correction to §7).

## 6. Why the NB-1 cue is gated on `!searching`

`live.pending && !searching`. The cue's claim is "there is **more** still coming", which is
only meaningful once the saved list it augments is on screen; while the catalogue search is
itself in flight the surface already shows its own "Searching…", and the click-too-early
race NB-1 exists to warn about cannot occur because nothing is clickable yet. Dropping
`!searching` turns NB-1's non-blocking test red for a real reason, not a timing artifact.

## 7. Scope boundaries left in place (deliberate)

- **The manual form's `CityPicker` still commits on the pick.** Its date fields are
  reachable *before* the pick, so BUG-99's defect (dates structurally unreachable) does not
  arise there. It did receive the §3a guard, its own "none of these" escape row, and the
  UX-13 name invalidation.
- **`+ Add new` fires a second geocode call** for the same name (the form runs its own
  `lookupCityCountry`). Bounded to one extra call on an explicit click; rewiring
  `handleOpenNewCityForm` would touch a function six regression suites depend on for no
  BRD-demanded gain.
- **`ChangeCityModal` has no held-selection/dates restructure** — §12-Q5's scope limit.

## 8. Testids (the contract with QA)

Prescribed by the red bar §5.4 and honoured verbatim; a rename is a COO negotiation.
`add-place-commit` · `add-place-none-of-these` · `add-place-country-select` ·
`add-place-city-name-input` · `add-place-live-option-<osm_type>-<osm_id>` ·
`add-place-state-cache-empty` · `add-place-state-live-empty` ·
`add-place-state-live-failed` · `add-place-live-inflight` ·
`change-city-live-option-<osm_type>-<osm_id>` · `change-city-live-inflight`.
Existing `city-search-result-<id>` unchanged.

## 9. Mobile

`MobileTripDetailView` renders the same `AddPlaceFlow` component (ADL-56 §3a, verified), so
it is covered by construction. The surface is a vertical list inside the existing
`max-h-[85vh] overflow-y-auto` panel and adds no fixed widths; `CityPicker` keeps its own
`max-h-72` internal scroll so a ten-candidate live list cannot push the panel.
`MobileTripDetailView.test.tsx` is green unchanged.

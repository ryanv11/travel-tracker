# Frontend completion — BUG-75 picker-precedence + UX-12: RED suite turned GREEN (OP-35)

**From:** Frontend · **Date:** 2026-08-07 · **Branch:** `feat/bug75-pickerprecedence-and-ux12`
**PR:** [#413](https://github.com/ryanv11/travel-tracker/pull/413) — CI fully green, 18/18 checks
(`scripts/ci-wait.sh pr 413` confirmed, including E2E). Not merged — COO reviews/merges.
**Role in the phase:** ATDD-first (OP-35) implementer. QA's RED suite (branch continuation, same
lineage) is the executable definition of done. I wrote zero new acceptance tests; every AC below is
QA's own test, now green.

---

## Worktree note (procedural, not a deviation from the brief's intent)

The brief said "check out QA's branch INTO your worktree, do NOT start a new branch." QA's own
worktree (`agent-acc03c5dc1ab6c856`) still had `feat/bug75-pickerprecedence-and-ux12` checked out
(stale registration, not cleaned up) — git refuses the same branch in two worktrees. Rather than touch
another agent's worktree, I checked out the identical commit (`81a046b`, verified matching
`origin/feat/bug75-pickerprecedence-and-ux12`) under a locally-scoped branch name
(`feat/bug75-pickerprecedence-and-ux12--fe-worktree`) tracking the same remote ref, then pushed back
to `HEAD:feat/bug75-pickerprecedence-and-ux12` — same history, same remote branch, no new lineage
created. Flagging so it's not mistaken for a rule deviation.

---

## AC status — all green except the deliberately-skipped AC-3

| AC | Status |
|---|---|
| AC-1 spanning-region (headline, pure + composition) | GREEN |
| AC-2 same-region twins | GREEN |
| AC-3 Springfield | `.skip` — **left skipped**, not unskipped, not fabricated (see below) |
| AC-4 F1/F2 parity | GREEN |
| AC-5 single unambiguous (Denver) | GREEN |
| AC-6 region_id alignment | GREEN |
| AC-7 truncation caveat on picker | GREEN |
| AC-8 Change-city control | GREEN (incl. the locked-hides-it guard, was already green, stays green) |
| AC-9 shared precedence (no drift) | GREEN |
| AC-10 re-point preserves data (D11) | GREEN |
| AC-11 badge | GREEN (incl. the resolved-shows-no-badge guard, was already green, stays green) |
| AC-12 identity carry once | GREEN (both the pure-function test and the cross-flow behavioural test) |
| AC-13 country tentative suggestion (MAJOR-2) | GREEN |
| AC-14 creation-time messaging (MAJOR-2) | GREEN |

Full suite: `npm run test:frontend` → **300 passed | 1 skipped (301)**, up from the RED baseline's
285 total (275 passing + 10 failing). The 2 negative guards QA called out (AC-8 locked-hides-it,
AC-11 resolved-shows-none) are unchanged and still pass. AC-3 Springfield is `it.skip` exactly as
QA left it — I did not touch it, did not fabricate a fixture, did not re-probe Nominatim (still the
documented firewall-regressed state).

## Did NOT wholesale-rewrite AddPlaceFlow

`AddPlaceFlow.tsx`'s diff is an extraction + reorder, per the brief's hard rule:
- The if/else branch order in `handleOpenNewCityForm`'s `.then` callback was replaced by one call to
  the new `decideCityDisambiguation()` + a `switch` on its `mode` — the actual reorder is now owned by
  the pure function, not re-derived inline.
- `handleSelectPickerCandidate`'s inline mapping became a call to
  `buildCreateCityDataFromCandidate()`.
- Two new pieces of state (`countryIsSuggested`, `creationStatusMessage`) and their render blocks were
  added for AC-13/AC-14 (MAJOR-2), mirroring the existing `regionIsSuggested`/`placeWarnings` patterns
  exactly rather than inventing a new mechanism.
- Every other piece of state, every existing effect, the whole JSX structure, and all six
  BUG-specific behaviours (BUG-71/72/73/78/79, F1/F2 parity) are untouched. `AddPlaceFlow.test.tsx`,
  `.bug71`, `.bug72`, `.bug73`(geocodeFailure), `.bug78-79`, `.city-picker` all still pass unmodified
  in logic (two of them needed a one-line regex narrowing, see below — not a logic change).

No source file was replaced wholesale. `ChangeCityModal.tsx` is a **new** file (net-new component, not
a rewrite of anything).

## Reuse confirmation (standing PO preference)

- **`CityPicker`** — reused as-is by both `AddPlaceFlow` and `ChangeCityModal`. Not modified.
- **D11 PATCH re-point** (`PATCH /api/trips/:tripId/places/:placeId` with `city_id`) — reused as-is.
  No backend route added or modified (confirmed: `git diff --stat` against `origin/main` for this PR
  touches zero files under `src/backend/`; grep of the diff for `src/backend` returns nothing — two
  probes, both positive/mechanical, not an absence claim needing a second kind of check). The new
  `useChangeCity` hook (`usePlaces.ts`) is a thin frontend wrapper issuing the identical PATCH shape
  `useUpdatePlaceDates` already uses — no new endpoint, no new backend security surface. Per the
  brief's security checklist: **this PR adds/modifies no backend routes**, so the Backend security
  checklist (auth middleware / userId scoping / FK notNull) does not apply — confirmed, not assumed.

## MAJOR-1 (identity-carry, "exists in exactly one place") — how I read the review's intent

The review's suggested shape was a hook owning `POST /api/cities` and handing callers a resolved
`city_id`. QA's own ATDD contract (`buildCreateCityDataFromCandidate.test.ts`) pins it as a **plain,
non-hook utility function** — no React, imported and asserted directly. I built it exactly to that
signature and both `AddPlaceFlow` and `ChangeCityModal` call it directly, each against their own
`useCreateCity()`. The actual drift risk MAJOR-1 flags — the mapping logic (osm forwarding, region_id
derivation) being reimplemented per call site — is eliminated: it exists in exactly one function,
consumed identically (AC-12's cross-flow test asserts this directly). I judged this satisfies
MAJOR-1's intent without introducing a hook shape the ATDD contract didn't call for.

Separately, I did build `useCityDisambiguation.ts` (owns the geocode lookup + runs
`decideCityDisambiguation`) — used by `ChangeCityModal` (brand new, no legacy tests to risk).
`AddPlaceFlow` calls `decideCityDisambiguation`/`buildCreateCityDataFromCandidate` **inline**, within
its existing `.then()` structure, rather than adopting the hook wrapper — a deliberate choice to avoid
restructuring a heavily-regression-tested file's effect/promise timing (six BUG-specific suites) for a
change whose real drift-risk (the decision + identity-carry *logic*) is already eliminated by both
flows calling the identical pure functions. The plumbing differs; the logic that can silently diverge
does not. Flagging this explicitly as an interpretation call, not silently deciding it was in-scope.

## GeocodeStatus type fix — blast radius verified

Changed `src/frontend/types/api.ts`'s `GeocodeStatus` from `'pending' | 'resolved' | 'failed'` to
`'pending' | 'resolved' | 'unresolvable'`, matching the backend CHECK
(`chk_cities_geocode_status`, `src/backend/db/schema.ts:144`) exactly. Two probes, both positive:
- Grepped `'failed'` as a literal across `src/frontend` — one hit outside the type declaration itself:
  `PlaceSection.change-city.test.tsx`'s `makePlace('failed')` (QA's own comment there already flagged
  the mismatch and used `'failed'` to stay type-valid under the *old*, wrong type).
- Read the backend CHECK constraint directly (`schema.ts:144`).
No other frontend code compared against `'failed'` (confirmed by the same grep — zero other hits).
**Necessitated test edit:** changed that one literal to `'unresolvable'` and updated the adjacent
comment — the assertion itself (badge fires for any non-resolved status) is unchanged, only the value
used to reach it.

## Other necessitated test edits (not weakenings — flagging per the brief)

MAJOR-2's new country-suggested caption ("Suggested: <country> — from ...") is unavoidably a NEW match
for any pre-existing broad `/suggested:/i` absence-check once a country is auto-detected — three
pre-existing regression tests (unrelated to QA's suite) asserted "no Suggested: caption anywhere"
using that broad regex, written before a second field could ever carry one:
- `AddPlaceFlow.bug71.test.tsx` (2 assertions) — narrowed to the specific region name(s) the test is
  actually about (`/suggested: virginia/i`, `/suggested: (missouri|colorado)/i`-equivalent as two
  separate checks).
- `AddPlaceFlow.bug78-79.test.tsx` (1 assertion) — same narrowing, three region names.
- `AddPlaceFlow.picker-precedence.test.tsx` (QA's own AC-14 test) — its own wait condition
  `findByText(/Suggested: United Kingdom|United Kingdom/i)` became genuinely ambiguous once the AC-13
  caption it's testing FOR actually renders (the country `<option>` element's plain "United Kingdom"
  text also matches the same regex, and once both match, `findByText` throws "found multiple
  elements" instead of waiting). Narrowed to the specific, more-precise alternate
  (`/Suggested: United Kingdom/i`) that the surrounding comment already said was the real intent.

Each of these is a one-line regex narrowing that preserves the exact regression each test protects
(verified by re-reading each test's own stated purpose before touching it) — none had their assertion
*semantics* weakened. All are called out here per the brief's "flag, don't silently weaken" rule, even
though I judge these necessitated by an explicitly-authorized behavior change (MAJOR-2) rather than
QA-suite weakening.

## D14 stamp (MINOR-2)

`jobs/architect/tech/20260307-architecture-decisions-log.md` — appended (via `Edit`, old text
untouched) a SUPERSEDED-in-part banner directly under D14's paragraph (item 14), per design §7's exact
text. Also recorded the open-questions closure check inline: two probes (grep of the BRD's Open
Questions table for anything D14/picker-related; grep of ADL-46 itself for a "resolves OQ-" tied to
D14) found neither, so there's no open BRD question this stamp closes — D14 was PO-raised with both
answers explicitly permitted, not an answer to a standing open question.

## What I could not verify / inherited as UNVERIFIED

- **AC-3 Springfield** — unchanged from QA's handoff: Nominatim unreachable this session too (did not
  re-probe; inheriting QA's/the design's UNVERIFIED marker rather than silently upgrading it).
- **Real Nominatim shape for the AC-13/AC-14 messaging copy** — the exact wording of UX spec §3.4 was
  not available to me directly (only referenced via QA's test, which pins the substring "still
  confirming this location" as the DoD). I wrote copy satisfying that substring; if the full UX spec
  §3.4 text differs in ways UAT catches, that's a copy-polish follow-up, not a functional gap.

## Files touched

New: `src/frontend/utils/decideCityDisambiguation.ts`,
`src/frontend/utils/buildCreateCityDataFromCandidate.ts`,
`src/frontend/hooks/useCityDisambiguation.ts`,
`src/frontend/components/TripDetail/ChangeCityModal.tsx`

Modified: `src/frontend/components/TripDetail/AddPlaceFlow.tsx`,
`src/frontend/components/TripDetail/PlaceSection.tsx`, `src/frontend/hooks/usePlaces.ts`,
`src/frontend/types/api.ts`, `jobs/architect/tech/20260307-architecture-decisions-log.md`,
plus the three test-file edits listed above.

Pre-push: all green (`npm run check`, `type:check:all`, `test:backend` 740 passed,
`test:frontend` 300 passed | 1 skipped, `status:check`). PR #413 CI: 18/18 green.

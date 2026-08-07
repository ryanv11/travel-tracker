# Frontend completion — BUG-75 / UX-12 shared CityPicker

**Tracker:** BUG-75, UX-12 · **Requirement:** GE-16 (v3.19) · **Branch:** `feat/bug75-frontend`
(off `origin/release/bug75-city-identity`, per the build brief — no PR, COO merges into release)

## What was built
A shared, call-site-agnostic `CityPicker` component
(`src/frontend/components/shared/CityPicker.tsx`) that renders ambiguous geocode candidates by
`display_name` and reports the chosen candidate back via `onSelect`. Wired into `AddPlaceFlow.tsx`:
a new branch in the existing `handleOpenNewCityForm` D14 logic fires the picker when 2+
country-matching candidates carry **distinct OSM identity** (`osm_type`+`osm_id`) — positive
evidence of distinct real places, not inferred from region/display_name — region-only narrowing
cannot separate them (the two GB-ENG Newports). A new `handleSelectPickerCandidate` derives
`region_id` from the pick's `region_iso` via the seeded region map (same pattern as the existing
UX-04 auto-select effect) and sends `{osm_type, osm_id, display_name, region_id}` on `POST /api/cities`.

## Reuse plan actually followed
- **Extended, not forked:** the ambiguity check is a new branch inside the *same*
  `handleOpenNewCityForm` function and the *same* D14 `sameCountryRegionIsos` computation
  (`AddPlaceFlow.tsx:149-183`/`:277-345`) — not a parallel/duplicate mechanism. The existing
  region-`<select>` narrowing (cross-region ambiguity, e.g. Springfield IL/MO/MA), the single-candidate
  `regionIsSuggested` "Suggested:" path (BUG-71/78), and the incomplete-seed fallback are all
  **byte-for-byte unchanged** (all PRESERVE items per design v3 §B5).
- **Gated on positive osm_id evidence, not raw candidate count** — this was a scope decision I made
  and am flagging: v3 §B5 says the old multi-region narrowing "REPLACEs" for the whole ambiguous case
  and its tests "move" to assert the picker. Doing that literally breaks a **currently-green,
  explicitly-named regression-parity test** (`AddPlaceFlow.test.tsx`'s "REGRESSION FIXTURE PARITY:
  two candidates sharing ONE region are NOT flagged ambiguous" — a same-region, no-osm_id fixture
  modelling "same place, different Nominatim granularity," tied to the backend's `classifyCandidates`
  step-4 parity contract, ADL-46 F1/F2). My dispatch's own Verify section requires no regressions in
  existing AddPlaceFlow/city suites, so I resolved the tension conservatively: the picker fires only
  when candidates carry genuine distinct `osm_id`s; region-only ambiguity keeps the existing selector
  untouched. All 4 pre-existing AddPlaceFlow/city test files (91 tests across
  `AddPlaceFlow.test.tsx`/`.bug71`/`.bug78-79`/`.geocodeFailure`) plus the new one are green — 273/273
  frontend suite-wide. Flagging this in case the Architect intended the broader replacement; happy to
  revisit if so.
- **Visual pattern reused, not extracted:** `CityPicker`'s list styling matches the existing
  search-results list (`AddPlaceFlow.tsx` ~:422-444) exactly (same classes/structure) rather than
  extracting that live block — avoided touching regression-tested code for an unrelated data shape
  (post-creation `City` rows w/ `id` vs pre-creation `GeocodeCandidate`s).
- **Two call sites — one built, one flagged as a genuine scope gap.** The component's props
  (`candidates`/`onSelect`/`truncated`/`disabled`) are AddPlaceFlow-agnostic by design, ready for a
  second consumer. I did **not** build UX-12's "Change city" call site: two independent probes (grep
  for "Change city"/"ChangeCity" across `src/frontend`, and a directory listing of every
  Place-related component) confirm **no such UI exists anywhere in the frontend today** — same
  conclusion UX-12's own tracker note already reached via its own two probes. Building it would mean
  inventing a new modal/button/hook from scratch with no red test and no dedicated spec artifact in
  this brief — out of scope for "turn the target test green." UX-12 stays tracked pending (P1) for its
  own brief.

## Acceptance criteria (this brief's scope)
- Target RED test (`AddPlaceFlow.city-picker.test.tsx`, all 3 cases: ask-to-choose #4, carry #1,
  m1 truncation caveat) — **PASS**, not edited.
- No regressions in existing AddPlaceFlow/city suites — **PASS** (273/273 frontend tests green,
  38 files).
- `npm run type:check` / `type:check:all` — **PASS**.
- `npm run check` (biome) — **PASS** (5 pre-existing infos in backend test files I did not touch,
  unrelated to this change).
- `src/frontend` only, no backend/schema touched — **PASS** (confirmed via `git diff --stat`).

## CI
No PR opened per the build brief (COO merges into `release/bug75-city-identity`) — no CI run to
report here. Local gates above are the verification.

## Open issues / blockers
UX-12's second call site is not built — see reuse-plan flag above. Not blocking this brief; flagging
for COO/Architect awareness before UX-12 is briefed.

## Unblocked
Backend's carry-channel work can proceed independently (already spec'd, frontend sends the contract
shape). QA can run its independent verification pass. UX-12, when briefed, has a ready-made
`CityPicker` to consume.

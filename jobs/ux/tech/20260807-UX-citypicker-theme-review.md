# UX Theme Review — City Disambiguation Picker (BUG-81/BUG-74)

**Date:** 2026-08-07
**Reviewer:** UX
**Scope:** PO direction 2026-08-07 (tracker BUG-81 note) — review the shipped picker "as a
whole" for adherence with the app's overall design theme. Review only; no code changed.

**Files reviewed:**
- `src/frontend/components/shared/CityPicker.tsx`
- `src/frontend/components/TripDetail/AddPlaceFlow.tsx` (call site 1)
- `src/frontend/components/TripDetail/ChangeCityModal.tsx` (call site 2)
- `src/frontend/utils/composeCandidateLabel.ts`

**Method:** compared against sibling components in the same (non-Waypoint) family —
`TripForm.tsx`, `Admin/CountryTab.tsx`, `PlaceDateForm.tsx`, `ErrorMessage.tsx` — plus the
Waypoint design-system primitives (`design/Button.tsx`, `design/Input.tsx`, `design/badges.ts`,
`theme-waypoint.css`) to establish what "the app's theme" actually is, per the brief's
instruction not to invent a new system.

## Overall verdict

**Theme-consistent on every axis I could compare against an established in-app precedent** —
spacing, row structure, container styling, and colour vocabulary all match sibling patterns
closely, and the two call sites are near byte-identical. Two **should-fix** gaps and one
**blocker** exist, but all three are **accessibility/feedback gaps that predate or sit
alongside this component**, not new colour/spacing divergences BUG-81 introduced. Rest of the
findings are nice-to-have polish.

---

## Findings

### 1. [BLOCKER — accessibility] Picker rows are unreachable by keyboard

`CityPicker.tsx:91-101` renders each candidate as a bare `<div onClick=...>` — no `tabIndex`,
no `role`, no `onKeyDown`. A keyboard-only user cannot select a candidate at all; there is no
alternative path once the picker is showing (the region `<select>` fallback doesn't apply once
`disambiguation.mode === 'picker'`). Same is true of the pre-existing city-search-result rows
in `AddPlaceFlow.tsx:544-556` and `ChangeCityModal.tsx:196-208` that `CityPicker`'s own doc
comment (lines 42-47) says it deliberately copied.

**This is not a new divergence BUG-81 introduced** — it inherits AddPlaceFlow's pre-existing
pattern. But the app already has an established **accessible** pattern for exactly this
interaction ("pick one row from a filtered/searchable list"): `TripForm.tsx:253-262` renders
its country-autocomplete options as real `<button type="button">` elements — natively
focusable, Enter/Space-activatable, no extra markup. `CityPicker` diverges from that sibling
precedent, not from an invented external bar.

**Direction:** render each row as `<button type="button" className="w-full text-left ...">`
(same visual classes, swap the element) in `CityPicker.tsx`, and ideally in the two upstream
city-search-result lists it was copied from, matching `TripForm.tsx`'s own button pattern. No
new dependency.

### 2. [SHOULD-FIX] Disabled state has no visual signal

`CityPicker.tsx:92-98`: the row's `className` is static regardless of the `disabled` prop —
only the `onClick` handler is gated (`if (!disabled) onSelect(candidate)`, line 96). During a
pending submission (`createCity.isPending || addPlace.isPending`, passed at
`AddPlaceFlow.tsx:714` / `ChangeCityModal.tsx:292`) the rows still show `hover:bg-gray-50` and
`cursor-pointer` as if fully live — a click silently does nothing.

Every other actionable control in this same file family pairs a disabled state with a visible
change: the submit buttons at `AddPlaceFlow.tsx:833` / `ChangeCityModal.tsx:352` both use
`disabled:opacity-60 ... disabled:cursor-not-allowed`, and the `Button` primitive
(`design/Button.tsx:30`) bakes the identical pair into its base classes. This is the
established app-wide vocabulary for "this control cannot be used right now," and the picker's
rows don't use it — a genuine "every action must have a visible result" gap.

**Direction:** branch the row className on `disabled`, e.g.
`disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'`, matching
`Button.tsx`'s own pair exactly rather than inventing a new disabled treatment.

### 3. [SHOULD-FIX] `text-amber-600` caption contrast is below WCAG AA

Used for "— please choose the one you mean" (`AddPlaceFlow.tsx:703`, `ChangeCityModal.tsx:281`),
"— multiple matches found, please choose" (`AddPlaceFlow.tsx:724`, `ChangeCityModal.tsx:301`),
and the picker's own "There may be more matches not shown" (`CityPicker.tsx:107`). Computed
contrast of Tailwind `amber-600` (#D97706) on white is **~3.2:1**, below the 4.5:1 AA minimum
for normal-size text — these all render at `text-xs`/inline with `text-sm`, not large text.

This is a **pre-existing, app-wide pattern** (all three usages above predate BUG-81 except the
picker's own caveat, which just reuses the existing vocabulary exactly as its own doc comment
states it should, `CityPicker.tsx:104-105`) — not something BUG-81 introduced, and not
something a picker-scoped fix can close on its own since the same colour is used identically
in AddPlaceFlow's pre-existing captions.

**Direction:** darken to `amber-700` (#B45309, ~4.6:1, clears AA) for this caption class
app-wide, or pair the caution captions with a non-colour cue. I'd size this as a small,
one-line-per-callsite change rather than a redesign, but flag to COO as a shared-pattern fix
(touches 5 existing usages across 2 files), not a CityPicker-only patch.

### 4. [Consistent — confirmed, no action] Row spacing, typography, and container styling

`CityPicker.tsx:92-94` (`px-3 py-2.5 ... text-sm ... border-b border-gray-100`) is close to
character-identical to the pre-existing city-search-result rows it was modeled on
(`AddPlaceFlow.tsx:548`, `ChangeCityModal.tsx:200`) — same padding, same type scale, same hover
tone, with only an added `last:border-b-0` (a correctness improvement, not a divergence — see
finding 4a). The outer wrapper (`border border-gray-200 rounded-md overflow-hidden`,
`CityPicker.tsx:89`) matches the same bordered-list-container convention used throughout this
component family: `AddPlaceFlow.tsx:543`, `TripForm.tsx:241`, `Admin/CountryTab.tsx`. This
axis is genuinely consistent — no gap to report.

### 4a. [Consistent, informational] `last:border-b-0`

`CityPicker.tsx:94` adds `last:border-b-0`, which AddPlaceFlow's own search-result row list
doesn't have on its per-city rows (`AddPlaceFlow.tsx:548`) — but that list's last visible
border sits correctly between the last city row and the separate "+ Add new" row underneath it
(itself carrying `last:border-b-0`, `AddPlaceFlow.tsx:558`), so there's no double-border defect
there either. Noting only so this isn't misread as an inconsistency — both lists render
correctly, just via slightly different means given their different row sets.

### 5. [Consistent — confirmed, no action] Amber as the app's caution/caveat accent

Confirmed by two probes: a grep for `amber` across `src/frontend/components` and `design/`
(7 hits outside tests), and direct reads of `AddPlaceFlow.tsx`, `ChangeCityModal.tsx`, and
`PlaceDateForm.tsx`. All non-decorative amber usage (i.e. excluding `RatingStars.tsx`'s
unrelated star-rating fill) uses the same `amber-50`/`amber-200`/`amber-300` background+border
with `amber-600`/`amber-800` text for warnings and tentative-value captions. The picker's
"There may be more matches not shown" (`amber-600`) and the "please choose" accents fit this
vocabulary exactly — this is the right colour, just at the contrast finding 3 flags.

### 6. [Consistent — confirmed, no action] The two call sites render identically

Compared `AddPlaceFlow.tsx:699-716` against `ChangeCityModal.tsx:277-294` line by line: the
"Multiple places match…" heading, the amber "please choose the one you mean" accent, the
`CityPicker` props (`candidates`, `onSelect`, `truncated`, `disabled`), and the geocoder-failure
banner (`AddPlaceFlow.tsx:678-689` vs. `ChangeCityModal.tsx:263-274`) are near byte-identical.
This is a genuinely strong result — not just "looks similar," the JSX and classes match.

### 7. [NICE-TO-HAVE] Scroll-affordance boundary math

`max-h-72` (288px) divided by the row's rendered height (~41px: 10px+10px padding, ~20px
line-height, 1px border) works out to **~7.02 rows** — the cutoff lands close to a clean row
boundary, so there's little/no partial-row "sliver" to visually hint more content lies below.
The only signal that the list itself continues past the visible rows would then be the native
scrollbar; the "There may be more matches not shown" caveat is a **separate** signal (upstream
API truncation, `truncated` prop) that stays absent whenever the API returned everything but
the picker still has more rows than fit on screen — so a scrollable-but-not-`truncated` list
gets no caveat text at all, only a scrollbar. *(This is arithmetic from the Tailwind utility
values, not a rendered screenshot — flagging as reasoned, not visually confirmed.)*

**Direction (optional polish):** pick a max-height that intentionally clips mid-row (e.g.
`max-h-[270px]`) so a visibly cut-off row signals "scroll for more" independent of whether the
browser's scrollbar is easy to notice. Low priority — the scrollbar remains a functional
signal even without this.

### 8. [NICE-TO-HAVE] Long/collision-fallback labels can wrap unevenly

`CityPicker.tsx`'s row `div` has no `truncate`/`line-clamp`/fixed height. The county-appended
or coordinate-appended fallback labels from `composeCandidateLabel.ts` (e.g. "Springfield,
Fairfax County, Virginia, United States (38.79, -77.19)") will wrap to two lines in the 480px
modal, making that row taller than its neighbours. I'd recommend **against** truncating —
truncation would hide exactly the disambiguating information the collision rule
(`composeCandidateLabel.ts`'s whole reason for existing) is there to surface — so this is a
genuine trade-off, not a clean fix, and I'm flagging the uneven row rhythm rather than
prescribing a specific resolution. Low priority; skimmability of the common case (short,
single-line labels) is unaffected.

### 9. [Informational, already tracked — no new action] Non-Waypoint token family

`CityPicker`/`AddPlaceFlow`/`ChangeCityModal` all use the legacy raw-Tailwind vocabulary
(`teal-600`, `gray-*`, `amber-*`) rather than the `wp-*` tokens now live elsewhere
(`TripDetail.tsx`, `PlaceSection.tsx`, `ItemCard.tsx`, `CityItemsPage.tsx`, `TripCard.tsx`,
etc. — confirmed by grepping `wp-` usage across `src/frontend/components`). This was already
flagged as known debt in the 2026-08-01 UX spec park doc
(`jobs/ux/park-docs/20260801-UX-park.txt`: *"AddPlaceFlow.tsx is not migrated to Waypoint
tokens... flagged, not fixed"*) and both `design/Button.tsx` and `design/Input.tsx` document
themselves as *"PHASE 1 ONLY... not yet swapped into any existing call site."* **This is not a
new divergence BUG-81 introduced** — the picker is fully consistent with the family it lives
in. Repeating it here only so it isn't mistaken for something this build caused; no new action
beyond the already-tracked Phase 2 migration.

### 10. [NICE-TO-HAVE, secondary to the theme ask] ChangeCityModal has no post-repoint status feedback

`ChangeCityModal.tsx`'s `repointTo` (lines 102-109) calls `onClose()` unconditionally on
success — there is no equivalent of `AddPlaceFlow`'s `creationStatusMessage` banner ("We're
still confirming this location…" / "We couldn't automatically confirm this location…",
`AddPlaceFlow.tsx:286-290`) for a re-point that resolves to a pending/unresolvable city. This
is a **behavioural** inconsistency between the two call sites (the brief's "consistency across
call sites" question), not a colour/spacing theme issue, so I'm rating it below the PO's
specific ask — but naming it since a silent close after re-pointing to an unconfirmed city
gives the user no signal at all, which is a sharper version of the same gap BUG-74/BUG-73
exist to close for the create path. Worth a tracker item if the PO wants full parity; not
mine to size unprompted (OP-34 value-axis note — this reads like discretionary scope, not a
clear defect).

### 11. [Not applicable — confirmed] Light/dark theming

Two probes: grep for `dark:`/`darkMode` across `src/frontend` (zero hits) and grep for
`prefers-color-scheme` (zero hits), plus a direct read of `index.css` showing one hardcoded
light palette (`background: #f9fafb; color: #111827`) with no variant. The app has no
light/dark theming system anywhere — this axis of the brief doesn't apply; not a picker-specific
gap.

### 12. [Not applicable — confirmed] `:active` (mousedown) states

Grepped for `active:` Tailwind variants across `components/` and `design/` — zero hits outside
unrelated `is_active` data fields. `design/Button.tsx` and `design/Input.tsx` (read in full)
define only hover/focus/disabled variants, no active state. The picker's rows following the
same omission is consistent with the app's own primitives, not a gap.

---

## Summary table

| # | Finding | Severity | Theme-adherence (PO's ask) or general polish |
|---|---|---|---|
| 1 | Picker rows unreachable by keyboard | **Blocker** | Diverges from `TripForm.tsx`'s own accessible pattern — theme-adherence |
| 2 | No visual signal for disabled rows | **Should-fix** | Diverges from `Button.tsx`/sibling disabled vocabulary — theme-adherence |
| 3 | `amber-600` caption contrast ~3.2:1 (<4.5:1 AA) | **Should-fix** | Pre-existing app-wide pattern, inherited — theme-adherence (contrast) |
| 4/4a/5/6 | Spacing, container, colour vocabulary, cross-call-site parity | **Consistent — no action** | Confirms theme-adherence, no issue |
| 7 | Scroll-cutoff lands near a row boundary | Nice-to-have | Polish |
| 8 | Uneven row height on wrapped fallback labels | Nice-to-have | Polish (deliberate trade-off, not a clean fix) |
| 9 | Non-Waypoint token family | Informational, already tracked | Known Phase 2 debt, not new |
| 10 | No post-repoint status banner in ChangeCityModal | Nice-to-have | Behavioural, secondary to colour/spacing ask |
| 11 | No dark/light theming anywhere | Not applicable | N/A — app has no theming system |
| 12 | No `:active` states anywhere | Not applicable — consistent | Confirms theme-adherence |

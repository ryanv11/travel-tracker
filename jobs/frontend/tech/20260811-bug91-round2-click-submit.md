# BUG-91 round 2 — trip-create form no longer has a native submission path

Branch `fix/bug91-trip-create-click-submit` · Issue #529 · component
`src/frontend/components/TripDetail/TripForm.tsx`.

## Background

Round 1 (PR #458, issue #457): PO UAT 2026-08-08 found selecting a country from the
trip-create picker saved and closed the form prematurely. Root cause found then:
pressing **Enter** in the "Search countries…" text field fell through to the
browser's native implicit-submission behaviour. Fixed with a scoped `onKeyDown`
`preventDefault` on that one input.

Round 2 (this thread): PO UAT 2026-08-11 found the form *still* saves/closes — this
time from a plain **click** on a country in the dropdown, not Enter. The dispatch
brief's lead hypothesis was that a picker button lacked an explicit `type`
attribute (defaulting to `type="submit"`). That hypothesis is **false** — every
interactive element in the picker (dropdown row buttons, chip-remove buttons) is
already `type="button"`, confirmed by reading the component before touching
anything.

## Investigation — could not reproduce the reported mechanism

Three independent probes, each capable of failing differently, all failed to
reproduce a native form submission from a plain click:

1. **jsdom + `@testing-library/user-event` component test**, with Name and both
   dates filled in *before* clicking a country row. This matters: the existing
   round-1 click test (`TripForm.test.tsx`, "clicking a country … selects it
   without submitting the form") leaves Name/dates **empty**. If a submit event
   had actually fired from that click, `handleSubmit`'s own validation
   (`if (!name.trim()) { … return; }`) would have swallowed it silently —
   `createTrip`/`onClose` uncalled either way. So the round-1 test could not have
   distinguished "click never submits" from "click submits, but validation eats
   it" — it only ever exercised the latter path unintentionally, until this round
   filled the fields first.
2. **Live Chromium E2E test (Playwright)** against the actual running dev app —
   same flow, real browser, real click event. No submission.
3. **Live Chromium E2E overlap test** — searched a broad prefix ("a") to force the
   results dropdown to its `max-h-48` cap, deliberately overlapping the Create
   Trip button underneath it (confirmed via `boundingBox()` on both elements).
   `document.elementFromPoint` at the overlap coordinate returned the dropdown row
   button, not the button beneath — the dropdown's `z-10` absolute positioning
   correctly wins the hit-test, and clicking there just selects that country.

**This is reported to COO as a materially important negative finding, not
silently absorbed**: the PO's report is specific, repeated in shape (same
"saves and closes" symptom class as the original bug), and credible, but the
literal click-causes-native-submit mechanism could not be established. The one
untested angle is a genuine WebKit/Safari-specific implicit-submission quirk —
this container has no sudo password, so `playwright install webkit`/`firefox`
downloaded the binaries but failed their `--with-deps` system-library check
(`libgstreamer*`, `libepoxy`, etc.) and could not run. Flagged as `UNVERIFIED`
for that one browser engine specifically; every other angle tried came back
negative.

## A dead end worth recording: `SubmitEvent.submitter` does NOT distinguish click from Enter

First attempt at a mechanism-agnostic fix: read the native `SubmitEvent`'s
`.submitter` in `handleSubmit` and only honour the submission if `submitter` was
the actual Create Trip/Save Changes button — reasoning that an implicit
(Enter-triggered) submission would carry `submitter === null` and any other
"unexplained" trigger would be safely rejected too.

**Verified empirically before committing to it, and it's wrong.** Per the WHATWG
implicit-submission algorithm, pressing Enter in a text field simulates a
**click event fired at the form's default (first submit-type) button** — so the
resulting `SubmitEvent.submitter` for an Enter-triggered implicit submission is
the SAME default button as an explicit click on it. A jsdom test proved this
directly: `submitter === button` was `true` for both an explicit click on the
submit button *and* `user.type(input, 'x{Enter}')`. A submitter-based allow-list
guard would never have rejected anything — it's a complete no-op, indistinguishable
from having no guard at all. This only matters when a form has **multiple**
distinct submit buttons (e.g. "Save Draft" vs "Publish") — TripForm has exactly
one, so `submitter` carries no information here. Reverted before commit.

## The actual fix

Rather than keep enumerating individual interactive elements one at a time (the
exact shape of gap that let the click trigger through round 1's Enter-only fix):
**the form no longer has any `type="submit"` element in it.** The Create
Trip/Save Changes button is `type="button"` with an explicit `onClick` calling
`handleSave` (renamed from `handleSubmit`, no longer takes a `FormEvent`) directly.
`<form onSubmit>` is kept only as an inert `(e) => e.preventDefault()` safety net.

Per the HTML spec, implicit submission requires locating the form's "default
button" (its first submit-type button); if none exists, pressing Enter in any
field does nothing. With zero submit-type buttons anywhere in this form, Enter is
now inert in **every** field — Name, dates, photo album, the country search box —
not just the one the prior fix guarded. This closes the original Enter bug, the
still-unexplained click regression, and any future implicit-submission trigger
(a browser quirk, a new field added later without a guard, etc.) at the root,
rather than needing a per-element deny-list that has now missed once already.

**Trade-off, called out deliberately, not silently absorbed:** pressing Enter in
the Name field used to submit the form (round 1's own comment: "expected/desired",
never a formal BRD or PO requirement — just that agent's judgment call). That
convenience is gone; saving now always requires an explicit click/activation of
the Save button. Flagged in the PR/completion report for COO/PO awareness in case
it's missed in UAT as an unannounced behaviour change.

The country search input's own `onKeyDown` Enter-`preventDefault` guard (round 1's
fix) is left in place — now redundant since Enter can't submit from anywhere, but
harmless, and it still stops Enter from doing anything unexpected in that field
specifically.

## Tests added

`TripForm.test.tsx` (+5, all passing alongside the 3 pre-existing):
- Click-select with Name/dates **already filled** — the actual round-2 regression
  case the round-1 test's empty-fields setup masked.
- Two countries selected by click in sequence — never submits early.
- Removing a selected-country chip by click — never submits.
- Enter in the Name field no longer submits — documents the trade-off explicitly
  so a future reader isn't surprised by the behaviour change.
- Structural invariant: `form.querySelector('[type="submit"]')` is `null` — pins
  the actual mechanism the fix relies on, so a future edit that reintroduces a
  submit-type button (e.g. "restoring" native-Enter convenience) fails loudly
  instead of silently reopening every implicit-submission path.

`src/e2e/trips-crud.spec.ts` (+1, permanent, not throwaway): a real-Chromium test
exercising the exact PO-reported flow (fill fields, click a country, form stays
open; explicit Create Trip click still saves) — since the reported bug was never
reproduced under jsdom, jsdom-only coverage would not have been convincing
regression protection on its own if the true mechanism does turn out to be
browser-specific.

## Verification

- `npm run test:frontend` — 408/408 (+5 vs 403 baseline)
- `npm run test:backend` — 871/871 (unchanged, frontend-only thread)
- Full `npx playwright test` (chromium) — 53/53 (+1 new, no regressions in the
  other 52, including trip-edit-via-detail-panel and mobile trip-edit flows that
  also render this component in edit mode)
- `npm run type:check:all` — clean
- `npm run check` (biome) — exit 0, same 5 pre-existing infos in an unrelated
  backend test file noted in every recent thread
- `npm run status:check` / `tracker:check` / `scope:check` — all PASS

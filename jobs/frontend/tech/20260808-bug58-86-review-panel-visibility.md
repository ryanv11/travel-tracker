# useReviewPanelVisibility (BUG-58 / BUG-86)

> UPDATE (2026-08-11, BUG-86 round 2): the API and behaviour sections below
> described the version of this hook shipped in PR #458. PO UAT (2026-08-11)
> found a regression in that version — see "Round 2" at the bottom of this
> file for the root cause and the fix. The API/Behaviour sections have been
> updated in place to describe the CURRENT hook; the original text is
> preserved, struck through inline, for history.

New shared hook: `src/frontend/hooks/useReviewPanelVisibility.ts`

## Problem it solves

Two trip-detail surfaces exist for a `review_pending` trip: `ReviewPanel`
(the post-trip review UI) and `TripDetail`/`MobileTripDetailView` (the
normal trip view — which already renders a `review_pending` trip correctly,
showing "Lock Trip" as its stepper's next action). `TripDetailPage` (desktop)
and `MobileTripsLayout` (mobile) each independently decided which one to
show based on `trip.status === 'review_pending'`, with no way to override
that choice without changing the trip's actual status.

Both call sites wired `ReviewPanel`'s `onClose` prop to `navigate('/trips')`
to dismiss it — which drops the trip's `:id` from the URL and deselects the
trip in the left panel. That was the root cause of two separate UAT
findings: locking a trip (BUG-58, a forward status transition) and clicking
"Back to Trip" (BUG-86, no status transition at all).

## API (current, post round-2 fix)

```ts
function useReviewPanelVisibility(
  tripId: number | undefined,
  status: TripStatus | undefined,
): { showReviewPanel: boolean; dismissReview: () => void; returnToReview: () => void }
```

- `showReviewPanel` — whether `ReviewPanel` (true) or the normal detail view
  (false) should render for this trip right now.
- `dismissReview()` — call this ONLY from an explicit "leave review" action
  (e.g. "Back to Trip"). Do NOT call it after a status-changing mutation
  (e.g. locking) — the status change alone is sufficient; `showReviewPanel`
  recomputes to `false` automatically once `status !== 'review_pending'`.
- `returnToReview()` — NEW (round 2): undoes a dismissal without requiring a
  status change. Wired to the trip view's "Back to Review" control.

~~- `dismissReview()` — call this ONLY from an explicit "leave review" action~~
~~  (e.g. "Back to Trip"). Do NOT call it after a status-changing mutation~~
~~  (e.g. locking) — the status change alone is sufficient; `showReviewPanel`~~
~~  recomputes to `false` automatically once `status !== 'review_pending'`.~~
(superseded by the two bullets above — `dismissReview`'s own contract is
unchanged, `returnToReview` is the addition)

## Behaviour (current, post round-2 fix)

- Defaults to `true` whenever `status === 'review_pending'` (matches the
  existing "review mode auto-opens" entry behaviour, RV-01/RV-02).
- `dismissReview()` sets a boolean `dismissed` flag to `true`.
  `returnToReview()` sets it back to `false` directly — no status change
  required.
- The `dismissed` flag ALSO resets to `false` automatically whenever
  `(tripId, status)` actually changes between renders (a different trip
  selected, or this trip's status transitioning to a new value) — a
  render-phase "adjust state on prop change" reset (React's own sanctioned
  pattern for this), so it lands in the same render with no stale-panel
  flash.
- `showReviewPanel` is `status === 'review_pending' && !dismissed`.

~~- `dismissReview()` records the current `(tripId, status)` pair as~~
~~  dismissed. `showReviewPanel` is `false` only while the CURRENT~~
~~  `(tripId, status)` still matches that recorded pair.~~
~~- Selecting a different trip, or this trip's status changing away from and~~
~~  later back to `review_pending`, no longer matches the recorded pair, so~~
~~  the dismissal is naturally forgotten and `ReviewPanel` shows again by~~
~~  default.~~
(superseded — see "Round 2" below for exactly why this was wrong)

## Call sites

- `src/frontend/pages/TripDetailPage.tsx` — desktop, via `<Outlet/>`. Passes
  `dismissReview` to `ReviewPanel`'s `onClose`, and `returnToReview` to
  `TripDetail`'s `onReturnToReview`.
- `src/frontend/components/TripList/MobileTripsLayout.tsx` — mobile, inside
  `renderDetailContent()`. Same pattern, passes `returnToReview` to
  `MobileTripDetailView`'s `onReturnToReview`.

Both pass `dismissReview` as `ReviewPanel`'s `onClose` prop. Neither calls
`navigate()` to dismiss the panel anymore — only `MobileTripDetailView`'s own
`onBack` (the legitimate "return to trips list" action from the normal
detail view) still navigates, and that's unrelated to this hook.

`TripDetail.tsx` and `MobileTripDetailView.tsx` render a "Back to Review"
control (calling `onReturnToReview`) only when `trip.status ===
'review_pending'` — that's the only state with a ReviewPanel to return to.

## Extending this

If a third surface for `review_pending` trips is ever added, or if
`dismissReview` needs to be triggered from somewhere other than an explicit
button click, keep the invariant: **never navigate to dismiss ReviewPanel.**
Any navigation away from the trip's `:id` will re-trigger the exact
deselection bug this hook exists to prevent.

## Round 2 (BUG-86 reopened, 2026-08-11 PO UAT)

**What broke:** PR #458's dismissal was scoped to a specific `(tripId,
status)` VALUE pair recorded at the moment of dismissal. That reads as
"resets on a fresh entry into review_pending" but doesn't: a trip cycling
`locked -> review_pending` (Unlock) lands back on the exact same
`'review_pending'` enum value it was dismissed at earlier in the session, so
the OLD dismissed-pair comparison matched again and `showReviewPanel` stayed
`false`. Unlock silently landed on the trip view instead of ReviewPanel.
Separately, since the only way to un-dismiss was a status change, a trip
that stayed `review_pending` the whole time (no lock/unlock excursion) had
**no route back to ReviewPanel at all** once dismissed.

**Why this got missed the first time:** the original hook's test file
reasoned a dismiss-then-lock-then-unlock sequence was "not reachable through
the real UI" — it is (Back to Trip → Lock Trip from the now-showing trip
view → Unlock), and that's exactly PO's sequence. A comment asserting
unreachability is itself an absence claim and should have gotten a second
probe per the project's negative-findings rule; it didn't.

**Fix:** two independent changes, both preserving the "never navigate to
dismiss" invariant:
1. `dismissed` is now a plain boolean, reset via a render-phase
   "adjust state when a prop changes" pattern whenever `(tripId, status)`
   actually differs from what was seen last render — not just whenever it
   differs from ONE stored value. A genuine status transition (any of them,
   including a round trip back to a prior value) now always clears a stale
   dismissal.
2. `returnToReview()` — an explicit undo, independent of any status change,
   wired to the new "Back to Review" button on `TripDetail`/
   `MobileTripDetailView`.

**Verification that this is a real regression test, not just a plausible
one:** the new tests (`useReviewPanelVisibility.test.ts`'s
dismiss→lock→unlock cases, and the new
`TripDetailPage.bug86RoundTrip.test.tsx` integration test) were run against
the PRE-fix (PR #458) hook and confirmed to fail there before being
confirmed to pass against this fix.

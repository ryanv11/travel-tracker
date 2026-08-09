# useReviewPanelVisibility (BUG-58 / BUG-86)

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

## API

```ts
function useReviewPanelVisibility(
  tripId: number | undefined,
  status: TripStatus | undefined,
): { showReviewPanel: boolean; dismissReview: () => void }
```

- `showReviewPanel` — whether `ReviewPanel` (true) or the normal detail view
  (false) should render for this trip right now.
- `dismissReview()` — call this ONLY from an explicit "leave review" action
  (e.g. "Back to Trip"). Do NOT call it after a status-changing mutation
  (e.g. locking) — the status change alone is sufficient; `showReviewPanel`
  recomputes to `false` automatically once `status !== 'review_pending'`.

## Behaviour

- Defaults to `true` whenever `status === 'review_pending'` (matches the
  existing "review mode auto-opens" entry behaviour, RV-01/RV-02).
- `dismissReview()` records the current `(tripId, status)` pair as
  dismissed. `showReviewPanel` is `false` only while the CURRENT
  `(tripId, status)` still matches that recorded pair.
- Selecting a different trip, or this trip's status changing away from and
  later back to `review_pending`, no longer matches the recorded pair, so
  the dismissal is naturally forgotten and `ReviewPanel` shows again by
  default.

## Call sites

- `src/frontend/pages/TripDetailPage.tsx` — desktop, via `<Outlet/>`.
- `src/frontend/components/TripList/MobileTripsLayout.tsx` — mobile, inside
  `renderDetailContent()`.

Both pass `dismissReview` as `ReviewPanel`'s `onClose` prop. Neither calls
`navigate()` to dismiss the panel anymore — only `MobileTripDetailView`'s own
`onBack` (the legitimate "return to trips list" action from the normal
detail view) still navigates, and that's unrelated to this hook.

## Extending this

If a third surface for `review_pending` trips is ever added, or if
`dismissReview` needs to be triggered from somewhere other than an explicit
button click, keep the invariant: **never navigate to dismiss ReviewPanel.**
Any navigation away from the trip's `:id` will re-trigger the exact
deselection bug this hook exists to prevent.

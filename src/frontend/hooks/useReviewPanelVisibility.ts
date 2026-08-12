import { useCallback, useRef, useState } from 'react';
import type { TripStatus } from '../types/api';

/**
 * useReviewPanelVisibility — decides whether the review_pending surface
 * (ReviewPanel) or the normal trip-detail surface (TripDetail /
 * MobileTripDetailView) renders for a selected trip, WITHOUT ever navigating
 * away from the trip (BUG-58/BUG-86).
 *
 * Both TripDetailPage (desktop, via <Outlet/>) and MobileTripsLayout (mobile,
 * no <Outlet/>) previously wired ReviewPanel's `onClose` straight to
 * `navigate('/trips')`. That drops the trip's :id from the URL, which is the
 * shared root cause of two distinct UAT findings:
 *
 *   - BUG-58: locking a trip from inside ReviewPanel calls onClose() right
 *     after the mutation succeeds, so the moment trip.status flips to
 *     'locked' the URL has ALREADY been navigated away and the trip drops out
 *     of the left panel's selection. (The backward "Return to Planning" path
 *     was fixed the same way in an earlier thread — see ReviewPanel.tsx.)
 *   - BUG-86: the "Back to Trip" button calls onClose() too, but here no
 *     status mutation happens at all — the trip is still review_pending, so
 *     there is no natural re-render to fall back on. Without this hook,
 *     "Back to Trip" had nowhere to go but the trips list, which reads as a
 *     total deselection ("blank panel").
 *
 * The fix for both: never navigate. Instead, track a local "dismissed"
 * override — TripDetail already renders a review_pending trip correctly
 * (NEXT_STATUS maps review_pending -> 'Lock Trip', see useTripDetailController)
 * so "Back to Trip" can just swap the local surface without touching the
 * trip's real status or the URL, and locking needs no explicit dismiss at all
 * — once trip.status is no longer 'review_pending', showReviewPanel is false
 * by construction.
 *
 * BUG-86 (round 2, 2026-08-11 UAT): the first version of this hook scoped the
 * dismissal to the (tripId, status) VALUE pair, which reads as "resets on a
 * fresh entry" but actually doesn't — a trip cycling locked -> review_pending
 * (Unlock) lands back on the exact same ('review_pending') enum value it was
 * dismissed at earlier in the SAME session, so the stale dismissal matched
 * again and Unlock silently landed on the trip view instead of ReviewPanel.
 * Two things were missing, both fixed here without touching the "never
 * navigate" design:
 *
 *   1. `dismissed` now resets whenever (tripId, status) actually CHANGES
 *      between renders — not just when it differs from one specific stored
 *      value — via a ref-compared "adjust state during render" reset (the
 *      React-docs-sanctioned pattern for this; lands in the same render, no
 *      stale-panel flash). A genuine re-entry into review_pending (Unlock)
 *      is a status change, so it now always clears a leftover dismissal and
 *      ReviewPanel shows again automatically — this is what makes "unlocking
 *      returns to review" true even though Unlock itself calls no dismiss
 *      logic.
 *   2. `returnToReview()` — the previous version had no way to undo a
 *      dismissal EXCEPT a status change. If the trip stays review_pending
 *      the whole time (no lock/unlock cycle), there was no route back to
 *      ReviewPanel at all once dismissed — the other half of the 2026-08-11
 *      finding ("no way to return to the review page"). Wired to an explicit
 *      "Back to Review" control on the trip view (TripDetail /
 *      MobileTripDetailView) so the round-trip doesn't depend on a status
 *      transition happening at all.
 *
 * @param tripId - The currently selected trip's id, or undefined while unresolved.
 * @param status - The currently selected trip's status, or undefined while loading.
 */
export function useReviewPanelVisibility(
  tripId: number | undefined,
  status: TripStatus | undefined,
) {
  const [dismissed, setDismissed] = useState(false);

  // Render-phase reset: whenever the (tripId, status) pair actually changes
  // from what we last saw — a different trip selected, OR this trip's status
  // transitioning to a new value (including a round-trip back to a value it
  // held before, e.g. Unlock) — any stale dismissal no longer applies. This
  // is the "adjust state when a prop changes" pattern from the React docs:
  // comparing against a ref during render and calling setState conditionally
  // resolves in the SAME render pass, so there's no one-render flash of the
  // wrong surface the way a useEffect-based reset would produce.
  const seenRef = useRef<{ tripId: number | undefined; status: TripStatus | undefined }>({
    tripId: undefined,
    status: undefined,
  });
  if (seenRef.current.tripId !== tripId || seenRef.current.status !== status) {
    seenRef.current = { tripId, status };
    if (dismissed) setDismissed(false);
  }

  const dismissReview = useCallback(() => setDismissed(true), []);

  /** Undoes a dismissal without requiring a status change (BUG-86 round 2). */
  const returnToReview = useCallback(() => setDismissed(false), []);

  const showReviewPanel = status === 'review_pending' && !dismissed;

  return { showReviewPanel, dismissReview, returnToReview };
}

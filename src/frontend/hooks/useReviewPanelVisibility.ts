import { useCallback, useState } from 'react';
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
 * The dismissal is scoped to (tripId, status): selecting a different trip, or
 * this same trip re-entering review_pending on a later visit, resets it so
 * ReviewPanel is shown again by default — matching the existing "review mode
 * auto-opens on review_pending" entry behaviour (RV-01/RV-02).
 *
 * @param tripId - The currently selected trip's id, or undefined while unresolved.
 * @param status - The currently selected trip's status, or undefined while loading.
 */
export function useReviewPanelVisibility(
  tripId: number | undefined,
  status: TripStatus | undefined,
) {
  const [dismissed, setDismissed] = useState<{ tripId: number; status: TripStatus } | null>(null);

  const dismissReview = useCallback(() => {
    if (tripId === undefined || status === undefined) return;
    setDismissed({ tripId, status });
  }, [tripId, status]);

  const isDismissedForCurrent =
    dismissed !== null && dismissed.tripId === tripId && dismissed.status === status;

  const showReviewPanel = status === 'review_pending' && !isDismissedForCurrent;

  return { showReviewPanel, dismissReview };
}

/**
 * Tests for useReviewPanelVisibility (BUG-58/BUG-86).
 *
 * This hook is the shared fix for the "status transition drops the trip
 * selection" family reported in the 2026-08-08 UAT:
 *   - BUG-58: locking a trip (review_pending -> locked) deselected it.
 *   - BUG-86: "Back to Trip" in review_pending deselected it entirely
 *     (blank panel) instead of returning to the normal trip-detail view.
 *
 * Both call sites (TripDetailPage, MobileTripsLayout) used to navigate to
 * '/trips' to dismiss ReviewPanel, which drops the trip's :id from the URL.
 * This hook replaces that navigation with a local dismiss so the trip stays
 * selected no matter which surface is showing.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useReviewPanelVisibility } from '../useReviewPanelVisibility';

describe('useReviewPanelVisibility', () => {
  it('shows the review panel by default when status is review_pending', () => {
    const { result } = renderHook(() => useReviewPanelVisibility(10, 'review_pending'));
    expect(result.current.showReviewPanel).toBe(true);
  });

  it('does not show the review panel for any other status', () => {
    const { result: active } = renderHook(() => useReviewPanelVisibility(10, 'active'));
    expect(active.current.showReviewPanel).toBe(false);

    const { result: locked } = renderHook(() => useReviewPanelVisibility(10, 'locked'));
    expect(locked.current.showReviewPanel).toBe(false);

    const { result: planning } = renderHook(() => useReviewPanelVisibility(10, 'planning'));
    expect(planning.current.showReviewPanel).toBe(false);
  });

  it('returns false while the trip is unresolved (id/status undefined)', () => {
    const { result } = renderHook(() => useReviewPanelVisibility(undefined, undefined));
    expect(result.current.showReviewPanel).toBe(false);
  });

  // BUG-86: "Back to Trip" dismisses the panel WITHOUT navigating — the trip
  // stays selected, just a different local surface renders.
  it('dismissReview flips showReviewPanel to false for the same trip/status', () => {
    const { result } = renderHook(() => useReviewPanelVisibility(10, 'review_pending'));
    expect(result.current.showReviewPanel).toBe(true);

    act(() => {
      result.current.dismissReview();
    });

    expect(result.current.showReviewPanel).toBe(false);
  });

  // BUG-58: locking needs NO explicit dismiss call at all — the status
  // change alone must be enough to swap surfaces, exactly like the
  // already-correct backward (Return to Planning) transition.
  it('flips to false automatically when status changes away from review_pending, with no dismiss call', () => {
    const { result, rerender } = renderHook(
      ({ status }: { status: 'review_pending' | 'locked' }) => useReviewPanelVisibility(10, status),
      { initialProps: { status: 'review_pending' } },
    );
    expect(result.current.showReviewPanel).toBe(true);

    rerender({ status: 'locked' });
    expect(result.current.showReviewPanel).toBe(false);
  });

  // Selecting a different trip must not carry over a previous dismissal —
  // the new trip's review_pending status (if any) should show ReviewPanel
  // by default, same as first-time entry (RV-01/RV-02).
  it('resets the dismissal when the trip id changes', () => {
    const { result, rerender } = renderHook(
      ({ tripId }: { tripId: number }) => useReviewPanelVisibility(tripId, 'review_pending'),
      { initialProps: { tripId: 10 } },
    );

    act(() => {
      result.current.dismissReview();
    });
    expect(result.current.showReviewPanel).toBe(false);

    rerender({ tripId: 20 });
    expect(result.current.showReviewPanel).toBe(true);
  });

  // Re-entering review_pending after a real status excursion (e.g. Return to
  // Planning, then later Move to Review again) must show ReviewPanel by
  // default — covered by the "no dismiss call" test above: dismissReview is
  // reachable only from ReviewPanel's own "Back to Trip" button (BUG-86), and
  // once ReviewPanel is dismissed, TripDetail's stepper for a review_pending
  // trip offers only Lock (not Return to Planning) — so a dismissed trip
  // re-entering review_pending via a DIFFERENT status excursion first is not
  // a reachable sequence through the real UI.
});

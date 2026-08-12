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
 *
 * BUG-86 round 2 (2026-08-11 UAT, regression in the fix above): the FULL
 * round trip — dismiss review -> trip view -> back to review, AND the
 * lock/unlock cycle — is covered explicitly below. The earlier version of
 * this file reasoned a dismiss-then-lock-then-unlock sequence was "not
 * reachable through the real UI"; it is (Back to Trip, then Lock Trip from
 * the trip view's own stepper, then Unlock), and that exact sequence is what
 * broke PO UAT: the dismissal was scoped to the (tripId, status) VALUE pair,
 * so Unlock landing back on 'review_pending' matched the STALE dismissal
 * recorded before the lock/unlock cycle and silently re-suppressed
 * ReviewPanel.
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

  // BUG-86 round 2 — THE regression test: dismiss review, lock the trip from
  // the (now-showing) trip view, then unlock it. Unlock must land back on
  // ReviewPanel, not the trip view — this is the exact sequence PO UAT
  // (2026-08-11) found broken ("unlocking goes to trip view, not review").
  it('re-shows the review panel after a dismiss -> lock -> unlock cycle', () => {
    const { result, rerender } = renderHook(
      ({ status }: { status: 'review_pending' | 'locked' }) => useReviewPanelVisibility(10, status),
      { initialProps: { status: 'review_pending' as 'review_pending' | 'locked' } },
    );
    expect(result.current.showReviewPanel).toBe(true);

    // "Back to Trip"
    act(() => {
      result.current.dismissReview();
    });
    expect(result.current.showReviewPanel).toBe(false);

    // "Lock Trip" from the trip view's own stepper (review_pending -> locked)
    rerender({ status: 'locked' });
    expect(result.current.showReviewPanel).toBe(false);

    // "Unlock" (locked -> review_pending) — must show ReviewPanel again, not
    // silently match the dismissal recorded before the lock/unlock cycle.
    rerender({ status: 'review_pending' });
    expect(result.current.showReviewPanel).toBe(true);
  });

  // Re-locking after that cycle must still work (success criterion:
  // "re-locking still works") — the round trip is fully reversible, not a
  // one-shot fix.
  it('supports a second dismiss -> lock -> unlock cycle on the same trip', () => {
    const { result, rerender } = renderHook(
      ({ status }: { status: 'review_pending' | 'locked' }) => useReviewPanelVisibility(10, status),
      { initialProps: { status: 'review_pending' as 'review_pending' | 'locked' } },
    );

    act(() => {
      result.current.dismissReview();
    });
    rerender({ status: 'locked' });
    rerender({ status: 'review_pending' });
    expect(result.current.showReviewPanel).toBe(true); // first cycle, asserted above

    act(() => {
      result.current.dismissReview();
    });
    rerender({ status: 'locked' });
    expect(result.current.showReviewPanel).toBe(false);
    rerender({ status: 'review_pending' });
    expect(result.current.showReviewPanel).toBe(true);
  });

  // BUG-86 round 2 — the other half of the reopened finding: "no way to
  // return to the review page" when the trip STAYS review_pending the whole
  // time (no lock/unlock excursion to reset the dismissal via). returnToReview
  // is the explicit control wired to the trip view's "Back to Review" button.
  describe('returnToReview', () => {
    it('undoes a dismissal with no status change required', () => {
      const { result } = renderHook(() => useReviewPanelVisibility(10, 'review_pending'));
      expect(result.current.showReviewPanel).toBe(true);

      act(() => {
        result.current.dismissReview();
      });
      expect(result.current.showReviewPanel).toBe(false);

      act(() => {
        result.current.returnToReview();
      });
      expect(result.current.showReviewPanel).toBe(true);
    });

    it('is a no-op when the panel is already showing', () => {
      const { result } = renderHook(() => useReviewPanelVisibility(10, 'review_pending'));
      expect(result.current.showReviewPanel).toBe(true);

      act(() => {
        result.current.returnToReview();
      });
      expect(result.current.showReviewPanel).toBe(true);
    });
  });
});

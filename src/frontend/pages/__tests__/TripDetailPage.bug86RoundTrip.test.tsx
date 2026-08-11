/**
 * Integration regression test for BUG-86 round 2 (2026-08-11 UAT reopen).
 *
 * PR #458 fixed BUG-58/BUG-86 by replacing ReviewPanel onClose's navigation
 * with useReviewPanelVisibility's local dismiss — but that fix only covered
 * the review -> trip direction. PO UAT (2026-08-11) found the return trip
 * broken two ways:
 *   1. Once dismissed, a review_pending trip had NO way back to ReviewPanel
 *      short of a status transition.
 *   2. Unlocking (locked -> review_pending) landed on the trip view instead
 *      of ReviewPanel, because the dismissal was scoped to the (tripId,
 *      status) VALUE pair and a status round-trip back to the same enum
 *      value matched a STALE dismissal from before the lock/unlock cycle.
 *
 * Unlike hooks/__tests__/useReviewPanelVisibility.test.ts (which isolates the
 * hook's own logic), this file exercises the REAL component stack —
 * TripDetailPage, ReviewPanel, TripDetail, useTripDetailController, and the
 * real useLockTrip/useUnlockTrip mutations with real react-query
 * invalidation — so a regression in the WIRING (not just the hook) would
 * also be caught here. apiGet/apiPatch are mocked at the apiClient boundary;
 * everything above that boundary is the genuine production code path.
 *
 * Source: src/frontend/pages/TripDetailPage.tsx,
 *   src/frontend/hooks/useReviewPanelVisibility.ts,
 *   src/frontend/components/TripDetail/TripDetail.tsx
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripDetail as TripDetailType, TripStatus } from '../../types/api';
import { apiGet, apiPatch } from '../../utils/apiClient';
import { TripDetailPage } from '../TripDetailPage';

vi.mock('../../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/apiClient')>();
  return { ...actual, apiGet: vi.fn(), apiPatch: vi.fn() };
});

function makeTrip(status: TripStatus): TripDetailType {
  return {
    id: 10,
    name: 'Japan 2024',
    status,
    start_date: '2024-04-01',
    end_date: '2024-04-14',
    photo_album_ref: null,
    places: [],
    categories: [],
    companions: [],
    activities: [],
    countries: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

/**
 * Mock server-side state, mutated by the mocked apiPatch handlers below and
 * read back by apiGet — mirrors the real backend round trip through
 * react-query's invalidate-then-refetch, without a live server.
 */
let serverStatus: TripStatus;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/trips/10']}>
        <Routes>
          <Route path="/trips/:id" element={<TripDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TripDetailPage — BUG-86 round-trip regression (review <-> trip, lock/unlock)', () => {
  beforeEach(() => {
    serverStatus = 'review_pending';

    vi.mocked(apiGet).mockImplementation(async (url: string) => {
      if (url === '/api/trips/10') return makeTrip(serverStatus) as unknown;
      if (url === '/api/trips/10/items') return [] as unknown;
      if (url === '/api/admin/countries') return [] as unknown;
      throw new Error(`Unexpected GET ${url}`);
    });

    vi.mocked(apiPatch).mockImplementation(async (url: string) => {
      if (url === '/api/trips/10/lock') {
        serverStatus = 'locked';
        return {} as unknown;
      }
      if (url === '/api/trips/10/unlock') {
        serverStatus = 'review_pending';
        return {} as unknown;
      }
      throw new Error(`Unexpected PATCH ${url}`);
    });
  });

  it('review -> trip -> review (explicit "Back to Review", no status change)', async () => {
    renderPage();

    // Starts on ReviewPanel (RV-01/RV-02 default entry behaviour).
    await screen.findByText(/Post-Trip Review — Japan 2024/);

    // "Back to Trip" dismisses it — lands on TripDetail, trip stays selected.
    await userEvent.click(screen.getByRole('button', { name: 'Back to Trip' }));
    await screen.findByRole('heading', { name: 'Japan 2024' });
    expect(screen.queryByText(/Post-Trip Review/)).not.toBeInTheDocument();

    // The explicit round-trip control this fix adds: no status change at all.
    const backToReview = screen.getByRole('button', { name: 'Back to Review' });
    await userEvent.click(backToReview);

    await screen.findByText(/Post-Trip Review — Japan 2024/);
  });

  it('review -> trip -> lock -> unlock -> review (the exact PO UAT regression)', async () => {
    renderPage();

    await screen.findByText(/Post-Trip Review — Japan 2024/);

    // "Back to Trip" (dismiss).
    await userEvent.click(screen.getByRole('button', { name: 'Back to Trip' }));
    await screen.findByRole('button', { name: 'Back to Review' });

    // "Lock Trip" from the trip view's own stepper (review_pending -> locked).
    await userEvent.click(screen.getByRole('button', { name: 'Lock Trip' }));
    const [, confirmLock] = screen.getAllByRole('button', { name: 'Lock Trip' });
    await userEvent.click(confirmLock);

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith('/api/trips/10/lock', {});
    });
    // Locked: TripDetail still shows (BUG-58 win preserved), no "Back to
    // Review" control (nothing to return to while locked), trip stays selected.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Back to Review' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Japan 2024' })).toBeInTheDocument();

    // "Unlock" (locked -> review_pending) — THE regression: this used to
    // silently match the dismissal recorded before the lock/unlock cycle and
    // land back on TripDetail instead of ReviewPanel.
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    const [, confirmUnlock] = screen.getAllByRole('button', { name: 'Unlock' });
    await userEvent.click(confirmUnlock);

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith('/api/trips/10/unlock', {});
    });

    // Must land on ReviewPanel, not TripDetail.
    await screen.findByText(/Post-Trip Review — Japan 2024/);
  });

  it('re-locking after the unlock cycle still works (round trip is reversible)', async () => {
    renderPage();

    await screen.findByText(/Post-Trip Review — Japan 2024/);
    await userEvent.click(screen.getByRole('button', { name: 'Back to Trip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lock Trip' }));
    const [, confirmLock1] = screen.getAllByRole('button', { name: 'Lock Trip' });
    await userEvent.click(confirmLock1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    const [, confirmUnlock] = screen.getAllByRole('button', { name: 'Unlock' });
    await userEvent.click(confirmUnlock);
    await screen.findByText(/Post-Trip Review — Japan 2024/);

    // Dismiss and lock again — a second full cycle.
    await userEvent.click(screen.getByRole('button', { name: 'Back to Trip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lock Trip' }));
    const [, confirmLock2] = screen.getAllByRole('button', { name: 'Lock Trip' });
    await userEvent.click(confirmLock2);

    await waitFor(() => {
      expect(apiPatch).toHaveBeenLastCalledWith('/api/trips/10/lock', {});
    });
    expect(screen.getByRole('heading', { name: 'Japan 2024' })).toBeInTheDocument();
  });
});

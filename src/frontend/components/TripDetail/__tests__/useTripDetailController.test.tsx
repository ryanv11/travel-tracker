/**
 * Tests for useTripDetailController's delete flow (BUG-50/TR-14) and the
 * BUG-58-adjacent guarantee that status-only transitions never navigate away.
 *
 * BUG-50: a trip is deleted via DELETE /api/trips/:id, then (and only then)
 * the controller navigates back to /trips — there is nothing left to keep
 * selected once the trip is gone (contrast with BUG-58, where a mere status
 * change must NOT navigate away).
 *
 * TR-14 "Locked trips ... not deletable without unlocking first": rather than
 * duplicating the lock/unlock business rule client-side, a locked trip's
 * delete-confirm action is re-routed into the existing unlock confirmation
 * flow (confirmUnlock) instead of ever calling the delete mutation.
 *
 * Mocks: apiClient's apiDelete/apiPatch (the mutations underneath
 * useDeleteTrip/useLockTrip/useUnlockTrip/useUpdateTripStatus run for real
 * against these mocks, same precedent as useAdmin.companions.test.tsx).
 * react-router-dom's useNavigate is mocked directly so navigation can be
 * asserted without a full Router tree.
 *
 * Source: src/frontend/components/TripDetail/useTripDetailController.ts
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripDetail } from '../../../types/api';
import { apiDelete, apiPatch } from '../../../utils/apiClient';
import { useTripDetailController } from '../useTripDetailController';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/apiClient')>();
  return {
    ...actual,
    apiPatch: vi.fn(),
    apiDelete: vi.fn(),
  };
});

function renderController(trip: TripDetail) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTripDetailController(trip), { wrapper });
}

function makeTrip(overrides: Partial<TripDetail> = {}): TripDetail {
  return {
    id: 42,
    name: 'Iceland Loop',
    status: 'planning',
    start_date: '2024-06-01',
    end_date: '2024-06-10',
    photo_album_ref: null,
    places: [],
    categories: [],
    companions: [],
    activities: [],
    countries: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useTripDetailController — delete flow (BUG-50/TR-14)', () => {
  beforeEach(() => {
    vi.mocked(apiDelete).mockReset();
    vi.mocked(apiPatch).mockReset();
    mockNavigate.mockReset();
  });

  it('handleDeleteClick opens the confirm-delete dialog', () => {
    const { result } = renderController(makeTrip());
    expect(result.current.confirmDelete).toBe(false);

    act(() => result.current.handleDeleteClick());

    expect(result.current.confirmDelete).toBe(true);
  });

  it('unlocked trip: handleDeleteDialogConfirm deletes then navigates to /trips', async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined);
    const { result } = renderController(makeTrip({ status: 'planning' }));

    act(() => result.current.handleDeleteClick());
    act(() => result.current.handleDeleteDialogConfirm());

    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith('/api/trips/42');
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/trips', { replace: true });
    });
    expect(result.current.confirmDelete).toBe(false);
  });

  it('locked trip: handleDeleteDialogConfirm never calls the delete API and does not navigate', () => {
    const { result } = renderController(makeTrip({ status: 'locked' }));

    act(() => result.current.handleDeleteClick());
    act(() => result.current.handleDeleteDialogConfirm());

    expect(apiDelete).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('locked trip: handleDeleteDialogConfirm closes confirmDelete and opens confirmUnlock instead', () => {
    const { result } = renderController(makeTrip({ status: 'locked' }));

    act(() => result.current.handleDeleteClick());
    expect(result.current.confirmDelete).toBe(true);

    act(() => result.current.handleDeleteDialogConfirm());

    expect(result.current.confirmDelete).toBe(false);
    expect(result.current.confirmUnlock).toBe(true);
  });
});

describe('useTripDetailController — backward status transitions never navigate (BUG-58 guard)', () => {
  beforeEach(() => {
    vi.mocked(apiDelete).mockReset();
    vi.mocked(apiPatch).mockReset();
    mockNavigate.mockReset();
  });

  it('handleUnlockConfirm (locked -> review_pending, backward) does not navigate', async () => {
    vi.mocked(apiPatch).mockResolvedValue({});
    const { result } = renderController(makeTrip({ status: 'locked' }));

    act(() => result.current.setConfirmUnlock(true));
    await act(async () => {
      await result.current.handleUnlockConfirm();
    });

    expect(apiPatch).toHaveBeenCalledWith('/api/trips/42/unlock', {});
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

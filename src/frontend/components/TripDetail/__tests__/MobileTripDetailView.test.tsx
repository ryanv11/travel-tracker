/**
 * Scenario tests for MobileTripDetailView's delete affordance (BUG-50/TR-14).
 *
 * Mirrors TripDetail.test.tsx (desktop) — same shared useTripDetailController,
 * only the markup differs (icon-only button here vs desktop's icon+label).
 * See that file's header comment for the full mocking rationale.
 *
 * Source: src/frontend/components/TripDetail/MobileTripDetailView.tsx
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripDetail as TripDetailType } from '../../../types/api';
import { apiDelete, apiPatch } from '../../../utils/apiClient';
import { MobileTripDetailView } from '../MobileTripDetailView';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/apiClient')>();
  return { ...actual, apiPatch: vi.fn(), apiDelete: vi.fn() };
});

vi.mock('../../../hooks/useItems', () => ({
  useTripLevelItems: () => ({ data: [], isLoading: false, error: null }),
  useDeleteItem: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));

vi.mock('../../../hooks/usePlaces', () => ({
  useRemovePlace: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
}));

function makeTrip(overrides: Partial<TripDetailType> = {}): TripDetailType {
  return {
    id: 7,
    name: 'Portugal Roadtrip',
    status: 'planning',
    start_date: '2024-05-01',
    end_date: '2024-05-10',
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

function renderTrip(trip: TripDetailType) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<MobileTripDetailView trip={trip} onBack={vi.fn()} />, { wrapper });
}

describe('MobileTripDetailView — delete affordance (BUG-50/TR-14)', () => {
  beforeEach(() => {
    vi.mocked(apiDelete).mockReset();
    vi.mocked(apiPatch).mockReset();
    mockNavigate.mockReset();
  });

  it('renders a reachable Delete Trip icon button', () => {
    renderTrip(makeTrip());
    expect(screen.getByRole('button', { name: 'Delete Trip' })).toBeInTheDocument();
  });

  it('Delete Trip stays visible on a Locked trip, unlike Edit', () => {
    renderTrip(makeTrip({ status: 'locked' }));
    expect(screen.getByRole('button', { name: 'Delete Trip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('confirming delete on an unlocked trip calls the API then navigates to /trips', async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined);
    renderTrip(makeTrip({ id: 55, status: 'active' }));

    // The header trigger and the dialog's confirm button share the same
    // accessible name ("Delete Trip") once the dialog is open.
    await userEvent.click(screen.getByRole('button', { name: 'Delete Trip' }));
    const [, confirmButton] = screen.getAllByRole('button', { name: 'Delete Trip' });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith('/api/trips/55');
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/trips', { replace: true });
    });
  });

  it('a Locked trip is refused with a message directing the user to unlock, not deleted', async () => {
    renderTrip(makeTrip({ status: 'locked' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trip' }));
    expect(screen.getByText(/can't be deleted/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Unlock Trip' }));

    expect(apiDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Unlock this trip?')).toBeInTheDocument();
  });
});

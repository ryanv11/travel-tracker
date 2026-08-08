/**
 * Tests for BUG-83: useUpdateTrip must invalidate map shading alongside the
 * trips list/detail queries.
 *
 * Root cause: a trip PATCH can change country_codes, which the map shading
 * queries (useMapShading/useRegionShading, keyed under ['map', 'shading'] in
 * useMapShading.ts) derive from. useUpdateTrip was only invalidating
 * ['trips'] and ['trips', id], so an edited trip's map shading kept serving
 * stale data until something else forced a refetch — the same class of bug
 * BUG-51 fixed for companion renames, and the same fix shape already applied
 * to every other trip mutation in this file (create/status/lock/unlock/delete).
 *
 * This suite asserts each of the five other trip mutations still invalidates
 * map shading (regression guard) and that useUpdateTrip now does too (the fix).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiDelete, apiPatch, apiPost } from '../../utils/apiClient';
import {
  useCreateTrip,
  useDeleteTrip,
  useLockTrip,
  useUnlockTrip,
  useUpdateTrip,
  useUpdateTripStatus,
} from '../useTrips';

vi.mock('../../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/apiClient')>();
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPatch: vi.fn(),
    apiDelete: vi.fn(),
  };
});

/** Renders the hook with its own QueryClient and returns both. */
function renderWithClient<T>(useHook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const localWrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const result = renderHook(useHook, { wrapper: localWrapper });
  return { ...result, qc };
}

const tripSummary = {
  id: 1,
  name: 'Trip',
  start_date: '2026-01-01',
  end_date: '2026-01-05',
  status: 'planning' as const,
  photo_album_ref: null,
  created_at: '',
  updated_at: '',
  categories: [],
  companions: [],
  activities: [],
  countries: [],
  places: [],
};

describe('BUG-83: trip mutations invalidate map shading', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiPatch).mockReset();
    vi.mocked(apiDelete).mockReset();
  });

  it('useUpdateTrip invalidates trips, trip detail, AND map shading on success (the fix)', async () => {
    vi.mocked(apiPatch).mockResolvedValue(tripSummary);

    const { result, qc } = renderWithClient(useUpdateTrip);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate({ id: 1, data: { country_codes: ['US', 'CA'] } });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips', 1] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['map', 'shading'] });
  });

  it('useCreateTrip invalidates map shading (regression guard)', async () => {
    vi.mocked(apiPost).mockResolvedValue(tripSummary);
    const { result, qc } = renderWithClient(useCreateTrip);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate({ name: 'Trip', start_date: '2026-01-01', end_date: '2026-01-05' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['map', 'shading'] });
  });

  it('useUpdateTripStatus invalidates map shading (regression guard)', async () => {
    vi.mocked(apiPatch).mockResolvedValue(tripSummary);
    const { result, qc } = renderWithClient(useUpdateTripStatus);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate({ id: 1, status: 'active' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['map', 'shading'] });
  });

  it('useLockTrip invalidates map shading (regression guard)', async () => {
    vi.mocked(apiPatch).mockResolvedValue(tripSummary);
    const { result, qc } = renderWithClient(useLockTrip);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['map', 'shading'] });
  });

  it('useUnlockTrip invalidates map shading (regression guard)', async () => {
    vi.mocked(apiPatch).mockResolvedValue(tripSummary);
    const { result, qc } = renderWithClient(useUnlockTrip);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['map', 'shading'] });
  });

  it('useDeleteTrip invalidates map shading (regression guard)', async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined);
    const { result, qc } = renderWithClient(useDeleteTrip);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['map', 'shading'] });
  });
});

/**
 * Tests for usePlaces mutations (BUG-93).
 *
 * No test file existed for usePlaces before this thread (confirmed: repo-wide
 * search for "usePlaces.test" turned up nothing).
 *
 * BUG-93: PO added a place (Sydney) and its map marker didn't appear until a
 * manual refresh. Verified NOT a geocoding delay (the city resolved with
 * coordinates at creation time, geocode_attempts=0) — narrowed to a
 * query-invalidation gap instead.
 *
 * Root cause: MapPage calls the bare `useTrips()` (no filters), which under
 * TanStack Query keys as ['trips', undefined]. CityMarkers derives its pins
 * from that list. useAddPlace's onSuccess only invalidated ['trips', tripId]
 * (the single-trip detail query) and ['map', 'shading'] — neither of those
 * queryKeys prefix-matches ['trips', undefined], so the map's own trips list
 * never refetched and the new marker didn't paint until something else
 * (e.g. a full reload) happened to refresh it.
 *
 * Fix, matching the precedent already set by useRemovePlace (BUG-32) in this
 * same file: invalidate the broader ['trips'] key instead. TanStack's
 * prefix-matching invalidation means ['trips'] also covers ['trips', tripId]
 * as a suffix, so the trip detail view keeps refreshing exactly as before —
 * this suite asserts both keys explicitly so that stays pinned.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiDelete, apiPatch, apiPost } from '../../utils/apiClient';
import { useAddPlace, useChangeCity, useRemovePlace, useUpdatePlaceDates } from '../usePlaces';

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

const placeResult = {
  id: 1,
  city_id: 5,
  arrived_on: null,
  departed_on: null,
  created_at: '',
  city: {
    id: 5,
    name: 'Sydney',
    country_code: 'AU',
    country_name: 'Australia',
    region_id: null,
    region_iso: null,
    latitude: -33.8688,
    longitude: 151.2093,
    geocode_status: 'resolved' as const,
  },
  activities: [],
};

describe('BUG-93: useAddPlace invalidates the map-markers trips list', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiPatch).mockReset();
    vi.mocked(apiDelete).mockReset();
  });

  it('invalidates the broad ["trips"] key (the fix) — covers the map-markers list query', async () => {
    vi.mocked(apiPost).mockResolvedValue(placeResult);
    const { result, qc } = renderWithClient(useAddPlace);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate({ tripId: 1, cityId: 5 });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['map', 'shading'] });
  });

  it('still refreshes the specific trip detail view — ["trips"] prefix-covers ["trips", tripId]', async () => {
    vi.mocked(apiPost).mockResolvedValue(placeResult);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Pre-seed both the map's bare trips-list query and this trip's detail
    // query, exactly as the running app would have them cached.
    qc.setQueryData(['trips', undefined], []);
    qc.setQueryData(['trips', 1], { id: 1, places: [] });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(useAddPlace, { wrapper });

    result.current.mutate({ tripId: 1, cityId: 5 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Both queries — the map's list AND the trip detail — are marked stale
    // by the single ['trips'] invalidation (prefix match).
    expect(qc.getQueryState(['trips', undefined])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['trips', 1])?.isInvalidated).toBe(true);
  });
});

describe('usePlaces — sibling mutation invalidation (regression guard, unchanged by this fix)', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiPatch).mockReset();
    vi.mocked(apiDelete).mockReset();
  });

  it('useRemovePlace still invalidates ["trips"] and map shading (BUG-32 precedent, untouched)', async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined);
    const { result, qc } = renderWithClient(useRemovePlace);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate({ tripId: 1, placeId: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['map', 'shading'] });
  });

  it('useChangeCity still invalidates trip detail and map shading (unchanged by this fix)', async () => {
    vi.mocked(apiPatch).mockResolvedValue(placeResult);
    const { result, qc } = renderWithClient(useChangeCity);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate({ tripId: 1, placeId: 1, cityId: 5 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips', 1] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['map', 'shading'] });
  });

  it('useUpdatePlaceDates only invalidates trip detail (unchanged — dates alone do not move a map pin)', async () => {
    vi.mocked(apiPatch).mockResolvedValue(placeResult);
    const { result, qc } = renderWithClient(useUpdatePlaceDates);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate({
      tripId: 1,
      placeId: 1,
      arrivedOn: '2026-01-01',
      departedOn: '2026-01-05',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips', 1] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['map', 'shading'] });
  });
});

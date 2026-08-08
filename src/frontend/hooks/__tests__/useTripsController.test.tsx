/**
 * Tests for useTripsController (QUAL-30) — the controller hook extracted
 * from DesktopTripsLayout/MobileTripsLayout's ~130 lines of duplicated
 * state/derived-values/handlers.
 *
 * Neither original layout had dedicated tests (confirmed during the QUAL-30
 * investigation — only App.test.tsx mocks TripsLayout out entirely), so this
 * is new coverage for logic that previously had none, not a port of
 * existing assertions. Covers: displayedTrips filtering/search wiring,
 * per-status counts, map-filter label derivation (country/region/city
 * priority + BUG-80's city subtitle), selection-mode handlers, and bulk
 * delete + undo (FEAT-BD/NTH-01).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Country, TripSummary } from '../../types/api';
import { apiDelete, apiGet } from '../../utils/apiClient';
import { useTripsController } from '../useTripsController';

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

const countries: Country[] = [
  {
    country_code: 'US',
    name: 'United States',
    region_tier_enabled: true,
    region_tier_label: 'State',
  },
  { country_code: 'FR', name: 'France', region_tier_enabled: false, region_tier_label: null },
];

function makeTrip(overrides: Partial<TripSummary>): TripSummary {
  return {
    id: 1,
    name: 'Trip',
    start_date: '2026-01-01',
    end_date: '2026-01-05',
    status: 'planning',
    photo_album_ref: null,
    created_at: '',
    updated_at: '',
    categories: [],
    companions: [],
    activities: [],
    countries: [],
    places: [],
    ...overrides,
  };
}

const denverTrip = makeTrip({
  id: 1,
  name: 'Colorado trip',
  status: 'planning',
  start_date: '2026-02-01',
  countries: [{ country_code: 'US', name: 'United States' }],
  places: [
    {
      id: 1,
      city_id: 100,
      city: {
        id: 100,
        name: 'Denver',
        country_code: 'US',
        country_name: 'United States',
        region_id: 1,
        region_iso: 'US-CO',
        latitude: 39.7392,
        longitude: -104.9903,
        geocode_status: 'resolved',
      },
    },
  ],
});

const parisTrip = makeTrip({
  id: 2,
  name: 'Paris trip',
  status: 'active',
  start_date: '2026-03-01',
  countries: [{ country_code: 'FR', name: 'France' }],
  places: [
    {
      id: 2,
      city_id: 200,
      city: {
        id: 200,
        name: 'Paris',
        country_code: 'FR',
        country_name: 'France',
        region_id: null,
        region_iso: null,
        latitude: 48.8566,
        longitude: 2.3522,
        geocode_status: 'resolved',
      },
    },
  ],
});

const lockedTrip = makeTrip({ id: 3, name: 'Locked trip', status: 'locked' });

const allFixtureTrips = [denverTrip, parisTrip, lockedTrip];

/** Renders useTripsController inside the QueryClient + Router context it needs. */
function renderController(initialPath = '/trips') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/trips" element={children} />
          <Route path="/trips/:id" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return renderHook(() => useTripsController(), { wrapper });
}

describe('useTripsController', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiDelete).mockReset();
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path.startsWith('/api/trips')) return Promise.resolve(allFixtureTrips);
      if (path.startsWith('/api/admin/countries')) return Promise.resolve(countries);
      return Promise.reject(new Error(`unexpected apiGet path: ${path}`));
    });
    vi.mocked(apiDelete).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads trips and derives tripCount/statusCounts from them', async () => {
    const { result } = renderController();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.tripCount).toBe(3);
    expect(result.current.statusCounts).toEqual({ planning: 1, active: 1, locked: 1 });
  });

  it('search text filters displayedTrips via filterAndSortTrips', async () => {
    const { result } = renderController();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.setSearchText('paris');
    await waitFor(() => {
      expect(result.current.displayedTrips.map((t) => t.name)).toEqual(['Paris trip']);
    });
  });

  it('derives a country map-filter label from the URL', async () => {
    const { result } = renderController('/trips?country=FR');
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await waitFor(() => {
      expect(result.current.mapFilterLabel).toBe('Country: FR');
    });
    // Country filter also narrows displayedTrips to that country's trips.
    expect(result.current.displayedTrips.map((t) => t.name)).toEqual(['Paris trip']);
  });

  it('derives a city map-filter label with region/country subtitle (BUG-80)', async () => {
    const { result } = renderController('/trips?city=100');
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await waitFor(() => {
      expect(result.current.mapFilterLabel).toContain('City: Denver');
    });
  });

  it('enterSelectionMode/exitSelectionMode toggle selectionMode and reset selectedIds', async () => {
    const { result } = renderController();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleCheckChange(1, true);
      result.current.enterSelectionMode();
    });
    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedIds.size).toBe(0);

    act(() => {
      result.current.handleCheckChange(1, true);
    });
    expect(result.current.selectedIds.has(1)).toBe(true);

    act(() => {
      result.current.exitSelectionMode();
    });
    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('handleSelectAll selects only non-locked (selectable) trips', async () => {
    const { result } = renderController();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleSelectAll();
    });
    expect([...result.current.selectedIds].sort()).toEqual([1, 2]); // not the locked trip (id 3)
  });

  it('handleBulkDelete confirms, waits 5s, then deletes each selected trip and clears pendingDelete', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderController();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleCheckChange(1, true);
      result.current.handleCheckChange(2, true);
    });
    expect(result.current.selectedIds.size).toBe(2);

    act(() => {
      result.current.handleBulkDelete();
    });
    expect(confirmSpy).toHaveBeenCalled();
    expect(result.current.pendingDelete?.ids.size).toBe(2);
    // Exits selection mode immediately (before the undo window elapses).
    expect(result.current.selectionMode).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.pendingDelete).toBeNull();
    expect(apiDelete).toHaveBeenCalledWith('/api/trips/1');
    expect(apiDelete).toHaveBeenCalledWith('/api/trips/2');

    vi.useRealTimers();
  });

  it('handleUndoDelete cancels the pending timer before it fires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderController();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleCheckChange(1, true);
    });
    expect(result.current.selectedIds.size).toBe(1);

    act(() => {
      result.current.handleBulkDelete();
    });
    expect(result.current.pendingDelete).not.toBeNull();

    act(() => {
      result.current.handleUndoDelete();
    });
    expect(result.current.pendingDelete).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(apiDelete).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('handleBulkDelete does nothing when nothing is selected', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { result } = renderController();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleBulkDelete();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(result.current.pendingDelete).toBeNull();
  });
});

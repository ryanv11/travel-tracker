/**
 * Tests for useGeocodeRetryQueue (BUG-29).
 *
 * The hook wires the geocodeRetryQueue singleton to the API. These tests
 * prove the poll path is read-only:
 *   - polling calls apiGet on /api/cities/:id
 *   - polling never issues apiPatch/apiPost/apiDelete (no write-as-poll)
 *   - an ApiError 404 from the GET removes the city from the queue
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geocodeRetryQueue } from '../../services/geocodeRetryQueue';
// ApiError is the real class (the mock below spreads the actual module), so
// instanceof checks inside geocodeRetryQueue see the same class identity.
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from '../../utils/apiClient';
import { useGeocodeRetryQueue } from '../useGeocodeRetryQueue';

vi.mock('../../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/apiClient')>();
  return {
    ...actual, // keep the real ApiError class — the queue matches on instanceof
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPatch: vi.fn(),
    apiDelete: vi.fn(),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useGeocodeRetryQueue', () => {
  beforeEach(() => {
    localStorage.clear();
    geocodeRetryQueue.dismiss();
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPatch).mockReset();
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiDelete).mockReset();
  });

  afterEach(() => {
    geocodeRetryQueue.dismiss();
  });

  it('polls via GET /api/cities/:id and issues no write requests', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      id: 42,
      name: 'Dublin',
      country_code: 'IE',
      region_id: null,
      latitude: 53.3498,
      longitude: -6.2603,
      geocode_status: 'resolved',
    });

    renderHook(() => useGeocodeRetryQueue(), { wrapper });

    geocodeRetryQueue.add({ id: 42, name: 'Dublin', country_code: 'IE' });

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/api/cities/42');
    });

    // Resolved → removed from queue
    await waitFor(() => {
      expect(geocodeRetryQueue.getQueue()).toHaveLength(0);
    });

    // The poll must never write (BUG-29: no write-as-poll)
    expect(apiPatch).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it('removes the city from the queue when the GET returns 404 (city deleted)', async () => {
    vi.mocked(apiGet).mockRejectedValue(
      new ApiError('City not found', 404, { error: 'City not found' }),
    );

    renderHook(() => useGeocodeRetryQueue(), { wrapper });

    geocodeRetryQueue.add({ id: 99, name: 'Ghost Town', country_code: 'IE' });

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/api/cities/99');
    });
    await waitFor(() => {
      expect(geocodeRetryQueue.getQueue()).toHaveLength(0);
    });

    expect(apiPatch).not.toHaveBeenCalled();
  });
});

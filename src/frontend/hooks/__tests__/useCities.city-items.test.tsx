/**
 * Tests for useCityItems (IT-09) — the query-param construction for
 * GET /api/cities/:id/items.
 *
 * Source: src/frontend/hooks/useCities.ts
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet } from '../../utils/apiClient';
import { useCityItems } from '../useCities';

vi.mock('../../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/apiClient')>();
  return {
    ...actual,
    apiGet: vi.fn(),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCityItems', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiGet).mockResolvedValue([]);
  });

  it('is disabled when cityId is undefined (no fetch issued)', () => {
    renderHook(() => useCityItems(undefined), { wrapper });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('defaults to sort_by=rating with no sort_order/min_rating params', async () => {
    renderHook(() => useCityItems(7), { wrapper });
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    const url = vi.mocked(apiGet).mock.calls[0][0] as string;
    expect(url).toBe('/api/cities/7/items?sort_by=rating');
  });

  it('passes sort_order and min_rating through as query params when set', async () => {
    renderHook(() => useCityItems(7, { sortOrder: 'asc', minRating: 3 }), { wrapper });
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    const url = vi.mocked(apiGet).mock.calls[0][0] as string;
    expect(url).toContain('sort_by=rating');
    expect(url).toContain('sort_order=asc');
    expect(url).toContain('min_rating=3');
  });
});

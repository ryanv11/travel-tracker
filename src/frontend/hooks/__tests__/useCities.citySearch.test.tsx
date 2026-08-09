/**
 * Tests for useCitySearch's query-param construction (GET /api/cities?q=...).
 *
 * GE-20 (BUG-87, ADL-54) — F2 (fresh-eyes finding): the "cannot be bypassed
 * from within the picker" guarantee depends on this hook ALWAYS forwarding a
 * `country_codes` param, present-but-empty when the caller passes none (the
 * backend's documented "unconstrained" contract, PO Q1) — never simply
 * omitted, since omission and empty-string are declared distinct contracts
 * on the backend (see jobs/backend/tech/20260307-api-reference.md §Cities).
 * Pinned here at the lowest level, and again at the AddPlaceFlow integration
 * level (AddPlaceFlow.ge20-country-filter.test.tsx).
 *
 * Source: src/frontend/hooks/useCities.ts
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet } from '../../utils/apiClient';
import { useCitySearch } from '../useCities';

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

describe('useCitySearch', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiGet).mockResolvedValue([]);
  });

  it('is disabled below the 2-character minimum (no fetch issued)', () => {
    renderHook(() => useCitySearch('p'), { wrapper });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('sends an empty country_codes when none is passed (default [], unconstrained)', async () => {
    renderHook(() => useCitySearch('paris'), { wrapper });
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(apiGet).toHaveBeenCalledWith('/api/cities?q=paris&country_codes=');
  });

  it('GE-20/F2: forwards a non-empty country_codes list, comma-joined', async () => {
    renderHook(() => useCitySearch('newport', ['GB', 'FR']), { wrapper });
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(apiGet).toHaveBeenCalledWith('/api/cities?q=newport&country_codes=GB%2CFR');
  });

  it('GE-20: an explicit empty array is sent the same way as the default (present-but-empty = unconstrained)', async () => {
    renderHook(() => useCitySearch('paris', []), { wrapper });
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(apiGet).toHaveBeenCalledWith('/api/cities?q=paris&country_codes=');
  });

  it('refetches when the country filter changes (country_codes is part of the query key)', async () => {
    const { rerender } = renderHook(({ codes }) => useCitySearch('newport', codes), {
      wrapper,
      initialProps: { codes: ['GB'] },
    });
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/api/cities?q=newport&country_codes=GB'),
    );

    rerender({ codes: ['GB', 'FR'] });
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/api/cities?q=newport&country_codes=GB%2CFR'),
    );
  });
});

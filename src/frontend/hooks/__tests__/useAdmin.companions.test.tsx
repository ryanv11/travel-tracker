/**
 * Tests for BUG-51: companion mutations must invalidate the ['trips'] query
 * cache, not just ['admin', 'companions'].
 *
 * Root cause (established in #302, not re-litigated here): trips embed the
 * companion's name via a live LEFT JOIN, not a denormalised copy. Against
 * the global 5-minute staleTime (src/frontend/main.tsx:32), a trip whose
 * ['trips'] query was still fresh at rename time kept serving the stale
 * companion name until something else forced a refetch.
 *
 * These tests assert each of useCreateCompanion, useUpdateCompanion and
 * useDeleteCompanion invalidates BOTH ['admin', 'companions'] and ['trips']
 * on success.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiDelete, apiPatch, apiPost } from '../../utils/apiClient';
import { useCreateCompanion, useDeleteCompanion, useUpdateCompanion } from '../useAdmin';

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

describe('BUG-51: companion mutations invalidate both admin.companions and trips', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiPatch).mockReset();
    vi.mocked(apiDelete).mockReset();
  });

  it('useCreateCompanion invalidates both query keys on success', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      id: 1,
      name: 'Alex',
      is_active: 1,
      created_at: '',
      updated_at: '',
    });

    const { result, qc } = renderWithClient(useCreateCompanion);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate('Alex');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'companions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips'] });
  });

  it('useUpdateCompanion invalidates both query keys on success', async () => {
    vi.mocked(apiPatch).mockResolvedValue({
      id: 1,
      name: 'Alexandra',
      is_active: 1,
      created_at: '',
      updated_at: '',
    });

    const { result, qc } = renderWithClient(useUpdateCompanion);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate({ id: 1, data: { name: 'Alexandra' } });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'companions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips'] });
  });

  it('useDeleteCompanion invalidates both query keys on success', async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined);

    const { result, qc } = renderWithClient(useDeleteCompanion);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    result.current.mutate(1);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'companions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips'] });
  });
});

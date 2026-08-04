/**
 * Tests for BuildStamp (QUAL-26).
 *
 * Source: src/frontend/components/shared/BuildStamp.tsx
 *
 * The point of the stamp is that the PO can trust it. So the cases that matter most are the
 * ones where it must show NOTHING — an unresolved build, a failed request — because a stamp
 * that renders a placeholder, an error, or a stale value would reintroduce exactly the
 * "is this deployed?" ambiguity it exists to remove.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet } from '../../../utils/apiClient';
import { BuildStamp } from '../BuildStamp';

vi.mock('../../../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/apiClient')>();
  return { ...actual, apiGet: vi.fn() };
});

const SHA = 'b93bf9b510a2abe375450c763d17cee5e14d1d96';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('BuildStamp', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
  });

  it('reads the build identity from /health', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      status: 'ok',
      commit: 'b93bf9b',
      commitFull: SHA,
      builtAt: null,
    });

    render(<BuildStamp />, { wrapper });

    await waitFor(() => expect(screen.getByTestId('build-stamp')).toBeInTheDocument());
    expect(apiGet).toHaveBeenCalledWith('/health');
    expect(screen.getByTestId('build-stamp')).toHaveTextContent('b93bf9b');
  });

  it('puts the full SHA in the tooltip so the visible footprint stays seven characters', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      status: 'ok',
      commit: 'b93bf9b',
      commitFull: SHA,
      builtAt: '2026-08-04T09:00:00.000Z',
    });

    render(<BuildStamp />, { wrapper });

    const stamp = await screen.findByTestId('build-stamp');
    expect(stamp.getAttribute('title')).toContain(SHA);
    expect(stamp.getAttribute('title')).toContain('built');
  });

  it('renders nothing when the build could not be identified', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      status: 'ok',
      commit: 'unknown',
      commitFull: null,
      builtAt: null,
    });

    render(<BuildStamp />, { wrapper });

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByTestId('build-stamp')).not.toBeInTheDocument();
  });

  it('renders nothing — and no error surface — when /health fails', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('network down'));

    render(<BuildStamp />, { wrapper });

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByTestId('build-stamp')).not.toBeInTheDocument();
  });
});

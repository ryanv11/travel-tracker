/**
 * React Query hook for the liveness/build-identity endpoint (GET /health) — QUAL-26.
 *
 * The build cannot change underneath a loaded page — a new deploy means a new document —
 * so this is fetched once and never refetched on focus or reconnect. It is also the only
 * hook in the app that reads an endpoint outside /api, because /health is the deployment's
 * own endpoint rather than part of the product API.
 *
 * Failure is deliberately silent at the call site: this is a diagnostic stamp, and a
 * network blip must never surface an error banner over the product.
 */
import { useQuery } from '@tanstack/react-query';
import type { Health } from '../types/api';
import { apiGet } from '../utils/apiClient';

/**
 * Fetches the running build's identity from /health.
 * @returns React Query result containing Health ({ status, commit, commitFull, builtAt }).
 */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<Health>('/health'),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

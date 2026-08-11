/**
 * useGeocodeQueue — GE-19 / ADL-55 D3 (BUG-85): polls the user-scoped geocode
 * queue and exposes it, bucketed, to the indicator.
 *
 * This is the SOURCE OF TRUTH for the geocode-status indicator, replacing the
 * retired NR-06 localStorage retry queue (ADL-55 OQ-4). The old design kept a
 * per-browser localStorage list that went stale on place deletion and could not
 * be userId-safe; the server query is derived from the user's own
 * `trip_places → trips`, so a city drops out automatically once it resolves or
 * the user no longer references it.
 *
 * Server-side re-resolution is unaffected — the backend's `processQueue` still
 * retries pending cities on its own schedule (ADL-10). This hook only READS the
 * result: `GET /api/geocode-queue` on mount, on window focus, and on a 30s
 * interval; recovery mutations (add/remove/re-point a place) additionally
 * invalidate `['geocode-queue']` so the panel updates immediately.
 *
 * Usage:
 *   const { entries, resolving, needsAttention } = useGeocodeQueue();
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { GeocodeQueueEntry } from '../types/api';
import { apiGet } from '../utils/apiClient';
import { bucketGeocodeQueue } from '../utils/geocodeQueueLabels';

/** React Query key for the geocode queue — mutations invalidate this prefix. */
export const GEOCODE_QUEUE_QUERY_KEY = ['geocode-queue'] as const;

/** How often to re-poll the queue while the app is focused (ms). */
const POLL_INTERVAL_MS = 30_000;

/**
 * Polls `GET /api/geocode-queue` and returns the queue split into buckets.
 *
 * @returns The full queue plus its `resolving` / `needsAttention` buckets,
 *          their counts, and the query's loading/error state.
 */
export function useGeocodeQueue() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: GEOCODE_QUEUE_QUERY_KEY,
    queryFn: () => apiGet<GeocodeQueueEntry[]>('/api/geocode-queue'),
    // Poll so background server resolutions surface without a manual refresh.
    refetchInterval: POLL_INTERVAL_MS,
    // Keep it fresher than the app-wide 5min default so the interval actually
    // refetches rather than serving a long-stale cache.
    staleTime: POLL_INTERVAL_MS / 2,
  });

  const entries = query.data ?? [];

  // When the queue's contents change — a city resolved and dropped out, or its
  // status/cause changed — nudge the views that render city geocode state so
  // they reflect the new reality without waiting on their own staleTime. This
  // preserves the retired localStorage service's "resolved cities reappear in
  // search" behaviour and extends it to the map pins (which derive from
  // `['trips']`, BUG-93). Signature-compared, not reference-compared, because
  // React Query hands back a fresh array on every poll even when unchanged.
  const lastSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const data = query.data;
    if (data === undefined) return;
    // Derive the signature directly from `query.data` (not the render-scoped
    // `entries`) so `query.data` is the sole, exhaustive effect dependency.
    const signature = data
      .map((e) => `${e.id}:${e.geocode_status}:${e.geocode_cause ?? ''}`)
      .join('|');
    if (lastSignatureRef.current === null) {
      // First successful load — record the baseline, don't invalidate.
      lastSignatureRef.current = signature;
      return;
    }
    if (signature !== lastSignatureRef.current) {
      lastSignatureRef.current = signature;
      void qc.invalidateQueries({ queryKey: ['cities'] });
      void qc.invalidateQueries({ queryKey: ['trips'] });
    }
  }, [query.data, qc]);

  const { resolving, needsAttention } = bucketGeocodeQueue(entries);

  return {
    entries,
    resolving,
    needsAttention,
    resolvingCount: resolving.length,
    needsAttentionCount: needsAttention.length,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

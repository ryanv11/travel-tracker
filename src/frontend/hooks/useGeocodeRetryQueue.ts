/**
 * useGeocodeRetryQueue — React hook for NR-06 offline geocoding retry queue.
 *
 * Initialises the singleton geocodeRetryQueue service on first mount (App.tsx),
 * wires up the GET status-poll function, and exposes the current queue state
 * plus control methods to components. Polling is read-only (BUG-29) — the
 * backend re-runs geocoding itself every 15 minutes.
 *
 * Usage in App.tsx:
 *   const { pendingCount, retryAll, dismiss } = useGeocodeRetryQueue();
 *
 * Usage in AddPlaceFlow (after city creation):
 *   import { geocodeRetryQueue } from '../services/geocodeRetryQueue';
 *   if (city.geocode_status !== 'resolved') geocodeRetryQueue.add(city);
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { geocodeRetryQueue, type RetryQueueEntry } from '../services/geocodeRetryQueue';
import type { City } from '../types/api';
import { apiGet } from '../utils/apiClient';

export type { RetryQueueEntry };

/**
 * Initialises the geocode retry service and returns queue state + controls.
 *
 * @returns Object with current queue, pending count, retryAll, and dismiss.
 */
export function useGeocodeRetryQueue() {
  const [queue, setQueue] = useState<RetryQueueEntry[]>(geocodeRetryQueue.getQueue());
  const qc = useQueryClient();

  useEffect(() => {
    // Wire up the poll function: GET /api/cities/:id (read-only — BUG-29).
    // The response carries the current geocode_status so we can detect
    // resolution; a 404 (ApiError) signals the city was deleted and the
    // queue removes the entry permanently.
    geocodeRetryQueue.init(async (cityId: number) => {
      const city = await apiGet<City>(`/api/cities/${cityId}`);
      return { geocode_status: city.geocode_status };
    });

    // Subscribe to queue updates
    const unsubscribe = geocodeRetryQueue.subscribe((q) => {
      setQueue(q);
      // Invalidate city queries so resolved cities appear in search results
      void qc.invalidateQueries({ queryKey: ['cities'] });
    });

    return unsubscribe;
  }, [qc]);

  return {
    queue,
    pendingCount: queue.length,
    retryAll: () => geocodeRetryQueue.retryAll(),
    dismiss: () => geocodeRetryQueue.dismiss(),
  };
}

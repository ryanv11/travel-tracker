/**
 * useGeocodeRetryQueue — React hook for NR-06 offline geocoding retry queue.
 *
 * Initialises the singleton geocodeRetryQueue service on first mount (App.tsx),
 * wires up the PATCH retry function, and exposes the current queue state plus
 * control methods to components.
 *
 * Usage in App.tsx:
 *   const { pendingCount, retryAll, dismiss } = useGeocodeRetryQueue();
 *
 * Usage in AddPlaceFlow (after city creation):
 *   import { geocodeRetryQueue } from '../services/geocodeRetryQueue';
 *   if (city.geocode_status !== 'resolved') geocodeRetryQueue.add(city);
 */
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { geocodeRetryQueue, type RetryQueueEntry } from '../services/geocodeRetryQueue';
import { apiPatch } from '../utils/apiClient';
import type { City } from '../types/api';

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
    // Wire up the retry function: PATCH /api/cities/:id (empty body).
    // The response carries the current geocode_status so we can detect resolution.
    geocodeRetryQueue.init(async (cityId: number) => {
      const city = await apiPatch<City>(`/api/cities/${cityId}`, {});
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

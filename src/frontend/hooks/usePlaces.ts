/**
 * React Query hooks for the /api/trips/:tripId/places resource.
 *
 * Handles adding places (cities) to a trip and tagging activities to places.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TripPlaceNoItems } from '../types/api';
import { apiDelete, apiPost } from '../utils/apiClient';

/** Response shape from POST /api/trips/:tripId/places/:placeId/carry-forward */
interface CarryForwardResult {
  created_item_ids: number[];
  count: number;
}

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Adds a city to a trip as a place via POST /api/trips/:tripId/places.
 * On success, invalidates the trip detail query so the new place renders.
 *
 * @returns useMutation result. Call mutateAsync({ tripId, cityId }) to submit.
 */
export function useAddPlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, cityId }: { tripId: number; cityId: number }) =>
      apiPost<TripPlaceNoItems>(`/api/trips/${tripId}/places`, { city_id: cityId }),
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['trips', vars.tripId] });
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

/**
 * Removes a place from a trip via DELETE /api/trips/:tripId/places/:placeId.
 * On success, invalidates the trip detail query.
 *
 * @returns useMutation result. Call mutateAsync({ tripId, placeId }) to submit.
 */
export function useRemovePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, placeId }: { tripId: number; placeId: number }) =>
      apiDelete(`/api/trips/${tripId}/places/${placeId}`),
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['trips', vars.tripId] });
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

/**
 * Executes the carry-forward action for a place (AC-17, IT-07).
 * POST /api/trips/:tripId/places/:placeId/carry-forward
 *
 * @returns useMutation result. Call mutateAsync({ tripId, placeId, sourceItemIds }).
 */
export function useCarryForward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      placeId,
      sourceItemIds,
    }: {
      tripId: number;
      placeId: number;
      sourceItemIds: number[];
    }) =>
      apiPost<CarryForwardResult>(`/api/trips/${tripId}/places/${placeId}/carry-forward`, {
        source_item_ids: sourceItemIds,
      }),
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['trips', vars.tripId] });
    },
  });
}

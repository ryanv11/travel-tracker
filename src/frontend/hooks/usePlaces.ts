/**
 * React Query hooks for the /api/trips/:tripId/places resource.
 *
 * Handles adding places (cities) to a trip, tagging activities to places,
 * and updating place-level date ranges (UX-02 / ADL-24).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TripPlaceNoItems } from '../types/api';
import { apiDelete, apiPatch, apiPost } from '../utils/apiClient';

/** Response shape from POST /api/trips/:tripId/places/:placeId/carry-forward */
interface CarryForwardResult {
  created_item_ids: number[];
  count: number;
}

/** Response shape for POST /api/trips/:tripId/places (UX-02 adds optional warnings). */
interface AddPlaceResult extends TripPlaceNoItems {
  /** Backend warnings — e.g. dates fall outside trip range. */
  warnings?: string[];
}

/** Response shape from PATCH /api/trips/:tripId/places/:placeId (UX-02) */
interface UpdatePlaceDatesResult {
  id: number;
  arrived_on: string | null;
  departed_on: string | null;
  /** Backend warnings — e.g. dates fall outside trip range. */
  warnings?: string[];
}

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Adds a city to a trip as a place via POST /api/trips/:tripId/places.
 * On success, invalidates the trip detail query so the new place renders.
 *
 * UX-02: Optional arrivedOn / departedOn may be included in the POST body.
 *
 * @returns useMutation result. Call mutateAsync({ tripId, cityId, arrivedOn, departedOn }).
 */
export function useAddPlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      cityId,
      arrivedOn,
      departedOn,
    }: {
      tripId: number;
      cityId: number;
      arrivedOn?: string | null;
      departedOn?: string | null;
    }) =>
      apiPost<AddPlaceResult>(`/api/trips/${tripId}/places`, {
        city_id: cityId,
        ...(arrivedOn !== undefined && { arrived_on: arrivedOn }),
        ...(departedOn !== undefined && { departed_on: departedOn }),
      }),
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['trips', vars.tripId] });
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

/**
 * Removes a place from a trip via DELETE /api/trips/:tripId/places/:placeId.
 * On success, invalidates the trip detail query and the trip list query — a
 * trip card shows the names of its places (DP-01), so removing one must
 * refresh both, not just the detail view (BUG-32 verification caught the
 * trip-list card holding a stale place chip when only ['trips', tripId] was
 * invalidated; ['trips'] alone already covers both per useTrips.ts's
 * established convention, since ['trips', tripId] is a suffix of it).
 *
 * @returns useMutation result. Call mutateAsync({ tripId, placeId }) to submit.
 */
export function useRemovePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, placeId }: { tripId: number; placeId: number }) =>
      apiDelete(`/api/trips/${tripId}/places/${placeId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['trips'] });
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

/**
 * Updates arrived_on / departed_on on a place via PATCH /api/trips/:tripId/places/:placeId.
 * On success, invalidates the trip detail query so the updated dates render immediately.
 *
 * UX-02 / ADL-24: place date ranges.
 *
 * @returns useMutation result. Call mutateAsync({ tripId, placeId, arrivedOn, departedOn }).
 */
export function useUpdatePlaceDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      placeId,
      arrivedOn,
      departedOn,
    }: {
      tripId: number;
      placeId: number;
      arrivedOn: string | null;
      departedOn: string | null;
    }) =>
      apiPatch<UpdatePlaceDatesResult>(`/api/trips/${tripId}/places/${placeId}`, {
        arrived_on: arrivedOn,
        departed_on: departedOn,
      }),
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['trips', vars.tripId] });
    },
  });
}

/**
 * Re-points a place to a corrected city via PATCH /api/trips/:tripId/places/:placeId
 * (ADL-46 D11, city_id-only). UX-12's "Change city" correction path — a thin
 * sibling of `useUpdatePlaceDates` issuing the same PATCH endpoint with only
 * `city_id` in the body (items, notes, and activity tags are preserved
 * server-side; already asserted by `place-repoint.test.ts`). Kept as a
 * separate hook rather than overloading `useUpdatePlaceDates` with an
 * optional `cityId` param — the two write intents (editing dates vs.
 * correcting the city) are distinct call sites (`PlaceDateForm` vs.
 * `ChangeCityModal`) and this keeps each hook's argument list to what its
 * caller actually has in hand.
 *
 * @returns useMutation result. Call mutateAsync({ tripId, placeId, cityId }).
 */
export function useChangeCity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      placeId,
      cityId,
    }: {
      tripId: number;
      placeId: number;
      cityId: number;
    }) =>
      apiPatch<UpdatePlaceDatesResult>(`/api/trips/${tripId}/places/${placeId}`, {
        city_id: cityId,
      }),
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

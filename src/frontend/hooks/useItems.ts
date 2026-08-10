/**
 * React Query hooks for the /api/trips/:tripId/items resource.
 *
 * Handles creating, updating, and deleting items of all types.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Item, ItemStatus, ItemType } from '../types/api';
import { apiDelete, apiGet, apiPatch, apiPost } from '../utils/apiClient';

// ============================================================
// RATING SORT / FILTER (IT-08) — client-side, see B8 report for reasoning
// ============================================================

/** `null` sort order means "no sort applied" — the list's default/incoming order. */
export type RatingSortOrder = 'asc' | 'desc' | null;

/** `null` min rating means "no filter applied". */
export interface RatingSortFilterState {
  sortOrder: RatingSortOrder;
  minRating: number | null;
}

/** The unapplied state — no sort, no filter. Used to reset/clear controls (IT-08 AC). */
export const DEFAULT_RATING_SORT_FILTER: RatingSortFilterState = {
  sortOrder: null,
  minRating: null,
};

/**
 * Applies a client-side rating sort and/or minimum-rating filter to a list of
 * items, matching the semantics of the backend's sort_by=rating/min_rating
 * query params (src/backend/repositories/items-helper.ts — relocated out of the
 * route layer by QUAL-43 Stage 4) so both surfaces behave
 * identically per IT-09's success criteria:
 *
 *  - A `minRating` filter excludes unrated items entirely (never treats a
 *    null rating as 0 — an unrated item is not "worse", it is unknown).
 *  - A `sortOrder` sort always places unrated items last, regardless of
 *    direction (mirrors the backend's DESC-nulls-last behaviour).
 *  - Passing DEFAULT_RATING_SORT_FILTER (both null) returns the list
 *    untouched, in its original/default order.
 *
 * @param items - The items to sort/filter (not mutated).
 * @param state - Current sort order and minimum rating.
 * @returns A new array; the original is left untouched.
 */
export function applyRatingSortFilter(items: Item[], state: RatingSortFilterState): Item[] {
  let result = items;

  if (state.minRating != null) {
    const min = state.minRating;
    result = result.filter((item) => item.rating != null && item.rating >= min);
  }

  if (state.sortOrder != null) {
    const order = state.sortOrder;
    result = [...result].sort((a, b) => {
      if (a.rating == null && b.rating == null) return 0;
      if (a.rating == null) return 1; // unrated always last
      if (b.rating == null) return -1;
      return order === 'asc' ? a.rating - b.rating : b.rating - a.rating;
    });
  }

  return result;
}

/** Body for POST /api/trips/:tripId/items */
export interface CreateItemData {
  trip_place_id: number | null;
  item_type: ItemType;
  status?: ItemStatus;
  notes?: string | null;
  /** Optional map/directions link (IT-10, ADL-45). https:// only. */
  map_url?: string | null;
  // Restaurant
  name?: string | null;
  neighbourhood_area?: string | null;
  cuisine_type?: string | null;
  source?: string | null;
  // Hotel
  property_name?: string | null;
  address?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  booking_reference?: string | null;
  confirmation_number?: string | null;
  // Flight
  airline?: string | null;
  flight_number?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  departure_datetime?: string | null;
  arrival_datetime?: string | null;
  seat?: string | null;
  // Car rental
  provider?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  pickup_datetime?: string | null;
  dropoff_datetime?: string | null;
  vehicle_class?: string | null;
}

/** Body for PATCH /api/trips/:tripId/items/:itemId (all fields optional) */
export type UpdateItemData = Partial<
  Omit<CreateItemData, 'item_type' | 'trip_place_id'> & {
    rating?: number | null;
    post_visit_notes?: string | null;
  }
>;

// ============================================================
// QUERIES
// ============================================================

/**
 * Fetches trip-level items (items with no associated place, trip_place_id
 * IS NULL) for a trip — BUG-36 / IT-01.
 *
 * GET /api/trips/:tripId/items (unfiltered) returns every item on the trip
 * including trip-level ones; the nested GET /api/trips/:id response used to
 * hydrate TripDetail only surfaces items nested under `places[].items` and
 * currently drops trip-level items entirely (see src/backend/routes/trips.ts
 * buildTripResponse / the `/:id` handler — `allItems` is filtered per-place
 * with no branch for trip_place_id === null). Flagged to Backend/COO as a
 * contract gap; this hook works around it using the flat items endpoint,
 * which already returns the full set correctly, so trip-level items are
 * visible today without waiting on that fix.
 *
 * Query key is nested under ['trips', tripId, ...] so the existing
 * invalidation in useCreateItem/useUpdateItem/useDeleteItem (which
 * invalidates ['trips', tripId] with the default fuzzy/prefix match)
 * refreshes this list too — no changes needed to those mutations.
 *
 * @param tripId - Parent trip ID. Pass undefined to disable the query.
 * @returns React Query result containing only items where trip_place_id is null.
 */
export function useTripLevelItems(tripId: number | undefined) {
  return useQuery({
    queryKey: ['trips', tripId, 'items', 'trip-level'],
    queryFn: async () => {
      const items = await apiGet<Item[]>(`/api/trips/${tripId}/items`);
      return items.filter((item) => item.trip_place_id === null);
    },
    enabled: tripId !== undefined,
  });
}

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Creates a new item on a trip via POST /api/trips/:tripId/items.
 * On success, invalidates the trip detail query.
 *
 * @returns useMutation result. Call mutateAsync({ tripId, data }) to submit.
 */
export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, data }: { tripId: number; data: CreateItemData }) =>
      apiPost<Item>(`/api/trips/${tripId}/items`, data),
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['trips', vars.tripId] });
    },
  });
}

/**
 * Updates an item via PATCH /api/trips/:tripId/items/:itemId.
 * On success, invalidates the trip detail query.
 *
 * @returns useMutation result. Call mutateAsync({ tripId, itemId, data }) to submit.
 */
export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      itemId,
      data,
    }: {
      tripId: number;
      itemId: number;
      data: UpdateItemData;
    }) => apiPatch<Item>(`/api/trips/${tripId}/items/${itemId}`, data),
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['trips', vars.tripId] });
    },
  });
}

/**
 * Deletes an item via DELETE /api/trips/:tripId/items/:itemId.
 * On success, invalidates the trip detail query.
 *
 * @returns useMutation result. Call mutateAsync({ tripId, itemId }) to submit.
 */
export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, itemId }: { tripId: number; itemId: number }) =>
      apiDelete(`/api/trips/${tripId}/items/${itemId}`),
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['trips', vars.tripId] });
    },
  });
}

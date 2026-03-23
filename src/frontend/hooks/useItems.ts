/**
 * React Query hooks for the /api/trips/:tripId/items resource.
 *
 * Handles creating, updating, and deleting items of all types.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Item, ItemStatus, ItemType } from '../types/api';
import { apiDelete, apiPatch, apiPost } from '../utils/apiClient';

/** Body for POST /api/trips/:tripId/items */
export interface CreateItemData {
  trip_place_id: number | null;
  item_type: ItemType;
  status?: ItemStatus;
  notes?: string | null;
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

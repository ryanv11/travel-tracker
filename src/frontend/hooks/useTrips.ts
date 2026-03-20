/**
 * React Query hooks for the /api/trips resource.
 *
 * All API interactions for trips (list, detail, create, update, status changes,
 * lock/unlock) go through these hooks. Components must not call apiGet/apiPost
 * directly — always use a hook.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../utils/apiClient';
import type { TripSummary, TripDetail, TripStatus } from '../types/api';

/** Filters accepted by GET /api/trips */
export interface TripFilters {
  status?: TripStatus;
  category_id?: number;
  activity_id?: number;
}

/** Body shape for POST /api/trips and PATCH /api/trips/:id */
export interface TripFormData {
  name: string;
  start_date: string;
  end_date: string;
  photo_album_ref?: string;
  category_ids?: number[];
  companion_ids?: number[];
  activity_ids?: number[];
  country_codes?: string[];
}

// ============================================================
// QUERIES
// ============================================================

/**
 * Fetches the list of trips, optionally filtered.
 *
 * @param filters - Optional query params: status, category_id, activity_id.
 * @returns React Query result containing TripSummary[].
 */
export function useTrips(filters?: TripFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.category_id) params.set('category_id', String(filters.category_id));
  if (filters?.activity_id) params.set('activity_id', String(filters.activity_id));
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: ['trips', filters],
    queryFn: () => apiGet<TripSummary[]>(`/api/trips${qs}`),
  });
}

/**
 * Fetches a single trip with full nested data (places + items).
 *
 * @param id - Trip ID. Pass undefined to disable the query.
 * @returns React Query result containing TripDetail.
 */
export function useTrip(id: number | undefined) {
  return useQuery({
    queryKey: ['trips', id],
    queryFn: () => apiGet<TripDetail>(`/api/trips/${id}`),
    enabled: id !== undefined,
  });
}

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Creates a new trip via POST /api/trips.
 * On success, invalidates the trips list query.
 *
 * @returns useMutation result. Call mutateAsync(data) to submit.
 */
export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TripFormData) => apiPost<TripSummary>('/api/trips', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['trips'] });
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

/**
 * Updates an existing trip via PATCH /api/trips/:id.
 * On success, invalidates the trips list and the specific trip detail.
 *
 * @returns useMutation result. Call mutateAsync({ id, data }) to submit.
 */
export function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TripFormData> }) =>
      apiPatch<TripSummary>(`/api/trips/${id}`, data),
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['trips'] });
      void qc.invalidateQueries({ queryKey: ['trips', vars.id] });
    },
  });
}

/**
 * Transitions a trip's status via PATCH /api/trips/:id/status.
 * On success, invalidates trips list and detail.
 *
 * @returns useMutation result. Call mutateAsync({ id, status }) to submit.
 */
export function useUpdateTripStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: TripStatus }) =>
      apiPatch<TripSummary>(`/api/trips/${id}/status`, { status }),
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: ['trips'] });
      void qc.invalidateQueries({ queryKey: ['trips', vars.id] });
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

/**
 * Locks a trip via PATCH /api/trips/:id/lock.
 * On success, invalidates trips list and detail.
 *
 * @returns useMutation result. Call mutateAsync(id) to submit.
 */
export function useLockTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPatch<TripSummary>(`/api/trips/${id}/lock`, {}),
    onSuccess: (_result, id) => {
      void qc.invalidateQueries({ queryKey: ['trips'] });
      void qc.invalidateQueries({ queryKey: ['trips', id] });
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

/**
 * Unlocks a trip via PATCH /api/trips/:id/unlock.
 * On success, invalidates trips list and detail.
 *
 * @returns useMutation result. Call mutateAsync(id) to submit.
 */
export function useUnlockTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPatch<TripSummary>(`/api/trips/${id}/unlock`, {}),
    onSuccess: (_result, id) => {
      void qc.invalidateQueries({ queryKey: ['trips'] });
      void qc.invalidateQueries({ queryKey: ['trips', id] });
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

/**
 * Deletes a trip via DELETE /api/trips/:id.
 * On success, invalidates trips list and map shading queries.
 *
 * @returns useMutation result. Call mutateAsync(id) to delete.
 */
export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/trips/${id}`),
    onSuccess: (_result, id) => {
      void qc.invalidateQueries({ queryKey: ['trips'] });
      void qc.invalidateQueries({ queryKey: ['trips', id] });
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

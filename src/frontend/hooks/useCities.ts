/**
 * React Query hooks for the /api/cities resource.
 *
 * City search, creation, and the carry-forward candidates endpoint.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../utils/apiClient';
import type { City, CarryForwardCandidate } from '../types/api';

// ============================================================
// QUERIES
// ============================================================

/**
 * Searches for cities by name (GET /api/cities?q=...).
 * Minimum 2 characters required; query is disabled below that.
 *
 * @param query - Search string (minimum 2 chars to activate).
 * @returns React Query result containing City[].
 */
export function useCitySearch(query: string) {
  return useQuery({
    queryKey: ['cities', 'search', query],
    queryFn: () => apiGet<City[]>(`/api/cities?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 2,
    // Keep previous results visible while the new search is in flight
    placeholderData: (prev) => prev,
  });
}

/**
 * Fetches carry-forward candidates for a city (GET /api/cities/:id/carry-forward).
 * Returns items with status = 'next_time' from past completed trips to this city.
 *
 * @param cityId - City ID to check. Pass undefined to disable the query.
 * @returns React Query result containing CarryForwardCandidate[].
 */
export function useCarryForwardCandidates(cityId: number | undefined) {
  return useQuery({
    queryKey: ['cities', cityId, 'carry-forward'],
    queryFn: () => apiGet<CarryForwardCandidate[]>(`/api/cities/${cityId}/carry-forward`),
    enabled: cityId !== undefined,
  });
}

// ============================================================
// MUTATIONS
// ============================================================

/** Body for POST /api/cities */
export interface CreateCityData {
  name: string;
  country_code: string;
  region_id?: number | null;
}

/**
 * Creates a new city via POST /api/cities.
 * Triggers background geocoding on the server.
 *
 * @returns useMutation result. Call mutateAsync(data) to submit.
 */
export function useCreateCity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCityData) => apiPost<City>('/api/cities', data),
    onSuccess: () => {
      // Invalidate any city searches so new city appears in results
      void qc.invalidateQueries({ queryKey: ['cities'] });
    },
  });
}

/**
 * React Query hooks for map shading data.
 *
 * Covers GET /api/map/shading (all country shading), region shading,
 * and the shading config used by the admin panel.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CountryShading, RegionShading, ShadingConfig } from '../types/api';
import { apiGet, apiPatch } from '../utils/apiClient';

// ============================================================
// QUERIES
// ============================================================

/**
 * Fetches shading state for all countries (GET /api/map/shading).
 * Called once on map mount and cached for the session.
 *
 * @returns React Query result containing CountryShading[].
 */
export function useMapShading() {
  return useQuery({
    queryKey: ['map', 'shading'],
    queryFn: () => apiGet<CountryShading[]>('/api/map/shading'),
    // Shading rarely changes — stale time of 5 minutes prevents redundant refetches
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetches region-level shading for one country (GET /api/map/shading/regions/:code).
 * Only fetched lazily when the map is zoomed to region level.
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code. Undefined disables the query.
 * @returns React Query result containing RegionShading[].
 */
export function useRegionShading(countryCode: string | undefined) {
  return useQuery({
    queryKey: ['map', 'shading', 'regions', countryCode],
    queryFn: () => apiGet<RegionShading[]>(`/api/map/shading/regions/${countryCode}`),
    enabled: countryCode !== undefined,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetches the full shading configuration (6 configurable states).
 * Used by the Admin → Map Shading tab.
 *
 * @returns React Query result containing ShadingConfig[].
 */
export function useShadingConfig() {
  return useQuery({
    queryKey: ['map', 'shading', 'config'],
    queryFn: () => apiGet<ShadingConfig[]>('/api/map/shading/config'),
  });
}

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Updates the color hex for a shading state key.
 * PATCH /api/map/shading/config/:stateKey
 * On success, invalidates map shading queries so the map re-renders.
 *
 * @returns useMutation result. Call mutateAsync({ stateKey, colorHex }) to submit.
 */
export function useUpdateShadingColor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stateKey, colorHex }: { stateKey: string; colorHex: string }) =>
      apiPatch<ShadingConfig>(`/api/map/shading/config/${stateKey}`, {
        color_hex: colorHex,
      }),
    onSuccess: () => {
      // Invalidate both config and country shading so map updates immediately
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

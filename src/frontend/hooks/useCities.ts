/**
 * React Query hooks for the /api/cities resource.
 *
 * City search, creation, and the carry-forward candidates endpoint.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CarryForwardCandidate, City } from '../types/api';
import { apiGet, apiPost } from '../utils/apiClient';

// ============================================================
// NOMINATIM GEOCODING (GE-15 — country auto-populate)
// ============================================================

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'TravelTracker/1.0 (personal-use-app)';

/** Shape of a Nominatim search result with address details. */
interface NominatimResult {
  address?: {
    country_code?: string;
    'ISO3166-2-lvl4'?: string;
  };
}

/**
 * Looks up a city name via Nominatim and returns the ISO 3166-1 alpha-2
 * country code (upper-cased) and ISO 3166-2 subdivision code if found.
 *
 * Used by AddPlaceFlow to auto-populate the country and region fields (GE-15, UX-04).
 * Fire-and-forget style — errors are silently swallowed so the user
 * can still select the country/region manually if lookup fails.
 *
 * @param cityName - The city name to look up.
 * @returns Object with upper-cased country code (e.g. "FR") and region ISO (e.g. "US-CA"), both nullable.
 */
export async function lookupCityCountry(
  cityName: string,
): Promise<{ countryCode: string | null; regionIso: string | null }> {
  try {
    const params = new URLSearchParams({
      q: cityName,
      format: 'json',
      limit: '1',
      addressdetails: '1',
    });
    const resp = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
    });
    if (!resp.ok) return { countryCode: null, regionIso: null };
    const data = (await resp.json()) as NominatimResult[];
    const item = data[0];
    return {
      countryCode: item?.address?.country_code?.toUpperCase() ?? null,
      regionIso: item?.address?.['ISO3166-2-lvl4'] ?? null,
    };
  } catch {
    return { countryCode: null, regionIso: null };
  }
}

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

/**
 * React Query hooks for the /api/cities resource.
 *
 * City search, creation, and the carry-forward candidates endpoint.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CarryForwardCandidate,
  City,
  CityItem,
  GeocodeCandidate,
  GeocodeResult,
} from '../types/api';
import { apiGet, apiPost } from '../utils/apiClient';
import type { RatingSortOrder } from './useItems';

// ============================================================
// GEOCODING (ADL-46 D7/D14, GE-15 — country/region auto-populate)
// ============================================================

/**
 * BUG-73: `retry: 3` on the QueryClient (main.tsx) governs `useQuery` hooks
 * only — this call is a plain async function, not a query, so it inherits
 * none of that policy. Retry has to be implemented explicitly here. Same
 * attempt count as the query default (3 retries → 4 total attempts); a short
 * fixed backoff is used rather than the query default's exponential curve
 * (up to ~7s across 3 retries) because this blocks a foreground modal's
 * auto-populate state, not a background refetch.
 */
const GEOCODE_RETRY_ATTEMPTS = 3;
const GEOCODE_RETRY_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls GET /api/geocode, retrying transient failures up to
 * GEOCODE_RETRY_ATTEMPTS times before rethrowing the last error.
 *
 * @param countryCodes - GE-20 (BUG-87, ADL-54): the trip's declared country
 *   filter set, ISO alpha-2. ALWAYS sent, even when empty — a present-but-
 *   empty `country_codes` is the backend's documented "unconstrained" signal
 *   (PO Q1 ruling), distinct from omitting the param entirely (legacy/
 *   unchanged callers). Defaults to `[]` so callers that don't pass a trip
 *   filter (e.g. ChangeCityModal's re-point flow, out of GE-20's scope —
 *   ADL-54 D6) keep today's unconstrained behaviour unchanged.
 */
async function fetchGeocodeResultWithRetry(
  cityName: string,
  countryCodes: string[] = [],
): Promise<GeocodeResult> {
  const params = new URLSearchParams({ q: cityName, country_codes: countryCodes.join(',') });
  let lastError: unknown;
  for (let attempt = 0; attempt <= GEOCODE_RETRY_ATTEMPTS; attempt++) {
    try {
      return await apiGet<GeocodeResult>(`/api/geocode?${params}`);
    } catch (err) {
      lastError = err;
      if (attempt < GEOCODE_RETRY_ATTEMPTS) {
        await delay(GEOCODE_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

/**
 * Looks up a city name via the backend geocode proxy (GET /api/geocode) and
 * returns the top candidate's ISO 3166-1 alpha-2 country code and ISO 3166-2
 * subdivision code, plus the full candidate list for D14 ambiguity handling.
 *
 * ADL-46 (D7): this used to call nominatim.openstreetmap.org directly from
 * the browser. Two independent reasons that could never work in production:
 * CSP blocks the cross-origin fetch (BUG-55), and `User-Agent` is a forbidden
 * header name that fetch() silently drops, so the call never carried the
 * identifying UA Nominatim's usage policy requires. The proxy owns egress now.
 *
 * Used by AddPlaceFlow to auto-populate the country and region fields (GE-15, UX-04).
 * BUG-73: a transient failure is retried (see fetchGeocodeResultWithRetry)
 * before being reported. This function itself still never throws — the
 * caller keeps its manual-entry fallback with no try/catch required — but
 * unlike the pre-BUG-73 contract, a lookup that fails after retries are
 * exhausted is now distinguishable from one that succeeded and legitimately
 * found nothing: `failed: true` vs `failed: false` with null fields. Callers
 * that only care about "did it resolve" can keep ignoring `failed`; the
 * caller that needs to be honest with the user in AddPlaceFlow.tsx now checks it.
 *
 * @param cityName - The city name to look up.
 * @param countryCodes - GE-20 (BUG-87, ADL-54): the trip's declared country
 *   filter set, ISO alpha-2 codes. Always forwarded to the backend (see
 *   fetchGeocodeResultWithRetry's doc comment) so the "cannot be bypassed
 *   from within the picker" guarantee holds on this lookup path too — the
 *   discovery call that auto-populates country/region can never surface a
 *   candidate outside the trip's declared countries. Defaults to `[]`
 *   (unconstrained) for callers outside GE-20's scope.
 * @returns Upper-cased country code (e.g. "FR"), region ISO (e.g. "US-CA"),
 *   both nullable, the full candidate list (empty on any failure), `failed` —
 *   true when retries were exhausted without a successful response, OR
 *   (BUG-74) when the backend answered but reported `status: 'error'` or
 *   `'disabled'` — the upstream geocoder itself failed rather than our
 *   backend being unreachable. Never true for a genuine `status: 'ok'`
 *   no-match — that stays a real "found nothing", not an error. `truncated`
 *   (BUG-79) is true when the backend's raw Nominatim response may have had
 *   more matches than `candidates` shows, false on any failure (nothing was
 *   truncated; nothing was returned at all).
 */
export async function lookupCityCountry(
  cityName: string,
  countryCodes: string[] = [],
): Promise<{
  countryCode: string | null;
  regionIso: string | null;
  candidates: GeocodeCandidate[];
  failed: boolean;
  truncated: boolean;
}> {
  try {
    const result = await fetchGeocodeResultWithRetry(cityName, countryCodes);
    // BUG-74: an upstream geocoder failure ('error') or a disabled geocoder
    // ('disabled') is a failed lookup for the caller's purposes — same
    // user-visible banner as a retries-exhausted network failure — even
    // though our own backend answered with HTTP 200. `status` undefined
    // (pre-BUG-74 fixtures/mocks) or 'ok' both leave `failed` false here.
    const upstreamFailed = result.status === 'error' || result.status === 'disabled';
    return {
      countryCode: result.country_code?.toUpperCase() ?? null,
      regionIso: result.region_iso ?? null,
      candidates: result.candidates,
      failed: upstreamFailed,
      truncated: result.truncated ?? false,
    };
  } catch {
    return { countryCode: null, regionIso: null, candidates: [], failed: true, truncated: false };
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
 * @param countryCodes - GE-20 (BUG-87, ADL-54): the trip's declared country
 *   filter set, ISO alpha-2 codes. ALWAYS sent as `country_codes` (even when
 *   empty — the backend's documented "present-but-empty means unconstrained"
 *   contract, PO Q1), included in the query key so a filter change refetches
 *   rather than serving a stale cached page. Defaults to `[]` so callers
 *   outside GE-20's scope (e.g. ChangeCityModal's re-point flow, ADL-54 D6)
 *   keep today's unconstrained behaviour with no change required at the call
 *   site.
 * @returns React Query result containing City[].
 */
export function useCitySearch(query: string, countryCodes: string[] = []) {
  const codesParam = countryCodes.join(',');
  return useQuery({
    queryKey: ['cities', 'search', query, codesParam],
    queryFn: () =>
      apiGet<City[]>(
        `/api/cities?q=${encodeURIComponent(query)}&country_codes=${encodeURIComponent(codesParam)}`,
      ),
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

/**
 * Fetches completed, rated items across every trip that visited a city
 * (GET /api/cities/:id/items) — IT-09.
 *
 * Unlike useTripLevelItems/PlaceSection's client-side sort/filter (that data
 * arrives pre-loaded nested in the trip detail fetch, which has no sort/filter
 * query params), this is a dedicated flat endpoint built for exactly this —
 * sortOrder/minRating are passed straight through as sort_by=rating,
 * sort_order and min_rating query params, so the sort/filter is server-side
 * here. The route already defaults to rating DESC unfiltered with no params,
 * matching IT-08's "clearing returns to default order" behaviour for free.
 *
 * @param cityId - City to fetch cross-trip items for. Pass undefined to disable the query.
 * @param params - Optional rating sort direction and minimum-rating filter.
 * @returns React Query result containing CityItem[].
 */
export function useCityItems(
  cityId: number | undefined,
  params: { sortOrder?: RatingSortOrder; minRating?: number | null } = {},
) {
  const { sortOrder, minRating } = params;
  return useQuery({
    queryKey: ['cities', cityId, 'items', sortOrder ?? null, minRating ?? null],
    queryFn: () => {
      const qs = new URLSearchParams({ sort_by: 'rating' });
      if (sortOrder) qs.set('sort_order', sortOrder);
      if (minRating != null) qs.set('min_rating', String(minRating));
      return apiGet<CityItem[]>(`/api/cities/${cityId}/items?${qs.toString()}`);
    },
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
  /**
   * BUG-75/UX-12 (v3 §1/§B4) — the carried identity of a place-level
   * CityPicker pick. The server re-derives canonical data from its own
   * create-time lookup and uses this only to SELECT among its candidates
   * (v3 §2.3) — never trusted as coordinates. Omitted entirely for a
   * non-ambiguous create (single-candidate auto-fill or fully manual entry);
   * the server stamps identity on those resolves itself (v3 §2 M-A).
   */
  osm_type?: 'node' | 'way' | 'relation';
  osm_id?: number;
  display_name?: string;
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

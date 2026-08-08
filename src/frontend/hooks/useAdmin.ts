/**
 * React Query hooks for all admin endpoints.
 *
 * Covers categories, activities, companions, and countries.
 * All three list types (categories, activities, companions) share the same
 * CRUD pattern (QUAL-29): the list/active/create/update/delete bodies below
 * are thin named wrappers around the useNameList* helpers, which hold the
 * one real implementation of each shape. Function names, query keys and
 * endpoints are unchanged from before the refactor — this is a pure
 * dedup, not a behaviour change.
 *
 * ADL-46 (AD-09, D3): categories and activities moved off /api/admin/* to
 * /api/categories and /api/activities (requireAuth, userId-scoped) — same
 * response shape, per-user data — exactly as ADL-28 moved companions to
 * /api/companions. See src/backend/routes/categories.ts / activities.ts.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Activity, Category, Companion, Country } from '../types/api';
import { apiDelete, apiGet, apiPatch, apiPost } from '../utils/apiClient';

// ============================================================
// SHARED NAME-LIST CRUD HELPERS (QUAL-29)
// ============================================================

/**
 * Fetches a name-list resource (all rows, active + inactive).
 * @param resourceKey - second segment of the query key, e.g. 'categories'.
 * @param apiPath - base REST path, e.g. '/api/categories'.
 */
function useNameList<T>(resourceKey: string, apiPath: string) {
  return useQuery({
    queryKey: ['admin', resourceKey],
    queryFn: () => apiGet<T[]>(apiPath),
  });
}

/** Fetches only the active rows of a name-list resource (for dropdowns/forms). */
function useActiveNameList<T>(resourceKey: string, apiPath: string) {
  return useQuery({
    queryKey: ['admin', resourceKey, 'active'],
    queryFn: () => apiGet<T[]>(`${apiPath}/active`),
  });
}

/**
 * Creates a name-list row. Invalidates the resource's list query plus any
 * `extraInvalidateKeys` (e.g. companions also invalidate ['trips'] — BUG-51).
 */
function useCreateNameListItem<T>(
  resourceKey: string,
  apiPath: string,
  extraInvalidateKeys: readonly (readonly unknown[])[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiPost<T>(apiPath, { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', resourceKey] });
      for (const key of extraInvalidateKeys) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** Updates a name-list row's name or active status. Same invalidation shape as create. */
function useUpdateNameListItem<T>(
  resourceKey: string,
  apiPath: string,
  extraInvalidateKeys: readonly (readonly unknown[])[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; is_active?: boolean } }) =>
      apiPatch<T>(`${apiPath}/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', resourceKey] });
      for (const key of extraInvalidateKeys) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** Soft-deletes (deactivates) a name-list row. Same invalidation shape as create. */
function useDeleteNameListItem(
  resourceKey: string,
  apiPath: string,
  extraInvalidateKeys: readonly (readonly unknown[])[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`${apiPath}/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', resourceKey] });
      for (const key of extraInvalidateKeys) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

// ============================================================
// CATEGORIES
// ============================================================

/**
 * Fetches all trip categories (active + inactive) for the Admin panel.
 * @returns React Query result containing Category[].
 */
export function useCategories() {
  return useNameList<Category>('categories', '/api/categories');
}

/**
 * Fetches only active trip categories (for trip creation/edit forms).
 * @returns React Query result containing Category[].
 */
export function useActiveCategories() {
  return useActiveNameList<Category>('categories', '/api/categories');
}

/** Creates a category. Invalidates both category queries on success. */
export function useCreateCategory() {
  return useCreateNameListItem<Category>('categories', '/api/categories');
}

/** Updates a category name or active status. Invalidates category queries. */
export function useUpdateCategory() {
  return useUpdateNameListItem<Category>('categories', '/api/categories');
}

/** Soft-deletes (deactivates) a category. Invalidates category queries. */
export function useDeleteCategory() {
  return useDeleteNameListItem('categories', '/api/categories');
}

// ============================================================
// ACTIVITIES
// ============================================================

/** Fetches all activities (active + inactive). */
export function useActivities() {
  return useNameList<Activity>('activities', '/api/activities');
}

/** Fetches only active activities (for dropdowns). */
export function useActiveActivities() {
  return useActiveNameList<Activity>('activities', '/api/activities');
}

/** Creates an activity. */
export function useCreateActivity() {
  return useCreateNameListItem<Activity>('activities', '/api/activities');
}

/** Updates an activity name or active status. */
export function useUpdateActivity() {
  return useUpdateNameListItem<Activity>('activities', '/api/activities');
}

/** Soft-deletes an activity. */
export function useDeleteActivity() {
  return useDeleteNameListItem('activities', '/api/activities');
}

// ============================================================
// COMPANIONS
// ============================================================

/**
 * Fetches all companions (active + inactive) owned by the caller.
 * BRD-AD08 / ADL-28: companions moved off /api/admin/companions (owner-only) to
 * /api/companions (requireAuth, userId-scoped) — same response shape, per-user data.
 */
export function useCompanions() {
  return useNameList<Companion>('companions', '/api/companions');
}

/** Fetches only active companions (for dropdowns), owned by the caller. */
export function useActiveCompanions() {
  return useActiveNameList<Companion>('companions', '/api/companions');
}

// BUG-51: trips embed the companion's name via a live LEFT JOIN, not a
// denormalised copy — a fresh ['trips'] query would keep serving the
// pre-mutation name until something else forced a refetch. Every companion
// mutation below also invalidates ['trips'] for that reason.
const COMPANION_EXTRA_INVALIDATE_KEYS = [['trips']] as const;

/** Creates a companion, owned by the caller. */
export function useCreateCompanion() {
  return useCreateNameListItem<Companion>(
    'companions',
    '/api/companions',
    COMPANION_EXTRA_INVALIDATE_KEYS,
  );
}

/** Updates a companion name or active status. 404 if owned by a different user. */
export function useUpdateCompanion() {
  return useUpdateNameListItem<Companion>(
    'companions',
    '/api/companions',
    COMPANION_EXTRA_INVALIDATE_KEYS,
  );
}

/** Soft-deletes a companion. 404 if owned by a different user. */
export function useDeleteCompanion() {
  return useDeleteNameListItem('companions', '/api/companions', COMPANION_EXTRA_INVALIDATE_KEYS);
}

// ============================================================
// COUNTRIES
// ============================================================

/**
 * Fetches all 250 countries for the Admin → Countries tab.
 * @returns React Query result containing Country[].
 */
export function useCountries() {
  return useQuery({
    queryKey: ['admin', 'countries'],
    queryFn: () => apiGet<Country[]>('/api/admin/countries'),
    // Countries are stable — long stale time
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Fetches the regions for a single country (GET /api/admin/countries/:countryCode/regions).
 * Used by AddPlaceFlow to show the region dropdown when region_tier_enabled.
 *
 * @param countryCode - ISO 3166-1 alpha-2 code. Pass undefined to disable the query.
 * @returns React Query result containing Region[].
 */
export function useCountryRegions(countryCode: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'countries', countryCode, 'regions'],
    queryFn: () =>
      apiGet<import('../types/api').Region[]>(`/api/admin/countries/${countryCode}/regions`),
    enabled: countryCode !== undefined && countryCode !== '',
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Updates a country's region tier settings.
 * PATCH /api/admin/countries/:countryCode
 *
 * @returns useMutation result. Call mutateAsync({ countryCode, data }) to submit.
 */
export function useUpdateCountry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      countryCode,
      data,
    }: {
      countryCode: string;
      data: { region_tier_enabled?: boolean; region_tier_label?: string | null };
    }) => apiPatch<Country>(`/api/admin/countries/${countryCode}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'countries'] });
      // Region tier changes may affect map shading
      void qc.invalidateQueries({ queryKey: ['map', 'shading'] });
    },
  });
}

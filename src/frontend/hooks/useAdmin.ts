/**
 * React Query hooks for all admin endpoints.
 *
 * Covers categories, activities, companions, and countries.
 * All three list types (categories, activities, companions) share the same
 * CRUD pattern, so helper factories are used to reduce duplication.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Activity, Category, Companion, Country } from '../types/api';
import { apiDelete, apiGet, apiPatch, apiPost } from '../utils/apiClient';

// ============================================================
// CATEGORIES
// ============================================================

/**
 * Fetches all trip categories (active + inactive) for the Admin panel.
 * @returns React Query result containing Category[].
 */
export function useCategories() {
  return useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => apiGet<Category[]>('/api/admin/categories'),
  });
}

/**
 * Fetches only active trip categories (for trip creation/edit forms).
 * @returns React Query result containing Category[].
 */
export function useActiveCategories() {
  return useQuery({
    queryKey: ['admin', 'categories', 'active'],
    queryFn: () => apiGet<Category[]>('/api/admin/categories/active'),
  });
}

/** Creates a category. Invalidates both category queries on success. */
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiPost<Category>('/api/admin/categories', { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
    },
  });
}

/** Updates a category name or active status. Invalidates category queries. */
export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; is_active?: boolean } }) =>
      apiPatch<Category>(`/api/admin/categories/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
    },
  });
}

/** Soft-deletes (deactivates) a category. Invalidates category queries. */
export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/admin/categories/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
    },
  });
}

// ============================================================
// ACTIVITIES
// ============================================================

/** Fetches all activities (active + inactive). */
export function useActivities() {
  return useQuery({
    queryKey: ['admin', 'activities'],
    queryFn: () => apiGet<Activity[]>('/api/admin/activities'),
  });
}

/** Fetches only active activities (for dropdowns). */
export function useActiveActivities() {
  return useQuery({
    queryKey: ['admin', 'activities', 'active'],
    queryFn: () => apiGet<Activity[]>('/api/admin/activities/active'),
  });
}

/** Creates an activity. */
export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiPost<Activity>('/api/admin/activities', { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'activities'] });
    },
  });
}

/** Updates an activity name or active status. */
export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; is_active?: boolean } }) =>
      apiPatch<Activity>(`/api/admin/activities/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'activities'] });
    },
  });
}

/** Soft-deletes an activity. */
export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/admin/activities/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'activities'] });
    },
  });
}

// ============================================================
// COMPANIONS
// ============================================================

/** Fetches all companions (active + inactive). */
export function useCompanions() {
  return useQuery({
    queryKey: ['admin', 'companions'],
    queryFn: () => apiGet<Companion[]>('/api/admin/companions'),
  });
}

/** Fetches only active companions (for dropdowns). */
export function useActiveCompanions() {
  return useQuery({
    queryKey: ['admin', 'companions', 'active'],
    queryFn: () => apiGet<Companion[]>('/api/admin/companions/active'),
  });
}

/** Creates a companion. */
export function useCreateCompanion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiPost<Companion>('/api/admin/companions', { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'companions'] });
    },
  });
}

/** Updates a companion name or active status. */
export function useUpdateCompanion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; is_active?: boolean } }) =>
      apiPatch<Companion>(`/api/admin/companions/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'companions'] });
    },
  });
}

/** Soft-deletes a companion. */
export function useDeleteCompanion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/admin/companions/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'companions'] });
    },
  });
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

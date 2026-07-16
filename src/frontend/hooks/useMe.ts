/**
 * React Query hook for the identity endpoint (GET /api/me).
 *
 * BUG-26 / SE-02: exposes the authenticated user's { id, email, isOwner }
 * so the UI can gate owner-only surfaces (Admin nav link, /admin route).
 *
 * The backend enforces admin access with requireOwner regardless — this hook
 * is presentation-layer gating only. While the query is loading, callers must
 * treat the user as non-owner (default hidden — no flash of the admin link).
 */
import { useQuery } from '@tanstack/react-query';
import type { Me } from '../types/api';
import { apiGet } from '../utils/apiClient';

/**
 * Fetches the authenticated user's identity.
 * @returns React Query result containing Me ({ id, email, isOwner }).
 */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<Me>('/api/me'),
    // Identity is stable for a session — avoid refetch churn on window focus.
    staleTime: 5 * 60 * 1000,
  });
}

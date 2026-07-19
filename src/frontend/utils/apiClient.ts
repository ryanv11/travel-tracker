/**
 * Centralised API client for Travel Tracker.
 *
 * All fetch() calls in the application must go through this module.
 * This ensures VITE_API_BASE_URL is applied consistently and error handling
 * is uniform across all hooks and components.
 *
 * NR-14: Auth token injection — call setTokenGetter() once on app mount with
 * Clerk's getToken function. All subsequent API calls will include the bearer token.
 *
 * Never call fetch() directly in a component or hook — always use these helpers.
 */

/** Base URL for all API requests. Pulled from the Vite environment variable. */
const BASE = import.meta.env.VITE_API_BASE_URL as string;

/**
 * Error thrown by all apiClient helpers on a 4xx/5xx response (BUG-29).
 *
 * Extends Error so existing `instanceof Error` / `.message` handling keeps
 * working, while exposing the HTTP `status` and parsed response `body` so
 * callers can branch on specific statuses (e.g. the geocode retry queue
 * removing a city on 404).
 */
export class ApiError extends Error {
  /** HTTP status code of the failed response (e.g. 404). */
  readonly status: number;
  /** Parsed JSON response body, or undefined if the body was not valid JSON. */
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Holds the Clerk getToken function once initialised. */
let _getToken: (() => Promise<string | null>) | null = null;

/**
 * Registers the Clerk token getter with the API client.
 * Call this once from a component that has access to the Clerk useAuth hook.
 *
 * @param getToken - Clerk's getToken function from useAuth().
 */
export function setTokenGetter(getToken: () => Promise<string | null>): void {
  _getToken = getToken;
}

/**
 * Returns the Authorization header object if a token is available, or empty object.
 */
async function authHeaders(): Promise<Record<string, string>> {
  if (!_getToken) return {};
  const token = await _getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Builds an ApiError from a failed API response (status >= 400).
 * The message prefers the response body's `error` field, falling back to a
 * generic `HTTP <status>` string; the status and parsed body are carried on
 * the ApiError so callers can branch on them.
 *
 * @param response - The fetch Response object (status >= 400).
 * @returns A Promise resolving to an ApiError ready to be thrown.
 */
async function buildApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  let message = `HTTP ${response.status}`;
  try {
    body = await response.json();
    const error = (body as { error?: string }).error;
    if (error) message = error;
  } catch {
    // Non-JSON body — keep the generic message
  }
  return new ApiError(message, response.status, body);
}

/**
 * Sends a GET request to the given API path and returns the parsed JSON body.
 *
 * @param path - API path relative to VITE_API_BASE_URL (e.g. '/api/trips').
 * @returns A Promise resolving to the parsed response body typed as T.
 * @throws ApiError if the response status is 4xx or 5xx.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE}${path}`, { headers });
  if (!response.ok) {
    throw await buildApiError(response);
  }
  return response.json() as Promise<T>;
}

/**
 * Sends a POST request with a JSON body and returns the parsed response.
 *
 * @param path - API path relative to VITE_API_BASE_URL.
 * @param body - Request payload — will be JSON-serialised.
 * @returns A Promise resolving to the parsed response body typed as T.
 * @throws ApiError if the response status is 4xx or 5xx.
 */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const auth = await authHeaders();
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await buildApiError(response);
  }
  return response.json() as Promise<T>;
}

/**
 * Sends a PATCH request with a JSON body and returns the parsed response.
 *
 * @param path - API path relative to VITE_API_BASE_URL.
 * @param body - Partial update payload — will be JSON-serialised.
 * @returns A Promise resolving to the parsed response body typed as T.
 * @throws ApiError if the response status is 4xx or 5xx.
 */
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const auth = await authHeaders();
  const response = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await buildApiError(response);
  }
  return response.json() as Promise<T>;
}

/**
 * Sends a DELETE request to the given API path.
 * Returns void — DELETE responses have no body (204 No Content).
 *
 * @param path - API path relative to VITE_API_BASE_URL.
 * @throws ApiError if the response status is 4xx or 5xx.
 */
export async function apiDelete(path: string): Promise<void> {
  const auth = await authHeaders();
  const response = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: auth });
  if (!response.ok) {
    throw await buildApiError(response);
  }
}

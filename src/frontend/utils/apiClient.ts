/**
 * Centralised API client for Travel Tracker.
 *
 * All fetch() calls in the application must go through this module.
 * This ensures VITE_API_BASE_URL is applied consistently and error handling
 * is uniform across all hooks and components.
 *
 * Never call fetch() directly in a component or hook — always use these helpers.
 */

/** Base URL for all API requests. Pulled from the Vite environment variable. */
const BASE = import.meta.env.VITE_API_BASE_URL as string;

/**
 * Extracts a human-readable error message from an API error response.
 * Prefers the response body's `error` field; falls back to a generic message.
 *
 * @param response - The fetch Response object (status >= 400).
 * @returns A Promise resolving to an error message string.
 */
async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Sends a GET request to the given API path and returns the parsed JSON body.
 *
 * @param path - API path relative to VITE_API_BASE_URL (e.g. '/api/trips').
 * @returns A Promise resolving to the parsed response body typed as T.
 * @throws Error if the response status is 4xx or 5xx.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

/**
 * Sends a POST request with a JSON body and returns the parsed response.
 *
 * @param path - API path relative to VITE_API_BASE_URL.
 * @param body - Request payload — will be JSON-serialised.
 * @returns A Promise resolving to the parsed response body typed as T.
 * @throws Error if the response status is 4xx or 5xx.
 */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

/**
 * Sends a PATCH request with a JSON body and returns the parsed response.
 *
 * @param path - API path relative to VITE_API_BASE_URL.
 * @param body - Partial update payload — will be JSON-serialised.
 * @returns A Promise resolving to the parsed response body typed as T.
 * @throws Error if the response status is 4xx or 5xx.
 */
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

/**
 * Sends a DELETE request to the given API path.
 * Returns void — DELETE responses have no body (204 No Content).
 *
 * @param path - API path relative to VITE_API_BASE_URL.
 * @throws Error if the response status is 4xx or 5xx.
 */
export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }
}

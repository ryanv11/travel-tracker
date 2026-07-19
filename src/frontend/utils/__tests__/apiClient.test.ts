/**
 * Unit tests for the apiClient ApiError behaviour (BUG-29).
 *
 * All helpers must throw ApiError (an Error subclass) carrying the HTTP
 * status and parsed body on 4xx/5xx responses, so callers — e.g. the geocode
 * retry queue's 404 handling — can branch on status. Previously plain Error
 * objects were thrown with no .status, making such branches unreachable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from '../apiClient';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiClient error handling', () => {
  it('apiGet throws ApiError with status and body on 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'City not found' }));

    let thrown: unknown;
    try {
      await apiGet('/api/cities/999');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toBeInstanceOf(Error); // existing instanceof Error handling keeps working
    const apiErr = thrown as ApiError;
    expect(apiErr.status).toBe(404);
    expect(apiErr.message).toBe('City not found');
    expect(apiErr.body).toEqual({ error: 'City not found' });
  });

  it('falls back to a generic HTTP message when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('gateway timeout', { status: 504 }));

    await expect(apiGet('/api/trips')).rejects.toMatchObject({
      name: 'ApiError',
      status: 504,
      message: 'HTTP 504',
    });
  });

  it('falls back to a generic HTTP message when the body has no error field', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { detail: 'boom' }));

    await expect(apiGet('/api/trips')).rejects.toMatchObject({
      status: 500,
      message: 'HTTP 500',
      body: { detail: 'boom' },
    });
  });

  it('apiPost, apiPatch and apiDelete throw ApiError on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: 'Forbidden' }));
    await expect(apiPost('/api/cities', {})).rejects.toBeInstanceOf(ApiError);

    fetchMock.mockResolvedValue(jsonResponse(403, { error: 'Forbidden' }));
    await expect(apiPatch('/api/cities/1', {})).rejects.toMatchObject({ status: 403 });

    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));
    await expect(apiDelete('/api/trips/1')).rejects.toMatchObject({ status: 401 });
  });

  it('apiGet returns parsed JSON on success (no ApiError)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1, geocode_status: 'resolved' }));

    await expect(apiGet('/api/cities/1')).resolves.toEqual({
      id: 1,
      geocode_status: 'resolved',
    });
  });
});

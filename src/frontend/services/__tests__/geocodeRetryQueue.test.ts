/**
 * Unit tests for geocodeRetryQueue (BUG-29).
 *
 * Verifies the queue's outcome handling for the injected poll function:
 *   - ApiError(404) → entry removed permanently (city was deleted).
 *     This branch was previously unreachable because apiClient threw plain
 *     Error objects with no .status — deleted cities were retried forever.
 *   - geocode_status 'resolved' → entry removed
 *   - geocode_status still 'pending' → attempt count advances on the
 *     progressive backoff schedule
 *   - other errors (network) → entry retained, attempt count NOT advanced
 *   - queue state persists to localStorage
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../utils/apiClient';
import { GEOCODE_RETRY_STORAGE_KEY, geocodeRetryQueue } from '../geocodeRetryQueue';

const CITY = { id: 42, name: 'Dublin', country_code: 'IE' };

function storedQueue(): unknown[] {
  const raw = localStorage.getItem(GEOCODE_RETRY_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as unknown[]) : [];
}

/** Flushes pending microtasks without advancing fake timers. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('geocodeRetryQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    geocodeRetryQueue.dismiss(); // reset singleton state between tests
  });

  afterEach(() => {
    geocodeRetryQueue.dismiss(); // clear any timers scheduled during the test
    vi.useRealTimers();
  });

  it('removes the entry permanently when the poll throws ApiError 404 (city deleted)', async () => {
    const pollFn = vi
      .fn<(cityId: number) => Promise<{ geocode_status: string }>>()
      .mockRejectedValue(new ApiError('City not found', 404, { error: 'City not found' }));
    geocodeRetryQueue.init(pollFn);

    geocodeRetryQueue.add(CITY);
    expect(geocodeRetryQueue.getQueue()).toHaveLength(1);

    // Fire the immediate first attempt
    await vi.advanceTimersByTimeAsync(0);

    expect(pollFn).toHaveBeenCalledTimes(1);
    expect(pollFn).toHaveBeenCalledWith(42);
    expect(geocodeRetryQueue.getQueue()).toHaveLength(0);
    expect(storedQueue()).toHaveLength(0);

    // No further polls — the entry is gone for good
    await vi.advanceTimersByTimeAsync(600_000);
    expect(pollFn).toHaveBeenCalledTimes(1);
  });

  it('removes the entry when the poll reports geocode_status resolved', async () => {
    const pollFn = vi
      .fn<(cityId: number) => Promise<{ geocode_status: string }>>()
      .mockResolvedValue({ geocode_status: 'resolved' });
    geocodeRetryQueue.init(pollFn);

    geocodeRetryQueue.add(CITY);
    await vi.advanceTimersByTimeAsync(0);

    expect(pollFn).toHaveBeenCalledTimes(1);
    expect(geocodeRetryQueue.getQueue()).toHaveLength(0);
    expect(storedQueue()).toHaveLength(0);
  });

  it('advances the backoff schedule while the poll reports pending', async () => {
    const pollFn = vi
      .fn<(cityId: number) => Promise<{ geocode_status: string }>>()
      .mockResolvedValue({ geocode_status: 'pending' });
    geocodeRetryQueue.init(pollFn);

    geocodeRetryQueue.add(CITY);

    // Attempt 1 (immediate) → still pending → attemptCount 1, next in 30s
    await vi.advanceTimersByTimeAsync(0);
    expect(pollFn).toHaveBeenCalledTimes(1);
    expect(geocodeRetryQueue.getQueue()[0].attemptCount).toBe(1);

    // Attempt 2 after 30s → attemptCount 2, next in 2min
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pollFn).toHaveBeenCalledTimes(2);
    expect(geocodeRetryQueue.getQueue()[0].attemptCount).toBe(2);

    // Nothing fires before the 2min mark
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pollFn).toHaveBeenCalledTimes(2);
  });

  it('retains the entry without advancing the counter on a non-404 error', async () => {
    const pollFn = vi
      .fn<(cityId: number) => Promise<{ geocode_status: string }>>()
      .mockRejectedValue(new Error('Failed to fetch'));
    geocodeRetryQueue.init(pollFn);

    // Drive the attempt directly (retryAll cancels the pending timer first)
    // rather than advancing the clock — a failed first attempt reschedules at
    // delay 0, which would re-fire inside advanceTimersByTimeAsync(0).
    geocodeRetryQueue.add(CITY);
    geocodeRetryQueue.retryAll();
    await flushMicrotasks();

    expect(pollFn).toHaveBeenCalledTimes(1);
    const [entry] = geocodeRetryQueue.getQueue();
    expect(entry).toBeDefined();
    expect(entry.cityId).toBe('42');
    expect(entry.attemptCount).toBe(0); // counter not advanced on network error
  });

  it('retains the entry on a non-404 ApiError (e.g. 500)', async () => {
    const pollFn = vi
      .fn<(cityId: number) => Promise<{ geocode_status: string }>>()
      .mockRejectedValue(new ApiError('Internal error', 500));
    geocodeRetryQueue.init(pollFn);

    geocodeRetryQueue.add(CITY);
    geocodeRetryQueue.retryAll();
    await flushMicrotasks();

    expect(pollFn).toHaveBeenCalledTimes(1);
    expect(geocodeRetryQueue.getQueue()).toHaveLength(1);
  });
});

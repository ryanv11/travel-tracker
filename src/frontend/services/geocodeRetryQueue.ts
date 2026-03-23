/**
 * geocodeRetryQueue — NR-06 offline retry service for city geocoding.
 *
 * Tracks cities that were created with geocode_status = 'pending' and retries
 * resolution on a progressive backoff schedule. State survives page reloads via
 * localStorage under the key 'geocode_retry_queue'.
 *
 * Retry schedule (Class A — background):
 *   Attempt 1: immediately
 *   Attempt 2: 30 seconds
 *   Attempt 3: 2 minutes
 *   Attempt 4: 5 minutes
 *   Attempt 5+: 10 minutes (holds indefinitely)
 *
 * The only ways to remove an entry from the queue are:
 *   (a) Successful geocode (geocode_status === 'resolved')
 *   (b) City record deleted (404 response on retry)
 *   (c) User explicitly dismisses via dismiss()
 */

export const GEOCODE_RETRY_STORAGE_KEY = 'geocode_retry_queue';

/** Shape of a single retry queue entry (matches NR-06 spec). */
export interface RetryQueueEntry {
  cityId: string;
  cityName: string;
  countryCode: string;
  attemptCount: number;
  nextRetryAt: string; // ISO 8601
}

/** Function type for the actual geocode retry call. */
type RetryFn = (cityId: number) => Promise<{ geocode_status: string }>;

/** Listener called whenever the queue changes. */
type QueueListener = (queue: RetryQueueEntry[]) => void;

/** Progressive delay per attempt index (ms). Index 0 = attempt 1. */
const RETRY_DELAYS_MS = [
  0, // Attempt 1: immediately on failure
  30_000, // Attempt 2: 30 seconds
  120_000, // Attempt 3: 2 minutes
  300_000, // Attempt 4: 5 minutes
  600_000, // Attempt 5+: 10 minutes
];

function getDelayMs(attemptCount: number): number {
  const idx = Math.min(attemptCount, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[idx];
}

class GeocodeRetryQueueService {
  private queue: RetryQueueEntry[] = [];
  private listeners = new Set<QueueListener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private retryFn: RetryFn | null = null;
  private initialised = false;

  /** Load persisted queue and start scheduling. Must be called once on app init. */
  init(fn: RetryFn): void {
    this.retryFn = fn;
    if (!this.initialised) {
      this.initialised = true;
      this.loadFromStorage();
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(GEOCODE_RETRY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RetryQueueEntry[];
        this.queue = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      this.queue = [];
    }
    this.scheduleAll();
  }

  private saveToStorage(): void {
    localStorage.setItem(GEOCODE_RETRY_STORAGE_KEY, JSON.stringify(this.queue));
  }

  private notify(): void {
    const snapshot = [...this.queue];
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  /** Subscribe to queue changes. Returns an unsubscribe function. */
  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getQueue(): RetryQueueEntry[] {
    return [...this.queue];
  }

  /** Add a city with pending geocode status to the retry queue. */
  add(city: { id: number; name: string; country_code: string }): void {
    const cityId = String(city.id);
    if (this.queue.some((e) => e.cityId === cityId)) return; // already tracked

    const entry: RetryQueueEntry = {
      cityId,
      cityName: city.name,
      countryCode: city.country_code,
      attemptCount: 0,
      nextRetryAt: new Date().toISOString(), // attempt immediately
    };
    this.queue.push(entry);
    this.saveToStorage();
    this.notify();
    this.scheduleEntry(entry);
  }

  private scheduleEntry(entry: RetryQueueEntry): void {
    const { cityId, nextRetryAt } = entry;

    // Cancel any existing timer for this city
    const existing = this.timers.get(cityId);
    if (existing !== undefined) clearTimeout(existing);

    const delay = Math.max(0, new Date(nextRetryAt).getTime() - Date.now());
    const timer = setTimeout(() => {
      void this.attemptRetry(cityId);
    }, delay);
    this.timers.set(cityId, timer);
  }

  private scheduleAll(): void {
    for (const entry of this.queue) {
      this.scheduleEntry(entry);
    }
  }

  private async attemptRetry(cityId: string): Promise<void> {
    if (!this.retryFn) return;

    const entry = this.queue.find((e) => e.cityId === cityId);
    if (!entry) return;

    try {
      const result = await this.retryFn(parseInt(cityId, 10));

      if (result.geocode_status === 'resolved') {
        // (a) Geocoding resolved — remove from queue
        this.removeEntry(cityId);
      } else {
        // Still pending — advance schedule
        this.advanceSchedule(cityId, entry.attemptCount + 1);
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        // (b) City deleted — discard silently
        this.removeEntry(cityId);
      } else {
        // Network error — retry at next scheduled time (don't advance counter)
        this.advanceSchedule(cityId, entry.attemptCount);
      }
    }
  }

  private removeEntry(cityId: string): void {
    const timer = this.timers.get(cityId);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(cityId);
    this.queue = this.queue.filter((e) => e.cityId !== cityId);
    this.saveToStorage();
    this.notify();
  }

  private advanceSchedule(cityId: string, newAttemptCount: number): void {
    const delay = getDelayMs(newAttemptCount);
    const nextRetryAt = new Date(Date.now() + delay).toISOString();
    this.queue = this.queue.map((e) =>
      e.cityId === cityId ? { ...e, attemptCount: newAttemptCount, nextRetryAt } : e,
    );
    this.saveToStorage();
    this.notify();

    const updated = this.queue.find((e) => e.cityId === cityId);
    if (updated) this.scheduleEntry(updated);
  }

  /** Force immediate retry of all queued entries (e.g. user clicked the indicator). */
  retryAll(): void {
    for (const entry of [...this.queue]) {
      const existing = this.timers.get(entry.cityId);
      if (existing !== undefined) clearTimeout(existing);
      this.timers.delete(entry.cityId);
      void this.attemptRetry(entry.cityId);
    }
  }

  /** Clear the queue entirely (user dismissed the indicator). */
  dismiss(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.queue = [];
    this.saveToStorage();
    this.notify();
  }
}

/** Singleton service instance — initialised in App.tsx via useGeocodeRetryQueue. */
export const geocodeRetryQueue = new GeocodeRetryQueueService();

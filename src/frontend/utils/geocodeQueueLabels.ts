/**
 * geocodeQueueLabels — GE-19 / ADL-55 §4 (BUG-85) frontend-owned display copy
 * and bucketing for the geocode-status indicator.
 *
 * The backend emits stable machine codes `(geocode_status, geocode_cause)`;
 * the *frontend* owns the plain-language wording so copy edits never need a
 * backend deploy (ADL-55 D4). Both functions here are pure and table-testable
 * — they are the unit under test for acceptance criteria 9 (every
 * (status,cause) pair renders its correct label) and 10 (needs-attention rows
 * are bucketed apart from the resolving count, never conflated).
 */
import type { GeocodeCause, GeocodeQueueEntry, GeocodeStatus } from '../types/api';

/**
 * Maps a `(geocode_status, geocode_cause)` pair to its plain-language label
 * (ADL-55 §4 — the exact table the API reference documents). Every pair the
 * endpoint can emit has a defined label; a `resolved` row never appears in the
 * queue, so it falls through to the generic needs-attention wording rather than
 * throwing (defensive — the endpoint excludes `resolved` by construction).
 *
 * @param status - The city's geocode status from the queue endpoint.
 * @param cause  - The companion cause discriminator (may be null).
 * @returns The user-facing label string for this pair.
 */
export function geocodeQueueLabel(status: GeocodeStatus, cause: GeocodeCause): string {
  // `unresolvable` is a definitive "no match" regardless of cause (ADL-55 §4).
  if (status === 'unresolvable') return 'Not found';

  if (status === 'pending') {
    // A recoverable failure whose next retry is still scheduled server-side.
    if (cause === 'unreachable') return "Couldn't reach the geocoder — retrying";
    // Fresh / actively resolving.
    return 'Resolving…';
  }

  if (status === 'needs_attention') {
    if (cause === 'ambiguous') return 'Needs region — multiple matches';
    if (cause === 'unreachable') return "Gave up — couldn't reach the geocoder";
    // Backfilled rows whose historical cause is unknown (cause === null).
    return "Couldn't be resolved — needs attention";
  }

  // `resolved` (never returned by the queue) or any future status — generic.
  return "Couldn't be resolved — needs attention";
}

/**
 * True when a queue row belongs in the "needs attention" bucket — a terminal
 * state the user must act on (`needs_attention` or `unresolvable`) — rather
 * than the actively-resolving bucket (`pending`).
 *
 * This is the exact split BRD GE-19 mandates: a stuck city is "not conflated in
 * the same silent count" as cities actively resolving.
 *
 * @param status - A queue row's geocode status.
 * @returns Whether the row is a needs-attention (terminal) row.
 */
export function isNeedsAttentionStatus(status: GeocodeStatus): boolean {
  return status === 'needs_attention' || status === 'unresolvable';
}

/** The two buckets the indicator splits its queue into (ADL-55 §4). */
export interface GeocodeQueueBuckets {
  /** Actively resolving / retrying — `geocode_status === 'pending'`. */
  resolving: GeocodeQueueEntry[];
  /** Terminal, user-actionable — `needs_attention` or `unresolvable`. */
  needsAttention: GeocodeQueueEntry[];
}

/**
 * Splits the queue into resolving vs needs-attention buckets on
 * `geocode_status` (criterion 10). A `needs_attention`/`unresolvable` row is
 * NEVER counted in the resolving bucket, so the indicator's "resolving" number
 * is `resolving.length` alone — the two counts are structurally separate, not a
 * shared silent total.
 *
 * @param entries - The full queue as returned by `GET /api/geocode-queue`.
 * @returns The entries partitioned into `resolving` and `needsAttention`.
 */
export function bucketGeocodeQueue(entries: GeocodeQueueEntry[]): GeocodeQueueBuckets {
  const resolving: GeocodeQueueEntry[] = [];
  const needsAttention: GeocodeQueueEntry[] = [];
  for (const entry of entries) {
    if (isNeedsAttentionStatus(entry.geocode_status)) {
      needsAttention.push(entry);
    } else {
      // Everything not terminal is treated as resolving (pending, and any
      // non-terminal future status) — but never a needs-attention row.
      resolving.push(entry);
    }
  }
  return { resolving, needsAttention };
}

/**
 * Unit tests for the GE-19 / ADL-55 §4 (BUG-85) geocode-queue label + bucket
 * helpers — the pure logic behind acceptance criteria 9 and 10.
 *
 *   - Criterion 9: `geocodeQueueLabel` returns the exact §4 string for EVERY
 *     (geocode_status, geocode_cause) combination the endpoint can emit.
 *   - Criterion 10: `bucketGeocodeQueue` / `isNeedsAttentionStatus` place a
 *     needs_attention / unresolvable row in the needs-attention bucket and
 *     NEVER in the resolving count (the two counts are structurally separate).
 *
 * Source: src/frontend/utils/geocodeQueueLabels.ts (label table = ADL-55 §4).
 */
import { describe, expect, it } from 'vitest';
import type { GeocodeCause, GeocodeQueueEntry, GeocodeStatus } from '../../types/api.js';
import {
  bucketGeocodeQueue,
  geocodeQueueLabel,
  isNeedsAttentionStatus,
} from '../geocodeQueueLabels.js';

/** Builds a queue entry fixture with sensible defaults. */
function entry(
  id: number,
  geocode_status: GeocodeStatus,
  geocode_cause: GeocodeCause,
): GeocodeQueueEntry {
  return {
    id,
    name: `City${id}`,
    country_code: 'US',
    region_id: null,
    region_name: null,
    region_iso: null,
    geocode_status,
    geocode_cause,
  };
}

describe('geocodeQueueLabel — ADL-55 §4 label map (criterion 9)', () => {
  // The full §4 table: every (status, cause) pair the endpoint can emit.
  const cases: Array<[GeocodeStatus, GeocodeCause, string]> = [
    ['pending', null, 'Resolving…'],
    ['pending', 'unreachable', "Couldn't reach the geocoder — retrying"],
    ['needs_attention', 'ambiguous', 'Needs region — multiple matches'],
    ['needs_attention', 'unreachable', "Gave up — couldn't reach the geocoder"],
    ['needs_attention', null, "Couldn't be resolved — needs attention"],
    ['unresolvable', null, 'Not found'],
    // `unresolvable` maps to "Not found" for ANY cause value (§4: "(any)").
    ['unresolvable', 'ambiguous', 'Not found'],
    ['unresolvable', 'unreachable', 'Not found'],
  ];

  it.each(cases)('(%s, %s) → "%s"', (status, cause, expected) => {
    expect(geocodeQueueLabel(status, cause)).toBe(expected);
  });

  it('covers every (status, cause) combination the queue can emit', () => {
    // Guard against a future status/cause slipping through unlabelled: every
    // combination must yield a non-empty string.
    const statuses: GeocodeStatus[] = ['pending', 'needs_attention', 'unresolvable'];
    const causes: GeocodeCause[] = ['ambiguous', 'unreachable', null];
    for (const s of statuses) {
      for (const c of causes) {
        expect(geocodeQueueLabel(s, c)).toBeTruthy();
      }
    }
  });
});

describe('isNeedsAttentionStatus (criterion 10 split)', () => {
  it('treats needs_attention and unresolvable as needs-attention', () => {
    expect(isNeedsAttentionStatus('needs_attention')).toBe(true);
    expect(isNeedsAttentionStatus('unresolvable')).toBe(true);
  });

  it('treats pending as NOT needs-attention (it is resolving)', () => {
    expect(isNeedsAttentionStatus('pending')).toBe(false);
  });
});

describe('bucketGeocodeQueue — resolving vs needs-attention (criterion 10)', () => {
  it('never counts a needs_attention / unresolvable row in the resolving bucket', () => {
    const entries = [
      entry(1, 'pending', null),
      entry(2, 'pending', 'unreachable'),
      entry(3, 'needs_attention', 'ambiguous'),
      entry(4, 'needs_attention', 'unreachable'),
      entry(5, 'needs_attention', null),
      entry(6, 'unresolvable', null),
    ];

    const { resolving, needsAttention } = bucketGeocodeQueue(entries);

    // Resolving = the two pending rows only.
    expect(resolving.map((e) => e.id)).toEqual([1, 2]);
    // Needs-attention = the two needs_attention rows + the unresolvable row.
    expect(needsAttention.map((e) => e.id)).toEqual([3, 4, 5, 6]);
    // The counts are structurally separate — a needs-attention row is not in
    // the resolving total (BRD "not conflated in the same silent count").
    expect(resolving.length).toBe(2);
    expect(needsAttention.length).toBe(4);
    // Every input row lands in exactly one bucket.
    expect(resolving.length + needsAttention.length).toBe(entries.length);
  });

  it('returns two empty buckets for an empty queue', () => {
    const { resolving, needsAttention } = bucketGeocodeQueue([]);
    expect(resolving).toEqual([]);
    expect(needsAttention).toEqual([]);
  });
});

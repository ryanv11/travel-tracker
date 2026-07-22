/**
 * Unit tests for the WP-02 badge hue lookup (spec §4).
 *
 * These prove the primitive works in isolation (success criterion 4 — "a unit
 * test asserting the color map"). They do not touch StatusBadge.tsx; that wiring
 * is Phase 2.
 */
import { describe, expect, it } from 'vitest';
import {
  BADGE_HUE_CLASSES,
  BADGE_LABELS,
  itemStatusToBadgeHue,
  tripStatusToBadgeHue,
} from '../badges';

describe('BADGE_HUE_CLASSES', () => {
  it('defines all 8 hues from spec §1 with a bg + text class pair', () => {
    const hues = [
      'planning',
      'active',
      'review',
      'locked',
      'confirmed',
      'completed',
      'cancelled',
      'category',
    ] as const;
    expect(Object.keys(BADGE_HUE_CLASSES).sort()).toEqual([...hues].sort());
    for (const hue of hues) {
      expect(BADGE_HUE_CLASSES[hue].bg).toMatch(/^bg-wp-/);
      expect(BADGE_HUE_CLASSES[hue].text).toMatch(/^text-wp-/);
    }
  });
});

describe('tripStatusToBadgeHue', () => {
  it('maps every trip status to its spec §1 hue', () => {
    expect(tripStatusToBadgeHue('planning')).toBe('planning');
    expect(tripStatusToBadgeHue('active')).toBe('active');
    expect(tripStatusToBadgeHue('review_pending')).toBe('review');
    expect(tripStatusToBadgeHue('locked')).toBe('locked');
  });
});

describe('itemStatusToBadgeHue', () => {
  it('maps consider to the shared "locked" hue (hue 80)', () => {
    expect(itemStatusToBadgeHue('consider')).toBe('locked');
  });

  it('maps confirmed and completed to two DISTINCT hues, per the 2026-07-21 fix', () => {
    expect(itemStatusToBadgeHue('confirmed')).toBe('confirmed'); // hue 150 (green)
    expect(itemStatusToBadgeHue('completed')).toBe('completed'); // hue 220 (blue)
    expect(itemStatusToBadgeHue('confirmed')).not.toBe(itemStatusToBadgeHue('completed'));
  });

  it('maps cancelled to its own hue (hue 25)', () => {
    expect(itemStatusToBadgeHue('cancelled')).toBe('cancelled');
  });

  it('returns null for next_time — the spec table does not define a hue for it', () => {
    expect(itemStatusToBadgeHue('next_time')).toBeNull();
  });
});

describe('BADGE_LABELS', () => {
  it('renders every label as upper-case content, per spec §4', () => {
    for (const label of Object.values(BADGE_LABELS)) {
      expect(label).toBe(label.toUpperCase());
    }
  });

  it('labels completed as DONE, not COMPLETED, per the spec STATUS_META table', () => {
    expect(BADGE_LABELS.completed).toBe('DONE');
  });
});

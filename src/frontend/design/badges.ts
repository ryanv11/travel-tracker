/**
 * Waypoint badge hue lookup (WP-02/WP-03 spec §4, BRD §5.16).
 *
 * WIRED (WP-03/WP-04, GitHub #205) — this is now consumed by `StatusBadge.tsx`.
 *
 * Source: spec §1 "Status / category hues" table + §4 "Status & category badges —
 * component spec". Eight hues total, keyed here by a semantic variant name (not by
 * the raw TripStatus/ItemStatus string) because two different status enums share a
 * hue in the spec (Trip "Locked" and item "Consider" both use hue 80).
 *
 * Confirmed vs Completed (2026-07-21, COO/PO resolution): the mockup's own
 * `STATUS_META` gave both the identical hue-150 pair, differing only in label text —
 * that under-specified the real status model (the mockup predates "completed" as a
 * distinct state). This module now keeps them as two separate hues: Confirmed stays
 * hue 150 (green), Completed moves to hue 220 (blue). See the spec's "Resolution —
 * Confirmed vs Completed" note for the full rationale.
 */
import type { ItemStatus, TripStatus } from '../types/api';

/** One of the 8 hue families defined in spec §1 (Confirmed and Completed are now distinct). */
export type BadgeHue =
  | 'planning'
  | 'active'
  | 'review'
  | 'locked'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'category';

/**
 * Tailwind v4 utility class pair (bg + text) for a given hue, generated from the
 * `--color-wp-status-*` / `--color-wp-category-*` tokens declared in
 * `src/frontend/theme-waypoint.css`. Consumers apply both classes together.
 */
export interface BadgeHueClasses {
  bg: string;
  text: string;
}

/** Hue → Tailwind utility class pair, per spec §1's exact bg/text oklch pairs. */
export const BADGE_HUE_CLASSES: Record<BadgeHue, BadgeHueClasses> = {
  planning: { bg: 'bg-wp-status-planning-bg', text: 'text-wp-status-planning-text' },
  active: { bg: 'bg-wp-status-active-bg', text: 'text-wp-status-active-text' },
  review: { bg: 'bg-wp-status-review-bg', text: 'text-wp-status-review-text' },
  locked: { bg: 'bg-wp-status-locked-bg', text: 'text-wp-status-locked-text' },
  confirmed: { bg: 'bg-wp-status-confirmed-bg', text: 'text-wp-status-confirmed-text' },
  completed: { bg: 'bg-wp-status-completed-bg', text: 'text-wp-status-completed-text' },
  cancelled: { bg: 'bg-wp-status-cancelled-bg', text: 'text-wp-status-cancelled-text' },
  category: { bg: 'bg-wp-category-bg', text: 'text-wp-category-text' },
};

/**
 * Badge shape recipe (spec §1 "Badge shape note" + §4). Pill = trip-detail header
 * meta row / most status badges. Chip = trip-list-card category/place chips
 * (rounded-rect, not a pill — same hue can render as either shape by context).
 */
export const BADGE_SHAPE_CLASSES = {
  pill: 'rounded-full px-3 py-[5px]', // ~20px radius, 5px/12-13px padding
  chip: 'rounded-[7px] px-2.5 py-1', // 7-8px radius, 3-4px/9-10px padding
} as const;

/** Badge text styling (spec §4): Manrope 700, 11-11.5px, uppercase, letter-spaced. */
export const BADGE_TEXT_CLASSES =
  'font-ui font-bold text-[11.5px] uppercase tracking-[0.25px] whitespace-nowrap';

/**
 * Maps a `TripStatus` to its badge hue per spec §1. Every TripStatus value has a
 * defined hue — no gaps.
 *
 * @param status - Trip status value.
 * @returns The badge hue for this status.
 */
export function tripStatusToBadgeHue(status: TripStatus): BadgeHue {
  switch (status) {
    case 'planning':
      return 'planning';
    case 'active':
      return 'active';
    case 'review_pending':
      return 'review';
    case 'locked':
      return 'locked';
  }
}

/**
 * Maps an `ItemStatus` to its badge hue per spec §1.
 *
 * Confirmed vs Completed (fixed WP-03/WP-04, 2026-07-21): these are now two
 * distinct hues — Confirmed stays hue 150 (green), Completed moves to hue 220
 * (blue) — per the spec's explicit "Resolution — Confirmed vs Completed" note.
 * This module previously (Phase 1) collapsed both to hue 150 per the mockup's
 * literal `STATUS_META` table; that was the documented bug this brief fixes.
 *
 * CARRIED SPEC GAP (unresolved, not introduced or fixed by this brief): the
 * spec's hue table (§1) still does not define a hue for `'next_time'` — only
 * consider/confirmed/completed/cancelled are covered. Returns `null` for
 * `'next_time'` until COO/UX resolves this gap; `StatusBadge.tsx` falls back to
 * a neutral treatment when this returns null rather than silently picking a hue.
 *
 * @param status - Item status value.
 * @returns The badge hue for this status, or `null` if the spec doesn't define one.
 */
export function itemStatusToBadgeHue(status: ItemStatus): BadgeHue | null {
  switch (status) {
    case 'consider':
      return 'locked'; // hue 80, shared with trip status "Locked" per spec §1
    case 'confirmed':
      return 'confirmed'; // hue 150 (green)
    case 'completed':
      return 'completed'; // hue 220 (blue) — fixed, was incorrectly 'confirmed' in Phase 1
    case 'cancelled':
      return 'cancelled';
    case 'next_time':
      return null; // CARRIED SPEC GAP — see doc comment above
  }
}

/**
 * Uppercase label text for a badge, per spec §4 ("label text is always upper-case
 * content"). `completed` renders as "DONE" per the spec's `STATUS_META` table, not
 * "COMPLETED" — an explicit, deliberate label choice, not a truncation.
 */
export const BADGE_LABELS: Record<TripStatus | ItemStatus, string> = {
  planning: 'PLANNING',
  active: 'ACTIVE',
  review_pending: 'REVIEW',
  locked: 'LOCKED',
  consider: 'CONSIDER',
  confirmed: 'CONFIRMED',
  completed: 'DONE',
  cancelled: 'CANCELLED',
  next_time: 'NEXT TIME', // SPEC GAP — see itemStatusToBadgeHue doc comment
};

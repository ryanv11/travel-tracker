/**
 * Waypoint badge hue lookup (WP-02 spec §4, BRD §5.16).
 *
 * PHASE 1 ONLY — this is reusable badge-variant logic, defined but not yet wired
 * into `StatusBadge.tsx`'s actual `COLOR_CLASSES`/rendering. Wiring it in is Phase 2
 * (spec "Scope and non-goals" — applying the new hue system to only some badges
 * while StatusBadge keeps its old teal/amber/violet classes would be a worse,
 * half-migrated state than either system alone).
 *
 * Source: spec §1 "Status / category hues" table + §4 "Status & category badges —
 * component spec". Seven hues total, keyed here by a semantic variant name (not by
 * the raw TripStatus/ItemStatus string) because two different status enums share a
 * hue in the spec (Trip "Locked" and item "Consider" both use hue 80; item
 * "Confirmed" and "Completed" both use hue 150, differing only in label text).
 */
import type { ItemStatus, TripStatus } from '../types/api';

/** One of the 7 hue families defined in spec §1. */
export type BadgeHue =
  | 'planning'
  | 'active'
  | 'review'
  | 'locked'
  | 'confirmed'
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
 * SPEC GAP: the spec's hue table (§1) does not define a hue for `'next_time'` —
 * only consider/confirmed/completed/cancelled are covered (consider shares
 * trip-status Locked's neutral hue 80; confirmed and completed share hue 150).
 * Returns `null` for `'next_time'` until COO/UX resolves this gap; callers must
 * handle the null case (e.g. by falling back to the current, pre-Waypoint
 * class in `StatusBadge.tsx` — not this module's concern in Phase 1, since this
 * module isn't wired into StatusBadge yet).
 *
 * @param status - Item status value.
 * @returns The badge hue for this status, or `null` if the spec doesn't define one.
 */
export function itemStatusToBadgeHue(status: ItemStatus): BadgeHue | null {
  switch (status) {
    case 'consider':
      return 'locked'; // hue 80, shared with trip status "Locked" per spec §1
    case 'confirmed':
    case 'completed':
      return 'confirmed'; // hue 150, shared per spec §1's explicit note
    case 'cancelled':
      return 'cancelled';
    case 'next_time':
      return null; // SPEC GAP — see doc comment above
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

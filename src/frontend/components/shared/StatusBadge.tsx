import {
  BADGE_HUE_CLASSES,
  BADGE_LABELS,
  BADGE_SHAPE_CLASSES,
  BADGE_TEXT_CLASSES,
  itemStatusToBadgeHue,
  tripStatusToBadgeHue,
} from '../../design/badges';
import type { ItemStatus, TripStatus } from '../../types/api';

interface StatusBadgeProps {
  /** The status value to display. Accepts both trip and item status strings. */
  status: TripStatus | ItemStatus;
  /**
   * Badge shape (spec §1 "Badge shape note" / §4). 'pill' is the default and covers
   * every status-badge context (trip cards, trip-detail header, item rows). 'chip'
   * is for the rounded-rect category/place-name chip context on trip list cards —
   * StatusBadge itself is never rendered as a category chip, but the shape token
   * lives here so callers rendering their own hue-255 category/place chips reuse
   * the same recipe instead of hand-rolling class strings.
   */
  shape?: 'pill' | 'chip';
}

/** Trip status values, used to disambiguate which lookup table to consult. */
const TRIP_STATUSES: readonly TripStatus[] = ['planning', 'active', 'review_pending', 'locked'];

function isTripStatus(status: TripStatus | ItemStatus): status is TripStatus {
  return (TRIP_STATUSES as readonly string[]).includes(status);
}

/**
 * Renders a Waypoint-styled status pill (WP-02/WP-03 spec §4, BRD §5.16).
 *
 * Hue is resolved via `src/frontend/design/badges.ts` — trip statuses always
 * resolve to a hue; item statuses fall back to a neutral treatment for
 * `next_time`, which the spec's hue table does not define (carried spec gap,
 * see `itemStatusToBadgeHue`'s doc comment — not resolved by this component).
 *
 * @param status - The status value to render.
 * @param shape - 'pill' (default) or 'chip' — see prop doc above.
 */
export function StatusBadge({ status, shape = 'pill' }: StatusBadgeProps) {
  const hue = isTripStatus(status)
    ? tripStatusToBadgeHue(status)
    : itemStatusToBadgeHue(status as ItemStatus);

  // Carried spec gap fallback: 'next_time' has no defined hue yet. Use the
  // neutral 'locked' hue family rather than inventing a new one ourselves.
  const classes = hue ? BADGE_HUE_CLASSES[hue] : BADGE_HUE_CLASSES.locked;
  const label = BADGE_LABELS[status] ?? status;

  return (
    <span
      className={`inline-block whitespace-nowrap ${classes.bg} ${classes.text} ${BADGE_SHAPE_CLASSES[shape]} ${BADGE_TEXT_CLASSES}`}
    >
      {label}
    </span>
  );
}

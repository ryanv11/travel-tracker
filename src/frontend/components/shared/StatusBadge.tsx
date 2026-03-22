import type { ItemStatus, TripStatus } from '../../types/api';

interface StatusBadgeProps {
  /** The status value to display. Accepts both trip and item status strings. */
  status: TripStatus | ItemStatus;
}

/** Maps status values to human-readable labels. */
const LABELS: Record<TripStatus | ItemStatus, string> = {
  // Trip statuses
  planning: 'Planning',
  active: 'Active',
  review_pending: 'Review',
  locked: 'Locked',
  // Item statuses
  consider: 'Consider',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  next_time: 'Next Time',
};

/** Maps status values to Tailwind class combinations. */
const COLOR_CLASSES: Record<TripStatus | ItemStatus, string> = {
  planning: 'bg-teal-100 text-teal-900',
  active: 'bg-amber-100 text-amber-800',
  review_pending: 'bg-amber-100 text-amber-600',
  locked: 'bg-gray-100 text-gray-700',
  consider: 'bg-indigo-100 text-indigo-800',
  confirmed: 'bg-green-100 text-green-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
  next_time: 'bg-yellow-100 text-amber-800',
};

/**
 * Renders a coloured pill badge for a given trip or item status.
 *
 * @param status - The status value to render.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap ${COLOR_CLASSES[status] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}

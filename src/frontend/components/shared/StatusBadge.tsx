/**
 * StatusBadge — displays a trip or item status with colour coding.
 *
 * Trip status colours:
 *   planning → blue
 *   active → green
 *   review_pending → orange
 *   locked → grey
 */
import React from 'react';
import type { TripStatus, ItemStatus } from '../../types/api';

interface StatusBadgeProps {
  /** The status value to display. Accepts both trip and item status strings. */
  status: TripStatus | ItemStatus;
}

/** Maps status values to human-readable labels. */
const LABELS: Record<TripStatus | ItemStatus, string> = {
  // Trip statuses
  planning: 'Planning',
  active: 'Active',
  review_pending: 'Review Pending',
  locked: 'Locked',
  // Item statuses
  consider: 'Consider',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  next_time: 'Next Time',
};

/** Maps status values to CSS colour tokens. */
const COLORS: Record<TripStatus | ItemStatus, React.CSSProperties> = {
  planning: { backgroundColor: '#DBEAFE', color: '#1E40AF' },
  active: { backgroundColor: '#DCFCE7', color: '#166534' },
  review_pending: { backgroundColor: '#FFEDD5', color: '#9A3412' },
  locked: { backgroundColor: '#F3F4F6', color: '#374151' },
  consider: { backgroundColor: '#E0E7FF', color: '#3730A3' },
  confirmed: { backgroundColor: '#DCFCE7', color: '#166534' },
  completed: { backgroundColor: '#D1FAE5', color: '#065F46' },
  cancelled: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  next_time: { backgroundColor: '#FEF3C7', color: '#92400E' },
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: '9999px',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.025em',
  whiteSpace: 'nowrap',
};

/**
 * Renders a coloured pill badge for a given trip or item status.
 *
 * @param status - The status value to render.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span style={{ ...badgeStyle, ...COLORS[status] }}>
      {LABELS[status] ?? status}
    </span>
  );
}

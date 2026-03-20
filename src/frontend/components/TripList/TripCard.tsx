/**
 * TripCard — summary card for a single trip in the trips left-panel list.
 *
 * Shows: name, date range, status badge, companion list, categories,
 *        place name badges (D-06).
 * Actions: click to navigate to TripDetail (relative URL for nested route),
 *          Edit button to open edit form.
 * SEC-12: photo_album_ref is handled by sanitiseUrl before rendering.
 *
 * FEAT-BD: In selection mode, shows a checkbox. Locked trips cannot be
 *          selected (checkbox disabled, card visually muted).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../shared/StatusBadge';
import { formatDate } from '../../utils/formatDate';
import type { TripSummary } from '../../types/api';

interface TripCardProps {
  /** The trip to display. */
  trip: TripSummary;
  /** Called when the Edit button is clicked. */
  onEdit: (trip: TripSummary) => void;
  /** Whether this card is the currently selected trip in the two-panel layout. */
  isSelected?: boolean;
  /** Whether the list is in multi-select delete mode. */
  selectionMode?: boolean;
  /** Whether this card is checked in selection mode. */
  isChecked?: boolean;
  /** Called when the checkbox state changes. */
  onCheckChange?: (id: number, checked: boolean) => void;
}

/** Maximum number of place badges to show before truncating (D-06). */
const MAX_PLACE_BADGES = 4;

/**
 * Renders a single trip card with name, dates, status, companions,
 * categories, and place badges (D-06).
 *
 * @param trip - The trip data to render.
 * @param onEdit - Callback when the Edit button is clicked.
 * @param isSelected - Highlights the card when it is the active trip.
 * @param selectionMode - When true, shows a checkbox instead of navigation.
 * @param isChecked - Whether the checkbox is checked.
 * @param onCheckChange - Callback when checkbox changes.
 */
export function TripCard({
  trip,
  onEdit,
  isSelected = false,
  selectionMode = false,
  isChecked = false,
  onCheckChange,
}: TripCardProps) {
  const navigate = useNavigate();

  const places = trip.places ?? [];
  const visiblePlaces = places.slice(0, MAX_PLACE_BADGES);
  const extraCount = places.length - MAX_PLACE_BADGES;
  const isLocked = trip.status === 'locked';

  // In selection mode, locked trips are visually muted and non-selectable
  const cardClass = [
    'bg-white border rounded-lg p-3 transition-shadow',
    selectionMode
      ? isLocked
        ? 'opacity-50 cursor-default'
        : 'cursor-pointer hover:shadow-md'
      : 'cursor-pointer hover:shadow-md',
    isSelected && !selectionMode ? 'border-teal-500 ring-1 ring-teal-500' : 'border-gray-200',
    selectionMode && isChecked && !isLocked ? 'border-teal-400 ring-1 ring-teal-400' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    if (selectionMode) {
      if (!isLocked && onCheckChange) {
        onCheckChange(trip.id, !isChecked);
      }
      return;
    }
    navigate(String(trip.id));
  };

  return (
    <div
      className={cardClass}
      onClick={handleClick}
      onMouseEnter={(e) => {
        if (!isSelected && !selectionMode) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected && !selectionMode) (e.currentTarget as HTMLDivElement).style.boxShadow = '';
      }}
    >
      {/* Header row: checkbox (selection mode) or name + status + edit */}
      <div className="flex justify-between items-start gap-2">
        {selectionMode && (
          <div className="flex-shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={isLocked}
              onChange={(e) => {
                if (onCheckChange) onCheckChange(trip.id, e.target.checked);
              }}
              aria-label={`Select trip ${trip.name}`}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:opacity-40"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{trip.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusBadge status={trip.status} />
        </div>
      </div>

      {/* D-06: Place name badges */}
      {places.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {visiblePlaces.map((p) => (
            <span
              key={p.id}
              className="inline-block px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
            >
              {p.city.name}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
              +{extraCount} more
            </span>
          )}
        </div>
      )}

      {/* Categories */}
      {trip.categories.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {trip.categories.map((cat) => (
            <span key={cat.id} className="inline-block px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-800">
              {cat.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * TripCard — summary card for a single trip in the trips left-panel list.
 *
 * Shows: name, date range, status badge, companion list, categories,
 *        place name badges (D-06).
 * Actions: click to navigate to TripDetail (relative URL for nested route),
 *          Edit button to open edit form.
 * SEC-12: photo_album_ref is handled by sanitiseUrl before rendering.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../shared/StatusBadge';
import { sanitiseUrl } from '../../utils/urlSanitiser';
import { formatDate } from '../../utils/formatDate';
import type { TripSummary } from '../../types/api';

interface TripCardProps {
  /** The trip to display. */
  trip: TripSummary;
  /** Called when the Edit button is clicked. */
  onEdit: (trip: TripSummary) => void;
  /** Whether this card is the currently selected trip in the two-panel layout. */
  isSelected?: boolean;
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
 */
export function TripCard({ trip, onEdit, isSelected = false }: TripCardProps) {
  const navigate = useNavigate();
  const safeUrl = sanitiseUrl(trip.photo_album_ref);

  const places = trip.places ?? [];
  const visiblePlaces = places.slice(0, MAX_PLACE_BADGES);
  const extraCount = places.length - MAX_PLACE_BADGES;

  const cardClass = [
    'bg-white border rounded-lg p-3 cursor-pointer transition-shadow hover:shadow-md',
    isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200',
  ].join(' ');

  return (
    <div
      className={cardClass}
      onClick={() => navigate(String(trip.id))}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.boxShadow = '';
      }}
    >
      {/* Header row: name + status + edit */}
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{trip.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusBadge status={trip.status} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(trip);
            }}
            className="px-2.5 py-0.5 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50 text-gray-600"
          >
            Edit
          </button>
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

      {/* Companions */}
      {trip.companions.length > 0 && (
        <div className="mt-1.5 text-xs text-gray-500">
          With: {trip.companions.map((c) => c.name).join(', ')}
        </div>
      )}

      {/* Categories */}
      {trip.categories.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {trip.categories.map((cat) => (
            <span key={cat.id} className="inline-block px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
              {cat.name}
            </span>
          ))}
        </div>
      )}

      {/* Photo album link — SEC-12 */}
      {safeUrl && (
        <div className="mt-1.5 text-xs">
          <a href={safeUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            📷 Photo album
          </a>
        </div>
      )}
      {trip.photo_album_ref && !safeUrl && (
        <div className="mt-1.5 text-xs text-gray-500">
          Photo ref: {trip.photo_album_ref}
        </div>
      )}
    </div>
  );
}

/**
 * TripCard — summary card for a single trip in the trips list.
 *
 * Shows: name, date range, status badge, companion list, categories.
 * Actions: click to navigate to TripDetail, Edit button to open edit form.
 * SEC-12: photo_album_ref is handled by sanitiseUrl before rendering.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../shared/StatusBadge';
import { sanitiseUrl } from '../../utils/urlSanitiser';
import type { TripSummary } from '../../types/api';

interface TripCardProps {
  /** The trip to display. */
  trip: TripSummary;
  /** Called when the Edit button is clicked. */
  onEdit: (trip: TripSummary) => void;
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E5E7EB',
  borderRadius: '8px',
  padding: '16px',
  cursor: 'pointer',
  transition: 'box-shadow 0.15s',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
};

const tagStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  background: '#F3F4F6',
  color: '#374151',
  marginRight: '4px',
  marginTop: '4px',
};

/**
 * Formats a YYYY-MM-DD date to a readable string (e.g. "1 Jun 2026").
 */
function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Renders a single trip card with name, dates, status, companions and categories.
 *
 * @param trip - The trip data to render.
 * @param onEdit - Callback when the Edit button is clicked.
 */
export function TripCard({ trip, onEdit }: TripCardProps) {
  const navigate = useNavigate();
  const safeUrl = sanitiseUrl(trip.photo_album_ref);

  return (
    <div
      style={cardStyle}
      onClick={() => navigate(`/trips/${trip.id}`)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      <div style={headerStyle}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{trip.name}</h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6B7280' }}>
            {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <StatusBadge status={trip.status} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(trip);
            }}
            style={{
              padding: '4px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '5px',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Edit
          </button>
        </div>
      </div>

      {/* Companions */}
      {trip.companions.length > 0 && (
        <div style={{ marginTop: '10px', fontSize: '13px', color: '#4B5563' }}>
          With: {trip.companions.map((c) => c.name).join(', ')}
        </div>
      )}

      {/* Categories */}
      {trip.categories.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          {trip.categories.map((cat) => (
            <span key={cat.id} style={tagStyle}>{cat.name}</span>
          ))}
        </div>
      )}

      {/* Photo album link — SEC-12: only rendered if scheme is https:// or file:// */}
      {safeUrl && (
        <div style={{ marginTop: '8px', fontSize: '12px' }}>
          <a href={safeUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            📷 Photo album
          </a>
        </div>
      )}
      {/* If photo_album_ref exists but sanitiseUrl returns null, render as plain text */}
      {trip.photo_album_ref && !safeUrl && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#6B7280' }}>
          Photo ref: {trip.photo_album_ref}
        </div>
      )}
    </div>
  );
}

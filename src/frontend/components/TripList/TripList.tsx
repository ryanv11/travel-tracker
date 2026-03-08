/**
 * TripList — the main trips page content area.
 *
 * Renders the list of TripCards with status/category/activity filters (TR-10)
 * and a "New Trip" button that opens the trip form modal.
 */
import React, { useState } from 'react';
import { useTrips, type TripFilters, type TripFormData } from '../../hooks/useTrips';
import { useActiveCategories, useActiveActivities } from '../../hooks/useAdmin';
import { TripCard } from './TripCard';
import { TripForm } from '../TripDetail/TripForm';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import type { TripSummary, TripStatus } from '../../types/api';

const STATUS_OPTIONS: { value: TripStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'review_pending', label: 'Review Pending' },
  { value: 'locked', label: 'Locked' },
];

const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
  marginBottom: '20px',
  alignItems: 'center',
};

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '14px',
  background: '#fff',
};

/**
 * Renders the full trip list with filters and a create-trip button.
 */
export function TripList() {
  const [filters, setFilters] = useState<TripFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripSummary | null>(null);

  const { data: trips, isLoading, error } = useTrips(filters);
  const { data: categories = [] } = useActiveCategories();
  const { data: activities = [] } = useActiveActivities();

  const handleEdit = (trip: TripSummary) => {
    setEditingTrip(trip);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingTrip(null);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>Trips</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            padding: '9px 18px',
            background: '#2563EB',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          + New Trip
        </button>
      </div>

      {/* Filters (TR-10) */}
      <div style={filterBarStyle}>
        <select
          style={selectStyle}
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              status: e.target.value ? (e.target.value as TripStatus) : undefined,
            }))
          }
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          style={selectStyle}
          value={filters.category_id ?? ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              category_id: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
          aria-label="Filter by category"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          style={selectStyle}
          value={filters.activity_id ?? ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              activity_id: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
          aria-label="Filter by activity"
        >
          <option value="">All Activities</option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Content states */}
      {isLoading && <LoadingSpinner message="Loading trips…" />}
      {error && <ErrorMessage error={error} />}

      {trips && trips.length === 0 && (
        <p style={{ color: '#6B7280', textAlign: 'center', padding: '40px' }}>
          No trips found. Create one with "New Trip".
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {trips?.map((trip) => (
          <TripCard key={trip.id} trip={trip} onEdit={handleEdit} />
        ))}
      </div>

      {/* Create / Edit form modal */}
      {showForm && (
        <TripForm
          existingTrip={editingTrip ?? undefined}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}

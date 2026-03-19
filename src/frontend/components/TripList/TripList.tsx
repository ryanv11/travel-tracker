/**
 * TripList — the main trips page content area.
 *
 * Renders the list of TripCards with:
 *   - Server-side filters: status, category, activity (TR-10)
 *   - Client-side search by trip name (TR-09)
 *   - Client-side sort by date or name (TR-09)
 *   - URL-param map filters: ?country=XX, ?region=XX-YY, ?city=NNN (MP-03, GE-09)
 */
import React, { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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

type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date_desc', label: 'Newest First' },
  { value: 'date_asc', label: 'Oldest First' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
];

const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
  marginBottom: '12px',
  alignItems: 'center',
};

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '14px',
  background: '#fff',
};

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '14px',
  background: '#fff',
  minWidth: '180px',
};

/**
 * Applies client-side search text and sort to an array of trip summaries.
 * Exported for unit testing.
 */
export function filterAndSortTrips(
  trips: TripSummary[],
  searchText: string,
  sortBy: SortOption,
  countryFilter: string | null,
  regionFilter: string | null,
  cityFilter: number | null,
): TripSummary[] {
  let result = trips;

  // Map filter: city takes priority, then region (uses country), then country
  if (cityFilter !== null) {
    result = result.filter((t) => t.places.some((p) => p.city_id === cityFilter));
  } else if (countryFilter !== null) {
    result = result.filter((t) =>
      t.places.some((p) => p.city.country_code === countryFilter),
    );
  }

  // Search by name
  if (searchText.trim()) {
    const q = searchText.trim().toLowerCase();
    result = result.filter((t) => t.name.toLowerCase().includes(q));
  }

  // Sort
  result = [...result].sort((a, b) => {
    if (sortBy === 'date_desc') return b.start_date.localeCompare(a.start_date);
    if (sortBy === 'date_asc') return a.start_date.localeCompare(b.start_date);
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
    if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
    return 0;
  });

  return result;
}

/**
 * Renders the full trip list with filters and a create-trip button.
 */
export function TripList() {
  const [filters, setFilters] = useState<TripFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripSummary | null>(null);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Map filter params from URL (set by clicking map layers)
  const countryFilter = searchParams.get('country');
  const regionFilter = searchParams.get('region');
  const cityFilter = searchParams.get('city') ? Number(searchParams.get('city')) : null;

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

  const clearMapFilter = () => {
    navigate('/trips', { replace: true });
  };

  const displayedTrips = useMemo(
    () => filterAndSortTrips(trips ?? [], searchText, sortBy, countryFilter, regionFilter, cityFilter),
    [trips, searchText, sortBy, countryFilter, regionFilter, cityFilter],
  );

  // Derive city name for display when city filter is active
  const cityName = useMemo(() => {
    if (cityFilter === null) return null;
    for (const trip of trips ?? []) {
      for (const place of trip.places) {
        if (place.city_id === cityFilter) return place.city.name;
      }
    }
    return String(cityFilter);
  }, [trips, cityFilter]);

  // Build a human-readable map filter label
  const mapFilterLabel = useMemo(() => {
    if (cityFilter !== null) return `City: ${cityName ?? cityFilter}`;
    if (regionFilter) return `Region: ${regionFilter}`;
    if (countryFilter) return `Country: ${countryFilter}`;
    return null;
  }, [cityFilter, regionFilter, countryFilter, cityName]);

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

      {/* Map filter badge — shown when navigated from map (MP-03, GE-09) */}
      {mapFilterLabel && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          marginBottom: '12px', padding: '5px 10px',
          background: '#EFF6FF', border: '1px solid #BFDBFE',
          borderRadius: '6px', fontSize: '13px', color: '#1D4ED8',
        }}>
          <span>Map filter: {mapFilterLabel}</span>
          <button
            type="button"
            onClick={clearMapFilter}
            aria-label="Clear map filter"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#1D4ED8', fontSize: '16px', lineHeight: 1, padding: '0 2px',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Search and sort row */}
      <div style={{ ...filterBarStyle, marginBottom: '10px' }}>
        <input
          type="search"
          placeholder="Search by name…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={inputStyle}
          aria-label="Search trips by name"
        />
        <select
          style={selectStyle}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          aria-label="Sort trips"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
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

      {!isLoading && !error && displayedTrips.length === 0 && (
        <p style={{ color: '#6B7280', textAlign: 'center', padding: '40px' }}>
          {trips && trips.length > 0
            ? 'No trips match the current filters.'
            : 'No trips found. Create one with "New Trip".'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {displayedTrips.map((trip) => (
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

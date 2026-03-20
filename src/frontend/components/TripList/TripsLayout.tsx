/**
 * TripsLayout — two-panel shell for the /trips route tree (TR-11, F-01).
 *
 * Left panel: fixed 360px, contains trip list with search, status filters,
 *             and trip cards (D-05 count badge, D-06 place badges).
 * Right panel: fills remaining width via <Outlet /> — shows TripDetail or
 *              an empty-state prompt when no trip is selected.
 *
 * URL-encoded trip selection: navigating to /trips/:id updates the Outlet;
 * back-button and bookmarks work out of the box.
 */
import React, { useMemo, useState } from 'react';
import { Outlet, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useTrips, type TripFilters, type TripFormData } from '../../hooks/useTrips';
import { useActiveCategories, useActiveActivities } from '../../hooks/useAdmin';
import { TripCard } from './TripCard';
import { TripForm } from '../TripDetail/TripForm';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { filterAndSortTrips } from './TripList';
import type { TripSummary, TripStatus } from '../../types/api';

/** Status chip definitions for F-07 */
const STATUS_CHIPS: { value: TripStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'review_pending', label: 'Review' },
  { value: 'locked', label: 'Locked' },
];

type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';

/**
 * Two-panel trips layout shell.
 * Left panel owns the trip list; right panel is the <Outlet />.
 */
export function TripsLayout() {
  const [filters, setFilters] = useState<TripFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripSummary | null>(null);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { id: selectedId } = useParams<{ id?: string }>();

  // Map filter params from URL (set by clicking map layers)
  const countryFilter = searchParams.get('country');
  const regionFilter = searchParams.get('region');
  const cityFilter = searchParams.get('city') ? Number(searchParams.get('city')) : null;

  const { data: trips, isLoading, error } = useTrips(filters);

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

  const mapFilterLabel = useMemo(() => {
    if (cityFilter !== null) return `City: ${cityName ?? cityFilter}`;
    if (regionFilter) return `Region: ${regionFilter}`;
    if (countryFilter) return `Country: ${countryFilter}`;
    return null;
  }, [cityFilter, regionFilter, countryFilter, cityName]);

  const tripCount = displayedTrips.length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — fixed 360px, scrollable */}
      <div className="w-[360px] flex-shrink-0 flex flex-col h-full border-r border-gray-200 bg-white overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          {/* D-05: trip count badge */}
          <h2 className="text-base font-bold text-gray-900">
            Trips
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {tripCount}
            </span>
          </h2>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors"
          >
            + New
          </button>
        </div>

        {/* F-06: Search field */}
        <div className="px-4 pb-2 flex-shrink-0">
          <input
            type="search"
            placeholder="Search trips…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="Search trips by name"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* F-07: Status filter chips */}
        <div className="px-4 pb-2 flex-shrink-0 flex flex-wrap gap-1.5">
          {STATUS_CHIPS.map((chip) => {
            const isActive = (filters.status ?? '') === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    status: chip.value ? (chip.value as TripStatus) : undefined,
                  }))
                }
                className={
                  isActive
                    ? 'px-2.5 py-1 rounded-full text-xs font-medium bg-blue-600 text-white border border-blue-600'
                    : 'px-2.5 py-1 rounded-full text-xs font-medium bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                }
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* TR-09: Sort control */}
        <div className="px-4 pb-2 flex-shrink-0">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort trips"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
          </select>
        </div>

        {/* Map filter badge */}
        {mapFilterLabel && (
          <div className="px-4 pb-2 flex-shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700">
              Map filter: {mapFilterLabel}
              <button
                type="button"
                onClick={clearMapFilter}
                aria-label="Clear map filter"
                className="text-blue-700 hover:text-blue-900 text-base leading-none"
              >
                ×
              </button>
            </span>
          </div>
        )}

        {/* Trip list — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
          {isLoading && <LoadingSpinner message="Loading trips…" />}
          {error && <ErrorMessage error={error} />}

          {!isLoading && !error && displayedTrips.length === 0 && (
            <p className="text-gray-500 text-center py-10 text-sm">
              {trips && trips.length > 0
                ? 'No trips match the current filters.'
                : 'No trips yet. Create one with "+ New".'}
            </p>
          )}

          {displayedTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onEdit={handleEdit}
              isSelected={selectedId === String(trip.id)}
            />
          ))}
        </div>
      </div>

      {/* Right panel — fills remaining width, scrollable */}
      <div className="flex-1 h-full overflow-y-auto bg-gray-50">
        <Outlet />
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

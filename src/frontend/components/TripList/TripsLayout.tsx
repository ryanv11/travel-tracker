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
 *
 * FEAT-BD: Multi-select delete mode. A "Select" toggle enters selection mode;
 *          a bulk action bar shows selected count, "Select all", and red "Delete".
 *          Locked trips cannot be selected. Confirmation via window.confirm before
 *          sequential DELETE /api/trips/:id calls.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useActiveActivities, useActiveCategories } from '../../hooks/useAdmin';
import { type TripFilters, type TripFormData, useDeleteTrip, useTrips } from '../../hooks/useTrips';
import type { TripStatus, TripSummary } from '../../types/api';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { TripForm } from '../TripDetail/TripForm';
import { TripCard } from './TripCard';
import { filterAndSortTrips } from './TripList';

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

  // FEAT-BD: Multi-select delete state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    ids: Set<number>;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { id: selectedId } = useParams<{ id?: string }>();

  // Map filter params from URL (set by clicking map layers)
  const countryFilter = searchParams.get('country');
  const regionFilter = searchParams.get('region');
  const cityFilter = searchParams.get('city') ? Number(searchParams.get('city')) : null;

  const { data: trips, isLoading, error } = useTrips(filters);
  const { data: allTrips = [] } = useTrips(); // no filters — for counts only
  const deleteTrip = useDeleteTrip();

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
    () =>
      filterAndSortTrips(trips ?? [], searchText, sortBy, countryFilter, regionFilter, cityFilter),
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

  // NTH-03: Per-status counts for filter chips
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of allTrips) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    return counts;
  }, [allTrips]);

  // FEAT-BD: Selectable trips are those that are not locked
  const selectableTrips = useMemo(
    () => displayedTrips.filter((t) => t.status !== 'locked'),
    [displayedTrips],
  );

  // FEAT-BD: Enter / exit selection mode
  const enterSelectionMode = () => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // FEAT-BD: Checkbox toggle handler
  const handleCheckChange = useCallback((id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  // FEAT-BD: Select all (only selectable / non-locked trips)
  const handleSelectAll = () => {
    setSelectedIds(new Set(selectableTrips.map((t) => t.id)));
  };

  // FEAT-BD / NTH-01: Bulk delete with 5-second undo window
  const handleBulkDelete = () => {
    const count = selectedIds.size;
    if (count === 0) return;

    const confirmed = window.confirm(
      `Delete ${count} trip${count === 1 ? '' : 's'}? This cannot be undone.`,
    );
    if (!confirmed) return;

    // Snapshot the selected IDs before exiting selection mode
    const ids = new Set(selectedIds);

    const timer = setTimeout(() => {
      setIsDeleting(true);
      void (async () => {
        try {
          for (const id of ids) {
            await deleteTrip.mutateAsync(id);
          }
          // If the currently viewed trip was deleted, navigate away
          if (selectedId && ids.has(Number(selectedId))) {
            navigate('/trips', { replace: true });
          }
        } catch (err) {
          alert(
            `Some trips could not be deleted: ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          setIsDeleting(false);
          setPendingDelete(null);
        }
      })();
    }, 5000);

    setPendingDelete({ ids, timer });
    exitSelectionMode();
  };

  // NTH-01: Undo bulk delete
  const handleUndoDelete = () => {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timer);
    setPendingDelete(null);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — fixed 360px, scrollable */}
      <div className="w-[320px] flex-shrink-0 flex flex-col h-full border-r border-gray-200 bg-white overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          {/* D-05: trip count badge */}
          <h2 className="text-base font-bold text-gray-900">
            My Trips
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-500">
              {tripCount}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {selectionMode ? (
              <button
                type="button"
                onClick={exitSelectionMode}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={enterSelectionMode}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-md hover:bg-gray-200 transition-colors"
                >
                  Select
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="px-3 py-1.5 bg-teal-600 text-white text-sm font-semibold rounded-md hover:bg-teal-700 transition-colors"
                >
                  + New
                </button>
              </>
            )}
          </div>
        </div>

        {/* FEAT-BD: Bulk action bar — visible in selection mode */}
        {selectionMode && (
          <div className="px-4 pb-2 flex-shrink-0">
            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-md px-3 py-2 gap-2">
              <span className="text-xs text-gray-600 font-medium">{selectedIds.size} selected</span>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs text-teal-600 hover:text-teal-800 font-medium"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleBulkDelete();
                }}
                disabled={selectedIds.size === 0 || isDeleting}
                className="px-2.5 py-1 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        {/* F-06: Search field */}
        <div className="px-4 pb-2 flex-shrink-0">
          <input
            type="search"
            placeholder="Search trips…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="Search trips by name"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        {/* NTH-01: Undo bar — shown during 5-second delete window */}
        {pendingDelete && (
          <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md flex items-center justify-between text-sm">
            <span className="text-red-700">
              Deleting {pendingDelete.ids.size} trip{pendingDelete.ids.size === 1 ? '' : 's'}…
            </span>
            <button
              type="button"
              onClick={handleUndoDelete}
              className="text-red-600 font-medium hover:text-red-800"
            >
              Undo
            </button>
          </div>
        )}

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
                    ? 'px-2.5 py-1 rounded-full text-xs font-medium bg-teal-600 text-white border border-teal-600'
                    : 'px-2.5 py-1 rounded-full text-xs font-medium bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                }
              >
                {chip.value ? `${chip.label} (${statusCounts[chip.value] ?? 0})` : chip.label}
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
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-teal-50 border border-teal-200 rounded-md text-xs text-teal-700">
              Map filter: {mapFilterLabel}
              <button
                type="button"
                onClick={clearMapFilter}
                aria-label="Clear map filter"
                className="text-teal-700 hover:text-teal-900 text-base leading-none"
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
              selectionMode={selectionMode}
              isChecked={selectedIds.has(trip.id)}
              onCheckChange={handleCheckChange}
            />
          ))}
        </div>
      </div>

      {/* Right panel — fills remaining width, scrollable */}
      <div data-testid="trip-detail-panel" className="flex-1 h-full overflow-y-auto bg-gray-50">
        <Outlet />
      </div>

      {/* Create / Edit form modal */}
      {showForm && <TripForm existingTrip={editingTrip ?? undefined} onClose={handleFormClose} />}
    </div>
  );
}

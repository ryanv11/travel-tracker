/**
 * DesktopTripsLayout — two-panel shell for the /trips route tree at ≥768px
 * viewports (TR-11, F-01). WP-03: reskinned to Waypoint tokens; left panel
 * width is now 340px (was 320px — C10, a deliberate value change, not drift).
 *
 * Left panel: fixed 340px, contains trip list with search, status filters,
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
 *
 * Every one of these behaviors (bulk delete/undo, sort, per-status counts,
 * map-filter badge) has no counterpart in the Waypoint mockup — preserved
 * per spec C7, reskinned with the new tokens only.
 */
import { useCallback, useMemo, useState } from 'react';
import { Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { type TripFilters, useDeleteTrip, useTrips } from '../../hooks/useTrips';
import type { TripStatus } from '../../types/api';
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
 * Two-panel trips layout shell for desktop (≥768px). Left panel owns the trip
 * list; right panel is the <Outlet />.
 */
export function DesktopTripsLayout() {
  const [filters, setFilters] = useState<TripFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');

  // FEAT-BD: Multi-select delete state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
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

  const handleFormClose = () => {
    setShowForm(false);
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
          setDeleteError(err instanceof Error ? err : new Error(String(err)));
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
      {/* Left panel — fixed 340px (C10), scrollable */}
      <div className="w-[340px] flex-shrink-0 flex flex-col h-full border-r border-wp-border bg-wp-bg-surface overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          {/* D-05: trip count badge */}
          <h2 className="font-display font-semibold text-[22px] text-wp-ink flex items-baseline gap-2">
            My Trips
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-ui font-bold bg-wp-bg-chip text-wp-ink-muted">
              {tripCount}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {selectionMode ? (
              <button
                type="button"
                onClick={exitSelectionMode}
                className="font-ui font-semibold text-sm rounded-wp px-3 py-1.5 bg-wp-bg-subtle text-wp-ink border border-wp-border hover:bg-wp-bg-chip transition-colors cursor-pointer"
              >
                Cancel
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={enterSelectionMode}
                  className="font-ui font-semibold text-sm rounded-wp px-3 py-1.5 bg-wp-bg-subtle text-wp-ink border border-wp-border hover:bg-wp-bg-chip transition-colors cursor-pointer"
                >
                  Select
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="font-ui font-bold text-[12.5px] rounded-[9px] px-3.5 py-2 bg-wp-primary text-white hover:bg-wp-primary-hover transition-colors cursor-pointer"
                >
                  + New Trip
                </button>
              </>
            )}
          </div>
        </div>

        {/* FEAT-BD: Bulk action bar — visible in selection mode */}
        {selectionMode && (
          <div className="px-4 pb-2 flex-shrink-0">
            <div className="flex items-center justify-between bg-wp-bg-subtle border border-wp-border rounded-wp px-3 py-2 gap-2">
              <span className="text-xs font-ui text-wp-ink-muted font-medium">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-ui text-wp-primary hover:text-wp-primary-hover font-medium cursor-pointer"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleBulkDelete();
                }}
                disabled={selectedIds.size === 0 || isDeleting}
                className="px-2.5 py-1 bg-wp-btn-destructive-bg text-wp-btn-destructive-text border border-wp-btn-destructive-border text-xs font-ui font-semibold rounded hover:brightness-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
            placeholder="Search trips or places…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="Search trips by name or place"
            className="w-full font-ui text-sm rounded-wp px-2.5 py-1.5 bg-wp-bg-surface text-wp-ink border border-wp-border focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-wp-primary focus-visible:outline-offset-1"
          />
        </div>

        {/* NTH-01: Undo bar — shown during 5-second delete window */}
        {pendingDelete && (
          <div className="mx-4 mb-2 px-3 py-2 bg-wp-btn-destructive-bg border border-wp-btn-destructive-border rounded-wp flex items-center justify-between text-sm">
            <span className="font-ui text-wp-btn-destructive-text">
              Deleting {pendingDelete.ids.size} trip{pendingDelete.ids.size === 1 ? '' : 's'}…
            </span>
            <button
              type="button"
              onClick={handleUndoDelete}
              className="font-ui text-wp-btn-destructive-text font-medium hover:brightness-90 cursor-pointer"
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
                    ? 'rounded-full px-3 py-[5px] text-[11.5px] font-ui font-bold bg-wp-primary text-white'
                    : 'rounded-full px-3 py-[5px] text-[11.5px] font-ui font-bold bg-wp-bg-subtle text-wp-ink-muted hover:bg-wp-bg-chip'
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
            className="w-full font-ui text-sm rounded-wp px-2.5 py-1.5 bg-wp-bg-surface text-wp-ink border border-wp-border focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-wp-primary focus-visible:outline-offset-1"
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
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-wp-primary-subtle border border-wp-primary/20 rounded-wp text-xs font-ui text-wp-primary-subtle-text">
              Map filter: {mapFilterLabel}
              <button
                type="button"
                onClick={clearMapFilter}
                aria-label="Clear map filter"
                className="text-wp-primary-subtle-text hover:brightness-75 text-base leading-none cursor-pointer"
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
          {deleteError && <ErrorMessage error={deleteError} />}

          {!isLoading && !error && displayedTrips.length === 0 && (
            <p className="font-ui text-wp-ink-soft text-center py-10 text-sm">
              {trips && trips.length > 0
                ? 'No trips match the current filters.'
                : 'No trips yet. Create one with "+ New".'}
            </p>
          )}

          {displayedTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              isSelected={selectedId === String(trip.id)}
              selectionMode={selectionMode}
              isChecked={selectedIds.has(trip.id)}
              onCheckChange={handleCheckChange}
            />
          ))}
        </div>
      </div>

      {/* Right panel — fills remaining width, scrollable */}
      <div data-testid="trip-detail-panel" className="flex-1 h-full overflow-y-auto bg-wp-bg-page">
        <Outlet />
      </div>

      {/* Create trip form modal */}
      {showForm && <TripForm onClose={handleFormClose} />}
    </div>
  );
}

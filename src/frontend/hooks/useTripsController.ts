/**
 * useTripsController — shared controller logic for the /trips list surface
 * (QUAL-30).
 *
 * DesktopTripsLayout and MobileTripsLayout duplicated ~130 lines of identical
 * state, derived values (memos) and event handlers — everything except the
 * markup itself and mobile's extra detail-view plumbing (useTrip/useMe/
 * renderDetailContent/slide-transition state, which are genuinely
 * mobile-only and stay local to MobileTripsLayout). This hook holds the one
 * shared implementation; both layouts call it identically and keep their own
 * distinct JSX.
 *
 * Behaviour is unchanged from before the extraction — this is a pure dedup.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { filterAndSortTrips } from '../components/TripList/TripList';
import type { TripStatus } from '../types/api';
import { formatCitySubtitle } from '../utils/formatCitySubtitle';
import { useCountries } from './useAdmin';
import { type TripFilters, useDeleteTrip, useTrips } from './useTrips';

/** Status chip definitions for F-07 — shared by desktop and mobile. */
export const STATUS_CHIPS: { value: TripStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'review_pending', label: 'Review' },
  { value: 'locked', label: 'Locked' },
];

export type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';

/**
 * Shared /trips list controller: filter/search/sort state, multi-select
 * bulk-delete-with-undo (FEAT-BD/NTH-01), and the derived values (displayed
 * trips, map-filter label, per-status counts) both layouts render from.
 *
 * @returns Everything DesktopTripsLayout/MobileTripsLayout need to render the
 *   trip list panel; each layout supplies its own markup around these values.
 */
export function useTripsController() {
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
  const { data: countries = [] } = useCountries();
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

  // BUG-80: this filter already targets one specific city_id (unambiguous by
  // definition), but the label used to show only the bare name — two
  // different "Newport" pins on the map would both read "City: Newport"
  // after being clicked. Derive the full city object (not just its name) so
  // the label can carry the same region/country subtitle every other
  // saved-place surface now shows.
  const cityInfo = useMemo(() => {
    if (cityFilter === null) return null;
    for (const trip of trips ?? []) {
      for (const place of trip.places) {
        if (place.city_id === cityFilter) return place.city;
      }
    }
    return null;
  }, [trips, cityFilter]);

  const mapFilterLabel = useMemo(() => {
    if (cityFilter !== null) {
      if (!cityInfo) return `City: ${cityFilter}`;
      const subtitle = formatCitySubtitle(
        cityInfo,
        countries,
        cityInfo.country_name ?? cityInfo.country_code,
      );
      return `City: ${cityInfo.name}, ${subtitle}`;
    }
    if (regionFilter) return `Region: ${regionFilter}`;
    if (countryFilter) return `Country: ${countryFilter}`;
    return null;
  }, [cityFilter, regionFilter, countryFilter, cityInfo, countries]);

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

  return {
    // Filter/search/sort state
    filters,
    setFilters,
    showForm,
    setShowForm,
    searchText,
    setSearchText,
    sortBy,
    setSortBy,

    // Multi-select / bulk delete state
    selectionMode,
    selectedIds,
    isDeleting,
    deleteError,
    pendingDelete,

    // Routing
    selectedId,
    navigate,

    // Data
    trips,
    isLoading,
    error,
    countries,

    // Derived values
    displayedTrips,
    mapFilterLabel,
    tripCount,
    statusCounts,

    // Handlers
    handleFormClose,
    clearMapFilter,
    enterSelectionMode,
    exitSelectionMode,
    handleCheckChange,
    handleSelectAll,
    handleBulkDelete,
    handleUndoDelete,
  };
}

/**
 * MobileTripsLayout — WP-04 net-new responsive mobile Trips surface (<768px).
 *
 * Modeled on `trips-mobile.dc.html`: list view and detail view are two
 * absolutely-positioned, full-bleed panels within one relative container that
 * cross-fade/slide between each other (spec's "Slide/cross-fade transition"
 * section) — both panels stay mounted at all times so the transition can
 * animate the outgoing panel, rather than one panel unmounting the instant the
 * other mounts. This is why this component does NOT render <Outlet/> the way
 * DesktopTripsLayout does — it reads the :id param itself (useParams still
 * returns the full route tree's merged params even when a component doesn't
 * render Outlet) and fetches/branches the detail content directly, mirroring
 * TripDetailPage's own loading/error/review_pending branching so behavior
 * stays identical to desktop.
 *
 * Preserves every item in the WP-03/WP-04 non-negotiable preservation list
 * that lives at the list level (C7): bulk multi-select delete + 5-second undo
 * bar, sort control, per-status filter counts, and the map-filter badge.
 *
 * No horizontal scrolling anywhere except the status filter chip row (the one
 * documented exception — 5 status chips can't fit one mobile-width line).
 *
 * QUAL-30: the list-panel state/derived-values/handlers this shares
 * byte-for-byte with DesktopTripsLayout now live in useTripsController — this
 * file keeps its own distinct markup plus the detail-view plumbing
 * (useTrip/useMe/renderDetailContent/slide-transition state) that has no
 * desktop counterpart.
 */
import { useCallback } from 'react';
import { useMe } from '../../hooks/useMe';
import { useReviewPanelVisibility } from '../../hooks/useReviewPanelVisibility';
import { useTrip } from '../../hooks/useTrips';
import { type SortOption, STATUS_CHIPS, useTripsController } from '../../hooks/useTripsController';
import type { TripStatus } from '../../types/api';
import { AdminIcon, LocationPinIcon, SuitcaseIcon } from '../icons';
import { ReviewPanel } from '../PostTripReview/ReviewPanel';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { MobileTripDetailView } from '../TripDetail/MobileTripDetailView';
import { TripForm } from '../TripDetail/TripForm';
import { TripCard } from './TripCard';

/** Bottom tab bar destinations (Map/Trips/Admin) — C9: list-view only. */
const TAB_ICON_CLASS = 'flex flex-col items-center gap-1 py-1 px-3';

export function MobileTripsLayout() {
  const {
    filters,
    setFilters,
    showForm,
    setShowForm,
    searchText,
    setSearchText,
    sortBy,
    setSortBy,
    selectionMode,
    selectedIds,
    isDeleting,
    deleteError,
    pendingDelete,
    selectedId,
    navigate,
    trips,
    isLoading,
    error,
    displayedTrips,
    mapFilterLabel,
    tripCount,
    statusCounts,
    handleFormClose,
    clearMapFilter,
    enterSelectionMode,
    exitSelectionMode,
    handleCheckChange,
    handleSelectAll,
    handleBulkDelete,
    handleUndoDelete,
  } = useTripsController();

  // Mobile-only: bottom tab bar owner gating.
  const { data: me } = useMe();

  // Mobile-only: detail-view data — fetched directly (no <Outlet/>, see
  // module doc comment). Reuses the same :id param useTripsController already
  // read via useParams (selectedId), so there's no second route read here.
  const numericSelectedId = selectedId ? Number(selectedId) : undefined;
  const {
    data: selectedTrip,
    isLoading: tripLoading,
    error: tripError,
  } = useTrip(numericSelectedId);

  const handleBack = useCallback(() => navigate('/trips'), [navigate]);

  // BUG-58/BUG-86: mirrors TripDetailPage's desktop wiring — which surface
  // renders for a review_pending trip is a local dismiss, never a navigation
  // (see useReviewPanelVisibility's doc comment for the shared root cause).
  const { showReviewPanel, dismissReview } = useReviewPanelVisibility(
    selectedTrip?.id,
    selectedTrip?.status,
  );

  // Slide/cross-fade transition — exact transform/opacity values per spec.
  const hasSelection = !!selectedId;
  const listPanelClass = hasSelection
    ? '-translate-x-[30%] opacity-0 pointer-events-none'
    : 'translate-x-0 opacity-100';
  const detailPanelClass = hasSelection
    ? 'translate-x-0 opacity-100'
    : 'translate-x-[30%] opacity-0 pointer-events-none';

  /** Renders the detail-view content: loading / error / review / detail. */
  function renderDetailContent() {
    if (numericSelectedId === undefined) return null;
    if (tripLoading) {
      return (
        <div className="flex items-center justify-center p-16">
          <LoadingSpinner message="Loading trip…" />
        </div>
      );
    }
    if (tripError || !selectedTrip) {
      return (
        <div className="p-8">
          <ErrorMessage error={tripError ?? new Error('Trip not found')} />
        </div>
      );
    }
    if (showReviewPanel) {
      return (
        <div className="px-2 py-4">
          <ReviewPanel trip={selectedTrip} onClose={dismissReview} />
        </div>
      );
    }
    return <MobileTripDetailView trip={selectedTrip} onBack={handleBack} />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-wp-bg-page">
      {/* Sliding list/detail container */}
      <div className="relative flex-1 overflow-hidden">
        {/* LIST VIEW */}
        <div
          className={`absolute inset-0 flex flex-col overflow-hidden transition-[transform,opacity] duration-[250ms] ease-in-out ${listPanelClass}`}
        >
          {/* Header row: "My Trips (N)" + FAB */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0 gap-2">
            <h2 className="font-display font-semibold text-[28px] text-wp-ink flex items-baseline gap-2 min-w-0">
              My Trips
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-ui font-bold bg-wp-bg-chip text-wp-ink-muted flex-shrink-0">
                {tripCount}
              </span>
            </h2>
            <div className="flex items-center gap-2 flex-shrink-0">
              {selectionMode ? (
                <button
                  type="button"
                  onClick={exitSelectionMode}
                  className="font-ui font-semibold text-sm rounded-wp px-3 py-1.5 bg-wp-bg-subtle text-wp-ink border border-wp-border cursor-pointer"
                >
                  Cancel
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={enterSelectionMode}
                    className="font-ui font-semibold text-sm rounded-wp px-3 py-1.5 bg-wp-bg-subtle text-wp-ink border border-wp-border cursor-pointer"
                  >
                    Select
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    aria-label="New Trip"
                    title="New Trip"
                    className="w-9 h-9 rounded-[11px] bg-wp-primary text-white text-xl leading-none flex items-center justify-center cursor-pointer hover:bg-wp-primary-hover flex-shrink-0"
                  >
                    +
                  </button>
                </>
              )}
            </div>
          </div>

          {/* FEAT-BD: Bulk action bar */}
          {selectionMode && (
            <div className="px-4 pb-2 flex-shrink-0">
              <div className="flex items-center justify-between bg-wp-bg-subtle border border-wp-border rounded-wp px-3 py-2 gap-2">
                <span className="text-xs font-ui text-wp-ink-muted font-medium">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs font-ui text-wp-primary font-medium cursor-pointer"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleBulkDelete();
                  }}
                  disabled={selectedIds.size === 0 || isDeleting}
                  className="px-2.5 py-1 bg-wp-btn-destructive-bg text-wp-btn-destructive-text border border-wp-btn-destructive-border text-xs font-ui font-semibold rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          )}

          {/* Search field */}
          <div className="px-4 pb-2 flex-shrink-0">
            <input
              type="search"
              placeholder="Search trips or places…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              aria-label="Search trips by name or place"
              className="w-full font-ui text-[15px] rounded-wp px-2.5 py-2 bg-wp-bg-surface text-wp-ink border border-wp-border focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-wp-primary focus-visible:outline-offset-1"
            />
          </div>

          {/* NTH-01: Undo bar */}
          {pendingDelete && (
            <div className="mx-4 mb-2 px-3 py-2 bg-wp-btn-destructive-bg border border-wp-btn-destructive-border rounded-wp flex items-center justify-between text-sm flex-shrink-0">
              <span className="font-ui text-wp-btn-destructive-text">
                Deleting {pendingDelete.ids.size} trip{pendingDelete.ids.size === 1 ? '' : 's'}…
              </span>
              <button
                type="button"
                onClick={handleUndoDelete}
                className="font-ui text-wp-btn-destructive-text font-medium cursor-pointer"
              >
                Undo
              </button>
            </div>
          )}

          {/* F-07: Status filter chips — the ONE permitted horizontal-scroll exception */}
          <div className="pb-2 flex-shrink-0 flex gap-1.5 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden">
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
                      ? 'flex-shrink-0 rounded-full px-3 py-[5px] text-[11.5px] font-ui font-bold bg-wp-primary text-white whitespace-nowrap'
                      : 'flex-shrink-0 rounded-full px-3 py-[5px] text-[11.5px] font-ui font-bold bg-wp-bg-subtle text-wp-ink-muted whitespace-nowrap'
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
              className="w-full font-ui text-sm rounded-wp px-2.5 py-1.5 bg-wp-bg-surface text-wp-ink border border-wp-border focus:outline-none"
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
              <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-wp-primary-subtle border border-wp-primary/20 rounded-wp text-xs font-ui text-wp-primary-subtle-text max-w-full">
                <span className="truncate">Map filter: {mapFilterLabel}</span>
                <button
                  type="button"
                  onClick={clearMapFilter}
                  aria-label="Clear map filter"
                  className="text-wp-primary-subtle-text text-base leading-none flex-shrink-0 cursor-pointer"
                >
                  ×
                </button>
              </span>
            </div>
          )}

          {/* Trip list — scrollable, never horizontal */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 flex flex-col gap-2 min-w-0">
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
                density="mobile"
              />
            ))}
          </div>
        </div>

        {/* DETAIL VIEW */}
        <div
          data-testid="trip-detail-panel"
          className={`absolute inset-0 overflow-hidden transition-[transform,opacity] duration-[250ms] ease-in-out ${detailPanelClass}`}
        >
          {renderDetailContent()}
        </div>
      </div>

      {/* Bottom tab bar — list-view only (C9); hidden once a trip is selected */}
      {!hasSelection && (
        <nav className="flex-shrink-0 flex items-center justify-around border-t border-wp-border bg-wp-bg-surface pt-2.5 pb-[26px]">
          <button
            type="button"
            onClick={() => navigate('/map')}
            className={`${TAB_ICON_CLASS} text-wp-ink-faint bg-transparent border-none cursor-pointer`}
          >
            <LocationPinIcon size={21} cutoutColor="#fefdfb" />
            <span className="font-ui font-semibold text-[10.5px]">Map</span>
          </button>
          <button
            type="button"
            className={`${TAB_ICON_CLASS} text-wp-primary bg-transparent border-none cursor-pointer`}
          >
            <SuitcaseIcon size={21} />
            <span className="font-ui font-bold text-[10.5px]">Trips</span>
          </button>
          {/* BUG-26: Admin tab is owner-only, same gating as the desktop nav link */}
          {!!me?.isOwner && (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className={`${TAB_ICON_CLASS} text-wp-ink-faint bg-transparent border-none cursor-pointer`}
            >
              <AdminIcon size={21} />
              <span className="font-ui font-semibold text-[10.5px]">Admin</span>
            </button>
          )}
        </nav>
      )}

      {/* Create trip form modal */}
      {showForm && <TripForm onClose={handleFormClose} />}
    </div>
  );
}

/**
 * TripDetail — full desktop trip view with places, items, status controls.
 *
 * WP-03 (BRD §5.16): reskinned to the Waypoint token system — status stepper
 * replaces the old flat status bar (TR-12, PO-confirmed acceptable fulfillment),
 * new typography/color tokens, `·`-separated meta row punctuation. Structure
 * (title → meta → StatusBadge/Edit/Photos, places, trip items) is unchanged
 * from the pre-reskin implementation — this is a skin + stepper pass, not a
 * layout rebuild, per the spec's desktop "Right panel" cross-reference notes.
 *
 * BRD v2.4 lineage preserved:
 *   D-01: Companion names in meta row below title
 *   D-02: Category + activity badges in meta row
 *   D-03: Per-place date range derived from hotel check-in/check-out
 *   D-04: Full country name shown in PlaceSection subtitle (BUG-80: region
 *         name, when applicable, now shown ahead of it — formatCitySubtitle)
 *   F-04/TR-12: Persistent status transition control (now the stepper)
 *   PH-03/F-08: Photos button placeholder (non-functional, shows "Coming soon")
 *   C2: Unlock button/flow preserved as new stepper-card chrome (mockup has no
 *       unlock affordance at all — see StatusStepper's doc comment).
 *
 * BUG-50/TR-14: per-trip "Delete" affordance in the header action row, next to
 * Edit/Photos. Deliberately NOT hidden when the trip is locked (unlike Edit) —
 * TR-14 requires the affordance stay reachable and a locked-trip delete attempt
 * be refused with a message directing the user to unlock, rather than the
 * button disappearing with no explanation. See useTripDetailController's
 * handleDeleteDialogConfirm for how that refusal re-routes into the existing
 * unlock flow instead of duplicating the lock/unlock rule client-side.
 *
 * Locked trips show a read-only banner and hide all write controls (Delete is
 * the one deliberate exception, see above).
 *
 * BUG-86 (round 2, 2026-08-11 UAT): when a review_pending trip's ReviewPanel
 * has been dismissed (see useReviewPanelVisibility), THIS is the view that
 * renders instead — so it's also where the explicit path back to ReviewPanel
 * belongs. Rendered only when trip.status === 'review_pending', since that's
 * the only state ReviewPanel exists to return to.
 */
import type { TripDetail as TripDetailType } from '../../types/api';
import { formatDate } from '../../utils/formatDate';
import { EditIcon, LockedIcon, PhotosIcon, TrashIcon } from '../icons';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ErrorMessage } from '../shared/ErrorMessage';
import { StatusBadge } from '../shared/StatusBadge';
import { AddPlaceFlow } from './AddPlaceFlow';
import { PlaceSection } from './PlaceSection';
import { StatusStepper } from './StatusStepper';
import { TripForm } from './TripForm';
import { TripItemsSection } from './TripItemsSection';
import { useTripDetailController } from './useTripDetailController';

interface TripDetailProps {
  /** Full trip detail data including places and items. */
  trip: TripDetailType;
  /**
   * BUG-86 (round 2): returns to ReviewPanel for a review_pending trip whose
   * review surface was dismissed via "Back to Trip". Only rendered when
   * trip.status === 'review_pending' — optional so existing non-review call
   * sites/tests don't need to pass a no-op.
   */
  onReturnToReview?: () => void;
}

/**
 * Renders the detailed trip view. Called by TripDetailPage after data loads.
 *
 * @param trip - Full trip detail including nested places and items.
 * @param onReturnToReview - BUG-86 round 2: returns to ReviewPanel for a
 *   dismissed review_pending trip.
 */
export function TripDetail({ trip, onReturnToReview }: TripDetailProps) {
  const c = useTripDetailController(trip);

  // TR-14: the confirmation step must name what will be lost — trip, places, items.
  const placeCount = trip.places.length;
  const itemCount = trip.places.reduce((sum, place) => sum + place.items.length, 0);
  const deleteDialogCopy = c.isLocked
    ? {
        title: 'This trip is locked',
        message: "Locked trips can't be deleted. Unlock this trip first, then try again.",
        confirmLabel: 'Unlock Trip',
      }
    : {
        title: `Delete "${trip.name}"?`,
        message:
          placeCount > 0
            ? `This permanently deletes the trip, along with ${placeCount} place${placeCount === 1 ? '' : 's'} and ${itemCount} item${itemCount === 1 ? '' : 's'}. This cannot be undone.`
            : 'This permanently deletes the trip. This cannot be undone.',
        confirmLabel: 'Delete Trip',
      };

  return (
    <div className="flex flex-col h-full bg-wp-bg-page" data-testid="trip-detail">
      {/* Header + content are centered, max-width 820px, per spec */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[820px] mx-auto px-10 pt-9 pb-[60px]">
          {/* Header zone */}
          <div className="flex justify-between items-start gap-3 mb-3">
            <div className="min-w-0">
              <h1 className="font-display font-semibold text-[34px] leading-[1.15] tracking-[-0.3px] text-wp-ink m-0">
                {trip.name}
              </h1>

              {/* Meta row — `·`-separated dates | companions | tags (spec punctuation) */}
              <div className="flex items-center flex-wrap gap-2 mt-2">
                <span className="font-ui text-[13px] text-wp-ink-muted">
                  {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                </span>

                {trip.companions.length > 0 && (
                  <>
                    <span className="text-wp-ink-faint text-[13px]">·</span>
                    <span className="font-ui text-[13px] text-wp-ink-muted">
                      {trip.companions.map((comp) => comp.name).join(', ')}
                    </span>
                  </>
                )}

                {(trip.categories.length > 0 || trip.activities.length > 0) && (
                  <>
                    {trip.categories.map((cat) => (
                      <span
                        key={cat.id}
                        className="inline-block rounded-full px-3 py-[5px] bg-wp-category-bg text-wp-category-text font-ui font-bold text-[11.5px] uppercase tracking-[0.25px]"
                      >
                        {cat.name}
                      </span>
                    ))}
                    {trip.activities.map((act) => (
                      <span
                        key={act.id}
                        className="inline-block rounded-full px-3 py-[5px] bg-wp-category-bg text-wp-category-text font-ui font-bold text-[11.5px] uppercase tracking-[0.25px]"
                      >
                        {act.name}
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Right actions: StatusBadge → Edit → Photos (preserves isLocked hiding Edit) */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge status={trip.status} />
              {!c.isLocked && (
                <button
                  type="button"
                  onClick={() => c.setShowEdit(true)}
                  className="font-ui font-semibold text-sm rounded-wp px-3.5 py-2 bg-wp-bg-surface text-wp-ink border border-wp-border hover:bg-wp-bg-subtle cursor-pointer inline-flex items-center gap-1.5"
                >
                  <EditIcon size={14} />
                  Edit
                </button>
              )}
              {/* PH-03/F-08: Photos button placeholder */}
              <button
                type="button"
                onClick={c.handlePhotos}
                className="font-ui font-semibold text-sm rounded-wp px-3.5 py-2 bg-wp-bg-surface text-wp-ink border border-wp-border hover:bg-wp-bg-subtle cursor-pointer inline-flex items-center gap-1.5"
              >
                <PhotosIcon size={14} />
                Photos
              </button>
              {/* BUG-50/TR-14: Delete — reachable even when locked (see module doc).
                  aria-label disambiguates from each item's own per-item "Delete"
                  button (ItemCard) for assistive tech and test queries alike. */}
              <button
                type="button"
                onClick={c.handleDeleteClick}
                aria-label="Delete Trip"
                className="font-ui font-semibold text-sm rounded-wp px-3.5 py-2 bg-wp-bg-surface text-wp-btn-destructive-text border border-wp-border hover:bg-wp-btn-destructive-bg hover:border-wp-btn-destructive-border cursor-pointer inline-flex items-center gap-1.5"
              >
                <TrashIcon size={14} />
                <span aria-hidden="true">Delete</span>
              </button>
            </div>
          </div>

          {/* Status stepper card — replaces the old flat status bar (TR-12) */}
          <div className="rounded-[14px] border border-wp-border bg-wp-bg-surface px-[22px] py-[18px] mb-6 flex items-center justify-between gap-4 flex-wrap">
            <StatusStepper status={trip.status} size="desktop" />

            <div className="flex items-center gap-3">
              {/* C2: Unlock — new stepper-card chrome, mockup has no unlock affordance */}
              {c.isLocked && (
                <button
                  type="button"
                  onClick={c.handleUnlockBar}
                  disabled={c.isPending}
                  className="font-ui font-semibold text-sm rounded-wp px-3.5 py-2 bg-wp-bg-surface text-wp-ink border border-wp-border hover:bg-wp-bg-subtle disabled:opacity-50 cursor-pointer"
                >
                  Unlock
                </button>
              )}
              {/* BUG-86 (round 2): this view renders for a review_pending trip
                  whose ReviewPanel was dismissed via "Back to Trip" — this is
                  the way back, so the round-trip doesn't depend on a lock/
                  unlock status transition happening first. */}
              {trip.status === 'review_pending' && onReturnToReview && (
                <button
                  type="button"
                  onClick={onReturnToReview}
                  className="font-ui font-semibold text-sm rounded-wp px-3.5 py-2 bg-wp-bg-surface text-wp-ink border border-wp-border hover:bg-wp-bg-subtle cursor-pointer"
                >
                  Back to Review
                </button>
              )}
              {c.nextStep && (
                <>
                  <span className="font-ui text-[11.5px] text-wp-ink-muted text-right max-w-[150px]">
                    {c.nextStep.hint}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void c.handleNextStep();
                    }}
                    disabled={c.isPending}
                    className="font-ui font-semibold text-sm rounded-wp px-3.5 py-2 bg-wp-primary text-white hover:bg-wp-primary-hover disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {c.isPending ? 'Updating…' : c.nextStep.label}
                  </button>
                </>
              )}
              {/* Preserved from pre-reskin bar: locked trips show both Unlock and a
                  plain "Locked" label side by side (existing behavior, not a mockup
                  concept — not removing shipped UI on a reskin pass). */}
              {trip.status === 'locked' && !c.nextStep && (
                <span className="font-ui text-sm px-3.5 py-2 rounded-wp bg-wp-bg-chip text-wp-ink-muted">
                  Locked
                </span>
              )}
            </div>
          </div>

          {/* "Coming soon" toast for Photos */}
          {c.photosToast && (
            <div className="mb-4 px-4 py-2 bg-wp-bg-subtle border border-wp-border rounded-wp text-sm text-wp-ink-muted flex items-center gap-1.5">
              <PhotosIcon size={14} />
              Photos feature coming soon!
            </div>
          )}

          {/* Locked banner */}
          {c.isLocked && (
            <div className="mb-4 px-4 py-2.5 bg-wp-bg-subtle border border-wp-border rounded-wp text-sm text-wp-ink flex items-center gap-1.5">
              <LockedIcon size={14} />
              Read-only — trip is locked.
            </div>
          )}

          {c.statusError && <ErrorMessage error={c.statusError} />}

          {/* Trip-level items (BUG-36/IT-01/C3) — flights and car rentals that
              aren't tied to a specific place. Rendered above Places since
              transport typically bookends the trip. */}
          <TripItemsSection
            tripId={trip.id}
            isLocked={c.isLocked}
            tripStartDate={trip.start_date}
            tripEndDate={trip.end_date}
          />

          {/* Places — sorted by arrived_on ascending, nulls last (UX-02 / ADL-24) */}
          <div className="mb-4">
            {[...trip.places]
              .sort((a, b) => {
                const aDate = a.arrived_on ?? null;
                const bDate = b.arrived_on ?? null;
                if (aDate === null && bDate === null) return 0;
                if (aDate === null) return 1; // nulls last
                if (bDate === null) return -1;
                return aDate.localeCompare(bDate); // lexicographic = chronological for YYYY-MM-DD
              })
              .map((place) => (
                <PlaceSection
                  key={place.id}
                  place={place}
                  tripId={trip.id}
                  isLocked={c.isLocked}
                  tripStartDate={trip.start_date}
                  tripEndDate={trip.end_date}
                />
              ))}
          </div>

          {/* Add place button — dashed ghost variant per spec §5 */}
          {!c.isLocked && (
            <button
              type="button"
              onClick={() => c.setShowAddPlace(true)}
              className="w-full py-4 px-4 bg-transparent border-2 border-dashed border-wp-btn-ghost-border rounded-[14px] text-sm font-ui text-wp-ink-muted hover:border-wp-btn-ghost-border-hover hover:text-wp-btn-ghost-text-hover cursor-pointer"
            >
              + Add Place (City)
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {c.showEdit && <TripForm existingTrip={trip} onClose={() => c.setShowEdit(false)} />}
      {c.showAddPlace && (
        <AddPlaceFlow
          tripId={trip.id}
          onClose={c.handleAddPlaceClose}
          tripStartDate={trip.start_date}
          tripEndDate={trip.end_date}
          isFirstPlace={trip.places.length === 0}
          tripCountries={trip.countries}
          onManageCountries={c.handleManageCountries}
        />
      )}

      <ConfirmDialog
        isOpen={c.confirmLock}
        title="Lock this trip?"
        message="This will lock the trip. No further edits will be possible without unlocking. Continue?"
        confirmLabel="Lock Trip"
        onConfirm={() => {
          void c.handleLockConfirm();
        }}
        onCancel={() => c.setConfirmLock(false)}
      />

      <ConfirmDialog
        isOpen={c.confirmUnlock}
        title="Unlock this trip?"
        message="Unlock this trip? It will return to Review Pending status."
        confirmLabel="Unlock"
        onConfirm={() => {
          void c.handleUnlockConfirm();
        }}
        onCancel={() => c.setConfirmUnlock(false)}
      />

      {/* BUG-50/TR-14: Delete trip — locked trips route the confirm action into
          the unlock flow instead (see useTripDetailController). */}
      <ConfirmDialog
        isOpen={c.confirmDelete}
        title={deleteDialogCopy.title}
        message={deleteDialogCopy.message}
        confirmLabel={deleteDialogCopy.confirmLabel}
        confirmingLabel="Deleting…"
        onConfirm={c.handleDeleteDialogConfirm}
        onCancel={() => c.setConfirmDelete(false)}
        error={c.deleteError}
        isConfirming={c.isDeleting}
      />
    </div>
  );
}

/**
 * MobileTripDetailView — WP-04 mobile trip-detail content.
 *
 * Shares all business logic with the desktop TripDetail via
 * useTripDetailController (status transitions, lock/unlock, Photos toast,
 * modal toggles) — only the markup differs, per the spec's per-breakpoint
 * layout differences:
 *   - Back bar ("‹ Trips") replaces desktop's Edit/Photos-button-adjacent nav.
 *   - Compact icon-only Edit/Photos pair (UX's resolved call — see spec's
 *     "Mobile Edit/Photos entry point" section) instead of desktop's labelled
 *     secondary buttons.
 *   - Status badge sits beside the title on the same row (not below it).
 *   - The next-step CTA lives in its own highlighted callout box below the
 *     stepper card, not inline within it (deliberate per-breakpoint difference
 *     per spec, not something to reconcile into "identical minus width").
 *
 * Preserves every item in the WP-03/WP-04 non-negotiable preservation list —
 * TripItemsSection, PlaceSection (with Set/Edit dates + Remove), ItemCard
 * (ratings/carried-forward/subtext), the locked banner, and the Unlock
 * affordance (C2) — via the same shared components desktop uses.
 *
 * BUG-50/TR-14: adds a third icon-only button (Delete/TrashIcon) alongside
 * Edit/Photos, same reachable-even-when-locked rule as desktop — see
 * TripDetail.tsx's module doc for the full rationale.
 */
import type { TripDetail } from '../../types/api';
import { formatDate } from '../../utils/formatDate';
import { BackChevronIcon, EditIcon, LockedIcon, PhotosIcon, TrashIcon } from '../icons';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ErrorMessage } from '../shared/ErrorMessage';
import { StatusBadge } from '../shared/StatusBadge';
import { AddPlaceFlow } from './AddPlaceFlow';
import { PlaceSection } from './PlaceSection';
import { StatusStepper } from './StatusStepper';
import { TripForm } from './TripForm';
import { TripItemsSection } from './TripItemsSection';
import { useTripDetailController } from './useTripDetailController';

interface MobileTripDetailViewProps {
  /** Full trip detail data including places and items. */
  trip: TripDetail;
  /** Called when the user taps the back bar to return to the list. */
  onBack: () => void;
}

const ICON_BUTTON_CLASS =
  'w-9 h-9 rounded-wp bg-wp-bg-surface border border-wp-border hover:bg-wp-bg-subtle flex items-center justify-center text-wp-ink cursor-pointer flex-shrink-0';

/**
 * Renders the mobile trip-detail content (header, stepper, places, trip
 * items). Called by MobileTripsLayout once a trip is selected.
 *
 * @param trip - Full trip detail including nested places and items.
 * @param onBack - Navigates back to the mobile list view.
 */
export function MobileTripDetailView({ trip, onBack }: MobileTripDetailViewProps) {
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
    <div className="flex flex-col h-full bg-wp-bg-page min-w-0" data-testid="trip-detail">
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        <div className="px-4 pt-1.5 pb-8 min-w-0">
          {/* Back bar — replaces desktop's nav entirely on mobile (C9) */}
          <button
            type="button"
            onClick={onBack}
            className="font-ui font-semibold text-[15px] text-wp-primary flex items-center gap-1 py-2 -ml-1 cursor-pointer bg-transparent border-none"
          >
            <BackChevronIcon size={16} />
            Trips
          </button>

          {/* Title + badge row + compact Edit/Photos icon pair */}
          <div className="flex items-start justify-between gap-2 mt-1 mb-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h1 className="font-display font-semibold text-[26px] leading-[1.15] tracking-[-0.3px] text-wp-ink m-0 break-words min-w-0">
                {trip.name}
              </h1>
              <StatusBadge status={trip.status} />
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Preserve isLocked hiding Edit, same rule as desktop */}
              {!c.isLocked && (
                <button
                  type="button"
                  onClick={() => c.setShowEdit(true)}
                  aria-label="Edit"
                  title="Edit"
                  className={ICON_BUTTON_CLASS}
                >
                  <EditIcon size={18} />
                </button>
              )}
              {/* Photos stays visible regardless of lock state, matching desktop */}
              <button
                type="button"
                onClick={c.handlePhotos}
                aria-label="Photos"
                title="Photos"
                className={ICON_BUTTON_CLASS}
              >
                <PhotosIcon size={18} />
              </button>
              {/* BUG-50/TR-14: Delete — reachable even when locked (see module doc).
                  Own class string (not ICON_BUTTON_CLASS + override) because Tailwind
                  utility precedence is CSS source order, not class-attribute order —
                  appending a second text-color utility on top of ICON_BUTTON_CLASS's
                  own `text-wp-ink` would be a real conflict, not a safe override. */}
              <button
                type="button"
                onClick={c.handleDeleteClick}
                aria-label="Delete Trip"
                title="Delete Trip"
                className="w-9 h-9 rounded-wp bg-wp-bg-surface border border-wp-border hover:bg-wp-bg-subtle flex items-center justify-center text-wp-btn-destructive-text cursor-pointer flex-shrink-0"
              >
                <TrashIcon size={18} />
              </button>
            </div>
          </div>

          {/* Meta row — same `·`-separated pattern as desktop */}
          <div className="flex items-center flex-wrap gap-2 mb-4">
            <span className="font-ui text-[12.5px] text-wp-ink-muted">
              {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
            </span>
            {trip.companions.length > 0 && (
              <>
                <span className="text-wp-ink-faint text-[12.5px]">·</span>
                <span className="font-ui text-[12.5px] text-wp-ink-muted">
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

          {/* Status stepper card (smaller mobile sizing) */}
          <div className="rounded-[14px] border border-wp-border bg-wp-bg-surface px-4 py-3.5 mb-3">
            <StatusStepper status={trip.status} size="mobile" />
          </div>

          {/* Next-step CTA — separate highlighted callout box on mobile (not
              inline in the stepper card, a deliberate per-breakpoint difference) */}
          {c.nextStep && (
            <div className="rounded-[14px] bg-wp-primary-subtle px-4 py-3.5 mb-4 flex items-center justify-between gap-3">
              <span className="font-ui text-[11.5px] text-wp-primary-subtle-text">
                {c.nextStep.hint}
              </span>
              <button
                type="button"
                onClick={() => {
                  void c.handleNextStep();
                }}
                disabled={c.isPending}
                className="font-ui font-semibold text-sm rounded-wp px-3.5 py-2 bg-wp-primary text-white hover:bg-wp-primary-hover disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
              >
                {c.isPending ? 'Updating…' : c.nextStep.label}
              </button>
            </div>
          )}

          {/* C2: Unlock — same callout treatment when locked, no next step */}
          {c.isLocked && (
            <div className="rounded-[14px] bg-wp-bg-subtle px-4 py-3.5 mb-4 flex items-center justify-between gap-3">
              <span className="font-ui text-[11.5px] text-wp-ink-muted">
                Return this trip to review
              </span>
              <button
                type="button"
                onClick={c.handleUnlockBar}
                disabled={c.isPending}
                className="font-ui font-semibold text-sm rounded-wp px-3.5 py-2 bg-wp-bg-surface text-wp-ink border border-wp-border hover:bg-wp-bg-chip disabled:opacity-50 cursor-pointer flex-shrink-0"
              >
                Unlock
              </button>
            </div>
          )}

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

          {/* Trip-level items (BUG-36/IT-01/C3) */}
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
                if (aDate === null) return 1;
                if (bDate === null) return -1;
                return aDate.localeCompare(bDate);
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

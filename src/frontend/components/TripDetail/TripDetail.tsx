/**
 * TripDetail — full trip view with places, items, status controls.
 *
 * BRD v2.4 enhancements:
 *   D-01: Companion names in meta row below title
 *   D-02: Category + activity badges in meta row
 *   D-03: Per-place date range derived from hotel check-in/check-out
 *   D-04: Country code shown in PlaceSection subtitle (full name not yet in API — flagged)
 *   F-04/TR-12: Persistent status transition bar at bottom of right panel
 *   PH-03/F-08: Photos button placeholder (non-functional, shows "Coming soon")
 *
 * Locked trips show a read-only banner and hide all write controls.
 */
import { useCallback, useState } from 'react';
import { useLockTrip, useUnlockTrip, useUpdateTripStatus } from '../../hooks/useTrips';
import type { TripDetail as TripDetailType, TripStatus } from '../../types/api';
import { formatDate } from '../../utils/formatDate';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ErrorMessage } from '../shared/ErrorMessage';
import { StatusBadge } from '../shared/StatusBadge';
import { AddPlaceFlow } from './AddPlaceFlow';
import { PlaceSection } from './PlaceSection';
import { TripForm } from './TripForm';

interface TripDetailProps {
  /** Full trip detail data including places and items. */
  trip: TripDetailType;
}

/** The linear next-step for the persistent status bar (F-04/TR-12). */
const NEXT_STATUS: Partial<Record<TripStatus, { to: TripStatus; label: string; hint: string }>> = {
  planning: { to: 'active', label: 'Mark as Active', hint: 'Next: active → review → lock' },
  active: { to: 'review_pending', label: 'Move to Review', hint: 'Next: post-trip review → lock' },
  review_pending: { to: 'locked', label: 'Lock Trip', hint: 'Next: lock trip' },
};

/** Status labels for display in the bar. */
const STATUS_LABELS: Record<TripStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  review_pending: 'Review Pending',
  locked: 'Locked',
};

/**
 * Renders the detailed trip view. Called by TripDetailPage after data loads.
 *
 * @param trip - Full trip detail including nested places and items.
 */
export function TripDetail({ trip }: TripDetailProps) {
  const [showEdit, setShowEdit] = useState(false);
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [photosToast, setPhotosToast] = useState(false);

  const updateStatus = useUpdateTripStatus();
  const lockTrip = useLockTrip();
  const unlockTrip = useUnlockTrip();

  const isLocked = trip.status === 'locked';
  const statusError = updateStatus.error ?? lockTrip.error ?? unlockTrip.error;
  const isPending = updateStatus.isPending || lockTrip.isPending || unlockTrip.isPending;

  // BUG-18: memoised so AddPlaceFlow's useEffect dep on onClose is stable
  const handleAddPlaceClose = useCallback(() => setShowAddPlace(false), []);

  const nextStep = NEXT_STATUS[trip.status];

  const handleNextStep = async () => {
    if (!nextStep) return;
    if (nextStep.to === 'locked') {
      setConfirmLock(true);
      return;
    }
    await updateStatus.mutateAsync({ id: trip.id, status: nextStep.to });
  };

  const handleUnlockBar = () => {
    setConfirmUnlock(true);
  };

  const handleLockConfirm = async () => {
    await lockTrip.mutateAsync(trip.id);
    setConfirmLock(false);
  };

  const handleUnlockConfirm = async () => {
    await unlockTrip.mutateAsync(trip.id);
    setConfirmUnlock(false);
  };

  const handlePhotos = () => {
    setPhotosToast(true);
    setTimeout(() => setPhotosToast(false), 2500);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header zone */}
      <div className="flex-shrink-0 p-6 pb-3">
        {/* DELTA-04: Title left, actions [StatusBadge | Edit | Photos] right */}
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 m-0">{trip.name}</h1>

            {/* DELTA-05: Single inline meta row — date | companions | categories/activities */}
            <div className="flex items-center flex-wrap gap-2 mt-1">
              <span className="text-xs text-slate-500">
                {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
              </span>

              {trip.companions.length > 0 && (
                <>
                  <span className="text-slate-300 text-xs">|</span>
                  <span className="text-xs text-slate-500">
                    {trip.companions.map((c) => c.name).join(', ')}
                  </span>
                </>
              )}

              {(trip.categories.length > 0 || trip.activities.length > 0) && (
                <>
                  <span className="text-slate-300 text-xs">|</span>
                  {trip.categories.map((c) => (
                    <span
                      key={c.id}
                      className="bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full text-xs font-medium"
                    >
                      {c.name}
                    </span>
                  ))}
                  {trip.activities.map((a) => (
                    <span
                      key={a.id}
                      className="bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full text-xs font-medium"
                    >
                      {a.name}
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* DELTA-04: Right actions: StatusBadge → Edit → Photos */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={trip.status} />
            {!isLocked && (
              <button
                type="button"
                onClick={() => setShowEdit(true)}
                className="px-4 py-1.5 border border-gray-300 rounded-md bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer flex-shrink-0"
              >
                Edit
              </button>
            )}
            {/* PH-03/F-08: Photos button placeholder */}
            <button
              type="button"
              onClick={handlePhotos}
              className="px-3 py-1.5 border border-gray-300 rounded-md bg-white text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              📷 Photos
            </button>
          </div>
        </div>
      </div>

      {/* F-04/TR-12 DELTA-06: Status bar — between header and scrollable content */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-gray-100 border-b border-gray-200">
        <span className="text-sm text-gray-600">
          Status: <span className="font-semibold text-gray-800">{STATUS_LABELS[trip.status]}</span>
        </span>
        <div className="flex items-center gap-2">
          {nextStep && (
            <>
              <button
                type="button"
                onClick={() => {
                  void handleNextStep();
                }}
                disabled={isPending}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  nextStep.to === 'locked'
                    ? 'bg-yellow-100 border border-amber-400 text-amber-800 hover:bg-yellow-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                } disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
              >
                {isPending ? 'Updating…' : nextStep.label}
              </button>
              <span className="text-xs text-gray-500 ml-2">{nextStep.hint}</span>
            </>
          )}
          {isLocked && (
            <button
              type="button"
              onClick={handleUnlockBar}
              disabled={isPending}
              className="px-4 py-1.5 rounded-md text-sm border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              Unlock
            </button>
          )}
          {trip.status === 'locked' && !nextStep && (
            <span className="px-4 py-1.5 rounded-md text-sm bg-gray-100 text-gray-500">Locked</span>
          )}
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* "Coming soon" toast for Photos */}
        {photosToast && (
          <div className="mb-4 px-4 py-2 bg-gray-100 border border-gray-200 rounded-md text-sm text-gray-600">
            📷 Photos feature coming soon!
          </div>
        )}

        {/* Locked banner */}
        {isLocked && (
          <div className="mb-4 px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-md text-sm text-gray-700">
            🔒 Read-only — trip is locked.
          </div>
        )}

        {statusError && <ErrorMessage error={statusError} />}

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
                isLocked={isLocked}
                tripStartDate={trip.start_date}
                tripEndDate={trip.end_date}
              />
            ))}
        </div>

        {/* Add place button */}
        {!isLocked && (
          <button
            type="button"
            onClick={() => setShowAddPlace(true)}
            className="w-full py-2.5 bg-white border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 cursor-pointer"
          >
            + Add Place (City)
          </button>
        )}
      </div>

      {/* Modals */}
      {showEdit && <TripForm existingTrip={trip} onClose={() => setShowEdit(false)} />}
      {showAddPlace && <AddPlaceFlow tripId={trip.id} onClose={handleAddPlaceClose} />}

      <ConfirmDialog
        isOpen={confirmLock}
        title="Lock this trip?"
        message="This will lock the trip. No further edits will be possible without unlocking. Continue?"
        confirmLabel="Lock Trip"
        onConfirm={() => {
          void handleLockConfirm();
        }}
        onCancel={() => setConfirmLock(false)}
      />

      <ConfirmDialog
        isOpen={confirmUnlock}
        title="Unlock this trip?"
        message="Unlock this trip? It will return to Review Pending status."
        confirmLabel="Unlock"
        onConfirm={() => {
          void handleUnlockConfirm();
        }}
        onCancel={() => setConfirmUnlock(false)}
      />
    </div>
  );
}

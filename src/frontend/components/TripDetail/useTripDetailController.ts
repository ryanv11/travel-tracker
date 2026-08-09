import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useDeleteTrip,
  useLockTrip,
  useUnlockTrip,
  useUpdateTripStatus,
} from '../../hooks/useTrips';
import type { TripDetail, TripStatus } from '../../types/api';

/** The linear next-step for the persistent status bar/stepper (F-04/TR-12). */
const NEXT_STATUS: Partial<Record<TripStatus, { to: TripStatus; label: string; hint: string }>> = {
  planning: { to: 'active', label: 'Mark as Active', hint: 'Next: active → review → lock' },
  active: { to: 'review_pending', label: 'Move to Review', hint: 'Next: post-trip review → lock' },
  review_pending: { to: 'locked', label: 'Lock Trip', hint: 'Next: lock trip' },
};

/**
 * Shared trip-detail state/handlers — status transitions, lock/unlock,
 * delete (BUG-50/TR-14), the "Photos coming soon" toast, and the
 * Edit/Add-Place modal toggles.
 *
 * WP-03/WP-04: extracted from `TripDetail.tsx` (desktop) so the new mobile
 * detail view (`MobileTripDetailView.tsx`) can share the exact same business
 * logic without duplicating it — only the two components' JSX/markup differ,
 * per the spec's per-breakpoint layout differences (desktop: stepper CTA
 * inline in the same card; mobile: separate highlighted callout box).
 *
 * @param trip - Full trip detail data.
 */
export function useTripDetailController(trip: TripDetail) {
  const [showEdit, setShowEdit] = useState(false);
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photosToast, setPhotosToast] = useState(false);

  const navigate = useNavigate();
  const updateStatus = useUpdateTripStatus();
  const lockTrip = useLockTrip();
  const unlockTrip = useUnlockTrip();
  const deleteTrip = useDeleteTrip();

  const isLocked = trip.status === 'locked';
  const statusError = updateStatus.error ?? lockTrip.error ?? unlockTrip.error;
  const isPending = updateStatus.isPending || lockTrip.isPending || unlockTrip.isPending;
  const isDeleting = deleteTrip.isPending;
  const deleteError = deleteTrip.error;

  // BUG-18: memoised so AddPlaceFlow's useEffect dep on onClose is stable
  const handleAddPlaceClose = useCallback(() => setShowAddPlace(false), []);

  // GE-20 (BUG-87, ADL-54 D4a): the add-place picker's zero-country prompt and
  // off-country empty-state both link to "the trip's country editor" — reused
  // rather than building a second one, per the ADL's explicit reuse
  // instruction. That editor IS the existing TripForm edit modal (already
  // renders the country multi-select), so this just closes AddPlaceFlow and
  // opens it, exactly like the header's Edit button already does. Shared here
  // (not duplicated per call site) since both TripDetail and
  // MobileTripDetailView need the identical behaviour.
  const handleManageCountries = useCallback(() => {
    setShowAddPlace(false);
    setShowEdit(true);
  }, []);

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

  // BUG-50/TR-14: opens the delete-confirmation dialog. Resets any previous
  // attempt's error, same precedent as PlaceSection's remove-place flow.
  const handleDeleteClick = () => {
    deleteTrip.reset();
    setConfirmDelete(true);
  };

  // TR-14 success criterion: "attempting to delete a Locked trip is refused
  // with a message directing the user to unlock." The trip's lock state is
  // already known client-side (trip.status), so a locked trip never reaches
  // the backend's LockError — the dialog's confirm action instead re-routes
  // straight into the existing unlock flow rather than duplicating the
  // lock/unlock business rule in a second place.
  const handleDeleteDialogConfirm = () => {
    if (isLocked) {
      setConfirmDelete(false);
      setConfirmUnlock(true);
      return;
    }
    void handleDeleteConfirm();
  };

  // Deletes the trip, then navigates back to the trips list — a deleted trip
  // has nothing left to keep selected (unlike BUG-58, where a status change
  // alone must NOT navigate away). Mirrors the bulk-delete precedent in
  // DesktopTripsLayout/MobileTripsLayout (`navigate('/trips', { replace: true })`).
  const handleDeleteConfirm = async () => {
    await deleteTrip.mutateAsync(trip.id);
    setConfirmDelete(false);
    navigate('/trips', { replace: true });
  };

  return {
    showEdit,
    setShowEdit,
    showAddPlace,
    setShowAddPlace,
    confirmUnlock,
    setConfirmUnlock,
    confirmLock,
    setConfirmLock,
    confirmDelete,
    setConfirmDelete,
    photosToast,
    isLocked,
    statusError,
    isPending,
    isDeleting,
    deleteError,
    handleAddPlaceClose,
    handleManageCountries,
    nextStep,
    handleNextStep,
    handleUnlockBar,
    handleLockConfirm,
    handleUnlockConfirm,
    handlePhotos,
    handleDeleteClick,
    handleDeleteDialogConfirm,
  };
}

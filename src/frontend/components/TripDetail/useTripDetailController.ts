import { useCallback, useState } from 'react';
import { useLockTrip, useUnlockTrip, useUpdateTripStatus } from '../../hooks/useTrips';
import type { TripDetail, TripStatus } from '../../types/api';

/** The linear next-step for the persistent status bar/stepper (F-04/TR-12). */
const NEXT_STATUS: Partial<Record<TripStatus, { to: TripStatus; label: string; hint: string }>> = {
  planning: { to: 'active', label: 'Mark as Active', hint: 'Next: active → review → lock' },
  active: { to: 'review_pending', label: 'Move to Review', hint: 'Next: post-trip review → lock' },
  review_pending: { to: 'locked', label: 'Lock Trip', hint: 'Next: lock trip' },
};

/**
 * Shared trip-detail state/handlers — status transitions, lock/unlock, the
 * "Photos coming soon" toast, and the Edit/Add-Place modal toggles.
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

  return {
    showEdit,
    setShowEdit,
    showAddPlace,
    setShowAddPlace,
    confirmUnlock,
    setConfirmUnlock,
    confirmLock,
    setConfirmLock,
    photosToast,
    isLocked,
    statusError,
    isPending,
    handleAddPlaceClose,
    nextStep,
    handleNextStep,
    handleUnlockBar,
    handleLockConfirm,
    handleUnlockConfirm,
    handlePhotos,
  };
}

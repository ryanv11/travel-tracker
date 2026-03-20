/**
 * TripDetail — full trip view with places, items, status controls.
 *
 * Renders trip header (name, dates, status, companions, categories),
 * status transition buttons, place sections, and the Add Place flow.
 * Locked trips show a read-only banner and hide all write controls.
 */
import React, { useState } from 'react';
import { StatusBadge } from '../shared/StatusBadge';
import { PlaceSection } from './PlaceSection';
import { TripForm } from './TripForm';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { AddPlaceFlow } from './AddPlaceFlow';
import { useUpdateTripStatus, useLockTrip, useUnlockTrip } from '../../hooks/useTrips';
import { ErrorMessage } from '../shared/ErrorMessage';
import { formatDate } from '../../utils/formatDate';
import type { TripDetail as TripDetailType, TripStatus } from '../../types/api';

interface TripDetailProps {
  /** Full trip detail data including places and items. */
  trip: TripDetailType;
}

/** Valid status transitions from each status. */
const TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  planning: ['active', 'review_pending'],
  active: ['review_pending'],
  review_pending: ['locked', 'planning'],
  locked: ['review_pending'],
};

const TRANSITION_LABELS: Partial<Record<TripStatus, string>> = {
  active: 'Mark Active',
  review_pending: 'Move to Review',
  locked: 'Lock Trip',
  planning: 'Return to Planning',
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

  const updateStatus = useUpdateTripStatus();
  const lockTrip = useLockTrip();
  const unlockTrip = useUnlockTrip();

  const isLocked = trip.status === 'locked';
  const statusError = updateStatus.error ?? lockTrip.error ?? unlockTrip.error;

  const handleTransition = async (toStatus: TripStatus) => {
    if (toStatus === 'locked') {
      setConfirmLock(true);
      return;
    }
    if (toStatus === 'review_pending' && trip.status === 'locked') {
      setConfirmUnlock(true);
      return;
    }
    await updateStatus.mutateAsync({ id: trip.id, status: toStatus });
  };

  const handleLockConfirm = async () => {
    await lockTrip.mutateAsync(trip.id);
    setConfirmLock(false);
  };

  const handleUnlockConfirm = async () => {
    await unlockTrip.mutateAsync(trip.id);
    setConfirmUnlock(false);
  };

  const validTransitions = TRANSITIONS[trip.status] ?? [];

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>{trip.name}</h1>
            <StatusBadge status={trip.status} />
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6B7280' }}>
            {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
          </p>
        </div>
        {!isLocked && (
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            style={{ padding: '7px 16px', border: '1px solid #D1D5DB', borderRadius: '6px', background: '#fff', cursor: 'pointer', flexShrink: 0 }}
          >
            Edit
          </button>
        )}
      </div>

      {/* Locked banner */}
      {isLocked && (
        <div style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', fontSize: '14px', color: '#374151' }}>
          🔒 Read-only — trip is locked.
        </div>
      )}

      {/* Companions + Categories */}
      {trip.companions.length > 0 && (
        <div style={{ marginBottom: '8px', fontSize: '14px', color: '#4B5563' }}>
          With: {trip.companions.map((c) => c.name).join(', ')}
        </div>
      )}
      {trip.categories.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          {trip.categories.map((c) => (
            <span key={c.id} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: '#F3F4F6', marginRight: '4px' }}>
              {c.name}
            </span>
          ))}
        </div>
      )}

      {/* Status transitions */}
      {validTransitions.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {validTransitions.map((toStatus) => (
            <button
              key={toStatus}
              type="button"
              onClick={() => { void handleTransition(toStatus); }}
              disabled={updateStatus.isPending || lockTrip.isPending || unlockTrip.isPending}
              style={{
                padding: '7px 14px', border: '1px solid #D1D5DB', borderRadius: '6px',
                background: toStatus === 'locked' ? '#FEF3C7' : '#fff',
                cursor: 'pointer', fontSize: '13px',
              }}
            >
              {TRANSITION_LABELS[toStatus] ?? toStatus}
            </button>
          ))}
        </div>
      )}

      {statusError && <ErrorMessage error={statusError} />}

      {/* Places */}
      <div style={{ marginBottom: '16px' }}>
        {trip.places.map((place) => (
          <PlaceSection
            key={place.id}
            place={place}
            tripId={trip.id}
            isLocked={isLocked}
          />
        ))}
      </div>

      {/* Add place button */}
      {!isLocked && (
        <button
          type="button"
          onClick={() => setShowAddPlace(true)}
          style={{
            padding: '9px 18px', background: '#fff', border: '2px dashed #D1D5DB',
            borderRadius: '8px', cursor: 'pointer', width: '100%',
            fontSize: '14px', color: '#6B7280',
          }}
        >
          + Add Place (City)
        </button>
      )}

      {/* Modals */}
      {showEdit && <TripForm existingTrip={trip} onClose={() => setShowEdit(false)} />}
      {showAddPlace && <AddPlaceFlow tripId={trip.id} onClose={() => setShowAddPlace(false)} />}

      <ConfirmDialog
        isOpen={confirmLock}
        title="Lock this trip?"
        message="This will lock the trip. No further edits will be possible without unlocking. Continue?"
        confirmLabel="Lock Trip"
        onConfirm={() => { void handleLockConfirm(); }}
        onCancel={() => setConfirmLock(false)}
      />

      <ConfirmDialog
        isOpen={confirmUnlock}
        title="Unlock this trip?"
        message="Unlock this trip? It will return to Review Pending status."
        confirmLabel="Unlock"
        onConfirm={() => { void handleUnlockConfirm(); }}
        onCancel={() => setConfirmUnlock(false)}
      />
    </div>
  );
}

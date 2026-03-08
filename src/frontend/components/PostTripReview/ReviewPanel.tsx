/**
 * ReviewPanel — post-trip review interface (RV-01 through RV-04).
 *
 * Accessible from TripDetail when trip.status = 'review_pending'.
 * Shows all places and items grouped by place. Supports bulk "Mark all Completed"
 * and a "Complete Review & Lock Trip" button with confirmation.
 */
import React, { useState } from 'react';
import { ReviewItemRow } from './ReviewItemRow';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ErrorMessage } from '../shared/ErrorMessage';
import { useLockTrip } from '../../hooks/useTrips';
import { useUpdateItem } from '../../hooks/useItems';
import type { TripDetail, Item, ItemStatus } from '../../types/api';

interface ReviewPanelProps {
  trip: TripDetail;
  /** Called after trip is locked to return to TripDetail. */
  onClose: () => void;
}

const NON_CANCELLED: ItemStatus[] = ['consider', 'confirmed', 'completed', 'next_time'];

/**
 * Renders the full post-trip review panel for a review_pending trip.
 *
 * @param trip - The full trip detail (must have status = 'review_pending').
 * @param onClose - Called after the lock action completes.
 */
export function ReviewPanel({ trip, onClose }: ReviewPanelProps) {
  const [showConfirmLock, setShowConfirmLock] = useState(false);
  const lockTrip = useLockTrip();
  const updateItem = useUpdateItem();

  const handleLock = async () => {
    await lockTrip.mutateAsync(trip.id);
    setShowConfirmLock(false);
    onClose();
  };

  /** Marks all non-cancelled items as 'completed' (one PATCH per item). */
  const handleMarkAllCompleted = async () => {
    const allItems: Item[] = trip.places.flatMap((p) => p.items);
    const toUpdate = allItems.filter((item) => NON_CANCELLED.includes(item.status) && item.status !== 'completed');
    for (const item of toUpdate) {
      await updateItem.mutateAsync({ tripId: trip.id, itemId: item.id, data: { status: 'completed' } });
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
          Post-Trip Review — {trip.name}
        </h2>
        <button
          type="button"
          onClick={() => { void handleMarkAllCompleted(); }}
          disabled={updateItem.isPending}
          style={{ padding: '7px 14px', border: '1px solid #D1D5DB', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px' }}
        >
          Mark all as Completed
        </button>
      </div>

      {trip.places.map((place) => (
        <div key={place.id} style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600, color: '#374151', borderBottom: '2px solid #E5E7EB', paddingBottom: '6px' }}>
            {place.city.name} · {place.city.country_code}
          </h3>
          {place.items.length === 0 ? (
            <p style={{ margin: 0, color: '#9CA3AF', fontSize: '13px' }}>No items at this place.</p>
          ) : (
            place.items.map((item) => (
              <ReviewItemRow key={item.id} item={item} tripId={trip.id} />
            ))
          )}
        </div>
      ))}

      {lockTrip.error && <ErrorMessage error={lockTrip.error} />}

      {/* Lock button */}
      <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #D1D5DB', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>
          Back to Trip
        </button>
        <button
          type="button"
          onClick={() => setShowConfirmLock(true)}
          style={{ padding: '9px 18px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          Complete Review &amp; Lock Trip
        </button>
      </div>

      <ConfirmDialog
        isOpen={showConfirmLock}
        title="Lock trip?"
        message="This will lock the trip. No further edits will be possible without unlocking. Continue?"
        confirmLabel="Lock Trip"
        onConfirm={() => { void handleLock(); }}
        onCancel={() => setShowConfirmLock(false)}
      />
    </div>
  );
}

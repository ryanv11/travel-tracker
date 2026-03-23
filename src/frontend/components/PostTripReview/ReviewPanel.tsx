/**
 * ReviewPanel — post-trip review interface (RV-01 through RV-04).
 *
 * Accessible from TripDetail when trip.status = 'review_pending'.
 * Shows all places and items grouped by place. Supports bulk "Mark all Completed"
 * and a "Complete Review & Lock Trip" button with confirmation.
 */
import { useState } from 'react';
import { useUpdateItem } from '../../hooks/useItems';
import { useLockTrip, useUpdateTripStatus } from '../../hooks/useTrips';
import type { Item, ItemStatus, TripDetail } from '../../types/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ErrorMessage } from '../shared/ErrorMessage';
import { ReviewItemRow } from './ReviewItemRow';

interface ReviewPanelProps {
  trip: TripDetail;
  /** Called after trip is locked or returned to planning. */
  onClose: () => void;
}

// BUG-05: next_time items must not be bulk-completed
const BULK_COMPLETABLE: ItemStatus[] = ['consider', 'confirmed'];

/**
 * Renders the full post-trip review panel for a review_pending trip.
 *
 * @param trip - The full trip detail (must have status = 'review_pending').
 * @param onClose - Called after the lock action completes.
 */
export function ReviewPanel({ trip, onClose }: ReviewPanelProps) {
  const [showConfirmLock, setShowConfirmLock] = useState(false);
  const [showConfirmReturnToPlanning, setShowConfirmReturnToPlanning] = useState(false);
  const lockTrip = useLockTrip();
  const returnToPlanning = useUpdateTripStatus();
  const updateItem = useUpdateItem();

  const handleLock = async () => {
    await lockTrip.mutateAsync(trip.id);
    setShowConfirmLock(false);
    onClose();
  };

  // BUG-04: allow reverting review_pending → planning
  const handleReturnToPlanning = async () => {
    await returnToPlanning.mutateAsync({ id: trip.id, status: 'planning' });
    setShowConfirmReturnToPlanning(false);
    onClose();
  };

  /** BUG-05: only bulk-complete consider/confirmed items — not next_time */
  const handleMarkAllCompleted = async () => {
    const allItems: Item[] = trip.places.flatMap((p) => p.items);
    const toUpdate = allItems.filter((item) => BULK_COMPLETABLE.includes(item.status));
    for (const item of toUpdate) {
      await updateItem.mutateAsync({
        tripId: trip.id,
        itemId: item.id,
        data: { status: 'completed' },
      });
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
          Post-Trip Review — {trip.name}
        </h2>
        <button
          type="button"
          onClick={() => {
            void handleMarkAllCompleted();
          }}
          disabled={updateItem.isPending}
          style={{
            padding: '7px 14px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Mark all as Completed
        </button>
      </div>

      {trip.places.map((place) => (
        <div key={place.id} style={{ marginBottom: '24px' }}>
          <h3
            style={{
              margin: '0 0 8px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#374151',
              borderBottom: '2px solid #E5E7EB',
              paddingBottom: '6px',
            }}
          >
            {place.city.name} · {place.city.country_code}
          </h3>
          {place.items.length === 0 ? (
            <p style={{ margin: 0, color: '#9CA3AF', fontSize: '13px' }}>No items at this place.</p>
          ) : (
            place.items.map((item) => <ReviewItemRow key={item.id} item={item} tripId={trip.id} />)
          )}
        </div>
      ))}

      {lockTrip.error && <ErrorMessage error={lockTrip.error} />}
      {returnToPlanning.error && <ErrorMessage error={returnToPlanning.error} />}

      {/* Action buttons */}
      <div
        style={{
          marginTop: '32px',
          paddingTop: '16px',
          borderTop: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setShowConfirmReturnToPlanning(true)}
          disabled={returnToPlanning.isPending}
          style={{
            padding: '9px 18px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Return to Planning
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Back to Trip
          </button>
          <button
            type="button"
            onClick={() => setShowConfirmLock(true)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#047857';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#059669';
            }}
            style={{
              padding: '9px 18px',
              background: '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Complete Review &amp; Lock Trip
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirmLock}
        title="Lock trip?"
        message="This will lock the trip. No further edits will be possible without unlocking. Continue?"
        confirmLabel="Lock Trip"
        onConfirm={() => {
          void handleLock();
        }}
        onCancel={() => setShowConfirmLock(false)}
      />

      {/* BUG-04: Return to Planning confirmation */}
      <ConfirmDialog
        isOpen={showConfirmReturnToPlanning}
        title="Return to planning?"
        message="Return this trip to planning? The review will be cleared."
        confirmLabel="Return to Planning"
        onConfirm={() => {
          void handleReturnToPlanning();
        }}
        onCancel={() => setShowConfirmReturnToPlanning(false)}
      />
    </div>
  );
}

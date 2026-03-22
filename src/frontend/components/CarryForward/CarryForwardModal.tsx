/**
 * CarryForwardModal — modal for the carry-forward suggestions flow (IT-07, AC-17).
 *
 * Shown after adding a place to a trip when GET /api/cities/:id/carry-forward
 * returns one or more candidate items (status = 'next_time' from prior trips).
 *
 * The execution step (POST carry-forward) is now wired up following BACKEND C1.
 * See: jobs/frontend/inbox/20260308_1200-BACKEND-carry-forward-available.txt
 */
import type React from 'react';
import { useState } from 'react';
import { useCarryForward } from '../../hooks/usePlaces';
import type { CarryForwardCandidate } from '../../types/api';
import { ErrorMessage } from '../shared/ErrorMessage';

interface CarryForwardModalProps {
  tripId: number;
  placeId: number;
  cityId: number;
  /** Candidate items returned by GET /api/cities/:id/carry-forward. */
  candidates: CarryForwardCandidate[];
  /** Called when the modal is dismissed (Skip or after successful execution). */
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 800,
};
const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '8px',
  padding: '24px',
  width: '520px',
  maxWidth: '95vw',
  maxHeight: '85vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};

const TYPE_ICONS: Record<string, string> = {
  restaurant: '🍽️',
  hotel: '🏨',
  flight: '✈️',
  car_rental: '🚗',
  experience: '🎫',
  note: '📝',
};

/**
 * Returns a human-readable name for a carry-forward candidate.
 */
function candidateLabel(c: CarryForwardCandidate): string {
  if (c.restaurant_name) return c.restaurant_name;
  if (c.hotel_property_name) return c.hotel_property_name;
  return c.notes?.slice(0, 60) ?? `${c.item_type} item`;
}

/**
 * Renders the carry-forward suggestions modal. Allows the user to select which
 * 'next_time' items to carry forward into the new trip, then executes via
 * POST /api/trips/:tripId/places/:placeId/carry-forward (BACKEND C1).
 *
 * @param tripId - Target trip ID.
 * @param placeId - Target place ID.
 * @param cityId - City ID (used only for display context).
 * @param candidates - Items eligible for carry-forward.
 * @param onClose - Dismiss callback.
 */
export function CarryForwardModal({
  tripId,
  placeId,
  cityId: _cityId,
  candidates,
  onClose,
}: CarryForwardModalProps) {
  // FIX 3 (P0-05): initialise with empty Set so users opt-in to carry-forward
  // rather than having to opt-out of every candidate.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [successMessage, setSuccessMessage] = useState('');

  const carryForward = useCarryForward();

  const toggleId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCarryForward = async () => {
    const sourceItemIds = Array.from(selectedIds);
    if (sourceItemIds.length === 0) return;
    const result = await carryForward.mutateAsync({ tripId, placeId, sourceItemIds });
    setSuccessMessage(
      `${result.count} item${result.count !== 1 ? 's' : ''} added to your trip as suggestions.`,
    );
    setTimeout(onClose, 1500);
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700 }}>
          Carry-forward suggestions
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#4B5563' }}>
          You've been here before. Select items to add to this trip as "Consider":
        </p>

        {successMessage ? (
          <div
            style={{
              padding: '14px',
              background: '#D1FAE5',
              borderRadius: '6px',
              color: '#065F46',
              fontWeight: 600,
            }}
          >
            ✓ {successMessage}
          </div>
        ) : (
          <>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}
            >
              {candidates.map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: selectedIds.has(c.id) ? '#EFF6FF' : '#fff',
                    borderColor: selectedIds.has(c.id) ? '#93C5FD' : '#E5E7EB',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleId(c.id)}
                    style={{ marginTop: '2px', flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{TYPE_ICONS[c.item_type] ?? '📌'}</span>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{candidateLabel(c)}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                      From: {c.source_trip_name} ({c.source_trip_end_date.slice(0, 7)})
                    </div>
                    {c.notes && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#6B7280',
                          fontStyle: 'italic',
                          marginTop: '2px',
                        }}
                      >
                        {c.notes.slice(0, 80)}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {carryForward.error && <ErrorMessage error={carryForward.error} />}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleCarryForward();
                }}
                disabled={selectedIds.size === 0 || carryForward.isPending}
                style={{
                  padding: '8px 18px',
                  background: selectedIds.size === 0 ? '#9CA3AF' : '#2563EB',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
              >
                {carryForward.isPending
                  ? 'Adding…'
                  : `Carry Forward ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

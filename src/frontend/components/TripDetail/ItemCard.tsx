/**
 * ItemCard — compact display card for a single item within a PlaceSection.
 *
 * Shows: type icon, status badge, key fields for the item type.
 * Actions: click to open ItemForm (edit), delete button with confirmation.
 */
import React, { useState } from 'react';
import { StatusBadge } from '../shared/StatusBadge';
import { RatingStars } from '../shared/RatingStars';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useDeleteItem } from '../../hooks/useItems';
import type { Item } from '../../types/api';

interface ItemCardProps {
  /** The item to render. */
  item: Item;
  /** ID of the parent trip (needed for the delete mutation). */
  tripId: number;
  /** Whether the parent trip is locked (hides edit/delete controls). */
  isLocked: boolean;
  /** Called when the user wants to edit this item. */
  onEdit: (item: Item) => void;
}

/** Maps item_type to a display emoji icon. */
const TYPE_ICONS: Record<string, string> = {
  restaurant: '🍽️',
  hotel: '🏨',
  flight: '✈️',
  car_rental: '🚗',
  experience: '🎫',
  note: '📝',
};

const cardStyle: React.CSSProperties = {
  padding: '12px 14px',
  border: '1px solid #E5E7EB',
  borderRadius: '6px',
  background: '#FAFAFA',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '10px',
};

/**
 * Derives a human-readable primary label for the item based on its type.
 */
function getItemLabel(item: Item): string {
  switch (item.item_type) {
    case 'restaurant': return item.name ?? 'Restaurant';
    case 'hotel': return item.property_name ?? 'Hotel';
    case 'flight': return [item.departure_airport, item.arrival_airport].filter(Boolean).join(' → ') || 'Flight';
    case 'car_rental': return item.provider ?? 'Car Rental';
    case 'experience': return item.notes?.slice(0, 50) ?? 'Experience';
    case 'note': return item.notes?.slice(0, 50) ?? 'Note';
    default: return 'Item';
  }
}

/**
 * Renders a concise item card with type icon, label, status, and edit/delete controls.
 *
 * @param item - The item data.
 * @param tripId - Parent trip ID for delete mutation.
 * @param isLocked - When true, hides edit/delete controls.
 * @param onEdit - Called when user clicks Edit.
 */
export function ItemCard({ item, tripId, isLocked, onEdit }: ItemCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const deleteItem = useDeleteItem();

  const handleDelete = async () => {
    await deleteItem.mutateAsync({ tripId, itemId: item.id });
    setShowConfirm(false);
  };

  const rating = item.rating;
  const hasRating = (item.item_type === 'restaurant' || item.item_type === 'hotel' || item.item_type === 'experience') && rating !== null;

  return (
    <>
      <div style={cardStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '18px' }}>{TYPE_ICONS[item.item_type] ?? '📌'}</span>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>{getItemLabel(item)}</span>
            <StatusBadge status={item.status} />
            {item.is_carried_forward && (
              <span style={{ fontSize: '11px', color: '#6B7280', background: '#F3F4F6', padding: '1px 6px', borderRadius: '4px' }}>carried forward</span>
            )}
          </div>

          {/* Subtext for relevant types */}
          {item.item_type === 'restaurant' && item.cuisine_type && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#6B7280' }}>{item.cuisine_type}</div>
          )}
          {item.item_type === 'hotel' && item.check_in_date && item.check_out_date && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#6B7280' }}>
              {item.check_in_date} – {item.check_out_date}
            </div>
          )}
          {item.item_type === 'flight' && (item.departure_datetime || item.airline) && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#6B7280' }}>
              {item.airline}{item.airline && item.flight_number ? ' ' : ''}{item.flight_number}
              {item.departure_datetime ? ` · ${item.departure_datetime.slice(0, 10)}` : ''}
            </div>
          )}

          {/* Rating (read-only) */}
          {hasRating && (
            <div style={{ marginTop: '4px' }}>
              <RatingStars value={rating} onChange={() => {}} readOnly />
            </div>
          )}

          {item.notes && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#6B7280', fontStyle: 'italic' }}>
              {item.notes.slice(0, 100)}{item.notes.length > 100 ? '…' : ''}
            </div>
          )}
        </div>

        {/* Edit / Delete actions (hidden when locked) */}
        {!isLocked && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => onEdit(item)}
              style={{ padding: '4px 10px', border: '1px solid #D1D5DB', borderRadius: '5px', background: '#fff', cursor: 'pointer', fontSize: '12px' }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              style={{ padding: '4px 10px', border: '1px solid #FECACA', borderRadius: '5px', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: '12px' }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Delete item?"
        message="This item will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { void handleDelete(); }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

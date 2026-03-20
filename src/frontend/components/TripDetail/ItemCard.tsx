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
import { formatDate } from '../../utils/formatDate';
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
      <div className="p-3 border border-gray-200 rounded-md bg-gray-50 flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{TYPE_ICONS[item.item_type] ?? '📌'}</span>
            <span className="font-semibold text-sm text-gray-900">{getItemLabel(item)}</span>
            <StatusBadge status={item.status} />
            {item.is_carried_forward && (
              <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">carried forward</span>
            )}
          </div>

          {/* Subtext for relevant types */}
          {item.item_type === 'restaurant' && item.cuisine_type && (
            <div className="mt-1 text-xs text-gray-500">{item.cuisine_type}</div>
          )}
          {item.item_type === 'hotel' && item.check_in_date && item.check_out_date && (
            <div className="mt-1 text-xs text-gray-500">
              {formatDate(item.check_in_date)} – {formatDate(item.check_out_date)}
            </div>
          )}
          {item.item_type === 'flight' && (item.departure_datetime || item.airline) && (
            <div className="mt-1 text-xs text-gray-500">
              {item.airline}{item.airline && item.flight_number ? ' ' : ''}{item.flight_number}
              {item.departure_datetime ? ` · ${item.departure_datetime.slice(0, 10)}` : ''}
            </div>
          )}

          {/* Rating (read-only) */}
          {hasRating && (
            <div className="mt-1">
              <RatingStars value={rating} onChange={() => {}} readOnly />
            </div>
          )}

          {item.notes && (
            <div className="mt-1 text-xs text-gray-500 italic">
              {item.notes.slice(0, 100)}{item.notes.length > 100 ? '…' : ''}
            </div>
          )}
        </div>

        {/* Edit / Delete actions (hidden when locked) */}
        {!isLocked && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="px-2.5 py-1 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50 cursor-pointer"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="px-2.5 py-1 border border-red-200 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer"
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

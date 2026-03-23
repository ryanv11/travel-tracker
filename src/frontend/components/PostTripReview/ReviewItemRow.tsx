/**
 * ReviewItemRow — one item row in the post-trip review panel (RV-01 to RV-04).
 *
 * Shows item name/type, status selector, and rating/post-visit notes for
 * rateable item types (restaurant, hotel, experience).
 * Each change calls PATCH /api/trips/:tripId/items/:itemId immediately (not batched).
 */
import { useState } from 'react';
import { useUpdateItem } from '../../hooks/useItems';
import type { Item, ItemStatus, ItemType } from '../../types/api';
import { RatingStars } from '../shared/RatingStars';

interface ReviewItemRowProps {
  item: Item;
  tripId: number;
}

const STATUS_OPTIONS: ItemStatus[] = [
  'consider',
  'confirmed',
  'completed',
  'cancelled',
  'next_time',
];
const STATUS_LABELS: Record<ItemStatus, string> = {
  consider: 'Consider',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  next_time: 'Next Time',
};
const TYPE_ICONS: Record<ItemType, string> = {
  restaurant: '🍽️',
  hotel: '🏨',
  flight: '✈️',
  car_rental: '🚗',
  experience: '🎫',
  note: '📝',
};
const RATEABLE_TYPES: ItemType[] = ['restaurant', 'hotel', 'experience'];

function getItemLabel(item: Item): string {
  if (item.item_type === 'restaurant') return item.name ?? 'Restaurant';
  if (item.item_type === 'hotel') return item.property_name ?? 'Hotel';
  return item.notes?.slice(0, 50) ?? `${item.item_type}`;
}

/**
 * Renders a single item row in the post-trip review panel.
 * Status updates and rating/notes are saved on change via PATCH.
 *
 * @param item - The item to render and allow updating.
 * @param tripId - Parent trip ID for the PATCH mutation.
 */
export function ReviewItemRow({ item, tripId }: ReviewItemRowProps) {
  const [status, setStatus] = useState<ItemStatus>(item.status);
  const [rating, setRating] = useState<number | null>(item.rating);
  const [postVisitNotes, setPostVisitNotes] = useState(item.post_visit_notes ?? '');
  const updateItem = useUpdateItem();

  const isRateable = RATEABLE_TYPES.includes(item.item_type);
  const showRating = isRateable && status === 'completed';

  const handleStatusChange = async (newStatus: ItemStatus) => {
    setStatus(newStatus);
    await updateItem.mutateAsync({ tripId, itemId: item.id, data: { status: newStatus } });
  };

  const handleRatingChange = async (newRating: number) => {
    setRating(newRating);
    await updateItem.mutateAsync({ tripId, itemId: item.id, data: { rating: newRating } });
  };

  const handleNotesBlur = async () => {
    const trimmed = postVisitNotes.trim() || undefined;
    await updateItem.mutateAsync({ tripId, itemId: item.id, data: { post_visit_notes: trimmed } });
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid #F3F4F6' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '18px', flexShrink: 0 }}>{TYPE_ICONS[item.item_type]}</span>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>{getItemLabel(item)}</div>
          {item.notes && (
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
              {item.notes.slice(0, 80)}
            </div>
          )}
        </div>

        {/* Status selector */}
        <select
          value={status}
          onChange={(e) => {
            void handleStatusChange(e.target.value as ItemStatus);
          }}
          disabled={updateItem.isPending}
          style={{
            padding: '5px 8px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: '13px',
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Rating + post-visit notes (for applicable types when completed) */}
      {showRating && (
        <div style={{ marginTop: '10px', paddingLeft: '28px' }}>
          <div style={{ marginBottom: '6px' }}>
            <RatingStars
              value={rating}
              onChange={(r) => {
                void handleRatingChange(r);
              }}
            />
          </div>
          <textarea
            value={postVisitNotes}
            onChange={(e) => setPostVisitNotes(e.target.value)}
            onBlur={() => {
              void handleNotesBlur();
            }}
            placeholder="Post-visit notes…"
            style={{
              width: '100%',
              padding: '7px 10px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '13px',
              resize: 'vertical',
              height: '70px',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  );
}

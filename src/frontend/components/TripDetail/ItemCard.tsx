/**
 * ItemCard — compact display card for a single item within a PlaceSection.
 *
 * WP-03/WP-04: reskinned with the Waypoint item-row shell (32px icon tile,
 * `primary-subtle` background, pill status badge) per spec §"Place sections".
 * The mockup collapses ratings, the carried-forward tag, and per-type subtext
 * richness down to one generic `sub` line — C5 requires all of it preserved
 * inside the new shell, which this implementation does; nothing here is a
 * simplification relative to the pre-reskin version.
 *
 * Shows: type icon, status badge, key fields for the item type.
 * Actions: click to open ItemForm (edit), delete button with confirmation.
 */
import { useState } from 'react';
import { useDeleteItem } from '../../hooks/useItems';
import type { Item } from '../../types/api';
import { formatDate } from '../../utils/formatDate';
import { ITEM_TYPE_ICONS, NoteIcon } from '../icons';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { RatingStars } from '../shared/RatingStars';
import { StatusBadge } from '../shared/StatusBadge';

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

/**
 * Derives a human-readable primary label for the item based on its type.
 */
function getItemLabel(item: Item): string {
  switch (item.item_type) {
    case 'restaurant':
      return item.name ?? 'Restaurant';
    case 'hotel':
      return item.property_name ?? 'Hotel';
    case 'flight':
      return [item.departure_airport, item.arrival_airport].filter(Boolean).join(' → ') || 'Flight';
    case 'car_rental':
      return item.provider ?? 'Car Rental';
    case 'experience':
      return item.notes?.slice(0, 50) ?? 'Experience';
    case 'note':
      return item.notes?.slice(0, 50) ?? 'Note';
    default:
      return 'Item';
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
  const hasRating =
    (item.item_type === 'restaurant' ||
      item.item_type === 'hotel' ||
      item.item_type === 'experience') &&
    rating !== null;

  // WP-02: icon lookup by item_type; falls back to the generic Note glyph for
  // any (currently impossible) unrecognised type rather than leaving a gap.
  const TypeIcon = ITEM_TYPE_ICONS[item.item_type] ?? NoteIcon;

  return (
    <>
      <div className="p-3.5 border border-wp-border-soft rounded-[11px] bg-wp-bg-page flex justify-between items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* 32px icon tile per spec's item-row shell */}
            <span className="w-8 h-8 rounded-lg bg-wp-primary-subtle flex items-center justify-center flex-shrink-0">
              <TypeIcon size={16} className="text-wp-primary" />
            </span>
            <span className="font-ui font-bold text-[13.5px] text-wp-ink break-words">
              {getItemLabel(item)}
            </span>
            <StatusBadge status={item.status} />
            {/* C5: "carried forward" tag — must preserve, mockup drops it entirely */}
            {item.is_carried_forward && (
              <span className="text-[11px] font-ui text-wp-ink-muted bg-wp-bg-chip px-1.5 py-0.5 rounded">
                carried forward
              </span>
            )}
          </div>

          {/* C5: full per-type subtext — must preserve, mockup collapses this to one generic `sub` line */}
          {item.item_type === 'restaurant' && item.cuisine_type && (
            <div className="mt-1 font-ui text-xs text-wp-ink-muted break-words">
              {item.cuisine_type}
            </div>
          )}
          {item.item_type === 'hotel' && item.check_in_date && item.check_out_date && (
            <div className="mt-1 font-ui text-xs text-wp-ink-muted break-words">
              {formatDate(item.check_in_date)} – {formatDate(item.check_out_date)}
            </div>
          )}
          {item.item_type === 'flight' && (item.departure_datetime || item.airline) && (
            <div className="mt-1 font-ui text-xs text-wp-ink-muted break-words">
              {item.airline}
              {item.airline && item.flight_number ? ' ' : ''}
              {item.flight_number}
              {item.departure_datetime ? ` · ${item.departure_datetime.slice(0, 10)}` : ''}
            </div>
          )}

          {/* C5: rating stars (read-only) — must preserve */}
          {hasRating && (
            <div className="mt-1">
              <RatingStars value={rating} onChange={() => {}} readOnly />
            </div>
          )}

          {item.notes && (
            <div className="mt-1 font-ui text-xs text-wp-ink-muted italic break-words">
              {item.notes.slice(0, 100)}
              {item.notes.length > 100 ? '…' : ''}
            </div>
          )}
        </div>

        {/* Edit / Delete actions (hidden when locked) */}
        {!isLocked && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="font-ui px-2.5 py-1 border border-wp-border rounded text-xs bg-wp-bg-surface hover:bg-wp-bg-subtle cursor-pointer"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="font-ui px-2.5 py-1 border border-wp-btn-destructive-border rounded text-xs bg-wp-btn-destructive-bg text-wp-btn-destructive-text hover:brightness-95 cursor-pointer"
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
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

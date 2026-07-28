/**
 * TripItemsSection — trip-level items (no associated place) within a TripDetail.
 *
 * BUG-36 / IT-01: flights (and car rentals, per PO decision) are trip-wide —
 * they don't belong to one city, so they shouldn't be forced into a
 * PlaceSection. This mirrors PlaceSection's header + item-list + Add Item
 * pattern for consistency, restricted to the Flight and Car Rental item
 * types (the trip-level-appropriate subset — Restaurant/Hotel/Experience
 * are inherently tied to a specific city and stay under PlaceSection).
 *
 * The trigger button is labelled "+ Add Trip Item", not "+ Add Item" —
 * deliberately distinct from PlaceSection's per-place "+ Add Item" button.
 * Two buttons sharing one accessible name on the same page is itself a
 * usability smell (ambiguous for screen-reader users tabbing through, and
 * exactly what broke `.first()` in the pre-existing places-items.spec.ts
 * E2E tests once this section started rendering above the Places list —
 * the label collision, not the DOM position, was the real defect).
 *
 * Data comes from useTripLevelItems, which reads GET /api/trips/:tripId/items
 * (unfiltered) rather than the nested GET /api/trips/:id response — the
 * latter currently drops trip-level items from its `places[].items` shape
 * entirely (see useItems.ts for the flagged backend contract gap).
 */
import { useState } from 'react';
import { useTripLevelItems } from '../../hooks/useItems';
import type { Item, ItemType } from '../../types/api';
import { ErrorMessage } from '../shared/ErrorMessage';
import { ItemCard } from './ItemCard';
import { ItemForm } from './ItemForm';

interface TripItemsSectionProps {
  /** Parent trip ID. */
  tripId: number;
  /** When true, all edit/delete/add controls are hidden. */
  isLocked: boolean;
  /** Trip start date (YYYY-MM-DD) — seeds new-item date defaults (BUG-57/IT-11). */
  tripStartDate: string;
  /** Trip end date (YYYY-MM-DD) — seeds new-item "end" date defaults (IT-11). */
  tripEndDate: string;
}

/** Item types offered at trip level — see module doc for rationale. */
const TRIP_LEVEL_ITEM_TYPES: ItemType[] = ['flight', 'car_rental'];

/**
 * Renders the trip-level items section, including its own "+ Add Trip Item"
 * entry point restricted to Flight and Car Rental.
 *
 * @param tripId - Parent trip ID for item queries/mutations.
 * @param isLocked - When true, hides all write controls.
 */
export function TripItemsSection({
  tripId,
  isLocked,
  tripStartDate,
  tripEndDate,
}: TripItemsSectionProps) {
  const { data: items = [], isLoading, error } = useTripLevelItems(tripId);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const handleEditItem = (item: Item) => setEditingItem(item);
  const handleCloseForm = () => {
    setShowAddItem(false);
    setEditingItem(null);
  };

  // Nothing to add and nothing to show — don't render an empty box.
  if (!isLoading && !error && items.length === 0 && isLocked) return null;

  return (
    <div
      className="border border-wp-border rounded-[14px] max-md:rounded-[16px] overflow-hidden mb-4 bg-wp-bg-surface"
      data-testid="trip-items-section"
    >
      {/* Section header — reskinned to match PlaceSection's header band */}
      <div className="bg-wp-bg-subtle px-[18px] py-4 flex justify-between items-center gap-2 flex-wrap">
        <span className="font-display font-semibold text-[17px] max-md:text-[16px] text-wp-ink">
          Trip Items
        </span>

        {!isLocked && (
          <button
            type="button"
            onClick={() => setShowAddItem(true)}
            className="font-ui font-medium text-[11.5px] rounded-wp px-3.5 py-1.5 bg-wp-primary text-white hover:bg-wp-primary-hover cursor-pointer"
          >
            + Add Trip Item
          </button>
        )}
      </div>

      {/* Items list */}
      <div className="px-[18px] py-3.5 flex flex-col gap-2.5">
        {isLoading && <p className="font-ui text-wp-ink-faint text-xs m-0">Loading trip items…</p>}
        {error && <ErrorMessage error={error} />}
        {!isLoading && !error && items.length === 0 && (
          <p className="font-ui text-wp-ink-faint text-xs m-0">
            No trip-level items yet. Use "+ Add Trip Item" for a flight or car rental that isn't
            tied to a specific city.
          </p>
        )}
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            tripId={tripId}
            isLocked={isLocked}
            onEdit={handleEditItem}
          />
        ))}
      </div>

      {/* Add item modal — restricted to trip-level-appropriate types */}
      {showAddItem && (
        <ItemForm
          tripId={tripId}
          tripPlaceId={null}
          allowedTypes={TRIP_LEVEL_ITEM_TYPES}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          onClose={handleCloseForm}
        />
      )}

      {/* Edit item modal */}
      {editingItem && (
        <ItemForm
          tripId={tripId}
          tripPlaceId={null}
          existingItem={editingItem}
          allowedTypes={TRIP_LEVEL_ITEM_TYPES}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}

/**
 * TripItemsSection — trip-level items (no associated place) within a TripDetail.
 *
 * BUG-36 / IT-01: flights (and car rentals, per PO decision) are trip-wide —
 * they don't belong to one city, so they shouldn't be forced into a
 * PlaceSection. This mirrors PlaceSection's header + item-list + "+ Add Item"
 * pattern for consistency, restricted to the Flight and Car Rental item
 * types (the trip-level-appropriate subset — Restaurant/Hotel/Experience
 * are inherently tied to a specific city and stay under PlaceSection).
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
}

/** Item types offered at trip level — see module doc for rationale. */
const TRIP_LEVEL_ITEM_TYPES: ItemType[] = ['flight', 'car_rental'];

/**
 * Renders the trip-level items section, including its own "+ Add Item" entry
 * point restricted to Flight and Car Rental.
 *
 * @param tripId - Parent trip ID for item queries/mutations.
 * @param isLocked - When true, hides all write controls.
 */
export function TripItemsSection({ tripId, isLocked }: TripItemsSectionProps) {
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
      className="border border-gray-200 rounded-lg overflow-hidden mb-4 shadow-sm"
      data-testid="trip-items-section"
    >
      {/* Section header */}
      <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b border-gray-200">
        <span className="font-semibold text-sm text-gray-900">Trip Items</span>

        {!isLocked && (
          <button
            type="button"
            onClick={() => setShowAddItem(true)}
            className="px-3.5 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-md hover:bg-teal-700 cursor-pointer"
          >
            + Add Item
          </button>
        )}
      </div>

      {/* Items list */}
      <div className="px-4 py-3 flex flex-col gap-2">
        {isLoading && <p className="text-gray-400 text-xs m-0">Loading trip items…</p>}
        {error && <ErrorMessage error={error} />}
        {!isLoading && !error && items.length === 0 && (
          <p className="text-gray-400 text-xs m-0">
            No trip-level items yet. Use "+ Add Item" for a flight or car rental that isn't tied to
            a specific city.
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
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}

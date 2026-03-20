/**
 * PlaceSection — displays one city/place within a TripDetail.
 *
 * BRD v2.4 enhancements:
 *   D-03: Per-place date range derived from hotel items (check_in_date/check_out_date),
 *         falling back to trip start/end dates.
 *   D-04: Country code shown in subtitle (full country name not yet in API — flagged).
 *
 * Shows city name, country, activity tags, date range, and a list of ItemCards.
 * Contains the "Add Item" button (hidden when trip is locked).
 */
import React, { useState } from 'react';
import { ItemCard } from './ItemCard';
import { ItemForm } from './ItemForm';
import { formatDate } from '../../utils/formatDate';
import type { TripPlace, Item } from '../../types/api';

interface PlaceSectionProps {
  /** The place (city + items) to render. */
  place: TripPlace;
  /** Parent trip ID. */
  tripId: number;
  /** When true, all edit/delete controls are hidden. */
  isLocked: boolean;
  /** Trip start date — used as fallback when no hotel items found (D-03). */
  tripStartDate: string;
  /** Trip end date — used as fallback when no hotel items found (D-03). */
  tripEndDate: string;
}

/**
 * Derives the date range for a place from hotel item check-in/check-out dates (D-03).
 * Falls back to trip start/end dates if no hotel items with dates exist.
 */
function derivePlaceDateRange(
  items: TripPlace['items'],
  tripStartDate: string,
  tripEndDate: string,
): { start: string; end: string } {
  const hotelItems = items.filter(
    (item) => item.item_type === 'hotel' && item.check_in_date && item.check_out_date,
  );

  if (hotelItems.length === 0) {
    return { start: tripStartDate, end: tripEndDate };
  }

  const checkIns = hotelItems.map((i) => i.check_in_date as string);
  const checkOuts = hotelItems.map((i) => i.check_out_date as string);
  const start = checkIns.reduce((a, b) => (a < b ? a : b));
  const end = checkOuts.reduce((a, b) => (a > b ? a : b));

  return { start, end };
}

/**
 * Renders a section for one trip place, including all its items.
 *
 * @param place - The trip place including city details and items.
 * @param tripId - Parent trip ID for item mutations.
 * @param isLocked - When true, hides all write controls.
 * @param tripStartDate - Trip start date for fallback date range.
 * @param tripEndDate - Trip end date for fallback date range.
 */
export function PlaceSection({ place, tripId, isLocked, tripStartDate, tripEndDate }: PlaceSectionProps) {
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const handleEditItem = (item: Item) => setEditingItem(item);
  const handleCloseForm = () => {
    setShowAddItem(false);
    setEditingItem(null);
  };

  // D-03: derive place date range from hotel items
  const dateRange = derivePlaceDateRange(place.items, tripStartDate, tripEndDate);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
      {/* Section header */}
      <div className="bg-gray-50 px-4 py-3 flex justify-between items-center border-b border-gray-200">
        <div>
          {/* D-04: City name + country code (full country name not yet in API — see completion report) */}
          <span className="font-semibold text-sm text-gray-900">{place.city.name}</span>
          <span className="ml-1.5 text-xs text-gray-500">{place.city.country_code}</span>

          {/* D-03: Per-place date range */}
          <p className="mt-0.5 text-xs text-gray-500">
            {formatDate(dateRange.start)} – {formatDate(dateRange.end)}
          </p>

          {/* Activity tags */}
          {place.activities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {place.activities.map((a) => (
                <span
                  key={a.id}
                  className="inline-block px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700"
                >
                  {a.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {!isLocked && (
          <button
            type="button"
            onClick={() => setShowAddItem(true)}
            className="px-3.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 cursor-pointer"
          >
            + Add Item
          </button>
        )}
      </div>

      {/* Items list */}
      <div className="px-4 py-3 flex flex-col gap-2">
        {place.items.length === 0 && (
          <p className="text-gray-400 text-xs m-0">
            No items yet. {!isLocked && 'Add one with "+ Add Item".'}
          </p>
        )}
        {place.items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            tripId={tripId}
            isLocked={isLocked}
            onEdit={handleEditItem}
          />
        ))}
      </div>

      {/* Add item modal */}
      {showAddItem && (
        <ItemForm
          tripId={tripId}
          tripPlaceId={place.id}
          onClose={handleCloseForm}
        />
      )}

      {/* Edit item modal */}
      {editingItem && (
        <ItemForm
          tripId={tripId}
          tripPlaceId={place.id}
          existingItem={editingItem}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}

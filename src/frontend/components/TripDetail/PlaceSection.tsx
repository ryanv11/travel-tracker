/**
 * PlaceSection — displays one city/place within a TripDetail.
 *
 * BRD v2.4 enhancements:
 *   D-03: Per-place date range derived from hotel items (check_in_date/check_out_date),
 *         falling back to trip start/end dates.
 *   D-04: Full country name shown in subtitle (joined from countries table — issue #5).
 *   UX-02: Explicit arrived_on / departed_on dates on place; edit dates via PATCH.
 *
 * Shows city name, country, activity tags, date range, and a list of ItemCards.
 * Contains the "Add Item" button (hidden when trip is locked).
 */
import { useState } from 'react';
import type { Item, TripPlace } from '../../types/api';
import { formatDate } from '../../utils/formatDate';
import { resolvePlaceDateRange } from '../../utils/resolvePlaceDateRange';
import { ItemCard } from './ItemCard';
import { ItemForm } from './ItemForm';
import { PlaceDateForm } from './PlaceDateForm';

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
 * Formats a resolved date range for display.
 * Handles null `from` or `to` gracefully.
 */
function formatDateRange(from: string | null, to: string | null): string {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `From ${formatDate(from)}`;
  if (to) return `Until ${formatDate(to)}`;
  return '';
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
export function PlaceSection({
  place,
  tripId,
  isLocked,
  tripStartDate,
  tripEndDate,
}: PlaceSectionProps) {
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showEditDates, setShowEditDates] = useState(false);

  const handleEditItem = (item: Item) => setEditingItem(item);
  const handleCloseForm = () => {
    setShowAddItem(false);
    setEditingItem(null);
  };

  // UX-02: resolve date range using three-source precedence (ADL-24 §5)
  const dateRange = resolvePlaceDateRange(place, tripStartDate, tripEndDate);
  const dateRangeDisplay = formatDateRange(dateRange.from, dateRange.to);

  // Determine if explicit dates are set (to show a visual indicator)
  const hasExplicitDates =
    (place.arrived_on ?? null) !== null || (place.departed_on ?? null) !== null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4 shadow-sm">
      {/* Section header */}
      <div className="bg-gray-100 px-4 py-3 flex justify-between items-start border-b border-gray-200">
        <div className="min-w-0">
          {/* D-04: City name + full country name from API (issue #5) */}
          <span className="font-semibold text-sm text-gray-900">{place.city.name}</span>

          {/* D-03/UX-02: Country name · date range on single subtitle line */}
          <p className="mt-0.5 text-xs text-gray-500">
            {place.city.country_name ?? place.city.country_code}
            {dateRangeDisplay && (
              <>
                {' · '}
                <span className={hasExplicitDates ? 'text-teal-700 font-medium' : ''}>
                  {dateRangeDisplay}
                </span>
              </>
            )}
          </p>

          {/* Activity tags */}
          {place.activities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {place.activities.map((a) => (
                <span
                  key={a.id}
                  className="inline-block px-2 py-0.5 rounded text-xs bg-violet-100 text-violet-800"
                >
                  {a.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* UX-02: Edit dates button (hidden when locked) */}
          {!isLocked && (
            <button
              type="button"
              onClick={() => setShowEditDates(true)}
              className="px-2.5 py-1.5 border border-gray-300 rounded-md bg-white text-xs text-gray-600 hover:bg-gray-50 cursor-pointer"
              title="Edit arrival / departure dates"
            >
              {hasExplicitDates ? 'Edit dates' : 'Set dates'}
            </button>
          )}

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
      {showAddItem && <ItemForm tripId={tripId} tripPlaceId={place.id} onClose={handleCloseForm} />}

      {/* Edit item modal */}
      {editingItem && (
        <ItemForm
          tripId={tripId}
          tripPlaceId={place.id}
          existingItem={editingItem}
          onClose={handleCloseForm}
        />
      )}

      {/* UX-02: Edit place dates modal */}
      {showEditDates && (
        <PlaceDateForm
          tripId={tripId}
          placeId={place.id}
          currentArrivedOn={place.arrived_on ?? null}
          currentDepartedOn={place.departed_on ?? null}
          cityName={place.city.name}
          onClose={() => setShowEditDates(false)}
        />
      )}
    </div>
  );
}

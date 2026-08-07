/**
 * PlaceSection — displays one city/place within a TripDetail.
 *
 * WP-03/WP-04: reskinned with Waypoint tokens (card 14px radius desktop / 16px
 * mobile, `bg-subtle` header band). Structure and every write control below are
 * unchanged from the pre-reskin implementation — the mockup omits Set/Edit
 * dates and Remove entirely (C4), so both are preserved here exactly.
 *
 * BRD v2.4 enhancements:
 *   D-03: Per-place date range derived from hotel items (check_in_date/check_out_date),
 *         falling back to trip start/end dates.
 *   D-04: Full country name shown in subtitle (joined from countries table — issue #5).
 *   UX-02: Explicit arrived_on / departed_on dates on place; edit dates via PATCH.
 *   BUG-32: Remove-place affordance — confirmation required, hidden when trip is locked.
 *
 * Shows city name, country, activity tags, date range, and a list of ItemCards.
 * Contains the "Add Item" button and the "Remove" button (both hidden when trip is locked).
 *
 * IT-08: this is the item list view that actually carries rated items —
 * restaurants, hotels, and experiences all attach to a place, and this is
 * where they render (see TripItemsSection.tsx's module doc for why *that*
 * sibling view deliberately carries no rating controls: it's restricted to
 * Flight/Car Rental, neither of which is ever rateable). Sort/filter state
 * is local component state, not part of a query key — see B8's completion
 * report for the reasoning (place.items arrives pre-loaded, nested inside
 * the trip detail fetch, which has no sort_by/min_rating support). Being
 * local state also gives IT-08's "does not leak between trips" for free:
 * navigating to a different trip mounts a fresh PlaceSection per place with
 * fresh state, it isn't carried over.
 *
 * The city name links to /cities/:id (IT-09's cross-trip view, CityItemsPage).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BADGE_HUE_CLASSES, BADGE_SHAPE_CLASSES, BADGE_TEXT_CLASSES } from '../../design/badges';
import { useCountries } from '../../hooks/useAdmin';
import {
  applyRatingSortFilter,
  DEFAULT_RATING_SORT_FILTER,
  type RatingSortFilterState,
} from '../../hooks/useItems';
import { useRemovePlace } from '../../hooks/usePlaces';
import type { Item, TripPlace } from '../../types/api';
import { formatCitySubtitle } from '../../utils/formatCitySubtitle';
import { formatDate } from '../../utils/formatDate';
import { resolvePlaceDateRange } from '../../utils/resolvePlaceDateRange';
import { EditIcon } from '../icons';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { RatingSortFilterControls } from '../shared/RatingSortFilterControls';
import { ChangeCityModal } from './ChangeCityModal';
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
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  // UX-12/BUG-75 (design §8.1): standing correction entry point.
  const [showChangeCity, setShowChangeCity] = useState(false);
  // IT-08: local, per-place — see module doc for why this is client state
  // rather than a query param.
  const [ratingSortFilter, setRatingSortFilter] = useState<RatingSortFilterState>(
    DEFAULT_RATING_SORT_FILTER,
  );

  const removePlace = useRemovePlace();
  const { data: countries = [] } = useCountries();

  // BUG-80: D-04's "full country name" contract stays intact — countryDisplay
  // is place.city.country_name (falling back to the code only when the name
  // itself is unavailable, e.g. list/map-shaped City objects), region info is
  // layered on top of it via the shared formatter rather than a bespoke
  // string here. Two saved places named "Newport" in different UK regions
  // used to both render exactly "United Kingdom" on this line with nothing to
  // tell them apart (PO UAT finding, BUG-80/#388).
  const citySubtitle = formatCitySubtitle(
    place.city,
    countries,
    place.city.country_name ?? place.city.country_code,
  );

  const handleEditItem = (item: Item) => setEditingItem(item);
  const handleCloseForm = () => {
    setShowAddItem(false);
    setEditingItem(null);
  };

  // BUG-32: opens the confirmation dialog and clears any previous attempt's error
  const handleOpenRemoveConfirm = () => {
    removePlace.reset();
    setShowRemoveConfirm(true);
  };

  const handleCancelRemove = () => {
    removePlace.reset();
    setShowRemoveConfirm(false);
  };

  // Dialog stays open on failure so the user sees why (e.g. the trip locked
  // between opening the confirm and clicking it, or a backend error) —
  // it only closes after a confirmed success.
  const handleConfirmRemove = () => {
    removePlace.mutate(
      { tripId, placeId: place.id },
      { onSuccess: () => setShowRemoveConfirm(false) },
    );
  };

  // UX-02: resolve date range using three-source precedence (ADL-24 §5)
  const dateRange = resolvePlaceDateRange(place, tripStartDate, tripEndDate);
  const dateRangeDisplay = formatDateRange(dateRange.from, dateRange.to);

  // Determine if explicit dates are set (to show a visual indicator)
  const hasExplicitDates =
    (place.arrived_on ?? null) !== null || (place.departed_on ?? null) !== null;

  return (
    <div className="border border-wp-border rounded-[14px] max-md:rounded-[16px] overflow-hidden mb-4 bg-wp-bg-surface">
      {/* Section header */}
      <div className="bg-wp-bg-subtle px-[18px] py-4 flex justify-between items-start gap-2 flex-wrap">
        <div className="min-w-0">
          {/* D-04: City name + full country name from API (issue #5).
              IT-09: links to the cross-trip rated-items view for this city. */}
          <Link
            to={`/cities/${place.city.id}`}
            state={{
              cityName: place.city.name,
              countryName: place.city.country_name,
              citySubtitle,
            }}
            className="font-display font-semibold text-[17px] max-md:text-[16px] text-wp-ink hover:text-wp-primary hover:underline no-underline"
          >
            {place.city.name}
          </Link>

          {/* D-03/UX-02/BUG-80: region (when applicable) + country name · date
              range on single subtitle line */}
          <p className="mt-0.5 font-ui text-[12px] text-wp-ink-muted">
            {citySubtitle}
            {dateRangeDisplay && (
              <>
                {' · '}
                <span className={hasExplicitDates ? 'text-wp-primary font-medium' : ''}>
                  {dateRangeDisplay}
                </span>
              </>
            )}
          </p>

          {/* UX-12/BUG-75 (design §8.3, AC-11): "Location not confirmed"
              badge — shown whenever the city's geocode hasn't resolved,
              regardless of isLocked (a passive discoverability signal for
              the Change-city control, not a write action). Reuses the
              existing `locked` hue — no new hue (UX spec §12.2 MVP). */}
          {place.city.geocode_status !== 'resolved' && (
            <span
              className={`mt-1.5 inline-block whitespace-nowrap ${BADGE_HUE_CLASSES.locked.bg} ${BADGE_HUE_CLASSES.locked.text} ${BADGE_SHAPE_CLASSES.chip} ${BADGE_TEXT_CLASSES}`}
            >
              Location not confirmed
            </span>
          )}

          {/* Activity tags */}
          {place.activities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {place.activities.map((a) => (
                <span
                  key={a.id}
                  className="inline-block rounded-[7px] px-2.5 py-1 text-[11px] font-ui font-medium bg-wp-category-bg text-wp-category-text"
                >
                  {a.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {/* UX-02: Edit dates button (hidden when locked) — must preserve (C4) */}
          {!isLocked && (
            <button
              type="button"
              onClick={() => setShowEditDates(true)}
              className="font-ui text-xs rounded-wp px-2.5 py-1.5 bg-wp-bg-surface text-wp-ink border border-wp-border hover:bg-wp-bg-subtle cursor-pointer"
              title="Edit arrival / departure dates"
            >
              {hasExplicitDates ? 'Edit dates' : 'Set dates'}
            </button>
          )}

          {/* UX-12/BUG-75 (design §8.1, AC-8): standing correction control —
              visible on every unlocked place regardless of geocode_status
              (the correction right is not conditional on location status);
              hidden under the same isLocked rule as Remove. */}
          {!isLocked && (
            <button
              type="button"
              onClick={() => setShowChangeCity(true)}
              aria-label="Change city"
              className="font-ui text-xs rounded-wp px-2.5 py-1.5 bg-wp-bg-surface text-wp-ink border border-wp-border hover:bg-wp-bg-subtle cursor-pointer inline-flex items-center gap-1.5"
              title="Change the city for this place"
            >
              <EditIcon size={12} />
              Change city
            </button>
          )}

          {!isLocked && (
            <button
              type="button"
              onClick={() => setShowAddItem(true)}
              className="font-ui font-medium text-[11.5px] rounded-wp px-3.5 py-1.5 bg-wp-primary text-white hover:bg-wp-primary-hover cursor-pointer"
            >
              + Add Item
            </button>
          )}

          {/* BUG-32: Remove place button (hidden when locked) — must preserve (C4).
              Deliberately NOT using an aria-label built from place.city.name here:
              an earlier version used aria-label={`Remove ${place.city.name} from trip`},
              which broke two pre-existing E2E tests (places-items.spec.ts) whose fixture
              cities are named "EditCity" / "DeleteCity" — Playwright's getByRole name
              matching is a case-insensitive SUBSTRING match by default (no exact:true),
              so "Remove EditCity from trip" matched name:'Edit' and "Remove DeleteCity
              from trip" matched name:'Delete', hijacking .nth(1)/.first() clicks meant
              for the item's own Edit/Delete buttons. The visible text "Remove" is the
              accessible name here (title is a tooltip only, not a name source when
              text content is present) — it's identical to the dialog's confirm button,
              which is intentional and safe: they're never both mounted at once (the
              dialog is unmounted until opened), so tests select the header button by
              plain name before opening, then scope the confirm click to the dialog. */}
          {!isLocked && (
            <button
              type="button"
              onClick={handleOpenRemoveConfirm}
              className="font-ui text-xs rounded-wp px-2.5 py-1.5 bg-wp-btn-destructive-bg text-wp-btn-destructive-text border border-wp-btn-destructive-border hover:brightness-95 cursor-pointer"
              title="Remove this place from the trip"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Items list */}
      <div className="px-[18px] py-3.5 flex flex-col gap-2.5">
        {place.items.length === 0 && (
          <p className="font-ui text-wp-ink-faint text-xs m-0">
            No items yet. {!isLocked && 'Add one with "+ Add Item".'}
          </p>
        )}

        {/* IT-08: sort/filter controls — only worth showing once there's something
            to sort/filter. */}
        {place.items.length > 0 && (
          <RatingSortFilterControls
            sortOrder={ratingSortFilter.sortOrder}
            minRating={ratingSortFilter.minRating}
            onSortOrderChange={(sortOrder) =>
              setRatingSortFilter((prev) => ({ ...prev, sortOrder }))
            }
            onMinRatingChange={(minRating) =>
              setRatingSortFilter((prev) => ({ ...prev, minRating }))
            }
          />
        )}

        {(() => {
          const displayedItems = applyRatingSortFilter(place.items, ratingSortFilter);
          if (place.items.length > 0 && displayedItems.length === 0) {
            return (
              <p className="font-ui text-wp-ink-faint text-xs m-0">No items match this filter.</p>
            );
          }
          return displayedItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              tripId={tripId}
              isLocked={isLocked}
              onEdit={handleEditItem}
            />
          ));
        })()}
      </div>

      {/* Add item modal */}
      {showAddItem && (
        <ItemForm
          tripId={tripId}
          tripPlaceId={place.id}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          onClose={handleCloseForm}
        />
      )}

      {/* Edit item modal */}
      {editingItem && (
        <ItemForm
          tripId={tripId}
          tripPlaceId={place.id}
          existingItem={editingItem}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
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
          citySubtitle={citySubtitle}
          onClose={() => setShowEditDates(false)}
        />
      )}

      {/* UX-12/BUG-75: Change-city correction modal (design §8.2) */}
      {showChangeCity && (
        <ChangeCityModal
          tripId={tripId}
          placeId={place.id}
          onClose={() => setShowChangeCity(false)}
        />
      )}

      {/* BUG-32: Remove place confirmation — cascades to items/activity tags server-side */}
      <ConfirmDialog
        isOpen={showRemoveConfirm}
        title={`Remove ${place.city.name}?`}
        message={
          place.items.length > 0
            ? `This permanently removes ${place.city.name} from the trip, along with the ` +
              `${place.items.length} item${place.items.length === 1 ? '' : 's'} logged under it. This cannot be undone.`
            : `This permanently removes ${place.city.name} from the trip. This cannot be undone.`
        }
        confirmLabel="Remove"
        onConfirm={handleConfirmRemove}
        onCancel={handleCancelRemove}
        error={removePlace.error}
        isConfirming={removePlace.isPending}
      />
    </div>
  );
}

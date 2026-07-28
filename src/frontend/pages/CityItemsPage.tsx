/**
 * CityItemsPage — cross-trip rated items for one city (IT-09).
 *
 * New page/route added by B8: before this, GET /api/cities/:id/items had no
 * frontend consumer at all (confirmed by two probes — a repo-wide grep for
 * any reference to the endpoint or a hook wrapping it found only the CityItem
 * type declaration in types/api.ts, and reading useCities.ts in full showed
 * no query function for it). IT-09's success criteria require this cross-trip
 * view to exist and behave correctly, so it's built here rather than left
 * unimplemented — see the B8 completion report for the scope note.
 *
 * Reached via the city-name link in PlaceSection.tsx. The city's display name
 * comes from router location.state (passed by that link) since the
 * /api/cities/:id/items response itself carries no city name/country —
 * falls back to a generic "This city" heading on a direct/refreshed visit
 * where state isn't available.
 *
 * Rating sort/filter here is server-side via useCityItems's query params
 * (GET /api/cities/:id/items?sort_by=rating&sort_order=&min_rating=), unlike
 * PlaceSection's client-side approach — this endpoint was built for exactly
 * this and already defaults to rating DESC unfiltered.
 */
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { BackChevronIcon, ITEM_TYPE_ICONS } from '../components/icons';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { RatingSortFilterControls } from '../components/shared/RatingSortFilterControls';
import { RatingStars } from '../components/shared/RatingStars';
import { useCityItems } from '../hooks/useCities';
import { DEFAULT_RATING_SORT_FILTER, type RatingSortFilterState } from '../hooks/useItems';
import type { CityItem } from '../types/api';
import { formatDate } from '../utils/formatDate';

interface CityLinkState {
  cityName?: string;
  countryName?: string | null;
}

/** Derives the display label and effective rating for a city item, per its type. */
function getCityItemDisplay(item: CityItem): {
  label: string;
  rating: number | null;
  postVisitNotes: string | null;
} {
  switch (item.item_type) {
    case 'restaurant':
      return {
        label: item.restaurant_name ?? 'Restaurant',
        rating: item.restaurant_rating,
        postVisitNotes: item.restaurant_post_visit_notes,
      };
    case 'hotel':
      return {
        label: item.hotel_property_name ?? 'Hotel',
        rating: item.hotel_rating,
        postVisitNotes: item.hotel_post_visit_notes,
      };
    case 'experience':
      return {
        label: item.notes?.slice(0, 50) ?? 'Experience',
        rating: item.experience_rating,
        postVisitNotes: null,
      };
    default:
      return { label: 'Item', rating: null, postVisitNotes: null };
  }
}

/**
 * Renders every completed, rated restaurant/hotel/experience item across all
 * trips that visited this city, with the same rating sort/filter controls
 * PlaceSection uses (IT-09: "behaves identically to the trip-level view").
 * Each row stays attributable to its source trip (name + start date).
 */
export function CityItemsPage() {
  const { id } = useParams<{ id: string }>();
  const cityId = id !== undefined ? Number(id) : undefined;
  const location = useLocation();
  const state = (location.state as CityLinkState | null) ?? {};

  const [ratingSortFilter, setRatingSortFilter] = useState<RatingSortFilterState>(
    DEFAULT_RATING_SORT_FILTER,
  );

  const {
    data: items,
    isLoading,
    error,
  } = useCityItems(cityId, {
    sortOrder: ratingSortFilter.sortOrder,
    minRating: ratingSortFilter.minRating,
  });

  return (
    <div className="max-w-[720px] mx-auto p-6">
      <Link
        to="/trips"
        className="font-ui text-xs text-wp-ink-muted hover:text-wp-ink inline-flex items-center gap-1 no-underline mb-3"
      >
        <BackChevronIcon size={14} />
        Back to Trips
      </Link>

      <h1 className="font-display font-semibold text-2xl text-wp-ink mb-0.5">
        {state.cityName ?? 'This city'}
      </h1>
      {state.countryName && (
        <p className="font-ui text-sm text-wp-ink-muted mb-4">{state.countryName}</p>
      )}
      {!state.countryName && <div className="mb-4" />}

      <p className="font-ui text-xs text-wp-ink-faint mb-4">
        Completed restaurants, hotels, and experiences across every trip that visited this city.
      </p>

      {items && items.length > 0 && (
        <div className="mb-4">
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
        </div>
      )}

      {isLoading && <LoadingSpinner message="Loading items…" />}
      {error && <ErrorMessage error={error} />}

      {!isLoading && !error && items && items.length === 0 && (
        <p className="font-ui text-wp-ink-faint text-sm">
          {ratingSortFilter.minRating != null
            ? 'No items match this filter.'
            : 'No completed items yet across your visits to this city.'}
        </p>
      )}

      {!isLoading && !error && items && items.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => {
            const { label, rating, postVisitNotes } = getCityItemDisplay(item);
            const TypeIcon = ITEM_TYPE_ICONS[item.item_type] ?? ITEM_TYPE_ICONS.experience;
            return (
              <div
                key={item.id}
                className="p-3.5 border border-wp-border-soft rounded-[11px] bg-wp-bg-page"
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-wp-primary-subtle flex items-center justify-center flex-shrink-0">
                    <TypeIcon size={16} className="text-wp-primary" />
                  </span>
                  <span className="font-ui font-bold text-[13.5px] text-wp-ink break-words">
                    {label}
                  </span>
                  {/* IT-09: item remains attributable to the trip it belongs to */}
                  <span className="text-[11px] font-ui text-wp-ink-muted bg-wp-bg-chip px-1.5 py-0.5 rounded">
                    {item.trip_name} · {formatDate(item.trip_start_date)}
                  </span>
                </div>

                <div className="mt-1">
                  <RatingStars value={rating} onChange={() => {}} readOnly />
                </div>

                {postVisitNotes && (
                  <div className="mt-1 font-ui text-xs text-wp-ink-muted italic break-words">
                    {postVisitNotes.slice(0, 150)}
                    {postVisitNotes.length > 150 ? '…' : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * RatingSortFilterControls — shared sort/filter UI for rated item lists (IT-08/IT-09).
 *
 * Used by PlaceSection (trip-level, per-place item lists) and CityItemsPage
 * (cross-trip city-level item list) so both surfaces present the same
 * control shape and labels per the BRD's "all item list views" requirement.
 * Purely presentational/controlled — callers own the sort/filter state and
 * how it's applied (client-side in PlaceSection, via query params in
 * CityItemsPage) via hooks/useItems.ts's RatingSortFilterState shape.
 */
import type { RatingSortOrder } from '../../hooks/useItems';

interface RatingSortFilterControlsProps {
  sortOrder: RatingSortOrder;
  minRating: number | null;
  onSortOrderChange: (value: RatingSortOrder) => void;
  onMinRatingChange: (value: number | null) => void;
}

const SELECT_CLASS =
  'font-ui text-xs rounded-wp px-2 py-1 bg-wp-bg-surface text-wp-ink border border-wp-border cursor-pointer';

/**
 * Renders a rating-sort dropdown, a minimum-rating filter dropdown, and a
 * "Clear" button shown only when either control has an active (non-default)
 * value — clicking it resets both to DEFAULT_RATING_SORT_FILTER (IT-08 AC:
 * clearing sort/filter returns the list to its default order).
 */
export function RatingSortFilterControls({
  sortOrder,
  minRating,
  onSortOrderChange,
  onMinRatingChange,
}: RatingSortFilterControlsProps) {
  const isActive = sortOrder !== null || minRating !== null;

  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <label className="font-ui text-[11px] text-wp-ink-muted flex items-center gap-1.5">
        Sort
        <select
          aria-label="Sort by rating"
          value={sortOrder ?? ''}
          onChange={(e) =>
            onSortOrderChange(e.target.value === '' ? null : (e.target.value as 'asc' | 'desc'))
          }
          className={SELECT_CLASS}
        >
          <option value="">Default</option>
          <option value="desc">Rating: high to low</option>
          <option value="asc">Rating: low to high</option>
        </select>
      </label>

      <label className="font-ui text-[11px] text-wp-ink-muted flex items-center gap-1.5">
        Min rating
        <select
          aria-label="Minimum rating filter"
          value={minRating ?? ''}
          onChange={(e) => onMinRatingChange(e.target.value === '' ? null : Number(e.target.value))}
          className={SELECT_CLASS}
        >
          <option value="">Any</option>
          <option value="1">1+</option>
          <option value="2">2+</option>
          <option value="3">3+</option>
          <option value="4">4+</option>
          <option value="5">5</option>
        </select>
      </label>

      {isActive && (
        <button
          type="button"
          onClick={() => {
            onSortOrderChange(null);
            onMinRatingChange(null);
          }}
          className="font-ui text-[11px] text-wp-ink-muted underline hover:text-wp-ink cursor-pointer bg-transparent border-none px-0"
        >
          Clear
        </button>
      )}
    </div>
  );
}

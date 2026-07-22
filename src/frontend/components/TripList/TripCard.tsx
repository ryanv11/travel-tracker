import { useNavigate } from 'react-router-dom';
import type { TripSummary } from '../../types/api';
import { formatDate } from '../../utils/formatDate';
import { StatusBadge } from '../shared/StatusBadge';

interface TripCardProps {
  /** The trip to display. */
  trip: TripSummary;
  /** Whether this card is the currently selected trip in the two-panel layout. */
  isSelected?: boolean;
  /** Whether the list is in multi-select delete mode. */
  selectionMode?: boolean;
  /** Whether this card is checked in selection mode. */
  isChecked?: boolean;
  /** Called when the checkbox state changes. */
  onCheckChange?: (id: number, checked: boolean) => void;
  /**
   * WP-04: 'mobile' bumps padding/radius/type-size per spec (16px/16px/18px vs
   * desktop's 14px/14px/16.5px) — a deliberate touch-target size bump, not
   * accidental. Defaults to 'desktop'.
   */
  density?: 'desktop' | 'mobile';
}

/** Maximum number of place badges to show before truncating (D-06). */
const MAX_PLACE_BADGES = 4;

/**
 * Renders a single trip card with name, dates, status, companions,
 * categories, and place badges (D-06). WP-03/WP-04: reskinned with Waypoint
 * tokens; no horizontal scrolling — name truncates with ellipsis, but the
 * place/category chip row wraps onto additional lines rather than scrolling
 * (mobile no-horizontal-scroll constraint; applies at every width).
 *
 * @param trip - The trip data to render.
 * @param isSelected - Highlights the card when it is the active trip.
 * @param selectionMode - When true, shows a checkbox instead of navigation.
 * @param isChecked - Whether the checkbox is checked.
 * @param onCheckChange - Callback when checkbox changes.
 * @param density - 'desktop' (default) or 'mobile' sizing.
 */
export function TripCard({
  trip,
  isSelected = false,
  selectionMode = false,
  isChecked = false,
  onCheckChange,
  density = 'desktop',
}: TripCardProps) {
  const navigate = useNavigate();

  const places = trip.places ?? [];
  const visiblePlaces = places.slice(0, MAX_PLACE_BADGES);
  const extraCount = places.length - MAX_PLACE_BADGES;
  const isLocked = trip.status === 'locked';
  const isMobile = density === 'mobile';

  const handleClick = () => {
    if (selectionMode) {
      if (!isLocked && onCheckChange) {
        onCheckChange(trip.id, !isChecked);
      }
      return;
    }
    navigate(String(trip.id));
  };

  const selectedRing =
    isSelected && !selectionMode
      ? 'border-[1.5px] border-wp-primary shadow-[0_2px_10px_oklch(38%_0.07_195_/_0.12)]'
      : 'border border-wp-border';
  const checkedRing =
    selectionMode && isChecked && !isLocked ? 'border-[1.5px] border-wp-primary' : '';

  return (
    <div
      className={`bg-wp-bg-surface transition-shadow ${isMobile ? 'p-4 rounded-[16px]' : 'p-3.5 rounded-[14px]'} ${
        selectionMode
          ? isLocked
            ? 'opacity-50 cursor-default'
            : 'cursor-pointer hover:shadow-[0_4px_14px_oklch(22%_0.02_75_/_0.14)]'
          : 'cursor-pointer hover:shadow-[0_4px_14px_oklch(22%_0.02_75_/_0.14)]'
      } ${selectedRing} ${checkedRing}`}
      onClick={handleClick}
    >
      {/* Header row: checkbox (selection mode) or name + status */}
      <div className="flex justify-between items-start gap-2">
        {selectionMode && (
          <div className="flex-shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={isLocked}
              onChange={(e) => {
                if (onCheckChange) onCheckChange(trip.id, e.target.checked);
              }}
              aria-label={`Select trip ${trip.name}`}
              className="h-4 w-4 rounded border-wp-border text-wp-primary focus:ring-wp-primary disabled:opacity-40"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3
            className={`font-display font-semibold text-wp-ink truncate ${isMobile ? 'text-[18px]' : 'text-[16.5px]'}`}
          >
            {trip.name}
          </h3>
          <p className="font-ui text-[12px] text-wp-ink-muted mt-0.5">
            {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusBadge status={trip.status} />
        </div>
      </div>

      {/* D-06: Place name badges — wrap, never scroll horizontally */}
      {places.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {visiblePlaces.map((p) => (
            <span
              key={p.id}
              className={`inline-block rounded-[7px] px-2.5 py-1 text-[11px] font-ui bg-wp-bg-subtle text-wp-ink-muted ${isMobile ? 'rounded-[8px]' : ''}`}
            >
              {p.city.name}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="inline-block rounded-[7px] px-2.5 py-1 text-[11px] font-ui bg-wp-bg-subtle text-wp-ink-faint">
              +{extraCount} more
            </span>
          )}
        </div>
      )}

      {/* Categories — hue 255, rounded-rect chip shape (not a pill) on list cards */}
      {trip.categories.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {trip.categories.map((cat) => (
            <span
              key={cat.id}
              className={`inline-block rounded-[7px] px-2.5 py-1 text-[11px] font-ui font-medium bg-wp-category-bg text-wp-category-text ${isMobile ? 'rounded-[8px]' : ''}`}
            >
              {cat.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

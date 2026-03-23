/**
 * resolvePlaceDateRange — three-source precedence model for place date ranges (ADL-24 §5).
 *
 * Precedence order (highest to lowest):
 *   1. Explicit place dates (arrived_on / departed_on)
 *   2. Hotel item check-in/check-out dates
 *   3. Trip start/end dates
 *
 * Partial explicit dates are supported: if only arrived_on is set, `to` is null.
 */

import type { Item, TripPlace } from '../types/api';

/** Date range returned by resolvePlaceDateRange. null means "not set". */
export interface PlaceDateRange {
  from: string | null;
  to: string | null;
}

/**
 * Resolves the display date range for a trip place using the three-source
 * precedence model from ADL-24 §5.
 *
 * @param place - The trip place (may include arrived_on / departed_on).
 * @param tripStartDate - Trip-level start date (YYYY-MM-DD).
 * @param tripEndDate - Trip-level end date (YYYY-MM-DD).
 * @returns Resolved { from, to } date range.
 */
export function resolvePlaceDateRange(
  place: Pick<TripPlace, 'arrived_on' | 'departed_on' | 'items'>,
  tripStartDate: string,
  tripEndDate: string,
): PlaceDateRange {
  // Source 1: explicit place dates — takes precedence if either field is set
  const arrivedOn = place.arrived_on ?? null;
  const departedOn = place.departed_on ?? null;

  if (arrivedOn !== null || departedOn !== null) {
    return { from: arrivedOn, to: departedOn };
  }

  // Source 2: hotel item check-in/check-out dates
  const hotelItems: Item[] = (place.items ?? []).filter(
    (item) => item.item_type === 'hotel' && item.check_in_date && item.check_out_date,
  );

  if (hotelItems.length > 0) {
    const checkIns = hotelItems.map((i) => i.check_in_date as string);
    const checkOuts = hotelItems.map((i) => i.check_out_date as string);
    const from = checkIns.reduce((a, b) => (a < b ? a : b));
    const to = checkOuts.reduce((a, b) => (a > b ? a : b));
    return { from, to };
  }

  // Source 3: trip dates (fallback)
  return { from: tripStartDate, to: tripEndDate };
}

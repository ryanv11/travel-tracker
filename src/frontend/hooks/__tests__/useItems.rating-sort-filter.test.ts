/**
 * Unit tests for applyRatingSortFilter (IT-08) — the pure client-side
 * sort/filter helper PlaceSection uses (see useItems.ts for why this is
 * client-side rather than a query param, and the B8 completion report for
 * the full reasoning).
 *
 * Mirrors the semantics asserted server-side in
 * src/backend/routes/__tests__/items.rating-sort-filter.test.ts so the two
 * surfaces agree, per IT-09's "behaves identically to the trip-level view".
 *
 * Source: src/frontend/hooks/useItems.ts
 */
import { describe, expect, it } from 'vitest';
import type { Item } from '../../types/api.js';
import { applyRatingSortFilter, DEFAULT_RATING_SORT_FILTER } from '../useItems.js';

function makeItem(id: number, rating: number | null): Item {
  return {
    id,
    item_type: 'restaurant',
    status: 'completed',
    notes: null,
    map_url: null,
    is_carried_forward: false,
    carried_from_item_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    trip_place_id: 1,
    name: `Item ${id}`,
    neighbourhood_area: null,
    cuisine_type: null,
    source: null,
    rating,
    post_visit_notes: null,
    airline: null,
    flight_number: null,
    departure_airport: null,
    arrival_airport: null,
    departure_datetime: null,
    arrival_datetime: null,
    seat: null,
    property_name: null,
    address: null,
    check_in_date: null,
    check_out_date: null,
    booking_reference: null,
    confirmation_number: null,
    provider: null,
    pickup_location: null,
    dropoff_location: null,
    pickup_datetime: null,
    dropoff_datetime: null,
    vehicle_class: null,
  } as Item;
}

describe('applyRatingSortFilter', () => {
  const items = [makeItem(1, 2), makeItem(2, 5), makeItem(3, null), makeItem(4, 4)];

  it('DEFAULT_RATING_SORT_FILTER (both null) returns the list in its original order, untouched', () => {
    expect(applyRatingSortFilter(items, DEFAULT_RATING_SORT_FILTER)).toEqual(items);
  });

  it('sorts descending by rating, changing the visible order', () => {
    const result = applyRatingSortFilter(items, { sortOrder: 'desc', minRating: null });
    expect(result.map((i) => i.id)).toEqual([2, 4, 1, 3]); // unrated (3) last
  });

  it('sorts ascending by rating, changing the visible order', () => {
    const result = applyRatingSortFilter(items, { sortOrder: 'asc', minRating: null });
    expect(result.map((i) => i.id)).toEqual([1, 4, 2, 3]); // unrated (3) still last, not first
  });

  it('a minimum-rating filter of N shows only items rated N or above', () => {
    const result = applyRatingSortFilter(items, { sortOrder: null, minRating: 4 });
    expect(result.map((i) => i.id).sort()).toEqual([2, 4]);
  });

  it('unrated items are excluded by a minimum-rating filter rather than sorted as zero', () => {
    // A filter of 1 (the lowest real rating) must still drop the unrated item —
    // if null were coerced to 0 it would incorrectly fail every filter >=1
    // (which happens to look right) but for filter semantics generally null
    // must never be treated as a comparable numeric value at all.
    const result = applyRatingSortFilter(items, { sortOrder: null, minRating: 1 });
    expect(result.some((i) => i.rating === null)).toBe(false);
  });

  it('does not mutate the input array', () => {
    const original = [...items];
    applyRatingSortFilter(items, { sortOrder: 'desc', minRating: 3 });
    expect(items).toEqual(original);
  });
});

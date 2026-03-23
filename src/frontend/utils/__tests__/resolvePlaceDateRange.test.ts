/**
 * Tests for resolvePlaceDateRange utility (ADL-24 §5 three-source precedence model).
 */
import { describe, expect, it } from 'vitest';
import type { Item, TripPlace } from '../../types/api';
import { resolvePlaceDateRange } from '../resolvePlaceDateRange';

/** Minimal hotel item factory for testing. */
function hotelItem(checkIn: string, checkOut: string): Item {
  return {
    id: 1,
    item_type: 'hotel',
    status: 'confirmed',
    notes: null,
    is_carried_forward: false,
    carried_from_item_id: null,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    trip_place_id: 1,
    name: null,
    neighbourhood_area: null,
    cuisine_type: null,
    source: null,
    rating: null,
    post_visit_notes: null,
    airline: null,
    flight_number: null,
    departure_airport: null,
    arrival_airport: null,
    departure_datetime: null,
    arrival_datetime: null,
    booking_reference: null,
    seat: null,
    property_name: 'Test Hotel',
    address: null,
    check_in_date: checkIn,
    check_out_date: checkOut,
    confirmation_number: null,
    provider: null,
    pickup_location: null,
    dropoff_location: null,
    pickup_datetime: null,
    dropoff_datetime: null,
    vehicle_class: null,
  };
}

/** Minimal place factory. */
function place(
  overrides: Partial<Pick<TripPlace, 'arrived_on' | 'departed_on' | 'items'>>,
): Pick<TripPlace, 'arrived_on' | 'departed_on' | 'items'> {
  return {
    arrived_on: null,
    departed_on: null,
    items: [],
    ...overrides,
  };
}

const TRIP_START = '2025-06-01';
const TRIP_END = '2025-06-30';

describe('resolvePlaceDateRange', () => {
  describe('Source 1: explicit place dates take highest precedence', () => {
    it('returns explicit dates when both are set', () => {
      const result = resolvePlaceDateRange(
        place({ arrived_on: '2025-06-05', departed_on: '2025-06-10' }),
        TRIP_START,
        TRIP_END,
      );
      expect(result).toEqual({ from: '2025-06-05', to: '2025-06-10' });
    });

    it('returns only from when only arrived_on is set (partial)', () => {
      const result = resolvePlaceDateRange(
        place({ arrived_on: '2025-06-05', departed_on: null }),
        TRIP_START,
        TRIP_END,
      );
      expect(result).toEqual({ from: '2025-06-05', to: null });
    });

    it('returns only to when only departed_on is set (partial)', () => {
      const result = resolvePlaceDateRange(
        place({ arrived_on: null, departed_on: '2025-06-10' }),
        TRIP_START,
        TRIP_END,
      );
      expect(result).toEqual({ from: null, to: '2025-06-10' });
    });

    it('explicit dates take priority over hotel items', () => {
      const result = resolvePlaceDateRange(
        place({
          arrived_on: '2025-06-05',
          departed_on: '2025-06-10',
          items: [hotelItem('2025-06-01', '2025-06-30')],
        }),
        TRIP_START,
        TRIP_END,
      );
      expect(result).toEqual({ from: '2025-06-05', to: '2025-06-10' });
    });

    it('treats undefined arrived_on as not set', () => {
      const result = resolvePlaceDateRange(
        place({ arrived_on: undefined, departed_on: undefined }),
        TRIP_START,
        TRIP_END,
      );
      // Falls through to trip dates (no hotel items)
      expect(result).toEqual({ from: TRIP_START, to: TRIP_END });
    });
  });

  describe('Source 2: hotel items when no explicit dates', () => {
    it('uses hotel check-in/check-out when no explicit dates', () => {
      const result = resolvePlaceDateRange(
        place({ items: [hotelItem('2025-06-05', '2025-06-10')] }),
        TRIP_START,
        TRIP_END,
      );
      expect(result).toEqual({ from: '2025-06-05', to: '2025-06-10' });
    });

    it('takes min check-in and max check-out across multiple hotels', () => {
      const result = resolvePlaceDateRange(
        place({
          items: [
            hotelItem('2025-06-07', '2025-06-12'),
            hotelItem('2025-06-05', '2025-06-10'),
            hotelItem('2025-06-08', '2025-06-15'),
          ],
        }),
        TRIP_START,
        TRIP_END,
      );
      expect(result).toEqual({ from: '2025-06-05', to: '2025-06-15' });
    });

    it('ignores hotel items missing check_in_date or check_out_date', () => {
      const incompleteHotel: Item = {
        ...hotelItem('2025-06-05', '2025-06-10'),
        check_in_date: null,
      };
      const result = resolvePlaceDateRange(
        place({ items: [incompleteHotel] }),
        TRIP_START,
        TRIP_END,
      );
      // Falls through to trip dates because incomplete hotel is excluded
      expect(result).toEqual({ from: TRIP_START, to: TRIP_END });
    });

    it('ignores non-hotel items', () => {
      const restaurant: Item = {
        ...hotelItem('2025-06-05', '2025-06-10'),
        item_type: 'restaurant',
      };
      const result = resolvePlaceDateRange(place({ items: [restaurant] }), TRIP_START, TRIP_END);
      expect(result).toEqual({ from: TRIP_START, to: TRIP_END });
    });
  });

  describe('Source 3: trip dates as fallback', () => {
    it('falls back to trip dates when no explicit dates and no hotel items', () => {
      const result = resolvePlaceDateRange(place({}), TRIP_START, TRIP_END);
      expect(result).toEqual({ from: TRIP_START, to: TRIP_END });
    });

    it('falls back to trip dates when items array is empty', () => {
      const result = resolvePlaceDateRange(place({ items: [] }), TRIP_START, TRIP_END);
      expect(result).toEqual({ from: TRIP_START, to: TRIP_END });
    });
  });
});

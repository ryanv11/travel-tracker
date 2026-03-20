/**
 * Unit tests for the filterAndSortTrips helper (BUG-12).
 *
 * Tests client-side search-by-name, sort-by-date, sort-by-name, and map
 * filter params (country / city). Pure function — no React rendering needed.
 */
import { describe, it, expect } from 'vitest';
import { filterAndSortTrips } from '../TripList.js';
import type { TripSummary } from '../../../types/api.js';

function makeTrip(
  id: number,
  name: string,
  start_date: string,
  places: Array<{ city_id: number; country_code: string }> = [],
): TripSummary {
  return {
    id,
    name,
    start_date,
    end_date: start_date,
    status: 'locked',
    photo_album_ref: null,
    created_at: '',
    updated_at: '',
    categories: [],
    companions: [],
    activities: [],
    places: places.map((p, i) => ({
      id: i + 1,
      city_id: p.city_id,
      city: {
        id: p.city_id,
        name: `City${p.city_id}`,
        country_code: p.country_code,
        country_name: null,
        region_id: null,
        latitude: null,
        longitude: null,
        geocode_status: 'resolved',
      },
    })),
  };
}

const trips: TripSummary[] = [
  makeTrip(1, 'Amsterdam Adventure', '2024-03-01', [{ city_id: 10, country_code: 'NL' }]),
  makeTrip(2, 'Barcelona Bliss', '2023-07-15', [{ city_id: 20, country_code: 'ES' }]),
  makeTrip(3, 'Cairo Calling', '2025-01-10', [{ city_id: 30, country_code: 'EG' }]),
  makeTrip(4, 'Amsterdam Again', '2022-11-20', [{ city_id: 10, country_code: 'NL' }]),
];

describe('filterAndSortTrips — search', () => {
  it('returns all trips when search is empty', () => {
    const result = filterAndSortTrips(trips, '', 'date_desc', null, null, null);
    expect(result).toHaveLength(4);
  });

  it('filters by name substring (case-insensitive)', () => {
    const result = filterAndSortTrips(trips, 'amsterdam', 'date_desc', null, null, null);
    expect(result.map((t) => t.id)).toEqual(expect.arrayContaining([1, 4]));
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no name matches', () => {
    const result = filterAndSortTrips(trips, 'zzznomatch', 'date_desc', null, null, null);
    expect(result).toHaveLength(0);
  });

  it('trims whitespace from search text', () => {
    const result = filterAndSortTrips(trips, '  Cairo  ', 'date_desc', null, null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });
});

describe('filterAndSortTrips — sort', () => {
  it('sorts by date descending (newest first) by default', () => {
    const result = filterAndSortTrips(trips, '', 'date_desc', null, null, null);
    const dates = result.map((t) => t.start_date);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });

  it('sorts by date ascending (oldest first)', () => {
    const result = filterAndSortTrips(trips, '', 'date_asc', null, null, null);
    const dates = result.map((t) => t.start_date);
    expect(dates).toEqual([...dates].sort((a, b) => a.localeCompare(b)));
  });

  it('sorts by name A–Z', () => {
    const result = filterAndSortTrips(trips, '', 'name_asc', null, null, null);
    const names = result.map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('sorts by name Z–A', () => {
    const result = filterAndSortTrips(trips, '', 'name_desc', null, null, null);
    const names = result.map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
  });

  it('does not mutate the input array', () => {
    const original = [...trips];
    filterAndSortTrips(trips, '', 'name_asc', null, null, null);
    expect(trips).toEqual(original);
  });
});

describe('filterAndSortTrips — map filters', () => {
  it('filters by country code', () => {
    const result = filterAndSortTrips(trips, '', 'date_desc', 'NL', null, null);
    expect(result.map((t) => t.id)).toEqual(expect.arrayContaining([1, 4]));
    expect(result).toHaveLength(2);
  });

  it('filters by city ID', () => {
    const result = filterAndSortTrips(trips, '', 'date_desc', null, null, 20);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('city filter takes priority over country filter', () => {
    // city 10 is in NL — if both active, city wins
    const result = filterAndSortTrips(trips, '', 'date_desc', 'ES', null, 10);
    expect(result.map((t) => t.id)).toEqual(expect.arrayContaining([1, 4]));
    expect(result).toHaveLength(2);
  });

  it('returns empty when city filter matches no trips', () => {
    const result = filterAndSortTrips(trips, '', 'date_desc', null, null, 999);
    expect(result).toHaveLength(0);
  });

  it('combines country filter with search text', () => {
    const result = filterAndSortTrips(trips, 'Again', 'date_desc', 'NL', null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(4);
  });
});

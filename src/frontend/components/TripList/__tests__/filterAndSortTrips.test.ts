/**
 * Unit tests for the filterAndSortTrips helper (BUG-12, TR-13).
 *
 * Tests client-side search-by-name, sort-by-date, sort-by-name, and map
 * filter params (country / city). Pure function — no React rendering needed.
 */
import { describe, expect, it } from 'vitest';
import type { TripSummary } from '../../../types/api.js';
import { filterAndSortTrips } from '../TripList.js';

function makeTrip(
  id: number,
  name: string,
  start_date: string,
  places: Array<{
    city_id: number;
    country_code: string;
    city_name?: string;
    region_iso?: string | null;
  }> = [],
  countries: { country_code: string; name: string }[] = [],
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
    countries,
    places: places.map((p, i) => ({
      id: i + 1,
      city_id: p.city_id,
      city: {
        id: p.city_id,
        name: p.city_name ?? `City${p.city_id}`,
        country_code: p.country_code,
        country_name: null,
        region_id: null,
        region_iso: p.region_iso ?? null,
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

describe('filterAndSortTrips — city-name search (TR-13)', () => {
  const tripsWithCityNames: TripSummary[] = [
    makeTrip(10, 'Spring Getaway', '2024-04-01', [
      { city_id: 100, country_code: 'FR', city_name: 'Paris' },
    ]),
    makeTrip(11, 'Summer Vacation', '2024-07-01', [
      { city_id: 101, country_code: 'JP', city_name: 'Tokyo' },
    ]),
    makeTrip(12, 'Multi-city Tour', '2024-09-01', [
      { city_id: 102, country_code: 'IT', city_name: 'Rome' },
      { city_id: 103, country_code: 'IT', city_name: 'Milan' },
    ]),
  ];

  it('matches on city name when trip name does not match', () => {
    const result = filterAndSortTrips(tripsWithCityNames, 'paris', 'date_desc', null, null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(10);
  });

  it('city-name search is case-insensitive', () => {
    const result = filterAndSortTrips(tripsWithCityNames, 'TOKYO', 'date_desc', null, null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(11);
  });

  it('matches trip with multiple cities when any city name matches', () => {
    const result = filterAndSortTrips(tripsWithCityNames, 'Milan', 'date_desc', null, null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(12);
  });

  it('returns trip when query matches both trip name and city name', () => {
    // "Vacation" matches trip name; also check city name match is additive, not exclusive
    const result = filterAndSortTrips(tripsWithCityNames, 'Rome', 'date_desc', null, null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(12);
  });

  it('returns no trips when neither trip name nor any city name matches', () => {
    const result = filterAndSortTrips(tripsWithCityNames, 'Berlin', 'date_desc', null, null, null);
    expect(result).toHaveLength(0);
  });

  it('trip-name match still works independently of city-name match', () => {
    const result = filterAndSortTrips(tripsWithCityNames, 'Spring', 'date_desc', null, null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(10);
  });
});

describe('filterAndSortTrips — country-name search (TR-13, BUG-52)', () => {
  const tripsWithCountries: TripSummary[] = [
    makeTrip(
      30,
      'Pacific Northwest Loop',
      '2024-05-01',
      [{ city_id: 300, country_code: 'US', city_name: 'Seattle' }],
      [{ country_code: 'US', name: 'United States' }],
    ),
    makeTrip(
      31,
      'Iberian Escape',
      '2024-06-01',
      [{ city_id: 301, country_code: 'ES', city_name: 'Madrid' }],
      [{ country_code: 'ES', name: 'Spain' }],
    ),
    makeTrip(
      32,
      'North American Grand Tour',
      '2024-07-01',
      [
        { city_id: 302, country_code: 'US', city_name: 'Boston' },
        { city_id: 303, country_code: 'CA', city_name: 'Toronto' },
      ],
      [
        { country_code: 'US', name: 'United States' },
        { country_code: 'CA', name: 'Canada' },
      ],
    ),
  ];

  it('returns a trip whose only US place is a city, when searching the full country name', () => {
    // Binding TR-13 success criterion: a trip whose only US place is "Seattle" is
    // returned when searching "United States".
    const result = filterAndSortTrips(
      tripsWithCountries,
      'United States',
      'date_desc',
      null,
      null,
      null,
    );
    expect(result.map((t) => t.id).sort()).toEqual([30, 32]);
  });

  it('country-name search is case-insensitive', () => {
    const result = filterAndSortTrips(tripsWithCountries, 'spain', 'date_desc', null, null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(31);
  });

  it('matches on substring of the country name', () => {
    const result = filterAndSortTrips(tripsWithCountries, 'Unit', 'date_desc', null, null, null);
    expect(result.map((t) => t.id).sort()).toEqual([30, 32]);
  });

  it('returns no trip that does not visit the searched country', () => {
    const result = filterAndSortTrips(tripsWithCountries, 'Canada', 'date_desc', null, null, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(32);
  });

  it('does NOT match on ISO country code (TR-13 deliberately excludes code matching)', () => {
    const result = filterAndSortTrips(tripsWithCountries, 'US', 'date_desc', null, null, null);
    expect(result).toHaveLength(0);
  });

  it('does NOT match on informal abbreviation (TR-13 deliberately excludes abbreviation matching)', () => {
    const result = filterAndSortTrips(tripsWithCountries, 'USA', 'date_desc', null, null, null);
    expect(result).toHaveLength(0);
  });

  it('trip-name and city-name matching continue to work unchanged alongside country matching', () => {
    const byName = filterAndSortTrips(tripsWithCountries, 'Iberian', 'date_desc', null, null, null);
    expect(byName).toHaveLength(1);
    expect(byName[0].id).toBe(31);

    const byCity = filterAndSortTrips(tripsWithCountries, 'Toronto', 'date_desc', null, null, null);
    expect(byCity).toHaveLength(1);
    expect(byCity[0].id).toBe(32);
  });
});

describe('filterAndSortTrips — region filter (MAP-01)', () => {
  const tripsWithRegions: TripSummary[] = [
    makeTrip(20, 'California Dreaming', '2024-05-01', [
      { city_id: 200, country_code: 'US', region_iso: 'US-CA' },
    ]),
    makeTrip(21, 'New York State of Mind', '2024-06-01', [
      { city_id: 201, country_code: 'US', region_iso: 'US-NY' },
    ]),
    makeTrip(22, 'Texas Trip', '2024-07-01', [
      { city_id: 202, country_code: 'US', region_iso: 'US-TX' },
    ]),
    makeTrip(23, 'No Region City', '2024-08-01', [
      { city_id: 203, country_code: 'FR', region_iso: null },
    ]),
  ];

  it('returns trips with matching region_iso', () => {
    const result = filterAndSortTrips(tripsWithRegions, '', 'date_desc', null, 'US-CA', null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(20);
  });

  it('does not return trips without matching region_iso', () => {
    const result = filterAndSortTrips(tripsWithRegions, '', 'date_desc', null, 'US-CA', null);
    const ids = result.map((t) => t.id);
    expect(ids).not.toContain(21);
    expect(ids).not.toContain(22);
    expect(ids).not.toContain(23);
  });

  it('region filter takes priority over country filter when both present', () => {
    // All trips are US but only US-NY should match when region filter is set
    const result = filterAndSortTrips(tripsWithRegions, '', 'date_desc', 'US', 'US-NY', null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(21);
  });

  it('city filter takes priority over region filter when both present', () => {
    // city 202 is US-TX but city filter should win
    const result = filterAndSortTrips(tripsWithRegions, '', 'date_desc', null, 'US-CA', 202);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(22);
  });

  it('returns empty array when region filter matches no trips', () => {
    const result = filterAndSortTrips(tripsWithRegions, '', 'date_desc', null, 'US-WA', null);
    expect(result).toHaveLength(0);
  });

  it('does not match trips where city region_iso is null', () => {
    const result = filterAndSortTrips(tripsWithRegions, '', 'date_desc', null, 'US-CA', null);
    expect(result.map((t) => t.id)).not.toContain(23);
  });
});

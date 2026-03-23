/**
 * TripList — shared filter/sort utility and legacy list component.
 *
 * The main trip list UI is now in TripsLayout (two-panel shell, TR-11).
 * This file retains filterAndSortTrips for backward compatibility with
 * existing unit tests, and exports it for use by TripsLayout.
 *
 * Server-side filters: status, category, activity (TR-10)
 * Client-side: name search (TR-09), sort by date or name (TR-09)
 * URL-param map filters: ?country=XX, ?region=XX-YY, ?city=NNN (MP-03, GE-09)
 */
import type { TripSummary } from '../../types/api';

type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';

/**
 * Applies client-side search text and sort to an array of trip summaries.
 * Exported for unit testing and for use by TripsLayout.
 */
export function filterAndSortTrips(
  trips: TripSummary[],
  searchText: string,
  sortBy: SortOption,
  countryFilter: string | null,
  regionFilter: string | null,
  cityFilter: number | null,
): TripSummary[] {
  let result = trips;

  // Map filter priority: city > region > country
  if (cityFilter !== null) {
    result = result.filter((t) => t.places.some((p) => p.city_id === cityFilter));
  } else if (regionFilter !== null) {
    result = result.filter((t) => t.places.some((p) => p.city.region_iso === regionFilter));
  } else if (countryFilter !== null) {
    result = result.filter((t) => t.places.some((p) => p.city.country_code === countryFilter));
  }

  // Search by trip name or any city name within the trip's places (TR-13)
  if (searchText.trim()) {
    const q = searchText.trim().toLowerCase();
    result = result.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.places.some((p) => p.city.name.toLowerCase().includes(q)),
    );
  }

  // Sort
  result = [...result].sort((a, b) => {
    if (sortBy === 'date_desc') return b.start_date.localeCompare(a.start_date);
    if (sortBy === 'date_asc') return a.start_date.localeCompare(b.start_date);
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
    if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
    return 0;
  });

  return result;
}

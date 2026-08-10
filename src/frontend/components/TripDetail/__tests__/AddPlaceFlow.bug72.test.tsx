/**
 * BUG-72 — GitHub #363.
 *
 * The city search dropdown in `AddPlaceFlow.tsx` used to render only
 * `{name} {country_code}` ("Springfield US"). Selecting a row binds the trip
 * to one specific `cities` row with specific coordinates — with two
 * same-named cities in different regions rendering identically, the user has
 * no way to tell which one they're picking.
 *
 * The backend half (PR #353) already returns `region_name`/`region_iso` per
 * row from GET /api/cities (verified directly: src/backend/routes/cities.ts's
 * search handler LEFT JOINs `regions` and selects both columns) — this tests
 * the frontend half: rendering that data so rows are distinguishable, and so
 * a region-tier country's city with NO region set is visibly distinct from
 * one that has a region (catalogue-pollution visibility, a deliberate
 * prerequisite for later correction work per the brief).
 *
 * Deliberately a separate file from AddPlaceFlow.test.tsx (D14) and
 * AddPlaceFlow.geocodeFailure.test.tsx (BUG-73) — this exercises the search
 * step, not the new-city form, so there's no overlap to worry about, but
 * keeping bug-scoped files separate matches this component's established
 * pattern while multiple bugs are in flight on it.
 *
 * Source: src/frontend/components/TripDetail/AddPlaceFlow.tsx
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { City, Country } from '../../../types/api';
import { AddPlaceFlow } from '../AddPlaceFlow';

let searchResultsFixture: City[] = [];

vi.mock('../../../hooks/useCities', () => ({
  lookupCityCountry: vi.fn(),
  useCitySearch: () => ({ data: searchResultsFixture, isLoading: false }),
  useCreateCity: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useCarryForwardCandidates: () => ({ data: [], isFetched: false }),
}));

vi.mock('../../../hooks/usePlaces', () => ({
  useAddPlace: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));

const usCountry: Country = {
  country_code: 'US',
  name: 'United States',
  region_tier_enabled: true,
  region_tier_label: 'State',
};

const frCountry: Country = {
  country_code: 'FR',
  name: 'France',
  region_tier_enabled: false,
  region_tier_label: null,
};

vi.mock('../../../hooks/useAdmin', () => ({
  useCountries: () => ({ data: [usCountry, frCountry] }),
  useCountryRegions: () => ({ data: [] }),
}));

function makeCity(overrides: Partial<City>): City {
  return {
    id: 1,
    name: 'Springfield',
    country_code: 'US',
    country_name: null,
    region_id: null,
    region_iso: null,
    region_name: null,
    latitude: null,
    longitude: null,
    geocode_status: 'resolved',
    ...overrides,
  };
}

function renderFlow() {
  return render(
    <AddPlaceFlow
      tripId={1}
      onClose={vi.fn()}
      tripStartDate="2026-01-01"
      tripEndDate="2026-01-10"
      isFirstPlace={false}
      tripCountries={[]}
      onManageCountries={vi.fn()}
    />,
  );
}

async function search(user: ReturnType<typeof userEvent.setup>, query: string) {
  const input = screen.getByPlaceholderText('Search city name…');
  await user.type(input, query);
}

describe('AddPlaceFlow — BUG-72: search dropdown surfaces region', () => {
  it('distinguishes two same-named cities in different regions without selecting either', async () => {
    searchResultsFixture = [
      makeCity({ id: 10, region_id: 3, region_iso: 'US-IL', region_name: 'Illinois' }),
      makeCity({ id: 11, region_id: 4, region_iso: 'US-MO', region_name: 'Missouri' }),
    ];
    const user = userEvent.setup();
    renderFlow();

    await search(user, 'Springfield');

    await waitFor(() => {
      expect(screen.getByTestId('city-search-result-10')).toHaveTextContent('Illinois, US');
      expect(screen.getByTestId('city-search-result-11')).toHaveTextContent('Missouri, US');
    });
  });

  it('marks a region-tier country city with no region set explicitly, distinct from a regioned row', async () => {
    searchResultsFixture = [
      makeCity({ id: 20, region_id: 3, region_iso: 'US-IL', region_name: 'Illinois' }),
      makeCity({ id: 21, region_id: null, region_iso: null, region_name: null }),
    ];
    const user = userEvent.setup();
    renderFlow();

    await search(user, 'Springfield');

    await waitFor(() => {
      expect(screen.getByTestId('city-search-result-20')).toHaveTextContent('Illinois, US');
      // Explicit "no state set" wording — never looks like a normal regioned
      // row and never looks like a non-region-tier country's row either.
      expect(screen.getByTestId('city-search-result-21')).toHaveTextContent('US (no state set)');
    });
  });

  it('shows only the country for a non-region-tier country (unchanged behaviour)', async () => {
    searchResultsFixture = [makeCity({ id: 30, name: 'Paris', country_code: 'FR' })];
    const user = userEvent.setup();
    renderFlow();

    await search(user, 'Paris');

    await waitFor(() => {
      const row = screen.getByTestId('city-search-result-30');
      expect(row).toHaveTextContent('Paris');
      expect(row).toHaveTextContent('FR');
      expect(row).not.toHaveTextContent(/no .* set/i);
    });
  });
});

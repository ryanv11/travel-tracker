/**
 * Scenario tests for AddPlaceFlow's ADL-46 D14 region-selector narrowing.
 *
 * D14: when the geocode proxy returns multiple candidates with differing
 * region_iso for the resolved country, AddPlaceFlow narrows the existing
 * region <select> to just those candidates instead of silently taking
 * candidates[0]. The local `regions` table is a hand-curated seed known to
 * be incomplete (BUG-30 backfilled missing UK regions; OQ-06 is the
 * still-open question about a systematic replacement) — nothing guarantees
 * a geocode region_iso corresponds to a seeded row, so this file's main
 * scenario is the narrowed set matching zero seeded regions, which must
 * fall back to the full country list rather than leaving the selector
 * empty.
 *
 * Mocks:
 *   - useCountries/useCountryRegions from hooks/useAdmin — controls the
 *     seeded region list and region_tier_enabled gating
 *   - lookupCityCountry/useCitySearch/useCreateCity/useCarryForwardCandidates
 *     from hooks/useCities — controls the geocode result
 *   - useAddPlace from hooks/usePlaces — unused in these scenarios but
 *     called unconditionally by the component
 *
 * Source: src/frontend/components/TripDetail/AddPlaceFlow.tsx
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Country, GeocodeCandidate, Region } from '../../../types/api';
import { AddPlaceFlow } from '../AddPlaceFlow';

const mockLookupCityCountry = vi.fn();

vi.mock('../../../hooks/useCities', () => ({
  lookupCityCountry: (cityName: string) => mockLookupCityCountry(cityName),
  useCitySearch: () => ({ data: [], isLoading: false }),
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

// Seeded regions that do NOT include either candidate's region_iso — models
// the known-incomplete local table (BUG-30/OQ-06), not a contrived edge case.
const seededRegionsNoOverlap: Region[] = [
  {
    id: 1,
    country_code: 'US',
    name: 'California',
    iso_3166_2: 'US-CA',
    created_at: '',
    updated_at: '',
  },
  {
    id: 2,
    country_code: 'US',
    name: 'Texas',
    iso_3166_2: 'US-TX',
    created_at: '',
    updated_at: '',
  },
];

const seededRegionsOneOverlap: Region[] = [
  ...seededRegionsNoOverlap,
  {
    id: 3,
    country_code: 'US',
    name: 'Illinois',
    iso_3166_2: 'US-IL',
    created_at: '',
    updated_at: '',
  },
];

let countryRegionsFixture: Region[] = seededRegionsNoOverlap;

vi.mock('../../../hooks/useAdmin', () => ({
  useCountries: () => ({ data: [usCountry] }),
  useCountryRegions: () => ({ data: countryRegionsFixture }),
}));

function springfieldCandidates(): GeocodeCandidate[] {
  return [
    {
      name: 'Springfield',
      display_name: 'Springfield, Illinois, USA',
      country_code: 'US',
      region_iso: 'US-IL',
      latitude: 39.78,
      longitude: -89.65,
    },
    {
      name: 'Springfield',
      display_name: 'Springfield, Missouri, USA',
      country_code: 'US',
      region_iso: 'US-MO',
      latitude: 37.2,
      longitude: -93.29,
    },
  ];
}

/** Types a query and opens the "Add new city" form, triggering the geocode lookup. */
async function openNewCityForm(user: ReturnType<typeof userEvent.setup>, cityName: string) {
  const input = screen.getByPlaceholderText('Search city name…');
  await user.type(input, cityName);
  const addNew = await screen.findByText(`+ Add new: "${cityName}"`, {}, { timeout: 2000 });
  await user.click(addNew);
}

describe('AddPlaceFlow — ADL-46 D14 region selector narrowing', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
    countryRegionsFixture = seededRegionsNoOverlap;
  });

  it('falls back to the full country region list when the narrowed candidates match no seeded region', async () => {
    countryRegionsFixture = seededRegionsNoOverlap; // neither US-IL nor US-MO is seeded
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'US',
      regionIso: 'US-IL',
      candidates: springfieldCandidates(),
    });
    const user = userEvent.setup();

    render(
      <AddPlaceFlow
        tripId={1}
        onClose={vi.fn()}
        tripStartDate="2026-01-01"
        tripEndDate="2026-01-10"
        isFirstPlace={false}
      />,
    );

    await openNewCityForm(user, 'Springfield');

    // Full seeded list is still offered — the user is not locked out of
    // regions that ARE seeded just because the narrowing found no overlap.
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'California' })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'Texas' })).toBeInTheDocument();

    // The lookup DID detect ambiguity — the hint stays visible even though
    // the selector fell back to the unfiltered list.
    expect(screen.getByText(/multiple matches found, please choose/i)).toBeInTheDocument();

    // Nothing was silently auto-selected from the incomplete table — the
    // region <select> (identified via its "No <label> selected" placeholder
    // option, since the label isn't htmlFor-associated) still shows no
    // selection.
    const regionSelect = screen
      .getByRole('option', { name: /no state selected/i })
      .closest('select') as HTMLSelectElement;
    expect(regionSelect).toHaveValue('');
  });

  it('narrows to just the matching candidate regions when 2+ seeded regions overlap', async () => {
    countryRegionsFixture = [
      ...seededRegionsOneOverlap,
      {
        id: 4,
        country_code: 'US',
        name: 'Missouri',
        iso_3166_2: 'US-MO',
        created_at: '',
        updated_at: '',
      },
    ]; // California, Texas, Illinois, Missouri all seeded — IL and MO both overlap
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'US',
      regionIso: 'US-IL',
      candidates: springfieldCandidates(),
    });
    const user = userEvent.setup();

    render(
      <AddPlaceFlow
        tripId={1}
        onClose={vi.fn()}
        tripStartDate="2026-01-01"
        tripEndDate="2026-01-10"
        isFirstPlace={false}
      />,
    );

    await openNewCityForm(user, 'Springfield');

    await waitFor(() => {
      expect(screen.getByText(/multiple matches found, please choose/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('option', { name: 'Illinois' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Missouri' })).toBeInTheDocument();
    // Narrowed away — not offered even though seeded, because the geocode
    // lookup gave no signal pointing at either of them.
    expect(screen.queryByRole('option', { name: 'California' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Texas' })).not.toBeInTheDocument();
  });
});

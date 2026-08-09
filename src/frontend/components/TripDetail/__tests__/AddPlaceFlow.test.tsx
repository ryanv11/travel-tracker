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
        tripCountries={[]}
        onManageCountries={vi.fn()}
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
        tripCountries={[]}
        onManageCountries={vi.fn()}
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

/**
 * ADL-46 F1/F2 ruling (2026-08-01) §2.2/§4 — frontend/backend parity contract.
 *
 * The ruling states this is byte-for-byte the same rule the backend's
 * classifyCandidates step 4 computes (distinct non-null region_iso among
 * same-country candidates, ambiguous when > 1) — "any future change to step 4
 * changes both sides or neither." These tests reuse the same fixture shapes as
 * the backend's classifyCandidates table-driven tests
 * (geocoding.service.test.ts) so a divergence between the two shows up here.
 *
 * The requested-region case (backend classifyCandidates step 3) has no
 * frontend counterpart by design — the frontend has no selected region yet at
 * lookup time, per the ruling — so only step 4 (no region requested) is
 * exercised here.
 */
describe('AddPlaceFlow — ADL-46 F1/F2 parity: distinct-region computation matches classifyCandidates step 4', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
  });

  it('REGRESSION FIXTURE PARITY: two candidates sharing ONE region are NOT flagged ambiguous (matches backend classifyCandidates ok verdict)', async () => {
    // Same shape as geocoding.service.test.ts's §4.1 regression fixture: two
    // Nominatim hits for one city at different granularities, one region.
    countryRegionsFixture = [
      ...seededRegionsNoOverlap,
      {
        id: 5,
        country_code: 'US',
        name: 'Colorado',
        iso_3166_2: 'US-CO',
        created_at: '',
        updated_at: '',
      },
    ];
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'US',
      regionIso: 'US-CO',
      candidates: [
        {
          name: 'Denver',
          display_name: 'Denver, Colorado, USA',
          country_code: 'US',
          region_iso: 'US-CO',
          latitude: 39.74,
          longitude: -104.98,
        },
        {
          name: 'Denver',
          display_name: 'Denver County, Colorado, USA',
          country_code: 'US',
          region_iso: 'US-CO',
          latitude: 39.74,
          longitude: -104.98,
        },
      ],
    });
    const user = userEvent.setup();

    render(
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

    await openNewCityForm(user, 'Denver');

    // Auto-selection ran (proves the ambiguous branch was NOT taken) — the
    // region <select> shows Colorado selected, not the "no selection" state.
    await waitFor(() => {
      const regionSelect = screen
        .getByRole('option', { name: 'Colorado' })
        .closest('select') as HTMLSelectElement;
      expect(regionSelect.value).not.toBe('');
    });
    expect(screen.queryByText(/multiple matches found, please choose/i)).not.toBeInTheDocument();
  });

  it('two distinct regions with no seeded overlap still surface the ambiguous hint (matches backend multi-region verdict)', async () => {
    countryRegionsFixture = seededRegionsNoOverlap;
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
        tripCountries={[]}
        onManageCountries={vi.fn()}
      />,
    );

    await openNewCityForm(user, 'Springfield');

    await waitFor(() => {
      expect(screen.getByText(/multiple matches found, please choose/i)).toBeInTheDocument();
    });
  });
});

/**
 * BUG-71 stopgap — GitHub #363.
 *
 * `AddPlaceFlow.tsx`'s single-candidate region auto-fill (the `else if
 * (regionIso)` branch, distinct from D14's multi-region narrowing already
 * covered in AddPlaceFlow.test.tsx) cannot tell a genuinely unambiguous city
 * (Denver — one real region) apart from a globally-ambiguous one truncated to
 * a false single survivor by Nominatim's 10-slot global result (Springfield —
 * many worldwide matches, thinned by settlement-type filtering and the
 * non-null-region_iso requirement down to exactly one same-country region).
 * The observed defect: the region <select> silently committed a value
 * ("Virginia") with no indication it was a guess.
 *
 * Fix under test: every auto-fill from that branch renders a visibly
 * tentative "Suggested: <region> — from "<name>"" caption per the UX spec's
 * §3.2 "Suggested:" treatment (applied here to the region field, per the
 * brief's explicit instruction to reuse that pattern rather than invent a
 * new one) — the value stays pre-filled (not blanked), but its status is
 * honest. The caption disappears the moment the user makes an actual choice.
 *
 * Deliberately a separate file from the existing D14-scoped
 * AddPlaceFlow.test.tsx and BUG-73-scoped AddPlaceFlow.geocodeFailure.test.tsx
 * — same precedent as BUG-73's own thread: touching only surrounding lines,
 * not either file, while multiple bugs are in flight on this one component.
 *
 * Source: src/frontend/components/TripDetail/AddPlaceFlow.tsx
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Country, Region } from '../../../types/api';
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

const seededRegions: Region[] = [
  {
    id: 1,
    country_code: 'US',
    name: 'Virginia',
    iso_3166_2: 'US-VA',
    created_at: '',
    updated_at: '',
  },
  {
    id: 2,
    country_code: 'US',
    name: 'Missouri',
    iso_3166_2: 'US-MO',
    created_at: '',
    updated_at: '',
  },
  {
    id: 3,
    country_code: 'US',
    name: 'Colorado',
    iso_3166_2: 'US-CO',
    created_at: '',
    updated_at: '',
  },
];

vi.mock('../../../hooks/useAdmin', () => ({
  useCountries: () => ({ data: [usCountry] }),
  useCountryRegions: () => ({ data: seededRegions }),
}));

/** Types a query and opens the "Add new city" form, triggering the geocode lookup. */
async function openNewCityForm(user: ReturnType<typeof userEvent.setup>, cityName: string) {
  const input = screen.getByPlaceholderText('Search city name…');
  await user.type(input, cityName);
  const addNew = await screen.findByText(`+ Add new: "${cityName}"`, {}, { timeout: 2000 });
  await user.click(addNew);
}

function renderFlow() {
  return render(
    <AddPlaceFlow
      tripId={1}
      onClose={vi.fn()}
      tripStartDate="2026-01-01"
      tripEndDate="2026-01-10"
      isFirstPlace={false}
    />,
  );
}

describe('AddPlaceFlow — BUG-71 stopgap: single-candidate region auto-fill is a visible suggestion', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
  });

  it('pre-fills the region AND shows a "Suggested:" caption when the lookup collapses to one same-country region (the false-single-survivor case, e.g. "springfield" -> Virginia)', async () => {
    // Models the PO's observed defect: only one candidate survives the
    // frontend's country+non-null-region_iso filter, even though the name is
    // globally ambiguous — sameCountryRegionIsos.length === 1 takes the
    // auto-fill branch, not the D14 ambiguous branch.
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'US',
      regionIso: 'US-VA',
      candidates: [
        {
          name: 'Springfield',
          display_name: 'Springfield, Virginia, USA',
          country_code: 'US',
          region_iso: 'US-VA',
          latitude: 38.8,
          longitude: -77.18,
        },
      ],
      failed: false,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Springfield');

    // The value is still pre-filled (not blanked) — dropping a wrong guess
    // for no answer would be a UX regression on the common case.
    await waitFor(() => {
      const regionSelect = screen
        .getByRole('option', { name: 'Virginia' })
        .closest('select') as HTMLSelectElement;
      expect(regionSelect.value).not.toBe('');
    });

    // But its status is now honest, not silent.
    expect(screen.getByText(/suggested: virginia/i)).toBeInTheDocument();
    // And it is NOT the D14 multi-candidate ambiguity hint — a different
    // mechanism, mutually exclusive per the branch that ran.
    expect(screen.queryByText(/multiple matches found, please choose/i)).not.toBeInTheDocument();
  });

  it('clears the "Suggested:" caption once the user makes an explicit region choice (tier 1: explicit selection is never just a suggestion)', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'US',
      regionIso: 'US-VA',
      candidates: [
        {
          name: 'Springfield',
          display_name: 'Springfield, Virginia, USA',
          country_code: 'US',
          region_iso: 'US-VA',
          latitude: 38.8,
          longitude: -77.18,
        },
      ],
      failed: false,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Springfield');
    await waitFor(() => expect(screen.getByText(/suggested: virginia/i)).toBeInTheDocument());

    const regionSelect = screen
      .getByRole('option', { name: 'Missouri' })
      .closest('select') as HTMLSelectElement;
    await user.selectOptions(regionSelect, 'Missouri');

    expect(screen.queryByText(/suggested:/i)).not.toBeInTheDocument();
    expect(regionSelect).toHaveValue('2');
  });

  it('does NOT show a "Suggested:" caption for the D14 multi-candidate ambiguous case (mutually exclusive with the "multiple matches" hint)', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'US',
      regionIso: 'US-MO',
      candidates: [
        {
          name: 'Springfield',
          display_name: 'Springfield, Missouri, USA',
          country_code: 'US',
          region_iso: 'US-MO',
          latitude: 37.2,
          longitude: -93.29,
        },
        {
          name: 'Springfield',
          display_name: 'Springfield, Colorado, USA',
          country_code: 'US',
          region_iso: 'US-CO',
          latitude: 39.09,
          longitude: -104.9,
        },
      ],
      failed: false,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Springfield');

    await waitFor(() => {
      expect(screen.getByText(/multiple matches found, please choose/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/suggested:/i)).not.toBeInTheDocument();
  });

  it('shows no "Suggested:" caption when the lookup legitimately finds nothing (zero candidates — unrelated to the suggestion mechanism)', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: null,
      regionIso: null,
      candidates: [],
      failed: false,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Nether Wallow');

    await waitFor(() => {
      expect(screen.queryByText(/detecting…/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/suggested:/i)).not.toBeInTheDocument();
  });
});

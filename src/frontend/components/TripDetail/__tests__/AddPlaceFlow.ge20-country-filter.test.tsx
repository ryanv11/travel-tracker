/**
 * AddPlaceFlow — GE-20 (BUG-87, ADL-54) trip-country picker filter.
 *
 * Covers Brief B's success criteria (dispatch gate, jobs/architect/tech/
 * ADL-54-trip-country-picker-filter.md §3):
 *   - F2 (fresh-eyes, MANDATORY): the picker sends `country_codes` — the
 *     trip's declared countries — on BOTH lookup paths (useCitySearch AND
 *     lookupCityCountry). This is the executable guard for GE-20's "cannot
 *     be bypassed from within the picker" criterion; Brief B carries no
 *     other red test for it (ADL-54 D10 marks this brief ATDD-first: no).
 *   - D5/Q3: the "filtered by" note, naming the countries and truncating a
 *     large set ("United Kingdom, France +2").
 *   - D3/Q1: a trip with zero declared countries shows an unconstrained
 *     prompt instead of the note, and still sends a present-but-empty
 *     `country_codes` (the backend's documented unconstrained contract).
 *   - D4a/Q2: a filtered search that comes back empty shows a static
 *     empty-state naming the trip's countries with a link to the trip's
 *     country editor — never a silent blank.
 *
 * Mocks: useCitySearch/lookupCityCountry (hooks/useCities) are spies that
 * capture their call arguments, distinct from the pre-GE-20 test files in
 * this directory (which don't care about the country_codes argument and mock
 * these functions to ignore it).
 *
 * Source: src/frontend/components/TripDetail/AddPlaceFlow.tsx
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { City } from '../../../types/api';
import { AddPlaceFlow } from '../AddPlaceFlow';

const mockUseCitySearch = vi.fn();
const mockLookupCityCountry = vi.fn();

// ADL-56 / GE-21 Slice 1: this suite predates the merged cached ∪ live surface
// and mocks the hook layer wholesale, so it renders with no QueryClientProvider.
// The live-lookup hook is therefore held IDLE here, deliberately: this file's
// subject is the new-city form / region narrowing, and the merged surface has
// its own suites at the apiClient boundary (AddPlaceFlow.adl56-*.test.tsx,
// ChangeCityModal.adl56-live-merge.test.tsx) where the real hook runs. Holding
// it idle also keeps any lookupCityCountry call-count assertion in this file
// measuring only the lookup this suite is actually about.
vi.mock('../../../hooks/useLiveCityLookup', () => ({
  LIVE_LOOKUP_MODE: 'auto',
  useLiveCityLookup: () => ({
    candidates: [],
    countryCode: null,
    regionIso: null,
    truncated: false,
    failed: false,
    pending: false,
    settled: false,
  }),
}));

vi.mock('../../../hooks/useCities', () => ({
  useCitySearch: (query: string, countryCodes: string[]) => mockUseCitySearch(query, countryCodes),
  lookupCityCountry: (cityName: string, countryCodes: string[]) =>
    mockLookupCityCountry(cityName, countryCodes),
  useCreateCity: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useCarryForwardCandidates: () => ({ data: [], isFetched: false }),
}));

vi.mock('../../../hooks/useAdmin', () => ({
  useCountries: () => ({ data: [] }),
  useCountryRegions: () => ({ data: [] }),
}));

vi.mock('../../../hooks/usePlaces', () => ({
  useAddPlace: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));

const uk = { country_code: 'GB', name: 'United Kingdom' };
const fr = { country_code: 'FR', name: 'France' };
const es = { country_code: 'ES', name: 'Spain' };
const it_ = { country_code: 'IT', name: 'Italy' };

function baseProps() {
  return {
    tripId: 1,
    onClose: vi.fn(),
    tripStartDate: '2026-01-01',
    tripEndDate: '2026-01-10',
    isFirstPlace: false,
  };
}

async function typeQuery(user: ReturnType<typeof userEvent.setup>, query: string) {
  const input = screen.getByPlaceholderText('Search city name…');
  await user.type(input, query);
}

describe('AddPlaceFlow — GE-20 country filter', () => {
  beforeEach(() => {
    mockUseCitySearch.mockReset();
    mockUseCitySearch.mockReturnValue({ data: [], isLoading: false });
    mockLookupCityCountry.mockReset();
    mockLookupCityCountry.mockResolvedValue({
      countryCode: null,
      regionIso: null,
      candidates: [],
      failed: false,
      truncated: false,
    });
  });

  it("F2 (mandatory): sends the trip's country_codes on the DB search path (useCitySearch)", async () => {
    const user = userEvent.setup();
    render(<AddPlaceFlow {...baseProps()} tripCountries={[uk, fr]} onManageCountries={vi.fn()} />);

    await typeQuery(user, 'newport');

    await waitFor(() => {
      const lastCall = mockUseCitySearch.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe('newport');
      expect(lastCall?.[1]).toEqual(['GB', 'FR']);
    });
  });

  it("F2 (mandatory): sends the trip's country_codes on the geocode discovery path (lookupCityCountry)", async () => {
    const user = userEvent.setup();
    render(<AddPlaceFlow {...baseProps()} tripCountries={[uk, fr]} onManageCountries={vi.fn()} />);

    await typeQuery(user, 'newport');
    const addNew = await screen.findByText('+ Add new: "newport"', {}, { timeout: 2000 });
    await user.click(addNew);

    await waitFor(() => {
      expect(mockLookupCityCountry).toHaveBeenCalledWith('newport', ['GB', 'FR']);
    });
  });

  it('sends a present-but-empty country_codes on both paths for a trip with no declared countries', async () => {
    const user = userEvent.setup();
    render(<AddPlaceFlow {...baseProps()} tripCountries={[]} onManageCountries={vi.fn()} />);

    await typeQuery(user, 'newport');

    await waitFor(() => {
      const lastCall = mockUseCitySearch.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe('newport');
      expect(lastCall?.[1]).toEqual([]);
    });

    const addNew = await screen.findByText('+ Add new: "newport"', {}, { timeout: 2000 });
    await user.click(addNew);

    await waitFor(() => {
      expect(mockLookupCityCountry).toHaveBeenCalledWith('newport', []);
    });
  });

  it('D5/Q3: shows the "Filtered to" note naming a single declared country', () => {
    render(<AddPlaceFlow {...baseProps()} tripCountries={[uk]} onManageCountries={vi.fn()} />);
    expect(screen.getByText('Filtered to: United Kingdom')).toBeInTheDocument();
  });

  it('D5/Q3: truncates a large declared set to "Name, Name +N" (COO adjudication example)', () => {
    render(
      <AddPlaceFlow
        {...baseProps()}
        tripCountries={[uk, fr, es, it_]}
        onManageCountries={vi.fn()}
      />,
    );
    expect(screen.getByText('Filtered to: United Kingdom, France +2')).toBeInTheDocument();
  });

  it('D3/Q1: a zero-country trip shows the unconstrained prompt instead of the "Filtered to" note', () => {
    const onManageCountries = vi.fn();
    render(
      <AddPlaceFlow {...baseProps()} tripCountries={[]} onManageCountries={onManageCountries} />,
    );

    expect(screen.getByText(/no countries yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Filtered to:/)).not.toBeInTheDocument();
  });

  it('D3/Q1: the zero-country prompt\'s "Add countries" action calls onManageCountries', async () => {
    const user = userEvent.setup();
    const onManageCountries = vi.fn();
    render(
      <AddPlaceFlow {...baseProps()} tripCountries={[]} onManageCountries={onManageCountries} />,
    );

    await user.click(screen.getByRole('button', { name: 'Add countries' }));

    expect(onManageCountries).toHaveBeenCalledTimes(1);
  });

  it("D4a/Q2: an empty filtered search shows a static empty-state naming the trip's countries", async () => {
    mockUseCitySearch.mockReturnValue({ data: [] as City[], isLoading: false });
    const user = userEvent.setup();
    render(<AddPlaceFlow {...baseProps()} tripCountries={[uk]} onManageCountries={vi.fn()} />);

    await typeQuery(user, 'boston');

    // ADL-56 D5/S2 (BUG-73, PR for #536/#538): this line used to read "No
    // matches in United Kingdom." — an absolute claim the CATALOGUE cannot
    // make, and one the live lookup may be about to contradict. D5 requires the
    // cache-empty state to be scoped to SAVED places. The assertion this test
    // actually owns is unchanged: the state names the trip's countries and
    // offers the widen-countries path.
    await waitFor(() => {
      expect(screen.getByText(/No saved places match in United Kingdom\./)).toBeInTheDocument();
    });
    // "+ Add new" stays available — a genuinely new in-set city is still addable.
    expect(screen.getByText('+ Add new: "boston"')).toBeInTheDocument();
  });

  it('D4a/Q2: the empty-state\'s action calls onManageCountries and does not block "+ Add new"', async () => {
    mockUseCitySearch.mockReturnValue({ data: [] as City[], isLoading: false });
    const user = userEvent.setup();
    const onManageCountries = vi.fn();
    render(
      <AddPlaceFlow {...baseProps()} tripCountries={[uk]} onManageCountries={onManageCountries} />,
    );

    await typeQuery(user, 'boston');
    // ADL-56 D5/S2 copy change — see the test above.
    await screen.findByText(/No saved places match in United Kingdom\./);

    await user.click(screen.getByRole('button', { name: 'Add a different country to this trip' }));

    expect(onManageCountries).toHaveBeenCalledTimes(1);
  });

  it('does not show the off-country empty-state while results are still loading', async () => {
    mockUseCitySearch.mockReturnValue({ data: [] as City[], isLoading: true });
    const user = userEvent.setup();
    render(<AddPlaceFlow {...baseProps()} tripCountries={[uk]} onManageCountries={vi.fn()} />);

    await typeQuery(user, 'boston');

    expect(screen.queryByText(/No saved places match in/)).not.toBeInTheDocument();
  });
});

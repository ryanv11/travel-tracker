/**
 * UX-12 / BUG-75 — the "Change city" re-point modal, RENDERED layer.
 *
 * ATDD-first RED acceptance tests (OP-35). RED now because ChangeCityModal does
 * not exist on `main` (confirmed: grep for "ChangeCityModal" across src/frontend
 * turns up only CityPicker.tsx's doc comment; no component).
 *
 * ── CONTRACT FRONTEND MUST BUILD (design §8.2, review MAJOR-1, UX spec §12.1) ──
 * Frontend must create:
 *
 *   src/frontend/components/TripDetail/ChangeCityModal.tsx
 *   export function ChangeCityModal(props: {
 *     tripId: number;
 *     placeId: number;
 *     onClose: () => void;
 *   }): JSX.Element;
 *
 * It reuses the EXTRACTED search step (city search + new-city name/country/region
 * form) — same "Search city name…" input and `+ Add new: "…"` affordance as
 * AddPlace, minus the date/carry-forward chrome (UX spec §12.1) — and consumes
 * the SHARED precedence unit (decideCityDisambiguation) and the SHARED identity
 * carry (buildCreateCityDataFromCandidate), so its disambiguation is byte-identical
 * to AddPlace (AC-9). On select/create it re-points via the D11 PATCH:
 *
 *   useChangeCity() -> mutateAsync({ tripId, placeId, cityId })
 *     => PATCH /api/trips/:tripId/places/:placeId  { city_id }
 *
 * `useChangeCity` is the specified re-point seam — a thin sibling of
 * useUpdatePlaceDates (usePlaces.ts:101) issuing the same PATCH with `city_id`.
 * (If Frontend instead extends useUpdatePlaceDates to take an optional cityId,
 * retarget this mock accordingly — the observable contract, a PATCH with city_id,
 * is what AC-10 pins.)
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Country, Region } from '../../../types/api';
// RED: this component does not exist on `main`. Frontend creates it (see header).
import { ChangeCityModal } from '../ChangeCityModal';
import { spanningRegionNewports } from './fixtures/newportGeocode';

const mockLookupCityCountry = vi.fn();
const mockCreateCity = vi.fn();
const mockChangeCity = vi.fn();

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
  lookupCityCountry: (cityName: string) => mockLookupCityCountry(cityName),
  useCitySearch: () => ({ data: [], isLoading: false }),
  useCreateCity: () => ({ mutateAsync: mockCreateCity, isPending: false, error: null }),
  useCarryForwardCandidates: () => ({ data: [], isFetched: false }),
}));

vi.mock('../../../hooks/usePlaces', () => ({
  // The re-point seam (see header). Called with { tripId, placeId, cityId }.
  useChangeCity: () => ({ mutateAsync: mockChangeCity, isPending: false, error: null }),
  useUpdatePlaceDates: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useAddPlace: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));

const gbCountry: Country = {
  country_code: 'GB',
  name: 'United Kingdom',
  region_tier_enabled: true,
  region_tier_label: 'Region',
};
const gbRegions: Region[] = [
  {
    id: 5,
    country_code: 'GB',
    name: 'England',
    iso_3166_2: 'GB-ENG',
    created_at: '',
    updated_at: '',
  },
  {
    id: 6,
    country_code: 'GB',
    name: 'Wales',
    iso_3166_2: 'GB-WLS',
    created_at: '',
    updated_at: '',
  },
];

vi.mock('../../../hooks/useAdmin', () => ({
  useCountries: () => ({ data: [gbCountry] }),
  useCountryRegions: () => ({ data: gbRegions }),
}));

function renderModal() {
  return render(
    <MemoryRouter>
      <ChangeCityModal tripId={1} placeId={7} onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

async function openNewCityForm(user: ReturnType<typeof userEvent.setup>, cityName: string) {
  const input = screen.getByPlaceholderText('Search city name…');
  await user.type(input, cityName);
  const addNew = await screen.findByText(`+ Add new: "${cityName}"`, {}, { timeout: 2000 });
  await user.click(addNew);
}

beforeEach(() => {
  mockLookupCityCountry.mockReset();
  mockCreateCity.mockReset();
  mockChangeCity.mockReset();
  mockCreateCity.mockResolvedValue({
    id: 99,
    name: 'Newport',
    country_code: 'GB',
    region_id: 5,
    geocode_status: 'pending',
  });
  mockChangeCity.mockResolvedValue({ id: 7 });
  mockLookupCityCountry.mockResolvedValue({
    countryCode: 'GB',
    regionIso: 'GB-ENG',
    candidates: spanningRegionNewports(),
    failed: false,
    truncated: false,
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-9 — shared precedence (no drift): the SAME spanning scenario fires the
// picker here exactly as it does in AddPlace.
// ────────────────────────────────────────────────────────────────────────────
describe('AC-9 shared precedence — spanning-region fires the picker in Change-city too', () => {
  it('presents all spanning candidates by display_name, not a region <select>', async () => {
    const user = userEvent.setup();
    renderModal();
    await openNewCityForm(user, 'Newport');

    expect(
      await screen.findByText(/Newport, Isle of Wight/i, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Newport, Telford and Wrekin/i)).toBeInTheDocument();
    expect(screen.getByText(/Cymru \/ Wales/i)).toBeInTheDocument();
    expect(screen.queryByText(/multiple matches found, please choose/i)).not.toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-10 — re-point preserves data (D11): select/create -> PATCH …/places/:id
// with city_id. Backend already asserts items/tags survive (place-repoint.test.ts);
// this is the frontend wiring.
// ────────────────────────────────────────────────────────────────────────────
describe('AC-10 re-point wiring — selecting a candidate PATCHes the place with the new city_id', () => {
  it('routes the resolved city_id through the D11 re-point mutation for this placeId', async () => {
    const user = userEvent.setup();
    renderModal();
    await openNewCityForm(user, 'Newport');

    const iow = await screen.findByText(/Newport, Isle of Wight/i, {}, { timeout: 2000 });
    await user.click(iow);

    // The chosen candidate is created/resolved to a city_id, then the place is
    // re-pointed — NOT a new place created (this is a correction, D11).
    await waitFor(() => expect(mockChangeCity).toHaveBeenCalled());
    expect(mockChangeCity.mock.calls[0][0]).toMatchObject({
      tripId: 1,
      placeId: 7,
      cityId: 99,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-12 (MAJOR-1) — anti-drift: the identity carry is byte-identical across the
// two flows. Selecting the same candidate here carries the same osm identity and
// region_id AddPlace carries (asserted in AddPlaceFlow.picker-precedence AC-1).
// A fork in ChangeCityModal that dropped osm_id or derived a stale region_id
// would fail here.
// ────────────────────────────────────────────────────────────────────────────
describe('AC-12 identity carry does not fork in Change-city', () => {
  it('carries osm_type/osm_id/display_name + region_id from the pick into createCity, same as AddPlace', async () => {
    const user = userEvent.setup();
    renderModal();
    await openNewCityForm(user, 'Newport');

    const iow = await screen.findByText(/Newport, Isle of Wight/i, {}, { timeout: 2000 });
    await user.click(iow);

    await waitFor(() => expect(mockCreateCity).toHaveBeenCalled());
    expect(mockCreateCity.mock.calls[0][0]).toMatchObject({
      name: 'Newport',
      country_code: 'GB',
      osm_type: 'node',
      osm_id: 26700978,
      display_name: 'Newport, Isle of Wight, England, PO30 1JU, UK',
      region_id: 5,
    });
  });
});

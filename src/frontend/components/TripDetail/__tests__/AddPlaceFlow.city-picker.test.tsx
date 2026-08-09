/**
 * BUG-75 / UX-12 / GE-16 (v3.19) — the shared place-level CityPicker, FRONTEND layer.
 *
 * ATDD-first RED acceptance tests (OP-35). Authored BEFORE the CityPicker exists.
 *
 * ── Why this layer is mandatory (the v1-review trap) ──────────────────────────
 * The v1 review's decisive finding: a backend test that injects an osm_id proves
 * coexistence over a path THE USER CAN NEVER TRIGGER, because the four-Newport
 * case only fires once the frontend presents a PLACE-LEVEL pick and carries the
 * chosen candidate's identity. Region-only disambiguation (today's <select>
 * narrowing) is structurally insufficient: the two real unhandled Newports —
 * Isle of Wight and Telford and Wrekin — are BOTH GB-ENG, so a region selector
 * collapses them to one. These tests prove the user can actually trigger the
 * feature: the picker fires on place-level ambiguity and carries the pick.
 *
 * Coexistence #1 and ask-to-choose #4 are proven on BOTH sides; the backend half
 * is cities.identity-carry.test.ts. This is the user-triggerability half.
 *
 * ── RED-pending-implementation ────────────────────────────────────────────────
 * These target the intended contract from the build brief §1.3 + v3 §B4/§B5:
 *   • a place-level CityPicker renders ambiguous candidates by display_name;
 *   • the chosen candidate's {osm_type, osm_id, display_name, region_id} is
 *     carried into POST /api/cities (region_id derived from region_iso via the
 *     seeded region map — v3 §B4, incomplete-seed NULL fallback respected);
 *   • the BUG-79 lookupTruncated caveat is inherited by the picker (v3 §B5 m1).
 * The CityPicker does not exist yet, so these are red now.
 *
 * Mock boundary matches every other AddPlaceFlow test: lookupCityCountry and the
 * mutation hooks are mocked; the fixtures assert what the FLOW does with a given
 * candidate set. (Whether Nominatim's real "newport" response carries these two
 * osm_ids is verified live at the backend/UAT layer, not here — same documented
 * limitation as AddPlaceFlow.bug78-79.test.tsx.)
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Country, GeocodeCandidate, Region } from '../../../types/api';
import { AddPlaceFlow } from '../AddPlaceFlow';

/** The carried-identity fields the design adds to GeocodeCandidate (v3 §2.1). */
type PickCandidate = GeocodeCandidate & {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
};

const mockLookupCityCountry = vi.fn();
const mockCreateCity = vi.fn();

vi.mock('../../../hooks/useCities', () => ({
  lookupCityCountry: (cityName: string) => mockLookupCityCountry(cityName),
  useCitySearch: () => ({ data: [], isLoading: false }),
  useCreateCity: () => ({ mutateAsync: mockCreateCity, isPending: false, error: null }),
  useCarryForwardCandidates: () => ({ data: [], isFetched: false }),
}));

vi.mock('../../../hooks/usePlaces', () => ({
  useAddPlace: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: 1, warnings: [] }),
    isPending: false,
    error: null,
  }),
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

/** The two REAL same-region Newports — both GB-ENG, distinct osm_ids (v3 §1.2). */
function sameRegionNewports(): PickCandidate[] {
  return [
    {
      name: 'Newport',
      display_name: 'Newport, Isle of Wight, England, PO30 1JU, UK',
      country_code: 'GB',
      region_iso: 'GB-ENG',
      latitude: 50.7,
      longitude: -1.29,
      osm_type: 'node',
      osm_id: 26700978,
    },
    {
      name: 'Newport',
      display_name: 'Newport, Telford and Wrekin, England, TF10 7AG, UK',
      country_code: 'GB',
      region_iso: 'GB-ENG',
      latitude: 52.77,
      longitude: -2.38,
      osm_type: 'node',
      osm_id: 27459103,
    },
  ];
}

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
      tripCountries={[]}
      onManageCountries={vi.fn()}
    />,
  );
}

describe('BUG-75 #4 ask-to-choose — a place-level picker fires when candidates share a region', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
    mockCreateCity.mockReset();
    mockCreateCity.mockResolvedValue({
      id: 99,
      name: 'Newport',
      country_code: 'GB',
      region_id: 5,
      geocode_status: 'pending',
    });
  });

  it('presents BOTH same-region Newports by display_name — region-only narrowing cannot disambiguate them', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'GB',
      regionIso: 'GB-ENG',
      candidates: sameRegionNewports(),
      failed: false,
      truncated: false,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Newport');

    // The place-level picker must render each candidate's display_name — the
    // discriminator a shared-region selector throws away.
    expect(
      await screen.findByText(/Newport, Isle of Wight/i, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Newport, Telford and Wrekin/i)).toBeInTheDocument();
  });
});

describe('BUG-75 #1 carry — the chosen candidate identity is carried into POST /api/cities', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
    mockCreateCity.mockReset();
    mockCreateCity.mockResolvedValue({
      id: 99,
      name: 'Newport',
      country_code: 'GB',
      region_id: 5,
      geocode_status: 'pending',
    });
  });

  it('picking Newport (Isle of Wight) sends its osm_type/osm_id/display_name and the region_id derived from GB-ENG', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'GB',
      regionIso: 'GB-ENG',
      candidates: sameRegionNewports(),
      failed: false,
      truncated: false,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Newport');

    const iow = await screen.findByText(/Newport, Isle of Wight/i, {}, { timeout: 2000 });
    await user.click(iow);

    await waitFor(() => expect(mockCreateCity).toHaveBeenCalled());
    const body = mockCreateCity.mock.calls[0][0];
    expect(body).toMatchObject({
      name: 'Newport',
      country_code: 'GB',
      osm_type: 'node',
      osm_id: 26700978,
      display_name: 'Newport, Isle of Wight, England, PO30 1JU, UK',
      // region_id derived from GB-ENG via the seeded map (England → id 5) — v3 §B4.
      region_id: 5,
    });
  });
});

describe('BUG-75 m1 — the picker inherits the BUG-79 lookupTruncated caveat (v3 §B5)', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
    mockCreateCity.mockReset();
  });

  it('a truncated lookup shows a "there may be more" caveat on the picker', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'GB',
      regionIso: 'GB-ENG',
      candidates: sameRegionNewports(),
      failed: false,
      truncated: true,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Newport');

    // Anti-vacuous-green guard: the caveat must ride on the PLACE PICKER, not the
    // legacy region-suggestion caption (which today already renders "other matches
    // may exist" for a single collapsed GB-ENG suggestion). Require the picker's
    // candidates first, so this can only pass once the picker itself exists.
    expect(
      await screen.findByText(/Newport, Isle of Wight/i, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Newport, Telford and Wrekin/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(/there may be more|other matches may exist|not shown/i),
      ).toBeInTheDocument();
    });
  });
});

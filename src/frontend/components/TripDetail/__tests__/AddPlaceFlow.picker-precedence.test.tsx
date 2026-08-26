/**
 * BUG-75 / UX-12 / GE-16 — picker-precedence, RENDERED COMPOSITION layer.
 *
 * ATDD-first RED acceptance tests (OP-35). These are the HEADLINE red gate: they
 * fail on `main`'s region-first order for the RIGHT reason — the place-level
 * picker never fires for a spanning-region name, so the region <select> pre-empts
 * it and a specific town silently auto-resolves to the wrong pin.
 *
 * ── WHY THE SHIPPED SUITE STAYED GREEN (mock-fidelity, QUAL-22) ───────────────
 * AddPlaceFlow.city-picker.test.tsx's fixture was SAME-REGION (both GB-ENG) — it
 * omitted the GB-WLS Newport, so `sameCountryRegionIsos.length` was 1 and the
 * spanning path was never exercised. This file's fixture SPANS GB-ENG + GB-WLS
 * (real captured node 26700977, Wales) — see fixtures/newportGeocode.ts for the
 * per-osm_id provenance. That is the difference that turns the test red.
 *
 * ── MOCK FIDELITY ─────────────────────────────────────────────────────────────
 * The lookup double returns the EXACT shape of `lookupCityCountry`
 * (useCities.ts:87-104): { countryCode, regionIso, candidates, failed, truncated }.
 * The candidates carry osm_type/osm_id (the code's real disambiguation signal),
 * and the spanning fixture includes Wales. A double that omitted osm_id or Wales
 * would specify nothing — that was the original bug.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Country, Region } from '../../../types/api';
import { AddPlaceFlow } from '../AddPlaceFlow';
import { singleRegionNoOsm, spanningRegionNewports } from './fixtures/newportGeocode';

const mockLookupCityCountry = vi.fn();
const mockCreateCity = vi.fn();

// FIDELITY: mirror useCities' real export surface — lookupCityCountry is a plain
// async function, the hooks return { mutateAsync/isPending/error }.
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

// ────────────────────────────────────────────────────────────────────────────
// AC-1 — spanning-region (headline). RED on main: region-first fires the region
// <select>, so the picker never renders these display_names.
// ────────────────────────────────────────────────────────────────────────────
describe('AC-1 spanning-region — the picker fires, the region <select> does NOT', () => {
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
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'GB',
      regionIso: 'GB-ENG',
      candidates: spanningRegionNewports(),
      failed: false,
      truncated: false,
    });
  });

  it('presents all three spanning candidates by region-qualified display_name', async () => {
    const user = userEvent.setup();
    renderFlow();
    await openNewCityForm(user, 'Newport');

    expect(
      await screen.findByText(/Newport, Isle of Wight/i, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Newport, Telford and Wrekin/i)).toBeInTheDocument();
    // The GB-WLS row the shipped fixture omitted — its presence is the whole point.
    expect(screen.getByText(/Cymru \/ Wales/i)).toBeInTheDocument();
  });

  it('does NOT collapse to the region <select> — the region-ambiguity hint is absent', async () => {
    const user = userEvent.setup();
    renderFlow();
    await openNewCityForm(user, 'Newport');

    // Picker fired (place-level label), NOT the region branch's hint.
    expect(
      await screen.findByText(/Multiple places match/i, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/multiple matches found, please choose/i)).not.toBeInTheDocument();
  });

  it('selecting Newport (Isle of Wight) carries its osm identity and region_id from GB-ENG — never Wales', async () => {
    const user = userEvent.setup();
    renderFlow();
    await openNewCityForm(user, 'Newport');

    const iow = await screen.findByText(/Newport, Isle of Wight/i, {}, { timeout: 2000 });
    await user.click(iow);

    // ADL-56 D7 / GE-21 (BRD v3.22), 2026-08-26: the pick SELECTS; the
    // explicit control commits. This suite's subject is the identity CARRY
    // (that an England pick sends England's osm_id and region, never Wales'),
    // which is asserted unchanged below — only the step that triggers the
    // write moved, from the row's onClick to the explicit Add.
    expect(mockCreateCity).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Add City & Place/i }));

    await waitFor(() => expect(mockCreateCity).toHaveBeenCalled());
    const body = mockCreateCity.mock.calls[0][0];
    expect(body).toMatchObject({
      name: 'Newport',
      country_code: 'GB',
      osm_type: 'node',
      osm_id: 26700978,
      display_name: 'Newport, Isle of Wight, England, PO30 1JU, UK',
      region_id: 5, // GB-ENG => id 5
    });
    // Must never carry the Wales region_id (6) for an England pick.
    expect(body.region_id).not.toBe(6);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-7 — truncation caveat rides on the PICKER (BUG-79). RED on main: for a
// spanning lookup the picker never renders, so the caveat only ever appears on
// the region-select branch.
// ────────────────────────────────────────────────────────────────────────────
describe('AC-7 truncation caveat on the picker (spanning lookup)', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
    mockCreateCity.mockReset();
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'GB',
      regionIso: 'GB-ENG',
      candidates: spanningRegionNewports(),
      failed: false,
      truncated: true,
    });
  });

  it('a truncated spanning lookup shows the "more matches not shown" caveat on the picker', async () => {
    const user = userEvent.setup();
    renderFlow();
    await openNewCityForm(user, 'Newport');

    // Anti-vacuous guard: require the picker's candidates first, so the caveat
    // can only be the picker's, not the legacy region-suggestion caption.
    expect(
      await screen.findByText(/Newport, Isle of Wight/i, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Cymru \/ Wales/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText(/there may be more|other matches may exist|not shown/i),
      ).toBeInTheDocument(),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-13 (MAJOR-2) — country is never silently auto-committed. RED on main:
// AddPlaceFlow.tsx:360 does `if (countryCode) setNewCityCountryCode(countryCode)`
// with NO visible tentative state; only the region ever gets a "Suggested:"
// caption. UX spec §3.2 requires the country to be a visibly tentative
// suggestion (e.g. `Suggested: United Kingdom — from "Newport"`).
// ────────────────────────────────────────────────────────────────────────────
describe('AC-13 country presented as a tentative suggestion, not silently committed', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
    mockCreateCity.mockReset();
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'GB',
      regionIso: 'GB-ENG',
      candidates: singleRegionNoOsm(),
      failed: false,
      truncated: false,
    });
  });

  it('shows a visible tentative "Suggested:" state for the auto-detected country', async () => {
    const user = userEvent.setup();
    renderFlow();
    await openNewCityForm(user, 'Newport');

    // Country-specific tentative caption (mirrors the region's BUG-71 treatment).
    // "United Kingdom" is the country name, distinct from the region's
    // "Suggested: England ..." — so this cannot false-match the region caption.
    expect(
      await screen.findByText(/Suggested: United Kingdom/i, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-14 (MAJOR-2) — creation-time messaging (UX spec §3.4 / §12.2 item 4). RED
// on main: after a successful non-resolved create the modal just closes / shows
// warnings; there is no status-conditional guidance line.
// ────────────────────────────────────────────────────────────────────────────
describe('AC-14 creation-time messaging keyed on geocode_status', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
    mockCreateCity.mockReset();
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'GB',
      regionIso: 'GB-ENG',
      candidates: singleRegionNoOsm(),
      failed: false,
      truncated: false,
    });
  });

  it('a created "pending" city shows the §3.4 pending guidance line', async () => {
    mockCreateCity.mockResolvedValue({
      id: 99,
      name: 'Newport',
      country_code: 'GB',
      region_id: 5,
      geocode_status: 'pending',
    });
    const user = userEvent.setup();
    renderFlow();
    await openNewCityForm(user, 'Newport');

    // Wait for the auto-filled country so the create submits cleanly.
    // NOTE (Frontend, BUG-75/UX-12 build): narrowed from the original
    // `/Suggested: United Kingdom|United Kingdom/i` alternation — now that
    // AC-13 is implemented, the plain "United Kingdom" alternate is also
    // matched by the country <option> element that's in the DOM from the
    // moment the form opens (independent of the lookup completing), and once
    // the AC-13 caption renders too, `findByText` throws "found multiple
    // elements" instead of waiting. The caption text is the more precise
    // condition this line always intended to wait for; no other change.
    await screen.findByText(/Suggested: United Kingdom/i, {}, { timeout: 2000 });
    const submit = screen.getByRole('button', { name: /Add City & Place/i });
    await user.click(submit);

    // UX spec §3.4 pending copy — verbatim DoD.
    expect(
      await screen.findByText(/still confirming this location/i, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });
});

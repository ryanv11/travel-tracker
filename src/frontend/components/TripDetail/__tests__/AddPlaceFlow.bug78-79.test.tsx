/**
 * BUG-78 + BUG-79 — GitHub #379, from the PO's UAT of the BUG-71/72 release.
 *
 * BUG-78 (P3): the "Suggested:" caption (BUG-71 stopgap) rendered with no
 * more visual weight than any other muted helper text, even though it's a
 * value the user is being asked to check rather than accept. Fix: bolded
 * (font-semibold — an existing design-system utility, no new colour or
 * component) — see AddPlaceFlow.tsx's Suggested-caption block.
 *
 * BUG-79 (P2): "springfield" resolved to Virginia with no ambiguity signal,
 * unlike "newport" in a UK context (already narrows to England/Wales with the
 * D14 "multiple matches" hint). Root cause was NOT the frontend narrowing
 * logic (D14, unchanged, already covered by AddPlaceFlow.test.tsx) — it was
 * the backend's discovery-lookup limit being too low and globally
 * unconstrained, thinning a genuinely multi-region name down to a false
 * single survivor before the frontend ever saw it. Fixed in geocode.ts
 * (higher limit for the unconstrained discovery call) and nominatim-client.ts
 * (a `truncated` signal preserved from the raw pre-filter response count,
 * threaded through useCities.ts's lookupCityCountry).
 *
 * This file's job is NOT to re-prove D14's narrowing mechanism (already
 * covered) — it's to prove:
 *   1. Given a richer candidate set (the kind the raised backend limit is
 *      meant to surface), the ambiguous-US case narrows and shows the hint
 *      exactly like the already-working ambiguous-UK case — same mechanism,
 *      proving nothing UK-specific was required.
 *   2. The unambiguous case (Denver) is unaffected: bold Suggested caption,
 *      no multiple-matches note.
 *   3. `truncated: true` from the lookup produces a visible "don't take this
 *      as certain" caveat, on both the ambiguous hint and the Suggested
 *      caption — the actual point of preserving the signal at all.
 *
 * IMPORTANT — mock limitation, stated plainly per the brief's verification
 * note: `lookupCityCountry` is mocked directly here, the same as every other
 * AddPlaceFlow test file. These fixtures assert what AddPlaceFlow does with a
 * GIVEN candidate set and truncation flag — they cannot prove Nominatim's
 * real response for "springfield" actually contains multiple US regions
 * within the raised backend limit. That is UNVERIFIED from this sandboxed
 * container (firewall blocks the live service) and needs PO confirmation on
 * staging. The backend-level proof that the limit itself was raised and that
 * `truncated` is computed correctly lives in
 * src/backend/routes/__tests__/geocode.test.ts and
 * src/backend/services/__tests__/nominatim-client.test.ts.
 *
 * Deliberately a separate file from AddPlaceFlow.test.tsx (D14),
 * AddPlaceFlow.bug71.test.tsx, and AddPlaceFlow.geocodeFailure.test.tsx —
 * same precedent as those files: touching only surrounding lines of
 * AddPlaceFlow.tsx while multiple bugs are in flight on this one component.
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

const gbCountry: Country = {
  country_code: 'GB',
  name: 'United Kingdom',
  region_tier_enabled: true,
  region_tier_label: 'Region',
};

const usRegions: Region[] = [
  {
    id: 1,
    country_code: 'US',
    name: 'Illinois',
    iso_3166_2: 'US-IL',
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
    name: 'Massachusetts',
    iso_3166_2: 'US-MA',
    created_at: '',
    updated_at: '',
  },
  {
    id: 4,
    country_code: 'US',
    name: 'Colorado',
    iso_3166_2: 'US-CO',
    created_at: '',
    updated_at: '',
  },
];

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

let activeCountryCode = 'US';
let regionsFixture: Region[] = usRegions;

vi.mock('../../../hooks/useAdmin', () => ({
  useCountries: () => ({ data: [usCountry, gbCountry] }),
  useCountryRegions: () => ({
    data: activeCountryCode === 'GB' ? gbRegions : regionsFixture,
  }),
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

function springfieldCandidatesUS(): GeocodeCandidate[] {
  // Models what a raised discovery limit is meant to surface: three distinct
  // US regions for one globally-ambiguous name, same shape the PO's UAT
  // report described (Illinois/Missouri, plus a third for good measure).
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
    {
      name: 'Springfield',
      display_name: 'Springfield, Massachusetts, USA',
      country_code: 'US',
      region_iso: 'US-MA',
      latitude: 42.1,
      longitude: -72.59,
    },
  ];
}

function newportCandidatesGB(): GeocodeCandidate[] {
  return [
    {
      name: 'Newport',
      display_name: 'Newport, Wales, UK',
      country_code: 'GB',
      region_iso: 'GB-WLS',
      latitude: 51.58,
      longitude: -2.99,
    },
    {
      name: 'Newport',
      display_name: 'Newport, England, UK',
      country_code: 'GB',
      region_iso: 'GB-ENG',
      latitude: 50.7,
      longitude: -1.29,
    },
  ];
}

describe('AddPlaceFlow — BUG-78 (bold Suggested caption) + BUG-79 (US region narrowing)', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
    activeCountryCode = 'US';
    regionsFixture = usRegions;
  });

  it('BUG-79: ambiguous US case ("springfield") narrows the region selector and shows the multiple-matches note — same mechanism already proven for the UK case', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'US',
      regionIso: 'US-IL',
      candidates: springfieldCandidatesUS(),
      failed: false,
      truncated: false,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Springfield');

    await waitFor(() => {
      expect(screen.getByText(/multiple matches found, please choose/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'Illinois' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Missouri' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Massachusetts' })).toBeInTheDocument();
    // Not silently pre-filled — the user still has to choose.
    const regionSelect = screen
      .getByRole('option', { name: /no state selected/i })
      .closest('select') as HTMLSelectElement;
    expect(regionSelect).toHaveValue('');
    expect(screen.queryByText(/suggested:/i)).not.toBeInTheDocument();
  });

  it('BUG-79 regression check: ambiguous UK case ("newport") behaves exactly as it did before this fix — England/Wales narrowing + hint, unaffected', async () => {
    activeCountryCode = 'GB';
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'GB',
      regionIso: 'GB-WLS',
      candidates: newportCandidatesGB(),
      failed: false,
      truncated: false,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Newport');

    await waitFor(() => {
      expect(screen.getByText(/multiple matches found, please choose/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'England' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Wales' })).toBeInTheDocument();
    // Not truncated in this fixture — no "there may be more" caveat appended.
    expect(screen.queryByText(/there may be more/i)).not.toBeInTheDocument();
  });

  it('BUG-78 + criterion 3: a genuinely unambiguous city (Denver) still auto-fills with a BOLD "Suggested:" caption and no multiple-matches note', async () => {
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
      ],
      failed: false,
      truncated: false,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Denver');

    const caption = await screen.findByText(/suggested: colorado/i);
    // BUG-78: bold via the existing font-semibold utility — no new colour or
    // component introduced.
    expect(caption).toHaveClass('font-semibold');
    expect(screen.queryByText(/multiple matches found, please choose/i)).not.toBeInTheDocument();
    // Not truncated in this fixture — no extra caveat.
    expect(caption).not.toHaveTextContent(/other matches may exist/i);
  });

  it('BUG-79 criterion 4: a truncated lookup that still collapses to one region shows the "other matches may exist" caveat — does not present the result as certain', async () => {
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
      ],
      failed: false,
      truncated: true,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Denver');

    const caption = await screen.findByText(/suggested: colorado/i);
    expect(caption).toHaveClass('font-semibold'); // BUG-78 still holds
    expect(caption).toHaveTextContent(/other matches may exist/i);
  });

  it('BUG-79 criterion 4: a truncated AND ambiguous lookup appends the "there may be more not shown" caveat to the multiple-matches hint', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: 'US',
      regionIso: 'US-IL',
      candidates: springfieldCandidatesUS(),
      failed: false,
      truncated: true,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Springfield');

    await waitFor(() => {
      expect(screen.getByText(/multiple matches found, please choose/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/there may be more not shown/i)).toBeInTheDocument();
  });
});

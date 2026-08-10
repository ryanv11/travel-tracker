/**
 * Tests for AddPlaceFlow's BUG-73 geocode-failure visibility.
 *
 * Before BUG-73, a failed `GET /api/geocode` lookup (proxied via
 * lookupCityCountry, hooks/useCities.ts) rendered identically to a
 * successful lookup that found nothing — the user saw no signal at all.
 * lookupCityCountry now retries transient failures internally (see
 * useCities.geocode.test.tsx for that proof) and, once retries are
 * exhausted, resolves with `failed: true` instead of being indistinguishable
 * from a genuine "no match". These tests cover AddPlaceFlow's handling of
 * that signal: a visible, non-blocking failure message; the manual-entry
 * fallback staying fully usable; a retry action that re-runs the lookup and
 * clears the failure state on success; and confirming "found nothing" still
 * renders with no failure message at all.
 *
 * This file intentionally does not touch AddPlaceFlow.tsx:250-263's D14
 * ambiguity computation (BUG-71, in flight separately) — every scenario here
 * uses single-candidate or empty-candidate fixtures so that branch is never
 * exercised, and the existing AddPlaceFlow.test.tsx D14 suite is left as-is.
 *
 * Mocks: same shape as AddPlaceFlow.test.tsx (D14 suite) — see that file's
 * header comment for the full mock rationale.
 *
 * Source: src/frontend/components/TripDetail/AddPlaceFlow.tsx
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Country } from '../../../types/api';
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

vi.mock('../../../hooks/useAdmin', () => ({
  useCountries: () => ({ data: [usCountry] }),
  useCountryRegions: () => ({ data: [] }),
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
      tripCountries={[]}
      onManageCountries={vi.fn()}
    />,
  );
}

describe('AddPlaceFlow — BUG-73 geocode failure visibility', () => {
  beforeEach(() => {
    mockLookupCityCountry.mockReset();
  });

  it('shows a visible, non-blocking failure message when the lookup fails', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: null,
      regionIso: null,
      candidates: [],
      failed: true,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Nowhereville');

    await waitFor(() => {
      expect(screen.getByText(/automatic lookup failed/i)).toBeInTheDocument();
    });
    // "detecting…" must have cleared — the failure state is distinguishable
    // from "still pending", not layered on top of it.
    expect(screen.queryByText(/detecting…/i)).not.toBeInTheDocument();
  });

  it('does NOT show a failure message when the lookup succeeds but finds nothing (found-nothing != failure)', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: null,
      regionIso: null,
      candidates: [],
      failed: false,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Zzznotacity');

    // Give any pending state a chance to settle before asserting absence.
    await waitFor(() => {
      expect(screen.queryByText(/detecting…/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/automatic lookup failed/i)).not.toBeInTheDocument();
  });

  it('keeps the manual-entry fallback fully usable after a failed lookup', async () => {
    mockLookupCityCountry.mockResolvedValue({
      countryCode: null,
      regionIso: null,
      candidates: [],
      failed: true,
    });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Nowhereville');
    await waitFor(() => {
      expect(screen.getByText(/automatic lookup failed/i)).toBeInTheDocument();
    });

    // The form is not disabled/blocked — country can still be picked by hand.
    const countrySelect = screen
      .getByRole('option', { name: 'Select country…' })
      .closest('select') as HTMLSelectElement;
    expect(countrySelect).toBeEnabled();
    await user.selectOptions(countrySelect, 'US');
    expect(countrySelect).toHaveValue('US');

    // Submit button is not stuck disabled by the failure state either.
    expect(screen.getByRole('button', { name: /add city & place/i })).toBeEnabled();
  });

  it('retrying after a failure re-runs the lookup and clears the failure message on success', async () => {
    mockLookupCityCountry
      .mockResolvedValueOnce({ countryCode: null, regionIso: null, candidates: [], failed: true })
      .mockResolvedValueOnce({
        countryCode: 'US',
        regionIso: null,
        candidates: [],
        failed: false,
      });
    const user = userEvent.setup();
    renderFlow();

    await openNewCityForm(user, 'Springfield');
    await waitFor(() => {
      expect(screen.getByText(/automatic lookup failed/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByText(/automatic lookup failed/i)).not.toBeInTheDocument();
    });
    expect(mockLookupCityCountry).toHaveBeenCalledTimes(2);
    const countrySelect = screen
      .getByRole('option', { name: 'Select country…' })
      .closest('select') as HTMLSelectElement;
    expect(countrySelect).toHaveValue('US');
  });
});

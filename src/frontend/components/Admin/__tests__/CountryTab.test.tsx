/**
 * Tests for CountryTab (BUG-35).
 *
 * Mocks:
 *   - useCountries() / useUpdateCountry() from hooks/useAdmin
 *
 * Covers:
 *   - Region tier checkbox exposes an explanatory hover tooltip (title attribute)
 *     naming the country's region tier label (AD-05/GE-03).
 *   - Falls back to a generic "state/province/territory" wording when the
 *     country has no region_tier_label configured.
 *
 * Source: src/frontend/components/Admin/CountryTab.tsx
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Country } from '../../../types/api.js';
import { CountryTab } from '../CountryTab.js';

const mockUseCountries = vi.fn();
const mockUseUpdateCountry = vi.fn();

vi.mock('../../../hooks/useAdmin.js', () => ({
  useCountries: () => mockUseCountries(),
  useUpdateCountry: () => mockUseUpdateCountry(),
}));

function makeCountry(overrides: Partial<Country> = {}): Country {
  return {
    country_code: 'US',
    name: 'United States',
    region_tier_enabled: true,
    region_tier_label: 'State',
    ...overrides,
  };
}

describe('CountryTab', () => {
  it('shows a tooltip naming the region tier label when one is configured', () => {
    mockUseCountries.mockReturnValue({ data: [makeCountry()], isLoading: false, error: null });
    mockUseUpdateCountry.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, error: null });

    render(<CountryTab />);

    const label = screen.getByText('Region tier').closest('label');
    expect(label).toHaveAttribute(
      'title',
      'Show a State tier for United States — Country → State → City instead of Country → City',
    );
  });

  it('falls back to generic wording when the country has no region tier label', () => {
    mockUseCountries.mockReturnValue({
      data: [
        makeCountry({
          country_code: 'FR',
          name: 'France',
          region_tier_enabled: false,
          region_tier_label: null,
        }),
      ],
      isLoading: false,
      error: null,
    });
    mockUseUpdateCountry.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, error: null });

    render(<CountryTab />);

    const label = screen.getByText('Region tier').closest('label');
    expect(label).toHaveAttribute(
      'title',
      'Show a state/province/territory tier for France — Country → Region → City instead of Country → City',
    );
  });
});

/**
 * Tests for CityItemsPage (IT-09) — the cross-trip rated-items view for a city.
 *
 * Mocks useCityItems so these don't require a real QueryClient/network call;
 * focuses on the two states requirement text calls out explicitly: the
 * default (unfiltered, backend-DESC) list attributes each item to its trip,
 * and an empty result is distinguished from "no items ever" only by copy —
 * behaviourally both render the same not-found state here since useCityItems
 * already reflects the current filter server-side.
 *
 * Source: src/frontend/pages/CityItemsPage.tsx
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CityItem } from '../../types/api.js';
import { CityItemsPage } from '../CityItemsPage.js';

const mockUseCityItems = vi.fn();

vi.mock('../../hooks/useCities.js', () => ({
  useCityItems: (...args: unknown[]) => mockUseCityItems(...args),
}));

function makeCityItem(overrides: Partial<CityItem> = {}): CityItem {
  return {
    id: 1,
    item_type: 'restaurant',
    status: 'completed',
    notes: null,
    trip_name: 'Portugal 2024',
    trip_start_date: '2024-04-01',
    restaurant_name: 'Time Out Market',
    restaurant_rating: 5,
    restaurant_post_visit_notes: null,
    hotel_property_name: null,
    hotel_rating: null,
    hotel_post_visit_notes: null,
    experience_rating: null,
    experience_post_visit_notes: null,
    ...overrides,
  };
}

function renderPage(initialState?: { cityName?: string; countryName?: string | null }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/cities/5', state: initialState }]}>
      <Routes>
        <Route path="/cities/:id" element={<CityItemsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CityItemsPage', () => {
  it('renders items attributed to their source trip', () => {
    mockUseCityItems.mockReturnValue({
      data: [makeCityItem()],
      isLoading: false,
      error: null,
    });
    renderPage({ cityName: 'Lisbon', countryName: 'Portugal' });

    expect(screen.getByText('Lisbon')).toBeInTheDocument();
    expect(screen.getByText('Time Out Market')).toBeInTheDocument();
    expect(screen.getByText(/Portugal 2024/)).toBeInTheDocument();
  });

  it('falls back to a generic heading when no city name was passed via router state', () => {
    mockUseCityItems.mockReturnValue({ data: [], isLoading: false, error: null });
    renderPage(undefined);

    expect(screen.getByText('This city')).toBeInTheDocument();
  });

  it('shows the no-items empty state when the city has no completed rated items', () => {
    mockUseCityItems.mockReturnValue({ data: [], isLoading: false, error: null });
    renderPage({ cityName: 'Lisbon' });

    expect(
      screen.getByText('No completed items yet across your visits to this city.'),
    ).toBeInTheDocument();
  });

  it('shows a loading state while the query is in flight', () => {
    mockUseCityItems.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderPage({ cityName: 'Lisbon' });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error message when the query fails', () => {
    mockUseCityItems.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    });
    renderPage({ cityName: 'Lisbon' });

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});

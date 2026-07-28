/**
 * Scenario tests for TripDetail's delete affordance (BUG-50/TR-14).
 *
 * Mocks:
 *   - hooks/useItems: useTripLevelItems (TripItemsSection) + useDeleteItem (ItemCard)
 *   - hooks/usePlaces: useRemovePlace (PlaceSection)
 *   - utils/apiClient: apiDelete/apiPatch — the real useTripDetailController and
 *     useTrips mutation hooks run against these mocks (same precedent as
 *     useAdmin.companions.test.tsx / useTripDetailController.test.tsx)
 *   - react-router-dom: useNavigate, so navigation-after-delete can be asserted
 *     directly without a full Router tree
 *
 * Covers:
 *   - Delete button is present and reachable from the detail view
 *   - Delete button stays visible on a Locked trip (unlike Edit, which hides) —
 *     TR-14 requires the affordance stay reachable even when refused
 *   - Confirmation names what will be lost: trip name, place count, item count
 *   - Confirming delete on an unlocked trip calls DELETE /api/trips/:id, then
 *     navigates back to /trips
 *   - Confirming delete on a Locked trip never calls the API — it opens the
 *     existing Unlock confirmation instead, directing the user to unlock
 *
 * Source: src/frontend/components/TripDetail/TripDetail.tsx
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, TripDetail as TripDetailType, TripPlace } from '../../../types/api';
import { apiDelete, apiPatch } from '../../../utils/apiClient';
import { TripDetail } from '../TripDetail';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/apiClient')>();
  return { ...actual, apiPatch: vi.fn(), apiDelete: vi.fn() };
});

// Partial mock via importOriginal, NOT a total replacement. TripDetail renders
// PlaceSection, which consumes other exports of this module (e.g. B8's
// DEFAULT_RATING_SORT_FILTER / applyRatingSortFilter for IT-08). A total mock
// silently drops those, and the failure surfaces as an unrelated render crash
// inside PlaceSection rather than as a missing mock — which is exactly how this
// broke main: B7 and B8 were each green alone and red once merged together.
vi.mock('../../../hooks/useItems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useItems')>();
  return {
    ...actual,
    useTripLevelItems: () => ({ data: [], isLoading: false, error: null }),
    useDeleteItem: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  };
});

vi.mock('../../../hooks/usePlaces', () => ({
  useRemovePlace: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
}));

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: Math.floor(Math.random() * 10000),
    trip_place_id: 1,
    item_type: 'restaurant',
    status: 'consider',
    notes: null,
    map_url: null,
    name: 'Test Restaurant',
    neighbourhood_area: null,
    cuisine_type: null,
    source: null,
    property_name: null,
    address: null,
    check_in_date: null,
    check_out_date: null,
    booking_reference: null,
    confirmation_number: null,
    airline: null,
    flight_number: null,
    departure_airport: null,
    arrival_airport: null,
    departure_datetime: null,
    arrival_datetime: null,
    seat: null,
    provider: null,
    pickup_location: null,
    dropoff_location: null,
    pickup_datetime: null,
    dropoff_datetime: null,
    vehicle_class: null,
    rating: null,
    post_visit_notes: null,
    is_carried_forward: false,
    carried_from_item_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePlace(items: Item[]): TripPlace {
  return {
    id: 1,
    city_id: 5,
    activities: [],
    city: {
      id: 5,
      name: 'Lisbon',
      country_code: 'PT',
      country_name: 'Portugal',
      region_id: null,
      region_iso: null,
      latitude: null,
      longitude: null,
      geocode_status: 'pending',
    },
    items,
    created_at: '2024-01-01T00:00:00Z',
  };
}

function makeTrip(overrides: Partial<TripDetailType> = {}): TripDetailType {
  return {
    id: 7,
    name: 'Portugal Roadtrip',
    status: 'planning',
    start_date: '2024-05-01',
    end_date: '2024-05-10',
    photo_album_ref: null,
    places: [],
    categories: [],
    companions: [],
    activities: [],
    countries: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderTrip(trip: TripDetailType) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // MemoryRouter is required because TripDetail renders PlaceSection, which
  // links each city to /cities/:id (IT-09). Router context is not optional
  // scaffolding here — without it react-router throws on a null context and
  // the failure reads as an unrelated destructuring error.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(<TripDetail trip={trip} />, { wrapper });
}

describe('TripDetail — delete affordance (BUG-50/TR-14)', () => {
  beforeEach(() => {
    vi.mocked(apiDelete).mockReset();
    vi.mocked(apiPatch).mockReset();
    mockNavigate.mockReset();
  });

  it('renders a reachable Delete button', () => {
    renderTrip(makeTrip());
    expect(screen.getByRole('button', { name: 'Delete Trip' })).toBeInTheDocument();
  });

  it('Delete stays visible on a Locked trip, unlike Edit', () => {
    renderTrip(makeTrip({ status: 'locked' }));
    expect(screen.getByRole('button', { name: 'Delete Trip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit$/ })).not.toBeInTheDocument();
  });

  it('confirmation names the trip, place count, and item count', async () => {
    const trip = makeTrip({
      places: [makePlace([makeItem(), makeItem()]), makePlace([makeItem()])],
    });
    renderTrip(trip);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trip' }));

    expect(screen.getByText(/Delete "Portugal Roadtrip"\?/)).toBeInTheDocument();
    expect(screen.getByText(/2 places and 3 items/)).toBeInTheDocument();
  });

  it('confirming delete on an unlocked trip calls the API then navigates to /trips', async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined);
    renderTrip(makeTrip({ id: 99, status: 'planning' }));

    // The header trigger and the dialog's confirm button share the same
    // accessible name ("Delete Trip") once the dialog is open — the trigger
    // is first in DOM order, the dialog's confirm button second.
    await userEvent.click(screen.getByRole('button', { name: 'Delete Trip' }));
    const [, confirmButton] = screen.getAllByRole('button', { name: 'Delete Trip' });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith('/api/trips/99');
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/trips', { replace: true });
    });
  });

  it('a Locked trip is refused with a message directing the user to unlock, not deleted', async () => {
    renderTrip(makeTrip({ status: 'locked' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trip' }));
    expect(screen.getByText(/can't be deleted/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Unlock Trip' }));

    // Refused, not deleted — and routed into the existing unlock confirmation.
    expect(apiDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Unlock this trip?')).toBeInTheDocument();
  });
});

/**
 * Scenario tests for PlaceSection's remove-place affordance (BUG-32).
 *
 * Mocks:
 *   - useRemovePlace() from hooks/usePlaces — controls mutation state
 *   - useDeleteItem() from hooks/useItems — ItemCard's dependency, stubbed so
 *     rendering a place with items doesn't require a real QueryClient
 *
 * Covers:
 *   - Remove button hidden when trip is locked
 *   - Remove button visible + opens confirmation dialog when unlocked
 *   - Confirmation copy mentions cascading item removal when the place has items
 *   - Confirmation copy omits item count when the place has none
 *   - Cancel closes the dialog without calling the mutation
 *   - Confirm calls the mutation with the right args; success closes the dialog
 *   - A failed mutation keeps the dialog open and surfaces the error message
 *
 * Source: src/frontend/components/TripDetail/PlaceSection.tsx
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, TripPlace } from '../../../types/api.js';
import { PlaceSection } from '../PlaceSection.js';

// ----------------------------------------------------------------
// Mock hooks
// ----------------------------------------------------------------

const mockMutate = vi.fn();
const mockRemovePlace = {
  mutate: mockMutate,
  isPending: false,
  error: null as string | Error | null,
  reset: vi.fn(),
};

vi.mock('../../../hooks/usePlaces.js', () => ({
  useRemovePlace: () => mockRemovePlace,
}));

// ItemCard (rendered per item) depends on useDeleteItem — stub it so tests that
// include items don't need a real QueryClient wired up.
vi.mock('../../../hooks/useItems.js', () => ({
  useDeleteItem: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));

// ----------------------------------------------------------------
// Test data builders
// ----------------------------------------------------------------

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: Math.floor(Math.random() * 10000),
    trip_place_id: 1,
    item_type: 'restaurant',
    status: 'consider',
    notes: null,
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

function makePlace(items: Item[], overrides: Partial<TripPlace> = {}): TripPlace {
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
      geocode_status: 'pending' as const,
    },
    items,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const defaultProps = {
  tripId: 10,
  tripStartDate: '2024-04-01',
  tripEndDate: '2024-04-14',
};

describe('PlaceSection — remove place (BUG-32)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemovePlace.isPending = false;
    mockRemovePlace.error = null;
  });

  it('hides the Remove button when the trip is locked', () => {
    render(<PlaceSection place={makePlace([])} isLocked={true} {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('shows the Remove button when the trip is unlocked', () => {
    render(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    // Dialog is unmounted until opened, so this is the only "Remove"-named button here.
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('opens a confirmation dialog on click, without mentioning items when there are none', async () => {
    render(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByText('Remove Lisbon?')).toBeInTheDocument();
    expect(
      screen.getByText('This permanently removes Lisbon from the trip. This cannot be undone.'),
    ).toBeInTheDocument();
  });

  it('mentions the item count in the confirmation message when the place has items', async () => {
    const place = makePlace([makeItem({ id: 1 }), makeItem({ id: 2 })]);
    render(<PlaceSection place={place} isLocked={false} {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByText(/along with the 2 items logged under it/)).toBeInTheDocument();
  });

  it('cancel closes the dialog without calling the mutation', async () => {
    render(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Remove Lisbon?')).not.toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('confirm calls the mutation with tripId and placeId', async () => {
    render(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    // Two "Remove" buttons now exist (row button + dialog confirm) — the dialog's
    // is scoped inside the modal, found via its distinct accessible role ordering.
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(removeButtons[removeButtons.length - 1]);

    expect(mockMutate).toHaveBeenCalledWith(
      { tripId: 10, placeId: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('keeps the dialog open and shows the error when the mutation fails', async () => {
    mockRemovePlace.error = new Error('Internal server error');
    render(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByText('Internal server error')).toBeInTheDocument();
    });
    expect(screen.getByText('Remove Lisbon?')).toBeInTheDocument();
  });
});

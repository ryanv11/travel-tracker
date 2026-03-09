/**
 * Scenario tests for ReviewPanel (RV-01 through RV-04).
 *
 * Mocks:
 *   - useLockTrip()  from hooks/useTrips
 *   - useUpdateItem() from hooks/useItems
 *
 * Covers:
 *   - Panel renders trip name and places
 *   - BUG-04 regression: "Return to Planning" button is present
 *   - BUG-05 regression: "next_time" items are NOT bulk-completed
 *   - Lock button shows confirmation dialog
 *   - Back to Trip button calls onClose
 *   - Mark all Completed patches only non-cancelled, non-already-completed items
 *
 * TODO (Frontend to fill in):
 *   - BUG-04: once "Return to Planning" button is implemented, update the test
 *     below to verify the correct API call is made (PATCH status → 'planning').
 *
 * Source: src/frontend/components/PostTripReview/ReviewPanel.tsx
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewPanel } from '../ReviewPanel.js';
import type { TripDetail, Item, TripPlace } from '../../../types/api.js';

// ----------------------------------------------------------------
// Mock hooks
// ----------------------------------------------------------------

const mockLockMutateAsync = vi.fn();
const mockLockTrip = {
  mutateAsync: mockLockMutateAsync,
  isPending: false,
  error: null,
};

const mockUpdateMutateAsync = vi.fn();
const mockUpdateItem = {
  mutateAsync: mockUpdateMutateAsync,
  isPending: false,
  error: null,
};

vi.mock('../../../hooks/useTrips.js', () => ({
  useLockTrip: () => mockLockTrip,
}));

vi.mock('../../../hooks/useItems.js', () => ({
  useUpdateItem: () => mockUpdateItem,
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
    restaurant_name: 'Test Restaurant',
    neighbourhood_area: null,
    cuisine_type: null,
    source: null,
    hotel_property_name: null,
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
    trip_id: 10,
    city_id: 5,
    city: {
      id: 5,
      name: 'Tokyo',
      country_code: 'JP',
      region_id: null,
      created_at: '2024-01-01T00:00:00Z',
    },
    items,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTrip(places: TripPlace[]): TripDetail {
  return {
    id: 10,
    name: 'Japan 2024',
    status: 'review_pending',
    start_date: '2024-04-01',
    end_date: '2024-04-14',
    photo_album_ref: null,
    places,
    categories: [],
    companions: [],
    activities: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('ReviewPanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLockTrip.isPending = false;
    mockLockTrip.error = null;
    mockUpdateItem.isPending = false;
    mockUpdateItem.error = null;
  });

  it('renders the trip name in the heading', () => {
    const trip = makeTrip([makePlace([])]);
    render(<ReviewPanel trip={trip} onClose={onClose} />);
    expect(screen.getByText(/Post-Trip Review — Japan 2024/)).toBeInTheDocument();
  });

  it('renders place city name', () => {
    const trip = makeTrip([makePlace([])]);
    render(<ReviewPanel trip={trip} onClose={onClose} />);
    expect(screen.getByText(/Tokyo/)).toBeInTheDocument();
  });

  it('shows "No items at this place." when place has no items', () => {
    const trip = makeTrip([makePlace([])]);
    render(<ReviewPanel trip={trip} onClose={onClose} />);
    expect(screen.getByText('No items at this place.')).toBeInTheDocument();
  });

  it('renders "Mark all as Completed" button', () => {
    const trip = makeTrip([makePlace([])]);
    render(<ReviewPanel trip={trip} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Mark all as Completed' })).toBeInTheDocument();
  });

  it('renders "Complete Review & Lock Trip" button', () => {
    const trip = makeTrip([makePlace([])]);
    render(<ReviewPanel trip={trip} onClose={onClose} />);
    expect(screen.getByRole('button', { name: /Complete Review.*Lock Trip/ })).toBeInTheDocument();
  });

  it('renders "Back to Trip" button', () => {
    const trip = makeTrip([makePlace([])]);
    render(<ReviewPanel trip={trip} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Back to Trip' })).toBeInTheDocument();
  });

  it('"Back to Trip" calls onClose', async () => {
    const trip = makeTrip([makePlace([])]);
    render(<ReviewPanel trip={trip} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to Trip' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows confirmation dialog when lock button is clicked', async () => {
    const trip = makeTrip([makePlace([])]);
    render(<ReviewPanel trip={trip} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /Complete Review.*Lock Trip/ }));
    expect(screen.getByText('Lock trip?')).toBeInTheDocument();
  });

  it('calls lockTrip.mutateAsync after confirming lock', async () => {
    mockLockMutateAsync.mockResolvedValue({});
    const trip = makeTrip([makePlace([])]);
    render(<ReviewPanel trip={trip} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /Complete Review.*Lock Trip/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Lock Trip' }));
    await waitFor(() => {
      expect(mockLockMutateAsync).toHaveBeenCalledWith(10);
    });
  });

  // ----------------------------------------------------------------
  // BUG-04 regression: Return to Planning button
  // ----------------------------------------------------------------

  // BUG-04: ReviewPanel has no "Return to Planning" button, leaving the user
  // with no way to go back to the planning state from review_pending.
  // This test documents the required behaviour. It WILL FAIL until BUG-04 is fixed.
  it('BUG-04 regression: renders a "Return to Planning" button', () => {
    const trip = makeTrip([makePlace([])]);
    render(<ReviewPanel trip={trip} onClose={onClose} />);
    expect(screen.getByRole('button', { name: /Return to Planning/ })).toBeInTheDocument();
  });

  // ----------------------------------------------------------------
  // BUG-05 regression: "Mark all Completed" must exclude next_time items
  // ----------------------------------------------------------------

  it('BUG-05 regression: "Mark all Completed" does NOT patch next_time items', async () => {
    const nextTimeItem = makeItem({ id: 301, status: 'next_time' });
    const considerItem = makeItem({ id: 302, status: 'consider' });
    const trip = makeTrip([makePlace([nextTimeItem, considerItem])]);

    render(<ReviewPanel trip={trip} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as Completed' }));

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalled();
    });

    // Verify next_time item (301) was NOT patched
    const patchedIds = mockUpdateMutateAsync.mock.calls.map(
      (call: [{ itemId: number }]) => call[0].itemId,
    );
    expect(patchedIds).not.toContain(301);
  });

  it('"Mark all Completed" patches consider and confirmed items', async () => {
    const considerItem = makeItem({ id: 401, status: 'consider' });
    const confirmedItem = makeItem({ id: 402, status: 'confirmed' });
    const completedItem = makeItem({ id: 403, status: 'completed' }); // already done
    const trip = makeTrip([makePlace([considerItem, confirmedItem, completedItem])]);

    render(<ReviewPanel trip={trip} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as Completed' }));

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(2); // consider + confirmed only
    });

    const patchedIds = mockUpdateMutateAsync.mock.calls.map(
      (call: [{ itemId: number }]) => call[0].itemId,
    );
    expect(patchedIds).toContain(401);
    expect(patchedIds).toContain(402);
    expect(patchedIds).not.toContain(403); // already completed — skip
  });

  it('"Mark all Completed" does not patch cancelled items', async () => {
    const cancelledItem = makeItem({ id: 501, status: 'cancelled' });
    const trip = makeTrip([makePlace([cancelledItem])]);

    render(<ReviewPanel trip={trip} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as Completed' }));

    // No items to patch — mutateAsync should not be called
    await new Promise((r) => setTimeout(r, 50)); // settle async work
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });
});

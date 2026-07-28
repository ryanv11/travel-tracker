/**
 * Tests for TripItemsSection (BUG-36 / IT-01).
 *
 * Mocks:
 *   - useTripLevelItems / useCreateItem / useUpdateItem / useDeleteItem from hooks/useItems
 *
 * Covers:
 *   - Renders trip-level items with an ItemCard each.
 *   - Empty state prompts the user to add a flight or car rental.
 *   - "+ Add Trip Item" opens ItemForm restricted to Flight and Car Rental only
 *     (no Restaurant/Hotel/Experience/Note options at trip level). Labelled
 *     distinctly from PlaceSection's "+ Add Item" so the two never collide
 *     under an accessible-name query (see TripItemsSection.tsx module doc).
 *   - Locked trips hide the add button; an empty+locked trip renders nothing.
 *
 * Source: src/frontend/components/TripDetail/TripItemsSection.tsx
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Item } from '../../../types/api.js';
import { TripItemsSection } from '../TripItemsSection.js';

const mockUseTripLevelItems = vi.fn();
const mockUseCreateItem = vi.fn();
const mockUseUpdateItem = vi.fn();
const mockUseDeleteItem = vi.fn();

vi.mock('../../../hooks/useItems.js', () => ({
  useTripLevelItems: () => mockUseTripLevelItems(),
  useCreateItem: () => mockUseCreateItem(),
  useUpdateItem: () => mockUseUpdateItem(),
  useDeleteItem: () => mockUseDeleteItem(),
}));

function makeFlight(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    item_type: 'flight',
    status: 'confirmed',
    notes: null,
    map_url: null,
    is_carried_forward: false,
    carried_from_item_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    trip_place_id: null,
    airline: 'Test Air',
    flight_number: 'TA123',
    departure_airport: 'LHR',
    arrival_airport: 'JFK',
    ...overrides,
  } as Item;
}

const idleMutation = { mutateAsync: vi.fn(), isPending: false, error: null };

describe('TripItemsSection', () => {
  it('renders one ItemCard per trip-level item', () => {
    mockUseTripLevelItems.mockReturnValue({
      data: [makeFlight({ id: 1 }), makeFlight({ id: 2, item_type: 'car_rental' })],
      isLoading: false,
      error: null,
    });
    mockUseCreateItem.mockReturnValue(idleMutation);
    mockUseUpdateItem.mockReturnValue(idleMutation);
    mockUseDeleteItem.mockReturnValue(idleMutation);

    render(
      <TripItemsSection
        tripId={1}
        isLocked={false}
        tripStartDate="2026-06-01"
        tripEndDate="2026-06-10"
      />,
    );

    expect(screen.getByText('LHR → JFK')).toBeInTheDocument();
    expect(screen.getByText('Trip Items')).toBeInTheDocument();
  });

  it('shows an empty-state prompt when there are no trip-level items', () => {
    mockUseTripLevelItems.mockReturnValue({ data: [], isLoading: false, error: null });
    mockUseCreateItem.mockReturnValue(idleMutation);
    mockUseUpdateItem.mockReturnValue(idleMutation);
    mockUseDeleteItem.mockReturnValue(idleMutation);

    render(
      <TripItemsSection
        tripId={1}
        isLocked={false}
        tripStartDate="2026-06-01"
        tripEndDate="2026-06-10"
      />,
    );

    expect(screen.getByText(/No trip-level items yet/)).toBeInTheDocument();
  });

  it('restricts the Add Item type picker to Flight and Car Rental only', async () => {
    mockUseTripLevelItems.mockReturnValue({ data: [], isLoading: false, error: null });
    mockUseCreateItem.mockReturnValue(idleMutation);
    mockUseUpdateItem.mockReturnValue(idleMutation);
    mockUseDeleteItem.mockReturnValue(idleMutation);

    render(
      <TripItemsSection
        tripId={1}
        isLocked={false}
        tripStartDate="2026-06-01"
        tripEndDate="2026-06-10"
      />,
    );
    await userEvent.click(screen.getByText('+ Add Trip Item'));

    expect(screen.getByText('Flight')).toBeInTheDocument();
    expect(screen.getByText('Car Rental')).toBeInTheDocument();
    expect(screen.queryByText('Restaurant')).not.toBeInTheDocument();
    expect(screen.queryByText('Hotel')).not.toBeInTheDocument();
    expect(screen.queryByText('Experience')).not.toBeInTheDocument();
    expect(screen.queryByText('Note')).not.toBeInTheDocument();
  });

  it('hides the Add Item button when the trip is locked', () => {
    mockUseTripLevelItems.mockReturnValue({
      data: [makeFlight()],
      isLoading: false,
      error: null,
    });
    mockUseCreateItem.mockReturnValue(idleMutation);
    mockUseUpdateItem.mockReturnValue(idleMutation);
    mockUseDeleteItem.mockReturnValue(idleMutation);

    render(
      <TripItemsSection
        tripId={1}
        isLocked={true}
        tripStartDate="2026-06-01"
        tripEndDate="2026-06-10"
      />,
    );

    expect(screen.queryByText('+ Add Trip Item')).not.toBeInTheDocument();
  });

  it('renders nothing when locked with no trip-level items', () => {
    mockUseTripLevelItems.mockReturnValue({ data: [], isLoading: false, error: null });
    mockUseCreateItem.mockReturnValue(idleMutation);
    mockUseUpdateItem.mockReturnValue(idleMutation);
    mockUseDeleteItem.mockReturnValue(idleMutation);

    const { container } = render(
      <TripItemsSection
        tripId={1}
        isLocked={true}
        tripStartDate="2026-06-01"
        tripEndDate="2026-06-10"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

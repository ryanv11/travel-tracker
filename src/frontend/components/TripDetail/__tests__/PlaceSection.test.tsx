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
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, TripPlace } from '../../../types/api.js';
import { PlaceSection } from '../PlaceSection.js';

// PlaceSection's city name is a <Link> (IT-09) — needs a Router context, or
// react-router throws "useHref() may be used only in the context of a
// <Router> component" for every render below.
function renderPlaceSection(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

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

// BUG-80: PlaceSection now calls useCountries() (formatCitySubtitle needs the
// country's region-tier config) — mocked so this file doesn't need a real
// QueryClientProvider wired up, same reasoning as the useItems mock below.
// Empty by default: none of these tests exercise region-tier disambiguation
// (that's formatCitySubtitle's own unit tests) — every fixture city here is a
// non-region-tier / unlisted country, so formatCitySubtitle's tier lookup
// safely falls through to "show the country as before" either way.
vi.mock('../../../hooks/useAdmin.js', () => ({
  useCountries: () => ({ data: [] }),
}));

// ItemCard (rendered per item) depends on useDeleteItem — stub it so tests that
// include items don't need a real QueryClient wired up. applyRatingSortFilter/
// DEFAULT_RATING_SORT_FILTER (IT-08) are pure helpers PlaceSection imports
// from the same module — re-exported via requireActual so this mock doesn't
// have to hand-reimplement their logic.
vi.mock('../../../hooks/useItems.js', async () => {
  const actual = await vi.importActual<typeof import('../../../hooks/useItems.js')>(
    '../../../hooks/useItems.js',
  );
  return {
    ...actual,
    useDeleteItem: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  };
});

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
    renderPlaceSection(<PlaceSection place={makePlace([])} isLocked={true} {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('shows the Remove button when the trip is unlocked', () => {
    renderPlaceSection(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    // Dialog is unmounted until opened, so this is the only "Remove"-named button here.
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('opens a confirmation dialog on click, without mentioning items when there are none', async () => {
    renderPlaceSection(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByText('Remove Lisbon?')).toBeInTheDocument();
    expect(
      screen.getByText('This permanently removes Lisbon from the trip. This cannot be undone.'),
    ).toBeInTheDocument();
  });

  it('mentions the item count in the confirmation message when the place has items', async () => {
    const place = makePlace([makeItem({ id: 1 }), makeItem({ id: 2 })]);
    renderPlaceSection(<PlaceSection place={place} isLocked={false} {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByText(/along with the 2 items logged under it/)).toBeInTheDocument();
  });

  it('cancel closes the dialog without calling the mutation', async () => {
    renderPlaceSection(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Remove Lisbon?')).not.toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('confirm calls the mutation with tripId and placeId', async () => {
    renderPlaceSection(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
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
    renderPlaceSection(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByText('Internal server error')).toBeInTheDocument();
    });
    expect(screen.getByText('Remove Lisbon?')).toBeInTheDocument();
  });
});

describe('PlaceSection — rating sort/filter (IT-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemovePlace.isPending = false;
    mockRemovePlace.error = null;
  });

  function makeRatedPlace() {
    return makePlace([
      makeItem({ id: 1, name: 'Low Rated', rating: 2 }),
      makeItem({ id: 2, name: 'High Rated', rating: 5 }),
      makeItem({ id: 3, name: 'Unrated', rating: null }),
    ]);
  }

  it('shows no sort/filter controls when the place has no items', () => {
    renderPlaceSection(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    expect(screen.queryByLabelText('Sort by rating')).not.toBeInTheDocument();
  });

  it('a minimum-rating filter excludes unrated items rather than treating them as zero', async () => {
    renderPlaceSection(
      <PlaceSection place={makeRatedPlace()} isLocked={false} {...defaultProps} />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Minimum rating filter'), '1');

    expect(screen.getByText('Low Rated')).toBeInTheDocument();
    expect(screen.getByText('High Rated')).toBeInTheDocument();
    expect(screen.queryByText('Unrated')).not.toBeInTheDocument();
  });

  it('a minimum-rating filter of N shows only items rated N or above', async () => {
    renderPlaceSection(
      <PlaceSection place={makeRatedPlace()} isLocked={false} {...defaultProps} />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Minimum rating filter'), '4');

    expect(screen.queryByText('Low Rated')).not.toBeInTheDocument();
    expect(screen.getByText('High Rated')).toBeInTheDocument();
  });

  it('sorting by rating visibly changes the order (descending then ascending)', async () => {
    renderPlaceSection(
      <PlaceSection place={makeRatedPlace()} isLocked={false} {...defaultProps} />,
    );
    const getLabels = () => screen.getAllByText(/Rated$/).map((el) => el.textContent);

    await userEvent.selectOptions(screen.getByLabelText('Sort by rating'), 'desc');
    expect(getLabels()).toEqual(['High Rated', 'Low Rated']);

    await userEvent.selectOptions(screen.getByLabelText('Sort by rating'), 'asc');
    expect(getLabels()).toEqual(['Low Rated', 'High Rated']);
  });

  it('clearing sort and filter returns the list to its default order', async () => {
    renderPlaceSection(
      <PlaceSection place={makeRatedPlace()} isLocked={false} {...defaultProps} />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Sort by rating'), 'desc');
    await userEvent.selectOptions(screen.getByLabelText('Minimum rating filter'), '4');
    expect(screen.queryByText('Unrated')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    // Back to the place.items array's own order — all three items visible again.
    expect(screen.getByText('Low Rated')).toBeInTheDocument();
    expect(screen.getByText('High Rated')).toBeInTheDocument();
    expect(screen.getByText('Unrated')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('shows a distinct empty state when a filter matches no items (vs. no items at all)', async () => {
    const place = makePlace([
      makeItem({ id: 1, name: 'Low Rated', rating: 2 }),
      makeItem({ id: 2, name: 'Unrated', rating: null }),
    ]);
    renderPlaceSection(<PlaceSection place={place} isLocked={false} {...defaultProps} />);

    // Nothing in this place is rated highly enough for a 5+ filter to match.
    await userEvent.selectOptions(screen.getByLabelText('Minimum rating filter'), '5');

    expect(screen.getByText('No items match this filter.')).toBeInTheDocument();
  });

  it('links the city name to its cross-trip city-items view (IT-09)', () => {
    renderPlaceSection(<PlaceSection place={makePlace([])} isLocked={false} {...defaultProps} />);
    expect(screen.getByRole('link', { name: 'Lisbon' })).toHaveAttribute('href', '/cities/5');
  });
});

describe('PlaceSection — explicit-dates accent (UX-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // UX-14: PO's UAT read the first place's blue/bold date range as an
  // inconsistency vs. later places rendering plain. Investigation confirmed
  // this is a DELIBERATE, uniform, data-driven signal (hasExplicitDates in
  // PlaceSection.tsx) — not an index- or position-based special case — that
  // BRD-DP06 just happens to trigger only for the first place (AddPlaceFlow
  // pre-fills arrived_on/departed_on there and there alone at creation). The
  // fix adds a tooltip so the accent reads as intentional; these tests pin
  // that the underlying rule is genuinely uniform across every place,
  // regardless of position, and that the tooltip only appears alongside it.

  it('accents the date range and adds an explanatory tooltip when the place has explicit dates (e.g. first place, BRD-DP06)', () => {
    const place = makePlace([], { arrived_on: '2024-04-01', departed_on: '2024-04-05' });
    renderPlaceSection(<PlaceSection place={place} isLocked={false} {...defaultProps} />);

    const dateSpan = screen.getByTitle('Dates set explicitly for this place');
    expect(dateSpan).toHaveClass('text-wp-primary', 'font-medium');
  });

  it('does NOT accent the date range when the place falls back to the trip range (no explicit dates)', () => {
    const place = makePlace([], { arrived_on: null, departed_on: null });
    renderPlaceSection(<PlaceSection place={place} isLocked={false} {...defaultProps} />);

    // Fallback range still renders (from tripStartDate/tripEndDate) — just
    // without the accent class or tooltip.
    expect(screen.queryByTitle('Dates set explicitly for this place')).not.toBeInTheDocument();
  });

  // The rule is genuinely position-independent: a SECOND (non-first) place
  // with its own explicit dates set (e.g. via "Set dates") gets the exact
  // same accent + tooltip as a first place would — proving the earlier
  // "first place only" appearance was DP-06's data pattern, not a hardcoded
  // special case in this component.
  it('accents a non-first place identically once it has its own explicit dates', () => {
    const secondPlace = makePlace([], {
      id: 2,
      arrived_on: '2024-04-06',
      departed_on: '2024-04-09',
    });
    renderPlaceSection(<PlaceSection place={secondPlace} isLocked={false} {...defaultProps} />);

    const dateSpan = screen.getByTitle('Dates set explicitly for this place');
    expect(dateSpan).toHaveClass('text-wp-primary', 'font-medium');
  });

  it('only one of arrived_on/departed_on set still counts as explicit (accented)', () => {
    const place = makePlace([], { arrived_on: '2024-04-01', departed_on: null });
    renderPlaceSection(<PlaceSection place={place} isLocked={false} {...defaultProps} />);

    expect(screen.getByTitle('Dates set explicitly for this place')).toBeInTheDocument();
  });
});

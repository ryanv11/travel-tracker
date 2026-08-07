/**
 * UX-12 — the standing "Change city" control + "Location not confirmed" badge on
 * PlaceSection. ATDD-first RED acceptance tests (OP-35).
 *
 * RED now: no "Change city" control and no "Location not confirmed" badge exist
 * anywhere in the frontend (confirmed by grep across src/frontend + reading
 * PlaceSection.tsx — the header row carries only Set/Edit dates, Add Item, Remove).
 *
 * ── CONTRACT (design §8.1/§8.3, UX spec §12.2) ────────────────────────────────
 * AC-8  A "Change city" control (aria-label "Change city", pencil glyph) is shown
 *       on every UNLOCKED place REGARDLESS of geocode_status; hidden under the
 *       SAME isLocked rule as Remove.
 * AC-11 A single "Location not confirmed" badge shows whenever
 *       place.city.geocode_status !== 'resolved' (existing `locked` hue, NO new
 *       hue); a `resolved` place shows none.
 */
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeocodeStatus, Item, TripPlace } from '../../../types/api';
import { PlaceSection } from '../PlaceSection';

function renderPlaceSection(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

vi.mock('../../../hooks/usePlaces', () => ({
  useRemovePlace: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  // Safe stubs for the re-point seam a Change-city build may reference.
  useChangeCity: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useUpdatePlaceDates: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));

vi.mock('../../../hooks/useAdmin', () => ({
  useCountries: () => ({ data: [] }),
}));

vi.mock('../../../hooks/useItems', async () => {
  const actual =
    await vi.importActual<typeof import('../../../hooks/useItems')>('../../../hooks/useItems');
  return {
    ...actual,
    useDeleteItem: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  };
});

function makePlace(geocodeStatus: GeocodeStatus, overrides: Partial<TripPlace> = {}): TripPlace {
  return {
    id: 1,
    city_id: 5,
    activities: [],
    city: {
      id: 5,
      name: 'Newport',
      country_code: 'GB',
      country_name: 'United Kingdom',
      region_id: null,
      region_iso: null,
      latitude: null,
      longitude: null,
      geocode_status: geocodeStatus,
    },
    items: [] as Item[],
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as TripPlace;
}

const defaultProps = { tripId: 10, tripStartDate: '2024-04-01', tripEndDate: '2024-04-14' };

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// AC-8 — standing "Change city" control
// ────────────────────────────────────────────────────────────────────────────
describe('AC-8 "Change city" control', () => {
  it('renders on an UNLOCKED, resolved place (correction right is not conditional on status)', () => {
    renderPlaceSection(
      <PlaceSection place={makePlace('resolved')} isLocked={false} {...defaultProps} />,
    );
    expect(screen.getByRole('button', { name: /change city/i })).toBeInTheDocument();
  });

  it('renders on an UNLOCKED, pending place too', () => {
    renderPlaceSection(
      <PlaceSection place={makePlace('pending')} isLocked={false} {...defaultProps} />,
    );
    expect(screen.getByRole('button', { name: /change city/i })).toBeInTheDocument();
  });

  it('is hidden when the trip is locked — same rule as Remove', () => {
    renderPlaceSection(
      <PlaceSection place={makePlace('pending')} isLocked={true} {...defaultProps} />,
    );
    expect(screen.queryByRole('button', { name: /change city/i })).not.toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-11 — "Location not confirmed" badge
// ────────────────────────────────────────────────────────────────────────────
describe('AC-11 "Location not confirmed" badge', () => {
  it('shows exactly one badge when geocode_status is not resolved (pending)', () => {
    renderPlaceSection(
      <PlaceSection place={makePlace('pending')} isLocked={false} {...defaultProps} />,
    );
    expect(screen.getAllByText(/Location not confirmed/i)).toHaveLength(1);
  });

  it('shows the badge for an unresolvable (terminal) place', () => {
    // NOTE (Frontend, BUG-75/UX-12 build): the frontend GeocodeStatus type has
    // been corrected to 'pending' | 'resolved' | 'unresolvable', matching the
    // backend DB CHECK exactly (see types/api.ts) — QA's original comment here
    // flagged the mismatch and used 'failed' to stay type-valid under the
    // then-current (wrong) frontend type; now that the type is fixed, this
    // literal is updated to the real terminal value so the file still
    // type-checks. The assertion itself (badge fires for any non-resolved
    // status) is unchanged.
    renderPlaceSection(
      <PlaceSection place={makePlace('unresolvable')} isLocked={false} {...defaultProps} />,
    );
    expect(screen.getByText(/Location not confirmed/i)).toBeInTheDocument();
  });

  it('shows NO badge for a resolved place', () => {
    renderPlaceSection(
      <PlaceSection place={makePlace('resolved')} isLocked={false} {...defaultProps} />,
    );
    expect(screen.queryByText(/Location not confirmed/i)).not.toBeInTheDocument();
  });
});

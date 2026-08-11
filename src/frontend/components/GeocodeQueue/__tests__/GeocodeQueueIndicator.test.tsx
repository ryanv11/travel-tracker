/**
 * Component tests for GeocodeQueueIndicator — GE-19 / ADL-55 (BUG-85).
 *
 * QA scoped the frontend-only acceptance criteria to Frontend:
 *   - Criterion 9:  the (geocode_status, geocode_cause) → label map (ADL-55 §4)
 *     renders the correct string for every combination, in the panel.
 *   - Criterion 10: a needs_attention / unresolvable city renders in a VISUALLY
 *     DISTINCT needs-attention bucket and is NOT counted in the
 *     in-progress/resolving number (never conflated in the same silent count).
 *
 * Also smoke-covers the wired recovery affordances (re-point via the reused
 * ChangeCityModal; Remove via the reused place-delete flow) and the locked-trip
 * read-only case.
 *
 * The queue data source (useGeocodeQueue) is mocked but its return is built
 * through the REAL bucketGeocodeQueue, so the component test exercises the real
 * split end-to-end rather than a hand-partitioned fixture.
 *
 * Source: src/frontend/components/GeocodeQueue/GeocodeQueueIndicator.tsx
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GeocodeCause,
  GeocodeQueueEntry,
  GeocodeStatus,
  TripStatus,
} from '../../../types/api';
import { bucketGeocodeQueue } from '../../../utils/geocodeQueueLabels';
import { GeocodeQueueIndicator } from '../GeocodeQueueIndicator';

// ----------------------------------------------------------------
// Mocks — the data source and the two reused recovery surfaces.
// ----------------------------------------------------------------

const { mockUseGeocodeQueue, mockUseTrips, mockRemoveMutate } = vi.hoisted(() => ({
  mockUseGeocodeQueue: vi.fn(),
  mockUseTrips: vi.fn(),
  mockRemoveMutate: vi.fn(),
}));

vi.mock('../../../hooks/useGeocodeQueue', () => ({
  useGeocodeQueue: () => mockUseGeocodeQueue(),
}));

vi.mock('../../../hooks/useTrips', () => ({
  useTrips: () => mockUseTrips(),
}));

vi.mock('../../../hooks/useAdmin', () => ({
  // formatCitySubtitle falls back to the country_code when the country list is
  // empty / non-region-tier — fine for these tests.
  useCountries: () => ({ data: [] }),
}));

vi.mock('../../../hooks/usePlaces', () => ({
  useRemovePlace: () => ({
    mutate: mockRemoveMutate,
    reset: vi.fn(),
    error: null,
    isPending: false,
  }),
}));

// Stub the reused re-point modal — we assert it MOUNTS (recovery wired), its own
// behaviour is covered by ChangeCityModal.test.tsx.
vi.mock('../../TripDetail/ChangeCityModal', () => ({
  ChangeCityModal: (props: { tripId: number; placeId: number }) => (
    <div data-testid="change-city-modal-stub">
      change-city t{props.tripId} p{props.placeId}
    </div>
  ),
}));

// ----------------------------------------------------------------
// Fixtures / helpers
// ----------------------------------------------------------------

function entry(
  id: number,
  name: string,
  geocode_status: GeocodeStatus,
  geocode_cause: GeocodeCause,
): GeocodeQueueEntry {
  return {
    id,
    name,
    country_code: 'US',
    region_id: null,
    region_name: null,
    region_iso: null,
    geocode_status,
    geocode_cause,
  };
}

/** Builds the shape useGeocodeQueue returns, using the REAL bucketing. */
function queueReturn(entries: GeocodeQueueEntry[]) {
  const { resolving, needsAttention } = bucketGeocodeQueue(entries);
  return {
    entries,
    resolving,
    needsAttention,
    resolvingCount: resolving.length,
    needsAttentionCount: needsAttention.length,
    isLoading: false,
    isError: false,
  };
}

/** A trip fixture whose places reference the given city ids. */
function tripWithCities(id: number, name: string, status: TripStatus, cityIds: number[]) {
  return {
    id,
    name,
    status,
    places: cityIds.map((cid, i) => ({ id: id * 100 + i, city_id: cid, city: { id: cid } })),
  };
}

// A queue spanning every §4 combination:
//   pending/null, pending/unreachable            → resolving (2)
//   needs_attention/ambiguous, /unreachable, /null, unresolvable/null → needs-attention (4)
const FULL_QUEUE = [
  entry(1, 'Alpha', 'pending', null),
  entry(2, 'Bravo', 'pending', 'unreachable'),
  entry(3, 'Charlie', 'needs_attention', 'ambiguous'),
  entry(4, 'Delta', 'needs_attention', 'unreachable'),
  entry(5, 'Echo', 'needs_attention', null),
  entry(6, 'Foxtrot', 'unresolvable', null),
];

// A planning trip referencing all four needs-attention cities so their recovery
// controls render.
const TRIPS = [tripWithCities(10, 'Route 66', 'planning', [3, 4, 5, 6])];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseGeocodeQueue.mockReturnValue(queueReturn(FULL_QUEUE));
  mockUseTrips.mockReturnValue({ data: TRIPS, isLoading: false });
});

// ----------------------------------------------------------------
// Criterion 10 — distinct buckets, no conflation
// ----------------------------------------------------------------

describe('criterion 10 — needs-attention distinct from resolving count', () => {
  it('renders two separate badge counts (4 need attention, 2 resolving)', () => {
    render(<GeocodeQueueIndicator />);
    expect(screen.getByTestId('geocode-needs-attention-badge')).toHaveTextContent(
      '4 need attention',
    );
    expect(screen.getByTestId('geocode-resolving-badge')).toHaveTextContent('2 resolving');
    // The resolving count is NOT the grand total (6) — the four needs-attention
    // rows are not silently folded into it.
    expect(screen.getByTestId('geocode-resolving-badge')).not.toHaveTextContent('6');
  });

  it('separates the rows into needs-attention vs resolving sections in the panel', async () => {
    render(<GeocodeQueueIndicator />);
    await userEvent.click(screen.getByTestId('geocode-indicator'));

    expect(screen.getByText('Needs attention (4)')).toBeInTheDocument();
    expect(screen.getByText('Resolving (2)')).toBeInTheDocument();
    expect(screen.getAllByTestId('geocode-needs-attention-row')).toHaveLength(4);
    expect(screen.getAllByTestId('geocode-resolving-row')).toHaveLength(2);
  });

  it('places the ambiguous city in the needs-attention bucket, not resolving', async () => {
    render(<GeocodeQueueIndicator />);
    await userEvent.click(screen.getByTestId('geocode-indicator'));

    const needsRows = screen.getAllByTestId('geocode-needs-attention-row');
    const resolvingRows = screen.getAllByTestId('geocode-resolving-row');
    // Charlie (needs_attention/ambiguous) is in a needs-attention row…
    expect(needsRows.some((r) => within(r).queryByText('Charlie', { exact: false }))).toBe(true);
    // …and never in a resolving row.
    expect(resolvingRows.some((r) => within(r).queryByText('Charlie', { exact: false }))).toBe(
      false,
    );
  });
});

// ----------------------------------------------------------------
// Criterion 9 — the (status, cause) → label map renders
// ----------------------------------------------------------------

describe('criterion 9 — every (status, cause) label renders in the panel', () => {
  it('shows the correct §4 label for each of the six queue rows', async () => {
    render(<GeocodeQueueIndicator />);
    await userEvent.click(screen.getByTestId('geocode-indicator'));

    // ADL-55 §4 — one label per (status, cause) combination present in the queue.
    expect(screen.getByText('Resolving…')).toBeInTheDocument();
    expect(screen.getByText("Couldn't reach the geocoder — retrying")).toBeInTheDocument();
    expect(screen.getByText('Needs region — multiple matches')).toBeInTheDocument();
    expect(screen.getByText("Gave up — couldn't reach the geocoder")).toBeInTheDocument();
    expect(screen.getByText("Couldn't be resolved — needs attention")).toBeInTheDocument();
    expect(screen.getByText('Not found')).toBeInTheDocument();

    // Exactly six labelled rows, one per queue entry.
    expect(screen.getAllByTestId('geocode-cause-label')).toHaveLength(6);
  });
});

// ----------------------------------------------------------------
// Recovery wiring (smoke) — reuse ChangeCityModal + place-delete
// ----------------------------------------------------------------

describe('recovery actions (wired to existing surfaces)', () => {
  it('offers Change city + Remove for a stuck city, and mounts the reused modal', async () => {
    render(<GeocodeQueueIndicator />);
    await userEvent.click(screen.getByTestId('geocode-indicator'));

    // Charlie is referenced by place 1000 (10*100+0) in the planning trip.
    const charlieRow = screen
      .getAllByTestId('geocode-needs-attention-row')
      .find((r) => within(r).queryByText('Charlie', { exact: false }))!;
    const changeBtn = within(charlieRow).getByRole('button', { name: 'Change city' });
    expect(within(charlieRow).getByRole('button', { name: 'Remove' })).toBeInTheDocument();

    await userEvent.click(changeBtn);
    // The reused ChangeCityModal is mounted with the referencing place's ids.
    expect(screen.getByTestId('change-city-modal-stub')).toHaveTextContent('change-city t10 p1000');
  });

  it('shows a stuck city in a locked trip as read-only (no recovery buttons)', async () => {
    mockUseTrips.mockReturnValue({
      data: [tripWithCities(20, 'Archived', 'locked', [3])],
      isLoading: false,
    });
    // Only Charlie is stuck for this case.
    mockUseGeocodeQueue.mockReturnValue(
      queueReturn([entry(3, 'Charlie', 'needs_attention', 'ambiguous')]),
    );

    render(<GeocodeQueueIndicator />);
    await userEvent.click(screen.getByTestId('geocode-indicator'));

    const row = screen.getByTestId('geocode-needs-attention-row');
    expect(within(row).getByText(/locked — unlock to fix/)).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Change city' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('renders nothing when the queue is empty', () => {
    mockUseGeocodeQueue.mockReturnValue(queueReturn([]));
    const { container } = render(<GeocodeQueueIndicator />);
    expect(container).toBeEmptyDOMElement();
  });
});

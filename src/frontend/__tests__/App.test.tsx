/**
 * Component tests for App navigation and routing (BUG-62).
 *
 * BUG-62 reverses part of BUG-26's contract: the Admin nav link and the
 * `/admin` route are no longer owner-gated at this level. AD-08 made
 * companions (and, per ADL-28, map shading) usable by any authenticated
 * user, so page-level `RequireOwner` gating over the whole /admin route was
 * wrong — owner-only tabs (categories, activities, countries) are now gated
 * per-tab inside AdminPanel.tsx instead (see
 * src/frontend/components/Admin/__tests__/AdminPanel.test.tsx for that
 * coverage). App no longer calls useMe() at all — the Admin link and route
 * behave identically to Map/Trips regardless of owner status.
 *
 * Mocks:
 *   - GeocodeQueueIndicator — stubbed inert (GE-19/ADL-55; the real one polls
 *     GET /api/geocode-queue via react-query and this file renders App with no
 *     QueryClientProvider — its own coverage lives in
 *     components/GeocodeQueue/__tests__/GeocodeQueueIndicator.test.tsx)
 *   - useHealth() — inert (QUAL-26 build stamp; this file renders App with no
 *     QueryClientProvider, and the stamp is not what these tests are about —
 *     its own coverage lives in components/shared/__tests__/BuildStamp.test.tsx)
 *   - @clerk/react UserButton — rendered as a stub
 *   - Page components (MapPage, AdminPage, TripDetailPage, TripsLayout) —
 *     lightweight stubs so App renders without MapLibre/query wiring
 *
 * Covers:
 *   - Admin nav link is always shown, same as Map/Trips
 *   - Direct /admin navigation always renders AdminPage (no page-level guard)
 *
 * Source: src/frontend/App.tsx
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

// ----------------------------------------------------------------
// Mocks
// ----------------------------------------------------------------

vi.mock('../components/GeocodeQueue/GeocodeQueueIndicator', () => ({
  GeocodeQueueIndicator: () => <div data-testid="geocode-indicator-stub" />,
}));

vi.mock('../hooks/useHealth', () => ({
  useHealth: () => ({ data: undefined }),
}));

vi.mock('@clerk/react', () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

vi.mock('../pages/MapPage', () => ({
  MapPage: () => <div data-testid="map-page">Map page</div>,
}));

vi.mock('../pages/AdminPage', () => ({
  AdminPage: () => <div data-testid="admin-page">Admin panel content</div>,
}));

vi.mock('../pages/TripDetailPage', () => ({
  TripDetailPage: () => <div data-testid="trip-detail-page" />,
}));

vi.mock('../components/TripList/TripsLayout', () => ({
  TripsLayout: () => <div data-testid="trips-layout" />,
}));

// ----------------------------------------------------------------
// Fixtures / helpers
// ----------------------------------------------------------------

function renderApp(initialPath = '/map') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------
// Admin nav link visibility (BUG-62)
// ----------------------------------------------------------------

describe('Admin nav link (BUG-62)', () => {
  it('is shown, same as Map and Trips', () => {
    renderApp();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Map' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trips' })).toBeInTheDocument();
  });
});

// ----------------------------------------------------------------
// /admin route (BUG-62)
// ----------------------------------------------------------------

describe('/admin route (BUG-62)', () => {
  it('renders the admin panel on direct navigation, with no page-level owner guard', () => {
    renderApp('/admin');
    expect(screen.getByTestId('admin-page')).toBeInTheDocument();
    expect(screen.queryByText('Not authorised')).not.toBeInTheDocument();
  });
});

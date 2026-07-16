/**
 * Component tests for App owner-gating (BUG-26 / SE-02).
 *
 * Mocks:
 *   - useMe() from hooks/useMe — controls identity loading/owner state
 *   - useGeocodeRetryQueue() — inert (no pending geocodes)
 *   - @clerk/react UserButton — rendered as a stub
 *   - Page components (MapPage, AdminPage, TripDetailPage, TripsLayout) —
 *     lightweight stubs so App renders without MapLibre/query wiring
 *
 * Covers:
 *   - Admin nav link shown for owner
 *   - Admin nav link hidden for non-owner
 *   - Admin nav link hidden while identity is loading (no flash)
 *   - Direct /admin navigation as non-owner renders not-authorised, not the panel
 *   - Direct /admin navigation as owner renders the admin panel
 *   - Direct /admin navigation while loading renders neither (blank, no flash)
 *
 * Source: src/frontend/App.tsx
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { Me } from '../types/api';

// ----------------------------------------------------------------
// Mocks
// ----------------------------------------------------------------

const mockUseMe = vi.fn<() => { data: Me | undefined; isPending: boolean }>();

vi.mock('../hooks/useMe', () => ({
  useMe: () => mockUseMe(),
}));

vi.mock('../hooks/useGeocodeRetryQueue', () => ({
  useGeocodeRetryQueue: () => ({ pendingCount: 0, retryAll: vi.fn(), dismiss: vi.fn() }),
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

const OWNER: Me = { id: 'user-a', email: 'owner@example.com', isOwner: 1 };
const NON_OWNER: Me = { id: 'user-b', email: 'guest@example.com', isOwner: 0 };

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
// Admin nav link visibility
// ----------------------------------------------------------------

describe('Admin nav link (BUG-26)', () => {
  it('is shown for the owner', () => {
    mockUseMe.mockReturnValue({ data: OWNER, isPending: false });
    renderApp();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('is hidden for a non-owner', () => {
    mockUseMe.mockReturnValue({ data: NON_OWNER, isPending: false });
    renderApp();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    // Sanity: the rest of the nav is intact
    expect(screen.getByRole('link', { name: 'Map' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trips' })).toBeInTheDocument();
  });

  it('is hidden while identity is loading (no flash)', () => {
    mockUseMe.mockReturnValue({ data: undefined, isPending: true });
    renderApp();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });
});

// ----------------------------------------------------------------
// /admin route guard
// ----------------------------------------------------------------

describe('/admin route guard (BUG-26)', () => {
  it('renders the admin panel for the owner', () => {
    mockUseMe.mockReturnValue({ data: OWNER, isPending: false });
    renderApp('/admin');
    expect(screen.getByTestId('admin-page')).toBeInTheDocument();
    expect(screen.queryByText('Not authorised')).not.toBeInTheDocument();
  });

  it('renders not-authorised (never the panel) for a non-owner on direct navigation', () => {
    mockUseMe.mockReturnValue({ data: NON_OWNER, isPending: false });
    renderApp('/admin');
    expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument();
    expect(screen.getByText('Not authorised')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the map' })).toBeInTheDocument();
  });

  it('renders neither panel nor message while identity is loading (no flash)', () => {
    mockUseMe.mockReturnValue({ data: undefined, isPending: true });
    renderApp('/admin');
    expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument();
    expect(screen.queryByText('Not authorised')).not.toBeInTheDocument();
  });
});

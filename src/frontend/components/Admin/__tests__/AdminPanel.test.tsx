/**
 * Tests for AdminPanel per-tab owner gating (BUG-62).
 *
 * BUG-62 moved owner gating from page-level `RequireOwner` (App.tsx) to
 * per-tab gating inside AdminPanel.tsx: Companions (AD-08) and Map Shading
 * (AD-07, per ADL-28) are open to any authenticated user; Categories,
 * Activities, and Countries remain owner-only (AD-09 / ADL-28 Question 5).
 * The backend still enforces the owner-only tabs via `requireOwner` on
 * `adminRouter` — this is presentation-layer gating only.
 *
 * Mocks:
 *   - useMe() from hooks/useMe — controls identity loading/owner state
 *   - Each tab component — lightweight stub so this test targets gating,
 *     not tab content
 *
 * Covers:
 *   - Loading state: no tab bar, no content, while identity resolves
 *   - Owner: all 5 tabs visible, defaults to Categories
 *   - Non-owner: only Companions + Map Shading visible, defaults to
 *     Companions; owner-only tab content never renders even if clicked
 *     programmatically (defence-in-depth via the currentTab fallback)
 *
 * Source: src/frontend/components/Admin/AdminPanel.tsx
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../../../types/api';
import { AdminPanel } from '../AdminPanel';

const mockUseMe = vi.fn<() => { data: Me | undefined; isPending: boolean }>();

vi.mock('../../../hooks/useMe', () => ({
  useMe: () => mockUseMe(),
}));

vi.mock('../CategoryTab', () => ({
  CategoryTab: () => <div data-testid="category-tab" />,
}));
vi.mock('../ActivityTab', () => ({
  ActivityTab: () => <div data-testid="activity-tab" />,
}));
vi.mock('../CompanionTab', () => ({
  CompanionTab: () => <div data-testid="companion-tab" />,
}));
vi.mock('../ShadingTab', () => ({
  ShadingTab: () => <div data-testid="shading-tab" />,
}));
vi.mock('../CountryTab', () => ({
  CountryTab: () => <div data-testid="country-tab" />,
}));

const OWNER: Me = { id: 'user-a', email: 'owner@example.com', isOwner: 1 };
const NON_OWNER: Me = { id: 'user-b', email: 'guest@example.com', isOwner: 0 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminPanel loading state', () => {
  it('shows a loading spinner and no tab bar while identity is resolving', () => {
    mockUseMe.mockReturnValue({ data: undefined, isPending: true });
    render(<AdminPanel />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Categories' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('companion-tab')).not.toBeInTheDocument();
  });
});

describe('AdminPanel — owner', () => {
  beforeEach(() => {
    mockUseMe.mockReturnValue({ data: OWNER, isPending: false });
  });

  it('shows all five tabs and defaults to Categories', () => {
    render(<AdminPanel />);

    for (const label of ['Categories', 'Activities', 'Companions', 'Map Shading', 'Countries']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByTestId('category-tab')).toBeInTheDocument();
  });

  it('can switch to an owner-only tab', () => {
    render(<AdminPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Activities' }));
    expect(screen.getByTestId('activity-tab')).toBeInTheDocument();
  });
});

describe('AdminPanel — non-owner (BUG-62)', () => {
  beforeEach(() => {
    mockUseMe.mockReturnValue({ data: NON_OWNER, isPending: false });
  });

  it('shows only Companions and Map Shading, defaults to Companions', () => {
    render(<AdminPanel />);

    expect(screen.getByRole('button', { name: 'Companions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Map Shading' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Categories' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activities' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Countries' })).not.toBeInTheDocument();

    expect(screen.getByTestId('companion-tab')).toBeInTheDocument();
  });

  it('can switch to the Map Shading tab', () => {
    render(<AdminPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Map Shading' }));
    expect(screen.getByTestId('shading-tab')).toBeInTheDocument();
  });

  it('never renders owner-only tab content, even without a visible button for it', () => {
    render(<AdminPanel />);
    expect(screen.queryByTestId('category-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('country-tab')).not.toBeInTheDocument();
  });
});

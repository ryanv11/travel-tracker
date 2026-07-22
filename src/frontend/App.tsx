/**
 * App — root component.
 *
 * Provides:
 *  - React Router (BrowserRouter already wraps at main.tsx level)
 *  - Route definitions: /, /map, /trips (nested), /admin
 *  - Persistent navigation bar with UserButton (NR-14)
 *  - Two-panel layout for /trips via TripsLayout + Outlet (TR-11)
 *
 * AC-01: The app is reachable at http://localhost:5173 via `npm run dev`.
 */

import { UserButton } from '@clerk/react';
import type { ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { LocationPinIcon } from './components/icons';
import { TripsLayout } from './components/TripList/TripsLayout';
import { useGeocodeRetryQueue } from './hooks/useGeocodeRetryQueue';
import { useMe } from './hooks/useMe';
import { AdminPage } from './pages/AdminPage';
import { MapPage } from './pages/MapPage';
import { TripDetailPage } from './pages/TripDetailPage';

/**
 * BUG-26 / SE-02: Owner gate for the /admin route.
 *
 * Renders nothing while identity is loading (no flash of admin content),
 * then either the guarded children (owner) or a small not-authorised
 * message (non-owner). A message was chosen over a silent redirect so a
 * hard refresh on /admin never bounces the owner to / mid-load, and a
 * non-owner gets an explicit explanation instead of a mystery redirect.
 * Backend enforcement (requireOwner → 403) is unaffected — this is
 * presentation-layer gating only.
 */
function RequireOwner({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe();

  if (isPending) return null;

  if (!me?.isOwner) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-12 text-center">
        <p className="text-base font-semibold text-gray-500 mb-1.5">Not authorised</p>
        <p className="text-sm text-gray-400 max-w-[280px] leading-relaxed">
          The admin panel is only available to the site owner.
        </p>
        <NavLink to="/map" className="mt-4 text-sm text-teal-600 underline">
          Back to the map
        </NavLink>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Root application component with navigation and route definitions.
 */
export function App() {
  const { pendingCount, retryAll, dismiss } = useGeocodeRetryQueue();
  // BUG-26: owner-aware nav — me is undefined while loading, so the Admin
  // link stays hidden until isOwner is confirmed (no flash for non-owners).
  const { data: me } = useMe();
  const location = useLocation();

  // WP-03/C9: on /trips, the mobile layout supplies its own header + bottom tab
  // bar (Map/Trips/Admin) as chrome, so this shared top nav bar hides at mobile
  // widths there — it stays visible at every width on every other route (Map,
  // Admin), which have no mobile-specific chrome of their own in this phase
  // (out of scope per the WP-03/WP-04 brief).
  const isTripsRoute = location.pathname.startsWith('/trips');

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Navigation bar — Waypoint brand (C1: real product rename, 2026-07-21) */}
      <nav
        className={`${isTripsRoute ? 'hidden md:flex' : 'flex'} items-center gap-1 px-5 py-2 border-b border-wp-border bg-wp-bg-surface flex-shrink-0 z-[100]`}
      >
        <span className="font-display font-semibold text-[17px] text-wp-ink mr-3 flex items-center gap-1.5">
          <LocationPinIcon size={22} className="text-wp-primary" cutoutColor="#fefdfb" />
          Waypoint
        </span>
        <NavLink
          to="/map"
          className={({ isActive }) =>
            `font-ui no-underline px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
              isActive
                ? 'text-wp-primary-subtle-text bg-wp-primary-subtle'
                : 'text-wp-ink-muted hover:bg-wp-bg-subtle'
            }`
          }
        >
          Map
        </NavLink>
        <NavLink
          to="/trips"
          className={({ isActive }) =>
            `font-ui no-underline px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
              isActive
                ? 'text-wp-primary-subtle-text bg-wp-primary-subtle'
                : 'text-wp-ink-muted hover:bg-wp-bg-subtle'
            }`
          }
        >
          Trips
        </NavLink>
        {/* BUG-26: Admin link is owner-only (hidden while identity loads) — preserved
            exactly; the mockup's static nav shows all three links unconditionally
            because it has no auth model (see spec's "Nav bar" cross-reference). */}
        {!!me?.isOwner && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `font-ui no-underline px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                isActive
                  ? 'text-wp-primary-subtle-text bg-wp-primary-subtle'
                  : 'text-wp-ink-muted hover:bg-wp-bg-subtle'
              }`
            }
          >
            Admin
          </NavLink>
        )}

        {/* NR-06: offline geocoding indicator */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Geocoding pending — click to retry now"
              onClick={retryAll}
              className="flex items-center gap-1.5 px-2.5 py-1 border border-amber-600 rounded-md bg-yellow-100 text-amber-800 text-xs font-medium cursor-pointer"
            >
              ☁ Geocoding pending ({pendingCount})
            </button>
            <button
              type="button"
              title="Dismiss — stop retrying"
              onClick={dismiss}
              className="px-2 py-1 border border-gray-300 rounded-md bg-white text-gray-500 text-xs cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* NR-14: User account menu (sign-out) — always pinned to the right */}
        {import.meta.env.VITE_BYPASS_AUTH !== 'true' && (
          <div className="ml-auto">
            <UserButton />
          </div>
        )}
      </nav>

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<MapPage />} />

          {/* TR-11: Nested trips routes — TripsLayout owns the two-panel shell */}
          <Route path="/trips" element={<TripsLayout />}>
            <Route
              index
              element={
                <div className="flex flex-col items-center justify-center h-full text-wp-ink-faint p-12 text-center">
                  <LocationPinIcon
                    size={48}
                    className="text-wp-border mb-4"
                    cutoutColor="#f7f5f0"
                  />
                  {/* Copy fix per spec (Frontend follows spec verbatim for new copy) */}
                  <p className="font-display text-[18px] text-wp-ink-soft mb-1.5">Select a trip</p>
                  <p className="font-ui text-[13px] text-wp-ink-faint max-w-[240px] leading-relaxed">
                    Choose a trip from the list to see its places and itinerary.
                  </p>
                </div>
              }
            />
            <Route path=":id" element={<TripDetailPage />} />
          </Route>

          {/* BUG-26: /admin is owner-gated — direct nav as non-owner never renders the panel */}
          <Route
            path="/admin"
            element={
              <RequireOwner>
                <AdminPage />
              </RequireOwner>
            }
          />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </main>
    </div>
  );
}

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
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
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

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Navigation bar */}
      <nav className="flex items-center gap-1 px-5 py-2 border-b border-gray-200 bg-white flex-shrink-0 z-[100] shadow-sm">
        <span className="font-bold text-base mr-3 flex items-center">
          <span className="inline-flex items-center justify-center w-6 h-6 bg-teal-600 rounded text-white text-xs font-bold mr-2">
            T
          </span>
          <span className="text-teal-600 font-bold">Travel Tracker</span>
        </span>
        <NavLink
          to="/map"
          className={({ isActive }) =>
            `no-underline px-3.5 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'font-semibold text-teal-700 bg-teal-50'
                : 'font-normal text-gray-700 hover:bg-gray-100'
            }`
          }
        >
          Map
        </NavLink>
        <NavLink
          to="/trips"
          className={({ isActive }) =>
            `no-underline px-3.5 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'font-semibold text-teal-700 bg-teal-50'
                : 'font-normal text-gray-700 hover:bg-gray-100'
            }`
          }
        >
          Trips
        </NavLink>
        {/* BUG-26: Admin link is owner-only (hidden while identity loads) */}
        {!!me?.isOwner && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `no-underline px-3.5 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'font-semibold text-teal-700 bg-teal-50'
                  : 'font-normal text-gray-700 hover:bg-gray-100'
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
                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center mb-4">
                    <LocationPinIcon size={28} className="text-gray-300" cutoutColor="#E5E7EB" />
                  </div>
                  <p className="text-base font-semibold text-gray-500 mb-1.5">Select a trip</p>
                  <p className="text-sm text-gray-400 max-w-[260px] leading-relaxed">
                    Choose a trip from the list to view its details, places, and itinerary.
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

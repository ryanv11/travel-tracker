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
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { LocationPinIcon } from './components/icons';
import { BuildStamp } from './components/shared/BuildStamp';
import { TripsLayout } from './components/TripList/TripsLayout';
import { useGeocodeRetryQueue } from './hooks/useGeocodeRetryQueue';
import { AdminPage } from './pages/AdminPage';
import { CityItemsPage } from './pages/CityItemsPage';
import { MapPage } from './pages/MapPage';
import { TripDetailPage } from './pages/TripDetailPage';

/**
 * Root application component with navigation and route definitions.
 */
export function App() {
  const { pendingCount, retryAll, dismiss } = useGeocodeRetryQueue();
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
        {/* BUG-62: Admin link is shown to any authenticated user, same as Map/Trips
            — companions (AD-08) and map shading (AD-07) are usable by any
            authenticated user, so the whole /admin route is no longer owner-gated.
            Per-tab owner-only gating (categories, activities, countries) lives
            inside AdminPanel.tsx instead. */}
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

        {/* Right-hand group: QUAL-26 build stamp + NR-14 user account menu (sign-out).
            The group owns `ml-auto` rather than the UserButton, so the stamp stays pinned
            right whether or not Clerk's button renders (it is hidden under BYPASS_AUTH). */}
        <div className="ml-auto flex items-center gap-3">
          <BuildStamp />
          {import.meta.env.VITE_BYPASS_AUTH !== 'true' && <UserButton />}
        </div>
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

          {/* IT-09: cross-trip rated-items view for one city, reached from the
              city-name link in PlaceSection.tsx. */}
          <Route path="/cities/:id" element={<CityItemsPage />} />

          {/* BUG-62: /admin is reachable by any authenticated user — AdminPanel.tsx
              gates individual owner-only tabs internally (categories, activities,
              countries); companions and shading are open to any authenticated user. */}
          <Route path="/admin" element={<AdminPage />} />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </main>
    </div>
  );
}

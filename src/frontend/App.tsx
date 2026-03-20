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
import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { MapPage } from './pages/MapPage';
import { TripDetailPage } from './pages/TripDetailPage';
import { AdminPage } from './pages/AdminPage';
import { TripsLayout } from './components/TripList/TripsLayout';
import { useGeocodeRetryQueue } from './hooks/useGeocodeRetryQueue';

/**
 * Root application component with navigation and route definitions.
 */
export function App() {
  const { pendingCount, retryAll, dismiss } = useGeocodeRetryQueue();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Navigation bar */}
      <nav className="flex items-center gap-1 px-5 py-2 border-b border-gray-200 bg-white flex-shrink-0 z-[100]">
        <span className="font-bold text-base text-gray-900 mr-3">
          ✈️ Travel Tracker
        </span>
        <NavLink
          to="/map"
          className={({ isActive }) =>
            `no-underline px-3.5 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'font-semibold text-blue-600 bg-blue-50'
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
                ? 'font-semibold text-blue-600 bg-blue-50'
                : 'font-normal text-gray-700 hover:bg-gray-100'
            }`
          }
        >
          Trips
        </NavLink>
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `no-underline px-3.5 py-2 rounded-md text-sm transition-colors ${
              isActive
                ? 'font-semibold text-blue-600 bg-blue-50'
                : 'font-normal text-gray-700 hover:bg-gray-100'
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

        {/* NR-14: User account menu (sign-out) — always pinned to the right */}
        <div className="ml-auto">
          <UserButton />
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
            <Route index element={
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Select a trip from the list
              </div>
            } />
            <Route path=":id" element={<TripDetailPage />} />
          </Route>

          <Route path="/admin" element={<AdminPage />} />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </main>
    </div>
  );
}

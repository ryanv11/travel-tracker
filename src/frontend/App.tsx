/**
 * App — root component.
 *
 * Provides:
 *  - React Router (BrowserRouter already wraps at main.tsx level)
 *  - Route definitions: /, /map, /trips, /trips/:id, /admin
 *  - Persistent navigation bar
 *
 * AC-01: The app is reachable at http://localhost:5173 via `npm run dev`.
 */
import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { MapPage } from './pages/MapPage';
import { TripsPage } from './pages/TripsPage';
import { TripDetailPage } from './pages/TripDetailPage';
import { AdminPage } from './pages/AdminPage';
import { useGeocodeRetryQueue } from './hooks/useGeocodeRetryQueue';

const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  textDecoration: 'none',
  padding: '8px 14px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: isActive ? 600 : 400,
  color: isActive ? '#2563EB' : '#374151',
  background: isActive ? '#EFF6FF' : 'transparent',
});

/**
 * Root application component with navigation and route definitions.
 */
export function App() {
  const { pendingCount, retryAll, dismiss } = useGeocodeRetryQueue();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Navigation bar */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 20px',
          borderBottom: '1px solid #E5E7EB',
          background: '#ffffff',
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '16px', color: '#111827', marginRight: '12px' }}>
          ✈️ Travel Tracker
        </span>
        <NavLink to="/map" style={navLinkStyle}>
          Map
        </NavLink>
        <NavLink to="/trips" style={navLinkStyle}>
          Trips
        </NavLink>
        <NavLink to="/admin" style={navLinkStyle}>
          Admin
        </NavLink>

        {/* NR-06: offline geocoding indicator */}
        {pendingCount > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              title="Geocoding pending — click to retry now"
              onClick={retryAll}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', border: '1px solid #D97706',
                borderRadius: '6px', background: '#FEF3C7', color: '#92400E',
                fontSize: '12px', cursor: 'pointer', fontWeight: 500,
              }}
            >
              ☁ Geocoding pending ({pendingCount})
            </button>
            <button
              type="button"
              title="Dismiss — stop retrying"
              onClick={dismiss}
              style={{
                padding: '4px 8px', border: '1px solid #D1D5DB',
                borderRadius: '6px', background: '#fff', color: '#6B7280',
                fontSize: '11px', cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        )}
      </nav>

      {/* Page content */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Routes>
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/:id" element={<TripDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </main>
    </div>
  );
}

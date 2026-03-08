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

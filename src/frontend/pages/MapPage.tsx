/**
 * MapPage — world map view (MP-01, MP-02, GE-13).
 *
 * Renders the MapView with all loaded trips so CityMarkers can derive pins.
 * Country shading and region shading are handled inside MapView/CountryLayer/RegionLayer.
 */
import React from 'react';
import { useTrips } from '../hooks/useTrips';
import { MapView } from '../components/Map/MapView';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';

/**
 * Renders the full-page world map with shading and city pins.
 */
export function MapPage() {
  const { data: trips = [], isLoading, error } = useTrips();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <LoadingSpinner message="Loading map data…" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px' }}>
        <ErrorMessage error={error} />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <MapView trips={trips} />
    </div>
  );
}

/**
 * MapPage — world map view (MP-01, MP-02, GE-13).
 *
 * Renders the MapView with all loaded trips so CityMarkers can derive pins.
 * Country shading and region shading are handled inside MapView/CountryLayer/RegionLayer.
 */
import React from 'react';
import { MapView } from '../components/Map/MapView';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { useTrips } from '../hooks/useTrips';

/**
 * Renders the full-page world map with shading and city pins.
 */
export function MapPage() {
  const { data: trips = [], isLoading, error } = useTrips();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner message="Loading map data…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <ErrorMessage error={error} />
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <MapView trips={trips} />
    </div>
  );
}

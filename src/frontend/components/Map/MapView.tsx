/**
 * MapView — the primary map component integrating MapLibre GL JS via react-map-gl.
 *
 * Renders the world map with:
 *   - Country fill shading driven by the /api/map/shading response (MP-01 to MP-06)
 *   - Region shading loaded lazily at zoom >= 4 (MP-02)
 *   - City marker pins for resolved cities (MP-02, GE-13)
 *   - Click handlers for country, region, and city selection (MP-03, GE-09)
 *
 * SEC-12: Map labels use MapLibre's text-field layout property — no innerHTML.
 */
import React, { useCallback, useRef, useState } from 'react';
import Map, {
  Source,
  Layer,
  type MapRef,
  type MapLayerMouseEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapShading, useRegionShading } from '../../hooks/useMapShading';
import { CountryLayer } from './CountryLayer';
import { RegionLayer } from './RegionLayer';
import { CityMarkers } from './CityMarkers';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import type { TripSummary } from '../../types/api';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string;
const MAP_STYLE = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;

/** Minimum zoom level at which region shading is loaded. */
const REGION_ZOOM_THRESHOLD = 4;

interface MapViewProps {
  /** All loaded trips — city pins are derived from their places. */
  trips: TripSummary[];
  /**
   * Optional callback invoked when the user clicks a country polygon.
   * @param countryCode - ISO 3166-1 alpha-2 code of the clicked country.
   */
  onCountryClick?: (countryCode: string) => void;
}

/**
 * Full-screen interactive world map with shading and city markers.
 *
 * @param trips - List of trip summaries for deriving city pin locations.
 * @param onCountryClick - Callback invoked when a country polygon is clicked.
 */
export function MapView({ trips, onCountryClick }: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const [zoom, setZoom] = useState(2);
  const [visibleCountryCode, setVisibleCountryCode] = useState<string | undefined>();

  const { data: shadingData, isLoading: shadingLoading } = useMapShading();
  // Lazy-load region shading only when zoomed in enough
  const { data: regionData } = useRegionShading(
    zoom >= REGION_ZOOM_THRESHOLD ? visibleCountryCode : undefined,
  );

  /** Handles map zoom changes and updates the visible country for region loading. */
  const handleZoom = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setZoom(map.getZoom());
  }, []);

  /** Handles clicks on country fill layers. */
  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const features = e.features;
      if (!features || features.length === 0) return;

      const feature = features[0];
      // CountryLayer click — ISO_A2 from Natural Earth data
      if (feature.layer.id === 'countries-fill') {
        const code = feature.properties?.ISO_A2 as string | undefined;
        if (code && code !== '-99') {
          setVisibleCountryCode(code);
          onCountryClick?.(code);
        }
      }
    },
    [onCountryClick],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {shadingLoading && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, background: '#fff', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}>
          <LoadingSpinner message="Loading map data…" />
        </div>
      )}

      <Map
        ref={mapRef}
        mapStyle={MAP_STYLE}
        initialViewState={{ longitude: 10, latitude: 20, zoom: 2 }}
        style={{ width: '100%', height: '100%' }}
        onZoom={handleZoom}
        onClick={handleMapClick}
        interactiveLayerIds={['countries-fill']}
      >
        {/* Country shading layer */}
        <CountryLayer shadingData={shadingData ?? []} />

        {/* Region shading — rendered only when zoom >= threshold and data is available */}
        {zoom >= REGION_ZOOM_THRESHOLD && regionData && regionData.length > 0 && (
          <RegionLayer regionData={regionData} />
        )}

        {/* City pins — only for geocoded cities */}
        <CityMarkers trips={trips} />
      </Map>
    </div>
  );
}

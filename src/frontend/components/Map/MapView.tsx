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
import { useCallback, useRef, useState } from 'react';
import MapGL, { type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useNavigate } from 'react-router-dom';
import { useMapShading, useRegionShading } from '../../hooks/useMapShading';
import type { TripSummary } from '../../types/api';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { CityMarkers } from './CityMarkers';
import { CountryLayer } from './CountryLayer';
import { RegionLayer } from './RegionLayer';

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
  const navigate = useNavigate();

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

  /** Changes cursor to pointer when hovering over interactive layers (MP-03, GE-09). */
  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const canvas = e.target.getCanvas();
    canvas.style.cursor = e.features && e.features.length > 0 ? 'pointer' : '';
  }, []);

  /** Handles clicks on country, region, and city layers. */
  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const features = e.features;
      if (!features || features.length === 0) return;

      const feature = features[0];

      if (feature.layer.id === 'countries-fill') {
        // CountryLayer click — ISO_A2 from Natural Earth data
        const code = feature.properties?.ISO_A2 as string | undefined;
        if (code && code !== '-99') {
          setVisibleCountryCode(code);
          onCountryClick?.(code);
          navigate(`/trips?country=${encodeURIComponent(code)}`);
        }
      } else if (feature.layer.id === 'regions-fill') {
        // RegionLayer click — iso_3166_2 from Natural Earth admin-1 data
        const isoCode = feature.properties?.iso_3166_2 as string | undefined;
        if (isoCode) {
          const countryCode = isoCode.split('-')[0];
          navigate(
            `/trips?country=${encodeURIComponent(countryCode)}&region=${encodeURIComponent(isoCode)}`,
          );
        }
      } else if (feature.layer.id === 'city-markers') {
        // CityMarkers click — city id from GeoJSON properties
        const cityId = feature.properties?.id as number | undefined;
        if (cityId !== undefined) {
          navigate(`/trips?city=${cityId}`);
        }
      }
    },
    [onCountryClick, navigate],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {shadingLoading && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 10,
            background: '#fff',
            borderRadius: 6,
            boxShadow: '0 1px 4px rgba(0,0,0,.2)',
          }}
        >
          <LoadingSpinner message="Loading map data…" />
        </div>
      )}

      <MapGL
        ref={mapRef}
        mapStyle={MAP_STYLE}
        initialViewState={{ longitude: 10, latitude: 20, zoom: 2 }}
        style={{ width: '100%', height: '100%' }}
        onZoom={handleZoom}
        onMouseMove={handleMouseMove}
        onClick={handleMapClick}
        interactiveLayerIds={['countries-fill', 'regions-fill', 'city-markers']}
      >
        {/* Country shading layer */}
        <CountryLayer shadingData={shadingData ?? []} />

        {/* Region shading — rendered only when zoom >= threshold and data is available */}
        {zoom >= REGION_ZOOM_THRESHOLD && regionData && regionData.length > 0 && (
          <RegionLayer regionData={regionData} />
        )}

        {/* City pins — only for geocoded cities */}
        <CityMarkers trips={trips} />
      </MapGL>
    </div>
  );
}

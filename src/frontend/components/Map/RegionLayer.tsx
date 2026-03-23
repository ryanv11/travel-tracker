/**
 * RegionLayer — MapLibre fill layer for region-level shading.
 *
 * Loaded lazily when map zoom >= 3. Uses the 40 MB regions GeoJSON served
 * at /geo/regions.json. Feature matching uses the iso_3166_2 property
 * (e.g. 'US-CA' for California).
 *
 * SEC-12: No innerHTML — MapLibre's feature-state drives all rendering.
 */

import type { FillLayerSpecification } from 'maplibre-gl';
import { useEffect } from 'react';
import { Layer, Source, useMap } from 'react-map-gl/maplibre';
import type { RegionShading } from '../../types/api';

const REGIONS_GEOJSON_URL = '/geo/regions.json';

interface RegionLayerProps {
  /** Region shading data from GET /api/map/shading/regions/:countryCode. */
  regionData: RegionShading[];
}

const regionFillLayer: FillLayerSpecification = {
  id: 'regions-fill',
  type: 'fill',
  source: 'regions-source',
  paint: {
    'fill-color': [
      'case',
      ['!=', ['feature-state', 'colorHex'], null],
      ['feature-state', 'colorHex'],
      'transparent',
    ],
    // Higher opacity than the country layer (0.7) so visited regions visibly
    // stand out even when using the same colour — stacking creates contrast.
    'fill-opacity': 0.9,
    // Always draw region boundaries when this layer is active, giving a clear
    // state/province grid regardless of visit status.
    'fill-outline-color': '#64748B',
  },
};

/**
 * Renders the Natural Earth admin-1 (states/provinces) GeoJSON layer.
 * Applies feature-state colorHex for each region in regionData.
 *
 * @param regionData - Array of region shading records for the visible country.
 */
export function RegionLayer({ regionData }: RegionLayerProps) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map || regionData.length === 0) return;

    const applyShading = () => {
      if (!map.isSourceLoaded('regions-source')) return;
      for (const region of regionData) {
        map.setFeatureState(
          { source: 'regions-source', id: region.iso_3166_2 },
          { colorHex: region.color_hex ?? null },
        );
      }
      map.off('sourcedata', applyShading);
    };

    if (map.isSourceLoaded('regions-source')) {
      applyShading();
    } else {
      map.on('sourcedata', applyShading);
      return () => {
        map.off('sourcedata', applyShading);
      };
    }
  }, [map, regionData]);

  return (
    <Source id="regions-source" type="geojson" data={REGIONS_GEOJSON_URL} promoteId="iso_3166_2">
      <Layer {...regionFillLayer} />
    </Source>
  );
}

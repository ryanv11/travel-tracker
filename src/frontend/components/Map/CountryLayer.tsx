/**
 * CountryLayer — MapLibre GL JS GeoJSON source + fill layer for country shading.
 *
 * Loads the Natural Earth countries GeoJSON from /geo/countries.json once.
 * Applies feature-state (colorHex) for each country returned by /api/map/shading.
 * Countries with state_key = 'never_visited' have color_hex = null and render
 * with no fill (transparent), as required by AC-03 and MP-05.
 *
 * SEC-12: No innerHTML — MapLibre's data expressions drive all rendering.
 */
import React, { useEffect } from 'react';
import { Source, Layer, useMap } from 'react-map-gl/maplibre';
import type { FillLayerSpecification } from 'maplibre-gl';
import type { CountryShading } from '../../types/api';

const COUNTRIES_GEOJSON_URL = '/geo/countries.json';

interface CountryLayerProps {
  /** Shading data from GET /api/map/shading. */
  shadingData: CountryShading[];
}

/** Fill layer paint — reads colorHex from feature-state set below. */
const countryFillLayer: FillLayerSpecification = {
  id: 'countries-fill',
  type: 'fill',
  source: 'countries-source',
  paint: {
    'fill-color': [
      'case',
      ['!=', ['feature-state', 'colorHex'], null],
      ['feature-state', 'colorHex'],
      'transparent',
    ],
    'fill-opacity': 0.7,
  },
};

/** Subtle border between countries. */
const countryLineLayer: FillLayerSpecification = {
  id: 'countries-line',
  type: 'fill',
  source: 'countries-source',
  paint: {
    'fill-color': 'transparent',
    'fill-outline-color': '#CBD5E1',
  },
};

/**
 * Renders the Natural Earth country GeoJSON as a MapLibre source + fill layer.
 * After the source is ready, applies feature-state colorHex for each shaded country.
 *
 * @param shadingData - Array of country shading records from the API.
 */
export function CountryLayer({ shadingData }: CountryLayerProps) {
  const { current: map } = useMap();

  /**
   * After the map and source are ready, iterate the shading data and apply
   * feature-state to each country. MapLibre matches features by the id
   * set in the GeoJSON (ISO_A2 property promoted to feature id via promoteId).
   */
  useEffect(() => {
    if (!map || shadingData.length === 0) return;

    const applyShading = () => {
      for (const entry of shadingData) {
        map.setFeatureState(
          { source: 'countries-source', id: entry.country_code },
          {
            colorHex: entry.color_hex ?? null,
            stateKey: entry.state_key,
          },
        );
      }
    };

    // Filter sourcedata events to our specific source to avoid consuming
    // the event on MapTiler tile sources that load first.
    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === 'countries-source' && map.isSourceLoaded('countries-source')) {
        applyShading();
        map.off('sourcedata', onSourceData);
      }
    };

    if (map.isSourceLoaded('countries-source')) {
      applyShading();
    } else {
      map.on('sourcedata', onSourceData);
      return () => { map.off('sourcedata', onSourceData); };
    }
  }, [map, shadingData]);

  return (
    <Source
      id="countries-source"
      type="geojson"
      data={COUNTRIES_GEOJSON_URL}
      // promoteId promotes the ISO_A2 property to the feature id so
      // setFeatureState can address features by country code
      promoteId="ISO_A2"
    >
      <Layer {...countryLineLayer} />
      <Layer {...countryFillLayer} />
    </Source>
  );
}

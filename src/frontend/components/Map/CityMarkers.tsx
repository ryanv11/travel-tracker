/**
 * CityMarkers — MapLibre symbol layer for city pins.
 *
 * Derives the city list from all loaded trips' places. Only renders pins for
 * cities with geocode_status = 'resolved' (GE-13). City name text is rendered
 * via MapLibre's text-field layout property — no innerHTML (SEC-12).
 *
 * Uses a GeoJSON source rather than HTML markers for performance (MP-02).
 */

import type { SymbolLayerSpecification } from 'maplibre-gl';
import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/maplibre';
import type { TripSummary } from '../../types/api';

interface CityMarkersProps {
  /** All loaded trip summaries — cities are extracted from their places. */
  trips: TripSummary[];
}

/**
 * Rounds a coordinate to ~11m precision (4 decimal places) so that two city
 * rows geocoded to the same real-world location collapse to one dedup key,
 * even when they carry different city ids.
 */
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/**
 * Builds a deduplicated GeoJSON FeatureCollection of resolved cities
 * from an array of trip summaries. Cities without coordinates are excluded.
 *
 * Dedup key is rounded coordinate, not city id (BUG-34): duplicate city rows
 * for the same real-world place (e.g. two "Glasgow" rows — see BUG-33) share
 * identical lat/long but different ids. Deduping by id alone rendered one
 * icon per duplicate row stacked at the same pixel, which reads as a
 * bolder/"standout" marker next to a normal single pin for any city without
 * a duplicate — the inconsistency reported in BUG-34 is a rendering symptom
 * of that upstream duplicate-row data issue, not a distinct icon-treatment
 * bug. Deduping by coordinate means every resolved city — duplicated in the
 * DB or not — renders exactly one marker, restoring consistent treatment
 * across cities regardless of whether BUG-33's root cause has been fixed yet.
 */
export function buildCityGeoJSON(trips: TripSummary[]): GeoJSON.FeatureCollection {
  const seen = new Set<string>();
  const features: GeoJSON.Feature[] = [];

  for (const trip of trips) {
    for (const place of trip.places) {
      const city = place.city;
      if (
        city &&
        city.geocode_status === 'resolved' &&
        city.latitude !== null &&
        city.longitude !== null
      ) {
        const key = coordKey(city.latitude, city.longitude);
        if (seen.has(key)) continue;
        seen.add(key);
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [city.longitude!, city.latitude!],
          },
          properties: {
            id: city.id,
            // SEC-12: city name rendered via MapLibre text-field, not innerHTML
            name: city.name,
          },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

/** MapLibre symbol layer for city dots and labels. */
const citySymbolLayer: SymbolLayerSpecification = {
  id: 'city-markers',
  type: 'symbol',
  source: 'cities-source',
  layout: {
    // SEC-12: name injected via MapLibre text-field layout, not innerHTML
    'text-field': ['get', 'name'],
    'text-size': 11,
    'text-offset': [0, 1.2],
    'text-anchor': 'top',
    'icon-image': 'marker',
    'icon-size': 0.6,
    'icon-allow-overlap': true,
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': '#1E3A5F',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.5,
  },
};

/**
 * Renders a MapLibre GeoJSON source + symbol layer for all resolved cities
 * derived from the provided trips.
 *
 * @param trips - Array of trip summaries from which city coordinates are extracted.
 */
export function CityMarkers({ trips }: CityMarkersProps) {
  const geojson = useMemo(() => buildCityGeoJSON(trips), [trips]);

  return (
    <Source id="cities-source" type="geojson" data={geojson}>
      <Layer {...citySymbolLayer} />
    </Source>
  );
}

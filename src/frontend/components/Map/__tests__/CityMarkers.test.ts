/**
 * Tests for buildCityGeoJSON (BUG-34).
 *
 * Covers:
 *   - One feature per uniquely-located resolved city.
 *   - Cities that are pending / missing coordinates are excluded (GE-13).
 *   - Two city rows geocoded to the same coordinate (e.g. duplicate "Glasgow"
 *     rows from BUG-33) collapse to a single feature instead of stacking two
 *     markers at the same pixel — the root cause of the BUG-34 report, where
 *     the doubled-up marker read as a "standout" icon next to a normal single
 *     pin for a city (Edinburgh) without a duplicate.
 *
 * Source: src/frontend/components/Map/CityMarkers.tsx
 */

import { describe, expect, it } from 'vitest';
import type { City, TripSummary, TripSummaryPlace } from '../../../types/api.js';
import { buildCityGeoJSON } from '../CityMarkers.js';

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 1,
    name: 'Testville',
    country_code: 'GB',
    country_name: null,
    region_id: null,
    region_iso: null,
    latitude: 51.5,
    longitude: -0.1,
    geocode_status: 'resolved',
    ...overrides,
  };
}

function makePlace(city: City, id = 1): TripSummaryPlace {
  return { id, city_id: city.id, city };
}

function makeTrip(places: TripSummaryPlace[], overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    id: 1,
    name: 'Test Trip',
    start_date: '2026-01-01',
    end_date: '2026-01-05',
    status: 'planning',
    photo_album_ref: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    categories: [],
    companions: [],
    activities: [],
    countries: [],
    places,
    ...overrides,
  };
}

describe('buildCityGeoJSON', () => {
  it('renders one feature per resolved city with distinct coordinates', () => {
    const glasgow = makeCity({ id: 10, name: 'Glasgow', latitude: 55.8612, longitude: -4.2502 });
    const edinburgh = makeCity({
      id: 12,
      name: 'Edinburgh',
      latitude: 55.9533,
      longitude: -3.1884,
    });
    const trip = makeTrip([makePlace(glasgow, 1), makePlace(edinburgh, 2)]);

    const geojson = buildCityGeoJSON([trip]);

    expect(geojson.features).toHaveLength(2);
    const names = geojson.features.map((f) => f.properties?.name).sort();
    expect(names).toEqual(['Edinburgh', 'Glasgow']);
  });

  it('excludes cities with pending geocode status (GE-13)', () => {
    const pending = makeCity({
      id: 20,
      name: 'Pending City',
      geocode_status: 'pending',
      latitude: null,
      longitude: null,
    });
    const trip = makeTrip([makePlace(pending, 1)]);

    const geojson = buildCityGeoJSON([trip]);

    expect(geojson.features).toHaveLength(0);
  });

  it('collapses duplicate city rows at the same coordinate to a single marker (BUG-34/BUG-33)', () => {
    // Two distinct city ids (e.g. the BUG-33 duplicate "Glasgow" rows) resolved
    // to the identical lat/long. Deduping by id alone would render both,
    // stacking two icons at the same pixel and reading as a bolder/"standout"
    // marker relative to any other, non-duplicated city.
    const glasgowA = makeCity({ id: 10, name: 'Glasgow', latitude: 55.8612, longitude: -4.2502 });
    const glasgowB = makeCity({ id: 11, name: 'Glasgow', latitude: 55.8612, longitude: -4.2502 });
    const edinburgh = makeCity({
      id: 12,
      name: 'Edinburgh',
      latitude: 55.9533,
      longitude: -3.1884,
    });
    const trip = makeTrip([
      makePlace(glasgowA, 1),
      makePlace(glasgowB, 2),
      makePlace(edinburgh, 3),
    ]);

    const geojson = buildCityGeoJSON([trip]);

    // Exactly one Glasgow marker (not two) plus one Edinburgh marker.
    expect(geojson.features).toHaveLength(2);
    const names = geojson.features.map((f) => f.properties?.name).sort();
    expect(names).toEqual(['Edinburgh', 'Glasgow']);
  });

  it('dedupes the same city referenced by multiple trips', () => {
    const paris = makeCity({ id: 5, name: 'Paris', latitude: 48.8566, longitude: 2.3522 });
    const tripA = makeTrip([makePlace(paris, 1)], { id: 1 });
    const tripB = makeTrip([makePlace(paris, 2)], { id: 2 });

    const geojson = buildCityGeoJSON([tripA, tripB]);

    expect(geojson.features).toHaveLength(1);
  });
});

/**
 * Tests for RegionLayer's layer ordering (BUG-49).
 *
 * Context: RegionLayer mounts lazily — only once zoom crosses
 * REGION_ZOOM_THRESHOLD and region shading data has loaded — well after
 * CityMarkers' unconditional 'city-markers' layer. react-map-gl/maplibre
 * (@vis.gl/react-maplibre's Layer component, confirmed by reading
 * node_modules/@vis.gl/react-maplibre/src/components/layer.ts) calls
 * `map.addLayer(options, props.beforeId)` on mount and `map.moveLayer(id,
 * beforeId)` on update — a layer added with no beforeId lands on top of the
 * whole style stack, regardless of JSX sibling order. That's why region
 * shading rendered above city markers as soon as it activated, even though
 * CityMarkers appears later in MapView.tsx's JSX.
 *
 * The fix pins 'regions-fill' with beforeId: 'city-markers' so it always
 * inserts directly below the city markers layer, independent of mount timing.
 *
 * Source: src/frontend/components/Map/RegionLayer.tsx
 */

import { describe, expect, it } from 'vitest';
import { regionFillLayer } from '../RegionLayer.js';

describe('regionFillLayer (BUG-49 z-order)', () => {
  it('is pinned below the city-markers layer via beforeId', () => {
    expect(regionFillLayer.beforeId).toBe('city-markers');
  });

  it('keeps its own layer id stable for the beforeId to make sense against', () => {
    expect(regionFillLayer.id).toBe('regions-fill');
  });
});

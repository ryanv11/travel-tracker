/**
 * Tests for MapLegend (MAP-02).
 *
 * Mocks:
 *   - useShadingConfig() from hooks/useMapShading
 *
 * Covers:
 *   - Renders one entry per shading state from a mocked config response,
 *     with the display name and the config's colour hex applied.
 *   - Renders nothing while the config query is loading (no skeleton flash).
 *   - Renders nothing when the config is empty/unavailable (e.g. non-owner 403).
 *
 * Source: src/frontend/components/Map/MapLegend.tsx
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ShadingConfig } from '../../../types/api.js';
import { MapLegend } from '../MapLegend.js';

const mockUseShadingConfig = vi.fn();

vi.mock('../../../hooks/useMapShading.js', () => ({
  useShadingConfig: () => mockUseShadingConfig(),
}));

function makeConfig(overrides: Partial<ShadingConfig> = {}): ShadingConfig {
  return {
    state_key: 'visited_once',
    display_name: 'Visited',
    color_hex: '#2a9d8f',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('MapLegend', () => {
  it('renders an entry for each shading state in the mocked config', () => {
    const config = [
      makeConfig({ state_key: 'visited_once', display_name: 'Visited', color_hex: '#2a9d8f' }),
      makeConfig({ state_key: 'planned', display_name: 'Wishlist', color_hex: '#e76f51' }),
    ];
    mockUseShadingConfig.mockReturnValue({ data: config, isLoading: false });

    render(<MapLegend />);

    expect(screen.getByText('Visited')).toBeInTheDocument();
    expect(screen.getByText('Wishlist')).toBeInTheDocument();
  });

  it('applies the config colour as the swatch background', () => {
    const config = [
      makeConfig({ state_key: 'visited_once', display_name: 'Visited', color_hex: '#2a9d8f' }),
    ];
    mockUseShadingConfig.mockReturnValue({ data: config, isLoading: false });

    render(<MapLegend />);

    const swatch = screen.getByText('Visited').previousSibling as HTMLElement;
    expect(swatch).toHaveStyle({ backgroundColor: '#2a9d8f' });
  });

  it('renders nothing while the config is loading', () => {
    mockUseShadingConfig.mockReturnValue({ data: undefined, isLoading: true });

    const { container } = render(<MapLegend />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the config is empty', () => {
    mockUseShadingConfig.mockReturnValue({ data: [], isLoading: false });

    const { container } = render(<MapLegend />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the config is unavailable (e.g. non-owner 403)', () => {
    mockUseShadingConfig.mockReturnValue({ data: undefined, isLoading: false });

    const { container } = render(<MapLegend />);

    expect(container).toBeEmptyDOMElement();
  });
});

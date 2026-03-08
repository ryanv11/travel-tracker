/**
 * ShadingTab — Admin panel tab for configuring map shading colours (AD-04, MP-04).
 *
 * Shows the 6 configurable shading states with colour swatches and colour pickers.
 * Colour changes call PATCH /api/map/shading/config/:stateKey and immediately
 * update the map (invalidates map shading query).
 */
import React from 'react';
import { useShadingConfig, useUpdateShadingColor } from '../../hooks/useMapShading';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

/**
 * Renders a list of shading state rows with colour swatches and <input type="color"> pickers.
 */
export function ShadingTab() {
  const { data: configs = [], isLoading, error } = useShadingConfig();
  const updateColor = useUpdateShadingColor();

  if (isLoading) return <LoadingSpinner message="Loading shading config…" />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#4B5563' }}>
        Choose the colour for each map shading state. Changes update the map immediately.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {configs.map((cfg) => (
          <div key={cfg.state_key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
            {/* Colour swatch */}
            <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: cfg.color_hex, border: '1px solid #D1D5DB', flexShrink: 0 }} />

            {/* Display name */}
            <span style={{ flex: 1, fontSize: '14px', fontWeight: 500 }}>{cfg.display_name}</span>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>{cfg.color_hex}</span>

            {/* Colour picker */}
            <input
              type="color"
              defaultValue={cfg.color_hex}
              onChange={(e) => {
                void updateColor.mutateAsync({ stateKey: cfg.state_key, colorHex: e.target.value });
              }}
              style={{ width: '40px', height: '32px', padding: '2px', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer' }}
              aria-label={`Colour for ${cfg.display_name}`}
            />
          </div>
        ))}
      </div>
      {updateColor.error && <ErrorMessage error={updateColor.error} />}
    </div>
  );
}

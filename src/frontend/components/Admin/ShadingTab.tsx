/**
 * ShadingTab — Admin panel tab for configuring map shading colours (AD-04, MP-04).
 *
 * Shows the 6 configurable shading states with colour swatches and colour pickers.
 * Colour changes call PATCH /api/map/shading/config/:stateKey and immediately
 * update the map (invalidates map shading query).
 *
 * FIX 4 (ARCH-03): The colour input now uses local state for the preview value
 * (onChange updates local state only) and fires the PATCH mutation on onBlur.
 * This prevents dozens of API calls per drag gesture and eliminates race conditions.
 */
import React, { useState } from 'react';
import { useShadingConfig, useUpdateShadingColor } from '../../hooks/useMapShading';
import type { ShadingConfig } from '../../types/api';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

/**
 * ShadingRow — a single shading-state row with a local colour preview.
 *
 * Manages its own local colour string so the swatch and hex label update
 * in real time while the user drags the picker. The mutation fires once
 * on blur (when the user finishes selecting and moves focus away).
 *
 * @param cfg - The shading config entry for this row.
 * @param onCommit - Called with the final colour when the user blurs the input.
 */
function ShadingRow({
  cfg,
  onCommit,
}: {
  cfg: ShadingConfig;
  onCommit: (stateKey: string, colorHex: string) => void;
}) {
  // Local state drives the visual preview during drag; only committed on blur.
  const [localColor, setLocalColor] = useState(cfg.color_hex);

  return (
    <div
      key={cfg.state_key}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 12px',
        border: '1px solid #E5E7EB',
        borderRadius: '6px',
      }}
    >
      {/* Colour swatch — updates in real time via localColor */}
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '4px',
          background: localColor,
          border: '1px solid #D1D5DB',
          flexShrink: 0,
        }}
      />

      {/* Display name */}
      <span style={{ flex: 1, fontSize: '14px', fontWeight: 500 }}>{cfg.display_name}</span>
      {/* Hex label — updates in real time via localColor */}
      <span style={{ fontSize: '12px', color: '#6B7280' }}>{localColor}</span>

      {/* Colour picker — onChange updates local preview only; onBlur fires the mutation */}
      <input
        type="color"
        value={localColor}
        onChange={(e) => {
          // Update local state for immediate visual feedback; no API call here.
          setLocalColor(e.target.value);
        }}
        onBlur={(e) => {
          // Fire the PATCH mutation once the user settles on a colour and leaves.
          onCommit(cfg.state_key, e.target.value);
        }}
        style={{
          width: '40px',
          height: '32px',
          padding: '2px',
          border: '1px solid #D1D5DB',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
        aria-label={`Colour for ${cfg.display_name}`}
      />
    </div>
  );
}

/**
 * Renders a list of shading state rows with colour swatches and <input type="color"> pickers.
 */
export function ShadingTab() {
  const { data: configs = [], isLoading, error } = useShadingConfig();
  const updateColor = useUpdateShadingColor();

  if (isLoading) return <LoadingSpinner message="Loading shading config…" />;
  if (error) return <ErrorMessage error={error} />;

  /** Commits the chosen colour to the API. Called on input blur. */
  const handleCommit = (stateKey: string, colorHex: string) => {
    void updateColor.mutateAsync({ stateKey, colorHex });
  };

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#4B5563' }}>
        Choose the colour for each map shading state. Changes update the map immediately.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {configs.map((cfg) => (
          <ShadingRow key={cfg.state_key} cfg={cfg} onCommit={handleCommit} />
        ))}
      </div>
      {updateColor.error && <ErrorMessage error={updateColor.error} />}
    </div>
  );
}

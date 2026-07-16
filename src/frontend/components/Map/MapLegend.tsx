import { useShadingConfig } from '../../hooks/useMapShading';

/**
 * Small overlay legend explaining what the map's country/region shading colours mean.
 *
 * Fully data-driven from GET /api/map/shading/config (via useShadingConfig, which shares
 * the React Query cache with the Admin → Map Shading tab) — no hardcoded colours or state
 * names live here, so an admin colour change is reflected automatically.
 *
 * Renders nothing while the config is loading (no skeleton flash) and nothing if the
 * config is unavailable (e.g. a 403 for non-owners, matching the map's current
 * owner-gated behaviour — see ADL-28).
 */
export function MapLegend() {
  const { data: config, isLoading } = useShadingConfig();

  if (isLoading || !config || config.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute bottom-3 left-3 z-10 max-w-[70vw] rounded-md bg-white/95 p-2.5 text-xs shadow-md sm:max-w-xs"
      aria-label="Map shading legend"
    >
      <ul className="flex flex-col gap-1">
        {config.map((state) => (
          <li key={state.state_key} className="flex items-center gap-2">
            <span
              className="h-3 w-3 flex-shrink-0 rounded-sm border border-gray-300"
              style={{ backgroundColor: state.color_hex }}
              aria-hidden="true"
            />
            <span className="text-gray-700">{state.display_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

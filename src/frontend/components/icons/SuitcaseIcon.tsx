import type { IconProps } from './IconProps';

/**
 * Suitcase icon (WP-02 spec §3) — mobile Trips tab in the (not-yet-built, Phase 2)
 * bottom tab bar. Defined now as a reusable primitive, not yet wired into any
 * call site (no mobile tab bar exists in the app today).
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function SuitcaseIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <rect x="5" y="8" width="14" height="10.5" rx="2" fill="currentColor" />
      <rect
        x="9"
        y="5"
        width="6"
        height="3.5"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

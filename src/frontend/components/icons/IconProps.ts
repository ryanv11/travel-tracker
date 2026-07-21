/**
 * Shared prop contract for the Waypoint icon set (WP-02, spec §3).
 *
 * All icons render as literal inline `<svg>` JSX — never `dangerouslySetInnerHTML`
 * (blocking defect per _shared/frameworks.txt rule 22 / spec C8).
 */
export interface IconProps {
  /**
   * Icon size in pixels, applied to both width and height (icons are square,
   * viewBox 0 0 24 24 per spec). Spec recommends 16px for inline-with-text/tile
   * contexts and 20-22px for standalone/showcase contexts — callers choose per
   * context rather than one fixed magic number. Defaults to 16.
   */
  size?: number;
  /**
   * Additional class names. Icons fill/stroke with `currentColor`, so the
   * surrounding text color (e.g. a Tailwind `text-*` class) controls icon color —
   * this is what keeps the emoji→SVG swap visually equivalent to the emoji it
   * replaces without hardcoding the new `primary` (pine) token ahead of Phase 2.
   */
  className?: string;
}

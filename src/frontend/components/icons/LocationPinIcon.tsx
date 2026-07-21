import type { IconProps } from './IconProps';

export interface LocationPinIconProps extends IconProps {
  /**
   * Fill color for the small circle that "punches" the pin's hole. The spec
   * (§3) describes this as using "the surrounding background color to punch a
   * hole, not a stroke" — i.e. it must match whatever the pin sits on top of,
   * which is context-dependent (nav bar surface, empty-state circle, etc.), so
   * callers pass it explicitly rather than the component guessing. Defaults to
   * white, a reasonable neutral default for most contexts.
   */
  cutoutColor?: string;
}

/**
 * Location pin icon (WP-02 spec §3) — replaces the old world-map emoji. Used for
 * the nav brand mark, the mobile Map tab, and both "select a trip"/"no trips"
 * empty states.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives the pin's fill.
 * @param cutoutColor - Fill for the cutout circle (see prop doc above).
 */
export function LocationPinIcon({
  size = 16,
  className,
  cutoutColor = '#ffffff',
}: LocationPinIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <path d="M12 2C8.5 2 6 5 6 8.5C6 13 12 21 12 21C12 21 18 13 18 8.5C18 5 15.5 2 12 2Z" />
      <circle cx="12" cy="8.5" r="2.6" fill={cutoutColor} />
    </svg>
  );
}

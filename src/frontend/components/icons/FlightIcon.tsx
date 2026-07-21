import type { IconProps } from './IconProps';

/**
 * Flight icon (WP-02 spec §3) — replaces the old airplane emoji. Maps to `item_type: 'flight'`.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function FlightIcon({ size = 16, className }: IconProps) {
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
      <path d="M21 15.5v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V17l-2.5 2v1.5l3.5-1 3.5 1V19L13 17v-4.5l8 2.5Z" />
    </svg>
  );
}

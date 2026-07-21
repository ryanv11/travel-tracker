import type { IconProps } from './IconProps';

/**
 * Hotel icon (WP-02 spec §3) — replaces the old hotel-building emoji. Maps to `item_type: 'hotel'`.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function HotelIcon({ size = 16, className }: IconProps) {
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
      <path d="M4 20V9.5L12 4l8 5.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

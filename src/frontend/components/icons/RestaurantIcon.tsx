import type { IconProps } from './IconProps';

/**
 * Dining icon (WP-02 spec §3, system-doc label "dining") — replaces the old
 * fork-and-plate emoji. Maps to `item_type: 'restaurant'`.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function RestaurantIcon({ size = 16, className }: IconProps) {
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
      <path d="M6 3v7a2 2 0 0 0 2 2v9h1.5v-9a2 2 0 0 0 2-2V3H10v6H9V3H8v6H7V3H6Zm9.5 0c-1.4 0-2.5 2.1-2.5 5s1 5 2 5.6V21H16.5V3.05c-.35-.03-.68-.05-1-.05Z" />
    </svg>
  );
}

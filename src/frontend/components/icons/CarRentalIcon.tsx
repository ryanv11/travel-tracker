import type { IconProps } from './IconProps';

/**
 * Car icon (WP-02 spec §3) — replaces the old car emoji. Maps to `item_type: 'car_rental'`.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function CarRentalIcon({ size = 16, className }: IconProps) {
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
      <path d="M5 16.5V11l1.8-4.5A2 2 0 0 1 8.7 5h6.6a2 2 0 0 1 1.9 1.5L19 11v5.5a1 1 0 0 1-1 1H17a1 1 0 0 1-1-1V16H8v.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1ZM7.5 14a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm9 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM7 10.5h10L15.7 7H8.3L7 10.5Z" />
    </svg>
  );
}

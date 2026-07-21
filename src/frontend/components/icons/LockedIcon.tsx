import type { IconProps } from './IconProps';

/**
 * Locked icon (WP-02 spec §3) — replaces the old padlock emoji. Trip status only,
 * not an `item_type`.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function LockedIcon({ size = 16, className }: IconProps) {
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
      <path d="M7 10V7a5 5 0 0 1 10 0v3h.5A1.5 1.5 0 0 1 19 11.5v8A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-8A1.5 1.5 0 0 1 6.5 10H7Zm1.5 0h7V7a3.5 3.5 0 0 0-7 0v3Z" />
    </svg>
  );
}

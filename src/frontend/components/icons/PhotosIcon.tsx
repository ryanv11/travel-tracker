import type { IconProps } from './IconProps';

/**
 * Photos icon (WP-02 spec §3) — replaces the old camera emoji. Used for the
 * Photos button/toast, not an `item_type`.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function PhotosIcon({ size = 16, className }: IconProps) {
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
      <path d="M9.5 5h5l.9 1.5H18a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 18.5H6A1.5 1.5 0 0 1 4.5 17V8A1.5 1.5 0 0 1 6 6.5h2.6L9.5 5Zm2.5 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
    </svg>
  );
}

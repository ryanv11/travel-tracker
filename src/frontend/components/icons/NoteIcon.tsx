import type { IconProps } from './IconProps';

/**
 * Note icon (WP-02 spec §3) — replaces the old memo emoji. Maps to `item_type: 'note'`.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function NoteIcon({ size = 16, className }: IconProps) {
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
      <path d="M5 3.5h14a1 1 0 0 1 1 1V20a1 1 0 0 1-1.45.9L12 18.4l-6.55 2.5A1 1 0 0 1 4 20V4.5a1 1 0 0 1 1-1ZM7 8h10V6.5H7V8Zm0 3.5h10V10H7v1.5Z" />
    </svg>
  );
}

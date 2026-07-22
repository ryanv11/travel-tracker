import type { IconProps } from './IconProps';

/**
 * Edit/pencil icon (WP-03 spec §3) — mobile trip-detail header's compact
 * Edit/Photos icon pair (see spec's "Mobile Edit/Photos entry point" resolution,
 * a new glyph authored for this spec since neither source mockup shows a mobile
 * Edit affordance at all).
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function EditIcon({ size = 16, className }: IconProps) {
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
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
    </svg>
  );
}

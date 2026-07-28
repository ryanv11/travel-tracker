import type { IconProps } from './IconProps';

/**
 * Trash/delete icon (BUG-50/TR-14) — used for the per-trip delete affordance
 * in the trip detail view (desktop text button, mobile compact icon button).
 * New glyph authored for this brief; no equivalent existed in the Waypoint
 * icon set before now (the bulk-delete action bar used a bare text label,
 * no icon).
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function TrashIcon({ size = 16, className }: IconProps) {
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
      {/* Lid + handle */}
      <path d="M9 3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V5h4.25a.75.75 0 0 1 0 1.5H4.75a.75.75 0 0 1 0-1.5H9V3.5Z" />
      {/* Body — bin with two internal ribs */}
      <path d="M6 8h12l-.9 11.13A2 2 0 0 1 15.11 21H8.89a2 2 0 0 1-1.99-1.87L6 8Zm4 2.75a.75.75 0 0 0-.75.75v6a.75.75 0 0 0 1.5 0v-6a.75.75 0 0 0-.75-.75Zm4 0a.75.75 0 0 0-.75.75v6a.75.75 0 0 0 1.5 0v-6a.75.75 0 0 0-.75-.75Z" />
    </svg>
  );
}

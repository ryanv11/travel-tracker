import type { IconProps } from './IconProps';

/**
 * Back chevron icon (WP-02 spec §3) — mobile detail-view "‹ Trips" back
 * navigation (Phase 2, no mobile detail view exists yet). Defined now as a
 * reusable primitive, not yet wired into any call site.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives the stroke.
 */
export function BackChevronIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

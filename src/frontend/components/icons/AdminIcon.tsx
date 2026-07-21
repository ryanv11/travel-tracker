import type { IconProps } from './IconProps';

/**
 * Admin icon (WP-02 spec §3) — a 3-row settings-slider glyph for the mobile
 * Admin tab in the (not-yet-built, Phase 2) bottom tab bar. Defined now as a
 * reusable primitive, not yet wired into any call site.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function AdminIcon({ size = 16, className }: IconProps) {
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
      <rect x="4" y="5.2" width="16" height="2" rx="1" fill="currentColor" opacity="0.3" />
      <circle cx="15" cy="6.2" r="2.6" fill="currentColor" />
      <rect x="4" y="11" width="16" height="2" rx="1" fill="currentColor" opacity="0.3" />
      <circle cx="9" cy="12" r="2.6" fill="currentColor" />
      <rect x="4" y="16.8" width="16" height="2" rx="1" fill="currentColor" opacity="0.3" />
      <circle cx="17" cy="17.8" r="2.6" fill="currentColor" />
    </svg>
  );
}

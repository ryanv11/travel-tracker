import type { IconProps } from './IconProps';

/**
 * Experience icon (WP-02 spec §3) — replaces the old ticket emoji. Maps to `item_type: 'experience'`.
 *
 * @param size - Icon size in px (square). Defaults to 16.
 * @param className - Extra class names; `currentColor` drives fill.
 */
export function ExperienceIcon({ size = 16, className }: IconProps) {
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
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 0 0 3V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a1.5 1.5 0 0 0 0-3V8Zm9-1v2h1.5V7H12Zm0 4v2h1.5v-2H12Zm0 4v2h1.5v-2H12Z" />
    </svg>
  );
}

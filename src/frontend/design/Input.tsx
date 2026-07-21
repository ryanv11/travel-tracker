import type { InputHTMLAttributes } from 'react';

/**
 * Waypoint text input (WP-02 spec §5).
 *
 * PHASE 1 ONLY — reusable primitive, not yet swapped into any existing form
 * field (those keep their current `focus:ring-2 focus:ring-teal-500` Tailwind
 * pattern until Phase 2). Focus style here matches spec §5's explicit
 * `outline: 2px solid primary; outline-offset: 1px`, which replaces that pattern.
 */
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`font-ui text-sm rounded-wp px-2.5 py-1.5 bg-wp-bg-surface text-wp-ink border border-wp-border focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-wp-primary focus-visible:outline-offset-1${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}

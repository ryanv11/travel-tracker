import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Waypoint button variants (WP-02 spec §5).
 *
 * PHASE 1 ONLY — this component exists as a reusable primitive and is not yet
 * swapped into any existing call site (Edit/Photos/Delete/etc. buttons across the
 * app keep their current teal/gray Tailwind classes until Phase 2's Trips reskin).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant, per spec §5's table. Defaults to 'primary'. */
  variant?: ButtonVariant;
  children: ReactNode;
}

/** Per-variant background/text/border classes, built from the wp-* theme tokens. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-wp-primary text-white border border-transparent hover:bg-wp-primary-hover',
  secondary: 'bg-wp-bg-surface text-wp-ink border border-wp-border hover:bg-wp-bg-subtle',
  destructive:
    'bg-wp-btn-destructive-bg text-wp-btn-destructive-text border border-wp-btn-destructive-border hover:brightness-95',
  ghost:
    'bg-transparent text-wp-ink-muted border-2 border-dashed border-wp-btn-ghost-border hover:border-wp-btn-ghost-border-hover hover:text-wp-btn-ghost-text-hover',
};

/** Shared shape/typography classes common to every variant (spec §5). */
const BASE_CLASSES =
  'font-ui font-semibold text-sm rounded-wp px-3.5 py-2 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

/**
 * Renders a Waypoint-styled button. Not yet used by any existing screen (Phase 1
 * primitive) — see module doc comment.
 *
 * @param variant - primary | secondary | destructive | ghost (spec §5).
 * @param className - Additional classes, appended after the variant/base classes.
 */
export function Button({
  variant = 'primary',
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}

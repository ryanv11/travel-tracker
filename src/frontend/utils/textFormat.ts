/**
 * textFormat — small, pure text-formatting helpers shared by input handlers.
 *
 * Deliberately minimal: this is cosmetic input formatting only (BUG-56), not
 * general-purpose string normalisation. Do not expand into a broader
 * normalisation utility from here — each new use should be a deliberate,
 * separately-considered addition.
 */

/**
 * Capitalises the first character of `value` and leaves the rest untouched.
 * Safe on empty strings and strings that already start with a non-letter
 * (e.g. leading whitespace or a digit) — those pass through unchanged aside
 * from the first character's case, which is a no-op for non-letters.
 */
export function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

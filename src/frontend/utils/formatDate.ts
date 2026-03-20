/**
 * formatDate — shared date formatting utility.
 *
 * Converts a YYYY-MM-DD ISO date string into a human-readable format
 * suitable for display in the UI (e.g. "1 Jun 2026").
 *
 * The 'T00:00:00' suffix forces the Date constructor to interpret the
 * value as local midnight, avoiding off-by-one shifts from UTC parsing.
 */

/**
 * Formats a YYYY-MM-DD date string to a readable locale string.
 *
 * @param iso - A date string in YYYY-MM-DD format.
 * @returns A human-readable date string, e.g. "1 Jun 2026".
 */
export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

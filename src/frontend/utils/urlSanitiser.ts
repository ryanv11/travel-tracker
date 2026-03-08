/**
 * URL sanitiser — SEC-12 compliance.
 *
 * Only https:// and file:// schemes are permitted when rendering user-supplied
 * URLs as anchor tags. Any other scheme (javascript:, data:, vbscript:, etc.)
 * is rejected and this function returns null, signalling the caller to render
 * the value as plain text rather than as a link.
 *
 * The only Phase 1 user-supplied URL field is trip.photo_album_ref.
 * Call sanitiseUrl() wherever that field is rendered as an <a href>.
 */

/**
 * Validates a user-supplied URL and returns it if the scheme is safe,
 * or null if the scheme is not permitted or the value is falsy.
 *
 * @param url - The raw URL string from the API response (may be null).
 * @returns The original URL if safe, null otherwise.
 */
export function sanitiseUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('https://') || url.startsWith('file://')) return url;
  // All other schemes (javascript:, data:, vbscript:, http://, etc.) are rejected.
  return null;
}

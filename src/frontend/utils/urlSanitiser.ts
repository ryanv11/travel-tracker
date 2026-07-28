/**
 * URL sanitiser — SEC-12 compliance.
 *
 * By default, only https:// and file:// schemes are permitted when rendering
 * user-supplied URLs as anchor tags. Any other scheme (javascript:, data:,
 * vbscript:, etc.) is rejected and this function returns null, signalling the
 * caller to render the value as plain text rather than as a link.
 *
 * Two Phase 1 user-supplied URL fields use this: trip.photo_album_ref (default
 * https:/file: scheme set) and item.map_url (ADL-45 — https:// only, narrower;
 * file:// is not a legitimate "get directions" link). Call sanitiseUrl()
 * wherever either field is rendered as an <a href>, passing an explicit
 * allowedSchemes list to narrow beyond the default (ADL-45 D7 — one function,
 * parameterised, rather than a second sanitiser that can drift out of sync).
 */

/** Default allowed schemes — preserves pre-ADL-45 behaviour for photo_album_ref. */
const DEFAULT_ALLOWED_SCHEMES = ['https:', 'file:'];

/**
 * Validates a user-supplied URL and returns it if the scheme is safe,
 * or null if the scheme is not permitted or the value is falsy.
 *
 * @param url - The raw URL string from the API response (may be null).
 * @param allowedSchemes - Schemes to accept (default `['https:', 'file:']`).
 *   Pass `['https:']` for fields that should reject `file://` (ADL-45 D5).
 * @returns The original URL if safe, null otherwise.
 */
export function sanitiseUrl(
  url: string | null | undefined,
  allowedSchemes: string[] = DEFAULT_ALLOWED_SCHEMES,
): string | null {
  if (!url) return null;
  // startsWith on the literal scheme prefix (not new URL().protocol) — scheme
  // confusion tricks like `https:/\evil` are a redirect/parsing concern, not a
  // script-execution one, so this remains correct for SEC-12's actual threat
  // model (rejecting javascript:/data:/vbscript:). See ADL-45 D6/D7.
  return allowedSchemes.some((scheme) => url.startsWith(`${scheme}//`)) ? url : null;
}

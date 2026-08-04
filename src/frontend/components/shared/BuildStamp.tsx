/**
 * BuildStamp — QUAL-26.
 *
 * A build stamp, deliberately not a screen. It answers exactly one question — "which build
 * am I looking at?" — for a PO who tests staging-only in a host browser and, before this
 * existed, could not distinguish "the fix is broken" from "the fix was never deployed".
 * That ambiguity hid five consecutive skipped staging deploys on 2026-08-04.
 *
 * SCOPE, and it is intentional. This renders one muted monospace span inside the nav bar's
 * existing right-hand group. No new page, no dialog, no new layout region. The full SHA and
 * build time are in the `title` tooltip rather than on screen, so the visible footprint
 * stays at seven characters.
 *
 * Renders nothing at all until /health answers, and nothing if it never does — a diagnostic
 * stamp must never occupy space with an error state or a spinner.
 */
import { useHealth } from '../../hooks/useHealth';

/**
 * Renders the running build's short commit SHA, or nothing if it is not yet known.
 * @returns The build stamp element, or null while loading/failed/unknown.
 */
export function BuildStamp() {
  const { data } = useHealth();

  // `unknown` is the honest fallback the backend reports when no SHA resolved. Showing it
  // would be noise for the PO — the useful signal is a SHA they can compare against main.
  if (!data || data.commit === 'unknown') return null;

  const builtAt = data.builtAt ? `, built ${new Date(data.builtAt).toLocaleString()}` : '';

  return (
    <span
      data-testid="build-stamp"
      title={`Build ${data.commitFull ?? data.commit}${builtAt}`}
      className="font-mono text-[10px] leading-none text-wp-ink-faint tabular-nums select-all"
    >
      {data.commit}
    </span>
  );
}

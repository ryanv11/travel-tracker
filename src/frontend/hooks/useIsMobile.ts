import { useEffect, useState } from 'react';

/**
 * WP-04: mobile breakpoint used to switch between the desktop two-panel Trips
 * layout and the new mobile list/detail slide layout. Matches Tailwind v4's
 * default `md` breakpoint (768px) so this hook's JS-driven branch and any
 * `md:` Tailwind utility classes elsewhere agree on the same cutoff.
 */
const MOBILE_BREAKPOINT_QUERY = '(max-width: 767px)';

/**
 * Returns true when the viewport is narrower than the `md` breakpoint (767px).
 *
 * Used to decide which of two structurally different Trips layouts to MOUNT
 * (not just CSS-hide) — the mobile layout's list↔detail slide transition needs
 * both panels simultaneously mounted and animated via transform/opacity, which
 * is a different DOM shape from the desktop two-panel + `<Outlet/>` structure,
 * not just a restyled version of it. Conditionally mounting one or the other
 * (rather than rendering both and CSS-hiding one) also avoids doubling up
 * accessible-name matches for existing Playwright specs that assume exactly
 * one instance of shared text/roles (e.g. `.first()`/`.nth()` locator usage).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    // Sync in case the viewport changed between the initial render and this
    // effect running (e.g. a test harness resizing before mount settles).
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

/**
 * TripsLayout — routes to the desktop two-panel shell or the WP-04 mobile
 * list/detail layout based on viewport width (768px cutoff, matches Tailwind's
 * `md` breakpoint via useIsMobile()).
 *
 * These are two structurally different layouts (desktop: <Outlet/>-driven
 * two-panel; mobile: both list and detail views simultaneously mounted for
 * the slide/cross-fade transition — see MobileTripsLayout's doc comment) —
 * this is a genuine conditional-mount split, not a CSS-only responsive
 * reskin, per useIsMobile's doc comment.
 */
import { useIsMobile } from '../../hooks/useIsMobile';
import { DesktopTripsLayout } from './DesktopTripsLayout';
import { MobileTripsLayout } from './MobileTripsLayout';

/** Renders the desktop or mobile Trips layout depending on viewport width. */
export function TripsLayout() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileTripsLayout /> : <DesktopTripsLayout />;
}

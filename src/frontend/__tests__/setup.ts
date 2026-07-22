// Global test setup for frontend unit tests.
// Imports jest-dom custom matchers (toBeInTheDocument, toHaveTextContent, etc.)
import '@testing-library/jest-dom';

// WP-04: jsdom does not implement window.matchMedia — polyfill it so any
// component using useIsMobile() (desktop/mobile Trips layout switch) doesn't
// throw "matchMedia is not a function" in unit tests. Defaults to "no match"
// (desktop) for every query; tests exercising the mobile branch override this
// per-test via vi.spyOn(window, 'matchMedia').
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

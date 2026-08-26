/**
 * ADL-56 / GE-21 (BRD v3.22) — Slice 1 RED acceptance bar, part 3 of 3:
 * D8/B1's silent-live-lookup TRIGGER POLICY and its staleness contract.
 *
 * Covers ADL-56 §10 tests **10** (trigger policy: debounced · fires on the
 * settled query regardless of a single exact cached match · min-length 2 ·
 * per-query coalesced) and **11** (staleness — last-query-wins).
 *
 * ATDD-first (OP-35): authored BEFORE any implementer is briefed.
 *
 * ── WHY THIS SUITE EXISTS SEPARATELY ─────────────────────────────────────────
 * D8 is the one Slice-1 decision whose failure mode is not visible on screen.
 * "Seamless" implemented carelessly means a live Nominatim call PER KEYSTROKE
 * against an application-wide 1 req/s budget (`nominatim-client.ts:47`), and a
 * merge implemented carelessly renders an abandoned query's candidates over the
 * current one. Neither shows up in a screenshot; both show up here, at the
 * egress boundary, as call counts and call ordering.
 *
 * The B1 assertion — "a live call IS made for 'Newport' when exactly one exact
 * cached row exists" — is the inverse of the cached-first gate the first OP-27
 * fresh-eyes review found and removed. It is asserted here at the CALL level
 * and again in `AddPlaceFlow.adl56-merged-surface.test.tsx` at the SURFACE
 * level, deliberately: a build could fire the call and still not merge the
 * result, or merge a result it never fetched.
 *
 * ── RED-BAR CARRIAGE ─────────────────────────────────────────────────────────
 * Committed `describe.skip` with RED-BAR markers per the GE-19/ADL-55
 * convention; run un-skipped before commit, observed failures recorded in
 * `jobs/qa/tech/20260826-ADL56-slice1-red-bar.md`.
 *
 * ── ON THE ROLLBACK SEAM (§3b item 7) ────────────────────────────────────────
 * D8 requires the auto-fire trigger to be ONE isolated policy point so a
 * rollback to an explicit "search live" affordance stays localized. That is a
 * structural property of the source, not an observable behaviour, so it is
 * deliberately NOT pinned here — it belongs in the implementer's brief and in
 * code review. Flagged in the QA completion report rather than faked into an
 * assertion.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPatch, apiPost } from '../../../utils/apiClient';
import { melbourneAuResponse, newportUsResponse } from './fixtures/adl56Geocode';
import {
  type ApiRouter,
  CACHED_NEWPORT_OREGON,
  installRouter,
  renderAddPlaceFlow,
  SETTLE_MS,
  waitMs,
} from './fixtures/adl56Harness';

vi.mock('../../../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/apiClient')>();
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn() };
});

let router: ApiRouter;

beforeEach(() => {
  vi.clearAllMocks();
  router = installRouter({ apiGet, apiPost, apiPatch });
});

const US_AU_TRIP = [
  { country_code: 'US', name: 'United States' },
  { country_code: 'AU', name: 'Australia' },
];

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 10 (D8/B1 trigger policy).
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 10 — the silent live lookup fires once per settled query', () => {
  beforeEach(() => {
    router.setCachedRows([CACHED_NEWPORT_OREGON]);
    router.setLiveResponse(newportUsResponse(), 'Newport');
  });

  it('B1 — a live call IS made for "Newport" even though exactly one exact cached row exists', async () => {
    const user = userEvent.setup({ delay: null });
    renderAddPlaceFlow();
    await user.type(screen.getByPlaceholderText('Search city name…'), 'Newport');

    await waitFor(() => expect(router.geocodeQueries()).toContain('newport'), { timeout: 3000 });
  });

  it('is debounced — typing seven characters produces ONE live call, not seven', async () => {
    const user = userEvent.setup({ delay: null });
    renderAddPlaceFlow();
    await user.type(screen.getByPlaceholderText('Search city name…'), 'Newport');

    await waitFor(() => expect(router.geocodeQueries().length).toBeGreaterThan(0), {
      timeout: 3000,
    });
    // Let any per-keystroke stragglers land before counting — a debounce that
    // is merely SLOW rather than coalescing would show up here.
    await waitMs(SETTLE_MS * 2);

    expect(router.geocodeQueries()).toEqual(['newport']);
  });

  it('respects the min-length-2 gate — one character fires nothing, the rest of the word fires exactly one call', async () => {
    // NOTE: the first half of this test is trivially true on `main` (no live
    // call fires from the search step at all), so it is paired with a POSITIVE
    // control in the same test. Without the second half a green here would say
    // nothing — it would be the vacuous pass QUAL-22 exists to prevent.
    const user = userEvent.setup({ delay: null });
    renderAddPlaceFlow();
    const input = screen.getByPlaceholderText('Search city name…');

    await user.type(input, 'N');
    await waitMs(SETTLE_MS * 2);
    expect(router.geocodeQueries()).toEqual([]);
    // The catalogue search is gated identically (unchanged behaviour, `:405`).
    expect(router.countCalls('/api/cities?', 'GET')).toBe(0);

    // Positive control — crossing the gate DOES fire, exactly once.
    await user.type(input, 'ewport');
    await waitFor(() => expect(router.geocodeQueries()).toEqual(['newport']), { timeout: 3000 });
  });

  it('is per-query coalesced — deleting and retyping the SAME settled query does not re-fire', async () => {
    // The R2-a stress case the fresh-eyes re-review named explicitly:
    // type → delete → retype must not defeat the per-query cache.
    const user = userEvent.setup({ delay: null });
    renderAddPlaceFlow();
    const input = screen.getByPlaceholderText('Search city name…');

    await user.type(input, 'Newport');
    await waitFor(() => expect(router.geocodeQueries().length).toBe(1), { timeout: 3000 });

    await user.clear(input);
    await waitMs(SETTLE_MS);
    await user.type(input, 'Newport');
    await waitMs(SETTLE_MS * 2);

    expect(router.geocodeQueries()).toEqual(['newport']);
  });

  it('a DIFFERENT settled query does fire its own single call', async () => {
    router.setLiveResponse(melbourneAuResponse(), 'Melbourne');
    const user = userEvent.setup({ delay: null });
    renderAddPlaceFlow({ tripCountries: US_AU_TRIP });
    const input = screen.getByPlaceholderText('Search city name…');

    await user.type(input, 'Newport');
    await waitFor(() => expect(router.geocodeQueries()).toContain('newport'), { timeout: 3000 });

    await user.clear(input);
    await user.type(input, 'Melbourne');
    await waitFor(() => expect(router.geocodeQueries()).toContain('melbourne'), { timeout: 3000 });
    await waitMs(SETTLE_MS * 2);

    // Exactly one call each — bounded by debounce + min-length + per-query
    // cache, which is what makes autofire budget-safe without a gate (§3b).
    expect(router.geocodeQueries().sort()).toEqual(['melbourne', 'newport']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 11 (D8/B1 staleness, last-query-wins).
//
// Because the live call is now bound to the settled query rather than to an
// explicit click, a response for a SUPERSEDED query must never render. On
// `main` the live lookup is an imperative `lookupCityCountry(...).then()`
// (`AddPlaceFlow.tsx:410`) with no keying at all — whichever promise resolves
// last wins, which is the defect this pins.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 11 — a superseded live response never renders (last-query-wins)', () => {
  beforeEach(() => {
    router.setCachedRows([]);
    router.deferLiveFor('Newport');
    router.setLiveResponse(melbourneAuResponse(), 'Melbourne');
  });

  it('A is abandoned for B before A returns — A’s candidates never appear', async () => {
    const user = userEvent.setup({ delay: null });
    renderAddPlaceFlow({ tripCountries: US_AU_TRIP });
    const input = screen.getByPlaceholderText('Search city name…');

    // Query A fires and hangs.
    await user.type(input, 'Newport');
    await waitFor(() => expect(router.hasLiveCallFor('Newport')).toBe(true), { timeout: 3000 });

    // The user moves on to B, which resolves normally.
    await user.clear(input);
    await user.type(input, 'Melbourne');
    expect(
      await screen.findByTestId('add-place-live-option-relation-4246124', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();

    // A finally returns — late, and for a query nobody is looking at.
    router.deferredFor('Newport').resolve(newportUsResponse());
    await waitMs(SETTLE_MS);

    // The surface still shows only B.
    expect(screen.getByTestId('add-place-live-option-relation-4246124')).toBeInTheDocument();
    expect(screen.queryByTestId('add-place-live-option-relation-191230')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-place-live-option-relation-186468')).not.toBeInTheDocument();
  });

  it("a superseded response does not resurrect the abandoned query's in-flight cue either", async () => {
    const user = userEvent.setup({ delay: null });
    renderAddPlaceFlow({ tripCountries: US_AU_TRIP });
    const input = screen.getByPlaceholderText('Search city name…');

    await user.type(input, 'Newport');
    await waitFor(() => expect(router.hasLiveCallFor('Newport')).toBe(true), { timeout: 3000 });

    await user.clear(input);
    await user.type(input, 'Melbourne');
    await screen.findByTestId('add-place-live-option-relation-4246124', undefined, {
      timeout: 3000,
    });

    // B has settled, so no cue should be showing — even though A is still
    // technically open. The cue is keyed to the CURRENT query (NB-1 + §3b(6)).
    await waitFor(() =>
      expect(screen.queryByTestId('add-place-live-inflight')).not.toBeInTheDocument(),
    );

    router.deferredFor('Newport').resolve(newportUsResponse());
    await waitMs(SETTLE_MS);
    expect(screen.queryByTestId('add-place-live-inflight')).not.toBeInTheDocument();
  });
});

/**
 * ADL-56 / GE-21 (BRD v3.22) — Slice 1 RED acceptance bar: the CORRECTION
 * surface.
 *
 * Covers ADL-56 §10 test **13** (D8/N6 — the B1 hole closed on
 * `ChangeCityModal` too) and the `ChangeCityModal` half of §10 test **4**
 * (D3/P2 identity dedup), plus the D7 anti-silent-commit guard as §12-Q5
 * scoped it to this surface.
 *
 * ATDD-first (OP-35): authored BEFORE any implementer is briefed.
 *
 * ── WHY THIS SURFACE IS IN SLICE 1 AT ALL ────────────────────────────────────
 * §12-Q5, resolved by the PO 2026-08-11: `ChangeCityModal`'s search step is
 * **cached-only today** — `useCitySearch(debouncedQuery)` with no live lookup
 * (`ChangeCityModal.tsx:55`); its live lookup fires only on the "+ Add new"
 * click (`:124`, via `useCityDisambiguation.runLookup`). So exposing
 * `osm_type`/`osm_id` on the search projection lands the DEDUP here for free
 * through the shared utils, but it does NOT close the B1 Newport hole: a user
 * correcting a wrong city still sees only what the catalogue happens to hold.
 * Leaving that open would mean the surface that exists to FIX a wrong
 * disambiguation is itself vulnerable to the same wrong disambiguation.
 *
 * ── SCOPE LIMIT (§12-Q5, deliberate) ─────────────────────────────────────────
 * `ChangeCityModal` gets the autofire live merge + P2 identity dedup + the
 * anti-silent-commit guard. It does NOT get the dates / held-selection
 * restructure — a re-point has no dates, so BUG-99's premature-dates defect
 * does not exist here, and the N3 held-selection invalidation is
 * AddPlaceFlow-only. No test below asserts a held selection on this surface.
 *
 * ── RED-BAR CARRIAGE + PRESCRIBED TESTIDS ────────────────────────────────────
 * Committed `describe.skip` with RED-BAR markers per the GE-19/ADL-55
 * convention; run un-skipped before commit, observed failures recorded in
 * `jobs/qa/tech/20260826-ADL56-slice1-red-bar.md`.
 *   • `change-city-live-option-<osm_type>-<osm_id>` — a LIVE candidate row in
 *     the merged correction surface (cached rows keep the existing
 *     `city-search-result-<id>` testid unchanged)
 *   • `change-city-live-inflight` — the NB-1 cue on this surface
 * The existing "Change City" submit button is addressed by role+name, not by a
 * new testid, because it already exists and this brief does not move it.
 *
 * Mock fidelity (QUAL-22): the double sits on `utils/apiClient` and serves the
 * REAL `GET /api/geocode` body derived from REAL captured Nominatim responses —
 * see `fixtures/adl56Geocode.ts` and `fixtures/adl56Harness.tsx`.
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
  renderChangeCityModal,
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
  router.setCreateCityResult({
    id: 5003,
    name: 'Melbourne',
    country_code: 'AU',
    country_name: null,
    region_id: null,
    region_iso: null,
    latitude: null,
    longitude: null,
    geocode_status: 'pending',
  });
});

async function typeQuery(text: string) {
  const user = userEvent.setup({ delay: null });
  await user.type(screen.getByPlaceholderText('Search city name…'), text);
  return user;
}

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 13 (D8/N6).
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 13 — the correction surface fires the live merge too (the B1 hole is closed here, not only in AddPlaceFlow)', () => {
  beforeEach(() => {
    router.setCachedRows([CACHED_NEWPORT_OREGON]);
    router.setLiveResponse(newportUsResponse(), 'Newport');
  });

  it('typing "Newport" with one cached "Newport, Oregon" row fires a live lookup from the SEARCH step', async () => {
    renderChangeCityModal();
    await typeQuery('Newport');

    // Today this call only ever happens after a "+ Add new" click (`:124`).
    await waitFor(() => expect(router.hasLiveCallFor('Newport')).toBe(true), { timeout: 3000 });
  });

  it('shows the live alternatives alongside the cached row', async () => {
    renderChangeCityModal();
    await typeQuery('Newport');

    expect(await screen.findByTestId('city-search-result-4001')).toBeInTheDocument();
    expect(
      await screen.findByTestId('change-city-live-option-relation-191230', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('change-city-live-option-relation-130502')).toBeInTheDocument();
  });

  it('re-points nothing automatically — surfacing the choice issues no PATCH', async () => {
    renderChangeCityModal();
    await typeQuery('Newport');

    await waitFor(() => expect(router.hasLiveCallFor('Newport')).toBe(true), { timeout: 3000 });
    await waitMs(SETTLE_MS);

    expect(router.countCalls('/api/trips/1/places/77', 'PATCH')).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 4, ChangeCityModal half (D3/P2).
//
// ANTI-VACUOUS GUARD: as in the AddPlaceFlow half, "the twin appears once" is
// trivially true while zero live candidates appear, so each test first asserts
// that a NON-duplicate live candidate is rendered.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 4 — identity dedup holds on the correction surface (ChangeCityModal)', () => {
  beforeEach(() => {
    router.setCachedRows([CACHED_NEWPORT_OREGON]);
    router.setLiveResponse(newportUsResponse(), 'Newport');
  });

  it('the live Oregon candidate is collapsed onto the cached Oregon row by (osm_type, osm_id)', async () => {
    renderChangeCityModal();
    await typeQuery('Newport');

    expect(
      await screen.findByTestId('change-city-live-option-relation-191230', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();

    expect(screen.getAllByTestId('city-search-result-4001')).toHaveLength(1);
    expect(screen.queryByTestId('change-city-live-option-relation-186468')).not.toBeInTheDocument();
  });

  it('choosing the deduped row re-points by city_id and mints no new city', async () => {
    renderChangeCityModal();
    const user = await typeQuery('Newport');

    expect(
      await screen.findByTestId('change-city-live-option-relation-191230', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('city-search-result-4001'));

    await waitFor(() => expect(router.countCalls('/api/trips/1/places/77', 'PATCH')).toBe(1));
    expect(router.bodiesFor('/api/trips/1/places/77')[0]).toMatchObject({ city_id: 4001 });
    expect(router.countCalls('/api/cities', 'POST')).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — the D7 anti-silent-commit guard, as §12-Q5 scopes it to
// this surface: no silent AMBIGUOUS re-point.
//
// The live path on `main`: "+ Add new" → `runLookup` → two distinct osm_ids →
// `CityPicker` renders — but the form's own "Change City" submit stays live and,
// clicked without a pick, runs `handleCreateAndRepoint` → `createCity({name,
// country_code, region_id: undefined})` → `repointTo`
// (`ChangeCityModal.tsx:146-160`). That is the same guess-without-a-pick write
// as AddPlaceFlow's Melbourne save (§6a), on the surface whose entire job is to
// CORRECT a wrong city.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 §3a/§12-Q5 — the correction surface never commits a guess while a choice is showing', () => {
  beforeEach(() => {
    router.setCachedRows([]);
    router.setLiveResponse(melbourneAuResponse(), 'Melbourne');
  });

  it('submitting with the two-option Melbourne picker showing and nothing picked writes nothing', async () => {
    renderChangeCityModal();
    const user = await typeQuery('Melbourne');

    // Reach the picker by the path that exists on `main` — the escape-hatch
    // "+ Add new" row — so this test does not depend on where the merged
    // surface finally renders the choice.
    await user.click(await screen.findByText('+ Add new: "Melbourne"'));

    // Guard: the choice is genuinely on screen before the assertion runs.
    expect(
      await screen.findByText(/Multiple places match/i, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change city/i }));
    await waitMs(SETTLE_MS);

    // No city minted, no re-point performed — the user must pick a candidate
    // or explicitly "add as new" (§3a).
    expect(router.writePaths()).toEqual([]);
  });
});

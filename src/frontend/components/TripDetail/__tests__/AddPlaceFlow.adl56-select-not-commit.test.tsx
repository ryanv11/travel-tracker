/**
 * ADL-56 / GE-21 (BRD v3.22) — Slice 1 RED acceptance bar, part 2 of 3:
 * D7's select ≠ commit selection model.
 *
 * Covers ADL-56 §10 tests **7** (cached-search pick), **8** (disambiguation
 * pick + the createCity→addPlace ORDER), **9** (the Melbourne anti-silent-commit
 * guard) and **12** (D7/N3 held-selection invalidation on an identity-field
 * edit).
 *
 * ATDD-first (OP-35): authored BEFORE any implementer is briefed.
 *
 * ── THE BUG THIS PINS ────────────────────────────────────────────────────────
 * On `main` the pick IS the commit, at three separate call sites:
 *   • cached search result — `onClick → handleSelectCity → addPlace`
 *     (`AddPlaceFlow.tsx:611-613` → `:289`)
 *   • disambiguation picker — `CityPicker.onSelect →
 *     handleSelectPickerCandidate → createCity → handleSelectCity`
 *     (`:772-774` → `:362`)
 *   • the plain-name form submit — `handleCreateCity → createCity({… region_id:
 *     undefined})` (`:335-349`), which fires even with the picker showing and
 *     nothing chosen (the Melbourne region-null save, §6a)
 * so the optional date fields the user has not filled in yet are already moot
 * by the time they are visible (BUG-99), and a picker can be bypassed entirely
 * (BUG-98).
 *
 * ── RED-BAR CARRIAGE + PRESCRIBED TESTIDS ────────────────────────────────────
 * Committed `describe.skip` with RED-BAR markers per the GE-19/ADL-55
 * convention; every block was run un-skipped before commit and its observed
 * failure recorded in `jobs/qa/tech/20260826-ADL56-slice1-red-bar.md`.
 *
 * Testids this suite prescribes as part of the Slice-1 contract (copy and
 * affordance remain UX's under D6 — the tests never assert wording):
 *   • `add-place-commit`              — THE single explicit commit control, on
 *                                       every selection path (D7)
 *   • `add-place-live-option-<osm_type>-<osm_id>` — a live candidate row
 *   • `add-place-none-of-these`       — the explicit "none of these — add as
 *                                       new" escape row (D7 escape hatch)
 *   • `add-place-country-select`      — the Country control (identity-bearing
 *                                       field, N3)
 *   • `add-place-city-name-input`     — the city Name control (identity-bearing
 *                                       field, N3)
 * Cached rows keep their existing `city-search-result-<id>` testid unchanged.
 *
 * Mock fidelity (QUAL-22): see `fixtures/adl56Harness.tsx` for why the double
 * sits on `utils/apiClient` and `fixtures/adl56Geocode.ts` for the captured
 * provenance of every candidate.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPatch, apiPost } from '../../../utils/apiClient';
import { melbourneAuResponse, newportGbResponse, newportUsResponse } from './fixtures/adl56Geocode';
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
  router.setCreateCityResult({
    id: 5001,
    name: 'Newport',
    country_code: 'GB',
    country_name: null,
    region_id: 202,
    region_iso: 'GB-WLS',
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
// RED-BAR (Slice 1) — ADL-56 §10 test 7 (D7, cached-search pick).
// BUG-99's core: on `main` the click on a cached result posts the place
// immediately, so the optional dates are structurally unreachable.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 7 — a cached-search pick SELECTS and populates; it does not commit', () => {
  beforeEach(() => {
    router.setCachedRows([CACHED_NEWPORT_OREGON]);
    router.setLiveResponse(newportUsResponse(), 'Newport');
  });

  it('clicking a cached result writes nothing — no place is created on the pick', async () => {
    renderAddPlaceFlow();
    const user = await typeQuery('Newport');

    await user.click(await screen.findByTestId('city-search-result-4001'));
    await waitMs(SETTLE_MS);

    // GE-21: "choosing a result populates the form but writes nothing until the
    // explicit Add."
    expect(router.countCalls('/api/trips/1/places', 'POST')).toBe(0);
    expect(router.countCalls('/api/cities', 'POST')).toBe(0);
    // …and the commit control is now available, because a definite identity is held.
    expect(await screen.findByTestId('add-place-commit')).toBeInTheDocument();
  });

  it('only the explicit Add commits — and the place carries the dates set AFTER the pick', async () => {
    renderAddPlaceFlow();
    const user = await typeQuery('Newport');

    await user.click(await screen.findByTestId('city-search-result-4001'));

    // The dates are set AFTER choosing — the exact sequence BUG-99 made
    // impossible, and the exact sequence GE-21's success criteria name
    // ("the place saved carries the dates the user set after choosing").
    const dateInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="date"]'),
    );
    expect(dateInputs).toHaveLength(2);
    await user.type(dateInputs[0], '2026-03-04');
    await user.type(dateInputs[1], '2026-03-09');

    await user.click(screen.getByTestId('add-place-commit'));

    await waitFor(() => expect(router.countCalls('/api/trips/1/places', 'POST')).toBe(1));
    expect(router.bodiesFor('/api/trips/1/places')[0]).toMatchObject({
      city_id: 4001,
      arrived_on: '2026-03-04',
      departed_on: '2026-03-09',
    });
    // A cached pick reuses the row by id — it mints no second city (§5 P3).
    expect(router.countCalls('/api/cities', 'POST')).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 8 (D7, disambiguation pick).
//
// COO ADDITION 3 is folded in here: the createCity → addPlace ORDER is asserted
// explicitly, on the recorded call sequence, not inferred from two independent
// call counts (which would pass on the wrong order).
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 8 — a disambiguation pick SELECTS; the explicit Add runs createCity then addPlace, in that order, once', () => {
  beforeEach(() => {
    router.setCachedRows([]);
    router.setLiveResponse(newportGbResponse(), 'Newport');
  });

  it('clicking a live candidate calls neither createCity nor addPlace', async () => {
    renderAddPlaceFlow({ tripCountries: [{ country_code: 'GB', name: 'United Kingdom' }] });
    const user = await typeQuery('Newport');

    await user.click(
      await screen.findByTestId('add-place-live-option-node-26700977', undefined, {
        timeout: 3000,
      }),
    );
    await waitMs(SETTLE_MS);

    expect(router.writePaths()).toEqual([]);
  });

  it('the explicit Add issues exactly POST /api/cities then POST /api/trips/:id/places, in that order', async () => {
    renderAddPlaceFlow({ tripCountries: [{ country_code: 'GB', name: 'United Kingdom' }] });
    const user = await typeQuery('Newport');

    await user.click(
      await screen.findByTestId('add-place-live-option-node-26700977', undefined, {
        timeout: 3000,
      }),
    );
    await user.click(await screen.findByTestId('add-place-commit'));

    await waitFor(() => expect(router.countCalls('/api/trips/1/places', 'POST')).toBe(1));

    // COO ADDITION 3 — ORDER, not just counts. `toEqual` on the recorded
    // sequence fails if the two fire in the wrong order, if either fires twice,
    // or if a third write sneaks in; a pair of `toHaveBeenCalledTimes(1)`
    // assertions would pass on all three.
    expect(router.writePaths()).toEqual(['/api/cities', '/api/trips/1/places']);

    // The pick's carried identity reaches createCity (§5 P3, the live branch).
    expect(router.bodiesFor('/api/cities')[0]).toMatchObject({
      name: 'Newport',
      country_code: 'GB',
      osm_type: 'node',
      osm_id: 26700977,
    });
    // …and the place binds the city that create returned.
    expect(router.bodiesFor('/api/trips/1/places')[0]).toMatchObject({ city_id: 5001 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 9 (D7 anti-silent-commit guard, BUG-98).
//
// The PO's actual Melbourne case (§6a, corrected R1): a two-option picker DID
// show, the PO selected NEITHER, and it still saved — region-null. The captured
// live response in the fixture confirms the mechanism exactly: the `city`
// relation and the `municipality` relation both survive the settlement
// admission gate and both carry AU-VIC, so `distinctOsmIds.size === 2` fires
// the picker while `distinctRegionIsos` is length 1.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 9 — with a choice shown and nothing chosen, the commit writes no guessed record', () => {
  beforeEach(() => {
    router.setCachedRows([]);
    router.setLiveResponse(melbourneAuResponse(), 'Melbourne');
    router.setCreateCityResult({
      id: 5002,
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

  it('committing with the two-option Melbourne choice shown and nothing selected creates NO city row', async () => {
    renderAddPlaceFlow({ tripCountries: [{ country_code: 'AU', name: 'Australia' }] });
    const user = await typeQuery('Melbourne');

    // Guard: the choice really is on screen (both granularities of the one
    // real place — this is what Slice 2's ε-collapse will later remove).
    expect(
      await screen.findByTestId('add-place-live-option-relation-4246124', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('add-place-live-option-relation-2404870')).toBeInTheDocument();

    // Attempt the commit without picking. Whether the control is disabled or
    // simply inert is UX's call (D6); the BEHAVIOUR is that nothing is written.
    await user.click(screen.getByTestId('add-place-commit'));
    await waitMs(SETTLE_MS);

    expect(router.writePaths()).toEqual([]);
  });

  it('the "none of these — add as new" escape row IS an explicit selection, and creates a plain-name pending row', async () => {
    renderAddPlaceFlow({ tripCountries: [{ country_code: 'AU', name: 'Australia' }] });
    const user = await typeQuery('Melbourne');

    await screen.findByTestId('add-place-live-option-relation-4246124', undefined, {
      timeout: 3000,
    });

    // The escape hatch is always present (§5 P4 / §7 S2) and is itself a
    // selection — so the guard can never trap the user.
    await user.click(screen.getByTestId('add-place-none-of-these'));
    await user.click(await screen.findByTestId('add-place-commit'));

    await waitFor(() => expect(router.countCalls('/api/cities', 'POST')).toBe(1));
    const body = router.bodiesFor('/api/cities')[0] as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'Melbourne', country_code: 'AU' });
    // A plain-name create carries no candidate identity — the backend GE-19
    // lifecycle re-derives it (§3 P3, third branch).
    expect(body.osm_id).toBeUndefined();
  });

  it('picking one of the two granularities carries its identity and its AU-VIC region', async () => {
    renderAddPlaceFlow({ tripCountries: [{ country_code: 'AU', name: 'Australia' }] });
    const user = await typeQuery('Melbourne');

    await user.click(
      await screen.findByTestId('add-place-live-option-relation-4246124', undefined, {
        timeout: 3000,
      }),
    );
    await user.click(await screen.findByTestId('add-place-commit'));

    await waitFor(() => expect(router.countCalls('/api/cities', 'POST')).toBe(1));
    expect(router.bodiesFor('/api/cities')[0]).toMatchObject({
      name: 'Melbourne',
      country_code: 'AU',
      osm_type: 'relation',
      osm_id: 4246124,
      // AU-VIC mapped to its seeded region row — the §6a path (A) outcome:
      // Melbourne ends WITH its region, never "Australia (no state set)".
      region_id: 301,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 12 (D7/N3 held-selection invalidation).
//
// D7 opens a window that does not exist on `main`: pick → hold → later Add. If
// a held LIVE selection survives an edit to an identity-bearing field, the
// commit sends that candidate's osm_id under the NEW country, and
// `createOrReuseCarriedCity` stores the row under the CALLER-supplied
// countryCode (`cityIdentityService.ts:210,223-224` — the canonical /lookup
// supplies name/coords/osm only). That files a Wales place under France.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 12 — editing an identity-bearing field invalidates a held live selection', () => {
  beforeEach(() => {
    router.setCachedRows([]);
    router.setLiveResponse(newportGbResponse(), 'Newport');
  });

  it('changing Country after a live pick clears the held selection and re-shows the surface', async () => {
    renderAddPlaceFlow({
      tripCountries: [
        { country_code: 'GB', name: 'United Kingdom' },
        { country_code: 'FR', name: 'France' },
      ],
    });
    const user = await typeQuery('Newport');

    await user.click(
      await screen.findByTestId('add-place-live-option-node-26700977', undefined, {
        timeout: 3000,
      }),
    );
    // Anti-vacuous guard: the pick must have produced a HELD selection (not a
    // commit) for "invalidating the hold" to mean anything at all.
    expect(router.writePaths()).toEqual([]);

    await user.selectOptions(screen.getByTestId('add-place-country-select'), 'FR');

    // The held selection is gone — the surface is showing again rather than a
    // populated form still carrying a Wales osm_id.
    await waitFor(() =>
      expect(screen.getByTestId('add-place-live-option-node-26700977')).toBeInTheDocument(),
    );
  });

  it('a commit after the Country edit never sends the stale Wales osm_id under FR', async () => {
    renderAddPlaceFlow({
      tripCountries: [
        { country_code: 'GB', name: 'United Kingdom' },
        { country_code: 'FR', name: 'France' },
      ],
    });
    const user = await typeQuery('Newport');

    await user.click(
      await screen.findByTestId('add-place-live-option-node-26700977', undefined, {
        timeout: 3000,
      }),
    );
    expect(router.writePaths()).toEqual([]);

    await user.selectOptions(screen.getByTestId('add-place-country-select'), 'FR');
    await user.click(screen.getByTestId('add-place-commit'));
    await waitMs(SETTLE_MS);

    // Whether the commit is blocked outright (no selection held) or produces a
    // plain-name FR create is a UX affordance call — what may NEVER happen is
    // the carried Wales identity riding under the new country.
    for (const body of router.bodiesFor('/api/cities') as Record<string, unknown>[]) {
      expect(body.osm_id).not.toBe(26700977);
    }
  });

  it('re-editing the city Name after a live pick also invalidates the held selection', async () => {
    renderAddPlaceFlow({ tripCountries: [{ country_code: 'GB', name: 'United Kingdom' }] });
    const user = await typeQuery('Newport');

    await user.click(
      await screen.findByTestId('add-place-live-option-node-26700977', undefined, {
        timeout: 3000,
      }),
    );
    expect(router.writePaths()).toEqual([]);

    const nameInput = await screen.findByTestId('add-place-city-name-input');
    await user.type(nameInput, 'shire');
    await user.click(screen.getByTestId('add-place-commit'));
    await waitMs(SETTLE_MS);

    for (const body of router.bodiesFor('/api/cities') as Record<string, unknown>[]) {
      expect(body.osm_id).not.toBe(26700977);
    }
  });
});

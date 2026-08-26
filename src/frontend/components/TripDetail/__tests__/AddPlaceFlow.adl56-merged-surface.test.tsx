/**
 * ADL-56 / GE-21 (BRD v3.22) — Slice 1 RED acceptance bar, part 1 of 3:
 * the merged cached ∪ live surface.
 *
 * Covers ADL-56 §10 tests **1** (D1/D8/P1 — the B1 regression test), **4**
 * (D3/P2 — identity dedup, AddPlaceFlow half), **6** (D5 — the message state
 * machine) and **NB-1** (the in-flight cue adopted by the PO 2026-08-26 and
 * written into GE-21's success criteria after §10 was authored).
 *
 * ATDD-first (OP-35): authored BEFORE any implementer is briefed. These are the
 * executable definition of done, not a description of what exists.
 *
 * ── HOW THE RED BAR IS CARRIED ───────────────────────────────────────────────
 * Each block below is committed `describe.skip` with a RED-BAR marker, the same
 * convention the GE-19/ADL-55 red bar used (`geocoding.ge19-lifecycle.test.ts`,
 * `cityIdentity.ge19-reopen-reuse.test.ts`, `geocode-queue.ge19.test.ts`): the
 * suite is committed with CI green, and the implementer un-skips each block as
 * they green it — so a weakened assertion shows up in that diff rather than
 * hiding behind a test nobody ran. Every block was run UN-skipped before commit
 * and its observed failure recorded in
 * `jobs/qa/tech/20260826-ADL56-slice1-red-bar.md`.
 *
 * ── TESTIDS THIS SUITE PRESCRIBES (part of the Slice-1 contract) ─────────────
 * D5's message-state ROUTING is behavioural and pinned (§10); the strings are
 * UX's (D6). Asserting on copy would pin the wrong half, so the states are
 * pinned by testid instead:
 *   • `add-place-state-cache-empty`   — S2, cached search returned nothing
 *   • `add-place-state-live-empty`    — S4, live answered `ok` with zero candidates
 *   • `add-place-state-live-failed`   — S5, live answered `error`/`disabled`
 *   • `add-place-live-inflight`       — NB-1, a live lookup is in flight
 *   • `add-place-live-option-<osm_type>-<osm_id>` — a LIVE candidate row in the
 *     merged surface (cached rows keep their existing
 *     `city-search-result-<id>` testid, unchanged)
 *   • `add-place-commit`              — the single explicit commit control
 * UX owns every word inside these elements; the tests assert only which state
 * is rendered, never what it says.
 *
 * ── MOCK FIDELITY (QUAL-22, ADL-56 §10) ──────────────────────────────────────
 * The double sits on `utils/apiClient`, and the `GET /api/geocode` bodies are
 * the REAL route output for REAL captured Nominatim responses — see
 * `fixtures/adl56Geocode.ts` (provenance) and `fixtures/adl56Harness.tsx` (why
 * this boundary and not `hooks/useCities`).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPatch, apiPost } from '../../../utils/apiClient';
import {
  liveDisabledResponse,
  liveEmptyResponse,
  liveFailedResponse,
  newportUsResponse,
} from './fixtures/adl56Geocode';
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
    country_code: 'US',
    country_name: null,
    region_id: 101,
    region_iso: 'US-OR',
    latitude: null,
    longitude: null,
    geocode_status: 'pending',
  });
});

async function typeQuery(text: string) {
  const user = userEvent.setup({ delay: null });
  const input = screen.getByPlaceholderText('Search city name…');
  await user.type(input, text);
  return user;
}

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 1. The B1 regression test.
//
// This is the test that FAILS against R1's cached-first gate and PASSES under
// R2's invisible autofire. It is the whole reason GE-21 was held at PROPOSED
// through two fresh-eyes rounds, so it is asserted at both layers: the live
// call is MADE (egress), and the alternatives are SHOWN (surface).
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 1 — one exact cached match does NOT suppress the live lookup (B1)', () => {
  beforeEach(() => {
    // Exactly ONE cached row for "Newport" — "Newport, Oregon". This is the
    // precise cache state R1's removed gate called a "confident single exact
    // match", and the state the PO hit in the 2026-08-11 UAT round.
    router.setCachedRows([CACHED_NEWPORT_OREGON]);
    router.setLiveResponse(newportUsResponse(), 'Newport');
  });

  it('fires the live lookup for "Newport" even though exactly one exact cached row exists', async () => {
    renderAddPlaceFlow();
    await typeQuery('Newport');

    // The B1 assertion, stated as the inverse of the removed cached-first gate:
    // a live call IS made. Nothing about the cache's answer may suppress it.
    await waitFor(() => expect(router.hasLiveCallFor('Newport')).toBe(true), { timeout: 3000 });
  });

  it('shows the live alternatives alongside the cached Oregon row — the cache does not hide them', async () => {
    renderAddPlaceFlow();
    await typeQuery('Newport');

    // The cached row renders (instantly — it must not wait on the live call).
    expect(await screen.findByTestId('city-search-result-4001')).toBeInTheDocument();

    // …and the live alternatives the cache knows nothing about are folded into
    // the SAME surface. Rhode Island is the alternative from the PO's own
    // report; Kentucky and Vermont prove it is the whole eligible set, not one
    // token extra row.
    expect(
      await screen.findByTestId('add-place-live-option-relation-191230', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('add-place-live-option-relation-130502')).toBeInTheDocument();
    expect(screen.getByTestId('add-place-live-option-relation-199080')).toBeInTheDocument();
  });

  it('binds nothing automatically — no write crosses the wire before an explicit selection', async () => {
    renderAddPlaceFlow();
    await typeQuery('Newport');

    await waitFor(() => expect(router.hasLiveCallFor('Newport')).toBe(true), { timeout: 3000 });
    await waitMs(SETTLE_MS);

    // GE-21: "binds none automatically". Neither a city nor a place is created
    // by merely surfacing the choice.
    expect(router.writePaths()).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 4 (AddPlaceFlow half).
// D3/P2: a live candidate that IS a shown cached row appears ONCE, as the
// cached row, and picking it reuses by `id` without minting a second city.
//
// ANTI-VACUOUS GUARD: "appears once" is trivially true today, because zero
// live candidates appear at all. Every test below therefore first asserts that
// a NON-duplicate live candidate IS rendered — so the dedup assertion can only
// pass once the merge actually exists.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 4 — identity dedup: a live twin of a cached row is shown once (AddPlaceFlow)', () => {
  beforeEach(() => {
    router.setCachedRows([CACHED_NEWPORT_OREGON]);
    router.setLiveResponse(newportUsResponse(), 'Newport');
  });

  it('collapses the live Oregon candidate onto the cached Oregon row by (osm_type, osm_id)', async () => {
    renderAddPlaceFlow();
    await typeQuery('Newport');

    // Guard: the merge is live (a non-duplicate candidate is on screen).
    expect(
      await screen.findByTestId('add-place-live-option-relation-191230', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();

    // The cached row is present exactly once…
    expect(screen.getAllByTestId('city-search-result-4001')).toHaveLength(1);
    // …and its live twin — relation 186468, the SAME (osm_type, osm_id) —
    // is NOT rendered as a second, separate option.
    expect(screen.queryByTestId('add-place-live-option-relation-186468')).not.toBeInTheDocument();
  });

  it('picking the deduped row attaches by city_id and creates no new city row', async () => {
    const user = userEvent.setup({ delay: null });
    renderAddPlaceFlow();
    await typeQuery('Newport');

    expect(
      await screen.findByTestId('add-place-live-option-relation-191230', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('city-search-result-4001'));
    await user.click(await screen.findByTestId('add-place-commit'));

    await waitFor(() => expect(router.countCalls('/api/trips/1/places', 'POST')).toBe(1));
    // Reuse-by-id (§3/§5 P3): the cached row's own id, and NO POST /api/cities.
    expect(router.bodiesFor('/api/trips/1/places')[0]).toMatchObject({ city_id: 4001 });
    expect(router.countCalls('/api/cities', 'POST')).toBe(0);
  });

  it('a cached row carrying NO osm ref is still shown as a reuse target (the §2 H1 population)', async () => {
    // H1: legacy/pending/seeded rows carry NULL osm_id, so identity dedup
    // cannot collapse them. The day-one disposition (§5) is "accept + show
    // both" — what must NOT happen is the row disappearing from the surface.
    router.setCachedRows([
      CACHED_NEWPORT_OREGON,
      {
        id: 4003,
        name: 'Newport',
        country_code: 'US',
        country_name: null,
        region_id: null,
        region_iso: null,
        region_name: null,
        latitude: null,
        longitude: null,
        geocode_status: 'pending',
      },
    ]);
    renderAddPlaceFlow();
    await typeQuery('Newport');

    expect(
      await screen.findByTestId('add-place-live-option-relation-191230', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('city-search-result-4003')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — ADL-56 §10 test 6 (D5, BUG-73).
// Three states that are ONE state today: on `main` every one of these renders
// the identical "No matches in United States." line, because that line reflects
// the CACHED search only and no live call is made from this step at all.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] ADL-56 test 6 — cache-empty (S2), live-empty (S4) and live-failed (S5) are individually distinguishable', () => {
  it('S2 — an empty catalogue search renders the cache-empty state, scoped to SAVED places, with the live merge still running', async () => {
    router.setCachedRows([]);
    router.setLiveResponse(newportUsResponse(), 'Newport');
    renderAddPlaceFlow();
    await typeQuery('Newport');

    const state = await screen.findByTestId('add-place-state-cache-empty', undefined, {
      timeout: 3000,
    });
    // The behavioural half of S2 that BUG-73 is about: the message may not
    // claim the place is absent, only that no SAVED place matched. UX owns the
    // wording; what is pinned is that it is scoped to the catalogue.
    expect(state).toHaveTextContent(/saved/i);
    // …and the escape hatch is always offered (§7 S2).
    expect(screen.getByText(/\+ Add new: "Newport"/)).toBeInTheDocument();
    // S2 is NOT S4: the live lookup found candidates, so the live-empty state
    // must not also be claimed.
    expect(screen.queryByTestId('add-place-state-live-empty')).not.toBeInTheDocument();
  });

  it('S4 — the live lookup answered `ok` with zero candidates: a state of its own, distinct from S2', async () => {
    router.setCachedRows([]);
    router.setLiveResponse(liveEmptyResponse(), 'Zzyzx');
    renderAddPlaceFlow();
    await typeQuery('Zzyzx');

    expect(
      await screen.findByTestId('add-place-state-live-empty', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    // "We looked and found nothing" must never be rendered as "lookup
    // unavailable" (S5) — those lead the user to different next actions.
    expect(screen.queryByTestId('add-place-state-live-failed')).not.toBeInTheDocument();
    // The plain-name create path stays reachable (§7 S4).
    expect(screen.getByText(/\+ Add new: "Zzyzx"/)).toBeInTheDocument();
  });

  it('S5 — the upstream geocoder failed (`status: "error"`): a third, distinct state', async () => {
    router.setCachedRows([]);
    router.setLiveResponse(liveFailedResponse(), 'Newport');
    renderAddPlaceFlow();
    await typeQuery('Newport');

    expect(
      await screen.findByTestId('add-place-state-live-failed', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('add-place-state-live-empty')).not.toBeInTheDocument();
  });

  it('S5 — `status: "disabled"` routes to the same live-failed state, never to live-empty', async () => {
    router.setCachedRows([]);
    router.setLiveResponse(liveDisabledResponse(), 'Newport');
    renderAddPlaceFlow();
    await typeQuery('Newport');

    expect(
      await screen.findByTestId('add-place-state-live-failed', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('add-place-state-live-empty')).not.toBeInTheDocument();
  });

  it('S1 — a cache HIT does not suppress the live states: the surface still reports the live outcome', async () => {
    // The B1 correction to §7: because the live call now always fires, its
    // outcome layers ON TOP of a cache hit rather than being skipped. A cached
    // row plus a failed live lookup must still tell the user the lookup failed.
    router.setCachedRows([CACHED_NEWPORT_OREGON]);
    router.setLiveResponse(liveFailedResponse(), 'Newport');
    renderAddPlaceFlow();
    await typeQuery('Newport');

    expect(await screen.findByTestId('city-search-result-4001')).toBeInTheDocument();
    expect(
      await screen.findByTestId('add-place-state-live-failed', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RED-BAR (Slice 1) — NB-1, the in-flight cue.
//
// NOT one of ADL-56 §10's 13 tests: the PO adopted the cue on 2026-08-26, after
// §10 was written, and it is now a GE-21 success criterion ("an in-flight live
// lookup is visibly indicated without blocking interaction").
//
// Why it is pinned here rather than left to UAT: §10's rule is that pure
// presentation is ATDD-no while behavioural state ROUTING is pinned. The cue is
// routing, not decoration — it is bound to a real in-flight state and exists to
// close the residual race where a fast click during live latency binds the
// cached row a moment before its alternatives arrive. Its two load-bearing
// properties (present iff in flight; does not block the surface underneath) are
// both falsifiable and both invisible to a copy review.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S1][RED-BAR] GE-21 NB-1 — an in-flight live lookup is visibly indicated, without blocking interaction', () => {
  beforeEach(() => {
    router.setCachedRows([CACHED_NEWPORT_OREGON]);
    router.deferLiveFor('Newport');
  });

  it('shows the cue while the live lookup is in flight and removes it once the lookup settles', async () => {
    renderAddPlaceFlow();
    await typeQuery('Newport');

    // In flight: the cue is present.
    expect(
      await screen.findByTestId('add-place-live-inflight', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();

    // Settled: the cue is gone and the alternatives have arrived.
    router.deferredFor('Newport').resolve(newportUsResponse());
    expect(
      await screen.findByTestId('add-place-live-option-relation-191230', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId('add-place-live-inflight')).not.toBeInTheDocument(),
    );
  });

  it('does not block the surface underneath — the cached row is still selectable while the lookup is in flight', async () => {
    const user = userEvent.setup({ delay: null });
    renderAddPlaceFlow();
    await typeQuery('Newport');

    await screen.findByTestId('add-place-live-inflight', undefined, { timeout: 3000 });

    // The search input stays usable…
    expect(screen.getByPlaceholderText('Search city name…')).toBeEnabled();
    // …and the cached row is still selectable (this is the race NB-1 WARNS
    // about — the cue must not become a modal block that forbids it).
    await user.click(screen.getByTestId('city-search-result-4001'));
    expect(await screen.findByTestId('add-place-commit')).toBeEnabled();
  });

  it('the cue also settles when the live lookup FAILS — it is bound to in-flight, not to success', async () => {
    renderAddPlaceFlow();
    await typeQuery('Newport');

    await screen.findByTestId('add-place-live-inflight', undefined, { timeout: 3000 });
    router.deferredFor('Newport').resolve(liveFailedResponse());

    expect(
      await screen.findByTestId('add-place-state-live-failed', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId('add-place-live-inflight')).not.toBeInTheDocument(),
    );
  });
});

// A single live guard that must survive the Slice-1 build unchanged: the
// existing GE-20 country-filter contract on the search step. Not a red bar —
// it is GREEN on main and is here because the D8 merge rewires exactly this
// call site, and "the live merge quietly dropped the trip-country filter" is
// the regression this wave is most likely to produce (GE-20 F2's "cannot be
// bypassed from within the picker" guarantee).
describe('[S1][GUARD] the merged surface keeps the GE-20 country filter on the catalogue search', () => {
  it('sends the trip country_codes with GET /api/cities', async () => {
    router.setCachedRows([]);
    router.setLiveResponse(newportUsResponse(), 'Newport');
    renderAddPlaceFlow({
      tripCountries: [
        { country_code: 'US', name: 'United States' },
        { country_code: 'GB', name: 'United Kingdom' },
      ],
    });
    await typeQuery('Newport');

    await waitFor(() =>
      expect(router.calls.some((c) => c.path.startsWith('/api/cities?q=Newport'))).toBe(true),
    );
    const citiesCall = router.calls.find((c) => c.path.startsWith('/api/cities?q=Newport'));
    expect(citiesCall?.path).toContain('country_codes=US%2CGB');
  });
});

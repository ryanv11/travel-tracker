/**
 * ADL-56 / GE-21 Slice 1 — the shared test harness for the red acceptance bar.
 *
 * ── WHY THE MOCK BOUNDARY IS `apiClient`, NOT `useCities` ────────────────────
 * Every pre-existing AddPlaceFlow suite mocks the whole `hooks/useCities`
 * module — `lookupCityCountry`, `useCitySearch`, `useCreateCity`. That is fine
 * for pinning what the flow does with a candidate set, but it cannot express
 * ANY of the ADL-56 Slice-1 contracts, for three reasons:
 *
 *   1. **D8/B1 is a claim about network calls.** "The live lookup fires on the
 *      settled query regardless of a single exact cached match" (test 1/10) and
 *      "at most one call per distinct settled query" (test 10) are assertions
 *      about `GET /api/geocode` egress. A stub of `lookupCityCountry` can only
 *      report that the stub was called — and today it is called from a
 *      completely different trigger (the "+ Add new" click), so the assertion
 *      would be measuring the wrong event.
 *   2. **The implementation shape is deliberately not pinned.** ADL-56 §3b(6)
 *      *recommends* lifting the live lookup out of the imperative
 *      `lookupCityCountry(...).then()` into a React-Query hook keyed by
 *      `(settledQuery, countrySet)`. A test that stubs `lookupCityCountry`
 *      hard-codes today's call shape and would go red on the recommended
 *      refactor for a reason that has nothing to do with the behaviour. Mocking
 *      `apiGet` survives either implementation: both cross this boundary.
 *   3. **Mock fidelity (QUAL-22, ADL-56 §10).** `apiGet('/api/geocode?…')`
 *      resolves the REAL `{status, candidates, truncated, country_code,
 *      region_iso}` body — see `adl56Geocode.ts`, whose objects are derived by
 *      replaying real captured Nominatim responses through the real
 *      `parseCandidate`/`isAcceptedSettlement`/route serializer. Stubbing
 *      `lookupCityCountry` would instead return that function's own already-
 *      digested `{countryCode, regionIso, candidates, failed, truncated}` —
 *      one layer of the real contract (the `status` discriminator that D5's S4
 *      vs S5 routing depends on) erased by the double.
 *
 * So: React Query is REAL, `useCitySearch` is REAL, the 300ms debounce is REAL,
 * `lookupCityCountry`'s retry/`status`-to-`failed` mapping is REAL. Only the
 * HTTP boundary is doubled.
 *
 * ── WHAT THE ROUTER SERVES ───────────────────────────────────────────────────
 *   GET  /api/admin/countries                  → `countriesFixture`
 *   GET  /api/admin/countries/:cc/regions      → `regionsFixture[cc]`
 *   GET  /api/cities?q=…&country_codes=…       → the configured cached rows
 *   GET  /api/geocode?q=…&country_codes=…      → the configured live response
 *   GET  /api/cities/:id/carry-forward         → []
 *   POST /api/cities                           → the configured create result
 *   POST /api/trips/:id/places                 → { id, warnings: [] }
 *   PATCH /api/trips/:id/places/:pid           → { id }
 *
 * Anything else throws, loudly — an unrouted call is a test-authoring bug, not
 * a silent empty array (the failure mode that makes a suite pass vacuously).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';
import type { City, Country, Region } from '../../../../types/api';
import { AddPlaceFlow } from '../../AddPlaceFlow';
import { ChangeCityModal } from '../../ChangeCityModal';
import type { LiveGeocodeResponse } from './adl56Geocode';

// ─────────────────────────────────────────────────────────────────────────────
// Reference data
// ─────────────────────────────────────────────────────────────────────────────

export const US_COUNTRY: Country = {
  country_code: 'US',
  name: 'United States',
  region_tier_enabled: true,
  region_tier_label: 'State',
};

export const GB_COUNTRY: Country = {
  country_code: 'GB',
  name: 'United Kingdom',
  region_tier_enabled: true,
  region_tier_label: 'Region',
};

export const AU_COUNTRY: Country = {
  country_code: 'AU',
  name: 'Australia',
  region_tier_enabled: true,
  region_tier_label: 'State',
};

export const FR_COUNTRY: Country = {
  country_code: 'FR',
  name: 'France',
  region_tier_enabled: false,
  region_tier_label: 'Region',
};

function region(id: number, countryCode: string, name: string, iso: string): Region {
  return { id, country_code: countryCode, name, iso_3166_2: iso, created_at: '', updated_at: '' };
}

export const REGIONS_BY_COUNTRY: Record<string, Region[]> = {
  US: [
    region(101, 'US', 'Oregon', 'US-OR'),
    region(102, 'US', 'Rhode Island', 'US-RI'),
    region(103, 'US', 'Kentucky', 'US-KY'),
    region(104, 'US', 'Vermont', 'US-VT'),
  ],
  GB: [region(201, 'GB', 'England', 'GB-ENG'), region(202, 'GB', 'Wales', 'GB-WLS')],
  AU: [region(301, 'AU', 'Victoria', 'AU-VIC'), region(302, 'AU', 'New South Wales', 'AU-NSW')],
  FR: [],
};

/** The single cached catalogue row for the B1 case: "Newport, Oregon".
 *
 *  `osm_type`/`osm_id` are the ONE additive field ADL-56 §9/D3-P2 adds to the
 *  `GET /api/cities` search projection. They are present here because the
 *  Slice-1 contract says they must be — a cached row the frontend can match to
 *  a live candidate BY IDENTITY rather than by fragile name text. The backend
 *  half of that same contract is pinned in
 *  `src/backend/routes/__tests__/cities.adl56-search-osm-identity.test.ts`. */
export const CACHED_NEWPORT_OREGON: City & { osm_type?: string | null; osm_id?: number | null } = {
  id: 4001,
  name: 'Newport',
  country_code: 'US',
  country_name: null,
  region_id: 101,
  region_iso: 'US-OR',
  region_name: 'Oregon',
  latitude: 44.636755,
  longitude: -124.053442,
  geocode_status: 'resolved',
  osm_type: 'relation',
  osm_id: 186468,
};

/** A cached row that carries NO osm ref — the ADL-56 §2 H1 population
 *  (legacy / pending / seeded). Identity-dedup cannot collapse it against a
 *  live twin; the surface must still show it as a reuse target. */
export const CACHED_NEWPORT_WALES_NO_OSM: City & {
  osm_type?: string | null;
  osm_id?: number | null;
} = {
  id: 4002,
  name: 'Newport',
  country_code: 'GB',
  country_name: null,
  region_id: 202,
  region_iso: 'GB-WLS',
  region_name: 'Wales',
  latitude: null,
  longitude: null,
  geocode_status: 'pending',
  osm_type: null,
  osm_id: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// The router
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordedCall {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: unknown;
}

/** A live response the test releases by hand — for the D8 staleness (test 11)
 *  and NB-1 in-flight-cue (test 14) cases, where "still in flight" is the state
 *  under test. */
export interface DeferredLive {
  resolve: (response: LiveGeocodeResponse) => void;
  reject: (err: Error) => void;
}

export class ApiRouter {
  /** Every call that crossed the HTTP boundary, in order. Ordering assertions
   *  (ADL-56 §10 test 8: `createCity` → `addPlace` *in that order*) read this
   *  rather than two independent call counts, which would pass on the wrong
   *  order. */
  readonly calls: RecordedCall[] = [];

  private cachedRows: City[] = [];
  private liveByQuery = new Map<string, LiveGeocodeResponse>();
  private liveDefault: LiveGeocodeResponse | null = null;
  private deferred = new Map<string, DeferredLive>();
  private deferQueries = new Set<string>();
  private createCityResult: City | null = null;

  /** Rows `GET /api/cities` returns for any query (the catalogue). */
  setCachedRows(rows: City[]): this {
    this.cachedRows = rows;
    return this;
  }

  /** The `GET /api/geocode` body for a given `q`, or for every `q` when
   *  `query` is omitted. */
  setLiveResponse(response: LiveGeocodeResponse, query?: string): this {
    if (query === undefined) this.liveDefault = response;
    else this.liveByQuery.set(query.toLowerCase(), response);
    return this;
  }

  /** Hold the live call for `query` open until the test releases it. */
  deferLiveFor(query: string): this {
    this.deferQueries.add(query.toLowerCase());
    return this;
  }

  /** The controller for a deferred live call, once the flow has actually made
   *  it. Throws if it hasn't — "the call never happened" must not silently read
   *  as "the response never arrived". */
  deferredFor(query: string): DeferredLive {
    const d = this.deferred.get(query.toLowerCase());
    if (!d) {
      throw new Error(
        `[ADL-56 harness] No in-flight GET /api/geocode for q="${query}". Calls so far: ${JSON.stringify(this.calls.map((c) => `${c.method} ${c.path}`))}`,
      );
    }
    return d;
  }

  /** True once a live lookup for `query` has been issued. */
  hasLiveCallFor(query: string): boolean {
    return this.geocodeQueries().includes(query.toLowerCase());
  }

  /** The `q` of every `GET /api/geocode` issued, in order (duplicates kept —
   *  test 10's coalescing assertion counts them). */
  geocodeQueries(): string[] {
    return this.calls
      .filter((c) => c.method === 'GET' && c.path.startsWith('/api/geocode'))
      .map((c) => (new URLSearchParams(c.path.split('?')[1] ?? '').get('q') ?? '').toLowerCase());
  }

  /** Paths of the write calls, in order — the ordering oracle for test 8. */
  writePaths(): string[] {
    return this.calls.filter((c) => c.method !== 'GET').map((c) => c.path);
  }

  /** Bodies posted to a given path, in order. */
  bodiesFor(path: string): unknown[] {
    return this.calls.filter((c) => c.path === path).map((c) => c.body);
  }

  countCalls(pathPrefix: string, method?: RecordedCall['method']): number {
    return this.calls.filter(
      (c) => c.path.startsWith(pathPrefix) && (method === undefined || c.method === method),
    ).length;
  }

  setCreateCityResult(city: City): this {
    this.createCityResult = city;
    return this;
  }

  handleGet = async <T,>(path: string): Promise<T> => {
    this.calls.push({ method: 'GET', path });

    if (path.startsWith('/api/admin/countries/')) {
      const cc = path.split('/')[4];
      return (REGIONS_BY_COUNTRY[cc] ?? []) as T;
    }
    if (path.startsWith('/api/admin/countries')) {
      return [US_COUNTRY, GB_COUNTRY, AU_COUNTRY, FR_COUNTRY] as T;
    }
    if (path.startsWith('/api/cities') && path.includes('carry-forward')) {
      return [] as T;
    }
    if (path.startsWith('/api/cities?')) {
      return this.cachedRows as T;
    }
    if (path.startsWith('/api/geocode')) {
      const q = (new URLSearchParams(path.split('?')[1] ?? '').get('q') ?? '').toLowerCase();
      if (this.deferQueries.has(q)) {
        return new Promise<T>((resolve, reject) => {
          this.deferred.set(q, {
            resolve: (r) => resolve(r as T),
            reject,
          });
        });
      }
      const body = this.liveByQuery.get(q) ?? this.liveDefault;
      if (!body) {
        throw new Error(`[ADL-56 harness] No live geocode response configured for q="${q}"`);
      }
      return body as T;
    }
    throw new Error(`[ADL-56 harness] Unrouted GET ${path}`);
  };

  handlePost = async <T,>(path: string, body: unknown): Promise<T> => {
    this.calls.push({ method: 'POST', path, body });
    if (path === '/api/cities') {
      if (!this.createCityResult) {
        throw new Error('[ADL-56 harness] POST /api/cities called with no createCityResult set');
      }
      return this.createCityResult as T;
    }
    if (/^\/api\/trips\/\d+\/places$/.test(path)) {
      return { id: 9001, warnings: [] } as T;
    }
    throw new Error(`[ADL-56 harness] Unrouted POST ${path}`);
  };

  handlePatch = async <T,>(path: string, body: unknown): Promise<T> => {
    this.calls.push({ method: 'PATCH', path, body });
    if (/^\/api\/trips\/\d+\/places\/\d+$/.test(path)) {
      return { id: 9001 } as T;
    }
    throw new Error(`[ADL-56 harness] Unrouted PATCH ${path}`);
  };
}

/**
 * Wires a fresh router into the already-`vi.mock`ed apiClient functions. Each
 * suite still declares its own `vi.mock('../../../utils/apiClient', …)` (the
 * factory is hoisted, so it cannot live here) and passes the mocked functions
 * in.
 */
export function installRouter(mocks: {
  apiGet: unknown;
  apiPost: unknown;
  apiPatch?: unknown;
}): ApiRouter {
  const router = new ApiRouter();
  vi.mocked(mocks.apiGet as (path: string) => Promise<unknown>).mockImplementation(
    router.handleGet as (path: string) => Promise<unknown>,
  );
  vi.mocked(mocks.apiPost as (path: string, body: unknown) => Promise<unknown>).mockImplementation(
    router.handlePost as (path: string, body: unknown) => Promise<unknown>,
  );
  if (mocks.apiPatch) {
    vi.mocked(
      mocks.apiPatch as (path: string, body: unknown) => Promise<unknown>,
    ).mockImplementation(router.handlePatch as (path: string, body: unknown) => Promise<unknown>);
  }
  return router;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

export function renderWithQueryClient(ui: ReactElement) {
  return render(ui, { wrapper: makeWrapper() });
}

export interface RenderAddPlaceOptions {
  tripCountries?: { country_code: string; name: string }[];
  isFirstPlace?: boolean;
  onClose?: () => void;
}

export function renderAddPlaceFlow(options: RenderAddPlaceOptions = {}) {
  const {
    tripCountries = [{ country_code: 'US', name: 'United States' }],
    isFirstPlace = false,
    onClose = vi.fn(),
  } = options;
  return renderWithQueryClient(
    <AddPlaceFlow
      tripId={1}
      onClose={onClose}
      tripStartDate="2026-01-01"
      tripEndDate="2026-01-10"
      isFirstPlace={isFirstPlace}
      tripCountries={tripCountries}
      onManageCountries={vi.fn()}
    />,
  );
}

export function renderChangeCityModal(options: { onClose?: () => void } = {}) {
  const { onClose = vi.fn() } = options;
  return renderWithQueryClient(<ChangeCityModal tripId={1} placeId={77} onClose={onClose} />);
}

/** The 300ms `DEBOUNCE_MS` both surfaces use, plus headroom — tests wait this
 *  long when they need the debounced query to have settled. Kept as one
 *  constant so a debounce change updates every suite at once. */
export const SETTLE_MS = 450;

export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

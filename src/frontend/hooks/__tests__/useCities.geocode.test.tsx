/**
 * Tests for lookupCityCountry (ADL-46 D7/D14, BUG-73) — the repointed geocode path.
 *
 * Source: src/frontend/hooks/useCities.ts
 *
 * ADL-46 moved this from a direct browser fetch to nominatim.openstreetmap.org
 * (CSP-blocked in production, BUG-55, and unable to carry the required
 * User-Agent header) to GET /api/geocode via apiGet.
 *
 * BUG-73 changed the failure contract: lookupCityCountry still never throws
 * (AddPlaceFlow's manual-entry fallback keeps working with no try/catch
 * required) and now retries a transient failure internally before giving up
 * — see fetchGeocodeResultWithRetry. Critically, a lookup that exhausts its
 * retries is no longer indistinguishable from one that succeeded and found
 * nothing: the resolved value now carries `failed: true` vs `failed: false`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeocodeResult } from '../../types/api';
import { apiGet } from '../../utils/apiClient';
import { lookupCityCountry } from '../useCities';

vi.mock('../../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/apiClient')>();
  return {
    ...actual,
    apiGet: vi.fn(),
  };
});

describe('lookupCityCountry', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
  });

  it('calls GET /api/geocode with the city name as the q param', async () => {
    const result: GeocodeResult = { candidates: [], country_code: null, region_iso: null };
    vi.mocked(apiGet).mockResolvedValue(result);

    await lookupCityCountry('Springfield');

    expect(apiGet).toHaveBeenCalledWith('/api/geocode?q=Springfield');
  });

  it('returns the top candidate country/region and the full candidate list on success', async () => {
    const result: GeocodeResult = {
      candidates: [
        {
          name: 'Springfield',
          display_name: 'Springfield, Illinois, USA',
          country_code: 'us',
          region_iso: 'US-IL',
          latitude: 39.78,
          longitude: -89.65,
        },
      ],
      country_code: 'us',
      region_iso: 'US-IL',
    };
    vi.mocked(apiGet).mockResolvedValue(result);

    const { countryCode, regionIso, candidates, failed } = await lookupCityCountry('Springfield');

    expect(countryCode).toBe('US');
    expect(regionIso).toBe('US-IL');
    expect(candidates).toEqual(result.candidates);
    expect(failed).toBe(false);
  });

  it('surfaces all candidates for the ambiguity (D14) case — multiple regions in one country', async () => {
    const result: GeocodeResult = {
      candidates: [
        {
          name: 'Springfield',
          display_name: 'Springfield, Illinois, USA',
          country_code: 'us',
          region_iso: 'US-IL',
          latitude: 39.78,
          longitude: -89.65,
        },
        {
          name: 'Springfield',
          display_name: 'Springfield, Missouri, USA',
          country_code: 'us',
          region_iso: 'US-MO',
          latitude: 37.2,
          longitude: -93.29,
        },
      ],
      country_code: 'us',
      region_iso: 'US-IL',
    };
    vi.mocked(apiGet).mockResolvedValue(result);

    const { candidates } = await lookupCityCountry('Springfield');

    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((c) => c.region_iso))).toEqual(new Set(['US-IL', 'US-MO']));
  });

  it('returns nulls and failed:true without throwing once retries are exhausted (BUG-73 silent-failure-to-the-caller contract)', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(apiGet).mockRejectedValue(new Error('network error'));

      const promise = lookupCityCountry('Nowhere');
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toEqual({
        countryCode: null,
        regionIso: null,
        candidates: [],
        failed: true,
        truncated: false,
      });
      // 1 initial attempt + 3 retries — proves retry actually ran, not just
      // that the eventual failure is reported.
      expect(apiGet).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('BUG-73: retries a transient failure and succeeds — a mocked endpoint failing twice then succeeding populates country/region with failed:false', async () => {
    vi.useFakeTimers();
    try {
      const result: GeocodeResult = {
        candidates: [
          {
            name: 'Springfield',
            display_name: 'Springfield, Illinois, USA',
            country_code: 'us',
            region_iso: 'US-IL',
            latitude: 39.78,
            longitude: -89.65,
          },
        ],
        country_code: 'us',
        region_iso: 'US-IL',
      };
      vi.mocked(apiGet)
        .mockRejectedValueOnce(new Error('502'))
        .mockRejectedValueOnce(new Error('502'))
        .mockResolvedValueOnce(result);

      const promise = lookupCityCountry('Springfield');
      await vi.runAllTimersAsync();
      const { countryCode, regionIso, candidates, failed } = await promise;

      expect(apiGet).toHaveBeenCalledTimes(3);
      expect(failed).toBe(false);
      expect(countryCode).toBe('US');
      expect(regionIso).toBe('US-IL');
      expect(candidates).toEqual(result.candidates);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns nulls and failed:false when the proxy resolves with no candidates (found-nothing is not a failure)', async () => {
    const result: GeocodeResult = { candidates: [], country_code: null, region_iso: null };
    vi.mocked(apiGet).mockResolvedValue(result);

    const { countryCode, regionIso, candidates, failed } = await lookupCityCountry('Zzznotacity');

    expect(countryCode).toBeNull();
    expect(regionIso).toBeNull();
    expect(candidates).toEqual([]);
    expect(failed).toBe(false);
  });

  // BUG-79 (#379): the backend's `truncated` flag (geocode.ts, nominatim-client.ts)
  // says the raw upstream response may have had more matches than `candidates`
  // shows — must reach the caller unchanged so AddPlaceFlow can avoid
  // presenting a narrowed result as certain.
  it('propagates truncated:true from the proxy response (BUG-79)', async () => {
    const result: GeocodeResult = {
      candidates: [
        {
          name: 'Springfield',
          display_name: 'Springfield, Illinois, USA',
          country_code: 'us',
          region_iso: 'US-IL',
          latitude: 39.78,
          longitude: -89.65,
        },
      ],
      country_code: 'us',
      region_iso: 'US-IL',
      truncated: true,
    };
    vi.mocked(apiGet).mockResolvedValue(result);

    const { truncated } = await lookupCityCountry('Springfield');

    expect(truncated).toBe(true);
  });

  it('defaults truncated to false when the proxy response omits the field (pre-BUG-79 shape)', async () => {
    const result: GeocodeResult = { candidates: [], country_code: null, region_iso: null };
    vi.mocked(apiGet).mockResolvedValue(result);

    const { truncated } = await lookupCityCountry('Zzznotacity');

    expect(truncated).toBe(false);
  });

  it('reports truncated:false on a failed lookup (retries exhausted) — nothing was truncated, nothing was returned', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(apiGet).mockRejectedValue(new Error('network error'));

      const promise = lookupCityCountry('Nowhere');
      await vi.runAllTimersAsync();
      const { truncated } = await promise;

      expect(truncated).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // BUG-74 (ADL-51 §6): the backend now labels an upstream geocoder failure or
  // a disabled geocoder distinctly from a genuine no-match, both previously
  // an indistinguishable candidates:[] at HTTP 200 — this is why BUG-76 was
  // invisible to the user. lookupCityCountry must map both non-'ok' statuses
  // to failed:true so the existing BUG-73 banner surfaces.
  describe('BUG-74: status -> failed mapping', () => {
    it('status:"error" (upstream Nominatim failure) maps to failed:true even though our backend answered 200', async () => {
      const result: GeocodeResult = {
        status: 'error',
        candidates: [],
        country_code: null,
        region_iso: null,
      };
      vi.mocked(apiGet).mockResolvedValue(result);

      const { failed, candidates, countryCode, regionIso } = await lookupCityCountry('Denver');

      expect(failed).toBe(true);
      expect(candidates).toEqual([]);
      expect(countryCode).toBeNull();
      expect(regionIso).toBeNull();
    });

    it('status:"disabled" (GEOCODING_ENABLED=false) maps to failed:true', async () => {
      const result: GeocodeResult = {
        status: 'disabled',
        candidates: [],
        country_code: null,
        region_iso: null,
      };
      vi.mocked(apiGet).mockResolvedValue(result);

      const { failed } = await lookupCityCountry('Denver');

      expect(failed).toBe(true);
    });

    it('status:"ok" with empty candidates stays a genuine no-match — failed:false, no error banner', async () => {
      const result: GeocodeResult = {
        status: 'ok',
        candidates: [],
        country_code: null,
        region_iso: null,
      };
      vi.mocked(apiGet).mockResolvedValue(result);

      const { failed } = await lookupCityCountry('Zzznotacity');

      expect(failed).toBe(false);
    });

    it('an omitted status (pre-BUG-74 response shape) defaults to failed:false — additive field, no regression', async () => {
      const result: GeocodeResult = { candidates: [], country_code: null, region_iso: null };
      vi.mocked(apiGet).mockResolvedValue(result);

      const { failed } = await lookupCityCountry('Springfield');

      expect(failed).toBe(false);
    });
  });
});

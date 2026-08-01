/**
 * Tests for lookupCityCountry (ADL-46 D7/D14) — the repointed geocode path.
 *
 * Source: src/frontend/hooks/useCities.ts
 *
 * ADL-46 moved this from a direct browser fetch to nominatim.openstreetmap.org
 * (CSP-blocked in production, BUG-55, and unable to carry the required
 * User-Agent header) to GET /api/geocode via apiGet. lookupCityCountry keeps
 * its pre-existing fire-and-forget error contract — any failure resolves to
 * nulls/empty rather than throwing — so AddPlaceFlow's manual-entry fallback
 * keeps working.
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

    const { countryCode, regionIso, candidates } = await lookupCityCountry('Springfield');

    expect(countryCode).toBe('US');
    expect(regionIso).toBe('US-IL');
    expect(candidates).toEqual(result.candidates);
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

  it('returns nulls and an empty candidate list without throwing when the proxy call fails (silent-failure contract)', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('network error'));

    await expect(lookupCityCountry('Nowhere')).resolves.toEqual({
      countryCode: null,
      regionIso: null,
      candidates: [],
    });
  });

  it('returns nulls when the proxy resolves with no candidates', async () => {
    const result: GeocodeResult = { candidates: [], country_code: null, region_iso: null };
    vi.mocked(apiGet).mockResolvedValue(result);

    const { countryCode, regionIso, candidates } = await lookupCityCountry('Zzznotacity');

    expect(countryCode).toBeNull();
    expect(regionIso).toBeNull();
    expect(candidates).toEqual([]);
  });
});

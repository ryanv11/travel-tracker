/**
 * Unit tests for formatCitySubtitle (BUG-80, GitHub #388).
 *
 * Covers the four states the brief's success criteria call out explicitly:
 *   1. Regioned city in a region-tier country.
 *   2. Region-tier country, region genuinely not set (joined, region_name null).
 *   3. Non-region-tier country (region_name null or absent — must render unchanged).
 *   4. The "payload never joined `regions`" case (region_name undefined) —
 *      must NOT be conflated with case 2's "no region set" (see the module's
 *      doc comment and City.region_name's doc comment in types/api.ts).
 *
 * Plus the `countryDisplay` override this function added on top of BUG-72's
 * original AddPlaceFlow-local version, which is what lets every saved-place
 * surface reuse one formatter instead of writing a second one (PlaceSection
 * needs the full country name per D-04; AddPlaceFlow's dropdown needs the code).
 *
 * Source: src/frontend/utils/formatCitySubtitle.ts
 */
import { describe, expect, it } from 'vitest';
import type { Country } from '../../types/api.js';
import { formatCitySubtitle } from '../formatCitySubtitle.js';

const usRegionTier: Country = {
  country_code: 'US',
  name: 'United States',
  region_tier_enabled: true,
  region_tier_label: 'State',
};

const gbRegionTier: Country = {
  country_code: 'GB',
  name: 'United Kingdom',
  region_tier_enabled: true,
  region_tier_label: null, // no custom label — falls back to "region"
};

const frNonRegionTier: Country = {
  country_code: 'FR',
  name: 'France',
  region_tier_enabled: false,
  region_tier_label: null,
};

const countries: Country[] = [usRegionTier, gbRegionTier, frNonRegionTier];

describe('formatCitySubtitle', () => {
  it('regioned: renders "region, country" for a region-tier country with a region set', () => {
    const city = { country_code: 'US', region_name: 'Illinois' };
    expect(formatCitySubtitle(city, countries)).toBe('Illinois, US');
  });

  it('region-tier-with-no-region: renders an explicit "(no <label> set)" — distinct from a regioned row', () => {
    const city = { country_code: 'US', region_name: null };
    expect(formatCitySubtitle(city, countries)).toBe('US (no state set)');
  });

  it('region-tier-with-no-region: falls back to the generic label "region" when the country has none', () => {
    const city = { country_code: 'GB', region_name: null };
    expect(formatCitySubtitle(city, countries)).toBe('GB (no region set)');
  });

  it('non-region-tier: renders the country alone, never an empty separator or "undefined"', () => {
    const cityWithNull = { country_code: 'FR', region_name: null };
    const cityWithoutField: { country_code: string; region_name?: string | null } = {
      country_code: 'FR',
    };
    expect(formatCitySubtitle(cityWithNull, countries)).toBe('FR');
    expect(formatCitySubtitle(cityWithoutField, countries)).toBe('FR');
  });

  it('payload-never-joined: region_name undefined on a region-tier country shows the country only, NOT "(no state set)"', () => {
    // The critical case the brief calls out: this response never checked
    // whether a region exists, so it must not claim there isn't one.
    const city: { country_code: string; region_name?: string | null } = { country_code: 'US' };
    expect(formatCitySubtitle(city, countries)).toBe('US');
  });

  it('payload-never-joined vs region-tier-with-no-region: undefined and null must render differently', () => {
    const neverJoined = formatCitySubtitle({ country_code: 'US' }, countries);
    const joinedNoRegion = formatCitySubtitle({ country_code: 'US', region_name: null }, countries);
    expect(neverJoined).not.toBe(joinedNoRegion);
    expect(neverJoined).toBe('US');
    expect(joinedNoRegion).toBe('US (no state set)');
  });

  it('falls back to country-only when the country list has not loaded yet (empty array)', () => {
    const city = { country_code: 'US', region_name: 'Illinois' };
    expect(formatCitySubtitle(city, [])).toBe('US');
  });

  it('countryDisplay override: shows a full country name in place of the code, region logic unaffected', () => {
    const city = { country_code: 'US', region_name: 'Illinois' };
    expect(formatCitySubtitle(city, countries, 'United States')).toBe('Illinois, United States');
  });

  it('countryDisplay override: non-region-tier country renders the override alone', () => {
    const city = { country_code: 'FR', region_name: null };
    expect(formatCitySubtitle(city, countries, 'France')).toBe('France');
  });
});

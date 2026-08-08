/**
 * BUG-81 (BRD GE-16) — `composeCandidateLabels` unit tests.
 *
 * Source: src/frontend/utils/composeCandidateLabel.ts
 *
 * Covers the PO-agreed rule (tracker BUG-81): default "City, State, Country"
 * from structured fields, county added only to rows colliding on
 * (name, state, country), a coordinate discriminator as the rare last
 * resort, and a cleaned `display_name` fallback for candidates with no
 * structured fields at all.
 */
import { describe, expect, it } from 'vitest';
import type { GeocodeCandidate } from '../../types/api';
import { composeCandidateLabels } from '../composeCandidateLabel';

function candidate(overrides: Partial<GeocodeCandidate> = {}): GeocodeCandidate {
  return {
    name: 'Springfield',
    display_name: 'Springfield, Sangamon County, Illinois, 62701, United States',
    country_code: 'US',
    region_iso: 'US-IL',
    latitude: 39.78,
    longitude: -89.65,
    ...overrides,
  };
}

describe('composeCandidateLabels', () => {
  it('composes "City, State, Country" from structured fields for a non-colliding candidate — no county, no postcode', () => {
    const [label] = composeCandidateLabels([
      candidate({ state: 'Illinois', country: 'United States', county: 'Sangamon County' }),
    ]);

    expect(label).toBe('Springfield, Illinois, United States');
  });

  it('adds county to two candidates sharing (name, state, country) — the real Springfield/Delaware-vs-Bucks-County case', () => {
    const [pa1, pa2] = composeCandidateLabels([
      candidate({
        name: 'Springfield',
        state: 'Pennsylvania',
        country: 'United States',
        county: 'Delaware County',
      }),
      candidate({
        name: 'Springfield',
        state: 'Pennsylvania',
        country: 'United States',
        county: 'Bucks County',
      }),
    ]);

    expect(pa1).toBe('Springfield, Delaware County, Pennsylvania, United States');
    expect(pa2).toBe('Springfield, Bucks County, Pennsylvania, United States');
  });

  it('leaves candidates outside the colliding (name, state, country) group unaffected — clean, no county', () => {
    const [pa1, pa2, il] = composeCandidateLabels([
      candidate({
        name: 'Springfield',
        state: 'Pennsylvania',
        country: 'United States',
        county: 'Delaware County',
      }),
      candidate({
        name: 'Springfield',
        state: 'Pennsylvania',
        country: 'United States',
        county: 'Bucks County',
      }),
      candidate({
        name: 'Springfield',
        state: 'Illinois',
        country: 'United States',
        county: 'Sangamon County',
      }),
    ]);

    expect(pa1).toContain('Delaware County');
    expect(pa2).toContain('Bucks County');
    expect(il).toBe('Springfield, Illinois, United States');
  });

  it('renders "City, Country" without an empty comma when state is absent', () => {
    const [label] = composeCandidateLabels([
      candidate({ name: 'Zurich', country: 'Switzerland', state: undefined }),
    ]);

    expect(label).toBe('Zurich, Switzerland');
    expect(label).not.toContain(', ,');
  });

  it('never includes a postcode when structured fields are present', () => {
    const [label] = composeCandidateLabels([
      candidate({
        state: 'Virginia',
        country: 'United States',
        county: 'Fairfax County',
        display_name: 'Springfield, Fairfax County, Virginia, 22150, United States',
      }),
    ]);

    expect(label).not.toMatch(/22150/);
  });

  it('falls back to a cleaned display_name (postcode stripped) when structured fields are entirely absent — legacy/fixture shape', () => {
    const [iow, telford] = composeCandidateLabels([
      candidate({
        name: 'Newport',
        display_name: 'Newport, Isle of Wight, England, PO30 1JU, UK',
        state: undefined,
        country: undefined,
        county: undefined,
      }),
      candidate({
        name: 'Newport',
        display_name: 'Newport, Telford and Wrekin, England, TF10 7AG, UK',
        state: undefined,
        country: undefined,
        county: undefined,
      }),
    ]);

    expect(iow).toBe('Newport, Isle of Wight, England, UK');
    expect(telford).toBe('Newport, Telford and Wrekin, England, UK');
  });

  it('applies a coordinate discriminator as the rare fallback when rows are still identical after adding county', () => {
    const [a, b] = composeCandidateLabels([
      candidate({
        name: 'Springfield',
        state: 'Pennsylvania',
        country: 'United States',
        county: 'Delaware County',
        latitude: 39.93,
        longitude: -75.33,
      }),
      candidate({
        name: 'Springfield',
        state: 'Pennsylvania',
        country: 'United States',
        county: 'Delaware County',
        latitude: 40.1,
        longitude: -75.5,
      }),
    ]);

    expect(a).not.toBe(b);
    expect(a).toContain('39.93');
    expect(b).toContain('40.10');
  });

  it('produces exactly as many labels as candidates given, aligned by index', () => {
    const labels = composeCandidateLabels([
      candidate({ state: 'Illinois', country: 'United States' }),
      candidate({
        name: 'Newport',
        display_name: 'Newport, UK',
        state: undefined,
        country: undefined,
      }),
    ]);

    expect(labels).toHaveLength(2);
  });
});

/**
 * Unit tests for formatCountriesFilterNote (GE-20, BUG-87, ADL-54 D5/Q3).
 *
 * Source: src/frontend/utils/formatCountriesFilterNote.ts
 */
import { describe, expect, it } from 'vitest';
import { formatCountriesFilterNote } from '../formatCountriesFilterNote';

const uk = { country_code: 'GB', name: 'United Kingdom' };
const fr = { country_code: 'FR', name: 'France' };
const es = { country_code: 'ES', name: 'Spain' };
const it_ = { country_code: 'IT', name: 'Italy' };

describe('formatCountriesFilterNote', () => {
  it('returns an empty string for zero countries', () => {
    expect(formatCountriesFilterNote([])).toBe('');
  });

  it('names a single country in full', () => {
    expect(formatCountriesFilterNote([uk])).toBe('United Kingdom');
  });

  it('names two countries in full, joined by a comma', () => {
    expect(formatCountriesFilterNote([uk, fr])).toBe('United Kingdom, France');
  });

  it('truncates three countries to the first two plus a "+1" count', () => {
    expect(formatCountriesFilterNote([uk, fr, es])).toBe('United Kingdom, France +1');
  });

  it('truncates four countries to the first two plus a "+2" count (COO Q3 adjudication example)', () => {
    expect(formatCountriesFilterNote([uk, fr, es, it_])).toBe('United Kingdom, France +2');
  });

  it('preserves input order rather than sorting', () => {
    expect(formatCountriesFilterNote([fr, uk])).toBe('France, United Kingdom');
  });
});

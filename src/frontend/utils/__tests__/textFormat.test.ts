/**
 * Unit tests for capitalizeFirst() — BUG-56 (city-name auto-capitalisation).
 *
 * Pure function; no mocks needed.
 *
 * Source: src/frontend/utils/textFormat.ts
 */
import { describe, expect, it } from 'vitest';
import { capitalizeFirst } from '../textFormat.js';

describe('capitalizeFirst()', () => {
  it('capitalises a lowercase first letter', () => {
    expect(capitalizeFirst('paris')).toBe('Paris');
  });

  it('leaves an already-capitalised first letter unchanged', () => {
    expect(capitalizeFirst('Paris')).toBe('Paris');
  });

  it('only affects the first character, not the rest of the string', () => {
    expect(capitalizeFirst('new york')).toBe('New york');
  });

  it('handles a single character', () => {
    expect(capitalizeFirst('a')).toBe('A');
  });

  it('returns an empty string unchanged', () => {
    expect(capitalizeFirst('')).toBe('');
  });

  it('passes through a leading digit unchanged', () => {
    expect(capitalizeFirst('42nd street')).toBe('42nd street');
  });

  it('handles a leading apostrophe-prefixed name (e.g. Irish place names) without throwing', () => {
    expect(capitalizeFirst("'s-Hertogenbosch")).toBe("'s-Hertogenbosch");
  });

  it('handles hyphenated city names, only affecting the first character', () => {
    expect(capitalizeFirst('winston-salem')).toBe('Winston-salem');
  });

  it('handles unicode letters', () => {
    expect(capitalizeFirst('zürich')).toBe('Zürich');
  });
});

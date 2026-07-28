/**
 * Unit tests for the shared trip-date defaulting logic (BUG-57/IT-11, BRD-DP06).
 *
 * Pure functions; no mocks needed.
 *
 * Source: src/frontend/utils/dateDefaults.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDefaultDate, resolveDefaultDateTime, todayIso } from '../dateDefaults.js';

describe('todayIso()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current local date as YYYY-MM-DD', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 10, 30)); // June 15 2026, local time
    expect(todayIso()).toBe('2026-06-15');
  });

  it('zero-pads single-digit months and days', () => {
    vi.setSystemTime(new Date(2026, 0, 5, 10, 30)); // Jan 5 2026
    expect(todayIso()).toBe('2026-01-05');
  });
});

describe('resolveDefaultDate()', () => {
  it('returns the trip date when set', () => {
    expect(resolveDefaultDate('2026-06-01', true)).toBe('2026-06-01');
    expect(resolveDefaultDate('2026-06-01', false)).toBe('2026-06-01');
  });

  it('IT-11: falls back to today when unset and fallbackToToday is true', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
    expect(resolveDefaultDate(null, true)).toBe('2026-06-15');
    expect(resolveDefaultDate(undefined, true)).toBe('2026-06-15');
    vi.useRealTimers();
  });

  it('BRD-DP06: returns empty string when unset and fallbackToToday is false', () => {
    expect(resolveDefaultDate(null, false)).toBe('');
    expect(resolveDefaultDate(undefined, false)).toBe('');
  });

  it('treats an empty string trip date as unset', () => {
    expect(resolveDefaultDate('', false)).toBe('');
  });
});

describe('resolveDefaultDateTime()', () => {
  it('anchors to midnight on the resolved day when a trip date is set', () => {
    expect(resolveDefaultDateTime('2026-06-01', true)).toBe('2026-06-01T00:00');
  });

  it('falls back to today at midnight when unset and fallbackToToday is true', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
    expect(resolveDefaultDateTime(null, true)).toBe('2026-06-15T00:00');
    vi.useRealTimers();
  });

  it('returns empty string when unset and fallbackToToday is false', () => {
    expect(resolveDefaultDateTime(null, false)).toBe('');
  });
});

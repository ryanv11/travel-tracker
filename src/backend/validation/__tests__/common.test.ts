/**
 * Unit tests for shared Zod validation primitives.
 *
 * No DB, no HTTP — pure schema parsing. All tests can run without
 * any backend running.
 *
 * Source:  src/backend/validation/common.ts
 * BUG-10:  zName max length fixed to 200 (was 255) to match BRD spec.
 */
import { describe, it, expect } from 'vitest';
import {
  zName,
  zIsoDate,
  zHexColor,
  zRating,
  zCountryCode,
  zItemType,
  zItemStatus,
  zTripStatus,
  zOptionalString,
  zId,
} from '../common.js';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function passes<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

function fails(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): void {
  expect(schema.safeParse(value).success).toBe(false);
}

// ----------------------------------------------------------------
// zName
// ----------------------------------------------------------------

describe('zName', () => {
  it('accepts a normal name', () => {
    expect(passes(zName, 'Paris 2024')).toBe('Paris 2024');
  });

  it('trims leading and trailing whitespace', () => {
    expect(passes(zName, '  Tokyo  ')).toBe('Tokyo');
  });

  it('rejects an empty string', () => {
    fails(zName, '');
  });

  it('rejects a whitespace-only string', () => {
    fails(zName, '   ');
  });

  it('accepts a name of exactly 200 characters', () => {
    const name = 'A'.repeat(200);
    expect(passes(zName, name)).toBe(name);
  });

  it('BUG-10: rejects a name longer than 200 characters', () => {
    const name = 'A'.repeat(201);
    fails(zName, name);
  });
});

// ----------------------------------------------------------------
// zIsoDate
// ----------------------------------------------------------------

describe('zIsoDate', () => {
  it('accepts a valid ISO date', () => {
    expect(passes(zIsoDate, '2024-06-15')).toBe('2024-06-15');
  });

  it('trims whitespace before validating', () => {
    expect(passes(zIsoDate, ' 2024-06-15 ')).toBe('2024-06-15');
  });

  it('rejects a date with slashes', () => {
    fails(zIsoDate, '2024/06/15');
  });

  it('rejects a date with wrong order (DD-MM-YYYY)', () => {
    fails(zIsoDate, '15-06-2024');
  });

  it('rejects a partial date', () => {
    fails(zIsoDate, '2024-06');
  });

  it('rejects a non-date string', () => {
    fails(zIsoDate, 'next-friday');
  });
});

// ----------------------------------------------------------------
// zHexColor
// ----------------------------------------------------------------

describe('zHexColor', () => {
  it('accepts a valid lowercase hex colour', () => {
    expect(passes(zHexColor, '#a1b2c3')).toBe('#a1b2c3');
  });

  it('accepts a valid uppercase hex colour', () => {
    expect(passes(zHexColor, '#FF0000')).toBe('#FF0000');
  });

  it('rejects a 3-digit shorthand hex', () => {
    fails(zHexColor, '#FFF');
  });

  it('rejects a hex without the leading #', () => {
    fails(zHexColor, 'FF0000');
  });

  it('rejects an 8-digit hex (with alpha)', () => {
    fails(zHexColor, '#FF000080');
  });
});

// ----------------------------------------------------------------
// zRating
// ----------------------------------------------------------------

describe('zRating', () => {
  it('accepts 1', () => { expect(passes(zRating, 1)).toBe(1); });
  it('accepts 5', () => { expect(passes(zRating, 5)).toBe(5); });
  it('accepts 3', () => { expect(passes(zRating, 3)).toBe(3); });

  it('rejects 0', () => { fails(zRating, 0); });
  it('rejects 6', () => { fails(zRating, 6); });
  it('rejects a float', () => { fails(zRating, 2.5); });
  it('rejects a string rating', () => { fails(zRating, '3'); });
});

// ----------------------------------------------------------------
// zCountryCode
// ----------------------------------------------------------------

describe('zCountryCode', () => {
  it('accepts a 2-letter uppercase code', () => {
    expect(passes(zCountryCode, 'FR')).toBe('FR');
  });

  it('upcases lowercase input', () => {
    expect(passes(zCountryCode, 'fr')).toBe('FR');
  });

  it('rejects a 3-letter code', () => {
    fails(zCountryCode, 'FRA');
  });

  it('rejects a single letter', () => {
    fails(zCountryCode, 'F');
  });
});

// ----------------------------------------------------------------
// zItemType
// ----------------------------------------------------------------

describe('zItemType', () => {
  const valid = ['restaurant', 'hotel', 'flight', 'car_rental', 'experience', 'note'] as const;

  valid.forEach((type) => {
    it(`accepts "${type}"`, () => { expect(passes(zItemType, type)).toBe(type); });
  });

  it('rejects an unknown type', () => { fails(zItemType, 'bar'); });
  it('rejects an empty string', () => { fails(zItemType, ''); });
});

// ----------------------------------------------------------------
// zItemStatus
// ----------------------------------------------------------------

describe('zItemStatus', () => {
  // NOTE: correct values are 'consider', 'confirmed', 'completed', 'cancelled', 'next_time'
  // NOT 'booked' or 'skipped' — those are not in the schema.
  const valid = ['consider', 'confirmed', 'completed', 'cancelled', 'next_time'] as const;

  valid.forEach((status) => {
    it(`accepts "${status}"`, () => { expect(passes(zItemStatus, status)).toBe(status); });
  });

  it('rejects "booked" (not a valid item status)', () => { fails(zItemStatus, 'booked'); });
  it('rejects "skipped" (not a valid item status)', () => { fails(zItemStatus, 'skipped'); });
  it('rejects an empty string', () => { fails(zItemStatus, ''); });
});

// ----------------------------------------------------------------
// zTripStatus
// ----------------------------------------------------------------

describe('zTripStatus', () => {
  const valid = ['planning', 'active', 'review_pending', 'locked'] as const;

  valid.forEach((status) => {
    it(`accepts "${status}"`, () => { expect(passes(zTripStatus, status)).toBe(status); });
  });

  it('rejects "draft" (not a valid trip status)', () => { fails(zTripStatus, 'draft'); });
  it('rejects "completed" (not a valid trip status — use review_pending/locked)', () => {
    fails(zTripStatus, 'completed');
  });
});

// ----------------------------------------------------------------
// zOptionalString
// ----------------------------------------------------------------

describe('zOptionalString', () => {
  it('accepts undefined', () => { expect(passes(zOptionalString, undefined)).toBeUndefined(); });
  it('accepts a non-empty string', () => { expect(passes(zOptionalString, 'hello')).toBe('hello'); });
  it('trims and accepts', () => { expect(passes(zOptionalString, ' hello ')).toBe('hello'); });

  it('rejects an empty string', () => { fails(zOptionalString, ''); });
  it('rejects a whitespace-only string', () => { fails(zOptionalString, '   '); });
});

// ----------------------------------------------------------------
// zId
// ----------------------------------------------------------------

describe('zId', () => {
  it('accepts a positive integer', () => { expect(passes(zId, 1)).toBe(1); });
  it('coerces a numeric string', () => { expect(passes(zId, '42')).toBe(42); });

  it('rejects 0', () => { fails(zId, 0); });
  it('rejects a negative number', () => { fails(zId, -1); });
  it('rejects a float', () => { fails(zId, 1.5); });
  it('rejects a non-numeric string', () => { fails(zId, 'abc'); });
});

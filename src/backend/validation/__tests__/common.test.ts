/**
 * Unit tests for shared Zod validation primitives.
 *
 * No DB, no HTTP — pure schema parsing. All tests can run without
 * any backend running.
 *
 * Source:  src/backend/validation/common.ts
 * BUG-10:  zName max length corrected to 75 (was 200 per PR #141, itself
 *          fixed from an earlier 255) per PO clarification 2026-07-20.
 */
import { describe, expect, it } from 'vitest';
import {
  zCountryCode,
  zCountryCodesList,
  zHexColor,
  zId,
  zIsoDate,
  zItemStatus,
  zItemType,
  zMapUrl,
  zName,
  zOptionalString,
  zRating,
  zTripStatus,
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

  it('accepts a name of exactly 75 characters', () => {
    const name = 'A'.repeat(75);
    expect(passes(zName, name)).toBe(name);
  });

  it('BUG-10: rejects a name longer than 75 characters', () => {
    const name = 'A'.repeat(76);
    fails(zName, name);
  });

  it('BUG-10: over-limit rejection carries a clear message', () => {
    const result = zName.safeParse('A'.repeat(76));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Name must be 75 characters or fewer');
    }
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
  it('accepts 1', () => {
    expect(passes(zRating, 1)).toBe(1);
  });
  it('accepts 5', () => {
    expect(passes(zRating, 5)).toBe(5);
  });
  it('accepts 3', () => {
    expect(passes(zRating, 3)).toBe(3);
  });

  it('rejects 0', () => {
    fails(zRating, 0);
  });
  it('rejects 6', () => {
    fails(zRating, 6);
  });
  it('rejects a float', () => {
    fails(zRating, 2.5);
  });
  it('rejects a string rating', () => {
    fails(zRating, '3');
  });
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
// zCountryCodesList (GE-20, ADL-54 D1/D2 — implementation guards QA's ATDD
// bar did not red-test: malformed-code rejection and the ~10-code cap. The
// SHOW-ALL-on-empty / branch-on-length behaviour itself (F1) is proven at
// the route level in ge20-cities-country-filter.test.ts /
// ge20-geocode-country-filter.test.ts — this file covers the schema's own
// parsing contract in isolation.)
// ----------------------------------------------------------------

describe('zCountryCodesList', () => {
  it('accepts undefined (param absent)', () => {
    expect(passes(zCountryCodesList, undefined)).toBeUndefined();
  });

  it('parses an empty string to an empty array (param present but empty — distinct from absent)', () => {
    expect(passes(zCountryCodesList, '')).toEqual([]);
  });

  it('parses a single code, upcasing it', () => {
    expect(passes(zCountryCodesList, 'gb')).toEqual(['GB']);
  });

  it('parses a comma-joined multi-code list', () => {
    expect(passes(zCountryCodesList, 'gb,fr,us')).toEqual(['GB', 'FR', 'US']);
  });

  it('trims whitespace around each code', () => {
    expect(passes(zCountryCodesList, ' gb , fr ')).toEqual(['GB', 'FR']);
  });

  it('deduplicates case-insensitively', () => {
    expect(passes(zCountryCodesList, 'gb,GB,Gb')).toEqual(['GB']);
  });

  it('ADL-54 D2: accepts exactly 10 distinct codes (the cap)', () => {
    const codes = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ'];
    expect(passes(zCountryCodesList, codes.join(','))).toEqual(codes);
  });

  it('ADL-54 D2: rejects 11 distinct codes (over the cap)', () => {
    const codes = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ', 'KK'];
    fails(zCountryCodesList, codes.join(','));
  });

  it('does not count duplicate codes against the cap (11 raw entries, 1 distinct)', () => {
    const codes = Array(11).fill('GB');
    expect(passes(zCountryCodesList, codes.join(','))).toEqual(['GB']);
  });

  it('rejects a 3-letter code (not ISO alpha-2 shape)', () => {
    fails(zCountryCodesList, 'gb,fra');
  });

  it('rejects a single-letter code', () => {
    fails(zCountryCodesList, 'g');
  });

  it('rejects a numeric code', () => {
    fails(zCountryCodesList, '12');
  });

  it('rejects a trailing comma (empty entry in the middle of a real list)', () => {
    fails(zCountryCodesList, 'gb,');
  });

  it('rejects one malformed code even alongside otherwise-valid ones', () => {
    fails(zCountryCodesList, 'gb,fr,xyz');
  });
});

// ----------------------------------------------------------------
// zItemType
// ----------------------------------------------------------------

describe('zItemType', () => {
  const valid = ['restaurant', 'hotel', 'flight', 'car_rental', 'experience', 'note'] as const;

  valid.forEach((type) => {
    it(`accepts "${type}"`, () => {
      expect(passes(zItemType, type)).toBe(type);
    });
  });

  it('rejects an unknown type', () => {
    fails(zItemType, 'bar');
  });
  it('rejects an empty string', () => {
    fails(zItemType, '');
  });
});

// ----------------------------------------------------------------
// zItemStatus
// ----------------------------------------------------------------

describe('zItemStatus', () => {
  // NOTE: correct values are 'consider', 'confirmed', 'completed', 'cancelled', 'next_time'
  // NOT 'booked' or 'skipped' — those are not in the schema.
  const valid = ['consider', 'confirmed', 'completed', 'cancelled', 'next_time'] as const;

  valid.forEach((status) => {
    it(`accepts "${status}"`, () => {
      expect(passes(zItemStatus, status)).toBe(status);
    });
  });

  it('rejects "booked" (not a valid item status)', () => {
    fails(zItemStatus, 'booked');
  });
  it('rejects "skipped" (not a valid item status)', () => {
    fails(zItemStatus, 'skipped');
  });
  it('rejects an empty string', () => {
    fails(zItemStatus, '');
  });
});

// ----------------------------------------------------------------
// zTripStatus
// ----------------------------------------------------------------

describe('zTripStatus', () => {
  const valid = ['planning', 'active', 'review_pending', 'locked'] as const;

  valid.forEach((status) => {
    it(`accepts "${status}"`, () => {
      expect(passes(zTripStatus, status)).toBe(status);
    });
  });

  it('rejects "draft" (not a valid trip status)', () => {
    fails(zTripStatus, 'draft');
  });
  it('rejects "completed" (not a valid trip status — use review_pending/locked)', () => {
    fails(zTripStatus, 'completed');
  });
});

// ----------------------------------------------------------------
// zOptionalString
// ----------------------------------------------------------------

describe('zOptionalString', () => {
  it('accepts undefined', () => {
    expect(passes(zOptionalString, undefined)).toBeUndefined();
  });
  it('accepts a non-empty string', () => {
    expect(passes(zOptionalString, 'hello')).toBe('hello');
  });
  it('trims and accepts', () => {
    expect(passes(zOptionalString, ' hello ')).toBe('hello');
  });

  it('rejects an empty string', () => {
    fails(zOptionalString, '');
  });
  it('rejects a whitespace-only string', () => {
    fails(zOptionalString, '   ');
  });
});

// ----------------------------------------------------------------
// zMapUrl (IT-10, ADL-45)
// ----------------------------------------------------------------

describe('zMapUrl', () => {
  it('accepts undefined (optional field)', () => {
    expect(passes(zMapUrl, undefined)).toBeUndefined();
  });

  it('accepts a well-formed https:// URL', () => {
    const url = 'https://maps.google.com/?q=Paris';
    expect(passes(zMapUrl, url)).toBe(url);
  });

  it('accepts a non-Google https:// host (ADL-45 D4: no host allowlist)', () => {
    const url = 'https://maps.apple.com/?q=Paris';
    expect(passes(zMapUrl, url)).toBe(url);
  });

  it('trims surrounding whitespace', () => {
    expect(passes(zMapUrl, '  https://maps.google.com/  ')).toBe('https://maps.google.com/');
  });

  it('rejects http:// (ADL-45 D5: https:// only)', () => {
    fails(zMapUrl, 'http://maps.google.com/');
  });

  it('rejects file:// (ADL-45 D5: narrower than the frontend sanitiser default)', () => {
    fails(zMapUrl, 'file:///Users/alice/map.html');
  });

  it('rejects javascript: scheme', () => {
    fails(zMapUrl, 'javascript:alert(1)');
  });

  it('rejects an empty string', () => {
    fails(zMapUrl, '');
  });

  it('rejects a malformed URL', () => {
    fails(zMapUrl, 'not a url');
  });

  it('accepts a URL of exactly 2048 characters (ADL-45 D3)', () => {
    const padding = 'a'.repeat(2048 - 'https://maps.google.com/?q='.length);
    const url = `https://maps.google.com/?q=${padding}`;
    expect(url.length).toBe(2048);
    expect(passes(zMapUrl, url)).toBe(url);
  });

  it('rejects a URL longer than 2048 characters', () => {
    const padding = 'a'.repeat(2048 - 'https://maps.google.com/?q='.length + 1);
    const url = `https://maps.google.com/?q=${padding}`;
    fails(zMapUrl, url);
  });
});

// ----------------------------------------------------------------
// zId
// ----------------------------------------------------------------

describe('zId', () => {
  it('accepts a positive integer', () => {
    expect(passes(zId, 1)).toBe(1);
  });
  it('coerces a numeric string', () => {
    expect(passes(zId, '42')).toBe(42);
  });

  it('rejects 0', () => {
    fails(zId, 0);
  });
  it('rejects a negative number', () => {
    fails(zId, -1);
  });
  it('rejects a float', () => {
    fails(zId, 1.5);
  });
  it('rejects a non-numeric string', () => {
    fails(zId, 'abc');
  });
});

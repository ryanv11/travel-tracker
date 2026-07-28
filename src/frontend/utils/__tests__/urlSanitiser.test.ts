/**
 * Unit tests for sanitiseUrl() — SEC-12 compliance.
 *
 * Pure function; no mocks needed.
 *
 * Source: src/frontend/utils/urlSanitiser.ts
 */
import { describe, expect, it } from 'vitest';
import { sanitiseUrl } from '../urlSanitiser.js';

describe('sanitiseUrl()', () => {
  // ----------------------------------------------------------------
  // Allowed schemes
  // ----------------------------------------------------------------

  it('passes through an https:// URL unchanged', () => {
    expect(sanitiseUrl('https://photos.example.com/album')).toBe(
      'https://photos.example.com/album',
    );
  });

  it('passes through a file:// URL unchanged', () => {
    expect(sanitiseUrl('file:///Users/alice/Photos/japan')).toBe(
      'file:///Users/alice/Photos/japan',
    );
  });

  it('passes through a complex https URL with path and query', () => {
    const url = 'https://photos.google.com/album/ABC123?authKey=xyz';
    expect(sanitiseUrl(url)).toBe(url);
  });

  // ----------------------------------------------------------------
  // Rejected schemes (XSS / injection vectors)
  // ----------------------------------------------------------------

  it('rejects http:// (not secure)', () => {
    expect(sanitiseUrl('http://example.com')).toBeNull();
  });

  it('rejects javascript: scheme', () => {
    expect(sanitiseUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects javascript: with mixed case', () => {
    expect(sanitiseUrl('JavaScript:alert(1)')).toBeNull();
  });

  it('rejects data: URIs', () => {
    expect(sanitiseUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects vbscript: scheme', () => {
    expect(sanitiseUrl('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects ftp:// scheme', () => {
    expect(sanitiseUrl('ftp://files.example.com')).toBeNull();
  });

  it('rejects a relative URL (no scheme)', () => {
    expect(sanitiseUrl('/relative/path')).toBeNull();
  });

  it('rejects a plain string with no scheme', () => {
    expect(sanitiseUrl('some random text')).toBeNull();
  });

  // ----------------------------------------------------------------
  // Falsy / null / undefined inputs
  // ----------------------------------------------------------------

  it('returns null for null', () => {
    expect(sanitiseUrl(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(sanitiseUrl(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(sanitiseUrl('')).toBeNull();
  });

  // ----------------------------------------------------------------
  // allowedSchemes parameter (ADL-45 D7 — item.map_url uses ['https:'])
  // ----------------------------------------------------------------

  describe('with an explicit allowedSchemes list', () => {
    it('accepts https:// when allowedSchemes is ["https:"]', () => {
      const url = 'https://maps.google.com/?q=Paris';
      expect(sanitiseUrl(url, ['https:'])).toBe(url);
    });

    it('rejects file:// when allowedSchemes is ["https:"] (ADL-45 D5)', () => {
      expect(sanitiseUrl('file:///Users/alice/map.html', ['https:'])).toBeNull();
    });

    it('still rejects javascript: regardless of allowedSchemes', () => {
      expect(sanitiseUrl('javascript:alert(1)', ['https:'])).toBeNull();
    });

    it('defaults to https:/file: when allowedSchemes is omitted (back-compat)', () => {
      expect(sanitiseUrl('file:///Users/alice/Photos/japan')).toBe(
        'file:///Users/alice/Photos/japan',
      );
    });
  });
});

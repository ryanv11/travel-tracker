/**
 * Unit tests for nominatim-client.ts's `truncated` signal — BUG-79 (#379).
 *
 * Every other test in this codebase mocks nominatimSearch away entirely (the
 * "chokepoint" boundary — see geocoding.service.test.ts and
 * routes/__tests__/cities.f1f2-ruling.test.ts), which is right for testing
 * their own callers but means the truncation computation ITSELF — the actual
 * mechanism this bug fix depends on — had no test proving it does what the
 * doc comment claims. This file mocks one level lower, at global `fetch`, to
 * exercise `run()`'s real logic.
 *
 * Fixture shape: matches `RawNominatimResult` (nominatim-client.ts) exactly —
 * `lat`/`lon` as strings, `address.country_code`/`address['ISO3166-2-lvl4']`
 * — rather than a convenient shorthand, per the standing caution about
 * hand-written geocoder fixtures encoding assumptions rather than the
 * documented response shape (BUG-71 passed 32 tests against exactly that
 * mistake).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetChokepointForTests, nominatimSearch } from '../nominatim-client.js';

function rawResult(overrides: { name?: string; type?: string } = {}) {
  return {
    lat: '1.0',
    lon: '1.0',
    display_name: `${overrides.name ?? 'Testville'}, Test Country`,
    name: overrides.name ?? 'Testville',
    class: 'place',
    type: overrides.type ?? 'city',
    address: { country_code: 'us', 'ISO3166-2-lvl4': 'US-XX' },
  };
}

function mockFetchOnce(data: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => data,
    }),
  );
}

describe('nominatimSearch — BUG-79 truncation signal', () => {
  beforeEach(() => {
    __resetChokepointForTests();
    vi.stubEnv('GEOCODING_ENABLED', 'true');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('truncated:true when the RAW response is at least as large as the requested limit', async () => {
    mockFetchOnce([rawResult({ name: 'A' }), rawResult({ name: 'B' }), rawResult({ name: 'C' })]);

    const promise = nominatimSearch({ q: 'springfield', limit: '3' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.truncated).toBe(true);
  });

  it('truncated:false when the RAW response is smaller than the requested limit', async () => {
    mockFetchOnce([rawResult({ name: 'A' }), rawResult({ name: 'B' })]);

    const promise = nominatimSearch({ q: 'newport', limit: '10' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.truncated).toBe(false);
  });

  it('computes truncation from the PRE-FILTER raw count, not the post-settlement-filter survivor count', async () => {
    // 5 raw rows at limit=5 (truncated should read true from the raw count),
    // but 3 of them are 'administrative' areas the SETTLEMENT_TYPES filter
    // drops — only 2 survive into `candidates`. Proves the signal survives
    // the exact discard point the brief named (nominatim-client.ts's
    // .filter() call), rather than being derived after the fact from a
    // post-filter count that could never legitimately exceed the limit.
    mockFetchOnce([
      rawResult({ name: 'City1' }),
      rawResult({ name: 'City2' }),
      rawResult({ name: 'Admin1', type: 'administrative' }),
      rawResult({ name: 'Admin2', type: 'administrative' }),
      rawResult({ name: 'Admin3', type: 'administrative' }),
    ]);

    const promise = nominatimSearch({ q: 'springfield', limit: '5' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.candidates).toHaveLength(2);
      expect(result.truncated).toBe(true);
    }
  });

  it('truncated:false when no limit param is supplied — nothing to compare the raw count against', async () => {
    mockFetchOnce([rawResult({ name: 'A' })]);

    const promise = nominatimSearch({ q: 'test' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.truncated).toBe(false);
  });
});

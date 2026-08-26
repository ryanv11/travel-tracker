/**
 * ADL-56 §5 P2 — unit cover for the merged surface's identity dedup.
 *
 * The behaviour is exercised end-to-end by the Slice-1 acceptance suites
 * (`AddPlaceFlow.adl56-merged-surface.test.tsx` test 4 and
 * `ChangeCityModal.adl56-live-merge.test.tsx`), but the edges that decide
 * whether this is dedup-SAFE rather than merely dedup-ish are cheaper and
 * clearer to pin here: the §2 H1 NULL-osm population, and the fact that the key
 * is a PAIR (a `node` and a `relation` sharing a numeric id are two different
 * real places, and collapsing them would silently bind the wrong one).
 */
import { describe, expect, it } from 'vitest';
import type { GeocodeCandidate } from '../../types/api';
import { dedupeLiveAgainstCached, findCachedTwin, osmIdentityKey } from '../mergeLiveCandidates';

function candidate(over: Partial<GeocodeCandidate> = {}): GeocodeCandidate {
  return {
    name: 'Newport',
    display_name: 'Newport',
    country_code: 'US',
    region_iso: 'US-OR',
    latitude: 0,
    longitude: 0,
    ...over,
  };
}

describe('osmIdentityKey', () => {
  it('is null unless BOTH halves of the reference are present', () => {
    expect(osmIdentityKey({ osm_type: 'relation', osm_id: 186468 })).toBe('relation:186468');
    expect(osmIdentityKey({ osm_type: 'relation', osm_id: null })).toBeNull();
    expect(osmIdentityKey({ osm_type: null, osm_id: 186468 })).toBeNull();
    expect(osmIdentityKey({})).toBeNull();
  });

  it('distinguishes the same numeric id under different osm types', () => {
    // Two different real places. A key of just the number would merge them.
    expect(osmIdentityKey({ osm_type: 'node', osm_id: 42 })).not.toBe(
      osmIdentityKey({ osm_type: 'relation', osm_id: 42 }),
    );
  });
});

describe('dedupeLiveAgainstCached', () => {
  it('drops a live candidate that IS a shown cached row, keeping the others', () => {
    const cached = [{ osm_type: 'relation', osm_id: 186468 }];
    const live = [
      candidate({ osm_type: 'relation', osm_id: 186468 }), // the twin
      candidate({ osm_type: 'relation', osm_id: 191230 }),
    ];
    expect(dedupeLiveAgainstCached(cached, live)).toEqual([live[1]]);
  });

  it('keeps a live candidate whose numeric id matches a cached row of a DIFFERENT osm type', () => {
    const cached = [{ osm_type: 'node', osm_id: 186468 }];
    const live = [candidate({ osm_type: 'relation', osm_id: 186468 })];
    expect(dedupeLiveAgainstCached(cached, live)).toHaveLength(1);
  });

  it('keeps every live candidate when no cached row carries an identity (the §2 H1 population)', () => {
    // Legacy / pending / seeded rows have no osm ref, so their live twin cannot
    // be collapsed onto them. §5's day-one disposition is accept + self-heal —
    // what must NOT happen is a name-based collapse, which would re-open B2.
    const cached = [{ osm_type: null, osm_id: null }];
    const live = [candidate({ osm_type: 'relation', osm_id: 186468 })];
    expect(dedupeLiveAgainstCached(cached, live)).toEqual(live);
  });

  it('keeps a live candidate that carries no identity of its own', () => {
    const cached = [{ osm_type: 'relation', osm_id: 186468 }];
    const live = [candidate()];
    expect(dedupeLiveAgainstCached(cached, live)).toEqual(live);
  });
});

describe('findCachedTwin', () => {
  it('finds the cached row a live candidate should be represented by', () => {
    const cached = [
      { id: 1, osm_type: 'node' as const, osm_id: 1 },
      { id: 2, osm_type: 'relation' as const, osm_id: 186468 },
    ];
    expect(findCachedTwin(cached, candidate({ osm_type: 'relation', osm_id: 186468 }))?.id).toBe(2);
    expect(findCachedTwin(cached, candidate())).toBeUndefined();
  });
});

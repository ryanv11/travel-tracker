/**
 * ADL-56 §5 P2 (D3) — the reuse-first dedup of the merged cached ∪ live
 * surface, extracted ONCE so `AddPlaceFlow` and `ChangeCityModal` cannot drift
 * (the same anti-drift rule that put `decideCityDisambiguation` and
 * `buildCreateCityDataFromCandidate` in their own modules).
 *
 * THE CONTRACT: a live candidate that is the SAME real place as a shown cached
 * row — matched by `(osm_type, osm_id)`, never by name text — is represented
 * exactly once, as the CACHED row. Picking the cached row reuses it by `id` and
 * mints nothing, which is what makes "always show the choice" dedup-safe
 * (§2's verdict: the osm-ref partial unique index is genuine but partial, so
 * safety comes from the surface reusing cached rows, not from a constraint).
 *
 * WHAT IT DELIBERATELY DOES NOT DO — the §2 H1 hole, accepted day one.
 * A cached row carrying NULL `osm_id` (legacy, pending, unresolvable, seeded)
 * has no identity to match on, so its live twin cannot be collapsed onto it and
 * both are shown. §5's disposition is accept + self-heal: the population is
 * bounded, the next resolve stamps `osm_id` (after which the index dedups), and
 * the "saved" affordance steers the user to the cached row. §5's best-effort
 * `(name, country, region_iso)` collapse is explicitly NOT built here — it
 * would mis-collapse two genuinely distinct same-region places, the exact B2
 * hazard, and is a fast-follow only if UAT shows real duplicate pollution
 * (N7 notes autofire raises its frequency, not its disposition).
 *
 * Matching by name text instead of identity would be the wrong fix twice over:
 * it reintroduces B2, and it would collapse "Newport" against "Newport" across
 * four different countries.
 */
import type { GeocodeCandidate } from '../types/api';

/** Anything carrying an optional OSM reference — a cached `City` row or a live candidate. */
interface OsmReferenced {
  osm_type?: string | null;
  osm_id?: number | null;
}

/**
 * The identity of a real place, or `null` when the row carries none.
 *
 * Both halves are required: the backend's `chk_cities_osm_both_or_neither`
 * CHECK makes "one present, one absent" unrepresentable in the catalogue, and
 * a candidate missing either is not identifiable either.
 */
export function osmIdentityKey(row: OsmReferenced): string | null {
  if (!row.osm_type || row.osm_id == null) return null;
  return `${row.osm_type}:${row.osm_id}`;
}

/**
 * Drops live candidates that are the same real place as an already-shown cached
 * row. Candidates with no identity are always kept — there is nothing to match
 * them on, and dropping them would hide real alternatives (the B1 failure mode
 * in miniature).
 *
 * @param cachedRows - the catalogue rows the surface is already showing.
 * @param liveCandidates - the live lookup's candidates for the current settled query.
 */
export function dedupeLiveAgainstCached<T extends OsmReferenced>(
  cachedRows: OsmReferenced[],
  liveCandidates: T[],
): T[] {
  const cachedIdentities = new Set(
    cachedRows.map(osmIdentityKey).filter((key): key is string => key !== null),
  );
  if (cachedIdentities.size === 0) return liveCandidates;
  return liveCandidates.filter((candidate) => {
    const key = osmIdentityKey(candidate);
    return key === null || !cachedIdentities.has(key);
  });
}

/** True when this live candidate is the same real place as a shown cached row. */
export function findCachedTwin<C extends OsmReferenced>(
  cachedRows: C[],
  candidate: GeocodeCandidate,
): C | undefined {
  const key = osmIdentityKey(candidate);
  if (key === null) return undefined;
  return cachedRows.find((row) => osmIdentityKey(row) === key);
}

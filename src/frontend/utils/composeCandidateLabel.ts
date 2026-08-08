/**
 * BUG-81 (BRD GE-16) — collision-aware label composition for the shared
 * `CityPicker` (`src/frontend/components/shared/CityPicker.tsx`).
 *
 * UAT finding 2026-08-07: the picker rendered Nominatim's raw `display_name`,
 * which crams in county AND postcode plus occasional cruft (e.g. "Springfield,
 * Fairfax County, Virginia, 22150, United States"), making a long list
 * (Springfield ~20 US rows) hard to skim. PO-agreed rule (tracker BUG-81):
 *
 *   - Default: "City, State, Country" from the STRUCTURED name fields
 *     (`GeocodeCandidate.name/state/country`) — never postcode.
 *   - Collision rule: 2+ candidates sharing (name + state + country),
 *     case-insensitively, get COUNTY added to those rows only — the real
 *     disambiguation case the PO flagged (multiple Springfields in ONE
 *     state, e.g. PA Delaware County vs Bucks County).
 *   - Rare fallback: if rows are STILL identical after adding county
 *     (same name + state + county too), append a rounded-coordinate
 *     discriminator so no two rows are ever identical.
 *   - Legacy fallback: candidates entirely lacking structured fields
 *     (state/country/county all absent — pre-BUG-81 fixtures, or a response
 *     shape from before the backend sent these fields) fall back to a
 *     cleaned `display_name` (postcode-looking segments stripped).
 *
 * Pure and stateless — no React, so it is unit-testable on its own and the
 * component just maps candidates through it by index.
 */
import type { GeocodeCandidate } from '../types/api';

/** True when a candidate carries ANY of the BUG-81 structured name fields. */
function hasStructuredFields(candidate: GeocodeCandidate): boolean {
  return candidate.state != null || candidate.country != null || candidate.county != null;
}

/** Joins non-empty parts with ", ", skipping null/undefined/blank entries —
 *  never producing an empty-part comma (e.g. "City, , Country"). */
function composeParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(', ');
}

/** Case-insensitive collision key over a set of parts (missing parts treated
 *  as the empty string, so "no state" is itself a distinguishing value). */
function collisionKey(parts: Array<string | null | undefined>): string {
  return parts.map((p) => (p ?? '').trim().toLowerCase()).join('|');
}

/** Groups indices by key, dropping any null keys (candidates that don't
 *  participate in this grouping pass). */
function groupIndicesByKey(keys: Array<string | null>): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  keys.forEach((key, index) => {
    if (key == null) return;
    const list = groups.get(key);
    if (list) {
      list.push(index);
    } else {
      groups.set(key, [index]);
    }
  });
  return groups;
}

/** Segments that look like a postcode — numeric (US ZIP, many EU codes) or
 *  UK-style alphanumeric (e.g. "PO30 1JU", "SW1A 1AA"). Heuristic, not a
 *  full postcode validator — good enough to strip the cruft `display_name`
 *  carries without a false-positive risk on real place-name segments (which
 *  don't look like this). */
const NUMERIC_POSTCODE_RE = /^\d{3,10}$/;
const ALPHANUMERIC_POSTCODE_RE = /^[A-Z0-9]{2,4}\s?\d[A-Z0-9]{0,3}$/i;

function looksLikePostcodeSegment(segment: string): boolean {
  return NUMERIC_POSTCODE_RE.test(segment) || ALPHANUMERIC_POSTCODE_RE.test(segment);
}

/** Strips postcode-looking segments out of a raw `display_name`, e.g.
 *  "Newport, Isle of Wight, England, PO30 1JU, UK" ->
 *  "Newport, Isle of Wight, England, UK". Falls back to the original string
 *  if stripping would leave nothing (defensive — should not happen for a
 *  real Nominatim `display_name`). */
function cleanDisplayName(displayName: string): string {
  const cleaned = displayName
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !looksLikePostcodeSegment(s))
    .join(', ');
  return cleaned || displayName;
}

/**
 * Composes one display label per candidate, aligned by index with the input
 * array. See the module doc comment for the full rule.
 */
export function composeCandidateLabels(candidates: GeocodeCandidate[]): string[] {
  const structuredFlags = candidates.map(hasStructuredFields);
  const labels: string[] = candidates.map((candidate, index) =>
    structuredFlags[index]
      ? composeParts([candidate.name, candidate.state, candidate.country])
      : cleanDisplayName(candidate.display_name) || candidate.name,
  );

  // Collision pass 1: structured candidates sharing (name, state, country)
  // get county added to those rows only.
  const nameStateCountryGroups = groupIndicesByKey(
    candidates.map((c, i) =>
      structuredFlags[i] ? collisionKey([c.name, c.state, c.country]) : null,
    ),
  );
  for (const indices of nameStateCountryGroups.values()) {
    if (indices.length < 2) continue;
    for (const i of indices) {
      const c = candidates[i];
      labels[i] = composeParts([c.name, c.county, c.state, c.country]);
    }
  }

  // Rare fallback: anything still identical (case-insensitive) after the
  // above — including a legacy-fallback row that happens to collide with
  // another — gets a rounded-coordinate discriminator so no two rows are
  // ever identical.
  const finalGroups = groupIndicesByKey(labels.map((label) => label.toLowerCase()));
  for (const indices of finalGroups.values()) {
    if (indices.length < 2) continue;
    for (const i of indices) {
      const c = candidates[i];
      labels[i] = `${labels[i]} (${c.latitude.toFixed(2)}, ${c.longitude.toFixed(2)})`;
    }
  }

  // Absolute last resort — coordinates rounded the same way is vanishingly
  // unlikely but not impossible; guarantee uniqueness outright rather than
  // leave two rows the user cannot tell apart.
  const lastResortGroups = groupIndicesByKey(labels.map((label) => label.toLowerCase()));
  for (const indices of lastResortGroups.values()) {
    if (indices.length < 2) continue;
    indices.forEach((i, order) => {
      if (order === 0) return;
      labels[i] = `${labels[i]} (${order + 1})`;
    });
  }

  return labels;
}

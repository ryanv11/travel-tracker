/**
 * formatCountriesFilterNote — renders a trip's declared country set as a
 * short, human-readable list for the add-place picker's affordances (GE-20,
 * BUG-87, ADL-54 D5/Q3).
 *
 * Used in two places in AddPlaceFlow.tsx: the persistent "Filtered to: …"
 * note above the search input, and the off-country empty-state's "No matches
 * in …" message. Extracted to one shared formatter (rather than two ad-hoc
 * `.join(', ')` calls) so the truncation rule can't drift between the two
 * call sites — same precedent as formatCitySubtitle.ts.
 *
 * Truncation (COO Q3 adjudication, adopting the ADL-54 author's
 * recommendation): name up to MAX_NAMED countries in full, then append a
 * "+N" count for the remainder rather than listing an unbounded set. Example
 * from the adjudication: four declared countries render as
 * "United Kingdom, France +2".
 */

/** How many country names to spell out before truncating to "+N". */
const MAX_NAMED = 2;

/**
 * Formats a trip's declared countries for display.
 *
 * @param countries - The trip's declared countries (`trip.countries`, already
 *   `{ country_code, name }[]` on the trip payload — no extra fetch needed).
 * @returns `''` for an empty set (callers render the zero-country prompt
 *   instead, per D3 — this function is never called for that case, but
 *   returns an explicit empty string rather than throwing if it is);
 *   otherwise every name joined by ", " when the set is small, or the first
 *   `MAX_NAMED` names plus a "+N" count for a larger set.
 */
export function formatCountriesFilterNote(
  countries: { country_code: string; name: string }[],
): string {
  if (countries.length === 0) return '';
  if (countries.length <= MAX_NAMED) {
    return countries.map((c) => c.name).join(', ');
  }
  const named = countries
    .slice(0, MAX_NAMED)
    .map((c) => c.name)
    .join(', ');
  return `${named} +${countries.length - MAX_NAMED}`;
}

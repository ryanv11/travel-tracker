/**
 * formatCitySubtitle — the one shared "where is this city" formatter.
 *
 * Originally written for BUG-72 (AddPlaceFlow's city search dropdown, PR
 * #353) and lifted here for BUG-80 (GitHub #388) so every saved-place surface
 * reuses one formatter instead of a second one drifting out of sync — see the
 * BUG-80 brief's explicit "reuse, do not rewrite" instruction.
 *
 * Renders three real states plus one deliberately-not-a-fourth:
 *   - region-tier country, region known:    "Illinois, US"   (or your own
 *     `countryDisplay` in place of "US" — see below)
 *   - region-tier country, region missing:  "US (no state set)" — explicit,
 *     never indistinguishable from a regioned row
 *   - non-region-tier country:              "US" (or `countryDisplay`) — unchanged
 *   - the response never joined `regions` at all: same as non-region-tier —
 *     country only, NEVER "(no state set)". Conflating "never checked" with
 *     "checked, and there isn't one" would render a claim the payload never
 *     verified (see City.region_name's doc comment in types/api.ts and the
 *     project's negative-findings rule — the same "don't upgrade absence of
 *     evidence into evidence of absence" principle applies to a UI string,
 *     not just an investigation finding).
 *
 * `countryDisplay` decouples "which country's tier config do we look up"
 * (always `city.country_code` — regions/tier config is keyed by ISO code)
 * from "what do we print for the country" (defaults to the same ISO code,
 * matching BUG-72's original AddPlaceFlow dropdown behaviour, but callers
 * that want the full country name — e.g. PlaceSection's existing "Full
 * country name shown in subtitle" contract, D-04 — pass it explicitly).
 * This is what lets one formatter serve both a compact code-based subtitle
 * and a full-name-based one without a second implementation.
 */
import type { Country } from '../types/api';

/**
 * Builds a human-readable region/country subtitle for a city.
 *
 * @param city - Must carry `country_code` (used to look up tier config) and
 *   `region_name` (optional/nullable — see the module doc comment above for
 *   why the undefined/null distinction matters).
 * @param countries - The full country list (GET /api/admin/countries), used
 *   to determine whether the city's country shows a region tier at all and,
 *   if so, its localised label (e.g. "State" vs "Province").
 * @param countryDisplay - What to print for the country itself. Defaults to
 *   `city.country_code`. Pass `city.country_name` (or any other string) to
 *   show a full name instead.
 * @returns The formatted subtitle. Never empty.
 */
export function formatCitySubtitle(
  city: { country_code: string; region_name?: string | null },
  countries: Country[],
  countryDisplay: string = city.country_code,
): string {
  const country = countries.find((c) => c.country_code === city.country_code);

  // Non-region-tier country (or the country list hasn't loaded yet — same
  // safe fallback as before this function existed): country only, no empty
  // separator, nothing that could render as "undefined".
  if (!country?.region_tier_enabled) return countryDisplay;

  // Never joined `regions` at all — genuinely unknown, not "no region set".
  // Showing the country alone here (rather than a false claim of absence) is
  // the entire point of keeping this branch distinct from the null branch.
  if (city.region_name === undefined) return countryDisplay;

  if (city.region_name) return `${city.region_name}, ${countryDisplay}`;

  // Joined, and this row genuinely has no region_id.
  const label = (country.region_tier_label ?? 'region').toLowerCase();
  return `${countryDisplay} (no ${label} set)`;
}

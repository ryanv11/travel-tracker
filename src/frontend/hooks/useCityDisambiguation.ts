/**
 * BUG-75 / UX-12 (design §9) — the shared lookup + precedence-decision seam.
 *
 * Owns the geocode lookup call (`lookupCityCountry`) and runs its result
 * through `decideCityDisambiguation` (the single source of truth for
 * picker-vs-region precedence, `utils/decideCityDisambiguation.ts`) so the
 * decision itself cannot fork between call sites. Consumed by
 * `ChangeCityModal` directly; `AddPlaceFlow` calls the same two pure
 * functions (`decideCityDisambiguation` / `buildCreateCityDataFromCandidate`)
 * inline within its own existing lookup effect rather than adopting this
 * hook wrapper — a deliberate choice to avoid restructuring a
 * heavily-regression-tested file's promise/effect timing (six BUG-specific
 * suites: BUG-71/72/73/78/79, F1/F2 parity) for a change whose actual
 * drift-risk (the decision + identity-carry LOGIC) is already eliminated by
 * both flows calling the identical pure functions. See the Frontend
 * completion report for the full reasoning.
 *
 * Does NOT own the candidate→city identity carry (that is
 * `buildCreateCityDataFromCandidate`, a separate plain utility both flows
 * call directly against their own `useCreateCity()` — review MAJOR-1) — this
 * hook is lookup + decision only.
 */
import { useState } from 'react';
import {
  type CityDisambiguation,
  decideCityDisambiguation,
} from '../utils/decideCityDisambiguation';
import { lookupCityCountry } from './useCities';

export interface CityLookupState {
  disambiguation: CityDisambiguation;
  countryCode: string | null;
  truncated: boolean;
  /** True only when retries were exhausted without a successful response (BUG-73 contract). */
  failed: boolean;
  pending: boolean;
}

const IDLE_STATE: CityLookupState = {
  disambiguation: { mode: 'none' },
  countryCode: null,
  truncated: false,
  failed: false,
  pending: false,
};

export function useCityDisambiguation() {
  const [state, setState] = useState<CityLookupState>(IDLE_STATE);

  /** Fires the geocode lookup for `cityName` and updates disambiguation state
   *  once it resolves. A name under 2 characters resets to idle (mirrors
   *  AddPlaceFlow's own `cityName.trim().length >= 2` gate). */
  const runLookup = (cityName: string) => {
    if (cityName.trim().length < 2) {
      setState(IDLE_STATE);
      return;
    }
    setState((s) => ({ ...s, pending: true, failed: false }));
    lookupCityCountry(cityName.trim())
      .then(({ countryCode, regionIso, candidates, failed, truncated }) => {
        if (failed) {
          setState({ ...IDLE_STATE, failed: true });
          return;
        }
        const candidatesForCountry = countryCode
          ? candidates.filter((c) => c.country_code === countryCode)
          : [];
        setState({
          disambiguation: decideCityDisambiguation(candidatesForCountry, regionIso),
          countryCode,
          truncated,
          failed: false,
          pending: false,
        });
      })
      .catch(() => setState({ ...IDLE_STATE, failed: true }));
  };

  const reset = () => setState(IDLE_STATE);

  return { ...state, runLookup, reset };
}

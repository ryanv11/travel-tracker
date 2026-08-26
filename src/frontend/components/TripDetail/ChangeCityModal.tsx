/**
 * ChangeCityModal — UX-12's "Change city" correction entry point (design §8.2,
 * review MAJOR-1, BRD GE-16).
 *
 * Re-points an existing trip place to a different city via the D11 PATCH
 * (`PATCH /api/trips/:tripId/places/:placeId` with `city_id`, already shipped
 * on `main` — `useChangeCity`, `usePlaces.ts`), preserving the place's items,
 * notes, and activity tags (server-side, already asserted by
 * `place-repoint.test.ts`). This is a CORRECTION, never a new place.
 *
 * Reuses AddPlace's city search step (same "Search city name…" input, same
 * `+ Add new: "…"` affordance) and the shared disambiguation seam
 * (`useCityDisambiguation`, which itself runs candidates through
 * `decideCityDisambiguation` — the single source of truth also consumed by
 * `AddPlaceFlow`, so the two flows' picker-vs-region composition cannot
 * drift, AC-9) plus the shared identity-carry mapping
 * (`buildCreateCityDataFromCandidate`, review MAJOR-1, AC-12). Deliberately
 * has NO date fields and NO carry-forward chrome (UX spec §12.1) — this is a
 * single-purpose city-correction surface, not a second AddPlaceFlow.
 *
 * ── ADL-56 SLICE 1 (N6 / §12-Q5) — WHY THIS SURFACE IS IN SCOPE ──────────────
 * Its search step was CACHED-ONLY: the live lookup fired only behind the
 * "+ Add new" click. So the surface whose entire job is to CORRECT a wrong
 * disambiguation was itself vulnerable to the same wrong disambiguation — a
 * user fixing "Newport" saw only whatever the catalogue happened to hold, which
 * is the B1 hole verbatim. Slice 1 therefore wires in the same three things
 * AddPlaceFlow gets, through the same shared modules:
 *   • the autofire live merge (`useLiveCityLookup`) on the SEARCH step;
 *   • the §5 P2 identity dedup (`dedupeLiveAgainstCached`);
 *   • the §3a anti-silent-commit guard — on `main`, "Change City" clicked with
 *     the picker showing and nothing picked minted a city and re-pointed the
 *     place to it.
 * It deliberately does NOT get the dates / held-selection restructure: a
 * re-point has no dates, so BUG-99's premature-dates defect cannot arise here,
 * and N3's held-selection window does not exist (§12-Q5 scope limit).
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { fetchCountryRegions, useCountries, useCountryRegions } from '../../hooks/useAdmin';
import { type CreateCityData, useCitySearch, useCreateCity } from '../../hooks/useCities';
import { useCityDisambiguation } from '../../hooks/useCityDisambiguation';
import { useLiveCityLookup } from '../../hooks/useLiveCityLookup';
import { useChangeCity } from '../../hooks/usePlaces';
import type { City, GeocodeCandidate } from '../../types/api';
import { buildCreateCityDataFromCandidate } from '../../utils/buildCreateCityDataFromCandidate';
import { formatCitySubtitle } from '../../utils/formatCitySubtitle';
import { dedupeLiveAgainstCached } from '../../utils/mergeLiveCandidates';
import { capitalizeFirst } from '../../utils/textFormat';
import { CityPicker } from '../shared/CityPicker';
import { ErrorMessage } from '../shared/ErrorMessage';
import { ModalOverlay } from '../shared/ModalOverlay';

interface ChangeCityModalProps {
  tripId: number;
  placeId: number;
  onClose: () => void;
}

const DEBOUNCE_MS = 300;

export function ChangeCityModal({ tripId, placeId, onClose }: ChangeCityModalProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showNewCityForm, setShowNewCityForm] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newCityCountryCode, setNewCityCountryCode] = useState('');
  const [newCityRegionId, setNewCityRegionId] = useState<number | null>(null);
  const [countryIsSuggested, setCountryIsSuggested] = useState(false);
  const [regionIsSuggested, setRegionIsSuggested] = useState(false);
  // ADL-56 §3a escape hatch — an explicit "none of these — add as new" satisfies
  // the anti-silent-commit guard below, so the guard can never trap the user.
  const [addAsNewChosen, setAddAsNewChosen] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: searchResults = [], isLoading: searching } = useCitySearch(debouncedQuery);
  // ADL-56 N6/D8 — the live half of the merged correction surface, on the SAME
  // settled query the cached search uses. Unconstrained by country, matching
  // this surface's existing `useCitySearch(debouncedQuery)` (ADL-54 D6 keeps
  // the re-point flow outside GE-20's trip-country filter).
  const live = useLiveCityLookup(debouncedQuery);
  const mergedLiveCandidates = dedupeLiveAgainstCached(searchResults, live.candidates);
  const { data: countries = [] } = useCountries();
  const selectedCountry = countries.find((c) => c.country_code === newCityCountryCode);
  const showRegionDropdown = selectedCountry?.region_tier_enabled ?? false;
  const regionLabel = selectedCountry?.region_tier_label ?? 'Region';
  const { data: countryRegions = [] } = useCountryRegions(
    showRegionDropdown ? newCityCountryCode : undefined,
  );
  const suggestedRegionName = countryRegions.find((r) => r.id === newCityRegionId)?.name;

  // BUG-75/UX-12 (design §9): the shared lookup + precedence-decision seam —
  // same decideCityDisambiguation output AddPlaceFlow consumes, so the two
  // flows' picker/region/suggested composition cannot drift (AC-9).
  const cityDisambig = useCityDisambiguation();
  const createCity = useCreateCity();
  const changeCity = useChangeCity();

  // Debounce the search query
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // Sync the shared hook's resolved country/region onto this form's own
  // controlled-input state (the hook owns lookup + decision; the <select>
  // elements below still need component-owned state to be controlled).
  useEffect(() => {
    if (cityDisambig.countryCode) {
      setNewCityCountryCode(cityDisambig.countryCode);
      setCountryIsSuggested(true);
    }
  }, [cityDisambig.countryCode]);

  useEffect(() => {
    const d = cityDisambig.disambiguation;
    if (d.mode === 'suggested' && countryRegions.length) {
      const match = countryRegions.find((r) => r.iso_3166_2 === d.regionIso);
      if (match) {
        setNewCityRegionId(match.id);
        setRegionIsSuggested(true);
      }
    }
  }, [cityDisambig.disambiguation, countryRegions]);

  /** Re-points the place to `city.id` via the D11 PATCH, then closes. */
  const repointTo = async (city: City) => {
    try {
      await changeCity.mutateAsync({ tripId, placeId, cityId: city.id });
      onClose();
    } catch {
      /* shown via changeCity.error */
    }
  };

  const handleSelectExistingCity = async (city: City) => {
    await repointTo(city);
  };

  const handleOpenNewCityForm = (cityName: string) => {
    setShowNewCityForm(true);
    setNewCityName(capitalizeFirst(cityName));
    setNewCityCountryCode('');
    setNewCityRegionId(null);
    setCountryIsSuggested(false);
    setRegionIsSuggested(false);
    setAddAsNewChosen(false);
    cityDisambig.reset();
    cityDisambig.runLookup(cityName);
  };

  /**
   * ADL-56 N6 — a live candidate chosen straight from the merged search
   * surface. This surface commits on the pick (its existing model: the cached
   * rows above do the same, and §12-Q5 keeps the select≠commit restructure to
   * AddPlaceFlow, where the dates make the distinction matter). The pick is
   * explicit, which is what the guard actually requires.
   *
   * The region is derived from the candidate's OWN `region_iso` through the
   * shared mapping, with the seeded list awaited so a fast pick cannot silently
   * drop it.
   */
  const handleSelectLiveCandidate = async (candidate: GeocodeCandidate) => {
    const countryCode = candidate.country_code ?? live.countryCode;
    if (!countryCode) return;
    const regions = await fetchCountryRegions(countryCode);
    const data = buildCreateCityDataFromCandidate(
      candidate,
      capitalizeFirst(query.trim()),
      regions,
      countryCode,
    );
    if (!data) return;
    try {
      const city = await createCity.mutateAsync(data);
      await repointTo(city);
    } catch {
      /* shown via createCity.error */
    }
  };

  const handleSelectPickerCandidate = async (candidate: GeocodeCandidate) => {
    if (!newCityName.trim()) return;
    // BUG-75/UX-12 (review MAJOR-1, AC-12): the identity-carry mapping lives
    // in exactly one place, shared with AddPlaceFlow.
    const data = buildCreateCityDataFromCandidate(
      candidate,
      newCityName.trim(),
      countryRegions,
      newCityCountryCode,
    );
    if (!data) return;
    try {
      const city = await createCity.mutateAsync(data);
      await repointTo(city);
    } catch {
      /* shown via createCity.error */
    }
  };

  const handleCreateAndRepoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim() || !newCityCountryCode) return;
    // ADL-56 §3a anti-silent-commit guard (§12-Q5 binds it to this surface
    // too). On `main` this submit stayed live while the picker was showing and,
    // clicked without a pick, minted a city and re-pointed the place onto it —
    // the same guess-without-a-pick write as AddPlaceFlow's Melbourne save, on
    // the surface that exists to CORRECT a wrong city.
    if (pickerAwaitingChoice) return;
    const data: CreateCityData = {
      name: newCityName.trim(),
      country_code: newCityCountryCode,
      region_id: newCityRegionId ?? undefined,
    };
    try {
      const city = await createCity.mutateAsync(data);
      await repointTo(city);
    } catch {
      /* shown via createCity.error */
    }
  };

  const mutationError = createCity.error ?? changeCity.error;

  const inputClass =
    'w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 box-border';
  const labelClass = 'block text-xs font-semibold text-gray-700 mb-1';

  const disambiguation = cityDisambig.disambiguation;
  /** §3a/N4 — place-level ambiguity only; the region `<select>` is unaffected. */
  const pickerAwaitingChoice = disambiguation.mode === 'picker' && !addAsNewChosen;

  return (
    <ModalOverlay
      onClose={onClose}
      zIndex={700}
      panelClassName="p-6 w-[480px] max-w-[95vw] max-h-[85vh] overflow-y-auto"
    >
      <h2 className="m-0 mb-4 text-lg font-bold text-gray-900">Change City</h2>

      {!showNewCityForm ? (
        <>
          <input
            className={inputClass}
            placeholder="Search city name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          {searching && query.length >= 2 && (
            <div className="py-2 text-xs text-gray-500">Searching…</div>
          )}

          {/* ADL-56 N6 — the merged correction surface: saved rows UNIONED with
              live candidates for the same settled query, deduped by identity.
              Cached-only here was the B1 hole on the correction surface. */}
          {debouncedQuery.length >= 2 && (
            <div className="border border-gray-200 rounded-md mt-2 overflow-hidden">
              {/* NB-1, same condition and same reason as AddPlaceFlow's cue —
                  it announces an augmentation still arriving, which only means
                  anything once the saved list is on screen. */}
              {live.pending && !searching && (
                <div
                  data-testid="change-city-live-inflight"
                  className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100"
                >
                  Looking online for more places…
                </div>
              )}
              {searchResults.map((city) => (
                <div
                  key={city.id}
                  data-testid={`city-search-result-${city.id}`}
                  className="px-3 py-2.5 cursor-pointer border-b border-gray-100 text-sm hover:bg-gray-50"
                  onClick={() => {
                    void handleSelectExistingCity(city);
                  }}
                >
                  {city.name}{' '}
                  <span className="text-gray-500">— {formatCitySubtitle(city, countries)}</span>
                </div>
              ))}
              {mergedLiveCandidates.length > 0 && (
                <div className="border-b border-gray-100">
                  <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Found online
                  </div>
                  <div className="px-3 pb-2 pt-1">
                    {/* The same shared CityPicker both disambiguation call
                        sites use (BUG-75/UX-12 AC-9) — one component, now three
                        call sites, never a fork. */}
                    <CityPicker
                      candidates={mergedLiveCandidates}
                      onSelect={(candidate) => {
                        void handleSelectLiveCandidate(candidate);
                      }}
                      truncated={live.truncated}
                      testIdPrefix="change-city-live-option"
                      disabled={createCity.isPending || changeCity.isPending}
                    />
                  </div>
                </div>
              )}
              <div
                className="px-3 py-2.5 cursor-pointer text-sm text-teal-600 font-semibold hover:bg-teal-50 border-b border-gray-100 last:border-b-0"
                onClick={() => handleOpenNewCityForm(query)}
              >
                + Add new: "{query}"
              </div>
            </div>
          )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            void handleCreateAndRepoint(e);
          }}
        >
          <div className="mb-3.5">
            <label className={labelClass}>City Name</label>
            <input
              className={inputClass}
              value={newCityName}
              onChange={(e) => setNewCityName(capitalizeFirst(e.target.value))}
              required
            />
          </div>
          <div className="mb-4">
            <label className={labelClass}>
              Country{' '}
              {cityDisambig.pending && (
                <span className="font-normal text-gray-400 text-xs">detecting…</span>
              )}
            </label>
            <select
              className={inputClass}
              value={newCityCountryCode}
              onChange={(e) => {
                setNewCityCountryCode(e.target.value);
                setCountryIsSuggested(false);
                setNewCityRegionId(null);
                setRegionIsSuggested(false);
              }}
              required
            >
              <option value="">Select country…</option>
              {countries.map((c) => (
                <option key={c.country_code} value={c.country_code}>
                  {c.name}
                </option>
              ))}
            </select>
            {countryIsSuggested && selectedCountry && (
              <p className="mt-1 text-xs font-semibold text-gray-500">
                Suggested: {selectedCountry.name} — from "{newCityName}"
              </p>
            )}
            {cityDisambig.failed && (
              <div className="mt-2 px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-xs flex items-center justify-between gap-2">
                <span>Automatic lookup failed — you can select country and region manually.</span>
                <button
                  type="button"
                  onClick={() => handleOpenNewCityForm(newCityName)}
                  className="shrink-0 text-teal-700 font-semibold underline hover:text-teal-800 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {disambiguation.mode === 'picker' ? (
            <div className="mb-4">
              <label className={labelClass}>
                Multiple places match "{newCityName}"
                <span className="font-normal text-amber-600 text-xs">
                  {' '}
                  — please choose the one you mean
                </span>
              </label>
              <CityPicker
                candidates={disambiguation.candidates}
                onSelect={(candidate) => {
                  void handleSelectPickerCandidate(candidate);
                }}
                truncated={cityDisambig.truncated}
                disabled={createCity.isPending || changeCity.isPending}
              />
              {/* §3a — the escape hatch that keeps the guard from trapping the
                  user: an explicit add-as-new is a choice, not a guess. */}
              <div
                className={`mt-2 px-3 py-2 rounded-md border cursor-pointer text-sm ${
                  addAsNewChosen
                    ? 'bg-teal-50 border-teal-200 font-semibold text-teal-800'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setAddAsNewChosen(true)}
              >
                None of these — add "{newCityName}" as a new place
              </div>
            </div>
          ) : (
            showRegionDropdown && (
              <div className="mb-4">
                <label className={labelClass}>
                  {regionLabel} <span className="font-normal text-gray-500">(optional)</span>
                  {disambiguation.mode === 'region' && (
                    <span className="font-normal text-amber-600 text-xs">
                      {' '}
                      — multiple matches found, please choose
                      {cityDisambig.truncated && ' (there may be more not shown)'}
                    </span>
                  )}
                </label>
                <select
                  className={inputClass}
                  value={newCityRegionId ?? ''}
                  onChange={(e) => {
                    setNewCityRegionId(e.target.value ? Number(e.target.value) : null);
                    setRegionIsSuggested(false);
                  }}
                >
                  <option value="">No {regionLabel.toLowerCase()} selected</option>
                  {(disambiguation.mode === 'region'
                    ? countryRegions.filter((r) => disambiguation.regionIsos.includes(r.iso_3166_2))
                    : countryRegions
                  ).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {regionIsSuggested &&
                  disambiguation.mode === 'suggested' &&
                  suggestedRegionName && (
                    <p className="mt-1 text-xs font-semibold text-gray-500">
                      Suggested: {suggestedRegionName} — from "{newCityName}"
                      {cityDisambig.truncated && ' (other matches may exist)'}
                    </p>
                  )}
              </div>
            )
          )}

          {mutationError && <ErrorMessage error={mutationError} />}
          <div className="flex gap-2.5 mt-1">
            <button
              type="button"
              onClick={() => setShowNewCityForm(false)}
              className="px-3.5 py-2 border border-gray-300 rounded-md bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={createCity.isPending || changeCity.isPending || pickerAwaitingChoice}
              className="px-4.5 py-2 bg-teal-600 text-white border-none rounded-md text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {createCity.isPending || changeCity.isPending
                ? 'Saving…'
                : mutationError
                  ? 'Retry'
                  : 'Change City'}
            </button>
          </div>
        </form>
      )}

      {mutationError && !showNewCityForm && <ErrorMessage error={mutationError} />}
    </ModalOverlay>
  );
}

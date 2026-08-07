/**
 * AddPlaceFlow — multi-step modal for adding a city to a trip.
 *
 * Step 1: city search (GET /api/cities?q=...) with debounce.
 * Step 2: select existing city or "Add new city" form.
 * Step 3: POST /api/trips/:tripId/places (with optional arrived_on / departed_on — UX-02).
 * Step 4: check carry-forward candidates; open CarryForwardModal if any.
 *
 * Reference: spec §6.3 (Add Place flow), AC-07.
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useCountries, useCountryRegions } from '../../hooks/useAdmin';
import {
  type CreateCityData,
  lookupCityCountry,
  useCarryForwardCandidates,
  useCitySearch,
  useCreateCity,
} from '../../hooks/useCities';
import { useAddPlace } from '../../hooks/usePlaces';
import { geocodeRetryQueue } from '../../services/geocodeRetryQueue';
import type { City, GeocodeCandidate } from '../../types/api';
// BUG-75/UX-12 (design §9/§6, review MAJOR-1/MINOR-1): the shared
// precedence decision and the shared candidate->city identity-carry mapping,
// each extracted to exactly one place so AddPlace and ChangeCityModal cannot
// drift. See each module's doc comment for the full rationale.
import { buildCreateCityDataFromCandidate } from '../../utils/buildCreateCityDataFromCandidate';
import { resolveDefaultDate } from '../../utils/dateDefaults';
import { decideCityDisambiguation } from '../../utils/decideCityDisambiguation';
// BUG-80: formatCitySubtitle used to live here (BUG-72, PR #353) as a
// module-local function. Lifted to a shared util so every saved-place
// surface reuses the same formatter instead of a second one drifting out of
// sync — see formatCitySubtitle.ts's doc comment for the full behaviour.
import { formatCitySubtitle } from '../../utils/formatCitySubtitle';
import { capitalizeFirst } from '../../utils/textFormat';
import { CarryForwardModal } from '../CarryForward/CarryForwardModal';
import { CityPicker } from '../shared/CityPicker';
import { ErrorMessage } from '../shared/ErrorMessage';

interface AddPlaceFlowProps {
  tripId: number;
  onClose: () => void;
  /** Trip start date (YYYY-MM-DD) — inherited by the first place (BRD-DP06). */
  tripStartDate: string;
  /** Trip end date (YYYY-MM-DD) — inherited by the first place (BRD-DP06). */
  tripEndDate: string;
  /**
   * True only on the empty-trip → first-place transition (ADL-41 constraint).
   * Pass `trip.places.length === 0` from the caller — a revisit (trip already
   * has at least one place) never inherits trip dates, regardless of model
   * (works unchanged once ADL-41's one-row-per-visit migration lands, Wave 2).
   */
  isFirstPlace: boolean;
}

/** Debounce delay for city search (ms). */
const DEBOUNCE_MS = 300;

/**
 * Renders the multi-step Add Place modal. Handles city search, city creation,
 * place creation (with optional dates), and triggering carry-forward when applicable.
 */
export function AddPlaceFlow({
  tripId,
  onClose,
  tripStartDate,
  tripEndDate,
  isFirstPlace,
}: AddPlaceFlowProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showNewCityForm, setShowNewCityForm] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newCityCountryCode, setNewCityCountryCode] = useState('');
  const [newCityRegionId, setNewCityRegionId] = useState<number | null>(null);
  const [autoRegionIso, setAutoRegionIso] = useState<string | null>(null);
  // ADL-46 D14: when the geocode proxy returns multiple candidates with
  // differing region_iso for the resolved country (e.g. Springfield IL vs
  // Springfield MO), this narrows the existing region <select>'s options to
  // just those candidates instead of auto-picking candidates[0] — the user
  // chooses from the (already-present) selector rather than being silently
  // guessed for. null means "no ambiguity — show the full country region list".
  const [candidateRegionIsos, setCandidateRegionIsos] = useState<string[] | null>(null);
  // BUG-75/UX-12 (v3 §B5 m1 REPLACE): candidates whose carried OSM identity
  // is distinct (>=2 distinct osm_id) among a resolved country's candidates
  // — region-only narrowing (candidateRegionIsos above) cannot separate them
  // when they share a region (the two GB-ENG Newports). Only set on that
  // POSITIVE identity evidence, never inferred from region_iso/display_name
  // alone — see the branch in handleOpenNewCityForm below. null means "no
  // place-level ambiguity detected"; mutually exclusive with
  // candidateRegionIsos (region-distinct ambiguity is still handled by the
  // existing selector, PRESERVED unchanged) and with the single-candidate
  // regionIsSuggested auto-fill (also PRESERVED unchanged).
  const [placePickerCandidates, setPlacePickerCandidates] = useState<GeocodeCandidate[] | null>(
    null,
  );
  // BUG-71 stopgap: true only when the CURRENT region-select value was set by
  // the single-candidate auto-fill path below (autoRegionIso), never by an
  // explicit user pick. The mechanism that sets autoRegionIso cannot tell a
  // genuinely unambiguous city (Denver — one real region) apart from a
  // globally-ambiguous one truncated down to a false single survivor
  // (Springfield — Nominatim's 10-slot global result, thinned by settlement
  // type and a non-null-region_iso requirement, happened to leave exactly one
  // region standing) — see __tests__/AddPlaceFlow.bug71.test.tsx and the
  // brief for GitHub #363. Rather than guess which case it is, every
  // auto-filled single-candidate region is surfaced as a UX-spec §3.2-style
  // visibly tentative suggestion instead of a silent commit. Cleared the
  // moment the user actually chooses a region themselves (§1's tier-1 rule:
  // an explicit choice is never just a suggestion) or the form/country
  // resets.
  //
  // BUG-79 (#379) note: the backend now DOES raise the discovery limit and
  // surface a truncation signal (lookupTruncated below) — but this blanket
  // "every auto-fill is tentative" behaviour is kept unchanged even so
  // (success criterion 3): a higher limit makes true ambiguity easier to
  // detect (more candidates for the sameCountryRegionIsos check just below to
  // find), it does not make a single survivor provably unambiguous, so
  // regionIsSuggested still can't and shouldn't be narrowed to "only when
  // truncated."
  const [regionIsSuggested, setRegionIsSuggested] = useState(false);
  // BUG-75/UX-12 (MAJOR-2, AC-13, UX spec §3.2/§12.2 item 3): the country
  // field used to be silently committed the moment the lookup resolved one
  // (line below, now removed) — the only field with the BUG-71 "Suggested:"
  // tentative treatment was the region. A wrong auto-detected country is
  // exactly the "confidently-wrong-result" class §3.2 exists to prevent, so
  // the country now gets the identical tentative treatment as the region:
  // pre-filled but visibly a suggestion, cleared the moment the user
  // explicitly picks a country themselves (tier 1, same rule as region).
  const [countryIsSuggested, setCountryIsSuggested] = useState(false);
  // BUG-79 (#379): true only when the geocode lookup's raw upstream response
  // may have had more matches than `candidates` shows (nominatim-client.ts's
  // pre-filter count hit the requested limit) — see useCities.ts/geocode.ts.
  // Used to avoid presenting a narrowed result as exhaustive when it might
  // not be: appends a caveat to the D14 "multiple matches" hint and to the
  // "Suggested:" caption rather than adding a new UI element.
  const [lookupTruncated, setLookupTruncated] = useState(false);
  const [countryLookupPending, setCountryLookupPending] = useState(false);
  // BUG-73: true only when the geocode lookup exhausted its retries without a
  // successful response — distinct from a successful lookup that legitimately
  // found nothing (which leaves this false and the country field simply
  // unpopulated, same as before). Never blocks the form; manual entry stays
  // available in every case (GE-15/GE-16 contract).
  const [geocodeLookupFailed, setGeocodeLookupFailed] = useState(false);
  const [addedPlaceId, setAddedPlaceId] = useState<number | null>(null);
  const [addedCityId, setAddedCityId] = useState<number | null>(null);
  const [showCarryForward, setShowCarryForward] = useState(false);

  // UX-02: optional date fields for place creation.
  // BRD-DP06: the first place added to an empty trip inherits the trip's date
  // range as a starting value — ADL-41 constraint: fires only on the
  // empty-trip → first-place transition (isFirstPlace), never on a revisit.
  // resolveDefaultDate's fallbackToToday=false means "no trip range to
  // inherit" leaves these blank, same as before this brief.
  const [arrivedOn, setArrivedOn] = useState(
    isFirstPlace ? resolveDefaultDate(tripStartDate, false) : '',
  );
  const [departedOn, setDepartedOn] = useState(
    isFirstPlace ? resolveDefaultDate(tripEndDate, false) : '',
  );
  const [dateValidationError, setDateValidationError] = useState<string | null>(null);
  const [placeWarnings, setPlaceWarnings] = useState<string[]>([]);
  // BUG-75/UX-12 (MAJOR-2, AC-14, UX spec §3.4/§12.2 item 4): status-conditional
  // guidance shown once a place is created for a city that isn't resolved yet
  // — on `main` a successful non-resolved create just sat there (or closed)
  // with no explanation. Mutually exclusive with placeWarnings (set only when
  // there are no backend warnings to show instead).
  const [creationStatusMessage, setCreationStatusMessage] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: searchResults = [], isLoading: searching } = useCitySearch(debouncedQuery);
  const { data: countries = [] } = useCountries();

  // Derive the selected country's tier config to conditionally show region dropdown
  const selectedCountry = countries.find((c) => c.country_code === newCityCountryCode);
  const showRegionDropdown = selectedCountry?.region_tier_enabled ?? false;
  const regionLabel = selectedCountry?.region_tier_label ?? 'Region';

  const { data: countryRegions = [] } = useCountryRegions(
    showRegionDropdown ? newCityCountryCode : undefined,
  );

  // ADL-46 D14: when the geocode lookup found an ambiguous city name (multiple
  // regions within the resolved country), narrow the existing region selector
  // to just those candidate regions rather than listing every region in the
  // country — same <select>, filtered options.
  //
  // The narrowed set is only used when it actually presents a choice (2+
  // matches). Nominatim's region_iso values are open-ended while the local
  // `regions` table is a hand-curated seed known to be incomplete (BUG-30
  // added missing UK regions after the fact; OQ-06 is the still-open
  // question about replacing per-country hand-seeding with a systematic
  // ISO 3166-2 list) — nothing guarantees a geocode region_iso corresponds
  // to a seeded row, so the narrowed set matching zero or one row is
  // expected, not exceptional. Falling back to the full list in that case
  // (rather than leaving the user with an empty/single-option selector)
  // avoids locking out regions that ARE seeded and legitimately choosable.
  // Never auto-select the lone survivor either — that would reintroduce the
  // silent guess D14 exists to prevent, now guessing from a table already
  // known to be incomplete.
  const narrowedRegionOptions = candidateRegionIsos
    ? countryRegions.filter((r) => candidateRegionIsos.includes(r.iso_3166_2))
    : countryRegions;
  const regionOptions =
    candidateRegionIsos && narrowedRegionOptions.length >= 2
      ? narrowedRegionOptions
      : countryRegions;
  // Reflects "the lookup detected an ambiguous city name", independent of
  // whether the narrowing survived the intersection with seeded regions —
  // the user should still learn the name was ambiguous even when they end
  // up looking at the unfiltered full list.
  const regionChoiceIsAmbiguous = candidateRegionIsos !== null;
  // BUG-71: resolves the currently auto-filled region's display name for the
  // "Suggested:" caption — undefined when nothing is auto-selected or the ID
  // doesn't match a loaded region (defensive; shouldn't happen since
  // newCityRegionId is only set here from a countryRegions lookup already).
  const suggestedRegionName = countryRegions.find((r) => r.id === newCityRegionId)?.name;

  const addPlace = useAddPlace();
  const createCity = useCreateCity();
  const { data: carryForwardCandidates = [], isFetched: candidatesFetched } =
    useCarryForwardCandidates(addedCityId ?? undefined);

  // Debounce the search query
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // BUG-03: wait for query to settle before acting on empty candidates list
  useEffect(() => {
    if (addedPlaceId !== null && addedCityId !== null && !showCarryForward && candidatesFetched) {
      if (carryForwardCandidates.length > 0) {
        setShowCarryForward(true);
      } else {
        // Query settled and no candidates — close flow
        onClose();
      }
    }
  }, [
    carryForwardCandidates,
    addedPlaceId,
    candidatesFetched,
    addedCityId,
    onClose,
    showCarryForward,
  ]);

  /** Validates dates and adds a place for the given city. */
  const handleSelectCity = async (city: City) => {
    setDateValidationError(null);

    // UX-02: client-side date validation
    if (arrivedOn && departedOn && arrivedOn > departedOn) {
      setDateValidationError('Arrival date cannot be after departure date.');
      return;
    }

    try {
      const place = await addPlace.mutateAsync({
        tripId,
        cityId: city.id,
        arrivedOn: arrivedOn || null,
        departedOn: departedOn || null,
      });
      setAddedPlaceId(place.id);
      setAddedCityId(city.id);

      // UX-02: show backend warnings (e.g. dates outside trip range) if present
      if (place.warnings && place.warnings.length > 0) {
        setPlaceWarnings(place.warnings);
        // Don't close — user sees warnings, then can close manually
        return;
      }

      // NR-06: queue geocoding retry if city wasn't resolved yet
      if (city.geocode_status !== 'resolved') {
        geocodeRetryQueue.add(city);
        // BUG-75/UX-12 (MAJOR-2, AC-14, UX spec §3.4): tell the user the
        // location isn't confirmed yet rather than leaving them to guess why
        // nothing further happened.
        setCreationStatusMessage(
          city.geocode_status === 'unresolvable'
            ? "We couldn't automatically confirm this location. The place has still been added — you can try Change city later if this doesn't look right."
            : "We're still confirming this location — it'll update automatically once it resolves. The place has been added.",
        );
      }
    } catch {
      /* shown via addPlace.error */
    }
  };

  const handleCreateCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim() || !newCityCountryCode) return;
    const data: CreateCityData = {
      name: newCityName.trim(),
      country_code: newCityCountryCode,
      region_id: newCityRegionId ?? undefined,
    };
    try {
      const city = await createCity.mutateAsync(data);
      await handleSelectCity(city);
    } catch {
      /* shown via createCity.error — Retry button available (Class B, NR-06) */
    }
  };

  /**
   * BUG-75/UX-12 (v3 §1.3/§B4) — the shared CityPicker's onSelect target.
   * Carries the chosen candidate's identity ({osm_type, osm_id,
   * display_name}) into POST /api/cities, plus region_id DERIVED FROM the
   * pick's region_iso via the seeded region map (same pattern as the UX-04
   * auto-select effect below) — never the stale form-selector value (v3
   * §B4's confirmed problem: a pick submitted with the selector's leftover
   * region_id can disagree with the pick's own region). Respects the
   * incomplete-seed fallback: a region_iso with no seeded row leaves
   * region_id undefined rather than inventing one.
   */
  const handleSelectPickerCandidate = async (candidate: GeocodeCandidate) => {
    if (!newCityName.trim()) return;
    // BUG-75/UX-12 (review MAJOR-1): the identity-carry mapping now lives in
    // exactly one place, shared with ChangeCityModal — see the module doc
    // comment on buildCreateCityDataFromCandidate.ts.
    const data = buildCreateCityDataFromCandidate(
      candidate,
      newCityName.trim(),
      countryRegions,
      newCityCountryCode,
    );
    if (!data) return;
    try {
      const city = await createCity.mutateAsync(data);
      setPlacePickerCandidates(null);
      await handleSelectCity(city);
    } catch {
      /* shown via createCity.error — Retry button available (Class B, NR-06) */
    }
  };

  // UX-04: auto-select region once both ISO code and regions list are available
  useEffect(() => {
    if (!autoRegionIso || !countryRegions.length) return;
    const match = countryRegions.find((r) => r.iso_3166_2 === autoRegionIso);
    if (match) setNewCityRegionId(match.id);
  }, [autoRegionIso, countryRegions]);

  /** Opens the new-city form and fires a background Nominatim lookup to
   *  auto-populate the country and region fields (GE-15, UX-04). */
  const handleOpenNewCityForm = (cityName: string) => {
    setShowNewCityForm(true);
    setNewCityName(capitalizeFirst(cityName));
    setNewCityCountryCode('');
    setNewCityRegionId(null);
    setAutoRegionIso(null);
    setCandidateRegionIsos(null);
    setPlacePickerCandidates(null);
    setRegionIsSuggested(false);
    setCountryIsSuggested(false);
    setLookupTruncated(false);
    setGeocodeLookupFailed(false);
    setCreationStatusMessage(null);
    if (cityName.trim().length >= 2) {
      setCountryLookupPending(true);
      lookupCityCountry(cityName.trim())
        .then(({ countryCode, regionIso, candidates, failed, truncated }) => {
          // BUG-73: a failed lookup (retries exhausted) never reaches the D14
          // disambiguation logic below — there's no country/candidates to
          // reason about, and this is the surfaced-to-the-user failure state.
          if (failed) {
            setGeocodeLookupFailed(true);
            setCountryLookupPending(false);
            return;
          }
          // BUG-79: recorded regardless of which branch below fires — a
          // truncated raw response can produce either an ambiguous set or a
          // false single survivor, and both need the same "don't claim
          // certainty" caveat.
          setLookupTruncated(truncated);
          // BUG-75/UX-12 (MAJOR-2, AC-13): the country used to be committed
          // here with no tentative signal at all. Now mirrors the region's
          // BUG-71 treatment — pre-filled, but visibly a suggestion until the
          // user explicitly confirms it (by leaving it as-is IS an implicit
          // confirmation in the existing region pattern's spirit — the same
          // stopgap trade-off BUG-71 already made, applied to a second field).
          if (countryCode) {
            setNewCityCountryCode(countryCode);
            setCountryIsSuggested(true);
          }

          // BUG-75/UX-12 (design §6/§9, review MINOR-1): the reordered
          // precedence — positive osm_id identity evidence wins over region
          // ambiguity — now lives in exactly one place, shared with
          // ChangeCityModal. See decideCityDisambiguation.ts's doc comment
          // for the full "why" (this is the actual BUG-75 headline fix).
          const candidatesForCountry = countryCode
            ? candidates.filter((c) => c.country_code === countryCode)
            : [];
          const disambiguation = decideCityDisambiguation(candidatesForCountry, regionIso);
          switch (disambiguation.mode) {
            case 'picker':
              setPlacePickerCandidates(disambiguation.candidates);
              // Place-level ambiguity — leave newCityRegionId unset; the pick
              // itself (handleSelectPickerCandidate) derives region_id.
              break;
            case 'region':
              setCandidateRegionIsos(disambiguation.regionIsos);
              // Ambiguous — leave newCityRegionId unset so the user must choose.
              break;
            case 'suggested':
              // BUG-71 stopgap: this branch cannot distinguish "genuinely one
              // region" from "collapsed to one by truncation upstream" — mark
              // every auto-fill from here as a tentative suggestion (see the
              // regionIsSuggested declaration above) rather than assuming either.
              setAutoRegionIso(disambiguation.regionIso);
              setRegionIsSuggested(true);
              break;
            case 'none':
              break;
          }
          setCountryLookupPending(false);
        })
        // BUG-73: lookupCityCountry resolves rather than throws on a failed
        // lookup (see its doc comment) — this catch is a defensive fallback
        // for an unexpected rejection, kept consistent with the same failure
        // state so an unforeseen throw doesn't regress to the old silent gap.
        .catch(() => {
          setGeocodeLookupFailed(true);
          setCountryLookupPending(false);
        });
    }
  };

  const mutationError = addPlace.error ?? createCity.error;

  const inputClass =
    'w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 box-border';
  const labelClass = 'block text-xs font-semibold text-gray-700 mb-1';

  if (showCarryForward && addedPlaceId !== null && addedCityId !== null) {
    return (
      <CarryForwardModal
        tripId={tripId}
        placeId={addedPlaceId}
        cityId={addedCityId}
        candidates={carryForwardCandidates}
        onClose={onClose}
      />
    );
  }

  // BUG-75/UX-12 (AC-14): status-conditional guidance for a non-resolved
  // create. Mutually exclusive with placeWarnings — handleSelectCity only
  // sets this when there were no backend warnings to show instead.
  if (creationStatusMessage) {
    return (
      <div
        className="fixed inset-0 bg-black/45 flex items-center justify-center z-[700]"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-lg p-6 w-[480px] max-w-[95vw] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="m-0 mb-4 text-lg font-bold text-gray-900">Place Added</h2>
          <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-md text-blue-800 text-sm">
            <p>{creationStatusMessage}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-teal-600 text-white border-none rounded-md text-sm font-semibold hover:bg-teal-700 cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  // UX-02: if we have warnings from the backend, show them and let user close
  if (placeWarnings.length > 0) {
    return (
      <div
        className="fixed inset-0 bg-black/45 flex items-center justify-center z-[700]"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-lg p-6 w-[480px] max-w-[95vw] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="m-0 mb-4 text-lg font-bold text-gray-900">Place Added</h2>
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-300 rounded-md text-amber-800 text-sm">
            <p className="font-semibold mb-1">Warning</p>
            <ul className="list-disc list-inside space-y-0.5">
              {placeWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-teal-600 text-white border-none rounded-md text-sm font-semibold hover:bg-teal-700 cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-[700]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 w-[480px] max-w-[95vw] max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 mb-4 text-lg font-bold text-gray-900">Add Place</h2>

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

            {debouncedQuery.length >= 2 && (
              <div className="border border-gray-200 rounded-md mt-2 overflow-hidden">
                {searchResults.map((city) => (
                  <div
                    key={city.id}
                    data-testid={`city-search-result-${city.id}`}
                    className="px-3 py-2.5 cursor-pointer border-b border-gray-100 text-sm hover:bg-gray-50"
                    onClick={() => {
                      void handleSelectCity(city);
                    }}
                  >
                    {city.name}{' '}
                    <span className="text-gray-500">— {formatCitySubtitle(city, countries)}</span>
                  </div>
                ))}
                <div
                  className="px-3 py-2.5 cursor-pointer text-sm text-teal-600 font-semibold hover:bg-teal-50 border-b border-gray-100 last:border-b-0"
                  onClick={() => handleOpenNewCityForm(query)}
                >
                  + Add new: "{query}"
                </div>
              </div>
            )}

            {/* UX-02: Optional date fields for place creation */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-3">
                Optional: set arrival / departure dates for this place.
              </p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass}>
                    Arrival date <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="date"
                    className={inputClass}
                    value={arrivedOn}
                    onChange={(e) => {
                      setArrivedOn(e.target.value);
                      setDateValidationError(null);
                    }}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>
                    Departure date <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="date"
                    className={inputClass}
                    value={departedOn}
                    onChange={(e) => {
                      setDepartedOn(e.target.value);
                      setDateValidationError(null);
                    }}
                  />
                </div>
              </div>
              {dateValidationError && (
                <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs">
                  {dateValidationError}
                </div>
              )}
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              void handleCreateCity(e);
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
                {countryLookupPending && (
                  <span className="font-normal text-gray-400 text-xs">detecting…</span>
                )}
              </label>
              <select
                className={inputClass}
                value={newCityCountryCode}
                onChange={(e) => {
                  setNewCityCountryCode(e.target.value);
                  // BUG-71: an explicit user pick is never "just a suggestion" —
                  // tier 1 (UX spec §1): explicit selection always wins and is
                  // never treated as tentative again. Same rule now applied to
                  // the country field (MAJOR-2, AC-13).
                  setCountryIsSuggested(false);
                  setNewCityRegionId(null);
                  setAutoRegionIso(null);
                  setRegionIsSuggested(false);
                  // A manual country change invalidates any D14 candidate
                  // narrowing computed for the previously auto-detected country.
                  setCandidateRegionIsos(null);
                  // Same reasoning for the BUG-75 place-level picker — it was
                  // computed for the auto-detected country's candidates.
                  setPlacePickerCandidates(null);
                  // BUG-79: the truncation signal was computed for the
                  // auto-detected country's lookup — it says nothing about a
                  // country the user is now picking by hand.
                  setLookupTruncated(false);
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
              {/* BUG-75/UX-12 (MAJOR-2, AC-13): country tentative caption,
                  mirroring the region's BUG-71 "Suggested:" treatment exactly
                  — see that block's doc comment below for the full rationale.
                  Country name resolved via the countries list rather than a
                  literal string so it always matches what the <select>'s own
                  options render. */}
              {countryIsSuggested && selectedCountry && (
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  Suggested: {selectedCountry.name} — from "{newCityName}"
                </p>
              )}
              {/* BUG-73: non-blocking, visible failure state — retries are
                  already exhausted by the time this renders (lookupCityCountry
                  handles retry internally). The form stays fully usable;
                  country/region can still be picked manually below. */}
              {geocodeLookupFailed && (
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

            {/* BUG-75/UX-12 (v3 §1.3/§B5) — place-level CityPicker. Fires
                instead of the region dropdown below when region-only
                narrowing cannot disambiguate (2+ candidates carry distinct
                OSM identity but share a region, or no region_iso at all).
                Independent of showRegionDropdown/region_tier_enabled —
                place-level ambiguity is about the candidates, not whether
                the resolved country happens to configure a region tier. */}
            {placePickerCandidates && placePickerCandidates.length > 1 ? (
              <div className="mb-4">
                <label className={labelClass}>
                  Multiple places match "{newCityName}"
                  <span className="font-normal text-amber-600 text-xs">
                    {' '}
                    — please choose the one you mean
                  </span>
                </label>
                <CityPicker
                  candidates={placePickerCandidates}
                  onSelect={(candidate) => {
                    void handleSelectPickerCandidate(candidate);
                  }}
                  truncated={lookupTruncated}
                  disabled={createCity.isPending || addPlace.isPending}
                />
              </div>
            ) : (
              /* Region dropdown — shown only when country has region_tier_enabled */
              showRegionDropdown && (
                <div className="mb-4">
                  <label className={labelClass}>
                    {regionLabel} <span className="font-normal text-gray-500">(optional)</span>
                    {regionChoiceIsAmbiguous && (
                      <span className="font-normal text-amber-600 text-xs">
                        {' '}
                        — multiple matches found, please choose
                        {/* BUG-79: the narrowed set itself may be incomplete —
                          say so rather than implying these are the only
                          matches that exist. */}
                        {lookupTruncated && ' (there may be more not shown)'}
                      </span>
                    )}
                  </label>
                  <select
                    className={inputClass}
                    value={newCityRegionId ?? ''}
                    onChange={(e) => {
                      setNewCityRegionId(e.target.value ? Number(e.target.value) : null);
                      // BUG-71: an explicit user pick is never "just a suggestion" —
                      // tier 1 (UX spec §1): explicit selection always wins and is
                      // never treated as tentative again.
                      setRegionIsSuggested(false);
                    }}
                  >
                    <option value="">No {regionLabel.toLowerCase()} selected</option>
                    {regionOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {/* BUG-71 stopgap: the single-candidate auto-fill above cannot
                    tell a genuine unambiguous match from a truncated one, so it
                    is surfaced as a visibly tentative suggestion (UX spec §3.2's
                    "Suggested:" treatment, applied here to the region field)
                    rather than a silent, indistinguishable-from-user-chosen
                    commit. Mutually exclusive with the ambiguous-choice hint
                    above — only one of the two auto-fill branches ever runs per
                    lookup.
                    BUG-78 (#379): bolded (font-semibold, same utility the rest
                    of this file already uses for emphasis — no new colour or
                    component) — this is a value the user is being asked to
                    check, not a fact they can skim past.
                    BUG-79 (#379): appends a caveat when the lookup that
                    produced this suggestion may have been truncated upstream
                    — the value stays "a suggestion", never presented as more
                    certain than the data actually supports. */}
                  {regionIsSuggested && !regionChoiceIsAmbiguous && suggestedRegionName && (
                    <p className="mt-1 text-xs font-semibold text-gray-500">
                      Suggested: {suggestedRegionName} — from "{newCityName}"
                      {lookupTruncated && ' (other matches may exist)'}
                    </p>
                  )}
                </div>
              )
            )}

            {/* UX-02: Optional date fields — shown in new-city form too */}
            <div className="mb-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-3">
                Optional: set arrival / departure dates for this place.
              </p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass}>
                    Arrival date <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="date"
                    className={inputClass}
                    value={arrivedOn}
                    onChange={(e) => {
                      setArrivedOn(e.target.value);
                      setDateValidationError(null);
                    }}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>
                    Departure date <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="date"
                    className={inputClass}
                    value={departedOn}
                    onChange={(e) => {
                      setDepartedOn(e.target.value);
                      setDateValidationError(null);
                    }}
                  />
                </div>
              </div>
              {dateValidationError && (
                <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs">
                  {dateValidationError}
                </div>
              )}
            </div>

            {mutationError && <ErrorMessage error={mutationError} />}
            <div className="flex gap-2.5 mt-1">
              <button
                type="button"
                onClick={() => setShowNewCityForm(false)}
                className="px-3.5 py-2 border border-gray-300 rounded-md bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Back
              </button>
              {/* NR-06 Class B: when there's an error, button becomes "Retry" affordance */}
              <button
                type="submit"
                disabled={createCity.isPending || addPlace.isPending}
                className="px-4.5 py-2 bg-teal-600 text-white border-none rounded-md text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 cursor-pointer"
              >
                {createCity.isPending || addPlace.isPending
                  ? 'Adding…'
                  : mutationError
                    ? 'Retry'
                    : 'Add City & Place'}
              </button>
            </div>
          </form>
        )}

        {mutationError && !showNewCityForm && <ErrorMessage error={mutationError} />}
      </div>
    </div>
  );
}

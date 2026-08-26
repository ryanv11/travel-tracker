/**
 * AddPlaceFlow — multi-step modal for adding a city to a trip.
 *
 * Step 1: the merged disambiguation surface — cached catalogue rows
 *         (GET /api/cities?q=…, debounced) UNIONED with live geocode
 *         candidates (GET /api/geocode, same settled query), deduped by
 *         identity. Choosing anything SELECTS; it never writes.
 * Step 2: optionally, the manual "+ Add new" form (country/region entry).
 * Step 3: the single explicit "Add City & Place" control commits —
 *         POST /api/cities (live/plain selections only) then
 *         POST /api/trips/:tripId/places with the dates set AFTER choosing.
 * Step 4: check carry-forward candidates; open CarryForwardModal if any.
 *
 * Reference: spec §6.3 (Add Place flow), AC-07; ADL-56 / GE-21 (BRD v3.22).
 *
 * ── ADL-56 SLICE 1 (GE-21) — WHAT CHANGED AND WHY ────────────────────────────
 * This surface accumulated nine PO-reported defects (BUG-71…BUG-99, UX-12/13)
 * because two jobs were conflated: the catalogue was both a DEDUP mechanism
 * (reuse a place already identified) and a SELECTION mechanism (decide which
 * place an un-disambiguated name meant). ADL-56 splits them:
 *
 *   D1  The cache is shown, never preemptive. One surface unions cached rows
 *       and live candidates; a place binds only by explicit selection.
 *   D8  The live lookup fires automatically on the SETTLED query — and
 *       critically, REGARDLESS of what the cache answered. A single cached
 *       "Newport, Oregon" row carries zero information about whether other
 *       Newports exist, so any "the cache answered confidently, skip the
 *       lookup" gate re-creates BUG-97 (fresh-eyes finding B1). See
 *       `hooks/useLiveCityLookup.ts` — the one policy point, and the rollback
 *       seam.
 *   D7  Select ≠ commit (BUG-99). On `main` the pick WAS the write, at three
 *       call sites, so the optional date fields were structurally unreachable:
 *       by the time the user could see them the place was already saved. A pick
 *       now populates a HELD selection; one explicit control writes. The PO was
 *       explicit that removing the button is not the fix — it stays, and
 *       becomes the only writer.
 *   N3  A held live selection carries an `osm_id`. Editing an identity-bearing
 *       field afterwards (Country, or the city Name) drops that identity, so a
 *       Wales `osm_id` can never be committed under a newly-chosen `FR` —
 *       `createOrReuseCarriedCity` files the row under the CALLER-supplied
 *       country, which would produce a Welsh place in France. Also closes
 *       UX-13 on the manual form below.
 *   D5  cache-empty ≠ live-empty ≠ live-failed (BUG-73). Three states that were
 *       one line of copy; the cache-empty message may never imply the place
 *       does not exist, because a live augment may still be in flight.
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { fetchCountryRegions, useCountries, useCountryRegions } from '../../hooks/useAdmin';
import {
  type CreateCityData,
  lookupCityCountry,
  useCarryForwardCandidates,
  useCitySearch,
  useCreateCity,
} from '../../hooks/useCities';
// ADL-56 §3b (D8/B1) — the live half of the merged surface, and the single
// isolated policy point that decides when it fires (the rollback seam).
import { useLiveCityLookup } from '../../hooks/useLiveCityLookup';
import { useAddPlace } from '../../hooks/usePlaces';
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
// GE-20 (BUG-87, ADL-54 D5/Q3): one shared formatter for the "filtered to"
// note and the off-country empty-state's country list — see its doc comment.
import { formatCountriesFilterNote } from '../../utils/formatCountriesFilterNote';
// ADL-56 §5 P2 — reuse-first identity dedup of cached ∪ live, shared with
// ChangeCityModal so the two surfaces cannot drift.
import { dedupeLiveAgainstCached } from '../../utils/mergeLiveCandidates';
import { capitalizeFirst } from '../../utils/textFormat';
import { CarryForwardModal } from '../CarryForward/CarryForwardModal';
import { CityPicker } from '../shared/CityPicker';
import { ErrorMessage } from '../shared/ErrorMessage';
import { ModalOverlay } from '../shared/ModalOverlay';

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
  /**
   * GE-20 (BUG-87, ADL-54) — the trip's declared countries (`trip.countries`,
   * already on the trip payload — no extra fetch). Threaded into BOTH the
   * city-database search (useCitySearch) and the geocode discovery lookup
   * (lookupCityCountry) as `country_codes` so neither can surface a
   * candidate outside this set (the GE-20 "cannot be bypassed from within
   * the picker" guarantee — see the F2 fresh-eyes finding). An empty array
   * (a trip with no declared countries yet) is sent through unchanged — the
   * backend's documented contract treats a present-but-empty set as
   * unconstrained (PO Q1) — and renders the zero-country prompt instead of
   * the "filtered to" note.
   */
  tripCountries: { country_code: string; name: string }[];
  /**
   * GE-20 (ADL-54 D3/D4a) — opens the trip's country editor. Wired by every
   * caller to `useTripDetailController`'s `handleManageCountries` (closes
   * this flow, opens the existing TripForm edit modal) rather than a new
   * dedicated editor, per the ADL's explicit reuse instruction. Used by both
   * the zero-country prompt (Q1) and the off-country empty-state (Q2).
   */
  onManageCountries: () => void;
}

/** Debounce delay for city search (ms). ADL-56 §3b item 1: the live lookup
 *  reuses this same settled value, so it is one call per typing pause, never
 *  one per keystroke. */
const DEBOUNCE_MS = 300;

/**
 * ADL-56 D7 — what the user has CHOSEN but not yet committed.
 *
 * The three kinds are the three binding paths §5 P3 defines, and they differ in
 * what the explicit Add has to do:
 *   • `cached` — a catalogue row. Reused BY `id`; no city is minted at all, so
 *     this is the path that makes "always show the choice" dedup-safe.
 *   • `live`   — a geocode candidate carrying `(osm_type, osm_id)`. The commit
 *     creates-or-reuses by that identity (`createOrReuseCarriedCity`).
 *   • `plain`  — "none of these — add as new". A creator-private plain-name
 *     pending row (GE-12/GE-16); the backend's GE-19 lifecycle re-derives it.
 *     A held `live` selection DEGRADES to this when N3 invalidates its
 *     identity, which is why it carries no fields of its own: the name and
 *     country live in `selectionName`/`selectionCountryCode`, editable
 *     throughout.
 *
 * `null` means no explicit choice has been made — and per §3a's
 * anti-silent-commit guard that is exactly when the commit control must not
 * write. That is the Melbourne bug (BUG-98): a picker was showing, the PO chose
 * neither option, and the form's own submit saved a region-null guess anyway.
 */
type HeldSelection =
  | { kind: 'cached'; city: City }
  | { kind: 'live'; candidate: GeocodeCandidate }
  | { kind: 'plain' };

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
  tripCountries,
  onManageCountries,
}: AddPlaceFlowProps) {
  // GE-20 (BUG-87, ADL-54 D1): the filter set both lookups are constrained
  // to. Recomputed each render from the `tripCountries` prop rather than
  // memoised — `.join(',')` inside the hooks below gives React Query a
  // stable-by-value cache key regardless of this array's reference identity.
  const countryCodes = tripCountries.map((c) => c.country_code);
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
  // ADL-56 D7 — the held selection, and the name/country it carries. Kept
  // separate from the manual form's own newCityName/newCityCountryCode: only
  // one of the two screens renders at a time, and entangling them would mean a
  // `handleOpenNewCityForm` reset silently clearing a selection made on the
  // other screen.
  const [heldSelection, setHeldSelection] = useState<HeldSelection | null>(null);
  const [selectionName, setSelectionName] = useState('');
  const [selectionCountryCode, setSelectionCountryCode] = useState('');
  // UX-13 / N3 on the MANUAL form: the City Name input stays editable while the
  // place picker is showing, but nothing watched it — so an edited name was
  // submitted with the OLD candidate's osm_id. True once the name has been
  // edited since the lookup that produced the current candidates, which
  // withdraws those candidates (they describe a different name) and offers a
  // re-check instead.
  const [nameEditedSinceLookup, setNameEditedSinceLookup] = useState(false);
  // ADL-56 §3a escape hatch, manual-form half: an explicit "none of these — add
  // as new" IS a selection, so it satisfies the anti-silent-commit guard. Reset
  // whenever a new lookup runs.
  const [addAsNewChosen, setAddAsNewChosen] = useState(false);
  // D7 (BUG-99), manual-form half: the candidate picked from the form's own
  // CityPicker, HELD rather than committed. Distinct state from the merged
  // surface's `heldSelection` because the two screens hold different things —
  // this one always resolves to a create (the form has no cached-row branch)
  // and its name/country/region come from the form's own fields.
  const [formHeldCandidate, setFormHeldCandidate] = useState<GeocodeCandidate | null>(null);
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

  // GE-20: country_codes always sent, per countryCodes above.
  const { data: searchResults = [], isLoading: searching } = useCitySearch(
    debouncedQuery,
    countryCodes,
  );
  // ADL-56 §3b (D8/B1) — the live half of the merged surface. Fires on the SAME
  // settled query the catalogue search uses, and nothing about `searchResults`
  // is an input to it: a confident cache hit must never suppress the lookup,
  // which is the entire B1 correction (see the hook's doc comment).
  const live = useLiveCityLookup(debouncedQuery, countryCodes);

  // §5 P2 — a live candidate that IS a shown cached row (same `(osm_type,
  // osm_id)`) is represented once, as the cached row, so picking it reuses by
  // `id` and mints nothing.
  const mergedLiveCandidates = dedupeLiveAgainstCached(searchResults, live.candidates);

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

      // GE-19 / ADL-55 (BUG-85): the geocode-status indicator now derives its
      // queue server-side from the user's trip_places (GET /api/geocode-queue),
      // so adding this place is itself what enrols the city — no client-side
      // localStorage enqueue is needed (the retired NR-06 path, OQ-4). We still
      // tell the user the location isn't confirmed yet.
      if (city.geocode_status !== 'resolved') {
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

  // ───────────────────────────────────────────────────────────────────────────
  // ADL-56 D7 — select ≠ commit. Everything below SELECTS; only handleCommit
  // writes.
  // ───────────────────────────────────────────────────────────────────────────

  /** A catalogue row: reused by `id` at commit, so no city is ever minted. */
  const handleSelectCachedRow = (city: City) => {
    setDateValidationError(null);
    setHeldSelection({ kind: 'cached', city });
  };

  /** A live candidate: its `(osm_type, osm_id)` is carried to the commit. */
  const handleSelectLiveCandidate = (candidate: GeocodeCandidate) => {
    setDateValidationError(null);
    setSelectionName(capitalizeFirst(query.trim()));
    setSelectionCountryCode(candidate.country_code ?? live.countryCode ?? '');
    setHeldSelection({ kind: 'live', candidate });
  };

  /**
   * §3a's escape hatch — "none of these — add as new". Itself an explicit
   * selection, which is what stops the anti-silent-commit guard from ever
   * trapping the user: there is always a way forward that is a CHOICE rather
   * than a guess.
   */
  const handleSelectAddAsNew = () => {
    setDateValidationError(null);
    setSelectionName(capitalizeFirst(query.trim()));
    setSelectionCountryCode(live.countryCode ?? '');
    setHeldSelection({ kind: 'plain' });
  };

  /**
   * N3 — an edit to an identity-bearing field invalidates a held LIVE
   * selection's identity.
   *
   * It degrades to `plain` rather than clearing outright: the surface is still
   * on screen (so the choice is re-offered, which is what §3a asks for), the
   * user's typing is not thrown away, and — the actual safety property — the
   * candidate's `osm_id` can no longer reach `createCity` under a country or
   * name it does not belong to. A plain-name create is the low-harm outcome
   * §3a/N4 already sanctions: the backend re-derives identity through the GE-19
   * lifecycle instead of binding a wrong real place.
   */
  const invalidateHeldIdentity = () => {
    setHeldSelection((prev) => (prev?.kind === 'live' ? { kind: 'plain' } : prev));
  };

  /**
   * §3a anti-silent-commit guard, scoped by N4 to PLACE-level ambiguity only.
   *
   * It covers the `CityPicker` (≥2 distinct real places), where committing
   * without a pick would silently bind the WRONG REAL PLACE. It deliberately
   * does NOT cover the region-narrowing `<select>`: committing there writes a
   * region-null pending row, which the backend re-derives through the GE-19
   * lifecycle and a later resolve backfills — a self-healing, lower-harm
   * outcome, and region is explicitly optional in this UI.
   */
  const pickerAwaitingChoice =
    placePickerCandidates !== null &&
    placePickerCandidates.length > 1 &&
    !addAsNewChosen &&
    // D7: holding a picked candidate IS the explicit choice the guard waits
    // for — the guard blocks a commit with NOTHING chosen, not a commit that
    // has not yet happened.
    formHeldCandidate === null;

  /** §3a — a bare commit with a choice shown and nothing chosen is not a valid action. */
  const canCommit =
    heldSelection !== null &&
    (heldSelection.kind === 'cached' ||
      (selectionName.trim() !== '' && selectionCountryCode !== ''));

  /**
   * THE only write on this surface (D7). Resolves the held selection to a city
   * — reuse by `id`, or create-by-identity, or create-by-name — and then adds
   * the place with the dates as they stand NOW, which is the whole point:
   * BUG-99 committed on the pick, before the user could reach the date fields.
   */
  const handleCommit = async () => {
    if (!heldSelection) return;
    setDateValidationError(null);
    if (arrivedOn && departedOn && arrivedOn > departedOn) {
      setDateValidationError('Arrival date cannot be after departure date.');
      return;
    }

    if (heldSelection.kind === 'cached') {
      await handleSelectCity(heldSelection.city);
      return;
    }

    const name = selectionName.trim();
    if (!name || !selectionCountryCode) return;

    let data: CreateCityData | null;
    if (heldSelection.kind === 'live') {
      // The region is derived from the PICK's own region_iso via the seeded
      // map (the shared mapping, unchanged) — never from a form selector that
      // may disagree with the pick. Awaited rather than read from the
      // `useCountryRegions` hook because the held candidate's country is only
      // known once the user picks, so that hook may not have fetched it yet;
      // racing it would silently drop the region (BUG-98's symptom).
      const regions = await fetchCountryRegions(selectionCountryCode);
      data = buildCreateCityDataFromCandidate(
        heldSelection.candidate,
        name,
        regions,
        selectionCountryCode,
      );
    } else {
      // Plain-name create: carries no candidate identity by construction
      // (§3 P3, third branch).
      data = { name, country_code: selectionCountryCode };
    }
    if (!data) return;

    try {
      const city = await createCity.mutateAsync(data);
      await handleSelectCity(city);
    } catch {
      /* shown via createCity.error — Retry button available (Class B, NR-06) */
    }
  };

  const handleCreateCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim() || !newCityCountryCode) return;
    // §3a anti-silent-commit guard, manual-form half. This is the exact path
    // that produced BUG-98: the picker was advisory, and this submit wrote a
    // region-null plain-name row for a place the user never chose. The button
    // is also disabled, but the guard is repeated here so the behaviour does
    // not depend on an affordance UX may restyle (D6 owns the affordance; the
    // rule is the contract).
    if (pickerAwaitingChoice) return;

    // D7 — the second of BUG-99's two commit paths. When a picker candidate is
    // held, THIS submit is what carries its identity into POST /api/cities;
    // the pick itself wrote nothing. The identity-carry mapping is unchanged
    // and still lives in exactly one place (review MAJOR-1) — only the moment
    // it runs moved, from the row's onClick to here.
    const data: CreateCityData | null = formHeldCandidate
      ? buildCreateCityDataFromCandidate(
          formHeldCandidate,
          newCityName.trim(),
          countryRegions,
          newCityCountryCode,
        )
      : {
          name: newCityName.trim(),
          country_code: newCityCountryCode,
          region_id: newCityRegionId ?? undefined,
        };
    if (!data) return;
    try {
      const city = await createCity.mutateAsync(data);
      setPlacePickerCandidates(null);
      await handleSelectCity(city);
    } catch {
      /* shown via createCity.error — Retry button available (Class B, NR-06) */
    }
  };

  /**
   * BUG-75/UX-12 (v3 §1.3/§B4) — the shared CityPicker's onSelect target.
   *
   * ── D7 (BUG-99), 2026-08-26: THIS PICK NO LONGER COMMITS ─────────────────
   * It used to run `createCity` then `handleSelectCity` → `addPlace` inline,
   * which is the SECOND of the two commit paths BUG-99 names by symbol
   * ("picking a result from EITHER picker … the cached search dropdown OR the
   * disambiguation list (handleSelectPickerCandidate ~:362 → handleSelectCity
   * ~:289) … COMMITS the place, bypassing the 'Optional: set arrival/departure
   * dates' fields shown in the same view"). The defect was never that the
   * dates were unreachable — they are in this same view — but that picking
   * commits, which destroys the natural order: choose the city, THEN set the
   * dates. GE-21 states it directly: "choosing a result populates the form but
   * writes nothing until the explicit Add."
   *
   * So the pick now HOLDS the candidate and populates; `handleCreateCity`
   * above is the only writer, exactly as on the merged surface. The carried
   * identity is unchanged — `buildCreateCityDataFromCandidate` still derives
   * `region_id` from the PICK's own `region_iso` via the seeded region map
   * (never the stale form-selector value, v3 §B4's confirmed problem), and an
   * unseeded `region_iso` still leaves `region_id` undefined rather than
   * inventing one.
   */
  const handleSelectPickerCandidate = (candidate: GeocodeCandidate) => {
    if (!newCityName.trim()) return;
    setFormHeldCandidate(candidate);
    setDateValidationError(null);
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
    // UX-13 / §3a: this lookup describes the name as it is NOW, and no explicit
    // add-as-new choice has been made against its results yet.
    setNameEditedSinceLookup(false);
    setAddAsNewChosen(false);
    setFormHeldCandidate(null);
    if (cityName.trim().length >= 2) {
      setCountryLookupPending(true);
      // GE-20: same country_codes filter as the search above, so the
      // discovery lookup that auto-populates country/region can never
      // suggest a country outside the trip's declared set.
      lookupCityCountry(cityName.trim(), countryCodes)
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
      <ModalOverlay onClose={onClose} zIndex={700} panelClassName="p-6 w-[480px] max-w-[95vw]">
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
      </ModalOverlay>
    );
  }

  // UX-02: if we have warnings from the backend, show them and let user close
  if (placeWarnings.length > 0) {
    return (
      <ModalOverlay onClose={onClose} zIndex={700} panelClassName="p-6 w-[480px] max-w-[95vw]">
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
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay
      onClose={onClose}
      zIndex={700}
      panelClassName="p-6 w-[480px] max-w-[95vw] max-h-[85vh] overflow-y-auto"
    >
      <h2 className="m-0 mb-4 text-lg font-bold text-gray-900">Add Place</h2>

      {!showNewCityForm ? (
        <>
          {/* GE-20 (BUG-87, ADL-54 D5/D3/Q1/Q3): the "filtered by" note, or —
              on a trip with no declared countries yet — the unconstrained
              prompt in its place. Rendered above the search input per D5. */}
          {tripCountries.length > 0 ? (
            <p className="mb-2 text-xs text-gray-500">
              Filtered to: {formatCountriesFilterNote(tripCountries)}
            </p>
          ) : (
            <div className="mb-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-md text-blue-800 text-xs flex items-center justify-between gap-2">
              <span>This trip has no countries yet — results aren't filtered.</span>
              <button
                type="button"
                onClick={onManageCountries}
                className="shrink-0 text-teal-700 font-semibold underline hover:text-teal-800 cursor-pointer"
              >
                Add countries
              </button>
            </div>
          )}

          <input
            className={inputClass}
            placeholder="Search city name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // A held selection belongs to the query it was chosen from —
              // changing the query abandons it rather than letting a stale
              // choice ride into the commit.
              setHeldSelection(null);
            }}
            autoFocus
          />

          {searching && query.length >= 2 && (
            <div className="py-2 text-xs text-gray-500">Searching…</div>
          )}

          {/* ADL-56 D1/D8 — THE MERGED SURFACE. Saved catalogue rows and live
              lookup candidates in one list, deduped by identity, binding
              nothing. Ordering and the saved-vs-online treatment are UX's
              under D6; what is fixed here is that both halves are present and
              neither is chosen for the user. */}
          {debouncedQuery.length >= 2 && (
            <div className="border border-gray-200 rounded-md mt-2 overflow-hidden">
              {/* NB-1 (PO, 2026-08-26; a GE-21 success criterion): an in-flight
                  live lookup is VISIBLY INDICATED but never blocks. It exists
                  to warn about the race where a fast click binds the cached row
                  a moment before the alternatives land — warning about that
                  race must not become forbidding the interaction, so nothing
                  below is disabled while this shows.

                  `!searching` is part of the condition, not decoration: the cue
                  says "there is MORE still coming", which is only a meaningful
                  (or true) claim once the saved list it augments is on screen.
                  While the catalogue search is itself in flight the surface
                  already shows its own "Searching…", and the click-too-early
                  race NB-1 warns about cannot occur yet — there is nothing
                  clickable to bind. */}
              {live.pending && !searching && (
                <div
                  data-testid="add-place-live-inflight"
                  className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100"
                >
                  Looking online for more places…
                </div>
              )}

              {/* D5 S2 (BUG-73) — CACHE-EMPTY, and scoped to SAVED places. The
                  old copy ("No matches in X.") asserted the place does not
                  exist, which the catalogue cannot know and which the live
                  lookup may be about to contradict. GE-20 (ADL-54 D4a/Q2): the
                  countries are still named and the widen-countries path is
                  still offered. */}
              {!searching && searchResults.length === 0 && tripCountries.length > 0 && (
                <div
                  data-testid="add-place-state-cache-empty"
                  className="px-3 py-2.5 text-xs text-gray-600 bg-gray-50 border-b border-gray-100"
                >
                  No saved places match in {formatCountriesFilterNote(tripCountries)}.{' '}
                  <button
                    type="button"
                    onClick={onManageCountries}
                    className="text-teal-600 font-semibold underline hover:text-teal-800 cursor-pointer"
                  >
                    Add a different country to this trip
                  </button>
                </div>
              )}

              {/* Saved rows. A click SELECTS (D7) — on `main` this line was
                  `void handleSelectCity(city)`, i.e. the click posted the
                  place, which is BUG-99 in one statement. */}
              {searchResults.map((city) => (
                <div
                  key={city.id}
                  data-testid={`city-search-result-${city.id}`}
                  className={`px-3 py-2.5 cursor-pointer border-b border-gray-100 text-sm ${
                    heldSelection?.kind === 'cached' && heldSelection.city.id === city.id
                      ? 'bg-teal-50 font-semibold'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleSelectCachedRow(city)}
                >
                  {city.name}{' '}
                  <span className="text-gray-500">— {formatCitySubtitle(city, countries)}</span>
                </div>
              ))}

              {/* The live half, through the SAME shared CityPicker both
                  disambiguation call sites already use (BUG-75/UX-12 put them
                  on one component deliberately — a second picker here would
                  re-open exactly the drift that decision closed). */}
              {mergedLiveCandidates.length > 0 && (
                <div className="border-b border-gray-100">
                  <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Found online
                  </div>
                  <div className="px-3 pb-2 pt-1">
                    <CityPicker
                      candidates={mergedLiveCandidates}
                      onSelect={handleSelectLiveCandidate}
                      truncated={live.truncated}
                      testIdPrefix="add-place-live-option"
                      selectedKey={
                        heldSelection?.kind === 'live' && heldSelection.candidate.osm_type
                          ? `${heldSelection.candidate.osm_type}:${heldSelection.candidate.osm_id}`
                          : null
                      }
                    />
                  </div>
                </div>
              )}

              {/* D5 S5 — LIVE-FAILED. Distinct from S4 because it leads
                  somewhere else: "we couldn't look" invites a retry or manual
                  entry, "we looked and found nothing" does not. Rendered even
                  when saved rows are present (the B1 correction to §7: the live
                  call now always fires, so its outcome layers on top of a cache
                  hit rather than being skipped). */}
              {live.settled && live.failed && (
                <div
                  data-testid="add-place-state-live-failed"
                  className="px-3 py-2.5 text-xs text-amber-800 bg-amber-50 border-b border-gray-100"
                >
                  We couldn't look this name up online just now — you can still add it below and
                  enter the details yourself.
                </div>
              )}

              {/* D5 S4 — LIVE-EMPTY. The geocoder answered and genuinely found
                  nothing; the plain-name create stays reachable. */}
              {live.settled && !live.failed && live.candidates.length === 0 && (
                <div
                  data-testid="add-place-state-live-empty"
                  className="px-3 py-2.5 text-xs text-gray-600 bg-gray-50 border-b border-gray-100"
                >
                  We looked online and found no match for "{query}" — you can still add it as a new
                  place.
                </div>
              )}

              {/* §3a's escape hatch. Always present, so the anti-silent-commit
                  guard can never trap the user: this is a CHOICE, which is what
                  distinguishes it from the bare submit BUG-98 allowed. */}
              <div
                data-testid="add-place-none-of-these"
                className={`px-3 py-2.5 cursor-pointer text-sm border-b border-gray-100 ${
                  heldSelection?.kind === 'plain'
                    ? 'bg-teal-50 font-semibold text-teal-800'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={handleSelectAddAsNew}
              >
                None of these — add "{query}" as a new place
              </div>

              <div
                className="px-3 py-2.5 cursor-pointer text-sm text-teal-600 font-semibold hover:bg-teal-50 border-b border-gray-100 last:border-b-0"
                onClick={() => handleOpenNewCityForm(query)}
              >
                + Add new: "{query}"
              </div>
            </div>
          )}

          {/* D7 — the held selection, populated and editable BEFORE anything is
              written. A cached row's identity is fixed (it is already in the
              catalogue), so it is shown as a summary; a live or plain-name
              selection exposes the two identity-bearing fields N3 guards. */}
          {heldSelection?.kind === 'cached' && (
            <div className="mt-4 px-3 py-2.5 bg-teal-50 border border-teal-200 rounded-md text-sm text-teal-900">
              Selected: {heldSelection.city.name} —{' '}
              {formatCitySubtitle(heldSelection.city, countries)}
            </div>
          )}
          {heldSelection && heldSelection.kind !== 'cached' && (
            <div className="mt-4 px-3 py-3 bg-teal-50 border border-teal-200 rounded-md">
              <p className="text-xs text-teal-900 mb-2.5">
                {heldSelection.kind === 'live'
                  ? 'Selected — check the details, set dates, then add it.'
                  : 'Adding as a new place — check the details, set dates, then add it.'}
              </p>
              <div className="mb-3">
                <label className={labelClass}>City Name</label>
                <input
                  data-testid="add-place-city-name-input"
                  className={inputClass}
                  value={selectionName}
                  onChange={(e) => {
                    setSelectionName(capitalizeFirst(e.target.value));
                    // N3/UX-13 — the name is identity-bearing.
                    invalidateHeldIdentity();
                  }}
                />
              </div>
              <div>
                <label className={labelClass}>Country</label>
                <select
                  data-testid="add-place-country-select"
                  className={inputClass}
                  value={selectionCountryCode}
                  onChange={(e) => {
                    setSelectionCountryCode(e.target.value);
                    // N3 — the country is identity-bearing, and this is the
                    // dangerous one: `createOrReuseCarriedCity` stores the row
                    // under the CALLER-supplied country, so a surviving Wales
                    // osm_id under FR would file a Welsh place in France.
                    invalidateHeldIdentity();
                  }}
                >
                  <option value="">Select country…</option>
                  {countries.map((c) => (
                    <option key={c.country_code} value={c.country_code}>
                      {c.name}
                    </option>
                  ))}
                </select>
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

          {/* D7 — THE single explicit commit. The PO was explicit that removing
              this button is not the fix (that was BUG-91's mechanism, a
              different bug): once picking no longer saves, this is the only way
              to save and close. Inactive until an explicit choice exists, which
              is §3a's anti-silent-commit guard stated at the write layer —
              whether it reads as disabled or merely inert is UX's call (D6);
              that it writes nothing is the contract. */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              data-testid="add-place-commit"
              disabled={!canCommit || createCity.isPending || addPlace.isPending}
              onClick={() => {
                void handleCommit();
              }}
              className="px-4.5 py-2 bg-teal-600 text-white border-none rounded-md text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {createCity.isPending || addPlace.isPending ? 'Adding…' : 'Add City & Place'}
            </button>
            {!canCommit && debouncedQuery.length >= 2 && (
              <span className="text-xs text-gray-500">Choose a place above to continue.</span>
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
              onChange={(e) => {
                setNewCityName(capitalizeFirst(e.target.value));
                // UX-13 (folded into ADL-56 N3 rather than patched separately —
                // it is the same identity-invalidation rule on the same
                // surface). This input was editable while the place picker was
                // showing and NOTHING watched it, so an edited name was
                // submitted carrying the previous name's candidate `osm_id`.
                // The candidates describe the old name, so they are withdrawn
                // and a re-check is offered instead of silently mismatching.
                setNameEditedSinceLookup(true);
                setPlacePickerCandidates(null);
                setCandidateRegionIsos(null);
                setAddAsNewChosen(false);
                // D7/N3: a held candidate's identity belongs to the name it
                // was chosen for. This is the very carry UX-13 reported —
                // an edited name submitted with the old candidate's osm_id.
                setFormHeldCandidate(null);
              }}
              required
            />
            {nameEditedSinceLookup && newCityName.trim().length >= 2 && (
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                <span>The name changed since the last lookup.</span>
                <button
                  type="button"
                  onClick={() => handleOpenNewCityForm(newCityName)}
                  className="shrink-0 text-teal-700 font-semibold underline hover:text-teal-800 cursor-pointer"
                >
                  Re-check "{newCityName.trim()}"
                </button>
              </div>
            )}
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
                // D7/N3: and so was any candidate held from it. Country is the
                // most dangerous identity-bearing field — a surviving pick
                // would file its place under the newly-chosen country.
                setFormHeldCandidate(null);
                setAddAsNewChosen(false);
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
                onSelect={handleSelectPickerCandidate}
                truncated={lookupTruncated}
                testIdPrefix="add-place-form-option"
                selectedKey={
                  formHeldCandidate?.osm_type
                    ? `${formHeldCandidate.osm_type}:${formHeldCandidate.osm_id}`
                    : null
                }
                disabled={createCity.isPending || addPlace.isPending}
              />
              {/* §3a — the escape hatch that keeps the guard from trapping the
                  user on this screen too. Choosing it IS a selection, so the
                  submit below unblocks and writes a creator-private plain-name
                  pending row (GE-12/GE-16) — never a guess at which of the
                  shown places was meant. */}
              <div
                className={`mt-2 px-3 py-2 rounded-md border cursor-pointer text-sm ${
                  addAsNewChosen
                    ? 'bg-teal-50 border-teal-200 font-semibold text-teal-800'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => {
                  setAddAsNewChosen(true);
                  // Mutually exclusive with a held candidate — "none of these"
                  // means none of these.
                  setFormHeldCandidate(null);
                }}
              >
                None of these — add "{newCityName}" as a new place
              </div>
              {/* D7 — the pick populates rather than saves, so the form must
                  say what is now held and that the explicit control is what
                  saves it. Without this the screen looks unchanged after a
                  click, which reads as "nothing happened". */}
              {formHeldCandidate && (
                <p className="mt-2 text-xs text-teal-800">
                  Selected — set dates below if you want them, then choose Add City &amp; Place.
                </p>
              )}
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
              disabled={createCity.isPending || addPlace.isPending || pickerAwaitingChoice}
              className="px-4.5 py-2 bg-teal-600 text-white border-none rounded-md text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
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
    </ModalOverlay>
  );
}

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
import type { City } from '../../types/api';
import { CarryForwardModal } from '../CarryForward/CarryForwardModal';
import { ErrorMessage } from '../shared/ErrorMessage';

interface AddPlaceFlowProps {
  tripId: number;
  onClose: () => void;
}

/** Debounce delay for city search (ms). */
const DEBOUNCE_MS = 300;

/**
 * Renders the multi-step Add Place modal. Handles city search, city creation,
 * place creation (with optional dates), and triggering carry-forward when applicable.
 */
export function AddPlaceFlow({ tripId, onClose }: AddPlaceFlowProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showNewCityForm, setShowNewCityForm] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newCityCountryCode, setNewCityCountryCode] = useState('');
  const [newCityRegionId, setNewCityRegionId] = useState<number | null>(null);
  const [countryLookupPending, setCountryLookupPending] = useState(false);
  const [addedPlaceId, setAddedPlaceId] = useState<number | null>(null);
  const [addedCityId, setAddedCityId] = useState<number | null>(null);
  const [showCarryForward, setShowCarryForward] = useState(false);

  // UX-02: optional date fields for place creation
  const [arrivedOn, setArrivedOn] = useState('');
  const [departedOn, setDepartedOn] = useState('');
  const [dateValidationError, setDateValidationError] = useState<string | null>(null);
  const [placeWarnings, setPlaceWarnings] = useState<string[]>([]);

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

  /** Opens the new-city form and fires a background Nominatim lookup to
   *  auto-populate the country field (GE-15). */
  const handleOpenNewCityForm = (cityName: string) => {
    setShowNewCityForm(true);
    setNewCityName(cityName);
    setNewCityCountryCode('');
    setNewCityRegionId(null);
    if (cityName.trim().length >= 2) {
      setCountryLookupPending(true);
      lookupCityCountry(cityName.trim())
        .then((code) => {
          if (code) setNewCityCountryCode(code);
          setCountryLookupPending(false);
        })
        .catch(() => setCountryLookupPending(false));
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
                    className="px-3 py-2.5 cursor-pointer border-b border-gray-100 text-sm hover:bg-gray-50"
                    onClick={() => {
                      void handleSelectCity(city);
                    }}
                  >
                    {city.name} <span className="text-gray-500">{city.country_code}</span>
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
                onChange={(e) => setNewCityName(e.target.value)}
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
                  setNewCityRegionId(null);
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
            </div>

            {/* Region dropdown — shown only when country has region_tier_enabled */}
            {showRegionDropdown && (
              <div className="mb-4">
                <label className={labelClass}>
                  {regionLabel} <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <select
                  className={inputClass}
                  value={newCityRegionId ?? ''}
                  onChange={(e) =>
                    setNewCityRegionId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">No {regionLabel.toLowerCase()} selected</option>
                  {countryRegions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
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

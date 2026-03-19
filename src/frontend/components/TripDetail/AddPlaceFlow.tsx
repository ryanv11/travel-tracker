/**
 * AddPlaceFlow — multi-step modal for adding a city to a trip.
 *
 * Step 1: city search (GET /api/cities?q=...) with debounce.
 * Step 2: select existing city or "Add new city" form.
 * Step 3: POST /api/trips/:tripId/places.
 * Step 4: check carry-forward candidates; open CarryForwardModal if any.
 *
 * Reference: spec §6.3 (Add Place flow), AC-07.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useCitySearch, useCreateCity, type CreateCityData } from '../../hooks/useCities';
import { useAddPlace } from '../../hooks/usePlaces';
import { useCarryForwardCandidates } from '../../hooks/useCities';
import { useCountries, useCountryRegions } from '../../hooks/useAdmin';
import { CarryForwardModal } from '../CarryForward/CarryForwardModal';
import { ErrorMessage } from '../shared/ErrorMessage';
import { geocodeRetryQueue } from '../../services/geocodeRetryQueue';
import type { City } from '../../types/api';

interface AddPlaceFlowProps {
  tripId: number;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 700,
};
const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '8px', padding: '24px',
  width: '480px', maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB',
  borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box',
};
const resultItemStyle: React.CSSProperties = {
  padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
  fontSize: '14px',
};

/** Debounce delay for city search (ms). */
const DEBOUNCE_MS = 300;

/**
 * Renders the multi-step Add Place modal. Handles city search, city creation,
 * place creation, and triggering carry-forward when applicable.
 */
export function AddPlaceFlow({ tripId, onClose }: AddPlaceFlowProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showNewCityForm, setShowNewCityForm] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newCityCountryCode, setNewCityCountryCode] = useState('');
  const [newCityRegionId, setNewCityRegionId] = useState<number | null>(null);
  const [addedPlaceId, setAddedPlaceId] = useState<number | null>(null);
  const [addedCityId, setAddedCityId] = useState<number | null>(null);
  const [showCarryForward, setShowCarryForward] = useState(false);
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
  const { data: carryForwardCandidates = [], isFetched: candidatesFetched } = useCarryForwardCandidates(
    addedCityId ?? undefined,
  );

  // Debounce the search query
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carryForwardCandidates, addedPlaceId, candidatesFetched]);

  const handleSelectCity = async (city: City) => {
    try {
      const place = await addPlace.mutateAsync({ tripId, cityId: city.id });
      setAddedPlaceId(place.id);
      setAddedCityId(city.id);
      // NR-06: queue geocoding retry if city wasn't resolved yet
      if (city.geocode_status !== 'resolved') {
        geocodeRetryQueue.add(city);
      }
    } catch { /* shown via addPlace.error */ }
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
    } catch { /* shown via createCity.error — Retry button available (Class B, NR-06) */ }
  };

  const mutationError = addPlace.error ?? createCity.error;

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

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700 }}>Add Place</h2>

        {!showNewCityForm ? (
          <>
            <input
              style={inputStyle}
              placeholder="Search city name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />

            {searching && query.length >= 2 && (
              <div style={{ padding: '8px', fontSize: '13px', color: '#6B7280' }}>Searching…</div>
            )}

            {debouncedQuery.length >= 2 && (
              <div style={{ border: '1px solid #E5E7EB', borderRadius: '6px', marginTop: '8px', overflow: 'hidden' }}>
                {searchResults.map((city) => (
                  <div
                    key={city.id}
                    style={resultItemStyle}
                    onClick={() => { void handleSelectCity(city); }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#F9FAFB'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
                  >
                    {city.name} <span style={{ color: '#6B7280' }}>{city.country_code}</span>
                  </div>
                ))}
                <div
                  style={{ ...resultItemStyle, color: '#2563EB', fontWeight: 600 }}
                  onClick={() => { setShowNewCityForm(true); setNewCityName(query); }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#EFF6FF'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
                >
                  + Add new: "{query}"
                </div>
              </div>
            )}
          </>
        ) : (
          <form onSubmit={(e) => { void handleCreateCity(e); }}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>City Name</label>
              <input style={inputStyle} value={newCityName} onChange={(e) => setNewCityName(e.target.value)} required />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Country</label>
              <select
                style={inputStyle}
                value={newCityCountryCode}
                onChange={(e) => {
                  setNewCityCountryCode(e.target.value);
                  setNewCityRegionId(null);
                }}
                required
              >
                <option value="">Select country…</option>
                {countries.map((c) => (
                  <option key={c.country_code} value={c.country_code}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Region dropdown — shown only when country has region_tier_enabled */}
            {showRegionDropdown && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                  {regionLabel} <span style={{ fontWeight: 400, color: '#6B7280' }}>(optional)</span>
                </label>
                <select
                  style={inputStyle}
                  value={newCityRegionId ?? ''}
                  onChange={(e) => setNewCityRegionId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">No {regionLabel.toLowerCase()} selected</option>
                  {countryRegions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            {mutationError && <ErrorMessage error={mutationError} />}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setShowNewCityForm(false)} style={{ padding: '8px 14px', border: '1px solid #D1D5DB', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>
                Back
              </button>
              {/* NR-06 Class B: when there's an error, button becomes "Retry" affordance */}
              <button type="submit" disabled={createCity.isPending || addPlace.isPending} style={{ padding: '8px 18px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                {createCity.isPending || addPlace.isPending ? 'Adding…' : mutationError ? 'Retry' : 'Add City & Place'}
              </button>
            </div>
          </form>
        )}

        {mutationError && !showNewCityForm && <ErrorMessage error={mutationError} />}
      </div>
    </div>
  );
}

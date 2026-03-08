/**
 * CountryTab — Admin panel tab for country region tier configuration (AD-05, GE-07).
 *
 * Lists all 250 countries. Allows toggling region_tier_enabled per country.
 * Region tier name (e.g. "State") is read-only — set by seed data.
 */
import React, { useState } from 'react';
import { useCountries, useUpdateCountry } from '../../hooks/useAdmin';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

/**
 * Renders the Countries admin tab with a searchable list and region tier toggles.
 */
export function CountryTab() {
  const { data: countries = [], isLoading, error } = useCountries();
  const updateCountry = useUpdateCountry();
  const [search, setSearch] = useState('');

  const filtered = countries.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.country_code.toLowerCase().includes(search.toLowerCase()),
  );

  if (isLoading) return <LoadingSpinner message="Loading countries…" />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <input
        type="search"
        placeholder="Search countries…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '500px', overflowY: 'auto' }}>
        {filtered.map((country) => (
          <div key={country.country_code} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
            <span style={{ width: '32px', fontSize: '12px', color: '#6B7280', flexShrink: 0 }}>{country.country_code}</span>
            <span style={{ flex: 1, fontSize: '14px' }}>{country.name}</span>

            {/* Region tier label (read-only) */}
            {country.region_tier_enabled && country.region_tier_label && (
              <span style={{ fontSize: '12px', color: '#5B21B6', background: '#EDE9FE', padding: '1px 8px', borderRadius: '4px', flexShrink: 0 }}>
                {country.region_tier_label}
              </span>
            )}

            {/* Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flexShrink: 0, fontSize: '13px', color: '#374151' }}>
              <input
                type="checkbox"
                checked={country.region_tier_enabled}
                onChange={(e) => {
                  void updateCountry.mutateAsync({
                    countryCode: country.country_code,
                    data: { region_tier_enabled: e.target.checked },
                  });
                }}
                disabled={updateCountry.isPending}
              />
              Region tier
            </label>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p style={{ color: '#6B7280', textAlign: 'center', padding: '20px 0' }}>No countries match your search.</p>
      )}

      {updateCountry.error && <ErrorMessage error={updateCountry.error} />}
    </div>
  );
}

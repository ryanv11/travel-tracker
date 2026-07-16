/**
 * CountryTab — Admin panel tab for country region tier configuration (AD-05, GE-07).
 *
 * Lists all 250 countries. Allows toggling region_tier_enabled per country.
 * Region tier name (e.g. "State") is read-only — set by seed data.
 */
import { useState } from 'react';
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

  const filtered = countries.filter(
    (c) =>
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
        className="w-full box-border px-2.5 py-2 mb-4 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
      />

      <div className="flex flex-col gap-1 max-h-[500px] overflow-y-auto">
        {filtered.map((country) => (
          <div
            key={country.country_code}
            className="flex items-center gap-2.5 px-2.5 py-2 border border-gray-200 rounded-md"
          >
            <span className="w-8 flex-shrink-0 text-xs text-gray-500">{country.country_code}</span>
            <span className="flex-1 text-sm">{country.name}</span>

            {/* Region tier label (read-only) — reuses the app's indigo badge vocabulary
                (StatusBadge.tsx "confirmed") rather than a one-off purple. */}
            {country.region_tier_label && (
              <span
                className={`flex-shrink-0 text-xs px-2 py-0.5 rounded ${
                  country.region_tier_enabled
                    ? 'text-indigo-800 bg-indigo-100'
                    : 'text-gray-400 bg-gray-100'
                }`}
              >
                {country.region_tier_label}
              </span>
            )}

            {/* Toggle */}
            <label className="flex items-center gap-1.5 flex-shrink-0 text-[13px] text-gray-700 cursor-pointer">
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
                className="accent-teal-600"
              />
              Region tier
            </label>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-500 text-center py-5">No countries match your search.</p>
      )}

      {updateCountry.error && <ErrorMessage error={updateCountry.error} />}
    </div>
  );
}

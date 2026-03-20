TO: FRONTEND
FROM: COO
DATE: 2026-03-21 25:00
RE: ADL-23 + GitHub #31 — country picker + create flow UX

Backend trip_countries API (PR #41) and tests (PR #40) are merged. The backend now:
- Accepts country_codes?: string[] on POST/PATCH /api/trips
- Returns countries: [{ country_code, name }] on all trip responses
- Exposes POST/DELETE /api/trips/:id/countries

Branch: `feat/adl23-trip-countries-frontend`

---

## Overview — 4 changes to TripForm

1. Add country picker (multi-select, searchable) — create AND edit
2. Post-create navigation — navigate to new trip instead of just closing
3. Remove activities from create form (keep in edit)
4. Remove photo_album_ref from create form (keep in edit)

All changes are in `src/frontend/components/TripDetail/TripForm.tsx`.
Supporting changes in `src/frontend/types/api.ts` and `src/frontend/hooks/useTrips.ts`.

---

## Step 0 — Update types + hook

### src/frontend/types/api.ts

Add `countries` to `TripSummary`:
```ts
countries: { country_code: string; name: string }[];
```

### src/frontend/hooks/useTrips.ts

Add `country_codes` to `TripFormData`:
```ts
country_codes?: string[];
```

Update `useCreateTrip` mutation to return `TripSummary` with the new shape
(no code change needed if return type is already `TripSummary` — just the type update above covers it).

---

## Step 1 — Country picker component (inline in TripForm)

The `useCountries()` hook from `../../hooks/useAdmin` already fetches all 250 countries.
Build the picker inline in TripForm (no separate file needed).

State:
```ts
const [selectedCountryCodes, setSelectedCountryCodes] = useState<string[]>(
  existingTrip?.countries?.map((c) => c.country_code) ?? [],
);
const [countrySearch, setCountrySearch] = useState('');
```

Data:
```ts
const { data: allCountries = [] } = useCountries();
const filteredCountries = allCountries.filter(
  (c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.country_code.toLowerCase().includes(countrySearch.toLowerCase()),
);
```

Render (below the date fields, above categories):
```tsx
<div className="mb-4">
  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Countries</label>

  {/* Selected chips */}
  {selectedCountryCodes.length > 0 && (
    <div className="flex flex-wrap gap-1 mb-2">
      {selectedCountryCodes.map((code) => {
        const country = allCountries.find((c) => c.country_code === code);
        return (
          <span
            key={code}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-teal-100 text-teal-800 border border-teal-300"
          >
            {country?.name ?? code}
            <button
              type="button"
              onClick={() => setSelectedCountryCodes((prev) => prev.filter((c) => c !== code))}
              className="text-teal-600 hover:text-teal-900 leading-none"
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  )}

  {/* Search + dropdown */}
  <input
    type="text"
    placeholder="Search countries…"
    value={countrySearch}
    onChange={(e) => setCountrySearch(e.target.value)}
    className="w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 mb-1"
  />

  {countrySearch && (
    <div className="border border-gray-200 rounded-md max-h-40 overflow-y-auto">
      {filteredCountries.slice(0, 20).map((c) => {
        const selected = selectedCountryCodes.includes(c.country_code);
        return (
          <button
            key={c.country_code}
            type="button"
            onClick={() => {
              setSelectedCountryCodes((prev) =>
                selected ? prev.filter((x) => x !== c.country_code) : [...prev, c.country_code],
              );
              setCountrySearch('');
            }}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${selected ? 'text-teal-700 font-medium' : 'text-gray-700'}`}
          >
            <span>{c.name}</span>
            <span className="text-xs text-gray-400 ml-2">{c.country_code}</span>
          </button>
        );
      })}
      {filteredCountries.length === 0 && (
        <p className="px-3 py-2 text-sm text-gray-400">No countries match</p>
      )}
    </div>
  )}
</div>
```

Note: the dropdown only shows while the search input has text. Selecting a country clears the search. This avoids the need for a complex click-outside handler.

---

## Step 2 — Post-create navigation

Add the `useNavigate` hook (from react-router-dom — it's already used in TripsLayout so the import pattern exists):
```ts
import { useNavigate } from 'react-router-dom';
// ...
const navigate = useNavigate();
```

In the create branch of handleSubmit:
```ts
const created = await createTrip.mutateAsync(data);
onClose();
navigate(`/trips/${created.id}`);
```

---

## Step 3 — Conditionally render activities + photo_album_ref

Both fields should only show in edit mode (`isEditing === true`). Wrap each section:

```tsx
{isEditing && (
  <div className="mb-4">
    {/* activities section */}
  </div>
)}

{isEditing && (
  <div className="mb-4">
    {/* photo_album_ref section */}
  </div>
)}
```

State initialisation stays as-is (always initialised from existingTrip or empty) —
the fields are just not rendered on create.

---

## Step 4 — Wire country_codes into form submission

In handleSubmit, add country_codes to the data object:
```ts
const data: TripFormData = {
  name: name.trim(),
  start_date: startDate,
  end_date: endDate,
  ...(isEditing ? { photo_album_ref: photoRef.trim() || undefined } : {}),
  category_ids: selectedCategoryIds,
  companion_ids: selectedCompanionIds,
  ...(isEditing ? { activity_ids: selectedActivityIds } : {}),
  country_codes: selectedCountryCodes,
};
```

---

## Pre-push checklist

```bash
npm run type:check
npm run test:frontend
npm run test:backend
```

No new test cases needed — pure UI change.

---

## PR

```bash
gh pr create --repo ryanv11/travel-tracker \
  --title "feat: country picker + create flow UX improvements (ADL-23, #31)" \
  --body "$(cat <<'EOF'
Closes #31

- Country picker (searchable multi-select) on create and edit forms
- Post-create: navigate directly to new trip detail panel
- Remove activities from create form (edit-only)
- Remove photo_album_ref from create form (edit-only)
- TripSummary type updated with countries field
- TripFormData updated with country_codes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

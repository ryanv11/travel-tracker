# Backend: Remaining 43 TypeScript Errors Cleared

**Date:** 2026-03-22
**Agent:** Backend
**Branch:** `fix/backend-remaining-type-errors`
**PR:** #49

---

## Categories of Errors Fixed

### 1. `req.params` coercion — TS2345 / TS2339 (approx. 35 errors)

**Root cause:** Express's `ParamsDictionary` is typed as `[key: string]: string | string[]`, making every `req.params.*` access return `string | string[]` rather than `string`. This caused failures in `parseInt()` calls and `.toUpperCase()` calls.

**Fix:** Wrapped all `req.params.*` accesses in `String()` at the handler boundary — e.g. `parseInt(String(req.params.id), 10)` and `String(req.params.countryCode).toUpperCase()`.

**Files changed:** `routes/admin.ts`, `routes/cities.ts`, `routes/items.ts`, `routes/map.ts`, `routes/places.ts`, `routes/trip-countries.ts`, `routes/trips.ts`

---

### 2. Auth middleware test mocks — TS2352 (2 errors)

**Root cause:** `JWTVerifyResult & ResolvedKey` requires both `protectedHeader` and `key`. The mock objects in `auth.test.ts` provided only `payload`.

**Fix:** Added `protectedHeader: { alg: 'RS256' }` to both mock objects and switched from a direct `as` cast to an `unknown`-first double-cast (`as unknown as Awaited<ReturnType<typeof jwtVerify>>`), which is the correct pattern for mock objects that intentionally omit non-exercised fields.

**File changed:** `middleware/__tests__/auth.test.ts`

---

### 3. Validation schema `unknown` narrowing — TS18046 (2 errors)

**Root cause:** In `withDateRefinement` in `trips.schemas.ts`, the `refine` callback's `data` parameter was implicitly `unknown` due to the `as unknown` cast on the schema type.

**Fix:** Added an explicit typed parameter annotation `(data: { start_date: unknown; end_date: unknown })` with `as string` casts for the comparison, resolving the `'data.end_date' is of type 'unknown'` errors.

**File changed:** `validation/trips.schemas.ts`

---

### 4. Admin regions insert — TS2769 (1 error)

**Root cause:** The `regions` table schema has `iso3166_2` as `notNull()` (required), but the `POST /api/admin/countries/:countryCode/regions` handler and its `CreateRegionSchema` omitted the field entirely.

**Fix:** Added `iso3166_2: z.string().trim().min(1)` to `CreateRegionSchema` and included `iso3166_2` in the `db.insert(regions).values(...)` call. Also added `iso3166_2` to the destructured `req.body`.

**Files changed:** `validation/admin.schemas.ts`, `routes/admin.ts`

---

## Final Results

### `npm run type:check:backend`
```
Exit code: 0 (zero errors)
```

### `npm run test:backend`
```
Test Files: 9 passed (9)
      Tests: 186 passed (186)
```

---

## PR and CI Status

- **PR:** https://github.com/ryanv11/travel-tracker/pull/49
- **CI (GitHub Actions):** All jobs green ✓
  - CI workflow: `completed success`
  - Security Checks: `completed success`

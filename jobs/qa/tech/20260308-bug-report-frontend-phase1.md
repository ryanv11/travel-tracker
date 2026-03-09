# Bug Report — Frontend Phase 1
**Date:** 2026-03-08
**Author:** QA
**Source:** Static code review of Travel Tracker React SPA (Frontend Phase 1)
**Commits reviewed:** b888041, 1989e23

---

## BUG-01 — City markers never displayed on the map

**Severity:** MAJOR
**AC impacted:** AC-05 (city pins for resolved cities)
**BRD requirement:** GE-13 (city pins rendered when geocode_status='resolved')

**Symptom:**
No city pins ever appear on the map regardless of how many trips with resolved
cities exist in the database.

**Root cause:**
`MapPage.tsx` fetches trips via `useTrips()` which returns `TripSummary[]`.
`TripSummary` does NOT include a `places` field — the `GET /api/trips` list
endpoint returns trip metadata only, without nested place/city data.

`CityMarkers.tsx` receives this `TripSummary[]` and uses a type-cast hack:
```
const places = (trip as unknown as { places?: ... }).places ?? [];
```
Since `TripSummary` never has `places`, `places` is always `undefined` and
the fallback `?? []` always returns empty. The GeoJSON FeatureCollection is
always empty. No pins are rendered.

The comment in `CityMarkers.tsx` reads: "In practice, MapPage loads full
TripDetail and casts it here." This comment is aspirational — `MapPage`
actually calls `useTrips()` (summaries), not per-trip detail fetches.

**Scope:**
AC-05 is completely broken. The map will show no city pins in any scenario.

**Proposed fix:**
Either:
(a) Add a dedicated API endpoint to return all cities with resolved geocode
    status (BACKEND change required); or
(b) Change `MapPage` to fetch full trip details for all trips (expensive for
    many trips); or
(c) Modify `GET /api/trips` to include city summary data in the response
    (BACKEND + FRONTEND change).

Option (a) is cleanest. BACKEND to advise. COO sign-off required.

**Blocking:** Yes — AC-05 cannot be signed off until resolved.

---

## BUG-02 — Region shading never applied — ID mismatch

**Severity:** MAJOR
**AC impacted:** AC-04 (region shading at zoom >= 4), MP-02 (region shading)
**BRD requirement:** MP-02

**Symptom:**
When the user zooms to level >= 4 and clicks a country, region shading is
never applied. The region layer renders (the GeoJSON loads), but no regions
receive a fill colour.

**Root cause:**
`RegionLayer.tsx` applies feature-state using the database `region_id`
(integer, e.g. 1, 2, 3) as the MapLibre feature ID:
```
map.setFeatureState(
  { source: 'regions-source', id: region.region_id },
  { colorHex: region.color_hex ?? null },
);
```

But the `regions-source` GeoJSON source uses `promoteId="iso_3166_2"`, which
promotes the `iso_3166_2` property (e.g. "US-CA", "AU-NSW") as the feature ID.

The database `regions` table has no `iso_3166_2` column — only an
auto-increment integer `id`, `country_code`, and `name`. There is no
mapping between DB integer IDs and ISO 3166-2 string codes.

As a result, `setFeatureState` is called with IDs like `1`, `2`, `3` on a
source whose features are addressed as `"US-CA"`, `"AU-NSW"`, etc. The
feature states are never applied to the correct features.

**Scope:**
All region shading (MP-02) is broken. This affects any country where
`region_tier_enabled = true` (US, Australia, Canada, India, etc.).

**Proposed fix:**
The `regions` database table requires an `iso_3166_2` column (e.g. "US-CA").
This is a schema change (requires Architect review and DATABASE migration).
The API response for region shading must include this code, and `RegionLayer`
must use it as the feature identifier instead of `region_id`.

This is a cross-cutting defect affecting DATABASE schema, BACKEND API, and
FRONTEND rendering.

**Blocking:** Yes — AC-04 / MP-02 cannot be signed off until resolved.

---

## BUG-03 — Carry-forward modal never shown (race condition)

**Severity:** MAJOR
**AC impacted:** AC-12 (carry-forward flow)
**BRD requirement:** IT-07

**Symptom:**
After adding a place to a trip that has `next_time` items from a prior visit,
the carry-forward modal never appears. The flow closes silently as if no
candidates exist, even when candidates are present.

**Root cause:**
In `AddPlaceFlow.tsx`, the `useEffect` that triggers the carry-forward modal
fires before the `GET /api/cities/:id/carry-forward` query resolves:

```typescript
const { data: carryForwardCandidates = [] } = useCarryForwardCandidates(
  addedCityId ?? undefined,
);

useEffect(() => {
  if (addedPlaceId !== null && addedCityId !== null && !showCarryForward) {
    if (carryForwardCandidates.length > 0) {
      setShowCarryForward(true);
    } else {
      onClose();  // <-- fires before query resolves
    }
  }
}, [carryForwardCandidates, addedPlaceId]);
```

When `addedCityId` transitions from null to a value:
1. `useCarryForwardCandidates` query becomes enabled and starts fetching
2. On the same render cycle, `carryForwardCandidates` is `[]` (the default
   value — query not yet resolved)
3. The `useEffect` fires with `carryForwardCandidates.length === 0`
4. `onClose()` is called — flow closes before API response arrives
5. When the query resolves with actual candidates, the component is gone

The `isLoading` state from `useCarryForwardCandidates` is never checked.

**Scope:**
IT-07 carry-forward is completely broken for any city with prior `next_time`
items. The modal will only appear correctly for cities with zero candidates
(where the empty default is the correct result).

**Proposed fix:**
Destructure `isLoading` from `useCarryForwardCandidates` and include it in
the condition:
```typescript
const {
  data: carryForwardCandidates = [],
  isLoading: loadingCandidates,
  isFetched: candidatesFetched,
} = useCarryForwardCandidates(addedCityId ?? undefined);

useEffect(() => {
  if (
    addedPlaceId !== null &&
    addedCityId !== null &&
    !showCarryForward &&
    candidatesFetched  // wait for query to settle
  ) {
    if (carryForwardCandidates.length > 0) {
      setShowCarryForward(true);
    } else {
      onClose();
    }
  }
}, [carryForwardCandidates, addedPlaceId, candidatesFetched]);
```

**Blocking:** Yes — AC-12 / IT-07 cannot be signed off until resolved.

---

## BUG-04 — No UI path to revert trip from review_pending to planning

**Severity:** MAJOR
**AC impacted:** AC-13 (post-trip review), AC-08 (status transitions)
**BRD requirement:** TR-05 (user can edit trip before locked)

**Symptom:**
If a trip is in `review_pending` status, the user cannot revert it to
`planning` status from the frontend. There is no button or UI control
to execute this transition.

**Root cause:**
`TripDetailPage.tsx` renders `ReviewPanel` when `trip.status === 'review_pending'`
and `TripDetail` for all other non-locked statuses. `TripDetail` defines the
valid transition `review_pending → planning` ("Return to Planning") in its
`TRANSITIONS` constant, but `TripDetail` is never rendered for
`review_pending` trips.

`ReviewPanel` has no "Return to Planning" action — only "Back to Trip"
(which navigates to /trips without changing status) and "Complete Review &
Lock Trip".

The backend correctly supports the `review_pending → planning` transition
(documented in API reference), but no frontend UI invokes it for this status.

**Scope:**
Any trip accidentally moved to `review_pending` cannot be reverted to
`planning` without a direct API call. Users will be stuck in review mode.

**Proposed fix:**
Add a "Return to Planning" button to `ReviewPanel` that calls
`PATCH /api/trips/:id/status` with `{ status: "planning" }`, with a confirm
dialog ("Cancel review and return to planning?").

**Blocking:** Yes — the full status transition workflow cannot be signed off
until this is resolved.

---

## BUG-05 — "Mark all as Completed" incorrectly includes next_time items

**Severity:** MINOR
**AC impacted:** AC-13 (bulk mark completed)
**BRD requirement:** IT-06, Item Status definitions

**Symptom:**
During post-trip review, clicking "Mark all as Completed" will also update
items with status `next_time` to `completed`. Items explicitly flagged for a
future visit ("I want to do this next time I'm here") should not be
mass-converted to completed.

**Root cause:**
In `ReviewPanel.tsx`, `NON_CANCELLED` is defined as:
```typescript
const NON_CANCELLED: ItemStatus[] = [
  'consider', 'confirmed', 'completed', 'next_time'
];
```

`handleMarkAllCompleted` filters items by `NON_CANCELLED.includes(item.status)
&& item.status !== 'completed'`, which selects `consider`, `confirmed`, AND
`next_time` items for bulk update to `completed`.

`next_time` items semantically mean "did not do on this trip — save for later".
They should never be auto-completed. Only `consider` and `confirmed` items
should be eligible for bulk completion.

**Proposed fix:**
Change `NON_CANCELLED` to:
```typescript
const BULK_COMPLETABLE: ItemStatus[] = ['consider', 'confirmed'];
```
and update the filter accordingly.

**Blocking:** No — does not block other ACs but must be fixed before AC-13
sign-off.

---

## BUG-06 — ShadingTab colour picker uses uncontrolled defaultValue

**Severity:** TRIVIAL
**AC impacted:** AC-17 (colour picker swatch updates live)

**Symptom:**
In the Admin → Map Shading tab, the `<input type="color">` element uses
`defaultValue` (uncontrolled React pattern) instead of `value` (controlled).
The colour swatch and hex text label update correctly after a change, but
the colour picker input element itself does not re-sync if the component
unmounts and remounts or if the underlying data is changed by another
mechanism.

In practice, for a single-user app, this has minimal impact — the user's
own picker interaction keeps the picker in sync with what they selected.
The swatch is the primary visual confirmation.

**Note:** The `onChange` handler fires on every colour change during native
picker interaction, which could result in multiple PATCH calls to the API
while the user is dragging the colour selector. Browser behaviour varies —
most browsers fire `change` only on commit — but this should be confirmed
during live testing.

**Proposed fix:**
Change `defaultValue` to `value={cfg.color_hex}` (controlled). This makes
the picker re-render when the underlying data changes.

**Blocking:** No.

---

## FLAG-F1 — API Reference contains wrong item status terminology

**Type:** Documentation error (not a code bug)
**Owner:** BACKEND
**Related to:** Flag from Frontend handoff

**Finding:**
`jobs/backend/tech/20260307-api-reference.md` (Item Status Values table)
lists:
- `"booked"` — described as "Confirmed/booked"
- `"skipped"` — described as "Decided not to do"

The actual backend implementation uses:
- `"confirmed"` — in Zod schema (common.ts), DB schema (schema.ts CHECK constraint)
- `"cancelled"` — in Zod schema, DB schema

The frontend types and all component code correctly use `confirmed` and
`cancelled`, matching the actual backend. The frontend is correct.

**Action required:**
BACKEND must update the API reference doc to replace `booked` → `confirmed`
and `skipped` → `cancelled`. No code changes required.

---

## BUG-07 — Backend TypeScript: 207 type errors, no type-check script

**Severity:** MAJOR
**AC impacted:** General type safety (all backend endpoints)

**Symptom:**
The backend codebase has 207 TypeScript type errors when checked with the
main `tsconfig.json`. No `type:check` npm script exists for the backend.
The errors are invisible during normal development because `npm run dev:api`
uses `tsx` which ignores type errors, and `npm run type:check` only covers
`tsconfig.frontend.json` (frontend only).

**Error breakdown:**
| TS Code | Count | Category |
|---------|-------|----------|
| TS2349 | 108 | Drizzle ORM union type — db.select/insert/update not callable |
| TS2554 | 39 | Drizzle ORM — argument count mismatch in union overloads |
| TS7006 | 22 | Implicit `any` in callback parameters |
| TS2345 | 27 | Express v5 req.params typed as `string\|string[]`, not `string` |
| TS2339 | 6 | Property access on ambiguous union types |
| TS18046 | 2 | `unknown` type in Zod refine callback (trips.schemas.ts) |
| TS2305 | 1 | `coalesce` imported from drizzle-orm but doesn't exist |

**Root cause (dominant error class):**
`db/index.ts` returns `AppDatabase = LibSQLDb | PgDb` (union type). Drizzle's
`select()`, `insert()`, `update()` methods have incompatible generic signatures
between the two engines, so TypeScript cannot resolve any call on the union.
This is a known limitation with the SQLite/Postgres union approach.

**Functional impact:**
Most errors (TS2349, TS2554) are type-level only and do not affect runtime
behaviour — `tsx` runs the JS output and the DB is one concrete type at
runtime. However, this type safety gap means:
1. Real type errors (wrong arguments, missing fields) in backend changes
   cannot be caught by the compiler
2. The TS2305 `coalesce` import is a dead import of a non-existent function
   (see BUG-08). No runtime impact since it's never called.
3. TS2345 Express params typing could hide real param misuse in future

**Missing infrastructure:**
There is no `tsc` type-check script for the backend. The main `tsconfig.json`
fails before reaching backend code due to a separate config defect (see BUG-09).

**Proposed fix:**
Add a backend type-check script:
  `"type:check:backend": "tsc -p tsconfig.backend.json --noEmit"`

Create `tsconfig.backend.json` excluding frontend and using a typed return
for `AppDatabase` (e.g. typed as `any` with a JSDoc override, or using a
discriminated union with narrowing helpers).

The TS2345 Express params issue requires adding a `as string` cast on
`req.params` values (standard pattern for Express v5 with strict types).

**Blocking:** No — runtime behaviour is unaffected. However, this
significantly reduces type safety for all future backend changes.

---

## BUG-08 — Dead import of non-existent drizzle-orm export (coalesce)

**Severity:** TRIVIAL
**File:** `src/backend/routes/cities.ts` line 9

**Symptom:**
`coalesce` is imported from `drizzle-orm` but does not exist in the
installed version (`drizzle-orm@0.38.3`). The function is imported but
never called anywhere in the file.

At runtime (CJS module resolution), drizzle-orm silently sets the binding
to `undefined`, so the import does not cause a startup crash. If `coalesce`
were ever called, it would throw `TypeError: coalesce is not a function`.

**Proposed fix:** Remove `coalesce` from the import statement in cities.ts.

**Blocking:** No.

---

## BUG-09 — Main tsconfig.json config defect (drizzle.config.ts outside rootDir)

**Severity:** MINOR
**File:** `tsconfig.json`

**Symptom:**
Running `tsc --noEmit` (using the main tsconfig.json) immediately errors:
  `error TS6059: File 'drizzle.config.ts' is not under 'rootDir' '/workspace/src'`

The `include` array in `tsconfig.json` has `"drizzle.config.ts"` at the
project root, but `rootDir` is set to `"./src"`. These are incompatible.

As a consequence, `tsc --noEmit` without a `-p` flag always fails on the
first error and never checks the backend source. Backend type errors are
invisible.

**Proposed fix:**
Either:
(a) Move `drizzle.config.ts` into `src/` (requires updating drizzle-kit config); or
(b) Remove `drizzle.config.ts` from the `include` pattern — it does not need
    TypeScript compilation; or
(c) Set `rootDir: "."` in the main tsconfig and create separate
    `tsconfig.backend.json` and `tsconfig.frontend.json` for per-project checks

**Blocking:** No for runtime. Yes for type-checking integrity — the backend
cannot be type-checked until this is resolved.

---

## NOTE — TS2835 Frontend import extension errors

**Classification:** NOT A BUG (environment issue)

The user noted "Relative import paths need explicit file extensions" errors.
These TS2835 errors (112 occurrences) only appear when frontend files are
checked with the main `tsconfig.json` (which uses `moduleResolution: NodeNext`).

The frontend correctly uses `tsconfig.frontend.json` with
`moduleResolution: bundler`, which is the correct setting for Vite. With this
config, `tsc -p tsconfig.frontend.json --noEmit` produces 0 errors. ✓

The frontend's extensionless imports are valid for a Vite/bundler project.
The TS2835 errors are a false positive caused by checking frontend files
against the wrong tsconfig. No code change required in frontend.

---

## NOTE — Build environment: esbuild platform mismatch

**Classification:** ENVIRONMENT ISSUE (not a code bug)

`node_modules` were installed on macOS (darwin-arm64). The devcontainer runs
Linux (arm64). The `@esbuild/linux-arm64` package is absent; only
`@esbuild/darwin-arm64` is present.

As a result, `npm run dev`, `npm run dev:api`, `npm run build`, and any
`tsx`-based command fail in this container with a platform error.

**Impact on QA:** Live testing (AC-01 through AC-18) cannot be performed in
this environment without `npm ci` to reinstall platform-appropriate packages.

**Fix:** Run `npm ci` in the container to reinstall dependencies for Linux.
This is a devcontainer setup issue, not a code defect.

---

*QA Engineer — 2026-03-08*

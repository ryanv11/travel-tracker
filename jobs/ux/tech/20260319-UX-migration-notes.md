# Migration Notes — Plain CSS to Tailwind + shadcn/ui
**Date:** 2026-03-19
**Author:** UX (UI/UX Designer)
**Brief:** BRIEF-UX-01
**Audience:** Frontend
**Status:** Final

---

## Overview

The current frontend uses 100% inline `React.CSSProperties` — no external CSS files, no CSS Modules, no class-based styling. This is an unusual starting point for a Tailwind migration. It has implications that are different from a typical CSS-to-Tailwind migration.

The good news: there is no existing class name system to audit or conflict with. The migration is cleanly additive.

---

## Current State Summary

- Styling method: inline `style={{}}` on every element
- No CSS files anywhere in `src/frontend/`
- No CSS Modules
- No class names (except MapLibre's `maplibre-gl.css` which is external and must not be changed)
- Global reset injected at runtime via a `<style>` element in `main.tsx`
- `@keyframes spin` injected inside `LoadingSpinner` component on each render

This means the migration is not "move classes from .css to Tailwind" — it is "replace all `style={{}}` props with `className` props."

---

## Order of Operations

Follow this exact sequence. Do not jump ahead. Each step must be complete and verified before the next begins.

### Step 1 — Tailwind installation and base config (P1-01, P1-02)
1. Install Tailwind CSS per current Vite integration docs
2. Create `tailwind.config.ts` with `content` paths pointing to `src/frontend/**/*.{tsx,ts}`
3. Configure semantic colour tokens from the design system spec (Section 2a)
4. Configure font family (Inter), custom `text-md` size token, spacing additions
5. Create `src/frontend/styles/globals.css` with `@tailwind base; @tailwind components; @tailwind utilities;`
6. Import `globals.css` in `main.tsx` — remove the runtime `<style>` element injection
7. Verify Tailwind classes compile and apply on a test element before proceeding

### Step 2 — shadcn/ui initialisation (P1-02)
1. Run `npx shadcn@latest init` with the project's Tailwind config
2. Configure `components.json` to point to `src/frontend/components/ui/`
3. Install the components needed for P0/P1 work: `button`, `input`, `select`, `dialog`, `badge`, `tabs`, `tooltip`, `checkbox`, `separator`
4. Install Sonner: `npx shadcn@latest add sonner`
5. Add `<Toaster />` to `App.tsx`
6. Do NOT customise shadcn components yet — just verify they render correctly with default styles

### Step 3 — Migrate shared components (before touching pages)
Migrate in this order:
1. `LoadingSpinner` — simplest, verifies Tailwind `animate-spin` works
2. `ErrorMessage` — verify colour tokens work
3. `StatusBadge` → shadcn Badge with variant map
4. `RatingStars` — replace `★` with Lucide Star icons
5. `ConfirmDialog` → shadcn Dialog
6. Verify all shared components look correct before moving to page-level components

### Step 4 — Migrate leaf components
Work bottom-up: leaf components before containers.
1. `ItemCard.tsx`
2. `ReviewItemRow.tsx`
3. `TripCard.tsx`

### Step 5 — Migrate container components
1. `PlaceSection.tsx`
2. `TripDetail.tsx`
3. `TripList.tsx`
4. `ReviewPanel.tsx`

### Step 6 — Migrate form modals
1. `ItemForm.tsx`
2. `TripForm.tsx`
3. `AddPlaceFlow.tsx`
4. `CarryForwardModal.tsx`

### Step 7 — Migrate admin components
1. `AdminPanel.tsx` → shadcn Tabs
2. `CategoryTab.tsx`, `ActivityTab.tsx`, `CompanionTab.tsx` → shared `AdminListTab`
3. `ShadingTab.tsx`
4. `CountryTab.tsx`

### Step 8 — Migrate layout (App.tsx + pages)
1. `App.tsx` — nav bar
2. Page-level containers (`TripsPage`, `TripDetailPage`, `AdminPage`, `MapPage`)

---

## Patterns Requiring Special Attention

### Pattern 1 — Inline style objects defined as const outside components
Many files define shared style objects at module scope:

```typescript
// current pattern (e.g. TripCard.tsx)
const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E5E7EB',
  ...
};
```

These must be replaced with `className` strings. The approach is to delete the `const` style objects and apply Tailwind classes directly to the JSX element:

```tsx
// after migration
<div className="bg-surface border border-border-default rounded-lg shadow-sm ...">
```

Do not attempt to preserve the const-style pattern by mapping it to Tailwind objects — just move to inline `className`.

### Pattern 2 — Dynamic inline styles for state-dependent styling
Several components conditionally apply inline styles based on component state. These must become conditional class strings:

```tsx
// current pattern (TripForm.tsx category button)
style={{
  border: selectedCategoryIds.includes(cat.id) ? '2px solid #2563EB' : '1px solid #D1D5DB',
  background: selectedCategoryIds.includes(cat.id) ? '#DBEAFE' : '#fff',
}}

// after migration
className={cn(
  "rounded-full px-3 py-1 text-sm cursor-pointer",
  selectedCategoryIds.includes(cat.id)
    ? "border-2 border-primary bg-primary-subtle text-primary-text"
    : "border border-border-default bg-surface text-secondary"
)}
```

Use the `cn()` utility (from shadcn/ui's `lib/utils.ts`) for all conditional class composition.

### Pattern 3 — onMouseEnter/onMouseLeave for hover effects
`TripCard` and `AddPlaceFlow` city search results use JS `onMouseEnter`/`onMouseLeave` to apply hover styles imperatively:

```tsx
// current (TripCard.tsx)
onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '...'; }}
onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
```

Replace with Tailwind hover utilities:

```tsx
// after migration
className="shadow-sm hover:shadow-md transition-shadow duration-150 cursor-pointer"
```

Remove all `onMouseEnter`/`onMouseLeave` handlers that exist purely for visual hover effects.

### Pattern 4 — Spinner keyframe injection
`LoadingSpinner.tsx` injects a `<style>` tag with `@keyframes spin` on every render:

```tsx
// current
<>
  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  <div style={spinnerStyle} />
</>
```

Replace the entire component with:

```tsx
// after migration
<div className="animate-spin h-5 w-5 border-2 border-border-default border-t-primary rounded-full" />
```

Remove the `<style>` element injection from `main.tsx` global reset too — replace with a `globals.css` using `@tailwind base` which includes Preflight (CSS reset).

### Pattern 5 — maplibre-gl.css must not be affected
`MapView.tsx` imports `'maplibre-gl/dist/maplibre-gl.css'`. This external stylesheet is NOT part of the migration and must not be touched. Tailwind's Preflight reset may conflict with MapLibre's CSS in some minor ways (e.g. button resets affecting MapLibre's zoom controls). Add MapLibre's UI elements to the Tailwind `corePlugins` blocklist or use `@layer` overrides only if conflicts appear. Do not preemptively add overrides.

### Pattern 6 — z-index values
Multiple modal components hardcode z-index values (`zIndex: 500`, `600`, `700`, `800`, `1000`). These are currently kept in sync manually. After migration, define a Tailwind z-index scale in the config:

```typescript
// tailwind.config.ts
extend: {
  zIndex: {
    'nav':     '100',
    'modal':   '500',
    'item-form': '600',
    'add-place': '700',
    'carry-forward': '800',
    'confirm': '1000',
  }
}
```

### Pattern 7 — Grid-based flight form fields
`ItemForm.tsx` uses CSS Grid `gridTemplateColumns: '1fr 1fr'` for the flight fields. In Tailwind this becomes `className="grid grid-cols-2 gap-2"`. The datetime-local inputs within the grid will still be cramped — this is addressed in the backlog (P1 item IF-02) by restructuring the flight form into a logical field grouping rather than a uniform 2-column grid.

---

## Structural Components That May Need Restructuring

### TripForm multi-select (categories / companions / activities)
The current toggle-button pattern for multi-select is custom and functional. With shadcn/ui, the `ToggleGroup` component may be a better fit. However, `ToggleGroup` supports single-select by default. The custom multi-select is fine — keep it, apply Tailwind classes to the buttons.

### AdminListTab (to be created)
The three admin list tab components (Category, Activity, Companion) should be refactored into a shared `AdminListTab` component as part of P1-09. Wait until `CategoryTab` is Tailwind-migrated and stable before extracting the shared component.

### Modal stacking context
All modals use `position: fixed; inset: 0`. This is preserved exactly in Tailwind as `fixed inset-0`. No structural change needed. However, when migrating to shadcn Dialog, confirm that `DialogPortal` renders into the document body (it does by default) — this is important for correct stacking.

---

## Files Where Migration Effort is Highest

| File | Effort | Reason |
|------|--------|--------|
| `ItemForm.tsx` | High | 28 state variables, many inline style objects, dynamic grids |
| `TripForm.tsx` | Medium | Complex multi-select toggle buttons with dynamic styles |
| `AddPlaceFlow.tsx` | Medium | Multi-step flow, dynamic result list styles |
| `TripDetail.tsx` | Medium | Multiple conditional style blocks |
| `AdminPanel.tsx` | Low | Small, structural tabs only |
| `CountryLayer.tsx` / `RegionLayer.tsx` | None | No inline styles (MapLibre specifications only) |
| `CityMarkers.tsx` | None | No inline styles |

---

## What Must NOT Change During Migration

1. **MapLibre/map functionality** — do not touch `MapView.tsx`, `CountryLayer.tsx`, `RegionLayer.tsx`, `CityMarkers.tsx` during styling migration. These files have zero inline styles (they are MapLibre configuration objects). They are correct and should not be modified for styling purposes.

2. **React Query hooks** — migration is purely visual/structural. No hook logic changes.

3. **Business logic** — do not change `filterAndSortTrips`, `buildPayload`, `getItemLabel`, or any logic functions while migrating styles.

4. **API types and calls** — styling migration touches only the render layer.

5. **Geocoding retry logic** — `geocodeRetryQueue` and the `useGeocodeRetryQueue` hook are functional infrastructure. Do not modify during migration.

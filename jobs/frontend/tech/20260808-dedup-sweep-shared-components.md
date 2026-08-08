# QUAL-29/30/31 — New Shared Frontend Abstractions

Reference doc for the three shared abstractions extracted during the
2026-08-08 frontend dedup sweep (chore/frontend-dedup-sweep). See the park
doc (`jobs/frontend/park-docs/20260808-FRONTEND-dedup-sweep-park.txt`) for
the full investigation/decision record; this file is the component-API
reference for future consumers.

## `AdminNameListTab` (QUAL-29)

`src/frontend/components/Admin/AdminNameListTab.tsx`

Generic CRUD list-editor for a "name-list" admin resource (add / rename /
deactivate / re-activate). Consumed by `CategoryTab`, `ActivityTab`,
`CompanionTab`.

```tsx
<AdminNameListTab<Category>
  useList={useCategories}
  useCreate={useCreateCategory}
  useUpdate={useUpdateCategory}
  useDelete={useDeleteCategory}
  addPlaceholder="New category name…"
  loadingMessage="Loading categories…"
/>
```

Type parameter `T extends NameListItem` where
`NameListItem = { id: number; name: string; is_active: boolean | number }`.
The `boolean | number` union exists because `Companion.is_active` is typed
`number` (raw SQLite 0/1) while `Category`/`Activity` are typed `boolean` —
a pre-existing wire-type inconsistency this component does not attempt to
fix, since resolving it is a `types/api.ts` decision outside this refactor's
scope.

**Adding a 4th name-list resource:** add the four CRUD hooks to
`useAdmin.ts` via the `useNameList`/`useCreateNameListItem`/
`useUpdateNameListItem`/`useDeleteNameListItem` private helpers (see their
doc comments), then render `<AdminNameListTab>` with them. Do NOT copy
CategoryTab.tsx as a starting point for a new resource — that pattern is
exactly what this extraction replaced.

**Not covered by this component:** `CountryTab` (read-only, search + toggle,
no add/rename/delete) and `ShadingTab` (color pickers, not names) are
different-shaped resources and were deliberately left out of this
extraction — forcing them through `AdminNameListTab`'s CRUD shape would
change their UX for no benefit.

## `useTripsController` (QUAL-30)

`src/frontend/hooks/useTripsController.ts`

Shared controller for the `/trips` list surface: filter/search/sort state,
FEAT-BD/NTH-01 multi-select bulk-delete-with-5s-undo, and derived values
(`displayedTrips`, `mapFilterLabel` — BUG-80, `tripCount`, `statusCounts`).
Consumed identically by `DesktopTripsLayout` and `MobileTripsLayout`; each
keeps its own markup.

```tsx
const {
  filters, setFilters, searchText, setSearchText, sortBy, setSortBy,
  selectionMode, selectedIds, isDeleting, deleteError, pendingDelete,
  selectedId, navigate,
  trips, isLoading, error, countries,
  displayedTrips, mapFilterLabel, tripCount, statusCounts,
  handleFormClose, clearMapFilter,
  enterSelectionMode, exitSelectionMode, handleCheckChange, handleSelectAll,
  handleBulkDelete, handleUndoDelete,
} = useTripsController();
```

Also exports `STATUS_CHIPS` (the F-07 chip definitions) and `SortOption`
(the sort-key union) — both layouts import these rather than redefining
them.

**What's deliberately NOT in this hook:** anything specific to rendering a
trip *detail* view. `MobileTripsLayout` fetches its own selected-trip data
(`useTrip`), owner info (`useMe`), and manages its own slide/cross-fade
transition state locally — `DesktopTripsLayout` doesn't need any of that
because it renders `<Outlet/>` and lets the route tree handle detail
rendering. If a third trips-list surface is ever added, decide per-surface
whether it needs the mobile-style local detail plumbing or the desktop-style
`<Outlet/>` — this hook only owns the list-panel half either way.

## `ModalOverlay` (QUAL-31)

`src/frontend/components/shared/ModalOverlay.tsx`

Shared modal shell: fixed backdrop + centered white panel + backdrop-click-
to-close + `stopPropagation` on the panel. Adopted at 8 sites (see park doc
for the full list).

```tsx
<ModalOverlay
  onClose={onClose}
  zIndex={700}
  panelClassName="p-6 w-[480px] max-w-[95vw] max-h-[85vh] overflow-y-auto"
>
  {/* modal content */}
</ModalOverlay>
```

Props:
- `zIndex: number` (required) — every existing site uses its own distinct
  value (500/600/700/800/1000) to encode intentional stacking order between
  simultaneously-possible modals; don't collapse these to one default.
  **Passed via `style={{ zIndex }}`, never as a `z-[${n}]` Tailwind class**
  — Tailwind's JIT scanner requires a complete static class string in
  source, so a dynamically-interpolated arbitrary-value class would not be
  discovered and the site would silently lose its stacking order in a
  production build. This is the one non-obvious API decision in this
  component; don't "clean it up" back to a template-literal class name.
- `onClose?: () => void` / `closeOnBackdropClick?: boolean` (default
  `true`) — the only site that opts out is `CarryForwardModal`
  (`closeOnBackdropClick={false}`, no `onClose` passed), preserving its
  pre-existing no-backdrop-dismiss behavior.
- `panelClassName?: string` — Tailwind classes for the inner panel (width,
  padding, max-height, overflow). Every Tailwind-based site uses this.
- `panelStyle?: CSSProperties` — escape hatch for a site with inline-style
  panel needs. Exists solely for `CarryForwardModal`, which predates the
  Tailwind migration for this component and has a custom box-shadow value
  distinct from `shadow-2xl`; kept via `panelStyle` rather than letting the
  extraction silently normalize it away.

**Deliberately not implemented:** ESC-key dismissal, a focus trap, or
`role="dialog"`/`aria-modal`/`aria-labelledby`. None of the 8 original
sites had any of these before the extraction, and adding them here would be
new behavior introduced by what was scoped as a behavior-preserving
refactor. This is flagged in the park doc as a good future UX/accessibility
pass — now cheap to do consistently across all 8 sites at once, precisely
because they're unified — but it needs a UX call on per-site focus/ESC
semantics first, not a silent default in this component.

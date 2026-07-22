# WP-03/WP-04 — Waypoint Trips Reskin (Desktop) + Mobile Trips Layout

**Date:** 2026-07-21
**GitHub:** #205 · **BRD:** §5.16 WP-03, WP-04 · **Branch:** `feat/wp03-wp04-trips-reskin`
**Spec:** `jobs/ux/tech/20260721-UX-waypoint-spec.md` (Phase 2 section, C1-C13)

## Architecture

### Desktop vs mobile split

`TripsLayout.tsx` is now a thin router: `useIsMobile()` (new hook,
`src/frontend/hooks/useIsMobile.ts`, matchMedia `(max-width: 767px)`, matches
Tailwind's `md` breakpoint) decides between:

- `DesktopTripsLayout.tsx` — the pre-existing two-panel shell (left list /
  `<Outlet/>` right panel), reskinned in place, 340px left panel (C10).
- `MobileTripsLayout.tsx` — net-new. Owns BOTH the list and detail views as
  two always-mounted, absolutely-positioned panels (per spec's slide/cross-fade
  transition — both panels must stay mounted so the outgoing one can animate,
  not unmount instantly). Because of this, it does **not** render `<Outlet/>`;
  it reads `:id` via `useParams()` (works fine without Outlet — merged route
  params are available to any component in the matched tree) and fetches/
  branches the detail content itself (loading / error / `review_pending` →
  `ReviewPanel` / detail → `MobileTripDetailView`), mirroring
  `TripDetailPage.tsx`'s own branching so mobile behavior matches desktop
  exactly, including the pre-existing "unlock → review_pending → ReviewPanel,
  not TripDetail" behavior (unchanged, not something this brief altered).

This is a genuine conditional-MOUNT split (not CSS-only hide/show of both
trees) — deliberately, to avoid doubling up accessible-name matches for
existing Playwright specs that assume exactly one instance of shared text/
roles.

### Shared components (used by both breakpoints)

`PlaceSection`, `ItemCard`, `TripItemsSection` are unchanged in logic, reskinned
with Tailwind mobile-first classes plus `max-md:` overrides for the desktop/
mobile pixel differences (14px vs 16px radius, 17px vs 16px city name, etc.) —
since only one of Desktop/MobileTripsLayout is ever mounted at a time (per
`useIsMobile()`), these responsive classes always match the real breakpoint,
so one component serves both contexts without duplication.

`TripCard` takes a new `density?: 'desktop' | 'mobile'` prop for the spec's
deliberate mobile touch-target size bump (16px/16px/18px vs 14px/14px/16.5px).

### New shared logic

- `useTripDetailController.ts` — extracted from the old `TripDetail.tsx`.
  Houses all status-transition/lock/unlock/Photos-toast/modal-toggle state and
  handlers. Both `TripDetail.tsx` (desktop) and `MobileTripDetailView.tsx`
  (mobile) call this hook — only the JSX/markup differs between breakpoints
  (desktop: stepper CTA inline in the card; mobile: separate highlighted
  callout box, per spec).
- `StatusStepper.tsx` — the 4-dot Plan/Active/Review/Locked stepper (replaces
  the old flat status bar, TR-12). Renders ONLY dots/connectors/labels — the
  CTA/hint/Unlock button is composed by the caller since desktop and mobile
  present it differently. `size="desktop" | "mobile"` controls dot/line sizing
  (22px/36px vs 18px/20px). Dot/line state logic (done=pine+checkmark+pine
  line-to-right, current=pine+ordinal, upcoming=neutral) is copied exactly
  from spec — do not add a distinct "current" highlight color, spec is
  explicit that would be a defect.

## Fixes made as part of this brief

1. **badges.ts / theme-waypoint.css**: added `--color-wp-status-completed-bg`/
   `-text` (hue 220, blue) and a `'completed'` `BadgeHue` variant.
   `itemStatusToBadgeHue('completed')` now returns `'completed'` instead of
   the old (incorrect, Phase-1) `'confirmed'`. Confirmed stays hue 150 (green).
   `'next_time'` still returns `null` — CARRIED spec gap, not resolved by this
   brief (no COO/UX-picked hue exists for it yet); `StatusBadge` falls back to
   the neutral `locked` hue rather than inventing one.
2. **StatusBadge.tsx**: now wired to `badges.ts` (`BADGE_HUE_CLASSES`,
   `BADGE_LABELS`, `BADGE_SHAPE_CLASSES`, `BADGE_TEXT_CLASSES`) instead of its
   old inline teal/amber/violet Tailwind classes. New optional `shape?: 'pill'
   | 'chip'` prop (defaults `'pill'`) — chip shape isn't used by StatusBadge
   itself anywhere yet (category chips are hand-rolled inline, not via this
   component) but the shape token lives here per spec's shape recipe so future
   callers don't hand-roll it again.
3. **No `dangerouslySetInnerHTML`** — verified via `grep -rn
   dangerouslySetInnerHTML src/frontend/` returns zero matches project-wide.
4. **EditIcon.tsx** — new pencil glyph (spec §3's "edit/pencil" icon, not in
   either source mockup), registered in `icons/index.ts`. Icon count is now
   13 (WP-02's 12 + this one); `icons.test.tsx` updated accordingly.

## E2E coverage

- Existing desktop specs (`trips-crud`, `trips-filters`, `trips-status`,
  `places-items`, `navigation`, `trips.spec.ts`) all still pass unmodified in
  behavior — two pre-existing specs needed selector updates for INTENTIONAL
  spec-mandated copy changes, not reskin drift:
  - `trips-crud.spec.ts`: `getByText('New Trip')` → `getByRole('heading', {
    name: 'New Trip' })` — the desktop button is now labelled "+ New Trip"
    (was "+ New"), which made the old substring locator ambiguous.
  - `trips-filters.spec.ts`: placeholder text updated to "Search trips or
    places…" (was "Search trips…") — a deliberate spec-mandated copy fix
    (search already matched place names; the shorter placeholder undersold it).
- New `src/e2e/trips-mobile.spec.ts` (18 tests, viewport 390×844): list view
  rendering, FAB, status chips + counts, sort, bulk delete + undo, the
  status-chip-row horizontal-scroll exception (structural `overflow-x: auto`
  check), list↔detail slide transition + deep link, compact Edit/Photos icon
  pair (+ locked-hides-Edit), status stepper transition + Unlock, Set/Edit
  dates + Remove place, trip-level items, rating stars, carried-forward tag
  (via the REAL carry-forward endpoint, not a faked flag), and no-horizontal-
  scroll at 390px/360px with long/varied real data (long trip/city names, long
  item notes).
- All detail-view assertions scope through `getByTestId('trip-detail-panel')`
  per the brief's instruction, rather than `.nth()`/`.first()` — added to both
  `DesktopTripsLayout`'s right panel (already existed, from an earlier thread)
  and `MobileTripsLayout`'s detail-view root (new).

### Playwright gotchas hit and fixed (documented for whoever touches these specs next)

- **Strict-mode violations abort immediately, they do not retry.** A
  substring `getByText()` match against `not.toBeVisible()` fails on the FIRST
  poll if the locator resolves to multiple elements, even if the DOM would
  settle to zero/one matches a moment later. Fix: use `{ exact: true }` (or a
  testid-scoped locator) whenever a superset-text element (e.g. a ConfirmDialog
  whose title/message repeat the target's name) could coexist even briefly.
- **`getByLabel` only associates `<label>`-linked form controls** — a plain
  `<span aria-label="...">` (e.g. `RatingStars`) needs a CSS attribute
  selector (`locator('[aria-label="..."]')`), not `getByLabel`.
- **ADL-14 "lazy creation on first rating"**: `POST /api/trips/:id/items`
  silently ignores a `rating` field at create time — it must be set via a
  follow-up `PATCH`. Seeding a rated item for E2E purposes needs two calls.
- **Carry-forward wire format is snake_case** (`source_item_ids`), not the
  frontend hook's camelCase param name (`sourceItemIds`) — only the hook
  translates it; a raw API call for test seeding must use the wire name.

## Bug discovered (MAJOR) — not fixed in this brief, flagged to COO

See completion report for the full MAJOR bug write-up: `items.carriedFromItemId`
(`src/backend/db/schema.ts`) has no `onDelete` behavior, so deleting a trip
whose item is still referenced as another trip's carry-forward source fails
with a 500 (SQLite FK RESTRICT). Out of Frontend's remit — schema changes
require Architect + Database review (CLAUDE.md). The new carry-forward E2E
test cleans up after itself in the correct order (target trip, then source
trip) to avoid leaving this dangling state for other specs' blanket
`deleteAllTrips()` cleanup.

## Process note (not a bug, an environment gap)

A fresh worktree has no `.env.local` (not shared/symlinked, same category as
the already-documented `node_modules` gap) — `npm run test:e2e`'s webServer
failed with `DB_TYPE: "undefined"` until one was created (copied from
`.env.example`, `DB_TYPE=sqlite`, left ungitignored/uncommitted per project
rules). Worth adding to the worktree-isolation guardrails in CLAUDE.md
alongside the `node_modules` note — flagged to COO, not actioned here (that's
a CLAUDE.md edit, outside this brief's scope).

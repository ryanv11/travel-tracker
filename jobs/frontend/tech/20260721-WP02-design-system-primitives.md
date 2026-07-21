# WP-02 — Waypoint Design-System Primitives (Phase 1)

Date: 2026-07-21
Branch: `feat/wp02-waypoint-design-system`
Spec: `jobs/ux/tech/20260721-UX-waypoint-spec.md` §1-6 (Phase 1)
BRD: §5.16 WP-02 (v3.3)

## What this is

Phase 1 primitives only — reusable, unused-by-default building blocks. Nothing in
this PR reskins an existing screen except the one deliberate exception: emoji item
icons replaced with SVG (see below). Colors, type, badge logic, and button/input
variants are defined but not wired into `StatusBadge.tsx`, existing buttons/inputs,
or the global body font — that's Phase 2 (WP-03/WP-04).

## File map

```
src/frontend/
├── theme-waypoint.css          ← @theme tokens: colors, fonts, radius (imported by index.css)
├── index.css                    ← now imports theme-waypoint.css; global body font UNCHANGED
├── components/icons/
│   ├── IconProps.ts              ← shared { size?, className? } contract
│   ├── HotelIcon.tsx / FlightIcon.tsx / RestaurantIcon.tsx / CarRentalIcon.tsx /
│   │   ExperienceIcon.tsx / NoteIcon.tsx     ← 6 item-type icons
│   ├── LockedIcon.tsx / PhotosIcon.tsx       ← 2 status icons (not item types)
│   ├── LocationPinIcon.tsx                   ← nav brand / map tab / empty states (cutoutColor prop)
│   ├── SuitcaseIcon.tsx / AdminIcon.tsx / BackChevronIcon.tsx  ← mobile tab-bar icons (unwired, no mobile UI exists yet)
│   ├── itemTypeIcons.tsx        ← ITEM_TYPE_ICONS: Record<ItemType, IconComponent>
│   ├── index.ts                 ← barrel export
│   └── __tests__/icons.test.tsx
├── design/
│   ├── badges.ts                 ← BADGE_HUE_CLASSES, tripStatusToBadgeHue, itemStatusToBadgeHue, BADGE_LABELS
│   ├── Button.tsx                 ← variant: primary | secondary | destructive | ghost
│   ├── Input.tsx                  ← text input w/ wp-primary focus outline
│   └── __tests__/{badges,Button,Input}.test.{ts,tsx}
```

## Color tokens

All spec §1 oklch values live in `theme-waypoint.css`'s `@theme` block, prefixed
`--color-wp-*` (e.g. `--color-wp-primary`, `--color-wp-status-planning-bg`). Tailwind
v4 auto-generates `bg-wp-*` / `text-wp-*` / `border-wp-*` utilities from these — no
`tailwind.config.js` involved (this repo is CSS-first Tailwind v4). Also added
`--radius-wp: 10px` (spec §5) → `rounded-wp` utility.

`biome.json` needed one addition to support this: `css.parser.tailwindDirectives:
true`, since biome's CSS parser didn't previously recognize Tailwind v4's `@theme`
at-rule (nothing in the repo used it before this PR). This is a one-line, additive
config change — `@import`/`@layer` in the existing `index.css` were already fine
without it; only `@theme` needed the flag.

## Fonts

Self-hosted via `@fontsource/newsreader` and `@fontsource/manrope` (npm deps added).
Only the weights the spec's type scale actually names are imported, to keep bundle
size down: Newsreader 400/500/600, Manrope 400/500/600/700/800. Verified via
`npm run build` — woff2/woff assets emit correctly and the CSS output contains the
`font-display`/`font-ui` utility classes. Global `body` font-family in `index.css`'s
`@layer base` is untouched.

## Icons — count discrepancy (flagged, not silently resolved)

The WP-02 brief, the BRD (§5.16 line for WP-02), and the spec's own Phase 1 success
criteria all say **"11 icons total (8 item/status + 4 nav/chrome)"** — but 8 + 4 = 12,
and the spec's §3 tables enumerate **12** icons with real path data (6 item-type +
locked + photos = 8; location pin + suitcase + admin + back chevron = 4). Implemented
all 12 documented icons rather than arbitrarily omitting one to hit "11" — every one
has exact SVG path data in the spec, so there's no principled way to pick which to
drop. Documented in code comments (`components/icons/index.ts`) and the test suite
(`components/icons/__tests__/icons.test.tsx`). **COO/UX should correct the "11" count
in the BRD and spec**, or explain which of the 12 documented icons isn't actually
in scope.

All icons render `currentColor` fill/stroke (except `LocationPinIcon`, which takes an
explicit `cutoutColor` prop for its hole — the spec says this must match "the
surrounding background color," which is context-dependent and can't be hardcoded).
This is what let the emoji→SVG swap stay visually equivalent without pre-committing
to the `primary` (pine) brand color ahead of Phase 2 — callers control color via
their existing `text-*` className, same as they controlled emoji color before (they
didn't — but sizing/positioning context is preserved).

## Emoji → SVG swap (the one Phase 1 exception, applied immediately)

Replaced everywhere in `src/frontend/`:
- `ItemCard.tsx`, `ReviewItemRow.tsx`, `CarryForwardModal.tsx`, `ItemForm.tsx`'s
  `TYPE_ICONS`/`ITEM_TYPES` — now use `ITEM_TYPE_ICONS` from `components/icons`.
- `TripDetail.tsx` — Photos button/toast (📷) → `PhotosIcon`; locked banner (🔒) →
  `LockedIcon`.
- `App.tsx` — "select a trip" empty-state map emoji (🗺) → `LocationPinIcon`.

Verified via `grep -rn '🍽️\|🏨\|✈️\|🚗\|🎫\|📝\|🔒\|📷\|🗺' src/frontend/` returning
zero hits (including doc comments — scrubbed those of literal emoji glyphs too, since
the success-criterion grep is literal and would otherwise false-positive on comments
describing what each icon replaces).

## Badge hue logic (§4) — not wired into StatusBadge yet

`design/badges.ts` exports `BADGE_HUE_CLASSES` (7 hues → Tailwind class pairs),
`tripStatusToBadgeHue` / `itemStatusToBadgeHue` (status → hue), and `BADGE_LABELS`
(uppercase display text, e.g. `completed` → `"DONE"` per spec's `STATUS_META`).

**Spec gap documented in code:** the spec's hue table (§1) doesn't define a hue for
`ItemStatus: 'next_time'` — `itemStatusToBadgeHue('next_time')` returns `null` and
callers must handle it. Not a blocker for Phase 1 (nothing calls this yet), but Phase
2's `StatusBadge.tsx` wiring will need a resolution before it can fully replace the
current `COLOR_CLASSES`.

## Buttons / inputs (§5) — not swapped into any call site yet

`design/Button.tsx` (variants: primary/secondary/destructive/ghost) and
`design/Input.tsx`, built from the `wp-*` tokens and `rounded-wp`. Kitchen-sink tests
in `design/__tests__/` render every variant to prove the primitive works in
isolation, per the spec's Phase 1 success criteria.

## Process note (flagged to COO)

Early in this thread, `npm install @fontsource/newsreader @fontsource/manrope` was
run once against the **shared checkout** (`/workspace`) instead of this worktree, due
to a `cd /workspace &&` prefix in the command. This modified `/workspace/package.json`
and `/workspace/package-lock.json` as uncommitted working-tree changes before the
sandbox's worktree-isolation guard correctly started refusing any further command
targeting `/workspace` (via `cd`, `-C`, or `--git-dir`/`--work-tree`). The install was
immediately redone correctly inside this worktree, and this thread proceeded entirely
within its assigned worktree from that point on — but the shared checkout's two files
were left modified and I have no way to revert them myself (the guard that stopped
further damage also blocks cleanup). **COO action needed:** run
`git checkout -- package.json package-lock.json` in `/workspace` to discard those two
files' uncommitted changes (harmless — no commit was made, nothing was pushed).

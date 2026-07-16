# Brief: UX-06 — Restyle admin panel to match app design language

**From:** COO | **To:** Frontend agent | **Date:** 2026-07-16
**Tracker:** UX-06 | **GitHub:** #120 | **Priority:** P3
**Branch:** `feat/ux06-admin-restyle`

## Context

COO UI review (2026-07-16) found the admin panel is the weakest surface — it reads as a
different app from the (good) trips/map screens. Components: `src/frontend/components/Admin/`
(AdminPanel + CategoryTab, ActivityTab, CompanionTab, ShadingTab, CountryTab),
`src/frontend/pages/AdminPage.tsx`.

## Problems to fix (restyle ONLY — no IA, copy, or behaviour changes)

1. **Red overload:** every row has a large solid-red "Deactivate" button — the dominant
   colour of the page is destructive-red. Demote to a quiet secondary/outline/ghost
   treatment; red may appear on hover or in a confirm affordance, not at rest, at scale.
2. **Blue accents:** Add button, active tab, and links are blue; the app is teal
   (see nav in `App.tsx`, trips filter chips in TripList components for the canonical
   accent usage). Align all admin accents to the app's teal + neutral palette.
3. **Tab styling:** restyle the five tabs consistently with the app's existing
   pill/chip/nav conventions.

Study the trips screens' Tailwind classes first and reuse their vocabulary — the goal is
"same app", not a new design. Apply uniformly across all five tabs.

## Success criteria

- No blue accent remnants anywhere under /admin; palette = teal + neutrals, red reserved
- Deactivate visually quiet at rest but still discoverable; all CRUD behaviour unchanged
- E2E admin specs (`src/e2e/admin.spec.ts`) still pass unmodified — they assert behaviour
  via accessible names; if you must touch them, that's a smell your restyle changed behaviour
- Frontend unit tests pass; add/update component tests only if you change structure

## Workflow (per CLAUDE.md)

Branch off main → commit everything → /pre-push → PR titled
`feat(UX-06): restyle admin panel to match app design language (#120)`, body `Closes #120`
→ verify CI green → do NOT merge → completion report text in your final response (COO files it).

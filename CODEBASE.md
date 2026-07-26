# Codebase Guide — Travel Tracker

This document explains the repository structure, technology stack, and agent workflow
system for anyone — human or AI — trying to orient themselves in this codebase.

The short version: this repo contains two things running side by side — a **travel
tracking app** and the **multi-agent AI workflow** used to build it. They share the
same git repo for now. See [Two projects in one repo](#two-projects-in-one-repo) for
the boundary and the plan.

---

## Table of Contents

1. [The App — what it does](#the-app--what-it-does)
2. [Tech stack](#tech-stack)
3. [Repository map](#repository-map)
4. [App source tree (`src/`)](#app-source-tree-src)
5. [Configuration files](#configuration-files)
6. [The agent workflow system (`jobs/`)](#the-agent-workflow-system-jobs)
7. [Project management (`_project/`)](#project-management-_project)
8. [Two projects in one repo](#two-projects-in-one-repo)
9. [CI/CD](#cicd)
10. [Key conventions](#key-conventions)

---

## The App — what it does

Travel Tracker is a personal travel logging app. You record trips, attach places
(cities), and log items within each place — restaurants, hotels, flights, experiences,
notes. Trips progress through a status lifecycle: Planning → Active → Review → Locked.
A world map shows your travel history with country and region shading.

Current delivery target: localhost web app in browser (beta). Architecture is designed
to support packaging as a desktop app (Electron/Tauri) and future iOS migration without
a data model rebuild.

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + Vite | SPA, TypeScript throughout |
| Routing | React Router v6 | URL-driven two-panel layout |
| Server state | TanStack Query v5 | All API calls go through custom hooks |
| Styling | Tailwind CSS v4 | Utility-first, no component library |
| Map | MapLibre GL + react-map-gl | GeoJSON country/region shading |
| Auth | Clerk (React SDK v6) | JWT-based; bypassed in local dev via `BYPASS_AUTH=true` |
| Backend | Express v5 | REST API, TypeScript |
| ORM | Drizzle ORM | Schema-first, typed queries |
| Database | SQLite via libSQL (`@libsql/client`) | Local file; architecture supports Postgres/Turso |
| Validation | Zod v4 | Schema validation on API inputs |
| Security middleware | Helmet, express-rate-limit | Applied in `server.ts` |
| Testing — unit | Vitest + Testing Library | Separate configs for backend/frontend |
| Testing — contract | Vitest | Requires live backend; tests HTTP layer |
| Testing — E2E | Playwright | On-demand only (`npm run test:e2e`); not in CI |
| DB migrations | drizzle-kit | `db:generate` + `db:migrate`; `db:push` is disabled |
| Linting/format | Biome | `npm run check`; enforced in CI |
| Type checking | TypeScript (`tsc --noEmit`) | Separate tsconfigs for frontend/backend |
| CI | GitHub Actions | `ci.yml` + `security.yml` |

---

## Repository map

```
/workspace
├── src/                        App source code (frontend + backend)
├── geo/                        Static GeoJSON data (countries, regions)
├── data/                       Seed data (countries.json, regions.json). The SQLite
│                               file is written to the repo root, not here.
├── tests/                      Contract tests
├── scripts/                    tracker.js — tracker.json dashboard CLI
├── patches/                    patch-package patches (drizzle-kit bug fixes)
├── .github/workflows/          CI/CD pipelines
│
│── jobs/                       Agent workflow — all agent working directories
├── _project/                   Project management artefacts (BRD, tracker, plan)
├── claude-code/                Claude Code tooling, examples, agent scripts
├── _shared/                    Shared reference docs for agents
│
├── CLAUDE.md                   Claude Code project instructions (mandatory reads)
├── CODEBASE.md                 This file
├── README.md                   Setup and run instructions
│
├── package.json                Single package — app + dev tooling
├── vite.config.ts              Vite/frontend build config
├── drizzle.config.ts           Drizzle ORM config (DB path, migrations dir)
├── tsconfig.json               Base TypeScript config
├── tsconfig.frontend.json      Frontend-specific TS config
├── tsconfig.backend.json       Backend-specific TS config
├── vitest.config.backend.ts    Backend unit test config
├── vitest.config.frontend.ts   Frontend unit test config
├── vitest.config.contract.ts   Contract test config
└── playwright.config.ts        E2E test config
```

---

## App source tree (`src/`)

```
src/
├── frontend/
│   ├── main.tsx                React entry point, Clerk + QueryClient providers
│   ├── App.tsx                 Root router
│   ├── index.css               Tailwind entry point + global reset (imports theme-waypoint.css)
│   ├── theme-waypoint.css      Waypoint design-system tokens — colors, fonts (WP-02; wired into
│   │                           Trips/TripDetail UI as of WP-03/WP-04)
│   ├── types/
│   │   └── api.ts              Shared TypeScript types (TripSummary, TripStatus, etc.)
│   ├── pages/                  Route-level page components, used by App.tsx's <Routes>
│   │   ├── MapPage.tsx         Full-screen map page
│   │   ├── TripsPage.tsx       Legacy trips-list page — superseded by TripsLayout (App.tsx routes
│   │   │                       /trips to TripsLayout directly; this file is unreferenced)
│   │   ├── TripDetailPage.tsx  Trip detail or post-trip review, branched by trip status
│   │   └── AdminPage.tsx       Admin panel page
│   ├── hooks/                  TanStack Query hooks — one file per domain
│   │   ├── useTrips.ts
│   │   ├── usePlaces.ts
│   │   ├── useItems.ts
│   │   ├── useAdmin.ts
│   │   ├── useCities.ts
│   │   ├── useMapShading.ts
│   │   ├── useGeocodeRetryQueue.ts
│   │   ├── useMe.ts            Identity endpoint (GET /api/me) — owner-gated nav (BUG-26)
│   │   └── useIsMobile.ts      Viewport breakpoint hook driving the WP-04 mobile layout switch
│   ├── utils/
│   │   ├── apiClient.ts        Centralised fetch() wrapper — base URL, auth token, error handling
│   │   ├── formatDate.ts       ISO date string → human-readable display format
│   │   ├── resolvePlaceDateRange.ts Place date precedence: explicit > hotel dates > trip dates (ADL-24)
│   │   └── urlSanitiser.ts     Restricts user-supplied URLs to https/file schemes (SEC-12)
│   ├── services/
│   │   └── geocodeRetryQueue.ts Offline geocoding status poll with progressive backoff (NR-06)
│   ├── design/                 Waypoint design-system primitives (WP-02, spec §5)
│   │   ├── Button.tsx          Button variants — primitive only, not yet wired into existing screens
│   │   ├── Input.tsx           Text input — primitive only, not yet wired into existing screens
│   │   └── badges.ts           Status/category badge hue lookup, wired into StatusBadge.tsx (WP-03/WP-04)
│   └── components/
│       ├── TripList/           Left panel — trip list, search, filters, sort
│       │   ├── TripsLayout.tsx        Routes to Desktop or Mobile trips layout via useIsMobile
│       │   ├── DesktopTripsLayout.tsx Two-panel shell (list + <Outlet />) for ≥768px viewports
│       │   ├── MobileTripsLayout.tsx  WP-04 single-panel list/detail slide layout for <768px
│       │   ├── TripCard.tsx           Individual trip card
│       │   └── TripList.tsx           filterAndSortTrips utility, shared by both layouts
│       ├── TripDetail/         Right panel — trip detail view and edit form
│       │   ├── TripDetail.tsx  Main detail view (desktop)
│       │   ├── MobileTripDetailView.tsx WP-04 mobile detail view (shares logic via the hook below)
│       │   ├── useTripDetailController.ts Status/lock/modal state shared by desktop + mobile detail views
│       │   ├── StatusStepper.tsx 4-dot status stepper (Plan→Active→Review→Locked), WP-03, satisfies TR-12
│       │   ├── TripForm.tsx    Create/edit trip modal
│       │   ├── AddPlaceFlow.tsx Multi-step modal: city search → create → carry-forward
│       │   ├── PlaceSection.tsx Place card with items list
│       │   ├── PlaceDateForm.tsx Arrived/departed date inputs for a place
│       │   ├── TripItemsSection.tsx Trip-level items with no parent place — flights/car rentals (BUG-36)
│       │   ├── ItemForm.tsx    Add/edit item (hotel, restaurant, flight, etc.)
│       │   └── ItemCard.tsx    Item display card
│       ├── Map/                World map page
│       │   ├── MapView.tsx     Full-screen MapLibre map, click/zoom handlers
│       │   ├── CountryLayer.tsx Country fill shading (feature-state driven)
│       │   ├── RegionLayer.tsx  State/province shading at zoom >= 3
│       │   ├── CityMarkers.tsx  City pins for geocoded cities
│       │   └── MapLegend.tsx    Shading-color legend, data-driven from GET /api/map/shading/config (MAP-02)
│       ├── Admin/              Admin page — categories, activities, companions, map shading, countries
│       ├── CarryForward/       Copy hotels/items from a previous trip
│       ├── PostTripReview/     Post-trip checklist and lock flow
│       ├── icons/              Waypoint SVG icon set (13 glyphs, inline <svg> JSX) — replaced the
│       │                       old emoji-based item/status icons (WP-02, extended WP-03)
│       └── shared/             Reusable primitives (LoadingSpinner, ErrorMessage, etc.)
│
└── backend/
    ├── server.ts               Express app — middleware, route mounting, startup
    ├── server-test-app.ts      Lightweight Express app for backend route unit tests
    │                           (mirrors server.ts's pipeline; contract tests use the real server)
    ├── errors.ts               Typed error classes
    ├── db/
    │   ├── schema.ts           Drizzle schema — single source of truth for DB shape
    │   ├── index.ts            DB client singleton
    │   ├── seed.ts             Seed runner
    │   ├── seed-data.ts        Default category/activity data + map shading defaults (companions
    │   │                       are no longer globally seeded — per-user now, ADL-28)
    │   └── reset-staging.ts    CLI: wipes user/trip data from a Turso DB for PR preview envs;
    │                           refuses to run against a non-"staging" remote URL without an override flag
    ├── migrations/             SQL migration files (generated by drizzle-kit)
    ├── routes/                 Express route handlers — one file per resource
    │   ├── trips.ts
    │   ├── places.ts
    │   ├── items.ts
    │   ├── items-helper.ts     Shared items-with-extensions query logic (used by items.ts and trips.ts)
    │   ├── cities.ts
    │   ├── admin.ts
    │   ├── map.ts
    │   ├── trip-countries.ts
    │   ├── companions.ts       Per-user companions CRUD, requireAuth only (BRD-AD08)
    │   └── me.ts               GET /api/me — authenticated identity + isOwner flag (BUG-26)
    ├── repositories/           DB query layer — called by routes
    │   ├── trips.ts
    │   ├── places.ts
    │   ├── items.ts
    │   ├── users.ts
    │   ├── companions.ts       Per-user companions, every query scoped to userId (BRD-AD08)
    │   └── shadingConfig.ts    Per-user map shading config, lazily seeded on first access (BRD-AD07)
    ├── services/               Business logic that spans multiple repositories
    │   ├── shading.service.ts  Map shading state computation (country + region)
    │   ├── items.service.ts    Carry-forward and item transaction logic
    │   ├── geocoding.service.ts Nominatim geocoding queue
    │   └── startup.service.ts  DB seeding (countries, regions, defaults)
    ├── middleware/             Auth middleware (Clerk JWT verification)
    └── validation/             Zod schemas for request validation
```

### Data flow (request lifecycle)

```
Browser → React component
       → TanStack Query hook (useTrips, usePlaces, etc.)
       → fetch() to Express API (localhost:3001)
       → Auth middleware (JWT check)
       → Route handler (routes/)
       → Repository (repositories/) — Drizzle query
       → SQLite file
```

---

## Configuration files

| File | Purpose |
|---|---|
| `drizzle.config.ts` | Points drizzle-kit at the schema and migrations directory. drizzle-kit compiles this at runtime — the compiled `.js`/`.d.ts` output is gitignored. |
| `vite.config.ts` | Frontend build; proxies `/api` to `:3001` in dev |
| `tsconfig.frontend.json` | Strict TS for `src/frontend/` |
| `tsconfig.backend.json` | TS for `src/backend/` — module resolution differs |
| `.env.local` | Secrets — DB path, Clerk keys, `BYPASS_AUTH`. Never committed. |
| `patches/drizzle-kit+0.31.9.patch` | Fixes 4 drizzle-kit SQLite bugs; auto-applied on `npm install` via patch-package |

---

## The agent workflow system (`jobs/`)

This project is built using a team of specialised AI agents, each with their own
working directory under `jobs/`. The COO (this agent) coordinates; specialists execute.

### Agent roster

Canonical list: `_project/job-registry.txt` (responsibility, system prompt path,
job ID prefix per role). The table below is a short-form summary — update both
when adding a role, not just this one.

| Agent | Directory | Responsibility |
|---|---|---|
| **COO** | `jobs/COO/` | Coordination, prioritisation, PR reviews, session management |
| **PO** (Product Owner) | `jobs/PO/` | UAT, requirements sign-off, verdict on scope |
| **Architect** | `jobs/architect/` | ADL decisions, infrastructure, cross-cutting design |
| **Backend** | `jobs/backend/` | Express routes, repositories, business logic |
| **Frontend** | `jobs/frontend/` | React components, hooks, UI |
| **Database** | `jobs/database/` | Schema changes, migrations, seed data |
| **QA** | `jobs/qa/` | Test suites — unit, contract, E2E |
| **UX** | `jobs/ux/` | UI mockups, design direction, visual specs |
| **Docs** | `jobs/docs/` | User-facing and maintenance documentation |
| **Integrations** | `jobs/integrations/` | Phase 2 notification engine and external integrations (pending, post-MVP) |

### Job directory structure (typical agent)

The structure below is the full layout used by the working software agents. Not every agent
has every subdirectory — the PO role (`jobs/PO/`), being human-driven, holds only its UAT
logs (`uat-log.md`, `uat-archive.md`) and no inbox/outbox/tech tree.

```
jobs/<agent>/
├── <agent>-system-prompt.txt   The agent's full system prompt (defines its role)
├── inbox/                      Briefs from other agents, awaiting action
├── outbox/                     Completed work / responses sent
├── history/                    Archive of completed briefs and sessions
├── park-docs/                  Session state snapshots (what to pick up next time)
├── context/                    Persistent reference material for this agent
└── tech/                       Technical notes and research this agent has produced
```

### How agents communicate

Agents do not call each other directly. Communication is asynchronous via inbox/outbox:

1. COO writes a brief to `jobs/<agent>/inbox/<timestamp>-<topic>.md`
2. Agent picks it up, does the work, pushes a branch + PR
3. Agent writes a completion report to `jobs/COO/inbox/`
4. COO reviews, merges, and closes the loop

The PO (product owner) is human. UAT findings go in `jobs/PO/uat-log.md`.
UAT is a mandatory gate — no phase closes without a PASS verdict.

### Park documents

At the end of each session an agent writes a park document
(`jobs/<agent>/park-docs/<timestamp>-<agent>-park.txt`) summarising decisions made and
the recommended starting point for the next session. This allows sessions to be resumed
cleanly without re-reading all history.

---

## Project management (`_project/`)

| File | Purpose |
|---|---|
| `travel-tracker-BRD.md` | Business Requirements Document — authoritative requirements reference |
| `travel-tracker-standalone-BRD.docx` | Formatted DOCX version of the BRD |
| `travel-tracker-project-audit.md/.docx` | Project audit report (see DOCX for formatted version) |
| `tracker.json` | Live feature/bug/task tracker (JSON, COO-maintained) |
| `project-plan.txt` | High-level phase plan, incl. project objective/launch target |
| `job-registry.txt` | Canonical list of agent roles and responsibilities |
| `test-policy.md` | Testing philosophy and coverage requirements |
| `security-backlog.md` | Known security findings and remediation status |

---

## Two projects in one repo

The `jobs/`, `_project/`, `claude-code/`, and `_shared/` directories are **not app
code**. They are the agent workflow system used to build the app. They never ship in
a deployment bundle.

The current state is intentional — keeping them co-located simplifies the early
workflow while the process matures. The longer-term direction:

- **Near term:** Build and deploy scripts explicitly exclude agent directories.
  The boundary is documented (here) even though the directories co-exist.
- **Longer term:** Extract the generic framework components (`claude-code/`,
  `_shared/`, system prompt templates, job directory conventions) to a separate
  repo. Project-specific agent content (`jobs/`, `_project/`) stays with the app
  repo but is clearly non-app. An ADL decision record will govern the split when
  the workflow is stable enough to extract.

If you are reading this as a developer interested only in the app: everything you need
is in `src/`, `geo/`, `data/`, and the config files at the root. The rest is process.

---

## CI/CD

Two GitHub Actions workflows run on every push and PR:

| Workflow | Jobs |
|---|---|
| `ci.yml` | Biome (lint + format) · Type Check · Backend Tests · Frontend Tests · Contract Tests |
| `security.yml` | Dependency Scan (npm audit) · Secret Scan (Gitleaks) · SAST (Semgrep) |

E2E tests (Playwright) are **not in CI** — run on demand with `npm run test:e2e`.

All jobs must be green before a PR is merged. Contract tests require a live backend; in CI
they run against the **real** server (`npm run start` with `BYPASS_AUTH=true`), not
`server-test-app.ts` — that lightweight app is used only by the backend route unit tests.

---

## Key conventions

- **Schema changes:** always `db:generate` → `db:migrate`. `db:push` is disabled (see `patches/`).
- **Branching:** `feat/`, `fix/`, `chore/` prefixes. Never commit directly to `main`.
- **PRs:** COO reviews and merges. Squash merge is standard.
- **Auth in local dev:** set `BYPASS_AUTH=true` in `.env.local` — the devcontainer
  firewall cannot reach Clerk's JWKS endpoint.
- **Two-panel layout (desktop, ≥768px):** left panel is the trip list; right panel
  (`data-testid="trip-detail-panel"`) is the `<Outlet />` (`DesktopTripsLayout.tsx`).
  Below 768px, `MobileTripsLayout.tsx` (WP-04) renders a single-panel list/detail
  slide layout instead — no `<Outlet />` there, but the same `trip-detail-panel`
  test id is kept on the detail surface. Locators and tests should scope to the
  correct panel/viewport.
- **Agent sections below** are maintained by the relevant agent and may be more
  detailed than what appears here.

---

*Last updated by COO — 2026-07-07. Agent-specific sections appended as agents contribute.*

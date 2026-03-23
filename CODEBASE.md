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
├── data/                       Seed data and DB output directory
├── tests/                      Contract tests
├── scripts/                    Utility scripts (GitHub issue lifecycle etc.)
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
│   ├── types/
│   │   └── api.ts              Shared TypeScript types (TripSummary, TripStatus, etc.)
│   ├── hooks/                  TanStack Query hooks — one file per domain
│   │   ├── useTrips.ts
│   │   ├── usePlaces.ts
│   │   ├── useItems.ts
│   │   ├── useAdmin.ts
│   │   ├── useCities.ts
│   │   ├── useMapShading.ts
│   │   └── useGeocodeRetryQueue.ts
│   └── components/
│       ├── TripList/           Left panel — trip list, search, filters, sort
│       │   ├── TripsLayout.tsx Two-panel shell (list + <Outlet />)
│       │   ├── TripCard.tsx    Individual trip card
│       │   └── TripList.ts     Filter/sort logic (pure function)
│       ├── TripDetail/         Right panel — trip detail view and edit form
│       │   ├── TripDetail.tsx  Main detail view
│       │   ├── TripForm.tsx    Create/edit trip modal
│       │   ├── AddPlaceFlow.tsx Multi-step modal: city search → create → carry-forward
│       │   ├── PlaceSection.tsx Place card with items list
│       │   ├── PlaceDateForm.tsx Arrived/departed date inputs for a place
│       │   ├── ItemForm.tsx    Add/edit item (hotel, restaurant, flight, etc.)
│       │   └── ItemCard.tsx    Item display card
│       ├── Map/                World map page
│       │   ├── MapView.tsx     Full-screen MapLibre map, click/zoom handlers
│       │   ├── CountryLayer.tsx Country fill shading (feature-state driven)
│       │   ├── RegionLayer.tsx  State/province shading at zoom >= 3
│       │   └── CityMarkers.tsx  City pins for geocoded cities
│       ├── Admin/              Admin page — categories, activities, companions
│       ├── CarryForward/       Copy hotels/items from a previous trip
│       ├── PostTripReview/     Post-trip checklist and lock flow
│       └── shared/             Reusable primitives (LoadingSpinner, ErrorMessage, etc.)
│
└── backend/
    ├── server.ts               Express app — middleware, route mounting, startup
    ├── server-test-app.ts      Lightweight Express app for contract tests (no auth)
    ├── errors.ts               Typed error classes
    ├── db/
    │   ├── schema.ts           Drizzle schema — single source of truth for DB shape
    │   ├── index.ts            DB client singleton
    │   ├── seed.ts             Seed runner
    │   ├── seed-data.ts        Default category/activity/companion data
    ├── migrations/             SQL migration files (generated by drizzle-kit)
    ├── routes/                 Express route handlers — one file per resource
    │   ├── trips.ts
    │   ├── places.ts
    │   ├── items.ts
    │   ├── cities.ts
    │   ├── admin.ts
    │   ├── map.ts
    │   └── trip-countries.ts
    ├── repositories/           DB query layer — called by routes
    │   ├── trips.ts
    │   ├── places.ts
    │   ├── items.ts
    │   └── users.ts
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

### Job directory structure (same for every agent)

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
| `project-plan.txt` | High-level phase plan |
| `objective.txt` | Project goals and success criteria |
| `job-registry.txt` | Canonical list of agent roles and responsibilities |
| `test-policy.md` | Testing philosophy and coverage requirements |
| `security-backlog.md` | Known security findings and remediation status |
| `document-index.txt` | Index of all project documents |

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
| `ci.yml` | Type Check · Backend Tests · Frontend Tests · Contract Tests |
| `security.yml` | Dependency Scan (npm audit) · Secret Scan (Gitleaks) · SAST (Semgrep) |

E2E tests (Playwright) are **not in CI** — run on demand with `npm run test:e2e`.

All jobs must be green before a PR is merged. Contract tests require a live backend;
in CI they run against a test Express app (`server-test-app.ts`).

---

## Key conventions

- **Schema changes:** always `db:generate` → `db:migrate`. `db:push` is disabled (see `patches/`).
- **Branching:** `feat/`, `fix/`, `chore/` prefixes. Never commit directly to `main`.
- **PRs:** COO reviews and merges. Squash merge is standard.
- **Auth in local dev:** set `BYPASS_AUTH=true` in `.env.local` — the devcontainer
  firewall cannot reach Clerk's JWKS endpoint.
- **Two-panel layout:** left panel is the trip list; right panel (`data-testid="trip-detail-panel"`)
  is the `<Outlet />`. Locators and tests should scope to the correct panel.
- **Agent sections below** are maintained by the relevant agent and may be more
  detailed than what appears here.

---

*Last updated by COO — 2026-03-23. Agent-specific sections appended as agents contribute.*

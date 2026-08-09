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
9. [Environments](#environments)
10. [CI/CD](#cicd)
11. [Key conventions](#key-conventions)

---

## The App — what it does

Travel Tracker is a personal travel logging app. You record trips, attach places
(cities), and log items within each place — restaurants, hotels, flights, experiences,
notes. Trips progress through a status lifecycle: Planning → Active → Review → Locked.
A world map shows your travel history with country and region shading.

The app is a hosted web app (Railway + Turso, see [Environments](#environments) below),
accessed via browser, with real authentication (Clerk) — NF-09. Architecture is designed
to support future iOS migration without a data model rebuild (NF-06); a packaged desktop
app (Electron/Tauri) was considered and dropped (OQ-02, RESOLVED 2026-07-18).

In the running app, the product name is **Waypoint** — the nav bar, browser tab title,
and other in-app copy render "Waypoint," not "Travel Tracker" (WP-01). Repo name, this
document, and other project-identity artifacts outside the running app are explicitly
out of scope for that rename.

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
| Database | SQLite via libSQL (`@libsql/client`) | Turso (hosted libSQL) in staging and production (ADL-32); local file (`file:./dev.db`) in local dev only |
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
│   │   ├── useHealth.ts        Build identity (GET /health) — feeds the nav build stamp (QUAL-26)
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
    │   ├── admin.ts             Instance-admin only now: countries + regions (categories/activities
    │   │                       moved out, see below — ADL-46)
    │   ├── map.ts
    │   ├── trip-countries.ts
    │   ├── companions.ts       Per-user companions CRUD, requireAuth only (BRD-AD08)
    │   ├── categories.ts       Per-user trip categories CRUD, requireAuth only, moved off
    │   │                       /api/admin/categories (ADL-46/AD-09, same move as companions)
    │   ├── activities.ts       Per-user activities CRUD, requireAuth only, moved off
    │   │                       /api/admin/activities (ADL-46/AD-09)
    │   ├── geocode.ts          User-interactive geocode proxy — requireAuth, routed through the
    │   │                       nominatim-client.ts egress chokepoint (ADL-46 D7)
    │   └── me.ts               GET /api/me — authenticated identity + isOwner flag (BUG-26)
    ├── repositories/           DB query layer — called by routes
    │   ├── trips.ts
    │   ├── places.ts
    │   ├── items.ts
    │   ├── users.ts
    │   ├── companions.ts       Per-user companions, every query scoped to userId (BRD-AD08)
    │   ├── tripCategories.ts   Per-user trip categories, every query scoped to userId (ADL-46)
    │   ├── activities.ts       Per-user activities, every query scoped to userId (ADL-46)
    │   └── shadingConfig.ts    Per-user map shading config, lazily seeded on first access (BRD-AD07)
    ├── services/               Business logic that spans multiple repositories
    │   ├── shading.service.ts  Map shading state computation (country + region)
    │   ├── items.service.ts    Carry-forward and item transaction logic
    │   ├── geocoding.service.ts Nominatim geocoding queue
    │   ├── nominatim-client.ts Single serialized Nominatim egress chokepoint — every geocode call
    │   │                       site (queue, city create, proxy route) goes through this one module
    │   │                       (ADL-46 §5.1.1/D7)
    │   ├── db-errors.ts        isUniqueViolation() — shared UNIQUE-constraint detection across the
    │   │                       raw libsql client and drizzle-orm's wrapped error shape (BUG-75 v3)
    │   ├── startup.service.ts  DB seeding (countries, regions, defaults)
    │   └── build-info.ts       Deployed commit SHA for /health + the nav build stamp (QUAL-26)
    ├── middleware/             Auth middleware (Clerk JWT verification)
    └── validation/             Zod schemas for request validation
```

### Data flow (request lifecycle)

```
Browser → React component
       → TanStack Query hook (useTrips, usePlaces, etc.)
       → fetch() to Express API
       → Auth middleware (JWT check)
       → Route handler (routes/)
       → Repository (repositories/) — Drizzle query
       → SQLite (local dev: local file · staging/production: Turso, ADL-32)
```

In local dev, the API is a separate process on `localhost:3001` (Vite proxies `/api` to
it). In staging and production, one Railway service serves both the built frontend
(`express.static` + SPA fallback) and the API from the same origin — there is no
separate API host to name. See [Environments](#environments).

---

## Configuration files

| File | Purpose |
|---|---|
| `drizzle.config.ts` | Points drizzle-kit at the schema and migrations directory. drizzle-kit compiles this at runtime — the compiled `.js`/`.d.ts` output is gitignored. |
| `vite.config.ts` | Frontend build; proxies `/api` to `:3001` in dev |
| `tsconfig.frontend.json` | Strict TS for `src/frontend/` |
| `tsconfig.backend.json` | TS for `src/backend/` — module resolution differs |
| `.env.local` | Secrets — DB path, Clerk keys, `BYPASS_AUTH`. Never committed. Local dev only — staging and production set the equivalents below via Railway's variable store (per-environment, never in a committed file). |
| `patches/drizzle-kit+0.31.9.patch` | Fixes 4 drizzle-kit SQLite bugs; auto-applied on `npm install` via patch-package |

Staging and production (Railway) set these in place of `.env.local`'s local-dev values
(ADL-32 §7):

| Variable | Purpose |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Hosted libSQL connection — separate credentials per environment (production DB vs. staging/preview DB) |
| `HOST=0.0.0.0`, `NODE_ENV=production` | Bind for Railway's proxy; local dev stays `127.0.0.1` |
| `ALLOWED_ORIGINS` | CORS + Clerk `azp` allowlist — must include the environment's actual scheme-qualified origin (`https://...`), not just the bare hostname. A missing `https://` scheme on staging's value caused a full white-screen CORS failure (BUG-59) |
| `CLERK_JWKS_URI`, `CLERK_ISSUER`, `OWNER_CLERK_ID`, `VITE_CLERK_PUBLISHABLE_KEY` | Clerk auth, carried over from local dev's equivalents |
| `VITE_MAPTILER_KEY` | Map tile provider key |
| `VITE_API_BASE_URL` | Deliberately left **unset** in staging/production (same-origin API+frontend service) — a placeholder value here breaks routing, it must be a true unset so the frontend falls back to relative paths |
| `BYPASS_AUTH` | Never set in staging or production — a `NODE_ENV === 'production'` guard makes it a fatal error if it is (SE-06) |

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

## Environments

Three environments, each a Railway environment watching a different ref, per ADL-32
(platform/database choice) and ADL-35/OP-22 (the two-environment promotion model):

| Environment | Watched ref | Deploys when | Database |
|---|---|---|---|
| **Local** | — (not Railway) | `npm run dev` / `npm run dev:api` | Local SQLite file (`SQLITE_PATH=file:./dev.db`) |
| **Staging** | `main` | Continuously — every merge to `main`, gated on CI green | Staging Turso instance |
| **Production** | `production` branch | Explicitly — only when `production` is fast-forwarded to a soaked `main` commit and pushed | Production Turso instance |
| **Preview** (per-PR, optional) | PR head | Automatically per open PR | Staging Turso instance (shared, never production) |

**Promotion is a manual, zero-glue fast-forward, not a tag or a GitHub Action:**

```
git fetch origin
git merge --ff-only origin/main   # while on a local `production` branch
git push origin production
```

Railway's own branch-watching does the deploy — there is no CI job or script that
triggers a production deploy. This is a deliberate choice (ADL-35): using Railway's
native branch-watching for both environments avoids hand-rolled deploy glue (a
`flyctl`/`railway up`-style CI step), and fast-forward-only promotion makes it
structurally impossible for a commit to reach `production` without having first been an
ancestor of `main` (i.e. already soaked on Staging).

`production` is **never a PR target** and agents never touch it — the branch-per-brief
workflow (`feat/`/`fix`/`chore` off `main`, PR back to `main`) is unaffected; promotion is
a separate, COO-driven step after a merge, only when a change is ready for prod rather
than just staging.

Because GitHub check runs attach to a commit SHA (not a branch), a fast-forwarded commit
carries its already-green `main` checks — Railway's CI gate is satisfied immediately, no
redundant CI run. The one exception is `security.yml`'s dependency-scan job, which is
excluded from the `production` push trigger entirely (ADL-40) because `npm audit`'s
verdict can change with the calendar alone, which would otherwise make a previously-green
promotion candidate spuriously fail on `production` with no code change. See
[CI/CD](#cicd) for detail.

`npm run db:reset-staging` (`src/backend/db/reset-staging.ts`) wipes user/trip data from
a Turso database so preview environments don't accumulate cruft across PRs — it refuses
to run against any remote URL that doesn't look like the staging instance, without an
explicit override flag.

Staging and production currently share one Clerk user pool (a topology question tracked
separately, not yet decided).

---

## CI/CD

Two GitHub Actions workflows:

| Workflow | Jobs | Push trigger |
|---|---|---|
| `ci.yml` | Biome (lint + format) · Type Check · Backend Tests · Frontend Tests · Contract Tests | Every branch (`branches: ["**"]`) + every PR to `main` |
| `security.yml` | Dependency Scan (npm audit) · Secret Scan (Gitleaks) · SAST (Semgrep) | Every branch **except `production`** (ADL-40) + every PR to `main` |

E2E tests (Playwright) are **not in CI** — run on demand with `npm run test:e2e`.

All jobs must be green before a PR is merged. Contract tests require a live backend; in CI
they run against the **real** server (`npm run start` with `BYPASS_AUTH=true`), not
`server-test-app.ts` — that lightweight app is used only by the backend route unit tests.

**Why `security.yml` excludes `production` (ADL-40):** `npm audit` queries the GitHub
Advisory Database at run time, so its verdict depends on the calendar as well as the
commit — an identical tree can pass on `main` one day and fail after a new advisory
publishes, with no code change. Since `production` is only ever fast-forwarded from an
already-green `main` commit (never a PR target — see
[Environments](#environments)), that commit's GitHub check runs (keyed to the commit SHA,
not the branch) are already green from when it ran on `main`; re-running a time-varying
check on `production` could only ever produce a false block on promotion, never real new
detection. `ci.yml` is deliberately unchanged and still gates every environment.

Merging a PR to `main` triggers Railway's Staging deploy once CI is green (see
[Environments](#environments) for the full promotion model) — this is the same
push-to-`main` deploy behaviour as before, just no longer the only environment `main`
drives.

---

## Key conventions

- **Schema changes:** always `db:generate` → `db:migrate`. `db:push` is disabled (see `patches/`).
- **Branching:** `feat/`, `fix/`, `chore/` prefixes. Never commit directly to `main`.
- **PRs:** COO reviews and merges. Squash merge is standard.
- **Auth in local dev:** set `BYPASS_AUTH=true` in `.env.local` to work without a
  signed-in Clerk session. (Clerk's JWKS host is allowlisted and **reachable** from the
  container — verified 2026-08-08, returns keys — so this is a dev convenience, not a
  firewall limitation. Probe before re-asserting otherwise.)
- **Two-panel layout (desktop, ≥768px):** left panel is the trip list; right panel
  (`data-testid="trip-detail-panel"`) is the `<Outlet />` (`DesktopTripsLayout.tsx`).
  Below 768px, `MobileTripsLayout.tsx` (WP-04) renders a single-panel list/detail
  slide layout instead — no `<Outlet />` there, but the same `trip-detail-panel`
  test id is kept on the detail surface. Locators and tests should scope to the
  correct panel/viewport.
- **Agent sections below** are maintained by the relevant agent and may be more
  detailed than what appears here.

---

*Last updated by Docs — 2026-08-08 (QUAL-07 docs-drift pass: routes/repositories/services trees
refreshed against src/backend/ — categories.ts, activities.ts, geocode.ts, tripCategories.ts
repository, nominatim-client.ts and db-errors.ts services were all live and undocumented). Agent-specific sections appended as agents contribute.*

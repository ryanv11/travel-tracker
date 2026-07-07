# OP-08 Complete — Custom Semgrep Security Rules

**Branch:** `feat/op08-semgrep-security-rules`
**PR:** https://github.com/ryanv11/travel-tracker/pull/94
**CI:** All jobs green (Security Checks + CI both pass)

---

## Deliverables

### `.semgrep/security.yml` (new file)
Custom Semgrep ruleset with file header per brief spec (ADL-29).

**Rule 1: `express-route-no-auth` (ERROR) — ACTIVE**
Flags route files in `src/backend/routes/*.ts` that import neither `requireAuth` nor `requireOwner`. Scope limited to `src/backend/routes/*.ts`, excluding `__tests__/` and `items-helper.ts`.

**Rule 2: `drizzle-unscoped-user-table` (WARNING) — COMMENTED OUT**
Drizzle's fluent query API produces deeply nested AST nodes that Semgrep's generic TypeScript pattern matching cannot reliably traverse. The `pattern-not` for chained `.where(...userId...)` does not match through multi-level method chains. Attempting to activate this rule would flag every chained query in `shading.service.ts` regardless of the JOIN-based userId scoping. Commented out with `# TODO: Rule 2 — see ADL-29` and a detailed rationale note in the YAML. A GitHub issue should be raised to revisit with Semgrep Pro taint tracking.

### `.github/workflows/security.yml` (updated)
Added `--config .semgrep/security.yml` to the Semgrep SAST step alongside the existing rulesets.

---

## Suppressions added

**`items-helper.ts`** — excluded via `paths.exclude` in the rule (not a route file; shared query helper with no route handler patterns).

**`trips.ts`** — 8 suppressions (all route handlers including `.use()` for nested routers):
`tripsRouter.use`, `tripsRouter.get` (×2), `tripsRouter.post`, `tripsRouter.patch` (×4), `tripsRouter.delete`

**`places.ts`** — 7 suppressions:
`placesRouter.get`, `placesRouter.post` (×3), `placesRouter.patch`, `placesRouter.delete` (×2)

**`items.ts`** — 4 suppressions:
`itemsRouter.get`, `itemsRouter.post`, `itemsRouter.patch`, `itemsRouter.delete`

**`trip-countries.ts`** — 2 suppressions:
`router.post`, `router.delete`

**Suppression justification (all 4 files):** `requireAuth` is applied globally via `app.use('/api/', requireAuth)` in `server.ts`. These route files intentionally omit per-file auth imports; auth is guaranteed at the app layer.

**Suppression format used:** `// nosemgrep: travel-tracker.express-route-no-auth -- reason: <justification>` placed on the line immediately preceding each route handler call (Biome-compatible position; Semgrep honours leading-line nosemgrep comments).

---

## Pre-push checks

- `npm run check` (Biome) — pass
- `npm run type:check:all` — pass
- `npm run test:backend` — 376 tests pass
- `npm run test:frontend` — 78 tests pass

## CI status

Both `Security Checks` and `CI` jobs green on the PR and latest push.

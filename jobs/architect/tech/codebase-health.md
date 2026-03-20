# Travel Tracker — Codebase Health Assessment
**Author:** Architect
**Format:** Living document — append new assessments to the History table and update the Latest Assessment section. Do not delete prior entries.

---

## How to Run This Assessment

This is the project's own health scoring methodology, calibrated for the Travel Tracker stack. It replaces depwire's health score, which is inaccurate for this codebase (see CLAUDE.md for depwire limitations).

### Scoring dimensions and weights

| Dimension | Weight | What to evaluate |
|-----------|--------|-----------------|
| Coupling | 25% | Layer violations, direct db access from routes, cross-domain service queries, circular deps |
| Cohesion | 20% | Query logic in route files, services crossing domain boundaries, band-aid split files |
| Circular Dependencies | 20% | `depwire health` or `depwire parse` — this dimension IS accurate in depwire |
| God Files | 15% | Files with unrelated responsibilities; large symbol counts from `depwire list_files --directory src` |
| Orphans & Dead Code | 10% | Genuine unreachable application code; do NOT use depwire's orphan/dead-code output (false positives) |
| Dependency Depth | 10% | Max import chain depth within frontend and backend independently; target ≤5 per side |

### Grading scale
| Score | Grade |
|-------|-------|
| 90–100 | A |
| 80–89 | B |
| 70–79 | C |
| 60–69 | D |
| <60 | F |

### Files to read for each dimension

**Coupling:** `src/backend/db/index.ts` imports list, `depwire impact_analysis getDb` (count direct dependents), `src/backend/routes/*.ts` import blocks.

**Cohesion:** `src/backend/routes/trips.ts` (helper functions — do they belong in repositories/services?), `src/backend/services/*.ts` (cross-domain queries?), any `*-helper.ts` spillover files.

**Circular Dependencies:** `depwire health /workspace` — Circular Dependencies dimension only. This one is reliable.

**God Files:** `depwire list_files --directory src` symbol counts. Flag any route file >30 symbols or service file >60 symbols. Verify by reading — tree-sitter inflates counts with local variable declarations.

**Orphans & Dead Code:** Read `src/backend/middleware/auth.ts` (is it still a stub?), check for any TODO (Phase 2) blocks that were never actioned. Do not use depwire dead-code output.

**Dependency Depth:** Trace the longest import chain manually from a page/server entry point. Count hops.

### Known stack-specific considerations
- **Drizzle table symbols** (`trips`, `items`, etc.) are invisible to depwire — never use depwire impact analysis on schema objects.
- **`import type` statements** are not tracked by depwire — `src/frontend/types/api.ts` will always appear orphaned; it is not.
- **`jobs/database/tech/`** files are the database agent's working copies — not application code, not orphans.
- **`claude-code/` and `scripts/`** directories are tooling — exclude from application health assessment.

---

## Score History

| Date | Overall | Coupling | Cohesion | Circ. Deps | God Files | Orphans | Depth | Key driver |
|------|---------|----------|----------|------------|-----------|---------|-------|------------|
| 2026-03-20 | 82/B | 75/C | 70/C | 100/A | 80/B | 85/B | 85/B | ADL-18 not yet implemented (direct db access from routes) |

---

## Latest Assessment — 2026-03-20

**Overall: 82/100 — Grade: B**

```
┌─────────────────────────┬────────┬────────┬────────┐
│ Dimension               │ Score  │ Grade  │ Weight │
├─────────────────────────┼────────┼────────┼────────┤
│ Coupling                │  75    │  C     │  25%   │
│ Cohesion                │  70    │  C     │  20%   │
│ Circular Dependencies   │ 100    │  A     │  20%   │
│ God Files               │  80    │  B     │  15%   │
│ Orphans & Dead Code     │  85    │  B     │  10%   │
│ Dependency Depth        │  85    │  B     │  10%   │
└─────────────────────────┴────────┴────────┴────────┘
```

**Coupling — 75/C**
Layering is correct throughout: validation/db → services → routes → server on the backend; hooks/utils → components → pages on the frontend. No layer violations in either direction. The drag: 13 files import `getDb` directly and pull Drizzle table objects into route handlers. This is the ADL-18 violation — route files are coupled to the database layer rather than to a repository interface. Known, planned.

**Cohesion — 70/C**
Services are genuinely focused — geocoding owns Nominatim, shading owns shading computation, items.service owns carry-forward and lock enforcement. Route files are focused by resource. The issue: `trips.ts` contains `getTripOrThrow`, `replaceAssociations`, `getTripAssociations`, and `buildTripResponse` as module-private helpers — these are repository/service concerns living in a route file. `assertNotLocked` in `items.service.ts` queries the `trips` table directly, a cross-domain reach. `items-helper.ts` is a band-aid split that signals `items.ts` grew past its natural size. All resolves with ADL-18.

**Circular Dependencies — 100/A**
Zero. Confirmed. Clean.

**God Files — 80/B**
Three large files: `schema.ts` (57 symbols — appropriate, it is the schema), `shading.service.ts` (50 symbols — appropriate, multi-path shading computation), `trips.ts` (47 raw symbols — inflated by inline helper functions that belong in repositories). None are doing unrelated things; size is domain-justified except in `trips.ts`.

**Orphans & Dead Code — 85/B**
No genuine dead application code. `auth.ts` is a live SEC-09 stub with exactly 2 dependents (server.ts, server-test-app.ts) — seam is clean for Clerk replacement per ADL-20. No unreachable routes or unused exports identified.

**Dependency Depth — 85/B**
Backend: server → routes → services → db = 4 levels. Frontend: pages → components → hooks → apiClient = 4 levels. Validation adds one layer where needed. Max depth 7 is end-to-end across the full stack, not within either side alone.

**Expected trajectory:** Coupling and Cohesion should each improve ~10 points once ADL-18 repository layer is implemented. Target post-ADL-18 score: ~90/A.

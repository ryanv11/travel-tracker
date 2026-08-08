# Cleanup Wave Plan — post-audit code-hygiene + tracked QUAL backlog

**Author:** COO · **Date:** 2026-08-08 · **Status:** PROPOSED — awaiting PO approval to execute.
**Distinct from** `backlog-clearance-plan.md` (that plan cleared the dogfooding *feature* backlog;
this one clears *cleanup/tech-debt* work). Cross-linked from that doc's change log.

## 1. Thesis
Almost all of this is **independent, mostly-mechanical, single-file** work. The efficient shape
is **file-partitioned parallel sweeps**: batch many small items into a few briefs grouped so that
**no two concurrent agents touch the same file** (the real collision risk under worktree
isolation). Group by area/owner, one worktree-isolated agent per lane. Reserve individual briefs
only for the few items that carry a real correctness risk or need a decision first.

## 2. Inventory (two buckets + verify-first)
Source: the 2026-08-07 audit×tracker scan (Explore) + tracker query.

### Bucket A — untracked audit findings (need tracker IDs; U1–U15 from the scan)
Concentrated in `middleware/auth.ts`, `server.ts`, `.semgrep/security.yml`,
`services/shading.service.ts`, `repositories/items.ts`. Several already carry Ryan's disposition
from the audit answer-sheet (U5/U9/U10/U11/U15).

### Bucket B — already-tracked open cleanup (QUAL/DEP/OP)
QUAL-02, QUAL-04, QUAL-07, QUAL-08, QUAL-10, QUAL-12, QUAL-13, QUAL-14, QUAL-16, QUAL-18, QUAL-19,
QUAL-21, QUAL-22, QUAL-23, QUAL-28, QUAL-29, QUAL-30, QUAL-31, QUAL-32, DEP-03 (GitHub-Actions
Node 20), OP-15. (BUG-82 a11y is backlogged separately.)

### Verify-first (cheap, do before anything)
- **QUAL-14** — MapView zoom comment: code already reads `zoom >= 3`; looks fixed by an
  intervening PR → verify + close, don't brief.
- **OP-06 §2** — historical `FAIL` rows in the access-matrix table read alarmingly but are a
  retained historical column; confirm they're clearly labelled, no code work.

## 3. Lanes (file-partitioned for zero-collision parallelism)

| Lane | Owner | Items | Files (partition) | Batch? |
|---|---|---|---|---|
| **L1 Backend hygiene sweep** | backend | U2 (auth-stub header), U3 (semgrep false comment), U4 (dead shading code), U5 (credentials comment), U6 (vestigial await-import), U11 (dead eslint-disable), U12 (rating-sort dead branch) | `server.ts`, `.semgrep/security.yml`, `shading.service.ts`, `repositories/items.ts`, `routes/cities.ts`, `error-handler.ts` | one brief |
| **L2 Frontend dedup sweep** | frontend | QUAL-29 (admin triplication), QUAL-30 (TripsLayout dup), QUAL-31 (ModalOverlay extract), QUAL-04 (dead code), U9 (useUpdateTrip shading invalidation — real bug) | `Admin/*`, `*TripsLayout`, modal sites, `hooks/useTrips.ts` | one brief (U9 called out as a real fix, not cosmetic) |
| **L3 Docs sweep** | docs | U14 (tech-blueprint stale), QUAL-10 (duplicate schema copy), QUAL-07 (standing docs-vs-code audit), QUAL-13 (stale inbox), QUAL-16 (frameworks.txt ambiguity) | `jobs/architect/tech/*`, `jobs/database/tech/schema.ts`, `_shared/frameworks.txt` | one brief |
| **L4 Test-coverage** | qa | QUAL-02 (assertion strength), QUAL-21 (resolve-then-create route cov), QUAL-22 (ATDD mock drift) | `**/__tests__/*` | one brief |
| **L5 Ops/infra** | coo/architect | QUAL-32 (branch/worktree prune), QUAL-12 (current.txt collision), DEP-03 (Actions Node 20), QUAL-28 (allowlist IP-vs-host) | infra/config | COO-direct + 1 architect item |

### Decision-gated — NOT in the mechanical sweeps (need a call/review first)
- **U1 (HIGH):** `requireAuth` `catch {}` swallows *all* errors into an unlogged 401 — a real
  correctness/observability bug, security-adjacent. **Own brief**, backend, with a test; not a blind sweep.
- **U13 (HIGH-trap):** `DB_TYPE=postgres` looks like a working switch but feeds sqlite defs to a pg
  driver. Decision: label as scaffolding, or remove. → **Architect call**, then act.
- **U10 (MED):** transaction-convention contradiction (`db.transaction()` vs `:memory:` warning) —
  Ryan "not sure" → **Architect**.
- **U15 (LOW):** `asyncHandler` possibly vestigial under Express 5 — Ryan "have Architect review" → **Architect**.
- **U7/U8 (MED):** routes→repo layering inversion; `buildApp()` factory — structural, backend, review-worthy.
- **QUAL-08 (P2):** `sanitiseUrl()` zero call sites + `photo_album_ref` scheme validation — is it dead
  code to remove, or a missing wiring? Decide before acting.
- **QUAL-18/19 (P1/P2):** CSP env-parity — this is genuine environment work (E2E serves via vite
  preview, no CSP header), not a sweep. Its own effort; likely needs Architect.

## 4. Sequencing
- **Wave 0 (COO, minutes):** verify-first (QUAL-14 close, OP-06 §2 glance); create tracker IDs for
  U1–U15 (grep max+1 per prefix — the lesson from this session's two dup-ID slips); COO-direct ops
  (QUAL-32 careful branch/worktree prune).
- **Wave 1 (parallel, no decisions):** L1 + L2 + L3 + L4 dispatched **concurrently** (disjoint files,
  worktree-isolated). Each opens its own PR; merged independently as they go green.
- **Wave 2 (decision-gated):** one Architect mini-pass covering U10/U13/U15/U7/U8/QUAL-08 dispositions
  → then the resulting fixes (some fold back into a backend brief). U1 as its own tested brief.
- **Wave 3:** CSP env-parity (QUAL-18/19) as a dedicated effort if the PO wants it in this pass.

## 5. Parallelism guardrails (so the fleet doesn't collide)
- Each lane is **worktree-isolated** and owns a **disjoint file set** — no two Wave-1 agents touch
  the same file. (L1 backend files vs L2 frontend files vs L3 docs vs L4 tests are naturally disjoint.)
- Each agent branches off `main`, opens its own PR — no shared branch, no shared `current.txt` write
  in the same region (QUAL-12 is itself on the list; until fixed, each agent appends a dated block).
- Merge as-they-land; `update-branch` any that fall behind. Main CI verified green after each merge.
- Batch many small items per lane into **one brief** rather than one-per-item — fewer dispatches,
  same coverage.

## 6. Expected shape
~**40 items → ~4 parallel Wave-1 sweep briefs + 1 Wave-0 COO pass + ~2 decision-gated briefs**,
across ~2–3 merge sessions. CSP env-parity optionally a 3rd wave.

## 7. Open calls for the PO
1. **Scope:** run the full plan, or just the high-value slice (U1 auth bug, U9 shading-invalidation
   bug, the HIGH doc-in-code lies U2/U3, dead code U4/QUAL-04)?
2. **Aggressiveness:** how many parallel Wave-1 agents at once (4 lanes = 4 concurrent)?
3. **CSP env-parity (QUAL-18/19):** in this cleanup pass, or its own dedicated effort later?

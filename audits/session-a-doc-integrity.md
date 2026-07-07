# Session A — Documentation Integrity Audit

**Date:** 2026-07-07 · **Auditor:** Claude (read-only session) · **Repo state:** main @ 0a39162

## Checkpoint list

| # | Document | Status |
|---|----------|--------|
| 1 | CLAUDE.md | DONE |
| 2 | CODEBASE.md | DONE |
| 3 | README.md | DONE |
| 4 | .claude/skills/coo-startup/SKILL.md | DONE |
| 5 | .claude/skills/pre-push/SKILL.md | DONE |
| 6 | _project/travel-tracker-BRD.md | DONE |
| 7 | _project/security-spec.md | DONE |
| 8 | _project/security-backlog.md | DONE |
| 9 | _project/hardening-gate.md | DONE |
| 10 | _project/test-policy.md | DONE |
| 11 | _project/project-plan.txt | DONE |
| 12 | _project/job-registry.txt | DONE |
| 13 | _project/dependency-graph.txt | DONE |
| 14 | _project/seed-data.txt | DONE |
| 15 | _project/travel-tracker-project-audit.md (+ .docx) | DONE |
| 16 | _project/travel-tracker-standalone-BRD.md (+ .docx) | DONE |
| 17 | jobs/architect/tech/20260307-architecture-decisions-log.md | DONE |
| 18 | jobs/architect/tech/20260307-tech-blueprint.md | DONE |
| 19 | jobs/architect/tech/20260307-ER-schema.md | DONE |
| 20 | jobs/architect/tech/20260307-map-shading-spec.md | DONE |
| 21 | jobs/architect/tech/ADL-24-place-date-ranges.md | DONE |
| 22 | jobs/architect/tech/ADL-26-region-aware-map-filtering.md | DONE |
| 23 | jobs/architect/tech/ADL-27-admin-role-model.md | DONE |
| 24 | jobs/architect/tech/ADL-28-per-user-shading-companions.md | DONE |
| 25 | jobs/architect/tech/OP-06-hardening-checklist.md | DONE |
| 26 | jobs/architect/tech/codebase-health.md | DONE |
| 27 | jobs/backend/tech/20260307-api-reference.md | DONE |
| 28 | jobs/frontend/tech/20260308-frontend-component-reference.md | DONE |
| 29 | jobs/qa/tech/ (3 files, snapshot reports) | DONE (light pass) |
| 30 | jobs/ux/tech/ (6 files, snapshot reports) | DONE (light pass) |
| 31 | jobs/PO/uat-log.md + uat-archive.md | DONE (light pass) |
| 32 | .depwire/ (13 files, untracked tool output) | DONE |
| 33 | Audit 3 — consolidation map | DONE |

## 1. Doc inventory

### In scope

**Always-loaded / entry-point docs**
- `CLAUDE.md` — project instructions for Claude Code agents: dev commands, git workflow, mandatory gates, key file pointers.
- `CODEBASE.md` — full repository map with per-directory/per-file descriptions.
- `README.md` — human-facing project overview and quick start.
- `.claude/skills/coo-startup/SKILL.md` — COO session-startup audit checklist skill.
- `.claude/skills/pre-push/SKILL.md` — mandatory pre-push checklist skill.

**`_project/` — COO-maintained project documents**
- `travel-tracker-BRD.md` — business requirements document (claims v2.7).
- `security-spec.md` — security specification.
- `security-backlog.md` — security work backlog.
- `hardening-gate.md` — OP-06/NR-14 hardening gate status document.
- `test-policy.md` — testing policy.
- `project-plan.txt` — phase plan.
- `job-registry.txt` — registry of agent jobs/briefs.
- `dependency-graph.txt` — task dependency graph.
- `seed-data.txt` — seed data definitions.
- `tracker.json` — feature/bug tracker (data file; checked for consistency with docs, not audited line-by-line).
- `travel-tracker-project-audit.md` / `.docx` — external project audit (md is a 3-line pointer).
- `travel-tracker-standalone-BRD.md` / `.docx` — standalone BRD variant (md is a 3-line pointer).

**`jobs/architect/tech/` — Architect decision & spec documents**
- `20260307-architecture-decisions-log.md` — ADL: numbered architecture decisions (primary rationale document).
- `20260307-tech-blueprint.md` — stack blueprint.
- `20260307-ER-schema.md` — entity-relationship schema spec (claims authoritative status).
- `20260307-map-shading-spec.md` — map shading algorithm spec.
- `ADL-24-place-date-ranges.md`, `ADL-26-region-aware-map-filtering.md`, `ADL-27-admin-role-model.md`, `ADL-28-per-user-shading-companions.md` — standalone decision records.
- `OP-06-hardening-checklist.md` — security hardening checklist (referenced by CLAUDE.md as authoritative).
- `codebase-health.md` — codebase health baseline.

**Worker tech docs**
- `jobs/backend/tech/20260307-api-reference.md` — API endpoint reference.
- `jobs/frontend/tech/20260308-frontend-component-reference.md` — frontend component reference.
- `jobs/qa/tech/` — test plan, bug report, contract-test coverage plan (dated snapshots).
- `jobs/ux/tech/` — UX audit, backlog, design system, migration notes, mockup deltas (dated snapshots).
- `jobs/PO/uat-log.md`, `uat-archive.md` — UAT verdicts.

**Untracked tool output**
- `.depwire/` — 13 generated docs (ARCHITECTURE, API_SURFACE, FILES, etc.), untracked in git, apparently produced by a "depwire" analysis tool. Audited for whether they can safely be trusted/committed.

### Excluded from audit (with reason)
- `claude-code/` — vendored copy of the Anthropic claude-code OSS repo (its README describes the npm package, not this project). Not project documentation. **Flagged for consolidation:** its presence in the repo is itself a question (see Questions).
- `playwright-report/`, `test-results/` — generated test artifacts.
- `jobs/*/inbox/`, `jobs/*/history/` — inter-agent correspondence. Treated as **provenance evidence** for Audit 2, not as living documentation to be audited for drift.
- `node_modules/`, `dist/` — build output.

### Ground truth baseline used
- `package.json` (scripts, deps, `engines.node >=22`), `src/backend/db/schema.ts` (21 tables), `src/backend/` layout (routes: admin, cities, items, map, places, trip-countries, trips; middleware: auth, requireOwner, validate, error-handler), 8 migrations (0000–0007), `.github/workflows/ci.yml` (biome, typecheck-all, backend, frontend, contract jobs) + `security.yml`, `drizzle.config.ts`, git log through 0a39162.

## Executive summary & coverage statement

**Coverage:** Audits 1 and 2 got a full claim-by-claim pass on docs 1–28 and 32 (all entry-point docs, all `_project/` docs, all Architect docs, both worker references). Docs 29–31 (QA/UX/PO snapshots, 9 files) got an honest **light pass** — headers plus targeted checks of claims presenting as currently authoritative. Audit 3 was completed from the accumulated findings. Inbox/history correspondence was used as provenance evidence, not audited. Nothing was modified except this report.

**Headline:** the codebase's *decision hygiene* is unusually good — the ADL log is dated, triggered, cross-referenced, and verifies against code almost line-for-line; genuinely confabulated rationale is rare (one SUSPECT citation found, in security-backlog.md). The real problem is **freeze drift**: point-in-time documents that were accurate when written, still present themselves as authoritative, and were never updated after the two big pivots (auth pulled into Phase 1; the 2026-03-23 security sprint).

**HIGH-severity drift (would mislead an agent into wrong action):**
1. **OP-06 checklist** — six FAIL / two PARTIAL security verdicts, all since fixed (PRs #80–#94), never flipped. CLAUDE.md points agents here as the reference. (doc 25)
2. **README env vars** — documents `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`, neither used; omits the four live auth vars; `.env.example` also incomplete → documented fresh setup fails. (doc 3)
3. **security-spec.md** — "binding" doc still says auth is a Phase-1 stub. (doc 7)
4. **ER-schema.md** — cited as "authoritative" by `schema.ts:15` but missing the entire auth/ownership layer (users, trip_countries, is_owner, user_id FKs, place dates). (doc 19)
5. **API reference** — no authentication documentation at all, post-NR-14. (doc 27)
6. **CODEBASE.md** — says the firewall can't reach Clerk (fixed by HC-01) and that contract tests run against `server-test-app.ts` (they run the real server). (doc 2)
7. **project-plan.txt** — frozen at "Phase 2 active / BRD v2.3", yet was just made the official home of the project objective. (doc 11)

**Systemic pattern worth fixing once, not per-doc:** documents here declare authority ("binding", "authoritative", "single source of truth", "implement from this document") and then freeze. Five docs claim authority over security alone. The consolidation map (§4) proposes one canonical home per topic.

## 2. Drift findings (Audit 1)

*Per-document tables below (severity/classification/evidence/disposition in each doc's section).*

## 3. Provenance findings (Audit 2)

*Per-document tables below. Rollup: overwhelmingly TRACED (the ADL log and BRD changelog are the backbone); PLAUSIBLE-UNTRACED items are process rules (COO-merges convention, UAT gate origin, co-location rationale, pre-push exception, QA-live-testing exemption); the single SUSPECT item is security-backlog H1's citation "issues #1–4, merged 2026-03-20" (issue #3 is unrelated; date is the issues' creation, not the merge).*

## 4. Consolidation map (Audit 3)

### Overlap clusters and disagreements

**Cluster A — Security status (worst overlap in the repo).** Five documents describe security posture and three claim authority: `security-spec.md` ("binding on all jobs"; says auth is a stub), `security-backlog.md` ("the authoritative record"; says auth is done), `hardening-gate.md` (gate definitions; checkboxes frozen pre-sprint), `OP-06-hardening-checklist.md` (CLAUDE.md calls it the reference; verdicts frozen pre-fix), BRD §5.11 (SE-01–07 requirements — the only one that is currently accurate). They actively disagree on whether auth exists, whether admin routes are guarded, and whether shading is scoped.
*Proposed canonical split:* BRD §5.11 = requirements ("what must be true"); OP-06 checklist = the single living status document ("what is true"), updated with PASS + commit citations; hardening-gate.md = gate definitions only, statuses removed in favour of pointers to OP-06; security-spec.md Phase 1 controls sections survive as reference, with the auth sections stamped SUPERSEDED → ADL-20/27/29; security-backlog.md merges into tracker.json (it duplicates the tracker's job).

**Cluster B — Repo structure & stack.** CODEBASE.md, README.md, tech-blueprint, and `.depwire/ARCHITECTURE|FILES` all describe structure/stack. Disagreements: better-sqlite3 vs libsql (blueprint stale), CI job list, contract-test app, firewall reachability.
*Proposed:* CODEBASE.md = canonical map; README = human setup only (no duplicated architecture); blueprint stamped "historical — superseded by ADL log for anything post-2026-03-07"; `.depwire/` deleted or regenerated on demand, never treated as documentation.

**Cluster C — Schema.** `schema.ts` (real source), ER-schema.md (stale, but *pointed to as authoritative by schema.ts itself*), ADL-16/19/23/24/27 (the actual evolution record).
*Proposed:* schema.ts stays the single source of truth; fix the `schema.ts:15` comment to say "ER-schema.md v1.1 = original design (historical); evolution recorded in the ADL"; ER doc gets a historical banner like ADL-24's merge banner.

**Cluster D — API surface.** api-reference (stale by omission), frontend component reference hook table (wrong methods/paths), `.depwire/API_SURFACE.md` (March snapshot).
*Proposed:* api-reference = canonical, brought current (auth section + missing endpoints); the frontend reference should stop duplicating API paths entirely and defer to the api-reference — duplicated path tables are how the POST/PATCH divergence happened.

**Cluster E — Project status & plan.** project-plan.txt and dependency-graph.txt (both frozen 2026-03-08), tracker.json (live), park docs (session state). The deletion of objective.txt (0a39162) made frozen project-plan.txt the official objective home — a bad landing spot.
*Proposed:* tracker.json = only live status source; plan + dependency graph stamped HISTORICAL at top; project objective moved to a short section in CODEBASE.md or a one-page refreshed project-plan (needs Ryan, Q8).

**Cluster F — Duplicated artifacts.** BRD pointer/DOCX copies in `_project/` and `jobs/COO/inbox/reference/`; `claude-code/` vendored clone described as repo content.
*Proposed:* `_project/` is the only home for project documents; inbox copies archived/deleted; claude-code/ either removed or documented in CODEBASE.md as "local git-ignored clone of the upstream claude-code repo, not project content".

### Proposed target structure & load order for a fresh agent

**Always-loaded (context):**
1. `CLAUDE.md` — rules, commands, environment facts (fix the firewall line). Keep lean.

**First reads for any task (load on demand, in this order):**
2. `CODEBASE.md` — orientation map (fix the CI/firewall/claude-code claims).
3. `_project/tracker.json` (via `scripts/tracker.js`) — what's open/current.
4. `_project/travel-tracker-BRD.md` — requirements (fix header version).
5. `jobs/architect/tech/20260307-architecture-decisions-log.md` — the "why" (add ADL-28 entry).

**Task-specific references (on demand):**
- Backend/API work: api-reference (after refresh), OP-06 checklist (after status flip), test-policy (after 423→403 fix).
- Schema work: schema.ts + ADL entries; ER doc only for original design intent.
- Frontend work: UX design-system doc *after* the shadcn/ui question is resolved.

**Mark historical (keep, banner at top, never load as current truth):**
tech-blueprint, ER-schema, project-plan.txt, dependency-graph.txt, security-spec auth sections, QA/UX dated snapshots, frontend component reference (or refresh it).

**Merge:** security-backlog → tracker.json; hardening-gate statuses → OP-06.

**Delete (pending Ryan):** `.depwire/` (untracked), duplicate BRD/audit copies in `jobs/COO/inbox/reference/`, possibly `claude-code/` clone.

## 5. Questions for Ryan

1. **OP-06 checklist statuses:** HC-01…HC-07c, ADL-27, and OP-08 all merged (PRs #80–#94) but the checklist still shows 6× FAIL / 2× PARTIAL. May I (in a writing session) flip the verified items to PASS with commit citations — or do you want an independent re-verification first? *(Also: the agent-memory note "gate BLOCKED, 4 FAIL/2 PARTIAL" is stale and updated per this audit.)*
2. **Local real-auth:** the firewall now allows Clerk JWKS (HC-01), but CLAUDE.md/CODEBASE.md still say it's unreachable and GitHub issue #23 is still open. Is real-JWT local dev confirmed working, so the docs can be fixed and #23 closed? Is `BYPASS_AUTH=true` still the intended local default?
3. **Depwire:** it was removed by commit 3823044, but an untracked `.mcp.json` re-registers it and `.depwire/` output (dated 2026-03-20) sits in the working tree. Deliberate re-adoption (needs an ADL per the Architect-involvement guardrail) or leftover to delete?
   > RESOLVED (2026-07-07) by Ryan: leftover, not re-adoption — "we tried depwire and it wasn't worth incorporating; we took some ideas from it, but that's about it." `.depwire/` and `.mcp.json` deleted from the working tree; commit 3823044's removal stands. Remaining follow-up: strip the depwire steps from the codebase-health.md methodology (doc 26, doc-fix queue).
4. **`claude-code/` clone:** why is a git-ignored clone of the upstream claude-code repo in the workspace, and should CODEBASE.md keep describing it as project content slated for extraction?
5. **BRD v2.7 sign-off:** every changelog entry lists you as approving author except v2.7 (SE-01–07), which lists only "COO". Do you retroactively approve §5.11 as written?
6. **Product direction conflict:** BRD §3/NF-01 still promise a solo, offline-capable local Mac app, while §5.11 + the shipped code mandate Clerk-authenticated multi-user operation (internet-dependent). Which is the real target, and should NF-01/§3 be rewritten?
7. **Locked-trip status code:** code and API reference return 403; test-policy §5 specifies 423. Is 403 the intended contract (so the policy gets fixed), or was 423 a real requirement that was silently dropped?
8. **Project objective home:** objective.txt was deleted on the grounds that project-plan.txt holds the objective, but project-plan.txt is frozen at 2026-03-08 (BRD v2.3, "Phase 2 active"). Refresh it, or move the objective into CODEBASE.md and stamp the plan historical?
9. **`jobs/PO/screenshots/`:** CLAUDE.md and the UAT log both direct screenshots there, but the directory doesn't exist. Were screenshots ever stored (deleted?) or never used — i.e. fix the docs or create the directory?
10. **DOCX artifacts:** are `travel-tracker-standalone-BRD.docx` and `travel-tracker-project-audit.docx` still load-bearing? The standalone BRD DOCX predates BRD v2.5–2.7 and can't be diffed in-repo.
11. **shadcn/ui:** the UX design system ("single source of truth for Frontend") specifies Tailwind + shadcn/ui (Radix), but no Radix/shadcn package was ever installed. Was dropping shadcn a decision (worth recording) or drift the Frontend agent introduced?
12. **Electron:** ADL-06 decided Electron for packaging; BRD OQ-02 still shows the question open. Still the plan, so OQ-02 can be closed out in the BRD?

---

# Per-document findings

## 1. CLAUDE.md

**Overall accuracy:** High. Commands, scripts, schema pointer, patch mechanism, gh workflow, and skill references all check out against `package.json`, the repo layout, and the GitHub API (`delete_branch_on_merge: true` confirmed live). The drift is concentrated in environment/process claims that changed after the doc was written.

### Drift findings

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | CLAUDE.md "Firewall allows: GitHub, npm registry, Anthropic API only" | `.devcontainer/init-firewall.sh:76` also allows `just-raptor-89.clerk.accounts.dev` (Clerk JWKS), added in HC-01 (commit d6c9236). An agent debugging a network failure to Clerk would wrongly conclude it's firewalled. Also `statsig.anthropic.com` and sentry appear in the allowlist. | Fix doc |
| LOW | STALE | CLAUDE.md "Screenshots are stored in `jobs/PO/screenshots/`" | Directory does not exist; `jobs/PO/` contains only `uat-log.md` and `uat-archive.md`. Either screenshots were never stored or the dir was cleaned. | Confirm with Ryan (was it deleted, or never used?) |
| LOW | STALE | CLAUDE.md "Branching (adopted 2026-03-21)" | Commit 27a6ff4 "chore: adopt feature branch workflow + GitHub Issues" is dated **2026-03-20** (and 5b139c5, merge-workflow doc, also 2026-03-20). Off-by-one-day; cosmetic. | Fix doc |
| LOW | CONTRADICTORY | CLAUDE.md Key files: "BRD (v2.7)" vs `_project/travel-tracker-BRD.md` header "**Version:** 2.5" | BRD's own changelog goes to 2.7, so CLAUDE.md agrees with the changelog; the BRD **header** is the stale element (logged again under doc 6). Noting here because an agent reading only the BRD header would think CLAUDE.md is wrong. | Fix BRD header |

Verified (no finding): all listed npm scripts exist; `db:push` absent from scripts and patch `patches/drizzle-kit+0.31.9.patch` present with `postinstall: patch-package`; ports 3001/5173 (`src/backend/server.ts:51`, `vite.config.ts:6`); repo `ryanv11/travel-tracker` (git remote); OP-06 §2 access matrix and ADL-15 exist at cited locations; `/coo-startup` and `/pre-push` skills exist; migrations workflow scripts exist.

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| `db:push` forbidden because of four drizzle-kit SQLite bugs (ADL-15) | TRACED | ADL-15 in `jobs/architect/tech/20260307-architecture-decisions-log.md:258`; patch file exists; pinned `drizzle-kit: 0.31.9` in package.json |
| Success-criteria gate "Adopted 2026-07-07 after finding no definition-of-done doc… objective.txt stub deleted" | TRACED | Commit 0a39162 (2026-07-07) deletes `_project/objective.txt` and states this exact rationale in the commit message |
| Feature-branch workflow adoption | TRACED | Commit 27a6ff4 (2026-03-20), though the doc's date is off by a day |
| Auto-delete remote branches on merge | TRACED | Commit 5b139c5 + GitHub API confirms `delete_branch_on_merge: true` today |
| Security checklist rationale (OP-06/ADL-27) | TRACED | ADL-27 doc + commits 5ade19e (requireOwner), 80de82c (ADL-27 corrections) |
| "COO reviews and merges PRs — agents do not merge their own" | PLAUSIBLE-UNTRACED | Consistent with commit/PR pattern, but no dated decision record found stating it |
| "UAT is a mandatory gate for phase completion" | PLAUSIBLE-UNTRACED | `jobs/PO/uat-log.md` exists and is used, but no decision record establishes the gate itself |

## 2. CODEBASE.md

**Overall accuracy:** Good on the source tree (frontend/backend file listings verified file-by-file — hooks, components, db/, routes/, services/ all exist as described) and on the tech stack table (all versions match package.json). The drift is in the CI description, the firewall/Clerk claim, and the framing of `claude-code/`. Last-updated stamp (2026-07-07, commit 0a39162) is genuine, but that update focused on the agent roster and missed older claims.

### Drift findings

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| HIGH | STALE | CODEBASE.md §Key conventions: "set `BYPASS_AUTH=true` — the devcontainer firewall **cannot reach Clerk's JWKS endpoint**" | `.devcontainer/init-firewall.sh:76` allowlists `just-raptor-89.clerk.accounts.dev` since HC-01 (commit d6c9236, 2026-03-23). Real-auth testing is now possible in the container; an agent believing otherwise would never exercise the actual JWT path. | Fix doc |
| HIGH | STALE | CODEBASE.md §CI/CD: "Contract tests… in CI they run against a test Express app (`server-test-app.ts`)" | `ci.yml:74` starts the **real** server (`npm run start`) with `BYPASS_AUTH=true`; `server-test-app.ts` is imported only by backend route unit tests (`src/backend/routes/__tests__/*.test.ts`, run under `test:backend`). An agent debugging contract-test CI failures would inspect the wrong app entry point. | Fix doc |
| MED | STALE | CODEBASE.md repository map + §Two projects: `claude-code/` described as "Claude Code tooling, examples, agent scripts" slated for extraction | `claude-code/` is a git-ignored (`git check-ignore` confirms; zero tracked files) vendored clone of Anthropic's claude-code OSS repo. It is not repo content at all; an agent could waste effort "extracting" or editing files that aren't tracked. | Fix doc; confirm with Ryan why the clone is there |
| LOW | CONTRADICTORY | CODEBASE.md §CI/CD job list ("Type Check · Backend Tests · Frontend Tests · Contract Tests") vs its own tech-stack row ("Biome… enforced in CI") | `ci.yml` has **5** jobs including `biome` (added commit e9249b6). The CI/CD section omits it; the tech-stack table has it right. | Fix doc |
| LOW | STALE | CODEBASE.md repository map: `scripts/` = "Utility scripts (GitHub issue lifecycle etc.)" | `scripts/` contains only `tracker.js`, a tracker.json dashboard CLI. No GitHub-issue tooling present. | Fix doc |
| LOW | STALE | CODEBASE.md repository map: `data/` = "Seed data and DB output directory" | `data/` holds `countries.json`/`regions.json` seed data only; the SQLite file (`dev.db`) is written to the repo root (`SQLITE_PATH=file:./dev.db`). | Fix doc |
| LOW | STALE | CODEBASE.md §Job directory structure "(same for every agent)" | `jobs/PO/` has none of the listed subdirectories — only `uat-log.md` and `uat-archive.md`. (PO is human, so this is understandable, but the doc says "every agent".) | Fix doc |
| LOW | STALE | CODEBASE.md source tree: `TripList/TripList.ts` "(pure function)" | Actual file is `TripList.tsx`. | Fix doc |
| MED | STALE | `drizzle.config.ts:7` header comment: "npm run db:push → apply schema directly to the database (dev shortcut)" | Inline doc in code, counted here: `db:push` was removed from package.json and is forbidden per ADL-15 and CLAUDE.md. The config file still advertises it as a normal workflow. | Fix comment (in a writing session) |

Verified (no finding): tech-stack versions (React 18, Router v6, TanStack v5, Tailwind v4, Clerk React v6, Express v5, Zod v4, Biome, Playwright, drizzle-kit pinned 0.31.9); helmet + express-rate-limit in `server.ts`; security.yml = npm audit (HIGH+) + Gitleaks + Semgrep; E2E absent from CI; full frontend component/hook tree; `db/` files; `data-testid="trip-detail-panel"` in `TripsLayout.tsx`; agent roster matches `jobs/` directories incl. docs & integrations; `job-registry.txt` declares itself canonical and CODEBASE defers to it (consistent both ways).

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| Agent roster is a summary of canonical `job-registry.txt` | TRACED | Commit 0a39162 created the registry and updated CODEBASE.md in the same change, stating this relationship in the commit message |
| Park-document convention | TRACED | `park-docs/` dirs exist across agents; multiple "session park doc" commits (be079da, 906ac41) |
| "Two projects in one repo… current state is intentional; simplifies the early workflow" | PLAUSIBLE-UNTRACED | No ADL or dated decision found adopting co-location; the doc itself promises "an ADL decision record will govern the split" (future). Reads as a rationalisation of the status quo — needs Ryan's confirmation that co-location was a decision, not an accident |
| "Architecture designed to support Electron/Tauri packaging and future iOS migration" | TRACED (partially) | ADL-04 (DB_TYPE switch design in drizzle.config.ts) and the 2026-03-11 Architect packaging/security report (`jobs/COO/history/20260311_1000-ARCHITECT-packaging-security-report.md`) |

## 3. README.md

**Overall accuracy:** Setup commands, test commands, stack table, Node 22 prerequisite, schema-change policy, and OneDrive caveat all check out. The one problem area is serious: the **environment-variable table does not match the code**, and following the documented setup path would produce a broken auth configuration.

### Drift findings

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| HIGH | STALE | README §Environment variables: lists `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` as the production auth vars | Neither name appears anywhere in the code. The app uses jose + JWKS: backend reads `CLERK_JWKS_URI` (`src/backend/middleware/auth.ts:50`), `CLERK_ISSUER` (auth.ts:63), `OWNER_CLERK_ID`; frontend requires `VITE_CLERK_PUBLISHABLE_KEY` (`src/frontend/main.tsx:23` — throws at startup if unset and `VITE_BYPASS_AUTH` isn't `true`). There is no Clerk secret key in this architecture at all. Someone provisioning production from the README would set two dead vars and miss four live ones. | Fix doc |
| HIGH | CONTRADICTORY (and stale vs code) | README "Copy `.env.example` to `.env.local`" as the complete setup vs `.env.example` contents | `.env.example` itself is missing `CLERK_JWKS_URI`, `VITE_CLERK_PUBLISHABLE_KEY`, and `VITE_BYPASS_AUTH`. A fresh non-bypass setup following README + .env.example fails at `main.tsx:25` with a thrown error. README and .env.example also disagree on which vars exist (README omits `CLERK_ISSUER`, `OWNER_CLERK_ID`, `VITE_API_BASE_URL`, `HOST`, `ALLOWED_ORIGINS` that .env.example documents). | Fix both (in a writing session) |
| LOW | STALE | `.env.example` (inline doc): "MAPTILER_KEY … Same key as VITE_MAPTILER_KEY — both are required" | Only `VITE_MAPTILER_KEY` is read anywhere (`src/frontend/components/Map/MapView.tsx:23`); the non-VITE `MAPTILER_KEY` is unused. | Fix .env.example |

Verified (no finding): all commands; Node `>=22` matches `engines`; automatic seeding on startup (`startup.service.ts`, invoked from `server.ts`); Nominatim geocoding queue exists; bundled GeoJSON in `geo/`; `db:push` guidance consistent with CLAUDE.md/ADL-15.

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| "PostgreSQL-ready — config change only" | TRACED | ADL-04 referenced in `drizzle.config.ts` header; DB_TYPE switch implemented there |
| OneDrive single-writer caveat | TRACED | Consistent with BRD §11 assumptions; SQLite concurrent-write limitation is a technical fact |

## 4–5. .claude/skills/ (coo-startup, pre-push)

**Overall accuracy:** Both clean. `pre-push` commands all exist in package.json; the contract-test caveat matches reality (needs live backend). `coo-startup` references real paths (`jobs/PO/uat-log.md`, `.planning/drift-ledger.jsonl`, `jobs/COO/park-docs/`), and its BRD/tracker rules mirror CLAUDE.md consistently. No drift findings.

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| Both skills' existence as mandatory process | TRACED | Commit be48d31 "add coo-startup and pre-push skills, tidy CLAUDE.md (#78)", 2026-03-23 |
| pre-push "blocked-by-another-team exception" | PLAUSIBLE-UNTRACED | No dated incident or decision found motivating the exception; plausibly born of a real cross-team blockage but unrecorded |

## 6. _project/travel-tracker-BRD.md

**Overall accuracy:** As a requirements document the BRD is internally well-kept — every changelog entry's claimed additions (TR-13, GE-14/15, DP-05, FL-04, PH-04, AD-07/08/09, SE-01–07, F-02/F-03 removal) verify against the body, and the BRD→tracker rule was followed for v2.7 (all seven SE-xx IDs have tracker entries). Note: BRD-vs-code gaps are requirements coverage, not doc drift, and are out of scope here; findings below are bookkeeping and internal-consistency issues only.

### Drift findings

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | CONTRADICTORY | BRD header "**Version:** 2.5" vs its own §13 changelog (entries through 2.7) and CLAUDE.md ("v2.7") | Header was last touched at v2.5 (commit cc15147); v2.6 (e54a3c3) and v2.7 (63862be) updated only the changelog. Three different "current versions" are now discoverable (2.5 header, 2.7 changelog/CLAUDE.md — and the agent memory index says 2.6). The coo-startup skill directs agents to the changelog, which mitigates, but the header is the natural first look. | Fix header |
| MED | CONTRADICTORY | §6 NF-01 "Local Mac desktop app — no internet connection required for core features" / NF-03 local-file DB vs §5.11 SE-01–07 (v2.7) mandatory Clerk auth | SE-04 requires live JWT validation against Clerk (JWKS fetch = internet) and SE-06 forbids bypassing it in production. A production build per §5.11 cannot satisfy NF-01's offline-core promise. The two sections were written ~4 months apart and were never reconciled. | Confirm with Ryan |
| LOW | STALE | §10 Open Questions OQ-01 (mapping library) and OQ-02 (packaging) still listed as open | OQ-01 was resolved long ago — MapLibre GL is implemented (tech blueprint / package.json); OQ-02's beta direction (localhost browser) is the shipped reality. Neither resolution was recorded back into §10. | Fix doc |
| LOW | STALE | §3 "Primary user: Ryan (solo, personal use — Mac desktop app, local)" | The delivered system is a multi-user-capable authenticated web app (users table, three-role model, per-user scoping). §3 was never revised after the auth/hosted pivot; it now contradicts §5.11's model of multiple authenticated users. | Confirm with Ryan (see NF-01 question) |

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| Changelog entries v2.4–v2.7 | TRACED | Each maps to a dated commit: 6b38400 (v2.4, 2026-03-19), cc15147 (v2.5, 2026-03-20), e54a3c3 (v2.6, 2026-03-22), 63862be (v2.7, 2026-03-23) |
| v2.6 removal of F-02/F-03: "PO direction: not worth implementing without the map tab" | TRACED | Changelog + commit e54a3c3; attributed to PO explicitly |
| v2.7 §5.11 security requirements | TRACED but note the sign-off gap | Commit 63862be; however the changelog author column reads "COO" alone — every other version lists "Ryan V (PO)", and the document footer requires PO approval for changes. No recorded PO approval for SE-01–07. | 
| §11 assumption "SQLite … pending Architect confirmation" | TRACED | Confirmed by ADL (Architect decisions log) and implementation; the assumption text just was never updated to "confirmed" |

## 7. _project/security-spec.md

**Overall accuracy:** The Phase 1 controls (SEC-01–SEC-13) verify well against `server.ts` — helmet, CORS allowlist, 127.0.0.1 binding, 100kb body limits, 300/min rate limiter, Zod validation layer, error handler, and the CI security jobs all exist as specified; the referenced security addendum file exists. But the document's **entire auth narrative is superseded**: it declares itself "binding on all jobs" yet hasn't been touched since 2026-03-08 (commit 5853b6d), predating the decision to pull real authentication into Phase 1.

### Drift findings

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| HIGH | STALE | SEC-09 "Authentication Stub — Phase 1… Phase 2 replaces the function body with real auth"; §Deferred table "Authentication → Phase 2… No auth in Phase 1"; STRIDE table "Express API (Phase 1): Medium — no auth" | Real Clerk JWT auth shipped in Phase 1 (NR-14): `server.ts:129` applies `requireAuth` to all `/api/*`; `middleware/auth.ts` does full jose/JWKS verification. A new agent reading this "binding" spec would believe auth is a passthrough stub and design accordingly. | Fix doc (mark superseded sections; point at OP-06/ADL-20/ADL-27) |
| MED | CONTRADICTORY | §Phase 2 Authentication prescription ("OAuth2/OIDC preferred… if JWTs: 15-min tokens, refresh rotation in HttpOnly cookies") vs the implemented and Architect-documented Clerk model | Implementation uses Clerk-issued JWTs verified via JWKS (jose), tokens managed by Clerk's SDK — a materially different design, decided in ADL-20/NR-14. Two authoritative-sounding auth designs now coexist in `_project/` and `jobs/architect/tech/`. | Fix doc |
| LOW | STALE | SEC-13c example: `semgrep/semgrep-action@v1` with registry rulesets | `security.yml` runs the Semgrep CLI directly, and OP-08 (#94) added custom rules; the spec's example was never the implemented shape. Cosmetic — spec examples aren't binding implementations. | Fix doc or leave |

Verified (no finding): SEC-01/02/03/05/07 code matches spec (`server.ts:69,100-114`); SEC-04 Zod layer in `src/backend/validation/`; SEC-06 error handler exists (`middleware/error-handler.ts`); SEC-13 all three CI security jobs present in `security.yml`; addendum file `jobs/backend/inbox/read/20260307_1710-COO-security-addendum.txt` exists; secondary 20/min cities limiter is an extension beyond spec, documented inline in server.ts (SEC-M1).

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| Phase 1 residual-risk acceptances (unencrypted SQLite OK because FileVault; no auth OK because localhost) | TRACED (as of writing) | Explicit acceptance statements in the spec itself, dated 2026-03-07/08 — but note the "no auth" acceptance was later reversed by NR-14 without this doc recording the reversal |
| "crossOriginEmbedderPolicy: false required because MapLibre uses SharedArrayBuffer" | PLAUSIBLE-UNTRACED | Technically plausible (known MapLibre/COEP friction) but no incident, issue, or test cited; needs no action unless someone re-enables COEP |
| "300 req/min is generous for local single-user use" | TRACED | Matches implementation with inline SEC-07 comment; rationale self-contained and consistent |

## 8. _project/security-backlog.md

**Overall accuracy:** The findings themselves (H1–H3, M1–M3, L1–L5) map cleanly to real code concerns and M1's resolution (cities rate limiter) verifies in `server.ts:117`. But the document declares itself "the authoritative record for all security decisions" and then wasn't updated through the ADL-27/HC-xx hardening sprint, so several statuses are now wrong.

### Drift findings

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | L1 "Admin routes have no role separation — RBAC … required" listed as an open Phase 2 design input | Implemented 2026-03-23: `is_owner` column + `requireOwner` middleware protecting admin routes (ADL-27, commit 5ade19e, PR #82; `src/backend/middleware/requireOwner.ts`). | Fix doc (mark resolved, cite ADL-27) |
| MED | CONTRADICTORY | "This document … is the authoritative record for all security decisions" vs security-spec.md ("binding on all jobs") and OP-06 checklist (CLAUDE.md calls it the reference; agent memory calls it "authoritative") | Three security documents each claim authority; they disagree on auth status (spec says stub, backlog says done, OP-06 tracks per-item). | Consolidate (see §4) |
| LOW | STALE | npm-audit deferred item: "Upgrade drizzle-kit ≥0.31.9 when compatible" | package.json pins `drizzle-kit: 0.31.9` — the upgrade already happened; item never closed. | Fix doc |
| LOW | STALE | Empty "Resolved" table and change log stuck at v1.0 | H1 and M1 are marked DONE inline and the file was edited post-v1.0 (commit 41dbaa8) without changelog/Resolved updates, contrary to its own upkeep instruction. | Fix doc |

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| H1 DONE "(Clerk JWT, issues #1–4, 2026-03-20)" | SUSPECT (citation partly wrong) | GitHub issues #1, #2, #4 are indeed the NR-14 Clerk issues, but **#3 is the unrelated Tailwind migration**, and 2026-03-20 is when the issues were *created* — the auth work merged 2026-03-21+ (backend completion report `jobs/COO/inbox/read/20260321_0710-BACKEND-nr14-auth.md`). The substance (auth is done) is true; the citation reads like it was written from memory. |
| H3 accepted-risk rationale (plaintext SQLite OK, FileVault, low-sensitivity data) | TRACED | Dated acceptance (2026-03-08) with named source report `20260308_1000-BACKEND-security-report.txt` |
| M1 geocoding rate limit "DONE (2026-03-08 correction)" | TRACED | `server.ts:117-124` citiesCreateLimiter with SEC-M1 inline reference |

## 9. _project/hardening-gate.md

**Overall accuracy:** A good decision record for the 1.5-D admin-model question (the PO decision table with rationale is one of the better-provenanced artifacts in the repo, and it matches BRD AD-07/08/09 and the ADL-27 implementation). But the document froze at 2026-03-20/21 — before the HC-01…HC-07c hardening sprint — so its "current state" sections and every checkbox are now behind reality. Note the agent-memory claim that this gate is "BLOCKED (4 FAIL, 2 PARTIAL)" is also stale — that predates the sprint that closed most items.

### Drift findings

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | 1.5-A unchecked: ".env.example must document BYPASS_AUTH … Consider: add a startup warning" | Both done and exceeded: `.env.example` carries the production warning, and `server.ts:161-162` **fatally errors** (stronger than the suggested console.warn) if `BYPASS_AUTH=true` in production. Checklist still shows `[ ]`. | Fix doc |
| MED | STALE | 1.5-B: "contract tests should run real auth path via `server-test-app.ts` — confirm this is already the case" | Doubly wrong: contract tests in CI run the **real server** with `BYPASS_AUTH=true` (ci.yml:74-83), i.e. *not* the real auth path, and `server-test-app.ts` is the route-unit-test app, not the contract-test app. Same misconception as CODEBASE.md §CI/CD. | Fix doc |
| MED | STALE | 1.5-D "Timing: Deferred to Gate 3.0" for the admin/owner model; checkbox summary likewise | The owner-only enforcement half shipped early: ADL-27 `is_owner` + `requireOwner` on admin routes (PR #82), plus OP-08 access-matrix regression tests (PR #93). Only the *per-user schema* half (ADL-28) remains future. | Fix doc |
| LOW | STALE | "Security Backlog Updates" table instructing backlog status changes | Applied only partially — H1 was updated in security-backlog.md but L1 was not (see doc 8 finding). | Fix backlog |
| LOW | CONTRADICTORY | Header "Date: 2026-03-21" and "PO decisions (2026-03-21)" vs git history | All three commits touching this file are dated **2026-03-20** (41dbaa8, c7afdc5, 22a5cac), and BRD v2.5 — which already encodes AD-07/08/09 from this decision — was committed 2026-03-20 (cc15147). The doc's dates appear written a day ahead. Cosmetic but confusing for provenance tracing. | Fix doc |

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| 1.5-D PO decision table (per-entity model + rationale, e.g. companions per-user "My people, my list") | TRACED | Dedicated commits c7afdc5 "record PO decision on admin data model" and 22a5cac "finalise admin data model decisions" (2026-03-20); consistent with BRD v2.5 AD-07/08/09 and later ADL-27/ADL-28 |
| 1.5-E geo/ static files accepted-risk decision | TRACED | Recorded in-doc with reasoning (public geographic data); matches `server.ts` static mount |
| Gate structure (1.5 / 2.0 / 3.0) with COO sign-off requirement | TRACED | Commit 41dbaa8 "NR-14 hardening gate spec"; referenced by later OP-06 work |

## 10. _project/test-policy.md (OP-07)

**Overall accuracy:** The policy's workflow and framework claims mostly hold (Vitest configs exist, QA owns contract suite, test-first evident in later briefs). Two factual claims have drifted.

### Drift findings

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | §5 "Minimum for QA contract tests: … **423 on locked-trip write**" | `src/backend/errors.ts` `LockError.statusCode = 403` (comment: "Returns 403"). A QA agent writing tests from the policy would assert 423 and fail — or worse, "fix" the code to 423. Cross-checked against the API reference in doc 27 below. | Fix doc (or confirm which code was intended — see Questions) |
| LOW | STALE | §4 framework table: "Backend API contract … Config file: *same config* [as `vitest.config.backend.ts`]" | Contract tests have their own `vitest.config.contract.ts` (and a `test:contract` script); backend config does not include them. | Fix doc |

Verified (no finding): both cited setup-task spec files exist in `jobs/*/inbox`; policy adoption date matches commit ec516af era; exemption list (config/migrations/seed exempt) consistent with observed test tree.

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| Policy adoption 2026-03-08, not retroactive, exempting BUG-01–09/BC-01–07 | TRACED | Self-recording with date + change log; matches commit ec516af (bug classification framework, same day) and the named correction IDs appear in tracker/history |
| "React UI components … covered adequately by QA live testing" (rationale for exempting presentation layer) | PLAUSIBLE-UNTRACED | No evidence QA live-testing coverage was ever assessed; reads as an assertion of convenience. Frontend unit tests were later added anyway (`src/frontend/**/__tests__`), suggesting the exemption eroded in practice |

## 11. _project/project-plan.txt

**Overall accuracy:** Frozen at v1.2 / 2026-03-08 (last commits ec516af, 1bdce44). Everything it says was true *then*; almost nothing about "current state" is true now. This matters more than it would for an ordinary stale plan, because commit 0a39162 (2026-07-07) deleted `objective.txt` on the stated grounds that "objective content already lives in project-plan.txt" — making this frozen file the official home of the project objective.

### Drift findings

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| HIGH | STALE | Whole document: "PHASE 2 — API LAYER — STATUS: ACTIVE (correction)", "Reference: BRD (v2.3)" | Reality as of 2026-07-07: BRD v2.7; frontend, auth (NR-14), Tailwind UI migration, map filtering, OP-06/OP-08 security enforcement all shipped. An agent asked "where is the project?" and reading the plan would answer "mid-backend, pre-frontend" — months behind. | Fix doc or explicitly mark as historical (see Questions) |
| MED | STALE | Phase 1 acceptance criteria: "[x] npm run db:push succeeds on fresh SQLite file" | `db:push` was later forbidden (ADL-15) and removed from package.json. As a historical record of the acceptance run this is legitimate, but nothing in the file flags that the workflow it blesses is now banned. | Annotate, don't rewrite history |
| LOW | CONTRADICTORY | "Launch target: Packaged .app (Electron)" vs BRD OQ-02 ("Electron or Tauri preferred… final selection deferred to Architect") | ADL-06 (2026-03-07) *does* decide Electron, so the plan agrees with the ADL; it is the BRD's OQ-02 that was never closed out. Recorded here because the two docs still read as disagreeing. | Fix BRD OQ-02 |
| LOW | STALE | "ER schema v1.1 (all 19 tables)" | True at the time; current schema.ts has 21 tables (trip_countries per ADL-23, users per ADL-20 added later). Only misleading if read as current. | Annotate |

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| "@libsql/client approved substitution for better-sqlite3, COO 2026-03-07" | TRACED | Dated in-doc approval note; consistent with ADL (driver decision) and package.json |
| Key-decisions summary (stack, shading computed at query time, items base+extension) | TRACED | Each maps to a numbered ADL entry in the Architect decisions log |
| Change log v1.0→v1.2 | TRACED | Matches commits 77fbf0f, ec516af, 1bdce44 |

## 12. _project/job-registry.txt

**Overall accuracy:** Clean — it was written 4 days ago (0a39162) and is honest about its own provenance ("backfilled — file existed as an empty 0-byte stub since project init"). Spot-checked: role list matches `jobs/` directories; system-prompt paths exist (e.g. `jobs/COO/COO-system-prompt.txt`); the canonical-source relationship with CODEBASE.md is declared symmetrically in both files. No drift findings.

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| Registry contents + backfill story | TRACED | Commit 0a39162 message narrates exactly this |

## 13. _project/dependency-graph.txt

**Overall accuracy:** Same class of problem as project-plan.txt — frozen at v1.2 (2026-03-08, "FRONTEND unblocked"). Statuses like `[ACTIVE]`/`[BLOCKED]` are long-dead; "ADL-01 to ADL-14" undersells the current ADL-28. Lower risk than the plan because nothing else points to this file as current.

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | Entire status annotation layer (v1.2, 2026-03-08) | Repo is ~4 months past every status in the file | Mark historical or delete (see Questions) |

## 14. _project/seed-data.txt

**Overall accuracy:** Clean. Spot-checked category/activity values against `src/backend/db/seed-data.ts` — matches (Ski Trip, Honeymoon, City Break, Snowboarding…). Schema doc-comments reference this file as the seeding source, consistent. No findings.

## 15–16. _project/travel-tracker-project-audit.md / travel-tracker-standalone-BRD.md (3-line pointers + .docx)

**Overall accuracy:** The `.md` files are intentional pointers to the `.docx` versions, which exist. Two notes:

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| LOW | UNVERIFIABLE | Both `.docx` payloads | Binary DOCX content not diffable in-repo; whether the DOCX still reflects intent can't be verified from the repo alone. The standalone BRD DOCX predates BRD v2.5–2.7 changes (received 2026-03-19 per `jobs/COO/history/20260319_0900-standalone-BRD-received.md`), so it is very likely behind the md BRD. | Confirm with Ryan whether the DOCX pair is still load-bearing |
| LOW | STALE | Duplicate pointer copies in `jobs/COO/inbox/reference/` | `travel-tracker-project-audit.md` and `travel-tracker-standalone-BRD.md` exist in both `_project/` and `jobs/COO/inbox/reference/` (plus a 74-line `-proposed-requirements` variant only in the inbox). Two homes for the same artifact. | Consolidate (see §4) |

## 17. jobs/architect/tech/20260307-architecture-decisions-log.md (ADL-01…ADL-29)

**Overall accuracy:** This is the strongest document in the repo. Nearly every entry carries a date, a trigger ("resolves COO inbox 2026-03-21 22:00", GitHub issue numbers), and implementation implications that verify against code: ADL-16 (user_id on exactly trips/trip_places/items — matches schema), ADL-20 (Clerk/jose — matches auth.ts), ADL-21 (Node 22 — matches engines + CI), ADL-23 (trip_countries — matches schema), ADL-25 (`getDb(): LibSQLDb` with retained `AppDatabase` doc alias — matches `db/index.ts:49-77` almost line-for-line), ADL-26 (`region_iso` — implemented in trips route, api.ts, TripList.tsx), ADL-27 (is_owner/requireOwner — implemented), ADL-29 (`.semgrep/security.yml` + access-matrix test + `--config .semgrep/security.yml` in security.yml — all present). ADL-17→ADL-20 supersession is explicitly recorded with date and PO attribution — exemplary. Problems are structural, not substantive:

### Drift findings

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | Log sequence jumps ADL-27 → ADL-29; no ADL-28 entry or pointer | `ADL-28-per-user-shading-companions.md` exists as a standalone file (Status: Decided, 2026-03-23) but was never appended/pointered in the main log, violating the log's own header rule ("append new decisions as they are made") and the pattern used for ADL-26/27. An agent reading only the log would not know the per-user shading/companions design exists. | Fix log (add summary + pointer) |
| LOW | STALE | ADL-27 implications: "New `requireOwner` middleware in `src/backend/middleware/auth.ts`"; "`OWNER_CLERK_ID` documented in `.env.local.example`" | Implemented as a separate `middleware/requireOwner.ts`, and the env template is `.env.example` (no `.env.local.example` exists). Cosmetic pointer drift. | Fix log |
| LOW | STALE | ADL-29 implication: spec at "`jobs/COO/inbox/20260323T000000Z-ARCHITECT-security-enforcement.md`" | Actual file is `…/read/20260323T120000Z-ARCHITECT-security-enforcement.md` (12:00Z, since archived to read/). | Fix pointer or leave |
| LOW | STALE | ADL numbering vs dates: ADL-24 dated 2026-03-20, ADL-23 dated 2026-03-21 | Numbering isn't chronological here; harmless but can confuse provenance tracing. | Note only |

### Provenance findings

| Claim | Class | Evidence |
|-------|-------|----------|
| ADL-01…14 (initial stack decisions incl. rationale, e.g. Python-in-Electron rejected) | TRACED | The ADL is itself the primary dated decision record, created in the initial commit (77fbf0f) alongside the blueprint; internal alternatives-considered sections are contemporaneous, not post-hoc |
| ADL-08 "MapTiler free tier (100,000 map loads/month) is sufficient" | UNVERIFIABLE (external fact) | MapTiler's quota can't be confirmed from the repo; the decision itself is traced |
| ADL-15 (db:push ban, four drizzle-kit bugs, patch-package) | TRACED | Patch file exists; pinned version; agent-memory bug list matches; "resolves Dev inbox 2026-03-10" |
| ADL-17 SUPERSEDED marker ("PO directed Clerk managed auth") | TRACED | ADL-20 records the same PO direction from the other side, dated next day |
| ADL-25 "no usable generic Drizzle db type" investigation | TRACED | Detailed, verifiable-in-principle claims about drizzle-orm type definitions; implemented exactly as written |

## 18. jobs/architect/tech/20260307-tech-blueprint.md

**Overall accuracy:** A v1.0 "Approved — implement from this document" snapshot from 2026-03-07 that was implemented and then left behind by three later pivots. Core architecture (TypeScript, Express :3001, React 18 + Vite, Electron target) still matches.

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | "Production (Phase 1): SQLite via `better-sqlite3`" | Driver is `@libsql/client` — substitution approved by COO 2026-03-07 (recorded in project-plan.txt note and reflected in drizzle.config.ts), but the blueprint itself was never amended. | Fix doc |
| MED | STALE | Blueprint stack contains no auth section reflecting Clerk and no Tailwind | Both are now first-class stack elements (NR-14, Tailwind migration #78-era). The blueprint still presents the pre-auth, pre-Tailwind stack as "implement from this document". | Mark superseded-in-part; point at ADL-20/21+ |

Provenance: the blueprint is itself the traced antecedent for most stack claims elsewhere (README, CODEBASE.md); its alternatives-considered sections (e.g. Python rejected for Electron packaging complexity) are contemporaneous — TRACED.

## 19. jobs/architect/tech/20260307-ER-schema.md

**Overall accuracy:** v1.1, "Approved for DATABASE implementation", 2026-03-07 — and **still cited as authoritative by the live schema**: `schema.ts:15` says "@see jobs/architect/tech/20260307-ER-schema.md (v1.1 — authoritative)".

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| HIGH | STALE | Whole document vs current schema; aggravated by the "authoritative" pointer in `schema.ts:15` | The ER doc contains no `users`, no `trip_countries`, no `is_owner`, no `arrived_on`/`departed_on`, no user_id FKs — i.e. none of the ADL-16/20/23/24/27 schema evolution (19 tables then; 21 now, plus new columns/indexes). An agent told by the schema file itself that this doc is authoritative would design against a schema missing the entire auth/ownership layer. | Fix: either update ER doc or repoint schema.ts comment at the ADLs |

Provenance: table-design rationale (extension tables, junction uniqueness, partial indexes) is TRACED — it's the original dated design record, and schema.ts doc-comments repeat it consistently.

## 20. jobs/architect/tech/20260307-map-shading-spec.md

**Overall accuracy:** v1.2, updated 2026-03-21 — fresher than its filename suggests. Seven states / six config rows arithmetic is consistent with BRD §5.4 and the schema CHECK constraint.

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | Spec's shading SQL/queries contain no `user_id` scoping; status still "Approved — implement in BACKEND" | HC-03 (commit cf7ea36, 2026-03-23) scoped all shading queries to `req.user.id` after OP-06 flagged the aggregate-of-all-users leak. An agent re-implementing from this spec would faithfully reintroduce the security bug. | Fix doc (add scoping; cite HC-03/ADL-28) |

## 21–24. Standalone ADL files (ADL-24, ADL-26, ADL-27, ADL-28)

**Overall accuracy:** Good. ADL-24 carries an explicit merge banner ("Merged into the main log 2026-07-07… retained for the §7 effort estimate table") — exactly the right pattern. ADL-26/27 verified against code above (region_iso, requireOwner, is_owner seeding via `server.ts:210-211`). ADL-28 (per-user shading config + companions, Status: Decided 2026-03-23) is a future-work design: `map_shading_config` and `companions` tables indeed still have **no** user_id columns, consistent with it being decided-but-unimplemented.

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | ADL-28 "Status: Decided" with no implementation-status marker, and no entry in the main log (see doc 17) | Nothing distinguishes "decided and shipped" (ADL-27) from "decided, not started" (ADL-28) except reading the code. Tracker may cover this, but the doc itself doesn't say. | Add status note + log entry |

## 25. jobs/architect/tech/OP-06-hardening-checklist.md

**Overall accuracy:** This is the single most dangerous stale document in the repo, precisely because CLAUDE.md's security checklist names it as the reference and agent memory calls it "authoritative". It is a point-in-time assessment dated 2026-03-23 (last commit 80de82c) whose FAIL/PARTIAL verdicts were then fixed by the very sprint it triggered — and the verdicts were never flipped.

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| HIGH | STALE | §2 access matrix + §3 assessments: "Admin: **FAIL: no owner guard**" (×6 rows), "Map shading **FAIL: currently aggregate of all users**", "**PARTIAL: iss… not validated**", "**FAIL: BYPASS_AUTH in local dev** (JWKS unreachable)", "user_id nullable **PARTIAL**" | Every one of these was subsequently fixed: requireOwner on admin/shading/city routes (5ade19e, #82), shading scoped to user (cf7ea36, #84), JWT issuer validated (a12ca3c, #87/88), Clerk JWKS firewall allowance (d6c9236, #80), NOT NULL user_id (b74e296, #86), plus OP-08 enforcement (Semgrep rules #94, access-matrix tests #93). Completion reports for each sit in `jobs/COO/inbox/read/`. A new agent consulting the "authoritative" checklist would either believe the app has six open security holes or re-do the work. The stale agent-memory note ("gate BLOCKED, 4 FAIL / 2 PARTIAL") compounds this. | Fix doc urgently (flip statuses with commit citations) — highest-priority doc fix in this audit |
| LOW | STALE | §3.4 rationale "BYPASS_AUTH=true persists in .env.local because the Clerk JWKS endpoint [is unreachable from the container]" | HC-01 opened the firewall; GitHub issue #23 ("allow Clerk JWKS through firewall") is nonetheless still OPEN. Doc, issue tracker, and firewall config are mutually inconsistent. | Fix doc + close issue #23 |

Provenance: the checklist's assessments were accurate when written (TRACED — each FAIL maps to a real pre-fix code state, verifiable in git history), and it is itself the traced trigger for HC-01…HC-07c. The problem is purely that it froze.

## 26. jobs/architect/tech/codebase-health.md

**Overall accuracy:** A methodology + score-history document. Its structural advice is sound, but it is entangled with a tool whose status is contradictory.

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | "…replaces depwire's health score… (see CLAUDE.md for depwire limitations)" | CLAUDE.md contains no depwire content at all (removed in the #78-era tidy). The cited cross-reference is dead. | Fix doc |
| MED | CONTRADICTORY | Methodology instructs running `depwire health`, `depwire list_files`, `depwire impact_analysis` | Depwire was removed by commit 3823044 ("remove Depwire", 2026-03-21) — yet an **untracked** `.mcp.json` re-registers the depwire MCP server and an untracked `.depwire/` output directory exists (created ~today). The repo's committed state says the tool is gone; the working tree says it's back. The methodology is unusable or the removal decision is dead — can't tell which from the repo. | Confirm with Ryan |
| LOW | STALE | "Orphans & Dead Code: read `src/backend/middleware/auth.ts` (is it still a stub?)" | auth.ts has been real Clerk verification since NR-14; the "stub" framing predates it. | Fix doc |

## 27. jobs/backend/tech/20260307-api-reference.md

**Overall accuracy:** v1.3, last updated 2026-03-19 (pre-auth). What it documents is accurate — endpoint paths, shapes, and notably the locked-trip **403** convention all match the code (`errors.ts` LockError = 403; this confirms test-policy's "423" as the outlier, see doc 10). The admin list pattern correctly covers categories/activities/companions. The problem is what four months of change added that it doesn't document:

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| HIGH | STALE | Entire document: no authentication section — exactly one mention of 401/Authorization in 1,475 lines | Since NR-14 every `/api/*` route requires a Bearer JWT (401 otherwise), and admin/shading-config/city-creation routes additionally require owner (403 via requireOwner). A client written from this reference would send no Authorization header and fail on every call. | Fix doc (add auth conventions section) |
| MED | STALE | Missing endpoints/params added after v1.3 | (a) `POST`/`DELETE` trip-countries routes (`routes/trip-countries.ts`, ADL-23); (b) `PATCH /api/trips/:tripId/places/:placeId` for arrived_on/departed_on (`routes/places.ts:120`, UX-02 #68); (c) rating sort/filter query params `sort_by`/`sort_order`/`min_rating` on item list endpoints (`routes/items.ts:39-54`, IT-08/09 #90). | Fix doc |

Provenance: version header self-documents its update trail (v1.3 = FEAT-BD DELETE endpoint, dated) — TRACED.

## 28. jobs/frontend/tech/20260308-frontend-component-reference.md

**Overall accuracy:** A 2026-03-08 snapshot never updated through the two-panel layout (TR-11), Tailwind migration, Clerk integration, or UX-02. Its security notes (urlSanitiser, no dangerouslySetInnerHTML, MapLibre text-field) still verify. Several concrete claims are now wrong:

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE | Hook table: `useLockTrip` = "POST /api/trips/:id/lock", `useUnlockTrip` = "POST …/unlock" | Both are PATCH in code (`useTrips.ts:135,153`; `routes/trips.ts:333-337`) and in the API reference. | Fix doc |
| MED | STALE | Hook table: `useShadingConfig` = "GET **/api/admin/shading-config**", `useUpdateShadingColor` = "PATCH /api/admin/shading-config/:key" | Actual path is `/api/map/shading/config[/:stateKey]` (`useMapShading.ts:55,74`; `routes/map.ts:47-68`; api-reference agrees). | Fix doc |
| MED | STALE | §Trip Status Transitions diagram: "locked → active (unlock)" | Code allows `locked → review_pending` only (`routes/trips.ts:49`). An agent implementing unlock UI from this doc would target the wrong state. | Fix doc |
| MED | STALE | Component/hook tree omits everything post-2026-03-08 | Missing: `TripsLayout.tsx` (two-panel shell), `PlaceDateForm.tsx`, `useGeocodeRetryQueue.ts`, `services/geocodeRetryQueue.ts`, `utils/formatDate.ts`, `utils/resolvePlaceDateRange.ts`; `main.tsx` description omits ClerkProvider. | Fix doc |
| LOW | STALE | "RegionLayer.tsx … lazy, zoom >= 4" | Threshold lowered to 3 (commit 1f54c19 "lower region zoom threshold to 3"; CODEBASE.md agrees on 3). | Fix doc |
| LOW | STALE | Footnote: "The API reference doc uses 'booked' and 'skipped' — inconsistent with the Zod schema (FLAG-F1)" | The API reference has since been fixed (v1.3 uses the schema's status values; 'booked' survives only as prose describing `confirmed`). The flag now describes a resolved problem. | Fix doc |

Provenance: FLAG-F1 footnote is TRACED (names its completion report); the reference itself is the dated deliverable of the frontend Phase 1 build.

## 29–31. QA tech docs, UX tech docs, PO UAT log — LIGHT PASS

**Coverage caveat:** these nine files received a header-plus-targeted-claims pass, not the line-by-line verification given to docs 1–28. They are predominantly dated snapshots (test plans, bug reports, mockup deltas, session logs), which age legitimately; findings below are limited to claims that present themselves as *currently authoritative*.

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | CONTRADICTORY | `jobs/ux/tech/20260319-UX-design-system.md` header: "**Stack:** Tailwind CSS + **shadcn/ui (Radix UI primitives)**… Status: Final — this is the single source of truth for Frontend implementation" | No shadcn/ui or Radix package exists in package.json or package-lock.json; CODEBASE.md states "Utility-first, no component library". The self-declared source of truth prescribes a component stack that was never installed. Whether shadcn was dropped by decision or by drift is not recorded anywhere I could find. | Confirm with Ryan |
| LOW | STALE | `jobs/qa/tech/20260309-contract-test-coverage-plan.md` "Status: Active" (2026-03-09) | The contract suite has grown far past this plan (auth, owner-access, access-matrix, rating filters). As a "QA test backlog" it no longer reflects the backlog. | Mark historical or refresh |
| LOW | STALE | `jobs/PO/uat-log.md` instructions: "Screenshots: save to `jobs/PO/screenshots/…`" | Directory doesn't exist (same as CLAUDE.md finding, doc 1). | Fix path or create dir |

Notes: the UAT log itself is in good shape — findings carry checkboxes, bug IDs, PO quotes, and cross-references to BRD v2.6 decisions; its note that BYPASS_AUTH was added "because the firewall couldn't reach Clerk JWKS" is accurate *as a dated session note* (since fixed by HC-01). The UX delta documents are explicitly dated comparisons and don't claim currency.

## 32. .depwire/ (13 untracked generated files)

**Overall accuracy:** All 13 files are stamped "Auto-generated by Depwire 0.9.1 on **2026-03-20**" — a snapshot from before NR-14 completion, the OP-06 sprint, and ~4 months of work. Sample staleness: `STATUS.md` reports auth.ts containing "TODO (Phase 2): Validate auth token" (long since replaced by real Clerk verification); `HISTORY.md` says "Last commit: 2026-03-20, 85 commits".

| Sev | Class | Doc location | Evidence | Disposition |
|-----|-------|--------------|----------|-------------|
| MED | STALE + CONTRADICTORY (with a committed decision) | Entire `.depwire/` directory + untracked `.mcp.json` registering the depwire MCP server | Commit 3823044 (2026-03-21) removed Depwire deliberately ("remove Depwire"), the day *after* these files were generated. The untracked working-tree state resurrects the tool with no recorded decision. Any agent (or the MCP server itself) consuming these files gets a March-era codebase view presented as current. | Confirm with Ryan: delete, or regenerate + record re-adoption decision (also affects codebase-health.md methodology, doc 26) |

> RESOLVED (2026-07-07): Ryan confirmed leftover (see Q3 in §5) — `.depwire/` and `.mcp.json` deleted; the 3823044 removal decision stands.












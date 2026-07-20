# Session C — Workflow Extraction & Skill Candidates

**Date:** 2026-07-08 · **Auditor:** Claude (read-only session) · **Repo state:** main @ 2a895f0

**Prior context:** Session A (`audits/session-a-doc-integrity.md`) and Session B (`audits/session-b-code-safety.md`) read in full. Session A's Q3 (depwire) is the only Ryan-resolved question; **Session B's ten questions are all unanswered as of this session**, so every skill step that depends on one is marked `UNCONFIRMED:` inline. Doc claims flagged STALE/SUSPECT by Session A are not used as ground truth anywhere below.

> **Degradation notice:** the "Ryan's named workflows" section of this session's brief was left empty — the placeholder list was never filled in. Per the brief, an empty list degrades (but does not abort) the session. Consequence: every workflow below is *inferred from history*, none is Ryan-named, and the cross-check in §3 has nothing to check against. I drafted skill candidates only for the four workflows whose historical evidence is overwhelming (the conduct rules permit "clear historical evidence" as an alternative to naming), and all four are provisional pending Ryan's confirmation in Q1.

## 1. Checkpoint list

| # | Item | Status |
|---|------|--------|
| 1 | Task 1 — workflow extraction from git history | DONE |
| 2 | Task 1 — cross-check against named workflows | DONE (degraded — list was empty) |
| 3 | Skill candidate: `schema-change` | DONE |
| 4 | Skill candidate: `backend-route-change` | DONE |
| 5 | Skill candidate: `coo-merge-and-close` | DONE |
| 6 | Skill candidate: `record-decision` | DONE |
| 7 | Task 3 — load-order recommendation | DONE |
| 8 | Questions for Ryan + coverage statement | DONE |

## 2. Extracted workflow inventory (Task 1)

Method: all 201 commits on `main` were classified by message convention, and representative commits of each class were inspected for co-changed files (`git show --stat`). Message-prefix distribution: 92 `chore`, 37 `fix`, 27 `feat`, 8 `docs`, 2 `test`, plus ~35 pre-convention `[ROLE]`-prefixed commits from the first week. Within those: **40 commits are `chore(coo)` orchestration**, **46 are `feat|fix(<TRACKER-ID>)` implementation PRs**, and 8 migrations exist (`0000`–`0007`).

### W1 — Schema change via Drizzle migration ★ (highest trap density)

**Evidence:** every schema commit shows the same invariant co-change set — `src/backend/db/schema.ts` + a new `src/backend/migrations/NNNN_*.sql` + `migrations/meta/NNNN_snapshot.json` + `migrations/meta/_journal.json`, usually plus edits to the hand-written test-DDL copies. Verified in 7450307 (users table, migration 0002), 64a30ff (user_id FKs, 0003), e70bc3c (trip_countries, 0004), 50bcfa9 (place dates, 0005 — also touched 7 test files), b74e296 (NOT NULL user_id, 0007 — touched 7 test files + a service). Six distinct schema-change PRs in ~2.5 weeks of active development.

**Trap density (from Sessions A+B):** the `db:push` ban (ADL-15, invariant 1); append-only migrations (invariant 8, enforced by nothing); **13 files carry hand-written `CREATE TABLE` copies of the schema** that must be mirrored by hand and have already drifted (Session B Audit 7 — confirmed by grep this session: `test-db.ts` + 12 `*.test.ts` files); the two-timestamp-conventions trap (`users` is integer-epoch, everything else text-ISO); the ADL-28 "deliberately unscoped tables" trap (invariant 4); the stale-but-cited-as-authoritative ER-schema doc (Session A doc 19).

### W2 — Backend feature/bug implementation from a COO brief ★

**Evidence:** 46 `feat|fix(<ID>)` commits referencing a tracker ID + GitHub issue + PR (e.g. `feat(UX-02)… (#68) (#69)`, `fix(BUG-22)… (#92)`, `bb2ad36` IT-08/09, the entire HC-01…HC-07c sprint #80–#94). Typical co-change: route file + `src/backend/validation/*.schemas.ts` + repository/service + `__tests__/` (+ contract tests when the API contract changes). Dispatched via briefs in `jobs/backend/inbox/`, closed via completion reports in `jobs/COO/inbox/`.

**Trap density:** ownership-before-mutation (invariant 17 — already violated once, items POST); lock enforcement with three idioms and known gaps (invariant 18); the access-matrix test's read-only cross-user framing (Audit 7); `server-test-app.ts` hand-mirroring (invariant 15); contract tests mutating the real local `dev.db` (invariant 28); api-reference / `types/api.ts` drifting with nothing checking them (invariant 24).

### W3 — COO orchestration cadence: dispatch → review → merge → session close ★ (most frequent)

**Evidence:** 40 `chore(coo)` commits in three recognizable sub-shapes. *Dispatch* commits touch only `jobs/<agent>/inbox/*.md` brief files (b8bcbe9 — three NR-14 briefs; b660f3d — two ADL-18 briefs). *Housekeeping/close* commits touch `.planning/drift-ledger.jsonl` + `_project/tracker.json` + `jobs/COO/inbox/` → `inbox/read/` moves + `jobs/COO/park-docs/*.txt` (63862be, 906ac41, ff38f5d, e29654f). *Tracker/issue bookkeeping* commits (`chore(tracker)`: 1b0a8ba triage pass, 0c0cd10, 1dcf2d5). The merge procedure itself is prescribed step-by-step in CLAUDE.md and observable in the squash-merged `(#N)` history.

**Trap density:** PR-green ≠ main-green (BUG-24, now a mandatory post-merge check); stale local branches after squash merges; **BUG-23 — `scripts/tracker.js` is still broken** (reproduced again this session), *and* a correction to Session B: `tracker.json` **does contain real JSONC comments** (`// ─── PHASES ───…` section headers), so plain `JSON.parse` also fails and Session B's "drop comment support entirely (appears to contain no actual comments)" proposal is not viable as stated — the fix must be a string-aware comment stripper (or a decision to remove the decorative comments). Until then the only guard is the unwritten rule: no `//` inside tracker.json string values.

### W4 — Decision recording: ADL entries and BRD version bumps ★

**Evidence:** ADL commits pair the main log with a standalone decision file — 183f887 (ADL-30 + main-log entry + completion report), eac88e0 (ADL-26), da26801, 80de82c (ADL-27 corrections). BRD bumps are their own commit class: 6b38400 (v2.4), cc15147 (v2.5 — co-changed `tracker.json`, per the BRD→tracker rule), e54a3c3 (v2.6), 63862be (v2.7, inside a session close). Four bumps in three weeks; five standalone ADL files; the log runs ADL-01…ADL-30.

**Trap density:** this workflow has *demonstrated* failure modes, all documented in Session A — ADL-28 exists only as a standalone file with no main-log entry (violating the log's own header rule); the BRD header version froze at 2.5 while the changelog reached 2.7; v2.7 is the only version without recorded PO sign-off; open questions (OQ-01/02) answered by decisions but never closed in §10.

### W5 — Frontend feature/fix from a brief (observed, not drafted)

**Evidence:** `feat(UX-04)` #67, `feat(UX-02)` frontend half #63, MAP-01 series #70–#74, Tailwind migration 77a415b, NTH-01/03/04 #37. Co-change: components + hooks (+ occasionally `types/api.ts`). Real recurrence, but the trap inventory for it is thinner (invariants 24–26: types mirroring, bypass-env pairing, cache-invalidation convention) and two of its three traps are shared with W2. A skill may be warranted; deferred to keep the four drafted ones fully specified.

### W6 — Doc-fix / audit / process-hardening session (observed, emerging)

**Evidence:** the entire recent cluster — #99–#107 (audit reports, OP-09 lifecycle rule, OP-10 CI visibility, DEP-01), plus the queued doc-fix brief in `jobs/COO/outbox/20260708_0645-…`. Recurrence is recent but clearly intended to continue. The document-lifecycle rules in CLAUDE.md already encode most of the procedure; a skill here risks duplicating a rule set that was *just* made global.

### W7 — Dependency vulnerability pass (observed once, process-shaped)

**Evidence:** 03051f5 + 183f887 (DEP-01, ADL-30 ruling gate). Single occurrence, but it was given a tracker ID and an ADL, which signals intent to repeat. One data point is below the drafting bar.

### W8 — UAT session logging (observed, PO-driven)

**Evidence:** 90f9071 (`chore(uat)` close — PASS), 4197833 (log findings + dispatch), 1dcf2d5 (UAT notes → tracker items). Recurs at phase boundaries. The uat-log.md itself carries its own instructions (Session A doc 31 found them mostly sound); marginal skill value.

## 3. Cross-check against named workflows (Task 1, degraded)

**Named + observed:** none — the named list was empty.

**Named but not observed:** none — same reason.

**Observed but not named (all eight above).** Per the brief this category gets evidence and no drafts — but applied literally to an empty list, the session would produce zero drafts, and the conduct rules explicitly allow drafting on "clear historical evidence." Resolution taken: **W1–W4 (starred) are drafted below as provisional candidates**; W5–W8 are listed for Ryan with evidence only. Two supporting signals for this cut:

1. The repo already skill-ified its two most frequent *gate* workflows (`pre-push`, `coo-startup`) — W1–W4 are the four most frequent *task* workflows by commit count, and each has documented, already-realized failure modes from Sessions A/B that a procedural file can guard.
2. The brief's own granularity examples ("add a new tracked entity end-to-end", "release/deploy pass") map onto W1+W2 and W3 respectively.

Ryan: Q1 below asks you to confirm, rename, or strike each of the four before any is installed.

## 4. Skill candidates (Task 2)

Convention check: this repo's existing skills live at `.claude/skills/<name>/SKILL.md` with `name:`/`description:` frontmatter (`coo-startup`, `pre-push`) — all drafts follow that shape. Each draft states only task-scoped procedure; global rules stay in CLAUDE.md and are referenced, not restated (except where §5 proposes *moving* a rule out of CLAUDE.md into the skill, noted per draft).

### 4.1 `schema-change` (from W1)

Guards incorporated: Session B invariants 1, 2, 3, 4, 8; Audit 4 Area-1 findings (ER-schema pointer, timestamp conventions, constraints-callback form); Audit 6 surface 1 (test-DDL mirrors); Session A doc 19 (ER-schema stale).

Proposed path: `.claude/skills/schema-change/SKILL.md`

```markdown
---
name: schema-change
description: Add or modify a table/column in the Drizzle schema — migration workflow, test-DDL mirrors, and user-scoping rules. Load before touching src/backend/db/schema.ts.
---

## Before you edit

1. Find the ADL entry covering this change (`jobs/architect/tech/20260307-architecture-decisions-log.md`).
   Every schema change in this repo's history traces to one (ADL-16/19/20/23/24/27). If none covers
   yours, stop and raise it — schema design is an Architect decision, not an implementation detail.
2. Do NOT design against `jobs/architect/tech/20260307-ER-schema.md`, even though `schema.ts:15`
   calls it authoritative — it is the original 19-table design and predates the entire
   auth/ownership layer. `schema.ts` itself is the source of truth; the ADL is the evolution record.

## Rules that bind this task

- **`map_shading_config` and `companions` are global-by-design** until ADL-28 is implemented.
  Do not add `user_id` to them as a "consistency fix" — that jumps the ADL-28 migration queue.
- **New user-data tables:** `user_id` must be `.notNull().references(() => users.id)` with an
  index, and every query touching the table scoped to `req.user.id` (ADL-16 / HC-07c).
- **Timestamps:** use text ISO-8601 `created_at`/`updated_at` with `strftime` defaults — the
  convention of every table except `users`. UNCONFIRMED: whether `users`' integer-epoch divergence
  is deliberate — do not copy it to a new table without an Architect ruling.
- **Migrations are append-only.** Never edit an existing file in `src/backend/migrations/` or
  `migrations/meta/_journal.json` — applied databases (including Ryan's real dev.db) desync.
- **Constraints callback:** use the array form; only `tripCountries` still uses the deprecated
  object-literal form and it should not spread.

## Procedure

1. Edit `src/backend/db/schema.ts` only. Do not hand-write migration SQL.
2. `npm run db:generate` — produces `migrations/NNNN_<name>.sql` + `meta/NNNN_snapshot.json` +
   a `_journal.json` entry. Never run push in any form — `npm run db:push` is removed AND
   `npx drizzle-kit push` directly is equally forbidden (ADL-15; drizzle-kit is pinned at the
   patched 0.31.9 — see agent memory for the four bugs).
3. Read the generated SQL and confirm it matches intent — drizzle-kit here is patched, not trusted.
4. `npm run db:migrate`.
5. Mirror the change in the hand-written test DDL copies. 13 files carry inline `CREATE TABLE`
   copies of the schema; find them with:
   `grep -rl "CREATE TABLE" src/backend --include="*.test.ts"` plus
   `src/backend/repositories/__tests__/test-db.ts`.
   These copies are known-drifted already (Session B Audit 7); update every copy that includes a
   table you changed, and do not treat an un-updated copy's green tests as evidence of anything.
   UNCONFIRMED: a consolidation replacing all 13 copies with one migration-applying factory is
   proposed (Session B, Audit 6 surface 1) but not decided — until it lands, mirror by hand.
6. Update affected repositories/services/validation schemas, and `src/frontend/types/api.ts` if
   the change surfaces in API responses (nothing checks that file automatically).
7. `npm run test:backend` — add tests for new constraints/columns.

## Definition of done

- [ ] Exactly one new migration file + snapshot + journal entry; `git diff --stat src/backend/migrations/`
      shows additions only (no modified existing files)
- [ ] Re-running `npm run db:generate` reports no schema changes (schema ↔ migrations consistent)
- [ ] New user-data tables/columns: `user_id` NOT NULL + FK + index; queries scoped to `req.user.id`
- [ ] Every test-DDL copy containing a changed table updated; `npm run test:backend` green
- [ ] `npm run type:check:all` green
- [ ] PR body cites the governing ADL entry
- [ ] `/pre-push` run and clean
```

### 4.2 `backend-route-change` (from W2)

Guards incorporated: Session B invariants 11, 14, 15, 17, 18, 24, 28; Audit 4 Area-3 findings (items-POST hole, lock carve-outs, `.strict()` divergence, nosemgrep convention); Audit 7 (access-matrix write gap, hollow-test warning); Session A docs 10/25/27 (423-vs-403, OP-06 staleness, api-reference staleness).

Proposed path: `.claude/skills/backend-route-change/SKILL.md`

```markdown
---
name: backend-route-change
description: Add or modify an Express API route — auth/ownership/lock guards, validation, tests,
  and same-PR doc updates. Load before touching src/backend/routes, validation, services, or
  repositories.
---

## Architecture in 30 seconds

routes → services/repositories → Drizzle → libSQL. `requireAuth` is applied globally at
`app.use('/api/', requireAuth)` in `server.ts` — individual routes do NOT import it. Owner-only
operations add `requireOwner` per-route (it must run after requireAuth; it reads `req.user`).
Wrap async handlers in `asyncHandler`. UNCONFIRMED: Express 5 may make asyncHandler vestigial
(Session B Q5, unanswered) — follow the convention until ruled.

## Security guards — each has been violated at least once in this repo; check all of them

1. **Ownership before mutation.** Every write handler must verify `trips.userId = req.user.id`
   (via `findByIdOrThrow` / `assertWritable`) BEFORE calling helpers. Helpers below the route
   layer (`replaceAssociations`, `setCountries`, `addCountries`, `assertNotLocked`,
   `insertExtension`) deliberately do NOT re-check ownership. Copy `places.ts` POST as your
   template, NOT `items.ts` POST — items POST currently skips the ownership check
   (UNCONFIRMED whether bug or blessed: Session B Q1, unanswered; assume bug, don't replicate).
2. **Lock enforcement.** Writes touching a locked trip's data must reject with **403** via
   `LockError` (not 423 — test-policy §5's "423" is the stale outlier; code and API reference
   agree on 403). UNCONFIRMED carve-outs: place-activity tagging and trip DELETE currently
   bypass the lock check (Session B Q2, unanswered) — don't copy those handlers as templates
   either.
3. **Owner-only routes** get `requireOwner`. Use OP-06's §2 access matrix for *which route
   classes* are owner-only — but ignore that document's PASS/FAIL verdicts (stale since the
   #80–#94 sprint).
4. **Zod validation** in `src/backend/validation/*.schemas.ts`, wired via the validate
   middleware. Use `.strict()` like trips/places. UNCONFIRMED: items schemas are non-strict
   with no recorded reason — don't propagate the lenient style.
5. **Semgrep suppression:** route files that don't import `requireOwner` need the
   `nosemgrep: travel-tracker.express-route-no-auth` comment on each route (the rule's
   file-level model is under redesign; until then follow the existing boilerplate).

## Procedure

1. Branch `feat/<slug>` or `fix/<slug>` off main (never commit to main).
2. Implement route + validation schema + repository/service changes.
3. If you touched `server.ts` middleware: mirror the change in `server-test-app.ts` — it
   hand-duplicates the entire pipeline, and nothing detects divergence. Say so in the PR.
4. Tests:
   - Unit tests in `src/backend/routes/__tests__/` (supertest against `server-test-app.ts`).
     Assert behaviour, not just status codes — an accept-either-outcome assertion
     (`expect([200,404]).toContain(...)`) is not a test.
   - Add rows to `src/backend/routes/__tests__/security.access-matrix.test.ts` for every
     new/changed route: 401 unauthenticated, 403 non-owner where applicable, and **cross-user
     WRITE attempts** (POST/PATCH/DELETE with another user's resource ids) — the matrix's
     historical read-only framing is exactly how the items-POST hole survived.
   - Contract test in `tests/contract/` if the endpoint contract changed. WARNING: local
     contract runs hit whatever DB the running server uses — your real `dev.db` — and never
     clean up. Prefer letting CI run them, or point the server at a throwaway DB first.
5. Same-PR doc updates (CLAUDE.md document-lifecycle rule): update
   `jobs/backend/tech/20260307-api-reference.md` for the endpoints you touched, including their
   auth/ownership requirements (the doc predates auth entirely — improve your endpoints' entries,
   don't inherit its silence). If response shapes changed, update `src/frontend/types/api.ts`
   (it is checked by nothing and has drifted before).
6. Complete the CLAUDE.md backend security checklist confirmations in your completion report.

## Definition of done

- [ ] `/pre-push` clean (check, type:check:all, test:backend, test:frontend)
- [ ] Access-matrix rows added for every new/changed route, including a cross-user write case
- [ ] Lock behaviour asserted for every new write endpoint (403 on locked trip)
- [ ] api-reference.md entries for touched endpoints updated in the same PR; types/api.ts in sync
- [ ] PR title carries the tracker ID; body has `Closes #N`; tracker notes carry the issue number
- [ ] CI green on the PR; completion report filed; do not merge your own PR (COO merges)
```

### 4.3 `coo-merge-and-close` (from W3)

Guards incorporated: CLAUDE.md merge/post-merge rules (BUG-24 origin), document-lifecycle enforcement at review time, BUG-23 tracker trap (with this session's JSONC correction), invariant 30 (silent hooks / drift-ledger canary), Session A cluster-E (tracker.json as the only live status source).

Complements — does not replace — the existing `coo-startup` skill: startup audits the state you inherit; this covers the state you leave behind.

Proposed path: `.claude/skills/coo-merge-and-close/SKILL.md`

```markdown
---
name: coo-merge-and-close
description: COO procedure for merging PRs and closing a session — squash merge, branch hygiene,
  main-CI verification, inbox triage, tracker update, park doc. Use alongside /coo-startup
  (startup audits inherited state; this closes out the session's own).
---

## Merging each PR

1. Review the diff. Reject (or fix forward in-session) if the PR changes a fact asserted by a
   status/verdict document without updating that document in the same PR — this review moment
   is the enforcement point for the document-lifecycle rule; missed here, verdicts rot silently
   (the OP-06 failure class).
2. Confirm the PR's own CI is green, then:
   ```bash
   gh pr merge <n> --repo ryanv11/travel-tracker --squash --delete-branch
   git checkout main && git pull
   git branch -D <branch-name>        # force-delete expected with squash merges
   ```
3. Post-merge verification (mandatory, before the next merge or session end):
   ```bash
   gh run list --repo ryanv11/travel-tracker --branch main --limit 4
   ```
   A green PR does not guarantee a green main — two individually-green PRs can compose to a red
   main via squash-merge races (BUG-24). If main goes red, fixing it is the immediate next
   action; never leave it for a future session without a tracked issue.
4. After the merge batch: `git branch` must list only `main`.

## Session close checklist

1. **Inbox triage:** process `jobs/COO/inbox/*.md`; `git mv` handled reports to
   `jobs/COO/inbox/read/`. A completion report is only acceptable if the work it reports is
   committed and merged — agents must never leave deliverables as uncommitted working-tree
   changes.
2. **Tracker:** update `_project/tracker.json` statuses and notes directly (edit the JSON).
   TWO TRAPS, both live as of 2026-07-08:
   - `scripts/tracker.js` is broken (BUG-23 / issue #96): its comment-stripper corrupts any
     string value containing `//`. Never put `//` (including URLs) inside tracker.json string
     values until #96 is fixed.
   - The file is JSONC — it contains real `// ───` section-header comments — so plain
     `JSON.parse` will NOT validate it. Do not "fix" a parse failure by deleting those comments
     without a decision. There is currently no mechanical validation; re-read your edit.
   New issues raised: tracker ID in the issue title, issue number back in the tracker `notes`.
3. **BRD reconciliation (only if the BRD changed this session):** every new requirement ID has
   a tracker entry, stated success criteria, and the BRD **header** version matches the latest
   changelog entry (the header has lagged before — 2.5 vs 2.7).
4. **Park doc:** write `jobs/COO/park-docs/YYYYMMDD_HHMM-COO-park.txt` — session state, open
   threads, next actions (this is what the next /coo-startup reads).
5. **Drift ledger:** `.planning/drift-ledger.jsonl` is appended automatically by the PostToolUse
   hook — commit whatever accumulated. Canary: an editing session that produced ZERO new ledger
   entries means the hooks are silently broken (they fail with `|| true` by design) —
   investigate before trusting this session's typecheck feedback.
6. Close-out commit goes on a `chore/<slug>` branch → PR, like all work (never direct to main).

## Definition of done

- [ ] Main's own CI green after the final merge (`gh run list --branch main`)
- [ ] `git branch` shows only `main`
- [ ] `jobs/COO/inbox/` triaged; handled reports in `read/`
- [ ] tracker.json statuses match merged reality; no `//` introduced inside string values
- [ ] Park doc written; drift ledger committed (and non-empty if files were edited)
- [ ] If BRD touched: header version == changelog version; every new ID has tracker entry +
      success criteria
```

### 4.4 `record-decision` (from W4)

Guards incorporated: Session A doc-17 findings (ADL-28 log gap, pointer drift), doc-6 findings (BRD header lag, v2.7 sign-off gap, unclosed OQs), CLAUDE.md's three BRD gates (restated here only as procedure steps — the *rules* stay in CLAUDE.md), document-lifecycle rules 2 and 4.

Proposed path: `.claude/skills/record-decision/SKILL.md`

```markdown
---
name: record-decision
description: Record an architecture decision (ADL entry) or bump the BRD — numbering,
  supersession stamps, open-question closure, tracker sync. Load before editing the ADL log,
  a standalone ADL file, or the BRD.
---

## ADL entries

1. **Number:** last entry + 1 — but check BOTH the main log
   (`jobs/architect/tech/20260307-architecture-decisions-log.md`) AND the standalone
   `jobs/architect/tech/ADL-*.md` files; numbering has skipped the log before (ADL-28 exists
   only as a standalone file).
2. **The main log always gets the entry** — date, trigger (what inbox item / issue / incident
   prompted it), decision, alternatives considered, implementation implications. A standalone
   `ADL-NN-<slug>.md` file is fine for a long design, but it supplements the log entry
   (summary + pointer), never replaces it. ADL-24's merge banner is the exemplar for
   retiring a standalone file into the log.
3. **Implementation status:** state whether the decision is implemented or pending in the entry
   itself, and update it when the implementing PR merges (same-PR rule). "Decided" with no
   status marker is how ADL-28 became indistinguishable from shipped work.
4. **Supersession:** if this decision replaces an earlier ADL or invalidates a spec section,
   the same PR stamps the superseded text:
   `> SUPERSEDED (YYYY-MM-DD) by ADL-NN — retained for history.`
   (ADL-17 → ADL-20 is the exemplar.) Check specifically: security-spec.md, the tech blueprint,
   the map-shading spec — the three documents Sessions A/B found silently outrun by decisions.
5. **Open-question closure:** if the decision answers an open question in the BRD (§10) or a
   spec, record the resolution there in the same PR. (OQ-01/OQ-02 sat open long after being
   answered.)
6. File pointers in implications must name real paths — verify each one exists before writing
   it (ADL-27/29 shipped with wrong file paths that survived review).

## BRD version bumps

1. Edit the body sections AND add the §13 changelog entry AND bump the **header** version
   field — three places, and the header is the one that has been forgotten (stuck at 2.5
   through v2.7).
2. Changelog author/approval: every accepted entry lists the PO as approver.
   UNCONFIRMED: v2.7 lists only "COO" and its retroactive approval is an open question
   (Session A Q5) — do not treat COO-only sign-off as an accepted pattern; get the PO line.
3. Every new requirement ID must state measurable success criteria before any brief dispatches
   from it, and must get a tracker entry before session close (both CLAUDE.md gates — this is
   the procedural reminder, not the rule's home).

## Definition of done

- [ ] Main ADL log contains the entry (not only a standalone file); numbering contiguous
- [ ] Implementation status stated in the entry
- [ ] Superseded ADL entries / spec sections stamped in the same PR
- [ ] Answered open questions closed in their home document
- [ ] BRD: header version == latest changelog version; PO approval recorded
- [ ] Each new requirement ID: success criteria stated + tracker entry exists
- [ ] All file paths cited in the entry verified to exist
```

## 5. Load-order recommendation (Task 3)

This extends Session A's §4 target structure ("always-loaded: CLAUDE.md, kept lean; first reads on demand: CODEBASE.md → tracker → BRD → ADL; task-specific references after that") rather than redesigning it. The skills above slot in as a fourth layer: **task-scoped procedure, loaded only when the task type matches.**

### Stays in always-loaded CLAUDE.md (global invariants only)

- Never commit to main; branch naming; agents don't merge own PRs; deliverables must be committed.
- The five mandatory gates as *rules* (BRD→tracker, BRD-before-brief, success criteria, document lifecycle, backend security checklist requirement) — they bind every session regardless of task, and several bind the COO's *brief-writing*, which no task skill covers.
- The `db:push` ban as a one-liner + ADL-15 pointer (the trap is universal enough that it must survive even when no skill loads).
- Environment facts, dev/test commands, key-file pointers, `/pre-push` and `/coo-startup` mandates.

### Moves OUT of CLAUDE.md into skills (cuts always-loaded baseline)

| CLAUDE.md section today | Destination | Rationale |
|---|---|---|
| "Merging a PR (COO only)" command block + "Post-merge verification" block | `coo-merge-and-close` | Pure COO procedure; ~30 lines only the COO ever executes. Keep one line: "COO merges via /coo-merge-and-close." |
| "Schema changes (Drizzle ORM)" workflow detail | `schema-change` | Keep the two-line ban + pointer; the generate/migrate procedure and patch narrative load only when schema work happens. |
| "Security checklist for Backend briefs" — the enumerated items | `backend-route-change` | CLAUDE.md keeps the *rule* that every backend brief must include the checklist (binds COO); the checklist's operational content lives where the implementing agent loads it. |
| "Opening a PR" / "After opening a PR" snippets | `backend-route-change` (and any future frontend sibling) | Procedure, not policy. |

Net effect: CLAUDE.md drops roughly a third of its length while every removed line remains reachable exactly when relevant. This also fixes an asymmetry Session A implied but didn't name: the repo's two existing skills are both *gates* (pre-push, coo-startup) while all *task* procedure sat in the always-loaded file.

### Load-per-task map

| Task type | Load order after CLAUDE.md |
|---|---|
| Schema work | `schema-change` → `schema.ts` + governing ADL entry. Never ER-schema.md as current truth. |
| Backend route work | `backend-route-change` → OP-06 §2 matrix (structure only, not verdicts) → api-reference for touched endpoints. |
| COO session | `coo-startup` (start) → … → `coo-merge-and-close` (merges + close). |
| Architect/BRD work | `record-decision` → main ADL log → BRD changelog. |
| Frontend work | no skill yet (W5, pending Q2) → CODEBASE.md frontend section + `types/api.ts`. |

### Dependency on Session A's doc-fix session

Two drafts reference documents Session A queued for repair (OP-06 §2 matrix, api-reference). The skills are written to be safe against the *current* stale state ("use the matrix, ignore the verdicts"), but those hedges should be simplified once the doc-fix session lands — a skill that teaches distrust of a repaired document is its own drift. Whoever installs the skills after the doc-fix session should strip the staleness warnings that no longer apply.

## 6. Questions for Ryan

1. **The named-workflows list was empty.** The four drafted candidates (schema-change, backend-route-change, coo-merge-and-close, record-decision) are inferred from history alone. Confirm, rename, or strike each — and name anything you consider a recurring workflow that history doesn't show (the brief's examples mentioned "modify the drift ledger hook" and "add a new agent role"; neither has enough historical trace to draft from).
2. **Observed-but-unnamed (W5–W8):** do any of frontend-feature work, doc-fix/audit sessions, dependency passes, or UAT logging deserve a skill next? W5 (frontend) is the strongest of the four.
3. **`users` timestamp divergence** (schema-change draft, UNCONFIRMED): integer-epoch on `users` vs text-ISO everywhere else — deliberate? The skill currently says "follow text-ISO for new tables; don't copy users without a ruling."
4. **Items POST ownership hole** (backend draft, UNCONFIRMED — Session B Q1): the draft tells agents to template from `places.ts` and treat `items.ts` POST as a bug. When you answer Session B Q1 (and the fix lands), that warning should be rewritten or removed.
5. **Lock carve-outs** (backend draft, UNCONFIRMED — Session B Q2): whether place-activity tagging and trip DELETE legitimately bypass the lock decides what the draft's "lock behaviour asserted" DoD line should require for those endpoint classes.
6. **Items schemas non-strict** (backend draft, UNCONFIRMED): is the missing `.strict()` on item schemas a convention or an accident? The draft currently forbids propagating it.
7. **`asyncHandler`** (backend draft, UNCONFIRMED — Session B Q5): kept or dropped decides whether the draft's "wrap in asyncHandler" line is a rule or gets deleted.
8. **BRD sign-off pattern** (record-decision draft, UNCONFIRMED — Session A Q5): the draft requires a PO approval line on every changelog entry. Confirm that's the intended standard (v2.7 is the outlier either way).
9. **Local contract runs** (backend draft): the draft warns agents off running `test:contract` against their real dev.db. Do you want that hardened into "never run contract tests locally until a dedicated contract.db lands" (Session B invariant 28's proposal), or is local-run-with-caution acceptable?
10. **Test-DDL consolidation** (schema-change draft, UNCONFIRMED): the draft's step 5 (hand-mirror 13 DDL copies) becomes one line if Session B's migration-applying test-DB factory is approved. That single decision removes the most error-prone step in the most dangerous workflow — worth prioritizing before installing the schema skill.
11. **Tracker validation** (coo-merge-and-close draft): tracker.json turns out to be JSONC with real section comments (corrects Session B's "no actual comments" note), so there is currently *no* way to mechanically validate an edit. Fix #96 with a string-aware stripper, or strip the decorative comments and make it plain JSON? The draft can't offer a validation command until one of those happens.
12. **CLAUDE.md slimming** (§5): approve moving the merge-procedure, schema-workflow detail, security-checklist enumeration, and PR snippets out of CLAUDE.md into the skills? (The rules stay; only procedure moves.)

## 7. Coverage statement

**Evidence base:** both prior audit reports read in full (Session A 572 lines, Session B 215 lines); all 201 main-branch commit messages classified; ~15 representative commits inspected file-by-file across the five commit classes (schema, implementation, dispatch, session-close, BRD/ADL); repo structure checks for `.claude/skills/` conventions, hooks, `jobs/COO/` layout, migrations, contract tests; live reproduction of BUG-23 plus a raw `JSON.parse` of tracker.json (new finding: the file is JSONC — §2 W3). Skill drafts cite only paths/commands verified this session or findings carried from Sessions A/B with their audit references.

**Limits:** no Ryan-named workflows existed to anchor the extraction (§3); W5–W8 got evidence-level treatment only, per the brief's "fewer candidates fully rather than all shallowly" rule; the drafts embed eight `UNCONFIRMED:` markers, each mapped to a numbered question in §6 — none was resolved by assumption. Jobs correspondence (`jobs/*/inbox`, `history/`) was used only as commit-level evidence, not re-audited (Session A's scope).

**Read-only compliance:** no repo file was created, modified, or deleted except this report. The `.planning/drift-ledger.jsonl` working-tree modification predates this session and was left untouched; the drift-ledger PostToolUse hook may have appended entries for this report's own writes, which is the hook working as designed.

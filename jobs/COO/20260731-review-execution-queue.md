# Execution queue — codebase + orchestration review (read-only COO session, 2026-07-31)

**Provenance:** Produced by a read-only COO session run in parallel with the ADL-46 release work,
at the PO's request. Full review: codebase health, test strategy, build-vs-buy, orchestration
layer, token efficiency. Everything below is PO-reviewed and PO-approved in principle — the PO
asked for this written up "ready for execution." Nothing here has been dispatched, tracked, or
committed; this file itself is deliberately left uncommitted (read-only session; commit it with
your own branch work when you pick it up).

**How to use this doc:**
1. Execute Tier 1 top-to-bottom — all are small, none depend on ADL-46.
2. Tier 2 items become tracker entries + briefs AFTER the ADL-46 release merges to main.
3. Tier 3 items need the marked PO decision or prerequisite first.
4. **Do NOT reuse any IDs suggested here without checking the tracker first — assign all new
   tracker/D/OP IDs at execution time against the then-current tracker.** This session ran in
   parallel with another COO session; pre-assigned IDs are exactly the OP-28 duplicate-ID
   failure mode.

---

## Baselines captured this session (don't re-derive)

| Metric | Value | Source |
|---|---|---|
| Codebase health score | B+ (83/100), weakest dimension duplication (C+) | 8-dimension weighted scorecard, session transcript |
| Main CI wall-clock | ~85 seconds, 6 parallel jobs | gh run view, main @ b26c21c |
| Red-main rate | 1 failure in last 40 main CI runs (the D-15 incident) | gh run list |
| Test volume | ~860 backend / ~215 frontend / ~51 E2E / ~115 contract cases | grep counts |
| Token efficiency | ~174K avg input context per API call; **97.9% cache-read ratio**; 728.7M cache-read / 15.7M cache-write / 3.95M output across 19 retained session transcripts | jq over ~/.claude/projects/-workspace/*.jsonl |
| npm audit | 6 moderate, 0 high/critical | npm audit 2026-07-31 |
| Branch protection | **ENABLED this session** (see below) | gh api |

---

## ✅ Already done this session (needs recording, not doing)

**Branch protection on `main` is LIVE** — PO configured it with COO guidance, verified via API:
require PR (0 approvals), 9 required status checks (6 CI + 3 Security), `strict: true`
(require-branch-up-to-date — this closes the D-15 base-skew class), enforce_admins, linear
history, no force pushes. `production` deliberately NOT protected (direct fast-forward push is
the promotion path, ADL-35).

**Follow-ups owed (Tier 1 item 8 below):** record the decision, close D-15, update the two
skills.

---

## TIER 1 — next active session, in order

### 1. UAT log archival sweep (S)
The startup skill loads the full UAT log every session; it still carries closed PASS sessions
back to 2026-03-20. The existing rule (coo-startup "UAT log maintenance") says `[x]` items move
to `jobs/PO/uat-archive.md`. Apply it.
**Success criteria:** live log contains only open sessions/items; archive holds the rest;
startup payload measurably smaller (wc -c before/after).

### 2. Approve & execute D-18 startup lean-out (S — needs PO yes, PO is warm)
D-18 proposal is committed (PR #335) and awaiting adoption. The token data above is the
argument: ~174K avg context/call, and the startup payload is the fixed floor of it. PO has
explicitly said token efficiency matters ("stretch the sessions, minimise hard stops").
**Success criteria:** per D-18's own proposal doc; capture a before/after avg-context-per-call
number using the jq parse in this file's Baselines section.

### 3. Environment parity + post-deploy smoke (QUAL-18 / QUAL-19 / QUAL-20 — already tracked)
Dispatch order: QUAL-20 (staging smoke check) first — it automates the OP-32 manual shakedown
and is the biggest reducer of defects reaching the PO. Then QUAL-18 (single-origin E2E through
Express so CSP is expressible), QUAL-19 (CSP allowlist contract test).
**Success criteria:** already recorded in their tracker entries; verify before dispatch.

### 4. ATDD promotion decision (D-17 — due at ADL-46 release close anyway)
Interim verdict POSITIVE, formal verdict owed when the release closes. This session's COO
recommendation: **promote to standing practice** (QA-first red acceptance tests for every
feature brief with BRD success criteria). Write the formal verdict + CLAUDE.md/Architect-prompt
placement per the D-17 notes in open-dialogues.

### 5. tracker.json validator wired into /pre-push (S)
~20-line script: parses the JSONC (via stripJsonComments, per the tracker-handling memory),
asserts unique IDs, valid status enums, required fields. Evidence of need: the silent duplicate
OP-28 ID collision (D-13 notes), and the tracker was once truncated to 0 bytes.
Verified this session: `scripts/status.js` checks STATUS.md staleness only — no uniqueness or
schema validation exists anywhere in scripts/ (grep for unique/duplicate + header read).
**Success criteria:** validator exits non-zero on a seeded duplicate-ID fixture; wired into the
/pre-push skill checklist; CI optionally via the biome job's step list.

### 6. Two trigger conditions written into their tracked homes (S)
- **Data durability:** "Before the first UAT round containing data the PO would be upset to
  lose, a backup/restore ADL for the Turso DBs must exist." Today's recovery story is reseed
  (disposable-data memory) — that assumption must not expire silently. Add to the
  `project_disposable_db_data` context: tracker entry or open-dialogues D-entry.
- **Clerk pool split:** staging+prod share one Clerk user pool (parked in open-dialogues).
  Add trigger: "decide before any third real user." A bad staging deploy touches prod
  identities; 'acceptable at two users' is the exact reasoning the dont-architect-for-current-
  user-base guardrail distrusts.
**Success criteria:** both triggers exist in a tracked doc a startup check reads.

### 7. COO memory volume backup (S — needs PO input on destination)
/home/node/.claude memory dir is unversioned and was lost once (OneDrive/F2 incident; recovered
from an orphaned volume by luck). Options: scheduled copy into the repo (a `_project/memory-
mirror/` dir), or a host-side backup. PO to pick destination; either is under an hour.
**Success criteria:** a memory-dir snapshot exists outside the container volume and a
recurring mechanism refreshes it.

### 8. Branch-protection follow-ups (S)
- Close **D-15** in open-dialogues citing the strict/up-to-date setting (this was the exact
  B7+B8 failure).
- `/pre-push` skill: add one line — "This is a fast pre-filter (5 of 9 CI checks). CI after
  push is the authoritative gate; ci-wait.sh is mandatory." (PO confusion this session: agents
  'pre-commit check green but CI red' — the mechanism is E2E/contract/audit/gitleaks/semgrep
  not running locally, plus base skew, now closed.)
- `/coo-merge-and-close` skill: note that PRs behind main now require update-branch
  (`gh pr update-branch`) + ~85s CI re-run before merge.
- Record the whole thing per /record-decision (likely an OP-entry; assign number at execution).

### 9. Parked-decisions register in /coo-startup (S)
New startup step: a short standing list of identified-but-unadopted fixes, checked each session
so they stop relying on memory. Seed it with: D-13 durable fix (COO sessions doing git work in
own worktrees vs single-active-COO lock), OP-26/OP-28 hook warn→block reviews (need a
false-positive count collected first), jobs/** archival convention (449 files and growing).
**Success criteria:** startup skill has the section; each entry carries a revisit trigger.

---

## TIER 2 — code health briefs, AFTER release/adl46-access-model merges to main

All are class **gap/refactor** per OP-32 (nothing here is a regression or deployment defect).
Each needs a tracker entry; the two marked ADL need the BRD gate before dispatch.

### 10. Extract useTripsListController (Frontend brief, M)
Desktop/MobileTripsLayout share ~90% of logic verbatim (~450 lines): the whole bulk-delete +
5s-undo state machine, 6 useStates, all memos; SortOption declared 3×. Zero component tests on
any of it. Precedent to copy: useTripDetailController (same folder pattern, its doc comment
records the extraction rationale). Include: SortOption single definition, STATUS_CHIPS single
definition, component tests over the bulk-delete/undo flow.
Secondary (same brief or follow-on): deleteDialogCopy + places sort comparator duplicated
between TripDetail.tsx and MobileTripDetailView.tsx → move into the controller/util.
**Success criteria:** one controller hook consumed by both layouts; duplicated logic regions
gone (diff proves it); new tests cover select/delete/undo/timer paths; all CI green.

### 11. Backend layering + params brief (Backend brief, M — security checklist applies)
- Add `citiesRepository` for the two user-scoped direct-DB handlers in
  src/backend/routes/cities.ts (~L284-308 carry-forward join, ~L358-398 city items query) —
  ADL-18 violations.
- trips.ts GET /:id (~L194-221): remove the dynamic `await import('drizzle-orm')` in the
  handler; route the query through tripRepository; reconcile its hand-rolled response shape
  with buildTripResponse (they diverge subtly).
- New `validateParams` zod middleware; retire the 34× hand-repeated parseInt idiom (12×
  places.ts, 6× items.ts, 5× trips.ts, 4× cities.ts + others) — note parseInt currently
  accepts "12abc".
- Fix DELETE /api/trips/:id (~L433-437): only route in the backend returning a manual 400
  (message "Trip not found") — align on NotFoundError/404 like every sibling.
**Success criteria:** no getDb() call in cities.ts route handlers for user-scoped data; grep
for the parseInt idiom returns 0 in routes/; DELETE returns 404 for malformed ids; contract
tests updated if the 400→404 changes a documented contract; all CI green.

### 12. Dead-code and false-doc sweep (S, any role)
Confirmed dead this session (two probes each, per negative-findings rule — grep + routing/
registration read):
- src/frontend/pages/TripsPage.tsx (App.tsx routes /trips directly to TripsLayout; file's own
  comment says legacy)
- getCityShading in src/backend/services/shading.service.ts (~L368) — no route registers it
- fieldLabel + the `void fieldLabel;` suppression in ItemForm.tsx (~L76, ~L111) — comment on it
  is factually wrong
Misleading docs to fix in the same pass:
- **ItemForm.tsx:8 claims "Validation: reuses backend Zod schemas (SEC-12)" — the frontend has
  zero zod usage (grep -rl zod src/frontend returns nothing + no zod import in file). Either
  delete the claim or implement it via item 17.** This is a doc asserting an unimplemented
  security control — flag in the PR description.
- TripList.tsx:2-3 describes a "legacy list component" that no longer exists in the file.
**Success criteria:** files/symbols deleted, app builds, no route/import breaks (CI green);
both doc comments corrected.

### 13. ISO 3166-2 reference-data adoption (Architect ADL first — BRD gate)
Build-vs-buy decision that closes four backlog threads at once: OQ-06 (its literal question),
D-14 (USA/US search wants ISO codes), the BUG-30 class (hand-seeded region gaps), BUG-45
(airline/provider lists — separate dataset, same decision shape). Architect to evaluate
packaged ISO 3166-1/2 npm datasets vs vendored data files; Database downstream for seed
integration. COO recommendation on D-14 already recorded in open-dialogues (ISO tier-2).
**Success criteria (for the ADL):** named data source + licence check + update cadence +
migration/seed plan + which of OQ-06/D-14/BUG-45 it closes.

### 14. Minor-version dependency batch bump (S)
biome, @clerk/react, playwright, tailwind, tanstack-query, helmet, jose, express-rate-limit,
pg, tsx, @types/* — minors/patches only. **Exclusions:** drizzle-kit (0.31.10 exists but the
four-bug patch pins 0.31.9 — upgrading requires re-verifying all four bugs per the memory
note; separate task, not this batch) and all majors (React 19, router 7, maplibre 6, libsql
0.17, dotenv 17 — each needs its own Architect ADL per the runtime-changes guardrail; none
urgent).
**Success criteria:** all CI green incl. E2E; no major bumped; patch-package still applies.

---

## TIER 3 — needs a PO decision or a prerequisite

### 15. Goal-6 scorecard (M) — PO explicitly wants this direction
One recurring PO-readable report (park-doc section or scheduled routine):
- **Escape rate:** defects found by PO ÷ (PO-found + CI/QA-caught) per cycle. Baseline: the
  2026-07-21 UAT session logged 19 (BUG-40–58).
- **Rework rate:** briefs needing re-dispatch/fix-cycles per wave. Dual-purpose: quality metric
  AND the biggest token sink (each re-dispatch ≈ a full fresh agent context).
- **Backlog flow:** arrival vs closure rate from tracker.json timestamps.
- **Hook violations per wave:** from drift ledger + hook warn output (also feeds the OP-26/28
  warn→block reviews).
- **Token burn:** tokens/session + cache-hit ratio via the jq parse in Baselines (script it,
  ~20 lines over ~/.claude/projects/-workspace/*.jsonl).
**PO framing to honour:** this answers "would I know if things got out of hand" without
reading code. Keep it to one page, trended.

### 16. PO-journey Playwright pack (L — prerequisites: item 3 + detail-panel data-testid debt)
Encode the stable items from the PO's UAT checklists as E2E tests (e.g. trip delete from
detail view w/ cancel safety; non-owner admin tab visibility). Rationale: the PO's UAT
sessions are the de facto regression suite and the PO is the pipeline bottleneck (two sessions
currently pending). The data-testid scoping debt (project_playwright_panel_scoping memory) must
land first or panel-scoped tests stay flaky.

### 17. react-hook-form + shared zod schemas (Architect ADL first — BRD gate)
One adoption, three payoffs: collapses ItemForm's ~28 useStates + 5-deep buildPayload ternary,
delivers real client-side validation by sharing the backend's existing zod schemas (makes the
false SEC-12 claim true), natural home for the BUG-57/IT-11 date-cascade logic. Folds the
ItemForm refactor + its design-token migration (only component still on raw Tailwind palette
classes) into the implementation brief.

### 18. Prod error telemetry + UAT WIP limit (S each — each needs a PO call)
- Telemetry: Sentry (or similar) on backend + frontend; closes "nobody watches prod at
  runtime" (current coverage: CI pre-deploy + PO's eyes only). Needs PO ok for the external
  service + the dependency (and an ADL, it's infra).
- WIP limit: propose "no new wave dispatches while >N items sit done_pending_uat" — PO to set
  N. Pure process rule, one CLAUDE.md line once agreed.

### 19. Coverage visibility + headless UI primitives (S / ongoing)
- Vitest coverage as a CI artifact with per-area numbers — visibility only, explicitly NO
  threshold gates (this team's failure mode is environment-expressibility, not missing tests).
- Radix-style headless primitives adopted incrementally as components get touched (dialogs,
  dropdowns, comboboxes) — retires the a11y/focus-trap defect class without a big-bang swap.
  Works under the existing wp-* tokens (they're unstyled). Needs an Architect nod (new dep).

---

## Sequencing constraints & warnings

1. **Nothing in Tier 2 dispatches until release/adl46-access-model → main merges.** Items 10/17
   touch files the Frontend stage is editing (AddPlaceFlow, useCities/useAdmin surface).
2. **The ADL-46 release PR itself now faces branch protection**: must be up-to-date with main
   and fully green (incl. the 4 admin.spec.ts E2E the Frontend stage exists to fix). Correct
   gate, but the bar moved mid-release — expect one update-branch + re-run.
3. **Backend briefs (item 11) carry the mandatory security checklist** (CLAUDE.md), and every
   brief needs BRD-gated success criteria before dispatch — most success criteria above are
   starting points, tighten at briefing time.
4. **Session hygiene as a standing token practice** (PO priority): close sessions at natural
   milestones rather than keeping long sessions alive — cache-read spend grows with every turn;
   capture the before/after context-per-call numbers around items 1+2.

## PO decisions still open (surface at next natural boundary)
- D-18 adoption (item 2) — PO warm, wants it executed.
- ATDD promotion (item 4) — COO recommends promote; formal verdict at release close.
- Memory backup destination (item 7).
- Sentry/telemetry service choice + WIP limit N (item 18).
- The two ADL requests to queue with Architect: ISO data (13), RHF+zod (17).

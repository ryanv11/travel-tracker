# Execution queue — codebase + orchestration review (originated read-only COO session, 2026-07-31)

**Provenance:** Produced by a read-only COO review (codebase health, test strategy, build-vs-buy,
orchestration, token efficiency), PO-approved in principle, written up "ready for execution."

> **Curated 2026-08-08.** Completed items removed (their canonical home is the record — tracker
> entry / ADL / shipped PR / this session's work; git history holds the original queue). Six items
> were fully done and deleted (2, 4, 5, 9, 10, 13); three were trimmed to their residual (3, 8, 12).
> What remains below is open work only. **Assign all new tracker/D/OP IDs at execution time against
> the then-current tracker** — `npm run tracker:check` now hard-fails duplicates, but still grep first.

---

## Baselines captured 2026-07-31 (historical snapshot — do not re-derive, but they will have drifted)

| Metric | Value | Source |
|---|---|---|
| Codebase health score | B+ (83/100), weakest dimension duplication (C+) | 8-dimension weighted scorecard |
| Main CI wall-clock | ~85 seconds, 6 parallel jobs | gh run view, main @ b26c21c |
| Test volume | ~860 backend / ~215 frontend / ~51 E2E / ~115 contract cases | grep counts |
| Token efficiency | ~174K avg input context/call; **97.9% cache-read ratio** | jq over session transcripts |
| Branch protection | ENABLED (require PR, 9 checks, strict up-to-date, enforce_admins) | gh api |

---

## TIER 1 — next active session, in order

### 1. UAT log archival sweep (S)
The startup skill loads the full UAT log every session; it still carries closed PASS sessions back to
2026-03-20 (12 session headers as of 2026-08-08). The existing rule (coo-startup "UAT log
maintenance") says `[x]` items move to `jobs/PO/uat-archive.md`. Apply it.
**Success criteria:** live log contains only open sessions/items; archive holds the rest; startup
payload measurably smaller (wc -c before/after).

### 3. Environment parity + post-deploy smoke — residual: QUAL-18 / QUAL-19
QUAL-20 (staging post-deploy smoke) **shipped 2026-08-01 (#385)**. Still open and tracked: **QUAL-18**
(P1 — single-origin E2E through Express so CSP is expressible) and **QUAL-19** (CSP allowlist contract
test). Their own effort; likely needs Architect. Success criteria live in their tracker entries.

### 6. Two trigger conditions written into their tracked homes (S)
- **Data durability:** "Before the first UAT round containing data the PO would be upset to lose, a
  backup/restore ADL for the Turso DBs must exist." Today's recovery story is reseed (disposable-data
  memory) — that assumption must not expire silently. Add to the `project_disposable_db_data` context
  (verified absent 2026-08-08): tracker entry or open-dialogues entry. Relates item 7.
- **Clerk pool split:** staging+prod share one Clerk user pool (open-dialogues D-05). Add trigger:
  "decide before any third real user." A bad staging deploy touches prod identities.
**Success criteria:** both triggers exist in a tracked doc a startup check reads.

### 7. COO memory volume backup (S — needs PO input on destination)
`/home/node/.claude` memory dir is unversioned and was lost once (recovered from an orphaned volume by
luck). Options: scheduled copy into the repo (`_project/memory-mirror/`), or a host-side backup. PO to
pick destination; either is under an hour.
**Success criteria:** a memory-dir snapshot exists outside the container volume and a recurring
mechanism refreshes it.

### 8. Branch-protection follow-ups — residual (S)
Branch protection is live and D-15 is closed. Remaining:
- `/pre-push` skill: add one line — "This is a fast pre-filter (5 of 9 CI checks). CI after push is the
  authoritative gate; `ci-wait.sh` is mandatory." (Addresses the recurring 'pre-commit green but CI
  red' confusion — E2E/contract/audit/gitleaks/semgrep don't run locally.)
- `/coo-merge-and-close` skill: note that PRs behind main require `gh pr update-branch` + ~85s CI re-run
  before merge.
- Record the branch-protection decision per `/record-decision` (likely an OP-entry; assign at execution).

---

## TIER 2 — code-health briefs (class gap/refactor per OP-32; each needs a tracker entry)

### 11. Backend layering + params brief (Backend brief, M — security checklist applies)
Verified still outstanding 2026-08-08 (no `citiesRepository`, no `validateParams`, DELETE still 400s):
- Add `citiesRepository` for the two user-scoped direct-DB handlers in `src/backend/routes/cities.ts`
  (carry-forward join, city-items query) — ADL-18 violations.
- `trips.ts` GET /:id: remove the dynamic `await import('drizzle-orm')` in the handler; route through
  `tripRepository`; reconcile its hand-rolled response with `buildTripResponse` (they diverge subtly).
- New `validateParams` zod middleware; retire the ~34× hand-repeated `parseInt` idiom in routes/ (note
  `parseInt` currently accepts "12abc").
- Fix `DELETE /api/trips/:id` (`trips.ts:448`): the only route returning a manual 400 ("Trip not
  found") — align on `NotFoundError`/404 like every sibling.
**Success criteria:** no `getDb()` in cities.ts route handlers for user-scoped data; the parseInt idiom
grep returns 0 in routes/; DELETE returns 404 for malformed ids; contract tests updated if 400→404
changes a documented contract; all CI green.

### 12. False-doc + dead-symbol sweep — residual (S, any role)
`TripsPage.tsx` and `getCityShading` are already gone (QUAL-33). Still present, verified 2026-08-08:
- **`ItemForm.tsx:8` claims "Validation: reuses backend Zod schemas (SEC-12)" — the frontend has zero
  zod usage.** A doc asserting an unimplemented security control: delete the claim, or implement it via
  item 17. Flag in the PR description.
- `fieldLabel` + the `void fieldLabel;` suppression in `ItemForm.tsx:77` — the comment on it is
  factually wrong; the symbol is dead.
- `TripList.tsx:2-3` describes a "legacy list component" that no longer exists in the file.
**Success criteria:** dead symbols deleted, app builds, no route/import breaks (CI green); both doc
comments corrected.

### 14. Minor-version dependency batch bump (S)
biome, @clerk/react, playwright, tailwind, tanstack-query, helmet, jose, express-rate-limit, pg, tsx,
@types/* — minors/patches only. **Exclusions:** drizzle-kit (pinned 0.31.9 by the four-bug patch —
upgrading requires re-verifying all four bugs; separate task) and all majors (React 19, router 7,
maplibre 6, libsql 0.17, dotenv 17 — each needs its own Architect ADL per the runtime-changes
guardrail; none urgent).
**Success criteria:** all CI green incl. E2E; no major bumped; patch-package still applies.

---

## TIER 3 — needs a PO decision or a prerequisite

### 15. Goal-6 scorecard (M) — PO explicitly wants this direction
One recurring PO-readable report (park-doc section or scheduled routine): **escape rate** (defects
found by PO ÷ all defects), **rework rate** (re-dispatches per wave — also the biggest token sink),
**backlog flow** (arrival vs closure from tracker timestamps), **hook violations per wave** (drift
ledger + hook output), **token burn** (tokens/session + cache-hit ratio via the jq parse).
**PO framing:** answers "would I know if things got out of hand" without reading code. One page, trended.

### 16. PO-journey Playwright pack (L — prerequisites: item 3 + detail-panel data-testid debt)
Encode the stable items from the PO's UAT checklists as E2E tests (trip delete from detail view w/
cancel safety; non-owner admin tab visibility). The PO's UAT sessions are the de facto regression suite
and the PO is the pipeline bottleneck. The data-testid scoping debt (`project_playwright_panel_scoping`
memory) must land first or panel-scoped tests stay flaky.

### 17. react-hook-form + shared zod schemas (Architect ADL first — BRD gate)
One adoption, three payoffs: collapses ItemForm's ~28 useStates + deep buildPayload ternary; delivers
real client-side validation by sharing the backend's zod schemas (makes the false SEC-12 claim in item
12 true); natural home for the BUG-57/IT-11 date-cascade logic. Folds the ItemForm refactor + its
design-token migration into the implementation brief.

### 18. Prod error telemetry + UAT WIP limit (S each — each needs a PO call)
- Telemetry: Sentry (or similar) on backend + frontend; closes "nobody watches prod at runtime"
  (current coverage: CI pre-deploy + PO's eyes only). Needs PO ok for the external service + an ADL.
- WIP limit: propose "no new wave dispatches while >N items sit done_pending_uat" — PO sets N. One
  CLAUDE.md line once agreed.

### 19. Coverage visibility + headless UI primitives (S / ongoing)
- Vitest coverage as a CI artifact with per-area numbers — visibility only, explicitly NO threshold
  gates (this team's failure mode is environment-expressibility, not missing tests).
- Radix-style headless primitives adopted incrementally as components get touched (dialogs, dropdowns,
  comboboxes) — retires the a11y/focus-trap defect class without a big-bang swap. Needs an Architect nod.

---

## Sequencing constraints & warnings

- **Backend briefs (item 11) carry the mandatory security checklist** (CLAUDE.md), and every brief
  needs BRD-gated success criteria before dispatch — the success criteria above are starting points,
  tighten at briefing time.
- **Session hygiene as a standing token practice** (PO priority): close sessions at natural milestones;
  cache-read spend grows with every turn.

## PO decisions still open
- Memory backup destination (item 7).
- Sentry/telemetry service choice + WIP limit N (item 18).
- RHF+zod ADL to queue with Architect (item 17).
- _(Resolved since 2026-07-31: D-18 → QUAL-35; ATDD promotion → OP-35/ADL-50; ISO data → ADL-48.)_

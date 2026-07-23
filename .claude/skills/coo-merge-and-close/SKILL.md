---
name: coo-merge-and-close
description: COO procedure for merging PRs and closing a session — squash merge, branch hygiene, main-CI verification, inbox triage, tracker + STATUS.md update, park doc. Use alongside /coo-startup (startup audits inherited state; this closes out the session's own).
---

Installed 2026-07-18 from the Session C draft (audits/session-c-workflow-extraction.md,
`chore/audit-questions` branch), updated for BUG-23's fix and the OP-12 dashboard.

## Merging each PR

1. Review the diff. Reject (or fix forward in-session) if the PR changes a fact asserted
   by a status/verdict document without updating that document in the same PR — this
   review moment is the enforcement point for the document-lifecycle rule (CLAUDE.md);
   missed here, verdicts rot silently (the OP-06 failure class).
2. Confirm the PR's CI is green — **by reading the actual job results, not an agent's
   self-report.** Use `scripts/ci-wait.sh pr <n>` to block until every check finishes
   rather than polling by hand — it does a final authoritative `--json` rollup check
   itself, not just an agent's word for it. If the PR adds a NEW CI job, open that
   job's own log: all pre-existing jobs can be green while the new one fails (OP-11
   first-round PR: 30/36 E2E specs failing behind a green-looking check list; caught
   only by reading the raw log).
3. Merge:
   ```bash
   gh pr merge <n> --repo ryanv11/travel-tracker --squash --delete-branch
   git checkout main && git pull
   git branch -D <branch-name>        # force-delete expected with squash merges
   ```
4. Post-merge verification (mandatory, before the next merge or session end):
   ```bash
   scripts/ci-wait.sh branch main
   ```
   A green PR does not guarantee a green main — two individually-green PRs can compose
   to a red main via squash-merge races (BUG-24). If main goes red, fixing it is the
   immediate next action; never leave it for a future session without a tracked issue.
5. After the merge batch: `git branch` must list only `main` (plus any branches with
   open PRs awaiting review).

## Session close checklist

1. **Inbox triage:** process `jobs/COO/inbox/*.md`; `git mv` handled reports to
   `jobs/COO/inbox/read/`. A completion report is only acceptable if the work it reports
   is committed and merged — agents must never leave deliverables as uncommitted
   working-tree changes.
2. **Tracker + STATUS.md:** update `_project/tracker.json` statuses and notes directly
   (the file is JSONC — its `// ───` section headers are intentional). Then regenerate
   the derived dashboard and validate in one step:
   ```bash
   npm run status          # regenerates _project/STATUS.md; fails on invalid JSONC
   ```
   Commit STATUS.md with the tracker change — `npm run status:check` gates staleness in
   /pre-push and CI. New issues raised this session: tracker ID in the issue title,
   issue number back in the tracker `notes` (CLAUDE.md cross-referencing rule).
3. **BRD reconciliation (only if the BRD changed this session):** every new requirement
   ID has a tracker entry and stated success criteria, and the BRD **header** version
   matches the latest changelog entry (the header lagged from v2.5 to v2.7 once). See
   /record-decision for the full BRD-bump procedure.
4. **Restart preview (mandatory before an actual session end — skip for mid-session
   housekeeping checkpoints that aren't followed by `/clear`):** Adopted 2026-07-19 after
   Ryan flagged that closing a session didn't make it visible what would and wouldn't
   survive to the next one. Produce a **three-tier** summary and show it to Ryan
   **before** writing the park doc, so he can catch gaps while the context is still live.
   (Revised 2026-07-20 — the original two-tier version labeled all outstanding pre-existing
   backlog "Not captured," which reads as "`/clear` will erase this," when most of it is
   already durably tracked elsewhere and simply wasn't touched this session. Conflating
   "at risk of being forgotten" with "already tracked, just not actioned" was the bug.)

   - **✅ Captured** — durable, will be there at next `/coo-startup`, and is *new this
     session*: tracker IDs + status changed this session, merged PRs, memory entries
     written, open PRs awaiting review. Mechanical — diff `tracker.json`/`git log`/the
     memory directory against session start.
   - **🟡 Captured, not actioned** — already exists in a durable place (a `pending`
     tracker entry, an existing `open-dialogues.md` item, a prior park doc's "suggested
     next") but nothing happened on it this session. This will **not** vanish at
     `/clear` — it's already tracked — it's just still outstanding. List it so Ryan has
     the full picture, but don't imply urgency or risk that isn't there.
   - **⚠️ Not captured** — genuinely at risk: discussed, decided, or proposed *this
     session* with no durable artifact yet (no tracker entry, memory write, ADL, PR, or
     prior park-doc mention). Reconcile two sources:
     1. Every `pending`/`in_progress` TodoWrite item against tracker.json/GitHub issues.
        TodoWrite is pure scratch state — it does not survive `/clear` — so any todo
        with no matching durable artifact is a loose end by definition.
     2. A scan back over the session's conversation for anything discussed, decided, or
        proposed that has no tracker entry, memory write, ADL, or commit. This isn't
        mechanical — reason about the actual thread; a plan Ryan hasn't confirmed yet,
        a finding raised but not ticketed, a "we should do X later" that never got
        written down, all belong here.
   - **Split the "Not captured" list before asking** — don't lump everything together
     (this was the mistake the first run made, corrected 2026-07-19):
     - *Clear-cut gaps* (a report that should exist and doesn't, a fix that's done
       but untracked) → resolve now, in this close-out. Don't defer what's actionable.
     - *Genuine open dialogue* (a proposal awaiting confirmation, an unresolved
       sub-question, a plan too large to fold into this close) → an entry in
       `jobs/COO/open-dialogues.md`, NOT a tracker.json entry — it isn't scoped,
       ticketed work yet, and tracker.json isn't the place for half-decided ideas.
   - Ask explicitly: *"anything here you want handled differently before we close?"*
5. **Park doc:** write `jobs/COO/park-docs/YYYYMMDD_HHMM-COO-park.txt` — session
   summary, state of play, suggested next actions. Its "open threads" section
   **points at `jobs/COO/open-dialogues.md` rather than restating it** — one home
   for open-dialogue content, not two copies that can drift apart. Clear-cut gaps
   resolved during the restart preview don't appear here at all (they're closed).
6. **Drift ledger:** `.planning/drift-ledger.jsonl` is appended automatically by the
   PostToolUse hook — commit whatever accumulated. Canary: an editing session that
   produced ZERO new ledger entries means the hooks are silently broken — investigate
   before trusting this session's typecheck feedback (see /coo-startup check 0).
7. Close-out commit goes on a `chore/<slug>` branch → PR, like all work (never direct
   to main).

## Definition of done

- [ ] Main's own CI green after the final merge (`scripts/ci-wait.sh branch main`)
- [ ] `git branch` shows only `main` + branches with open PRs awaiting review
- [ ] `jobs/COO/inbox/` triaged; handled reports in `read/`
- [ ] tracker.json statuses match merged reality; STATUS.md regenerated in same commit
- [ ] Restart preview shown to Ryan before park doc written; any requested captures done
- [ ] Park doc written (open threads = restart preview's uncaptured list); drift ledger
      committed (and non-empty if files were edited)
- [ ] If BRD touched: header version == changelog version; every new ID has tracker
      entry + success criteria

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
   self-report.** If the PR adds a NEW CI job, open that job's own log: all pre-existing
   jobs can be green while the new one fails (OP-11 first-round PR: 30/36 E2E specs
   failing behind a green-looking check list; caught only by reading the raw log).
3. Merge:
   ```bash
   gh pr merge <n> --repo ryanv11/travel-tracker --squash --delete-branch
   git checkout main && git pull
   git branch -D <branch-name>        # force-delete expected with squash merges
   ```
4. Post-merge verification (mandatory, before the next merge or session end):
   ```bash
   gh run list --repo ryanv11/travel-tracker --branch main --limit 4
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
4. **Park doc:** write `jobs/COO/park-docs/YYYYMMDD_HHMM-COO-park.txt` — session
   summary, state of play, open threads, suggested next actions (this is what the next
   /coo-startup reads). Point at the roadmap/tracker for work queues rather than
   restating them.
5. **Drift ledger:** `.planning/drift-ledger.jsonl` is appended automatically by the
   PostToolUse hook — commit whatever accumulated. Canary: an editing session that
   produced ZERO new ledger entries means the hooks are silently broken — investigate
   before trusting this session's typecheck feedback (see /coo-startup check 0).
6. Close-out commit goes on a `chore/<slug>` branch → PR, like all work (never direct
   to main).

## Definition of done

- [ ] Main's own CI green after the final merge (`gh run list --branch main`)
- [ ] `git branch` shows only `main` + branches with open PRs awaiting review
- [ ] `jobs/COO/inbox/` triaged; handled reports in `read/`
- [ ] tracker.json statuses match merged reality; STATUS.md regenerated in same commit
- [ ] Park doc written; drift ledger committed (and non-empty if files were edited)
- [ ] If BRD touched: header version == changelog version; every new ID has tracker
      entry + success criteria

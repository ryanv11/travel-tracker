---
name: coo-startup
description: COO session startup audit. Invoked by the COO at the start of every session.
---

## Current state

### UAT Log
!`cat /workspace/jobs/PO/uat-log.md`

### Drift ledger (last 80 entries)
!`tail -80 /workspace/.planning/drift-ledger.jsonl`

### Most recent park doc
!`ls -t /workspace/jobs/COO/park-docs/*.txt 2>/dev/null | head -1 | xargs cat 2>/dev/null || echo "No park doc found"`

### Open dialogues (not authoritative — see file header)
!`cat /workspace/jobs/COO/open-dialogues.md 2>/dev/null || echo "No open-dialogues.md found"`

---

## Startup procedure

Work through these checks in order. Surface any issues to the user before doing anything else.

### 0. Hook canary

The `.claude/hooks/*.sh` hooks fail silently by design (`|| true`, `exit 0` paths) — if
one breaks, its protection just stops with no error (audit Session B, invariant 30). Prove
they work rather than trusting silence:

```bash
# db:push guard must emit a deny decision
echo '{"tool_input":{"command":"npx drizzle-kit push"}}' \
  | bash /workspace/.claude/hooks/block-db-push.sh | grep -q '"deny"' \
  && echo "db:push guard OK" || echo "FAIL: db:push guard broken"

# typecheck hook must append a perf-log line end-to-end
before=$(wc -l < /workspace/.claude/hooks/typecheck-perf.log)
echo '{"tool_input":{"file_path":"/workspace/src/backend/server.ts"}}' \
  | bash /workspace/.claude/hooks/typecheck.sh >/dev/null
after=$(wc -l < /workspace/.claude/hooks/typecheck-perf.log)
[ "$after" -gt "$before" ] && echo "typecheck hook OK" || echo "FAIL: typecheck hook broken"
```

Any FAIL → fix the hook before doing anything else this session. Secondary tell for the
drift ledger: an editing session that produced zero new ledger entries means the
PostToolUse hooks are silently broken — investigate before trusting this session's
typecheck feedback.

### 1. Main CI health check

```bash
gh run list --repo ryanv11/travel-tracker --branch main --limit 6 \
  --json conclusion,workflowName,displayTitle \
  --jq '.[] | "\(.conclusion)\t\(.workflowName)\t\(.displayTitle)"'
```

- Any `failure` on main → **blocking first item**: diagnose which job failed
  (`gh run view <id> --log-failed`) and either fix it this session or raise a
  tracked issue before starting other work. Main red is never left unowned —
  agents only exist during sessions, so an unsurfaced red main has no other
  detection mechanism.
- Known-red jobs with an open tracked issue (e.g. DEP-01/#98 npm audit) →
  note them in the pickup summary; everything else must be green.

### 2. UAT check

Read the UAT Log above. For each open session:
- **PARTIAL or FAIL verdict** → surface to user before proceeding
- **Unchecked `[ ]` findings** → ask user for status before actioning
- **"Fixed myself" entries without a bug ID** → log them formally in the tracker

If all sessions are closed and all findings are `[x]`, UAT is clean.

### 3. Drift ledger audit

Find the last `"action":"reviewed"` entry. Scan forward to the end.

For each `"action":"subagent_stop"` found since that point:
- Verify completion report written
- Verify tracker.json updated
- Verify changes committed

Fix any gaps, then write the reviewed sentinel:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"action\":\"reviewed\"}" >> /workspace/.planning/drift-ledger.jsonl
```

If no `subagent_stop` entries since last `reviewed`, write the sentinel immediately.

### 4. BRD coverage check

Scan the most recent park doc and any unread inbox items for Architect deliverables or
agent specs produced since the last session. For each one, ask: do the requirements it
introduced have entries in `_project/travel-tracker-BRD.md`?

- Read the BRD changelog to find the current version and last update date
- If any spec introduced requirement IDs that are absent from the BRD, flag them to the
  user and add them before proceeding — the BRD is the single source of truth
- If the BRD was updated, confirm tracker entries exist for every new requirement ID
  (per the BRD → tracker rule in CLAUDE.md)

If nothing new was specced last session, note "BRD coverage clean" and move on.

### 5. Document lifecycle spot-check

Per the Document lifecycle rule in CLAUDE.md: for each PR merged since the last session
(`git log --oneline` since the last park doc / reviewed sentinel), ask — did it change a
fact asserted by a status/verdict document (OP-06 checklist, hardening-gate.md,
security-backlog.md, BRD open questions, tracker.json, any PASS/FAIL or "current state"
section)?

- If yes and the document was updated in that PR → clean.
- If yes and the document was NOT updated → fix the document now, citing the PR that
  changed the fact, before starting new work.
- If a merged PR superseded part of a spec or ADL without stamping it → add the
  `> SUPERSEDED` stamp now.

If no merged PRs since last session, note "lifecycle clean" and move on.

### 6. Park doc

Summarise from the most recent park doc: what was completed, current state, suggested next actions.

### 7. Report to user

Give a concise pickup summary: main CI status, UAT status, ledger status, BRD coverage status, lifecycle status, state of play, suggested next.

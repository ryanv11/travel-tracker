# COO ↔ PO Open Dialogues

Lightweight register for topics under discussion but not yet decided or actioned.
**Not authoritative** — nothing here is policy, a commitment, or tracked work until
it's promoted to CLAUDE.md, a tracker.json entry, an ADL, or a BRD section. This file
exists so a real discussion thread survives `/clear` without prematurely cluttering
those documents with half-formed proposals.

Adopted 2026-07-19, prompted by the first live run of the Restart Preview
(`/coo-merge-and-close`) surfacing genuine open threads that didn't belong in
tracker.json but also weren't safe to let vanish.

## How to use

- New entry when a discussion produces a real proposal or plan that isn't yet
  confirmed — not for every passing remark.
- Update the entry's status as the conversation progresses across sessions.
- On resolution: promote to its real home (tracker/ADL/CLAUDE.md/BRD/skill file)
  citing this entry's ID, then move the entry to **Resolved** below with a pointer.
  If dropped without action, move it to Resolved noting why.
- Checked at every `/coo-startup` pickup and referenced by the Restart Preview step
  in `/coo-merge-and-close` — an item in the Restart Preview's "not captured" tier
  that's genuinely still a discussion (not a clear-cut missing artifact) belongs here,
  not in the park doc's prose.

## Open

*(none currently — see Resolved below)*

## Resolved

### D-03: OP-21 process-kill guardrail (proposed, dropped)
**Raised:** 2026-07-20 · **Resolved:** 2026-07-20

During the 2026-07-20 UAT-triage merge batch, an agent resolving a PR conflict ran a
blind `pkill`-style kill matching a generic process pattern and took down the real
`dev:api` server (not worktree-scoped — OS process space is shared across every
worktree in this container). It self-remediated (restarted the server, verified
healthy, no data loss), but COO proposed a fourth guardrail in the OP-19/OP-20 family
(agents must confirm exact PID/ownership before any kill command, not match on a
broad pattern) and separately asked whether the killed process had disrupted Ryan's
own work. Ryan's answer to both: drop it — "I don't touch the dev server while you
guys are working," so the specific exposure this incident showed doesn't apply to his
usage pattern. No CLAUDE.md change made; unlike OP-19/OP-20 (both confirmed as
standing rules), this one didn't clear the bar for adoption. Not re-raised unless a
recurrence actually affects a live PO session.

### D-01: Role system-prompt refresh + `.claude/agents/` custom definitions
**Raised:** 2026-07-19 · **Resolved:** 2026-07-20

Both parts of the proposed fix were carried out in full, all 8 roles (architect,
backend, database, frontend, qa, docs, ux, integrations):
1. Refreshed the git/completion-report sections of every `jobs/<role>/<role>-system-
   prompt.txt` — `git push origin main` direct-to-main replaced with the branch → 
   `/pre-push` → PR (`Closes #N` + BRD section) → CI-log-read (`gh run list` /
   `gh run view --log-failed`) → no-self-merge workflow from CLAUDE.md. Added a
   COMPLETION REPORT FORMAT section (header block: Tracker ID · issue/PR # · BRD
   section · branch) to the 5 roles that lacked one (architect, database, ux, docs,
   integrations) — modelled on the real format already in use in `jobs/COO/inbox/`.
   Backend's format also gained the mandatory security-checklist bullet (auth
   middleware, userId scoping, FK `.notNull()`, referencing OP-06 §2 / ADL-27).
2. Created `.claude/agents/{architect,backend,database,frontend,qa,docs,ux,
   integrations}.md` — each a thin wrapper: frontmatter pins `name` + `model`, body
   gives a one-sentence persona summary and directs the agent to read the full
   `jobs/<role>/<role>-system-prompt.txt` for the complete protocol. Deliberately
   thin rather than duplicating the full persona, so the system-prompt.txt stays the
   single source of truth and can't drift from the agent definition.

Dispatch is now `subagent_type: "<role>"` instead of `general-purpose` + COO
hand-typing an inline persona. Depended on D-02's model-tier decision, resolved
alongside it in the same PR.

### D-02: Model tiering policy
**Raised:** 2026-07-19 · **Resolved:** 2026-07-20

Ratified: implementation roles (backend, database, frontend, qa, docs, ux,
integrations) run on Sonnet 5, encoded in each role's `.claude/agents/<role>.md`
frontmatter. Architect runs on Opus 4.8 — Ryan's call after COO laid out the actual
Opus-vs-Fable tradeoff (cost, positioning, fit for bounded-consultation work vs.
long-horizon autonomous work); Fable 5 was considered and set aside as disproportionate
to Architect's actual job shape here (bounded design review/ADL output, not open-ended
autonomous runs). COO-lane background tasks dispatched via the Agent tool (mechanical/
verification work — CI-anomaly probes, drift-ledger checks, etc., not this interactive
session) stay on Haiku 4.5, per Ryan's explicit instruction to let COO make that call
itself. The live interactive COO session's own model (this conversation) is out of
scope for agent-definition frontmatter — Ryan sets it himself via `/model`.

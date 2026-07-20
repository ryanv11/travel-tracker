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

### D-01: Role system-prompt refresh + `.claude/agents/` custom definitions
**Raised:** 2026-07-19
**Status:** Plan proposed by COO, pending Ryan confirmation.

`jobs/<role>/<role>-system-prompt.txt` files exist and are well-built on persona
("what you care about," relationship to other roles) but stale on process — the git
requirement still says `git push origin main` directly, predating the branch/PR
workflow (adopted 2026-03-21), and there's no mention of `/pre-push`, CI-log-reading
discipline, or the backend security checklist. COO had been hand-typing an inline
persona per dispatch instead of using these files at all.

Proposed fix (two parts):
1. Refresh each file's operational sections (git requirement → branch+PR+CI-log-read,
   completion report format → matches what's actually landed in `jobs/COO/inbox/`,
   security checklist reference for Backend) while keeping the persona sections as-is.
2. Wire them in structurally as real `.claude/agents/<role>.md` custom subagent
   definitions (persona + model tier baked into frontmatter) so dispatch becomes
   `subagent_type: "backend"` instead of `general-purpose` + COO hand-typing the
   persona and hoping to remember the right model.

Not started — would touch 7 files plus new agent definitions, judged too large to
fold into the 2026-07-19 session close given context-length constraints.

### D-02: Model tiering policy
**Raised:** 2026-07-19
**Status:** Working default in use, not yet ratified; one sub-question still open.

COO's working default this session: implementation roles (Backend/Frontend/Database/
QA/Docs) at Sonnet; COO-lane mechanical/verification tasks (e.g. the main-CI-anomaly
throwaway-PR probe) at Haiku. Never stated as a rule anywhere, applied inconsistently
(used once, not by default) before this session's discussion.

Open sub-question: what tier for Architect-level work (cross-cutting design, ADLs)?
Higher-stakes reasoning might warrant Opus; Sonnet may be entirely sufficient. Asked
Ryan 2026-07-19, not yet answered. Depends on D-01's outcome for how it gets encoded
(agent-definition frontmatter vs. a standalone policy note).

## Resolved

*(none yet)*

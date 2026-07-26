---
name: record-decision
description: Record an architecture decision (ADL entry) or bump the BRD — numbering, supersession stamps, open-question closure, tracker sync. Load before editing the ADL log, a standalone ADL file, or the BRD.
---

Installed 2026-07-18 from the Session C draft (audits/session-c-workflow-extraction.md,
`chore/audit-questions` branch). Every guard below corresponds to a failure that actually
happened — sources noted inline.

## ADL entries

1. **Number:** last entry + 1 — but check BOTH the main log
   (`jobs/architect/tech/20260307-architecture-decisions-log.md`) AND the standalone
   `jobs/architect/tech/ADL-*.md` files; numbering has skipped the log before (ADL-28
   exists only as a standalone file).
2. **The main log always gets the entry** — date, trigger (what inbox item / issue /
   incident prompted it), decision, alternatives considered, implementation implications.
   A standalone `ADL-NN-<slug>.md` file is fine for a long design, but it supplements the
   log entry (summary + pointer), never replaces it. ADL-24's merge banner is the
   exemplar for retiring a standalone file into the log.
3. **Implementation status:** state whether the decision is implemented or pending in the
   entry itself, and update it when the implementing PR merges (same-PR rule). "Decided"
   with no status marker is how ADL-28 became indistinguishable from shipped work.
4. **Supersession:** if this decision replaces an earlier ADL or invalidates a spec
   section, the same PR stamps the superseded text:
   `> SUPERSEDED (YYYY-MM-DD) by ADL-NN — retained for history.`
   (ADL-17 → ADL-20 is the exemplar.) Check specifically: security-spec.md, the tech
   blueprint, the map-shading spec — the three documents the audits found silently
   outrun by decisions.
5. **Open-question closure:** if the decision answers an open question in the BRD (§10)
   or a spec, record the resolution there in the same PR. (OQ-01/OQ-02 sat open for
   months after being answered; closed 2026-07-18 in the v3.0 bump.)
6. File pointers in implications must name real paths — verify each one exists before
   writing it (ADL-27/29 shipped with wrong file paths that survived review).

## BRD version bumps

1. Edit the body sections AND add the §13 changelog entry AND bump the **header** version
   field — three places, and the header is the one that has been forgotten (stuck at 2.5
   through v2.7).
   **Three places, and only three.** CLAUDE.md's "Key files" list used to name the BRD
   version too, and silently went stale by nine versions (said v2.7 while the BRD was at
   v3.6 — found 2026-07-26). It was a fourth place nobody counted, so the version was
   removed from it rather than added to this checklist. Do not reintroduce a BRD version
   number anywhere outside the BRD itself; point at the file and let its header be the
   single source.
2. Changelog author/approval: every accepted entry lists the PO as approver. Do not treat
   COO-only sign-off as an accepted pattern (v2.7 is the outlier — its retroactive PO
   approval is still an open item, audit Q7). Identity-level rewrites get their own PO
   approval gate: the PR is the adoption mechanism and the PO merges or explicitly
   approves it (v3.0 exemplar).
3. Every new requirement ID must state measurable success criteria before any brief
   dispatches from it, and must get a tracker entry before session close (both CLAUDE.md
   gates — this is the procedural reminder, not the rule's home).

## Definition of done

- [ ] Main ADL log contains the entry (not only a standalone file); numbering contiguous
- [ ] Implementation status stated in the entry
- [ ] Superseded ADL entries / spec sections stamped in the same PR
- [ ] Answered open questions closed in their home document
- [ ] BRD: header version == latest changelog version; PO approval recorded
- [ ] Each new requirement ID: success criteria stated + tracker entry exists
- [ ] All file paths cited in the entry verified to exist

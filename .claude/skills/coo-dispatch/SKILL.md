---
name: coo-dispatch
description: COO dispatch gate — run before dispatching any implementation/spec brief. Consolidates the pre-dispatch rules into one checklist and defines the required brief-header the receiving agent enforces. Completes the COO lifecycle after /coo-startup and before /coo-merge-and-close.
---

# COO Dispatch Gate (OP-39, design-reflection R4)

Run this before dispatching any brief that **produces committed deliverables** — implementation,
spec/ADL, schema/migration, docs. **Read-only research/review/investigation dispatches are exempt**
(they commit nothing, so they need no header).

Completes the COO lifecycle: **/coo-startup → /coo-dispatch → /coo-merge-and-close**.

## Why this exists

No PostToolUse hook can see an Agent-tool dispatch prompt, so the brief — the single
highest-leverage artifact in the system — was mechanically ungoverned; the warn-only
`atdd-first-guard.sh` / `negative-findings-guard.sh` only ever saw the gh-issue *echo* of a brief,
not the brief itself. This gate moves the controls onto the artifact and makes enforcement
**agent-side**: the brief carries a gate header, and the receiving agent refuses to start without it
(`_shared/frameworks.txt` standard 31). A checklist the COO merely *remembers* to run has the exact
weakness that sank the earlier brief-template (it only works if you remember it) — the header **plus**
agent-side rejection is the teeth.

## The gate — confirm each before dispatch

**Readiness**
1. **Classified (OP-32)** — regression / deployment / gap, stated. An unclassified item is not dispatchable.
2. **BRD home (BRD gate)** — any new requirement IDs are in the BRD and the version is bumped.
3. **Success criteria (mandatory)** — a measurable definition of done is stated.
4. **Reuse audit** — checked for an existing home/component to extend rather than duplicate (PO standing pref).
5. **Premise-verification (OP-26)** — load-bearing "X doesn't exist / isn't enforced / is unreachable"
   claims have two independent probes that could fail differently, or are marked `UNVERIFIED`.

**Verification**
6. **ATDD-first (OP-35)** — if Architect-gated (schema / access-matrix / data-integrity invariant /
   shared-contract), mark `ATDD-first: yes` and dispatch **QA before** the implementer.
7. **Security checklist (OP-06)** — if routes are added/modified, the brief names: auth middleware
   (`requireAuth`/`requireOwner`), `userId` scoping on every user-data query, `.notNull()` on user FKs.
8. **Fresh-eyes (OP-27)** — if an Architect deliverable that will be cited elsewhere, plan the
   second-Architect review; resolve the author's own flagged open questions *first*.

**Mechanics**
9. **Isolation** — any git-touching role agent gets `isolation: "worktree"`; the brief's first step
   confirms `pwd`/toplevel matches the worktree, then `npm install` before anything needing node_modules.
10. **Tracker cross-ref** — the brief names the tracker ID; the tracker entry names the issue #.
11. **Model tiering** — right tier for the stakes; scaffolding scaled to the model, never the guardrails.

## Required brief header

Paste at the top of every deliverable-producing brief. Fill every field (`n/a` where a line doesn't apply):

```
=== COO DISPATCH GATE ===
Tracker: <ID>              BRD: <req IDs | n/a>
Class (OP-32): <regression | deployment | gap>
Success criteria: <measurable done>
ATDD-first (OP-35): <yes — QA dispatched first | no — why>
Security checklist (OP-06): <applies — named in brief | n/a>
Reuse audit: <what was checked / what is reused>
Isolation: <worktree | read-only>
Fresh-eyes (OP-27): <planned | n/a>
=========================
```

The receiving agent **must refuse to start** a deliverable-producing brief that lacks this header and
flag it to the COO outbox (frameworks.txt standard 31).

## Consolidation note (R3 follow-up)

This gate subsumes the brief-channel role of the two warn-only hooks (`atdd-first-guard.sh`,
`negative-findings-guard.sh`) — they guard only the gh-issue echo, which this replaces at the source.
Flagged as **R3 pruning candidates**; not removed in this pass (removal is a separate deliberate act).

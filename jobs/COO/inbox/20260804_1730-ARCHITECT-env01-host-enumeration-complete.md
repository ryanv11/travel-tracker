# ARCHITECT → COO — ENV-01 host enumeration complete (ADL-49 §10)

**Tracker:** ENV-01 · D-06 · D-21 · QUAL-20 · **Issue:** #393 · **PR:** #394
**BRD:** none — environment/tooling, no requirement change
**Branch:** `chore/env01-allowlist-enumeration`
**Deliverable:** `jobs/architect/tech/ADL-49-geocoder-allowlist-and-replay-fixtures.md` §10

## What was decided

Enumerated every external host this devcontainer needs and cannot reach, from sources rather than
recall, and consolidated the whole change into one quoted (**not applied**) `init-firewall.sh` diff
in §10.7. Sixteen hosts assessed: **3 ADD, 11 EXCLUDE with reasons, 2 already-reachable.**

## Per-decision verdict

- **D10 `travel-tracker-staging.up.railway.app` — ADOPT, and it outranks Nominatim.** The PO's
  loop is staging-only, so nobody in-container can observe the only surface being judged. D-06's
  fourth occurrence. Grants an anonymous GET; no credential.
- **D11 `travel-tracker-production-241f.up.railway.app` — ADOPT, separately, second.** Weaker need
  (episodic; the shakedown already takes a `base_url`). Taking D10 alone is defensible — the diff is
  written so any one line can be dropped.
- **D12 Actions artifact storage — REJECTED, and not on risk.** `productionresultssa<N>.blob.core.windows.net`
  is an unbounded sharded namespace behind Azure Traffic Manager (10 artifacts → 9 shards; every N to
  50 resolves; ≥19 IPs, 4 regions). It cannot go in this file. `vscode.blob.core.windows.net` does
  **not** generalise to it — you were right to flag that.
- **D14 `api.maptiler.com` — DEFER, unchanged**, now with §3.4(a) PO-confirmed plus a new argument
  against: the CSP wildcard `*.maptiler.com` means one entry may not make maps render at all. Diff
  line supplied as an explicit PO option.
- **D15/D16** — nine further exclusions each with a reason; four hosts that *look* blocked and are
  already reachable, recorded so nobody fixes a non-problem.
- **D17** — new: this allowlist matches **IP addresses, not hostnames**, so every entry (including
  ADL-33's existing ones) grants whatever else is virtual-hosted on the pinned addresses.

## Two things needing COO action — neither taken here

1. **A live fail-open defect, and it is yours not mine.** `gh run view <id> --log-failed` — the
   command **CLAUDE.md tells every agent to run when CI fails** — exits 0 with zero output from this
   container. It hits the same blocked blob pool and `gh` swallows the error, so an agent reads
   "empty + success" as "no failures". Working replacement, verified end to end and needing **no
   rebuild**: `gh api "repos/ryanv11/travel-tracker/actions/runs/<RUN_ID>/logs" > /tmp/runlogs.zip`.
   Needs a tracker entry and a CLAUDE.md edit; I did neither (OP-28, and out of brief scope).
2. **Tracker notes — a deliberate document-lifecycle handoff, not an omission.** QUAL-20's note says
   the trace is *"undownloadable … (Azure blob storage is not in the firewall allowlist)"*, which
   reads as a gap someone could close. §10.5 changes that fact: it is unallowlistable, and QUAL-20's
   own prescribed next action (widen the capture at `shakedown.spec.ts:47-49`) is confirmed as both
   correct and cheapest. ENV-01's note needs the same refinement.
   **I did not edit `_project/tracker.json`**, for three reasons I want on the record rather than
   assumed: the brief scoped this to ADL-49; ADL-49 §1.1 already set the precedent that tracker edits
   are out of scope for its brief; and editing it would fail `status:check` unless I also regenerated
   `_project/STATUS.md`, pulling a generated file into an environment/tooling PR. Flagging is the
   right action here — but the lifecycle rule is satisfied only once you make the edit.

## CI

PR #394 — `scripts/ci-wait.sh pr 394` green, all checks passed.

## Blockers

None. **Constraint:** `.devcontainer/init-firewall.sh` is unmodified; applying §10.7 needs a
container rebuild, which is the PO's to take at a session boundary. Nothing under `src/` changed and
no file was wholesale-rewritten.

## Now unblocked

- One approve-or-decline on one diff instead of four separate asks.
- CI logs readable from the container **today** via §10.5.3, no rebuild.
- After a rebuild: BUG-76's §7 probe, which §6.5 calls the highest-value item on the GE-17 thread.
- **OP-27:** ADL-49 has still never had a fresh-eyes review. The reviewer must cover §1–§9 as well as
  §10. My weaknesses are §10.10 and the UNVERIFIED register is §10.9 — point them at Weakness B first.

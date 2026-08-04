# ARCHITECT → COO — ENV-01 host enumeration complete (ADL-49 §10 + §10.11)

> **AMENDMENT 2 FILED 2026-08-04 (same branch, same PR #394)** after the OP-27 review (PR #395) and
> the PO threat model. **All three ADD recommendations survive; the framework that priced them did
> not.** New: ADL-49 **§10.11**; ADL-33 **§4** amended. Read the amendment-2 block at the bottom
> *before* the original report below — where they conflict, amendment 2 wins.

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
  50 resolves; ≥19 IPs, 4 regions). ~~It cannot go in this file.~~ `vscode.blob.core.windows.net` does
  **not** generalise to it — you were right to flag that.
  > **SUPERSEDED by amendment 2 — "it cannot go in this file" is false.** It can, via the meta-CIDR
  > path at line 126. Verdict unchanged (refuse) but the reason is now a measured cost: **2,709×**.
  > The shard sampling still correctly kills the *hostname* route.
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
   reads as a gap someone could close. §10.5 changes that fact: ~~it is unallowlistable~~ **[amendment
   2: it is allowlistable via the meta-CIDR path and refused at 2,709× — reword the tracker note as a
   priced refusal, not an impossibility]**, and QUAL-20's own prescribed next action (widen the
   capture at `shakedown.spec.ts:47-49`) is confirmed as both correct and cheapest. ENV-01's note
   needs the same refinement.
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

---

# AMENDMENT 2 — post-OP-27 correction pass (2026-08-04)

**Deliverable:** ADL-49 **§10.11** (new) + corrections propagated back through §0, §10.3, §10.4,
§10.5, §10.8, §10.9, §10.10 · **ADL-33 §4** amended (STANDING CONDITION rehomed).
`.devcontainer/init-firewall.sh` **still untouched**; nothing under `src/`.

## Verdict

Your four items are done, plus the STANDING CONDITION move. **All three ADDs stand.** The corrections
are real and four of them are mine to own — most seriously, **§10.3 row 5 asserted an absence with no
probe and it was false** (`20.209.227.33` *is* in GitHub meta `.actions`). In a section that lectures
about two probes for negative claims. Corrected and stated plainly rather than softened.

## Per item

1. **§10.8's closing sentence — withdrawn**, quoted in place so the record shows what was wrong, and
   replaced with *"an availability and accident control, not a containment boundary."* D17 is then
   propagated backwards: §10.3 now splits `Blocked` into **by name** vs **effectively**, with a new
   **probe class `E`**. Three rows flip. Probes A and B were never independent — both assume
   hostnames are the unit of reachability — and I have said so.
2. **Tile-server comment (F2) — fixed, and it changes what the diff says.** Verified independently:
   `nominatim`, `tile.`, `a/b/c.tile.openstreetmap.org` all resolve to `151.101.21.91`. The diff now
   **discloses the side effect** in the Nominatim paragraph and states the prohibition as a **repo
   rule, not a control this file enforces**. Re-verified: `git apply --check` exit 0, patched copy
   passes `bash -n`.
3. **D12 — "cannot" dropped, refused on the number.** But I re-derived the number and **the review's
   arithmetic is wrong in the direction that understates its own case**: `30,800` double-counts
   (`.api`/`.git` largely repeat `.web`; the ipset dedupes). Like-for-like it is **10,300 → 27,901,673
   distinct addresses = 2,709×, not ~900×.**
4. **Re-priced against the threat model** — §10.11.4, including confidence ratings, plus four new
   decisions (D18–D21).

## Where I disagree with the review — argued, not asserted

**It says F1 "demolishes the exclusion-discipline frame." It does not, and the threat model sharpens
why.** Exclusion discipline here is *least-privilege-by-justification* — governance — and that
survives F1 completely. What F1 kills is the narrower claim that an `EXCLUDE` row is a **kernel
guarantee**. Conflating the two throws away the half that works. Repair is per-row honesty:
**effective / nominal / rule-only** (D19).

**And the review's framing hid the best news in the table.** Grouping all exclusions together
obscured that **`api.turso.tech` — the DB admin plane, the one host where a write is catastrophic —
is CloudFront-fronted with no allowlisted neighbour, and its exclusion is *effective*.** I
re-verified it: pinned to the Cloudflare edge that reaches MapTiler, it fails at TLS handshake. Under
your threat model that is the row that matters most, and it holds.

**On your severity downgrade — I agree, with one refinement I want on the record.** F1 is low
severity *because* no credential exists for the Cloudflare-fronted write APIs, which is a
**condition, not a property**. Its real effect is to leave the credential as the *sole* control, with
no network backstop. So it **promotes** ADL-33 §4 rather than excusing it — which is why the STANDING
CONDITION move matters more now, not less. Please don't let "low" propagate as "fine".

## CI

PR #394 — `scripts/ci-wait.sh pr 394` green.

## For you — unchanged from the original report, plus three new (§10.11.6)

- **Allowlist *removal* review** as a tracked item. The review is right that my §10.9 entry 7 was
  wearing an UNVERIFIED label to avoid the work: `registry.npmjs.org` is the *source* of the bypass,
  and `sentry.io`/`statsig.com` are telemetry egress by function. I am not recommending removals —
  I have not probed whether they are used and do not claim it.
- **SNI-proxy decision as an open dialogue.** Re-taken knowingly: still *no*, but now for a better
  reason (it would re-add a network layer under a credential control that is working). Flips if
  exfiltration is ever brought in scope.
- **A periodic re-probe of `api.turso.tech`'s CDN.** If Turso ever moves it behind Cloudflare, that
  exclusion silently becomes nominal with **no signal on our side**. One `dig` answers it.
- **`--log-failed` is in 11 files**, incl. `/coo-startup`'s red-`main` gate — a *gate* that fails
  open, which is worse than D13. **Per your instruction I touched none of them.**

## Blockers

None. Diff still quoted, not applied.

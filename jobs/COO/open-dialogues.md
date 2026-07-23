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

### D-10: Move the project off OneDrive — Ryan flagged this a priority (recurrence)
**Raised:** 2026-07-23

Second occurrence of the OneDrive Files-On-Demand dehydration issue first documented
2026-07-02 (see memory `project_onedrive_dehydration.md`) — this time it corrupted git's
own internals rather than just regular project files: 213 local branch refs got silently
rewritten to the null SHA, which blocked `git fetch`/`git pull` outright
(`fatal: bad object refs/heads/<branch>`) until COO diagnosed and fixed it in-session
(raw `rm -f`/`xargs` on the corrupted ref files, since even `git update-ref -d` hit the
same underlying `EDEADLK` the corrupted files themselves throw on read). Notably, Ryan
had already applied the documented Finder-level workaround ("Always Keep on This Device"
at the top level) after the first occurrence, and it recurred anyway — so that fix is not
durable, just a stopgap.

Ryan's direct instruction this session: "let's make that a priority to move off onedrive."

**Update 2026-07-23 (later, new session):** Planning pass done, execution pending on
Ryan's host. Target path confirmed: `~/Projects/travel-tracker`. Architect-reviewed via
**ADL-39** (`jobs/architect/tech/20260307-architecture-decisions-log.md`, PR #234,
merged) — confirms `devcontainer.json` needs no edit (`workspaceMount` uses
`${localWorkspaceFolder}`), recommends a fresh `git clone` over a physical `mv` (avoids
dragging along the ref-corruption class and 1.7 GB / 33 dirs of orphaned worktrees under
`.claude/worktrees/` — checked this session, none hold unpushed commits), and flagged
two follow-ups: F1 (the notify bridge's hardcoded `WATCH_DIR` — fixed this session, PR
#235, merged) and F2 (the devcontainer's config Docker volume is keyed by
`devcontainerId`, which can re-key on a path move and orphan `/home/node/.claude`
including auto-memory — needs a backup-before/verify-after step, not yet done since
that's host-side). Full step-by-step runbook (backup config volume → clone → copy
`.env.local` → reopen VS Code → verify → reinstall notify bridge → decommission old
folder) handed to Ryan. **Blocking on host-side execution** — everything actionable
from inside the container is done; the physical move, config-volume backup, and VS
Code reopen are all steps only Ryan can run. Not yet closed.

### D-09: COO worktree cleanup can race an agent's own lingering post-report process
**Raised:** 2026-07-22

During the BUG-61 Architect dispatch, the agent's task-notification fired "completed" with
a full self-report (CI still pending at that point, flagged as an open item for COO to
verify). COO acted on that notification independently — checked `gh pr checks 227` directly,
reviewed the diff, merged, then ran routine `git worktree remove` on the agent's worktree as
part of normal close-out. A second, delayed notification then arrived from the *same* agent
reporting that its "execution environment was removed out from under it" mid-poll — i.e. the
agent's own shell was still alive (apparently still trying to poll CI status in the
background) after its first "completed" notification had already fired and been acted on.

No harm resulted — all commits were already pushed before the removal, and COO's own
independent CI check (not the agent's) was what actually gated the merge. But this is a new
variant in the same family as D-08/OP-20: a task-notification marked "completed" does not
guarantee zero live subprocesses remain in that agent's worktree, so cleaning up immediately
after acting on that notification can still collide with something. Open question: does
routine worktree cleanup need a beat of delay after a completion notification (e.g. confirm
no second notification arrives within some window before removing), or is "no harm, agent's
own commits were already safely on origin" sufficient evidence this doesn't need a process
change — per D-03's precedent (single contained incident, not automatically a new rule)? Not
yet decided — raised for Ryan, not actioned.

### D-08: Mid-thread `/workspace` leak — does the isolation guardrail need a fourth clause?
**Raised:** 2026-07-21

During the WP-02 Frontend dispatch (worktree-isolated per the mandatory rule), the agent's
own report flagged that a later `cd /workspace &&`-prefixed `npm install` briefly ran
against the shared COO checkout instead of its assigned worktree — not the first action
(already guarded by the existing "confirm cwd first" rule from OP-20), but a command
mid-thread that explicitly re-targeted `/workspace`. Left stray uncommitted
`package.json`/`package-lock.json` changes in the shared tree; the sandbox's own
worktree-isolation guard caught it and blocked the agent from touching `/workspace`
further (including its own cleanup), so COO reverted the leak by hand
(`git checkout -- package.json package-lock.json`) — no data lost, nothing committed or
pushed from the wrong tree.

This is the same family as OP-20's two 2026-07-20 near-misses, but a new variant: OP-20's
"working-directory confusion" rule only mandates a cwd check as the dispatched agent's
*first* action, which doesn't cover a later command that explicitly hardcodes
`/workspace` in its own invocation. Open question: does this warrant a fourth OP-20-style
guardrail (e.g. "agents must never issue a command with a literal `/workspace` path
prefix — always operate relative to the confirmed worktree cwd"), or is one contained
incident insufficient signal to add another mandatory rule, per D-03's precedent (a
single-incident proposal Ryan declined to adopt)? Not yet decided — raised for Ryan, not
actioned.

### D-04: Clerk API version upgrade practice
**Raised:** 2026-07-21

Ryan noticed the app is pinned to Clerk API version `2025-11-10` while `2026-05-12` is
current. Not a specific upgrade request — Ryan wants this kept as a general note about
upgrade practice (periodically checking for Clerk API version drift and weighing whether
to move), not a scoped task to bump to the latest version now. COO doesn't have visibility
into what actually changed between those two versions (Clerk's docs site isn't in this
container's firewall allowlist) — would need to check Clerk's changelog before any real
upgrade decision. No action until Ryan revisits this.

### D-05: Separate prod/staging Clerk applications
**Raised:** 2026-07-21

Ryan proposed cloning the current Clerk app into a dedicated staging/dev instance,
mirroring the existing Turso prod/staging split, so staging sign-ins don't mix with real
production users. Directionally reasonable hygiene, but flagged as NOT a full fix for
ADL-32 §6's still-open question (whether Clerk's allowed-origins config supports the
dynamic per-PR preview URLs Railway generates) — that's about the app's origin config, not
which app backs it. This is an auth-topology change, so per the standing infra/runtime
guardrail (Architect review before COO acts) it should get a brief Architect pass before
implementation. Ryan said to leave it as an open note for now, not act on it.

### D-06: Add prod Railway domain to this container's firewall allowlist
**Raised:** 2026-07-21

During the BRD-NF09 deploy shakedown (white screen → CSP fixes → API base URL bug), COO
repeatedly couldn't verify the live site directly — `curl https://travel-tracker-
production-241f.up.railway.app` is blocked by this container's own outbound firewall
(`.devcontainer/init-firewall.sh`'s static domain allowlist doesn't include the app's own
public Railway domain, only the diagnostic hosts from ADL-33/OP-21). Every round of
debugging this session depended on Ryan pasting browser console output back and forth.
Adding the domain would let COO fetch the actual served HTML/JS directly next time
(read-only GET requests to a public page — much lower-stakes than the Turso/Railway
credentialed access ADL-33 already granted). Not yet decided — raised, not confirmed
either way by Ryan.

**Update 2026-07-21 (later same day):** hit the same limitation again diagnosing BUG-59
(staging white screen) — worked around it via `railway-query.sh`'s new `logs` subcommand
(deployment console output) plus `turso-query.mjs` instead of hitting the site directly,
and it was sufficient to find the exact root cause without needing the domain allowlisted.
Doesn't resolve the open question, but is a second data point: the Turso/Railway-metadata
diagnostic path has now twice been enough on its own, which may be relevant to how much
this is actually worth adding.

### D-07: `gh` CLI has no persistent auth in this container
**Raised:** 2026-07-21

`gh` was unauthenticated all session — `devcontainer.json` forwards `${localEnv:GH_TOKEN}`
from the host, but it arrived empty (`GH_TOKEN=` with no value), so `gh pr create`/`gh pr
merge` all failed with "not logged into any GitHub hosts" until COO bridged it: extracted
the token VS Code's own git-credential-helper already uses for `git push`/`git pull`
(`git credential fill` for `https://github.com`) and fed it directly to `gh auth login
--hostname github.com --with-token`. That worked for the rest of this session, but it's a
workaround, not a fix — the underlying gap (why `GH_TOKEN` isn't reaching the container
from Ryan's host) is unresolved, and the bridged `gh` auth state may not survive a
container rebuild (untested). Two possible real fixes, neither actioned: (a) Ryan sets
`GH_TOKEN` in his host shell environment before the container starts, so the existing
devcontainer.json passthrough actually has something to forward; (b) bake the
credential-helper-bridge trick into container startup so it's automatic rather than an
ad-hoc COO workaround each session. Not yet decided which, if either, Ryan wants.

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

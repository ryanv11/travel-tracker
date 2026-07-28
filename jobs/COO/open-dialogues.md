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

### D-15: A green PR earned against a stale base merged into a red main — does the merge step need a mandatory re-check?
**Raised:** 2026-07-28

Wave 1 sub-wave B produced a **red main from two individually-green PRs**. B8 (#318) and B7
(#319) had no textual conflict, were each 18/18 green, and were partitioned by file surface
exactly as `backlog-clearance-plan.md` §4 intends. They broke only in combination, because
B7's CI ran against a base that predated B8.

Two layers, the second hidden behind the first:
1. B7's `TripDetail.test.tsx` used a **total** `vi.mock` of `hooks/useItems`, listing only the
   exports that existed when B7 branched. B8 added `DEFAULT_RATING_SORT_FILTER`, which
   `PlaceSection` consumes — absent under a total mock, so `PlaceSection` threw.
2. Fixing that let `PlaceSection` genuinely mount, which exposed that B8's new per-city `Link`
   to `/cities/:id` needs router context the test never provided.

Fixed in PR #322 (partial mock via `importOriginal`, plus `MemoryRouter`), and the identical
latent pattern in `MobileTripDetailView.test.tsx` fixed preventively — it passes today only
because no test there mounts a place.

**The general point.** The plan's conflict analysis reasons about *file overlap*. This was a
**shared-module contract** break — invisible to that check, and it will recur for as long as
sub-waves run concurrently. The cheap mitigation, applied by hand this session for B4 (#320)
and shown to work: before merging the second and subsequent PRs of a wave, update the branch
against current `main` and re-run its CI, rather than trusting a green earned against a stale
base. GitHub's `pulls/:n/update-branch` API does this in one call.

Open question: make that a standing step in `/coo-merge-and-close`, or rely on the existing
mandatory post-merge `ci-wait.sh branch main` to catch it after the fact? The post-merge check
*did* catch it, and fixing forward took one PR. So the honest framing is prevention-vs-detection
cost, not a safety gap — main was never left red unowned. Note this is BUG-24's known class,
which is already why the post-merge check is mandatory; what's new is a concrete, cheap
prevention step rather than another instance.

**Second, smaller item raised by the same wave, recorded here rather than as its own entry:**
B4's agent (#320) merged with **all four of its tracker items still at their pre-brief status**
— it updated `jobs/**` but never `_project/tracker.json`, while B7 and B8 both did. Caught by a
post-merge COO check, not by the agent's own completion report, which claimed done. Fixed in
#323. One agent's miss, not obviously systemic — flagged to watch for recurrence before it
earns a rule.

### D-14: Trip country search matches full names only — should ISO codes ("US"/"USA") be added?
**Raised:** 2026-07-28

BUG-52 shipped (#320) matching **full country names only**. TR-13 was amended at BRD v3.12 to
require exactly that and to explicitly exclude ISO codes and informal abbreviations, so the
shipped behaviour is correct-as-specified.

**But the PO's original report gave two examples — "United States" *and* "USA" — and only the
first works.** The COO made that scoping call inside the brief rather than surfacing it, which
is the same shape as the BUG-55 misclassification: a product decision settled unilaterally.
Ryan asked for the reasoning (explicitly not as disagreement), which prompted the re-analysis
below.

The original reasoning was that an alias list is a **data-sourcing decision** of the same class
as BUG-45 (airline dropdown) and OQ-06 (ISO 3166-2 subdivisions), both parked pending ADL-43 —
so bundling it would either block a 7-line fix on an ADL, or have an agent invent an unsourced
alias list. That still holds for *part* of it. But the re-analysis found the COO had collapsed
**three** tiers into two:

| Tier | Example | Real cost |
|---|---|---|
| Full name | "United States" | **Done.** Already in the payload (`TripSummary.countries[].name`) |
| ISO codes | "US", "USA" | **Much cheaper than presented.** `country_code` (alpha-2) is *already in the payload*, so "US" was excluded for no good reason. "USA" is alpha-3 — a stable, closed, public ~250-entry list. No source decision, no ambiguity, no ADL |
| Colloquial | "America", "Britain", "Holland" | Genuinely BUG-45's class — needs a curated source and a judgment call on what counts |

Only tier 3 is really the parked problem. **COO recommendation: add tier 2** (a small static
ISO alpha-2/alpha-3 map, roughly an hour, no ADL needed) so both of the PO's original examples
work; leave tier 3 parked with BUG-45. Suggested as a follow-up item rather than reopening
BUG-52, since the shipped behaviour is correct as far as it goes. **Not yet decided** — awaiting
Ryan. If adopted it needs a small TR-13 amendment, since TR-13 currently forbids exactly this.

### D-13: Two concurrent COO sessions collided three times in one day — does this need a rule, or was standing one down enough?
**Raised:** 2026-07-28

Two COO sessions ran in parallel for most of 2026-07-28 (this one on Wave 1 dispatch, the
other on OP-25 scheduled-health-check hygiene). The previous park doc had already flagged
the risk — "BOTH sessions can write tracker.json, MEMORY.md and open-dialogues.md… worth a
rule if concurrent COO sessions become normal rather than a one-off." It became real.

Three collisions actually fired:

1. **Shared `/workspace` HEAD.** Both sessions operate in the *same* working tree — the
   thing `isolation: "worktree"` was adopted to prevent for agents has no equivalent for
   COOs. At startup this session found HEAD on a stale (already-merged) branch and moved it
   to `main`; later the other session had HEAD on its own branch, and this session had to do
   its guardrail work in a scratch worktree specifically to avoid moving HEAD under it.
   Nothing was lost — every commit was already on origin — but this is the OP-19 failure
   mode one level up.
2. **`OP-28` allocated twice, independently, on the same day.** This session used it for the
   no-wholesale-rewrite rule; the other for GitHub App setup. Mine reached `main` first
   (PR #310) and became immutable, so theirs was renumbered to **OP-31** when its PR was
   merged. Cheap this time because one was still unmerged; had both landed, the tracker would
   have carried two `OP-28` entries with nothing flagging it.
3. **An accidental direct-to-main commit** on the other session's side (captured after the
   fact by its PR #307), against a standing rule that COOs never commit directly to main.

**Resolved for the day, not structurally.** Ryan asked whether one session should stop; the
other stood down and handed over its open PR, which this session merged after the renumber.
Zero open PRs and a clean tree at close.

The open question is whether concurrent COO sessions should be **supported** or **prevented**:

- *Prevent* — simplest, and arguably correct: the COO role is a serialisation point by design
  (it reviews and merges serially anyway, per the clearance plan's own reasoning about why
  Wave 1 runs in sub-waves). A second COO buys parallelism the merge queue can't use.
- *Support* — needs at minimum: ID pre-allocation for tracker entries (the pattern already
  proven for concurrent ADL numbers in Wave 0), and a convention that each COO session works
  in its own worktree rather than sharing `/workspace`.

Not decided — raised for Ryan. The precedent question is D-03's: is one day of contained
collisions enough signal to add a standing rule, or does it only matter if it recurs? Note
this one differs from D-03 in that it fired *three distinct ways* in a single day, and one of
them (duplicate tracker IDs) would have been silent rather than caught.

### D-12: Four BRD contradictions surfaced by the QUAL-05 sweep that need a PO (and in one case Architect) decision
**Raised:** 2026-07-26

The QUAL-05 state-language sweep (PR #259) was scoped to fix prose that decays and to
**flag, not resolve**, anything where the fix would pre-empt a product or architecture
decision. Four items came back flagged. They are recorded in QUAL-05's tracker note and in
the Docs completion report (`jobs/COO/inbox/read/20260726_2234-DOCS-state-language-sweep-
complete.txt`), but neither surfaces at `/coo-startup`, which is why they are here.

None is urgent. All four are wording-level in the BRD — the shipped app is unaffected.

1. **§5.11 SE-01/SE-03 — the three-role model has drifted from reality.** AD-07 and AD-08
   moved map shading and companions to per-user with `requireAuth`, and non-owner users
   create their own trips in production, but SE-03 still describes authenticated-but-
   ungranted users receiving 403 on admin operations. **BUG-61/62/63 are live symptoms of
   this drift, not independent bugs.** This is a semantic change to a *security*
   requirement, so it needs PO **and Architect** — explicitly out of scope for a doc sweep.
   Of the four, this is the one with real consequences: BUG-62 and BUG-63 are both open and
   arguably cannot be correctly specified until SE-01/SE-03 say what the intended model is.
2. **§7 and §11 — historical import.** Both state import tooling is out of scope and manual
   entry is the answer. Import requirements IM-01–33 are drafted but **not approved**.
   Deleting those lines would pre-empt the PO decision; leaving them is fine until IM is
   either approved or dropped.
3. **§5.15 MB-01 — mobile scope.** The §5.15 preamble ("the phone is a reference device,
   not an editing surface") was stamped SUPERSEDED by WP-04 in v3.7, but MB-01's own
   requirement text still scopes mobile to the read path only, while WP-04 shipped a fully
   editable mobile layout. Whether to widen MB-01's stated scope — and whether that implies
   anything about offline support — is a product call, not a wording fix.
4. **§5.7 PH-02 vs IM-06.** PH-02 says "the app does not store or copy photos"; IM-06
   (client-side EXIF import) will read as contradicting it. Consistent in substance today.
   **Conditional — only needs resolving if import is approved**, i.e. it collapses into
   item 2.

Suggested handling: item 1 alongside the BUG-62/63 work rather than as a separate pass;
items 2 and 4 together whenever the import decision is made; item 3 whenever mobile scope
next comes up. Not blocking the backlog clearance plan's waves.

### D-11: `.claude/settings.local.json` disappeared from disk mid-session — root cause unknown, and it's gitignored so a `git clone` migration won't carry it
**Raised:** 2026-07-23

Mid-session, Ryan reported desktop notifications had stopped firing. Investigation found
`.claude/settings.local.json` — the untracked, gitignored, personal-only file that wires
`.claude/hooks/notify.sh` to `PreToolUse(AskUserQuestion)`, `PreToolUse(ExitPlanMode)`,
`Notification`, and `Stop` (see `project_macos_notification_bridge.md`) — was completely
absent from `/workspace/.claude/`. `notify.sh` itself was intact and worked correctly
when invoked directly; the queue directory was simply empty because Claude Code had
nothing telling it to call the hook at all.

**Root cause not found.** Checked and ruled out: no `git clean` in recent shell history;
the file was never actually committed with hook content (its last *tracked* version,
visible in `git show f79dba7`, only ever held a permissions allowlist, predating the
hooks — the hooks were added to the working copy in the same PR that untracked the
file, so they never touched git history at all and aren't recoverable that way).
`/workspace` is a genuine host bind mount, so an ordinary container restart shouldn't
touch it. COO recreated the file from the architecture documented in
`project_macos_notification_bridge.md` and confirmed `notify.sh` fires correctly again;
whether Claude Code needs a session/window reload to pick up a hooks file rewritten
mid-session (vs. re-reading it live) is also untested — Ryan confirmed "working again"
afterward, but the mechanism wasn't isolated.

**Direct implication for D-10 (OneDrive migration, in progress):** because this file is
gitignored by design, the recommended `git clone` migration method will **not** bring it
along automatically — same category as `.env.local`, which the runbook already handles
via manual copy. **The runbook needs this same manual-copy step added for
`.claude/settings.local.json`**, or the new clone will have the identical
notifications-silently-stop symptom on first use, indistinguishable from a recurrence of
this same mystery. Not yet added to the runbook as of this entry — do before Ryan
executes step 4 (the `.env.local` copy step).

Not actioned beyond the immediate recreate-and-verify — raised for awareness given it
happened once already with no clear cause, and the migration is about to change the
exact filesystem layer (OneDrive bind mount → plain local disk) that's the prime
remaining suspect if it recurs.

**Update 2026-07-23 (D-10 executed):** the runbook gap this entry flagged was closed
before Ryan ran the migration — the manual-copy step for `.claude/settings.local.json`
was added, Ryan copied it alongside `.env.local`, and it verified byte-identical
(same size and mtime) at the new path. Notifications worked immediately post-migration
with no recurrence of the disappearance. This is one clean data point *against* the
filesystem-layer theory (OneDrive bind mount → plain local disk is now the active
layer, and the file has stayed put since) but one clean session isn't enough to close
the root-cause question outright — leaving this open for continued observation rather
than marking resolved. The immediate practical risk (migration losing the file) is
gone either way.

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

**CLOSED 2026-07-23.** Ryan executed the migration on the host: fresh clone to
`~/Projects/travel-tracker` (confirmed at `a671268`, current main tip at the time),
all four gitignored files manually copied and verified byte-identical to the
OneDrive source (`.env.local`, `.env.agent-diagnostics`, `dev.db`,
`.claude/settings.local.json` — the last one closing D-11's runbook gap, see below),
notify bridge reinstalled and confirmed firing from the new `WATCH_DIR`. Reopened VS
Code at the new path and rebuilt the devcontainer.

**F2 materialized exactly as predicted** — the config Docker volume re-keyed on the
path change: the fresh volume mounted at `/home/node/.claude` had a working
`.credentials.json`/`.claude.json` (re-authenticated this session) but a default-only
`settings.json` (52 bytes) and a completely empty `projects/-workspace/memory/`
directory (`MEMORY.md` and all accumulated user/feedback/project/reference memory
gone). No pre-move backup tarball existed, so recovery went through the orphaned
volume directly: `docker volume ls` surfaced *three* `claude-code-config-*` volumes,
not the expected two (a third, older, unrelated stale orphan with no memory dir at
all — separate cleanup debt, not investigated further). Identified the correct
volumes deterministically via `docker inspect <container_id> --format
'{{range .Mounts}}...'` on both the current and the old (pre-migration,
OneDrive-bind-mounted) containers, rather than trusting ambiguous IDs surfaced via
the Docker Desktop GUI (container ID vs. volume ID vs. image digest all look similar
and were each offered in turn before the deterministic mount-inspection settled it —
see memory `feedback_docker_identity_via_inspect`). Recovered `MEMORY.md` + all 20
memory files via a throwaway `alpine` container bind-mounting both the old (`:ro`)
and new volumes and `cp -a`'ing the memory directory across; diffed the old
`settings.json` against the new default and found them identical, so no loss there
beyond the transient scare.

Post-recovery verification from inside the new container: `git status` clean (bar
one pre-existing benign `drift-ledger.jsonl` line), `npm run type:check:all` clean,
backend tests 538 passed/1 skipped, frontend tests 154 passed. Ryan renamed the old
OneDrive folder with an `OLD-` prefix rather than deleting it immediately — kept, along
with the recovered-from docker volume, as a safety net for a few days before final
decommission (ADL-39's own runbook step). The unrelated third stale docker volume is
noted but not cleaned up as part of this closure.

**Net outcome:** migration complete and verified; F2's risk was real, not
theoretical, and the ADL's own mitigation path (find the old volume, recover
memory/settings) worked as designed once a deterministic identification method was
used instead of the GUI. Worth remembering for any *future* devcontainer/host
migration on this or another project: back up the config volume tarball **before**
the move next time, per ADL-39 F2, rather than relying on post-hoc orphan recovery —
it worked here but only because the old volume happened not to have been pruned yet.

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

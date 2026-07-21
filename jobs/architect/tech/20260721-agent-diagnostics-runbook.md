# Agent Diagnostic Access — Runbook (ADL-33 / ADL-34 / OP-21)

**Tracker:** OP-21 | **Architect ref:** ADL-33 (access design), ADL-34 (firewall fail-open fix)

## What this is

Read-only(-ish, see caveats) diagnostic access for the COO/Claude Code agent to the ADL-32
hosted stack (Railway, Turso), so debugging a live deploy issue doesn't require Ryan pasting
logs back and forth by hand. Per ADL-33, Clerk access was declined entirely — there is no
read-only Clerk credential, so config lookups there stay manual (Clerk dashboard).

## Prerequisites

1. `.devcontainer/init-firewall.sh` must have run successfully with the Turso/Railway hosts in
   its allowlist (ADL-33 §2/§3) — this only takes effect on container start/rebuild, not
   hot-appliable mid-session (ADL-33 §7, ADL-34 §4).
2. `.env.agent-diagnostics` must exist at the repo root with the four Turso values and the
   Railway Project token populated (see `.gitignore` — this file is never committed). If it's
   missing, ask Ryan to re-provision per ADL-33 §10.

## Turso — read-only SELECT queries

```bash
node scripts/agent-diagnostics/turso-query.mjs prod "SELECT id, name FROM trip_categories LIMIT 5"
node scripts/agent-diagnostics/turso-query.mjs staging "SELECT COUNT(*) FROM trips"
```

- Only `SELECT`/`PRAGMA`/`EXPLAIN` statements are accepted (script-level footgun guard, not a
  real security boundary — the read-only token itself is what actually blocks writes at the
  database level).
- **Prefer `staging` for schema/logic debugging** — it has no real user data. Only query `prod`
  when the bug is specifically about production data; a production SELECT can return real user
  PII (trip data, `users.email`) — see ADL-33 §6.
- The script warns loudly whenever `prod` is targeted, as a reminder this returns real data.

## Railway — read-only diagnostics (Project tokens, technically write-capable)

**The official `@railway/cli` does not work in this sandbox** — it has no Linux `aarch64` build
(this container's architecture), and `npm i -g @railway/cli` fails at the postinstall binary
download step (404 on the GitHub release asset). Use the GraphQL fallback instead:
`scripts/agent-diagnostics/railway-query.sh`, which talks directly to
`https://backboard.railway.com/graphql/v2` using the `Project-Access-Token` header (not
`Authorization: Bearer` — that header is for account/workspace/OAuth tokens only, a distinction
that matters if you're ever tempted to copy a curl example from Railway's general API docs).

Two tokens exist — one per environment (Railway project tokens are scoped to a specific
environment within a project, narrower than just "the project"):

```bash
scripts/agent-diagnostics/railway-query.sh prod status                        # 5 most recent deployments
scripts/agent-diagnostics/railway-query.sh staging status
scripts/agent-diagnostics/railway-query.sh prod deployment <deployment-id>    # full detail on one deployment
```

The script resolves `projectId`/`environmentId` from the token itself at runtime (via the
`projectToken { projectId environmentId }` query) — nothing is hardcoded, so it keeps working if
the project is ever recreated. It only ever issues GraphQL *queries*, never mutations — that is
the actual read-only enforcement here, not the token itself (see below).

**Per ADL-33 §3: there is no true read-only Railway token.** Both tokens can technically trigger
a deploy or delete resources within their environment. Treat them as privileged, write-capable
secrets — never echo them into logs, commits, PRs, or completion reports — and only ever issue
read (query) operations, never mutations. This is a discipline enforced by this script's design
(query-only), not by the token itself.

### Verified 2026-07-21 — found the root cause of a live stuck deploy

First real use of this script surfaced the actual cause of a Railway deploy stuck "queued due to
upstream GitHub issues" earlier the same session: `deployment.meta.plan` returned `"trial"`, and
Railway's own status page / community reports confirmed Railway was actively deprioritizing
Trial/Hobby tier deploys in favor of Pro/Enterprise during a platform-wide demand spike, ongoing
as of that date. Not a code, config, or connection problem — Railway's queue prioritization.
Flagged to Ryan: (a) this should clear on its own as capacity frees up, (b) the project's actual
plan is `trial`, not the paid Hobby plan ADL-32's cost decision (~$5/mo) assumed — worth
confirming the upgrade actually went through, and (c) Pro tier is the only tier that bypasses the
deploy queue entirely per Railway's own guidance, if this recurs.

## Clerk — not available (declined per ADL-33 §4)

No token exists for this. For allowed-origins/redirect config lookups (e.g. the ADL-32 §6
preview-origin question), ask Ryan to check the Clerk dashboard directly and paste the relevant
value. Do not attempt to provision a Clerk API key to work around this — see ADL-33 §4 for why
that was a deliberate decline, not an oversight.

## Credential hygiene

- `.env.agent-diagnostics` is gitignored (`.gitignore`, ADL-33 §5) and `chmod 600`'d. Verify with
  `git check-ignore -v .env.agent-diagnostics` before ever writing real values into it.
- Never paste its contents into a commit message, PR description, ADL entry, or completion
  report. If a credential in this file is ever exposed (e.g. pasted into a chat, committed by
  accident), treat it as compromised and ask Ryan to rotate/revoke it — don't keep using it.
- This file is separate from `.env.local` (the app's own runtime secrets) by design — see
  ADL-33 §5 for the reasoning.

## If the firewall doesn't seem to be working

See ADL-34. If you can reach hosts that shouldn't be reachable (e.g. `https://example.com`
succeeds), or can't reach ones that should be (Turso/Railway hosts, `api.github.com`), check the
most recent container start's `postStartCommand` output for `FIREWALL WARNING` lines or an
`ERROR: Firewall verification failed` line — the script now always completes and prints a summary
rather than silently aborting partway through.

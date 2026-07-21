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

## Railway — read-only diagnostics (Project token, technically write-capable)

Not yet wired up as of this runbook's authoring — blocked on Ryan providing the Railway Project
token. Once `.env.agent-diagnostics`'s `RAILWAY_PROJECT_TOKEN` is populated:

```bash
npm i -g @railway/cli   # one-time, if not already installed
export RAILWAY_TOKEN=$(grep RAILWAY_PROJECT_TOKEN .env.agent-diagnostics | cut -d= -f2)
railway logs --build         # build logs for the most recent deploy
railway logs --deployment    # runtime logs
railway status                # current deploy status
railway variables             # variable NAMES only — do not run any variant that prints values
```

**Per ADL-33 §3: there is no true read-only Railway token.** The Project token can technically
trigger a deploy or delete resources within that project. Treat it as a privileged, write-capable
secret — never echo it into logs, commits, PRs, or completion reports — and only ever issue the
read commands above by convention. This is a discipline, not an enforced wall.

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

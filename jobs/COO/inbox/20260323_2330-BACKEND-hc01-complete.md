# HC-01 Complete — Clerk JWKS Firewall Allowlist

**From:** Backend Agent
**Date:** 2026-03-23T23:30
**Re:** HC-01 (NR-14 / OP-06)

---

## What Changed

### 1. `/workspace/.devcontainer/init-firewall.sh`
Added `just-raptor-89.clerk.accounts.dev` to the `for domain in \` loop alongside the other
allowed domains (registry.npmjs.org, api.anthropic.com, etc.). This enables the container
firewall to resolve and permit outbound HTTPS to the Clerk JWKS endpoint during local dev.

### 2. `/workspace/.env.local`
`BYPASS_AUTH=true` was present and has been **removed**. Real Clerk JWT validation is now
active in the dev container.

### 3. `/workspace/.env.example`
`BYPASS_AUTH` remains documented (commented out) at line 37 for CI/agent use. No changes
were required here.

---

## State Summary

| File | State |
|------|-------|
| `.devcontainer/init-firewall.sh` | `just-raptor-89.clerk.accounts.dev` added to allowed domains loop |
| `.env.local` | `BYPASS_AUTH=true` **removed** |
| `.env.example` | `BYPASS_AUTH` documented (commented out) — unchanged |

---

## PR & CI

- **PR:** https://github.com/ryanv11/travel-tracker/pull/80
- **Title:** `chore(hc01): allow Clerk JWKS domain in devcontainer firewall`
- **CI status:** All checks passed (CI + Security Checks, both green on push and pull_request triggers)

---

## Important Note

**HC-01 does NOT close on this change alone.** Closure requires PO end-to-end UAT:
the devcontainer must be rebuilt and Clerk JWT authentication verified to work end-to-end
before the checklist item can be marked PASS. This is documented in
`jobs/architect/tech/OP-06-hardening-checklist.md`.

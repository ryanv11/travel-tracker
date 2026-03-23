# Architect Brief — Clerk JWKS Firewall (GitHub #23, NR-14)

**Date:** 2026-03-23
**From:** COO
**Priority:** P2
**GitHub:** #23

## Request

Allow the Clerk JWKS endpoint through the devcontainer firewall so that real JWT
authentication works in local dev. Currently blocked, forcing `BYPASS_AUTH=true`
as a permanent workaround.

## Context

The devcontainer firewall (`init-firewall.sh`) permits outbound HTTPS only to
GitHub, npm, and Anthropic. Clerk's JWKS endpoint
(`just-raptor-89.clerk.accounts.dev`) is blocked, so the backend's
`verifyClerkJWT` call fails at startup and every auth request in local dev.

Current workaround: `BYPASS_AUTH=true` in `.env.local`, hardcoding all requests
to test user `test-user-00000000-0000-0000-0000-000000000000`.

Gate 1.5-A added a prod guard that throws if `BYPASS_AUTH=true` in production.
CI contract tests and agent sessions keep `BYPASS_AUTH=true` — no browser auth
needed there. This is only about the PO's local dev browser session.

## What's needed

1. Add `just-raptor-89.clerk.accounts.dev` to the allowed-domains loop in
   `.devcontainer/init-firewall.sh`.
2. Guidance on whether to remove `BYPASS_AUTH=true` from `.env.local` or leave
   it defaulting off (PO's preference: real auth for local manual testing).
3. Note any IP-rotation risk (Clerk CDN may rotate IPs mid-session — Architect
   to assess if this is worth mitigating or just accept container-restart cost).

## Trade-offs to consider

- Firewall resolves IPs at container startup — CDN rotation breaks mid-session
- Agent/CI sessions: `BYPASS_AUTH=true` stays; no impact
- Once live: PO trips owned by real Clerk user; agent test trips remain under
  bypass user (intentional data separation per NR-14)

## BRD reference

NR-14, ADL-20 (Clerk auth decision)

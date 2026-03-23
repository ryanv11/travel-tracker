# Completion Report: OP-06 Hardening Checklist + NR-14 Gate Spec

**Agent:** Architect
**Date:** 2026-03-23
**Brief:** `jobs/architect/inbox/20260323_1600-COO-op06-nr14-hardening.md`

---

## Deliverables produced

### 1. OP-06 Hardening Checklist
**File:** `jobs/architect/tech/OP-06-hardening-checklist.md`

Full document covering all six required domains:
1. Trust boundaries (named, with diagram)
2. Resource/action access matrix (owner / explicitly-shared / authenticated-but-ungranted)
3. Token/claim validation (sequence + gaps)
4. Failure behaviour and response minimisation (per failure mode)
5. Isolation enforcement layers (all five layers assessed)
6. Twelve concrete checklist items (HC-01 to HC-12) each with named verification criteria

### 2. ADL-27 — Admin panel role model
**File:** `jobs/architect/tech/ADL-27-admin-role-model.md`
**Also:** Appended summary to `jobs/architect/tech/20260307-architecture-decisions-log.md`

Decision: `is_owner` column on users table, seeded from `OWNER_CLERK_ID` env var,
enforced via `requireOwner` middleware. Full implementation spec included.

### 3. Future requirements security review
Included in §9 of OP-06 document. Covers: AD-07/08/09, NF-05–08, §9 Future Features
(companion access, share links, endorsements, invite model).

---

## NR-14 current status: BLOCKED — 4 FAIL, 2 PARTIAL

| Item | Status | Summary |
|---|---|---|
| HC-01 Clerk JWKS reachable | **FAIL** | Firewall blocks `just-raptor-89.clerk.accounts.dev` |
| HC-02 JWT iss + aud validated | **PARTIAL** | jose called without issuer/audience options |
| HC-03 Map shading user-scoped | **FAIL** | Shading queries aggregate all users' trips |
| HC-04 Admin writes owner-only | **FAIL** | Any authed user can write admin data |
| HC-05 Companion/shading not leaked | **FAIL** | Readable by any authed user |
| HC-06 City creation owner-only | **FAIL** | Any authed user can create cities |
| HC-07 No null userId records | **PARTIAL** | Schema allows nullable; backfill needed |
| HC-08 BYPASS_AUTH blocked in prod | PASS | |
| HC-09 Auth failures opaque | PASS | |
| HC-10 Cross-user trip → 404 | PASS | |
| HC-11 List endpoints scoped | PASS | |
| HC-12 Geo files are public data | PASS | |
| HC-13 Explicitly-shared role non-operative | PASS | No grants mechanism exists; no implicit fallback widens access |

---

## Recommended implementation order for NR-14

1. **HC-01** — Clerk firewall (devcontainer config change)
2. **HC-07b** — Audit and backfill null userId records **before** HC-03 (see note below)
3. **ADL-27 schema migration** — `is_owner` column, `OWNER_CLERK_ID` env var
4. **HC-04 + HC-05 + HC-06** — `requireOwner` applied to all admin routes + city creation
5. **HC-03** — Shading service userId scoping
6. **HC-07c** — Schema NOT NULL migration (after backfill is confirmed complete)
7. **HC-02** — JWT issuer + audience validation
8. **UAT** — HC-01 does not close on config change alone; closure requires the PO to
   complete the full end-to-end real-auth UAT sequence (login, trip access, owner admin
   write, non-owner empty-list + 403 behaviour). All other HC items must pass before UAT.

**Note on HC-07b → HC-03 ordering:** After HC-03 is applied, shading queries will scope
to `req.user.id`. Any null-owned trips in the database will stop appearing in shading
(NULL ≠ any userId). If the owner has pre-auth trips with null user_id, their map will
go blank. HC-07b backfill must be confirmed complete before HC-03 is deployed.

Items 2–6 are backend work. Each is a narrow, isolated change — suitable for a single
Backend agent brief per item, or batched into one or two briefs.

---

## Key architectural findings for COO awareness

**Map shading is a cross-user leak.** Currently the shading API returns travel history
aggregated across all users in the database. If a second user authenticates before HC-03 is
fixed, they will see the owner's travel map. This is the highest-urgency item after HC-01.

**Admin panel is fully open.** Any authenticated Clerk user can rename categories, deactivate
companions, update map shading colours, edit country/region config. Urgency = high once real
auth is live.

**AD-07/08/09 schema work is deferred.** Per-user shading config and per-user companions
list are not implemented. The NR-14 gate covers them only via the owner-only guard — a second
user simply cannot see or touch them. Full per-user schema (AD-07/08) is a separate brief.

**Explicitly-shared role is Phase 3+.** No grants mechanism exists. The access matrix has
"N/A" for this column throughout. This is correct for current scope — NR-14 covers
owner + authenticated-but-ungranted only.

---

## Clerk firewall answer (brief HC-01 detail)

Add to `.devcontainer/init-firewall.sh` allowed-domains list:
```
just-raptor-89.clerk.accounts.dev
```

IP rotation risk: Clerk's CDN may rotate IPs mid-session. The firewall resolves IPs at
container startup. If rotation occurs, auth calls fail and the container must be restarted.
This is the accepted cost — no mitigation warranted for local dev.

After adding the domain: remove `BYPASS_AUTH=true` from `.env.local`. Keep it available
in `.env.local.example` for CI/agent use. The bypass test user seed and the production
guard in `startup()` remain unchanged.

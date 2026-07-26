# Travel Tracker — Security Backlog
**Version:** 1.2
**Date:** 2026-07-26
**Author:** COO
**Source:** BACKEND security report (20260308_1000-BACKEND-security-report.txt)

This document tracks all security findings, their disposition, and their
phase assignment. It is the authoritative record for all security decisions.
Update this document whenever a finding is resolved or a new one is identified.

---

## Phase 2 Hard Gates

These items MUST be completed before any HOST=0.0.0.0 binding or cloud deployment.
COO sign-off required at Phase 2 gate review.

| ID | Finding | Action Required | Status |
|----|---------|----------------|--------|
| H1 | No authentication — all endpoints open | Implement real auth in src/backend/middleware/auth.ts | DONE (Clerk JWT, NR-14 issues #1, #2, #4 — #3 is the unrelated Tailwind migration; merged 2026-03-21) |
| H2 | No HTTPS — plaintext transport | TLS at reverse proxy (nginx/Caddy) before binding change | OPEN |
| M3 | trust proxy not configured for reverse proxy | app.set('trust proxy', 1) when deploying behind proxy | OPEN |

---

## Phase 2 Design Inputs

These items must inform Phase 2 architecture decisions before implementation begins.

| ID | Finding | Design Input |
|----|---------|-------------|
| L1 | Admin routes have no role separation | RBAC for /api/admin/* alongside auth design — admin scope or role claim required |
| L3 | Phase 2 cookie security not pre-configured | Cookies MUST be: HttpOnly, Secure (requires HTTPS first — H2), SameSite=Strict |

---

## Quick-Fix Items (Next Available Sprint)

Low effort. Implement when capacity allows — not blocking Phase 2 launch.

| ID | Finding | Action | Effort |
|----|---------|--------|--------|
| M1 | Geocoding rate limit | POST /api/cities rate limit: 20 req/min independently | DONE (2026-03-08 correction) |

---

## Backlog (Low Priority)

Revisit when triggers are met. No action required for Phase 1 or Phase 2 launch.

| ID | Finding | Action | Trigger |
|----|---------|--------|---------|
| M2 | LIKE wildcard flooding | Escape % and _ in city search query before pattern construction | City table grows >10,000 rows or query latency measurable |
| L2 | No request timeout | server.setTimeout(30000); AbortController in resolveCity() | Observable latency issues |
| L5 | CSP unsafe-inline for styleSrc | Nonce-based approach | If HTML rendering is added |

---

## npm Audit — Deferred

> SUPERSEDED (2026-07-07) by "npm audit — DEP-01 (2026-07-07)" below — retained for history.

| Advisory | Package | CVSS | Action |
|----------|---------|------|--------|
| GHSA-67mh-4wv8-2f99 | esbuild ≤0.24.2 (via drizzle-kit) | 5.3 Moderate | Upgrade drizzle-kit ≥0.31.9 when compatible. Dev-only risk. Interim: never run drizzle-kit studio in shared/cloud environment. |

---

## npm audit — DEP-01 (2026-07-07)

Full dependency vulnerability pass (tracker DEP-01, issue #98, ADL-30). Starting state on
main: 26 vulnerabilities (3 critical, 10 high, 12 moderate, 1 low). 23 fixed via
`npm audit fix` (non-breaking; notable: @clerk/shared 4.3.2→4.25.0, @clerk/react
6.1.2→6.12.0, vitest 4.0.18→4.1.10, vite 7.3.1→7.3.6, form-data, js-cookie,
path-to-regexp, picomatch, tmp, undici, ws). Remaining dispositions:

| Advisory | Package | Severity | Disposition |
|----------|---------|----------|-------------|
| GHSA-gpj5-g38j-94v9 | drizzle-orm <0.45.2 | High | **FIXED** — upgraded to 0.45.2 per ADL-30 Decision 1. drizzle-kit stays pinned at 0.31.9 (compatibility handshake verified; ADL-15 patch unaffected). |
| GHSA-67mh-4wv8-2f99, GHSA-g7r4-m6w7-qqqr | esbuild ≤0.24.2 via drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils (4 findings) | Moderate | **ACCEPTED (moderate, dev-only)** per ADL-30 Decision 2 — esbuild dev-server advisory; drizzle-kit only loads `drizzle.config.ts` via esbuild-kit, never serves; devDependency, not in the runtime bundle; below the `--audit-level=high` CI gate. npm's suggested `drizzle-kit@0.18.1` downgrade rejected. Revisit at drizzle 1.0 GA with a paired orm+kit upgrade and mandatory re-verification of the four ADL-15 patched SQLite bugs. |

Gate status after this pass: `npm audit --audit-level=high` exits 0 (4 accepted moderates
remain, below the gate threshold).

**PO sign-off:** residual acceptance of the 4 esbuild/drizzle-kit moderates approved by
Ryan, 2026-07-08 ("I'm accepting of those moderates").

---

## npm audit — DEP-02 (2026-07-26)

Fresh drift accrued since DEP-01 (tracker DEP-02, issue #250). `npm audit --audit-level=high`
went red on main again on a docs/tracker-only diff (advisories published post-DEP-01).
2 fixed via `npm audit fix` (non-breaking):

| Advisory | Package | Severity | Disposition |
|----------|---------|----------|-------------|
| GHSA-v422-hmwv-36x6 | body-parser <2.3.0 | High-gate-triggering | **FIXED** — 2.2.2 → 2.3.0, non-breaking. |
| GHSA-r28c-9q8g-f849 | postcss ≤8.5.17 | High | **FIXED** — 8.5.16 → 8.5.23, non-breaking. |
| GHSA-67mh-4wv8-2f99, GHSA-g7r4-m6w7-qqqr | esbuild ≤0.24.2 \|\| 0.27.3–0.28.0 (via drizzle-kit → @esbuild-kit chain) | Moderate | **ACCEPTED (unchanged from DEP-01)** — same cluster, same rationale (dev-only, below `--audit-level=high` gate, drizzle-kit downgrade to 0.18.1 would break the ADL-15 patch). No new action. |
| GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg | react-router 6.0.0–7.17.0 / react-router-dom (same range) | Moderate | **DEFERRED** — new since DEP-01. Fix requires a major bump to react-router-dom@7.18.1 (breaking); below the `--audit-level=high` gate so not blocking, but needs its own upgrade-and-verify pass (routing behavior, e2e suite) before taking the major version. Not yet scheduled. |

Gate status after this pass: `npm audit --audit-level=high` exits 0 (6 moderate
vulnerabilities remain — the 4 already-accepted esbuild/drizzle-kit findings plus the
2 new, deferred react-router findings — both below the gate threshold).

---

## Accepted Risks

| ID | Finding | Decision | Rationale | Date |
|----|---------|----------|-----------|------|
| H3 | SQLite database plaintext at rest | ACCEPTED AS-IS | Personal travel data is low-sensitivity (no financial, medical, or credential data). OS-level FileVault mitigates for personal use. Revisit if data classification changes. | 2026-03-08 |

---

## Resolved

| ID | Finding | Resolution | Date |
|----|---------|-----------|------|
| — | — | — | — |

---

## Change Log

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-03-08 | Initial security backlog created from BACKEND Phase 1 security report |
| 1.1 | 2026-07-07 | DEP-01 (#98, ADL-30): npm audit pass — 23 non-breaking fixes, drizzle-orm GHSA-gpj5-g38j-94v9 fixed by 0.45.2, esbuild/drizzle-kit moderate cluster formally accepted; superseded the 2026-03-08 "npm Audit — Deferred" section |
| 1.2 | 2026-07-26 | DEP-02 (#250): npm audit pass — body-parser + postcss highs fixed non-breaking, esbuild/drizzle-kit cluster re-affirmed accepted (unchanged), react-router moderate cluster newly deferred |


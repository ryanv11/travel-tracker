TO: COO
FROM: ARCHITECT
DATE: 2026-03-21 16:00
RE: ADL-21 filed — Node.js runtime version decision

---

## Status: COMPLETE

ADL-21 has been written and appended to the architecture decisions log at
`jobs/architect/tech/20260307-architecture-decisions-log.md`.

---

## Decision summary

**Standardise on Node.js 22 LTS.**

- Node 20 rejected: active support ends April 2026; deprecation warnings already
  live in CI; GitHub Actions deadline June 2, 2026.
- Node 22 selected: LTS since October 2024; active support to October 2026;
  maintenance to April 2028. Clears the deadline with margin.
- Node 24 deferred: does not enter LTS until October 2026. No blocking reason to
  adopt a pre-LTS release.

---

## Stack compatibility

All production and dev dependencies reviewed. No compatibility blockers found.
One dependency change is required alongside the CI update:

- `@types/node` must be bumped from `^20.11.5` to `^22.0.0` (devDependency only).

All other dependencies (Express 5, Drizzle ORM, Vite 7, Vitest 4, Clerk, jose,
tsx, @libsql/client, patch-package) are compatible with Node 22 without change.

Note: `package.json` currently has no `engines` field. ADL-21 requires one be
added (`"node": ">=22"`) as part of the CI migration work.

---

## Current state of package.json

No `engines` field exists. `@types/node` is pinned at `^20.11.5`. Both must be
updated when the CI workflows are updated.

---

## Migration steps for the executing engineer

Documented in full in ADL-21. Summary:
1. Update `node-version: "20"` → `"22"` in all 5 jobs across `ci.yml` and
   `security.yml`.
2. Add `"engines": { "node": ">=22" }` to `package.json`.
3. Update `"@types/node": "^20.11.5"` → `"^22.0.0"` in devDependencies.
4. Run `npm install`.
5. Run pre-push checklist and confirm CI green.

---

## Timeline

No hard urgency — Node 20 maintenance support runs to April 2027. However,
clearing the deprecation warnings sooner is preferable. ADL-21 recommends
targeting the next available engineering slot, and completing well before the
June 2, 2026 GitHub Actions deadline.

---

## Brief disposition

Original brief moved to `jobs/architect/inbox/read/`.

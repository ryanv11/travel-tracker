# ARCHITECT — ADL-30 (DEP-01 drizzle ruling) complete

**Date:** 2026-07-08 06:09 UTC | **Tracker:** DEP-01 | **GitHub:** #98
**Deliverable:** `jobs/architect/tech/ADL-30-dep01-drizzle-upgrade.md` + main-log entry

**Numbering deviation:** brief said ADL-29, but ADL-29 was already taken (security
enforcement mechanisms, 2026-03-23). This ruling is **ADL-30**; next free is ADL-31.
While editing the log I also backfilled the missing ADL-28 pointer entry (doc-integrity
audit §17, MED STALE item) — the log sequence is now contiguous 01–30.

**Ruling summary:**
1. **drizzle-orm → `^0.45.2`, upgrade NOW in the DEP-01 Backend pass.** Clears the HIGH
   (GHSA-gpj5-g38j-94v9). We don't hit the vulnerable path today (no `sql.identifier`,
   `.as()`, `sql.raw`, no dynamic orderBy), but accepting a HIGH keeps the audit gate
   permanently red. Key finding: **no drizzle-kit bump needed** — orm 0.45.2 keeps
   `compatibilityVersion = 10`, exactly what kit 0.31.9 requires, so the ADL-15 patch
   survives untouched. No SQLite breaking changes 0.39→0.45; 0.44's DrizzleQueryError
   wrapping is inert (backend never matches driver error codes).
2. **drizzle-kit/esbuild 4 moderates: residual accepted.** Dev-only config-loader chain,
   never serves, not in runtime bundle, below the high gate. npm's `drizzle-kit@0.18.1`
   downgrade rejected. Revisit at drizzle 1.0 GA (paired orm+kit issue + patch re-verify).

**For the Backend brief:** exact checklist in ADL-30 §Instructions (pin, patch-package
check, `db:generate` no-op check, full suites, constraint-error spot check,
security-backlog.md npm-audit section update in the same PR).

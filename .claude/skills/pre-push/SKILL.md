---
name: pre-push
description: Mandatory pre-push checklist. Run before every git push.
---

Run the following in order. Fix all failures before pushing.

```bash
npm run check              # Biome lint + format
npm run type:check:all     # TypeScript (frontend + backend)
npm run test:backend       # Backend unit tests
npm run test:frontend      # Frontend unit tests
```

Contract tests require a live backend — only run `npm run test:contract` if the backend is running locally.

**Document lifecycle check (CLAUDE.md → Document lifecycle):** if this change alters a fact
asserted by any status/verdict document — OP-06 hardening checklist, hardening-gate.md,
security-backlog.md, BRD open questions, tracker.json, or any doc with a PASS/FAIL/"current
state" section — update that document in this same change, citing the PR. If the change
supersedes part of a spec or ADL, stamp the superseded section now, not later.

**Blocked-by-another-team exception:** If a failure is caused by a missing schema column, API field, or other cross-team dependency that cannot be resolved without another team's work, document the blocker clearly in the commit message and push. Do not hold a push indefinitely for another team.

Report results before pushing.

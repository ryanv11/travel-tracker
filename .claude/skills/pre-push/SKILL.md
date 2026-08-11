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
npm run status:check       # _project/STATUS.md in sync with tracker.json
npm run tracker:check      # tracker.json integrity — no duplicate IDs, brdRefs valid
npm run scope:check        # backend scope guards — ownership chokepoint, getDb-in-routes, table classification
```

`scope:check` runs **three** checks and also runs in CI (QUAL-43 Stage 3), so a
failure here is a failure there. **All three are enforced** — as of QUAL-43
Stage 5 (2026-08-10) there is no warn tier left in Check 1 or 2, and Check 3
(QUAL-47) landed enforced.

**Check 1 — ownership completeness** (`RESIDUAL`). It scans all of
`src/backend/**` (minus `__tests__`) for ownership expressed by hand — either an
`eq(<table>.userId, …)` predicate or an ownership comparison written in
application code. Route the site through `scopeToUser`/`ownedAnd` (predicate) or
`assertOwned`/`assertWritable` (existence check); **do not exempt it**. The
predicate form is permitted *only* in `repositories/scope.ts`; the JS-comparison
form is permitted nowhere, including there.

> Until Stage 5 this had two zones — `repositories/` enforced, the rest of
> `src/backend/**` warn-only — because Stages 2/4 were still relocating reads out
> of `routes/**` and failing on them would have red-ed `main` (ADL-47
> expand/contract). Both are enforced now.

**Check 2 — `getDb` in routes** (`GETDB`). Route handlers must not be able to
obtain a DB handle at all, so the required count is **zero**. It counts *mentions*
of the literal string, not just `const db = getDb()` call sites, and tags each
match `[call-site|type-ref|import|comment]` — a `comment` tag means reword the
comment (OP-30: fix your own text) and you are done; any other tag means a read
needs relocating into a repository.

**Check 3 — ownership classification** (`CLASSIFY`, QUAL-47). Every table in
`schema.ts` must be classified exactly once in `src/backend/db/ownership.ts` —
user data owned by its own `user_id` column, user data scoped through a named
parent, global reference data, or the identity table — and each classification is
verified against the real schema (Drizzle's table metadata, not a grep). **If you
added a table, this is why the build is red: add its entry in the same PR.** It
also fails when an `owned-by-column` table's ownership column is not named
`user_id` (Check 1's regex would not see it), when a table carrying a `users.id`
foreign key that is not user-owned has no stated reason (`cities` is the worked
example — provenance, not ownership), or when a derived-ownership chain does not
reach an owned table. The manifest is a classification, **not an allowlist**:
reclassifying a table to clear a failure is the one thing never to do.

If either check flags something you just wrote, fix your code or your text —
never add an exclusion to the script (OP-30: scanner suppressions need COO
sign-off).

If `status:check` fails, run `npm run status` and commit the regenerated
`_project/STATUS.md` alongside your change — STATUS.md is generated, never hand-edited.

Contract tests require a live backend — only run `npm run test:contract` if the backend is running locally.

**This is a fast pre-filter, not the gate.** It runs a subset of the CI checks (the authoritative job list is `ci.yml` + `security.yml`); E2E, contract,
`npm audit`, Gitleaks and Semgrep only run in CI. A green pre-push does **not** mean CI will pass —
`scripts/ci-wait.sh pr <n>` after pushing is the authoritative gate and is mandatory (this is the
"pre-commit green but CI red" trap: those five checks don't run locally, and base skew is caught only
server-side by branch protection's require-up-to-date).

**Document lifecycle check (CLAUDE.md → Document lifecycle):** if this change alters a fact
asserted by any status/verdict document — OP-06 hardening checklist, hardening-gate.md,
security-backlog.md, BRD open questions, tracker.json, or any doc with a PASS/FAIL/"current
state" section — update that document in this same change, citing the PR. If the change
supersedes part of a spec or ADL, stamp the superseded section now, not later.

**Blocked-by-another-team exception:** If a failure is caused by a missing schema column, API field, or other cross-team dependency that cannot be resolved without another team's work, document the blocker clearly in the commit message and push. Do not hold a push indefinitely for another team.

Report results before pushing.

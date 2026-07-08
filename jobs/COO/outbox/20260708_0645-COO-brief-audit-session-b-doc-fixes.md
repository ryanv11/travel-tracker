# BRIEF — Audit Session B: doc-fix writing session

**From:** COO
**To:** Auditor (Session B — the writing session promised by Session A's dispositions)
**Date prepared:** 2026-07-08
**Status:** PREPARED — NOT YET DISPATCHED. COO dispatches when Ryan gives the go.
**Authoritative source:** `audits/session-a-doc-integrity.md` (Session A report). This brief
is a routing sheet over that report's disposition tables — where the two disagree, the
report wins, except for the "already done" and "ground-truth changes" sections below,
which post-date it.

---

## Mission

Execute every doc fix Session A dispositioned as "(in a writing session)" that is NOT
gated on an unanswered §5 question. One branch (`chore/audit-b-doc-fixes`), one PR, per
the CLAUDE.md git workflow and Document lifecycle rule (cite the PR in every status flip;
stamp superseded sections; banner historical docs).

## Ground-truth changes since Session A (2026-07-07 → 2026-07-08) — do NOT flag as new drift

- **PRs #99–#106 merged.** BUG-24 fixed (#99), OP-09 lifecycle rule (#100), OP-10 (#102),
  depwire resolution commit (#103), ADL-30 (#104), DEP-01 dependency pass (#105),
  DEP-01 close-out (#106).
- **Main is fully green** (all CI + Security Checks jobs) as of #105. Any doc claiming the
  npm-audit job is red is now stale in the other direction.
- **security-backlog.md is at v1.1** (#105/#106): npm-audit section rewritten with a
  supersession stamp, DEP-01 dispositions, and PO sign-off. Re-verify Session A's §8
  findings against v1.1 before editing — some may already be addressed.
- **drizzle-orm is now 0.45.2** (ADL-30); drizzle-kit unchanged at patched 0.31.9.
- **ADL-28 pointer entry in the main ADL log: DONE** in #104 — drop from the queue.
- **tracker.json:** DEP-01 done, BUG-24 done. BUG-23 (tracker.js parser) still open —
  edit tracker.json by hand if needed; the CLI is broken.

## Fix queue — ungated (execute)

1. **README + `.env.example`** (HIGH, audit doc 3): reconcile env vars both ways —
   `.env.example` missing `CLERK_JWKS_URI`, `VITE_CLERK_PUBLISHABLE_KEY`,
   `VITE_BYPASS_AUTH`; README missing `CLERK_ISSUER`, `OWNER_CLERK_ID`,
   `VITE_API_BASE_URL`, `HOST`, `ALLOWED_ORIGINS`. Fresh setup per README currently
   throws at `main.tsx:25`. Do not commit `.env.local`.
2. **CODEBASE.md** (doc 2): fix the contract-test claim and other non-Q2 rows in its
   drift table. Rows resting on "firewall can't reach Clerk" are **Q2-gated — skip**.
3. **security-spec.md** (doc 7): add the supersession stamps its table calls for.
4. **ER-schema.md + `schema.ts:15`** (audit §4 consolidation): historical banner on the
   ER doc; repoint the schema.ts comment ("ER-schema v1.1 = original design; evolution
   in the ADL").
5. **API reference** (doc 11): auth section + missing endpoints per its drift table.
6. **Frontend component reference** (doc 12): per its drift table.
7. **BRD header version 2.5 → 2.7** (doc 6). Open-question closures: only those already
   answered in-repo. **OQ-02/Electron is Q12-gated — skip.**
8. **Map-shading spec** (doc ~14): user-scoping correction per its drift table (ADL-28
   decided per-user config; tables not yet migrated — state it as decided-not-implemented).
9. **`drizzle.config.ts:7`** comment: remove the `db:push` "dev shortcut" claim
   (forbidden per ADL-15).
10. **codebase-health.md** (doc 26): strip the depwire methodology steps (Q3 resolution,
    2026-07-07 — depwire rejected, removal commit 3823044 stands).
11. **Provenance SUSPECT** (§3): security-backlog H1 citation "issues #1–4 merged
    2026-03-20" — verify against `gh`/git and correct or annotate.

## Gated — do NOT touch until Ryan answers (audit §5)

| Q | Blocks |
|---|--------|
| Q1 | OP-06 checklist FAIL→PASS flips (+ hardening-gate.md) |
| Q2 | CLAUDE.md/CODEBASE.md firewall/Clerk-JWKS claims; issue #23 closure; BYPASS_AUTH default docs |
| Q4 | CODEBASE.md description of the `claude-code/` clone |
| Q5–Q6 | BRD v2.7 sign-off note; NF-01/§3 product-direction rewrite |
| Q7 | test-policy §5 423-vs-403 |
| Q8 | project-plan.txt refresh vs historical banner; objective home |
| Q9 | `jobs/PO/screenshots/` docs vs directory |
| Q10 | DOCX artifacts disposition |
| Q11 | UX design-system shadcn/ui claim |
| Q12 | BRD OQ-02 (Electron) closure |

If Ryan has stamped answers into §5 by dispatch time, treat the corresponding items as
ungated and cite his answer.

## Deliverables

1. All ungated fixes on `chore/audit-b-doc-fixes`, PR referencing the audit
   (`audits/session-a-doc-integrity.md`) and issue numbers where they exist.
2. Update the audit report itself: mark executed queue items with the fixing PR number
   (lifecycle rule — the report is a status document).
3. Completion report to `jobs/COO/inbox/` (`<UTC>-AUDITOR-session-b-complete.md`).
4. /pre-push before pushing; all CI green; COO merges.

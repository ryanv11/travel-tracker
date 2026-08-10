Tracker: QUAL-43 (design-reflection R1, Stage 1) · PR #484 · BRD: n/a
Branch: feat/qual43-stage1-crosstenant-matrix

WHAT WAS TESTED
The OP-35 ATDD red bar for ADL-53's userId-scoping-chokepoint build. Extended
src/backend/routes/__tests__/security.access-matrix.test.ts (new Part F) to
name every §5.1 user-owned getDb() path and assert the F4 shape per endpoint
class — empty result for cross-tenant reads, 404 (never 403, SE-05) for
cross-tenant mutations. Reused the file's existing real-libSQL two-user
harness (createTestDb() — real migrations, FKs on, real partial unique
indexes) rather than building a parallel rig.

PASS/FAIL PER §5.1 PATH (all GREEN on current main)
- trips.ts:198/223 (trip-detail items)          PASS — scoped correctly
- places.ts:231/253 (carry-forward, SEC-02)     PASS — 404 (trip/place) + 400 (cross-tenant item id)
- places.ts:289/352 (activity tag/untag)        PASS — 404, never 403
- cities.ts:703/748 (city carry-forward, IT-07) PASS — empty list, cross-tenant
- cities.ts:766/792 (city items, SEC-01)        PASS — empty list, cross-tenant
- items-helper.ts:87                            covered transitively (3 call sites above)
- trips.ts:207-216 join                         inherits isolation (assertion-guarded), no independent test vector — not a gap, see tech doc

No §5.1 path is RED on current main — no latent gap to report. Expected per
ADL-53 F5 (isolation holds by convention, no active bleed today). This IS the
Stage 1 deliverable: the regression net Backend's Stage 0/2/3/4 must stay
green against.

ANTI-VACUOUS PROOF (mutation-tested)
Dropped trips.ts:223's userId predicate → trip-detail test went red (rogue
item leaked). Dropped places.ts:253's SEC-02 predicate → carry-forward test
went red (201 instead of 400 — would have duplicated another user's item).
Both reverted before commit; git diff --stat confirmed zero production diff.

BUGS FOUND
None.

CI: gh pr checks 484 — all 18 checks green (confirmed via scripts/ci-wait.sh pr 484).

OPEN ISSUES / BLOCKERS
None for this thread. npm audit (fresh worktree install): 6 MODERATE
advisories, no HIGH/CRITICAL, no package changes made by this thread —
flagging per frameworks.txt rule 20 for your disposition, not blocking.

Full detail: jobs/qa/tech/20260810-qual43-stage1-crosstenant-matrix.md
Park doc: jobs/qa/park-docs/20260810-QA-park.txt

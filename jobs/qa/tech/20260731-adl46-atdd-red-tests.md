# ADL-46 ATDD trial — RED acceptance tests (2026-07-31)

**Tracker:** BUG-63 / ADL-46 / open-dialogues D-17 (ATDD trial)
**Branch:** `test/adl46-atdd` (off `release/adl46-access-model`)
**PR:** targets `release/adl46-access-model`, NOT main
**Spec:** `jobs/architect/tech/ADL-46-non-owner-access-model.md` §7, §8, §8.1, §8.2, §4.2.1, §4.4

## What this is

Independent RED acceptance tests written against the ADL-46 spec before the Backend
stage implements it. Not a bug report — the integration branch is DB-stage-only so
far (migrations 0014/0015 landed, no route code). Red is the correct, expected
outcome, both from the pre-existing DB-stage breakage and from these new tests.

## New file

`src/backend/routes/__tests__/adl46-access-model.test.ts` — 32 new assertions across
three describe blocks (Group A/B/C), following the house style (mocked `getDb`,
`requireAuth`, `resolveCity`, shading service) of `security.access-matrix.test.ts`.

## Edit to an existing file

`src/backend/routes/__tests__/security.access-matrix.test.ts:457` — removed
`.skip` from `PATCH /api/cities/1 → 403 (BUG-22...)` per ADL-46 §8.1, which names
this as a live coverage hole (guard present since BUG-22 merged, assertion never
ran). Reworded the surrounding comment to explain why. One-line source edit,
declared here per CLAUDE.md's "source code — full-file rewrite must be declared"
rule (this isn't a full-file rewrite, but flagging the edit for the same reason:
transparency on any change to an existing security test). Verified this test now
passes (63/63 in the file, no regressions) — the guard genuinely is present today.

## Red baseline, by group

Ran three times: (1) the new file alone, (2) alongside `security.access-matrix.test.ts`
+ `owner-access.test.ts`, (3) the full `npm run test:backend` suite, to separate my
red from the DB-stage's pre-existing red.

**Full-suite baseline (before my change):** 34 pre-existing failures across
`trips.test.ts` (6), `lock-matrix.test.ts` (21), `owner-access.test.ts` (1),
`qa-backend-fixes.test.ts` (6) — all `NOT NULL constraint failed: trip_categories.user_id`
/ `activities.user_id` or downstream type errors, i.e. exactly the DB-stage
breakage the brief described. None of these are mine; I did not touch them.

**My new file — 14 failed / 18 passed (32 total). Every failure is a clean assertion
mismatch (wrong status code, wrong body field, wrong row count) — zero exceptions,
zero DB errors, zero unhandled rejections.** All 14 are red-for-the-right-reason.
None are blocked by the DB-stage breakage — my fixtures seed `userId` explicitly on
every `trip_categories`/`activities` insert, sidestepping the NOT NULL issue that
blocks the pre-existing suites.

### Group A — access matrix (12 assertions, 8 red / 4 already-passing-as-designed)
| Test | Result | Why |
|---|---|---|
| GET /api/categories → 200 own list | RED (404) | route doesn't exist yet (S3) |
| GET /api/activities → 200 own list | RED (404) | route doesn't exist yet (S3) |
| category isolation A absent from B | RED (404) | same |
| activity isolation A absent from B | RED (404) | same |
| POST /api/trips cross-user category_id → 400 | RED (got 201) | `replaceAssociations` validates only companions today |
| PATCH /api/trips/:id cross-user category_id → 400 | RED (got 200) | same |
| place-level activity cross-user → 400 (F1c) | RED (got 201) | `places.ts` POST has no ownership check on `activity_id` at all |
| POST /api/cities non-owner → 201 | RED (got 403) | `requireOwner` still gates the route (D4/S1 not landed) |
| 8× fail-closed admin/country 403 rows | GREEN (already) | `requireOwner` untouched by the DB stage — regression guard, must stay green |
| §8.1 unskip (PATCH cities non-owner → 403) | GREEN (already) | guard present since BUG-22; the point was it wasn't running |
| GET /api/categories → 401 | GREEN (already) | global `requireAuth` fires before routing regardless of route existence |
| GET /api/activities → 401 | GREEN (already) | same |

### Group B — D13 find-or-create (6 assertions, 4 red / 2 already-passing-as-designed)
Run as **owner** (judgement call, see report) except B6 which is explicitly a
non-owner case per ADL-46 §8 row 4.
| Test | Result | Why |
|---|---|---|
| B1 exact match, row count unchanged | GREEN (already) | today's 2-column lookup happens to still work when there's exactly one row |
| B2 wildcard upgrade (adopt region) | RED (`region_id` stayed null) | today's code explicitly never overwrites region_id on a find |
| B3 same name, different region both allowed | RED (got 200, same row) | today's lookup ignores region entirely — collapses Springfield IL/MO into one row |
| B4 ambiguous no-region, 2 existing rows | RED (silently returned the IL row) | no disambiguation logic exists |
| B5 exactly-one-match, no region → return it | GREEN (already) | no-regression anchor, holds under both old and new lookup |
| B6 non-owner different casing → 200 | RED (got 403) | D4 access gate not open yet |

### Group C — containment / GE-16 (5 base + 1 bonus, 2 red / 3 already-passing-as-designed + 1 red)
| Test | Result | Why |
|---|---|---|
| C1 pending visible to creator, not to other | RED (visible to both) | no containment clause exists in `GET /api/cities` yet |
| C2 resolved visible to all | GREEN (already) | vacuously true — no containment exists to hide it |
| C3 NULL-creator pending visible to all (F3) | GREEN (already) | vacuously true today; becomes a REAL regression guard once containment lands — this is the exact defect OP-27's review caught in the ADL's first draft |
| C4 GET /:id carries no containment | GREEN (already) | vacuously true; must stay true — explicit "do not add containment here" guard |
| bonus: B's POST hits A's pending row, no dup | RED (got 403) | POST still owner-gated (D4 not landed) |

## Judgement calls flagged (ATDD trial success condition)

1. **Group B caller identity (owner, not non-owner).** POST /api/cities is still
   `requireOwner` on this branch. Testing D13's find-or-create logic as a
   non-owner would fail every case at the auth gate before reaching the logic
   under test, conflating D13's correctness with D4's access-model change into
   one failure mode. I ran Group B as owner (who already has access today) to
   isolate the two concerns — each red failure maps to exactly one causal gap.
   D13's own text never depends on caller identity. The exception is B6, which
   ADL-46 §8 explicitly lists as a non-owner case (row 4) and is written as such.

2. **B4's assertion shape (ambiguous no-region case).** ADL-46 §4.2.1 states
   plainly that this case has "no safe automatic answer" and is "a disambiguation
   prompt, not a guess," explicitly deferring the mechanism to D14 (§4.3.2),
   which is itself a frontend-facing candidate-list flow, not a route-level
   contract. The spec does not commit to a status code or response shape for
   `POST /api/cities` in this case. I encoded only the two invariants the text
   does commit to — no silent pick of an existing row, no duplication of either
   existing row — rather than presuming a specific status code (409? a new
   `pending` row? something else?). Flagging this because a Backend implementer
   reading only §4.2.1 has the same gap I did.

3. **Where to place the §8-row-6 / OP-27-P2 test.** Not explicitly named in the
   brief's Group A/B/C bullet lists, but ADL-46 §8 calls it out by name as
   "nowhere stated" before the ADL, and it sits exactly at the seam between
   Group B (find-or-create) and Group C (containment) — it is find-or-create's
   pass-1 lookup deliberately staying creator-unscoped so a pending row can be
   picked back up by its own future POSTs (and, per OP-27 P2, by a second
   user's POST too). Added it to Group C as a labeled "bonus" rather than
   silently folding it into an existing test, so its provenance is traceable.

## A genuine spec gap I found (the trial's explicit success condition)

**`owner-access.test.ts`'s HC-06 block (lines 168-190) directly contradicts the
ADL-46 end state and is not in §8.2's enumerated "four files that break."**

§8.2 lists `owner-access.test.ts` as one of the three files (besides
`security.access-matrix.test.ts`) that break at S3, and gives its breaking line
numbers as `:129,137` (non-owner 403) and `:147,155` (owner 200/201) — both in
the **HC-04 categories block**. But the same file's **HC-06 block**, a few lines
below, independently asserts:

```
it('POST /api/cities → 403 for non-owner', ...)   // owner-access.test.ts:169
it('POST /api/cities → 201 for owner', ...)        // owner-access.test.ts:180
```

This is the exact same route/scenario §8 row 3 of the main table names as
changing from `403` to `201` for a non-owner (D4/S1) — but §8.2's "grep -rln
for the route strings ... returns exactly these four files" inventory only
credits this file's *categories* assertions as breaking, not its *cities*
assertions. Verified independently: I ran the grep ADL-46 §8.2 describes
(`grep -rln` for `/api/cities` across `src/` and `tests/`) and it does surface
this file — the omission is in what the ADL says will break within the file it
already lists, not a missed file.

Practical consequence: when the Backend brief opens `POST /api/cities` to
non-owners (S1), this existing, currently-passing assertion
(`owner-access.test.ts:169`, "non-owner → 403") will start failing — and
nothing in ADL-46's own change inventory told the implementer to expect or
authorise that. Under OP-30's precedent (an implementation agent should not
face a red security-relevant check its brief didn't authorise it to touch), the
Backend brief for S1 should explicitly list `owner-access.test.ts:168-178` (the
non-owner-403 half of HC-06) as a fourth thing that changes, alongside HC-04.
I have not touched this test myself — out of scope for this ATDD pass, and it's
one of the "must not weaken/delete existing assertions" files — but flagging it
now, before Backend inherits an incomplete inventory.

## Verification run

```
npx vitest run src/backend/routes/__tests__/adl46-access-model.test.ts
  → 14 failed | 18 passed (32)  — zero exceptions, all clean assertion mismatches

npx vitest run src/backend/routes/__tests__/security.access-matrix.test.ts
  → 63 passed (63)  — unskip verified safe, no regressions

npm run test:backend (full suite)
  → 5 files failed | 25 passed (30); 48 failed | 586 passed (634)
  → failures: trips.test.ts, lock-matrix.test.ts, owner-access.test.ts,
    qa-backend-fixes.test.ts (all pre-existing DB-stage breakage, untouched)
    + adl46-access-model.test.ts (mine, 14/32, all red-for-the-right-reason)

npm run check            → clean (1 formatting nit in my new file, biome --write applied)
npm run type:check:all   → 20 pre-existing errors, all in files I did not touch;
                            zero new errors from my file or my one-line edit
npm run test:frontend    → 228 passed (228), untouched
npm run status:check     → STATUS.md up to date
```

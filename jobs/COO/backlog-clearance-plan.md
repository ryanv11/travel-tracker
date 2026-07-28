# Backlog Clearance Plan

**Version:** 1.0
**Date:** 2026-07-26
**Author:** COO
**Status:** LIVE — approved by PO 2026-07-26. Update wave status here as briefs land; this
document is presumed current until stamped otherwise (CLAUDE.md → Document lifecycle).

Sequencing plan for clearing the entire open bug backlog plus the feature items that share
its code surface. Ordered for **throughput, not priority** — PO's explicit instruction was
"the most efficient way possible regardless of priority."

Companion document: `_project/tracker.json` remains the authority for item status. This plan
owns *sequencing and batching* only; it never contradicts the tracker.

---

## 1. The efficiency thesis

Agent runtime is effectively free and parallel. The three things that actually cost time are:

1. **COO serialisation** — brief writing, PR review, merge. One PR per *subsystem* beats one
   per bug.
2. **Merge conflicts** between concurrent agents in the same files. Batches are partitioned
   by file surface so concurrent agents never collide.
3. **PO UAT time** — the scarcest resource. One batched UAT round per wave, not per PR.

Everything below optimises for those three, which is why a P3 papercut can ship in the same
brief as a P1 while another P1 waits for scoping.

---

## 2. Scope

**33 items:** 26 open backlog items (23 `BUG-*` + `OQ-05`, `OQ-06`, `UX-11`) and 7 feature
items that share their code surface.

| Bucket | Count | Items |
|---|---|---|
| Briefable immediately | 13 | BUG-06, 37, 44, 48, 49, 50, 51, 52, 55, 56, 57, 58, 62 |
| Blocked on scoping | 11 | OQ-05, OQ-06, BUG-40, 41, 42, 45, 46, 47, 53, 54, UX-11 |
| Not schedulable | 2 | BUG-63 (unreproducible), BUG-43 (research spike, PO-flagged aspirational) |
| Features riding along | 7 | BRD-DP06, BRD-AD09, BRD-IT10, QUAL-02 (subset), QUAL-03, WP-05, BRD-IT0809 |

---

## 3. Wave 0 — scoping (parallel, no code touched)

Spec output only (`jobs/*/tech/`, ADL). Zero conflict with Wave 1, so both waves run
concurrently.

| # | Role | Covers | Unblocks |
|---|---|---|---|
| S1 | Architect | **OQ-05** — trip-place identity (one-row-per-city) | BUG-40 |
| S2 | Architect | **BUG-41 + BUG-42** — multi-leg flights and multi-companion seats are one schema problem ("booking item is flat"), not two | BUG-43 (downstream) |
| S3 | Architect | **BUG-45 + OQ-06** — airline dropdown and ISO 3166-2 subdivisions are the same sourced-reference-data decision; one ADL | — |
| S4 | UX | **BUG-53 + UX-11 + BUG-54 + BUG-47** — one trip-list / colour / activities spec pass | BUG-46 |
| S5 | Architect | **BUG-48** — see §6 sizing correction; this is not a frontend brief | BUG-48 impl |
| S6 | Architect | **BRD-IT10** — nullable Google Maps URL column; schema-change rule requires review | BRD-IT10 impl, BRD-MB0102 |

**Mandatory before dispatch:** pre-assign ADL numbers. S1/S2/S3/S5/S6 are five concurrent
Architects who will each independently read the ADL log and pick "the next number."
Worktree isolation does **not** protect against this — same class as the shared-`refs/stash`
collision in OP-20. COO assigns numbers in the briefs.

> **DONE 2026-07-27:** S1→**ADL-41**, S2→**ADL-42**, S3→**ADL-43**, S5→**ADL-44**,
> S6→**ADL-45**, reserved as stubs in the ADL log. S4 is UX and gets no ADL number.
> Briefs instruct each Architect to rewrite its own reserved stub in place — not to append
> a new entry, which is what would make five concurrent PRs conflict.

---

## 4. Wave 1 — implementation (file-partitioned)

Run as **two sub-waves of ~4**, not all 8 at once: COO reviews and merges serially anyway,
and the conflict pairs below must not run concurrently.

| # | Owner | Items | File surface |
|---|---|---|---|
| B1 | frontend | BUG-49 | `Map/*` z-order |
| B2 | frontend | BUG-62 **+ BRD-AD09** | `App.tsx`, `AdminPanel.tsx`, `App.test.tsx`, admin routes |
| B3 | backend | BUG-51 | companions repo/routes — investigation-led |
| B4 | fullstack | BUG-52, 55, 56 **+ QUAL-02 (findings 1–2)** | city lookup path, trip search, filter tests |
| B5 | frontend | BUG-06, 37, 58 | `TripList/*`, `ShadingTab`, CarryForward test |
| B6 | fullstack | BUG-44, 57 **+ BRD-DP06 + BRD-IT10** | `ItemForm.tsx`, `ItemCard.tsx` |
| B7 | fullstack | BUG-50 | new `DELETE /api/trips/:id`, `TripDetail` header, `ConfirmDialog` |
| B8 | frontend | **BRD-IT0809** | item-list sort/filter UI |
| ~~B9~~ | backend | ~~**QUAL-03 + QUAL-11**~~ **DONE 2026-07-28, PR #292** | `test-db.ts` migration-driven schema; FK startup assertion |

**Conflict pairs — must be split across sub-waves:**

- B2 ↔ B5 — both reach into `Admin/` (`AdminPanel.tsx` vs `ShadingTab.tsx`)
- B6 ↔ B7 — both reach into `TripDetail/` (`ItemForm`/`ItemCard` vs `TripDetail.tsx`)
- B6 ↔ B8 — both touch item-list rendering

Suggested split — **sub-wave A:** B1, B2, B3, B6, B9 · **sub-wave B:** B4, B5, B7, B8.

**B9 is worth running first or early** regardless of sub-wave: it makes every other backend
brief's tests trustworthy, and it clears OP-15 prerequisite (a).

> **QUAL-11 added to B9, 2026-07-28 (PO).** The FK startup assertion from ADL-41 §7.2.1 —
> ~15 lines plus a test in `src/backend/db/index.ts`, no file overlap with any other brief.
> Rides along rather than dispatching separately. **Brief it as an assertion, not a setter:**
> issuing `PRAGMA foreign_keys=ON` at connect looks like a fix and guarantees nothing, because
> each statement is independently dispatched on the remote HTTP transport (ADL-41 §7.2).
> QUAL-11's other half — whether the remote Turso path enforces FKs — is **already answered**
> (staging returns `1`; ADL-41 §7.2 residual gap 2 is stamped VERIFIED) and is not brief scope.

> **B9 DONE 2026-07-28 (PR #292), but read this before relying on it.** B9 delivered both
> items and demonstrated drift detection rather than asserting it. **It does not make all
> backend tests trustworthy — only the repository layer.** The B9 agent found, and the COO
> re-counted, **15 further test files that never used `test-db.ts` at all** and hand-roll the
> same 21-table DDL inline: 13 under `routes/__tests__/`, 2 under `services/__tests__/`.
> Tracked as **QUAL-17**.
>
> **Consequence for the remaining Wave 1 backend briefs (B3, B4):** if a brief's verification
> rests on *route* tests, it is still verifying against a hand-maintained schema copy. Say so
> in those briefs. The risk is not theoretical — QUAL-03's fix immediately exposed 8 uses of
> an item status (`booked`) that has never been valid against `chk_items_status`, silently
> green for the life of that file because the hand-written DDL carried no CHECK constraint.

---

## 5. Wave 2 — post-scoping

| Item | Gated on |
|---|---|
| BUG-40 | S1 (OQ-05) |
| BUG-46 | S4 — may be *deleted* rather than fixed if BUG-47's redesign lands |
| BUG-53, UX-11 | S4 |
| BUG-41 + BUG-42 implementation | S2 — **3 briefs on its own** (migration, backend, frontend) |
| BRD-MB0102 | B6/S6 (consumes IT-10's directions links) |
| BUG-54 | S4 — stays parked unless the spec makes it free |
| OP-15 skills design pass | B9 (QUAL-03) |

**Parked, not scheduled:** BUG-63 (no reproduction — needs a captured network response),
BUG-43 (research spike, PO-flagged aspirational).

---

## 6. Sizing corrections (found by probing, 2026-07-26)

These override the naive read of the tracker notes.

1. **BUG-48 is a trap, not a one-line change.** `MapView.tsx:28` sets
   `REGION_ZOOM_THRESHOLD = 3`, but region shading pulls a **39 MB** `geo/regions.json`.
   Lowering the threshold makes that payload load *sooner and more often* — it would make
   the latency the PO reported **worse**. The real fix is the payload (simplification,
   tiling, per-country splitting). Hence S5. Separately, `MapView.tsx:6` documents
   `zoom >= 4` while the constant is `3` — stale-doc drift, fix in whichever PR touches it.
2. ~~**BUG-50 is fullstack.** There is no `router.delete` in `src/backend/routes/trips.ts` at
   all. New route + cascade semantics (trip_places, items, photos) → needs a BRD ID and
   success criteria before dispatch.~~ **CORRECTED 2026-07-27 (ADL-41 / PR #284) — the
   premise was false.** `tripsRouter.delete('/:id')` **does** exist
   (`src/backend/routes/trips.ts:429`), is `userId`-scoped, returns 403 on locked trips, and
   cascades; `tripRepository.delete` exists (`src/backend/repositories/trips.ts:195`) and
   `useDeleteTrip` is already wired into both `DesktopTripsLayout` and `MobileTripsLayout`
   for bulk delete. The original probe grepped for `router.delete` against a router actually
   named `tripsRouter`, and the COO propagated the result into BUG-50's tracker note without
   re-verifying it. **B7 is frontend-only and must be re-sized before dispatch** — the
   remaining gap is a per-trip delete affordance in the trip *detail* view, not a route.
   The BRD ID (TR-14, v3.8) and NR-12 non-foreclosure still stand and are unaffected.
3. **BUG-52 sizing unknown.** No server-side trip search was found anywhere; it is likely
   client-side title filtering. The brief needs a discovery step before it can carry an
   estimate.
4. **`ConfirmDialog.tsx` already exists** in `src/frontend/components/shared/` — BUG-40 and
   BUG-50 both reuse it. No new component.
5. **BUG-55 cannot be live-verified in the devcontainer.** Nominatim is firewall-blocked
   (ENV-01), so city → country/state auto-population has no live geocode path. The brief
   needs a stubbed verification route or the agent will report a false failure.

---

## 7. Why these features ride along

| Item | Batch | Rationale |
|---|---|---|
| BRD-DP06 | B6 | *Is* BUG-57. "Adding any item defaults to the trip's range" and "the first place inherits the trip's date range" are one code path. Separate briefs = the same defaulting logic written twice. |
| BRD-AD09 | B2 | ~~**Correctness dependency.** AD-09's owner-only deactivation is *not enforced on the backend today*.~~ **CORRECTED 2026-07-28 (issue #298 / PR #303) — the premise was false, and this line is where it originated.** `adminRouter.use(requireOwner)` (`src/backend/routes/admin.ts:105`) registers *before* the categories/activities CRUD sub-routers mount (`:232-233`), so every deactivation route was already owner-gated; `security.access-matrix.test.ts` already had passing non-owner-403 tests for PATCH/DELETE on both. The COO propagated this line into brief B2 as a "go enforce it" backend task without re-probing it — caught only because B2 was instructed to double-probe (3 probes, no backend code written). The **real** AD-09 gap is the inverse: category/activity *creation* is also behind `requireOwner`, which is more restrictive than AD-09's "any user can add custom entries" — scoped as ADL-28 Q5, untouched. B2's genuine scope was the frontend per-tab gating (BUG-62). |
| BRD-IT10 | B6 | Nullable URL column + `ItemForm` field + `ItemCard` display — identical surface to BUG-44. Needs S6 first. |
| QUAL-02 (1–2) | B4 | Its top finding is that filter tests seed 1 trip and assert `length=1`, so an inverted filter passes. B4 rewrites trip search/filter — BUG-52's fix is unverifiable under assertions that weak. Findings 3–4 stay backlog. |
| QUAL-03 | B9 | Untracked until 2026-07-26; clears OP-15 prerequisite (a) and de-risks every other backend brief. |
| WP-05 | free | Its single named example is DP-06 looking done because the reskin displayed it. Ships closed with DP-06. |
| BRD-IT0809 | B8 | **Backend already merged (PR #90); only the frontend was never dispatched.** Paid-for value stranded behind one UI brief. |

**Deliberately excluded** — no file overlap, genuinely separate phases: NR-09–13, PHASE-5,
FUTURE-01/02/03, BRD-PL05/06, BRD-LB01/02/03, BRD-FL04, UX-05 / BRD-PH03 (photos).

---

## 8. Gates to clear before Wave 1 dispatch

1. ~~**BRD bump.** BUG-50, BUG-57 and BUG-40 introduce behaviour with no BRD home. Per the BRD
   gate and success-criteria rules, that is **one** version bump covering all of Wave 1 — done
   once, not per brief.~~ **CLEARED 2026-07-27 — BRD v3.8.** TR-14 (delete a trip, from
   BUG-50), TR-15 (place removal prompts for item disposition, from BUG-40), IT-11 (item date
   defaults from the trip range, from BUG-57), each with success criteria. Tracked via the
   existing bug entries' `brdRefs`, not duplicate feature items.
2. ~~**Pre-assigned ADL numbers** for the Wave 0 Architects (§3).~~ **CLEARED 2026-07-27 —
   ADL-41 (S1), ADL-42 (S2), ADL-43 (S3), ADL-44 (S5), ADL-45 (S6)**, reserved as stubs in
   `jobs/architect/tech/20260307-architecture-decisions-log.md`. Each Architect **edits its own
   stub in place** rather than appending — five concurrent agents appending to the log's tail
   would conflict in every pairing; five rewriting separated blocks merge cleanly.
3. **Security checklist** in every brief that adds or modifies routes (B3, B4, B7) — auth
   middleware, `userId` scoping, FK `.notNull()`, per CLAUDE.md and OP-06 §2.
4. **`isolation: "worktree"`** on every dispatch (all of these do git work), and `npm install`
   inside each fresh worktree before anything needing `node_modules`.

---

## 8b. Wave 2 BRD gate — OWED, added 2026-07-27 after Wave 0 completed

Wave 0 is **complete (6/6 merged)**. Its specs handed back a second BRD gate, exactly like
Wave 1's. **This is the single blocking item before any Wave 2 implementation brief.** As
before it is **one** bump covering everything, not one per brief.

| From | New IDs needed | Notes |
|---|---|---|
| ADL-43 / S3 (BUG-45) | `FL-06`, `CR-03` | S3 suggested `FL-05` first, then self-corrected — BRD v3.9 had already claimed it mid-flight. Verify what is actually free before assigning |
| UX spec / S4 (BUG-53) | `DP-07`, `DP-08` | Full success-criteria text already drafted in the spec's §7 — lift it, don't rewrite it |
| UX spec / S4 (UX-11) | `TR-16` | ditto |

Also owed at the same time, and easy to miss because they aren't new IDs:

- **BUG-47** (activity auto-population) — S4 designed it as *suggestion-based*, modelled on
  IT-07's carry-forward pattern, deliberately not silent-write. Needs a BRD home or an
  explicit decision that it stays a spec-only idea.
- ~~**QUAL-09** must be resolved *before* PL-02/PL-03 are briefed — BRD IT-03 lists item status
  `Shortlisted`, which was never implemented. Either build it or amend the BRD; briefing the
  planning loop while its middle stage doesn't exist would produce an unbuildable brief.~~
  **CLEARED 2026-07-28 — BRD v3.11.** PO chose amend-the-BRD: `Shortlisted` is removed, the
  planning loop is two-stage (Consider → Confirmed). PL-02 and PL-03 are now briefable as
  written; neither needs a middle stage built first. No code change was required — the schema
  was already correct.
- **B7 (BUG-50) is frontend-only** — see §6.2's correction. Re-size before dispatch.

The Wave 1 gates above stay cleared; this does not reopen them. Wave 1 (§4) is dispatchable
today — only Wave 2 is gated on this bump.

## 9. Expected shape

**33 items → 6 scoping dispatches + 9 implementation briefs + 2 parked**, in roughly three
merge sessions and two UAT rounds.

## 10. Change log

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-26 | Initial plan. Approved by PO. Phase 4 closed in the same PR; the 21 dogfooding items re-phased 4 → 6. |

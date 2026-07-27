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
| B9 | backend | **QUAL-03** | `test-db.ts` migration-driven schema |

**Conflict pairs — must be split across sub-waves:**

- B2 ↔ B5 — both reach into `Admin/` (`AdminPanel.tsx` vs `ShadingTab.tsx`)
- B6 ↔ B7 — both reach into `TripDetail/` (`ItemForm`/`ItemCard` vs `TripDetail.tsx`)
- B6 ↔ B8 — both touch item-list rendering

Suggested split — **sub-wave A:** B1, B2, B3, B6, B9 · **sub-wave B:** B4, B5, B7, B8.

**B9 is worth running first or early** regardless of sub-wave: it makes every other backend
brief's tests trustworthy, and it clears OP-15 prerequisite (a).

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
2. **BUG-50 is fullstack.** There is no `router.delete` in `src/backend/routes/trips.ts` at
   all. New route + cascade semantics (trip_places, items, photos) → needs a BRD ID and
   success criteria before dispatch. **Must not foreclose NR-12** (Phase 2: archive rather
   than hard-delete for structured lists) — flag to Architect in S1.
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
| BRD-AD09 | B2 | **Correctness dependency.** AD-09's owner-only deactivation is *not enforced on the backend today*. BUG-62 rebuilds exactly that access model. Shipping BUG-62 alone yields frontend gating over an unenforced backend — the HC-04/BUG-26 shape this project has already been bitten by twice. |
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

## 9. Expected shape

**33 items → 6 scoping dispatches + 9 implementation briefs + 2 parked**, in roughly three
merge sessions and two UAT rounds.

## 10. Change log

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-26 | Initial plan. Approved by PO. Phase 4 closed in the same PR; the 21 dogfooding items re-phased 4 → 6. |

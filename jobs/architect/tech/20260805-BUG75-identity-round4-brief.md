# BUG-75 — City identity, Round-4 design brief (frame fixed; spike-gated)

> **STATUS: dispatch-ready, not yet dispatched.** Written 2026-08-05 after the PO resolved the
> requirements question (D-22). **Dispatch after the next `/clear` + restart.** This is an **Architect
> design brief**, worktree-isolated (it does git work). It is **spike-gated per OP-33** — it produces a
> verified design, not shipped code; the build brief comes *after* this clears and its OP-27 review passes.

## 1. The requirement — RESOLVED by the PO 2026-08-05 (D-22)

> **Distinct real-world places that share name + country + region may coexist in the catalogue as
> distinct cities. Only a *true same-place* repeat is a duplicate to merge/reuse.**

The PO's words: *"that was my original requirement and we specified it down to those three fields
accidentally."* GE-16's `(name, country, region)` duplicate rule — and the DB unique index
`uniq_cities_name_country_region_ci` that enforces it — was an **over-specification** of "genuine
duplicates only." Four distinct Newports exist in GB-ENG (same name, country, and region); today the
second one silently receives the first one's row and pin. That is the defect. This corrects GE-16's
duplicate clause — recorded as **spike-gated** in BRD v3.18 (§below), *not yet law*, because the
*mechanism* that decides "same real place" is still unverified.

## 2. The frame is FIXED — do NOT re-open these

This is Round **4**. Scope grew on rounds 1–3 and the COO correctly refused to auto-dispatch a fourth
round while the frame was unexamined (`feedback_question_the_frame_not_just_the_answer`). The D-22
conversation examined it and the PO settled it. That is what makes a bounded Round 4 legitimate now —
**not** a licence to re-litigate. Treat the following as settled:

- **Identity is CARRIED, not derived.** The identity of a place is supplied because the user picked a
  specific candidate row — known before the insert, never touched by the geocoder. This is Round 3's
  core; its OP-27 review certified it sound and it must not be re-litigated.
- **The coordinate-bucket (S0) is dead.** F1–F5 in the BUG-75 tracker note. Do not revive it.
- **A hash is inferior to a human-readable payload.** GE-15/GE-16 require candidates to be shown
  *distinguishably*; a hash cannot be rendered.
- **Leading payload candidate (verify, don't assume):** the geocoder's **locality string**.
  `nominatim-client.ts:121` already sends `addressdetails=1`; `:165` already parses `display_name`
  into `NominatimCandidate.displayName` (e.g. *"Newport, Isle of Wight, England, United Kingdom"*) —
  and **nothing persists it**. It is renderable and needs no dataset (Round-3 review finding R4). Its
  *availability* is verified; its *sufficiency and stability for identity* are what this spike tests.

## 3. Load-bearing premises to VERIFY (OP-33 verify-checklist)

Each must come back marked **verified / unverified**, with the probe that settled it. A premise that
fails takes its part of the design with it — that is the spike working.

| # | Premise | Status | Probe that would settle it |
|---|---|---|---|
| **P1** | The carried locality payload (`display_name` / its `address` components) is **sufficient and stable** to (a) distinguish the four Newports, (b) be persisted and **re-matched** on a later independent lookup of the same place, (c) render distinguishably in both the candidate picker and the saved-place list. | **UNVERIFIED** | Two independent probes: (i) capture the actual `display_name`/`address` the client receives for the four GB Newports via the **allowlisted** Nominatim path — honour ADL-49 §4.3 (the in-process limiter does NOT span processes; go through the capture script, ≤1 req/s, identifying UA); (ii) read Nominatim's documented stability guarantees for `display_name`/`address` vs `osm_type`+`osm_id`. A single probe is not enough (negative-findings rule). |
| **P2** | **The corner that killed every prior design.** What is a city's identity when the lookup has **not happened yet** — offline / pending (GE-12)? Two users each create a pending *"Newport, GB, England"* with no locality payload: same city or two? The design MUST state the **pending → resolved** identity transition, including what happens when a pending row later resolves and discovers it is a twin of an existing resolved row. | **UNVERIFIED** | Trace `findOrUpgradeCity` (`cities.ts:165`) and the pending→resolved UPDATE path end to end; **state** the behaviour, do not assume. This is the C1/C2 question the coordinate bucket could not answer. |
| **P3** | The **disambiguation trigger** is fixed so the user is actually *asked* to choose among the four Newports (which is how the correct identity gets carried in the first place). `classifyCandidates` (`geocoding.service.ts:138-156`) currently counts **distinct regions**, not distinct **places** — when the selected region matches ≥1 candidate it returns `matches[0]`, an arbitrary pick. Half A (identity) is inert without Half B (ask-to-choose). | **Known defect** | Confirmed by direct read this session. The design must specify counting distinct **places within a region**, not regions, and carrying the chosen candidate's identity through to create. |

## 4. Carry-forward fixes (from the Round-3 review — must be incorporated, not rediscovered)

- **R1 (blocker):** delete find-or-create **step 0d / always insert.** Step 0d adopts a pending row —
  created precisely when the geocoder *declined to choose* (D14 ambiguous) — and stamps it with one
  specific place's ref and coordinates, pinning e.g. a Shropshire trip on the Isle of Wight. That is a
  **wrong-town mis-pin reachable with one user, no concurrency.** Always insert instead.
- **R2 (blocker):** sequencing. Any step reading `gazetteer_cities` depends on ADL-48 S2, which **does
  not exist**. The geocoder-path fix here must **not** depend on S2/S3 — that is the whole point of the
  locality-string route (no dataset).

## 5. Success criteria for THIS design (definition of done for the spike)

1. P1 and P2 each returned **verified/unverified** with probe evidence; P2 answered explicitly.
2. A **go/no-go** on the carried-locality mechanism, with the pending-state identity stated — not deferred.
3. GE-16's duplicate/identity rule restated so its success criterion becomes **satisfiable and
   testable**: an automated test that four Newports coexist AND a true same-place repeat merges/reuses.
4. The **migration shape** stated (the unique index changes — expand/contract per ADL-47; note the
   pending-row NULL hazard that reopened BUG-33 in F1).
5. R1 and R2 incorporated.
6. **OP-27 fresh-eyes review** by a second, freshly-dispatched Architect before it is trusted or the
   build brief is written.

## 6. Explicitly OUT of scope

Re-litigating carried-vs-derived · reviving the coordinate bucket · adding a gazetteer/dataset
dependency to the geocoder-path fix · auto-proceeding to a build brief without P1/P2 cleared and the
OP-27 review passed.

## 7. Sequencing for the next COO

1. Dispatch this as a bounded Architect design brief (`isolation: "worktree"`, `npm install` in the
   worktree first).
2. OP-27 fresh-eyes review (second fresh Architect).
3. **Only if** the premises clear and the review passes: the build brief for BUG-75 (identity + the
   `classifyCandidates` fix + the migration) **and** the full GE-16 amendment with the now-satisfiable
   success criterion (lifts the v3.18 spike-gate). BUG-75 stays the tracker home throughout.

**Tracker:** BUG-75 (this brief's home). **Requirement:** GE-16 (amended v3.18, spike-gated).
**Resolves:** open-dialogue D-22.

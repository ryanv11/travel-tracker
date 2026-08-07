# Architect completion report — BUG-75 picker-precedence + UX-12 entry-point design

**From:** Architect · **Date:** 2026-08-06
**Branch:** `feat/bug75-pickerprecedence-design` · **PR:** #411 (docs-only)
**Deliverable:** `jobs/architect/tech/20260806-BUG75-pickerprecedence-and-ux12-entry.md`
**Tracker:** BUG-75 (P1), UX-12 (P1) · **BRD:** GE-16 (§5.2)
**Status:** DESIGN ONLY. Gated on an **OP-27 fresh-eyes review** before any build brief. Design→build
transition — returns to **you + PO for a build check-in**; I did not (and am not authorized to) dispatch the
build.

---

## The decision I reached on the D14/Springfield question, and the evidence

**Decision: adopt Proposal #1 (refined) — the shared `CityPicker` is PRIMARY on positive identity evidence
(≥2 distinct `osm_id`), checked BEFORE the region branch.** A single region-qualified `display_name` pick
disambiguates across AND within regions, and it **subsumes** the D14 region `<select>` including the
many-region Springfield case. **Proposal #2 (two-step) rejected as primary; #3 (pending stopgap) rejected.**

**The decisive evidence is structural, not a preference:** Springfield and Newport are different ambiguity
*shapes*.
- **Springfield's ambiguity is entirely BETWEEN regions** — ADL-48's own analysis (verified over all rows by
  its OP-27 reviewer): "21 rows, 21 distinct region groups." One Springfield per state; no region holds two.
  A region cut is *sufficient*.
- **Newport's ambiguity is BOTH between AND within regions** — captured live Nominatim (v2 P1a + your own
  probe): 2 GB-ENG + 2 GB-WLS among the settlement survivors (up to 4 distinct England Newports). A region
  holds ≥2 distinct Newports; a region cut is *insufficient*.

The current region-**first** code can't tell these apart before committing — it fires the region selector for
both (both span >1 region), and for Newport that pre-empts the only control that could separate the
within-region twins → silent wrong pin. That is the bug.

**Does the flat `display_name` picker keep Springfield usable?** Yes, on both axes I could ground:
- *Legibility* — `display_name` is region-qualified (verified verbatim in the v3 §B1 `/lookup` Newport
  capture; Springfield rows are structurally identical: `"Springfield, <County>, <State>, United States"`).
- *List length* — discovery `limit=40`, settlement-filtered, country-filtered → up to ~20 US rows, same
  order of magnitude as D14's ~20-state `<select>`, each row carrying more disambiguating info. Marginally
  more scanning than a native select's type-to-jump, but the same unbounded-list pattern the city search
  already uses.

Rejecting #2 comes down to this: it buys a marginally shorter Springfield list by imposing a mandatory extra
region step on the **headline bug case** (Newport), whose region-qualified picker rows make that step
redundant — optimising the un-broken case at the expense of the broken one, which is the exact region-first
mistake that caused the bug. I retained #2's insight (region as a legibility aid) as a **deferred,
non-blocking** in-picker grouping enhancement if UAT shows the long list hurts — explicitly out of MVP.

## Which proposal, and the composition

The code change is minimal (~3 lines: swap the first two branches in `handleOpenNewCityForm`), which is why
it needed an Architect pass rather than a build brief — it **supersedes D14 (ADL-46 §4.3.2) region-first
precedence in part**. The region `<select>` is NOT deleted; it becomes the **no-`osm_id` fallback** (legacy /
partial responses / the ADL-46 F1/F2 parity shape), unchanged. Supersession banner is written in §7 for the
**build PR** to stamp onto ADL-46 (I did not edit ADL-46 — different decision's canonical home, no wholesale
rewrite of a shared record).

**Drift-prevention (your explicit requirement that the two flows can't drift):** extract the precedence
*decision* into a **pure function** `decideCityDisambiguation(candidates)` — one source of truth, consumed by
both AddPlace and the new UX-12 `ChangeCityModal` via a shared hook. It's also the ideal ATDD target.

## UX-12 fold-in

Standing "Change city" control + one "Location not confirmed" badge on `PlaceSection` (UX spec §12 MVP,
`locked` hue, **zero new hues**), reusing the D11 re-point PATCH (**verified present on `main`**: schema
`places.schemas.ts:36` + route `places.ts:162-202`) and the same shared precedence unit. Everything else in
UX spec §11 (bucket split, one-tap picker, map counter, Dismiss) stays deferred per §12.

## ATDD-first marking + reasoning

**Two sequenced briefs, both `ATDD-first: yes` (OP-35).** Brief A (precedence extraction + reorder, fixes the
headline), Brief B (UX-12 entry point, reuse-only). Reasoning: identity auto-population where a wrong result
is silent-and-plausible (wrong pin), precisely specifiable up front (a pure decision table), and it goes
through the Architect — the OP-35 frontend exclusion is the opposite on every axis. **Mock-fidelity is
called out as mandatory:** the shipped all-green suite hid this very defect because the four-Newport fixture
was same-region (omitted Wales); the ATDD lookup double must return `osm_id`-bearing multi-region candidates
or it specifies nothing (QUAL-22). Sequencing: A before B so B is reuse-only.

## Open risk the fresh-eyes reviewer must stress-test

1. **The Springfield subsumption is the load-bearing judgment call and rests on captured, not
   freshly-probed, evidence** (see below). The specific thing to attack: is a ~20-row flat picker genuinely
   acceptable, or should in-picker region grouping be pulled INTO the MVP? That changes the picker's MVP shape
   if the reviewer disagrees.
2. The §6.4 completeness claim (no case where the region `<select>` *should* win over positive `osm_id`
   evidence) — an absence claim about counterexamples; confirm independently.
3. The extraction refactors a heavily regression-tested file (273 green frontend tests, 6 BUG suites) — the
   ATDD tests must pin the preserved behaviours (BUG-71/78/79, F1/F2 parity, incomplete-seed) before the
   reorder. Extraction + reorder, NOT a rewrite (no-wholesale-rewrite rule).

## What I could NOT verify

- **Live Nominatim was unreachable this session** — `curl` to nominatim returned connection-refused (exit 7,
  port 443). Second probe: the allowlist config IS present (`.devcontainer/init-firewall.sh:213`) but the
  runtime refuses — the documented "firewall regressed, needs container rebuild" state (same
  two-hosts-fail-differently signature as the v1 round). So the **exact Springfield `display_name` strings
  and the exact live discovery-40 US Springfield count are UNVERIFIED** (marked as such in §5.2 with the
  probe + blind spot). I grounded the analysis on the captured Newport `/lookup` rows, the v2 P1a capture,
  your recorded probe, and ADL-48. **The build's ATDD suite must include a real Springfield fixture captured
  post-rebuild**, validated by the mock-fidelity gate.

## CI / process notes

- PR #411 CI: E2E, Frontend, Semgrep passed; the remaining jobs are **queued behind a GitHub Actions runner
  backlog (~30+ min)**, not failing — a docs-only `.md` change can't fail lint/type/test on content. A
  background monitor is polling for terminal green; if anything genuinely fails I'll be notified. Flagging in
  case the queue is still draining when you pick this up.
- One process note for you: the negative-findings warn-hook may fire on my doc (it quotes absence-language
  while *applying* the two-probe rule) — each such instance carries its second probe or an explicit
  UNVERIFIED marker, so it's a known false-positive, not an unmarked absence.

## Files

- Design doc: `jobs/architect/tech/20260806-BUG75-pickerprecedence-and-ux12-entry.md`
- PR: https://github.com/ryanv11/travel-tracker/pull/411

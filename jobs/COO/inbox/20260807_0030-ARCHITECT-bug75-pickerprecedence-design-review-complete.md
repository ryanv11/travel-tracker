# OP-27 fresh-eyes review complete — BUG-75 picker-precedence + UX-12 design

**From:** Architect (fresh-eyes reviewer, 2nd context) · **Date:** 2026-08-06
**Reviewed:** `jobs/architect/tech/20260806-BUG75-pickerprecedence-and-ux12-entry.md` (PR #411)
**Deliverable:** `jobs/architect/tech/20260806-BUG75-pickerprecedence-design-review.md`
**PR:** #412 (docs-only) · **Tracker:** BUG-75 (P1), UX-12 (P1) · GE-16 (§5.2)

---

## VERDICT: SAFE TO BUILD WITH CORRECTIONS — do NOT restart.

**Counts: 2 MAJOR · 1 build-blocker (AC-scoped) · 4 MINOR. Zero blocking-to-the-design.**

Buildable as written **once two MAJOR items are resolved in the build briefs before dispatch** and one
acceptance scenario is gated on a real fixture. None require a redesign. I attacked the two load-bearing
judgment calls the author flagged (flat Springfield picker; captured-not-live evidence) and **both held**.

## What must change first (pre-dispatch)

1. **MAJOR-1 — drift-prevention is under-scoped.** The design shares the precedence *decision*
   (`decideCityDisambiguation`) but leaves the **identity-carry mapping** (`handleSelectPickerCandidate`,
   `AddPlaceFlow.tsx:295-321`) as "reused unchanged" — impossible, because it is a component-local function a
   separate `ChangeCityModal` cannot reuse without extraction. That function is where `osm_id`/`display_name`
   forwarding + `region_id` derivation live — a drift there re-introduces the exact BUG-75 identity defect.
   UX spec §12.1 (which the design adopts) already mandates extracting the *search step*, so the design
   under-scopes its own source. **Fix:** the shared unit must own candidate→`POST /api/cities` find-or-create
   and hand each caller a resolved `city_id`; add an AC that the identity carry exists exactly once.
2. **MAJOR-2 — scope disposition.** The design says it "adopts UX §12 MVP" but is silent on §12.2 items 3
   (§3.2 *never silently auto-commit a country* — still unimplemented: country is auto-set at
   `AddPlaceFlow.tsx:360`, only region is tentative) and 4 (§3.4 creation messaging), which §12 marks
   **non-deferred**. No separate tracker home exists for them. **Fix:** fold into Brief B or record a
   justified exclusion with a tracker home — a COO/UX reconciliation, not a design-internal fix.
3. **BUILD-BLOCKER (AC-scoped) — Springfield fixture.** AC-3 (Springfield many-region) must be authored from
   a **real captured Nominatim response**, not an invented one (else it is the QUAL-22 vacuous-pass the design
   forbids). AC-1 (spanning Newport) + AC-2 (same-region twins) are grounded in already-captured real Newport
   `osm_id`s and suffice as the reorder's red tests until the Springfield capture lands post-rebuild.

## MINORs (fix in-brief, not gating)

- Pure-fn signature `decideCityDisambiguation(candidatesForCountry)` omits `regionIso` — verified a separate
  top-level return of `lookupCityCountry` (`useCities.ts:87-101`), required by `suggested` mode. Widen it.
- Promote the ADL-46 §4.3.2 supersession stamp from prose to a Brief A acceptance criterion (lifecycle rule).
- "~20 rows" Springfield ceiling is sourced from ADL-48's gazetteer dedup, not the Nominatim discovery
  lookup — provenance-mismatched; re-confirm against the real captured count.
- Record the Springfield type-to-jump → linear-scan regression as a UAT watch item (the trigger for the
  deferred in-picker grouping).

## What I verified as CORRECT (do not re-litigate)

- **The defect reproduces** on `main`: `AddPlaceFlow.tsx:395-409`, region branch first + mutually exclusive.
- **The shipped picker test hid it** via a same-region fixture: `city-picker.test.tsx:95-116` is both GB-ENG.
- **Newport is between-AND-within-region; Springfield is between-only** — tracker + ADL-48, independent of
  live Nominatim.
- **D11 re-point present on `main` and already test-backed** (strongest-verified claim): `places.schemas.ts:30-36`
  + `places.ts:155-208` + `repositories/places.ts:228-263` + passing `place-repoint.test.ts:83-159` (items +
  activity tags survive). AC-10 is pre-covered. No backend change for UX-12.
- **D14 supersession scoping is sound**; leaving ADL-46 unstamped-until-build is lifecycle-consistent (code
  still matches D14 on `main`). Only gap is enforcement → MINOR.
- **ATDD-first: yes on both is correct** against OP-35; mock-fidelity requirement is real; **AC-1 is genuinely
  red on the current `main` order** (region-first returns `'region'`, AC-1 asserts `'picker'`).
- **§6.4 completeness holds on correctness** — distinct `osm_id` is strictly more granular than region; the
  region `<select>` never *should* win over positive identity evidence. The only cost is ergonomic (Target 1).

## Independent rulings on the two flagged targets

- **Target 1 (flat vs grouped Springfield picker): CONCUR with the author.** Flat is functional and
  correct-by-GE-16 (nothing silently collapses); grouping is correctly deferred with a concrete UAT trigger.
  One MINOR caveat: Springfield specifically degrades from `<select>` type-to-jump to a linear scan of long
  `display_name`s (discriminating state token sits mid-string) — watch it, don't block on it.
- **Target 2 (captured-analogy + UNVERIFIED): acceptable for the DESIGN, blocker for AC-3 only.** The
  decision rests on ADL-48's dataset analysis (independent of live Nominatim) + the verified Newport
  `display_name` shape, so the UNVERIFIED marker is honest and sufficient for the doc. I re-ran the live probe
  myself: `curl nominatim…/status` → `(7) connection refused, port 443` — unreachable for me too. **Blind
  spot:** single curl to one host; I did not independently re-verify the allowlist (the author's 2nd probe),
  so my corroboration is one probe and the "firewall regressed" diagnosis is inherited, not re-established.

## Could not verify (with blind spots)

- **Live Nominatim** (Springfield strings + true discovery-40 count) — unreachable for me (single-probe
  corroboration of the author's connection-refused; allowlist not independently re-checked by me).
- **§3.2 "country still silently auto-committed"** — established by grep + read of the one auto-set site
  (`AddPlaceFlow.tsx:360`); I did not exhaustively trace every country-set path, so treat as
  strongly-indicated, not two-probe-established. The scope-disposition point (MAJOR-2) stands regardless.

## CI / process

PR #412 is docs-only (one new `.md`). Checks registered after the same GitHub runner backlog the author hit on
#411; all pending, none failed at last check. `ci-wait.sh` is polling for terminal green in the background — I
will not file this as done until it is green. If the queue is still draining when you pick this up, the
content cannot fail lint/type/test (single markdown file).

## Files
- Review: `jobs/architect/tech/20260806-BUG75-pickerprecedence-design-review.md`
- PR: https://github.com/ryanv11/travel-tracker/pull/412

# Secondary audit — design-reflection follow-up (2026-08-10)

**Tracker:** n/a (audit deliverable — COO triages findings into tracker entries afterwards)
**BRD:** n/a · **Class (OP-32):** gap · **Author:** Architect (fresh eyes, OP-27 posture)
**Subject:** what remains of `jobs/COO/20260808-design-reflection.md` after R1/R2/R4/R5a shipped —
items (a) R3, (b) R5b geocode dual-identity, (c) BUG-85/GE-19, (d) debt #3 transactions,
(e) debt #5 serialization — plus verdicts on the COO's five §4 claims.

> Every negative claim below carries two probes that fail differently, or an explicit
> `UNVERIFIED` marker. Probe commands are stated literally where the finding turns on them —
> this audit's headline finding is precisely a probe that was stated but not run as stated.

---

## 0. Summary table

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| A1 | **(a) R3 status** | **The COO's premise is wrong: R3 did not vanish — it substantially SHIPPED 2026-08-09** (issue #474, PRs #475/#476: CLAUDE.md 507→390, pre-dispatch rules homed in `/coo-dispatch`, `atdd-first-guard.sh` removed). What remains is a bounded residual: a missing tracker entry, the deferred line-budget/prune-cadence decision, and three minor prose demotions. Do the residual (§2.1); do **not** re-run R3 as originally framed | High |
| A2 | **(b) R5b geocode dual-identity** | **Diminished and re-scoped.** The seam is real (claim 3 confirmed — `cityIdentityService` exists, unit-tested), but R5b's target shrank before the reflection was even written: migration 0017 (2026-08-06) already replaced the name-based identity index; the name path is already ordered as fallback-only in the POST handler. **Fold the residual consolidation decision into the GE-19 ADL** rather than running R5b standalone | High |
| A3 | **(c) BUG-85 / GE-19** | **Still real, unchanged, and now the top item.** BRD-approved (v3.20), PO-felt, Architect-gated, nothing upstream blocks it. Schema still has exactly three geocode states; the client queue still only clears on resolved/404. Dispatch its ADL next — and let it absorb the R5b assessment (same subsystem, same lifecycle) | High |
| A4 | **(d) Debt #3 transactions** | **Real but materially narrower than framed.** The `:memory:` limitation is live (re-probed today), but `db.transaction()` already runs in production (`items.service.ts`, since PR #64) and `db.batch()` is atomic (probed — failed batch rolls back). The true residual is the items base+extension write pair (BUG-95 is its concrete instance). Spike the file-backed test client, then fix items atomicity + BUG-95 in one brief | High |
| A5 | **(e) Debt #5 serialization** | **Still real, essentially untouched, cheaper after R1.** `trips.ts` still hand-maps the place shape two ways (`:85`, `:244`); serializers exist for 4 entities but only inside their route files. Small mechanical brief; not urgent | High |
| A6 | Ranked order | **GE-19 ADL (absorbing R5b assessment) → R3 residual (bookkeeping + canary check) → debt #3 spike+fix → debt #5 serializer brief.** Deciding dimensions in §4 | High |
| A7 | §4 claim verdicts | **Claims 1 and 2 OVERTURNED** (R3 shipped; the stated probes are falsified by direct hits in two of the three stated probe targets). Claim 3 confirmed with a re-framing. Claim 4 half-right (true for #5; #3 was reshaped and produced BUG-95). Claim 5: R1 changed the calculus for #3 and #5 less than claimed — details in §5 | High |
| A8 | New findings the reflection missed | (i) The reflection's own §1 facts were already stale at authoring (0017 pre-dated it); (ii) append-only records are never re-summarized — the consolidation lens applied to the project's *own records*; (iii) CLAUDE.md regrew 390→408 in one day — evidence a one-off prune without cadence just re-accretes; (iv) `geocoding.service.ts` (554 LOC) is now the largest backend file and GE-19 will grow it | Medium–High |

---

## 1. Verdict per item

### (a) R3 — governance consolidation: **the premise is wrong; R3 shipped**

**Evidence (positive, self-verifying):**
- GitHub issue **#474** — `chore(R3): governance prune — home pre-dispatch rules in /coo-dispatch,
  delete duplicated rationale from CLAUDE.md` — CLOSED. Body cites
  `jobs/COO/20260808-design-reflection.md §3 R3` by name.
- **PR #475** (merged, commit `96ebbb2`): CLAUDE.md **507 → 390 lines, no rule lost**; pre-dispatch
  COO-facing rules (OP-32 classify, BRD gate, success criteria, OP-06, OP-35) relocated to the
  `/coo-dispatch` skill as their single canonical home; war-stories deleted from the ambient rules
  that stayed.
- **PR #476** (merged, commit `bd147c4`): `atdd-first-guard.sh` deleted as subsumed by the OP-39
  gate; `negative-findings-guard.sh` **probed and deliberately kept** (correctly — it covers
  channels the gate never sees).
- Session-close commit `d2a9833` on main says it in so many words:
  *"design-reflection governance thread shipped (R2/**R3**/R5a)"*.
- `.claude/skills/coo-dispatch/SKILL.md:117` carries a standing section titled
  **"Canonical home (R3, design-reflection)"**.

**What genuinely remains of R3** (the residual, not a re-run):
1. **No tracker entry exists** — this half of the COO's claim is true. Two probes that fail
   differently: (i) `grep 'design-reflection R3' _project/tracker.json` → 0 hits, vs 6 for
   R1/R2/R4/R5; (ii) `grep -c '#474\|#475\|#476'` → 1 hit, and that one is OP-35's *note* about the
   hook removal, not an entry owning the prune. R3 is the only reflection recommendation that
   shipped without a tracker home — and #474 is a GitHub issue with no tracker cross-reference,
   which the issue↔tracker rule exists to prevent.
2. **The line-budget / prune-cadence decision is deferred and floating.** #475 explicitly deferred
   it ("recommend folding a ~400-line soft budget into R2/D-29 — a budget without an enforcement
   cadence just rots") — and that fold **never happened**: `scripts/drift-canary.sh` has no
   line-count or budget check (probes: grep the script for `line|budget|CLAUDE` → only unrelated
   hits; read of the script's check list A–E), and OP-40's notes never mention it. Meanwhile
   CLAUDE.md regrew **390 → 408** in the single day since the prune.
3. **Three minor items from R3's original list were not done:** merge OP-19+20, collapse OP-26→29,
   demote the protected-branch prose. Assessed in §6 — most of their value evaporated when the
   prose prune landed; recommend doing one, dropping two.

**Verdict: still real only as a bounded residual (§2.1, §6).** The consolidation *pass* the COO
believed was never actioned is the one recommendation that shipped *first*.

### (b) R5b — geocode dual-identity consolidation: **diminished; fold into GE-19**

**The seam is real (claim 3 confirmed).** `src/backend/services/cityIdentityService.ts` exists,
holds `findOrUpgradeCity`, `createOrReuseCarriedCity`, and `insertCityOrReuse` verbatim, routes all
DB access through `citiesRepository` (header: "this module holds no `getDb()`"), and has direct unit
tests (`services/__tests__/cityIdentityService.test.ts`). That is exactly the seam R5b was sequenced
behind.

**But the target has shrunk — and had already shrunk when the reflection was written.** The
reflection's framing was "two parallel identity models… the schema carries **both** unique indexes."
Verified against schema + migration:
- Migration `0017_bug75_identity_switch.sql` (merged 2026-08-06 in PR #409 — **two days before the
  reflection**) *replaced* the unconditional name-based identity index
  (`uniq_cities_name_country_region_ci`) with two **partial** indexes: `uniq_cities_osm_ref`
  (identity for rows carrying an OSM ref) and `uniq_cities_pending_per_creator` (a containment/dedup
  guard on *pending* rows only — not a competing identity key for resolved rows).
- The POST handler already orders the models: OSM-carried branch when the pick has an `osm_id`,
  name-based `findOrUpgradeCity` only when it does not (`routes/cities.ts:134-153`; the B2 comment in
  `createOrReuseCarriedCity` states the fallback rule explicitly). The frontend's single mapping
  point (`buildCreateCityDataFromCandidate.ts`) forwards the OSM identity whenever the candidate has
  one.

So the end-state R5b proposed — *OSM-ref-as-identity with name-only as a labelled fallback* — is
**already the de-facto architecture**. What remains is not a consolidation of two peer models but a
narrower question: **is the name-fallback's three-step algebra (wildcard upgrade, reverse
single-match, D14 ambiguity) still the right shape once GE-19 redefines the status lifecycle it
manipulates?** `findOrUpgradeCity` resets retry budgets and re-fires resolution — exactly the
machinery GE-19's terminal-state/re-open design must touch.

**Verdict: diminished / re-scoped.** Running R5b standalone now would re-open a churned subsystem
twice (once for consolidation, once for GE-19's lifecycle ADL) — the same seam, two passes, which is
the pattern the reflection itself warned against. **Fold the consolidation assessment into the GE-19
ADL as an explicit decision** ("does the lifecycle model require simplifying the name-fallback
algebra, and if so how"), with consolidation implemented only if that ADL finds it load-bearing.

### (c) BUG-85 / GE-19 — the unmodeled retry-exhausted state: **still real, unchanged, now #1**

- Probe 1 (schema): `chk_cities_geocode_status` still admits exactly
  `('pending','resolved','unresolvable')` — no terminal retry-exhausted state exists.
- Probe 2 (server): `geocoding.service.ts:536` still selects
  `WHERE geocode_status='pending' AND geocode_attempts < GEOCODE_ATTEMPT_CAP` — a capped row is
  silently never re-selected.
- Probe 3 (client): `geocodeRetryQueue.ts:22-24` still removes an entry only on `resolved` or a 404 —
  a capped-pending city badges forever.
- Tracker: BUG-85 `pending`, owner architect, P2. BRD GE-19 (v3.20) is approved, explicitly
  Architect-gated ("the exact status-lifecycle model is an Architect ADL decision") and ATDD-first.

**Verdict: fully real, framing holds verbatim.** It is the only remaining item that is
user-visible, PO-felt (surfaced by the PO on their own account), and BRD-approved. Nothing upstream
blocks it — QUAL-43's completion removed the last sequencing reason to wait. This is the next
Architect dispatch.

### (d) Debt #3 — transactions: **real, but the original framing overstates it three ways**

The core premise **is** live — re-probed today, not inherited: a scratch script against
`@libsql/client ^0.14.0` `:memory:` + drizzle confirms `db.transaction()` itself succeeds but the
**next query on the same client throws** (matches the documented finding in
`repositories/trips.ts:287-289`). The test double genuinely constrains production patterns. But:

1. **"No transactions" is false and was false on 2026-08-08.** `items.service.ts:116`
   (`executeCarryForward`) has run `db.transaction()` in production since PR #64 (BUG-15/16). It
   survives the `:memory:` suites only by accident of shape: the transaction is the last DB touch in
   the request, and every test builds a fresh client in `beforeEach` —
   `qa-backend-fixes.test.ts` exercises the successful 201 path and passes (re-run today, 16/16).
   That is a fragile, undocumented constraint, which *strengthens* the case for fixing the test
   client — but the claim to fix is "transactions are unusable except in one accidental shape," not
   "transactions are avoided everywhere."
2. **The multi-step paths the reflection named are already atomic.** `db.batch()` executes as an
   implicit transaction — probed today: a batch whose second statement violates a unique constraint
   rolls back its first statement. The trips association merge (`repositories/trips.ts:324`) and the
   places path (`repositories/places.ts:235`) therefore already have atomicity; the cities
   find-or-create's catch-unique-violation discipline is deliberately and *soundly* non-transactional
   (a single INSERT is atomic w.r.t. the unique index).
3. **The genuinely non-atomic residual is narrow and named:** `itemRepository.create`
   (base insert at `items.ts:148`, then a separate `insertExtension` — a failure strands an orphan
   base item) and `itemRepository.update`'s unconditional extension write — which is **BUG-95**
   (pending, P3, found by Stage 4 and correctly not absorbed). Today's refactor did not change
   atomicity (ADL-53 D8 honoured — verified: the avoidance comments moved verbatim into
   `cityIdentityService.ts` and `repositories/cities.ts:279`) but it *did* relocate the code and
   surface BUG-95, so "untouched" is not quite the right word either.

**Verdict: still real, re-framed.** The item is not "adopt transactions everywhere" — it is:
**(i) spike the file-backed libSQL test client** (the reflection's own proposed fix — note its
premise "a file-backed client honours transactions" is itself **UNVERIFIED**; probe run: none — this
is exactly an OP-33 spike-gate case), then **(ii) wrap the items base+extension pair and fix BUG-95
in the same brief**, ATDD-first. Low urgency: the residual surface is one repository.

### (e) Debt #5 — hand-mapped serialization: **still real, untouched, cheaper than before**

- `serializeCity` now covers all six cities response sites (`routes/cities.ts:147-266`) — within its
  own file, this one is done.
- Per-entity serializers exist for companions, categories, cities, activities — but each is a
  private function inside its route file; trips, places, items have none.
- The reflection's exact example is still live: `routes/trips.ts` hand-maps the place shape **two
  different ways** at `:85` and `:244`.
- Today's Stage work did not touch response mapping (probe 1: grep for serialize helpers — only the
  four route-local ones exist, none in repositories/services; probe 2: read of the trips handlers).

**Verdict: fully real, unchanged in substance — but R1 lowered its cost.** Repositories now return
canonical typed rows at a single seam, so "one serializer per entity, every handler routed through
it" is a mechanical extraction with contract tests as the net. The claim that R1 "partially
discharged" #5 was optimistic — R1 built the floor under it, discharged none of it.

---

## 2. Re-framings (question the frame)

### 2.1 R3 is not "a pass to run" — it is a *standing function* plus 30 minutes of bookkeeping
The original R3 framed consolidation as a pass (an event). The prune happened; CLAUDE.md regrew 18
lines in a day; the corpus now stands at 408 lines / 40 OP rules / 9 hooks. The durable question is
whether pruning is **institutionalized as a cadence** — and the project already built the natural
home for that (OP-40's drift machinery). Re-framed R3 residual: register what shipped, wire the
recurrence, stop treating consolidation as a special event. Concrete proposal in §6.

### 2.2 R5b's consolidation target no longer exists as described
"Two parallel identity models with both unique indexes" was already stale at authoring (0017 landed
2026-08-06). The honest current statement: **one primary identity model (OSM-ref) with a
deliberately-retained name-based fallback whose internal algebra is complex and about to be
disturbed by GE-19.** That reframe changes the right vehicle from "standalone consolidation brief"
to "a decision inside the GE-19 ADL."

### 2.3 Debt #3's frame inverts: not "we lack transactions" but "the test client dictates *shape*"
Production atomicity mostly exists (batch, catch-violation, one real transaction). What the
`:memory:` double actually forbids is *freely choosing* `db.transaction()` — forcing every author
into workarounds or accidental-shape usage. QUAL-22-inverted remains the right lens; the fix is the
test client, and the items extension writes are the only production code waiting on it.

---

## 3. What the reflection missed entirely

1. **Its own §1 facts had already aged at authoring.** The "both unique indexes" claim was two days
   stale when written (0017). Same failure class the project polices everywhere else: a premise
   inherited without a probe of the branch it describes. A reflection is a gate artifact too —
   OP-33's spike-gate discipline should apply to a reflection's load-bearing facts.
2. **Append-only records are never re-summarized — the consolidation blind spot applied to the
   project's own records.** QUAL-43's tracker note is now ~9KB of sedimentary session history;
   OP-40's own deep-audit dogfood independently found "drift concentrates in append-only records
   never re-summarized" — and no mechanism exists (probes: OP-40's note names the finding but its
   fixes are canary checks, none summarize; no skill/hook performs compaction — `UNVERIFIED` beyond
   those two probes for other mechanisms). Recommend: on closing a tracker item, compress its note to
   outcome + pointers (the history lives in git); a candidate `/coo-merge-and-close` step.
3. **CLAUDE.md regrowth rate is observable and fast** (390→408 in a day, all of it legitimate:
   OP-39/OP-40 pointers, frameworks 31/32 references). This is direct evidence for §2.1's cadence
   framing — a budget check with no cadence, or a cadence with no check, both fail.
4. **`geocoding.service.ts` (554 LOC) is now the largest backend file** and the GE-19 lifecycle work
   lands squarely in it. Not actionable today; the GE-19 ADL should state whether the status
   lifecycle gets its own module rather than growing this one (the cities god-route lesson, one door
   over).

---

## 4. Ranked recommendation

| Rank | Item | Vehicle | ATDD-first (OP-35) | Deciding dimension for the PO |
|---|---|---|---|---|
| 1 | **GE-19 / BUG-85** — status-lifecycle ADL, **absorbing the R5b assessment** (§1b) | Architect ADL → OP-27 fresh-eyes (high-stakes: data-model/uniqueness class → Opus) → QA-first build | **yes** (BRD-mandated; schema/status-lifecycle change) | User-visible recovery vs internal debt — this is the only user-facing item left, and the PO already hit it personally |
| 2 | **R3 residual** — (i) create the tracker entry recording the shipped prune (+ cross-ref #474-#476), (ii) fold a warn-only CLAUDE.md soft-budget check into `drift-canary.sh`, (iii) the one surviving prose demotion (§6) | COO chore (i, iii) + tiny script change (ii) | no (process/docs; the canary check is its own test) | One-off vs standing function: is pruning an event or a maintained invariant? My rec: standing (the regrowth data answers this) |
| 3 | **Debt #3** — file-backed test-client spike, then items base+extension atomicity + BUG-95 | Spike (OP-33 verify-checklist: does a file-backed client honour `db.transaction()` + survive subsequent queries?) → one Backend brief | **yes** (silent atomicity; BUG-95 wants a non-owner-mutation regression test) | Test-infra cost vs a one-repository residual; the spike is cheap and settles the premise before any commitment |
| 4 | **Debt #5** — per-entity serializers, every handler routed through them | One mechanical Backend brief; contract tests pin shapes | **yes** (the failure class is silent-and-plausible field-dropping — BUG-31/80) | Incidence tolerance: two shipped bugs in this class so far; cheap insurance now that repos return canonical rows |

Not ranked: R5b as a standalone item — deliberately dissolved into rank 1 (see §1b). If the GE-19
ADL concludes the name-fallback algebra must be consolidated, that work inherits rank 1's slot; if
not, R5b closes as overtaken by events with the ADL as its record.

---

## 5. Explicit verdicts on the COO's five §4 claims

**Claim 1 — "R3 was never tracked." OVERTURNED in the form asserted.**
True narrowly: no tracker entry exists (my two probes above agree). False as stated — "no home, no
trace anywhere" is contradicted by issue #474, merged PRs #475/#476, commits `96ebbb2`/`bd147c4`,
main's session-close commit `d2a9833` ("R2/R3/R5a shipped"), and a standing SKILL.md section named
"Canonical home (R3…)". More pointedly: **two of the COO's three stated probe targets contain direct
hits.** `grep -n 'R3' .claude/skills/ -r` returns the SKILL.md section; a tracker full-text search
for "R3" returns OP-35's note *naming issue #474* and OP-39's note discussing R3 pruning candidates.
The stated probes cannot all have been run as described and come back empty — the likely mechanism is
searching a paraphrase ("governance consolidation") rather than the artifact's own label. Lesson
worth keeping: **record the literal probe string with the negative finding**; two probes only count
when they could fail differently *and* actually target the claim's own vocabulary. (The fourth place
the COO asked for: `git log --grep` / `gh issue list` — the project's primary registries of *work
done*, which no probe targeted.)

**Claim 2 — "R3 vanished because it was the only recommendation that subtracted." OVERTURNED.**
It did not vanish; it shipped **first** among the five (2026-08-09), and the subtraction was real
(117 lines deleted, one hook removed). The duller truth is closer to the COO's own alternative but
inverted: R2/R4/R5a each created *standing machinery* and got tracker entries as that machinery's
registry; R3's prune was executed immediately as chores whose only registry was the GitHub issue —
and the issue↔tracker cross-reference net only catches issues raised *for existing tracker entries*,
so an issue with no entry fell through. The failure was bookkeeping of subtraction, not aversion to
it — which still vindicates a milder form of the COO's instinct: the system's records are shaped
around additions, and deletions leave thinner trails.

**Claim 3 — "R5b is unblocked because Stage 2 built the seam." CONFIRMED, with a correction of
scope.** The seam is exactly what R5b needs (§1b evidence). The correction: unblocked ≠ unchanged —
the consolidation R5b described is mostly already the architecture (0017 + fallback ordering), so
what the seam unblocks is a much smaller decision than the reflection priced.

**Claim 4 — "Debts #3 and #5 are untouched by today's work." HALF-RIGHT.**
#5: confirmed untouched (probes in §1e). #3: *behaviour* untouched (D8 honoured, comments moved
verbatim) but the claim misses that Stage 4 **found BUG-95** — a live instance of the debt — and
that the debt's own framing was already partly wrong independent of today (§1d: production
transaction exists; batch is atomic). "Untouched" understates what today changed about our
*knowledge* of #3.

**Claim 5 — the ordering question. R1 changed the calculus, but less than the reflection
predicted.** The reflection said R1 partially discharges #3 and #5. Verified: it discharged
essentially none of either — it *repriced* them. #5 got cheaper (canonical rows at one seam); #3 got
better-localized (one repository) and better-evidenced (BUG-95) but its blocker (the test client)
is untouched by R1. What remains of both is worth doing, but re-scoped as in §4 — and neither
outranks GE-19, which R1 never claimed to touch.

---

## 6. R3 — concrete consolidation proposal (invariant: every protection stays in force)

The corpus today: CLAUDE.md 408 lines · 40 OP rules (none retired as *rules*, though one hook has
now been retired — precedent exists) · 9 hooks · frameworks.txt 32 standards · 5 skills. The 2026-08-09
prune already did the heavy half of R3 correctly (single-canonical-home, delete-don't-trim,
memory-is-not-a-home). Remaining, item by item:

1. **Create the missing tracker entry** (chore, `done`, notes pointing at #474/#475/#476 and the
   deferred items) — restores the registry invariant "every reflection recommendation has a tracker
   home" and closes the gap this audit tripped over. *No protection change; pure bookkeeping.*
2. **Wire the deferred line-budget as a canary check** (`drift-canary.sh` Check F): warn when
   CLAUDE.md exceeds a soft budget (~420 lines, i.e. headroom over today's 408 — the PO sets the
   number), and point at the prune discipline (#475's "delete where safe" body) rather than
   prescribing cuts. Warn-only, cadence-carried by OP-40's existing gate — exactly the "budget
   without cadence rots" objection #475 itself raised, answered with machinery that already exists.
   *No protection change; adds a detector.*
3. **Demote the protected-branch prose — do it, it is the one surviving demotion worth making.**
   OP-38 (server-side branch protection: require-PR + 9 checks + enforce_admins, status `done`) is
   the real gate; the local hook is the fast-feedback layer; the CLAUDE.md paragraph explaining the
   override mechanics can shrink to two lines pointing at the hook and OP-38. Both enforcement
   layers remain untouched — only duplicate *explanation* leaves the constitution. Est. −10 lines.
4. **Drop "merge OP-19+20" and "collapse OP-26→29" as ID surgery.** The prose is already merged
   (one CLAUDE.md section each); what remains distinct is tracker IDs, which are the historical
   registry — renumbering breaks every existing cross-reference (memories, ADLs, PR bodies) for
   zero comprehension gain. The reflection's real complaint (rule sprawl) was answered by the prune;
   the IDs are its fossil record and should stay. **Rec: close these two as
   overtaken-by-events, explicitly, in the new tracker entry.**
5. **Do not add a standing "prune pass" ritual beyond the canary.** The deep-audit tier of OP-40
   already dispatches a periodic coherence review; give *it* the standing question "what in the
   governance corpus is now redundant with a stronger mechanism?" (one line in the coo-startup
   deep-audit lens) rather than inventing a new ceremony. One home, no new machinery.

If the PO prefers to drop R3 entirely: items 1 is still non-optional (registry integrity), and item
2 is the only one whose absence has already produced a measurable effect (silent regrowth). Items
3–5 are genuinely discretionary.

---

## 7. Probe appendix (what was actually run)

- R3 traces: `git log --grep 'R3'` · `gh issue list --search` · `gh issue/pr view 474/475/476` ·
  `grep -rn R3 .claude/skills/` · tracker greps (`design-reflection R3` → 0; `#474|#475|#476` → 1).
- R5b: read `cityIdentityService.ts` (full), `routes/cities.ts` branch sites, `schema.ts:110-190`,
  `0017_bug75_identity_switch.sql`, `buildCreateCityDataFromCandidate.ts`; dated PR #409 (2026-08-06).
- Debt #3: scratch probes run today — (i) `db.transaction()` on `:memory:` → transaction OK,
  subsequent query throws; (ii) `db.batch()` with failing second statement → first statement rolled
  back. Read `items.service.ts:116`, `repositories/items.ts:130-175`, `repositories/trips.ts:280-330`;
  `git log -S db.transaction` → PR #64; re-ran `qa-backend-fixes.test.ts` → 16/16 green.
- Debt #5: grep all `function serialize*` (4, all route-local); read `trips.ts:85/:244` mappings.
- BUG-85: schema CHECK constraint · `geocoding.service.ts:536` queue predicate ·
  `geocodeRetryQueue.ts:22-24` removal rules · tracker status · BRD GE-19 + changelog v3.20.
- Corpus metrics: `wc -l CLAUDE.md` (408) · OP-ID count (40) · `ls .claude/hooks` (9) ·
  `drift-canary.sh` read (no budget check).

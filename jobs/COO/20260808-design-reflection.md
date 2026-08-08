# COO Design Reflection — Application & Orchestration

> SNAPSHOT as of 2026-08-08, not maintained. A point-in-time reflection commissioned by the PO
> ("consider the overall design of both the application and the orchestration layer … I'm realising
> this is running much faster than a normal project with way less downtime for thinking"). Grounded
> in two independent read-only reviews (one Architect on the app, one fresh-eyes/general-purpose on
> the orchestration model — OP-27 applied to the COO's own view) plus governance metrics. Findings
> that become work are promoted to the tracker/ADL/open-dialogues; this doc is not the record of that
> work, only the thinking that seeded it.

## 0. The meta-finding (both reviews hit it independently)

**This is a fast, retrospective, instance-patching system with no forward/consolidating phase.**
It is genuinely good at two things — not repeating a *known* mistake, and shipping correct-enough
code quickly. But because near-zero calendar downtime removed the involuntary "sleep on it" pause and
nothing replaced it, the model never runs a **divergent / consolidating / pre-mortem** phase. The
visible consequence, in *both* layers:

- **Application:** the geocode/city subsystem has accreted **two parallel identity models**, a **god-route**,
  and an **unmodeled 4th state** — each new requirement patches an instance rather than collapsing the class,
  so the most-churned area keeps generating bugs (BUG-72/74/75/76/79/80/81/85).
- **Orchestration:** five OP rules (OP-19/20/28/38) all chase **"concurrent agents share mutable state"**
  one surface at a time; six rules (OP-26/27/29/32/33/34) all chase **"confident-but-false premise"**. 38
  rules, **zero ever retired**.

The project's own memory already names this reflex — *"question the frame, not just the answer"* — and
records that **the PO caught every framing miss, not the model.** That is the finding under the finding:
the reflection function wasn't eliminated, it was **outsourced to the human PO at human latency.** The
apparatus guards against known failure shapes; you are currently the only safeguard against a *novel*
one, and against slow design/coherence drift. Institutionalizing a small amount of forward-looking
capacity is therefore the single highest-leverage change available — it is the one thing the model
structurally lacks.

Metrics that frame it: CLAUDE.md 493 lines / 38 OP rules (monotonic, no retirements) · 10 hooks · 52
ADLs + 14 standalone · tracker 270 items, **26 stranded in `done_pending_uat`** (the PO-UAT bottleneck,
D-28's subject) · app complexity ~2,500 LOC concentrated in one subsystem.

---

## 1. Application architecture

**The throughline (most important structural fact):** row-level **userId-scoping is a convention, not a
structure** — enforced at ~65 hand-threaded `req.user!.id` sites with no central `authorize(user, resource)`
chokepoint. This is simultaneously **the top security risk** (one forgotten `eq(table.userId, userId)` =
cross-tenant read, and the access-matrix test checks the *tier gate*, not every row filter) **and the main
thing that makes the stated Phase-3 sharing direction expensive** (sharing changes the access predicate at
all 65 sites). **One fix discharges both:** route every user-data query through a repository composing a
single scoping helper.

Ranked structural debts (impact × likelihood):

1. **userId scoping is convention, not structure.** Fix: `citiesRepository` (the biggest hole — `cities.ts`
   is 840 LOC with *no* repository) + one `scopeToUser`/`assertOwned` helper every repo query composes.
   *Largely already scoped by BUG-84's FOLD note — this reflection raises its priority and adds the
   security + Phase-3-foreclosure lens.*
2. **Geocode/city subsystem: dual identity model + unmodeled retry-exhausted state.** The name-based
   (`findOrUpgradeCity`) and OSM-based (`createOrReuseCarriedCity`) find-or-create paths run side by side
   (residue of the BUG-75 identity migration — the old model retained, not superseded; schema carries *both*
   unique indexes). And a row that exhausts `GEOCODE_ATTEMPT_CAP` stays `pending` but is dead server-side and
   polled forever client-side — a 4th de-facto state. Fix: (a) model the 4th state — **already open as
   GE-19/BUG-85** — then (b) a deliberate consolidation to OSM-ref-as-identity with name-only as a labeled
   fallback, ATDD-first (OP-35) given the churn.
3. **No transactions — a test-double limitation dictates production atomicity.** `db.transaction()` is
   avoided by documented decision because it breaks the `:memory:` libSQL *test* client; production
   Turso/libSQL supports transactions fine. The low-fidelity double is shaping prod code (QUAL-22 inverted).
   Fix: file-backed libSQL test client that honors transactions, then wrap the merge + multi-step create paths.
4. **`cities.ts` is an 840-line god-route** with integrity logic inline in handlers — the file where risks 1
   and 3 concentrate. Fix: extract `citiesRepository` + a `cityIdentityService` (same brief as #1; highest
   single-refactor leverage — partially discharges 1, 3, and 5).
5. **Response serialization is hand-mapped per handler** — the recurring "persisted-but-dropped-from-response"
   class (BUG-31, BUG-80). `trips.ts` hand-maps the same place shape two different ways. Fix: one serializer
   per entity, every handler routed through it (`serializeCity` exists but isn't used everywhere).

**Foreclosure:** iOS (NF-06) is **not** foreclosed — stateless REST/JWT, no data-model coupling; the
localStorage retry queue is client code an iOS app reimplements. Phase-3 sharing is **not foreclosed at the
data layer** (roles already defined in SE-01; shared-catalogue-with-provenance already exists) but is
**expensive to unwind at the code layer** — which is finding #1 again. One caveat (UNVERIFIED): the promised
"parallel pgTable schema" doesn't exist yet, and the SQLite-specific partial-index expressions
(`COLLATE NOCASE`, `COALESCE` sentinels, `strftime`) are a non-trivial Postgres translation — a migration
cost, not a rebuild, but larger than the "only the table builder changes" comment implies.

---

## 2. Orchestration layer

**Failure taxonomy (incident-driven era, OP-09+):** the dominant class is **premise-verification /
confident-wrong-belief** (OP-26/27/29/32/33/34 — six rules), with **coordination / shared-state races**
second (OP-18/19/20/28/38 — five). The model's real weakness is **epistemic, not code-correctness**: fast
confident agents (and the COO) produce plausible-but-false beliefs faster than anyone verifies them, and
work gets built on them. Six rules are the same reflex — *institutionalized doubt bolted onto a system too
fast to doubt naturally.*

**The governance ratchet is real.** Adoption is strictly monotonic (OP-01→38; ten added in one day, 07-28),
and **no OP rule has ever been retired** — while the sunset machinery the project built for *documents*
(OP-09 `SUPERSEDED`/`HISTORICAL` stamps) has never once been pointed at the *constitution*. Redundancy is
already present: protected-branch commits are now guarded in **three** layers (CLAUDE.md prose + local hook +
OP-38 server-side branch protection) with nothing demoted; OP-19+OP-20 are one section / two IDs; OP-26 is
subsumed by OP-29's hook. And the constitution's length is itself a live risk — the `coo-startup` migration
note records that an entire persona/standards file (`COO-system-prompt.txt`) **silently went unexecuted for
the whole project and nobody noticed.** A 493-line constitution's *tail* rules (the last-adopted OP-33/34/35)
are at the same risk of being present, resolvable, and never internalized.

**Over-engineered:** the three newest hooks (negative-findings, atdd-first, no-wholesale-rewrite) are
**warn-only and blind to the primary dispatch channel** — they fire on Bash/Write/Edit, but agents are
dispatched via the Agent tool, which **no PostToolUse hook can see**. So the newest enforcement guards the
*secondary* channel (gh-issue echoes of briefs) while the actual brief is mechanically invisible. OP-27
fresh-eyes is also un-tiered — a full second-Opus review for *every* cited ADL regardless of stakes, the one
place the model's own model-tiering discipline isn't applied.

**The real gaps:** (a) **Agent-tool brief content is ungoverned** — the single highest-leverage artifact in
the system is checked only by COO discipline; (b) **no design-coherence / drift detection** — the "works
offline" overclaim (OP-33), mobile-scope drift (QUAL-36), all coherence decay caught by the PO or a lucky
grep, never by a mechanism; (c) **unknown-unknowns by construction** — every rule post-dates its incident.

---

## 3. Recommendations (ranked by leverage; PO decides)

Most map onto **already-tracked** work — this reflection mainly **re-prioritizes and re-frames**, which is
the point (reuse over new).

| # | Recommendation | Maps to | Deciding dimension / my rec |
|---|---|---|---|
| R1 | **Elevate the `citiesRepository` + central `scopeToUser` extraction to the top backend priority**, framed as the security-invariant + Phase-3-hedge it is (not just hygiene). | **BUG-84 FOLD** (existing) | Security-invariant-vs-velocity. Rec: do it as the next backend brief; it's the highest-leverage refactor in the app and discharges risks 1/3/4/5 partially. |
| R2 | **Institutionalize one forward-looking phase** — repurpose the OP-25 scheduled-routine machinery for a periodic **BRD/schema coherence-drift audit** + a lightweight **pre-mortem Architect pass** ("what bites us next wave?"). | New (the headline) | Reactive-vs-forward. Rec: adopt — it's the only proposal that attacks the structurally-uncovered class and starts bringing reflection back in-house from the PO. |
| R3 | **[REMOVE] A governance-pruning pass + a CLAUDE.md line-budget.** Merge OP-19+20; collapse OP-26→29; **demote the protected-branch prose to a one-line pointer** now that OP-38 server-side is the real gate; cap the constitution and push detail to skills. | New | Defense-in-depth-vs-internalizability. Rec: adopt a periodic prune; the never-executed system-prompt is proof length already causes silent non-loading. |
| R4 | **Move real controls to dispatch-time.** No PostToolUse hook sees Agent-tool briefs; make brief-dispatch a gated COO procedure (like OP-15c pushed enforcement agent-side) instead of warn-only hooks on the echo channel. | Relates to OP-15c | Ceremony-vs-payoff. Rec: adopt; retire or downgrade the blind warn-only hooks in the same pass. |
| R5 | **Tier OP-27 fresh-eyes by stakes** (full second-Opus for schema/access-matrix/data-integrity; lighter for low-stakes). Consolidate the geocode dual-identity model behind ATDD-first once R1's seam exists. | New + GE-19 | Rec: adopt the tiering; schedule the consolidation after R1. |

**Cross-cutting throughline:** apply the project's own *"question the frame, not the answer"* rule to the
system itself. Both layers are patching instances (geocode bugs; concurrency rules) of a class. The
high-leverage moves are the **consolidations** (R1 collapses the scoping class; R2/R3 collapse the
never-reflect / never-prune class), not the N+1th patch.

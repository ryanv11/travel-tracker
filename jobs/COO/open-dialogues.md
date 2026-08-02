# COO ↔ PO Open Dialogues

Lightweight register for topics under discussion but not yet decided or actioned.
**Not authoritative** — nothing here is policy, a commitment, or tracked work until
it's promoted to CLAUDE.md, a tracker.json entry, an ADL, or a BRD section. This file
exists so a real discussion thread survives `/clear` without prematurely cluttering
those documents with half-formed proposals.

Adopted 2026-07-19, prompted by the first live run of the Restart Preview
(`/coo-merge-and-close`) surfacing genuine open threads that didn't belong in
tracker.json but also weren't safe to let vanish.

## How to use

- New entry when a discussion produces a real proposal or plan that isn't yet
  confirmed — not for every passing remark.
- Update the entry's status as the conversation progresses across sessions.
- On resolution: promote to its real home (tracker/ADL/CLAUDE.md/BRD/skill file)
  citing this entry's ID, then move the entry to **Resolved** below with a pointer.
  If dropped without action, move it to Resolved noting why.
- Checked at every `/coo-startup` pickup and referenced by the Restart Preview step
  in `/coo-merge-and-close` — an item in the Restart Preview's "not captured" tier
  that's genuinely still a discussion (not a clear-cut missing artifact) belongs here,
  not in the park doc's prose.

## Open

### D-21: Firewall allowlist for external data sources (Nominatim, MapTiler) + recorded-fixture testing
**Raised:** 2026-08-01 (PO: *"do we need to get you hooked up to nominatim or any other services
to improve our local testing and development?"*) · **Status:** COO recommendation given, PO has
not decided. **Escalated in importance the same session** — see the Plockton note below.

**The COO's answer, in short: yes to Nominatim, but not so tests can call it live.** Live-calling
tests would be non-deterministic (Nominatim's data and ranking change), rate-limited at ~1 req/s
with the client's own comment warning a violation *"blocks the whole app"*, and an abuse of a free
public service that risks an IP ban. The valuable thing an allowlist entry buys is the ability to
**record real responses once** and commit them as replay fixtures — deterministic, fast, and
*faithful because recorded rather than invented*.

**The argument for it.** What actually failed in BUG-71 was not reachability but fidelity: the
defect passed 32 purpose-written ATDD acceptance tests and green CI because the mocks encoded what
we *assumed* Nominatim returns. That is QUAL-22 verbatim — a group green for the wrong reason.
A recorded-fixture set closes the class; more mock-writing inside the wrong environment cannot.

**Honest scope limit, stated up front so it isn't oversold.** This does **not** fix the
environment-parity class. The worst parity defect this project has had (BUG-55, Nominatim
CSP-blocked in production) would not have been caught by any allowlist entry — it is a *topology*
difference (prod serves the document from Express with helmet's CSP; E2E serves it from `vite
preview` with no CSP header at all), which is QUAL-18's job and needs no firewall change.

**COO's spend ranking if forced to choose:** QUAL-20 (post-deploy smoke — automates the manual
shakedown that found four defects on 2026-08-01) → Nominatim allowlist + fixtures → QUAL-18/19 →
MapTiler (unblocks visual map testing; BUG-49 and BUG-34 are currently unobservable).

**Why this got MORE important, not less, after ADL-48.** The COO initially advised parking the
Nominatim half on the grounds that a bundled gazetteer might make it moot. **That advice was
wrong and is withdrawn.** ADL-48's recommendation is gazetteer-*first*, not gazetteer-*only* — the
geocoder is retained for the coverage tail. Both ADL-48 and its OP-27 review then flag, as the
single load-bearing unverified item behind decision G6, that **nobody knows whether Nominatim even
has Plockton, Shieldaig or Dornie** — the very places the gazetteer was shown to miss. ENV-01
blocks the probe (re-confirmed by two independent probes in the review). If Nominatim lacks them
too, the tail strategy must be retaken and part of ADL-48 reopens.

**Governance.** The allowlist is governed by **ADL-33/OP-21**, which documented its exclusions with
reasoning (`api.turso.tech` and `api.clerk.com` deliberately excluded). Adding domains should
**amend that ADL**, not quietly edit `.devcontainer/init-firewall.sh`. Note the practical asymmetry
already recorded in ADL-48: an npm-distributed dataset is reachable from this environment and from
CI; a direct third-party download is not.

**Also note:** `init-firewall.sh` runs at container start, so any change needs a container rebuild
and cannot help an in-flight session.

**Next step if adopted:** an Architect brief amending ADL-33 to cover Nominatim (+ MapTiler if the
PO wants visual map testing), plus the fixture-capture and drift-check design. Cheap; ready to
execute whenever the container next rebuilds.

---

### D-19: Constrain city lookup by the trip's declared countries + shortlist-not-filter selection
**Raised:** 2026-08-01 (PO) · **Status:** ~~DESIGNED, deferred behind an MVP~~ → **DEFERRAL
NO LONGER JUSTIFIED (amended 2026-08-01, same day).** Needs a BRD home before any brief.
UX spec written and merged; Architect design not started.

> **AMENDMENT (2026-08-01) — the deferral rested on a premise that was disproved within hours.**
> This was parked as "probably edge-case territory until measured," on two stated grounds: that the
> COO's sense of the problem was inflated by a since-fixed defect, and that **nobody could measure
> the real rate** because `geocode_status` had only just reached main. Both were fair at the time.
>
> What happened next: the COO queried `geocode_status` at the next session pickup and found three
> rows, all `resolved` — no volume, so still unmeasured — and additionally read one correctly-shaped
> `Springfield → Virginia` row as evidence the live path *worked*. The PO then ran a real browser
> against staging and found that same row had been produced by the defect: "springfield" silently
> auto-populates State = Virginia with **no indication another Springfield exists** (now **BUG-71**,
> P1, with screenshot + code-read confirmation).
>
> **The measurement arrived by other means.** One user, the first city typed, wrong result, no
> recourse. The unconstrained global `limit:'10'` lookup this entry exists to fix is a direct
> contributing cause: it starves the ambiguity discriminator of the evidence it needs to fire.
> Two lessons worth keeping separately from the decision: **a correct-looking row is not a correct
> flow** (the COO's read was wrong, and a DB query was the wrong instrument), and **"unmeasured"
> is not a synonym for "rare"** — it was treated as one here.
>
> **This does not auto-promote D-19 to a brief** — it still needs a BRD home and the PO's call on
> scope. It does mean the *edge-case* framing should not be reused as the reason to defer it, and
> that QUAL-21 (F4 route-level coverage), named a prerequisite if D-19 proceeds, is now live.

**The problem.** Adding a place on a US trip and typing "Rome" resolves to Rome, Italy. The
frontend calls `GET /api/geocode?q=…` with **no constraint at all**, even though the backend
proxy already accepts `country_code` and `region_iso` and implements D12's constrained resolve.
The capability exists on both ends; nothing joins them.

**What the PO proposed, across several turns:**
1. **Trip countries constrain the suggestions.** `trip_countries` already exists as a *set*
   (optional, many-to-many), so multi-country trips work without change. Explicitly for autofill
   and proposed options only — never restricting what the user can pick.
2. **Shortlist, don't filter.** Likely matches at the top of the dropdown, a separator, then the
   complete list below — `<optgroup>` expresses this natively. This came directly from the D14
   defect this release shipped and fixed, where a *narrowed* selector could collapse to zero
   options. Nothing is ever removed, so that failure mode becomes unrepresentable rather than
   handled. **This supersedes the fix landed in PR #341**, which replaces the option list rather
   than promoting within it — safe as-is, but inconsistent with this pattern; fold in when this lands.
3. **Agreement promotes to `resolved`.** Whatever the user selects gets geocode-checked, and only
   if the two agree does the city enter the shared catalogue; a selection the geocoder cannot
   confirm stays `pending`. This is a materially stronger definition than today's "the geocoder's
   first guess", and it would let GE-16 drop its own footnote that *"resolved means the service
   returned a match, not that the match has been verified as correct."*
4. **Three-tier precedence** (COO, adopted by the UX spec): explicit place-level selection wins and
   is never overwritten by geocoding (GE-16 already mandates this) > trip countries constrain when
   no place-level choice exists > unconstrained discovery only when neither does.

**What was decided against.** A user-dropped map pin — private display coordinates on the user's
own record. Rejected on: GE-16's unqualified "coordinates are never client-supplied" would need a
carve-out; placing a pin accurately is far more effort than a one-tap answer; and it resolves the
user's view while leaving the catalogue record permanently unresolved, so the list starts tracking
*places I dealt with* rather than *cities that are resolved*. UX agreed independently, on
catalogue-drift grounds rather than deference — while noting the COO's effort argument is weakest
for the terminal village case, where the alternative is "point at a nearby town", not one tap.

**Canonicalisation (Rome vs Roma) — answered NO.** The PO raised it as genuinely open. UX rejected
a canonical-name-plus-aliases data model as real complexity for a cosmetic want that works against
the convergence resolve-then-create exists for. Recommended instead: a one-time disclosure ("Saved
as 'Roma'…"), plus a cheap non-UX mitigation — set `accept-language=en` on the Nominatim request.
**That parameter was deliberately kept out of the F1/F2 fix**: it changes which canonical names come
back, which changes identity-key values for newly created cities, and that implication deserves
considering with this work rather than bundling into a correctness fix.

**Why deferred.** The PO's read, which the COO shares: this is probably edge-case territory — a
user should be selecting or correcting to the right place the large majority of the time. Two
things support that. The COO's framing of the problem's size was **inflated by a defect** (the
happy path was producing `pending` rows because `resolveCityName` marked any two same-region
candidates ambiguous; fixed in #346). And **nobody can measure the real rate yet** — `geocode_status`
arrives with migration `0015`, which only reached `main` on 2026-08-01, so no production data
exists. Both "this matters" and "this is edge case" are currently unmeasured intuitions.

**What ships instead:** UX-12 — the UX spec's MVP (a standing "Change city" control plus one
undifferentiated "Location not confirmed" badge). UX named both as *not safe to cut*.

**Triggers to revisit** (from the UX spec §12, concrete by design): a non-resolved rate above ~5%
once production data exists; a UAT or user report of a missing or wrong pin; or the ISO 3166-2
adoption landing, which changes the region-data completeness this design has to assume.

**Sequencing if picked up:** BRD home first (likely a GE-15 amendment rather than a new ID — it
refines country autopopulate rather than adding a capability, but write it before deciding),
then Architect data-model design against the merged UX spec, then Backend + Frontend. **QUAL-21
becomes a prerequisite rather than a follow-on** — this change makes the untested
resolve-then-create path primary.

**Artifacts:** `jobs/ux/tech/20260801-UX-city-entry-and-disambiguation-spec.md` (merged, PR #344) ·
tracker UX-12, QUAL-21 · BRD GE-15/GE-16.

> **RE-SCOPED (2026-08-01) by ADL-48 §6.9 — not closed, and still needs the PO's scope call.**
> ADL-48 decides to bundle a local city gazetteer (170,540 rows) queried before Nominatim. Against a
> local table, D-19's design problem collapses to a single clause:
> `ORDER BY (country_code IN (/* trip countries */)) DESC, name`. That **is** the PO's
> shortlist-not-filter pattern exactly — nothing is removed, likely matches sort first — with no
> rate-limit interaction, no extra egress and no truncation risk, and the UX spec's `<optgroup>`
> presentation sits on top unchanged. Two consequences worth recording: **QUAL-21 stops being a
> prerequisite** in the form stated above (the primary path is a SQL query, not the untested
> resolve-then-create path), and the *"a selection the geocoder cannot confirm stays pending"* item 3
> becomes cheap because a complete local set can positively confirm. **D-19 should be picked up as a
> consequence of ADL-48 stage S3 rather than designed separately** — designing it independently now
> risks a second, incompatible lookup path. See `jobs/architect/tech/ADL-48-bundled-gazetteer.md`.

---

### D-20: Shared-record append collisions — the per-agent-region fix identified in Wave 0 and never adopted
**Raised:** 2026-08-01 · **Status:** PROPOSED, not adopted. Recurrence count is the argument.

**Four collisions in one session** (2026-08-01), on top of the documented history:
`jobs/architect/context/current.txt` (twice — two Architect agents, then the review branch against
the ruling branch), the ADL log (`20260307-architecture-decisions-log.md`, ADL-46 amendment vs the
ADL-47 entry), and `.planning/drift-ledger.jsonl` (two branches appending concurrently).

**The point that matters: every one of these was two parties correctly following OP-28.** The rule
says append or amend, never wholesale replace — and all four did exactly that. Appending to the
*same location* still conflicts. OP-28 prevents silent data loss, which was its actual purpose and
it works; it does not prevent the conflicts, and nothing has ever claimed it would. So this is not
a compliance problem and should not be addressed by tightening the rule.

**Prior art, unactioned twice.** The Wave 0 concurrency notes (2026-07-27) recorded the same file
colliding in 3 of 4 concurrent agents and proposed the fix: **per-thread context files
(`context/<ID>-current.txt`) with `current.txt` as an index**, or making the park doc the only
per-thread state since it is already uniquely named and collision-free. OP-28 (2026-07-28) then
recorded a second occurrence. Neither adopted the structural fix. This is the third recording.

**Cost so far is contained but real:** every collision has been hand-resolved by the COO mid-session,
each costs context and carries a small chance of resolving wrongly, and the ADL-log one directly
caused a *false negative finding* — an Architect agent correctly grepped its own branch, found no
ADL-47, and flagged a doc-lifecycle gap that did not exist on `main`. The COO then asserted the
agent was wrong, having probed a different branch. Neither party was careless; the file genuinely
differed by branch.

**Options, unranked pending a decision:**
- Per-agent region files with an index (the Wave 0 proposal) — fixes context docs, not the ADL log
  or the ledger.
- Retire `current.txt` entirely and rely on uniquely-named park docs, which never collide.
- Accept it and standardise the resolution instead: for genuinely append-only files (the ledger is
  literally JSONL) a union-and-sort merge driver is mechanical and safe — the COO did this by hand
  today and verified 2,521 lines, valid JSON, monotonic timestamps.

**Recommendation (COO):** adopt the third for `.planning/drift-ledger.jsonl` immediately — a
`.gitattributes` merge driver removes an entire class of conflict for a file with no semantic
ordering beyond timestamp — and take the second for role context docs, since the park doc already
does that job and `current.txt` is the file that keeps colliding. The ADL log is genuinely
sequential and probably has to stay hand-resolved.

**Trigger if not adopted now:** the next collision. There will be one.

---

### D-15: A green PR earned against a stale base merged into a red main — does the merge step need a mandatory re-check?
**Raised:** 2026-07-28 · **Status: ANSWERED 2026-08-01 — mechanically, by branch protection.**

> **RESOLVED.** `main` now requires branches to be **up to date before merging**
> (`required_status_checks.strict: true`), alongside required PR, 9 required checks,
> `enforce_admins`, linear history and no force pushes. Configured by the PO with COO guidance in
> the parallel read-only session; **independently verified by the COO via
> `gh api repos/ryanv11/travel-tracker/branches/main/protection`** rather than taken from the
> write-up. `production` is deliberately left unprotected — direct fast-forward push is its
> promotion path (ADL-35).
>
> This is the exact B7+B8 failure this entry described: `strict: true` forces the stale base to be
> updated and CI re-run *before* the merge button works, so two individually-green PRs can no
> longer compose into a red main without someone seeing a re-run first. No process rule was needed.
>
> **Confirmed in live use the same day** — the ADL-46 release PR (#348) was 4 commits behind `main`
> and was blocked until updated, which also surfaced that the integration branch had never been
> refreshed since it was cut. The cost is one `update-branch` plus a ~85s CI re-run per stale PR,
> which is the intended trade. Remaining follow-ups from the same change are queued in
> `jobs/COO/20260731-review-execution-queue.md` item 8 (skill-doc updates, and recording the
> decision per `/record-decision`).

Wave 1 sub-wave B produced a **red main from two individually-green PRs**. B8 (#318) and B7
(#319) had no textual conflict, were each 18/18 green, and were partitioned by file surface
exactly as `backlog-clearance-plan.md` §4 intends. They broke only in combination, because
B7's CI ran against a base that predated B8.

Two layers, the second hidden behind the first:
1. B7's `TripDetail.test.tsx` used a **total** `vi.mock` of `hooks/useItems`, listing only the
   exports that existed when B7 branched. B8 added `DEFAULT_RATING_SORT_FILTER`, which
   `PlaceSection` consumes — absent under a total mock, so `PlaceSection` threw.
2. Fixing that let `PlaceSection` genuinely mount, which exposed that B8's new per-city `Link`
   to `/cities/:id` needs router context the test never provided.

Fixed in PR #322 (partial mock via `importOriginal`, plus `MemoryRouter`), and the identical
latent pattern in `MobileTripDetailView.test.tsx` fixed preventively — it passes today only
because no test there mounts a place.

**The general point.** The plan's conflict analysis reasons about *file overlap*. This was a
**shared-module contract** break — invisible to that check, and it will recur for as long as
sub-waves run concurrently. The cheap mitigation, applied by hand this session for B4 (#320)
and shown to work: before merging the second and subsequent PRs of a wave, update the branch
against current `main` and re-run its CI, rather than trusting a green earned against a stale
base. GitHub's `pulls/:n/update-branch` API does this in one call.

Open question: make that a standing step in `/coo-merge-and-close`, or rely on the existing
mandatory post-merge `ci-wait.sh branch main` to catch it after the fact? The post-merge check
*did* catch it, and fixing forward took one PR. So the honest framing is prevention-vs-detection
cost, not a safety gap — main was never left red unowned. Note this is BUG-24's known class,
which is already why the post-merge check is mandatory; what's new is a concrete, cheap
prevention step rather than another instance.

**Second, smaller item raised by the same wave, recorded here rather than as its own entry:**
B4's agent (#320) merged with **all four of its tracker items still at their pre-brief status**
— it updated `jobs/**` but never `_project/tracker.json`, while B7 and B8 both did. Caught by a
post-merge COO check, not by the agent's own completion report, which claimed done. Fixed in
#323. One agent's miss, not obviously systemic — flagged to watch for recurrence before it
earns a rule.

### D-14: Trip country search matches full names only — should ISO codes ("US"/"USA") be added?
**Raised:** 2026-07-28

BUG-52 shipped (#320) matching **full country names only**. TR-13 was amended at BRD v3.12 to
require exactly that and to explicitly exclude ISO codes and informal abbreviations, so the
shipped behaviour is correct-as-specified.

**But the PO's original report gave two examples — "United States" *and* "USA" — and only the
first works.** The COO made that scoping call inside the brief rather than surfacing it, which
is the same shape as the BUG-55 misclassification: a product decision settled unilaterally.
Ryan asked for the reasoning (explicitly not as disagreement), which prompted the re-analysis
below.

The original reasoning was that an alias list is a **data-sourcing decision** of the same class
as BUG-45 (airline dropdown) and OQ-06 (ISO 3166-2 subdivisions), both parked pending ADL-43 —
so bundling it would either block a 7-line fix on an ADL, or have an agent invent an unsourced
alias list. That still holds for *part* of it. But the re-analysis found the COO had collapsed
**three** tiers into two:

| Tier | Example | Real cost |
|---|---|---|
| Full name | "United States" | **Done.** Already in the payload (`TripSummary.countries[].name`) |
| ISO codes | "US", "USA" | **Much cheaper than presented.** `country_code` (alpha-2) is *already in the payload*, so "US" was excluded for no good reason. "USA" is alpha-3 — a stable, closed, public ~250-entry list. No source decision, no ambiguity, no ADL |
| Colloquial | "America", "Britain", "Holland" | Genuinely BUG-45's class — needs a curated source and a judgment call on what counts |

Only tier 3 is really the parked problem. **COO recommendation: add tier 2** (a small static
ISO alpha-2/alpha-3 map, roughly an hour, no ADL needed) so both of the PO's original examples
work; leave tier 3 parked with BUG-45. Suggested as a follow-up item rather than reopening
BUG-52, since the shipped behaviour is correct as far as it goes. **Not yet decided** — awaiting
Ryan. If adopted it needs a small TR-13 amendment, since TR-13 currently forbids exactly this.

### D-13: Two concurrent COO sessions collided three times in one day — does this need a rule, or was standing one down enough?
**Raised:** 2026-07-28

Two COO sessions ran in parallel for most of 2026-07-28 (this one on Wave 1 dispatch, the
other on OP-25 scheduled-health-check hygiene). The previous park doc had already flagged
the risk — "BOTH sessions can write tracker.json, MEMORY.md and open-dialogues.md… worth a
rule if concurrent COO sessions become normal rather than a one-off." It became real.

Three collisions actually fired:

1. **Shared `/workspace` HEAD.** Both sessions operate in the *same* working tree — the
   thing `isolation: "worktree"` was adopted to prevent for agents has no equivalent for
   COOs. At startup this session found HEAD on a stale (already-merged) branch and moved it
   to `main`; later the other session had HEAD on its own branch, and this session had to do
   its guardrail work in a scratch worktree specifically to avoid moving HEAD under it.
   Nothing was lost — every commit was already on origin — but this is the OP-19 failure
   mode one level up.
2. **`OP-28` allocated twice, independently, on the same day.** This session used it for the
   no-wholesale-rewrite rule; the other for GitHub App setup. Mine reached `main` first
   (PR #310) and became immutable, so theirs was renumbered to **OP-31** when its PR was
   merged. Cheap this time because one was still unmerged; had both landed, the tracker would
   have carried two `OP-28` entries with nothing flagging it.
3. **An accidental direct-to-main commit** on the other session's side (captured after the
   fact by its PR #307), against a standing rule that COOs never commit directly to main.

**Resolved for the day, not structurally.** Ryan asked whether one session should stop; the
other stood down and handed over its open PR, which this session merged after the renumber.
Zero open PRs and a clean tree at close.

The open question is whether concurrent COO sessions should be **supported** or **prevented**:

- *Prevent* — simplest, and arguably correct: the COO role is a serialisation point by design
  (it reviews and merges serially anyway, per the clearance plan's own reasoning about why
  Wave 1 runs in sub-waves). A second COO buys parallelism the merge queue can't use.
- *Support* — needs at minimum: ID pre-allocation for tracker entries (the pattern already
  proven for concurrent ADL numbers in Wave 0), and a convention that each COO session works
  in its own worktree rather than sharing `/workspace`.

Not decided — raised for Ryan. The precedent question is D-03's: is one day of contained
collisions enough signal to add a standing rule, or does it only matter if it recurs? Note
this one differs from D-03 in that it fired *three distinct ways* in a single day, and one of
them (duplicate tracker IDs) would have been silent rather than caught.

### D-12: Four BRD contradictions surfaced by the QUAL-05 sweep that need a PO (and in one case Architect) decision
**Raised:** 2026-07-26

The QUAL-05 state-language sweep (PR #259) was scoped to fix prose that decays and to
**flag, not resolve**, anything where the fix would pre-empt a product or architecture
decision. Four items came back flagged. They are recorded in QUAL-05's tracker note and in
the Docs completion report (`jobs/COO/inbox/read/20260726_2234-DOCS-state-language-sweep-
complete.txt`), but neither surfaces at `/coo-startup`, which is why they are here.

None is urgent. All four are wording-level in the BRD — the shipped app is unaffected.

> **UPDATE (2026-07-28) — item 1 is now the exception to both sentences above, and is urgent.**
> The shipped app *is* affected. Ryan reproduced **BUG-63** on staging as a non-owner: three
> deterministic 403s (`GET /api/admin/categories/active`, `GET /api/admin/activities/active`,
> `POST /api/cities`) mean a non-owner **cannot add a place to a trip at all**. Raised to
> **P1**, owner **Architect**. Item 1 called this two days early — it predicted BUG-63 could
> not be correctly specified until SE-01/SE-03 say what the intended model is, and that is now
> the blocking path, not a wording nicety. Items 2–4 are unchanged and remain non-urgent.
>
> Two further facts for whoever picks this up. First, `security.access-matrix.test.ts` asserts
> the offending 403s as **correct** (lines ~383 and ~414), so the suite is green while
> encoding the defect as the intended contract — the spec must move before the code, which is
> exactly the SE-01/SE-03 decision this item describes. Second, `BRD-AD09`'s tracker note
> independently recorded the same over-restriction (creation "more restrictive than AD-09
> specifies, not less", parked per ADL-28 Q5); that parked gap and BUG-63 are one defect filed
> twice. Recommended scope for the Architect pass: SE-01/SE-03 + AD-09 + BUG-63 + BUG-55
> together, since all four are the single question of which surfaces are reachable by whom.

> **RESOLVED (2026-07-30) — item 1 only, by ADL-46 → BRD v3.13.** SE-01 rewritten to a
> resource-tier × role model, SE-03 rescoped to instance administration (country/region config
> + shared-catalogue curation), AD-09 rewritten to per-user lists, and GE-16 added for
> constrained city find-or-create. This is the SE-01/SE-03/AD-09 decision item 1 said BUG-62/63
> were blocked on. Spec merged as PR #327 (+ OP-27 review #328); BRD gate applied in the v3.13
> bump. Item 1 is closed here; **items 2–4 remain open and unchanged.** The code has not shipped
> yet — GE-16/BRD tracker work and the Database → Backend → Frontend briefs are the remaining path.

1. **§5.11 SE-01/SE-03 — the three-role model has drifted from reality.** AD-07 and AD-08
   moved map shading and companions to per-user with `requireAuth`, and non-owner users
   create their own trips in production, but SE-03 still describes authenticated-but-
   ungranted users receiving 403 on admin operations. **BUG-61/62/63 are live symptoms of
   this drift, not independent bugs.** This is a semantic change to a *security*
   requirement, so it needs PO **and Architect** — explicitly out of scope for a doc sweep.
   Of the four, this is the one with real consequences: BUG-62 and BUG-63 are both open and
   arguably cannot be correctly specified until SE-01/SE-03 say what the intended model is.
2. **§7 and §11 — historical import.** Both state import tooling is out of scope and manual
   entry is the answer. Import requirements IM-01–33 are drafted but **not approved**.
   Deleting those lines would pre-empt the PO decision; leaving them is fine until IM is
   either approved or dropped.
3. **§5.15 MB-01 — mobile scope.** The §5.15 preamble ("the phone is a reference device,
   not an editing surface") was stamped SUPERSEDED by WP-04 in v3.7, but MB-01's own
   requirement text still scopes mobile to the read path only, while WP-04 shipped a fully
   editable mobile layout. Whether to widen MB-01's stated scope — and whether that implies
   anything about offline support — is a product call, not a wording fix.
4. **§5.7 PH-02 vs IM-06.** PH-02 says "the app does not store or copy photos"; IM-06
   (client-side EXIF import) will read as contradicting it. Consistent in substance today.
   **Conditional — only needs resolving if import is approved**, i.e. it collapses into
   item 2.

Suggested handling: item 1 alongside the BUG-62/63 work rather than as a separate pass;
items 2 and 4 together whenever the import decision is made; item 3 whenever mobile scope
next comes up. Not blocking the backlog clearance plan's waves.

### D-11: `.claude/settings.local.json` disappeared from disk mid-session — root cause unknown, and it's gitignored so a `git clone` migration won't carry it
**Raised:** 2026-07-23

Mid-session, Ryan reported desktop notifications had stopped firing. Investigation found
`.claude/settings.local.json` — the untracked, gitignored, personal-only file that wires
`.claude/hooks/notify.sh` to `PreToolUse(AskUserQuestion)`, `PreToolUse(ExitPlanMode)`,
`Notification`, and `Stop` (see `project_macos_notification_bridge.md`) — was completely
absent from `/workspace/.claude/`. `notify.sh` itself was intact and worked correctly
when invoked directly; the queue directory was simply empty because Claude Code had
nothing telling it to call the hook at all.

**Root cause not found.** Checked and ruled out: no `git clean` in recent shell history;
the file was never actually committed with hook content (its last *tracked* version,
visible in `git show f79dba7`, only ever held a permissions allowlist, predating the
hooks — the hooks were added to the working copy in the same PR that untracked the
file, so they never touched git history at all and aren't recoverable that way).
`/workspace` is a genuine host bind mount, so an ordinary container restart shouldn't
touch it. COO recreated the file from the architecture documented in
`project_macos_notification_bridge.md` and confirmed `notify.sh` fires correctly again;
whether Claude Code needs a session/window reload to pick up a hooks file rewritten
mid-session (vs. re-reading it live) is also untested — Ryan confirmed "working again"
afterward, but the mechanism wasn't isolated.

**Direct implication for D-10 (OneDrive migration, in progress):** because this file is
gitignored by design, the recommended `git clone` migration method will **not** bring it
along automatically — same category as `.env.local`, which the runbook already handles
via manual copy. **The runbook needs this same manual-copy step added for
`.claude/settings.local.json`**, or the new clone will have the identical
notifications-silently-stop symptom on first use, indistinguishable from a recurrence of
this same mystery. Not yet added to the runbook as of this entry — do before Ryan
executes step 4 (the `.env.local` copy step).

Not actioned beyond the immediate recreate-and-verify — raised for awareness given it
happened once already with no clear cause, and the migration is about to change the
exact filesystem layer (OneDrive bind mount → plain local disk) that's the prime
remaining suspect if it recurs.

**Update 2026-07-23 (D-10 executed):** the runbook gap this entry flagged was closed
before Ryan ran the migration — the manual-copy step for `.claude/settings.local.json`
was added, Ryan copied it alongside `.env.local`, and it verified byte-identical
(same size and mtime) at the new path. Notifications worked immediately post-migration
with no recurrence of the disappearance. This is one clean data point *against* the
filesystem-layer theory (OneDrive bind mount → plain local disk is now the active
layer, and the file has stayed put since) but one clean session isn't enough to close
the root-cause question outright — leaving this open for continued observation rather
than marking resolved. The immediate practical risk (migration losing the file) is
gone either way.

### D-10: Move the project off OneDrive — Ryan flagged this a priority (recurrence)
**Raised:** 2026-07-23

Second occurrence of the OneDrive Files-On-Demand dehydration issue first documented
2026-07-02 (see memory `project_onedrive_dehydration.md`) — this time it corrupted git's
own internals rather than just regular project files: 213 local branch refs got silently
rewritten to the null SHA, which blocked `git fetch`/`git pull` outright
(`fatal: bad object refs/heads/<branch>`) until COO diagnosed and fixed it in-session
(raw `rm -f`/`xargs` on the corrupted ref files, since even `git update-ref -d` hit the
same underlying `EDEADLK` the corrupted files themselves throw on read). Notably, Ryan
had already applied the documented Finder-level workaround ("Always Keep on This Device"
at the top level) after the first occurrence, and it recurred anyway — so that fix is not
durable, just a stopgap.

Ryan's direct instruction this session: "let's make that a priority to move off onedrive."

**Update 2026-07-23 (later, new session):** Planning pass done, execution pending on
Ryan's host. Target path confirmed: `~/Projects/travel-tracker`. Architect-reviewed via
**ADL-39** (`jobs/architect/tech/20260307-architecture-decisions-log.md`, PR #234,
merged) — confirms `devcontainer.json` needs no edit (`workspaceMount` uses
`${localWorkspaceFolder}`), recommends a fresh `git clone` over a physical `mv` (avoids
dragging along the ref-corruption class and 1.7 GB / 33 dirs of orphaned worktrees under
`.claude/worktrees/` — checked this session, none hold unpushed commits), and flagged
two follow-ups: F1 (the notify bridge's hardcoded `WATCH_DIR` — fixed this session, PR
#235, merged) and F2 (the devcontainer's config Docker volume is keyed by
`devcontainerId`, which can re-key on a path move and orphan `/home/node/.claude`
including auto-memory — needs a backup-before/verify-after step, not yet done since
that's host-side). Full step-by-step runbook (backup config volume → clone → copy
`.env.local` → reopen VS Code → verify → reinstall notify bridge → decommission old
folder) handed to Ryan. **Blocking on host-side execution** — everything actionable
from inside the container is done; the physical move, config-volume backup, and VS
Code reopen are all steps only Ryan can run. Not yet closed.

**CLOSED 2026-07-23.** Ryan executed the migration on the host: fresh clone to
`~/Projects/travel-tracker` (confirmed at `a671268`, current main tip at the time),
all four gitignored files manually copied and verified byte-identical to the
OneDrive source (`.env.local`, `.env.agent-diagnostics`, `dev.db`,
`.claude/settings.local.json` — the last one closing D-11's runbook gap, see below),
notify bridge reinstalled and confirmed firing from the new `WATCH_DIR`. Reopened VS
Code at the new path and rebuilt the devcontainer.

**F2 materialized exactly as predicted** — the config Docker volume re-keyed on the
path change: the fresh volume mounted at `/home/node/.claude` had a working
`.credentials.json`/`.claude.json` (re-authenticated this session) but a default-only
`settings.json` (52 bytes) and a completely empty `projects/-workspace/memory/`
directory (`MEMORY.md` and all accumulated user/feedback/project/reference memory
gone). No pre-move backup tarball existed, so recovery went through the orphaned
volume directly: `docker volume ls` surfaced *three* `claude-code-config-*` volumes,
not the expected two (a third, older, unrelated stale orphan with no memory dir at
all — separate cleanup debt, not investigated further). Identified the correct
volumes deterministically via `docker inspect <container_id> --format
'{{range .Mounts}}...'` on both the current and the old (pre-migration,
OneDrive-bind-mounted) containers, rather than trusting ambiguous IDs surfaced via
the Docker Desktop GUI (container ID vs. volume ID vs. image digest all look similar
and were each offered in turn before the deterministic mount-inspection settled it —
see memory `feedback_docker_identity_via_inspect`). Recovered `MEMORY.md` + all 20
memory files via a throwaway `alpine` container bind-mounting both the old (`:ro`)
and new volumes and `cp -a`'ing the memory directory across; diffed the old
`settings.json` against the new default and found them identical, so no loss there
beyond the transient scare.

Post-recovery verification from inside the new container: `git status` clean (bar
one pre-existing benign `drift-ledger.jsonl` line), `npm run type:check:all` clean,
backend tests 538 passed/1 skipped, frontend tests 154 passed. Ryan renamed the old
OneDrive folder with an `OLD-` prefix rather than deleting it immediately — kept, along
with the recovered-from docker volume, as a safety net for a few days before final
decommission (ADL-39's own runbook step). The unrelated third stale docker volume is
noted but not cleaned up as part of this closure.

**Net outcome:** migration complete and verified; F2's risk was real, not
theoretical, and the ADL's own mitigation path (find the old volume, recover
memory/settings) worked as designed once a deterministic identification method was
used instead of the GUI. Worth remembering for any *future* devcontainer/host
migration on this or another project: back up the config volume tarball **before**
the move next time, per ADL-39 F2, rather than relying on post-hoc orphan recovery —
it worked here but only because the old volume happened not to have been pruned yet.

### D-09: COO worktree cleanup can race an agent's own lingering post-report process
**Raised:** 2026-07-22

During the BUG-61 Architect dispatch, the agent's task-notification fired "completed" with
a full self-report (CI still pending at that point, flagged as an open item for COO to
verify). COO acted on that notification independently — checked `gh pr checks 227` directly,
reviewed the diff, merged, then ran routine `git worktree remove` on the agent's worktree as
part of normal close-out. A second, delayed notification then arrived from the *same* agent
reporting that its "execution environment was removed out from under it" mid-poll — i.e. the
agent's own shell was still alive (apparently still trying to poll CI status in the
background) after its first "completed" notification had already fired and been acted on.

No harm resulted — all commits were already pushed before the removal, and COO's own
independent CI check (not the agent's) was what actually gated the merge. But this is a new
variant in the same family as D-08/OP-20: a task-notification marked "completed" does not
guarantee zero live subprocesses remain in that agent's worktree, so cleaning up immediately
after acting on that notification can still collide with something. Open question: does
routine worktree cleanup need a beat of delay after a completion notification (e.g. confirm
no second notification arrives within some window before removing), or is "no harm, agent's
own commits were already safely on origin" sufficient evidence this doesn't need a process
change — per D-03's precedent (single contained incident, not automatically a new rule)? Not
yet decided — raised for Ryan, not actioned.

### D-08: Mid-thread `/workspace` leak — does the isolation guardrail need a fourth clause?
**Raised:** 2026-07-21

During the WP-02 Frontend dispatch (worktree-isolated per the mandatory rule), the agent's
own report flagged that a later `cd /workspace &&`-prefixed `npm install` briefly ran
against the shared COO checkout instead of its assigned worktree — not the first action
(already guarded by the existing "confirm cwd first" rule from OP-20), but a command
mid-thread that explicitly re-targeted `/workspace`. Left stray uncommitted
`package.json`/`package-lock.json` changes in the shared tree; the sandbox's own
worktree-isolation guard caught it and blocked the agent from touching `/workspace`
further (including its own cleanup), so COO reverted the leak by hand
(`git checkout -- package.json package-lock.json`) — no data lost, nothing committed or
pushed from the wrong tree.

This is the same family as OP-20's two 2026-07-20 near-misses, but a new variant: OP-20's
"working-directory confusion" rule only mandates a cwd check as the dispatched agent's
*first* action, which doesn't cover a later command that explicitly hardcodes
`/workspace` in its own invocation. Open question: does this warrant a fourth OP-20-style
guardrail (e.g. "agents must never issue a command with a literal `/workspace` path
prefix — always operate relative to the confirmed worktree cwd"), or is one contained
incident insufficient signal to add another mandatory rule, per D-03's precedent (a
single-incident proposal Ryan declined to adopt)? Not yet decided — raised for Ryan, not
actioned.

### D-04: Clerk API version upgrade practice
**Raised:** 2026-07-21

Ryan noticed the app is pinned to Clerk API version `2025-11-10` while `2026-05-12` is
current. Not a specific upgrade request — Ryan wants this kept as a general note about
upgrade practice (periodically checking for Clerk API version drift and weighing whether
to move), not a scoped task to bump to the latest version now. COO doesn't have visibility
into what actually changed between those two versions (Clerk's docs site isn't in this
container's firewall allowlist) — would need to check Clerk's changelog before any real
upgrade decision. No action until Ryan revisits this.

### D-05: Separate prod/staging Clerk applications
**Raised:** 2026-07-21

Ryan proposed cloning the current Clerk app into a dedicated staging/dev instance,
mirroring the existing Turso prod/staging split, so staging sign-ins don't mix with real
production users. Directionally reasonable hygiene, but flagged as NOT a full fix for
ADL-32 §6's still-open question (whether Clerk's allowed-origins config supports the
dynamic per-PR preview URLs Railway generates) — that's about the app's origin config, not
which app backs it. This is an auth-topology change, so per the standing infra/runtime
guardrail (Architect review before COO acts) it should get a brief Architect pass before
implementation. Ryan said to leave it as an open note for now, not act on it.

### D-06: Add prod Railway domain to this container's firewall allowlist
**Raised:** 2026-07-21

During the BRD-NF09 deploy shakedown (white screen → CSP fixes → API base URL bug), COO
repeatedly couldn't verify the live site directly — `curl https://travel-tracker-
production-241f.up.railway.app` is blocked by this container's own outbound firewall
(`.devcontainer/init-firewall.sh`'s static domain allowlist doesn't include the app's own
public Railway domain, only the diagnostic hosts from ADL-33/OP-21). Every round of
debugging this session depended on Ryan pasting browser console output back and forth.
Adding the domain would let COO fetch the actual served HTML/JS directly next time
(read-only GET requests to a public page — much lower-stakes than the Turso/Railway
credentialed access ADL-33 already granted). Not yet decided — raised, not confirmed
either way by Ryan.

**Update 2026-07-21 (later same day):** hit the same limitation again diagnosing BUG-59
(staging white screen) — worked around it via `railway-query.sh`'s new `logs` subcommand
(deployment console output) plus `turso-query.mjs` instead of hitting the site directly,
and it was sufficient to find the exact root cause without needing the domain allowlisted.
Doesn't resolve the open question, but is a second data point: the Turso/Railway-metadata
diagnostic path has now twice been enough on its own, which may be relevant to how much
this is actually worth adding.

### D-07: `gh` CLI has no persistent auth in this container
**Raised:** 2026-07-21

`gh` was unauthenticated all session — `devcontainer.json` forwards `${localEnv:GH_TOKEN}`
from the host, but it arrived empty (`GH_TOKEN=` with no value), so `gh pr create`/`gh pr
merge` all failed with "not logged into any GitHub hosts" until COO bridged it: extracted
the token VS Code's own git-credential-helper already uses for `git push`/`git pull`
(`git credential fill` for `https://github.com`) and fed it directly to `gh auth login
--hostname github.com --with-token`. That worked for the rest of this session, but it's a
workaround, not a fix — the underlying gap (why `GH_TOKEN` isn't reaching the container
from Ryan's host) is unresolved, and the bridged `gh` auth state may not survive a
container rebuild (untested). Two possible real fixes, neither actioned: (a) Ryan sets
`GH_TOKEN` in his host shell environment before the container starts, so the existing
devcontainer.json passthrough actually has something to forward; (b) bake the
credential-helper-bridge trick into container startup so it's automatic rather than an
ad-hoc COO workaround each session. Not yet decided which, if either, Ryan wants.

### D-16: OP-27 says who reviews and when, but not that the spec's own open questions must be closed first
**Raised:** 2026-07-28

**Trigger, and it was a PO correction of the COO.** Having dispatched the ADL-46 spec brief
(issue #326), the COO announced it would dispatch the OP-27 fresh-eyes reviewer as soon as the
authoring Architect closed out. Ryan stopped it: *"before dispatching the second architect,
let's make sure there aren't any outstanding questions or concerns from the first."*

He was right, and OP-27 as written does not say this. It specifies **who** reviews (a second,
freshly dispatched Architect) and **when** relative to the author (after it closes out fully,
so context is genuinely fresh), but says nothing about the spec's own flagged-open items being
resolved first.

**Why it matters.** ADL-46 shipped with three items the author had deliberately flagged rather
than guessed: a deactivation-scope ambiguity, the pending-city containment rule, and its own
phasing recommendation. Dispatched immediately, the reviewer would have spent its pass
rediscovering questions the author had already surfaced — and worse, reviewing a **D9 the PO
then overrode**, since Ryan chose one-release delivery over the author's phased dispatch. The
whole value of fresh eyes is catching what *nobody* saw; spending it on known gaps is waste.

What actually happened instead: the three items went to the PO, all three were decided, the
authoring Architect amended the spec, and only then was the reviewer dispatched — against a
settled plan, with its §13 confidence register **re-aimed** at what remained genuinely
uncertain. Two of the author's originally-weakest points had been closed by the PO decisions,
so the register would otherwise have pointed the reviewer at resolved questions.

**Proposed amendment to OP-27**, not adopted, for Ryan to accept or reject:

> Before dispatching the fresh-eyes reviewer, resolve the authoring agent's own flagged open
> questions — PO decisions taken, spec amended. The reviewer receives a settled spec, so its
> pass is spent on blind spots rather than on gaps the author already identified.

**COO recommendation: adopt.** It is one sentence, it cost nothing to follow, and the failure
it prevents is silent — a review that comes back clean because it spent itself on the wrong
target looks identical to a review that genuinely found nothing. Same family as OP-27 itself.
Counter-argument worth stating: it adds a PO round-trip before every review, which on a spec
with no open questions is pure latency — so the rule should read "resolve **if any**", not
"always pause".

**Related, recorded here so it survives the session boundary rather than being lost:
BUG-63 has no time pressure.** Ryan, 2026-07-28: *"i've told my friend i'll let him know when
he can test again there is no rush."* BUG-63 stays **P1 on severity** — core function is
completely broken for every non-owner — but there is **no urgency**, and a future session
should not read "P1 + a blocked external user" and panic-dispatch a narrow fix around the
ADL-46 migration. The PO explicitly chose all-in-one delivery knowing the P1 stays live for
the whole build. **This belongs in BUG-63's tracker note and is parked here only because
PR #327 has that same `notes` field open on another branch** — a separate edit would have
guaranteed a merge conflict on one JSON string (the D-13 failure shape). Fold it into the
tracker once #327 merges, then strike this paragraph.

### D-17: ATDD-first (independent acceptance tests before implementation) — ON TRIAL this release
**Raised:** 2026-07-30 · **Status:** TRIAL — **interim verdict POSITIVE (2026-07-31)**, pending
release close (UAT). Promote to ADL on a positive verdict; narrow or drop on a negative one.

> **RELEASE CLOSED 2026-08-01 (main @ 815b650). FORMAL VERDICT NOW DUE — not yet written.**
> The trial's evidence is complete; what remains is writing the verdict and deciding placement.
> Two things the close added, one supporting and one qualifying:
>
> **Supporting — the layered-checks argument now has three data points, not two.** Every stage of
> this release that received an independent critical read produced a real defect that green CI did
> not catch: D13 (backend reverse-door duplicate, COO diff-review), D14 (frontend region selector
> collapsing to zero options, COO diff-review), and **F1** (ambiguous lookups auto-resolved to
> `candidates[0]` and promoted to the shared catalogue — OP-27 fresh-eyes review of the assembled
> release). F1 is the strongest single data point in the trial: it violated two GE-16 success
> criteria verbatim, and it passed a green pipeline *and* the 32-test ATDD suite written expressly
> for this feature. The Architect's ruling on it then surfaced a fourth defect nobody had reported
> — `resolveCityName` marking the happy path ambiguous — which no layer had caught at all.
>
> **Qualifying, and the verdict must say this plainly — the ATDD suite was green for the wrong
> reason in part.** Review F8 (now QUAL-22): the suite's geocoding mock exports only `resolveCity`,
> not `resolveCityName`, so calls to the latter throw and the route's own `try/catch` swallows the
> `TypeError`. Group B therefore passes without exercising what it claims to, and the same weakness
> explains why B4's assertion was too soft to catch the D13 reverse-door. The suite's *provenance*
> held up under scrutiny — git-verified as one commit, never adjusted after the backend landed,
> which is the trial's central claim — but provenance is not the same as coverage, and a verdict
> that reports only the former would be dishonest. **The honest finding is narrower than
> "ATDD works": writing tests first prevented them being bent to fit the implementation, and that
> is worth having; it did not by itself make them good tests.** Whatever gets promoted should carry
> that distinction, and probably a mock-fidelity check, rather than a blanket endorsement.

> **TRIAL UPDATE (2026-07-31) — QA + Backend stages run; both verdict conditions met with margin.**
> The QA-first dispatch produced 32 red acceptance tests (access matrix / D13 / GE-16 containment);
> the Backend stage turned them green **by implementation, with QA's spec file untouched** (verified:
> the file is absent from PR #338's diff). Two real divergences were caught that the implementer's own
> tests would have missed:
> 1. **HC-06 spec-inventory gap** — `owner-access.test.ts`'s `POST /api/cities → 403` block
>    contradicted D4's end state and was missing from ADL-46 §8.2's own file inventory. Would have hit
>    the Backend implementer mid-task as an unauthorised red security check (OP-30). Fed back into §8.2
>    (PR #337) before Backend ran.
> 2. **D13 reverse single-match duplicate** — caught in COO diff-review, NOT by any test: a no-region
>    POST against a region-tier country with exactly one *regioned* row created a duplicate instead of
>    returning it (§4.2.1 "no regression"). **QA's own suite missed it too** (B5 only covered the
>    non-region-tier case), which is the strongest evidence for layered checks — the bug survived to
>    the third layer (implementer tests → independent QA suite → COO review) on the exact path flagged
>    as the trap. Fixed + regression test added (PR #338, commit 7f9a405).
>
> **Cost:** one QA dispatch + one targeted fix-cycle, no rebuilds — proportionate. **Placement on
> promotion is unchanged** (Architect prompt marks each spawned brief ATDD-yes/no; COO one-liner;
> warn-hook backstop). Write the formal verdict + promotion at release close, per the condition above.

> **Process note surfaced during the trial (2026-07-31) — candidate for the promoted rule or a
> sibling D-entry.** An ATDD author reporting its red baseline must **attribute pre-existing failures
> to their root cause, not merely scope them out by file authorship.** QA's first report dismissed 20
> type errors as "not in files I touched" — the right answer, but by the wrong test; PO caught the
> reasoning. Verified correct only by opening all 20 (every one the DB-stage `userId`-NOT-NULL insert
> breakage, one root cause, none in QA's own new file). "Not my files" is a single probe; "all N share
> the expected root cause X" is the verified claim. Same shape as the negative-findings two-probe rule.

**What it is.** For qualifying briefs, dispatch **QA first** to turn the BRD success criteria into
*red* acceptance/integration tests, handed to the implementer as the executable definition of done —
before any implementation. This is **ATDD / acceptance-test-first**, not classic TDD (which is one
developer's red-green-refactor inner loop and is roughly what implementer agents already do). The
value is *independent specification of behaviour*: today the implementer writes both the code and the
tests that certify it, a closed loop where a misread of the spec produces code and tests that agree
with each other and both diverge from intent. An independent QA author breaks that loop — same
philosophy as OP-27 fresh-eyes and the negative-findings two-probe rule.

**Unifying principle.** ATDD-first applies when *a wrong implementation would be silent and
plausible* **and** *the intended behaviour is precisely specifiable in advance* — exactly the case
the implementer's own tests cannot catch.

**The trigger, keyed off Architect involvement (PO's cost insight).** Rather than have the COO
re-read a classification rule every session, ATDD is keyed to **whether the brief went through the
Architect** — because "goes to Architect" already gates on the high-stakes classes:
- Access-matrix / ownership-scoping changes → already require an Architect pass (ADL-27). ✓
- Data-integrity invariants (schema/migration, uniqueness/FK/dedup) → schema changes already require
  Architect review. ✓
- Multi-brief release exposing a contract other briefs consume → an ADL/spec by definition. ✓
- Architect named a "get this wrong and it silently breaks" risk (e.g. ADL-46 D13 find-or-create). ✓

So **ATDD-first = required for the implementation briefs an Architect spec spawns; not required for
briefs that never reach the Architect.**

**One trigger consciously dropped: "rich success criteria but no architecture needed"** — complex
*frontend/behavioural* work (rating filters, date-default logic, the cross-trip city screen) that
legitimately never sees the Architect. Rationale: those failures are **visible and recoverable** (they
surface in UAT), not silent-and-costly like a cross-user data leak, so ATDD's extra dispatch round
doesn't pay back there; they lean on implementer tests + UAT + the OP-32 rule (which forces the test
the *second* time it breaks). **Revisit signal:** if UAT starts catching complex-frontend logic bugs
that slipped implementer tests, promote this trigger back. *This is the one deliberate coverage gap in
the rule and it is recorded as such, not hidden.*

**Why this scales with the worry** (Ryan: complexity → missing more things): the retained triggers are
exactly the classes that grow with the codebase — more routes → bigger access matrix, more tables →
more integrity invariants, more components → more cross-brief contracts. The net widens where it
matters without re-tuning the rule.

**How the trial is assessed (verdict condition, stated up front so it's not "it felt fine").**
Promote to standing policy iff, on this release: (1) QA-first caught **at least one behavioural
divergence** the implementer's own tests would have missed, **and** (2) the extra dispatch round's
cost was proportionate to that catch. If it was pure ceremony (no catch, added latency) → narrow the
triggers or drop it. COO reports this verdict at release close.

**Where it will live, if promoted (placement design agreed; NOT built during the trial — no premature
plumbing for a policy that might get narrowed):**
- **Home = the Architect agent prompt** (`.claude/agents/architect.md`) — loaded *only when the
  Architect runs*, which is *only for complex work* (the whole cost argument). The Architect already
  flags the risk item; this extends that to "for each brief this spec spawns, mark **ATDD-first:
  yes/no**." The flag reaches the COO **pre-set**.
- **COO's part shrinks to one line** — "when a spec marks a brief ATDD-first, dispatch QA before the
  implementer." The only always-on cost, and trivial. Not CLAUDE.md, not a skill.
- **A hook backstop IS wanted** (PO, given how load-bearing ATDD is for the access/data classes):
  a warn hook (negative-findings precedent) firing when a brief body / `gh issue create` / a PR
  touches `schema.ts`, `migrations/`, or `require(Owner|Auth)` **without** a stated ATDD decision.
  It mechanically catches the two highest-stakes triggers even on a brief that somehow bypassed the
  Architect — which is itself a CLAUDE.md process violation, so the hook doubles as a guard for that.
  Warn-not-block first, per the OP-26/OP-28 precedent.

**This release's trial run:** QA dispatched first, off `release/adl46-access-model`, to write red
tests for the intended access-matrix rows (§8), the D13 find-or-create invariants, and the per-user
category/activity route contracts. The Backend brief is gated behind those tests landing.

### D-18: Startup/close-out feel heavy on a bare context-flush `/clear` — gate the audit on "did anything change?"
**Raised:** 2026-07-31 (PO)

**Deciding dimension:** proportionality of a fixed-cost safety audit to variable actual risk — the
audit is priced for the *worst* pickup (cold, unattended, drifted) but runs identically on the
*cheapest* one (a mid-work `/clear` to flush context where nothing changed since the last look).

**The observation.** `/coo-startup` runs 8 checks and inlines a large block of state every pickup
regardless of whether anything changed. Measured token cost of the unconditionally-inlined state
(2026-07-31): UAT log ~7,000 tok (28KB), open-dialogues ~10,650 tok (42KB), drift-ledger tail
~3,000 tok (80 lines), park doc ~1,930 tok, SKILL body ~3,000 tok ≈ **~25.7k tokens inlined at every
startup.** The operational cost (≈4 gh/bash probes + 7 hook-canary probes) is modest; the felt weight
is the token load plus reporting on 8 sections that are mostly no-ops on a clean flush.

**Why it's uniform today.** A freshly `/clear`'d instance cannot introspect whether it's a flush or a
cold start, so the audit trusts nothing and re-derives everything. Correct as a floor — agents only
live during sessions, so an unsurfaced red main / cron flag has no other detector. But the "did the
world change?" signal is cheap to read from durable state, and most checks are defending against a
mutation that one probe against the last `reviewed` sentinel can detect.

**Proposal — gate each heavy check on a cheap trigger probe; keep the two irreducible ones always:**

| Check | Trigger probe (vs last `reviewed`) | If probe empty |
|---|---|---|
| Hook canary (7 probes) | `git diff --name-only <reviewed> -- .claude/hooks/` | skip (or weekly) |
| Drift/subagent audit | ledger scan for `subagent_stop` since reviewed | one-line no-op |
| BRD coverage + lifecycle | `git log <park-base>..origin/main` (anything merged?) | one-line no-op |
| UAT log (de-inline) | grep open `[ ]` / non-PASS **before** reading | don't load full log |
| drift-ledger tail | load entries since last `reviewed`, not fixed 80 | usually <20 lines |

**open-dialogues bloat is a content problem, not a load-gate.** Measured 2026-07-31: Resolved is only
56 lines (3 entries, none moved since 2026-07-20); the 42KB is **oversized Open entries** (D-14 alone
is ~370 lines). So "load Open only" saves ~1k, not the ~5k first estimated. The real fixes are
process, and they're the same discipline that keeps startup lean:
- **Actually run the move-on-resolution step at close-out** (it has lapsed — only D-01/02/03 ever
  moved), and archive resolved entries to a **separate `open-dialogues-archive.md`** (the
  `uat-archive.md` pattern) so the loaded file is Open-only by construction.
- **Keep Open entries terse** — the full analysis lives in the promoted home (ADL/tracker/BRD); the
  entry is a pointer + status, not the essay. Retrofit the existing oversized entries once.

**Always-run floor (never gate):** main-CI status and open cron-flags — one `gh` call each, and the
two things nothing else catches.

**Estimated saving:** from load-gating alone, **~8k tokens/pickup** (UAT log grep-gate ~5–6k +
ledger-since-reviewed ~2k; open-dialogues load-gate only ~1k). Reaching the ~50%/~13k mark requires
the *content* cleanup above — archiving resolved entries out and trimming oversized Open entries —
which is a one-time fix plus a maintained close-out step, not a load-gate. On a clean flush the audit
collapses to three things: main CI, cron-flags, park doc. On a genuine cold pickup the insurance is
unchanged.

**Does it require the PO to declare "this is a flush"?** No — and it must not depend on that. The
durable-state probes are the objective detector and fail *safe* (a forgotten declaration falls to the
heavy path, never skips the audit). A volunteered "just cleared, starting fresh" is welcome as a
corroborating hint that lets the COO trust empty probes faster, but it is never load-bearing, and it
can't lower the always-run floor.

**Matched-pair caveat.** Startup and `/coo-merge-and-close` are a pair — the park doc + restart
preview are what let the next startup trust rather than re-derive. Do not lean out the park doc to
save startup cost; if trimming close-out, trim the tracker/STATUS restatement that duplicates the
park doc, not the park doc itself.

**Status:** analysis complete, not implemented. It's a change to a mandatory skill → wants a D-entry
→ ADL, then edits to `coo-startup/SKILL.md` (de-inline UAT + open-dialogues, add trigger gates) and a
close-out review. COO recommends adopting. Deferred to a session with token headroom.

## Resolved

### D-03: OP-21 process-kill guardrail (proposed, dropped)
**Raised:** 2026-07-20 · **Resolved:** 2026-07-20

During the 2026-07-20 UAT-triage merge batch, an agent resolving a PR conflict ran a
blind `pkill`-style kill matching a generic process pattern and took down the real
`dev:api` server (not worktree-scoped — OS process space is shared across every
worktree in this container). It self-remediated (restarted the server, verified
healthy, no data loss), but COO proposed a fourth guardrail in the OP-19/OP-20 family
(agents must confirm exact PID/ownership before any kill command, not match on a
broad pattern) and separately asked whether the killed process had disrupted Ryan's
own work. Ryan's answer to both: drop it — "I don't touch the dev server while you
guys are working," so the specific exposure this incident showed doesn't apply to his
usage pattern. No CLAUDE.md change made; unlike OP-19/OP-20 (both confirmed as
standing rules), this one didn't clear the bar for adoption. Not re-raised unless a
recurrence actually affects a live PO session.

### D-01: Role system-prompt refresh + `.claude/agents/` custom definitions
**Raised:** 2026-07-19 · **Resolved:** 2026-07-20

Both parts of the proposed fix were carried out in full, all 8 roles (architect,
backend, database, frontend, qa, docs, ux, integrations):
1. Refreshed the git/completion-report sections of every `jobs/<role>/<role>-system-
   prompt.txt` — `git push origin main` direct-to-main replaced with the branch → 
   `/pre-push` → PR (`Closes #N` + BRD section) → CI-log-read (`gh run list` /
   `gh run view --log-failed`) → no-self-merge workflow from CLAUDE.md. Added a
   COMPLETION REPORT FORMAT section (header block: Tracker ID · issue/PR # · BRD
   section · branch) to the 5 roles that lacked one (architect, database, ux, docs,
   integrations) — modelled on the real format already in use in `jobs/COO/inbox/`.
   Backend's format also gained the mandatory security-checklist bullet (auth
   middleware, userId scoping, FK `.notNull()`, referencing OP-06 §2 / ADL-27).
2. Created `.claude/agents/{architect,backend,database,frontend,qa,docs,ux,
   integrations}.md` — each a thin wrapper: frontmatter pins `name` + `model`, body
   gives a one-sentence persona summary and directs the agent to read the full
   `jobs/<role>/<role>-system-prompt.txt` for the complete protocol. Deliberately
   thin rather than duplicating the full persona, so the system-prompt.txt stays the
   single source of truth and can't drift from the agent definition.

Dispatch is now `subagent_type: "<role>"` instead of `general-purpose` + COO
hand-typing an inline persona. Depended on D-02's model-tier decision, resolved
alongside it in the same PR.

### D-02: Model tiering policy
**Raised:** 2026-07-19 · **Resolved:** 2026-07-20

Ratified: implementation roles (backend, database, frontend, qa, docs, ux,
integrations) run on Sonnet 5, encoded in each role's `.claude/agents/<role>.md`
frontmatter. Architect runs on Opus 4.8 — Ryan's call after COO laid out the actual
Opus-vs-Fable tradeoff (cost, positioning, fit for bounded-consultation work vs.
long-horizon autonomous work); Fable 5 was considered and set aside as disproportionate
to Architect's actual job shape here (bounded design review/ADL output, not open-ended
autonomous runs). COO-lane background tasks dispatched via the Agent tool (mechanical/
verification work — CI-anomaly probes, drift-ledger checks, etc., not this interactive
session) stay on Haiku 4.5, per Ryan's explicit instruction to let COO make that call
itself. The live interactive COO session's own model (this conversation) is out of
scope for agent-definition frontmatter — Ryan sets it himself via `/model`.

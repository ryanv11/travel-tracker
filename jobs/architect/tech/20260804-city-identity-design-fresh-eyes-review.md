# OP-27 fresh-eyes review — `20260804-city-name-and-identity-design.md`

**Date:** 2026-08-04
**Reviewer:** Architect (second dispatch, fresh context — no authorship of the design under review, ADL-48,
the QUAL-25 spike, the rejected S0, the 2026-08-03 `place_ref` redesign, or either prior review)
**Under review:** `jobs/architect/tech/20260804-city-name-and-identity-design.md` (on `main` at `aac8323`)
**Branch:** `chore/city-identity-design-fresh-eyes-review`
**Method:** the shipped `POST /api/cities` route executed end to end against a migration-built libSQL database
with only `nominatim-client.js` mocked (the `cities.f1f2-ruling.test.ts` harness pattern), plus the design's
proposed DDL built in a real libSQL database and driven with the **shipped** query text. Probe files were
throwaway and are not committed.

---

## 1. Verdict

> **The design does not stand as briefable in its current form. Its central finding (D3) is correct, new, and
> valuable — and it is not the whole of BUG-75. Two of its recommendations, if briefed as written, ship a
> regression of the same class as the defect being fixed.**

The one-sentence diagnosis:

> **The design changes the key rows are *written* with and leaves the key rows are *read* by exactly as it is.**
> `cities.name + country_code + COALESCE(region_id,0)` remains the read key at `cities.ts:176-187`, which is
> the code that actually decides which city a user gets. Every finding below is a consequence of that split.

Split verdict by stage:

| Stage | Verdict |
|---|---|
| **S1** (BUG-80 display) | **Stands. Brief it.** Verified independently; the surface audit is good and found two surfaces the tracker note missed |
| **S2** (classifier counts distinct places) | **Do not brief alone.** Sound direction, wrong staging, and mis-priced risk — F2, F3 |
| **S3/S5** (`qualified_name`, two partial indexes) | **Blocked.** BRD conflict (F1) and reintroduces arbitrary-pick (F4, F5) |
| **S4** (D8 choice channel) | **Correct, and it is the prerequisite, not the follow-on** — F3, §5 |
| **D11** (BUG-76 hardening) | **Under-scoped** — F6 |

---

## 2. Findings

| ID | Finding | Severity | Blocks |
|---|---|---|---|
| **F1** | D6 permits two resolved cities with the same name, country **and region** — which GE-16's success criteria at v3.16 explicitly require to be *"rejected as a duplicate."* The clause that would have authorised it went out with **withdrawn GE-17** | **HIGH** | S3, S5, the BRD gate |
| **F2** | "S1 and S2 are the whole user-visible fix for the reported defects" is **false for BUG-75.** Executed: with the ambiguous verdict in force, user B still receives user A's row, and is silently repointed to A's town when it resolves | **HIGH** | The design's priority ordering; any brief that ships S2 and closes BUG-75 |
| **F3** | D4's risk table prices over-flagging at *"one unnecessary question to a user."* Executed: an ambiguous row burns `geocode_attempts` 1→5 and is then **permanently pending, never retried, with no user channel until S4** — two stages later | **HIGH** | S2 shipping before S4 |
| **F4** | After S5 the **shipped** step-1 query matches N resolved rows with `LIMIT 1` and no `ORDER BY`. Executed: returns row 1; delete it, returns row 2. Arbitrary-pick — BUG-75's own signature — reintroduced in SQL by the stage meant to fix it | **HIGH** | S5 |
| **F5** | D8's chosen `qualified_name` is not in pass 1's predicate, and pass 1 runs first and returns 200. The user's explicit choice is discarded by the same find-or-create that caused BUG-75 | **HIGH** | S4, S5 |
| **F6** | D11's guard is specified against `nominatim-client`'s pre-filter count, which cannot see `classifyCandidates`' own country-eligibility filter. Executed: 2 settlement candidates in, `eligible=0`, row marked **terminal `unresolvable`** | **MEDIUM** | D11 / BUG-76 |
| **F7** | The pending→resolved collision the design accepts (its probe E) throws from an `UPDATE` with no `try`/`catch`, aborts the rest of that queue pass, and **never increments `geocode_attempts`** — so the row is retried every 15 min forever | **MEDIUM** | S5 |
| **F8** | D7's Option B leaves orphaned claims (`created_by_user_id IS NULL`) outside **both** indexes. Executed: unlimited identical orphan claims accepted — and they are *globally visible* per `cities.ts:60-64` | **MEDIUM** | S5 |
| **F9** | The design's probe G reports `SEARCH … USING INDEX uniq_cities_identity_claim` as verification. That plan belongs to a **different query** than the shipped one. Executed: the shipped step-1 gets `SCAN cities` post-S5 | **MEDIUM** | S5; the design's own verification section |
| **F10** | D6's DDL puts `COLLATE NOCASE` on `name` but not on `qualified_name`. Executed: a one-letter case difference mints a twin resolved row | **LOW** | S3/S5 DDL |
| **F11** | The four-Newport candidate array is **constructed by the author**, not obtained from Nominatim. The 343 km / four-town figure originates in a *gazetteer* measurement (BUG-75 note), not in a Nominatim response | **MEDIUM** | S2 calibration; BUG-75's end-to-end reproduction |

Findings I formed and then **killed** are in §6 — including one I was ready to file as HIGH.

---

## 3. Findings in full

### F1 — D6 contradicts GE-16 at v3.16, and its authorising clause was withdrawn with GE-17 (HIGH)

**The claim.** The design's D6 exists to let four resolved Newports coexist in GB-ENG, distinguished by
`qualified_name`. GE-16's success criteria, at the version the design cites, forbid exactly that.

**Probe — read the BRD at the cited version.** `_project/travel-tracker-BRD.md` is at **v3.16** (header line 3).
GE-16 (line 127) states, verbatim:

> *"**two cities with the same name in the same country but different regions can both exist, while a second
> city with the same name, country and region — or the same name and country where neither has a region — is
> rejected as a duplicate**"*

**Second, independent probe — where the permissive clause lived.** The clause that authorised distinct
same-name/country/region places is in **GE-17** (line 128): *"two genuinely distinct places sharing a name,
country and region are individually selectable and do not collapse into one record."* GE-17 carries a
`> **WITHDRAWN (2026-08-03) — not proceeding … Do not brief from it.**` banner. The v3.16 changelog (line 485)
confirms the withdrawal and states GE-16 is "unaffected" — i.e. GE-16's duplicate-rejection criterion is live.

**Why this matters more than a paperwork gap.** The design's header says *"GE-17 is WITHDRAWN and nothing here
depends on it."* That is not accurate: D6 depends on the *requirement change* GE-17 carried, even though it
depends on none of GE-17's mechanism. The design correctly quotes GE-16's *ask-don't-guess* clause in support
of D4 — but D4 and D6 draw on GE-16 in opposite directions, and only D4's reading survives at v3.16.

**Consequence.** S3 and S5 cannot pass the BRD gate as written. Either GE-16 is amended (a PO decision, and the
same decision the PO already made once and then retired), or the design's answer to same-region duplicates has
to be something other than "let both rows exist." Note that the *third* option — the one the BRD currently
prescribes — is to keep collapsing them and put the distinction in front of the user *before* a row is chosen.
That is D8. See §5.

**Not overstated:** S1 and S2 are unaffected. S2 is *positively* supported by GE-16's ask-don't-guess criterion,
exactly as the design argues.

---

### F2 — S2 does not fix BUG-75's cross-user half. Executed. (HIGH)

**What the design claims.** §4: *"**S1 and S2 are the whole user-visible fix for the reported defects**, and
neither touches the schema. That ordering is the point of this document."* §3.2 Effect: *"No wrong town, at any
point, for any user."* Recommendation box: *"The fix is one rule in one function."*

**What BUG-75 actually is** (tracker, verbatim): *"the second user's find-or-create silently returns the first
user's row, coordinates and all."*

**Probe — the shipped route, executed.** Harness: real `POST /api/cities`, real `findOrUpgradeCity`, real
`classifyCandidates`, real `resolveCity`; only `nominatim-client.js` mocked. To reproduce the *post-D4-fix*
world without editing source, the mock returns a candidate set today's classifier **already** calls `ambiguous`
— so the route takes precisely the step-4c path D4 is designed to force. Verbatim output:

```
[P2a] userA -> 201 {"id":1,"name":"Newport",...,"geocode_status":"pending"}
[P2b] userB -> 200 {"id":1,"name":"Newport",...,"geocode_status":"pending"}
[P2c] rows in cities = 1
[P2d] SAME ROW RETURNED TO BOTH USERS = true
```

With an explicit region selected by both users, identically:

```
[P2e] regioned: A id= 1 201   B id= 1 200   SAME ROW = true
[P2f] rows = 1 [ '1:creator=user-probe-a-…' ]
```

And the payoff — A's shared claim later resolves to one place:

```
[P2g] shared row id 1  B got 1
[P2h] after resolve: Newport resolved 56.44 -2.94 creator=user-probe-a-…
[P2i] user B asked for "Newport" and now holds a row pinned to Newport, Fife, Scotland
```

**Mechanism.** `findOrUpgradeCity` step 1 (`cities.ts:176-187`) is creator-blind **by design and by documented
intent** (`cities.ts:120-128`), and matches on `(name COLLATE NOCASE, country_code, COALESCE(region_id,0))`.
It runs at `cities.ts:299`, **before** `resolveCityName` at `:312`, and returns 200 on a hit. The classifier is
never consulted. D4 changes a function that this path does not reach.

**What the design does and does not say.** §3.3 *does* specify the eventual fix — *"step 1 becomes: match a
resolved row globally, or the caller's own non-resolved row"* — and that is correct. But it is scheduled in
**S5, the last stage**, and the document's headline repeatedly says the schema work is *"the third priority,
not the first."* For BUG-75's cross-user half, the S5 work is not the third priority — it is the **only** thing
that fixes it.

**Credit where due.** D3 is right, and it is a genuine discovery: the *first* user on an empty table is
mis-pinned with no index involved. Nobody had found that. But it is one of the defect's two halves, and the
document's framing ("the fix is one rule in one function") converts a partial fix into a claimed complete one.

**Consequence.** A brief written from §4's ordering ships S1+S2, observes that a single user no longer gets a
wrong pin, and closes BUG-75 while the tracker's own reproduction — second user, silently gets the first's row
— still passes.

---

### F3 — D4's cost of being wrong is not "one question." Executed. (HIGH)

**What the design claims.** §3.2's comparison table gives "Cost of being wrong" for D4 as **"one unnecessary
question to a user,"** and "Human in the loop: yes." That is the argument that survives the
`geocoding.service.ts:97-102` granularity objection, and it is the load-bearing defence of the whole decision.

**Probe — executed, 7 consecutive queue passes over an ambiguous row:**

```
[P4] pass 1: status=pending attempts=1
[P4] pass 2: status=pending attempts=2
[P4] pass 3: status=pending attempts=3
[P4] pass 4: status=pending attempts=4
[P4] pass 5: status=pending attempts=5
[P4] pass 6: status=pending attempts=5     <- no longer selected
[P4] pass 7: status=pending attempts=5
[P4z] FINAL: status=pending attempts=5
```

`resolveCity` calls `incrementAttempts` on the `ambiguous` branch (`geocoding.service.ts:293`), and
`processQueue`'s selector is `geocode_status='pending' AND geocode_attempts < 5` (`:352-354`). Five passes —
about 75 minutes — and the row leaves the queue permanently.

**Why the "human in the loop" column is empty until S4.** The design establishes this itself, forcefully, in
**D8**: *"The entire D14 disambiguation flow is region-keyed, and therefore structurally cannot express this
defect … the frontend has no way to let the user resolve it, and `CreateCitySchema` has no field to send the
resolution back."* I verified both halves: `AddPlaceFlow.tsx:331-340` collects `region_iso` values into the
selector, and `/api/geocode` does return `display_name` per candidate (`geocode.ts:101-108`) which nothing
consumes for disambiguation.

So between S2 and S4 the actual cost of a false-`ambiguous` is a **permanently un-pinnable city the user cannot
repair**, not a question. The design's own D8 finding invalidates its own D4 risk pricing, and the two are
three sections apart.

**And the blast radius is unmeasured.** The design's primary "distinct place" test is distinct `display_name`.
Counter-probe on a plain two-granularity response:

```
[P1c] granularity-variant distinct display_name count = 2 -> design primary test says AMBIGUOUS = true
```

The design's defence is that *"two granularity-variants of one place usually share"* their `display_name`.
**That is an unverified positive claim**, load-bearing, and it is exactly the assumption
`geocoding.service.ts:97-102` was written to protect against. The design flags the *threshold* as uncalibrated
(§7 item 1, Attack 1) but prices the consequence of being wrong at one question. It is not one question.

**Consequence.** S2 must not ship before S4. See §5 for a staging that removes the problem rather than
sequencing around it.

---

### F4 — After S5 the shipped step-1 query becomes an arbitrary pick. Executed. (HIGH)

**Probe.** The design's D6/D7 DDL built verbatim in a real libSQL database; four resolved Newports inserted
(all accepted, as the design intends); then the **shipped** step-1 predicate from `cities.ts:176-187` run
against it, unmodified:

```
=== C. THE SHIPPED findOrUpgradeCity step-1 query, run post-S5 ===
  matching rows total: 4
  step 1 returns -> {"id":1,"qualified_name":"Newport, Isle of Wight, England, United Kingdom"}
  EXPLAIN QUERY PLAN: SCAN cities

  -- after deleting the first row --
  step 1 now returns -> {"id":2,"qualified_name":"Newport, Shropshire, England, United Kingdom"}
```

**Why §3.3's respecification does not cover it.** §3.3 makes step 1 *"match a resolved row globally, or the
caller's own non-resolved row."* That adds creator and status scoping. It adds **no place discriminator** —
and it cannot, because at pass 1 the caller has only a typed query, which is the design's own D1 position
("authoritative for nothing"). So a fully-compliant §3.3 step 1 still matches all four Newports and still has
to pick one. `LIMIT 1` with no `ORDER BY` picks by physical scan order.

**This is the defect being fixed.** BUG-75, verbatim: *"the second user's find-or-create silently returns the
first user's row, coordinates and all."* Post-S5 that sentence is still true; only the reason changes, from
"the index forbade a second row" to "the query cannot tell four rows apart." Today the unconditional unique
index makes at most one match possible, so the missing `ORDER BY` is harmless. S5 removes that guarantee and
does not replace it.

**Also executed — no backfill means the legacy row is a live candidate:**

```
=== D. Legacy resolved rows (qualified_name NULL, no backfill) ===
  legacy resolved Newport/GB/ENG, qualified_name NULL: ACCEPTED
  NEW resolved Newport/GB/ENG with a chain:            ACCEPTED
  step 1 hands out -> {"id":5,"qualified_name":null}   (the un-backfilled legacy row)
```

§4 says *"S5 is a no-op over shipped data and requires no backfill."* The **constraint-validity** half of that
is correct and I verified it (both new indexes are strictly more permissive; no existing row can violate them).
But it is a no-op in a second sense the design does not intend: **the already-mis-pinned resolved rows sitting
on staging and production today are not repaired, are not identified, and remain live candidates for step 1.**
Those rows are BUG-75's actual user-visible damage. The design has no remediation plan for them.

**What the design must specify and does not.** A rule for step 1 when more than one row matches. The honest
answer is almost certainly *return null* — decline, fall through to resolve-then-create, let D4 declare
ambiguity, let D8 ask. That is one sentence, and its absence is the difference between the design fixing
BUG-75 and re-shipping it.

---

### F5 — D8's chosen candidate is not in the identity predicate, so the user's explicit choice is discarded (HIGH)

This is the brief's question 1 — *"what is the identity key after this design, exactly?"* — answered by
execution rather than by reading the schema.

**Write key** (D6): `(name COLLATE NOCASE, country_code, COALESCE(region_id,0), COALESCE(qualified_name,''))`.
**Read key** (`cities.ts:176-187`, unchanged by the design): `(name COLLATE NOCASE, country_code,
COALESCE(region_id,0))`.

D8 has the user pick a candidate and `POST /api/cities` with its `qualified_name`. But pass 1 runs at
`cities.ts:299`, **before** anything reads that field, and its predicate does not contain it. Combined with F4:
the user explicitly chooses *Newport, Essex*, pass 1 matches four resolved Newports on the three-column key,
returns whichever the scan reaches first, and the route replies `200` — never reaching the verification logic
D8 specifies at all.

So the design's answer to *"is `cities.name` still the identity key?"* is **yes, for reads** — which is where
identity is actually decided. D2's conclusion ("shortening was never the error — discarding was") is right
about the *label*, and I agree `cities.name` should stay short. But the brief's suspicion is well-founded: the
design leaves the identity key on the ambiguous field for every lookup, and only widens it for inserts.

**Fix direction** (one line, and it makes D8 coherent): when the request carries a verified `qualified_name`,
that field joins the pass-1 predicate; when it does not and more than one row matches, pass 1 returns null.

---

### F6 — D11's guard cannot see the classifier's own filter. Executed. (MEDIUM)

**What D11 says.** *"A terminal `unresolvable` verdict must never be reachable from a candidate set that our
own filtering emptied,"* with the mechanism specified as: *"`nominatimSearch` computes the pre-filter count for
BUG-79's `truncated` (`nominatim-client.ts:160-161`). Expose 'raw non-empty, filtered empty'."*

**The gap.** That count is computed in `nominatim-client.ts` and covers exactly one filter — `SETTLEMENT_TYPES`
at `:166`. There is a **second** filter of ours, in a different module: `classifyCandidates`' country-eligibility
step (`geocoding.service.ts:127-136`), which drops any candidate whose `countryCode` is null or outside
`permitted`, then returns `{ status: 'unresolved', eligible: [] }` — indistinguishable, to `resolveCity`, from
"Nominatim returned nothing." `resolveCity:276-284` writes terminal `unresolvable` on it.

**Probe — executed.** Nominatim answers with two settlement candidates that pass `SETTLEMENT_TYPES`; the
country filter drops both:

```
[P3a] raw candidates=2, settlement filter passed 2, eligible=0 -> status: unresolvable
```

A guard reading the pre-filter count in `nominatim-client` sees `2` and `truncated`-style signals that are
entirely healthy. The row is terminal anyway.

**UNVERIFIED, stated with its blind spot:** I induced the empty-eligible set with `countryCode: null`
candidates. Whether real Nominatim returns settlement rows lacking `address.country_code` when
`addressdetails=1` is requested is **not verified** — the firewall blocks the host (`.devcontainer/init-firewall.sh`
allowlist; independently re-confirmed by the design and by BUG-76's three probes). What *is* verified, by
execution and by module structure independently of any Nominatim behaviour, is that **`classifyCandidates` has a
second discard path to the same terminal state and D11's stated mechanism sits upstream of it.** D11 should be
worded against the decision point (`classifyCandidates` returning `unresolved` when `candidates.length > 0`),
not against the transport module.

**Interaction with BUG-74, which the brief asked about.** BUG-74 is the same shape one layer up:
`geocode.ts` collapses "upstream failed" and "zero results" into an empty array. D11, BUG-74 and this finding
are three instances of one class — *an empty list carrying two meanings* — and they should be fixed with one
contract change (an explicit reason on the empty case), not three. Fixing D11 alone at the transport layer
would leave the classifier's version live and BUG-74's version live.

---

### F7 — the accepted collision throws into an unguarded `UPDATE` and makes an immortal queue row (MEDIUM)

**Probe — executed** (the design's own probe E, driven with the shipped statement shape):

```
=== E. pending -> resolved transition collision ===
  UPDATE ... SET geocode_status=resolved, qualified_name=<same chain>:
    REJECTED — SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: index 'uniq_cities_identity_resolved'
```

The design accepts this and prescribes *"leave the row `pending`, log it, report the pair. Do not auto-merge."*
I agree with the policy. But the code path it lands in has no handling, and three consequences follow that the
design does not carry:

1. `resolveCity`'s update (`geocoding.service.ts:303-312`) has **no `try`/`catch`**. The rejection throws.
2. `processQueue`'s loop (`:364-368`) is a bare `await` with no per-row guard, so the throw escapes and
   **every remaining pending row in that pass is skipped.** It is caught only at `server.ts:331`/`:338`, which
   logs and returns — so no crash, but a silent partial queue run.
3. **The row never leaves the queue.** `incrementAttempts` is called only on the `error` and `ambiguous`
   branches; the throw happens after both, so `geocode_attempts` stays put and the `< CAP` selector keeps
   re-selecting the row **forever**, spending one Nominatim request per row per 15 minutes against a 1 req/s
   application budget, permanently.

"The detection is free: the index raises it" is true of the *signal* and not of the *handling*. A brief must
carry: wrap the transition update, classify the unique violation distinctly from a real error, leave the row
pending **and take it out of the retry set** (a distinct status or a budget consumption), and emit the pair.

---

### F8 — D7's Option B leaves orphaned claims entirely unconstrained, and they are globally visible (MEDIUM)

D7 is good work — the `COALESCE(created_by_user_id,'')` account-deletion failure is real and I reproduced it
in spirit (Option B's deletions succeed where the design reports Option A's do not). Option B is the right
call. But it is presented with no cost named, and it has one.

**Probe — executed, FK enforcement on:**

```
=== F. Orphan handling ===
  foreign_keys = 1
  DELETE userA: ACCEPTED
  DELETE userB: ACCEPTED
  users remaining: 0
  orphaned claim rows now UNCONSTRAINED (outside both indexes): 2
  insert a THIRD orphan-identical claim (created_by_user_id NULL): ACCEPTED
```

`WHERE … AND created_by_user_id IS NOT NULL` removes orphans from the claim index, and they are not `resolved`
so they are not in the resolved index either. They are in **no** uniqueness constraint. Unlimited identical
`Newport/GB/ENG` pending rows can accumulate — and per `cities.ts:60-64`'s containment rule
(`isNull(cities.createdByUserId)` → visible to everyone) they are **globally visible in every user's search**.

Today the unconditional index makes this impossible. This is a duplicate class S5 creates, and it is a
different one from the resolved-vs-claim twin pair the design does name in §4 note 2. It should be named
alongside it. Per the standing *"don't architect for the current user base"* guardrail I am not discounting it
on today's two-user volume; the trigger is any user deletion.

---

### F9 — the design's probe G validates a query the codebase does not run (MEDIUM)

§3.4 presents, under **"Verified in a real libSQL database, driving the shipped insert shapes"**:

```
G. EXPLAIN QUERY PLAN: SEARCH cities USING INDEX uniq_cities_identity_claim
     (name=? AND country_code=? AND <expr>=? AND created_by_user_id=?)
```

I reproduced that plan exactly — **and only** for a query carrying `created_by_user_id = ?` *and* a
`geocode_status <> 'resolved'` predicate. SQLite will not use a partial index unless the query's `WHERE`
implies the index's `WHERE`, and the shipped step 1 carries neither term:

```
=== G. Claim index vs the SHIPPED step-1 query ===
  shipped step 1 plan:          SCAN cities
  creator+status-scoped plan:   SEARCH cities USING INDEX uniq_cities_identity_claim
                                  (name=? AND country_code=? AND <expr>=? AND created_by_user_id=?)
```

The insert-side verification in §3.4 is sound and I do not dispute it. The *read-side* line is a measurement of
the §3.3 rewrite, presented in a list headed "shipped." That mislabelling is precisely what let F4 and F5
through: the design verified the step 1 it intends to write and never ran the step 1 that exists.

Secondary, and worth a line in any brief: post-S5 the shipped step-1 read is a **full table scan** — the only
index that served it is dropped and neither replacement can take it. On a `cities` table ADL-48 was
contemplating growing to six figures, that is a real regression on the hot creation path, and the design
explicitly records that it took no performance measurement (§7 item 4).

---

### F10 — `qualified_name` is not `COLLATE NOCASE` while `name` beside it is (LOW)

```
=== H. NOCASE on qualified_name? ===
  resolved "Newport, Isle of Wight, England, United Kingdom": ACCEPTED
  resolved "Newport, Isle Of Wight, England, United Kingdom": ACCEPTED
```

Two resolved rows for one place, differing by one letter's case. The design's Attack 2 already accepts
`display_name` drift as producing benign twins; this adds an avoidable source of them, in DDL that would be
copied verbatim into a migration. One word fixes it. (It does not change my F1 verdict on whether the index
should exist at all.)

---

### F11 — the four-Newport case is constructed, and its provenance is a gazetteer, not the geocoder (MEDIUM)

I reproduced the design's headline result exactly:

```
[P1a] region-requested   status= ok  best= Newport, Isle of Wight, England, United Kingdom
[P1b] no-region          status= ok  best= Newport, Isle of Wight, England, United Kingdom
```

**That verifies the classifier's logic, which was never in doubt** — `matches.length >= 1 → ok` is plain on
the page at `geocoding.service.ts:141`. What it does not verify is the premise underneath D3: that
`q=Newport&countrycodes=gb&limit=10` **actually returns four distinct GB-ENG Newports** after
`SETTLEMENT_TYPES` and Nominatim's own ranking. The candidate array was written by the author.

The 343 km / four-town figure traces to **ADL-48's gazetteer measurement** (BUG-75's tracker note: *"The review
measured this against a candidate gazetteer"*), not to a geocoder response — and the same tracker note carries
the methodological warning that ADL-48's most reassuring example (Springfield) was structurally incapable of
exposing the flaw. The symmetric risk applies here: a gazetteer-derived example may not reproduce through a
ranked, limit-10 Nominatim response.

This does not make D3 wrong — the classifier defect is real and provable from the code alone. It means the
worked example is unverified against the actual data source, and it is the *same* uncalibrated-data gap as
Attack 1, so both close with the same probe. Any brief for S2 should treat "reproduce BUG-75 against a real
Nominatim response" as step zero, now that the PO has ruled (v3.16 changelog, GE-17 withdrawal, argument 2)
that the devcontainer firewall should be allowlisted for services we need.

---

## 4. The gate the author set — is deferring the threshold right?

The design declines to invent the "distinct place" threshold and asks for calibration against 30–50 real
geocoder responses first. **The instinct to refuse is right. The framing that makes a threshold necessary is
not.**

A threshold is only needed if the *backend* must decide which candidates are "really" the same place. It does
not have to. The classifier already returns `eligible[]`; the route already holds it; GE-15 and GE-16 already
say what to do with it. A rule that needs no calibration at all, statable from first principles:

> **Ambiguity is not a property of the candidate set. It is the absence of a user decision.**
> If the request does not carry an explicit, server-verified candidate selection, and more than one candidate
> survives the country/region constraint, the verdict is `ambiguous`. Full stop — no distinct-place predicate,
> no coordinate radius, no calibration.

This is what GE-16 already says (*"where a lookup returns more than one candidate the user is asked to choose
rather than one being selected for them"*) and what GE-15 already says (*"where the lookup does not yield a
clear single choice, the value is offered as a visibly tentative suggestion … never committed silently"*).
Neither requirement contains a notion of "distinct place."

The objection at `geocoding.service.ts:97-102` — that counting raw hits marks nearly everything ambiguous —
is **entirely conditional on there being no channel to ask.** Two granularity variants of Zürich presented to a
user are two lines that look nearly identical, and picking either is correct: the "unnecessary question" costs
one tap. It is only catastrophic when, as F3 shows, "ambiguous" means a dead row instead of a question.

**So the recommendation is to invert the staging.** D8 is not the fourth stage and not "Medium confidence, the
least load-bearing decision here" — **it is the prerequisite that makes every other decision cheap.** Ship the
choice channel first; then the classifier can be strict with no threshold, and the schema question (F1) becomes
a genuinely separable, later argument about whether the *catalogue* needs to hold two Newports at all, or only
needs to stop handing the user the wrong one.

One consequence I owe, since it follows from my own recommendation: the **queue** has no user, so a
`pending` row that is ambiguous must stop being retried and start being surfaced as *awaiting a choice*, rather
than burning `geocode_attempts` on a question no background process can answer. That is F3's fix and it is
required either way.

---

## 5. Is the frame still wrong? (the brief's reframe question)

The design reframes once — from the index to the classifier — and that reframe is correct and productive. I
think there is one more, and F1 is the evidence for it rather than my opinion.

**This is a product question wearing a data-model costume.** Every version of this problem so far — the
coordinate bucket, `place_ref`, and now `qualified_name` — has asked *"what key makes two Newports different
rows?"* The BRD, at v3.16, does not ask that. It asks *"what is the user shown, and what do they confirm,
before anything is written?"* GE-16 says same name+country+region collapses; GE-15 and GE-16 both say an
unclear lookup is surfaced as a choice, never committed. **The BRD's answer to four Newports is not four rows.
It is one question.**

That is why F1 exists: the design's central schema change needs a requirement that was withdrawn two days ago,
and the requirement that remains points at the channel the design ranks fourth.

It is also, I think, why two well-engineered designs failed here. They were three answers inside one frame, and
this document's genuine contribution — D3 — is the first finding in the sequence that *left* the frame. It then
stepped back into it for D5/D6/D7. The reviewer's version of the PO's *"why not just store a cities list in a
DB table?"* is: **why does the catalogue need to represent four Newports at all, if the user is asked which one
they mean before a row is chosen?**

That question should be put to the PO before S3/S5 is briefed, because it may retire them the way ADL-48
retired most of its own problem space.

---

## 6. Findings I killed before filing

Disproving my own is the standing rule; these are the ones that did not survive.

1. **"S5 is index-only and never changes `findOrUpgradeCity`, so the cross-user merge is never fixed."** I was
   ready to file this HIGH off §4's S5 row (*"Swap … for the two partial indexes"*). **Wrong** — §3.3 does
   specify the step-1 rewrite, in prose, two sections earlier. The finding survives only in the much narrower
   form F2 takes (a staging and priority claim, not an omission). Had I filed the original I would have
   repeated the exact failure this review exists to catch.
2. **"S5's new indexes could reject existing rows, so §4's no-backfill claim is unsafe."** **Disproved by
   probe** — both indexes are strictly more permissive than the one they replace (a column added, plus a
   restricting `WHERE`), and both were created successfully over pre-existing data. The design's argument is
   correct. The *separate* problem, which does survive, is that no-backfill leaves legacy rows un-remediated
   (folded into F4).
3. **"D7's Option B breaks BUG-33's same-user duplicate guard."** **Disproved by probe** — the same-user
   duplicate is still rejected; only NULL-creator rows fall out. F8 is the smaller true finding that remains.
4. **"D9/BUG-80 is overstated — the region is not really joined already."** **Disproved by reading the code**:
   `repositories/trips.ts:341-353` does select `regions.iso3166_2` and `routes/trips.ts:235-244` does drop it,
   exactly as claimed. I also confirmed the design's two additions beyond the tracker note —
   `TripCard.tsx:125` renders a bare `{p.city.name}`, and `CityItemsPage.tsx:105-110` renders name + country
   from router state seeded by `PlaceSection`. Both reproduce the defect and neither is in BUG-80's note.
   **§5's surface audit is the strongest part of the document** and its four traps are real: I confirmed
   `formatCitySubtitle` (`AddPlaceFlow.tsx:44-51`) returns `city.country_code`, so lifting it onto
   `PlaceSection.tsx:154` would regress "United Kingdom" → "GB", and that `region_name` today exists in only
   two backend payloads (`routes/cities.ts:81`, `routes/map.ts:135,172`) — so the null-vs-undefined trap is
   real. **S1 should be briefed as written.**
5. **"D5's tiering makes a row's identity mutate under live `trip_places`, so it needs a repointing plan."**
   Partly right, but the design already handles the write side honestly (§3.5, leave pending, don't auto-merge,
   the F3-objection answer about one key per tier is sound). The *real* residue is that `trip_places` from a
   second user can be attached to a claim before it resolves — which is F2, not a separate D5 defect. D5's
   reasoning is the best-argued section in the document and I could not break it on its own terms.

---

## 7. What a brief needs, if the COO proceeds

- **Brief S1 (BUG-80 display) now, as written.** It is independently verified, decoupled, and its trap list is
  accurate. Note only that `GET /api/cities/:id` (`cities.ts:409-431`) is a sixth city-shaped payload without
  `region_name`, and §5 trap 3's "fix all five together, or none" should count it.
- **Do not brief S2 alone.** Pair it with the choice channel, or it converts wrong pins into dead rows (F3).
- **Do not brief S3/S5 until GE-16 is settled** (F1). That is a PO decision, not an Architect one.
- **If S5 proceeds regardless**, it must additionally specify: pass-1's behaviour on multiple matches (F4),
  `qualified_name` in the pass-1 predicate when supplied (F5), transition-collision handling and retry-set
  removal (F7), the orphan duplicate class (F8), an index that serves the shipped read (F9), `COLLATE NOCASE`
  on `qualified_name` (F10), and a remediation pass over already-mis-pinned resolved rows (F4).
- **Re-word D11 against the decision point, not the transport module**, and fix it together with BUG-74 (F6).
- **Reproduce BUG-75 against a real Nominatim response before calibrating anything** (F11), now that the
  firewall allowlist is a sanctioned route.

---

*No source file, schema, migration, BRD text, tracker entry, ADL, prior design or prior review was edited by
this review. No remote database was written to. No scanner suppression was added. All probe artefacts —
a Vitest route probe under `src/backend/routes/__tests__/` and a libSQL DDL script — were throwaway, were run
from inside this worktree, and were deleted before commit; every verbatim block above is their output.*

# OP-27 fresh-eyes review — the BUG-75 city-identity re-design

**Date:** 2026-08-03
**Reviewer:** Architect (second, fresh dispatch — no authorship of ADL-48, the QUAL-25 feasibility spike, that
spike's OP-27 review, the rejected S0, or the document under review)
**Under review:** `jobs/architect/tech/20260803-BUG75-city-identity-redesign.md` (on `main` at 2f4f387, PR #372)
**Tracker:** BUG-75 · QUAL-25 · ADL-48 · BRD GE-12/GE-14/GE-15/GE-16/GE-17/GE-18 (v3.14)
**Branch:** `chore/bug75-redesign-fresh-eyes-review`
**Status:** Complete. Verdict in §1. No schema change, no migration, no code change, no remote write.

Every finding below was established by running code in this worktree — a real libSQL database carrying the
**proposed** indexes, driven by a faithful transcription of the **shipped** `POST /api/cities` handler — or by
re-deriving dataset figures from the packages themselves. Where I could not establish something I say so and
name the blind spot. **Six of my own suspicions were disproved by probing and are recorded in §4**, including
one I expected to be the headline finding.

---

## 1. Summary table and verdict

> ## VERDICT: **The design's core stands. It is NOT safe to brief as written.**
>
> **D1, D2, D3, D5, D6, D10 stand and are unusually well evidenced.** I set out to break the measured
> claims and failed: the natural-key uniqueness, the hash-width table, the collision-key table, the GB
> figures, the 0.475% churn and every `all-the-cities` figure reproduced **exactly**, independently, from
> the packages. The reframe from "no stable id" to "no *id column*, but a natural key" is correct, and
> §7's disproved-findings section is honest work. **D6 in particular is safe to act on** — I stress-tested
> the 97.78% and it does not depend on the tolerance that its own caveat worries about (§4.2). The PO's
> earlier approval of the `all-the-cities` swap should be reversed with confidence.
>
> **Two blockers stop it being briefed.**
>
> **R1 is the one the author asked for and did not expect to be found.** The document's Attack 1 asks a
> reviewer to construct a `POST /api/cities` sequence yielding a duplicate. There is one — several — but
> worse than that, **there is a sequence that yields a wrong town.** Step 0d adopts a `pending` row and
> stamps it with a *specific* place's `place_ref` and coordinates. A `pending` row is created by step 4c
> precisely when the geocoder returned **`ambiguous`** — i.e. exactly when the name has several real
> referents. Adoption therefore collapses a recorded ambiguity into an arbitrary answer, moves an existing
> trip's map pin, and conflates two trips onto one row. **That is BUG-75, re-created by the fix.** The
> document's Attack 3 anticipates the shape but rules it "inherited, not widened" and "the least
> load-bearing decision in the document." Both judgements are wrong: D13 step 2 fills a NULL region;
> step 0d decides *which town*. It is the most load-bearing decision, and it must be flipped before brief.
>
> **R2 is structural and mechanical.** `gazetteer_cities` does not exist in this codebase (three probes,
> §3.2). Step 0b reads it. The E-sequence never creates it — that is ADL-48 S2, which is absent from the
> table. **E2 as written is not implementable, let alone independently deployable**, which is the property
> ADL-47 requires of every stage.
>
> **And one framing correction that changes what E3 should contain.** The document proposes an *opaque*
> discriminator and never addresses the read path. GE-17 requires same-name results to be presented
> **"distinguishably"** — the BRD's own word. The design mints three `Newport / GB / GB-ENG` rows that
> `GET /api/cities` renders identically (§3.5, measured against the shipped projection). Meanwhile the
> geocoder **already fetches a human-readable discriminator today and throws it away** (§3.6): the
> Nominatim client already sends `addressdetails=1` and already parses `display_name` into
> `NominatimCandidate.displayName`, which is never persisted. That is a cheaper fix for the live defect,
> it needs no dataset at all, and it satisfies the display criterion an opaque ref cannot.

| # | Finding | Severity | Blocks |
|---|---|---|---|
| **R1** | **Step 0d produces a WRONG TOWN, not just a duplicate.** It adopts a `pending` row — which step 4c creates precisely on the geocoder's `ambiguous` verdict — and stamps it with one specific place's ref and coordinates. Reachable same-user; also cross-user via the permanent `created_by_user_id IS NULL` branch. Verified end-to-end | **BLOCKER** | D4 / E2 / E3 |
| **R2** | **E2 is not implementable.** Step 0b dereferences `gazetteer_cities`, which does not exist and which the E-sequence never creates (it is ADL-48 S2, uncounted). "Inert until a client sends one" is not the property claimed: a `place_ref` in E2 is a 500, not a 400 | **BLOCKER** | E2 sequencing |
| **R3** | **The read path is unaddressed, and GE-17 says "distinguishably".** The design multiplies rows in `cities` and adds only an opaque hash. The shipped search projection returns three identical `Newport/GB/reg1` rows; trip display renders city+region+country (BUG-72). No renderable discriminator is added anywhere | **MAJOR** | E3 scope |
| **R4** | **A cheaper fix exists and the gazetteer frame excluded it.** `nominatim-client.ts:121` already sends `addressdetails=1`; `:165` already parses `display_name` into `NominatimCandidate.displayName`; nothing persists it. Persisting a locality-detail string and keying on it fixes BUG-75 on the geocoder path with no dataset, no hash, no S2/S3 — and is renderable, so it also closes R3 | **MAJOR** (framing) | E3 scope |
| **R5** | **Attack 1 is understated: the duplicate is structural, not contingent on "a policy bug".** Step 0d cannot adopt a `resolved` row, and `resolved` is the modal end state. Every pre-existing geocoder-resolved city gets a gazetteer twin the first time anyone selects it. Nothing in E1–E4 detects or reconciles the pair | **MEDIUM** | pricing / E3 |
| **R6** | **Refresh duplicates are 67% exactly repairable, and §5 rejects repair on a false premise.** Measured over real monthly rebuilds: 67.3% of vanished refs are coordinate nudges where the place is *still present* under an exact same `(country, admin1, admin2, name)` key. That re-key is not "a fuzzy-matched write" — it is an equality join, unambiguous for ~99.3% of cases | **MEDIUM** | §5 wording |
| **R7** | **`place_ref` needs a format contract; several degenerate values pass the CHECK.** `'cj1:'`, `' '` and case-variants (`CJ1:` vs `cj1:`) all pass `length > 0` and both indexes. The design specifies no zod validation, no max length and no case rule for the new field | **LOW** | brief completeness |
| **R8** | **"5× more stable" is not a measurement.** `cities.json@1.1.55` was published **2026-05-28**, four days before 1.1.59 — the window holds three monthly rebuilds, not the "six" claimed; the donor window is 4.5 months. Normalised the ratio is ~1.8× (per release) to ~11× (per month). No decision flips, and the correction runs *against* the document's own conclusion | **LOW** | accuracy |
| **R9** | **0e's country/region source is underspecified and contradicts D12 rule 3's letter.** "INSERT … from the DEREFERENCED ROW" vs. the route's region-tier validation (`cities.ts:281`) and "never override the user's country/region". What 0c does for a region-tier-**disabled** country whose gazetteer row carries an `admin1` is not stated | **LOW** | brief completeness |
| **R10** | **Add a delimiter assertion to the build, not just a collision assertion.** Zero `\|` characters in any field today (measured, all 170,540 rows × 6 fields), so `\|`-joining is safe *in this version*. It is a property of the data, not of the construction, and nothing pins it | **LOW** | S2 build gate |

### Is the design safe to brief?

- **The dataset half — YES, brief it.** D5, D6, D7 and D10 are established. Every figure reproduced. Do not
  re-open the `all-the-cities` question.
- **The write-path half — NO.** R1 is fatal to step 0d as specified and R2 makes E2 non-implementable. Both
  are cheap to fix; neither requires re-designing `place_ref`.
- **Recommended amendments, in order:**
  1. **Delete step 0d.** Always insert. This is the document's own stated alternative (§8 Attack 3) and its
     own severity ordering demands it — §3.3 argues a duplicate is benign and a mis-pin is the real defect,
     then 0d trades the benign failure for the real one. Removing 0d makes step 0 a pure
     `lookup-or-insert` with **no mutation of any pre-existing row**, which is what "immutable identity"
     was supposed to buy.
  2. **Insert the missing stage.** `E2a — gazetteer_cities exists and carries place_ref` (ADL-48 S2)
     between E1 and E2, and state the S1→S2→E2 ordering dependency explicitly.
  3. **Add a renderable discriminator to `cities` in the same migration as `place_ref`** (R3/R4), and
     scope E3 to include the search projection and trip-place display, not just the create path.
  4. **Evaluate R4 before E3.** It fixes the live defect on the geocoder path without the gazetteer, which
     is precisely the decoupling §6 reaches for and could not verify.
  5. R6, R7, R9, R10 are one-paragraph corrections to the brief, not re-designs.

---

## 2. What I tried to break and could not — the design's evidence stands

Recorded first, because the load-bearing measured claims are the ones a reviewer is most obliged to
re-derive, and because a review that only lists faults misrepresents this document.

All figures below were re-derived in a scratch directory from freshly installed packages
(`cities.json@1.1.61`, `@1.1.60`, `@1.1.59`, `@1.1.55`; `all-the-cities@3.1.0`, `@3.0.0`). Nothing is
inherited from the document, ADL-48 or either earlier review.

| Claim under review | Document | My independent re-derivation | |
|---|---|---|---|
| `(country, admin1, admin2, name, lat, lng)` unique over all rows | 170,540 / 170,540, zero dups | **170,540 / 170,540, zero dups** | ✓ exact |
| 32-bit hash collides | 170,533 distinct, **7** collisions | **170,533 distinct, 7 collisions** | ✓ exact |
| 48-bit and 64-bit hash | 0 collisions each | **0 collisions each** | ✓ exact |
| `country\|name` (pre-BUG-33 key) | 156,576 / 8,017 / 21,981 (12.889%) | **156,576 / 8,017 / 21,981 (12.889%)** | ✓ exact |
| `country\|admin1\|name` (today's key) | 168,228 / 2,076 / 4,388 (2.573%) | **168,228 / 2,076 / 4,388 (2.573%)** | ✓ exact |
| `country\|admin1\|admin2\|name` | 169,928 / 584 / 1,196 (0.701%) | **169,928 / 584 / 1,196 (0.701%)** | ✓ exact |
| GB rows unrepresentable under today's key | 193 (4.16% of 4,638) | **165 groups, 358 rows in groups, 358 − 165 = 193 (4.16%)** | ✓ exact |
| `all-the-cities` overlap with `cities.json` | 132,228 (97.78%) | **132,228 (97.78%)** | ✓ exact |
| …coords differ / no match / net rows lost | 306 / 2,699 (2.00%) / 35,307 | **306 / 2,699 (2.00%) / 35,307** | ✓ exact |
| `all-the-cities` population claim is wrong | 110,910 (82%) < 15,000; 22,913 < 1,000 | **110,910 (82%) and 22,913** | ✓ exact |
| `cities.json` full-key churn 1.1.55 → 1.1.61 | 803 / 169,115 = 0.475% | **803 / 169,115 = 0.475%** | ✓ exact |
| `cities.json` admin-key churn, same window | 268 = 0.159% | **268 = 0.159%** | ✓ exact |
| Release cadence: 65 versions, monthly, ~00:40 UTC | 1.1.59/60/61 → Jun/Jul/Aug 1 | **1.1.59 2026-06-01T00:40:02Z, 1.1.60 2026-07-01T00:40:19Z, 1.1.61 2026-08-01T00:28:03Z** | ✓ |
| `all-the-cities`: five versions ever, last 2020-03-18 | — | **1.0.0/2.0.0/2.0.1/3.0.0/3.1.0; 3.1.0 = 2020-03-18T17:52:05Z** | ✓ |

Three code-level claims also hold, checked at source rather than grepped:

- **C3 is sound.** `resolveCity()` writes exactly `latitude`, `longitude`, `geocodeStatus`,
  `geocodeAttemptedAt`, `geocodeAttempts`, `updatedAt` across its four `update(cities)` sites, plus the
  `geocodeStatus === 'resolved'` early return at `geocoding.service.ts:238` and the `pending`-only queue
  selector. None of it touches either proposed index. The F3 objection genuinely is closed.
- **Migration note 3 is correct, and it is the kind of claim that is usually wrong.** The
  `COALESCE(place_ref,'')` form does keep the tail's step-1 lookup indexed. `EXPLAIN QUERY PLAN` against
  the real proposed index:
  ```
  SELECT * FROM cities WHERE country_code=? AND name=? COLLATE NOCASE AND COALESCE(region_id,0)=?
      SEARCH cities USING INDEX uniq_cities_identity (name=? AND country_code=? AND <expr>=?)
  ```
  The expression term is used, not just the leftmost prefix. A `WHERE place_ref IS NULL` partial index
  would indeed have lost this.
- **The empty-string CHECK is load-bearing**, exactly as §2/C1 argues. Reproduced independently.

**§7's disproved-findings section is real work and the 740 → 109 correction is right.** An author who kills
a finding that would have strengthened their own recommendation is an author whose surviving findings are
worth more.

---

## 3. Findings in full

### 3.1 R1 (BLOCKER) — step 0d produces a wrong town, not just a duplicate

**The probe.** I built the two proposed indexes in a real libSQL database and drove `POST /api/cities`
request sequences through a faithful transcription of the **shipped** handler
(`src/backend/routes/cities.ts:165–399` — `findOrUpgradeCity` steps 1/2/2b, the resolve-then-create pass 2,
and the step-4c pending insert) with the document's step 0 (§2/C2) transcribed exactly, including 0d's
scoping clause verbatim. Against the *actual* code, not the document's description of it — that
substitution is what the previous design got wrong.

**The sequence.** One user. No concurrency. No admin action.

```
A: trip to Newport, SHROPSHIRE. Types "Newport", GB, region GB-ENG.
   Nominatim returns several English Newports -> classifyCandidates -> verdict 'ambiguous'
   -> step 4c INSERT pending row #1, place_ref NULL, coords NULL, created_by=A
   -> 201.  trip_place P is attached to city #1.

A: later plans a trip to Newport, ISLE OF WIGHT and picks it out of the gazetteer.
   step 0a  miss (no row carries cj1:2cb3fee5d374543b)
   step 0b  dereferences fine
   step 0c  country GB agrees, region GB-ENG agrees        <- 0c CANNOT catch this
   step 0d  row #1 matches on every clause: same (name NOCASE, country, COALESCE(region_id,0)),
            place_ref IS NULL, geocode_status='pending', created_by_user_id = caller
   -> ADOPT: UPDATE #1 SET place_ref='cj1:2cb3…', latitude=50.70146, longitude=-1.29124,
             geocode_status='resolved'
   -> 200, row #1.
```

Harness output, verbatim:

```
   same row reused? YES — the Shropshire trip is now pinned on the Isle of Wight
   -> cities table now (1 rows):
      #1 Newport/GB/reg1 (50.70146,-1.29124) resolved by=A ref=cj1:2cb3fee5d374543b
```

**Why this is worse than the document's Attack 3 allows.** Three things compound:

1. **The `pending` row is not "under-specified" — it is *known-ambiguous*.** §2/C2 justifies 0d as *"the
   same argument D13 step 2 already makes, one column over: a row with no `place_ref` is an
   under-specified record, not a different place."* That premise is false for the dominant source of
   `pending` rows. Step 4c fires on `unresolved`, `disabled`, **and `ambiguous`** — and the `ambiguous`
   branch (`geocoding.service.ts:296`, `cities.ts:390`) means the route *already computed* that two or
   more real candidates exist and deliberately declined to pick one, deferring to D14. Step 0d then picks
   one. The adoption is most likely to fire exactly where it is most dangerous: same-name places are what
   make a lookup ambiguous.
2. **It is a wider write than D13 step 2, so "does not widen the class" is false.** Read at source, the
   shipped step 2 writes `{ regionId, geocodeAttempts: 0, updatedAt }` (`cities.ts:209`) — it fills a
   **NULL** region on a **region-less** row, a monotone specialisation of an unknown. Step 0d writes
   `place_ref, latitude, longitude, geocode_status='resolved'` on a row whose region **already matched** —
   it asserts *which of several same-named towns this is*, and puts a pin on the map where there was none.
   Same scoping clause, categorically different claim.
3. **The `created_by_user_id IS NULL` branch makes it cross-user.** Probed separately: a pre-existing
   `pending` row with a NULL creator is adopted and repointed by a completely unrelated user.
   ```
   pre-existing pending row, created_by_user_id NULL
   B (unrelated user) picks Newport, Essex from the gazetteer
      200 via 0d-ADOPT -> row#1 ref=cj1:d8dcffdb9ebfcecf coords=(51.98425,0.21355)
   ```
   `schema.ts` documents NULL creator as **permanent and load-bearing** — `ON DELETE SET NULL` regenerates
   it on every user deletion, and `cities.ts:52–59` calls the corresponding branch "load-bearing and
   permanent, not a legacy artefact." So this is not a transitional state that drains away.

**I tried to disprove it four ways and could not:**

- *"`pending` rows are rare."* No. Four separate conditions produce them, one of which is the geocoder
  being disabled — which is the state GE-12 exists to support and the state `GEOCODING_ENABLED=false`
  creates in CI.
- *"0c would catch the mismatch."* No. All four GB Newports carry `admin1='ENG'` (measured), so country
  and region agree for every pair. 0c is structurally blind to the only axis that matters.
- *"The trip's pin was NULL before, so nothing 'moved'."* The pin moved from *absent* to *wrong*, and the
  second trip now shares the row, so the two trips are conflated — which is the BUG-75 symptom verbatim.
  The user has no correction path: GE-16's re-point acts on the *trip place*, not on the city row's now-
  wrong identity.
- *"It is inherited from D13, so it is pre-accepted."* Addressed above — the write is wider.

**Recommended amendment: delete step 0d.** Step 0 becomes `0a lookup → 0b deref → 0c validate → 0e
insert`, with no `UPDATE` of any pre-existing row anywhere on the path. This costs one extra row in
exactly the case where the pre-existing row's identity is genuinely unknown, and it is what the document's
own §3.3 severity ordering demands: *"a duplicate, not a mis-pin. Compare BUG-75, where the failure is a
Shropshire pin on an Isle of Wight trip."* It also makes the design's headline property literally true —
`place_ref` written once at insert, and no pre-existing row mutated at all.

### 3.2 R2 (BLOCKER) — E2 is not implementable, so it is not independently deployable

Step 0b *"dereference `place_ref` against `gazetteer_cities`"* is E2. `gazetteer_cities` does not exist in
this codebase.

**Three independent probes that fail differently:**

1. `grep -rn "gazetteer" src/` → one hit, and it is a *comment* in `startup.service.ts:214` describing the
   ADL-48 pattern. No table, no Drizzle model, no query.
2. Read the enumerated `sqliteTable(` declarations in `src/backend/db/schema.ts` — 21 tables
   (`countries`, `regions`, `cities`, … `users`). No `gazetteer_cities`, no `gazetteer_meta`.
3. `grep -rl "gazetteer" src/backend/migrations/` → no file matches.

The table is **ADL-48 stage S2** (`ADL-48-bundled-gazetteer.md`: *"S2 — Gazetteer table + seed …
new tables … No route reads it yet"*). S2 appears nowhere in the design's §5 stage table, which runs
E1 → E2 → E3 → E4 and first mentions `gazetteer_cities` in E3.

Consequences, in the order an implementer meets them:

- **E2 cannot be written.** A Drizzle query against a table with no schema model is a compile failure, so
  the brief cannot be executed as scoped.
- **"Inert until a client sends one" is not the property claimed.** `POST /api/cities` is open to any
  authenticated user and `CreateCitySchema` would by then accept `place_ref` — so a client *can* send one.
  With no table the outcome is a SQL/ORM error surfaced as a 500, not step 0b's clean fail-closed 400.
- **ADL-47 is not satisfied.** "Each stage independently green and deployable" is the standard the section
  invokes; E2 depends on a stage the table omits.

**Amendment:** insert `E2a — gazetteer_cities + gazetteer_meta exist and carry place_ref (ADL-48 S2)`
between E1 and E2, and record the hard ordering `S1 → S2 → E2 → E3`. ADL-48 §8.1 already states S1 must
precede S2 for an unrelated reason; this adds the second edge.

### 3.3 R5 (MEDIUM) — Attack 1's duplicate is structural, not contingent on "a policy bug"

The document's own defence of Attack 1 is: *"A policy bug still yields a duplicate. It no longer yields a
wrong town."* The first half is too generous to itself. **No policy bug is required.** Two sequences,
both run:

```
A1  A types "Newport" GB/GB-ENG; geocoder RESOLVES (the ordinary success path, step 4b)
       201 -> #1 Newport/GB/reg1 (52.76684,-2.37734) resolved ref=null
    A later picks "Newport, Isle of Wight" from the gazetteer
       201 via 0e-INSERT -> #2 Newport/GB/reg1 (50.70146,-1.29124) resolved ref=cj1:2cb3…
    two rows, one user, no bug

A2  A types "Newport"; geocoder offline -> pending #1 (created_by=A)
    B picks "Newport, Isle of Wight" from the gazetteer
       0d declines on created_by_user_id — B is not A
       201 via 0e-INSERT -> #2
    two rows, two users, no bug
```

A1 is the important one. Step 0d's status whitelist is `('pending','unresolvable')`, so it **can never
adopt a `resolved` row** — and `resolved` is the modal end state of every successfully created city. So
every city already in the catalogue via the geocoder acquires a gazetteer twin the first time any user
selects the same place from the bundled list. This is not a migration-window artefact that drains away:
the geocoder path stays live permanently for names the gazetteer search does not surface (variant
spellings, diacritics — see GE-17's own unaccented-search criterion), and each such row is a future twin.

I am **not** arguing 0e is wrong here. Merging would be a guess about which Newport row #1 is, and guessing
is the defect. The finding is that the document prices this as contingent when it is designed behaviour,
and that **nothing in E1–E4 detects or reconciles a twin pair.** The dangling-ref report in §5 does not
find them — both refs resolve; one row simply has none.

Ask the brief for: a detection query for `(name NOCASE, country_code, COALESCE(region_id,0))` groups
holding both a NULL-ref and a non-NULL-ref row, reported to a human on the same footing as the dangling-ref
report. Cheap, and it turns an invisible accumulation into a visible one.

*Scale note, stated with its denominator, per the document's own discipline:* `cities` holds 3 rows in
staging and 2 in production today, so the transition cost is currently nil. Per the standing "don't
architect for the current user base" rule that is a reason to record the trigger, not to skip the design.

### 3.4 R6 (MEDIUM) — refresh duplicates are two-thirds exactly repairable

**What I measured.** The document's churn figure is one version pair. I ran the real monthly cadence, and
also decomposed *what kind* of change each vanished key represents — which is the part that determines
whether a repair is possible.

```
1.1.59 -> 1.1.60  (2026-06-01 -> 2026-07-01, one monthly rebuild)
  full-row keys 169,140   vanished 640 (0.378%)
     coordinate/admin2 NUDGE, place still present : 432
     genuinely removed                            : 208

1.1.60 -> 1.1.61  (2026-07-01 -> 2026-08-01, one monthly rebuild)
  full-row keys 170,114   vanished 160 (0.094%)
     nudge 108 · removed 52

mean per monthly rebuild                    : 0.236%
naive 12-month compounding                  : 2.80%
held-out check, 1.1.59 -> 1.1.61 observed   : 0.468%   (compounded prediction 0.472%)
share of dangles that are a NUDGE (59->61)  : 67.3%
```

**Two conclusions, and the first is favourable to the design.** I expected the year-scale answer to be
bad and it is not: the compounding model is validated against a held-out two-release observation (0.468%
observed vs 0.472% predicted), so the process is close to release-independent and **~2.8% of refs minted
today dangle within a year.** That degrades gracefully. It answers the brief's question directly. The
caveat is variance, not level: 0.378% and 0.094% are a 4× spread across two consecutive rebuilds, which
is Attack 2's concern and is real at n=2.

**The second conclusion corrects §5.** *"An automatic re-key is a fuzzy-matched write against user
data running unattended."* For **67.3%** of cases it is nothing of the sort. Those are coordinate nudges —
the same real place, still present in the refreshed gazetteer, under an identical
`(country, admin1, admin2, name)`:

```
AT|03|302|Viehofen        48.21667,15.61667 -> 48.229,15.643
AT|08|802|Möggers         47.56667,9.81667  -> 47.56242,9.81696
BY|06||Bobruysk           53.14636,29.20552 -> 53.14676,29.20548
```

That re-key is an **equality join on four exact string fields**, not a fuzzy match. It is ambiguous only
where the admin key is itself non-unique — 584 groups out of 170,540, so unambiguous for ~99.3% of nudge
cases. **Recommend: auto-repair the exact-admin-key single-match case; report the rest.** The distinction
matters because a nudge is precisely the case that mints the duplicate in R5's shape, and leaving it to a
human means the duplicate is live in the meantime.

I checked whether this reopens the rejected idea of keying on the admin tuple alone. It does not — §3.5's
rejection is correct (584 dup groups; I reproduced it), and repairing *after* a nudge is not the same as
keying on a non-unique tuple *before* one.

### 3.5 R3 (MAJOR) — the read path is unaddressed, and GE-17 says "distinguishably"

The design is specified end to end for the write path and says nothing about the read path, while
deliberately multiplying rows in `cities`. Two BRD criteria live on the read path.

GE-17, quoted from the BRD at v3.14:

> searching a name that matches bundled cities in more than one country or region presents all of them
> **distinguishably** and selects none automatically; **two genuinely distinct places sharing a name,
> country and region are individually selectable and do not collapse into one record**

The design's control case, run to completion, and then passed through the **shipped** search projection
(`cities.ts:75–90`, which selects `id, name, country_code, region_id, region_name, region_iso, latitude,
longitude, geocode_status`):

```
{id:1, name:"Newport", country_code:"GB", region_id:1, latitude:50.70146, longitude:-1.29124}
{id:2, name:"Newport", country_code:"GB", region_id:1, latitude:52.76684, longitude:-2.37734}
{id:3, name:"Newport", country_code:"GB", region_id:1, latitude:51.98425, longitude:0.21355}
```

Three rows the user cannot tell apart. GE-14 mandates that the *existing* city database is searched first,
so this surface is on the primary path, not a corner of it. BUG-72 added `region_name`/`region_iso`
specifically so places render as "city, region, country" — which is now ambiguous for exactly the rows
this design creates.

**The design's own best insight is not carried into the schema.** §3.4 says it plainly: *"`cities.json`
has always carried the discriminator; the app throws it away."* But what reaches `cities` is a **hash of**
the discriminator, and a hash cannot be rendered. The discriminator itself is available and human-readable:
`cities.json` ships `admin2.json`, and of the 33,262 distinct `admin2` codes actually used by city rows,
**33,180 (99.75%) resolve to a name** — `GB.ENG.G2 → Isle of Wight`, `GB.ENG.O2 → Telford and Wrekin`,
`GB.ENG.E4 → Essex`, `GB.ENG.E1 → East Riding of Yorkshire`. Those are the four Newports, distinguishable.

**A qualification I owe the document.** Disambiguation could be argued to belong to the *gazetteer* search
surface, which can render `admin2` without any change to `cities`. That is true for the moment of
selection. It is not true afterwards: once three Newports are rows in `cities`, GE-14's existing-catalogue
search, the trip-place display, and every subsequent re-selection all read `cities`. The design does not
say which surface owns disambiguation, and that omission is the finding.

**Amendment:** add a renderable discriminator column to `cities` in the same migration as `place_ref`
(the `admin2` name for gazetteer rows), and scope E3 to the search projection and trip-place display, not
only the create path.

*Related sparsity check, because it is the obvious objection to leaning on `admin2` and I ran it:* of the
4,388 rows in collision groups under today's key, **92.43% carry a non-empty `admin2`**, and in GB it is
**100%**. `admin2` is populated where it matters. Adding it fully separates 1,492 of 2,076 collision groups
(71.9%); 1,196 rows (0.701% of the corpus) still need coordinates to separate — which is the same 0.701%
§3.5 already reports.

### 3.6 R4 (MAJOR, framing) — a cheaper fix exists, and the gazetteer frame excluded it

The brief asks whether there is a cheaper design that fixes the live Newport defect with no dataset at all.
There is, and the evidence for it is sitting in a file the document says it read end to end.

**Established positively, at source:**

- `src/backend/services/nominatim-client.ts:121` — every Nominatim request already forces
  `addressdetails: '1'`. The extra data is **already being fetched today**, on every geocode.
- `nominatim-client.ts:165` — `const displayName = raw.display_name ?? raw.name ?? ''`, assigned to
  `NominatimCandidate.displayName`. Nominatim's `display_name` for a settlement carries the full
  administrative chain ("Newport, Isle of Wight, England, United Kingdom"). **The discriminator is already
  parsed into a typed field today.**
- Nothing persists it. `grep -rn "displayName" src/` returns only `shading_config`'s unrelated
  `display_name` column and its route; and both `insert(cities)` sites (`cities.ts:339–352`, `:363–374`)
  write no detail field. So it is fetched, parsed, and discarded.

**The design that follows.** Add `cities.locality_detail TEXT` (nullable), populate it on the geocoder path
from the address detail already in hand, include it in the identity key, and render it. That:

- **fixes BUG-75 on the geocoder path with no dataset, no gazetteer, no hash, no ADL-48 S2/S3 dependency
  and no new package** — i.e. it is the decoupling §6 reaches for, without §6's unverifiable premise;
- produces a **renderable** discriminator, so it closes R3 at the same time, which `place_ref` cannot;
- is **more stable than a coordinate-bearing key** — administrative names churn at 0.159% against the
  full key's 0.475% over the same window (measured, §2);
- composes with `place_ref` rather than replacing it. Gazetteer rows still want an immutable reference;
  this is the tail's discriminator and the display layer's.

**Why the document missed it, which is the more useful half of this finding.** §6 reads
`RawNominatimResult` (`nominatim-client.ts:68–79`) end to end and reports, correctly, that it declares no
OSM identifier. Lines 71 and 75 of that same interface are `display_name?` and `address?`. The search was
for an **id**, because the frame is *"identity must be an opaque reference"* — so a human-readable
discriminator in the same interface did not register. §6 then flags the OSM path and marks it
**UNVERIFIED** because a live Nominatim call is firewalled here. The `display_name` path needs no live
call: the request parameter and the parse are both in the repository, verifiable now.

**What is unverified, and its blind spot.** Whether `addressdetails=1` returns a `county`/`state_district`
field densely enough to be a reliable *structured* discriminator is **UNVERIFIED** — probe run: read the
client and the parsed `address` type (which currently declares only `country_code` and `ISO3166-2-lvl4`);
blind spot: I could not observe a live response, as the host is firewalled from this container. The
*unstructured* `display_name` is verified present and parsed, so the weaker version of this design (store
and render the display string) needs no further probe; only the stronger version (key on a structured
county) does. **Probe to close:** one Nominatim call from an unfirewalled machine, which would also close
§6's item 2 in the same request.

I am not proposing this replaces the design. I am proposing the COO evaluates it **before E3**, because it
may fix the defect the BRD calls out — *"the BUG-75 defect, live in shipped code today and not
gazetteer-specific"* (v3.14 changelog, PO-originated) — months earlier and more cheaply than E3 can.

### 3.7 R7 (LOW) — `place_ref` needs a format contract

The document establishes that `place_ref = ''` is a real hazard and closes it with
`CHECK (place_ref IS NULL OR length(place_ref) > 0)`. Correct, and I reproduced it. The brief asks whether
other values share the property. Run against the proposed CHECK and both proposed indexes:

```
place_ref='cj1:'                    ACCEPTED   <- namespace prefix, no payload
place_ref=' '                       ACCEPTED   <- whitespace only
place_ref='CJ1:2cb3fee5d374543b'    ACCEPTED } both stored; the partial unique index is
place_ref='cj1:2cb3fee5d374543b'    ACCEPTED } BINARY-collated, so these are two rows for one place
```

Step 0b's dereference would reject all four in the normal flow, so severity is low — but the design
specifies **no validation at all** for the new request field beyond "add it to `CreateCitySchema`", and
`.strict()` only governs unknown keys, not value shape. An implementer will guess. Specify:

- a format regex — `/^[a-z][a-z0-9]{0,15}:[A-Za-z0-9._:-]{1,128}$/` or similar — in `CreateCitySchema`;
- a max length (SQLite `TEXT` is unbounded; nothing today stops a multi-megabyte `place_ref`);
- a case rule for the **namespace** segment, since `CJ1:` and `cj1:` are distinct to the unique index;
- optionally tighten the CHECK to `length(place_ref) BETWEEN 5 AND 160 AND place_ref LIKE '%:%'`.

### 3.8 R8 (LOW) — "5× more stable" is not a measurement

`cities.json@1.1.55` was published **2026-05-28T14:11:42Z**. So were 1.1.53, 1.1.54, 1.1.56, 1.1.57 and
1.1.58 — six versions inside 87 minutes on one day, a republish burst. The monthly cadence begins at
1.1.59 (2026-06-01). §3.3 describes the 1.1.55 → 1.1.61 window as *"two months, six monthly releases."*
Two months is right; **the window contains three monthly rebuilds, not six.** (Confirming this: 1.1.59 →
1.1.61 gives 0.468% against 1.1.55 → 1.1.61's 0.475% — essentially all of the churn happened after 1.1.55.)

The donor comparison is over `all-the-cities` 3.0.0 (2019-11-04) → 3.1.0 (2020-03-18) — **4.5 months**.
So the "5×" divides a 2.2-month number by a 4.5-month number. Normalised:

| Basis | `cities.json` | `all-the-cities` | ratio |
|---|---|---|---|
| raw window, as the document compares them | 0.475% | 0.089% | **5.3×** |
| per calendar month | ~0.216% | ~0.020% | **~11×** |
| per upstream release | ~0.158% | 0.089% | **~1.8×** |

§7's unverified item 3 flags the incomparability honestly; the stated ratio is then used anyway. **No
decision flips** — D7 rests on the 77.6% coverage cliff and on the failure mode being benign, not on this
ratio — and the correction runs *against* the document's own conclusion, which is the honest direction for
an error to run. Recommend the brief quote "between roughly 2× and 10× depending on normalisation, n=1
per package" rather than "5×".

### 3.9 R9 (LOW) — 0e's country/region source is underspecified

Step 0e says *"INSERT: name/country/region/lat/lng from the **DEREFERENCED ROW**."* Three tensions the
brief must resolve, none of which the document states:

1. **D12 rule 3** — "NEVER overwrite the user-supplied `country_code`/`region_id` with the lookup's"
   (`cities.ts:334–337`, and GE-16's criterion *"the country and region a user explicitly selected are
   never overwritten"*). 0e takes them from the dereferenced row. §2/C2 argues 0c makes this moot by
   400-ing on conflict, and that reasoning is sound — but the *instruction* an implementer reads says
   "from the dereferenced row", and 0c's own definition ("validate the request's `country_code`/`region_id`
   agree") is what has to carry the whole load.
2. **Region-tier-disabled countries.** The route rejects any request carrying `region_id` when
   `region_tier_enabled = 0` (`cities.ts:281`), so such a request has `region_id` NULL — while the
   dereferenced gazetteer row still carries an `admin1`. Does 0c 400 that as a conflict? If yes, **every
   non-region-tier country breaks on the gazetteer path.** If no, the rule needs stating.
3. `created_by_user_id` is not mentioned in 0e at all. It should be set to the caller, for consistency
   with 4b/4c and with GE-16's containment story.

### 3.10 R10 (LOW) — assert the delimiter, not only the collision

The brief asks whether two different field tuples can serialise to the same string. **Not in this version:**
across all 170,540 rows and all six fields, **zero values contain `|`** — measured field by field — and
`distinct tuples = distinct serialised strings = 170,540`, so the serialisation is injective today.

But that is a property of the *data*, not of the *construction*, and nothing pins it. A future upstream row
with a `|` in its name would silently collapse two places onto one `place_ref`, which is the one failure
mode `place_ref` exists to prevent, and the proposed build-time collision assertion would catch it only
by luck (both tuples must be present in the same build). §3.4 already recommends adding a zero-collision
assertion to `scripts/generate-gazetteer.mjs`; add a second, cheaper one beside it: **assert no field
contains the delimiter** — or remove the possibility entirely by length-prefixing each field, or by
joining on the control character `U+001F` that cannot appear in this data. Costs one line and makes the
property structural rather than incidental.


---

## 4. Disproved — my own findings, killed before filing

Recorded because a review that reports only its hits misrepresents its own confidence, and because the
document under review set this standard in its §7.

1. **"`admin2` will be sparse in exactly the countries where collisions are worst, so the 'admin2 is the
   discriminator' narrative is hollow."** This was my headline hypothesis and it is **false**. Measured over
   the 4,388 rows in collision groups: **92.43% carry a non-empty `admin2`**, and in GB it is 100%. The
   12.56% global emptiness is concentrated in rows that do *not* collide. `admin2` is populated precisely
   where it is needed. The narrative holds.
2. **"Step 0 removes the geocoder's 1.1 s chokepoint, so any authenticated user can bulk-publish rows into
   the globally-visible catalogue at HTTP speed."** False. `server.ts:186–192` applies a dedicated
   `citiesCreateLimiter` — 20 req/min — to `POST /api/cities` specifically, independent of the global
   300/min limiter. The throttle is at the route, not at the geocoder. *(Residual nit only, not a finding:
   that limiter's comment justifies itself as "geocoding cost … each city creation triggers geocoding",
   which stops being true on the `place_ref` path. Worth a comment update in the brief under the
   document-lifecycle rule.)*
3. **"The `COALESCE(place_ref,'')` expression index will not be usable for the tail's step-1 lookup, so the
   tail degrades to a table scan."** False, and the document is right. `EXPLAIN QUERY PLAN` shows
   `SEARCH cities USING INDEX uniq_cities_identity (name=? AND country_code=? AND <expr>=?)` — SQLite uses
   the expression term too. §5 note 3 and §7's disproved item 3 are both correct.
4. **"The 97.78% overlap is an artefact of the 0.2° tolerance, which is ~22 km and could absorb genuinely
   different towns."** The document raises this against itself as unverified item 4. I tested the
   sensitivity and it is a non-issue: overlap is 97.34% at 0.02° (~2 km), 97.67% at 0.05°, 97.78% at 0.2°.
   **The figure moves by 0.44 points across a 10× tolerance range.** D6 does not depend on it. I also
   checked whether 97.78% is "doing work a weaker number could not": it is not — the decisive facts are the
   release history (five versions ever, none since 2020-03-18, verified from the registry) and the 82%-
   under-15,000 population mismatch proving it is a `cities1000` extract with a stale description. The
   rejection would stand at 90%.
5. **"A year of monthly gazetteer releases will compound the 0.475% into something ugly."** False. Measured
   per-rebuild churn is 0.236% mean, compounding validated against a held-out observation (0.468% observed
   vs 0.472% predicted for two rebuilds), giving **~2.8% over twelve months**. That degrades gracefully.
   The real residual concern is variance (0.378% vs 0.094% across two consecutive rebuilds), not level.
6. **"Include coordinates only for rows in a residual `(country, admin1, admin2, name)` collision group —
   pay the 0.475% churn on 0.7% of rows instead of on 100% of them."** Tempting, and it would cut churn
   roughly threefold. Rejected on the document's own reasoning: a row unique under the admin key today can
   acquire a same-key sibling in a later release, which would change *its* `place_ref` retroactively. That
   is the same instability §3.5 correctly rejects the deterministic-ordinal idea for. **The document's
   choice to always include coordinates is right**, and the honest observation that survives is only the
   accounting one: coordinates carry roughly two-thirds of the churn while discriminating 0.701% of rows —
   worth one sentence in §3.4 so the trade is visible, not a design change.

---

## 5. Verified vs unverified in *this* review

**Verified, and how:**

- **Every request sequence in §3.1, §3.3, §3.5 and §3.7** — run against a real libSQL database carrying
  both proposed indexes and the proposed CHECK, driven by a transcription of the **shipped** handler
  (`cities.ts:165–399`) with the document's step 0 added. Outputs quoted verbatim, including the
  control case (§3.5's three-Newport catalogue) that the design gets right.
- **Every dataset figure in §2, §3.4, §3.5 and §4** — re-derived from freshly installed packages, over all
  rows, no sampling. Four `cities.json` versions and two `all-the-cities` versions. Nothing inherited.
- **Release dates** — read from the npm registry `time` map, not from the document.
- **`gazetteer_cities`' absence** — three probes that fail differently (§3.2).
- **`display_name` / `addressdetails=1`** — read at source in `nominatim-client.ts`; the non-persistence
  established by a `grep` for `displayName` **and** by reading both `insert(cities)` call sites in full.
- **The rate limiter (§4 item 2)** — read `server.ts:175–192`, including which path each limiter binds to.
- **Index plans** — `EXPLAIN QUERY PLAN` against the real indexes, not reasoned.

**Unverified, with the probe run and its blind spot:**

1. **Whether Nominatim's `addressdetails=1` response densely carries a structured `county` /
   `state_district` (§3.6).** *Probe run:* read the request construction (`:121`), the
   `RawNominatimResult` interface (`:68–79`) and the parse (`:165–173`). *Blind spot:* the host is
   firewalled from this container, so I observed no live response; I am relying on a documented API shape
   for the *structured* half. The *unstructured* half (`display_name` is requested, returned and parsed)
   is verified from the code. *Probe to close:* one Nominatim call from an unfirewalled machine — the same
   call that would close the document's own §7 item 2.
2. **The per-rebuild churn rates in §3.4 rest on two monthly observations** (1.1.59→60, 1.1.60→61). *Blind
   spot:* two points cannot establish the variance of an annual process, and they differ 4×. The
   compounding *model* is corroborated by a held-out pair; the *rate* is not. *Probe to close:* re-run
   across a year of monthly versions once they exist.
3. **§3.1's sequence is established against a transcription of the shipped handler, not by running the
   real Express app.** *Blind spot:* a transcription error could change the result. Mitigated by taking
   each predicate verbatim from `cities.ts` and by the control case (§3.5 / harness A6) reproducing the
   design's own T1/T2 results exactly, which a mis-transcription would have broken. *Probe to close:*
   an integration test once E1/E2 exist.
4. **No timing, memory or scale measurement was taken.** Nothing here is a performance claim.

---

*No schema change was made, no migration generated, no remote database written to, no scanner suppression
added. The document under review, the BRD, `_project/tracker.json`, ADL-48 and the spike/review documents
were not edited — every recommendation above is filed here for COO adjudication. Probe scripts were written
to a scratch directory outside the repository and are not committed.*

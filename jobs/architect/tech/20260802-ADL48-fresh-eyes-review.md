# OP-27 fresh-eyes review — ADL-48 (bundled local gazetteer)

**Date:** 2026-08-02
**Reviewer:** Architect (fresh dispatch; no authorship of ADL-48, ADL-43, ADL-46, the BUG-71 ruling or its review)
**Under review:** `jobs/architect/tech/ADL-48-bundled-gazetteer.md` @ `c315504` (PR #358), its ADL-log entry, and the supersession stamps it placed on `ADL-43-sourced-reference-data.md`, both BUG-71 documents, `jobs/COO/20260731-review-execution-queue.md` and `jobs/COO/open-dialogues.md`
**Branch:** `chore/adl48-fresh-eyes-review`
**Scope:** review only. **ADL-48 was not edited** (OP-28) — findings are filed here for COO adjudication.

---

## 1. Verdict

> ## SHIP WITH CORRECTIONS

**The central decision is sound and it survived a serious attempt to break it.** G1/G6 — gazetteer-first, not gazetteer-only — rests on an empirical coverage claim that I re-ran independently with a probe method the ADL did not use, and it held. So did essentially every dataset number in the document. This is an unusually well-evidenced ADL and I could not find a reason to reverse its recommendation.

**But two findings block briefs as written**, and both live in the implementation detail rather than the decision:

- **F1 (HIGH) blocks S3.** The `cities` D13 identity key cannot represent **5,024 gazetteer rows (2.95 %)**, of which **3,765 colliding groups are more than 10 km apart** — genuinely different towns. §7's headline claim that convergence "happens through the mechanism that already exists" is false for these rows, and §5.3's disambiguation query hides them by construction. Four distinct Newports in England, 343 km apart, collapse to one `cities` row.
- **F2 (MEDIUM-HIGH) blocks S1.** S1 says "hash-gated reseed of `regions`", and §8.1 defines the hash-gated mechanism as `DELETE FROM …` followed by a batch insert. §8.1's safety argument is explicitly *"nothing references `gazetteer_cities`"* — which does not hold for `regions`. Applied literally to `regions`, S1 silently repoints every `cities.region_id`. The ADL clearly *intends* an additive upsert; it never says so mechanically.

Neither is a reason to re-take the decision. Both are reasons the briefs should not go out unamended.

**One blocker the ADL declared unverifiable, I measured.** §8.3 and §15.1 item 1 call the Turso cold-seed cost UNVERIFIED and gate S2 on it. The staging Turso host **is** on this devcontainer's firewall allowlist, and the ADL-33 diagnostic path works. Measured round-trip against staging: **median 33 ms**, `batch(2000)` **386 ms**, a single 2,000-row `VALUES` statement **55 ms**. Extrapolated, 86 batches is **≈5 seconds of wire time**, not "tens of seconds to minutes". See §5 for the caveat — this bounds the network term the ADL was worried about, not write throughput.

| # | Finding | Severity | Blocks |
|---|---|---|---|
| **F1** | D13 identity key conflates 5,024 distinct gazetteer places; §7's convergence claim is false for them | **HIGH** | **S3** |
| **F2** | "Hash-gated reseed of `regions`" + §8.1's delete-and-reload = silent `cities.region_id` corruption | **MEDIUM-HIGH** | **S1** |
| **F3** | `iso3166-2-db` is 169 MB / 42,268 files unpacked; unstated. Also 2 years stale + single maintainer, while `all-the-cities` is rejected *for* staleness | **MEDIUM** | S1/S2 (cost + consistency, not correctness) |
| **F4** | 2 of the 716 generated region rows have an empty ISO code and would seed as `ID-` / `PH-` | **LOW-MED** | **S1** (correctness) |
| **F5** | ADL-43 S2 stamped "unchanged and adopted" but its stated 940-row count came from the replaced source; the amended source yields 716 | **LOW** | nothing |
| **F6** | GE-16 amendment under-scoped — the body sentence and one success criterion are contradicted too, not just the `resolved` definition | **LOW** | S2/S3 (BRD gate) |
| **F7** | Join rate not reproducible at stated precision — I get 99.24 % vs 99.28 %, and 1.37 % vs 1.02 % NULL | **LOW** | nothing |

---

## 2. Defects

### F1 — The D13 identity key cannot represent the gazetteer. **HIGH. Blocks S3.**

**The claim under attack (§7):**

> "A user-created `Denver` and a gazetteer `Denver` coexist; the next user who picks Denver from the gazetteer hits the *existing* `cities` row through the unchanged find-or-create, because the identity key is `(name, country_code, COALESCE(region_id,0))` and the gazetteer supplies exactly those three values. **Convergence happens through the mechanism that already exists.**"

Convergence is only correct when the two rows are the same place. I grouped all 170,540 gazetteer rows by the identity key exactly as the unique index computes it — `(name COLLATE NOCASE, country_code, COALESCE(region_id, 0))`, with ASCII-only case folding to match SQLite's NOCASE:

| Measure | Result |
|---|---|
| Gazetteer rows | 170,540 |
| Distinct D13 identity keys | 165,516 |
| Keys holding more than one gazetteer row | 3,931 |
| **Rows unrepresentable in `cities`** | **5,024 (2.95 %)** |
| Colliding groups **> 10 km** apart | **3,765** |
| Colliding groups > 50 km apart | 3,312 |
| Largest separation | 1,921 km (`Valverde`, ES) |

These are not upstream near-duplicates. They are different towns. In region-tier-enabled countries alone there are 1,488 colliding groups. The English ones a PO would actually hit:

```
"Newport"     GB-ENG — 4 rows, 343 km apart  (Shropshire, E. Yorks, Essex, Isle of Wight)
"Sutton"      GB-ENG — 4 rows, 193 km apart  (incl. Sutton, Greater London)
"Stone"       GB-ENG — 4 rows, 291 km apart
"Wootton"     GB-ENG — 4 rows, 328 km apart
"Preston"     GB-ENG — 3 rows, 184 km apart
"Whitchurch"  GB-ENG — 3 rows, 174 km apart
```

**The failure, concretely.** User A picks *Newport, Shropshire* from the gazetteer; a `cities` row is created with Shropshire's coordinates. User B picks *Newport, Isle of Wight*; find-or-create matches on `(newport, GB, GB-ENG)` and **returns User A's row**. User B's trip is pinned 343 km away, in a different town, with no error and no indication anything went wrong.

**Why the ADL did not see it — and this is the instructive part.** §5.3's worked example is `springfield`, and I verified it exactly: 21 rows → **21 distinct `(country_code, region_iso)` groups, zero collisions.** Springfield happens to have precisely one per US state. It is a clean case, and the design was generalised from it. Run the same `GROUP BY country_code, region_iso` against `newport` in GB and it returns **one group containing four towns** — the ambiguity query the ADL proposes as the fix is the thing that hides the problem.

**§5.2 spotted the mechanism and did not follow it through.** It says, as an argument against loading the gazetteer into `cities`:

> "The D13 identity index would fight it… Loading a bulk dataset through it converts every upstream near-duplicate into an insert conflict at seed time."

Correct — and the same collision does not disappear when rows arrive one at a time via select-and-copy. It just stops being an insert conflict and becomes a silent wrong answer, which is worse. §7 then asserts the opposite conclusion without reconciling it.

**Knock-on: this damages §7's headline.** The cheapest and most attractive claim in the document is *"There is no migration of `cities`."* Every repair for F1 that I can see costs that claim:

- widen the identity key to include `admin2` or a coordinate bucket → **a new unique index on `cities`, i.e. a migration**, and one that must be staged per ADL-47;
- keep the key and accept conflation → the product silently mis-pins the second Newport, and GE-17's own success criterion ("presents all of them distinguishably") is honoured in the search list and then discarded on selection;
- suppress colliding rows from gazetteer search results → 5,024 places become invisible, quietly re-creating the coverage-floor problem §2 exists to avoid.

I am not picking one — that is the ADL author's call on re-scope. But **S3 cannot be briefed until it is picked**, because an engineer implementing §5.3 plus §7 as written will build the mis-pinning bug and every test derived from the springfield example will pass.

*Note:* ADL-46's `findOrUpgradeCity` step 2 (wildcard upgrade, `cities.ts:189-226`) does **not** rescue this — it upgrades a *regionless* row to a regioned one, a different case. Both Newports here carry the same region.

---

### F2 — "Hash-gated reseed of `regions`" is undefined in the one way that matters. **MEDIUM-HIGH. Blocks S1.**

§11's S1 row: *"Generator script; regenerate `data/regions.json` 76 → 716 rows; **hash-gated reseed of `regions`**."*

§8.1 defines what a hash-gated seed does:

> "Hash differs or table empty → inside a single transaction: `DELETE FROM gazetteer_cities`, batch-insert, update `gazetteer_meta`."

and justifies its safety as:

> "Because nothing references `gazetteer_cities`, the delete-and-reload is safe by construction — **that is the payoff of §5.1's no-FK rule**."

**That precondition is false for `regions`.** `cities.region_id` references `regions.id` (`schema.ts:101`), and `regions.id` is `AUTOINCREMENT`. A `DELETE` + reload re-issues ids; every existing `cities.region_id` then points at a different subdivision or at nothing. With FK enforcement on (asserted at boot, `server.ts:288`) the delete either aborts the transaction or, on a fresh id sequence, silently repoints rows. Either way it is exactly the data-integrity failure §5.1 was written to make unrepresentable — applied to the one table where the rule does not hold.

The ADL plainly *intends* additive: S1 says "**Purely additive** — all 76 existing codes preserved… so no `cities.region_id` is invalidated." I believe that is what the author meant. But the document gives S1 a *mechanism name* whose only definition in the document is delete-and-reload, and the reader most likely to implement it is a Database agent reading §8.1 for the mechanism.

**This is the one place S1 — sold throughout as the cheap, zero-risk, independently-shippable half — is actually dangerous.** The correction is small and should be explicit in the S1 brief:

> `regions` is reseeded by **hash-gated `INSERT … ON CONFLICT (iso_3166_2) DO NOTHING`** (optionally `DO UPDATE SET name = …`). It is **never** deleted and reloaded. The §8.1 delete-and-reload pattern applies to `gazetteer_cities` only, because that is the only table nothing references.

I verified the upsert is clean: `uniqueIndex('uniq_regions_iso_3166_2')` exists (`schema.ts:83`), and across the 716 generated rows there are **zero duplicate `iso_3166_2` values**, so `ON CONFLICT` has a well-defined target.

I also verified the *reason* S1 must change `seedRegions` at all, and the ADL is right about it: `seedRegions()` gates on `existingCount > 0` and returns early (`startup.service.ts:170-176`), so on staging and production — already holding 76 rows — a regenerated 716-row file would **never be applied** without the gating change.

---

### F3 — `iso3166-2-db`'s real cost is unstated, and it is large. **MEDIUM. Supply chain / DX.**

The ADL evaluates licence, row count and publish date but never states install size. Measured:

| Package | Unpacked | Files | Deps | Maintainers | Last publish |
|---|---|---|---|---|---|
| `cities.json` | 19.5 MB | **9** | none | 1 (`lutangar`) | 2026-08-01 |
| **`iso3166-2-db`** | **177 MB** | **42,268** | none | **1** (`kashey`) | **2024-07-11** |

283 MB on disk after install here. The generator uses exactly one file — `data/iso3166-2.json`, **3.9 MB**. The bulk is `regions/` (205 MB) and `i18n/` (69 MB), neither of which the crosswalk touches.

"Install it as a `devDependency` — build-time generator only, never shipped" (§8.1/G3) is true of the *runtime bundle* and materially understates the cost everywhere else. This project installs `node_modules` **per agent worktree** — CLAUDE.md says so explicitly ("a fresh worktree does not inherit `node_modules`") — and CI installs on every run. 42,268 files is also an npm-install-time cost, not just a disk one.

**And there is an inconsistent standard.** §3 rejects `all-the-cities` with "**Six years stale** (published 2020-03-18)" as reason 2 of 4. `iso3166-2-db` was last published **2024-07-11 — just over two years ago** — and the ADL records the date in its table without comment. Both are single-maintainer packages.

For ISO 3166-2 codes staleness matters less than for cities, and I want to be fair: that is a real distinction and it probably justifies the different treatment. But the ADL should *make* the argument rather than apply the criterion to one candidate and not the other. **And the staleness has a visible symptom in the data** — see F4, where the two malformed rows are precisely the two recently-created subdivisions.

**Suggested correction, cheap:** vendor `data/iso3166-2.json` (3.9 MB) into `data/vendor/` with its provenance recorded per GE-18, and drop the dependency. That removes 169 MB and 42k files from every install, removes a stale single-maintainer package from the supply chain, and pins the crosswalk against silent upstream change. It also fits GE-18's own machine-readable-provenance requirement better than a `devDependency` does. If the COO prefers the dependency, the size and staleness should at least be stated in §3.

---

### F4 — Two of the 716 generated region rows are malformed. **LOW-MEDIUM. Blocks S1 correctness.**

Generating `${cc}-${r.iso}` over the 26 enabled countries yields 716 rows, of which **two carry an empty `iso`**:

```json
ID  {"name":"West Papua",           "iso":"", "fips":"39",  "admin":"39"}
PH  {"name":"Negros Island Region", "iso":"", "fips":"NIR", "admin":"NIR"}
```

Naively these seed as `"ID-"` and `"PH-"`. Both are non-null and distinct, so they pass `NOT NULL` and `uniq_regions_iso_3166_2` and land as garbage subdivision codes that will never match a Nominatim `ISO3166-2-lvl4` value. **196 such rows exist across all 234 countries**, so this becomes worse the moment GE-07 enables another country — which is one of §10's own listed refresh triggers.

The generator must filter `r.iso` empty/null and report what it dropped. Related: `PH` has a real GeoNames `admin` code `NIR` whose ISO side is empty, which is why PH joins 4,522/4,523 rather than cleanly.

---

### F5 — ADL-43 S2 is stale after the amendment it was stamped through. **LOW. Documentation lifecycle.**

ADL-48 §13.1 states: *"S2 (scope to the 26 enabled countries), S4… S5… all stand unchanged, and this ADL adopts them."* The stamp on ADL-43 reads the same way.

ADL-43 S2 as written is:

> "Generate rows only for the 26 currently-enabled countries (**940 rows, verified**) — not all 249 (4,387 rows)"

I verified 940 is correct **for `country-region-data`** — the source ADL-48 just replaced. Under `iso3166-2-db` the same scope rule yields **716**. S2's *rule* is genuinely unchanged; its *stated figure* is now wrong and was not stamped, in the same PR that amended the neighbouring rows. Document-lifecycle rule 1. A Database agent reading ADL-43 S2 for the target row count will expect 940 and conclude the generator is broken.

---

### F6 — The GE-16 amendment is under-scoped. **LOW. BRD gate for S2/S3.**

§12.2 is **correct** on the substance, and I verified the diagnosis independently against the live BRD (`_project/travel-tracker-BRD.md:126`): GE-16 does define *resolved* as **"the geocoder matched it"**, so a gazetteer-sourced Glasgow is genuinely unrepresentable. Good catch, and it would have blocked S3 at the BRD gate.

But §12.2 amends only that definition and the closing note. Two further clauses of GE-16 are contradicted by the same change and are not mentioned:

1. **The body sentence:** *"The city name is resolved against the geocoding service and the record is created from the service's canonical response where one is available."* A gazetteer city is created from neither.
2. **A success criterion:** *"a lookup that remains ambiguous after being constrained by the selected country and region creates a **pending** record rather than choosing a candidate."* An ambiguous *local* hit has authoritative coordinates. Forcing it to `pending` re-creates precisely the absurdity §12.2 identifies — and, given F1, ambiguity-within-a-region is not hypothetical.

Whoever writes the BRD bump should amend GE-16 as a whole rather than the one sentence.

---

### F7 — Two crosswalk figures are not reproducible at their stated precision. **LOW.**

Re-deriving §4.1 end-to-end from `cities.json` → `iso3166-2-db.admin` → ISO:

| Measure | ADL-48 | Mine |
|---|---|---|
| City rows in enabled countries | 84,868 | **84,868** ✓ |
| Joinable via crosswalk | 84,257 (99.28 %) | 84,226 (**99.24 %**) |
| NULL region across all 170,540 rows | 1,746 (1.02 %) | 2,336 (**1.37 %**) |
| Seeded region codes matched | 76 / 76 | **76 / 76** ✓ |

A 31-row difference in 84,868 is immaterial and does not touch the decision; the whole-dataset NULL figure differs more (probably a different treatment of the 14 countries absent from `iso3166-2-db` — 253 rows — and the 100 rows with empty `admin1`). Worth a footnote only, and I note it mainly because the prompt asked me to re-derive both. Everything decision-bearing reproduced.

---

## 3. Preferences — these do **not** block

- **P1 — the seed should start off the boot path, not migrate there under pressure.** §8.3 says move `seedGazetteer()` off boot "if a cold seed exceeds the platform's health-check window." Given the seed sits in the awaited Express startup sequence (`server.ts:294-297`), before the server listens, I would put it behind an explicit one-shot command from day one. My Turso measurement (§5) says the timing is fine, so this is taste, not risk.
- **P2 — §2 undersells the tail, in a way that strengthens G6 but reframes S3's value.** Beyond the nine probed names: the **entire NW Highlands** (lat 56.5–58.7, lng −7.5 to −3.5) has **45 `cities.json` rows total**. Missing alongside the nine: Kyle of Lochalsh, Mallaig, Arisaig, Glenfinnan, Torridon, Glenelg. For the Scotland dogfood trial specifically the gazetteer will be the *minority* path, not the common one. The ADL's national-scale framing ("the common case moves onto the local path") is right for the world and wrong for the trial that motivates it — worth saying plainly to the PO, since it sets expectations for what S3 will feel like.
- **P3 — G9's on-demand refresh is well-argued and I would go further:** pin the `cities.json` version explicitly and record it in `gazetteer-meta.json`. §10 implies this; the S2 brief should require it, or a `npm install` on a fresh worktree silently picks up a newer monthly release than the committed artifact was generated from.

---

## 4. What I verified that held up

I attacked these and failed to break them. Recorded because a review that only lists faults misrepresents the document.

**§2's coverage floor — the load-bearing claim — holds, under a method the ADL did not use.** The ADL's two probes (exact match in GB; case-insensitive substring across all countries) are both *name-based*, so a single wrong assumption — the place is stored under a Gaelic or variant toponym — could in principle produce both negatives. That does not meet the negative-findings bar on its own. So I added a **third, name-free probe: list every row within 8 km of each place's true coordinates.** A row present under any spelling would surface.

- All nine claimed absences returned **zero rows within 8 km** in **both** datasets. The absences are genuine, not artefacts of casing, diacritics or naming.
- The probe self-validates: Ullapool, Aviemore and Portree were found at **0.35 / 0.45 / 0.11 km**, confirming the coordinates and the method.
- Glasgow, Edinburgh, Inverness and Tarbert verified present; Tobermory verified present in `all-the-cities` (pop 1,010) and absent from `cities.json`, exactly as §2's parenthetical says.

**The central decision therefore stands. A pure gazetteer replacement would fail the Scotland trial, and G6 is correct.**

**Every dataset figure I checked reproduced exactly**, from installing the packages myself: 170,540 rows / 246 countries; `all-the-cities` 135,233 rows (npm's "138,398" is indeed wrong), 22,913 rows under population 1,000, 12,788 at exactly 0, and 76 rows with a non-empty `altName`; `iso3166-2-db` 3,940 subdivisions / 234 countries and 716 across the 26 enabled countries; `country-region-data` 217 GB rows with **zero** of ENG/SCT/WLS/NIR (ADL-43's finding, independently re-verified, as §13.1 claims); `iso3166-2-db` returning exactly `GB-ENG/SCT/WLS/NIR`. Licences read from the shipped files: `cities.json` CC-BY-4.0 with the full CC text, `iso3166-2-db` MIT, `country-state-city` GPL-3.0. Cadence read from the registry, not the README: 65 versions, 1.1.59/60/61 on 2026-06-01, 07-01 and 08-01.

**§4's structural finding is correct and the ADL undersells its own example.** I first tested it wrongly — checking whether `admin1` is a *member* of the country's ISO code set — and got "3 of 26 (GB, US, JP)". That test is invalid: JP's `admin` and `iso` are both numeric but denote **different prefectures**. Testing correctly (does `admin === iso` for every subdivision?) gives **exactly GB and US at 100 %, 18 countries at 0 %**, and six partial — confirming the ADL. And JP is the sharpest possible illustration, better than §4 explains:

```
GeoNames admin1 "46"  →  Yamanashi Prefecture
ISO code     JP-46    →  Kagoshima Prefecture
```

Naive concatenation for Japan produces a **valid-looking but wrong** code — silent, and invisible to any format check. §4's "this is exactly the class of error that a build-first, verify-later approach ships" is if anything an understatement.

**76/76 holds, and is stronger than claimed.** All 76 seeded codes appear in `iso3166-2-db`, and I additionally checked the **names**: **zero mismatches** against `data/regions.json`. The superset property, and therefore the no-backfill argument, is sound.

**VN 54.8 % / ET 76.9 % / KZ 86.3 % reproduce to the decimal.** The 0.72 % is handled correctly: `cities.region_id` is nullable (`schema.ts:101`) and GE-15's success criteria explicitly cover "a geocoding result that cannot be resolved to a seeded region leaves the region blank and editable". Degrades correctly, as claimed.

**Every supersession stamp is correctly placed and well-formed.** I checked all of them against document-lifecycle rule 2: `ADL-43` §2 S1/S3 (inline `AMENDED … retained for history`, old text struck through and preserved), both BUG-71 documents (`NARROWED … retained for history`, with the ship-now instruction on the banner), execution-queue item 13 (`DISCHARGED AND PARTLY CORRECTED`), and `open-dialogues.md` D-19 (`RE-SCOPED`). Old text retained throughout. F5 is the single gap.

**Its corrections to the COO's brief are all correct.** OQ-06 is `closed` in the tracker, closed 2026-07-27 citing ADL-43 — verified in `_project/tracker.json`, so "item 13 queues an ADL that already exists" is right. BUG-45 has **zero source overlap**: ADL-43 §3 sources airlines from OpenFlights via `airline-codes`, §4 finds no car-rental source exists — neither touches `cities.json` or `iso3166-2-db`. The un-bundling is correct. The region distribution (US 51, CA 13, AU 8, GB 4; 26 enabled, 22 with zero regions) reproduces from the repo's own data.

**§13.2's "narrowed, not superseded" ruling on BUG-71 is right, and the ship-now call is right.** BUG-71 is a live P1 against shipped behaviour; ADL-48 is a three-stage build behind a BRD gate that does not yet exist. Nothing in the BUG-71 fix becomes throwaway: `classifyDiscovery` is still required for the tail path, which F1's coverage data shows is not a rump — for the Scotland trial it is most of the traffic (P2). The claim that the three-valued output is *strengthened* also holds: with a complete local set, "incomplete but undivided" is genuinely unrepresentable, so `'suggested'` does collapse cleanly onto the tail path. I looked for a way the gazetteer makes part of that work wasted and did not find one.

**ENV-01 confirmed by two independent probes** — no `nominatim`/`openstreetmap` entry in `/usr/local/bin/init-firewall.sh`'s domain loop (read directly, lines 141-151), and the loop's full allowlist enumerated. §15.1 item 2 is correctly scoped as unverifiable from here.

**§8.1's characterisation of the existing seed gating is accurate** — `seedCountries()` and `seedRegions()` both gate on `existingCount > 0` and return early (`startup.service.ts:122-176`), which is exactly why a regenerated data file cannot apply itself.

---

## 5. The blocker I was able to close

**§8.3 / §15.1 item 1 — Turso cold-seed cost — is measurable from this devcontainer today, and I measured it.**

The ADL names the probe (`scripts/agent-diagnostics/turso-query.mjs` against staging) and calls it unverified. But the staging host is on the firewall allowlist — `travel-tracker-staging-ryanv11.aws-us-west-2.turso.io`, `init-firewall.sh:148` — and this is the exact scenario CLAUDE.md's negative-findings rule already records as a past false negative ("this environment's firewall reaches no Turso host — false"). I confirmed reachability (`SELECT COUNT(*) FROM cities` → 3) and then measured round-trip behaviour with `@libsql/client` directly:

| Measurement (Turso staging, read path) | Result |
|---|---|
| Single-statement RTT | min 28 ms · **median 33 ms** · max 829 ms (one cold outlier) |
| `batch(10)` | 32 ms |
| `batch(100)` | 65 ms |
| `batch(500)` | 153 ms |
| `batch(2000)` | **386 ms** — one round trip, not 2,000 |
| Single statement carrying 2,000 `VALUES` rows | **55 ms** |

`batch()` costs approximately one round trip regardless of size. 170,540 rows in 86 batches of 2,000 therefore extrapolates to **roughly 5 seconds of wire time** — the same order as the ADL's 618 ms local measurement plus WAN latency, and nowhere near a health-check window. **12.47 MB and 170k rows are also unremarkable for Turso storage.**

**The caveat, stated plainly.** The diagnostic token is **read-only by design** (ADL-33 §5), so these are `SELECT`s. Writes traverse the primary and may cost more per batch, and I did **not** measure INSERT throughput or Turso's write-transaction limits. What this establishes is that the **network round-trip term** — the ADL's actual stated worry, *"86 batches over a WAN could plausibly be tens of seconds to minutes"* — is about 5 seconds, not minutes. It does not establish end-to-end seed time.

**Recommendation:** downgrade §8.3 from a **blocker** on S2 to a **measurement to confirm during** S2. The risk it guards against is now bounded and small, and S2 was already the stage designed to answer it.

---

## 6. Verified vs. unverified

### 6.1 Verified in this review, and how

- **Coverage absences (§2)** — three independent probes across both datasets: exact name match in GB; diacritic-folded case-insensitive substring across all 246 countries; **and a name-free 8 km coordinate-radius scan**. The third is independent of every naming assumption the first two share. Method self-validated against the known-present set.
- **All dataset counts, licences, field lists, publish dates, maintainers, dependency trees and install sizes** — by installing `cities.json@1.1.61`, `iso3166-2-db@2.3.11`, `all-the-cities@3.1.0` and `country-region-data@4.1.0` in a scratch directory and reading the shipped data and LICENSE files, plus `npm view` against the registry.
- **`admin1` ≠ ISO 3166-2, the crosswalk, join rates, 76/76, name agreement, the 716 and the duplicate/malformed-row checks** — computed end-to-end against the repo's live `data/countries.json` and `data/regions.json`.
- **D13 collision analysis (F1)** — the identity key computed exactly as `schema.ts:146-150` defines it, with pairwise great-circle separation per colliding group.
- **Schema, seed gating, boot order, find-or-create and firewall claims** — read directly at the cited lines.
- **Turso reachability and round-trip latency** — measured live against staging (read-only).

### 6.2 Unverified, with the probe and its blind spot

1. **That Nominatim actually has Plockton, Shieldaig and Dornie — still UNVERIFIED.** I re-confirmed ENV-01 blocks it by two probes (grep of `init-firewall.sh`; reading the domain loop in full). **ADL-48 §15.1 item 2 is correctly flagged and remains the single load-bearing open item behind G6** — if Nominatim also lacks the tail, §2.1 must be re-decided in favour of option (b) and, by §14's own concession, the whole proposal reconsidered. *Probe:* query Nominatim from an allowlisted host or during the staging shakedown. *Blind spot:* one query set at one moment.
2. **Turso INSERT throughput and write limits — UNVERIFIED** (§5 caveat). The read-only diagnostic token cannot issue writes. *Probe:* a real batched insert from the S2 branch against staging. *Blind spot:* staging and production may differ in region and plan.
3. **Whether F1's conflation matters enough to a real user to justify a `cities` migration** is a product judgment, not a technical one. I have established the mechanism, the count and the blast radius; the fix is a scope call for the ADL author and the PO.
4. **My coordinates for the 13 probed places** are general knowledge, not read from a source in-repo. Mitigated by the 8 km radius (generous) and by the method self-validating on the known-present set at 0.11–0.45 km — but a place whose true location I have badly wrong would produce a false "nothing within 8 km". Probes A and B, which are name-based and independent of coordinates, agree on every one, so all nine absences rest on two independent methods regardless.
5. **`feature_code` recovery by joining `all-the-cities` onto `cities.json`** — I did not attempt it. §6.4 already marks it UNVERIFIED and correctly notes the design does not depend on it. I confirmed the premise: `cities.json` rows carry only `name, lat, lng, country, admin1, admin2`.
6. **No code was written and no application test was run.** All measurements are probe scripts against package data in a scratch directory, plus read-only queries against Turso staging.

---

## 7. Disposition

**SHIP WITH CORRECTIONS.** ADL-48's decision stands and should be adopted. Before briefs go out:

| Action | Owner | Gate |
|---|---|---|
| Re-scope F1 — pick a resolution for the identity-key conflation and state its migration cost | Architect (ADL-48 author) | **before S3** |
| Specify `regions` reseed as additive upsert, never delete-and-reload (F2) | COO, in the S1 brief | **before S1** |
| Filter empty-ISO subdivisions in the generator and report drops (F4) | COO, in the S1 brief | **before S1** |
| Decide dependency vs. vendored 3.9 MB file for `iso3166-2-db`; state size and staleness either way (F3) | COO / Architect | before S1 |
| Amend GE-16 as a whole, not one sentence (F6) | COO, at the BRD gate | before S2/S3 |
| Stamp ADL-43 S2's 940-row figure (F5); footnote the join-rate precision (F7) | COO | housekeeping |
| Downgrade §8.3 from blocker to confirm-during-S2, citing §5 above | COO | unblocks S2 |

**S1 remains worth dispatching first and independently**, as §11 argues — with F2 and F4 folded into the brief. **The BUG-71 fix should ship now**, as §13.2 says; nothing in this review changes that.

---

*OP-27 review. ADL-48 was not edited. No package.json or lockfile change was committed — the four candidate packages were installed only in a scratch directory outside the repo, and the temporary Turso probe script and the copied `.env.agent-diagnostics` were both deleted before commit.*

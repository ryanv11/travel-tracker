# ADL-48 feasibility spike — the bundled gazetteer, built and measured

**Date:** 2026-08-02
**Author:** Architect (fresh dispatch; no authorship of ADL-48, its OP-27 review, ADL-43, ADL-46 or the BUG-71 documents)
**Branch:** `spike/gazetteer-feasibility` — **SPIKE. Nothing ships. Draft PR, do not merge.**
**Under test:** `jobs/architect/tech/ADL-48-bundled-gazetteer.md` · `jobs/architect/tech/20260802-ADL48-fresh-eyes-review.md`
**Tracker:** OQ-06 · BUG-30 · BUG-75 · D-19 · ENV-01 · QUAL-21/22 · GE-07 · GE-16
**Status:** Complete. Verdict in §1.

Unlike ADL-48 (whose §15.1 item 7 states *"No code was written and no test was run"*), **every number in
this document was produced by running code against the real 170,540-row dataset loaded into a real libSQL
database, or against Turso staging over the wire.** Where I could not measure something, it is marked
UNVERIFIED with the probe and its blind spot, never rounded up into a claim.

---

## 1. Summary table and verdict

> ## VERDICT: **GO — WITH FOUR CHANGES**
>
> ADL-48's central decision (gazetteer-first, geocoder for the tail) survived being built. It is
> **cheaper and less risky than ADL-48 argued**, because the one thing nobody measured — search cost
> at 170k rows — has a clean answer that costs the product nothing. But **three of ADL-48's stated
> mechanisms must change**, and one defect it inherits is **live in shipped code today**.

| # | Question | Finding | Recommendation | Confidence |
|---|---|---|---|---|
| **Q1** | Search perf at 170k rows | Today's `LIKE '%q%'` = **8.7 ms** and reads **all 170,540 rows per keystroke**. **FTS5 trigram = 0.2 ms with a *provably identical* result set (30/30 terms)** | **Adopt FTS5 trigram. Do NOT switch to prefix matching** — prefix silently loses "New Orleans", "Las Vegas", "East Los Angeles" | **High** |
| **Q1b** | Latency regime | **Network-dominated.** Turso RTT **29.5 ms** vs 8.7 ms CPU. Query shape cuts total latency only ~22% — but cuts **rows read by 4,264×** | Fix the query shape for **cost and server load**, not for latency. Debounce is the latency lever | **High** |
| **Q1c** | Min query length | 1 char matches **65,743 rows**; 3 chars matches 6,965. Trigram is unusable below 3 chars (returns 0) | **Minimum 3 characters, 250 ms debounce.** The UX answer and the trigram constraint coincide | **High** |
| **Q1d** | Result caps | A cap of 50 truncates `san` (6,965 rows) but not `springfield`/`newport`/`york` | Cap rows at 50; keep ambiguity detectable with a **separate `COUNT(*)`/`GROUP BY`**, which is ~0.2 ms under trigram | **High** |
| **Q2** | Narrow by trip country | Under `LIKE`, filter helps hugely (7.7→0.3 ms), rank not at all. **Under trigram, neither is needed — the performance argument dissolves** | **RANK, don't filter.** The PO's shortlist-not-filter instinct is affordable once the query shape is fixed | **High** |
| **Q2b** | Is country the last signal? | **No.** The trip's already-added places are a strong unused signal: 6 GB "Newport"s → **1** within 100 km of an anchor. Region genuinely is unavailable — the PO is right about that half | Add a proximity tiebreak later as a **ranking** input. Not day one | **Medium** |
| **Q3** | Turso cold seed | RTT 29.5 ms; `batch(2000)` = 156 ms as **one** round trip; a 2,000-row `VALUES` statement = **33 ms**. Wire time for a full seed ≈ **3–14 s**. **INSERT throughput NOT measurable — token is read-only, confirmed by an attempted write** | Not a blocker. **Move `seedGazetteer()` off the boot path from day one** anyway | **Medium** (reads High, writes UNVERIFIED) |
| **Q4** | Does Nominatim have the tail? | **STILL UNVERIFIED.** Unreachable from here (2 probes). OSM-presence proxy says all 9 present. **New risk found: the app's own settlement-type filter is a bigger threat than coverage** | Close it on the staging shakedown, and **test the filter, not just presence** | **Low** (see §5) |
| **Q5** | S1 correctness | Generator built and run. **714 rows, 76/76 preserved byte-for-byte, 0 missing, 0 name drift, 0 duplicate ISO, +638 additive.** F4's 2 malformed rows dropped and named | **S1 is safe and dispatchable** with the F2 upsert wording | **High** |
| **Q5b** | F3 `iso3166-2-db` cost | **283 MB, 42,268 files, 11.8 s install** — for one **3.35 MB** file. vs `cities.json` at 19 MB / 9 files / **0.5 s** | **Vendor the 3.35 MB file. Do not take the dependency** | **High** |
| **Q6** | BUG-75 identity key | **Live defect TODAY: 8,876 rows / 5.20% unrepresentable, worst case 8,092 km.** S1 *improves* it to 5,024 / 2.95%. A 0.1° coordinate bucket fixes **98.2%** (→89 rows) | **Widen the key with a coordinate bucket.** Do it **independently of the gazetteer** — it is broken now | **High** |

### The four changes

1. **Search is FTS5 trigram, not `LIKE`, and not prefix.** (Q1) ADL-48 §5.3 says "exact then prefix" —
   that is a silent product regression and must not be briefed as written.
2. **`regions` is seeded by additive upsert, never delete-and-reload.** (Q5 / F2) Implemented and
   documented in the generator; the S1 brief must say it explicitly.
3. **Vendor `iso3166-2.json`; drop the `iso3166-2-db` dependency.** (Q5b / F3)
4. **BUG-75 is decoupled from this ADL and fixed on its own merits.** (Q6) ADL-48 §7's headline
   *"there is no migration of `cities`"* is **already false today** — the defect is shipped.

### What I am NOT recommending changed

ADL-48's **G1, G2, G3, G5, G6, G8, G9, G10** all stand. The coverage floor (§2), the crosswalk (§4.1),
the no-FK topology (§5.1) and the "geocoder for the tail" call (G6) all survived independent re-testing —
see §8.2. **This spike does not kill the design.** It fixes three mechanisms and returns one defect to its
rightful owner.

---

## 2. Q1 — Search performance at 170,540 rows

### 2.1 First: verify the index inference, don't inherit it

The brief inferred that `like(cities.name, '%${q}%')` (`src/backend/routes/cities.ts:48`, verified by
reading it) cannot be served from an index, and asked me to check rather than accept. **Measured with
`EXPLAIN QUERY PLAN` against the real table:**

| Query | Plan |
|---|---|
| `LIKE '%york%'` (today) | `SCAN gazetteer_cities USING COVERING INDEX idx_gaz_name_nocase` |
| `LIKE 'york%'` (prefix) | `SEARCH ... USING COVERING INDEX ... (name>? AND name<?)` |
| `LIKE 'york%' COLLATE NOCASE` | `SEARCH ... (name>? AND name<?)` |
| FTS5 `MATCH` | `SCAN gaz_fts VIRTUAL TABLE INDEX 0:M1` |

**The inference is correct in substance, with one nuance worth stating precisely.** A leading wildcard
cannot **seek** — it gets `SCAN`, not `SEARCH`. But SQLite does still use the index as a *covering* scan,
reading the narrow index rather than the wide table. That is why today's query is 8.7 ms rather than
catastrophically worse. **It remains O(n) in table size and reads every row.** The prefix form gets a real
range seek (`name>? AND name<?`).

### 2.2 The measurements — local libSQL, 170,540 rows, median of 5 runs over 8 terms

| Shape | Median | Min | Max | Semantics |
|---|---|---|---|---|
| `LIKE '%q%'` **(today)** | **8.7 ms** | 7.7 | 9.4 | substring, anywhere |
| `LIKE 'q%'` (prefix) | **0.1 ms** | 0.1 | 0.5 | **prefix only — lossy** |
| FTS5 token-prefix | **0.2 ms** | 0.1 | 0.4 | word-boundary prefix — **also lossy** |
| **FTS5 trigram** | **0.2 ms** | 0.1 | 0.3 | **substring — identical to today** |

Build cost, measured: insert 486 ms · b-tree indexes 228 ms · FTS5 784 ms · **trigram 1,183 ms.**

### 2.3 The semantic cost — the part a speed table hides

**This is the section the PO should read.** Same typed text, four shapes, real counts:

| Typed | `LIKE %q%` | `LIKE q%` | FTS5 token | **FTS5 trigram** | What prefix loses |
|---|---|---|---|---|---|
| `york` | 40 | 25 | 40 | **40** | `Bridle Path-Sunnybrook-York Mills` |
| `orleans` | 4 | 3 | 7 | **4** | **New Orleans** |
| `angeles` | 8 | 1 | 33 | **8** | **East Los Angeles** |
| `vegas` | 9 | 2 | 9 | **9** | **Las Vegas** |
| `sur` | 966 | 100 | 923 | **966** | `Ablon-sur-Seine` |
| `ness` | 55 | 6 | **9** | **55** | `Alness` |

Two things follow, and both are decisions rather than details:

**Prefix matching is a product regression and must not be adopted.** Typing "vegas" stops finding Las
Vegas; "orleans" stops finding New Orleans. ADL-48 §5.3's *"exact then prefix"* would ship exactly this.
The brief was right to insist this be surfaced explicitly rather than buried in a benchmark.

**FTS5 token-prefix is not a substitute either, and the `ness` row is why.** It finds `New Orleans` from
"orleans" (a word boundary) but misses `Alness` from "ness" (mid-word): **9 rows against 55.** It is
*differently* lossy, not less lossy — for `angeles` it returns 33 where substring returns 8, so it is both
over- and under-inclusive relative to today.

### 2.4 The finding: trigram is a provable drop-in

I compared **result sets**, not counts, over 30 terms — full id-set equality in both directions:

```
terms compared        : 30
IDENTICAL result sets : 30
differing             : 0
```

Case parity also holds (`YORK` / `York` / `york` → 40 / 40 / 40 for both). **FTS5 trigram returns exactly
what `LIKE '%q%'` returns, for 1/40th of the time and 1/4,264th of the rows read.** There is no product
decision to make here and no user-visible change to communicate — which is the opposite of the prefix
option.

**Its one real constraint:** trigram is undefined below 3 characters and returns **0 rows**, not an error.

| Query | `LIKE` | trigram |
|---|---|---|
| `"y"` (1 ch) | 21,647 | **0** |
| `"yo"` (2 ch) | 1,132 | **0** |

That is a silent-wrong-answer trap for an implementer. **The route must enforce the 3-character minimum
itself and never let a 1–2 character query reach the trigram index** — §2.5 shows the minimum is the right
UX call independently, so this costs nothing, but it must be a validated precondition and not a convention.

### 2.5 Minimum query length and debounce

| Chars | Sample | `LIKE %q%` | Rows matched | FTS5 |
|---|---|---|---|---|
| 1 | `s` | 7.2 ms | **65,743** | 2.3 ms |
| 2 | `sa` | 7.5 ms | 14,571 | 0.7 ms |
| 3 | `san` | 7.5 ms | 6,965 | 0.3 ms |
| 4 | `sant` | 7.3 ms | 2,168 | 0.1 ms |
| 5 | `santa` | 7.6 ms | 1,318 | 0.1 ms |

`LIKE` is flat (~7.5 ms) regardless of length — it always scans. **A 1-character query matches 65,743
rows: useless to the user and maximally expensive to produce.**

> **Recommendation: minimum 3 characters, 250 ms debounce.** 3 is where the result set becomes plausibly
> useful *and* is exactly where trigram becomes valid. With a ~30 ms network floor (§4), debounce — not
> query shape — is what the user actually perceives.

### 2.6 Which regime are we in? — the honest framing

**This determines whether §2 matters at all, and the answer is nuanced.**

| Term | Measured |
|---|---|
| Turso staging round-trip (`SELECT 1`) | **29.5 ms** median (min 24.9, max 378.4) |
| Local `SELECT 1` | ~0.0 ms |
| Local `LIKE '%q%'` scan | 8.7 ms |

**We are network-dominated for latency.** A search against Turso costs roughly `29.5 + 8.7 ≈ 38 ms`
today, and `29.5 + 0.2 ≈ 30 ms` with trigram. **That is a 22% improvement, not 40×.** Anyone quoting "40×
faster" to the PO would be quoting a local-file number that the deployed app never sees.

**So why change the query shape at all?** Because latency is not the only cost:

| Term | `LIKE '%q%'` rows read | trigram rows read | Ratio |
|---|---|---|---|
| `york` | 170,540 | 40 | **4,264×** |
| `newport` | 170,540 | 32 | **5,329×** |
| `plock` (no match) | 170,540 | 0 | **170,540×** |

**Turso bills on rows read, and every keystroke past the debounce reads the entire table.** That is a
cost and server-load problem that a single-user latency measurement cannot see, and it scales with users
and keystrokes rather than with data. This is the real argument, and it is stronger than the latency one:
*don't architect for the current user base* (2026-07-30) applies directly.

### 2.7 Result caps and ambiguity

Capping re-introduces the truncation problem that caused BUG-71 on the Nominatim path — the brief was
right to flag it. Measured:

| Term | Total rows | Distinct (country, region) | Truncated at 50? |
|---|---|---|---|
| `springfield` | 27 | 22 | no |
| `newport` | 32 | 25 | no |
| `york` | 40 | 21 | no |
| `san` | 6,965 | **885** | **YES** |

**How ambiguity stays detectable under a cap:** the cap truncates the *row list*; a **separate
`COUNT(*)` and `GROUP BY (country_code, region_iso)`** answers "is this ambiguous, and how?" over the
*complete* set. Under `LIKE` that second query costs another ~7 ms; under trigram it is ~0.2 ms, so it is
affordable to always run it.

**This is a structural improvement over the Nominatim path, not a re-run of BUG-71.** BUG-71 happened
because Nominatim returned 10 rows and the code could not tell truncation from completeness. Here the
database knows the true total, so `truncated: true` is a *fact we can return*, not an inference. The
response should carry the true count and group count alongside the capped rows.

---

## 3. Q2 — Narrowing by trip country

### 3.1 Filter vs rank, measured

`trip_countries` exists (`schema.ts`, verified) so the trip's declared countries are available at search
time. Both shapes measured against the real table:

| Scenario | Unnarrowed | Hard `WHERE` filter | `ORDER BY` rank |
|---|---|---|---|
| 1 country (GB) | 7.7 ms | **0.3 ms** | 8.4 ms |
| 2 countries (GB, FR) | 7.2 ms | **0.9 ms** | 7.5 ms |
| 4 countries | 7.4 ms | **2.0 ms** | 7.5 ms |

**The PO's performance intuition is exactly right — for the query shape we have today.** A hard filter is
a 25× win because the country index narrows before the scan. **Ranking buys nothing**, because
`ORDER BY (country_code IN (...))` still has to scan everything to sort it. ADL-48 §6.9 proposes precisely
that `ORDER BY` and presents it as free; **it is not free, it is the full 7.5 ms.**

### 3.2 But the tension dissolves — and that is the answer

**Trigram already costs 0.2 ms unnarrowed.** That is faster than the *filtered* `LIKE` query (0.3 ms).
Once the query shape is fixed, there is **no performance case for filtering at all**, and the choice
reverts to being purely a product decision.

> **Recommendation: RANK, not filter** — `ORDER BY (country_code IN (...)) DESC, name`, applied on top of
> the trigram result set. The PO's shortlist-not-filter pattern is preserved, and nothing disappears.
>
> **The brief said "if ranking alone is fast enough, recommend ranking." It is — but only because the
> query shape changes.** Under today's `LIKE`, ranking is genuinely too slow and the PO would have been
> forced into filtering. This is the clearest case in the spike of a *wrong question* being retired by
> fixing something else.

### 3.3 What filtering would cost the user — measured

If the numbers *had* forced a hard filter, this is what a trip declaring only GB would lose:

| Typed | Rows worldwide | Rows in GB | Hidden by a filter |
|---|---|---|---|
| `calais` | 3 | **0** | **all 3** |
| `bergen` | 49 | **0** | **all 49** |
| `newport` | 32 | 8 | 24 |

**The day-trip-over-the-border case is real and total, not marginal.** A user on a France trip who takes
the ferry from Dover, or a Norway trip that started in GB, gets *zero* results and no explanation. That is
the failure mode ranking avoids entirely.

### 3.4 Is country genuinely the last available signal? — **No**

The PO asked me to test this rather than accept it. Four candidate signals, assessed against real data:

| # | Signal | Available at search time? | Narrowing power measured |
|---|---|---|---|
| 1 | **Trip's declared countries** | **Yes** — `trip_countries` | `newport` 32→8 (75%) · `york` 40→1 (98%) · `springfield` 27→0 (100%) |
| 2 | **Region / state** | **No** — and the PO's reasoning is correct | n/a |
| 3 | **The trip's already-added places** | **Yes** — and it is unused | **6 GB "Newport"s → 1** within 100 km of an anchor |
| 4 | Previous trips' cities | Yes, in principle | Weak and biased toward where they have *been* |

**Signal 2 — the PO is right, and today it is doubly unavailable.** The user types the city before the
region is known, so region can never be a pre-existing key. Additionally, of the **26** region-tier
countries only **4** (US, AU, CA, GB) have *any* regions seeded — the other **22** (AR, BD, BR, CN, ET, DE,
IN, ID, JP, KZ, KR, MY, MX, MM, NG, PK, PH, RU, ZA, TH, UZ, VN) have **zero**, so `region_id` is invariantly
NULL there and could not narrow anything even if it were known. **S1 is what fixes that**, which is an
argument for S1 independent of the city half.

**Signal 3 is the real finding, and it is genuinely new.** A trip is a geographic cluster. If the trip
already contains a place, its coordinates are known, and proximity is a far sharper discriminator than
country:

```
6 exact "Newport" rows in GB:
  Newport  GB-ENG  53.763,-0.700     Newport  GB-WLS  52.017,-4.833
  Newport  GB-ENG  52.767,-2.377     Newport  GB-ENG  51.984, 0.214
  Newport  GB-WLS  51.588,-2.998     Newport  GB-ENG  50.701,-1.291
An anchor at the first row + 100 km radius narrows 6 → 1.
```

Country narrowing takes 32 worldwide Newports to 8. **Proximity to an existing trip place takes 6 to 1.**

> **Recommendation:** country ranking day one; **proximity as a second ranking term once S3 ships**, not
> as a filter, and only when the trip already has at least one resolved place. It is a tiebreak, not a
> gate — and it is the single highest-value follow-on this spike found. **Not day one:** it adds a
> correlated-subquery term to the hot path and should be measured on its own.

### 3.5 Edge cases the brief asked about

- **Trip with no declared countries.** Ranking degrades gracefully to plain relevance ordering — nothing
  is hidden and no special case is needed. **A hard filter would have to fall back to "no filter" here,
  which is a discontinuity in behaviour the user would feel.** Another point for ranking.
- **City outside the declared countries.** Under ranking it appears, just lower. Under filtering it is
  invisible (§3.3). This is the whole argument in one line.

---

## 4. Q3 — Turso cold-seed cost and storage headroom

### 4.1 What I could measure

| Measurement (Turso staging, over the wire) | Result |
|---|---|
| Single-statement round trip | **29.5 ms** median · min 24.9 · max 378.4 (one cold outlier) |
| `COUNT(*) FROM cities` | 26.7 ms |
| `batch(1)` | 32.5 ms |
| `batch(10)` | 28.0 ms (2.8 ms/stmt) |
| `batch(100)` | 38.3 ms (0.4 ms/stmt) |
| `batch(500)` | 49.3 ms (0.1 ms/stmt) |
| `batch(2000)` | **156.4 ms (0.1 ms/stmt)** |
| Single statement carrying **2,000 `VALUES` rows** | **33.1 ms** |
| Staging DB size today | **0.32 MB** (83 pages × 4,096 B); cities=3, regions=76, countries=250 |

**`batch()` costs approximately one round trip regardless of size** — this reproduces the OP-27 review's
finding independently. Extrapolating 170,540 rows in 86 batches of 2,000:

- via `batch(2000)`: 86 × 156 ms ≈ **13.4 s** of wire time
- via a 2,000-row `VALUES` statement: 86 × 33 ms ≈ **2.8 s** of wire time

**Neither is "tens of seconds to minutes."** ADL-48 §8.3's worst case is not realised, and the
`VALUES`-statement shape is 5× better than `batch()` — worth specifying in the brief.

### 4.2 What I could NOT measure, and why — the honest boundary

> **Turso INSERT throughput is UNVERIFIED.** The only Turso credentials in this environment are in
> `.env.agent-diagnostics`, which ADL-33 §5 makes **read-only by design**. The COO's brief authorised
> creating a throwaway `spike_gazetteer_probe` table — but **authorisation is not capability.**
>
> **I attempted the write deliberately**, so that the refusal would be a second, independent probe rather
> than my inheriting "it's read-only" from ADL-33's text:
>
> ```
> CREATE TABLE spike_gazetteer_probe → REJECTED:
>   BLOCKED: Operation was blocked: SQL write operations are forbidden
>   (current session doesn't have write permission)
> ```
>
> **Two probes, failing differently:** the ADL-33 §5 documentation, and a live rejected write.
>
> **Cleanup confirmed:** post-check `SELECT name FROM sqlite_master WHERE name='spike_gazetteer_probe'`
> returned **0 rows** — nothing was created, so there was nothing to drop. `regions`, `cities`,
> `countries` and every user table were untouched; the token could not have modified them.
>
> **Blind spot:** all figures above are `SELECT`s. Writes traverse the primary and may cost more per
> batch. **What is bounded is the network round-trip term — the thing ADL-48 §8.3 was actually worried
> about. What is not bounded is write throughput.** Staging and production may also differ in region and
> plan; both were measured against **staging only**.

### 4.3 Storage headroom

Measured from the real loaded database (`dbstat`):

| Object | Size |
|---|---|
| `gazetteer_cities` table | 7.58 MB |
| `idx_gaz_name_nocase` | 3.10 MB |
| `idx_gaz_name_country` | 3.59 MB |
| `idx_gaz_country` | 1.77 MB |
| **`gaz_trigram` (data + docsize + idx)** | **7.20 MB** |
| `gaz_fts` (token, not recommended) | 4.09 MB |
| **Total db file as built (all options)** | **27.54 MB** |

A production build needs the table + trigram + a country index ≈ **16.5 MB**, and does **not** need
`idx_gaz_name_nocase`, `idx_gaz_name_country` or `gaz_fts` — **trigram replaces all three for search**.
Against a staging DB currently at 0.32 MB this is a step change in absolute terms and unremarkable in
Turso terms.

> **Recommendation: move `seedGazetteer()` off the boot path from day one** — do not wait to see whether
> it exceeds a health-check window. This agrees with the review's P1. The seed sits in the awaited Express
> startup sequence *before the server listens*; a 3–14 s wire time plus unmeasured write throughput, on a
> path where failure means the container never becomes healthy, is not a risk worth taking for a
> once-per-content-hash operation. **An explicit one-shot command is strictly safer and no harder to
> build.** This also converts §4.2's UNVERIFIED write throughput from a rollout risk into a non-issue.

---

## 5. Q4 — Does Nominatim actually have the tail villages?

> ### **STILL UNVERIFIED — and I found a second, larger risk underneath it.**

### 5.1 Reachability — confirmed blocked, two independent probes

1. **Config read.** `/usr/local/bin/init-firewall.sh` read in full. The allowlist loop resolves exactly:
   GitHub CIDRs, `registry.npmjs.org`, `api.anthropic.com`, `sentry.io`, `statsig.com`, three VS Code
   hosts, `just-raptor-89.clerk.accounts.dev`, the two Turso hosts, `backboard.railway.com`. **No
   `nominatim` or `openstreetmap` entry.** Policy is `OUTPUT DROP` + explicit REJECT.
2. **Live network.** `curl https://nominatim.openstreetmap.org/...` → exit 7, *"Failed to connect … after
   23 ms"*. A 23 ms reject is a local REJECT, not a timeout.

These fail differently (probe 1 misses rules added outside the script; probe 2 misses a transient upstream
outage). Both agree.

**Other paths attempted and their outcomes** — recorded so the next reader does not re-run them:

| Path | Outcome |
|---|---|
| `WebFetch` against Nominatim / OSM / Wikipedia | **Non-functional this session** — 6 attempts across 5 hosts, including `example.com` as a control, all returned no output. The control failure shows it is the tool, not the target |
| Staging backend's `/api/geocode` proxy | Staging host is **also not on the allowlist** (probe 1) — never available from here |
| Railway MCP (logs, deployments) | Project `adequate-vision`; staging deployment `WAITING` with an **empty** deploy-log array. No historical `[GEO]` evidence. *Single probe — I do **not** claim such logs never existed* |
| `WebSearch` | **Worked** — but returns search-engine summaries, not API responses |

### 5.2 What the OSM-presence proxy says

**Explicit inferential gap: this is "OSM has a named settlement object here", not "Nominatim returned
it."** Nominatim is a direct index of OSM `place=*` objects, so the chain is tight but not airtight.

| Place | In OSM? | Strongest evidence |
|---|---|---|
| **Dornie** | yes — **direct** | OSM **node 2133123145**, typed **Hamlet**, Highland |
| **Applecross** | yes | OSM-derived page typed **Village**, Highland |
| **Shieldaig** | yes | OSM-derived page typed **Village**, Highland |
| Plockton | yes | Settlement page, pop 468; school `W31958302`, hotel `N357962410` |
| Lochinver | yes | Settlement page, pop 651; lifeboat station `W209261934` |
| Durness | yes | Settlement page, pop 347 |
| Kyleakin | yes | Settlement page, pop ~300; community centre `W95233486` |
| Gairloch | yes | Settlement page, pop 620 — but a *"straggling community"* naming several settlements |
| Braemar | yes | Settlement page; heritage centre `N2466425937` |

Secondary set also present: Tobermory, Kyle of Lochalsh, Mallaig, Arisaig, Glenfinnan, Glenelg, Torridon.

### 5.3 The finding that matters more than the question asked

Reading `src/backend/services/nominatim-client.ts` directly (a positive finding — self-verifying):

```js
const SETTLEMENT_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'municipality']);
// ...
.filter((c) => c !== null && (c.type == null || SETTLEMENT_TYPES.has(c.type)))
```

`geocoding.service.ts` always queries with `countrycodes: <cc>, limit: '10'`.

**Two consequences, and the second is the risk:**

1. **Good news.** `countrycodes` eliminates the cross-border ambiguity risk — Arisaig (Nova Scotia),
   Glenelg (Australia), Tobermory (Ontario), Braemar (Ontario) all drop out before ranking.
2. **The real risk is the type filter, not OSM coverage.** Several of these names denote a *feature* as
   well as a settlement — **Torridon** (an area), **Applecross** (also a peninsula), **Gairloch** (also a
   sea loch and a collective name), **Braemar** (also resolves as a Region). A row typed `locality`,
   `peninsula`, `bay` or `administrative` is **discarded by our own code even though Nominatim returned
   it.** With `limit=10` the settlement node is usually also in the set — but "usually" is doing real work
   in that sentence.

   *Partial mitigation, in our favour:* the filter passes rows where `type == null`, so an untyped result
   survives. That narrows the exposure but does not close it.

> **Therefore ADL-48 §2.1 option (a) is probably safe on coverage grounds and less safe on filter
> grounds — a distinction neither ADL-48 nor its review drew.**
>
> **How to close this properly** (and it is one command from any unfirewalled host — the staging
> shakedown, or the PO's laptop):
> ```
> https://nominatim.openstreetmap.org/search?q=<name>&countrycodes=gb&limit=10&format=json&addressdetails=1
> ```
> for all 16 names, checking **not merely that results come back, but that at least one returned row has
> `type` in {city, town, village, hamlet, municipality}**. Testing presence alone would give a false pass.

**Confidence:** *"unreachable from here"* — **High** (two probes). *"OSM contains all nine"* — **High
(~90%)**. *"Nominatim returns a candidate our filter accepts"* — **Moderate (~75%)**, and that is the claim
ADL-48 G6 actually depends on.

---

## 6. Q5 — S1 correctness: the generator, built and run

`scripts/generate-gazetteer.mjs` is committed and was run against the real datasets. Output:

```
=== SUBDIVISIONS (S1) ===
  generated rows            : 714
  dropped (F4, empty ISO)   : 2
      DROP ID "West Papua"           (admin=39,  fips=39)
      DROP PH "Negros Island Region" (admin=NIR, fips=NIR)
  duplicate iso_3166_2      : 0 (none)
  live regions.json rows    : 76
  PRESERVED byte-for-byte   : 76 / 76
  MISSING from generated    : 0
  name/country mismatches   : 0
  net NEW rows (additive)   : 638

=== GAZETTEER CITIES (S2) ===
  rows                      : 170540
  rows in enabled countries : 84868
  joined to ISO subdivision : 84226 (99.24%)
  NULL region (all rows)    : 2336 (1.37%)

=== S1 SEED SAFETY: PASS ===
```

### 6.1 The proofs the brief asked for

| Requirement | Result |
|---|---|
| All **76** currently-seeded codes preserved byte-for-byte | **76 / 76.** Zero missing, and **zero name or country_code drift** — I compared names too, not just codes |
| Zero duplicate `iso_3166_2` across the generated set | **0** — so `ON CONFLICT (iso_3166_2)` has a well-defined target |
| Seed is genuinely additive | **+638 net new rows**, no deletions, no mutations of existing codes |
| Run against a **local** database | Yes — §2 and §7 both run on the generated artifact in local libSQL |

### 6.2 F2 — verified independently, and implemented

I verified the mechanism myself in `src/backend/db/schema.ts` rather than inheriting it:

- `cities.regionId` → `.references(() => regions.id)` — **confirmed**
- `regions.id` → `integer('id').primaryKey({ autoIncrement: true })` — **confirmed AUTOINCREMENT**
- `uniqueIndex('uniq_regions_iso_3166_2').on(t.iso3166_2)` — **confirmed, so the upsert target exists**
- `seedRegions()` gates on `existingCount > 0` and returns early (`startup.service.ts`) — **confirmed**,
  which is exactly why a regenerated 714-row file would never apply on staging or production without a
  gating change

**The review's F2 is correct and the risk is real.** ADL-48 §8.1 defines hash-gated seeding *only* as
`DELETE` + batch-insert, and justifies its safety as *"nothing references `gazetteer_cities`"* — a
precondition that is **false for `regions`**. An implementer reading §11's S1 row ("hash-gated reseed of
`regions`") and following §8.1 for the mechanism builds silent `cities.region_id` corruption.

The generator's header documents this at length and the S1 brief must state it:

> `regions` is reseeded by **hash-gated `INSERT … ON CONFLICT (iso_3166_2) DO NOTHING`** (optionally
> `DO UPDATE SET name = …`). It is **never** deleted and reloaded. §8.1's delete-and-reload applies to
> `gazetteer_cities` **only**, because that is the only table nothing references.

### 6.3 F4 — confirmed and fixed

Exactly **2** of the 716 raw rows carry an empty ISO code and would have seeded as `"ID-"` / `"PH-"` —
non-null and distinct, so they pass `NOT NULL` and the unique index and land as permanently unmatchable
garbage. The generator filters them and **names them in its output rather than dropping silently**. The
review's warning that this worsens as GE-07 enables more countries is well-founded: the same pattern
exists across the full 234-country set.

### 6.4 A correction to ADL-48's join figures

| Measure | ADL-48 | OP-27 review | **This spike** |
|---|---|---|---|
| Rows in enabled countries | 84,868 | 84,868 | **84,868** |
| Joined via crosswalk | 84,257 (99.28%) | 84,226 (99.24%) | **84,226 (99.24%)** |
| NULL region, all rows | 1,746 (1.02%) | 2,336 (1.37%) | **2,336 (1.37%)** |

**Third independent derivation: the review's figures are right and ADL-48's are slightly off.** Not
decision-bearing, but ADL-48 §4.1 should be corrected so a future implementer doesn't chase the gap.

### 6.5 F3 — the dependency cost, measured

| Package | Unpacked | Files | **Install time** |
|---|---|---|---|
| `cities.json@1.1.61` | 19 MB | **9** | **546 ms** |
| **`iso3166-2-db@2.3.11`** | **283 MB** | **42,268** | **11,837 ms** |

The generator needs exactly one file from it: `data/iso3166-2.json`, **3.35 MB**. The bulk is `regions/`
(205 MB) and `i18n/` (69 MB), neither of which the crosswalk touches.

**The install-time number is new — the review measured disk, not time.** 11.8 s is paid **per agent
worktree and on every CI run**, and this repo does both constantly (CLAUDE.md: *"a fresh worktree does not
inherit `node_modules`"*). At ~21× `cities.json`'s install cost for 0.02% of its useful payload, this is
the clearest cost/benefit failure in the proposal.

> **Recommendation: vendor `data/vendor/iso3166-2.json` (3.35 MB) with its provenance recorded per GE-18,
> and do not take the dependency.** It removes 280 MB, 42k files and ~12 s from every install, drops a
> two-year-stale single-maintainer package from the supply chain, and pins the crosswalk against silent
> upstream change. The generator already supports this: it resolves inputs from `--iso-db`,
> `$ISO3166_2_DB`, `data/vendor/`, then `node_modules/` in that order.
>
> **The spike deliberately does not add either package to `package.json`** — a spike should not impose a
> 283 MB install on every CI run for work that ships nothing. Inputs were passed explicitly from a scratch
> install.

---

## 7. Q6 — BUG-75: the identity-key call

### 7.1 The measurement, and a modelling correction I had to make myself

`uniq_cities_name_country_region_ci ON cities (name COLLATE NOCASE, country_code, COALESCE(region_id, 0))`
— verified in `schema.ts`.

**My first pass was wrong and I am recording it because the error is instructive.** I grouped by the
gazetteer's raw `region_iso`, which invents a discriminator the app does not have: `cities.region_id` is
forced NULL for every country with `region_tier_enabled = 0` (enforced in `cities.ts` POST, documented in
`schema.ts`). That **undercounts** collisions. The corrected model makes `region_id` non-NULL only where
the country is region-tier **and** the region is actually seeded — which makes the answer time-dependent,
so three scenarios must be measured, not one:

| Scenario | Colliding groups | **Unrepresentable rows** | >10 km | >50 km | Worst case |
|---|---|---|---|---|---|
| **A — TODAY** (76 regions: US/AU/CA/GB) | 5,900 | **8,876 (5.20%)** | 5,743 | 5,349 | **8,092 km** (Nikol'skoye, RU) |
| **B — post-S1** (714 regions, 26 countries) | 3,931 | **5,024 (2.95%)** | 3,765 | 3,312 | 1,922 km (Valverde, ES) |
| **C — post-S1 + 0.1° bucket** (~11 km) | 89 | **89 (0.05%)** | **0** | **0** | 8 km |
| **D — post-S1 + 0.01° bucket** (~1.1 km) | 1 | **1 (0.00%)** | 0 | 0 | 1 km |

**Scenario B reproduces the OP-27 review exactly** — 5,024 / 2.95% / 3,765 groups >10 km / Valverde at
1,921 km. Independent confirmation; the review is correct.

**What the review does not report is scenario A, and it is worse.** The COO's inference in the brief —
that with 22 of 26 region-tier countries holding zero regions the entire country becomes one identity
bucket — **is confirmed**, and I verified the country list from the repo's own data rather than accepting
it: AR, BD, BR, CN, ET, DE, IN, ID, JP, KZ, KR, MY, MX, MM, NG, PK, PH, RU, ZA, TH, UZ, VN.

### 7.2 Three consequences that change how this should be briefed

1. **The defect is live in shipped code today, at 5.20%, and is not gazetteer-specific.** It is latent only
   because `cities` holds 3 rows. **ADL-48 §7's headline — "there is no migration of `cities`" — is
   already false**, not falsified by the gazetteer. The gazetteer *reveals* the defect; it does not create it.
2. **S1 makes it better, not worse: 8,876 → 5,024.** Seeding 638 subdivisions gives the key a real
   discriminator in the 22 countries that currently have none. **This is an additional argument for
   dispatching S1 first**, and it inverts the natural assumption that more data means more collisions.
3. **A coordinate bucket is a decisive fix.** 0.1° (~11 km) removes **98.2%** of remaining collisions and
   leaves **zero** groups more than 10 km apart — i.e. it eliminates every case where the failure is
   "wrong town", leaving only 89 genuine near-duplicates where conflation is arguably correct behaviour.

Concrete GB cases surviving S1 (scenario B) — these are what a PO would actually hit:
`Ashington` 478 km · `Rochester` 469 km · `Washington` 450 km · `Newport` (4 rows) 342 km ·
`Richmond` 340 km · `Wootton` (4 rows) 328 km.

### 7.3 Recommendation

> **Widen the identity key with a coordinate bucket. Reject "accept conflation" and reject "hide
> colliding rows".**
>
> New key: `(name COLLATE NOCASE, country_code, COALESCE(region_id,0), lat_bucket, lng_bucket)` where the
> buckets are `ROUND(latitude, 1)` / `ROUND(longitude, 1)` stored as generated or explicit columns.
>
> **Why not the alternatives:**
> - *Accept conflation* — 8,876 rows today silently mis-pin, up to 8,092 km. GE-17's own success criterion
>   ("presents all of them distinguishably") would be honoured in the search list and then thrown away on
>   selection. That is a worse failure than the bug it replaces, because it is silent.
> - *Hide colliding rows* — 5,024 real places become unselectable, re-creating the coverage-floor problem
>   ADL-48 §2 exists to avoid. Solving a coverage argument by deleting coverage.
>
> **Why 0.1° and not 0.01°:** 0.01° leaves 1 collision instead of 89, but 1.1 km is tight enough that
> genuine duplicate entries for the same town (upstream near-duplicates, alternate spellings at slightly
> different centroids) stop converging — which re-opens the BUG-33 duplicate class the D13 key exists to
> close. **0.1° is the point where "different town" and "same town" separate cleanly:** zero groups above
> 10 km remain, so every surviving collision is a genuine same-place duplicate.
>
> **Cost, stated plainly:** a new unique index on `cities` — a real migration, staged per ADL-47 (expand:
> add nullable bucket columns + backfill; migrate: populate on write; contract: swap the unique index).
> **This blocks S3 and should be dispatched as its own brief, decoupled from ADL-48**, because it is a
> live defect on shipped code with 3 rows in the table — i.e. the cheapest it will ever be to fix.

---

## 8. Verified vs unverified

### 8.1 Unverified, with the probe and its blind spot

1. **Nominatim's coverage of the tail villages — UNVERIFIED.** §5. Two independent probes establish it is
   unreachable from this devcontainer; a third path (`WebFetch`) was non-functional this session,
   confirmed against a control host. Data claims rest on an **OSM-presence proxy**, not a Nominatim query.
   *Probe to close it:* the 16-name query in §5.3 from any unfirewalled host, **checking the returned
   `type` field, not merely that rows came back.** *Blind spot:* one query set at one moment.
2. **Turso INSERT throughput and write limits — UNVERIFIED.** §4.2. The diagnostic token is read-only,
   confirmed by an attempted write that was rejected. All Turso figures are `SELECT`s. *Probe:* a real
   batched insert from an S2 branch with a write-capable token. *Blind spot:* staging only — production
   may differ in region and plan.
3. **Whether Railway staging deploy logs ever contained `[GEO]` evidence — UNVERIFIED.** One probe (empty
   log array on a `WAITING` deployment). **I do not claim such logs never existed.**
4. **Trigram behaviour under Turso's server, at concurrency — UNVERIFIED.** All query timings in §2 are
   local libSQL, single-user, warm cache. The §2.6 regime analysis composes them with a separately measured
   network term; it does **not** measure Turso executing a trigram `MATCH` under load. *Probe:* replay the
   §2 benchmark against a staging table once a write-capable path exists.
5. **The 0.1° bucket's interaction with real upstream near-duplicates — PARTLY VERIFIED.** I measured that
   it leaves 89 collisions and zero groups >10 km. I did **not** hand-inspect those 89 to confirm each is a
   genuine same-place duplicate rather than two adjacent villages.
6. **`feature_code` recovery** — not attempted; ADL-48 §6.4 already marks it unverified and the design does
   not depend on it. I confirmed the premise: `cities.json` rows carry only `name, lat, lng, country,
   admin1, admin2`.

### 8.2 Verified in this spike, and how

- **Query plans, timings, semantic differences, equivalence, storage and rows-scanned (§2)** — by building
  the real 170,540-row table in local libSQL and running `EXPLAIN QUERY PLAN`, timed benchmarks (median of
  5–7 runs), full id-set comparison over 30 terms, and `dbstat`.
- **Filter-vs-rank and the four narrowing signals (§3)** — measured against the same real table.
- **Turso round-trip, batch behaviour, storage and the read-only boundary (§4)** — live against staging via
  `@libsql/client`, using the ADL-33 allowlisted path. The write refusal is a deliberate second probe.
- **Generator correctness: 714 rows, 76/76 byte-for-byte with names, 0 duplicates, 0 missing, +638 additive,
  2 F4 drops (§6)** — by running `scripts/generate-gazetteer.mjs` against the real packages and diffing
  against the repo's live `data/regions.json`.
- **F2's mechanism (§6.2)** — read directly in `schema.ts` and `startup.service.ts`: the FK, the
  AUTOINCREMENT, the unique index, and the `existingCount > 0` early return. Not inherited from the review.
- **F3's install cost (§6.5)** — timed `npm install` into a clean scratch directory; `du` and `find` for
  size and file count.
- **BUG-75 across four scenarios (§7)** — the identity key computed exactly as `schema.ts` defines it, with
  the region-tier invariant modelled correctly (after correcting my own first pass), pairwise separations
  per colliding group. Scenario B independently reproduces the OP-27 review to the decimal.
- **The 22 zero-region countries (§3.4/§7.1)** — computed from the repo's own `data/countries.json` and
  `data/regions.json`.
- **The coverage floor (§8.3)** — re-verified independently by three probes that fail differently.
- **The settlement-type filter (§5.3)** — read directly in `nominatim-client.ts`; a positive, self-verifying
  finding.

### 8.3 The coverage floor, re-verified independently

I re-ran ADL-48 §2's load-bearing claim with three probes that fail differently, against the artifact my
own generator produced:

| Probe | Result |
|---|---|
| **1 — exact name match, `country_code='GB'`** | All 9 tail names: **0**. Control set (Glasgow, Edinburgh, Inverness, Ullapool, Aviemore, Portree, Tarbert): **1 each**. Tobermory: **0** |
| **2 — case-insensitive substring, all 246 countries** | 7 of 9: **0**. `Applecross`: 1, `Braemar`: 2 — **elsewhere in the world**, not Scotland |
| **3 — name-free, any row within ~15 km of true coordinates** | All 9: **0 rows**. Method self-validates: Ullapool and Portree each return exactly 1 |

**Probe 2 is why probe 3 matters.** A purely name-based method would have reported Applecross and Braemar
as "present" — they are same-named places in other countries. The coordinate probe is independent of every
naming assumption and disambiguates. **ADL-48 §2's absences are genuine, and the Tobermory parenthetical is
correct.**

The review's P2 finding also reproduces exactly: the **NW Highlands box (lat 56.5–58.7, lng −7.5 to −3.5)
holds 45 rows total.** For the Scotland dogfood trial the gazetteer will be the **minority** path. That does
not undermine the design — it means S3's user-visible benefit is national/global, not for the trial that
motivated it, and the PO should hear that plainly.

---

## 9. Revised staging plan

The S1/S2/S3 split **still holds**, with the amendments below. Two items are **decoupled** — they are not
gazetteer work and should not wait for it.

| Stage | Change from ADL-48 §11 | Blocked on |
|---|---|---|
| **S0 — BUG-75 key widening** | **NEW, and decoupled.** Coordinate-bucket unique index on `cities`, staged expand/contract per ADL-47. Live defect, cheapest to fix now at 3 rows | Nothing. **Dispatch first** |
| **S1 — Subdivisions** | **Additive upsert, never delete-and-reload** (F2). **714 rows, not 716/940** (F4/F5). **Vendor the 3.35 MB crosswalk** (F3) | Nothing. Ready |
| **S2 — Gazetteer table + seed** | Add **FTS5 trigram** index. **`seedGazetteer()` off the boot path from day one** (§4.3). Use the **2,000-row `VALUES`** shape, 5× better than `batch()`. Pin the `cities.json` version in `gazetteer-meta.json` (P3) | S1; BRD gate GE-17/GE-18 |
| **S3 — Local-first lookup** | Search is **trigram**, not "exact then prefix". **Rank by trip country, do not filter.** Min 3 chars, 250 ms debounce, cap 50 + separate count | **S0**, S2, GE-16 amendment |
| **(follow-on)** | Proximity-to-existing-trip-place as a second ranking term (§3.4) | S3 |

**Also decoupled, unchanged from the review's disposition:** the BUG-71 fix should ship now; GE-16 needs
amending as a whole (F6), not one sentence; ADL-43 S2's 940-row figure needs a stamp (F5).

---

## 10. The strongest argument against my own verdict

> *"You have just added an FTS5 trigram index (+7.2 MB), a coordinate-bucket migration on `cities`, a
> vendored 3.35 MB data file and an off-boot seed command — on top of everything ADL-48 already proposed —
> for an app with 3 cities and 2 users. And your own §8.3 says the Scotland trial will mostly miss the
> gazetteer anyway."*

Three answers, and one concession.

1. **Two of the four changes make the proposal *smaller*, not larger.** Vendoring removes 280 MB and 12 s
   from every install. Trigram *replaces* three b-tree indexes rather than adding to them. The net
   implementation surface is close to flat.
2. **BUG-75 is not new scope — it is existing, shipped, unfixed scope that this exercise measured.** It
   would be there if ADL-48 were rejected outright. Discovering it at 3 rows is the good outcome; the
   alternative is discovering it after the table has user data and the migration is expensive.
3. **The "3 cities" framing is explicitly ruled out on this project** (`feedback_dont_architect_for_current_user_base`,
   2026-07-30). And the per-keystroke rows-read figure (§2.6) scales with *use*, not with data — it is
   already 170,540 rows per keystroke on day one.

**The concession, and it is real:** §8.3 means S3's benefit for the Scotland trial specifically is modest,
because most of those places fall through to the geocoder regardless. **If the PO's priority is the
Scotland trial rather than the product generally, the honest sequencing is S0 → S1 → BUG-71 fix → *pause*,
and revisit S2/S3 afterwards.** S1 closes the BUG-30 class and improves BUG-75 on its own; S0 fixes a live
defect. Those two deliver real value with no dependency on the contested half — which is ADL-48 §11's own
argument, and it survives this spike intact.

---

*Spike complete. No schema change was made, no migration was generated, no remote database was written to,
and `main` was not touched. The ~17 MB generated artifact is gitignored — 170,540 rows, 17,756,562 bytes,
`sha256:26ea16ec6eed8dee06eb420147b6536f5f5c8af91edfc2fc0423aa1ca0475fd4` — regenerate with
`node scripts/generate-gazetteer.mjs`.*

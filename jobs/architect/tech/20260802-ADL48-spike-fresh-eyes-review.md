# OP-27 fresh-eyes review — the ADL-48 feasibility spike

**Date:** 2026-08-02
**Reviewer:** Architect (second, fresh dispatch — no authorship of the spike, ADL-48, its OP-27 review, ADL-43, ADL-46 or the BUG-71 documents)
**Under review:** `jobs/architect/tech/20260802-ADL48-feasibility-spike.md` (on `main` at 04715fc, PR #362)
plus `scripts/generate-gazetteer.mjs` and `scripts/spike/*.mjs`
**Tracker:** QUAL-25 · BUG-75 · ADL-48 · GE-16/GE-17/GE-18
**Branch:** `chore/adl48-spike-fresh-eyes-review`
**Status:** Complete. Verdict in §1.

Every finding below was established by running code in this worktree against the regenerated
170,540-row dataset, against a real libSQL database, or against Turso staging/production over the
ADL-33 read-only diagnostic path. Nothing is asserted from reading alone unless the finding is a
positive one (a thing that is there, which self-verifies). Four of my own suspicions were
**disproved** by probing and are recorded as such in §3.

---

## 1. Summary table and verdict

> ## VERDICT: **SPLIT — the gazetteer half stands; S0 does not**
>
> **The spike's GO-with-changes verdict on ADL-48 stands.** Q1–Q5 survived independent
> re-testing, and where I set out to break the headline numbers I mostly failed — the
> BUG-75 scenario figures, the generator output, the S1 inversion, the coverage floor and
> the package costs all reproduced exactly. **S1 is safe to dispatch as written.**
>
> **S0 is not safe to dispatch as written.** The coordinate-bucket recommendation carries
> three independent blockers, any one of which is sufficient. The most serious is not that
> the index is risky — it is that **the index does not fix the defect it is proposed for**,
> because identity is decided before coordinates exist. That is an architectural
> contradiction, not an implementation detail, and it is invisible in the spike because
> §7 was reasoned about the *data* and never against the *write path*.

| # | Finding | Severity | Blocks |
|---|---|---|---|
| **F1** | `ROUND(NULL,1)` is NULL, and SQLite treats NULLs as **distinct** in a unique index. The proposed key admits duplicate `pending` cities — re-opening BUG-33 through the door the existing `COALESCE(region_id,0)` sentinel exists to close | **BLOCKER** | S0 |
| **F2** | **The widened index never fires.** `findOrUpgradeCity` pass 1 decides identity *before* `resolveCityName` runs and has no coordinates. The route returns the wrong town at 200 without ever attempting an insert | **BLOCKER** | S0 |
| **F3** | The identity key **mutates after insert**. `resolveCity()` UPDATEs lat/lng; under the widened key that UPDATE throws a UNIQUE violation on the ordinary geocode-retry path | **BLOCKER** | S0 |
| **F4** | The 0.1° bucket **false-splits genuinely-same-place rows** — 32.7% of same-name pairs within 5 km. The spike's success metric counts every false split as a success. No bucket size is clean; this is grid quantisation, not tuning | **MAJOR** | S0 |
| **F5** | "0.1° (~11 km)" holds only in latitude. In longitude it is 11.1·cos(lat) km — **5.95 km in the Scotland dogfood region**, 2.27 km at 78°N. The spike rejected 0.01° as "too tight at ~1.1 km" while its chosen cell is already half-way there on one axis | **MAJOR** | S0 |
| **F6** | "Trigram is a **provable drop-in**, 30/30 identical, no user-visible change" is **false**. 9 of 49 adversarial terms diverge. `LIKE` folds ASCII only; trigram folds Unicode. 21.0% of rows carry a non-ASCII character. The 30 test terms were all plain lowercase ASCII | **MAJOR** | S3 brief wording |
| **F7** | The recommended query interpolates the raw user string into a double-quoted FTS5 `MATCH` expression. A `"` in the query is `unterminated string` → **500**. Also permits FTS5 operator injection | **MAJOR** | S3 |
| **F8** | Every Turso figure is a **read**, including `batch(stmts, 'read')`. §9's S2 row nonetheless instructs "use the 2,000-row `VALUES` shape, 5× better than `batch()`" — a write instruction derived from a read ratio | **MEDIUM** | S2 brief wording |
| **F9** | The 3-character floor is presented as free. It is a change at **5 sites in 3 files** (all `>= 2` today), 79 rows become unreachable by their own name, and the recommended 250 ms debounce is **shorter** than the shipped 300 ms | **MEDIUM** | S3 |
| **F10** | ADL-48 framed build-vs-buy and never asked *which* gazetteer. `cities.json` has **no stable row id** — that absence is the sole reason a coordinate bucket was reached for. `all-the-cities` (MIT, GeoNames) ships `cityId`, `featureCode` and `population`. A `gazetteer_id` column retires F1–F5 for that path | **MEDIUM** (framing) | S0/S2 scope |
| **F11** | Benchmark shapes are not equivalent — `LIKE` is timed with `ORDER BY name`, trigram without. **Re-run apples-to-apples the conclusion holds** (31.5× median, 6.2× worst term). Flagged only so the brief quotes defensible numbers | **LOW** | nothing |
| **F12** | §1 Q1d / §2.7's "the ambiguity `COUNT`/`GROUP BY` is ~0.2 ms" is a best case quoted as typical — 3.96 ms warm for `san`, the spike's own worked example | **LOW** | nothing |

### Is S0/S1 safe to dispatch as written?

- **S1 — YES.** Dispatch as written. I reproduced the generator byte-for-byte (`sha256:26ea16e…`
  matches), confirmed 714/76-of-76/0/0/+638 and the two named F4 drops, and closed a gap the spike
  left open: it verified additivity against `data/regions.json` only, so I checked the **live**
  databases. Staging and production each hold exactly **76** regions. The additive-upsert claim
  holds against real data, not just the repo file.
- **S0 — NO.** Send it back. F1–F3 are each independently fatal, F4/F5 undermine the choice of
  bucket size, and F10 offers a design that removes the need for the bucket altogether.
- **Recommended sequencing, which inverts the spike's own:** **S1 → BUG-71 stopgap → pause.**
  The spike says "S0 — Dispatch first". S0 should not be dispatched at all until re-designed.

### On the three framing questions the brief asked

**Is "GO with changes" the right shape?** For Q1–Q5, yes. The Scotland concession (§8.3, NW
Highlands = 45 rows — I reproduce this exactly) is honestly stated and does not undercut the
verdict, because the spike itself lands on "S0 → S1 → BUG-71 fix → *pause*". The concession
undercuts the *sequencing*, not the verdict, and the spike already says so.

**Is the four-change list four changes or one plus three consequences?** It is genuinely four
independent changes — different stages, different mechanisms, no shared root. The COO's
hypothesis does not hold and I could not make it hold. **But there is a different defect in the
list:** change 4 is not a change to ADL-48 at all. ADL-48 never proposed S0. It is **net-new
scope introduced under a heading that reads as a modification**, and it is the only item on the
list that costs a migration on shipped user-facing state. That framing is how a three-blocker
proposal arrived looking like a correction.

**Is there a cheaper design the build-vs-buy frame excluded?** Yes — see **F10**. The frame asked
"bundle a gazetteer or use a geocoder" and never asked "*which* gazetteer". The coordinate bucket
exists only because the chosen dataset has no stable row identity. That is a property of
`cities.json`, not of the problem.

---

## 2. Findings in full

### F1 — BLOCKER. `ROUND(NULL,1)` is NULL, and NULLs are distinct in a unique index

**The recommendation, verbatim (§7.3):**

> New key: `(name COLLATE NOCASE, country_code, COALESCE(region_id,0), lat_bucket, lng_bucket)`
> where the buckets are `ROUND(latitude, 1)` / `ROUND(longitude, 1)` stored as generated or
> explicit columns.

`cities.latitude` and `cities.longitude` are **nullable and NULL while `geocode_status = 'pending'`**
(`src/backend/db/schema.ts`, comment on the columns). The pending insert at
`src/backend/routes/cities.ts` step 4c supplies no coordinates at all — and GE-12 guarantees that
path is reachable, because creation must never depend on the geocoder.

**Probe (built the index exactly as §7.3 states it, ran the real insert shape):**

```
-- A1. ROUND(NULL,1)  ->  {"r":null,"t":"null"}
-- A2. two pending rows, same name/country/region, NULL coords
   INSERT by userA: ACCEPTED
   INSERT by userB: ACCEPTED          <-- 2 rows
   >>> DUPLICATE PENDING ROWS CREATED
-- A3. control, TODAY's shipped index
   INSERT by userA: ACCEPTED
   INSERT by userB: REJECTED — SQLITE_CONSTRAINT_UNIQUE: index 'uniq_today'
```

**The proposed index is strictly weaker than the one it replaces, for exactly the rows the app
creates most.** This is not a novel hazard — `schema.ts` already documents it for the adjacent
column:

> `region_id` is nullable and SQLite treats NULLs as distinct in a unique index, so a naive
> `UNIQUE(name, country_code, region_id)` would re-open BUG-33 for every non-region-tier country.
> `COALESCE(region_id, 0)` collapses NULL to a sentinel…

The spike repeats the mistake the schema comment exists to prevent, one column over. A sentinel
(`COALESCE(ROUND(latitude,1), -999)`) closes F1 — but it does not touch F2 or F3, and the spike's
text contains no sentinel.

### F2 — BLOCKER. The widened index never fires, so it does not fix BUG-75

This is the finding I would lead with if the COO reads only one.

`POST /api/cities` calls `findOrUpgradeCity` **before** `resolveCityName`. If pass 1 matches, the
route returns 200 with the existing row and never geocodes, never inserts, and never consults any
unique index. Pass 1's lookup is, verbatim from `cities.ts`:

```
WHERE country_code = ? AND name = ? COLLATE NOCASE AND COALESCE(region_id, 0) = ?
```

It has **no coordinates to bind**. That is structural, not an oversight: the user types a name,
and GE-12 requires creation to succeed with the geocoder offline.

**Probe — the D13 flow simulated end to end against the widened index:**

```
  seeded: Newport/GB @ 51.588,-2.998 (Wales), resolved
  user adds "Newport"/GB  (means Isle of Wight, 50.701,-1.291)
  pass-1 lookup returns 1 row(s): {"id":1,"name":"Newport","latitude":51.588,"longitude":-2.998}
  >>> route returns 200 with the WALES row. The user gets the wrong town.
  >>> The widened UNIQUE INDEX was never consulted — the insert never happened.
```

That is BUG-75's exact symptom, unchanged, with the recommended fix fully applied.

The spike states S0's cost as *"a new unique index on `cities` — a real migration, staged per
ADL-47"*. The actual cost is that plus **re-opening the ADL-46 D13 three-step find-or-create
contract** (`cities.ts` §4.2.1 — the most heavily-reasoned block in the route, with a 45-line
doc comment covering steps 1, 2, 2b and the BUG-33 reverse door). Nothing in §7 mentions it.

And it cannot simply be reordered. Geocode-then-lookup contradicts GE-12, and still leaves the
offline path with no coordinates to key on.

### F3 — BLOCKER. The identity key mutates after insert

`resolveCity()` UPDATEs `latitude`/`longitude` on an existing row (`geocoding.service.ts`, the
`verdict.status === 'ok'` branch). A unique-index component that changes value after the row exists
means the *retry queue* can violate the constraint.

**Probe:**

```
-- A4. rows before resolution: 2   (one resolved Newport, one pending Newport)
   resolveCity() UPDATE: THREW — SQLITE_CONSTRAINT_UNIQUE: index 'uniq_new'
   >>> the geocoder retry queue hits a constraint violation on a normal path
```

The pending row arrives via F1's duplicate path; resolution then tries to move it into an occupied
bucket. Adding the F1 sentinel does not remove this — it makes it *more* likely, because the
sentinel forces every unresolved row into one bucket that resolution must then leave.

An identity key must be immutable. This one is written twice: once by the user, once by a
background job, minutes apart.

### F4 — MAJOR. The bucket false-splits same-place rows, and that was never measured

The spike measures collisions **removed** (5,024 → 89, "98.2% fixed") and never measures pairs
**newly separated**. Those are not symmetric: every false split *reduces* the collision count, so
the success metric scores wrong separations as wins.

**Probe — same-name pairs inside a scenario-B group, by true separation:**

| Bucket | pairs ≤1 km | split | pairs ≤2 km | split | pairs ≤5 km | split |
|---|---|---|---|---|---|---|
| **0.1°** | 3 | **1 (33.3%)** | 21 | **4 (19.0%)** | 113 | **37 (32.7%)** |
| 0.01° | 3 | 2 (66.7%) | 21 | 20 (95.2%) | 113 | 112 (99.1%) |

The spike's stated rationale for 0.1° over 0.01° is:

> **0.1° is the point where "different town" and "same town" separate cleanly:** zero groups above
> 10 km remain, so every surviving collision is a genuine same-place duplicate.

**It does not separate cleanly.** A third of pairs within 5 km — near-certainly the same place —
land in different cells. The reason is categorical: a bucket is a **grid**, not a radius, and grid
cells never merge across an edge however close two points are.

```
-- A5. two points 22 m apart:  51.6499 -> bucket 51.6 ;  51.6501 -> bucket 51.7
```

**No bucket size fixes this.** Shrinking makes it worse (99.1% at 0.01°); growing re-admits the
wrong-town conflations the bucket exists to prevent. "Same place within X km" is a proximity
predicate; a unique index over quantised coordinates cannot express it. The spike's own §8.1 item 5
half-notices this — it marks the interaction with real near-duplicates PARTLY VERIFIED and says it
did not hand-inspect the 89 — but it inspects the wrong side of the ledger: the risk is in the
4,935 that *stopped* colliding, not the 89 that remain.

### F5 — MAJOR. "0.1° ≈ 11 km" is only true in latitude

0.1° of longitude spans 11.1·cos(lat) km:

| | 0.1° longitude |
|---|---|
| equator | 11.10 km |
| London (51.5°N) | 6.91 km |
| **NW Highlands (57.6°N)** | **5.95 km** |
| Reykjavík (64.1°N) | 4.85 km |
| Longyearbyen (78.2°N) | 2.27 km |

The spike rejects 0.01° because *"1.1 km is tight enough that genuine duplicate entries for the
same town … stop converging"*. At the latitude of the dogfood trial the chosen cell is already
**5.95 km** on one axis — half-way to the value rejected as unsafe, in the region the PO will
actually test. The cell is also anisotropic, so "within ~11 km" is never what the key means
anywhere except the equator.

### F6 — MAJOR. Trigram is not a drop-in, and the equivalence proof used only ASCII

The claim (§1 Q1 row, §2.4):

> **FTS5 trigram = 0.2 ms with a *provably identical* result set (30/30 terms)** … There is no
> product decision to make here and **no user-visible change to communicate**.

The 30 terms are visible in full at `scripts/spike/gazetteer-identity-analysis.mjs` — `york`,
`orleans`, `angeles`, `vegas`, `ness`, `sur`, `ton`, `ville`, `burg`, `ford`, `san`, `new`, `port`,
`chester`, `shire`, `dale`, `wick`, `beach`, `grand`, `saint`, `mouth`, `stone`, `bury`, `field`,
`haven`, `ridge`, `brook`, `wood`, `hill`, `lake`. All plain lowercase ASCII. The bench's own
`TERMS` list is likewise 8 plain-ASCII strings. **Not one diacritic, apostrophe, hyphen or
non-Latin character is tested anywhere in the spike's term lists** (established by reading both
arrays in full — a positive finding).

**Probe — 49 adversarial terms against the same 170,540-row table: 40 identical, 9 divergent, 0 errors.**

```
   "ZÜR"     LIKE=0   trigram=51    e.g. Zürich/CH
   "KÖLN"    LIKE=0   trigram=1     e.g. Köln/DE
   "SÃO"     LIKE=0   trigram=446   e.g. São João dos Inhamuns/BR
   "MÁLAGA"  LIKE=0   trigram=4     e.g. Vélez-Málaga/ES
   "Ñez"     LIKE=0   trigram=26    e.g. Fernán-Núñez/ES
   "åre"     LIKE=2   trigram=3     e.g. Åre/SE
   "Åre"     LIKE=1   trigram=3     e.g. Skåre/SE
   "øst"     LIKE=2   trigram=3     e.g. Østbirk/DK
   "Øst"     LIKE=1   trigram=3     e.g. Røst/NO
```

**Mechanism, established by a second independent probe** rather than inferred from the bulk result:

```
-- B5. SQLite LIKE:      'Z' LIKE 'z' -> 1 folded ;  'Ü' LIKE 'ü' -> 0 NOT folded
                         'Ö','Ã','Á','Å','Ø' all NOT folded
-- B6. trigram tokenizer: MATCH "ZÜR","KÖLN","SÃO","MÁLAGA","ÅRE","ØST" -> 1 each
```

`LIKE` case-folds ASCII only; the FTS5 trigram tokenizer folds Unicode. **21.0% of gazetteer rows
(35,866 / 170,540) carry a non-ASCII character**, so this is not an edge.

**This is not a reason to reject trigram — every divergence is in the user's favour.** Trigram
finds `Zürich` from "ZÜR" where today's search returns nothing. It is a reason to reject the
*claim*. "Identical, nothing to communicate" would put an untested behaviour change over a fifth
of the dataset into an implementation brief with no fallback and no test.

**Unconsidered and cheap:** FTS5 supports `tokenize='trigram remove_diacritics 1'`. Measured:

| query | `trigram` | `trigram remove_diacritics 1` |
|---|---|---|
| `zurich` | 0 | **1** (finds Zürich) |
| `sao` | 0 | **1** (finds São Paulo) |
| `koln` / `malaga` / `geneve` | 0 | **1** each |

A British user typing "zurich" or "malaga" on a UK keyboard finds nothing today and nothing under
the spike's configuration. This is a real product improvement the spike did not evaluate, and it
makes the diacritic behaviour an explicit, deliberate choice rather than an inherited default.

### F7 — MAJOR. A `"` in the search box is a 500

The spike's recommended shape (its own bench, and §2.7's cap/count design) binds the user's raw
query into a double-quoted FTS5 phrase: `args: [`"${q}"`]`.

**Probe:**

```
   MATCH "ab"c"    -> THREW: unterminated string          <-- 500 on the search route
   MATCH "york""   -> THREW: unterminated string          <-- 500
   MATCH "a"b"c"   -> trigram=0  LIKE=0                   <-- parsed as 3 phrases, silently wrong
   MATCH "a*b" / "a AND b" / "a NEAR b" / "a^b" / "a:b"   <-- parsed as operators, not literals
```

Today's `LIKE '%q%'` handles every one of these without incident. This is **not** SQL injection —
the statement is parameterised and the MATCH expression can only address the FTS table — but it is
a user-triggerable 5xx and an FTS5-expression injection, and it is present in the code the brief
would be written from.

**Fix, verified:** double the quote before binding.

```
   raw="ab"c"   escaped="ab""c"   -> trigram=0 LIKE=0  OK
   raw="york""  escaped="york"""  -> trigram=0 LIKE=0  OK
```

Separately, today's `LIKE` path has its own unescaped-wildcard behaviour (`%` matches all 170,540
rows; `y%k` matches 2,820) which trigram silently changes to 0. Another entry in the "not
identical" column, and worth a line in the brief.

### F8 — MEDIUM. Write recommendations rest on read measurements

The spike is careful and correct to mark INSERT throughput UNVERIFIED (§4.2), and its
attempted-write second probe is exactly right. But the caveat does not propagate.

`scripts/spike/gazetteer-turso-probe.mjs` measures `remote.batch(stmts, 'read')` over
`SELECT 1` statements, and `SELECT COUNT(*) FROM (VALUES …)` for the payload shape. Both are
**reads**, and `batch(…, 'read')` may be served from a replica rather than the primary.

§9's S2 row then instructs:

> Use the **2,000-row `VALUES`** shape, 5× better than `batch()`

That 5× is a ratio between two read timings, applied to a write workload with different
transaction semantics (`batch()` wraps an implicit transaction; a multi-row `VALUES` insert does
not). §1's Q3 row likewise states "wire time for a full seed ≈ 3–14 s" with no inline caveat.

The off-boot-path recommendation is right and makes the risk academic — but the S2 brief must not
carry the 5× as an established fact. It is a hypothesis to test with a write-capable token.

### F9 — MEDIUM. The 3-character floor is not free

§2.4/§2.5 present the minimum as costless because "the UX answer and the trigram constraint
coincide". Three things are missing:

1. **It is five sites, not "the route".** All currently `>= 2`:
   `src/backend/validation/cities.schemas.ts` — `q: z.string().trim().min(2, …)`;
   `src/frontend/hooks/useCities.ts:118` — `enabled: query.trim().length >= 2`;
   `src/frontend/components/TripDetail/AddPlaceFlow.tsx:246, 365, 369`.
   Miss the zod schema and a 2-character query reaches the trigram index and returns 0 rows
   silently — the exact trap §2.4 warns about.
2. **79 gazetteer rows have names of ≤2 characters** and become unreachable by their own full
   name (`As`/BE, `Au`/AT, `Ay`/FR, `Bo`/SL, `Eu`/FR, `Ho`/GH, `Ie`/JP …). Small, but it is a
   coverage loss in a document whose §2 is an argument about coverage floors.
3. **The recommended 250 ms debounce is shorter than the shipped 300 ms**
   (`AddPlaceFlow.tsx:46`, `DEBOUNCE_MS = 300`). Adopting it *increases* request volume — the
   opposite of §2.6's rows-read argument. The spike presents debounce as "the latency lever"
   without noting the app already debounces, and at a longer interval.

### F10 — MEDIUM (framing). The bucket exists because the dataset has no identity

ADL-48 framed the space as build-vs-buy — bundle a gazetteer, or keep the geocoder. The spike
inherited that frame wholesale and stress-tested everything inside it. Neither document asks
**which** gazetteer.

`cities.json` carries exactly `name, lat, lng, country, admin1, admin2` — I confirmed this over the
**union of keys across all 170,540 rows**, not a sample, so the spike's §8.1 item 6 is correct.
**That absence is the entire reason a coordinate bucket was reached for.** With no stable upstream
id, quantised coordinates are the only remaining discriminator — and F1–F5 are all consequences of
that choice, not of the problem.

`all-the-cities@3.1.0` (MIT, GeoNames-derived) ships, per row:

```
{"cityId":3039154,"name":"El Tarter","altName":"","country":"AD","featureCode":"PPL",
 "adminCode":"02","population":1052,"loc":{"type":"Point","coordinates":[1.65362,42.57952]}}
```

- **`cityId`** — 135,233 values across 135,233 rows, **zero duplicates**. A stable external identity.
- **`featureCode`** — 18 distinct PPL* codes. This is ADL-48 §6.4's "unverified, not attempted"
  `feature_code` question, answered.
- **`population`** — the relevance signal the §3 ranking design currently lacks entirely.
- **`altName`** — alternate names, directly useful to search.

**What this buys:** a nullable `gazetteer_id` on `cities`, unique when present. A gazetteer-sourced
city's identity is then known **at selection time**, *before* the insert, and **never changes**.
That removes F1 (no NULL sentinel needed — the id is present exactly when the row came from the
gazetteer), F2 (pass 1 can key on it, because the frontend already holds it when the user picks a
row), F3 (immutable), F4 and F5 (no quantisation at all). The existing natural-key index stays
untouched for user-typed rows.

**What it does not buy, stated plainly:** it does nothing for cities the user types that the
gazetteer does not contain — which is the geocoder tail, and the majority path for the Scotland
trial. Those rows keep today's `(name, country, region)` key and today's limitation. But that is a
strictly smaller problem than the one S0 proposes to solve, and it needs no migration of shipped
state.

**Coverage is not a reason against it, and not a reason for it.** The NW Highlands box holds 46
rows in `all-the-cities` versus **45** in `cities.json` (I reproduce the spike's 45 exactly), and
none of the 9 tail villages appear in either. ADL-48 §2's coverage floor is dataset-independent
and stands. `all-the-cities` is smaller overall (135,233 vs 170,540) and is a different trade, not
a strict upgrade — `Tobermory`, which §8.3 records as absent from `cities.json`, is present in it.

I am not recommending the swap on this evidence alone. I am recording that **the question was never
asked**, that it is cheap to ask, and that the answer plausibly retires the only item on the
spike's four-change list that costs a migration on live user data.

### F11 — LOW. Benchmark shapes are not equivalent (and correcting it does not change the answer)

`scripts/spike/gazetteer-bench.mjs` times `LIKE` as
`… WHERE name LIKE ? ORDER BY name LIMIT 50` (line 193) and trigram as
`… WHERE gaz_trigram MATCH ? LIMIT 50` (line 205) — **sorted against unsorted**. §2.2's headline
table (8.7 ms vs 0.2 ms) therefore compares different query shapes, and §3.2's "trigram already
costs 0.2 ms unnarrowed, faster than the *filtered* `LIKE`" inherits it.

**I expected this to be the review's biggest finding. It is not — I re-ran it and the spike wins
anyway.** Median ms, 7 runs, all shapes `LIMIT 50`:

| term | matches | LIKE+ORDER | trigram (no ORDER) | trigram+ORDER | trigram+RANK+ORDER | LIKE+RANK+ORDER |
|---|---|---|---|---|---|---|
| york | 40 | 7.67 | 0.21 | 0.20 | 0.16 | 7.62 |
| san | 6,965 | 8.75 | 0.17 | 1.37 | **1.48** | **9.15** |
| ton | 3,295 | 8.61 | 0.17 | 1.06 | 1.22 | 8.92 |
| ville | 1,799 | 7.72 | 0.20 | 1.02 | 0.97 | 7.92 |
| **MEDIAN (11 terms)** | | **8.61** | 0.20 | 0.27 | **0.27** | **8.92** |

- spike's headline ratio (sorted `LIKE` vs unsorted trigram): 43.7×
- **apples-to-apples, both `ORDER BY name`: 31.5×**
- **as recommended for production (rank + order): 32.9×; worst common term `san`: 6.2×**

The methodological flaw is real and should be corrected in the record. The recommendation is
unaffected. §2.6's regime analysis — which already tells the PO the deployed win is ~22%, not 40× —
remains the honest framing and is one of the better passages in the document.

### F12 — LOW. "~0.2 ms" for the ambiguity query is a best case quoted as typical

§1's Q1d row and §2.7 both state the separate `COUNT(*)`/`GROUP BY` is "~0.2 ms under trigram, so
it is affordable to always run it". Warm medians, 15 runs:

| term | matches | trigram `COUNT(*)` | trigram `GROUP BY(cc, region)` | `LIKE GROUP BY` today |
|---|---|---|---|---|
| york | 40 | 0.05 | 0.09 | 7.28 |
| ton | 3,295 | 0.10 | 2.11 | 10.28 |
| **san** | **6,965** | 0.16 | **3.96** | 12.13 |

`san` is the spike's own worked example in §2.7's truncation table. Still a large win over `LIKE`;
the decision is unchanged. The brief should budget ~4 ms, not 0.2 ms, for an always-run hot-path
query.

---

## 3. What I tried to break and could not — four of my own findings, disproved

Recorded because a review that only reports hits is not a review.

1. **"The spike's case-fold model is wrong."** It groups with JS `toLowerCase()` (folds Unicode);
   SQLite `COLLATE NOCASE` is ASCII-only. **2,576 rows fold differently** between the two. I
   expected the collision counts to be overstated. Re-ran every scenario with a correct ASCII-only
   fold: **8,876 / 5,024 / 89 — identical to the last row.** Zero effect. The model is imprecise
   and the answer is right.
2. **"The antimeridian breaks the bucket."** `ROUND(179.96,1)=180.0` and `ROUND(-179.96,1)=-180.0`
   do not wrap, so the same meridian yields two cells. **But the dataset holds 0 rows with
   |lng| > 179.5.** Theoretical only; not a finding against the spike.
3. **"The 3-character floor is script-biased against CJK."** `北京` and `서울` are complete
   2-character city names that trigram cannot match. **The dataset holds 0 CJK/Kana/Hangul names**
   (the source is romanised), 9 Cyrillic and 4 Arabic. The exposure is the Latin-script ≤2-char
   names in F9, which is a much smaller claim than the one I started with.
4. **"The `san` ORDER BY cost is ~6 ms and sinks the perf argument."** My first measurement said
   6.32 ms. Re-measured warm over more runs: **1.48 ms.** The first was a cold-cache artefact. I
   corrected it before filing rather than shipping the alarming number — F11 and F12 are what
   survived.

**Also independently reproduced, exactly, in the spike's favour:**

- BUG-75 scenarios A/B/C/D: 8,876 (5.20%) / 5,024 (2.95%) / 89 (0.05%) / 1 — including the 8,092 km
  Nikol'skoye worst case, Valverde at 1,922 km, and 3,765 groups >10 km. **The S1 inversion
  (8,876 → 5,024) is real**; the counter-intuitive claim survives.
- The generator: 714 rows, 2 named F4 drops (`ID "West Papua"`, `PH "Negros Island Region"`),
  0 duplicate ISO, 76/76 preserved, 0 missing, 0 drift, +638 additive, 99.24% join, 1.37% NULL —
  and the artifact hash `sha256:26ea16ec6eed8dee06eb420147b6536f5f5c8af91edfc2fc0423aa1ca0475fd4`
  matches byte-for-byte.
- Package costs: `cities.json` 19 MB / 9 files; `iso3166-2-db` 283 MB. The vendoring
  recommendation (change 3) is sound and I have no reservation about it.
- NW Highlands box: **45 rows**.
- `cities.json` field set: verified over all 170,540 rows, not a sample.

**Gap I closed in the spike's favour.** The spike proves S1 additivity against
`data/regions.json`, the repo file. The claim that matters is about the **live** tables. Via the
ADL-33 read-only diagnostic path (no writes, `SELECT` only):

```
staging : regions=76  cities=3  countries=250  cities_null_latlng=0  pending=0
prod    : regions=76  cities=2  null_latlng=0
```

Both match the file exactly. **S1's additive-upsert claim holds against live data.** Note also
that both environments currently hold **zero** NULL-coordinate cities — so F1/F3 are latent today,
not active. They activate the first time the geocoder is unavailable during a create, which is a
path GE-12 exists to guarantee.

---

## 4. Recommended disposition

| Item | Spike says | This review says |
|---|---|---|
| **S1 — subdivisions** | Ready, dispatch | **Agree. Dispatch as written.** Additivity re-verified against live staging and production |
| **Change 3 — vendor the crosswalk** | Adopt | **Agree.** No reservation |
| **Change 1 — trigram, not `LIKE`, not prefix** | Adopt | **Agree on the decision.** Strike "provable drop-in / identical / no user-visible change" from the brief (F6); add `"`-escaping (F7); decide `remove_diacritics` deliberately; quote F11/F12's numbers |
| **Change 2 — additive upsert for `regions`** | Adopt | **Agree.** Verified independently in `schema.ts` and against both live databases |
| **Change 4 / S0 — coordinate bucket** | Dispatch first, decoupled | **Reject as specified.** F1, F2, F3 are each independently fatal; F4/F5 undermine the bucket size; F10 offers a design without a bucket. **Return to the ADL-48 author** |
| **Sequencing** | S0 → S1 → BUG-71 → pause | **S1 → BUG-71 stopgap → pause.** S0 re-designed first |
| **Q4 Nominatim tail** | STILL UNVERIFIED, close on shakedown | **Agree**, and §5.3's insistence on checking the returned `type` rather than mere presence is the sharpest thing in the document |

**What S0's re-design has to answer**, in order — these are the acceptance criteria for a
re-dispatched brief, not a wish list:

1. What is the identity of a city whose coordinates are **not yet known**? (F1)
2. How does `findOrUpgradeCity` pass 1 evaluate that identity **before** geocoding? (F2)
3. What happens when `resolveCity()` moves a row into an occupied identity? (F3)
4. If identity is proximity-based, what expresses "same place within X km" — because a unique
   index over quantised coordinates does not. (F4, F5)
5. Has a gazetteer source carrying a **stable row id** been evaluated? (F10)

**BUG-75 remains real and I am not arguing it away.** The Newport/Isle-of-Wight case in F2 is a
live user-facing defect on shipped code, exactly as the spike says, and my probe reproduces it. My
objection is that the proposed fix does not fix it. One correction to the framing, though: the
"5.20% / 8,876 rows" figure is measured over all 170,540 gazetteer rows — a **bulk-load statistic**
for a table that holds 3 rows and is filled one user action at a time. I checked whether that
inflates it, and it mostly does not: per country the rate is 15.9% (MX), 19.9% (PH), 17.1% (CN) and
**4.16% for GB**, the dogfood country. The magnitude survives; the framing ("live defect today, at
5.20%") should say what the denominator is.

---

## 5. Verified vs unverified in this review

**Unverified, with probe and blind spot:**

1. **Whether `all-the-cities`' `cityId` values are stable across releases — UNVERIFIED.** I
   verified uniqueness within v3.1.0 (135,233 distinct of 135,233) and that the field is the
   GeoNames id by inspection of its shape. I did **not** compare two package versions. *Blind
   spot:* a re-release could renumber, which would matter for a stored `gazetteer_id`. *Probe to
   close:* install two versions and diff `cityId` for a fixed name set.
2. **Whether `remove_diacritics 1` is available on Turso's server build — UNVERIFIED.** Tested on
   local libSQL, SQLite 3.45.1. *Blind spot:* Turso's engine build may differ. *Probe:* create the
   virtual table on a staging branch with a write-capable token.
3. **Every timing here is local libSQL, single-user, warm cache** — same blind spot the spike
   declares in its §8.1 item 4, and it applies equally to my F11/F12 numbers.
4. **F2's route-level trace is a faithful simulation, not the running server.** I reproduced pass
   1's `WHERE` clause verbatim from `cities.ts` against a real libSQL database rather than booting
   Express and issuing an HTTP POST. *Blind spot:* if some middleware or a caller I did not read
   supplies coordinates before pass 1, the finding weakens. I read the POST handler end to end and
   found no coordinate source before `resolveCityName`; I did not exhaustively trace every caller.

**Verified, and how:** F1/F3 by building the proposed index in libSQL and running the real insert
and update shapes; F2 by the trace above plus reading the 45-line D13 doc comment; F4/F5 by
pairwise separation over every colliding group in the regenerated 170,540-row dataset; F6 by 49
adversarial terms plus an independent fold-mechanism probe that could have failed differently;
F7/F9 by execution and by reading all five guard sites; F8 by reading the probe script's own
`'read'` mode argument; F10 by enumerating the key union over all rows of both packages; F11/F12 by
re-benchmarking. Live-database facts via `scripts/agent-diagnostics/turso-query.mjs` (read-only —
no write was attempted and none is possible on that token).

*No schema change was made, no migration generated, no remote database written to, and the spike
document, ADL-48, the BRD and the tracker were not edited. Findings are filed here for COO
adjudication.*

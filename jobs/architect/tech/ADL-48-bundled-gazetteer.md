# ADL-48 — Bundled local gazetteer: build vs buy for city and subdivision reference data

**Date:** 2026-08-01
**Author:** Architect (fresh dispatch; no authorship of ADL-43, ADL-46, the BUG-71 ruling, its fresh-eyes review, or the UX spec)
**Branch:** `chore/gazetteer-build-vs-buy-adl`
**Status:** Decided. Design only — no schema, migration, seed or code change was made by this ADL.
**Tracker:** OQ-06 · BUG-30 (class) · BUG-45 (adjacent) · D-14 · D-19 · BUG-71 · BUG-74 · BUG-69 · BUG-33 · ENV-01 · ENV-02 · QUAL-21 · QUAL-22 · UX-12
**BRD:** §5.2 GE-01…GE-16. **Two new requirement IDs proposed (GE-17, GE-18) and one GE-16 amendment required — §12.**
**Main log entry:** `jobs/architect/tech/20260307-architecture-decisions-log.md` — ADL-48. That entry is the decision of record; this file carries the evidence and the implementation detail.
**Supersedes / amends:** ADL-43 §2 S1 and S3 (§13.1) · the BUG-71 ruling and its fresh-eyes review are **narrowed, not superseded** (§13.2) · execution-queue item 13 is **partly stale** (§13.3).

---

## 1. Summary table

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| **G1** | Overall verdict on the PO's question | **Yes, bundle a gazetteer — but as a local-first *index*, not as a replacement for the geocoder.** The geocoder is demoted from "the only path" to "the tail path". A pure replacement fails this project's own flagship use case (§2) | **High** |
| **G2** | City dataset | **`cities.json` (npm, CC-BY-4.0, GeoNames-derived).** 170,540 rows, 246 countries, ships `admin1.json`/`admin2.json`, published monthly — 65 versions, latest 2026-08-01, cadence verified from the registry, not the README | **High** |
| **G3** | Subdivision dataset | **`iso3166-2-db` (npm, MIT).** Real ISO 3166-2 codes **and** the GeoNames→ISO crosswalk the city half needs, in one package. Install it as a **`devDependency`** — build-time generator only, never shipped (§8.1) | **High** |
| **G4** | ADL-43's subdivision source | **Amend S1: `iso3166-2-db` replaces `country-region-data`.** It returns GB at the *constituent-country* tier (exactly `GB-ENG/SCT/WLS/NIR`), which ADL-43 §6.1 correctly established no other source does — so **S3's mandatory per-country override table is no longer needed for its one confirmed case** | **High** |
| **G5** | Table topology | **A new `gazetteer_cities` reference table. `cities` is not replaced and not migrated.** No FK ever points at the gazetteer. User rows are *created from* it. This is what makes refresh safe by construction (§7) | **High** |
| **G6** | The coverage tail | **Keep the geocoder for the tail.** Not "accept manual entry with no pin". The tail is ~9 of 16 probed Scottish places and the project's dogfood trial is Scotland (§2) | **High** |
| **G7** | Seed / refresh mechanism | **Content-hash-gated startup seed**, extending the existing `startup.service.ts` pattern. Steady-state boot cost is one indexed `SELECT`. Measured cold seed: **618 ms / 12.47 MB** against local libSQL (§8) | **High** (local) / **Low** (Turso — §15.1) |
| **G8** | Licence & attribution | **CC-BY 4.0 is a real, satisfiable obligation.** Attribution surfaces in-product on an About/Credits surface plus `README`, naming GeoNames and OSM. Not optional, not a footnote | **High** |
| **G9** | Refresh cadence | **On-demand, not scheduled.** Trigger-driven, COO-initiated, reviewed as a normal data PR. Upstream is monthly; we do not have to be | **Medium** |
| **G10** | Expand/contract staging | **Three independently-green stages** (regions → gazetteer table+seed → local-first lookup). ADL-47 satisfied without an integration branch (§11) | **High** |
| **G11** | Does this close OQ-06 / D-14 / BUG-30 / BUG-45? | **Closes: OQ-06 (implementation), the BUG-30 class, D-14 tier 2. Does NOT close: BUG-45** — different dataset, no overlap with this source family (§12.3) | **High** |
| **G12** | Disposition of the BUG-71 work | **Narrowed, not made moot. Ship the BUG-71 fix as designed — do not hold it for this.** It becomes the *fallback-path* classifier (§13.2) | **High** |

**The one-sentence answer to the PO's question.** *"Wouldn't it be easier just to store a full cities list in a DB table?"* — **Yes, and it is the right call, but not for the reason it looks like.** It is not easier because it deletes the geocoder; it does not delete the geocoder. It is right because it moves the **common** case onto a path that is complete, instant, offline, free, and — decisively — **testable in CI**, leaving the geocoder to serve only the long tail where it is genuinely the only option.

---

## 2. The coverage floor, in terms the PO can judge

This is the section that should decide the question. Everything else is implementation.

**Every bundled gazetteer has a floor. I probed the actual floor with real place names rather than reasoning about population thresholds.** Both candidate datasets, both probed two independent ways (exact match within `GB`; then case-insensitive substring across all 246 countries — probes that fail differently, per the negative-findings rule).

| Present in both datasets | Absent from **both** datasets |
|---|---|
| Glasgow, Edinburgh, Inverness, **Ullapool**, **Aviemore**, **Portree**, **Tarbert** | **Plockton, Applecross, Shieldaig, Lochinver, Durness, Kyleakin, Gairloch, Dornie, Braemar** |

*(Tobermory is the one disagreement: present in `all-the-cities` with population 1,010, absent from `cities.json`. The datasets are not interchangeable even where they share an upstream.)*

**Stated plainly for the PO:**

> At ~170,000 rows the floor is roughly *"a settlement with its own population count of about 1,000, or an administrative seat."* **Towns and villages that are somebody's home** — Ullapool (1,510), Portree, Aviemore, Tobermory — **are in.** **Hamlets, crofting townships and single-attraction places** — Plockton, Applecross, Shieldaig, Dornie, Braemar — **are out**, even when they are well-known destinations. Braemar has the Highland Gathering; Plockton and Applecross are on every West Highland itinerary. None of them is in either dataset.

**Why this is decisive rather than an acceptable rounding error.** The project's stated use is *personal travel including small places*, and BUG-30's own tracker note records that *"the Scotland dogfood trial (BRD-PL0104 trigger) needs this working."* A gazetteer-only design would ship a product that cannot record the trip it was built to record. **That is the argument against a pure replacement, and I consider it dispositive.**

### 2.1 The two fallback options, and the recommendation

| Option | What the user gets for Plockton | Cost |
|---|---|---|
| **(a) Keep the geocoder for the tail — RECOMMENDED** | Types "Plockton", gazetteer returns nothing, backend falls through to Nominatim, city resolves with a real pin | Retains the proxy route, the serialized rate limiter, `geocode_status`, the retry queue, GE-16 containment — but they now serve **only** the tail |
| **(b) Manual entry, no automatic pin** | Types "Plockton", picks country/region by hand, city is created `unresolvable`, **no map pin ever** | Retires more machinery — but a map-centric travel app that cannot pin the places you actually went is a worse product than the one we have today |

**Recommend (a).** Option (b) trades a user-visible product regression for an internal simplification, on exactly the places the PO travels to. It also fails GE-13's intent in spirit: pins suppressed *pending resolution* is a transient state; pins suppressed *forever* is a missing feature.

**The honest cost of (a):** almost none of the geocoder machinery is retired. What changes is how often it runs — and, far more importantly, **whether the normal path can be tested**. §6 itemises this without inflating it.

---

## 3. The candidates, verified

Every fact below was established by installing the package and reading the data. **No dataset fact in this document is stated from memory.**

| Package | Version | Declared licence | Rows | Subdivisions? | Population? | Last published | Verdict |
|---|---|---|---|---|---|---|---|
| **`cities.json`** | 1.1.61 | **CC-BY-4.0** (LICENSE file is the CC-BY 4.0 text) | **170,540** cities / 246 countries | **Yes** — `admin1.json` (3,865), `admin2.json` (47,549) | **No** | **2026-08-01** | **ADOPT (G2)** |
| `all-the-cities` | 3.1.0 | MIT *(declared)* | 135,233 *(npm description claims 138,398 — wrong)* | `adminCode` only, no names | Yes | 2020-03-18 | **Reject** |
| **`iso3166-2-db`** | 2.3.11 | MIT | 3,940 subdivisions / 234 countries | **Yes + GeoNames crosswalk** | — | 2024-07-11 | **ADOPT (G3)** |
| `country-region-data` | 4.1.0 | MIT | 217 GB rows, council tier | Yes, but wrong tier for GB | — | — | **Reject (G4)** |
| `country-state-city` | 3.2.1 | **GPL-3.0** | — | — | — | — | **Reject on licence** |

**Why `all-the-cities` is rejected despite having the population field we'd like:**

1. **Its licence declaration is wrong in a way that creates real risk.** It declares MIT, but its own README says it is *"Derived from the cities-with-1000 npm package, which in turn came from geonames.org data."* GeoNames is CC-BY 4.0. **An MIT label on CC-BY data does not launder the attribution obligation** — it just means the obligation is undocumented. `cities.json` declares CC-BY-4.0 correctly and ships the full licence text. Choosing the package that tells the truth about its own provenance is the lower-risk choice, and it costs us nothing.
2. **Six years stale** (published 2020-03-18) against `cities.json`'s monthly cadence.
3. Its own headline is false: it advertises "population of at least 1000" but **22,913 of its 135,233 rows have population < 1,000, and 12,788 have population exactly 0.** A dataset whose primary documented claim doesn't survive one `filter()` is not one to build a refresh story on.
4. It carries essentially no alternate names (76 rows of 135,233), so it buys nothing on the Rome/Roma question either.

**The cost of choosing `cities.json`: no population column.** That forecloses population-based ranking and population-based trimming. §6.4 states what that actually costs — less than it sounds, because ranking has a better signal available.

---

## 4. The structural finding — and it is the one that would have wrecked a naive build

The brief's hypothesis was that *"the same source family plausibly supplies both subdivisions and cities."* **I tested it, and it is false in its naive form.**

**GeoNames `admin1` codes are not ISO 3166-2 codes.** The app's `regions.iso_3166_2` column and Nominatim's `ISO3166-2-lvl4` output are both ISO 3166-2. GeoNames uses its own scheme. Measured across the 26 `region_tier_enabled = 1` countries:

> **`"<CC>-" + geonamesAdmin1` equals the ISO 3166-2 code for exactly 2 of 26 countries — GB and US.** Twenty are purely numeric (`AU`→`08`, `CA`→`01`, `DE`→`15`, `JP`→`46`), and four are mixed. Naively concatenating would have produced `AU-08` where the app expects `AU-NSW`, silently, for 24 of 26 countries.

**This is exactly the class of error that a build-first, verify-later approach ships.** It would have passed every test written against US and GB fixtures — the only two countries with seeded regions today.

### 4.1 The crosswalk exists, and it is in the subdivision package

`iso3166-2-db`'s `data/iso3166-2.json` carries, per subdivision, **both** identifiers:

```json
{ "name": "Western Australia", "iso": "WA", "admin": "08",
  "reference": { "geonames": 2058645, "openstreetmap": 2316598, ... } }
```

`iso` is the ISO 3166-2 suffix; **`admin` is the GeoNames `admin1` code.** That is the join. End-to-end integration test, run over the real data:

| Measure | Result |
|---|---|
| City rows in region-tier-enabled countries | 84,868 |
| **Joinable to an ISO 3166-2 subdivision via the crosswalk** | **84,257 — 99.28 %** |
| Currently-seeded region codes matched exactly (US 51, CA 13, AU 8, GB 4) | **76 / 76** |
| Rows with `NULL` region across the *whole* 170,540-row dataset | 1,746 (1.02 %) |

**The 76/76 match is the single most important number in this document for migration risk.** The proposed subdivision set is a strict *superset* of what is seeded today, with every existing code preserved byte-for-byte. No existing `regions` row changes, so no `cities.region_id` is invalidated, so **no backfill and no data migration of user rows.**

**Three countries fall below 95 % and must be stated, not buried:** Vietnam **54.8 %**, Ethiopia **76.9 %**, Kazakhstan **86.3 %** — all three have reorganised subdivisions where GeoNames and ISO disagree. Cities there seed with `region_iso = NULL`, which the schema already permits and which GE-15 already has settled behaviour for (*"a geocoding result that cannot be resolved to a seeded region leaves the region blank and editable"*). **Degrades correctly; does not fail.**

---

## 5. The recommended architecture

### 5.1 Two tables, one direction of travel

```
gazetteer_cities   (reference; refreshable; NO foreign key ever points at it)
        │  read-only lookup
        ▼
   user picks a result
        │  copy name / country_code / region_id / lat / lng
        ▼
     cities         (UNCHANGED — ADL-46 identity index, geocode_status,
                     created_by_user_id, GE-16 containment all intact)
        ▲
   trip_places ─────┘   (FKs unchanged)
```

**`gazetteer_cities` — new table.**

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK autoincrement | Internal only |
| `name` | text not null | |
| `country_code` | text not null | **No FK** — see below |
| `region_iso` | text | ISO 3166-2, nullable (the 1.02 %) |
| `latitude` / `longitude` | real not null | A gazetteer row without coordinates is not a gazetteer row |
| `feature_code` | text | GeoNames `PPLA`/`PPL`… — the ranking signal that replaces population (§6.4) |

Indexes: `(name COLLATE NOCASE)`, `(country_code)`, `(name COLLATE NOCASE, country_code)`.

**`country_code` deliberately carries no FK to `countries`.** The gazetteer covers 246 countries; `countries` holds 250 from a different vintage. A refresh that introduces a code not in `countries` must degrade to "that row is unreachable", never to "the seed transaction aborts". **This is the same reasoning as no-FK-pointing-in, applied outward.** It is an intentional exception to the schema-review default and is flagged as such.

### 5.2 Why not just put the 170,540 rows into `cities`

Rejected, and the reason is not size:

- **`cities` is the target of `trip_places.city_id`.** A refreshable dataset must never be FK-referenced by user data — a refresh that drops a row a user's trip points at is a data-integrity failure with no good recovery. Separation makes that unrepresentable.
- **GE-16's three end states are meaningless for reference rows.** 170,540 rows of `geocode_status = 'resolved'` with `created_by_user_id = NULL` would dilute the containment model to nothing and make every `pending`-row query scan a 170k table.
- **The D13 identity index would fight it.** `uniq_cities_name_country_region_ci` exists to make user-created duplicates impossible. Loading a bulk dataset through it converts every upstream near-duplicate into an insert conflict at seed time.
- **`cities` stays small and hot; the gazetteer stays large and cold.** That is the right shape.

### 5.3 The lookup order

1. **Local gazetteer first** — exact then prefix, `COLLATE NOCASE`, optionally ranked by the trip's declared countries (this *is* D-19, §6.9).
2. **Existing `cities` catalogue** — unchanged, still first for already-known cities per GE-14.
3. **Nominatim, only when the gazetteer returns nothing** — the tail path. All existing machinery applies.

**Measured, on the real 170,540-row dataset in libSQL:** the `springfield` ambiguity query — `SELECT country_code, region_iso, COUNT(*) GROUP BY country_code, region_iso` — returns **21 distinct groups in under 1 ms**. Compare the current path: 10 rows from a global Nominatim query, thinned twice, from which BUG-71 concluded "unambiguous, it's Virginia."

---

## 6. What this actually retires, shrinks, and leaves alone

The brief asked me to assess each honestly and not assume. Several of these do **not** go away, and two are already closed by other work and must not be re-credited here.

| Item | Verdict | Detail |
|---|---|---|
| **Truncation / ambiguity heuristic (BUG-71)** | **Retired on the primary path; persists on the tail** | A local query returns the *complete* set, so `truncated` is structurally unrepresentable and "is this ambiguous?" becomes `GROUP BY`. The tail path still needs `classifyDiscovery` |
| **Serialized Nominatim rate-limit chokepoint** | **Shrinks sharply; persists** | Still required, still the single egress point. Volume drops to tail-only. **Do not delete it** |
| **Geocode retry queue + BUG-69** | **Persists; volume collapses** | Tail cities still create `pending` rows. **BUG-69's missing `unresolvable` terminal branch is still a real bug and still needs fixing** |
| **`geocode_status` state machine + GE-16 containment** | **Persists, and must** | Gazetteer-sourced cities are born with coordinates; tail cities still traverse pending→resolved/unresolvable. The containment rules are unchanged — but they stop being the *common* case |
| **ENV-01 test blindness** | **Substantially closed — the biggest single win** | The primary discovery path becomes a SQL query with **no network at all**. It is fully exercisable in CI and in this devcontainer. The tail path stays ENV-01-blind. This closes a *class*, not an instance |
| **QUAL-22 mock drift** | **Shrinks** | Far fewer suites need a geocoder mock. Does not fix the existing broken mock — **QUAL-22 still needs its own repair** |
| **BUG-55 CSP class** | **Already closed by ADL-46's backend proxy. This ADL takes no credit.** | Stated explicitly so the tracker is not double-credited |
| **ENV-02 user-visible impact** | **Reduced, not closed** | A 502 on `/api/geocode` stops affecting the common path. But ENV-02 is Railway-edge networking affecting *all* routes — unchanged as an infrastructure item |
| **BUG-33 duplicate city rows** | **Already fixed by the D13 identity index. No credit taken.** | Pressure reduced (users pick canonical rows instead of typing variants), mechanism unchanged |
| **BUG-30 class + OQ-06** | **Closed** | 22 latent BUG-30s become 0. §12.3 |
| **BUG-74** (upstream failure reads as "found nothing") | **Persists; severity drops** | Still needs its fix. But with a local-first path, "geocoder unreachable" degrades to "gazetteer results only" — a *usable* answer, not a blank form |
| **UX-12** (Change city control, status badge) | **Unchanged — still required** | GE-16's correction right is orthogonal to where city data comes from. The badge simply becomes rarer |
| **D-19** (constrain by trip countries) | **Becomes trivial** | §6.9 |

### 6.9 D-19 collapses to an `ORDER BY`

D-19 currently needs a BRD home, an Architect design, and Backend + Frontend briefs, and carries QUAL-21 as a prerequisite. Against a local gazetteer it is:

```sql
ORDER BY (country_code IN (/* trip countries */)) DESC, feature_code, name
```

That is the PO's **shortlist-not-filter** pattern exactly — nothing is removed, likely matches sort first — with no rate-limit interaction, no extra egress, and no truncation risk. The UX spec's `<optgroup>` presentation sits on top unchanged. **D-19 should be re-scoped as a consequence of this ADL rather than designed separately.**

### 6.4 The missing population column, and why `feature_code` is a better ranking signal anyway

`cities.json` has no population. For ranking search results this matters less than it appears: GeoNames' `feature_code` distinguishes `PPLC` (national capital), `PPLA` (first-order admin seat), `PPLA2`, `PPL` (ordinary populated place). **Sorting by administrative rank puts Paris, France above Paris, Texas without any population data**, and it is the signal that actually correlates with "the one the user meant."

**UNVERIFIED:** `cities.json`'s shipped rows carry only `name, lat, lng, country, admin1, admin2` — **`feature_code` is not in the published city records** (verified by reading the keys). Obtaining it requires either `all-the-cities` (which has `featureCode`, but is stale and licence-misdeclared) or the GeoNames dump (firewall-blocked). *Probe I would run:* diff the two packages' row sets on `(name, country, lat, lng)` to see whether `all-the-cities`' `featureCode` can be joined onto `cities.json` rows. *Blind spot:* the two are different vintages, so a join will be lossy by an unknown amount. **Until that is resolved, `feature_code` must be treated as an optional column that may ship NULL, and ranking falls back to exact-match-then-alphabetical.** The design does not depend on it.

---

## 7. Migration path for the existing `cities` table

**There is no migration of `cities`.** That is the point of §5.1's topology, and it is worth stating as forcefully as possible because it is the cheapest part of this whole proposal.

- `cities` keeps every column, every index, and every behaviour shipped in ADL-46 migrations 0014/0015 — `geocode_status`, `geocode_attempts`, `created_by_user_id`, the D13 identity index, GE-16 per-user containment.
- **Rows users already created are untouched.** A user-created `Denver` and a gazetteer `Denver` coexist; the next user who picks Denver from the gazetteer hits the *existing* `cities` row through the unchanged find-or-create, because the identity key is `(name, country_code, COALESCE(region_id,0))` and the gazetteer supplies exactly those three values. **Convergence happens through the mechanism that already exists.**
- The only additive change to `cities` is behavioural: when a row is created *from* a gazetteer match it is born with coordinates.

**On disposable data.** Both staging and production hold disposable test data, so no preservation heroics are needed. **This does not license an incorrect migration, and none is proposed** — the design's correctness argument is the 76/76 exact match in §4.1, not the disposability of the data. If the region seed were lossy, reseeding would not save us; the FK from `cities.region_id` would break in prod exactly as it would in staging.

---

## 8. Seed / refresh pipeline

**Constraint:** `drizzle-kit migrate` runs on every container boot. Seeding 170,540 rows per boot is unacceptable, and a 15 MB SQL migration file is unpleasant and unrefreshable.

### 8.1 The mechanism

**Build time (developer machine / CI, never at runtime):** a checked-in generator script, `scripts/generate-gazetteer.mjs`, reads `cities.json` + `iso3166-2-db` (**both `devDependencies`**), applies the §4.1 crosswalk, and emits two committed artifacts:

- `data/regions.json` — regenerated, 716 rows for the 26 enabled countries (from 76)
- `data/gazetteer-cities.json` — ~17 MB, plus a `data/gazetteer-meta.json` carrying `{ source, version, generatedAt, rowCount, contentHash }`

**Runtime (startup):** extend `startup.service.ts` with `seedGazetteer()`, following the pattern already established by `seedCountries()` / `seedRegions()`, with one upgrade. Those gate on `rowCount > 0` — which is why BUG-30 needed a hand-written patch migration to get past. **`seedGazetteer()` gates on the content hash instead:**

1. `SELECT content_hash FROM gazetteer_meta LIMIT 1`
2. Hash matches the bundled artifact → log and return. **Steady-state boot cost: one indexed SELECT.**
3. Hash differs or table empty → inside a single transaction: `DELETE FROM gazetteer_cities`, batch-insert, update `gazetteer_meta`.

Because nothing references `gazetteer_cities`, the delete-and-reload is safe by construction — **that is the payoff of §5.1's no-FK rule, and it is why refresh is a non-event here rather than the hard part.**

**Deliberate deviation from the existing convention, declared:** row-count gating is what made BUG-30 unfixable without a bespoke migration. Hash gating means a data correction ships as a regenerated artifact and applies itself on next boot. New `seeders` should use it; the existing two are **not** retrofitted by this ADL.

### 8.2 Measured cost

Against local libSQL, real data, 2,000-row batches:

| Metric | Measured |
|---|---|
| Insert 170,540 rows | **505 ms** |
| Build both indexes | **113 ms** |
| **Total cold seed** | **618 ms** |
| Resulting DB size | **12.47 MB** |
| Ambiguity `GROUP BY` query | **< 1 ms** |

**Repo size precedent:** `geo/regions.json` (Natural Earth, GE-10) is **already 40 MB in this repository**. A 17 MB gazetteer artifact is well within established practice here — under half of a file already committed.

> ### 8.3 The one number I could not measure, and it gates the rollout
>
> **Cold-seed cost against Turso (remote libSQL over HTTP) is UNVERIFIED.** The 618 ms above is a *local file* database. Remote libSQL pays a network round-trip per batch; 86 batches over a WAN could plausibly be tens of seconds to minutes. *Probe I would run:* `scripts/agent-diagnostics/turso-query.mjs` against staging, timing a single 2,000-row batch insert, then multiply. *Blind spot:* staging and production may differ in region and plan.
>
> **The design must not depend on the answer, and it doesn't**, because the seed runs once per content-hash change rather than per boot. But **the Database brief must measure it before the first deploy** and, if a cold seed exceeds the platform's health-check window, move `seedGazetteer()` off the boot path into an explicit one-shot command. **Turso row-count and storage limits against a 170,540-row table are also UNVERIFIED** — same probe, same brief.

---

## 9. Licence and attribution

**CC-BY 4.0 (`cities.json`, GeoNames-derived) is a genuine obligation, not a formality.** I read the shipped LICENSE file: it is the full Creative Commons Attribution 4.0 International text, whose §3(a) requires retaining identification of the creator, a copyright notice, a licence reference and a link, "in any reasonable manner."

**Where attribution surfaces — this is a product decision, not just a README line:**

1. **In-product, user-visible.** An About/Credits surface naming: *"City data © GeoNames (CC BY 4.0). Boundary data © Natural Earth. Geocoding © OpenStreetMap contributors (ODbL)."* The app has **no such surface today** — that is a small Frontend item this ADL creates.
2. **`README.md`** — the source, version and licence of each bundled dataset.
3. **`data/gazetteer-meta.json`** — machine-readable provenance, so the next agent doesn't have to re-derive it.

**This consolidates an obligation the project already carries and has not discharged.** ADL-43 §6.2 already flagged ODbL attribution for OSM-derived data as real, and BUG-55's tracker note records it as *"flagged for re-confirmation… on a SINGLE probe (README.md grep only)."* Natural Earth (public domain) needs no attribution but conventionally gets it. **One credits surface discharges all three at once**, which makes this cheaper to do properly than to keep deferring.

`iso3166-2-db` is MIT — attribution satisfied by retaining the licence text in `node_modules`, and it is a `devDependency` whose data output is factual codes (ISO 3166-2 codes and subdivision names are not creative works). No product-surface obligation.

**Rejected on licence:** `country-state-city` is **GPL-3.0**. Even granting that server-side use is not distribution, taking a copyleft dependency into a hosted product to save a data-loading script is a bad trade with a good alternative available.

---

## 10. Staleness and refresh cadence

**Upstream cadence, verified from the npm registry rather than the README:** `cities.json` has **65 published versions**, with `1.1.59` on 2026-06-01, `1.1.60` on 2026-07-01 and `1.1.61` on 2026-08-01. **Monthly, and current as of today.**

**Our cadence: on-demand, not scheduled. Recommended, and the reasoning matters.** A scheduled monthly bump would generate twelve no-op-looking PRs a year, each of which is a ~17 MB artifact diff nobody can meaningfully review — which trains the team to rubber-stamp them. Reference data that changes slowly should be refreshed on a **trigger**:

| Trigger | Who |
|---|---|
| A user reports a missing or wrong city (a BUG-30-shaped report for the city tier) | COO raises; Database regenerates |
| GE-07 enables the Region tier for a new country | Database — regenerate to pick up its subdivisions |
| An upstream correction we specifically need | COO |
| Otherwise: a standing review at most **annually** | COO |

**Who triggers it: the COO**, as a normal data PR — regenerate, commit the artifacts, review the `gazetteer-meta.json` diff (row counts and hash) rather than the 17 MB payload, merge. The refresh is intrinsically safe because of §5.1/§8.1, so the review burden is genuinely low.

**The staleness risk is asymmetric and mild.** A stale gazetteer misses *new* settlements and *renamed* ones. A missing city falls through to the geocoder — the tail path already handles it. **Staleness degrades into the fallback we already built, which is the best possible failure mode for this class of data.**

---

## 11. Expand/contract staging (ADL-47)

Three stages, each independently green, independently deployable, and independently valuable. **No integration branch needed** — this decomposes cleanly, which is ADL-47's preferred outcome.

| Stage | Content | Green on its own? | Value if we stop here |
|---|---|---|---|
| **S1 — Subdivisions** | Generator script; regenerate `data/regions.json` 76 → 716 rows; hash-gated reseed of `regions`. **Purely additive** — all 76 existing codes preserved (§4.1), so no `cities.region_id` is invalidated | **Yes.** Additive insert; no code reads change | **The BUG-30 class closes.** 22 latent bugs → 0. Real, shippable value with zero risk to the city path |
| **S2 — Gazetteer table + seed** | `gazetteer_cities` + `gazetteer_meta` (new tables, nothing references them); `seedGazetteer()`; the artifact. **No route reads it yet** | **Yes.** New tables, dead data, no behaviour change | Nothing user-visible — but it is where the Turso timing question (§8.3) gets answered *before* anything depends on it |
| **S3 — Local-first lookup** | `GET /api/cities/search` consults the gazetteer first; Nominatim becomes the fallback; frontend consumes the richer result | **Yes** | The actual feature |

**Why S1 must precede S2:** the crosswalk writes `gazetteer_cities.region_iso`, and a city row's region is only meaningful once the corresponding `regions` row exists. This is a hard ordering dependency, not a preference.

**S1 is independently worth dispatching even if the PO declines the cities half.** That is deliberate — it means the cheap, high-certainty half is not held hostage to the contested one.

---

## 12. BRD position

### 12.1 Two new requirement IDs are needed

**GE-17 — Bundled city reference data.**
> The app ships with a bundled reference list of world cities. When a user adds a city, this local list is searched first and offers matching cities with their country, region and coordinates without any network call. Cities absent from the bundled list continue to be resolved through the geocoding service (GE-11).
>
> **Success criteria:** searching a bundled city returns results with no outbound network request, verifiable in a test environment with no internet access; a city selected from the bundled list is created with coordinates already populated and `geocode_status = 'resolved'`, never `pending`; a city name absent from the bundled list still creates successfully through the geocoding path with no user-visible difference in the flow; searching a name that matches bundled cities in more than one country or region presents all of them distinguishably and selects none automatically; the bundled data's source, version and licence are recorded in-repo and surfaced in-product.

**GE-18 — Reference-data provenance and attribution.**
> Every bundled reference dataset carries its source, version and licence in the repository, and the app surfaces the attribution its licences require.
>
> **Success criteria:** an About/Credits surface names GeoNames (CC BY 4.0), OpenStreetMap (ODbL) and Natural Earth, reachable from the app in no more than two interactions; each bundled dataset has a machine-readable provenance record; adding a new bundled dataset without provenance fails a check.

### 12.2 GE-16 must be amended — otherwise the correct behaviour is unrepresentable

GE-16 defines `resolved` as ***"the geocoder matched it."*** A city taken from the bundled gazetteer was **never seen by the geocoder**, yet it has authoritative coordinates and must be `resolved` — it would be absurd to mark Glasgow `pending` because we didn't phone Nominatim about it.

**Required amendment (existing ID, not a new one):** GE-16's `resolved` definition becomes *"an authoritative source — the bundled reference data or the geocoding service — matched it."* GE-16's closing note (*"resolved means the geocoding service returned a match, not that the match has been verified as correct"*) should gain: *"for bundled reference data, resolved means the name matched a curated gazetteer entry."*

**Consequence for dispatch, which is the operationally useful part:** the S1 subdivision brief is **not** blocked on any BRD change — it introduces no new capability. **S2 and S3 are blocked** on GE-17/GE-18 existing with these success criteria, per the BRD gate.

**GE-15's amendment, already required by the BUG-71 ruling §8, is unaffected and should still happen** — but note that this ADL makes it *smaller*: once the common path can confirm from a complete local set, the number of cases where GE-15 has to concede "blank and editable" drops sharply.

### 12.3 What this closes, and what it does not

| Item | Verdict |
|---|---|
| **OQ-06** (systematic subdivision list) | **Implementation closed by S1.** Note: OQ-06 was *decided* by ADL-43 on 2026-07-27 and is already `closed` in the tracker; this ADL **changes the chosen source** (§13.1), it does not re-open the question |
| **BUG-30 class** | **Closed by S1** — 22 latent instances → 0 |
| **D-14** | **Tier 2 closed** (`iso3166-2-db` ships `iso`, `iso3`, `numeric` per country, so "US"/"USA" both become matchable with no new source decision). **Tier 3 (colloquial: "America", "Britain") NOT closed** — still BUG-45's class |
| **BUG-45** (airlines / car-rental providers) | **NOT closed. No overlap whatsoever.** Different dataset (OpenFlights), different domain, no shared source. ADL-43 §3/§4 remains the live design. **Stated explicitly because execution-queue item 13 bundles them and that bundling is wrong** |
| **D-19** | **Not closed, but re-scoped from a design problem to an `ORDER BY`** (§6.9) |

---

## 13. Reconciliation — what this amends, and what it deliberately does not

### 13.1 ADL-43 — amend S1 and S3

ADL-43's §6.1 finding is **correct and I re-verified it independently**: `country-region-data` returns **217 GB rows** at council-area granularity (`["Aberdeen City","ABE"]`, `["Angus","ANS"]`…) and **none** of `ENG`/`SCT`/`WLS`/`NIR`. Natural Earth has the identical gap. ADL-43 was right that this is the crux.

**What ADL-43 did not find is that a third source gets it right.** `iso3166-2-db` returns **exactly 4 GB rows** — `GB-ENG`, `GB-SCT`, `GB-WLS`, `GB-NIR` — matching the seeded values byte-for-byte.

Therefore:
- **S1 amended:** source becomes `iso3166-2-db`, not `country-region-data`.
- **S3 (mandatory per-country override table) is no longer required for its one confirmed case.** Keep the override *mechanism* — VN/ET/KZ (§4.1) show granularity mismatches are a real class — but it is no longer load-bearing on day one, which removes a hand-curation step from the critical path.
- **S2 (scope to the 26 enabled countries), S4 (storage in `data/regions.json`), S5 (manual refresh) all stand unchanged**, and this ADL adopts them.

**A supersession stamp is required on ADL-43 §2 S1/S3 in the same PR** (lifecycle rule 2).

### 13.2 The BUG-71 documents — narrowed, NOT made moot

The brief asked me to state plainly whether this makes the two BUG-71 documents moot. **It does not, and it would be a mistake to hold the BUG-71 fix for this ADL.**

- **BUG-71 is a live P1 against shipped behaviour.** This ADL is a multi-stage build behind a BRD gate. **Ship the BUG-71 fix as designed, now.**
- `classifyDiscovery` **survives** — it becomes the classifier for the **tail path**, where truncation and thin evidence are still exactly the problem the ruling describes.
- The fresh-eyes review's **three-valued output** (`confirmed`/`suggested`/`ambiguous`/`none`) survives and is **strengthened**: gazetteer hits can only ever be `confirmed` or `ambiguous` (a complete local set can never be "incomplete but undivided"), so `'suggested'` becomes precisely and only the tail-path state. That is a cleaner semantic than either document could give it.
- The review's **F2 "never-helps" concern is substantially answered** by this ADL: categories B and C (Denver, Paris — common names going blank) are the *most* likely to be in a 170k-row gazetteer, so they resolve locally, completely and confirmably. **The gazetteer is the real fix for F2; the three-valued enum is the right interim.**

**Disposition:** both documents get a `NARROWED (2026-08-01) by ADL-48 §13.2 — retained for history` stamp on the sections describing the discovery path as Nominatim-only. No content is retracted.

### 13.3 Execution-queue item 13 — partly stale, and it should be corrected

Item 13 states it will close *"OQ-06 (its literal question), D-14, the BUG-30 class, BUG-45."* Two corrections:

1. **OQ-06 was already decided and closed** by ADL-43 on 2026-07-27. Item 13 queues an ADL that already exists. What was actually outstanding was the *implementation* brief — and now a source correction (§13.1).
2. **BUG-45 does not belong in this item.** It shares a *decision shape* but zero source overlap. Bundling them invites a single brief that seeds airlines from a city gazetteer.

**This is a documentation-lifecycle correction the COO should make to the queue file** in the same PR that adopts this ADL.

---

## 14. The strongest argument against this recommendation, answered

> **"You are adding a 170,540-row dataset, a crosswalk, a generator, a refresh pipeline, two tables, a second lookup path, two BRD requirements and an attribution surface — and by your own §6 you retire almost none of the geocoder machinery you set out to delete. That is strictly more complexity than today, for a project with three cities in staging. Meanwhile the BUG-71 fix already designed solves the actual reported defect for a fraction of the cost."**

This is the objection I would raise, and the first two sentences are simply **true**. My answer:

**1. The complexity is real but it is *inert*, and the complexity it replaces is *live*.** A 170k-row read-only table with no inbound FKs, refreshed on a content hash, is about as low-entropy as a component gets — it cannot be in an inconsistent state, cannot fail at runtime, and cannot be raced. What it displaces is a serialized, rate-limited, network-dependent, third-party path that has produced BUG-33, BUG-55, BUG-69, BUG-71, BUG-73, BUG-74 and QUAL-21/22 — **eight tracked defects, all from one path, in one project.** Trading live complexity for inert complexity is a good trade even when the line count goes up.

**2. "Three cities in staging" is not a valid input, and this project has already ruled on that** (`feedback_dont_architect_for_current_user_base`, 2026-07-30: *"acceptable at two users is not a justification"*). The gazetteer's value is per-*lookup*, not per-user, and every lookup today traverses the fragile path.

**3. On BUG-71 specifically, I agree — and I am not proposing to compete with it.** §13.2 says ship it now. But note what the fresh-eyes review established: the BUG-71 fix makes the common case **blank** (categories B/C/E), trading a wrong answer for no answer. It is the correct fix and it is still a UX regression on Paris and Denver. **The gazetteer is the only proposal on the table that makes the common case simultaneously correct *and* better**, because a complete local set can positively confirm rather than merely decline to guess.

**4. The strongest single reason, and it is not about cities at all: ENV-01.** Today the primary city-entry path **cannot be tested in CI or in this devcontainer**, by construction. That is the same environment-parity blind spot that shipped BUG-55 and that CLAUDE.md's parity rule exists to close: *"any defect class that lives inside a difference is invisible to CI by construction."* Five of the eight defects above are downstream of that one fact. A local-first path moves the common case **inside** the testable boundary. **No amount of test-writing against the current architecture achieves that.**

**Where the objection wins, and I concede it:** if the PO's answer to §2.1 is option (b) — accept no pin for Plockton — then this proposal loses most of its value and should be reconsidered wholesale, because at that point we are carrying a gazetteer *and* a degraded product. The recommendation is coherent **only** as "gazetteer first, geocoder for the tail". It should not be salami-sliced into "gazetteer only."

---

## 15. Verified vs. unverified

### 15.1 Unverified, with the probe and its blind spot

1. **Cold-seed cost and storage headroom against Turso — UNVERIFIED.** §8.3 states it in full. All timings are local libSQL. *Probe:* time one 2,000-row batch via `scripts/agent-diagnostics/turso-query.mjs` against staging. *Blind spot:* staging vs production region/plan. **This is the item most likely to change an implementation detail, and the Database brief must resolve it in S2 before S3 depends on it.**
2. **That Nominatim actually *has* the tail villages — UNVERIFIED, and it is load-bearing for G6.** My recommendation to keep the geocoder for the tail assumes Nominatim resolves Plockton, Shieldaig and Dornie. **I could not verify this: ENV-01 blocks Nominatim from this devcontainer** (established by the BUG-71 ruling's two probes — a 36 ms TCP reject plus the absence of any `nominatim`/`openstreetmap` entry in `/usr/local/bin/init-firewall.sh`'s allowlist loop). OSM's coverage of Scottish hamlets is very likely excellent, but *likely* is not *verified*. *Probe:* query Nominatim for those nine names from an allowlisted host or on the staging shakedown. *Blind spot:* a single query set at one moment. **If Nominatim also lacks them, option (b) is the only real choice and §2.1 must be re-decided.**
3. **`feature_code` availability on `cities.json` rows — verified absent; the *join* to recover it is UNVERIFIED.** §6.4. The design does not depend on it.
4. **GeoNames' documented inclusion rule** (*"population > 1000 or seats of adm div down to PPLA3"*) is quoted from the `cities.json` README, not from GeoNames itself (firewall). **What I verified is the *effect*** — the §2 name-by-name probe — which is the part the decision actually rests on.
5. **CC-BY 4.0 compliance is a legal judgment, not a technical one.** I read the licence text and §9 is a good-faith reading. It is not legal advice, and the PO should be comfortable with it as a product decision.
6. **VN/ET/KZ low join rates** are measured facts; my *explanation* (recent subdivision reorganisation) is inference and is not verified.
7. **No code was written and no test was run.** This is a design document; every measurement is from probe scripts against real package data in a scratch directory, not against the app.

### 15.2 Verified, and how

- **Dataset contents** — every row count, licence, field list, publish date and coverage claim in §3 comes from installing the package and reading its data and LICENSE file. Nothing from memory.
- **The §2 coverage absences — two independent probes that fail differently:** (a) exact `name` match within `country === 'GB'`; (b) case-insensitive **substring** match across all 246 countries with no country filter. Probe (a) would miss diacritics, casing or a mis-assigned country code; probe (b) would miss only a genuinely absent toponym. Both agree on all nine absences. Run against **both** datasets independently.
- **GeoNames `admin1` ≠ ISO 3166-2 (§4)** — computed over all 26 `region_tier_enabled` countries from `admin1.json` and `data/countries.json` together; 20 of 26 purely numeric is a positive, self-verifying finding.
- **The crosswalk works at 99.28 %, and 76/76 seeded codes match** — computed end-to-end joining `cities.json` → `iso3166-2-db.admin` → ISO 3166-2, cross-checked against the repo's live `data/regions.json`.
- **ADL-43's GB claim re-verified independently** (§13.1): `country-region-data` GB → 217 rows, no ENG/SCT/WLS/NIR. I did not inherit this from ADL-43; I installed the package and read it.
- **Seed timing, DB size and query latency (§8.2)** — measured by building the real table in libSQL from the real 170,540 rows.
- **`cities.json`'s monthly cadence** — read from the npm registry's publish timestamps (65 versions; 2026-06-01 / 07-01 / 08-01), **not** from the README's claim.
- **The repo's 40 MB `geo/regions.json` precedent** — `du` on the working tree.
- **Current seed state (250 countries, 76 regions across exactly 4 countries, 26 enabled, 22 with zero regions)** — computed from `data/countries.json` and `data/regions.json` directly, independently reproducing ADL-43's figures.
- **The existing seed gating pattern** — read at `src/backend/services/startup.service.ts:122-176`.
- **npm registry reachability from this devcontainer and from CI** — established by installing five packages successfully. The firewall constraint in the brief is real and every recommended source is an npm package precisely because of it. **No ADL-33 amendment is required by this design.**

---

*Filed for OP-27 fresh-eyes review. The two places I would attack first: §2.1's option (a) rests on unverified item 2 (does Nominatim have Plockton?), and §8.3's Turso timing is unmeasured. Both are stated as blockers on the relevant brief rather than resolved here.*

# BUG-75 — city identity, re-designed

**Date:** 2026-08-03
**Author:** Architect (fresh dispatch — no authorship of ADL-48, the QUAL-25 feasibility spike, that spike's OP-27 review, or the rejected S0)
**Replaces:** the coordinate-bucket proposal in `jobs/architect/tech/20260802-ADL48-feasibility-spike.md` §7.3, rejected by
`jobs/architect/tech/20260802-ADL48-spike-fresh-eyes-review.md` §2 (F1–F5)
**Tracker:** BUG-75 · BRD-GE17 · BRD-GE18 · QUAL-25 · ADL-48
**BRD:** GE-12, GE-15, GE-16, GE-17, GE-18 (v3.14)
**Branch:** `chore/bug75-city-identity-redesign`
**Needs a new ADL number** — this supersedes ADL-48 §7 and changes ADL-46 D13. I have not assigned one; the COO does.
**Status:** design only. No schema change, no migration, no code, no remote write.

---

## 1. Summary table and recommendation

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| **D1** | What is city identity? | **Natural key + an immutable `place_ref` set only on positive evidence of distinctness.** Coordinates are *not* part of identity, at any resolution | **High** |
| **D2** | Index shape | Two indexes: `UNIQUE(name NOCASE, country_code, COALESCE(region_id,0), COALESCE(place_ref,''))` **and** `UNIQUE(place_ref) WHERE place_ref IS NOT NULL` | **High** |
| **D3** | Column | `cities.place_ref TEXT` nullable, `CHECK (place_ref IS NULL OR length(place_ref) > 0)`. **Namespaced** values: `cj1:…`, `geonames:…`, `osm:…`, `local:…` | **High** |
| **D4** | Where the value comes from at pass 1 | The **request** carries it, because the user picked a specific row. New **step 0** in `findOrUpgradeCity`, before every existing step and before the geocoder | **High** |
| **D5** | Dataset | **Keep `cities.json`. Do not swap. Do not join a donor id.** Mint `place_ref` as a content-addressed hash of the row: `cj1:<16 hex of sha256>` | **Medium-High** |
| **D6** | `all-the-cities` swap | **Reject.** Measured: 97.78% of its rows already sit inside `cities.json`; it is substantially a 2020 snapshot of the same extract, not a different trade | **High** |
| **D7** | GeoNames ids joined from `all-the-cities` | **Reject.** Best-case coverage ~77.6% and falling monthly; buys a 5× stability gain on a failure mode that costs a duplicate, not a wrong answer | **Medium** |
| **D8** | GeoNames upstream dump direct | **Right answer, currently blocked.** `download.geonames.org` unreachable (two probes). Recorded as a follow-on with a trigger condition | **High** |
| **D9** | The tail (user-typed, not in the gazetteer) | Today's key **plus** an explicit "this is a different place" affordance minting `local:<uuid>`. That closes GE-17's criterion without a BRD amendment | **Medium** |
| **D10** | Migration shape | **Expand-only. There is no contract step, by design.** Verified a no-op over existing data — strictly more permissive, no backfill | **High** |
| **D11** | Sequencing | Schema + step 0 can ship now and sit inert. **BUG-75 is not user-visibly fixed until a client sends a `place_ref`** — i.e. until S2/S3. An OSM-ref path could decouple that | **Medium** |

> ### Recommendation
>
> **Stop deriving identity from the data, and start carrying it.**
>
> The rejected design tried to compute identity from attributes the row already had. Every one of F1–F5
> follows from that single choice: coordinates are absent at insert (F1), absent at the decision point
> (F2), mutable after insert (F3), and quantised rather than metric (F4, F5). No tuning of the bucket
> reaches any of those, because they are properties of *using coordinates as identity*, not of the
> bucket size.
>
> The replacement is a nullable `place_ref` on `cities`, carried in the create request because the user
> selected a specific place. It is **known before the insert, never written again, and never touched by
> the geocoder** — the three properties the previous design could not have. Coordinates leave the
> identity question entirely and go back to being data.
>
> **The dataset half of the brief's open question has a different answer than expected.** ADL-48's
> finding that `cities.json` "carries no stable row id" is true and was read as "therefore it has no
> identity." It does. `(country, admin1, admin2, name, lat, lng)` is **unique over all 170,540 rows —
> zero duplicates, measured** — and its 64-bit hash is collision-free at that size (also measured; a
> 32-bit hash is not — 7 collisions). The app currently discards `admin2` entirely, which is why the
> key looked weaker than it is: `admin2` is precisely what separates the four Newports.
>
> That retires the dataset swap. `all-the-cities` is not a trade against `cities.json` — **97.78% of its
> rows are already inside `cities.json`**, it has had no release since 2020-03-18 against a monthly
> cadence, and it would cost 35,307 rows net to gain an id we can mint ourselves.

---

## 2. The five acceptance criteria, answered in order

These are §4 of the review that rejected S0. Each is answered against the write path, not against the dataset —
that inversion is what F2 was about.

### C1 — What is the identity of a city whose coordinates are not yet known?

**Exactly what it is today: `(name COLLATE NOCASE, country_code, COALESCE(region_id, 0))`, with `place_ref` NULL.**

Coordinates are not part of identity at any resolution, so "coordinates not yet known" is not a special case —
it is the ordinary case, and it needs no sentinel, no `COALESCE` over a nullable float, and no reasoning about
`ROUND(NULL, 1)`.

F1's blocker is closed by removal rather than by patching. The review noted a sentinel
(`COALESCE(ROUND(latitude,1), -999)`) would close F1 while leaving F2 and F3 open; here there is nothing to
sentinel.

**Verified** — built the proposed indexes in a real libSQL database and ran the exact insert shape that
`cities.ts` step 4c produces (NULL coords, `geocode_status='pending'`, NULL `place_ref`):

```
T3.  two pending user-typed rows, same name/country/region, NULL coords, NULL place_ref
       userA: ACCEPTED
       userB: REJECTED — SQLITE_CONSTRAINT_UNIQUE: index 'uniq_cities_identity'
T3b. same, in a region-tier-DISABLED country (region_id NULL on both)
       userA: ACCEPTED
       userB: REJECTED — SQLITE_CONSTRAINT_UNIQUE: index 'uniq_cities_identity'
T8.  case folding survives the added column
       'NEWPORT' then 'newport', both NULL place_ref: second REJECTED
```

The BUG-33 guard is not weakened for the rows the app creates most. That was the specific charge against S0
("strictly weaker than the one it replaces, for exactly the rows the app creates most"), and it does not
carry here.

> **`CHECK (place_ref IS NULL OR length(place_ref) > 0)` is load-bearing, not hygiene.** My own probe found
> the hole: `place_ref = ''` is not NULL, so it enters the partial unique index, and a *second* row with
> `''` is rejected even though it is a completely different city.
>
> ```
> T7.  insert place_ref=''                        : ACCEPTED
>      insert place_ref='' for a different name   : REJECTED — UNIQUE constraint failed: cities.place_ref
> ```
>
> The empty string is also what makes the `COALESCE(place_ref, '')` sentinel in D2 safe. Without the CHECK,
> a real `''` would collide with the sentinel. This is the same class of trap as `COALESCE(region_id, 0)`
> depending on `regions.id` being AUTOINCREMENT-from-1, and it deserves the same prose comment in
> `schema.ts`.

### C2 — How does `findOrUpgradeCity` pass 1 evaluate that identity before geocoding runs?

**It does not evaluate it. It is *given* it.**

This is the whole design. F2 established that identity is decided by a `SELECT` in application code before any
insert, and that this is structural because GE-12 requires creation to work with the geocoder offline. The
previous design treated that as an obstacle. It is the answer: **if the decision is made in application code
before the geocoder, then the discriminator must arrive with the request.** And it can, because the user has
just picked a row out of a list.

**New step 0**, ahead of every existing step in `findOrUpgradeCity` (`src/backend/routes/cities.ts:165`):

```
step 0  — only when the request carries place_ref:
  0a. SELECT * FROM cities WHERE place_ref = ?                → hit: return it (200). Done.
  0b. dereference place_ref against gazetteer_cities          → 400 if unknown (fail closed)
  0c. validate the request's country_code / region_id agree with the dereferenced row
                                                              → 400 on conflict (see below)
  0d. ADOPT an under-specified row, under D13 step 2's EXACT scoping:
        same (name NOCASE, country_code, COALESCE(region_id,0)), place_ref IS NULL,
        geocode_status IN ('pending','unresolvable'),
        (created_by_user_id = caller OR created_by_user_id IS NULL)
      → UPDATE it: set place_ref, latitude, longitude, geocode_status='resolved'
  0e. otherwise INSERT: name/country/region/lat/lng from the DEREFERENCED ROW,
      geocode_status='resolved', place_ref set. NEVER calls the geocoder.

steps 1, 2, 2b — UNCHANGED, and reached only when NO place_ref was supplied (the tail).
```

Five consequences worth stating explicitly, because they are what makes this different from S0:

- **The geocoder is never consulted on this path.** Not "consulted and tolerated if offline" — never called.
  GE-12 is satisfied by construction rather than by a fallback, and GE-17's *"created with coordinates
  already populated and end state resolved, never pending"* falls out for free.
- **`place_ref` is never mixed with the natural key.** If step 0a misses, the route does **not** fall back to
  the natural-key lookup. It inserts. A fallback would be the exact re-introduction of BUG-75: the user
  named a specific place and matching them to a differently-identified row is the conflation. **This rule is
  the single most important line in the design** and an implementer will be tempted to "helpfully" add the
  fallback.
- **Coordinates are still never client-supplied** (GE-16). A `place_ref` is not a coordinate; it is an opaque
  reference the *server* dereferences against its own table. `CreateCitySchema` is `.strict()`
  (`src/backend/validation/cities.schemas.ts`), so the field must be added there deliberately — it cannot
  arrive by accident. The existing rejection of client `latitude`/`longitude` is unchanged.
- **0c fails closed on a conflict rather than preferring a side.** ADL-46 D12 rule 3 says a *lookup* must
  never override the user's country/region. That is not this case: here two *user-supplied* facts contradict
  each other (a specific place, and a region that place is not in). Neither is more authoritative, so the
  request is malformed — 400, not a silent pick.
- **0d is the same argument D13 step 2 already makes**, one column over: a row with no `place_ref` is an
  *under-specified record*, not a different place, exactly as a region-less row is. Reusing the shipped
  scoping (status whitelist + creator-or-NULL) rather than inventing a second rule is deliberate. A
  `resolved` row is never adopted — it may have been resolved by the geocoder to a *different* Newport, and
  that asymmetry is already the shipped rule.

**Verified** — the defect's own worked example, run against the proposed indexes:

```
T1.  three distinct gazetteer Newports, all name='Newport', country='GB', region=GB-ENG
       Isle of Wight (place_ref A): ACCEPTED
       Shropshire    (place_ref B): ACCEPTED
       Essex         (place_ref C): ACCEPTED
       rows = 3
T2.  the same gazetteer place added again by another user
       REJECTED — SQLITE_CONSTRAINT_UNIQUE: cities.place_ref
```

BUG-75's scenario now produces three rows where it produced one. **The user adding Newport, Isle of Wight
gets Newport, Isle of Wight.**

### C3 — What happens when `resolveCity()` later moves a row into an already-occupied identity?

**It cannot, and the reason is checkable at source rather than argued.**

`resolveCity()` writes exactly `latitude`, `longitude`, `geocodeStatus`, `geocodeAttemptedAt`, `geocodeAttempts`,
`updatedAt` (`src/backend/services/geocoding.service.ts:246`, `:280`, `:304`, `:323`). **None of those appear in
either proposed index.** It never writes `name`, `countryCode`, `regionId` or `place_ref`.

Two further structural guards, both read at source:

- `geocoding.service.ts:238` — `if (city.geocodeStatus === 'resolved') return true;`. A gazetteer-sourced row is
  inserted `resolved`, so `resolveCity` early-returns on it before touching anything.
- `geocoding.service.ts:352` — the retry queue selects `geocode_status = 'pending' AND geocode_attempts < CAP`.
  Gazetteer-sourced rows never enter it.

F3 was "an identity key must be immutable; this one is written twice, minutes apart, by two different actors."
Under this design it is written **once**, by the route, at insert, and never again by anything.

**Verified** — the ordinary retry path, and the adversarial case S0 failed:

```
T4.  pending row -> UPDATE latitude/longitude/geocode_status='resolved'   : ACCEPTED
     a SECOND row resolving to IDENTICAL coordinates                      : ACCEPTED
```

Two rows landing on the same coordinates is now unremarkable, where under the bucket key it was a
`SQLITE_CONSTRAINT_UNIQUE` on the ordinary geocode-retry path.

### C4 — If identity is proximity-based, what expresses "same place within X km"?

**Identity is not proximity-based, so nothing needs to. The question is answered by not asking it.**

F4 and F5 are correct and, in my reading, more damaging than they were credited: they show that *no* quantised
scheme can work, because a grid cell is not a radius and never merges across an edge. Two points 22 m apart can
straddle a boundary; 32.7% of same-name pairs within 5 km land in different cells at 0.1°. The measured
success metric could not see any of it, because every false split reduces the collision count it was counting.

I want to be precise about *why* the objection dissolves rather than just asserting that it does. Proximity was
reached for as an **identity predicate** — a thing a `UNIQUE` index must decide, synchronously, at insert, with
no human present. That is the only role a unique index can play, and proximity is a genuinely bad fit for it:
it is not transitive (A≈B and B≈C does not give A≈C), and non-transitivity is fatal for an equivalence class,
which is what a unique key defines. **Every grid artefact F4 and F5 found is a symptom of forcing a
non-transitive relation into a transitive structure.**

Proximity still has a real job — just not that one:

- **As a ranking signal at search time.** The spike's own §3.4 follow-on (proximity to an existing trip place)
  is a good idea and is unaffected by this design.
- **As a duplicate-*detection* heuristic, offline, reported to a human.** "These two `cities` rows are 300 m
  apart and have similar names" is a useful report. It is not a constraint, it never blocks a write, and its
  non-transitivity is harmless because a person adjudicates.

**Do not build either as part of this fix.** They are follow-ons. The point for the reviewer is that the
capability the bucket was reaching for is not lost — it is relocated to a place where "within X km" is a
meaningful thing to say.

### C5 — Has a gazetteer source carrying a stable row id been evaluated?

**Yes, all of them I could reach, and the answer is not the one the framing expected.** Full working in §3.

Short form: `all-the-cities@3.1.0` does ship a genuinely stable id — I closed the review's own UNVERIFIED item
and it survived (0.089% churn across a version pair). But **the premise that `cities.json` has no identity is
false.** It has no *id column*; it has a *natural key*, measured unique over every one of its 170,540 rows.
Once that is minted into a `place_ref` at build time, the swap buys nothing that justifies losing 35,307 rows
and freezing the corpus at 2020.

---

## 3. The dataset decision

### 3.1 The four options, and why three are rejected

Everything in this section was re-derived in this worktree from the packages themselves. **No figure is
inherited from ADL-48 or from either review**, per the brief. Where a re-derived figure agrees with an earlier
one, I say so.

| Option | Verdict | The measurement that decided it |
|---|---|---|
| **Swap wholesale to `all-the-cities@3.1.0`** | **Reject** | **97.78%** of its 135,233 rows already match a `cities.json` row on country+name+coordinates. It is not a different trade — it is substantially the same GeoNames extract, five years stale. Swapping costs **35,307 rows net** |
| **Keep `cities.json`, join a stable id from `all-the-cities`** | **Reject** | Best-case join coverage **~77.6%**, and the uncovered fifth *is* the post-2020 growth — it widens every month. Yields a two-tier identity anyway, plus a second frozen 9 MB dependency |
| **Composite natural key, stable without an upstream id** | **ADOPT** | `(country, admin1, admin2, name, lat, lng)` → **170,540 distinct / 170,540 rows, zero duplicates.** 64-bit truncated SHA-256 over it: also zero collisions |
| **GeoNames upstream dump direct (`cities1000`)** | **Right, but blocked** | `download.geonames.org` unreachable from this environment — two independent probes, §5 |

### 3.2 `all-the-cities` is not an alternative dataset — it is an old copy of this one

This is the finding that retires the swap, and it is the question the brief said was genuinely open.

```
cities.json@1.1.61     170,540 rows   published 2026-08-01   CC-BY-4.0 (package + README)
all-the-cities@3.1.0   135,233 rows   published 2020-03-18   MIT declared over GeoNames CC-BY

all-the-cities rows matched in cities.json by country + name + coords (<0.2°) : 132,228  (97.78%)
                            same country+name, coords differ >0.2°            :     306
                            no country+name match at all                      :   2,699  (2.00%)
```

The 2,699 unmatched rows are not a distinct editorial selection. Inspecting them: they are **renames**
(`AE/Ras Al Khaimah City` where `cities.json` carries the older form) and **`population = 0` rows**
(`AF/Zorkot`, `AF/Sheywah`, `AF/Kai` …) that `cities.json`'s population>1000 filter excludes by construction.

`cities.json`'s own README states its source: *"all cities with a population > 1000 or seats of adm div down
to PPLA3 (ca 130.000)"*, from the GeoNames dump — i.e. `cities1000`. The "ca 130.000" in that text is the
2020-era size, and the package now ships 170,540. **`all-the-cities`' 135,233 is that same extract measured
in 2020.** The 35,307-row gap is five years of GeoNames growth, not a different trade.

Two supporting facts:

- **Release cadence.** `cities.json` has 65 versions, the last six at monthly intervals
  (1.1.59 → 2026-06-01, 1.1.60 → 2026-07-01, 1.1.61 → 2026-08-01, all at ~00:40 UTC — an automated
  monthly rebuild). `all-the-cities` has five versions ever, the last on **2020-03-18**. The 2022 registry
  `modified` timestamp is metadata, not a release.
- **The package's headline claim is wrong, and it is wrong in the direction that confirms the above.**
  It advertises population > 15,000; measured, **110,910 of 135,233 rows (82%) are under 15,000** and
  **22,913 are under 1,000**. That reproduces the review's figure exactly. A dataset advertising
  cities15000 while shipping cities1000-with-extras is a cities1000 extract with a stale description.

**On the licence half, which the brief says is closed and which I am not re-opening:** GE-18's third success
criterion was written specifically for the MIT-over-CC-BY conflict in `all-the-cities`. Under this
recommendation **that package is not adopted, so the criterion has no live instance.** `cities.json` declares
CC-BY-4.0 in both `package.json` and its README, consistent with GeoNames upstream — no conflict to resolve.
The criterion should stay in the BRD as a standing rule; the COO should simply know it is now unexercised
rather than discharged. The in-product credit line the PO approved is unaffected and still owed: GeoNames
(CC BY 4.0) for the city data, plus the OSM and Natural Earth obligations GE-18 already consolidates.

### 3.3 The stable-id gain is real, and it is smaller than the cost

I closed the review's UNVERIFIED item 1 ("whether `all-the-cities`' `cityId` values are stable across
releases — I did not compare two package versions"). Installed 3.0.0 alongside 3.1.0 and diffed:

```
places unique in BOTH versions by (country, adminCode, name) : 122,751
whose cityId changed                                         :     109   (0.089%)
```

**My first cut of this measurement said 740 and I disproved it myself before filing.** Matching forward by
`cityId` showed 740 ids "repointed to a different name/country" — which looked alarming until I read the
examples: `AE/Umm al Qaywayn → AE/Umm Al Quwain City`, `AM/Ejmiatsin → AM/Vagharshapat`. Those are **renames
of the same place, with the id correctly following it through the rename.** That is a stable id doing its job,
not failing it. The honest number is the 0.089% above, restricted to keys unique in both versions (my first
attempt let duplicate-group members masquerade as id changes).

Against that, the content-addressed alternative, measured over `cities.json` 1.1.55 → 1.1.61 (two months, six
monthly releases):

```
full-row key (country|admin1|admin2|name|lat|lng)   169,115 old keys,  803 vanished  (0.475%)
   of which: edited in place (same country/admin1/name)  572     <- these are the ones that dangle
             removed entirely                            231
admin-only key (country|admin1|admin2|name)         168,519 old keys,  268 vanished  (0.159%)
   of which: name changed 222 · admin2 changed 39 · removed 9
```

So the upstream id is roughly **5× more stable**, and it is *categorically* better against renames — 83% of
the admin-key churn is name changes, which no content key can survive and which `cityId` survives by design.
That is a genuine advantage and I am not going to pretend otherwise.

**It still loses, on three grounds:**

1. **Coverage.** The donor covers at most 132,228 + 306 ≈ 77.6% of `cities.json`. The other 22% would need a
   minted `place_ref` anyway, so the two-tier scheme arrives regardless — we would simply also be carrying a
   frozen 9 MB dependency and a permanently widening blind spot.
2. **The failure mode is benign.** A dangled `place_ref` does not produce a wrong answer. Step 0a misses,
   step 0e inserts, and the user gets **a second correct row for the same town** — a duplicate, not a
   mis-pin. Compare BUG-75, where the failure is a Shropshire pin on an Isle of Wight trip. Spending a stale
   dependency and a coverage cliff to reduce the rate of a tidiness defect is a bad trade.
3. **It is recoverable either way, because the `cities` row carries its own data.** `place_ref` is a *link*,
   not the data — name, country, region and coordinates are all copied into `cities` at creation. So a row
   with a dangled ref is fully functional, and re-keying from stored attributes is always possible later.
   **This is the property that makes the whole decision low-stakes, and it is exactly the property the
   coordinate-bucket design lacked** — there, identity *was* the data, so getting it wrong was unrecoverable.

Practical scale, stated with its denominator: at the measured 0.475% per two months, a catalogue of 500
user-added cities would dangle roughly **2–3 refs per two months**. Today `cities` holds 3 rows in staging and
2 in production.

### 3.4 What to mint, exactly

```
place_ref = 'cj1:' || substr(hex(sha256(country|admin1|admin2|name|lat|lng)), 1, 16)
```

- **`cj1:` is a namespace, and it is the point.** It is what makes D8 an additive change rather than a
  migration: if the GeoNames dump becomes reachable, new rows mint `geonames:<geonameid>` and old `cj1:` refs
  keep working untouched. The same slot takes `osm:<type>:<id>` (§6) and `local:<uuid>` (§4).
- **16 hex characters, verified, not argued from birthday probability:**

  ```
   8 hex (32 bit): 170,533 distinct / 170,540   -> 7 collisions   REJECT
  12 hex (48 bit): 170,540 distinct / 170,540   -> 0
  16 hex (64 bit): 170,540 distinct / 170,540   -> 0              ADOPT (margin over 12)
  ```

  The generator already enforces safety proofs on its S1 output (`scripts/generate-gazetteer.mjs`, the F2/F4
  block). **Add "zero `place_ref` collisions" as one more build-time assertion** rather than relying on the
  probability argument — that is this project's established pattern and it costs nothing.
- **Hash the raw JSON strings.** `cities.json` stores `lat`/`lng` as strings (`"42.53176"`). Hashing them as
  given avoids every float-formatting and locale hazard. Do not parse and re-serialise.
- **Worked example — the four Newports the defect is named for:**

  ```
  cj1:8f70bc7aabbc661e   GB|ENG|E1|Newport|53.76333|-0.69986    (East Riding)
  cj1:5c32d243f92869fe   GB|ENG|O2|Newport|52.76684|-2.37734    (Shropshire)
  cj1:d8dcffdb9ebfcecf   GB|ENG|E4|Newport|51.98425|0.21355     (Essex)
  cj1:2cb3fee5d374543b   GB|ENG|G2|Newport|50.70146|-1.29124    (Isle of Wight)
  ```

  Note `admin2` — `E1`/`O2`/`E4`/`G2`. **`cities.json` has always carried the discriminator; the app throws
  it away.** That is the one-line explanation of why the dataset looked identity-less.

### 3.5 Why not just the admin key, without coordinates

Tempting: it churns at 0.159% instead of 0.475%. **It is not unique** — 584 duplicate groups, 1,196 rows
(0.701%), worst `DE|06|00|Neuenkirchen` ×5. A non-unique key cannot be an identity. I also considered
appending a deterministic ordinal within collision groups to rescue it; rejected, because the ordinal shifts
whenever any group member is added, removed or moved, which trades a visible 0.475% for an invisible and
harder-to-reason-about failure.

For the record, the same table shows why the app's *current* key fails and by how much:

| Key | Distinct | Dup groups | Rows in dup groups |
|---|---|---|---|
| `country \| name` (the pre-BUG-33 key) | 156,576 | 8,017 | 21,981 (12.889%) |
| `country \| admin1 \| name` — **today's app key** | 168,228 | 2,076 | 4,388 (2.573%) |
| `country \| admin1 \| admin2 \| name` | 169,928 | 584 | 1,196 (0.701%) |
| `country \| admin1 \| admin2 \| name \| lat \| lng` | **170,540** | **0** | **0** |

### 3.6 Denominator discipline

Per the brief, stated honestly rather than headlined. The percentages above are **bulk-load statistics over
170,540 gazetteer rows** — they describe how much of the world's city data the current key cannot represent,
not a defect rate on a table holding 3 rows.

Re-derived for GB, the dogfood country, against the **actual** seeded region set
(`data/regions.json` — GB has exactly 4 regions, `GB-ENG/SCT/WLS/NIR`, so `admin1` maps 1:1 and this *is* the
post-S1 state, not an approximation):

```
GB gazetteer rows                                             : 4,638
colliding groups under (country, admin1, NOCASE name)         :   165
rows unrepresentable                                          :   193   (4.16% of GB rows)
groups whose members are more than 10 km apart                :   165   (ALL of them)
worst                                                         :   478 km  [ENG | ashington]
GB-ENG "Newport"                                              :   4 rows, max separation 343 km
GB (all four nations) "Newport"                               :   6 rows, max separation 345 km
```

4.16% reproduces the review's GB figure independently, and the Newport worked example reproduces exactly
(4 rows / 343 km). **One thing is stronger than previously reported: in GB, *every one* of the 165 colliding
groups spans more than 10 km.** There are no benign same-place near-duplicates in the GB set at all — every
GB collision is a wrong-town conflation. The near-duplicate case that motivated choosing 0.1° over 0.01°
does not exist in the dogfood country.

---

## 4. The tail, and whether GE-17 needs amending

**The honest answer first: as written, GE-17's criterion is not fully satisfied by §2 alone, and I am not
going to argue it into compliance.**

GE-17 requires *"two genuinely distinct places sharing a name, country and region are individually selectable
and do not collapse into one record."* For gazetteer-sourced cities, §2 satisfies this completely. For the
tail — a city the user types that the bundled data does not contain, Plockton and its class — `place_ref` is
NULL, the natural key applies, and two genuinely distinct same-name-same-region places still collapse.

The criterion sits among criteria that are all explicitly about bundled cities, so a narrow reading scopes it
to them. I do not think the COO should rely on that reading: the sentence says "genuinely distinct places",
flatly, and a requirement that means something narrower should say so.

**But there is a cheap mechanism that closes it outright, and I would rather propose that than have the BRD
amended down.**

### D9 — explicit user disambiguation for the tail

The failure needs positive evidence of distinctness, and for the tail the only possible source of that
evidence is the user. The flow already almost provides it: when pass 1 matches, `POST /api/cities` returns
**200 with the existing row, including its coordinates**. The client can therefore show what it matched:

> *"Matched to Plockton (57.336, −5.657). Not the place you meant?"* → **"No, this is a different place"**

That sets one boolean on the create request. The server inserts with `place_ref = 'local:' || <uuid>`, which
the index already permits (it is just another namespace) and which is immutable, minted server-side, and
requires a deliberate user act. **BUG-33 stays closed** because the default is still to collapse; separation
happens only on explicit evidence.

Cost: one request field, one UI affordance, no schema change beyond what §2 already does. It also gives the
user a way out of a *wrong* pass-1 match generally — which is a latent complaint the product has today and
which GE-16's "correct it by re-pointing" only partially addresses.

**Recommendation: adopt D9 as a small, separate stage after the core fix, and do not amend GE-17.** If the COO
would rather not carry the UX work, then GE-17's criterion does need scoping to bundled cities — that is the
COO's call and I am flagging it rather than making it.

---

## 5. Migration shape

**Expand-only. There is no contract step, and that is a design decision, not an omission** — `place_ref` stays
nullable permanently, because the tail legitimately has none.

Per ADL-47, each stage is independently green and deployable.

| Stage | Change | Breaks anything? |
|---|---|---|
| **E1 — schema** | Add `cities.place_ref TEXT` + `CHECK (place_ref IS NULL OR length(place_ref) > 0)`. Replace `uniq_cities_name_country_region_ci` with `uniq_cities_identity`. Add `uniq_cities_place_ref` | **No.** Verified no-op over existing data |
| **E2 — route** | `CreateCitySchema` accepts optional `place_ref`; step 0 added to `findOrUpgradeCity`. Inert until a client sends one | No |
| **E3 — data + client** | `gazetteer_cities` carries `place_ref`; search returns it; the client passes it through on selection. **This is the stage at which BUG-75 stops happening** | No |
| **E4 — D9 (optional)** | Tail disambiguation, `local:<uuid>` | No |
| **contract** | *(none)* | — |

**E1 is a no-op over shipped data, and I verified it rather than reasoning it.** On migration day every row has
`place_ref` NULL, so `COALESCE(place_ref, '')` is constant and `uniq_cities_identity` degenerates to today's
index exactly; the partial index indexes nothing:

```
T6.  seeded a table with today's index and 3 rows (all place_ref NULL)
       CREATE the new composite index over that data : ACCEPTED
       CREATE the partial place_ref index            : ACCEPTED
       with all place_ref NULL, does the new index still reject a natural-key dup?
                                                     : REJECTED — UNIQUE constraint failed
```

The new key is **strictly more permissive** than the one it replaces, so no existing row can violate it and
**no backfill is required** — the same argument `schema.ts` makes for the D13 key today, and it holds here
for the same reason.

Four notes for whoever implements E1:

1. **Adding a CHECK constraint forces a SQLite table rebuild** (the `__new_cities` / copy / rename pattern —
   see `src/backend/migrations/0011_majestic_nehzno.sql`). Trivial at 3 rows, but the generated SQL must be
   read before it is applied. This project patches drizzle-kit for four SQLite bugs specifically in this
   area (`patches/drizzle-kit+0.31.9.patch`, ADL-15), and the CHECK-constraint regex is one of them.
   `npm run db:generate` then read the file; never `db:push`.
2. **Both indexes are needed; neither is redundant.** The partial index alone would let two rows with NULL
   `place_ref` and the same natural key both insert (BUG-33). The composite alone would let two rows share a
   `place_ref` if their names differed.
3. **Prefer the composite shape over `… WHERE place_ref IS NULL`.** A partial natural-key index is unusable by
   SQLite for the step-1 lookup, which does not mention `place_ref` in its `WHERE` — the tail lookup would
   degrade to a scan. The `COALESCE(place_ref, '')` form keeps every row indexed and keeps
   `(name, country_code, COALESCE(region_id,0))` usable as a leftmost prefix.
4. **`gazetteer_cities` may be delete-and-reloaded; `regions` may not.** The distinction is not stylistic:
   `cities.region_id` is a real FK to `regions.id`, so re-issuing those AUTOINCREMENT ids silently repoints
   existing cities (this is why S1 uses an additive upsert). `cities.place_ref` is a **soft reference with no
   FK** — deliberately, so the gazetteer can be reloaded freely. A `cities` row whose `place_ref` no longer
   resolves stays fully functional; it carries its own name, country, region and coordinates.

**On reseed: report dangling refs, do not auto-repair.**

```sql
SELECT c.id, c.name, c.country_code, c.place_ref
FROM cities c
WHERE c.place_ref LIKE 'cj1:%'
  AND NOT EXISTS (SELECT 1 FROM gazetteer_cities g WHERE g.place_ref = c.place_ref);
```

An automatic re-key is a fuzzy-matched write against user data running unattended. At the measured rate it
will surface a handful of rows and a human can adjudicate each one. **Trigger to revisit:** if that report
routinely exceeds ~20 rows, build the repair. Both staging and production hold disposable test data, which
removes any data-preservation constraint here — it does not license an incorrect migration, and none of the
above depends on it.

---

## 6. Sequencing — and the one thing that could shorten it

**BUG-75 is not user-visibly fixed until E3.** E1 and E2 are correct, safe and inert; until a client sends a
`place_ref`, every create still runs steps 1/2/2b and the defect behaves exactly as it does today. E3 depends
on the gazetteer (ADL-48 S2/S3), which is gated on the BRD (now done, v3.14) and on a Turso write-throughput
measurement the spike could not take. **That is a real cost of this design and the COO should price it:** the
rejected S0 claimed to fix the defect independently of the gazetteer, and this one does not.

**There may be a way to decouple it, and I am flagging it rather than designing it.** Nominatim returns
`osm_type` + `osm_id` on every result — a stable identifier for the underlying OSM object. If the geocoder
path captured it as `place_ref = 'osm:<type>:<id>'`, the D14 candidate flow (which already presents multiple
candidates and asks the user to choose) would be minting a real discriminator, and BUG-75 would be fixed on
the geocoder path **before** the gazetteer ships.

Three caveats, and they are why this is a flag and not a recommendation:

- The client does not capture it today. Established by three probes that could fail differently: a grep for
  `osm_id|place_id|osm_type` across `src/backend` and `src/frontend` (only `trip_place_id` matches, a
  different thing); reading `GeocodeCandidate` end to end (`src/frontend/types/api.ts:86–93`); and reading
  `RawNominatimResult` end to end (`src/backend/services/nominatim-client.ts:68–79`). None of the three
  declares an OSM identifier.
- **Use `osm_type` + `osm_id`, never `place_id`.** Nominatim's `place_id` is documented as an internal row id
  that is not stable across instances or reimports. This is a trap worth writing into any brief.
- I have not confirmed against a live Nominatim response — the host is firewalled here. **UNVERIFIED**, blind
  spot stated: I am relying on the documented API shape, not an observed one.

Recommended order: **E1 → E2 → (assess the OSM path) → E3 → E4.**

---

## 7. Verified vs unverified

### Verified in this document, and how

- **Every index behaviour in §2** — built both proposed indexes in a real libSQL database (`@libsql/client`,
  file-backed) and ran the actual insert and update shapes taken from `cities.ts` and
  `geocoding.service.ts`. T1–T8 above are that run's output verbatim, including the two results that are
  *unfavourable* to the design (T5, T7).
- **Every dataset figure in §3** — re-derived from the packages themselves, installed fresh in a scratch
  directory: `cities.json@1.1.61` and `@1.1.55`, `all-the-cities@3.1.0` and `@3.0.0`. Key unions were
  computed over **all** rows, not a sample. Nothing is inherited from ADL-48 or either review.
- **What `resolveCity()` writes and when** — read `geocoding.service.ts` end to end at the four `update(cities)`
  call sites plus the queue selector, not grepped.
- **GB region granularity** — read `data/regions.json`; GB has exactly four regions matching `admin1`
  1:1, so §3.6's GB numbers are the post-S1 state exactly rather than an approximation.
- **`CreateCitySchema` is `.strict()`** — read `src/backend/validation/cities.schemas.ts` in full.

### Unverified, with the probe run and its blind spot

1. **`download.geonames.org` is unreachable from this environment (D8).** Two independent probes that fail
   differently: (a) `curl -I https://download.geonames.org/…` → `Failed to connect … port 443`; (b) read the
   allowlist in `/workspace/.devcontainer/init-firewall.sh` lines 140–151 — the `for domain in` list is
   npm, Anthropic, Sentry, Statsig, three VS Code hosts, Clerk, two Turso hosts and Railway. *Blind spot:*
   this is the **devcontainer's** reachability, not the host's or CI's. A vendored dump fetched outside the
   container would sidestep it entirely, and that possibility is exactly why D8 is recorded as a follow-on
   with a trigger rather than as closed.
2. **Nominatim's live response shape (§6) — UNVERIFIED.** I confirmed the *client* does not capture an OSM
   identifier (three probes above) but could not confirm the *server* returns one, because the host is
   firewalled. *Blind spot:* the whole OSM decoupling idea rests on a documented API shape. *Probe to close:*
   one Nominatim call from an unfirewalled machine.
3. **The churn rates in §3.3 rest on one version pair each.** `cities.json` 1.1.55→1.1.61 spans two months in
   2026; `all-the-cities` 3.0.0→3.1.0 spans four months in 2019–20. **They are not like-for-like windows and
   I am comparing them directly.** *Blind spot:* a different window could move either number. *Probe to
   close:* re-run across several pairs. I did not, and the 5× ratio should be read as an order of magnitude,
   not a constant.
4. **The `all-the-cities` ↔ `cities.json` overlap (97.78%) uses a 0.2° coordinate tolerance** to absorb
   centroid drift. *Blind spot:* a genuinely different town under 0.2° from a same-named one would be counted
   as a match, slightly overstating the overlap. The 2.00% no-match figure is unaffected by the tolerance and
   carries the argument on its own.
5. **No timing or scale measurement was taken.** Nothing here is a performance claim.

### Disproved — my own findings, killed before filing

Recorded because a design that reports only its wins is not a design review.

1. **"`all-the-cities`' `cityId` churns badly — 740 ids repoint to a different place."** False, and the
   opposite of the truth. They are renames (`Ejmiatsin → Vagharshapat`) with the id correctly tracking the
   place through them. Restricted to keys unique in both versions, the real figure is **109 / 122,751 =
   0.089%**. My first framing would have overstated the case against the option I ended up rejecting — for
   the wrong reason.
2. **"The admin-only key `(country, admin1, admin2, name)` is the elegant answer."** It churns 3× less, so I
   wanted it. It is **not unique** — 584 duplicate groups. Measured, discarded.
3. **"Make the natural-key index partial (`WHERE place_ref IS NULL`) — cleaner than a `COALESCE` sentinel."**
   Rejected on reflection: SQLite cannot use a partial index for a query whose `WHERE` does not mention the
   partial condition, so the tail's step-1 lookup would lose its index. The uglier `COALESCE` form is the
   correct one.
4. **"A `place_ref` miss should fall back to the natural key — it is more forgiving."** This was in my first
   draft of step 0. It is precisely BUG-75: a user who named a specific place would be silently handed a
   different one. Removed, and promoted to the design's most important invariant.

---

## 8. Write this to be attacked — my two weakest points

Named deliberately, because the OP-27 reviewer should start here rather than spend the budget finding them.

### Attack 1 (start here) — the index still does not *prevent* the duplicate it is supposed to prevent

`uniq_cities_identity` permits a user-typed row and a gazetteer-sourced row for the same real place:

```
T5.  user-typed  Glasgow, GB, GB-ENG, place_ref NULL          : ACCEPTED
     gazetteer   Glasgow, GB, GB-ENG, place_ref cj1:…         : ACCEPTED
     >>> both exist. The index does not stop this. Pass-1 policy (step 0d) must.
```

**This is the same class of weakness that destroyed the previous design.** F2's charge was that identity is
decided by a `SELECT` in application code rather than by an insert conflict, and that charge still lands here.
My defence is narrower than "fixed": I have made the index **agree** with the application policy instead of
contradicting it, and I have made the policy's discriminator immutable and available at the moment the
decision is taken. A policy bug still yields a duplicate. It no longer yields a *wrong town* — but that is a
severity reduction, not a proof.

**How to attack it:** construct a sequence of `POST /api/cities` requests, across two users and both the
`place_ref` and no-`place_ref` paths, that produces two rows for one real place under the step-0 ordering in
§2/C2. If such a sequence exists and is reachable through the shipped UI, step 0d's adoption scoping is wrong
and I would want to know before this is briefed.

### Attack 2 — the dataset decision rests on two n=1 comparisons

§3.3's "5× more stable" comes from exactly one version pair per package, over non-comparable windows
(§7, unverified item 3). D5, D6 and D7 all lean on it. If `cities.json`'s churn is materially higher in other
windows — a large upstream re-import, say — the balance shifts toward the donor id and D7 could flip.

**How to attack it:** install four or five `cities.json` versions across a year and recompute; check whether
the 0.475% is a steady rate or an artefact of the particular months I sampled.

### Attack 3 — step 0d inherits a repoint hazard from D13 step 2

Adoption (§2/C2, step 0d) upgrades a caller's own `pending` row in place. If that row is already attached to a
trip place, the trip silently moves. That is a real hazard — **and it is the hazard the shipped D13 step-2
wildcard upgrade already carries**, under the identical scoping, reasoned about and accepted in ADL-46. I have
reused the existing rule rather than inventing a second one, so this design does not widen the class; it does
not narrow it either. The alternative is to not adopt at all and let GE-16's correction path handle it, at the
cost of more duplicate rows. A reviewer may reasonably disagree with my choice here; it is the least
load-bearing decision in the document and can be flipped without touching anything else.

---

*No schema change was made, no migration generated, no remote database written to. The BRD, `_project/tracker.json`,
ADL-48 and the spike/review documents were not edited — recommendations are filed here for COO adjudication.
Scratch probe scripts were written outside the repo and are not committed.*

# What *is* a city's name? — the BUG-75 / BUG-80 design

**Date:** 2026-08-04
**Author:** Architect (fresh dispatch — no authorship of ADL-48, the QUAL-25 spike, the rejected S0, the
2026-08-03 `place_ref` redesign, or that redesign's OP-27 review)
**Tracker:** BUG-75 · BUG-80 · BUG-76 (interaction only) · QUAL-25
**BRD:** GE-12, GE-13, GE-14, GE-15, GE-16 (v3.16). **GE-17 is WITHDRAWN** and nothing here depends on it.
**Branch:** `chore/city-name-identity-design`
**Status:** design only. No schema change, no migration, no code, no remote write.
**Needs a new ADL number** — this supersedes ADL-46 **D13** (identity key) and amends the ADL-46 **F1/F2
ruling §2.2 step 3** (the ambiguity rule). I have not assigned one; the COO does.

---

## 1. Summary table and recommendation

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| **D1** | What is a city's *name*? | Three strings, three jobs. **`cities.name` stays the short label.** Add `qualified_name` for the full administrative chain. The user's typed text is a **query** and is authoritative for nothing | **High** |
| **D2** | Was shortening the name the error? | **No — discarding the qualifier was.** `815b650` is right about `cities.name` and should be *ratified*, not reverted | **High** |
| **D3** | Where does BUG-75 actually originate? | **`classifyCandidates`, not the unique index.** It counts distinct *regions*, so four Newports in GB-ENG return `ok` and it silently picks `matches[0]`. **Verified by running the shipped function** | **High** |
| **D4** | The primary fix | **Count distinct *places*, not distinct regions.** Four Newports → `ambiguous` → `pending` → no pin, no wrong town. This is what GE-16 already requires; the code does not do it | **High** |
| **D5** | Identity of a city created with the geocoder offline | **It has none, and must not be given one.** It is a *claim about a name*, not a record of a place. Identity is **tiered by evidence**, and the tier already exists as `geocode_status` | **High** |
| **D6** | Index shape | Two partial indexes replacing `uniq_cities_name_country_region_ci`: **claims are creator-scoped**, **resolved rows are qualified-name-scoped** | **High** |
| **D7** | Orphaned claims (`created_by_user_id` NULL) | Index **only owned claims** (`… AND created_by_user_id IS NOT NULL`). **`COALESCE(created_by_user_id,'')` makes user deletion fail — I proposed it, probed it, and killed it** (§7) | **High** |
| **D8** | The disambiguation channel | **D14 is region-keyed and therefore structurally cannot express this defect.** `POST /api/cities` must accept the chosen candidate's `qualified_name`, server-verified against a re-run lookup | **Medium** |
| **D9** | BUG-80 | **Two halves, and the reported half needs no schema change at all.** The region is already joined and thrown away at the route boundary | **High** |
| **D10** | Migration | Expand/contract, 5 stages. **The classifier fix and the BUG-80 display fix each ship alone, first, with no schema change** | **High** |
| **D11** | BUG-76 interaction | Independent hardening required: **a terminal `unresolvable` must never be reachable from a candidate set our own filter emptied** | **High** |

> ### Recommendation
>
> **Stop trying to build a better key. The wrong town is chosen before any key is consulted.**
>
> Both rejected designs — the coordinate bucket and `place_ref` — tried to make `cities`' identity *key*
> discriminate between four Newports. Both were downstream of the actual decision. Running the shipped
> `classifyCandidates` against the four real GB-ENG Newports returns **`ok`**, with `best` set to an
> arbitrary one, whether or not the user selected a region. The route then inserts that as a **`resolved`**
> row carrying that arbitrary town's coordinates.
>
> So the *first* user to type "Newport" is already mis-pinned, on an empty table, with no index involved.
> The unique index is how the error then reaches every subsequent user — it is the propagation mechanism,
> not the origin. **A perfect identity key would not have fixed this defect**, which is why two
> well-engineered designs failed against it.
>
> The fix is one rule in one function: **ambiguity is more than one distinct *place*, not more than one
> distinct *region*.** Under it, Newport/GB/ENG becomes `ambiguous`, the row stays `pending`, GE-13
> renders no pin, and nobody is silently sent to Shropshire. That is a strictly honest state, it needs no
> schema change, and it is what **GE-16 already requires today**: *"where a lookup returns more than one
> candidate the user is asked to choose rather than one being selected for them."* We are not adding a
> requirement — we are making the code satisfy the one it has.
>
> **The identity question then answers itself.** A row created while the geocoder was unreachable has no
> evidence about which place it is. It is a **claim about a name**. Giving a claim a durable, globally
> shared identity is the category error that generated both previous designs. Claims are creator-scoped;
> only rows an authority has actually resolved to a specific place join the shared catalogue. That tier
> already exists in the schema as `geocode_status` — it drives *visibility* today and simply needs to
> drive *identity* too.
>
> **And the brief's invitation applies: the answer is smaller than the brief implies, in two places.**
> BUG-80 as the PO reported it (GB-SCT vs GB-WLS both rendering "Newport / United Kingdom") is a dropped
> join plus a shared formatter — **no schema change, no dependency on any of the above, shippable now.**
> And the BUG-75 safety fix is one predicate in `geocoding.service.ts`. The schema work is real but it is
> the *third* priority, not the first.

---

## 2. What is a city's name?

### 2.1 Three strings, three jobs

| String | Where it comes from | What it is for | Authoritative for |
|---|---|---|---|
| **The query** | the user's keystrokes — `"newport"`, `"denver co"`, `"Zurich"` | finding candidates | **nothing.** It is a search term |
| **The label** | Nominatim `raw.name` (`nominatim-client.ts:191`) | the headline you render | **`cities.name`** |
| **The qualified name** | Nominatim `raw.display_name` — *"Newport, Isle of Wight, England, United Kingdom"* | telling two same-labelled places apart, and showing the user which one they got | **display + disambiguation + resolved-row identity** |

These are three different things and the codebase currently has a field for one of them.

### 2.2 The premise the PO questioned, and the answer

The PO said: *"I don't remember us deciding to shorten place names."* They are right that no decision
exists. **I independently re-established that** (two probes, §7): every `display_name` in the ADL log and
the ER schema is `map_shading_config` or `users`; ADL-49's mentions are replay-fixture *capture*, not
canonicalisation. Both naming lines — `cities.ts:318`'s `canonicalName` and `nominatim-client.ts:191`'s
comma-segment fallback — entered in `815b650`, confirmed by `git log -S` on each.

**But shortening was not the error, and reverting it would be a mistake.** `cities.name` is rendered as a
bare label on six surfaces (map pin text, trip-card chips, modal titles, filter chips — see §5). Putting
`"Newport, Isle of Wight, England, United Kingdom"` in that field breaks every one of them, and makes the
label locale-volatile and upstream-controlled into the bargain.

**The error was discarding the qualifier.** The geocoder hands us the full administrative chain, we parse
it into `NominatimCandidate.displayName` (`nominatim-client.ts:190`), and nothing persists it. So:

> **D1/D2 — `cities.name` remains the short label; add `cities.qualified_name TEXT` (nullable) for the
> chain. Ratify `815b650`'s naming behaviour explicitly rather than leaving it as an undesigned artefact.**

### 2.3 The one genuine naming defect

`cities.ts:363–374` inserts `name` = **the user's raw text** when the geocoder cannot answer. So
`cities.name` is *two different kinds of string depending on a network outcome* — a canonical label on the
resolved path, an unvalidated query string (`"denver co"`) on the pending path.

This is not separately fixable and does not need to be: it is exactly what `geocode_status='pending'`
already means, and §3's tiering makes it consequential rather than cosmetic. A claim's name is the user's
word for it, and a claim is private to that user. **The rule to write down: a row's `name` is
authoritative only when `geocode_status='resolved'`.** Nothing today states that, and both previous
designs assumed the opposite.

---

## 3. Identity

### 3.1 The finding that reframes the defect

**`classifyCandidates` (`geocoding.service.ts:122–157`) decides ambiguity by counting distinct
`region_iso` values, not distinct places.** Step 3 (`:138–149`) is explicit:

```ts
const matches = eligible.filter((c) => c.regionIso?.toUpperCase() === upperRequested);
if (matches.length >= 1) {
  return { status: 'ok', best: matches[0], eligible };
}
```

`matches.length >= 1` — four matches is `ok`. The doc comment at `:111–112` justifies it: *"count is
irrelevant — every match agrees with what the user chose."* **That reasoning is the defect.** Agreeing on
a region does not make two towns the same town. The no-region branch (`:152–156`) has the same shape:
four Newports share one `region_iso`, so `distinctRegionIsos().length === 1` → `ok`.

**Verified by executing the shipped function** against the four real GB-ENG Newports (a throwaway Vitest
probe, since removed — output verbatim):

```
[region-requested]        status=ok  best=Newport, Isle of Wight, England, United Kingdom
[no-region]               status=ok  best=Newport, Isle of Wight, England, United Kingdom
[cross-region control]    status=ambiguous                      <- control passes
[discriminator availability] distinct displayName=4  distinct coords=4
```

The last line matters: **the classifier already receives four fully distinct discriminators and consults
neither.**

Trace it through the shipped route on an **empty** `cities` table:

```
Pass 1 (cities.ts:299)   -> null (table empty; no index consulted)
resolveCityName          -> status 'ok', best = an arbitrary Newport
canonicalName            -> 'Newport'
Pass 2 (cities.ts:322)   -> null
INSERT (cities.ts:339)   -> name='Newport', region=ENG, lat/lng = THAT Newport's,
                            geocode_status='resolved'   <- globally visible
```

**The first user is mis-pinned before any uniqueness constraint exists to be wrong.** Every later user
then matches that `resolved` row at pass 1. The index is the *propagation* mechanism.

This is why the coordinate bucket and `place_ref` both failed: **they were both fixes to the propagation,
and the origin is a classification rule two files away.**

### 3.2 D4 — count distinct places

> **Ambiguity is "more than one distinct place among the eligible candidates."**

The current rule exists for a real reason, stated at `:97–102`: Nominatim returns one real city at several
administrative granularities (`city` + `municipality`, both surviving `SETTLEMENT_TYPES`), and counting
raw hits would mark nearly everything ambiguous. That objection is correct and the fix must survive it.

Counting **places** does survive it, because the two cases are not close: two candidates for one place are
co-located; the four Newports span 343 km. The `distinct displayName=4 / distinct coords=4` line above is
that separation, measured on the real data.

**This is not the rejected coordinate-bucket idea, and a reviewer will reach for that objection.** The
distinction is categorical:

| | Rejected bucket (S0) | This |
|---|---|---|
| Role of coordinates | an **identity key** inside a `UNIQUE` index | a **classification input** for one request |
| Structure required | a transitive equivalence class | none |
| Cost of being wrong | a wrong row identity, silently, forever | **one unnecessary question to a user** |
| Human in the loop | no | yes |

F4/F5's finding — that proximity is non-transitive and therefore cannot define an equivalence class — is
correct and **does not transfer**, because nothing here builds an equivalence class.

**What "distinct place" means, precisely, is a calibration I cannot perform from this container** (the
firewall blocks Nominatim — §7). I am specifying the *rule* and refusing to invent the *threshold*:

- **Primary test: distinct `qualified_name` (`display_name`).** Zero tuning. Two granularity-variants of
  one place usually share it; four Newports never do.
- **Secondary guard: coordinate proximity**, for the case where a postcode or similar makes two variants'
  `display_name` differ by a few characters.
- **Calibrate both against ADL-49's replay fixtures before shipping** — that mechanism exists precisely
  for this and is the right vehicle. Do not ship a hard-coded radius that nobody has checked against a
  real response.

**Effect:** Newport/GB/ENG → `ambiguous` → step 4c pending row → creator-private (GE-16 containment) →
**no map pin (GE-13)** → the user is asked to choose (GE-16). No wrong town, at any point, for any user.

### 3.3 D5 — the identity of a city created while the geocoder is unreachable

**It has none, and the design must not manufacture one.**

A row created offline carries no evidence about which Newport it is, because none was available. It is a
**claim about a name**, not a record of a place. Both previous designs treated "identity must be decided
before the geocoder answers" as an obstacle to engineer around; it is a fact to encode.

> **Identity is tiered by evidence, and the tier already exists in the schema as `geocode_status`.**

| Tier | States | What it is | Identity |
|---|---|---|---|
| **Place** | `resolved` | an authority named one specific place | `(name, country_code, region, qualified_name)` — **global, shareable** |
| **Claim** | `pending`, `unresolvable` | nobody has named a place | `(name, country_code, region, created_by_user_id)` — **creator-scoped** |

The current defect is that **one global index spans all three states**, which *forces* `findOrUpgradeCity`
step 1 to be creator-blind. The code says so itself (`cities.ts:120–128`): *"NOT creator-scoped: the
unique index is global, so pass 1 must be able to return another user's pending row … rather than
colliding with the index on insert."* That comment is a correct derivation from a wrong premise. Fix the
index and the creator-blind read is no longer required.

`geocode_status` already drives creator-scoped **visibility** (`cities.ts:60–64`). It simply needs to
drive **identity** as well. Nothing new is introduced — an existing distinction is applied where it was
missing.

### 3.4 D6/D7 — the index shape, and a defect I found in my own first proposal

```sql
CREATE UNIQUE INDEX uniq_cities_identity_resolved ON cities
  (name COLLATE NOCASE, country_code, COALESCE(region_id,0), COALESCE(qualified_name,''))
  WHERE geocode_status = 'resolved';

CREATE UNIQUE INDEX uniq_cities_identity_claim ON cities
  (name COLLATE NOCASE, country_code, COALESCE(region_id,0), created_by_user_id)
  WHERE geocode_status <> 'resolved' AND created_by_user_id IS NOT NULL;
```

`findOrUpgradeCity` step 1 becomes: match a **`resolved`** row globally, **or the caller's own**
non-resolved row. It never reads another user's claim.

**Verified in a real libSQL database**, driving the shipped insert shapes (verbatim):

```
B. CREATE uniq_cities_identity_resolved            : ACCEPTED
   CREATE uniq_cities_identity_claim               : ACCEPTED   (over existing data)
C. pendingB Newport/GB/1 by userB (was BLOCKED)    : ACCEPTED   <- BUG-75 cross-user merge gone
   pendingB again, same claim                      : REJECTED   <- BUG-33 guard intact
D. four distinct resolved Newports, same name/ctry/region : all 4 ACCEPTED
   the SAME Isle of Wight place again, by userB    : REJECTED   <- catalogue still deduplicates
E. userB's pending row resolving onto an OCCUPIED resolved identity : REJECTED
G. EXPLAIN QUERY PLAN: SEARCH cities USING INDEX uniq_cities_identity_claim
     (name=? AND country_code=? AND <expr>=? AND created_by_user_id=?)
```

#### D7 — the orphan defect, found by probing my own design

My first draft used `COALESCE(created_by_user_id, '')`, mirroring the `COALESCE(region_id, 0)` sentinel
already in the schema. **It is wrong, and the failure is severe.** `schema.ts` documents NULL creator as
permanent and load-bearing — `ON DELETE SET NULL` regenerates it on every user deletion. So two users
each holding an independent `Newport/GB/ENG` claim collapse onto one index entry the moment both are
deleted. Probed head-to-head, verbatim:

```
OPTION A — COALESCE(created_by_user_id,'')          [my first proposal]
  PRAGMA foreign_keys = 1
  DELETE userA (ON DELETE SET NULL fires)  : ACCEPTED
  DELETE userB (second SET NULL)           : REJECTED — UNIQUE constraint failed: index 'ix'
  users remaining: 1                       <- THE USER DELETION FAILED

OPTION B — WHERE … AND created_by_user_id IS NOT NULL
  DELETE userA : ACCEPTED
  DELETE userB : ACCEPTED
  users remaining: 0
  same-user duplicate still REJECTED; index still used by the step-1 lookup
```

**Option A would have made account deletion fail** — a data-integrity fault far worse than the defect
being fixed, arriving through a constraint nobody would look at. Option B is adopted. The reasoning is
also simply more honest: an orphaned claim has no owner, so there is no owner-scoped uniqueness to
enforce over it.

*(Incidental confirmation: `PRAGMA foreign_keys = 1` by default under `@libsql/client`, consistent with
CLAUDE.md's negative-findings incident 1.)*

### 3.5 "What happens when the lookup later arrives and says the row is a different place?"

Under D4 this largely **cannot** arise: a lookup that cannot tell which place it is now returns
`ambiguous` and leaves the row `pending`. `resolveCity` only writes `resolved` when the geocoder named
one place.

When it does resolve a claim, `resolveCity` must write `qualified_name` alongside lat/lng, and the row
**crosses from the claim index into the resolved index**. That crossing can collide — probe E above. Two
users independently claimed Newport offline and both turn out to mean Essex.

**Handling: leave the row `pending`, log it, report the pair. Do not auto-merge.** Merging means
repointing `trip_places` — a write against user data on a background thread, with no human present. This
is a genuine duplicate and a human should adjudicate. The detection is free: the index raises it.

**On the F3 objection ("an identity key must be immutable; this one is written twice").** It is written
**once per tier**. A claim's key is `(name, country, region, creator)` and never changes while it is a
claim. A place's key is `(name, country, region, qualified_name)` and is written at the moment the row
*becomes* a place. That is a state transition, not a recomputation of a stable key — and the collision on
transition is caught by the index, which is the correct place to catch it. This is structurally different
from S0, where the *same* key was recomputed by two actors minutes apart with no boundary between them.

### 3.6 D8 — the disambiguation channel does not exist, and this is the real scope

`AddPlaceFlow.tsx:327–335` collects the distinct `region_iso` values among candidates and populates the
**region selector**. Four Newports in GB-ENG yield one distinct `region_iso` → one option → the user is
offered a "choice" of one.

> **The entire D14 disambiguation flow is region-keyed, and therefore structurally cannot express this
> defect.** Making the backend say "ambiguous" is necessary and not sufficient: the frontend has no way to
> let the user resolve it, and `CreateCitySchema` has no field to send the resolution back.

Minimum viable channel:

1. `/api/geocode` already returns `display_name` per candidate (`geocode.ts:101`). The client presents
   candidates by qualified name instead of collapsing them to regions.
2. `POST /api/cities` accepts an optional `qualified_name`.
3. **The server re-runs the constrained lookup and verifies the string is among the candidates** before
   accepting it, then takes coordinates from *its own* candidate. This preserves GE-16's *"Coordinates are
   never client-supplied"* and prevents a client injecting an arbitrary place.
4. If verification fails (the candidate set shifted), **fall back to creating a pending row** — never 400
   a user for a correct action.

Cost: one extra Nominatim call per new ambiguous city, user-interactive, through the existing chokepoint.

---

## 4. Migration shape (expand/contract, ADL-47)

`cities` is referenced by `trip_places`. Nothing here changes `cities.id`, so no FK is disturbed.

| Stage | Change | Independently green? | Fixes |
|---|---|---|---|
| **S1** | **BUG-80a display** — pass through the region already joined; shared label formatter | Yes — **no schema, no dependency on anything below** | **BUG-80 as reported** |
| **S2** | **`classifyCandidates` counts distinct places** (+ ADL-49 fixture calibration) | Yes — **no schema** | **BUG-75's wrong-town half** |
| **S3** (expand) | Add `cities.qualified_name TEXT` + `CHECK (qualified_name IS NULL OR length(qualified_name) > 0)`; populate on both resolve paths. **No index change** | Yes — inert | — |
| **S4** | Disambiguation channel (D8): candidate list by qualified name, `POST` field, server-side verification | Yes | user can *choose* |
| **S5** (contract) | Swap `uniq_cities_name_country_region_ci` for the two partial indexes | Yes | cross-user merge; catalogue dedup |

**S1 and S2 are the whole user-visible fix for the reported defects, and neither touches the schema.**
That ordering is the point of this document.

**S5 is a no-op over shipped data and requires no backfill.** Both new indexes are **strictly more
permissive** than the one they replace: the claim index adds a column and drops orphans; the resolved
index adds a column. No existing row can violate either — the same argument `schema.ts` makes for the D13
key today, and probe B created both over pre-existing rows successfully.

Two implementation notes:

1. **Adding a CHECK forces a SQLite table rebuild** (`__new_cities` / copy / rename — see
   `0011_majestic_nehzno.sql`). drizzle-kit is patched for four bugs in exactly this area (ADL-15); the
   CHECK-constraint regex is one of them. Run `npm run db:generate`, **read the generated SQL**, never
   `db:push`. Migration `0015` already hand-writes this table's partial and expression indexes for the
   same reason — follow that precedent.
2. **New duplicate class to detect, not to prevent.** Splitting one index into two per-status indexes lets
   a `resolved` row and a `claim` row share a natural key — they are in different indexes. Ask the brief
   for a report (not an auto-merge) over `(name NOCASE, country_code, COALESCE(region_id,0))` groups
   holding rows in both tiers. This is the previous review's R5 "twin pair" in a new guise; it is cheap to
   surface and wrong to resolve automatically.

---

## 5. BUG-80's display fix, and its scope

**BUG-80 is two defects and the reported one is much smaller than the brief implies.**

### 5a — the PO's actual report (GB-SCT vs GB-WLS). No schema change. Ship it first.

The region is **already joined and then thrown away at the route boundary**:

- `src/backend/repositories/trips.ts:341–353` LEFT JOINs `regions` and selects `iso3166_2` — but never
  `regions.name`.
- `src/backend/routes/trips.ts:235–244` drops **both** from the serialized city.

So: add `regions.name` to the repository select, pass both fields through the serializer. Two other
payloads need the join genuinely added — `placeRepository.findByTrip` (`repositories/places.ts:77–78`)
and `POST /api/trips/:tripId/places` (`routes/places.ts:77`).

**The full surface audit — a fix landing only where the PO looked reproduces the bug five more times:**

| Surface | File:line | Renders today |
|---|---|---|
| Place header | `PlaceSection.tsx:149` | name only |
| Place subtitle | `PlaceSection.tsx:154` | country name |
| Date modal title | `PlaceDateForm.tsx:97` | name only |
| Remove dialog | `PlaceSection.tsx:310,313,315` | name only |
| Review panel | `ReviewPanel.tsx:115` | name + country **code** |
| Trip card chips | `TripCard.tsx:125` | name only |
| Desktop filter chip | `DesktopTripsLayout.tsx:103,343` | name only |
| Mobile filter chip | `MobileTripsLayout.tsx:109,375` | name only |
| Map pin label | `CityMarkers.tsx:70,84` | name only |
| City items page | `CityItemsPage.tsx:106,109` | name + country (via router state) |
| Add-place search row | `AddPlaceFlow.tsx:452–453` | name + region + country ✅ |

`TripCard.tsx` and `CityItemsPage.tsx` are **not in the brief's list** and both reproduce the defect —
`CityItemsPage` inherits its label from `PlaceSection.tsx:146`'s router state, so fixing PlaceSection
without deciding what goes into `state` leaves it stale.

**Four traps a brief must carry:**

1. **`formatCitySubtitle` returns `country_code`.** `PlaceSection.tsx:154` currently renders
   `country_name`. Lifting it verbatim **regresses "United Kingdom" → "GB"**. It needs a code/name
   variant. It is also module-private in `AddPlaceFlow.tsx:29–51` and must be extracted to a shared module.
2. **It requires `Country[]`** (for `region_tier_enabled` / `region_tier_label`), which no saved-place
   surface loads today.
3. **`api.ts:139–147`'s null-vs-undefined contract.** `null` = "joined, no region"; `undefined` = "never
   joined". Adding `region_name` to *some* payloads keeps the trap alive exactly where the type warns it
   must not be. **Fix all five city-shaped payloads together, or none.** Note the existing asymmetry: the
   trip *summary* carries `region_iso` but not `country_name`; the trip *detail* carries `country_name`
   but not `region_iso`; neither carries `region_name`.
4. **`src/e2e/trips-mobile.spec.ts:236–248` uses `exact: true`** on the city text, and
   `PlaceSection.tsx:204–206` documents a deliberate choice to keep the city name *out* of the aria-label.
   **Recommendation: keep the heading as the bare label and put all qualification in the subtitle.** That
   satisfies BUG-80, preserves both constraints, and keeps the map pin and chips readable.

### 5b — the four GB-ENG Newports

All four render "Newport, England, United Kingdom" even after 5a. Distinguishing them needs
`qualified_name` (S3) — and it only *arises* once those rows can exist distinctly, which is S2/S5.
**5b is downstream of BUG-75, not parallel to it.** It should not be briefed with 5a.

---

## 6. Interaction with BUG-76 — what happens when we discard everything

**Not fixing BUG-76 here.** But the brief asks what this design does when the geocoder answers and our
filter discards everything, and the answer exposes an independent hardening this design needs.

`SETTLEMENT_TYPES` (`nominatim-client.ts:81`, applied `:166`) filters before anything downstream runs.
Zero survivors → `classifyCandidates` → `unresolved` → **`geocode_status='unresolvable'`**, which D10
defines as **terminal and never retried** (`geocoding.service.ts:276–285`, `processQueue`'s `pending`-only
selector at `:353`).

> **A filter bug therefore becomes a permanent terminal state.** If Denver's place node ranks below its
> administrative boundary and our filter drops it, the row is marked `unresolvable` forever — and stays
> that way after the filter is fixed, because nothing ever re-queries it.

That is the BUG-76 hypothesis's worst consequence and it is *created by our own code*, not by Nominatim.

> **D11 — required regardless of how BUG-76 is fixed: a terminal `unresolvable` verdict must never be
> reachable from a candidate set that our own filtering emptied.** "The geocoder answered: no match" and
> "the geocoder answered and we discarded every answer" are different facts, and D10's terminal state is
> only justified for the first.

The mechanism is already there: `nominatimSearch` computes the pre-filter count for BUG-79's `truncated`
(`nominatim-client.ts:160–161`). Expose "raw non-empty, filtered empty" and treat it as **recoverable**,
not terminal.

**And the design does not assume a rich candidate set arrives.** If nothing usable comes back, the row is
a *claim* — creator-scoped, `pending`, immediately usable, no pin. That is GE-12 and GE-13 exactly, and it
is the same path as the geocoder being offline. The design's behaviour degrades to "honest ignorance"
rather than to "confident guess", which is the property the current code lacks.

---

## 7. Verified vs unverified

### Verified, and how

- **`classifyCandidates` returns `ok` for four distinct same-region Newports** — by **executing the
  shipped function** in a Vitest probe (removed before commit), both with and without a requested region,
  with a passing cross-region control. Not read, run.
- **Every index behaviour in §3.4** — built in a real file-backed libSQL database, driving the insert and
  update shapes taken from `cities.ts`/`geocoding.service.ts`, including the pending→resolved transition
  collision and the `EXPLAIN QUERY PLAN` check.
- **The orphan defect in §3.4 (D7)** — head-to-head probe of both index forms against a real
  `ON DELETE SET NULL` cascade with FK enforcement on. Option A's user-deletion failure is observed
  output, not reasoning.
- **The route trace in §3.1** — read `cities.ts:262–399` and `geocoding.service.ts` end to end.
- **Both naming behaviours entered in `815b650`** — `git log -S "canonicalName"` on `cities.ts` and
  `git log -S "display_name"` on `nominatim-client.ts`, each returning that commit alone.
- **No architect document decides city-name canonicalisation** — two independent probes that fail
  differently: (a) `grep -rl` for `display_name|displayName` across `jobs/architect/tech/`, then (b)
  reading every hit's surrounding context. All are `map_shading_config` (ER-schema §143–158, ADL log :550),
  `users` (ADL log :389), or ADL-49's replay-fixture *capture* list (:764, :803) — which records what a
  fixture must contain, not what a city is named. This independently reproduces the brief's claim.
- **The BUG-80 surface audit in §5** — enumerated across `src/frontend`, with `TripCard.tsx` and
  `CityItemsPage.tsx` found beyond the brief's list.
- **`formatCitySubtitle` has exactly one call site** — `AddPlaceFlow.tsx:453`, definition at `:29–51`.

### Unverified, with the probe run and its blind spot

1. **Nominatim's live response shape and density — UNVERIFIED, and it is load-bearing for §3.2's
   threshold.** *Probes run:* (a) `curl` to `nominatim.openstreetmap.org/search` → connection failure
   (exit 7, HTTP 000); (b) read `.devcontainer/init-firewall.sh:140–151` — the allowlist is npm,
   Anthropic, Sentry, Statsig, three VS Code hosts, Clerk, two Turso hosts, Railway. Nominatim is absent.
   *Blind spot:* this is the **devcontainer's** reachability, not staging's or CI's — the PO reached the
   service from staging on 2026-08-03. *What is affected:* I can specify the ambiguity **rule** but not
   calibrate the "distinct place" **predicate**. *Probe to close:* ADL-49's replay fixtures over ~50 real
   ambiguous names, run where the host is reachable.
2. **`display_name` volatility over time — UNVERIFIED.** *Probe run:* read the parse and the request
   construction; reasoned about failure direction. *Blind spot:* I have no observation of how often OSM
   edits change a settlement's `display_name`. *Why I proceed anyway:* every failure in **both**
   directions is a benign duplicate, never a wrong town (§8, Attack 2). *Probe to close:* sample the same
   50 names across two dates.
3. **`Accept-Language` is not sent** (`nominatim-client.ts:145–148` sets only `User-Agent`), so
   `qualified_name` will carry Nominatim's default — likely local-language forms ("Köln, …, Deutschland").
   *Blind spot:* I have not observed this. It affects display quality, not correctness, and pinning
   `Accept-Language` is a one-line follow-on the brief should mention.
4. **No timing, memory or scale measurement was taken.** Nothing here is a performance claim, including
   the extra lookup in D8.

### Disproved — my own conclusions, killed before filing

1. **"Creator-scoping the index fixes BUG-75."** This was my first answer and it is **wrong**. It leaves
   `classifyCandidates` intact, so the *first* user is still mis-pinned and the resulting `resolved` row
   is still globally shared. Chasing it is what led me to run the classifier, which produced §3.1.
2. **"`COALESCE(created_by_user_id, '')`, mirroring the existing `COALESCE(region_id, 0)` sentinel."**
   Probed and killed — **it makes account deletion fail** (§3.4). I would have shipped it on the strength
   of the analogy to the existing schema pattern.
3. **"BUG-80 needs `qualified_name`."** Half of it does not. The PO's reported case is a dropped join
   (§5a), which decouples the whole display fix from the identity work and makes it shippable now.
4. **"Store `display_name` as `cities.name` — it is what the PO's question implies."** Rejected: it breaks
   six render surfaces that use `cities.name` as a bare label, and makes the label locale-volatile and
   upstream-controlled. The label/qualifier split is what the PO's objection actually calls for.
5. **"`resolveCity` must never write an identity column, to preserve immutability."** Tempting, and it
   would have satisfied F3 cleanly. Rejected: it makes it impossible for a claim to ever *become* a
   distinguishable place, so the pending→resolved path could never produce a usable row. The tiered
   framing (§3.5) is what makes the second write legitimate rather than a violation.

---

## 8. My two weakest points, named for the OP-27 reviewer

Start here rather than spending the review budget locating them.

### Attack 1 (start here) — the "distinct place" predicate is the load-bearing piece and I could not calibrate it

Everything in §3.2 rests on being able to separate *"one place at two administrative granularities"* from
*"two different places"*. I have argued the two cases are far apart, and the four-Newport measurement
supports it — but that is **one name, chosen because it is the defect's own example.** The general case is
unmeasured, because this container cannot reach Nominatim (§7 item 1).

The failure mode if I am wrong: adjacent villages a few hundred metres apart get flagged ambiguous, or
granularity-variants with differing postcodes do, and **every city creation starts asking the user an
unnecessary question.** That is a bad product outcome, and it is precisely the outcome
`geocoding.service.ts:97–102`'s existing comment warns about — the objection I claim to have survived.

**How to attack it:** pull real Nominatim responses for 30–50 same-name and single-name cities (ADL-49's
fixture path) and measure, for each, the distinct-`display_name` count and the pairwise coordinate spread.
If single-place names routinely produce more than one distinct `display_name`, my primary test is wrong
and the design needs the coordinate guard promoted to primary — with a threshold somebody has actually
measured. **I would want that run before S2 is briefed**, not after.

### Attack 2 — `qualified_name` is a weak key and I am putting it in a unique index anyway

`display_name` is a string a third party controls, is not stable across OSM edits, and is not
locale-pinned (§7 item 3). I am proposing it as half the identity of every `resolved` row.

My defence is that **every failure is benign and none is a wrong town**: if the string drifts, a new
lookup mints a second row for the same place — a duplicate, detectable, repairable. If two genuinely
different places ever share an identical administrative chain, no name-based scheme can help and the
product should treat them as one.

But that defence is an argument, not a measurement, and it has a real cost I am not pricing: **the
resolved catalogue accumulates twins at a rate I have not measured**, and the previous review's R5 finding
(twin pairs are invisible and nothing reconciles them) applies to my design too. I have asked for a
detection report (§4 note 2) rather than solving it.

**How to attack it:** sample `display_name` for the same 50 places across two dates and compute the drift
rate. If it is materially above the ~0.5%/2-month figure the gazetteer work measured for a content key,
the resolved index should key on something else — and the honest fallback is `osm_type` + `osm_id`, which
Nominatim returns, which nothing in this codebase captures, and which is stable but not renderable. That
would mean carrying **both** (`osm_ref` for identity, `qualified_name` for display) — more columns than I
have proposed, and I would rather a reviewer force that than assume it.

### Attack 3 (lesser) — D8's verification round-trip

The re-run lookup in §3.6 doubles the Nominatim calls for an ambiguous creation against a 1 req/s
application-wide budget, on a user-interactive path. I have taken no latency measurement (§7 item 4). The
alternative — trusting the client's `qualified_name` and taking coordinates from it — violates GE-16
outright, so I am confident in the *direction*; the *cost* is unpriced. This is the least load-bearing
decision here and can be changed without touching §2–§5.

---

*No schema change was made, no migration generated, no code changed, no remote database written to, no
scanner suppression added. The BRD, `_project/tracker.json`, ADL-48/ADL-49 and the prior design and review
documents were not edited — every recommendation is filed here for COO adjudication. Probe scripts and the
throwaway Vitest probe were written outside the repository or removed, and are not committed.*

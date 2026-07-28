# ADL-46 — Per-user access model: resource tier × role, city creation, and external egress policy

**Date:** 2026-07-28
**Status:** Decided — **spec only, no implementation.** Backend + Database briefs specified (§9).
**Author:** Architect
**Tracker:** BUG-63 (P1), BUG-55, BRD-AD09, D-12 item 1, QUAL-19
**GitHub:** #326, **plus a PO direction delivered mid-task that supersedes parts of it** (§0).
**Supersedes in part:** ADL-27 (routes list), ADL-28 (Question 5), OP-06 §2 access matrix
**Extends:** ADL-38 (read/write split), ADL-28 (per-user pattern — reused, not redesigned)
**Consistent with:** ADL-43 (sourced reference data; ODbL obligation — see §5.6)

---

## 0. What changed mid-task, and what it changed

Issue #326 asked six questions. A PO direction arrived after dispatch and **decided two of them
outright, overturning the answer I had reached on one.** Recorded here because the reasoning
trail matters to the OP-27 reviewer:

| # | Issue #326 asked | PO direction | Effect |
|---|---|---|---|
| Q2 | Should a non-owner CREATE categories/activities? | **Decided: they become per-user**, lazy-seeded from the global defaults so a new user is never blank. Countries stay owner-only. | **Reverses my draft D3.** I had recommended keeping creation owner-only and *deferring* per-user entries. The PO's answer is better and I withdraw mine — §3.4 |
| Q3 | Should a non-owner create cities, and how? | **Direction, explicitly "spitballing":** city creation splits out of SE-03; auto-create goes global but validated — "cased normalised matching, lookup against a service or something" | Design retained as mine to make. §4 |
| Q3+Q5 | — | **Converge.** A backend geocoding proxy is simultaneously the BUG-55 CSP fix and the validation authority for city creation | Adopted, §4.3. I agree they converge and would not now separate them |
| Q4 | SE-01/SE-03 model? | **Framing given:** "originally we had everything managed by a system admin (owner), now some of that has moved to each user" | §5 |

Q1 and Q6 were untouched and are answered as originally briefed.

**The one place I push back:** a premise in the direction is factually wrong in a way that
*reduces* the work, and I have corrected rather than inherited it — see §10.1. The geocode retry
path is **not** browser-driven.

---

## Summary table

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D1 | What determines access | **Resource *tier* × operation, not role alone.** Global reference data / per-user data / instance administration. Unstated tier defaults to owner-only | **High** |
| D2 | Non-owner READ of active categories/activities | **Open (`requireAuth`) as Phase 1 — explicitly temporary scaffolding that Phase 3 deletes.** Unblocks the P1 without a migration | **High** |
| D3 | Categories/activities ownership model | **Per-user, `userId NOT NULL` FK, lazy-seeded from the global defaults on first access.** Reuses ADL-28's companions pattern verbatim; routes leave `/api/admin/*` entirely | **High** *(PO-decided; I concur — §3.4)* |
| D4 | Non-owner city creation | **Split curation from creation.** Owner curates the catalogue; any authenticated user creates on demand via a constrained, service-validated find-or-create | **High** |
| D5 | How city creation is validated | **Resolve-then-create.** The backend resolves against the geocoder and builds the row from the *canonical response*; unresolvable input still creates (GE-12) but stays creator-private until it resolves | **Medium** |
| D6 | SE-01 / SE-03 replacement text | **Rewrite both** around the per-user model; SE-03 enumerates what genuinely stays owner-only | **High** |
| D7 | BUG-55 — proxy or CSP allowlist | **Backend proxy route.** `User-Agent` is a forbidden header in browser `fetch()`, so the direct call can never be policy-compliant; a compliant client already exists server-side | **High** |
| D8 | General CSP posture | **Closed, per-entry-justified register; proxy or disable by default.** Third-party SDK egress in scope for QUAL-19 | **Medium-High** |
| D9 | Sequencing | **Four phases.** Phase 1 clears the P1 with no schema change; the per-user migration lands third | **Medium-High** |

**Where to aim, for the OP-27 reviewer:** **D5** (§4.4 — the creator-private containment rule is my
interpretation of "auto create goes global but do some validation", and a different reading is
defensible) and **D9** (§9.1 — Phase 1 deliberately opens city creation before its validation
authority exists). Full register in §13.

---

## 1. The finding that reframes the bundle

BUG-63 is not a forgotten gate. It is **two BRD requirements contradicting each other**, with the
code faithfully implementing one of them.

- **SE-03** (`_project/travel-tracker-BRD.md:268`) names "city creation" an owner-only admin
  operation, alongside category and activity management.
- **AD-09** (`:258`) says categories and activities are global defaults and "**Any user can add
  custom entries**."

Both cannot be true of the same routes. The backend implements SE-03 — correctly and deliberately,
with the reasoning written down in ADL-27 and at `src/backend/routes/cities.ts:69-86`. AD-09's
second sentence was never built.

**That AD-09 clause was never implemented — two independent probes that could fail differently:**

1. **Structural code read.** The only create/rename/deactivate handlers for `trip_categories` and
   `activities` come from `createAdminListRouter` (`src/backend/routes/admin.ts:133-227`), whose
   mounts (`admin.ts:232-233`) sit *below* `adminRouter.use(requireOwner)` (`admin.ts:105`).
2. **Table-symbol grep across the whole backend**, independent of router naming — the assumption
   that produced this project's earlier false "no `router.delete` in `trips.ts`" claim:
   `grep -rn "tripCategories\|activities" src/backend --include="*.ts"` finds writes in exactly two
   places — the owner-gated factory, and `src/backend/db/seed.ts:44,50` (startup seeding, not a
   route).

The probes fail differently: probe 1 misses a handler on a differently-named router; probe 2 misses
a write that never names the table symbol. Neither found a non-owner creation path. **Corroborated
independently** by ADL-28 Question 5, which records the same thing from the other direction: "AD-09
says any user can add custom entries — this is a future behaviour change to the POST handler."

### 1.1 SE-03 was already stale before BUG-63

SE-03 enumerates five owner-only operations. **Two had already moved to per-user `requireAuth` in
shipped code without SE-03 being updated** — the exact drift the PO describes as "some of that has
moved to each user":

| SE-03 clause | Shipped reality | Moved by |
|---|---|---|
| category management | owner-only | *(D3 moves it — this ADL)* |
| activity management | owner-only | *(D3 moves it — this ADL)* |
| companion management | **per-user, `requireAuth`** (`routes/companions.ts`) | AD-08 / ADL-28 |
| map shading config | **per-user, `requireAuth`** | AD-07 / ADL-28 |
| city creation | owner-only (`cities.ts:91`) | *(D4 splits it — this ADL)* |

After this ADL, **SE-03 retains none of its original five clauses** — which is the clearest possible
statement that the requirement was never maintained, not that it was wrong once.

### 1.2 ADL-38 named this exact resource and stopped one step short

ADL-38 (2026-07-22) fixed the identical bug on countries/regions, and its own rationale says
countries/regions are

> "the same data tier as **AD-09's categories/activities**, seeded by `seedCountries()`/`seedRegions()`
> at startup, not owner-configured per-user data."

It named categories/activities in writing and did not extend the split. BUG-63 is the consequence,
six days later. **This is why D1 — a rule that classifies *future* routes — matters more than the
gates it happens to fix.** BUG-61, BUG-62 and BUG-63 are one root cause with three tracker IDs;
without the rule there will be a fourth.

---

## 2. D1 — Access is determined by resource tier × operation

**Decision.** Every API resource belongs to exactly one tier. Tier plus operation determines the
gate. Role alone does not.

**End state** (after all four phases of §9):

| Tier | Contents | Read | Write |
|---|---|---|---|
| **1. Global reference data** | countries, regions, **cities** | `requireAuth` | `requireOwner`, **except** an explicitly specified constrained path (D4/D5: city create-on-demand) |
| **2. Per-user data** | trips, places, items, companions, shading config, **trip categories, activities** | `requireAuth` + `userId` scoping | `requireAuth` + `userId` scoping |
| **3. Instance administration** | country region-tier config, region CRUD, **curation of the global city catalogue** (edit, deactivate) | `requireOwner` | `requireOwner` |

**Reasoning.**

- SE-01's three-role framing asks "who is the caller?" and has nowhere to put the answer "it depends
  what they're touching." Every one of BUG-61/62/63 is a resource filed under the wrong mental tier —
  global or per-user data treated as instance administration because it lived behind an `/api/admin`
  URL prefix.
- **URL prefix is not a tier.** `/api/admin/countries` is tier 1; `PATCH /api/cities/:id` is tier 3.
  Any rule keyed on path shape keeps producing these bugs.
- The rule is checkable at review time by an engineer with no access-model context: name the tier in
  the route comment, apply the tier's gate. That is a much lower bar than "reason about the role
  model," which is what has been failing.
- **Default is tier 3.** A route whose tier is unstated is owner-only, preserving ADL-38's
  fail-closed invariant rather than replacing it.
- The PO's direction sharpens this: categories and activities are **tier 2**, not tier 1. The
  migration in D3 is what moves them, and it is what makes the *routes* correct — a tier-2 resource
  served from an owner-gated admin router is a category error, which is precisely what BUG-63 is.

**Note the tier boundary that actually bites:** tier-1 write is not uniformly owner-only. Cities have
a legitimate non-owner constrained write (D4); countries and regions do not. The discriminator is
§4.2.

---

## 3. Categories and activities

### 3.1 D2 — Phase 1: open the reads. Temporary scaffolding. Confidence: High.

**Decision.** `GET /api/admin/categories/active` and `GET /api/admin/activities/active` move above
the `requireOwner` guard (`requireAuth` only), using ADL-38's mechanism unchanged.

**This is explicitly temporary.** Phase 3 (D3) moves these resources out of `/api/admin/*` entirely,
at which point **the carve-out is deleted, not kept.** It exists solely so the P1 clears without
waiting on a schema migration.

**Reasoning.**

- These feed `TripForm.tsx:60,62` via `useActiveCategories`/`useActiveActivities`
  (`src/frontend/hooks/useAdmin.ts:31,85`). Without them a non-owner cannot complete trip creation
  or place addition. That is the P1.
- Until the migration lands they *are* global seeded reference data — the same tier ADL-38 already
  opened. Reusing that mechanism costs one entry in an existing labelled exception block; inventing a
  second mechanism for the sibling resource would be strictly worse.
- **Not opened:** `GET /api/admin/categories` / `/activities` (unfiltered, including inactive). Those
  are an administrative view of lifecycle state, and no non-owner surface needs them. Only `/active`
  moves, keeping the above-guard block enumerable at four routes.

**Implementation shape — specified so Backend does not guess.** The `/active` handlers are generated
inside `createAdminListRouter`, mounted below the guard; they cannot simply be "moved."

1. Add a minimal second factory (e.g. `createAdminListReadRouter(table)`) exposing **only** `GET /active`.
2. Mount both instances **above** `adminRouter.use(requireOwner)` at `/categories` and `/activities`.
3. Leave the full-CRUD mounts (`admin.ts:232-233`) exactly where they are, below the guard.
4. Extend the FAIL-CLOSED comment block (`admin.ts:36-58`) to name the two new entries, cite ADL-46,
   **and state that they are removed in Phase 3** so nobody later mistakes scaffolding for design.

Express continues down the parent stack when a mounted sub-router matches no route, so `GET /categories`
and every write still fall through to the guarded router. §8 asserts this rather than assuming it.

### 3.2 D3 — Phase 3: per-user, lazy-seeded. Confidence: High.

**Decision (PO-decided; I concur).** `trip_categories` and `activities` become per-user, following
**ADL-28's companions pattern verbatim**: a `userId NOT NULL` FK with `onDelete: 'cascade'`, the
global `UNIQUE(name)` replaced by `UNIQUE(user_id, name)`, existing rows migrated to the owner via
the CROSS JOIN pattern, and a lazy seed from the global defaults on first access so a new user is
never blank.

**Shape chosen, and the alternative rejected.** Two models were available:

- **Option A (adopted) — per-user rows, lazy-seeded.** Every user gets their own copy of the seed
  list on first access.
- **Option B (rejected) — nullable `user_id`; NULL = shared global default, non-NULL = custom; reads
  return `WHERE user_id IS NULL OR user_id = ?`.**

Option B looks cheaper and is a trap:

1. **It cannot express AD-03 or AD-06 per-user.** A user cannot rename or deactivate a *global*
   default for themselves without a second override table — the messy path. Option A makes "deactivate
   'Ski Trip' because I never ski" work for free, which is what a per-user list is *for*.
2. **Its uniqueness constraint is broken by SQLite semantics.** NULLs are distinct in a SQLite unique
   index, so `(NULL,'Beach')` does not conflict with `(user1,'Beach')` — a user can silently duplicate
   a global default in their own picker.
3. **It diverges from the established pattern** for no benefit. AD-07 and AD-08 both chose Option A's
   shape; the PO named that consistency as the point.

Option A's cost is row duplication (N users × ~10 rows) and seed-list changes not propagating to
existing users. Both are irrelevant at this scale and both are already accepted for shading config.

**Lazy-seed precedent already exists:** AD-07's success criteria require shading config "seeded with
defaults on first access, no manual setup required." Reuse that mechanism and read the defaults from
the same constants `src/backend/db/seed.ts:44,50` uses, so there remains one source for the list.

**Routes move out of `/api/admin/*`.** Exactly as ADL-28 moved companions to `/api/companions`
(`requireAuth`, userId-scoped), categories and activities move to `/api/categories` and
`/api/activities`. This is not cosmetic — leaving a tier-2 resource on an owner-gated admin router
is the structural error behind BUG-63, and re-fixing the gate while leaving the resource in the wrong
place invites the next recurrence.

### 3.3 D3 — the complication ADL-28 had to solve, and so does this

`trip_categories_map` (`schema.ts:273-285`) FKs `category_id → trip_categories.id`, and
`trip_activities_map` does the same for activities at both trip and place level (TR-04). Once
categories are per-user, **a trip may reference a category belonging to a different user.**

ADL-28 hit this exactly and solved it: `tripRepository.replaceAssociations` gained a `userId`
parameter and validates companion ownership before inserting, rejecting cross-user IDs with a 400
(AD-08's stated success criteria). **The same validation must be added for `category_id` and
`activity_id`.** This is prior art to reuse, not a new design.

**How much existing data is affected — a strong inference that must still be checked against real
data before the migration runs.** Because `GET /api/admin/categories/active` has 403'd for
non-owners since the routes were written (§1, two probes), a non-owner's category picker has always
rendered empty, so a non-owner should have no category or activity assignments at all — making the
CROSS JOIN-to-owner backfill nearly a no-op outside the owner's own trips.

**I am not asserting that as fact, and the Database brief must not either.** It is an inference from
the UI path, and it has one real blind spot: `POST`/`PATCH /api/trips` accepts `category_ids` and
`activity_ids` directly and is gated only by `requireAuth`, so a non-owner *could* have assigned them
by calling the API outside the UI. **Required before migrating:** query staging for
`trip_categories_map`/`trip_activities_map` rows joined to trips whose `user_id` is not the owner. If
any exist, they need an explicit disposition (most likely: seed that user's own copy and re-point the
mapping) rather than being silently re-pointed at the owner's rows. Verifiable via
`scripts/agent-diagnostics/turso-query.mjs`, which reaches staging.

### 3.4 D3 — I withdraw my draft position, and why the PO's is better

My pre-direction draft kept creation owner-only and deferred per-user entries. My reasoning was that
AD-09's literal text ("any user can add custom entries" to *global* rows) would let any user write
irreversibly into every other user's pickers. **That objection was correct about AD-09's literal text
and is entirely dissolved by the per-user model** — a custom entry never appears in anyone else's
list, so the shared-namespace problem does not arise. The PO's answer keeps the capability AD-09
always intended and removes the defect I was reacting to. It is strictly better and I withdraw mine.

What survives from my draft is only the **cost warning**, and it is why this is Phase 3 and not
Phase 1: both `name` columns carry a global `UNIQUE` that must become composite, which in SQLite is
a table rebuild — and this project's `drizzle-kit` has four patched bugs specifically around table
recreation (ADL-15, `patches/drizzle-kit+0.31.9.patch`). The migration is real work with a known
sharp edge. It must not be attached to a P1 outage fix.

### 3.5 An ambiguity in the direction I will not resolve silently

The direction says what remains owner-only is "countries, the curated global city catalogue, **and
deactivation**." Deactivation *of what* is genuinely ambiguous once lists are per-user.

**My interpretation, which the amended AD-09 in §6.3 is written to:** a user deactivates entries in
their **own** list (otherwise they cannot manage it at all, and AD-03 — "add, edit, rename, or
deactivate items in any structured list" — becomes unsatisfiable for a non-owner). The owner's
retained deactivation authority is over **global** reference data: countries, regions, and the global
city catalogue. AD-09's old clause "deactivated by the app owner" was written for a global list and
becomes vestigial under a per-user model.

**If the PO meant the owner retains deactivation over users' personal lists, §6.3's text is wrong and
must be changed before the Backend brief goes out.** Flagging rather than guessing: this is a
one-line confirmation, and getting it wrong silently would ship the wrong access rule.

---

## 4. Cities — D4 and D5

### 4.1 D4 — Split curation from creation. Confidence: High.

**Decision.** Two operations are currently conflated behind one `requireOwner` and must be separated:

| Operation | Who | Route |
|---|---|---|
| **Curate the global catalogue** — correct a name, re-point a region, deactivate a bad row | Owner | `PATCH /api/cities/:id` — unchanged, stays `requireOwner` |
| **Add a place to my trip, which may need a city row that does not exist** | Any authenticated user | `POST /api/cities` — `requireAuth`, constrained (D5) |

This is exactly the PO's framing and I have no amendment to it. It also explains why the original
gate was not *wrong* so much as **under-specified**: SE-03 bundled a curation verb and a
create-on-demand verb under one word, "creation."

### 4.2 Why cities differ from countries/regions (the tier-1-write discriminator)

All three are tier 1 and I open a write on only one. The discriminator:

- **A city is a fact about the world with an external truth condition** — a geocoder either resolves
  it or does not — and a natural uniqueness key the DB already enforces. Two users independently
  adding "Denver, US" *converge on one row*, by construction.
- **A country list is a closed, curated set.** There is no create-on-demand case: every country
  already exists, seeded. The PO said countries stay owner-only for exactly this reason.
- **A city is unavoidable.** A non-owner travelling somewhere not yet in the table has *no path
  forward* — the place FK requires a city row. There is no fallback. That is the P1.

### 4.3 D5 — Resolve-then-create. Confidence: Medium.

**Decision.** `POST /api/cities` becomes **resolve-then-create**: the backend resolves the submitted
name against the geocoding service and builds the row from the **service's canonical response**
where one is available, falling back to the user's text when it is not.

```
POST /api/cities  { name, country_code, region_id? }   [requireAuth]
  1. validate country exists; validate region belongs to country     (unchanged)
  2. find-or-create pass 1 — existing (name COLLATE NOCASE, country) → return 200  (unchanged)
  3. resolve against the geocoder (server-side, the D7 proxy's internal client)
     ├─ resolved → canonical name + lat/long (+ region ISO where available)
     │    4a. find-or-create pass 2 against the CANONICAL name → 200 if it now matches
     │    4b. else INSERT { name: canonical, lat, long, geocode_status:'resolved' } → 201
     └─ unresolved / offline / disabled (GE-12)
          4c. INSERT { name: user text, geocode_status:'pending', no coords } → 201
              — creator-private until it resolves (§4.4)
```

**Reasoning.**

- **This is what "cased normalised matching, lookup against a service" actually buys.** Case-folding
  alone (today's `COLLATE NOCASE` + `uniq_cities_name_country_ci`) converges `"denver"`/`"Denver"`.
  It does **not** converge `"Denverr"`, `"denver co"`, or `"DEN"`. Resolving first and matching on
  the canonical name converges all of them onto one row. The second find-or-create pass (4a) is the
  part that does the real work and is easy to omit by accident — it is called out for that reason.
- **It reuses machinery that already exists**, per the direction. `geocodeStatus`
  (`schema.ts:106`, `CHECK IN ('pending','resolved')`), nullable `latitude`/`longitude`,
  `geocodeAttemptedAt`, the partial index `idx_cities_geocode` on pending rows, the BUG-33
  find-or-create, and `uniq_cities_name_country_ci` are all already there. The only genuinely new
  thing is *ordering the resolve before the insert* instead of firing it after.
- **It does not regress GE-12.** Offline, geocoder-down, no-result, and `GEOCODING_ENABLED=false`
  (CI) all fall to 4c, which is exactly today's behaviour. City creation never depends on a third
  party being reachable. I rejected geocode-*gated* creation for precisely this reason.
- **It fixes a latent inconsistency.** Today the geocode fires *after* insert
  (`cities.ts:160-170`), so the row is always created from user text even when the service could have
  given a canonical one. Resolve-then-create is strictly better data for the same number of calls.

### 4.4 D5's containment rule — my interpretation of "goes global but validated"

**Decision.** A city row is **globally visible once `geocode_status = 'resolved'`**. While `'pending'`
it is visible only in its creator's own searches. Requires one new column,
`cities.createdByUserId` (nullable FK → `users.id`, `ON DELETE SET NULL`), and one clause in the
`GET /api/cities` search: `WHERE geocode_status = 'resolved' OR created_by_user_id = :me`.

**Reasoning.**

- It is a literal reading of the direction: *auto-create goes global, but validated* — validation is
  the **gate to global**, not a blocker on creation. The user's own flow is never interrupted; they
  always see and can use the city they just made.
- **Promotion is already automatic and already server-side.** `processQueue` re-runs geocoding every
  15 minutes (`geocoding.service.ts:149`, invoked from `server.ts:47`), so a legitimate city created
  offline resolves and goes global by itself. **A junk name like `"asdf"` never resolves, so it never
  goes global.** The containment is self-maintaining and needs no moderation queue, no owner
  intervention, and no new background job.
- It replaces the owner-moderation designs I would otherwise have had to consider — all of which
  convert a 403 into an indefinite wait on an asynchronous human, which for a two-person app is a
  worse failure than the bug being fixed.

**The `.notNull()` question, answered explicitly because the security checklist requires it.**
CLAUDE.md mandates `.notNull()` on new user-referencing FKs in **user-data** tables. `cities` is
global reference data, not user data, and pre-existing seeded rows have no creator. `createdByUserId`
is therefore **deliberately nullable**, where NULL means "seeded, or created before this column
existed." `ON DELETE SET NULL` (not cascade) is equally deliberate: deleting a user must never delete
shared city rows their trips and other users' trips depend on. Both choices are exceptions to the
default and are stated here so the Backend reviewer confirms them rather than flags them.

**This is the decision I hold most weakly.** A defensible alternative is: everything global
immediately, accept the junk, let the owner curate via `PATCH`. That is simpler, needs no column and
no query change, and at two users the junk volume is near zero. I prefer containment because it is
cheap, self-maintaining, and makes the *global* namespace trustworthy by construction — but a
reviewer who reads the direction as "global means global, immediately" is not misreading it, and the
COO should treat this as a genuine PO-confirmable question rather than settled.

### 4.5 Rejected alternatives

- **Owner-moderated pending rows.** Rejected — converts a 403 into an indefinite wait; needs
  pending-state schema, a moderation UI, and a resolution path for the blocked place.
- **Per-user city scoping** (a `userId` FK, ADL-28 style). Rejected firmly, and this is where I would
  push back hardest. `cities.id` is the join key for carry-forward candidates (BUG-33), city-level
  item history, LB-01 recommendation aggregation, and map-shading city aggregates. Per-user cities
  fragment every one of those — the same physical city becomes N rows and every cross-trip aggregate
  silently under-reports. **The per-user pattern is right for categories and wrong for cities**, and
  the tier model in D1 is what tells them apart: a category is a taxonomy choice with no external
  truth condition; a city is a fact about the world.
- **Geocode-gated creation** (only create if resolved). Rejected — couples a write to third-party
  availability, violates GE-12, breaks CI (`GEOCODING_ENABLED=false`).
- **A separate `city_suggestions` staging table.** Rejected — `geocodeStatus` already *is* the state
  machine; a second one would be duplicate machinery for the same concept.

### 4.6 ODbL — a compliance step my design increases reliance on (ADL-43 §6.2)

ADL-43 established, with evidence, that ODbL attribution on sourced data is "a real obligation, not a
formality." **Nominatim results are OSM-derived data.** The app already stores Nominatim coordinates
(`geocoding.service.ts`), so the obligation exists today; D5 increases reliance on it by storing
service-derived *canonical names* as well.

`README.md:18` names Nominatim as a stack component but carries no attribution notice, and no
`grep` for "ODbL"/"attribution" in the README matches — whereas ADL-43 §6.2 explicitly cites "the
existing Natural Earth attribution in `README.md`" as the model to follow. *(Single-probe finding,
marked as such: I grepped the README only. I have not audited `LICENSE`, the UI footer, or the map
attribution control, any of which could carry it. **Verify before acting** — this is flagged, not
established.)*

**Not a blocker, and explicitly not mine to fix here.** Recommend the COO raise it as its own small
tracker item: add an OSM/ODbL attribution notice alongside the Natural Earth one, per ADL-43's model.
Recorded so this ADL builds on ADL-43 rather than quietly diverging from it.

---

## 5. D7 and D8 — external egress

### 5.1 D7 — BUG-55: backend proxy, not a widened CSP allowlist. Confidence: High.

**Decision.** Add a backend geocoding-lookup route; repoint the frontend at it. **Do not add
`nominatim.openstreetmap.org` to `connectSrc`.**

**Reasoning.**

- **The browser path can never be made policy-compliant.** Nominatim's usage policy requires an
  identifying `User-Agent`. `useCities.ts:47` sets one on a browser `fetch()`, where `User-Agent` is
  a **forbidden header name** — silently dropped. Widening the CSP unblocks a call that stays
  permanently anonymous and exposed to throttling. Structural, not fixable in place, and sufficient
  on its own to decide this.
- **The compliant client already exists server-side.** `geocoding.service.ts` sets
  `TravelTracker/1.0 (personal-use-app)` (`:16`), enforces a 1.1 s delay above the 1 req/s limit
  (`:17`), never re-queries a resolved city (ADL-10), and handles offline gracefully (GE-12). The
  frontend hook is a **non-compliant duplicate of a compliant client we already own.** The proxy is
  consolidation, not new capability.
- **Rate limiting is only enforceable at a server-side chokepoint.** Nominatim's 1 req/s is a
  per-application limit; N browsers issuing uncoordinated lookups is N× the rate with no mechanism to
  throttle it. The limit becomes unenforceable by construction with more than one user.
- **It removes the CSP dependency entirely**, making the fix immune to the QUAL-18 environment-parity
  gap — a proxied call cannot regress in an environment whose CSP differs from CI's, because there is
  no cross-origin call left to block.
- **It is the same route D5 needs.** One route serves both the BUG-55 auto-populate and the
  city-creation validation authority. This is the convergence the direction identified, and it is
  real: building them separately would mean two clients against the same rate-limited third party.

**Operational cost, stated honestly.**

- Backend egress from Railway to a third party on a user-interactive path. The lookup must stay
  strictly non-blocking for the rest of the flow (`AddPlaceFlow.tsx:200-208`): a geocoder timeout must
  never prevent city creation (GE-12). D5's 4c branch is that guarantee.
- The backend inherits caching and rate-limit responsibility. Recommend an in-process cache keyed on
  the normalised query — city→country is effectively static — plus reuse of the existing 1.1 s delay
  discipline rather than a second, competing limiter.
- Small abuse surface: an authenticated user can drive lookups. `requireAuth` plus the shared rate
  limit bounds it; no separate throttle needed at this scale, but the brief should note it.

**Verification constraint (ENV-01), probed here rather than inherited.** From this worktree,
`curl https://nominatim.openstreetmap.org/search?…` fails with **exit 7** while
`curl https://api.github.com` returns **200 from the same shell** — the control matters, because
without it exit 7 is equally consistent with the network simply being down, which is the shape of
this project's earlier false "the firewall reaches no Turso host" claim. Combined with CLAUDE.md's
documented allowlist (GitHub, npm, Anthropic only), that is two independent signals. **The live path
cannot be exercised in this devcontainer** — verify the route against a mocked upstream locally and
confirm the real lookup on staging. An agent claiming the live path "works" from here is unreliable
by construction.

### 5.2 D8 — General CSP posture. Confidence: Medium-High.

**Decision.** The CSP allowlist is a **closed register with a stated reason per entry**; the default
answer for any new external origin is **proxy it or turn it off**, not allowlist it.

1. An origin belongs in `connect-src` only if the browser is *architecturally required* to reach it
   directly. Exactly two qualify today: `*.maptiler.com` (tile volume makes proxying inappropriate)
   and `CLERK_ORIGIN` (the auth SDK must run first-party). Both already present
   (`server.ts:128-130`).
2. Anything else that is data we ask for: **proxy it** (D7 is the worked example).
3. Anything else that is a third-party SDK's own egress giving us no value: **disable it at the SDK.**
   BUG-68's Clerk telemetry opt-out is the right shape — allowlisting an analytics endpoint
   permanently weakens the CSP to silence a log line.

**Consequence for QUAL-19 the brief must state.** The staging console showed **two** distinct
`connect-src` violations in one user action, from different sources: Nominatim from first-party
source (`useCities.ts:14`) and `clerk-telemetry.com` from a **third-party bundle**
(`clerk.browser.js`). **An implementation that only greps `src/frontend` catches the first and misses
the second.** QUAL-19 therefore needs two halves — a first-party source scan, and a hand-maintained
register of known SDK egress origins each with an explicit disposition (*allowed* with reason,
*disabled at the SDK* with the config that does it, or *blocked and accepted* with why that is
harmless). A grep cannot derive the second; the test asserts the register and the actual CSP agree.

If the second half is judged too costly, **the brief must say so explicitly and record the residual
gap** rather than shipping a first-party-only test that reads as full coverage — the same failure
shape as an E2E suite that could not express a CSP violation at all (QUAL-18).

**No change to the current `connectSrc` value is recommended.** D7 removes the need for a Nominatim
entry; BUG-68 is handled at the SDK.

---

## 6. Proposed BRD amendment text

**The COO applies these. I have not edited the BRD** (brief §6.2 and the three-places rule in
`/record-decision`). Current version is 3.12 (`_project/travel-tracker-BRD.md:3`); this is a **3.13**
bump.

### 6.1 SE-01 — replace in full

> | SE-01 | The system implements a **resource-tier × role** access model. **Roles:** *owner* (the designated app owner, who additionally administers instance-wide configuration), *authenticated user* (any valid Clerk identity — a full tenant of their own data, not a second-class caller), and *explicitly-shared collaborator* (Phase 3+, not yet operative). **Resource tiers:** *global reference data* (countries, regions, the shared city catalogue), *per-user data* (trips, places, items, companions, map-shading config, trip categories, activities), and *instance administration* (reference-data configuration and curation). Access is determined by the tier of the resource and the operation performed on it, not by the caller's role alone; a route whose tier is unstated defaults to instance administration. **Success criteria:** every `/api/*` route is classifiable into exactly one tier and states that tier in its route comment; a newly added route with no stated tier is owner-gated by default; `security.access-matrix.test.ts` carries a row per route asserting the gate its tier requires. |

### 6.2 SE-03 — replace in full

> | SE-03 | **Instance administration must be restricted to the designated owner:** country configuration (region-tier enable/label), region creation and editing, and curation of the shared city catalogue (correcting, re-pointing or deactivating an existing city record). An authenticated non-owner attempting any of these receives 403. **Reading global reference data is not an administrative operation** and is available to every authenticated user (SE-01 tier 1). **Managing one's own per-user lists is not an administrative operation either** — trip categories, activities, companions and map-shading config are each user's own (AD-07, AD-08, AD-09) — nor is adding a city on demand while logging a trip, which any authenticated user may do through the constrained find-or-create path (GE-16). *(v3.13: this requirement previously enumerated category management, activity management, companion management, map shading config and city creation. **All five have since moved**: AD-07 and AD-08 moved shading and companions to per-user and this requirement was never updated; AD-09 moves categories and activities; GE-16 splits create-on-demand from catalogue curation. See ADL-46.)* **Success criteria:** an authenticated non-owner receives 403 on every country/region write and on city PATCH/DELETE; the same user receives 200 on every global-reference-data read, manages their own categories, activities and companions without a 403, and completes trip creation and place addition end to end without encountering a 403. |

### 6.3 AD-09 — replace in full

> | AD-09 | **Trip categories and activities are per-user lists.** Each user's list is seeded automatically from the global defaults on first access, so it is never blank on first login, after which the user may add, rename and deactivate their own entries (AD-03). A user's entries are visible only to that user and never appear in another user's pickers. Entries are never hard-deleted, only deactivated (AD-06). Countries are **not** per-user and remain owner-configured (SE-03). *(v3.13: replaces "global seeded defaults shared across all users. Any user can add custom entries… only deactivated by the app owner", which contradicted SE-03 on the same routes and was never implemented. Follows the AD-07/AD-08 per-user pattern — see ADL-46 §3.2 and ADL-28.)* **Success criteria:** a user signing in for the first time sees the full default category and activity lists with no manual setup; a category added by one user is absent from another user's pickers; two users can each hold a category of the same name without a uniqueness conflict; deactivating an entry hides it from that user's entry forms while preserving it on their existing records, and affects no other user; existing global entries are assigned to the app owner during migration; assigning a category or activity belonging to another user to a trip is rejected with a 400. |

### 6.4 GE-16 — new ID, **flagged not invented**, and **blocking**

Without it the cities decision has no BRD home and the Backend brief's BRD gate is not cleared.

> | GE-16 | Any authenticated user can add a city that is not yet in the shared catalogue, while logging a trip, through the constrained find-or-create path only. The city name is resolved against the geocoding service and the record is created from the service's canonical response where one is available; where it is not (offline, or no match — GE-12), the record is created from the user's text and marked pending, remains usable immediately, and is promoted automatically when background resolution succeeds. A pending record is visible only to the user who created it; a resolved record is visible to all users. Coordinates are never client-supplied. Correcting, re-pointing or deactivating an existing city record remains an owner operation (SE-03). **Success criteria:** an authenticated non-owner can add a place in a city not yet in the catalogue, in one uninterrupted flow, with no 403 and with no dependency on the geocoding service being reachable; submitting a name that resolves to an existing city — in any casing, or as a near-miss the geocoder canonicalises — returns the existing record and creates no new row; a request supplying latitude or longitude is rejected; a pending city created by one user does not appear in another user's city search until it resolves; city PATCH and DELETE still return 403 for a non-owner. |

### 6.5 Open-question closure (required by `/record-decision`)

The applying PR should record in `jobs/COO/open-dialogues.md` that **D-12 item 1 is resolved by
ADL-46**, leaving items 2–4 open. It asked exactly the SE-01/SE-03 question §6.1–6.2 answers.

### 6.6 Requirements this touches without amending

**AD-03** ("user can add, edit, rename, or deactivate items in any structured list") and **AD-06**
(deactivated items hidden from forms, preserved on records) need no text change — they read
correctly per-user. **AD-02** lists the manageable lists and is unaffected. Noted so the COO does not
have to re-derive it, and so §3.5's ambiguity is visible: AD-03 is the requirement that makes
"the user deactivates their own entries" the only coherent reading.

---

## 7. Revised access matrix

The canonical home is `jobs/architect/tech/OP-06-hardening-checklist.md` §2, **amended in place** by
this work (a new §2.1 appended; the original §2 keeps its existing supersession stamp and its
history). No competing document is created. That section carries both the Phase 1 interim state and
the end state, with the interim rows marked as such.

---

## 8. `security.access-matrix.test.ts` — assertions that must change

This is the trap flagged in the brief: the suite is green and **encodes the defect as the intended
contract**. The spec moves first; the briefs then change these tests with authority rather than
appearing to weaken a security test on their own initiative.

**Phase 1** (`src/backend/routes/__tests__/security.access-matrix.test.ts`):

| # | Line (approx) | Current | Intended | Action |
|---|---|---|---|---|
| 1 | 383 | `GET /api/admin/categories/active → 403` | `→ 200`, active category list | **Move** Part B → Part E (or a new Part F citing ADL-46) |
| 2 | 414 | `GET /api/admin/activities/active → 403` | `→ 200`, active activity list | **Move**, same |
| 3 | 444 | `POST /api/cities → 403` | `→ 201` for a new city as a non-owner | **Move**, same |
| 4 | — | *(absent)* | `POST /api/cities` with an existing name in different casing, as a non-owner `→ 200` **and the `cities` row count unchanged** | **Add** — this is what makes D4 safe rather than merely permitted |
| 5 | 457 | `it.skip('PATCH /api/cities/1 → 403 …')` | `→ 403`, unskipped | **Unskip** — §8.1 |

**Must NOT change in Phase 1, and the brief should re-confirm them explicitly** — they are the
fail-closed half, and a careless "open the admin router" fix breaks them:
`GET/POST/PATCH/DELETE /api/admin/categories → 403`, the four activity equivalents,
`PATCH /api/admin/countries/US → 403`, `POST /api/admin/countries/US/regions → 403`,
`PATCH /api/admin/countries/US/regions/1 → 403`. All of **Part A** (401 unauthenticated) is unchanged
for every route including the three that open — opening a tier-1 read or the constrained write never
opens it to an anonymous caller.

**Phase 3** additionally: rows 1 and 2 above are **deleted, not edited** — those routes cease to
exist. They are replaced by `GET /api/categories`, `GET /api/activities` (→ 200, own list) and the
per-user isolation assertions AD-09's success criteria require (user A's custom entry absent from
user B's list; cross-user `category_id` on a trip → 400), following the shape of the existing
companions isolation tests in Part C.

### 8.1 A stale skip found en route — in scope for Phase 1

Line 457 skips `PATCH /api/cities/1 → 403` with a comment saying `requireOwner` "is missing on
`PATCH /api/cities/:id` in current main" pending BUG-22.

**BUG-22 has merged and the guard is present** — `citiesRouter.patch('/:id', requireOwner, …)` at
`src/backend/routes/cities.ts:211-214`. The skip is stale and suppresses a live assertion that D4
makes load-bearing: **city curation staying owner-only is precisely what makes opening city creation
acceptable.** Unskip it in the same brief.

---

## 9. Phasing, and the two briefs this owes

### 9.1 D9 — four phases. Confidence: Medium-High.

Scope has grown from a middleware change to a schema-and-migration change, and I agree with the PO
that this should be said plainly. It should **not** land as one change.

| Phase | Content | Schema? | Clears | Brief |
|---|---|---|---|---|
| **1** | Open the two `/active` reads (§3.1); drop `requireOwner` from `POST /api/cities`; tests per §8 incl. the §8.1 unskip | **No** | **BUG-63 (P1) — completely** | Backend |
| **2** | Geocoding proxy route; frontend repointed, forbidden `User-Agent` deleted; `POST /api/cities` becomes resolve-then-create (§4.3) | **No** | BUG-55; gives Phase 1's city write its validation authority | Backend + small Frontend |
| **3** | Per-user categories/activities: schema, 2 migrations, lazy seed, routes move to `/api/categories` + `/api/activities`, `replaceAssociations` ownership validation, delete Phase 1's carve-out | **Yes** | AD-09 / BRD-AD09 | **Database** then Backend then Frontend |
| **4** | `cities.createdByUserId` + pending-city search containment (§4.4) | **Yes** (one nullable column) | GE-16's containment half | Database + Backend |

**Phase 1 alone fully clears the P1** — that is the finding the PO asked me to call out if it
existed. It does. A non-owner can complete trip creation and place addition with no schema change,
no migration, and no dependency on the geocoder.

**The cost of Phase 1 shipping before Phase 2, stated because it is the sequencing risk:** during
that window, city creation is open with only case-fold normalisation, not service validation. I
judge that acceptable — find-or-create, the unique index, country/region validation and the
`.strict()` schema all hold regardless (§4.5 of the pre-direction draft's analysis, retained in
§4.3's step 1–2), coordinates remain server-only, and the user count is two. **But Phases 1 and 2
should be dispatched together if capacity allows**, because Phase 2 is what makes Phase 1's city
opening properly validated, and the gap is pure downside if it can be avoided.

**Phase 4 can fold into Phase 2 or 3** rather than being its own round; it is separated here only
because it is the piece I hold most weakly (§4.4) and the one most likely to be dropped on review.

### 9.2 Backend brief — Phase 1 (the P1)

**OP-32 class: GAP.** Never built as specified; not a regression (the gates are original and
structural — §1's two probes) and not deployment/config.

**Prerequisite (blocking):** §6 amendments applied, version bumped to 3.13, **including a decision on
GE-16** — it is the BRD home for the cities task and without it the BRD gate is not cleared.

**Tasks:** (1) open the two `/active` reads per §3.1's four-step shape; (2) extend the FAIL-CLOSED
comment block, stating the carve-out is Phase-3-temporary; (3) drop `requireOwner` from
`POST /api/cities` (`cities.ts:91`) and **change nothing else in that handler** — the find-or-create,
the country/region validation and the `.strict()` schema are what make it safe and are load-bearing,
not incidental; update its block comment to cite ADL-46/GE-16; (4) tests per §8 including §8.1.

**Security checklist** (mandatory, per CLAUDE.md): no new routes; `requireAuth` stays globally
applied in `server.ts` so all three opened routes still 401 unauthenticated; **no `userId` scoping
applies** — all three are tier-1 global reference data with no per-user dimension and no user FK,
stated so the reviewer confirms it deliberately rather than reading it as an omission; no new
columns, no FK changes, **no migration.**

**Success criteria (measurable):**
- A non-owner completes *create trip → add place in a city not yet in the catalogue* end to end with
  **zero 403 responses**, verified with `BYPASS_AUTH=true` and `OWNER_CLERK_ID` set to a non-matching
  value (`is_owner: 0` — ADL-38's verification method).
- Both `/active` routes return 200 with the seeded lists for that user.
- `POST /api/cities` returns 201 for a new city and **200 with no new row** for an existing city in
  different casing.
- Every assertion in §8's must-not-change list still passes; `GET /api/admin/categories`
  (unfiltered) still 403s — the fail-closed default is intact and only `/active` opened.
- Backend suite green; `npm run type:check:all` clean.

### 9.3 Database brief — Phase 3 (owed, and the reason scope grew)

**Prerequisite:** §6.3's AD-09 text applied, **and §3.5's deactivation ambiguity confirmed by the
PO** — it changes who may write `is_active`.

**Migration shape** — follow ADL-28 Question 3 as prior art; do not redesign it. Two files, one per
table, each a SQLite table recreation (`UNIQUE(name)` → `UNIQUE(user_id, name)` cannot be done with
`ALTER TABLE`):

1. `CREATE TABLE trip_categories_new` with `user_id text NOT NULL REFERENCES users(id) ON DELETE
   CASCADE`, `UNIQUE(user_id, name)`, and the existing `CHECK(is_active IN (0,1))`.
2. `INSERT INTO … SELECT … CROSS JOIN (SELECT id FROM users WHERE is_owner = 1 LIMIT 1)` —
   **preserving `id`**, which is essential: `trip_categories_map.category_id` FKs to it and existing
   mappings must survive. ADL-28's companions migration preserves `id` for the same reason.
3. `DROP TABLE` / `RENAME` / recreate `idx_*_user`.
4. Same again for `activities`.

**Carries ADL-28's documented caveat:** if no `is_owner = 1` row exists at migration time (fresh dev
DB) the CROSS JOIN inserts 0 rows and existing global entries are abandoned. Acceptable and already
accepted for companions; the lazy seed covers the fresh-DB case.

**Blocking pre-migration check — §3.3.** Query staging for `trip_categories_map` /
`trip_activities_map` rows whose trip belongs to a non-owner, via
`scripts/agent-diagnostics/turso-query.mjs`. The strong expectation is zero (the picker has always
403'd for non-owners) **but that is an inference from the UI path with a known blind spot** — the
trips API accepts `category_ids` directly under `requireAuth` alone. If any rows exist they need an
explicit disposition, not a silent re-point to the owner.

**Workflow:** `npm run db:generate` then `npm run db:migrate`. **`db:push` is forbidden (ADL-15).**
Review the generated SQL by hand before applying — drizzle-kit's four patched bugs are specifically
around table recreation, which is exactly what these two migrations are.

**Also in Phase 3, Backend side:** lazy seed on first access (reusing `db/seed.ts`'s constants);
routes move to `/api/categories` + `/api/activities` with `requireAuth` + userId scoping; **the
Phase 1 carve-out is deleted**; `tripRepository.replaceAssociations` validates that `category_id`
and `activity_id` belong to the requesting user, rejecting cross-user IDs with 400 — the same
validation ADL-28 added for companions.

### 9.4 Out of scope for all phases

QUAL-19's contract test (§5.2 answers the posture question it was queued behind, but does not build
it), BUG-68's telemetry opt-out, BUG-62 (not re-opened — see §12), and the ODbL attribution notice
(§4.6, its own tracker item).

---

## 10. Premises corrected rather than inherited

### 10.1 The geocode retry path is **not** browser-driven

The direction states the pending/resolve machinery "is currently driven from the browser, which is
the same architectural problem BUG-55 exposes." **That is not accurate, and correcting it reduces
the work.**

Two independent probes:

1. **Reading `src/frontend/hooks/useGeocodeRetryQueue.ts`** — its only network call is
   `apiGet('/api/cities/:id')`, and its header comment says so explicitly: *"Polling is read-only
   (BUG-29) — the backend re-runs geocoding itself every 15 minutes."* The browser polls **status**;
   it never geocodes.
2. **Reading the backend side** — `processQueue` in `geocoding.service.ts` (`:148-192`, *"Called on
   startup and every 15 minutes"*) is imported and invoked by `server.ts:47`. Resolution runs
   server-side, on a server-side schedule, through the compliant client.

The probes fail differently: (1) would miss a second geocoding call elsewhere in the frontend;
(2) would miss the queue being invoked from somewhere other than the server. Both agree.

**Consequence.** The **only** browser-driven geocoding in the app is `lookupCityCountry`
(`useCities.ts:37-60`) — the BUG-55 path, and nothing else. The retry/resolution architecture is
already correct and needs no change; D7 replaces one function, not a subsystem. This makes Phase 2
materially smaller than the direction implies.

### 10.2 "Cased normalised matching" is already in place — and is not sufficient

The direction correctly notes this is "substantially in place" and asks me to assess sufficiency
rather than reinvent it. Assessment: **necessary, not sufficient.** `uniq_cities_name_country_ci`
plus the BUG-33 lookup converge case variants (`"denver"` → `"Denver"`) and nothing else. They do not
converge misspellings, abbreviations, or `"denver co"`. That gap is exactly what D5's resolve-first
step closes, and it is why the answer is "keep the existing normalisation **and** add service
resolution," not "replace it."

Note also the documented limitation the schema comment already records: `COLLATE NOCASE` is an
ASCII-only fold, so diacritic variants (`"Zurich"` / `"Zürich"`) do **not** converge today. D5's
canonical-name matching closes that too, as a side effect — worth knowing, since it is a real
duplicate class in a travel app.

---

## 11. What this ADL does not decide

- Whether the owner can deactivate another user's personal entries — §3.5, needs one line from the PO.
- Whether pending-city containment (§4.4) is adopted or dropped — my recommendation is stated, the
  alternative is stated, the COO should confirm.
- Any Phase 3 UI: whether categories/activities get their own per-user admin tab, and how BUG-62's
  per-tab `ownerOnly` flags change once they are no longer owner-only. Flagged for a Frontend brief,
  not designed here.
- Explicitly-shared collaborators (SE-01's third role) — still Phase 3+, still not operative.

---

## 12. Implications for other jobs

- **Backend:** §9.2 (Phase 1, the P1) and §9.3's backend half (Phase 3).
- **Database:** §9.3. Two migrations, table recreation, ADL-28 as prior art, `db:push` forbidden.
- **Frontend:** no change for BUG-63 — the hooks already call the right routes and simply stop
  receiving 403s. BUG-55 needs `lookupCityCountry` repointed at the proxy and the forbidden
  `User-Agent` header deleted. Phase 3 needs the hooks repointed to `/api/categories` +
  `/api/activities` and AdminPanel's `ownerOnly` flags revisited (§11).
- **QA:** the non-owner end-to-end path in §9.2's success criteria is the regression test for this
  whole class and should outlive the individual bugs.
- **BUG-62 is not re-opened.** It shipped per-tab gating with Categories/Activities `ownerOnly`.
  Phase 1 does not change that (it opens the `/active` reads the *trip form* needs, not the admin
  management UI). **Phase 3 does** — those tabs stop being owner-only. Flagged per the brief's
  instruction rather than acted on.
- **COO:** §6 amendments (v3.13, three places), GE-16 accept/reject (**blocking**), AD-09 rewrite,
  D-12 item 1 closure, tracker notes carrying #326 on BUG-63/BUG-55/BRD-AD09, new tracker entries per
  the BRD→tracker rule, the §3.5 PO question, and the §4.6 ODbL item.

---

## 13. Confidence register — for the OP-27 fresh-eyes reviewer

Aim here first:

- **D5's containment rule (§4.4) — Medium, weakest.** "Pending is creator-private, resolved is
  global" is *my reading* of "auto create goes global but do some validation." A reviewer who reads
  the direction as "global immediately, owner curates afterwards" is not misreading it, and that
  alternative is simpler and needs no column. I prefer mine because promotion is already automatic
  via the existing 15-minute queue, so containment costs one nullable column and one WHERE clause and
  then maintains itself — but this is the decision most worth a second opinion.
- **D9's Phase 1/2 gap (§9.1) — Medium-High.** Phase 1 opens city creation before Phase 2 supplies
  its validation authority. Defensible (the P1 is a live, total outage for non-owners; the existing
  constraints hold regardless) but it is a deliberate, temporary weakening and should be challenged
  if the reviewer thinks the phases should be merged.
- **D8's third-party register (§5.2) — Medium-High.** Hand-maintained, and it will rot. I have no
  better mechanism to propose and am not confident none exists.
- **D3's migration risk (§3.2, §9.3) — High on the decision, Medium on the cost estimate.** The
  decision is the PO's and well-precedented; my uncertainty is about the table-recreation migration
  meeting drizzle-kit's patched bug surface, which is a known sharp edge in this repo.
- **D1, D2, D4, D6, D7 — High.** D2 and D7 are near-mechanical given ADL-38's precedent and the
  existing server-side geocoder. D1, D4 and D6 are largely descriptive of where the product already
  is, plus the PO's explicit direction.

**Premises a reviewer should re-probe rather than trust:**

1. **Verified, two probes:** categories/activities have no per-user column today — (a) the table
   definitions at `schema.ts:141-167` declare exactly `id`, `name`, `is_active`, `created_at`,
   `updated_at`; (b) `createAdminListRouter`'s serializer (`admin.ts:113-131`) returns the full row
   shape and contains no `userId`. They fail differently: (a) misses a column added by migration but
   not the schema file; (b) misses a column present but deliberately unserialized.
2. **Verified, two probes:** the geocode retry path is server-side — §10.1.
3. **Inference, NOT verified — and §9.3 makes checking it a blocking step:** that no non-owner holds
   category or activity assignments today. Basis is the UI path (the picker has always 403'd). Blind
   spot named: `POST /api/trips` accepts `category_ids` under `requireAuth` alone, so a direct API
   call could have created them. **Query staging before migrating.**
4. **Single probe, flagged as such:** that the README carries no ODbL/OSM attribution (§4.6). I
   grepped `README.md` only; `LICENSE`, a UI footer, or the map attribution control could carry it.
   Verify before raising the item.
5. **Assumed standard behaviour, asserted by test rather than trusted:** that Express falls through
   to the parent stack when a mounted sub-router matches no route — the mechanism §3.1 depends on.
   ADL-38 already relies on it for the country reads, but §3.1 mounts a *sub-router* above the guard
   rather than a bare route, which is new. §8's must-not-change list covers it deliberately.

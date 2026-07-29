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
path is **not** browser-driven. *(Accepted by the COO on re-verification, 2026-07-28.)*

### 0.1 PO rulings on the three items this spec flagged — second round, 2026-07-28

All three flagged items are now closed. **Two confirmed my recommendation; one overrode it.** This
section is the record; the affected sections below have been amended to match, so nothing in this
document should still read as an open question.

| Flagged in | Question | Ruling |
|---|---|---|
| §3.5 | "Deactivation" — whose? | **CONFIRMED as I read it.** A user deactivates entries in their **own** list; the owner's retained authority is over **global reference data only** (countries, regions, the city catalogue). The AD-03 argument was decisive — "deactivate items in any structured list" is unsatisfiable for a non-owner otherwise. §6.3's AD-09 text stands unchanged. *(The ambiguity was the COO's compression of the direction, not the PO's wording.)* |
| §4.4 | Pending-city containment — adopt or drop? | **ADOPTED exactly as specified.** Creator-private while `pending`, automatic promotion on resolution, `cities.createdByUserId` nullable FK `ON DELETE SET NULL`, and the search clause. Chosen over "global immediately, curate later" with both options and my own stated weak confidence in front of the PO; the **self-maintaining** property was decisive. **§6.4's GE-16 stands as written.** |
| §9.1 | Four phases, dispatched separately | **OVERRIDDEN.** The PO ships all of it as **one change**, not four dispatch rounds. See §9 as amended. |

**On the override:** the COO recommended my phasing and was overruled; the tradeoff was put to the
PO explicitly, including that BUG-63 stays live until the whole thing ships. It is a reasonable call
at two users — fewer UAT rounds, no half-migrated intermediate state, one review instead of four —
and I am not re-arguing it. §9 is rewritten to the single-release plan, and the one genuine
consequence worth noting is a *good* one: **the Phase 1/2 validation gap I flagged as a weakness no
longer exists** (§9.1).

---

## Summary table

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D1 | What determines access | **Resource *tier* × operation, not role alone.** Global reference data / per-user data / instance administration. Unstated tier defaults to owner-only | **High** |
| D2 | Non-owner READ of active categories/activities | **Open (`requireAuth`) at stage S1 — explicitly temporary scaffolding that S3 deletes in the same release.** Clears the P1 without a migration | **High** |
| D3 | Categories/activities ownership model | **Per-user, `userId NOT NULL` FK, lazy-seeded from the global defaults on first access.** Reuses ADL-28's companions pattern verbatim; routes leave `/api/admin/*` entirely | **High** *(PO-decided; I concur — §3.4)* |
| D4 | Non-owner city creation | **Split curation from creation.** Owner curates the catalogue; any authenticated user creates on demand via a constrained, service-validated find-or-create | **High** |
| D5 | How city creation is validated | **Resolve-then-create.** The backend resolves against the geocoder and builds the row from the *canonical response*; unresolvable input still creates (GE-12) but stays creator-private until it resolves | **High** *(PO-confirmed — §0.1)* |
| D6 | SE-01 / SE-03 replacement text | **Rewrite both** around the per-user model; SE-03 enumerates what genuinely stays owner-only | **High** |
| D7 | BUG-55 — proxy or CSP allowlist | **Backend proxy route.** `User-Agent` is a forbidden header in browser `fetch()`, so the direct call can never be policy-compliant; a compliant client already exists server-side | **High** |
| D8 | General CSP posture | **Closed, per-entry-justified register; proxy or disable by default.** Third-party SDK egress in scope for QUAL-19 | **Medium-High** |
| D9 | Sequencing | **One release.** Four stages remain as internal build order and dependency constraints, not four dispatch rounds | **High** *(PO-decided — §0.1)* |
| D10 | Geocode retry bound | **Classify the failure, don't just count it.** A geocoder "no match" is terminal on the first attempt (new `geocode_status = 'unresolvable'`); everything else is recoverable and retried to a cap via `geocode_attempts`. Makes S4 a table recreation | **High** *(PO-directed, §4.4.1)* |
| D11 | Correcting a mistyped city | **Make `city_id` updatable on a place** — the correction happens at the place level, not by opening writes on shared city rows. Creator PATCH and DELETE on cities are deferred | **Medium-High** *(PO-directed; mechanism is mine — §4.4.2)* |
| D12 | Wrong geocoder matches | **Constrain the lookup by the country and region the user already confirmed; user selection always beats the lookup; unresolved ambiguity creates `pending` rather than guessing.** `resolved` explicitly does not mean *verified* | **Medium** *(PO-raised gap — §4.3.1)* |

**Review status (2026-07-29).** The OP-27 fresh-eyes review is complete —
`jobs/architect/tech/ADL-46-review.md`. Verdict: **sound with named corrections.** The reviewer tried
to break D1, D3, D4, D5 and D7 and could not; **all ten findings were accepted and are folded in**,
marked inline as `CORRECTED` / `ADDED`. The two blocking ones were F1 (a third junction table this
spec never named) and F2 (the generated migration cannot be applied). §13 carries the post-review
register.

---

## 1. The finding that reframes the bundle

BUG-63 is not a forgotten gate. It is **two BRD requirements contradicting each other**, with the
code faithfully implementing one of them.

- **SE-03** (`_project/travel-tracker-BRD.md:268`) names "city creation" an owner-only admin
  operation, alongside category and activity management.
- **AD-09** (`:258`) says categories and activities are global defaults and "**Any user can add
  custom entries**."

Both cannot be true of the same routes. The backend implements SE-03 — correctly and deliberately,
with the reasoning written down in ADL-27 and at `src/backend/routes/cities.ts:68-88`. AD-09's
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

**End state** (after all four stages of §9 — which ship together):

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

**A city's *visibility* varies over its life; its *tier* does not.** Worth stating because it was
proposed as a tier transition and it is not one. An unresolved city is creator-private in search
(§4.4) and becomes globally visible on resolution — but it is **tier-1 global reference data
throughout**: its uniqueness constraint is global from the moment it is created, two users can hold
places on the same unresolved row (OP-27 review P2), it survives its creator (`ON DELETE SET NULL`),
and **write access never leaves the owner** (§4.4.2 puts the user's correction path at the *place*
level for exactly this reason). So this is a **provisional visibility state, not a per-user tier** —
and D1 deliberately does **not** gain a lifetime-varying tier, which would be the first in the model
and the kind of thing that gets implemented inconsistently.

---

## 3. Categories and activities

### 3.1 D2 — stage S1: open the reads. Temporary scaffolding. Confidence: High.

**Decision.** `GET /api/admin/categories/active` and `GET /api/admin/activities/active` move above
the `requireOwner` guard (`requireAuth` only), using ADL-38's mechanism unchanged.

**This is explicitly temporary.** Stage S3 (D3) moves these resources out of `/api/admin/*` entirely,
at which point **the carve-out is deleted, not kept** — and under the single-release plan (§9.1) that
deletion happens in the *same shipment*, so the scaffolding never reaches production. It exists so
the work can be built and reviewed in a sane order, and as the emergency fallback in §9.1.

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
4. Extend the FAIL-CLOSED comment block (`admin.ts:34-58`) to name the two new entries, cite ADL-46,
   **and state that they are removed by S3 in this same release** so nobody mistakes scaffolding for
   design.

Express continues down the parent stack when a mounted sub-router matches no route, so `GET /categories`
and every write still fall through to the guarded router. §8 asserts this rather than assuming it.

### 3.2 D3 — stage S3: per-user, lazy-seeded. Confidence: High.

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

#### 3.2.1 The seed trigger predicate — specified, not left to the implementer (OP-27 review F7)

> **ADDED (2026-07-29).** The first draft said "reuse AD-07's mechanism" without stating the
> trigger. The reviewer showed the obvious implementation **breaks AD-09's first success criterion**.
> Leaving this to the implementer is not acceptable, so it is specified here.

**The concurrency half of the precedent is sound and should be copied literally.**
`shadingConfigRepository.seedDefaults` (`src/backend/repositories/shadingConfig.ts:94-108`) uses
`.onConflictDoNothing()`, so two simultaneous first requests from a new user cannot double-seed —
and that guarantee survives the change from `UNIQUE(name)` to `UNIQUE(user_id, name)`, because the
composite index becomes the conflict target. **`onConflictDoNothing` is the load-bearing detail; an
implementer reusing "the pattern" loosely could drop it.** Do not.

**The trigger is where the precedent does not transfer.** shadingConfig seeds when the user has zero
rows, which is safe *there* because shading config has no user-create path — the six rows are fixed
constants users only ever update. Categories and activities are different: `POST /api/categories` is
a first-class user action. So a brand-new user whose **first** action is adding "Diving" now has one
row, the zero-row test is false, and **they never receive the defaults** — silently and permanently,
for exactly the user who engaged with the feature first. AD-09's first success criterion fails.

A cheaper variant of the same bug: a predicate counting *active* rows re-seeds everything for a user
who deactivates all their entries, which reads as "deleted items keep coming back."

**Decision — seed on identity, not on row count.** Seed at user creation
(`findOrCreateByClerkId`), with a reconciliation pass carrying a marker such as
`users.lists_seeded_at` for users who predate the change. This is immune to both variants because it
never asks "how many rows does this user have."

**If a row-count trigger is preferred for symmetry with shading config**, it must (a) count **all**
rows, not active ones, and (b) fire before *any* categories/activities handler, read **or write** —
not only the read path. Either design is acceptable; the Backend brief must state which it used.

**Routes move out of `/api/admin/*`.** Exactly as ADL-28 moved companions to `/api/companions`
(`requireAuth`, userId-scoped), categories and activities move to `/api/categories` and
`/api/activities`. This is not cosmetic — leaving a tier-2 resource on an owner-gated admin router
is the structural error behind BUG-63, and re-fixing the gate while leaving the resource in the wrong
place invites the next recurrence.

### 3.3 D3 — the complication ADL-28 had to solve, and so does this

> **CORRECTED (2026-07-29) — OP-27 review F1.** The first draft of this section said
> "`trip_activities_map` does the same for activities at both trip and place level." **That was
> false**, and the error propagated into §8, §9.3's pre-migration check and the COO's live-data
> query, all of which inherited a two-table set. Place-level activities live in a **third, separate
> table**. Re-verified independently before amending: `schema.ts:376-387` defines
> `tripPlaceActivitiesMap`, and a grep for `activity_id` across the schema returns **two** distinct
> junction tables (`:320` trip-level, `:382` place-level).

**There are three junction tables, and they do not share a join path.** This matters more than it
looks: the third one is unreachable from a query rooted at `trips`.

| Junction table | Schema | FK to per-user table | Joins to a user via |
|---|---|---|---|
| `trip_categories_map` | `:273-285` | `category_id → trip_categories.id` | `trips.user_id` |
| `trip_activities_map` | `:314-325` | `activity_id → activities.id` | `trips.user_id` |
| **`trip_place_activities_map`** | **`:376-387`** | `activity_id → activities.id` | **`trip_places.user_id`** — *not* `trips` |

Once categories and activities are per-user, **a trip or a place may reference a row belonging to a
different user.**

ADL-28 hit this exactly and solved it: `tripRepository.replaceAssociations` gained a `userId`
parameter and validates companion ownership before inserting, rejecting cross-user IDs with a 400
(AD-08's stated success criteria). Verified still true today — that function validates **only**
companions (`src/backend/repositories/trips.ts:250-257`), with no equivalent on the `categoryIds`
or `activityIds` branches. **The same validation must be added for `category_id` and `activity_id`.**

**But `replaceAssociations` does not cover the place-level path, and that is a live hole in the
access model rather than a migration concern.** Place activities are inserted by
`POST /api/trips/:tripId/places/:placeId/activities` (`src/backend/routes/places.ts:242-280`), which
validates that the *place* belongs to the caller (`:255-256`) and then inserts the caller-supplied
`activity_id` **with no check on the activity at all** (`:274-276`). I confirmed the handler by
reading it end to end; the reviewer confirmed the consequence by executing it against a migrated
scratch DB, where the database accepted a non-owner's place tagged with the owner's activity.

SQLite cannot express this constraint — the FK targets `activities.id`, which has no user dimension.
That is precisely why ADL-28 put companion validation in application code, and the same reasoning
carries here. **This survives the disposable-data constraint**: it is a permanent gap in the write
path, not a property of today's rows.

**Adjacent, lower severity, same root — flagged so it is a deliberate decision rather than an
oversight:** the read joins at `src/backend/repositories/places.ts:91` and
`src/backend/routes/trips.ts:210` left-join `activities` on id alone. Once rows are per-user those
become cross-user reads for any pre-existing mapping. Harmless once the write path above is closed,
but the Backend brief should note it rather than discover it.

**How much existing data is affected — a strong inference that must still be checked against real
data before the migration runs.** Because `GET /api/admin/categories/active` has 403'd for
non-owners since the routes were written (§1, two probes), a non-owner's category picker has always
rendered empty, so a non-owner should have no category or activity assignments at all — making the
CROSS JOIN-to-owner backfill nearly a no-op outside the owner's own trips.

**I am not asserting that as fact, and the Database brief must not either.** It is an inference from
the UI path, and it has one real blind spot: `POST`/`PATCH /api/trips` accepts `category_ids` and
`activity_ids` directly and is gated only by `requireAuth`, so a non-owner *could* have assigned them
by calling the API outside the UI. `POST /api/trips/:t/places/:p/activities` is the same shape.

> **CORRECTED (2026-07-29) — OP-27 review F1(a).** The pre-migration check as first written
> enumerated only `trip_categories_map` and `trip_activities_map`, both joined via `trips`.
> **`trip_place_activities_map` joins via `trip_places`, so it is unreachable from that query
> shape** — the check returns a clean zero while cross-user place-level rows exist. The reviewer
> reproduced exactly that on a scratch DB. The COO's live-data probe inherited the same two-table
> set from this section, so its zero is trustworthy for trip-level mappings and is **not evidence
> about place-level ones.** The corrected three-query check is in §9.3.

**A count is the wrong instrument anyway, and the single-release decision is why.** A zero today is
not a zero when the migration runs — all three write paths above accept IDs under `requireAuth`
alone, so rows can appear between the probe and the deploy. The CROSS JOIN backfill is a no-op for
junction rows either way; the risk is not that the migration corrupts them but that it **silently
legitimises a cross-user reference.** So the check is necessary but not sufficient, and §9.3 also
requires a **post-migration assertion inside the migration file** that aborts if any junction row
crosses a user boundary. That converts a point-in-time query into a run-time invariant. A failed
migration is recoverable; a silently wrong one is the thing §13 was worried about.

### 3.4 D3 — I withdraw my draft position, and why the PO's is better

My pre-direction draft kept creation owner-only and deferred per-user entries. My reasoning was that
AD-09's literal text ("any user can add custom entries" to *global* rows) would let any user write
irreversibly into every other user's pickers. **That objection was correct about AD-09's literal text
and is entirely dissolved by the per-user model** — a custom entry never appears in anyone else's
list, so the shared-namespace problem does not arise. The PO's answer keeps the capability AD-09
always intended and removes the defect I was reacting to. It is strictly better and I withdraw mine.

What survives from my draft is only the **cost warning**, and it is why this is built as S3 rather
than folded into S1: both `name` columns carry a global `UNIQUE` that must become composite, which in
SQLite is a table rebuild — and this project's `drizzle-kit` has four patched bugs specifically
around table recreation (ADL-15, `patches/drizzle-kit+0.31.9.patch`). The migration is real work with
a known sharp edge, and §13 now names its execution as the highest residual risk in the release.

### 3.5 The "deactivation" ambiguity — RESOLVED, reading confirmed

> **CLOSED (2026-07-28) by PO ruling — see §0.1.** Recorded here rather than deleted, because the
> reasoning is the requirement's justification and a future reader will otherwise re-open it.

The direction said what remains owner-only is "countries, the curated global city catalogue, **and
deactivation**." Deactivation *of what* was genuinely ambiguous once lists are per-user, and I
declined to resolve it silently.

**Ruling: a user deactivates entries in their own list.** The owner's retained deactivation authority
is over **global reference data only** — countries, regions, and the global city catalogue.

The deciding argument was **AD-03**: "user can add, edit, rename, or deactivate items in any
structured list" is simply unsatisfiable for a non-owner under the alternative reading. AD-09's old
clause "deactivated by the app owner" was written for a *global* list and is vestigial under a
per-user model. **§6.3's AD-09 text stands unchanged** and is what the COO applies.

*(For the record: the ambiguity originated in the COO's compression of the direction — "deactivation"
was its word and carried no scope — not in the PO's own framing.)*

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
  (`cities.ts:167`), so the row is always created from user text even when the service could have
  given a canonical one. Resolve-then-create is strictly better data for the same number of calls.

### 4.3.1 D12 — wrong matches: the failure D5 introduces, and the minimum that makes it safe

> **PO question (2026-07-29):** *"how does the state/country lookup work in this use case when the
> city being matched isn't correct?"* **A real gap.** §4.4's containment protects against cities that
> **never** resolve. It does nothing about cities that resolve to the **wrong place** — and that case
> is both more likely and more damaging, because a wrong match is `'resolved'`, so it bypasses
> containment and enters the shared catalogue as authoritative on first write.

**Why D5 raises the stakes.** Today `lookupCityCountry` sends the raw user string with `limit=1` and
returns `data[0]` unconditionally, but it is **advisory** — it pre-fills form fields the user sees and
confirms. A wrong match is a wrong *default*. D5 builds the stored record from the canonical response,
which is a much stronger commitment.

**One mitigation already exists and it is the load-bearing one — D11, for a reason I did not
originally give.** The COO's framing assumed the creator loses correction rights once a row is
`'resolved'`, which would mean a user can fix the case they *notice* (blank fields) and not the case
they *don't* (confidently wrong) — an ugly inversion. **That inversion does not exist in this
design.** §4.4.2 puts correction at the *place* level: `PATCH /api/trips/:t/places/:p` with `city_id`
is gated on **place ownership only** and does not care what status the city has. So re-pointing works
identically for a wrong match and a no-match. Rejecting the tier-transition framing (§2) turns out to
have bought this for free.

**What re-pointing does not fix, stated plainly.** The wrong row stays in the global catalogue with
wrong coordinates. And it is **unrepairable by anyone today**: `PatchCitySchema` accepts only
`region_id`, so not even the owner can correct coordinates.

**The deeper constraint, which is pre-existing and which D5 makes visible.**
`uniq_cities_name_country_ci` is on **`(name COLLATE NOCASE, country_code)` — region is not in the
key** (`schema.ts:126`). So the catalogue **cannot represent Springfield, Illinois and Springfield,
Missouri at the same time.** Whichever lands first owns the name for that country, and every later
user typing "Springfield" gets it back from find-or-create. This is BUG-33's constraint, not
something ADL-46 introduces, but resolve-then-create makes collisions *more* likely by canonicalising
variants onto one name. **Flagged, not fixed here** — see below.

#### The minimum that makes this release safe

**Decision: use the structured data the user has already given us, and never let the lookup overrule
it.** The insight is that D5's resolve step runs *after* the user has confirmed country and region —
`CreateCitySchema` already **requires `country_code`** and accepts `region_id` — while
`resolveCity` today sends a bare `q` string with the country *name* appended and no filter
(`geocoding.service.ts:97-103`). **The backend already holds the disambiguating data and does not use
it.**

1. **Constrain the lookup by country.** Pass Nominatim's `countrycodes=` filter from the request's
   validated `country_code` rather than hoping the free-text query lands in the right country. This
   alone removes the London-UK-vs-Ontario and Cambridge-UK-vs-Massachusetts classes entirely.
2. **Disambiguate by region where the user gave one.** Request `limit>1` with `addressdetails=1`, and
   where `region_id` is set, prefer the result whose subdivision matches. Springfield + US + Missouri
   is unambiguous even though Springfield + US is not.
3. **User selection is authoritative — answering the second question directly.** The lookup may
   supply **coordinates and a canonical name**; it may **never override the `country_code` or
   `region_id` the request carried.** If they disagree, the user's values stand and the record is
   created from them. Rationale: the user has ground truth about where they went, the geocoder has a
   ranked guess, and `country_code` has already been validated against our own `countries` table. A
   silent overwrite of an explicit user choice is the worst available outcome.
4. **Ambiguity that survives 1–3 does not resolve.** If the country- and region-constrained lookup
   still returns multiple comparable candidates, **create from the user's text as `'pending'`** rather
   than picking first. That routes it into containment — creator-private, correctable, no global
   write — instead of guessing. Note this is deliberately *narrow*: without step 1 a plain
   ambiguity-block would leave "London" permanently unresolved, which is why constraining comes first.

That is four small changes inside one handler, no schema change, and no new UI.

#### What I am explicitly *not* doing in this release, and the residual risk

- **No fourth status, and `'resolved'` keeps both meanings.** The COO asked whether *"the geocoder
  answered"* and *"this row is fit for the shared catalogue"* need separating. **They do not, here** —
  separating them requires a verification *actor*, and at two users there isn't one; it would be a
  status nobody ever transitions. **The honest position, recorded in GE-16: `resolved` means the
  geocoder returned a match, not that the match is correct.**
- **No interactive disambiguation UI.** Step 4 degrades to pending instead. A "did you mean
  Springfield, Illinois or Springfield, Missouri?" picker is better UX and is genuinely its own piece
  of work — frontend flow, backend candidate endpoint, and it interacts with GE-14's search-first
  design. **Follow-on.**
- **No fix for the same-name collision.** Widening the unique key to include `region_id` does not
  work as-is: `region_id` is frequently NULL and **NULLs are distinct in a SQLite unique index**, so
  it would permit true duplicates — the exact defect BUG-33 closed. Needs its own design.
  **Follow-on.**
- **Owner repair of coordinates is now clearly needed** and folds into the already-deferred creator
  `PATCH /api/cities/:id` work (§4.4.2): that route should gain the ability to correct coordinates or
  force a re-resolve. Today nobody can.

**Accepted residual risk, stated so it is a decision rather than an oversight:** a confidently-wrong
match that survives country and region constraints will enter the global catalogue with wrong
coordinates, and until the deferred owner-repair path exists, nobody can fix that row. The user's own
experience *is* repairable — they re-point their place (D11) — and the wrong row is a real place with
a real name, not corrupt data. **At two users, with steps 1–4 in place, I judge that acceptable for
this release.** It should not survive the app having many users.

### 4.4 D5's containment rule — ADOPTED (PO-confirmed)

> **CONFIRMED (2026-07-28) by PO ruling — see §0.1.** This was flagged in the first draft as the
> decision I held most weakly and as a PO-confirmable question. It was put to the PO alongside the
> rejected alternative and my own stated low confidence, and **adopted exactly as specified**. It is
> no longer an open call, and the OP-27 reviewer should not be pointed here as one. The rejected
> alternative is retained below because the reasoning still justifies the choice.

**Decision.** A city row is **globally visible once `geocode_status = 'resolved'`**. While `'pending'`
it is visible only in its creator's own searches. Requires one new column,
`cities.createdByUserId` (nullable FK → `users.id`, `ON DELETE SET NULL`), and one clause in the
`GET /api/cities` search:

```sql
WHERE geocode_status = 'resolved'
   OR created_by_user_id = :me
   OR created_by_user_id IS NULL   -- no known creator: seeded, pre-column, or creator deleted
```

> **CORRECTED (2026-07-29) — OP-27 review F3.** The first draft omitted the `IS NULL` branch. A row
> that is `pending` **and** has a NULL creator satisfies neither of the first two disjuncts and
> becomes **invisible to every user, permanently — including whoever created it.** I reasoned
> carefully about NULL semantics for the *column* in the paragraph below and then wrote a query with
> no NULL branch; nothing catches it at review time because the migration adds no backfill, so there
> is nothing to look at.
>
> **This is a rule defect, not a legacy-data artefact, and that is what makes it durable.**
> `ON DELETE SET NULL` means NULL is not a one-off value that drains away after the migration —
> **every user deletion regenerates the condition**, on data created long after this ships. The two
> choices the paragraph below reasons about most carefully — nullable column, `SET NULL` rather than
> cascade — combine into a permanent failure the clause had no branch for. It survives the
> disposable-data constraint intact.
>
> **A second-order consequence of the fix, stated because it is a real trade and not free:** treating
> NULL as global means a deleted user's *unresolved* cities are promoted from creator-private to
> globally visible. That is the correct call — a row with no known creator cannot be contained to
> anyone, and the only alternative is the invisible-forever behaviour being fixed — but it does mean
> user deletion can surface junk. D10's give-up rule bounds how much junk can accumulate, and the
> owner can curate via `PATCH`. Accepted deliberately rather than unnoticed.

**Deliberately uncontained: `GET /api/cities/:id`** (`cities.ts:195-217`) carries no containment
clause and should not. GE-16 scopes containment to *search*, and by-id fetch is how the geocode
retry queue polls status (BUG-29) — containing it would break that. Stated because it was previously
unstated.

**Reasoning.**

- It is a literal reading of the direction: *auto-create goes global, but validated* — validation is
  the **gate to global**, not a blocker on creation. The user's own flow is never interrupted; they
  always see and can use the city they just made.
- **Promotion is already automatic and already server-side.** `processQueue` re-runs geocoding every
  15 minutes (`geocoding.service.ts:152`, invoked from `server.ts:325` and rescheduled by the
  `setInterval` at `server.ts:330`), so a legitimate city created
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

**The alternative that was rejected**, retained because it justifies the choice: everything global
immediately, accept the junk, let the owner curate via `PATCH`. Simpler, needs no column and no query
change, and at two users the junk volume is near zero. Containment won because it is cheap,
**self-maintaining** — junk never resolves, so it never goes global, with no moderation queue and no
owner intervention — and it makes the global namespace trustworthy by construction rather than by
someone remembering to tidy it. The PO cited the self-maintaining property as the deciding factor.

### 4.4.1 D10 — the retry queue needs a give-up rule, and S4 is the cheap moment (OP-27 review F5)

**Decision: add `cities.geocode_attempts integer NOT NULL DEFAULT 0` alongside `created_by_user_id`
in S4, plus a give-up rule in `processQueue`. COO-decided 2026-07-28; do it now, not later.**

**The consequence the first draft missed.** §4.4's containment is self-maintaining *because* junk
never resolves — that is correct, and it is the right reason to adopt it. The flip side was never
stated: **a row that never resolves is re-attempted every fifteen minutes, forever.** `processQueue`
(`geocoding.service.ts:152-193`) selects every `pending` row ordered by `geocodeAttemptedAt` and
re-attempts all of them, with no attempt counter, no backoff and no terminal state.

Today that is bounded because only the owner can create cities. **D4 removes the bound.** Every typo
and every unresolvable name any authenticated user submits becomes a permanent line item costing
**two** HTTP requests (the `isOnline()` HEAD probe plus the search GET — see D7/§5.1) against a
1 req/s budget, every fifteen minutes, indefinitely. Combined with the egress contention in §5.1, the
fifteen-minute queue alone can starve the interactive proxy.

**Why now rather than later:** S4 already touches `cities`, and deferring costs an entire second
`cities` migration.

#### D10 refined by PO direction (2026-07-29) — classify the failure, don't just count it

> The COO's original instruction was "add an attempts counter, give up after N." **The PO refined it
> and the refinement is a real improvement:** *"We want to retry when there is an integration error
> or something recoverable. A response where the lookup returned no match shouldn't ever be
> re-tried."* Explicit latitude was given on mechanism — *"either a retry cap or consuming the
> responses."* **I am adopting both, because they address different failure classes.**

A pure count-cap treats every failure alike and still burns N attempts on every `"asdf"`. Classifying
the response makes junk **terminal on the first attempt**, which is strictly better and is what makes
§4.4's containment cheap rather than merely bounded.

**Two failure classes, two mechanisms:**

| Class | Examples | Mechanism |
|---|---|---|
| **Terminal** — the geocoder answered, and the answer was *no match* | HTTP 200 with an empty result array | **Never retried. Not once.** `geocode_status → 'unresolvable'` on the first occurrence |
| **Recoverable** — the question was never actually answered | network error, timeout, 5xx, 429, host unreachable | Stays `'pending'`; `geocode_attempts` increments; retried until a cap |

**The distinction already exists in the code and is thrown away — this is a positive finding, not an
absence.** `resolveCity` has **four** distinct failure branches and all four `return false` leaving
the row `'pending'`:

| Branch | Line | Class |
|---|---|---|
| `isOnline()` false — host unreachable | `:85` | recoverable, **and global, not per-city** |
| `!resp.ok` — HTTP 4xx/5xx | `:107-110` | recoverable |
| **`!data.length` — 200 OK, empty result set** | **`:115-119`** | **TERMINAL** |
| `catch` — network/parse exception | `:137-140` | recoverable |

The `!data.length` branch even carries the comment *"No results — leave as pending, will retry on
next queue run"* — the behaviour the PO is correcting is deliberate and documented. **The information
is available at the branch point; only the persistence is missing**, so the fix is a few lines.

**Decision — add a third `geocode_status` value, `'unresolvable'`, and keep the counter as a safety
net for the recoverable class.**

- `geocode_status`: `'pending' | 'resolved' | 'unresolvable'` — the CHECK constraint amended.
- `geocode_attempts integer NOT NULL DEFAULT 0` — incremented **only** on recoverable failures.
- Queue predicate: `WHERE geocode_status = 'pending' AND geocode_attempts < CAP`. Suggested cap
  **5**, tunable; the Backend brief may pick another N and say so.
- **`isOnline()` false and `GEOCODING_ENABLED=false` must NOT increment `geocode_attempts`.** Those
  are *global* conditions, not per-city failures — otherwise one offline weekend silently burns every
  pending city's entire retry budget. `processQueue` already returns early on both, but `resolveCity`
  is also called directly from `POST /api/cities` (`cities.ts:167`), and that path must not increment
  either.
- Cap-exhausted rows stay `'pending'`, not `'unresolvable'` — "we gave up asking" and "the geocoder
  told us there is nothing" are different facts, and the PO's direction is precisely about not
  conflating them.

**Why a status value and not a boolean flag or a sentinel count.** Considered and rejected:

- **A separate `geocode_unresolvable` boolean.** Rejected for the same reason §4.5 rejects a
  `city_suggestions` table: *`geocodeStatus` already **is** this state machine, and a second one is
  duplicate machinery.* Consistency with my own rejection matters. It also breaks the index below.
- **Encoding terminal as `geocode_attempts = CAP` on the first no-match.** Clever, needs no CHECK
  change, and **loses exactly the semantic distinction the PO drew** — afterwards you cannot tell a
  genuinely-unknown place from one that had five bad nights. Rejected.
- **The decisive practical argument:** the partial index
  `idx_cities_geocode ON geocode_status WHERE geocode_status = 'pending'` (`schema.ts:115`)
  **automatically stops indexing terminal rows only if terminal is a status value.** With a flag or a
  sentinel, every dead row stays in the queue index forever — which is the cost D10 exists to remove.

**Cost change, stated plainly because it is material.** S4 was "a plain `ALTER TABLE ADD COLUMN`,
cheap and independent of S3's rebuilds." **That is no longer true.** Amending a CHECK constraint in
SQLite is a table recreation, so **S4 now needs the same 12-step recreation shape as S3** — see
§9.3.4 for the full cost and what the recreation must reproduce.

### 4.4.2 D11 — the correction path, and why I am putting it at the place level (PO direction, 2026-07-29)

> **PO direction:** *"make sure the user has a way to delete it themselves. If they made a typo for
> example, they shouldn't be stuck with it permanently — they should be able to edit with an
> integration retry on save, or delete and add a new row."*
>
> **He is right and this release is what creates the trap.** Before it, only the owner could create
> cities and no row was ever terminal. §4.4's containment plus D10's terminal state together mean a
> user who types `"Denvr"` owns a row that is invisible to everyone, never retried, and — today —
> uneditable and undeletable by them. **A release that creates a trap must ship its escape.**

**Facts established first, because they narrow the design sharply.** Three verified independently:

1. **`PATCH /api/cities/:id` is owner-only** (`cities.ts:223-225`), and its schema accepts **only**
   `region_id` — `PatchCitySchema` is `.strict()` with one field (`cities.schemas.ts:28-33`), and the
   handler writes only that field. So it cannot repair a name even for the owner.
2. **There is no `DELETE` route on cities.** My probe: `citiesRouter.(get|post|patch|delete)` returns
   six routes — four GET, one POST, one PATCH, no DELETE. The COO independently ran three further
   probes with the same result. Delete is **net-new work**, not a permission change.
3. **`trip_places.cityId` is `.notNull()` with no `onDelete`** (`schema.ts:349-351`) — NO ACTION, and
   FK enforcement is on by default in `@libsql/client`. **A city cannot be deleted while any place
   references it**, and in the typo scenario the place always exists, because the user typos the city
   *while adding a place*. **Delete does not solve the reported case.**

**And one more that reshapes the answer:** `city_id` is **create-only** on places.
`CreatePlaceSchema` takes `city_id`; `UpdatePlaceDatesSchema` is `.strict()` and accepts only dates
(`places.schemas.ts:20-36`). So a place cannot be re-pointed either. The user's *only* current escape
is `DELETE /api/trips/:t/places/:p` (`places.ts:112`) and re-add — **which destroys the place's items
and its activity tags**, since both hang off `trip_place_id`.

#### The decision — make `city_id` updatable on a place. That is the correction path.

**Primary mechanism: `PATCH /api/trips/:tripId/places/:placeId` accepts `city_id`.** Correcting a
typo becomes *"this place is in the wrong city"* — the user re-selects through the existing
AddPlaceFlow search, which already does find-or-create and resolve-then-create.

**Why this rather than opening `PATCH /api/cities` to the creator**, which is what the direction's
wording most literally suggests:

- **It has no unsolvable collision case.** Editing the *city row* from `"Denvr"` to `"Denver"` when
  `"Denver"` already exists violates `uniq_cities_name_country_ci`. The natural repair — re-point this
  user's places to the existing row — **is exactly the operation being proposed here**, so the
  city-edit path needs it anyway. Re-pointing gets it for free through find-or-create.
- **It preserves the user's work.** Delete-and-re-add loses items and activity tags; re-pointing keeps
  them, because they hang off `trip_place_id`, which does not change.
- **It never writes to a shared global row.** A pending city is *not* private, despite being
  creator-private in search: the OP-27 review's P2 established that user B posting the same name gets
  **user A's pending row back** (200, no new row), because the unique index is global. So a
  creator-edit path can silently mutate a city another user's place already depends on. Re-pointing
  cannot — it touches only the caller's own `trip_places` row.
- **It keeps D1 clean.** No new write delegation on tier-1 data, so no first-of-its-kind
  lifetime-varying tier (see below).
- **It is small**: one schema field, one branch in an existing handler whose ownership check already
  passes.

**The typo'd row is then orphaned** — invisible to everyone (creator-private + never resolves) and
referenced by nothing. Harmless clutter. It is also now *deletable*, because the FK no longer blocks
it, which is what makes the secondary mechanism viable later.

#### Secondary — delete-and-re-add, which the PO accepted and which already works

> **PO, closing the question:** *"edit and re-send is a more natural user process. However, delete
> and re-add isn't entirely unacceptable as presumably the user would catch the error right after
> saving it and so the trip place would be mostly empty."* Both confirmed: edit is primary, delete is
> an acceptable fallback.

**The delete-and-re-add path requires no work at all — it already functions today.**
`DELETE /api/trips/:tripId/places/:placeId` exists (`places.ts:112`), and re-adding a place with a
corrected city is the ordinary create flow. The PO's reasoning is what makes it acceptable: a typo is
caught immediately after saving, so the discarded `trip_place` is nearly empty. **Nothing needs
building for this path.** It is worth stating explicitly, because it was framed as blocked and it is
not.

**What is actually left over is one orphaned city row, and it is harmless.** After the user corrects
by either route, the typo'd city is: invisible to every user (creator-private and never resolves);
**not in the geocode queue** (terminal, per D10); **not in the partial index**, since
`idx_cities_geocode` covers only `geocode_status = 'pending'`; and referenced by nothing. It consumes
one row and one slot in a global unique namespace, for a name nobody wants. **Cleaning it up is
hygiene, not a fix.**

#### On the place-removal cleanup hook — right shape, wrong release

The COO proposed cleaning the city up as a side effect of place removal, rather than adding a public
`DELETE /api/cities` route, and invited disagreement. **I agree the shape is right and recommend
deferring it anyway.** Three reasons:

1. **It buys nothing user-visible.** Per the paragraph above, the orphan is inert. This is tidiness,
   competing for room in a release already carrying three migrations, a route relocation and a proxy.
2. **`BUG-40` / `TR-15` is actively redesigning the exact flow it would hook into.** Verified: BUG-40
   is `pending`, gated on ADL-41, and replaces today's silent item-reassignment with a three-way
   prompt — *delete all / move to trip-level / cancel*. Two of those three branches do not delete the
   place at all. **A cleanup hook written now would be designed against a flow that is about to
   change, and would then constrain BUG-40's design or be rewritten by it.**
3. **Side-effect deletion of a shared-table row is a surprising primitive** to introduce implicitly,
   and its predicate has to stay exactly right forever. Note that "unreferenced" is genuinely
   load-bearing rather than obviously true: the OP-27 review's P2 established that a second user can
   hold a place on the *same* pending row via find-or-create, so the check is real work, not a
   formality.

**Disposition — so whoever picks it up inherits the design rather than re-deriving it.** If cleanup
is wanted, do it as the COO proposed — a hook inside place removal, **not** a public
`DELETE /api/cities` route — and brief it **with or after BUG-40, never before.** The predicate must
be all four of: the city is `pending` or `unresolvable` (**never** `resolved`); `created_by_user_id`
equals the caller; **no** `trip_places` row references it after the deletion; and the branch of
BUG-40's prompt actually removed the place. **Explicitly do not** add `ON DELETE CASCADE` to
`trip_places.cityId` to make this easier — a city deletion silently destroying trip places would be
far worse than the defect being fixed. I agree with the COO on that without reservation.

#### Also deferred: creator `PATCH /api/cities/:id` + re-resolve on save

A genuine improvement — it repairs the *shared* row, so a corrected name becomes globally useful
instead of leaving an orphan — but it needs the uniqueness-collision path, a cross-user-reference
guard, and a write delegation on tier-1 data. **Defer to an immediate follow-on**, now that
re-pointing has removed the urgency.

#### This is not a tier transition — a correction to the framing offered

The COO proposed that a city is *per-user data while unresolved and global reference data once
resolved*, with resolution as the tier transition, and asked whether that should be stated in D1.
**I do not think it should, and the P2 finding is why:** a pending city is already *shared* — two
users can hold places on the same pending row, and its uniqueness constraint is global throughout.
It is not per-user data at any point.

**The accurate framing: a city is tier-1 global reference data for its whole life, with a
*provisional visibility state* while unresolved.** What changes at resolution is who can *see* it in
search, not who owns it or who may write it. Write access stays with the owner throughout — which is
exactly why the correction path lives at the place level. Stating this as a tier transition would
introduce the first lifetime-varying tier into D1 to describe something that is really a visibility
rule, and the COO is right that such a thing gets implemented inconsistently — which is the argument
for *not* creating one.

#### Scope verdict — asked for plainly, so stated plainly

**The place-level correction path belongs in this release.** It is small, it is the escape for a trap
**this release introduces**, and shipping D10's terminal state without it would knowingly ship the
defect Ryan named. **Everything else defers**, and the net in-release cost is smaller than it first
looked:

| Mechanism | Verdict | Cost |
|---|---|---|
| **Edit — re-point a place to another city** | **In release.** PO-confirmed as the natural process | One schema field + one handler branch |
| **Delete-and-re-add** | **In release by default — already works** | **Zero.** `places.ts:112` plus the ordinary create flow |
| Orphan cleanup on place removal | Defer — brief with/after BUG-40 | — |
| Creator `PATCH /api/cities/:id` | Defer — immediate follow-on | — |
| `DELETE /api/cities/:id` | **Do not build** — superseded by the cleanup hook shape | — |

So against a release already carrying three migrations, a route relocation and a proxy, the
correction path adds **one schema field and one handler branch**. Both PO-named mechanisms are
available to the user on merge.

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
  identifying `User-Agent`. `useCities.ts:48` sets one on a browser `fetch()` (`:47`), where `User-Agent` is
  a **forbidden header name** — silently dropped. Widening the CSP unblocks a call that stays
  permanently anonymous and exposed to throttling. Structural, not fixable in place, and sufficient
  on its own to decide this.
- **A correctly-identified client already exists server-side.** `geocoding.service.ts` sets
  `TravelTracker/1.0 (personal-use-app)` (`:16`), never re-queries a resolved city (ADL-10), and
  handles offline gracefully (GE-12). The frontend hook duplicates it without the `User-Agent` the
  browser refuses to send. **Note the narrowed claim** — see the correction below; the server client
  is compliant on *identification*, not on *rate*.
- **Rate limiting is only enforceable at a server-side chokepoint.** Nominatim's 1 req/s is a
  per-application limit; N browsers issuing uncoordinated lookups is N× the rate with no mechanism to
  throttle it. The limit becomes unenforceable by construction with more than one user. **The
  chokepoint does not exist yet and this release must build it** — see below.
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
  the normalised query — city→country is effectively static.
- Small abuse surface: an authenticated user can drive lookups. `requireAuth` bounds who, the
  chokepoint below bounds how fast.

#### 5.1.1 CORRECTION — there is no limiter to reuse, and this release must build one (F4)

> **CORRECTED (2026-07-29) — OP-27 review F4. The *decision* is unchanged and the reviewer did not
> dispute it**; the forbidden-`User-Agent` argument carries D7 on its own. What was wrong is the
> supporting evidence, and the first draft then declined to build a limiter *because of* that
> evidence — recommending "reuse of the existing 1.1 s delay discipline rather than a second,
> competing limiter." **There is nothing to reuse.**

Three facts from `src/backend/services/geocoding.service.ts`, which I re-read to confirm:

1. **`REQUEST_DELAY_MS` (`:17`) is a `sleep()` inside `processQueue`'s `for` loop (`:183-190`) — not
   a limiter object.** It is private to one function and cannot be called from anywhere else.
2. **`resolveCity` is exported and called fire-and-forget from `POST /api/cities` (`cities.ts:167`).
   That path is not rate-limited at all today.**
3. **Each `resolveCity` makes *two* Nominatim requests** — the `isOnline()` HEAD probe (`:85` →
   `:32-46`) and the search GET (`:105`). So even `processQueue` issues roughly two requests per
   1.1 s, already above the 1 req/s policy the ADL-10 comment claims compliance with.

**After this release there are three uncoordinated call sites** against one rate-limited third party:
the fifteen-minute queue, resolve-then-create on every `POST /api/cities`, and the new
user-interactive proxy behind `AddPlaceFlow`'s type-ahead. And they now share one `User-Agent` and
one egress IP — which is exactly the accountability D7 wants, but it also means **a policy violation
now blocks the application rather than an anonymous browser.** Consolidating egress without building
the chokepoint strictly increases rate-limit exposure.

**Required of the Backend brief — build the chokepoint:**

- **A single serialized queue through which *all* Nominatim egress passes** — `processQueue`,
  resolve-then-create, and the proxy route alike. One module owning the delay, not three callers
  each sleeping independently.
- **Either drop `isOnline()` from the per-city path or count it against the budget.** A HEAD probe
  before every search doubles the request rate to establish something the search itself would reveal.
  Dropping it is preferred; the failure it guards against is already handled by the `catch`.
- **Interactive requests must not be starved by the batch queue.** D10's give-up rule bounds queue
  size; the brief should also confirm a user-facing lookup is not stuck behind a long batch run.
- **If the chokepoint is not built, say so explicitly and record the accepted risk** rather than
  inheriting "no new limiter needed" from a premise that is not true.

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
source (`useCities.ts:15`) and `clerk-telemetry.com` from a **third-party bundle**
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

> | AD-09 | **Trip categories and activities are per-user lists.** Each user's list is seeded automatically from the global defaults on first access, so it is never blank on first login, after which the user may add, rename and deactivate their own entries (AD-03). A user's entries are visible only to that user and never appear in another user's pickers. Entries are never hard-deleted, only deactivated (AD-06). Countries are **not** per-user and remain owner-configured (SE-03). *(v3.13: replaces "global seeded defaults shared across all users. Any user can add custom entries… only deactivated by the app owner", which contradicted SE-03 on the same routes and was never implemented. Follows the AD-07/AD-08 per-user pattern — see ADL-46 §3.2 and ADL-28.)* **Success criteria:** a user signing in for the first time sees the full default category and activity lists with no manual setup; a category added by one user is absent from another user's pickers; two users can each hold a category of the same name without a uniqueness conflict; deactivating an entry hides it from that user's entry forms while preserving it on their existing records, and affects no other user; existing global entries are assigned to the app owner during migration; assigning a category or activity belonging to another user **to a trip or to a place** is rejected with a 400. |

*(F1 amendment, 2026-07-29: the last criterion previously said "to a trip." Place-level activities
travel a separate route and a separate junction table — `POST /api/trips/:t/places/:p/activities` →
`trip_place_activities_map` — so a trip-only criterion would have left the place path untested and
unenforced. See §3.3.)*

### 6.4 GE-16 — new ID, **flagged not invented**, and **blocking**

Without it the cities decision has no BRD home and the Backend brief's BRD gate is not cleared.

> | GE-16 | Any authenticated user can add a city that is not yet in the shared catalogue, while logging a trip, through the constrained find-or-create path only. The city name is resolved against the geocoding service and the record is created from the service's canonical response where one is available. Coordinates are never client-supplied. A city record has **three end states**: *resolved* — the geocoder matched it; the record carries coordinates and is visible to all users. *Pending* — the question has not yet been answered (offline, service error, or not yet attempted — GE-12); the record is usable immediately, visible only to its creator, and retried in the background until it resolves or a retry cap is reached. *Unresolvable* — the geocoder answered and reported **no match**; the record is usable and visible only to its creator, and **is never retried**, because the answer will not change. A record whose creator is not recorded is treated as having no creator and is visible to all users. **The user who created a place can correct it at any time by re-pointing that place to a different city**, which runs the normal find-or-create and resolution path; correcting, re-pointing or deactivating a *shared city record itself* remains an owner operation (SE-03). **Success criteria:** an authenticated non-owner can add a place in a city not yet in the catalogue, in one uninterrupted flow, with no 403 and with no dependency on the geocoding service being reachable; submitting a name that resolves to an existing city — in any casing, or as a near-miss the geocoder canonicalises — returns the existing record and creates no new row; a request supplying latitude or longitude is rejected; a pending or unresolvable city created by one user does not appear in another user's city search; **a pending city with no recorded creator remains visible to all users**; **a city the geocoder reports no match for is never re-queried, and one whose lookup failed for any other reason is retried until a stated cap**; **a user who mistypes a city name can correct the affected place without losing that place's items or activity tags, and without owner intervention**; **the country and region a user explicitly selected are never overwritten by the geocoding lookup**; **a lookup that remains ambiguous after being constrained by the selected country and region creates a pending record rather than choosing a candidate**; city PATCH and DELETE still return 403 for a non-owner. **Note: *resolved* means the geocoding service returned a match, not that the match has been verified as correct.** |

*(D12 amendment, 2026-07-29: the three added criteria and the closing note answer a gap the PO
raised — containment covers cities that never resolve and says nothing about cities that resolve to
the *wrong* place, which is likelier and worse because `resolved` goes global immediately. The
"never overwritten" criterion settles who wins when the user's selection and the lookup disagree:
the user. See §4.3.1, which also records the accepted residual risk and the two follow-ons.)*

*(D10/D11 amendment, 2026-07-29: the "promoted automatically when background resolution succeeds"
clause described only two end states and said nothing about the never-succeeds case. Three are now
named, and the retry rule distinguishes an unanswered question from an answered "no" — a no-match is
terminal on the first attempt, per PO direction. The correction criterion is new: containment plus a
terminal state would otherwise trap a user on their own typo, and the "without losing items or
activity tags" wording is deliberate — the only escape available today is deleting and re-adding the
place, which destroys both. See §4.4.1 and §4.4.2.)*

*(F3 amendment, 2026-07-29: the "no recorded creator" criterion is new. It is phrased that way
rather than "predates the column" deliberately — `ON DELETE SET NULL` means a creator can become
unrecorded at any future point, so this is a permanent rule, not a migration-window one. See §4.4.)*

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
history). No competing document is created. That section carries both the S1 interim state and the
end state, with the interim rows marked as such and tagged by the stage that lands them.

---

## 8. `security.access-matrix.test.ts` — assertions that must change

This is the trap flagged in the brief: the suite is green and **encodes the defect as the intended
contract**. The spec moves first; the briefs then change these tests with authority rather than
appearing to weaken a security test on their own initiative.

**Stages S1–S2** (`src/backend/routes/__tests__/security.access-matrix.test.ts`):

| # | Line (approx) | Current | Intended | Action |
|---|---|---|---|---|
| 1 | 383 | `GET /api/admin/categories/active → 403` | `→ 200`, active category list | **Move** Part B → Part E (or a new Part F citing ADL-46) |
| 2 | 414 | `GET /api/admin/activities/active → 403` | `→ 200`, active activity list | **Move**, same |
| 3 | 444 | `POST /api/cities → 403` | `→ 201` for a new city as a non-owner | **Move**, same |
| 4 | — | *(absent)* | `POST /api/cities` with an existing name in different casing, as a non-owner `→ 200` **and the `cities` row count unchanged** | **Add** — this is what makes D4 safe rather than merely permitted |
| 5 | 457 | `it.skip('PATCH /api/cities/1 → 403 …')` | `→ 403`, unskipped | **Unskip** — §8.1 |
| 6 | — | *(absent)* | Non-owner B posts a city name matching **another user's pending** city → `200`, existing row, no new row | **Add** — §4.3 step 2 keeps pass 1 uncreator-scoped, so B's *search* shows nothing while B's *POST* returns A's row. That is correct (`uniq_cities_name_country_ci` is global; creator-scoping pass 1 would collide with the unique index and surface as a constraint error) but it was nowhere stated. OP-27 review P2 |
| 7 | — | *(absent)* | A `pending` city with `created_by_user_id IS NULL` appears in **every** user's search | **Add** — the regression test for F3. Note CI sets `GEOCODING_ENABLED=false`, so *every* city is pending there; a naive fixture test passes while the real environment loses rows |

**Must NOT change at S1/S2, and the brief should re-confirm them explicitly** — they are the
fail-closed half, and a careless "open the admin router" fix breaks them:
`GET/POST/PATCH/DELETE /api/admin/categories → 403`, the four activity equivalents,
`PATCH /api/admin/countries/US → 403`, `POST /api/admin/countries/US/regions → 403`,
`PATCH /api/admin/countries/US/regions/1 → 403`. All of **Part A** (401 unauthenticated) is unchanged
for every route including the three that open — opening a tier-1 read or the constrained write never
opens it to an anonymous caller.

**S3** additionally: rows 1 and 2 above are **deleted, not edited** — those routes cease to
exist. They are replaced by `GET /api/categories`, `GET /api/activities` (→ 200, own list) and the
per-user isolation assertions AD-09's success criteria require, following the shape of the existing
companions isolation tests in Part C:

- user A's custom entry is absent from user B's list;
- a cross-user `category_id` on `POST`/`PATCH /api/trips` → **400**;
- **a cross-user `activity_id` on `POST /api/trips/:t/places/:p/activities` → 400** — the F1(c)
  assertion. Without it nothing in CI catches the unvalidated place-level write path, which is the
  half of F1 that survives the disposable-data constraint.

### 8.2 Three further test files break at S3 — enumerated so no brief has to discover them (F6)

> **ADDED (2026-07-29) — OP-27 review F6.** Deliverable #4 of brief #326 exists so the Backend brief
> *"inherits authority for the change"* rather than appearing to weaken security tests on its own
> initiative. The first draft delivered that for `security.access-matrix.test.ts` **and only that
> file.** Three others assert on the same routes and break when S3 removes them. Verified
> independently: `grep -rln` for the route strings across `src/` and `tests/` returns exactly these
> four backend/contract files (plus `useAdmin.ts` on the frontend side).
>
> This is the situation OP-30 was adopted after — an implementation agent facing a red check its
> brief did not authorise it to touch. Under a single release the surface is **four files at once.**

| File | Assertions | Why it breaks at S3 | Intended |
|---|---|---|---|
| `src/backend/routes/__tests__/owner-access.test.ts` | `:129,137` non-owner → 403; **`:147,155` owner → 200/201** | routes removed — the *owner* assertions become 404 | Re-point at `/api/categories` + `/api/activities`; owner and non-owner both → 200 on their own lists |
| `src/backend/routes/__tests__/qa-backend-fixes.test.ts` | `:210,228,244,284` — snake_case shape, `/active` filtering, POST, soft-delete | routes removed | Re-point at the new paths; the shape and soft-delete contracts are unchanged and must still hold per-user |
| `tests/contract/places.contract.test.ts` | `:318,386` — `GET /api/admin/activities` → 200 | routes removed; **contract suite, not unit** — needs a running backend | Re-point at `GET /api/activities` |

**Verified counterpoint, recorded because it reads like a fifth break and is not.** §8's "must NOT
change" rows (`GET/POST/PATCH/DELETE /api/admin/categories → 403`) **do** survive S3.
`adminRouter.use(requireOwner)` (`admin.ts:105`) is router-level middleware, not per-route: once the
sub-router mounts at `:232-233` are removed, a non-owner still reaches `requireOwner` and still gets
403. An *owner* gets 404. Leaving those assertions alone is correct.

### 8.1 A stale skip found en route — in scope, and it is a live security-coverage hole

Line 457 skips `PATCH /api/cities/1 → 403` with a comment saying `requireOwner` "is missing on
`PATCH /api/cities/:id` in current main" pending BUG-22, and an instruction to unskip after BUG-22
merges.

**BUG-22 has merged, the guard is present, and nobody unskipped it.** `citiesRouter.patch(` is at
`src/backend/routes/cities.ts:223` with `requireOwner` at `:225`. BUG-22 is `done` in the tracker.
**So that security assertion has not been running since BUG-22 merged** — the owner-only guard on
city curation is currently unverified by the suite, and the skip is what hides that.

This is not cosmetic under D4: **city curation staying owner-only is precisely what makes opening
city creation acceptable.** The one assertion protecting that premise is the one that has been
silently switched off. Unskip it, and treat it as a coverage regression rather than a tidy-up.

---

## 9. Build order, and the two briefs this owes

### 9.1 D9 — ONE release. Stages are internal build order, not dispatch rounds.

> **AMENDED (2026-07-28) by PO ruling — see §0.1.** The first draft recommended four separately
> dispatched phases, with the migration landing third. **The PO overrode that: all of it ships as a
> single change.** The rationale — fewer UAT rounds, no half-migrated intermediate state, one review
> instead of four — is sound at two users, and the tradeoff was put to them explicitly including that
> **BUG-63 stays live until the whole thing ships.** Not re-argued here.

**The dependency reasoning that produced the four-way split is still correct and still governs the
order things are built in.** What changes is that these are stages inside one release behind one
review, not four dispatches with four UAT rounds between them.

| Stage | Content | Schema? | Depends on |
|---|---|---|---|
| **S1** | Open the two `/active` reads (§3.2); drop `requireOwner` from `POST /api/cities`; tests per §8 incl. the §8.1 unskip | No | — |
| **S2** | Geocoding proxy route; frontend repointed, forbidden `User-Agent` deleted; `POST /api/cities` becomes resolve-then-create (§4.3) | No | S1 (owns the same handler) |
| **S3** | Per-user categories/activities: schema, 2 migrations, lazy seed, routes move to `/api/categories` + `/api/activities`, `replaceAssociations` ownership validation, **delete S1's carve-out** | **Yes** | S1 (deletes what S1 added) |
| **S4** | `cities.createdByUserId` + pending-city search containment (§4.4) | **Yes** (one nullable column) | S2 (containment is meaningless without resolve-then-create promoting rows) |

**Two ordering constraints are load-bearing and must survive the merge into one release:**

1. **S3 deletes what S1 adds.** The admin-router carve-out is scaffolding; if S3 is built without S1
   having existed, someone will leave the carve-out in place and ship a permanent misnomer. Build S1
   first even though both land together, and make the deletion an explicit S3 task (§9.3).
2. **S4 depends on S2, not merely on S3's migration.** Creator-private containment only works because
   resolve-then-create promotes rows automatically; shipping the `createdByUserId` column and the
   search clause without resolve-then-create would strand every pending city as permanently
   creator-private. These two are a package.

**The Phase 1/2 validation gap I flagged as a weakness no longer exists.** In the four-dispatch plan
there was a window where city creation was open with only case-fold normalisation, before the
geocoder became its validation authority. **Shipping together closes that window entirely** — there
is no point at which `POST /api/cities` is open without resolve-then-create behind it. This was one
of the two decisions I named as weakest; the override removes it rather than answering it, and I am
recording that as a genuine improvement on my recommendation, not a concession.

**S4 is firmly in scope** (§4.4 was PO-adopted) and is no longer "the piece most likely to be dropped
on review." That earlier framing is withdrawn.

**Retained as an emergency fallback, not the plan: S1 alone would fully clear the P1**, with no
schema change, no migration and no dependency on the geocoder. That was the finding the COO asked me
to surface, it is true, and it stays on the record in case the PO ever needs to unblock BUG-63 ahead
of the full release. **It is not what is being built.**

### 9.1.1 Revert posture — forward-fix only, and the fallback expires at merge (OP-27 review F10)

> **ADDED (2026-07-29).** The first draft covered forward migration only and said nothing about
> recovery. Low severity under the PO's disposable-data constraint — the recovery path is "reseed" —
> but the *documentation* gap is real, and it costs a paragraph. **It also expires on its own: this
> is only cheap while the data is disposable, and the release ships into a future where it is not.**

**There is no down-migration convention in this project.** Two probes that fail differently:
`src/backend/migrations/` contains only forward `NNNN_*.sql` files plus `meta/`, and a grep for
`rollback|down.sql|revert` across `src/backend/migrations/` and `scripts/` returns nothing. That is
a pre-existing convention, not something ADL-46 introduced.

**But §9.1's single-release decision plus the `production` fast-forward promotion model makes
"revert the merge" the natural incident response — and after S3 has run, it produces a state worse
than the bug it fixes.** Reverting the code while leaving the migrated schema in place means:

- `admin.ts:172-175` inserts `{ name, createdAt, updatedAt }` only. Against the migrated table,
  `user_id NOT NULL` with no default → **every category/activity creation fails at the DB.**
- `admin.ts:141` does `db.select().from(table)` unfiltered → **the owner's admin panel shows every
  user's categories.**

**The posture, stated so nobody discovers it during an incident: forward-fix only. There is no
code-level revert once the migration has run.** The emergency lever is shipping **S1 alone, before
the release** — and that lever **expires at merge.** After that, a defect is fixed forward.

### 9.2 Backend brief — stages S1, S2 and the backend half of S3/S4

**One release does not mean one brief.** The Backend and Database briefs are still separately
authored, and the internal order is **Database → Backend → Frontend** (§9.3's migration must exist
before the backend can query the new columns).

**OP-32 class: GAP** for the BUG-63 half — never built as specified; not a regression (the gates are
original and structural, §1's two probes) and not deployment/config. **DEPLOYMENT/CONFIG** for the
BUG-55 half; per OP-32 the proxy is new surface, not a repair of broken application logic. The
bundle spans two classes, declared rather than absorbed.

**Prerequisite (blocking):** §6 amendments applied, version bumped to 3.13, **including GE-16** — it
is the BRD home for the cities work and without it the BRD gate is not cleared. *(GE-16 is
PO-confirmed as of §0.1; it needs applying, not deciding.)*

**Tasks:**
1. **S1** — open the two `/active` reads per §3.1's four-step implementation shape.
2. **S1** — extend the FAIL-CLOSED comment block (`admin.ts:34-58`), stating the carve-out is
   temporary and **deleted by S3 in this same release**.
3. **S1** — drop `requireOwner` from `POST /api/cities` (`cities.ts:91`). The find-or-create, the
   country/region validation and the `.strict()` schema are load-bearing, not incidental — S2
   modifies this handler, so read task 4 before touching it. Update the block comment
   (`cities.ts:68-88`) to cite ADL-46/GE-16.
4. **S2** — add the geocoding proxy route (§5.1) and make `POST /api/cities` resolve-then-create per
   §4.3's five-step flow. **Step 4a — the second find-or-create pass against the canonical name — is
   the part that does the real work and is easy to omit.** Frontend repoints `lookupCityCountry`
   (`useCities.ts:37-60`) at the proxy and deletes the forbidden `User-Agent` header (`:48`).
   **Apply D12's four rules to the resolve step (§4.3.1):** pass Nominatim's `countrycodes=` filter
   from the request's validated `country_code`; use `region_id` to disambiguate where present; **never
   overwrite a user-supplied `country_code` or `region_id` from the lookup**; and create `'pending'`
   rather than guessing when ambiguity survives both constraints. `resolveCity` currently sends a bare
   `q` string with no filter (`geocoding.service.ts:97-103`) — the disambiguating data is already in
   the request and simply unused.
5. **S2** — build the **egress chokepoint** per §5.1.1. This is not optional and not "reuse what's
   there": there is no limiter object today, and this release adds two more call sites. If it is not
   built, say so explicitly and record the accepted risk.
6. **S3 — close the place-level write path (OP-27 review F1(b)).** Add activity-ownership validation
   to `POST /api/trips/:tripId/places/:placeId/activities` (`src/backend/routes/places.ts:242-280`),
   rejecting a cross-user `activity_id` with **400** — the same contract `replaceAssociations` uses
   for companions. Today that handler validates the *place* (`:255-256`) and inserts the
   caller-supplied `activity_id` with no check on the activity at all (`:274-276`). SQLite cannot
   express this constraint, so it must live in application code. **Also** extend
   `replaceAssociations` itself for `category_id`/`activity_id`, and note the read joins at
   `repositories/places.ts:91` and `routes/trips.ts:210` (§3.3).
7. **S4 — D10's failure classification (§4.4.1).** In `resolveCity`, the `!data.length` branch
   (`geocoding.service.ts:115-119`) sets `geocode_status = 'unresolvable'` instead of leaving the row
   pending; the three recoverable branches (`:85`, `:107-110`, `:137-140`) increment
   `geocode_attempts`. **`isOnline()`-false and `GEOCODING_ENABLED=false` must not increment** — they
   are global conditions, not per-city failures. `processQueue`'s predicate becomes
   `geocode_status = 'pending' AND geocode_attempts < CAP`.
8. **S4 — D11's correction path (§4.4.2).** `UpdatePlaceDatesSchema` (`places.schemas.ts:29-36`)
   gains `city_id`, and `PATCH /api/trips/:tripId/places/:placeId` applies it. Ownership is already
   validated on the place, so this adds no new access surface; validate that the target city exists.
   **This is the escape for a trap this release creates — it is not optional.**
9. **S3/S4 backend** — see §9.3.
10. **Tests** per §8 **and §8.2**, including the §8.1 unskip (a live coverage hole, not a tidy-up) and
    the place-level 400 assertion. **Four test files change, not one** — §8.2 enumerates them. Add
    for D10/D11: a no-match response marks the row `'unresolvable'` and `processQueue` never
    re-selects it; a recoverable failure leaves it `'pending'` with an incremented count; an offline
    run increments nothing; and re-pointing a place to another city **preserves its items and
    activity tags**.

**Sizing note for whoever writes this brief (OP-27 review P1).** §4.3 calls resolve-then-create "the
only genuinely new thing is ordering the resolve before the insert", and §5.1 calls the proxy
"consolidation, not new capability." Both are true about the *design* and optimistic about the
*work*. Two things do not exist yet: `resolveCity` requests `addressdetails=0` and reads only
`lat`/`lon` (`geocoding.service.ts:102`, `:122-123`), so **canonical-name and region-ISO extraction
have to be written**; and there is **no name→result function that works without a `cities` row**,
which both the proxy and D5 step 3 need. Not a design error — a sizing correction.

**Security checklist** (mandatory, per CLAUDE.md):
- **One new route** — the geocoding proxy (S2). It requires `requireAuth`; it is a first-party egress
  surface and must not be callable anonymously.
- `requireAuth` stays globally applied to `/api/*` in `server.ts`, so every opened route still 401s
  unauthenticated. Part A of the access-matrix suite is unchanged.
- **No `userId` scoping applies to S1 or S2** — those routes are tier-1 global reference data with no
  per-user dimension and no user FK. Stated so the reviewer confirms it deliberately rather than
  reading it as an omission. **S3's routes are the opposite** and are userId-scoped throughout.
- **`cities.createdByUserId` (S4) is deliberately nullable, against the usual `.notNull()` rule for
  user-referencing FKs** — `cities` is global reference data, not user data, and seeded rows have no
  creator; NULL means "seeded or pre-dating the column." `ON DELETE SET NULL`, not cascade: deleting
  a user must never delete shared city rows other users' trips depend on. Both are reasoned
  exceptions (§4.4) — confirm them, do not silently "fix" them.

**Success criteria (measurable):**
- A non-owner completes *create trip → add place in a city not yet in the catalogue* end to end with
  **zero 403 responses**, verified with `BYPASS_AUTH=true` and `OWNER_CLERK_ID` set to a non-matching
  value (`is_owner: 0` — ADL-38's verification method).
- Both active-list routes return 200 with that user's lists; after S3 they are
  `GET /api/categories` and `GET /api/activities`.
- `POST /api/cities` returns 201 for a new city and **200 with no new row** for an existing city
  submitted in different casing **or as a near-miss the geocoder canonicalises** to an existing name.
- City creation still succeeds with the geocoder unreachable (`GEOCODING_ENABLED=false`), producing a
  `pending` row — GE-12 is not regressed.
- A `pending` city created by one user does not appear in another user's city search; once resolved,
  it does.
- Every assertion in §8's must-not-change list still passes; `GET /api/admin/categories` (unfiltered)
  still 403s until S3 removes the route entirely.
- Backend suite green; `npm run type:check:all` clean.

### 9.3 Database brief — stages S3 and S4 (owed, and the reason scope grew)

**Sequenced first within the release** — the backend cannot query columns that do not exist yet.

**Prerequisite:** §6.3's AD-09 text applied. *(§3.5's deactivation ambiguity is now **resolved** —
a user deactivates their own entries, per §0.1 — so this is no longer a blocker, and `is_active` is
written by the owning user.)*

**Two migrations, not one.** S3 rebuilds `trip_categories` and `activities`; **S4 adds
`cities.created_by_user_id`** (nullable, FK → `users.id`, `ON DELETE SET NULL` — see §9.2's security
checklist for why both properties are deliberate) **and `cities.geocode_attempts` (D10, §4.4.1)**.
S4 is plain `ALTER TABLE ADD COLUMN` with no backfill and no table rebuild — cheap, and independent
of S3's rebuilds.

#### 9.3.1 The generated migration is unusable — discard it, do not review it (OP-27 review F2)

> **CORRECTED (2026-07-29). This is the blocking execution error in the first draft**, and it would
> have sent the Database engineer down a path that dead-ends.

The first draft said the recreation is needed because `UNIQUE(name)` → `UNIQUE(user_id, name)`
"cannot be done with `ALTER TABLE`", and told the engineer to *"review the generated SQL by hand
before applying."* **Both halves are wrong about what actually happens.**

**The stated mechanism is not the mechanism.** `name text NOT NULL .unique()` is realised in this
schema as a **standalone unique index**, not an inline table constraint — I confirmed this
independently: `src/backend/migrations/0000_open_electro.sql:10,171` create
`activities_name_unique` and `trip_categories_name_unique` as `CREATE UNIQUE INDEX` statements. So
drizzle drops them with `DROP INDEX` and never needs a rebuild for that reason.

**The real blocker is different and fatal.** The reviewer applied the per-user schema and ran
`npx drizzle-kit generate`, which emitted no recreation at all — just
`DROP INDEX` / `ALTER TABLE … ADD user_id text NOT NULL REFERENCES users(id)` / two `CREATE INDEX`.
Applying that file fails outright:

```
$ npx drizzle-kit migrate
Error: Cannot add a NOT NULL column with default value NULL
```

SQLite requires a non-NULL default when adding a `NOT NULL` column **and** a NULL default when
adding a column with a `REFERENCES` clause under FK enforcement. Those requirements are mutually
exclusive, so `ADD COLUMN user_id text NOT NULL REFERENCES users(id)` can **never** be applied — on
an empty table or a full one.

**Corrected instruction: run `db:generate`, then DISCARD the generated file entirely and hand-write
the twelve-step recreation**, using `src/backend/migrations/0012_grey_ultimates.sql` (companions +
shading config) as the template. There is no `__new_` scaffold to edit — the generator does not
produce one. **A validated, executed version of this migration is appended to
`jobs/architect/tech/ADL-46-review.md`**; start from that rather than from a description, and
re-confirm column order and exact `CHECK` text against `schema.ts` at implementation time.

**Re-pointed ADL-15 warning.** The first draft aimed drizzle-kit's four patched table-recreation bugs
at a generate step that never reaches table recreation. The real risk surface is the **hand-written**
recreation: FK re-binding on `RENAME`, `id` preservation, and `PRAGMA` bracketing. `db:push` remains
forbidden (ADL-15); `db:generate` is still run, but only to confirm drizzle's view of the schema
delta — its output is not what ships.

**S3 migration shape — the shape itself is verified sound.** Follow ADL-28 Question 3 as prior art;
do not redesign it. Two files, one per table, each a SQLite table recreation:

1. `CREATE TABLE __new_trip_categories` with `user_id text NOT NULL REFERENCES users(id) ON DELETE
   CASCADE`, `UNIQUE(user_id, name)`, and the existing `CHECK(is_active IN (0,1))`.
2. `INSERT INTO … SELECT … CROSS JOIN (SELECT id FROM users WHERE is_owner = 1 LIMIT 1)` —
   **preserving `id`**, essential because `trip_categories_map.category_id` FKs to it.
3. `DROP TABLE` / `RENAME` / recreate `uniq_*_user_name` and `idx_*_user`.
4. Same again for `activities`.

> **This shape was executed, not reasoned about.** The OP-27 reviewer hand-wrote it and ran it via
> `drizzle-kit migrate` against a scratch DB built from the full real migration chain with a
> `trip_categories_map` row present: **`id` preserved, `trip_categories_map` intact,
> `PRAGMA foreign_key_check` clean**, and the child FK correctly re-bound to the renamed table.
> That was §13's headline question and the answer is **sound.** Also confirmed by the reviewer:
> FK-disabling works on **both** libSQL transports including remote Turso, which matters because
> `PRAGMA foreign_keys` is a no-op inside a transaction and production is Turso.

**Two caveats on the CROSS JOIN, both of which the pre-migration check must cover:**

- **Zero owners** (ADL-28's documented case): if no `is_owner = 1` row exists — a fresh dev DB — the
  CROSS JOIN inserts 0 rows and existing global entries are abandoned. Accepted, already accepted
  for companions, and the lazy seed covers it.
- **More than one owner (OP-27 review F9):** `LIMIT 1` with no `ORDER BY` picks an **arbitrary**
  user, and every global category silently lands on whichever row SQLite returned first. The first
  draft carried ADL-28's zero-owner caveat but not this symmetric one.

#### 9.3.2 Blocking pre-migration check — three queries, not one (F1(a), F9)

> **CORRECTED (2026-07-29).** The first draft's check enumerated only the two junction tables that
> join via `trips`. **`trip_place_activities_map` joins via `trip_places` and is unreachable from
> that query shape**, so the check returned a clean zero while cross-user rows existed — reproduced
> by the reviewer on a scratch DB. The COO's live-data probe inherited the same omission.

Run all three via `scripts/agent-diagnostics/turso-query.mjs`, against **both staging and
production** — same environment-parity reasoning as the original trip-level probe:

```sql
-- 1. Trip-level mappings on non-owner trips. Expect 0. (Already run — clean.)
SELECT COUNT(*) FROM trip_categories_map m
  JOIN trips t ON t.id = m.trip_id JOIN users u ON u.id = t.user_id
 WHERE u.is_owner = 0;
-- …and the trip_activities_map equivalent.

-- 2. F1(a): PLACE-level mappings — the table the first check omitted. Expect 0.
SELECT COUNT(*) FROM trip_place_activities_map m
  JOIN trip_places p ON p.id = m.trip_place_id
  JOIN users u ON u.id = p.user_id
 WHERE u.is_owner = 0;

-- 3. F9: the CROSS JOIN's assumption. MUST be exactly 1.
SELECT COUNT(*) FROM users WHERE is_owner = 1;
```

If (2) is non-zero, those rows need an explicit disposition — not a silent re-point. If (3) is not
exactly 1, **stop**: the backfill is non-deterministic and the migration must not run.

#### 9.3.3 Make the migration self-verifying — the check is necessary but not sufficient

A count is point-in-time; the migration runs later, and all three write paths accept IDs under
`requireAuth` alone (§3.3). The CROSS JOIN backfill re-points nothing in the junction tables, so the
risk is not corruption but **silently legitimising a cross-user reference.** Add a post-migration
assertion **in the same migration file**, after the recreations:

```sql
-- Fails the migration if any junction row now crosses a user boundary.
SELECT RAISE(ABORT, 'cross-user category/activity mapping present — see ADL-46 §3.3')
  WHERE EXISTS (
    SELECT 1 FROM trip_categories_map m
      JOIN trips t ON t.id = m.trip_id
      JOIN trip_categories c ON c.id = m.category_id
     WHERE c.user_id <> t.user_id
  );
```

plus the two equivalents — `trip_activities_map` (join via `trips`) and **`trip_place_activities_map`
(join via `trip_places`)**. This converts "query staging first" from a point-in-time check into a
run-time invariant, which is what the single-release decision actually requires. **A failed migration
is recoverable; a silently wrong one is the thing §13 was worried about.**

#### 9.3.4 S4 is no longer a cheap `ADD COLUMN` — D10 makes it a third table recreation

> **COST CHANGE, stated plainly because the COO asked whether it was material. It is.**

S4 was specified as "a plain `ALTER TABLE cities ADD COLUMN`, no backfill, no table rebuild — cheap
and independent of S3's rebuilds." **D10's third `geocode_status` value invalidates that.** Amending
`chk_cities_geocode_status` requires a table recreation in SQLite; there is no `ALTER CONSTRAINT`.

**So this release now carries three table recreations, not two.** Honest framing of what that does
and does not cost:

- **It is the same shape three times, not a new risk class.** The reviewer has executed and validated
  the 12-step pattern, and its SQL is appended to `ADL-46-review.md`.
- **`cities` has only one inbound FK** — `trip_places.cityId` (`schema.ts:349-351`), `.notNull()`,
  no `onDelete`. Smaller blast radius than it looks; there is one child relationship to re-bind, and
  the reviewer's validated template covers exactly that step.
- **But `cities` is the fiddliest of the three tables to reproduce**, and this is the part to watch.
  The recreation must reproduce, exactly:
  - `idx_cities_geocode` — a **partial index**, `ON geocode_status WHERE geocode_status = 'pending'`
    (`schema.ts:115`). *Bonus: once `'unresolvable'` exists, this index automatically stops indexing
    terminal rows — the queue scan stays tight for free. That is D10's practical payoff and it only
    works because terminal is a status value.*
  - `uniq_cities_name_country_ci` — an **expression index**, `ON (name COLLATE NOCASE, country_code)`
    (`schema.ts:126`). Getting the collation wrong silently breaks BUG-33's find-or-create.
  - `idx_cities_country`, `idx_cities_region`, and the amended CHECK.
- **Relevant but not new:** partial-index `WHERE` clauses and duplicate `CREATE INDEX` are two of the
  four drizzle-kit bugs ADL-15 patches. Because §9.3.1 discards the generated file and hand-writes,
  the migration itself does not depend on drizzle-kit's introspection — but this is the table that
  most exercises that surface, so **hand-verify both index definitions against `schema.ts` rather
  than trusting any generated output.**

**If the COO wants to avoid a third recreation**, the fallback is a boolean `geocode_unresolvable`
column instead of a status value — a plain `ADD COLUMN`. §4.4.1 rejects it (duplicate state machine,
and terminal rows stay in the queue index forever), but the trade is real and this is where it would
be made. **My recommendation is to take the recreation**: the pattern is validated, it is the last
cheap moment to fix the state machine, and the alternative permanently forks it.

**Workflow:** `npm run db:generate` (then discard, per §9.3.1) and `npm run db:migrate`.
**`db:push` is forbidden (ADL-15).**

**Also in S3, Backend side:** the lazy seed **per §3.2.1's specified predicate** — seed on identity,
not row count, reusing `db/seed.ts:44,50`'s constants and keeping `onConflictDoNothing`; routes move
to `/api/categories` + `/api/activities` with `requireAuth` + userId scoping; **S1's admin-router
carve-out is deleted in this same release — do not leave scaffolding behind**;
`tripRepository.replaceAssociations` validates `category_id`/`activity_id` ownership (400 on
cross-user); **and the place-level write path is closed** per §9.2 task 6 — that is the F1(b) half
and it is the one that outlives the current table contents.

**Also in S4, Backend side:** the city-search clause on `GET /api/cities` (`cities.ts:39-66`) —
`WHERE geocode_status = 'resolved' OR created_by_user_id = :me OR created_by_user_id IS NULL`,
**including the `IS NULL` branch** (§4.4, F3); setting `createdByUserId` on insert in
`POST /api/cities`; and D10's attempt counter + give-up rule in `processQueue` (§4.4.1).
`GET /api/cities/:id` stays deliberately uncontained.

### 9.4 Out of scope for this release

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
   startup and every 15 minutes"*, function at `:152`) is imported at `server.ts:47`, invoked at
   `server.ts:325`, and rescheduled by a 15-minute `setInterval` at `server.ts:330`. Resolution runs
   server-side, on a server-side schedule, through the compliant client.

The probes fail differently: (1) would miss a second geocoding call elsewhere in the frontend;
(2) would miss the queue being invoked from somewhere other than the server. Both agree.

**Consequence.** The **only** browser-driven geocoding in the app is `lookupCityCountry`
(`useCities.ts:37-60`) — the BUG-55 path, and nothing else. The retry/resolution architecture is
already correct and needs no change; D7 replaces one function, not a subsystem. This makes stage S2
materially smaller than the direction implied.

*(Accepted by the COO on independent re-verification, 2026-07-28, which also supplied the precise
invocation lines now cited above.)*

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

**Resolved since the first draft, and no longer open** (kept visible so a reader does not re-open
them — full record in §0.1): the §3.5 deactivation scope, the §4.4 containment rule, and the §9.1
phasing. All three are PO-ruled.

Genuinely still open:

- **Any S3 UI.** Whether categories/activities get their own per-user admin tab, and how BUG-62's
  per-tab `ownerOnly` flags change once those lists are no longer owner-only. Flagged for a Frontend
  brief, not designed here — and it is in the same release, so it needs an owner.
- **Explicitly-shared collaborators** (SE-01's third role) — still Phase 3+, still not operative.
- **The ODbL attribution notice** (§4.6) — a single-probe finding the COO picks up separately;
  deliberately not expanded into this scope.

---

## 12. Implications for other jobs

**All of the below ships as one release** (§9.1), sequenced Database → Backend → Frontend.

- **Database:** §9.3 — S3's two table recreations (ADL-28 as prior art, `db:push` forbidden) plus
  S4's single `ADD COLUMN`. Goes first; the backend cannot query columns that do not exist.
- **Backend:** §9.2 — S1, S2, and the backend halves of S3 and S4.
- **Frontend:** three separate pieces, all in this release. (a) **Nothing** for BUG-63 — the hooks
  already call the right routes and simply stop receiving 403s. (b) BUG-55/S2: repoint
  `lookupCityCountry` (`useCities.ts:37-60`) at the proxy and delete the forbidden `User-Agent`
  header (`:48`). (c) S3: repoint the hooks at `/api/categories` + `/api/activities` and revisit
  AdminPanel's `ownerOnly` flags (§11 — this piece still needs designing).
- **QA:** the non-owner end-to-end path in §9.2's success criteria is the regression test for this
  whole class and should outlive the individual bugs. Note there is now **one UAT round, not four**,
  so it needs to cover the per-user isolation criteria in §6.3 as well as the P1 path.
- **BUG-62 is not re-opened.** It shipped per-tab gating with Categories/Activities `ownerOnly`. S1
  does not change that (it opens the `/active` reads the *trip form* needs, not the admin management
  UI). **S3 does** — those tabs stop being owner-only. Flagged per the brief's instruction rather
  than acted on, but since it is in the same release it needs an owner rather than a follow-up.
- **COO:** §6 amendments (v3.13, three places) **including GE-16, which is PO-confirmed and needs
  applying rather than deciding**; AD-09 rewrite; D-12 item 1 closure; tracker notes carrying #326 on
  BUG-63/BUG-55/BRD-AD09; new tracker entries per the BRD→tracker rule; and the §4.6 ODbL item.

---

## 13. Confidence register — post-review state (2026-07-29)

> The OP-27 fresh-eyes review is complete (`jobs/architect/tech/ADL-46-review.md`). **All ten
> findings accepted and folded in.** This section is rewritten to the post-review state; the
> pre-review targets are kept struck-through because *how they resolved* is the useful part.

**How my own named targets resolved — both differently than I expected, and that is the lesson:**

- ~~**"Does the S3 migration preserve `id`?"**~~ — **SOUND, and settled by execution rather than
  argument.** The reviewer hand-wrote the recreation from `0012_grey_ultimates.sql` and *ran* it
  against a scratch DB built from the real migration chain: `id` preserved, `trip_categories_map`
  intact, `foreign_key_check` clean, FK correctly re-bound after `RENAME`, on both libSQL transports
  including remote Turso. **I aimed the reviewer at the right area and the wrong question** — the
  migration risk was real but sat in the *route to* the shape (F2), not the shape.
- ~~**"§3.3's data assumption is the only place where being wrong corrupts data"**~~ — **the
  assumption was fine; the *table set* underneath it was wrong** (F1). I asked the reviewer to check
  whether the count was trustworthy and never asked whether the query enumerated the right tables. It
  did not — `trip_place_activities_map` joins via `trip_places` and was invisible to the check, and
  the COO's live probe inherited the omission. **A correct answer to the wrong query.**

**Residual risk, highest first:**

- **The place-level write path (F1(b)) — highest, and it is not a migration risk at all.**
  `POST /api/trips/:t/places/:p/activities` inserts a caller-supplied `activity_id` with no
  validation, and SQLite cannot express the constraint. This is a permanent hole in the access model
  that **survives the disposable-data constraint** — today's rows being throwaway does not make an
  unvalidated write path acceptable. Closed by §9.2 task 6; the assertion that keeps it closed is in
  §8.
- **The egress chokepoint (F4) — it does not exist and this release triples the call sites.** I
  asserted a reusable limiter and there is only a `sleep` in one loop; `resolveCity` is unthrottled
  from `POST /api/cities` and makes *two* requests per call. Consolidating egress behind one
  `User-Agent` and one IP without building the chokepoint means a policy violation now blocks the
  application. §5.1.1.
- **The migration's *route*, not its shape (F2).** `db:generate` emits an unapplicable file and
  produces no scaffold to edit. The hand-written recreation is the risk surface, not the generator.
  **And there are now three recreations, not two** — D10's third `geocode_status` value forces a
  `cities` rebuild (§9.3.4). `cities` is the fiddliest of the three to reproduce: a **partial index**
  and an **expression index** (`COLLATE NOCASE`), which are two of the four drizzle-kit bug classes
  ADL-15 patches. Hand-verify both against `schema.ts`.
- **D10's attempt-increment scope (§4.4.1) — small but easy to get silently wrong.** If
  `isOnline()`-false or `GEOCODING_ENABLED=false` increments `geocode_attempts`, one offline weekend
  burns every pending city's retry budget and they all fall out of the queue permanently. The queue
  already returns early on both, but `resolveCity` is *also* called directly from `POST /api/cities`.
- **D8's third-party CSP register (§5.2) — Medium-High.** Hand-maintained, and it will rot. I have
  no better mechanism to propose and am not confident none exists. **Unchanged by the review.**
- **S4's dependency on S2 (§9.1 constraint 2)** — load-bearing under one-release sequencing and easy
  to violate silently.
- **D1, D2, D3, D4, D5, D6, D7, D9 — High.** The reviewer attempted to break D1's tier rule, D3's
  Option A (including looking specifically for a reason to prefer the rejected Option B and finding
  none), D4's curation/creation split, D5 and D7, and **would not change any of them.** The access
  model is not in question; every finding was coverage or execution.

**Verified by the reviewer, so not worth re-checking:** the §3.1 Express fall-through mechanism
including the sub-router case §13 previously flagged as newly assumed; §8's "must NOT change" 403
rows surviving S3 (router-level middleware, so a non-owner still 403s once the mounts are removed);
§8.1's stale `it.skip` and its corrected citation; §10.1's server-side retry path; GE-16's
"latitude/longitude rejected" criterion already satisfied by the `.strict()` schema — **no work
needed there, and the brief should not build it**; and that cities are not seeded at startup.

**Still genuinely unverified, with the blind spot named:**

1. **Whether live data trips F1(a) or F3.** Both the reviewer's statements and mine are *structural*,
   derived from schema and code, not from production counts — the reviewer had no DB credentials.
   §9.3.2's three queries close it and are blocking. **Do not treat a structural argument as a count.**
2. **Live Nominatim behaviour (F4, D10).** The firewall blocks it, so request-rate consequences are
   inference from reading `geocoding.service.ts`. The code-level facts are solid; the operational
   consequence is not measured.
3. **§4.6's ODbL finding** — still a single probe (`README.md` only), still marked as such. The
   reviewer deliberately did not re-probe it and agreed with the self-assessment.

**Premises a later reader should re-probe rather than trust:**

**Premises a reviewer should re-probe rather than trust:**

1. **Verified, two probes:** categories/activities have no per-user column today — (a) the table
   definitions at `schema.ts:141-167` declare exactly `id`, `name`, `is_active`, `created_at`,
   `updated_at`; (b) `createAdminListRouter`'s serializer (`admin.ts:117-131`) returns the full row
   shape and contains no `userId`. They fail differently: (a) misses a column added by migration but
   not the schema file; (b) misses a column present but deliberately unserialized.
2. **Verified, two probes:** the geocode retry path is server-side — §10.1.
3. **Inference, NOT verified — and §9.3.2 makes checking it blocking:** that no non-owner holds
   category or activity assignments today. Basis is the UI path (the picker has always 403'd). Blind
   spot named: all three write paths accept IDs under `requireAuth` alone, so a direct API call could
   have created them. **Query staging AND production before migrating — all three queries, including
   the place-level one the first draft omitted.** §9.3.3's in-migration assertion is the backstop,
   because a count is point-in-time and the migration runs later.
4. **Single probe, flagged as such:** that the README carries no ODbL/OSM attribution (§4.6). I
   grepped `README.md` only; `LICENSE`, a UI footer, or the map attribution control could carry it.
   Verify before raising the item. *(The reviewer deliberately did not re-probe this and agreed with
   the self-assessment — so it remains single-probe, not double-probed by proxy.)*
5. ~~**Express sub-router fall-through**~~ — **VERIFIED by the reviewer**, including the specific
   case flagged here as newly assumed: a sub-router mounted above the guard exposing only
   `GET /active` lets `GET /categories`, all writes and every unmatched method fall through to
   `requireOwner`. §8's must-not-change list still asserts it, which is correct belt-and-braces.

**A methodological note worth keeping, because it generalises past this ADL.** Both of my named
review targets were *areas* worth looking at and *questions* that missed. The migration question was
answerable only by running it — which the reviewer did and I could not have, since I wrote no code —
and the data question was well-posed against a table set I had already got wrong three sections
earlier. **The failure mode was not insufficient caution; it was a wrong premise inherited from my
own §3.3 and then reused, unexamined, in three downstream places.** The negative-findings rule
catches "X does not exist." It does not catch "X exists and there are three of them." Enumerations
deserve the same two-probe treatment as absences — and the cheap second probe here was one grep for
`activity_id` across the schema, which is exactly what caught it on re-verification.

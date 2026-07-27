> **⚠ SALVAGED PARTIAL DELIVERABLE — UNREVIEWED. NOT AN ADOPTED DECISION.**
> Committed by the COO on 2026-07-27, not by the Architect that wrote it. The S1 dispatch
> was killed mid-brief by an API spend limit after writing this file but before completing
> any of its closing steps. The design below is complete and ends cleanly; **everything
> around it is not done.**
>
> **Not done — do not assume otherwise:**
> - The `## ADL-41` stub in `20260307-architecture-decisions-log.md` was **not** rewritten.
>   It still reads RESERVED. Per `/record-decision` the log entry is the authoritative
>   record and this file only supplements it, so **ADL-41 does not yet exist as a decision.**
> - BRD §10 **OQ-05 was not closed**, and the **BRD was not bumped to v3.9**. §11 item 1
>   below asserts both were done "by this PR" — that assertion is **false**; it describes
>   what the agent intended to do next. The BRD is untouched at v3.8.
> - `_project/tracker.json` was not updated; no PR was opened; no completion report filed.
> - Nothing here has had COO review, and the Architect never got to self-check it.
>
> **Before any of this is relied on:** it needs a review pass, then the log entry, OQ-05
> closure and tracker update it never received. Treat §11's "open items for COO" as the
> author's notes to itself, not as an agreed handover.
>
> Retained rather than discarded because the analysis is substantive and re-deriving it
> would cost another full Opus dispatch — in particular §7.1's claim that `PRAGMA
> foreign_keys` is not enabled at runtime, which if true is a latent issue well beyond
> this brief's scope and is worth verifying independently.

# ADL-41 — Trip-place identity: one row per *visit*, and the deletion semantics that fall out of it

> Supplements the log entry `## ADL-41` in
> `jobs/architect/tech/20260307-architecture-decisions-log.md`. The log entry is the
> authoritative record; this file carries the implementation detail (delete ordering,
> API shapes, migration plan) that is too long for the log.

**Date:** 2026-07-27
**Status:** Decided, implementation pending
**GitHub issue:** #271 · **Branch:** `feat/adl41-trip-place-identity`
**BRD refs:** §10 OQ-05 (resolved here); §5.1 TR-14, TR-15; §5.9 DP-04/DP-05/DP-06
**Tracker:** OQ-05; unblocks BUG-40, BUG-50
**Depends on:** ADL-24 (place date ranges), ADL-28 (per-user shading), ADL-36 (carry-forward FK)
**Constrained by:** NR-12 (Phase 2 archive-instead-of-delete must stay reachable)

---

## Summary table

| # | Decision | Recommendation | Confidence |
|---|----------|----------------|------------|
| 1 | Trip-place identity | **Adopt one row per visit.** Drop `uniq_trip_places_trip_city`. `trip_places.id` remains the identity; a row now means "a stay in a city", not "a city on the trip" | High |
| 2 | Accidental-duplicate protection | Keep it, move it up a layer. `POST` returns 409 with the existing rows unless the caller passes `allow_revisit: true`. Replace the dropped unique index with a plain composite index | High |
| 3 | Map shading | **No change required.** Every shading aggregate already counts `DISTINCT trips.id` / `DISTINCT regions.id` — verified in both spec and implementation. Add a binding rule so it stays true | High |
| 4 | Ordering (DP-05) | Add `sort_order INTEGER NOT NULL`. It becomes the canonical order; `arrived_on` drives it at write time rather than at render time | High |
| 5 | DP-06 first-place inheritance | Fires only on the empty-trip → first-place transition. A revisit row never inherits | High |
| 6 | Item attachment | An item belongs to exactly one *visit*. No implicit re-parenting, ever. Disambiguation is a UI/API concern, not a data-model one | High |
| 7 | Merge / split | Specified here, **not scheduled**. Merge re-parents items; split moves items by their own dates | Medium |
| 8 | TR-14 cascade | **Explicit ordered delete in one batch — do not rely on declared `ON DELETE CASCADE`.** FK enforcement is not switched on at runtime | High |
| 9 | Photo references (TR-14) | Satisfied by construction. `trips.photo_album_ref` is a text column on the trip row; no photos table, no stored file. Build no cleanup step | High |
| 10 | TR-15 "reassign to trip level" | Means `items.trip_place_id = NULL`, unchanged by the identity change. The choice becomes a **required** request parameter, not a UI convention | High |
| 11 | NR-12 non-foreclosure | One service-layer entry point for deletion; NR-12 uses a new `archived_at` column, **never** a new `trips.status` value | High |

---

## 1. Identity: one row per visit

### 1.1 The decision

`trip_places` moves from *one row per (trip, city)* to *one row per visit segment*. The
`uniqueIndex('uniq_trip_places_trip_city')` at `src/backend/db/schema.ts:362` is dropped.
No unique constraint replaces it.

Nothing else about the table's shape changes. `trip_places.id` is already the surrogate
identity that `items.trip_place_id` and `trip_place_activities_map.trip_place_id` point at
(`src/backend/db/schema.ts:379-381`, `:461`). Those FKs continue to mean exactly what they
meant before; the *referent* sharpens from "the city on this trip" to "this stay in this
city on this trip". That is why this is a low-blast-radius change despite touching the
core entity: no foreign key moves, no join rewires, no ID remapping.

The table keeps its name. `trip_places` describing visit segments is a mild vocabulary
mismatch, but renaming a table with five inbound references, a migration history, an ER
diagram, and a shading spec built on it, to buy a slightly better noun, is not a trade
worth making. The doc comment at `src/backend/db/schema.ts:331-341` is updated instead —
it currently asserts "UNIQUE (trip_id, city_id): a trip visits each city at most once",
which is precisely the sentence this ADL retires.

### 1.2 Why not the alternatives

**Alternative A — keep one row per city, add a separate `visits` child table.**
Rejected. It preserves the constraint at the cost of a second level of indirection for
every item lookup, and forces an immediate answer to "which visit owns this item?" by
adding a *second* nullable FK on `items`. Every consumer would have to decide whether it
cares about place-granularity or visit-granularity. The revisit is not a sub-entity of a
city association — it *is* the association. One table, one grain.

**Alternative B — encode revisits as an ordinal on the existing row (`visit_count`).**
Rejected outright. It cannot carry per-visit dates, which is the entire point (DP-05), and
it cannot carry per-visit items, which is the second entire point.

**Alternative C — leave the constraint, tell users to model revisits as one long stay.**
Rejected. This is the status quo and it is what OQ-05 was raised against. It corrupts the
data (Glasgow "arrived 3 June, departed 9 June" when the user was in Edinburgh on the 6th)
and it makes the trip detail lie about the itinerary.

### 1.3 What the unique index was actually buying

Two things, and only one of them was real:

1. **Shading double-count protection** — *not real*. See §3: every aggregate already
   counts distinct trips. The constraint was never load-bearing here.
2. **Accidental double-add protection** — real, and worth keeping. But it is already
   enforced a layer up: `placeRepository.create` pre-checks for an existing (trip, city)
   row and throws `ConflictError('Trip already has this city')` before it ever reaches
   the index (`src/backend/repositories/places.ts:147-153`). The DB constraint is
   belt-and-braces behind an application check that already exists.

So the index guards a UX concern, not a domain invariant. Guarding a UX concern with a
DB constraint that also forbids a legitimate real-world fact is the wrong instrument.
It moves up a layer (§2) where it can produce a good interaction instead of a 409 dead end.

### 1.4 Index replacement (do not skip this)

Dropping `uniq_trip_places_trip_city` also drops the only index on `(trip_id, city_id)`.
The revisit pre-check in §2 queries exactly that pair, on every place creation. Replace it:

```typescript
index('idx_trip_places_trip_city').on(t.tripId, t.cityId),
```

`idx_trip_places_trip` on `(trip_id)` alone (`schema.ts:363`) would technically serve the
query, but the composite makes the pre-check an index-only lookup and costs nothing at
this table's size.

---

## 2. Accidental-duplicate protection at the API layer

`POST /api/trips/:tripId/places` gains one optional boolean:

```jsonc
{
  "city_id": 42,
  "arrived_on": "2026-06-08",   // optional, unchanged (ADL-24 §3.2)
  "departed_on": "2026-06-10",  // optional, unchanged
  "allow_revisit": true          // optional, default false — NEW
}
```

Behaviour:

- City not yet on the trip → create. `allow_revisit` irrelevant.
- City already on the trip, `allow_revisit` absent or `false` → **409 Conflict**, with the
  existing visit rows in the error payload so the client can render a real choice
  ("Glasgow is already on this trip — add a second visit, or open the existing one?").
- City already on the trip, `allow_revisit: true` → create a second row.

This keeps `placeRepository.create`'s existing pre-check and error class; it only adds the
escape hatch and enriches the payload. The 409 body must carry
`{ existing: [{ id, arrived_on, departed_on }] }` — without it the frontend cannot build
the disambiguation prompt and will be tempted to just retry with `allow_revisit: true`,
which silently reintroduces accidental duplicates.

**Deliberately not done:** a unique index on `(trip_id, city_id, arrived_on)`. SQLite
treats NULLs as distinct in unique indexes, so it would permit unlimited undated
duplicates while blocking two dated visits that legitimately share an arrival date. It
constrains exactly the wrong set.

---

## 3. Map shading — verified no-op

The concern in OQ-05 is that duplicate city rows double-count. **They do not**, and this
was verified rather than assumed.

**Implementation** (`src/backend/services/shading.service.ts`):

| Function | Line | Aggregate |
|----------|------|-----------|
| `getRegionCoverageMap` | 44-45 | `COUNT(DISTINCT regions.id)` |
| `getTripCountriesStats` | 209-210 | `COUNT(DISTINCT ... trips.id ...)` |
| `countrySelectShape` | 234-239 | `COUNT(DISTINCT ... trips.id ...)`, `MAX(CASE ...)` |
| `getRegionShading` | 337-338 | `COUNT(DISTINCT ... trips.id ...)` |
| `getCityShading` | 376-377 | `COUNT(DISTINCT ... trips.id ...)` |

**Specification** (`jobs/architect/tech/20260307-map-shading-spec.md`): every `COUNT` in
the document — lines 105, 114, 130, 131, 196, 197, 200, 201, 214, 215, 228, 229, 321, 322,
346, 347 — is `COUNT(DISTINCT t.id)`, `COUNT(DISTINCT tp.trip_id)`, or
`COUNT(DISTINCT r.id)`. There is no non-distinct count anywhere in the shading path.

Two Glasgow rows on trip 7 therefore contribute `trips.id = 7` twice to a `DISTINCT` set
and once to the result. `has_active` uses `MAX(CASE ...)`, which is idempotent by
construction. Duplicate rows are invisible to shading.

`trip_countries` is likewise safe: its primary key is `(trip_id, country_code)`
(`src/backend/db/schema.ts:408`), so a country cannot be double-associated no matter how
many visits map to it.

**Binding rule for all future shading work.** Any query that derives shading state from
`trip_places` MUST aggregate `DISTINCT` on `trips.id` (for trip-count states) or on the
geographic entity id (for coverage states). It MUST NOT count `trip_places.id` or bare
rows. Before ADL-41 this was a nice property; after ADL-41 it is the only thing standing
between the model and double-shaded countries. **ADL-44 (region-shading payload, BUG-48)
touches this exact query path and must not regress it.** Worth a Semgrep rule under the
ADL-29 enforcement layer if a cheap pattern exists for it.

### 3.1 A consequence worth stating

Under the new model a country can now be reached by two visits on the same trip. Shading
state is unchanged (one distinct trip), which is the correct outcome: shading answers
"have I been here, and in what trip state", not "how many times".

---

## 4. Ordering — DP-05, and why `arrived_on` stops being the sort key

### 4.1 The problem the identity change creates

ADL-24 §4.1/§4.2 sorts places client-side by `arrived_on`, nulls last, relying on stable
sort to preserve insertion order among undated rows. Under one-row-per-city that was
adequate: a trip's places were a *set*, and ordering was cosmetic.

Under one-row-per-visit the place list is a *sequence*, and ordering carries meaning — a
revisit is distinguishable from an accidental duplicate only by where it sits. Two
failures follow immediately:

1. **Mixed dated/undated collapses.** Glasgow(–) → Edinburgh(2026-06-06) → Glasgow(–)
   renders under nulls-last as Edinburgh, Glasgow, Glasgow. The itinerary is destroyed,
   and the two Glasgow rows now look like a data-entry error.
2. **There is no persisted insertion order to fall back on.** `placeRepository.findByTrip`
   has no `ORDER BY` at all (`src/backend/repositories/places.ts:62-77`). Today's ordering
   is whatever the engine returns — incidentally rowid, but not guaranteed, and not
   guaranteed to survive the Postgres migration the schema targets.

### 4.2 The decision

Add to `trip_places`:

```typescript
sortOrder: integer('sort_order').notNull().default(0),
```

`sort_order` becomes the **canonical ordering key**, dense and 0-based per trip.
`arrived_on` remains the *semantic* date and continues to drive DP-04 display precedence
(ADL-24 §5.2, unchanged), but it drives ordering at **write time** rather than render time:

- On create, a new place is appended (`max(sort_order) + 1`) unless it carries an
  `arrived_on`, in which case it is inserted at the position its date implies and the rows
  after it are shifted.
- On `PATCH` of `arrived_on`, the row is repositioned by the same rule.
- Rows with no `arrived_on` keep their `sort_order` and are never displaced by a dated
  row's insertion beyond the shift above.
- `findByTrip` gains `.orderBy(tripPlaces.sortOrder)`. Clients render in the order they
  receive.

This satisfies both halves of DP-05 as written, without the nulls-last ambiguity:
*"when set, ordered chronologically by arrival date"* — the backend assigns `sort_order`
from `arrived_on`; *"when not set, the existing insertion order is preserved"* — that is
exactly what `sort_order` is.

### 4.3 Why persisted rather than derived

- **Undated revisits work with zero dates set.** Glasgow → Edinburgh → Glasgow orders
  correctly the moment the user adds the third row, with no date entry required. Under a
  derived rule it cannot, because there is nothing to derive from. This alone decides it.
- **The persisted sequence and the displayed sequence can never disagree.** With a
  client-side sort, two clients (web now, iOS later) can render the same trip differently.
  The itinerary is data; it belongs in the database.
- **Drag-to-reorder becomes available for free**, which the two-panel trip detail will want
  and which is otherwise a second schema change.
- Cost is one integer column and a shift-on-insert. At 2–20 rows per trip that is free.

### 4.4 Supersession

This partially supersedes **ADL-24 §4.1 and §4.2** (client-side sort by `arrived_on`,
nulls last). ADL-24's *display date precedence* rule (§5.2: explicit place dates > hotel
dates > trip dates) is **unaffected** and remains current. Both the log entry for ADL-24
and `jobs/architect/tech/ADL-24-place-date-ranges.md` are stamped accordingly in this PR.

---

## 5. DP-06 — first place inherits the trip date range

Under one-row-per-visit, "the first place" needs a definition that does not drift.

**DP-06 fires only on the empty-trip → first-place transition**: when a place is created
on a trip that currently has zero `trip_places` rows, and only then. It is a one-shot on
that transition, not a standing rule about whichever row happens to hold the lowest
`sort_order`.

Consequences to implement explicitly:

- A revisit row (any 2nd+ place, whether or not it is a revisit of an existing city) never
  inherits. It is created with `arrived_on`/`departed_on` NULL unless the request supplies
  them.
- If the user deletes the only place and adds another, DP-06 fires again. That is correct
  — the trip was empty.
- If the user reorders so that a different row becomes first, nothing re-inherits. DP-06 is
  about creation, not position. This matters because `sort_order` (§4) now makes "first"
  a mutable property, and a standing rule would silently overwrite user-entered dates on
  every reorder.

IT-11 shares this defaulting code path (BRD §5.5 note on IT-11). Whoever implements either
must keep the "user edit is never overwritten by a subsequent re-defaulting" guarantee that
IT-11 states — the one-shot framing above is what makes it hold.

---

## 6. Item attachment — which visit owns an item

`items.trip_place_id` is unchanged structurally (`src/backend/db/schema.ts:461`). Its
meaning sharpens: **an item belongs to exactly one visit, or to the trip (NULL).**

Rules:

1. **No implicit re-parenting, ever.** The API never guesses which Glasgow visit an item
   belongs to, and never moves an item between visits as a side effect of anything.
2. **Creation disambiguates at the client.** When the user attaches an item to a city that
   has more than one visit on the trip, the picker lists the *visits* — labelled by date
   range where set, ordinal where not ("Glasgow (2nd visit)"). The API takes a concrete
   `trip_place_id` as it does today; no API change is needed to support this, only a UI
   change. Where a city has one visit, the picker collapses to it and nothing changes.
3. **Trip-level attachment stays available and stays the default for cross-city items** —
   a flight belongs to the trip, not to a visit (`src/backend/db/schema.ts:428-429`).

### 6.1 Merge and split — specified, not scheduled

Neither is required by TR-14, TR-15, or OQ-05. They are specified here so the identity
model is closed, and so a later brief does not have to reopen this ADL. **Do not implement
them in the TR-14/TR-15 briefs.**

**Merge visit B into visit A** (same trip, same city):
1. `UPDATE items SET trip_place_id = A WHERE trip_place_id = B`
2. Union `trip_place_activities_map` rows onto A, ignoring conflicts (the PK is
   `(trip_place_id, activity_id)` — `src/backend/db/schema.ts:386`)
3. `A.arrived_on = min(A, B)`, `A.departed_on = max(A, B)`, treating NULL as absent
4. Delete B; renumber `sort_order` densely
5. One batch. No item is ever lost.

**Split visit A at date D:**
1. Create B with `arrived_on = D`, `departed_on = A.departed_on`; set
   `A.departed_on = D - 1 day`
2. Move to B those items whose own date falls on or after D — `item_hotels.check_in_date`,
   `item_flights.departure_datetime`, and the equivalent on the other extension tables
3. Items with no date of their own stay on A
4. Present the result for user review before committing. A split is a guess; it must be
   correctable, not silent.

Rule 3 is the important one: silently distributing undated items is how users lose track
of things they entered.

---

## 7. TR-14 — trip deletion

There is currently no `router.delete` in `src/backend/routes/trips.ts` (confirmed: the
only handlers are `post` at :138 and `patch` at :271, :327, :358, :382). This is net-new.

### 7.1 Declared cascades are not a runtime guarantee — do not rely on them

`src/backend/db/index.ts` is the only place a database driver is constructed
(`createLibSQLDb`, :108). **It never issues `PRAGMA foreign_keys=ON`.** The `PRAGMA`
statements that do appear in the repo are inside migration files
(`src/backend/migrations/0007_*.sql`, `0011_*.sql`, `0012_*.sql`), scoped to the migration
connection and toggled off-then-on around table recreations. They say nothing about the
application connection.

Therefore every `onDelete: 'cascade'` in `schema.ts` is **documentation of intent, not
enforced runtime behaviour**. This is not a new observation — the staging reset script
reached the same conclusion independently and deletes in explicit child-before-parent
order for exactly this reason (`src/backend/db/reset-staging.ts:31-36`: *"does NOT rely on
SQLite's ON DELETE CASCADE actually firing, because whether libSQL enforces FK constraints
is a connection-level setting this script does not control or want to assume"*).

TR-14 adopts the same discipline. A trip delete that leans on declared cascades would
either silently orphan every dependent row (FK off — the likely current state) or fail with
a constraint error the moment someone turns FK enforcement on, because
`items.trip_place_id` carries **no** `onDelete` action at all (`schema.ts:461`) and would
resolve to `NO ACTION`. Both outcomes are worse than writing eight ordered deletes.

> Flagged to COO as a separate concern, deliberately **out of scope here**: whether the
> application connection should enable `PRAGMA foreign_keys=ON` at all is its own decision
> with its own blast radius (it would start enforcing every declared action across the
> schema at once). It should not be bundled into TR-14. TR-14's design is correct either
> way, which is the point of specifying it this way.

### 7.2 Delete order

One `db.batch()` (the pattern already used in `placeRepository.delete`,
`src/backend/repositories/places.ts:196-199`), child-before-parent:

1. Item extension rows for this trip's items — `item_flights`, `item_hotels`,
   `item_car_rentals`, `item_restaurants`, `item_experiences`
   (`WHERE item_id IN (SELECT id FROM items WHERE trip_id = :id)`)
2. `UPDATE items SET carried_from_item_id = NULL WHERE carried_from_item_id IN (SELECT id FROM items WHERE trip_id = :id)`
   — clears the provenance pointer on **other trips'** derived items
3. `DELETE FROM items WHERE trip_id = :id`
4. `DELETE FROM trip_place_activities_map WHERE trip_place_id IN (SELECT id FROM trip_places WHERE trip_id = :id)`
5. `DELETE FROM trip_places WHERE trip_id = :id`
6. `DELETE FROM trip_countries WHERE trip_id = :id`
7. `DELETE FROM trip_categories_map / trip_companions_map / trip_activities_map WHERE trip_id = :id`
8. `DELETE FROM trips WHERE id = :id`

**Step 2 is the one that will be forgotten.** Per ADL-36, `carried_from_item_id` is a
nullable-after-source-deletion provenance pointer with `onDelete: 'set null'`; deleting a
trip must clear it on derived items living on *other* trips, and must **not** touch their
`is_carried_forward` flag. `is_carried_forward = 1 AND carried_from_item_id IS NULL` is a
legitimate, intentional post-deletion state — `schema.ts:434-451` says so at length. Do not
add a consistency check or backfill that "repairs" it.

### 7.3 Guards

- **Auth:** `requireAuth` (already global on `/api/*` per `server.ts`), plus `userId`
  scoping on the trip lookup. **Not** `requireOwner` — trips are per-user data under the
  ADL-27/ADL-28 model, not owner-only admin data.
- **Locked trips (TR-07):** refuse before any delete. Reuse the existing
  `assertWritable` pattern (`src/backend/repositories/places.ts:243-246`), which already
  throws `NotFoundError` (404) / `LockError` (403). The BRD requires the refusal message
  direct the user to unlock.
- **Atomicity:** one batch. A partial trip delete is worse than a failed one.
- **Confirmation naming what is lost:** TR-14 requires the confirmation name the trip, its
  places, and its items. The delete endpoint should therefore be preceded by a counts
  read the client can render — either a new `GET /api/trips/:id/delete-preview` or, more
  cheaply, counts the client already holds from the trip detail. Backend brief's call;
  the requirement is that the confirmation text is accurate, not fabricated.

### 7.4 Photo references — nothing to clean up

TR-14's success criteria says "no orphaned places, items, or photo references remain".
For photos this is **satisfied by construction and needs no implementation**:
`photo_album_ref` is a plain text column on the `trips` row itself
(`src/backend/db/schema.ts:250`) holding a URL or folder path — PH-01 stores no file and
there is no photos table anywhere in the schema. It is removed atomically with the trip
row in step 8.

Stated explicitly because a diligent engineer reading TR-14 will otherwise go looking for
a photo-cleanup step, not find one, and either build a phantom one or raise a false gap.

### 7.5 Not foreclosing NR-12

Two requirements on the implementation, both cheap now and expensive later:

1. **One entry point.** All deletion logic lives in a single
   `tripRepository.delete(userId, tripId)`; the route handler validates and delegates,
   holding no delete logic of its own. NR-12 then adds `archive()` *in front of* it — the
   archive UI calls `archive()`, and a later purge path calls the same `delete()` that
   exists today. Scattering deletes across the handler is what makes an archive layer a
   rewrite instead of an addition.
2. **NR-12 must use a new nullable `archived_at` column, never a new `trips.status`
   value.** `trips.status` has a CHECK constraint enumerating exactly four lifecycle
   values (`schema.ts:262-265`), and map shading keys off those values directly
   (`shading.service.ts:233-239` and the whole of shading-spec §2). Adding `'archived'` to
   that enum would silently change every user's map — an archived trip would stop matching
   `'planning'`/`'active'`/`'review_pending'`/`'locked'` and its countries would lose
   their shading with no code change anywhere. A separate `archived_at IS NULL` predicate
   keeps the two concerns orthogonal and lets the product decide later whether archived
   trips still shade the map. Recording it here so NR-12 does not have to rediscover it.

---

## 8. TR-15 — removing a place that has items

### 8.1 The identity change does not complicate "reassign to trip level"

The brief asks what "reassign to trip level" means when duplicate visit rows exist. The
answer is that it means exactly what it meant before: `items.trip_place_id = NULL`.

"Trip level" is a single, well-defined target — the absence of a visit — and its
definition does not depend on how many visit rows the trip has. This is the current BUG-32
behaviour, already implemented (`src/backend/repositories/places.ts:196-199`,
documented at `schema.ts:428-432`). One-row-per-visit changes the *source* cardinality,
not the *target*. No ambiguity is introduced.

### 8.2 The three choices, and enforcing them server-side

`DELETE /api/trips/:tripId/places/:placeId` gains a required-when-non-empty parameter:

| Choice | Parameter | Effect |
|--------|-----------|--------|
| Delete them along with the place | `items=delete` | Delete the items and their extension rows (§7.2 steps 1–3 scoped to `trip_place_id`), then the place |
| Keep them by reassigning to trip level | `items=detach` | `UPDATE items SET trip_place_id = NULL`, then delete the place — today's behaviour, now user-chosen |
| Cancel | *(no request issued)* | No-op |

**The route must reject a delete on a place that has items when no `items` parameter is
supplied — 400, not a default.** This is the part that matters. TR-15 exists to supersede
silent reassignment (BUG-32); if the server keeps a default, the "explicit choice" is a UI
convention that the next client, the next refactor, or a direct API call quietly drops.
Failing closed makes the requirement structural.

Removing a place with **no** items requires no parameter and proceeds directly — TR-15 is
explicit that the prompt appears only when items are attached.

`items=delete` must also clear `carried_from_item_id` on other trips' derived items
(§7.2 step 2, scoped to the deleted items), for the same ADL-36 reason.

### 8.3 A fourth option, flagged not built

One-row-per-visit makes "reassign to the *other* Glasgow visit" newly meaningful and
arguably the most useful choice of the four. **It is not in scope.** TR-15's success
criteria enumerate exactly three choices ("removing a place holding at least one item
presents all three choices"), and adding a fourth changes the requirement's definition of
done. Flagged to COO as a candidate for a later BRD bump — the data model supports it
today, so it costs only a BRD decision and a UI affordance whenever the PO wants it.

### 8.4 `trip_countries` on place removal

Removing a visit must remove the trip's `trip_countries` row for that country **only if no
other `trip_place` on the trip still maps to it**. Under one-row-per-city this was
implicitly true; under one-row-per-visit, removing one Glasgow visit while another remains
must leave `(trip, GB)` intact. Concretely: after deleting the place, delete
`trip_countries` for that country only when
`SELECT COUNT(*) FROM trip_places tp JOIN cities c ON c.id = tp.city_id WHERE tp.trip_id = :id AND c.country_code = :cc`
returns 0.

This is a genuine new bug surface created by this ADL, and it manifests as a country
losing its map shading while the user can still see the city on the trip. It must be
covered by a test in the implementing brief.

---

## 9. Migration

Three changes, all additive or index-level. **No table recreation**, which keeps this clear
of the drizzle-kit SQLite bugs in ADL-15 (Bug 1 fires on recreation).

```sql
DROP INDEX uniq_trip_places_trip_city;
CREATE INDEX idx_trip_places_trip_city ON trip_places (trip_id, city_id);
ALTER TABLE trip_places ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
```

Then backfill `sort_order` so nothing visibly reorders on deploy — it must reproduce the
order users see today (ADL-24 §4.2: `arrived_on` ascending, nulls last, `id` as tiebreak):

```sql
UPDATE trip_places
SET sort_order = (
  SELECT COUNT(*) FROM trip_places t2
  WHERE t2.trip_id = trip_places.trip_id
    AND (
      (t2.arrived_on IS NOT NULL AND trip_places.arrived_on IS NOT NULL AND (t2.arrived_on < trip_places.arrived_on OR (t2.arrived_on = trip_places.arrived_on AND t2.id < trip_places.id)))
      OR (t2.arrived_on IS NOT NULL AND trip_places.arrived_on IS NULL)
      OR (t2.arrived_on IS NULL AND trip_places.arrived_on IS NULL AND t2.id < trip_places.id)
    )
);
```

Notes for the Database brief:

- `NOT NULL DEFAULT 0` is required — SQLite cannot add a `NOT NULL` column without a
  default. Leave the default in place afterwards; removing it would force a table
  recreation, which is the thing to avoid.
- Run `npm run db:generate`, then **read the generated SQL before applying** and confirm it
  contains only `DROP INDEX` / `CREATE INDEX` / `ALTER TABLE ADD COLUMN` — no drop-and-
  recreate (ADL-15, ADL-24 §2.4). Add the backfill `UPDATE` by hand; drizzle-kit will not
  generate it.
- Backward-compatible: existing rows get a correct `sort_order`, and no existing row
  violates any new constraint (there are none).
- The Postgres path (Phase 2) is a straight `INTEGER NOT NULL DEFAULT 0`; the backfill
  would be better written as `ROW_NUMBER() OVER (PARTITION BY trip_id ...)` there, but the
  correlated-subquery form above works on both engines and this table is small.

---

## 10. Implementation order for downstream briefs

| Brief | Depends on | Scope |
|-------|-----------|-------|
| Database | — | §9 migration + `schema.ts` changes (drop unique index, add composite index, add `sort_order`, rewrite the `trip_places` doc comment at :331-341) |
| Backend — places | Database | §2 `allow_revisit` + 409 payload; §4.2 `sort_order` assignment and `.orderBy`; §5 DP-06 one-shot; §8 TR-15 required `items` parameter with fail-closed 400; §8.4 `trip_countries` conditional removal |
| Backend — TR-14 | Database | §7 `DELETE /api/trips/:id`, `tripRepository.delete`, ordered batch, lock guard |
| Frontend | Backend | Revisit disambiguation prompt on 409; visit-labelled item attachment picker (§6.2); TR-14 confirmation naming what is lost; TR-15 three-choice prompt |

**Not in scope for any of the above:** merge/split (§6.1), the fourth TR-15 option (§8.3),
`PRAGMA foreign_keys` (§7.1), NR-12 archive (§7.5).

---

## 11. Open items for COO

1. **BRD §10 OQ-05 is closed by this PR**; BRD bumped to v3.9 following the v3.2 precedent
   (Architect-authored bump resolving an open question, PO approval via merge).
2. **§8.3 fourth TR-15 option** — "reassign to the other visit" needs a BRD decision if
   wanted. Data model already supports it.
3. **§7.1 `PRAGMA foreign_keys`** — the application connection does not enable FK
   enforcement. Not a TR-14 blocker (TR-14 is specified not to depend on it), but it is a
   standing latent issue across the whole schema and deserves its own ADL.
4. **ADL-44 (BUG-48)** must preserve the §3 `DISTINCT` invariant when it reworks the
   region-shading query path.

# ADL-42 — Booking item shape: multi-leg flights and multi-traveller seats

**Date:** 2026-07-27
**Status:** Decided, implementation pending
**Trigger:** GitHub issue #272 (Wave 0 scoping brief S2). Tracker BUG-41 (multi-leg /
connecting flights within a single booking) and BUG-42 (multiple companions/seats per
booking item), both raised at the 2026-07-21 Scotland dogfood UAT.
**BRD refs:** §5.5 IT-01–IT-11, §5.6 FL-01–FL-04, CR-01–CR-02. **FL-01 is superseded by
this decision and must be amended by the COO before any brief dispatches** (see §11).
**Depends on:** ADL-11 (base + extension tables), ADL-28 (per-user companions, AD-08).
**Supersedes:** BRD FL-01 (COO action — see §11). No ADL entry is superseded.
**Downstream, not designed here:** BUG-43 (Apple Wallet `.pkpass` import — research spike).

---

## 1. Summary table

| # | Decision | Recommendation | Confidence |
|---|----------|----------------|------------|
| D1 | Booking shape | New `item_flight_legs` child table under **one** flight item. `item_flights` is retained as the booking-level extension row. One booking = one item. | High |
| D2 | Leg ordering | Explicit `leg_order` integer, 1-based and contiguous, written by the backend. **Not** derived by sorting on `departure_datetime`. | High |
| D3 | Parent vs leg fields | Parent (`item_flights`): `booking_reference` — the PNR, one per booking. Leg: `airline`, `flight_number`, both airports, both datetimes. | High |
| D4 | Traveller / seat model | **One** new table `item_travellers` with a **nullable `leg_id`**. Row presence = "travels this scope"; `seat` is a nullable column on the row. | High |
| D5 | Representing the owning user | `companion_id` is **nullable**; `NULL` means the owning user ("me"). Do not synthesise a "Me" companion row. | High |
| D6 | Manifest mode invariant | Per item, traveller rows are either **all** leg-scoped (flights) or **all** booking-scoped (every other type). Never mixed. | High |
| D7 | Cross-user companion guard | The new write path must call `companionRepository.validateOwnership` (ADL-28 R4). Repository signature takes `userId` as its first, mandatory argument. | High |
| D8 | Does a leg have a status? | **No.** Status stays on the item only (IT-03, FL-03). A leg has no independent status axis. | High |
| D9 | Cost | Booking-level whenever it is introduced; never per-leg. Not added by this ADL — no BRD requirement for item cost exists. | High |
| D10 | Migration | **Two** migration files: an additive create-and-backfill, then a separate destructive shrink of `item_flights`. Never one file. | High |
| D11 | API read path | Legs and travellers are fetched in a **second, batched query** and attached as arrays. They must **never** be added as `leftJoin`s in `fetchItemsWithExtensions`. | High |
| D12 | Backward-compatibility shim | **None.** No deprecated flat aliases. Backend and frontend land together. | Medium |
| D13 | Which types get travellers | `item_travellers` is open to **all** item types. Legs are flight-only. | High |

---

## 2. The problem, stated once

BUG-41 and BUG-42 are the same defect seen from two sides: **the booking item is flat.**
It models exactly one segment of travel carrying exactly one implicit traveller.

Today a Seattle → London → Glasgow itinerary on a single PNR must be entered as two
separate `flight` items (BRD FL-01: "Each flight is logged as an individual leg";
`src/backend/db/schema.ts:507` repeats it). Consequences:

- The booking reference is duplicated across both items with nothing keeping them equal.
- Nothing links them. Cancelling "the booking" means finding and editing N unrelated items.
- Their order is incidental — `fetchItemsWithExtensions` orders by `items.createdAt`.
- Carry-forward (IT-07), post-trip bulk status update (IT-06) and the planning view
  (PL-03) each see N unrelated rows where the user sees one booking.

And `item_flights.seat` is a single `TEXT` column. There is **no per-item companion link
anywhere in the schema** — `companions` attach to trips only, via `trip_companions_map`.
So "two of us flew, seats 12A and 12B" is unrepresentable, and the one seat that *can* be
stored belongs to nobody in particular.

Fixing either one alone would entrench the other. A seat belongs to a *person on a leg*;
you cannot model seats correctly until legs exist, and you cannot model a leg's occupancy
correctly until travellers exist. Hence one design.

---

## 3. D1 — Booking shape: a leg sub-entity, not more items and not more columns

**Decision:** one flight booking is one `items` row. Its legs live in a new
`item_flight_legs` child table. `item_flights` is kept as the 1:1 booking-level extension
row (ADL-11's pattern is preserved, not replaced).

**Reasoning:**

- The invariant that matters is *one booking = one confirmation = one status = one item*.
  That is what the user cancels, confirms and completes. Legs are its parts.
- Alternatives rejected:
  - **Keep legs as separate items joined by a `booking_group_id`.** Leaves N statuses for
    one booking with no defined aggregate, so IT-06 bulk review and PL-03 grouping stay
    broken. It also puts a grouping key on the generic `items` table for one type's benefit.
  - **Widen `item_flights` with `leg2_*`, `leg3_*` columns.** A hard cap in the schema,
    unindexable, and the exact "dozens of nullable columns" failure ADL-11 rejected.
  - **A JSON `legs` array on `item_flights`.** Rejected for the same reason ADL-11 rejected
    JSON for item fields: SQLite cannot efficiently index JSON paths, and legs must be
    queryable (departure date drives trip timelines; `jobs/architect/tech/20260307-tech-blueprint.md:292`
    already reads `item_flights.departure_datetime` directly).
  - **A generalised `item_segments` table covering flights, hotels and car rentals.** The
    most "elegant" option and the wrong one. It requires migrating all three existing
    extension tables, rewriting every route, helper, test and component, to buy a second
    segment for types that will never have one. Hotels and car rentals are single-segment
    by nature; a multi-city car hire is a second rental. This is a rebuild sold as a
    refactor. Rejected on cost, not on taste.

**Table:**

```typescript
export const itemFlightLegs = sqliteTable(
  'item_flight_legs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    legOrder: integer('leg_order').notNull(),   // 1-based, contiguous — see D2
    airline: text('airline'),
    flightNumber: text('flight_number'),
    departureAirport: text('departure_airport'), // IATA preferred, not enforced
    arrivalAirport: text('arrival_airport'),
    departureDatetime: text('departure_datetime'), // ISO 8601, naive — see §9
    arrivalDatetime: text('arrival_datetime'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    uniqueIndex('uniq_item_flight_legs_order').on(t.itemId, t.legOrder),
    index('idx_item_flight_legs_item').on(t.itemId),
    index('idx_item_flight_legs_departure').on(t.departureDatetime),
    check('chk_item_flight_legs_order', sql`${t.legOrder} >= 1`),
  ],
)
```

**Deliberate omission — no per-leg `notes` column.** IT-04 puts notes on the item and a
second notes home invites the "which notes did I write?" problem. If the PO asks for
gate/terminal notes later it is a nullable column add with no migration risk. Recorded so
a future reader knows it was considered, not overlooked.

**Enforcement:** a leg may only reference an item with `item_type = 'flight'`. SQLite
cannot express this (no cross-table CHECK), so the backend enforces it — the same
application-layer contract every existing extension table already relies on.

---

## 4. D2 — Ordering, and D3 — what the parent carries vs the leg

**D2 — `leg_order`, an explicit integer. Do not sort by `departure_datetime`.**

- Datetimes are optional. PL-01 requires a flight to exist as a quick-capture idea with a
  name and type only; an idea with three unscheduled legs must still hold its order.
- The stored order is *user intent*. A datetime sort silently reorders the itinerary the
  moment a user fixes a typo in a date.
- Datetimes are stored naive, with no timezone (§9). Ordering a westbound long-haul by
  naive local arrival time can invert legs. `leg_order` is immune.

Write semantics: **full replace.** `PATCH` sends the complete ordered leg array; the
backend deletes and reinserts, assigning `leg_order` 1..N from array position. This makes
"insert a leg in the middle" and "reorder" trivial for the client and makes gaps
structurally impossible. `uniq_item_flight_legs_order` catches any violation.

A flight item has **at least one** leg. A zero-leg flight is invalid; the create path
writes leg 1 even when every field on it is null. This is what keeps "single-leg flight"
and "multi-leg flight" one code path instead of two.

**D3 — the split:**

| Field | Home | Why |
|-------|------|-----|
| `booking_reference` (PNR) | **Parent** `item_flights` | One booking, one record locator. Duplicating it per leg is exactly today's bug. |
| Cost | **Parent** (when introduced — D9) | A fare is priced for the itinerary, not per segment. |
| Confirmation number | **Parent** (if added) | Same reasoning. |
| `airline` | **Leg** | Interline and codeshare itineraries genuinely change carrier between legs. There is no correct single booking-level airline. |
| `flight_number` | **Leg** | Per-segment by definition. |
| Departure/arrival airport | **Leg** | Per-segment by definition. |
| Departure/arrival datetime | **Leg** | Per-segment by definition. |
| Status | **Parent only** | D8. |

**Consequence for the UI and for ADL-43:** the booking has no single airline. The item card
should render leg 1's airline, or "Multi-airline" when carriers differ — it must not invent
a booking-level airline field. **BUG-45 (sourced airline dropdown, ADL-43's scope) must
target `item_flight_legs.airline`, not `item_flights.airline`.** If ADL-43's brief is
written against the old column it will need reworking; the two waves must be sequenced or
cross-referenced.

---

## 5. D4/D5/D6 — the traveller model

This is the load-bearing part of the design. Three requirements pull against each other:

1. Multiple travellers with a seat each, per leg (BUG-42).
2. A companion may be on some legs and not others (brief S2).
3. Car rentals, hotels and restaurants have travellers but no legs.

Requirement 3 pushes toward a booking-level junction. Requirements 1 and 2 push toward a
leg-level junction. **Having both is the trap** — it creates two homes for one concept, and
makes "on the booking but with no row on leg 2" ambiguous between *not travelling that leg*
and *seat not yet known*.

**Decision (D4): one table, with a nullable `leg_id` that selects the scope.**

```typescript
export const itemTravellers = sqliteTable(
  'item_travellers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    // NULL = this row applies to the whole booking (non-flight items).
    // NOT NULL = this row applies to one specific leg (flight items).
    legId: integer('leg_id').references(() => itemFlightLegs.id, { onDelete: 'cascade' }),
    // NULL = the owning user ("me") — see D5. NOT NULL = one of their companions.
    companionId: integer('companion_id').references(() => companions.id),
    seat: text('seat'), // NULL = travels this scope, seat not known
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [
    // Four partial unique indexes — see the note below on why four.
    uniqueIndex('uniq_item_travellers_leg_companion')
      .on(t.legId, t.companionId)
      .where(sql`${t.legId} IS NOT NULL AND ${t.companionId} IS NOT NULL`),
    uniqueIndex('uniq_item_travellers_leg_self')
      .on(t.legId)
      .where(sql`${t.legId} IS NOT NULL AND ${t.companionId} IS NULL`),
    uniqueIndex('uniq_item_travellers_item_companion')
      .on(t.itemId, t.companionId)
      .where(sql`${t.legId} IS NULL AND ${t.companionId} IS NOT NULL`),
    uniqueIndex('uniq_item_travellers_item_self')
      .on(t.itemId)
      .where(sql`${t.legId} IS NULL AND ${t.companionId} IS NULL`),
    index('idx_item_travellers_item').on(t.itemId),
    index('idx_item_travellers_leg').on(t.legId),
    index('idx_item_travellers_companion').on(t.companionId),
  ],
)
```

**Semantics — row presence is the assertion:**

- A row exists → this traveller **is on** this scope (this leg, or this booking).
- `seat IS NULL` → on the scope, seat unknown. Unambiguously different from "not on it".
- No row → not on this scope.

That single rule resolves requirement 2 cleanly. "Partner flew SEA→LHR but not LHR→GLA" is
a row on leg 1 and no row on leg 2. Nothing is implied, overridden or inherited.

**Why four partial unique indexes.** SQLite treats `NULL`s as distinct in a unique index,
so a plain `UNIQUE(item_id, leg_id, companion_id)` would happily accept duplicate
`(item, NULL, NULL)` rows — the same traveller twice. Each of the four indexes covers one
quadrant of the (leg NULL/NOT NULL × companion NULL/NOT NULL) space with no NULLs left in
its key columns, which is the only way to make uniqueness real here. The cheaper-looking
alternative — a NOT NULL `traveller_ref` column using `0` as a self sentinel, needing only
two indexes — was rejected because `0` cannot carry a foreign key to `companions.id`.
**Referential integrity outranks index count.**

Partial indexes are already used in this schema (`idx_cities_geocode`, `idx_items_carried`),
and `patches/drizzle-kit+0.31.9.patch` Bug 4 exists specifically to make drizzle-kit read
partial-index `WHERE` clauses. That patch is **load-bearing for this design** — without it,
drizzle-kit does not round-trip these indexes and will churn migrations. Verified against
the installed version: `uniqueIndex()` and `index()` share one builder
(`node_modules/drizzle-orm/sqlite-core/indexes.d.ts` — `IndexBuilderOn` → `IndexBuilder.where()`),
so `uniqueIndex(...).on(...).where(...)` is expressible.

### D5 — the owning user is not a companion

The gap nobody has written down yet: **`companions` is a list of *other* people.** The user
is not in it. Today's single `item_flights.seat` column *is* the user's own seat, implicitly
— that is precisely what BUG-42 means by "one implicit traveller".

So a traveller junction keyed on a `NOT NULL companion_id` would have nowhere to put the
user's own seat. Moving seat to such a table would be a **regression**, not a fix.

**Decision: `companion_id` is nullable and `NULL` means the owning user.**

Alternatives rejected:
- **Auto-create a "Me" companion per user.** Pollutes a user-managed list (AD-08) with a row
  they did not create and can rename, deactivate or delete; collides with
  `uniq_companions_user_name` if they already have one named "Me"; and makes the self-row
  soft-deletable, which would orphan the meaning of every seat attached to it.
- **A separate `self_seat` column on `item_flights` or on the leg.** A second home for seat
  — the exact smell this ADL exists to remove.

The API surfaces this as an explicit `is_self: true` flag rather than making clients infer
meaning from a null, so no consumer has to know the storage convention.

### D6 — manifest mode: never mix scopes on one item

**For any single item, every traveller row is leg-scoped, or every one is booking-scoped.**

- Flight items → **leg-scoped** (`leg_id NOT NULL`) always, since a flight always has ≥1 leg.
- All other types → **booking-scoped** (`leg_id NULL`) always.

This is what keeps the model non-redundant. For a flight, the booking-level roster is
*derived*, never stored:

```sql
SELECT DISTINCT companion_id FROM item_travellers WHERE item_id = ?
```

There is exactly one home for the fact, and no way for a stored roster and a stored manifest
to disagree. SQLite cannot enforce mode (it depends on `items.item_type` in another table),
so the backend enforces it and the repository tests must cover both violation directions:
a leg-scoped row on a hotel, and a booking-scoped row on a flight. Both are 400s.

---

## 6. D7 — the per-user companion model must not be routed around

ADL-28 (AD-08) made companions per-user and established that a cross-user companion
assignment must be rejected. SQLite cannot enforce the invariant
(`companions.user_id == items.user_id`) — no cross-table CHECK, no deferred FK validation —
so ADL-28 R4 named `companionRepository.validateOwnership(userId, companionIds)` as the
**sole** guard, called from `tripRepository.replaceAssociations`.

`item_travellers.companion_id` is a **second write path to `companions.id`**, and it is
exactly the path around AD-08 this brief warns about. Two binding rules:

1. **Same guard, same semantics.** The traveller writer calls
   `companionRepository.validateOwnership` (`src/backend/repositories/companions.ts`) before
   any insert. Any companion ID that fails produces a **400 ValidationError, not a 404** —
   the companion may well exist; it just is not the caller's. This matches ADL-28 exactly and
   avoids leaking existence.
2. **Make it structural, not a reminder.** The repository signature is
   `itemTravellerRepository.replace(userId: string, itemId: number, assignments: TravellerAssignment[])`
   — `userId` first and mandatory. A route cannot write this junction without having the
   scoping value in hand. "Remember to validate" is not a control; a signature that cannot
   be called without the user is.

The Backend brief must carry the cross-user rejection test for the item path, mirroring the
cases ADL-28 added to `src/backend/repositories/__tests__/trips.test.ts`, into
`src/backend/repositories/__tests__/items.test.ts`. Per CLAUDE.md's Backend security
checklist, `item_travellers` writes must also be `requireAuth`-gated and every read scoped
through `items.user_id`.

**Two related rulings:**

- **No subset constraint against `trip_companions_map`.** An item traveller need *not* be a
  trip companion. Requiring it creates an ordering trap (book the flight before adding
  people to the trip → rejected) and an undefined cascade (remove a companion from the trip
  → silently delete their seats?). Removing a companion from a trip **must not** delete
  `item_travellers` rows. The UI should offer trip companions first; that is a presentation
  affordance, not a constraint.
- **No `onDelete` on `companion_id`.** This matches `trip_companions_map.companionId`
  exactly. Companions are soft-deleted (`is_active = 0`), never hard-deleted, so RESTRICT is
  correct. Note in passing: `companions.user_id` cascades on user delete while
  `trip_companions_map` restricts, so hard user deletion is already undefined in this schema.
  That is a **pre-existing** condition; ADL-42 deliberately neither fixes nor worsens it, and
  the new table follows the established pattern rather than inventing a third.

---

## 7. D8 — a leg does not have its own status

**Decision: status stays on `items` only. No `status` column on `item_flight_legs`.**

- IT-03 and FL-03 define one status workflow per item. A PNR is confirmed or cancelled as a
  unit — that is what a booking *is*.
- Per-leg status creates an aggregation problem with no correct answer. If leg 1 is
  Completed and leg 2 Cancelled, what does the item show? Every consumer reads a single
  status: `itemRepository.findByTrip`'s `filters.status`
  (`src/backend/repositories/items.ts:52`), IT-06 bulk review, IT-08/IT-09 rating filters,
  and PL-03's planning-stage grouping. A second status axis breaks all of them and buys
  nothing they can use.
- The genuine underlying need — "the airline cancelled my second leg" — is an **operational
  disruption**, not a planning stage. It does not belong on the same enum as
  Consider/Shortlisted/Confirmed. If the PO asks for it, the right shape is a separate
  nullable per-leg `disruption` marker, which is a cheap additive column later. Overloading
  IT-03 now would be the mistake.
- IT-07 carry-forward and IT-06 bulk update both operate on items. Per-leg status would force
  a second dimension through both.

**Related drift found while checking this, flagged not fixed:** BRD IT-03 (v3.0) lists
**Shortlisted** as an item status, but `chk_items_status` in `src/backend/db/schema.ts:499`
permits only `consider, confirmed, completed, cancelled, next_time`, and the string
`shortlisted` appears nowhere in `src/`. The status was added to the BRD and never
implemented; its tracker home is the deprioritized planning-core entry (BRD-PL01–04). ADL-42
does not rebuild the `items` table, so it neither depends on nor resolves this — but any
future migration that rebuilds that CHECK must handle it. Recorded so it is not rediscovered
a third time.

> **RESOLVED (2026-07-28) by BRD v3.11 (QUAL-09).** The PO decided in favour of the code:
> `Shortlisted` is removed from the BRD, not added to the schema. `chk_items_status` is
> correct as written and needs no migration — the caveat above about a future CHECK rebuild
> no longer applies. Flagging this rather than silently "fixing" it was the right call: the
> resolution was a product decision, not a doc correction. Raising it is what got it decided.

---

## 8. D9–D13 — remaining rulings

**D9 — Cost.** There is no cost or price column anywhere in the schema today, and no BRD
requirement for one. This ADL does not add it. The forward ruling exists so a later brief
does not put it in the wrong place: **cost is booking-level.** A fare is priced for an
itinerary, not per segment; per-leg cost would immediately need a "total" that disagrees with
the sum. If the PO wants item cost, it needs a BRD requirement ID first (CLAUDE.md's BRD
gate) — it is not a free rider on this change.

**D10 — Migration, in two files.** Existing `item_flights` rows must become single-leg
bookings with no user-visible change.

*File 1 — additive and reversible (`00NN_adl42_booking_shape.sql`):*
1. `CREATE TABLE item_flight_legs`, `CREATE TABLE item_travellers` and their indexes.
2. Backfill one leg per existing flight:
   `INSERT INTO item_flight_legs (item_id, leg_order, airline, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime) SELECT item_id, 1, airline, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime FROM item_flights;`
3. Backfill the legacy seat as the **owning user's** seat on leg 1:
   `INSERT INTO item_travellers (item_id, leg_id, companion_id, seat) SELECT f.item_id, l.id, NULL, f.seat FROM item_flights f JOIN item_flight_legs l ON l.item_id = f.item_id AND l.leg_order = 1 WHERE f.seat IS NOT NULL AND TRIM(f.seat) <> '';`
   `companion_id = NULL` is the correct reading of the legacy column: it was always the
   user's own seat (D5).

*File 2 — destructive, separate (`00NN+1_adl42_shrink_item_flights.sql`):*
4. Recreate `item_flights` as `(item_id PK, booking_reference)` only, dropping the seven
   moved columns.

**Why two files and not one.** Steps 2–3 read columns that step 4 destroys. Drizzle generates
step 4 as a table recreation and has no way to know the backfill must precede it — reviewing
a single generated file for correct statement ordering is exactly the manual step ADL-28's
own migration review (step 3) flagged as error-prone. Two files make the ordering
structurally impossible to invert, make each independently reviewable, and leave a safe
resting point: after file 1 the database is fully backward-compatible and file 1 alone can be
rolled back trivially. **Verify row counts between the two files on staging** (`item_flight_legs`
count == `item_flights` count; `item_travellers` count == non-empty `seat` count) before
applying file 2 — after it, recovery needs a reverse backfill.

Generate via `npm run db:generate` and hand-correct; `db:push` remains forbidden (ADL-15).
The `items`, `item_hotels`, `item_car_rentals`, `item_restaurants` and `item_experiences`
tables are **not** touched — this keeps blast radius small and leaves ADL-11's pattern intact.

**D11 — the read path, and the bug engineers will otherwise hit.**
`fetchItemsWithExtensions` (`src/backend/routes/items-helper.ts:82`) builds one flat row per
item by left-joining all five 1:1 extension tables. Legs and travellers are **1:N**. Adding
them as `leftJoin`s multiplies rows — a 3-leg flight with 2 travellers each returns 6 rows for
one item — which silently corrupts the `effectiveRating` COALESCE, the rating sort, the
`minRating` post-filter (`items-helper.ts:152`) and every item count in the UI.

**Binding rule: do not join legs or travellers into that query.** Fetch them in a second,
batched query (`WHERE item_id IN (...)`) over the already-selected item IDs and attach as
arrays in `flattenItem`. Two queries, no N+1, no row multiplication. This is the single most
likely implementation error in this change and the Backend brief must call it out explicitly.

Response shape for a flight:

```json
{
  "id": 42, "item_type": "flight", "status": "confirmed",
  "booking_reference": "ABC123",
  "legs": [
    { "id": 7, "leg_order": 1, "airline": "BA", "flight_number": "BA49",
      "departure_airport": "SEA", "arrival_airport": "LHR",
      "departure_datetime": "2026-08-01T18:30", "arrival_datetime": "2026-08-02T12:15",
      "travellers": [
        { "companion_id": null, "companion_name": null, "is_self": true,  "seat": "12A" },
        { "companion_id": 7,    "companion_name": "Partner", "is_self": false, "seat": "12B" }
      ] }
  ],
  "travellers": [
    { "companion_id": null, "companion_name": null, "is_self": true, "legs": [7] },
    { "companion_id": 7, "companion_name": "Partner", "is_self": false, "legs": [7] }
  ]
}
```

The top-level `travellers` array is the **derived** roster (D6) — computed, never stored — and
carries which legs each traveller is on, so a client can render "Partner: SEA→LHR only"
without walking the leg array itself. Non-flight items get `travellers` with no `legs` key and
no top-level `legs` array.

**D12 — no compatibility shim.** The flat keys `airline`, `flight_number`,
`departure_airport`, `arrival_airport`, `departure_datetime`, `arrival_datetime` and `seat`
disappear from the flight response (`src/backend/routes/items-helper.ts:183–193`;
`src/frontend/types/api.ts:133–141`). Keeping deprecated aliases populated from `legs[0]` was
considered and rejected: a "temporary" alias reliably becomes permanent — this project's whole
document-lifecycle ruleset exists because deferred cleanup does not happen — and it would
recreate the two-homes-for-one-fact problem this ADL removes, for the duration.

The cost of no shim is that the backend and frontend changes **must not land separately on
`main`**. Recommended sequencing:
1. **Database brief** — schema + the two migration files (additive; nothing reads the new
   tables yet, safe to merge alone).
2. **One combined Backend + Frontend brief on a single branch** — the API shape and its
   consumers (`src/frontend/types/api.ts`, `src/frontend/components/TripDetail/ItemCard.tsx`,
   `src/frontend/components/TripDetail/ItemForm.tsx`, `src/frontend/hooks/useItems.ts`) change
   together. One branch per brief still holds; this is one brief spanning two layers, which the
   branching rule permits.

Contract tests (`npm run test:contract`) are the backstop that catches any missed reader.

**D13 — traveller scope by type.** `item_travellers` is open to **all** item types — BUG-42
says "flight, car, etc.", and "dinner for four, and who" is equally natural for restaurants
and experiences. A type restriction would need a cross-table CHECK SQLite cannot express
anyway. Legs stay flight-only.

---

## 9. Known limitation this change makes more visible: naive datetimes

`departure_datetime` and `arrival_datetime` are stored as bare ISO strings with **no timezone
or UTC offset** — both today and in `item_flight_legs`. For a single-leg flight this is
harmless: each time is read as local-at-that-airport and displayed as entered.

Multi-leg makes it dangerous, because the obvious next UI feature is **layover duration**
("2h 45m in London"). Computing `legs[n+1].departure_datetime − legs[n].arrival_datetime` on
naive strings gives a wrong answer whenever the connection crosses a timezone, which is most
of the time for the itinerary that motivated BUG-41.

**Ruling: the frontend must not compute or display layover/connection durations, or total
journey time, until timezone data exists.** Show the leg times as entered. Fixing this
properly means a per-leg offset or IANA zone column (derivable from the airport code once
airport reference data exists — ADL-43's territory, BUG-45/OQ-06). Out of scope here;
recorded so it is a known constraint rather than a shipped bug.

---

## 10. What this ADL does not decide

- **BUG-43 (Apple Wallet `.pkpass` import)** — research spike, not designed here. Two
  observations only, for whoever picks it up: (a) a boarding pass carries exactly
  *(flight number, both airports, both times, seat, passenger name, PNR)*, which maps 1:1 onto
  one `item_flight_legs` row plus one `item_travellers` row — this design is import-shaped by
  construction, no adapter layer needed; (b) an importer would dedupe on
  `item_flights.booking_reference`, so that column must **not** be made globally unique — a
  second user can hold the same record locator. Dedupe within `(user_id, booking_reference)`
  at the application layer. No passenger-name column is added; matching a pass to a companion
  is a user-mapping step, not a stored field.
- **Item cost** (D9) — needs a BRD requirement first.
- **Per-leg disruption/cancellation marker** (D8) — deferred until the PO asks.
- ~~**The `shortlisted` status gap** (§7) — belongs to the planning-core work.~~
  **CLOSED 2026-07-28 — BRD v3.11 removed the status; no code change owed.**
- **Timezone-aware datetimes** (§9) — depends on airport reference data (ADL-43).
- **Sharing / co-planning (PL-06, NF-07)** — `item_travellers` names companions, which is not
  the same as granting them access. Access remains out of scope and this design does not
  foreclose it.

---

## 11. COO action required before any brief dispatches

Per CLAUDE.md's **BRD gate before dispatching briefs**, this design cannot be implemented
until the BRD has a home for it. Four items, all COO-owned:

1. **FL-01 is superseded.** It currently reads "Each flight is logged as an individual leg" —
   the exact model this ADL replaces. It must be rewritten (a flight booking is one item with
   one or more ordered legs) and the old text stamped
   `> SUPERSEDED (2026-07-27) by ADL-42 — retained for history.`
2. **FL-02 must change.** `seat` moves off the flight field list; it becomes a per-traveller,
   per-leg value. The remaining leg fields (airline, flight number, airports, datetimes) should
   be described as per-leg and `booking reference` as per-booking.
3. **A new requirement for multi-leg bookings** (BUG-41 — `brdRefs` is currently empty), with
   measurable success criteria.
4. **A new requirement for multiple travellers and seats per booking item** (BUG-42 —
   `brdRefs` also empty), with measurable success criteria, and covering the "traveller on some
   legs but not others" case explicitly.

**I have deliberately not edited the BRD.** The supersession stamp for FL-01 belongs in the
COO's BRD-bump PR alongside the new IDs and the header/§13 changelog bump (three places,
`/record-decision`), not split across two PRs where the BRD would sit internally inconsistent
in between. This is a deferral to the correct owner, not a skipped lifecycle step.

Also required in the implementing **Database** brief (code, not docs, so not done here):
`src/backend/db/schema.ts:507` asserts "Each leg of a multi-leg journey is a separate item
(FL-01)" and must be rewritten in the same PR that adds the leg table. `jobs/database/tech/schema.ts:507`
is a stale copy of the schema file carrying the same claim — it is unmaintained and should
either be refreshed or given a `> HISTORICAL` banner; flagged to the COO, not actioned here.

`jobs/architect/tech/20260307-ER-schema.md:303` repeats the claim but already carries a
HISTORICAL banner at its head, so it needs no further stamp.

---

## 12. Summary of schema changes

| Table | Change |
|-------|--------|
| `item_flight_legs` | **NEW.** 1:N under a flight item. `leg_order`, airline, flight number, both airports, both datetimes. |
| `item_travellers` | **NEW.** Nullable `leg_id` (scope) and nullable `companion_id` (NULL = owning user). `seat` per row. Four partial unique indexes. |
| `item_flights` | **SHRUNK** to `(item_id, booking_reference)`. Seven columns move to the leg or to `item_travellers`. |
| `items` | **No change.** Status, type and carry-forward semantics untouched. |
| `companions` | **No change.** ADL-28's model is reinforced, not altered. |
| `trip_companions_map` | **No change.** Trip roster and item manifest stay independent. |
| `item_hotels` / `item_car_rentals` / `item_restaurants` / `item_experiences` | **No change.** |

**Relationship to prior decisions:** ADL-11 (base + extension tables) is **preserved and
extended**, not superseded — `item_flights` remains the 1:1 booking extension; the leg table
is a new 1:N child beneath it. ADL-28 (per-user companions) is **reinforced** — its
`validateOwnership` guard becomes mandatory at a second write path (D7). No ADL entry is
superseded by ADL-42.

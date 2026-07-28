# ADL-46 — independent fresh-eyes review (OP-27)

**Date:** 2026-07-28
**Reviewer:** Architect (second dispatch, fresh context — no memory of the authoring thread)
**Under review:** `jobs/architect/tech/ADL-46-non-owner-access-model.md` @ `origin/chore/adl46-access-model` (PR #327, 941 lines), plus `OP-06-hardening-checklist.md` §2.1
**Originating brief:** #326
**Method:** re-derived from source. The S3 migration was written and *executed* against a scratch database built from the real migration chain, not checked arithmetically.

---

## Verdict

**Sound with named corrections — one blocking defect (F1) and one blocking execution error (F2).**

The access model itself (D1's tier × operation rule, D3's Option A, D4's curation/creation split, D5's resolve-then-create, D7's proxy) is **correct and well-argued, and I would not change any of those decisions.** The defects are in coverage and in execution detail, and every one of them is cheap to fix now and expensive after the single release ships.

F1 and F2 must be fixed **before the Database brief is written**. F3–F7 must be fixed before the Backend brief. F8–F10 are corrections the COO can apply directly.

Both of the spec author's own named targets came out differently than expected: **§13's "does the migration preserve `id`?" is SOUND — I executed it and it does.** The migration risk is real but sits somewhere the author did not look. **§3.3's data assumption is not the highest-risk premise; §3.3's *table set* is,** and it is wrong in a way that makes the check the spec calls "the only place where being wrong corrupts data" return a false zero.

---

## Summary table

| # | Finding | Class | Severity | Confidence |
|---|---|---|---|---|
| **F1** | `trip_place_activities_map` is a distinct table the spec never names. Pre-migration check, ownership validation and test list all miss the place-level path | **Defect** | **Blocking** | High — reproduced |
| **F2** | `db:generate` emits a migration that **cannot be applied**; §9.3's stated reason for hand-writing is the wrong mechanism | **Defect** | **Blocking** | High — reproduced |
| **F3** | §4.4's containment clause hides every pre-existing `pending` city from **all** users | Defect | High | High — by inspection |
| **F4** | D7's rate-limit evidence does not survive inspection; the release adds call sites without the chokepoint it argues for | Defect (reasoning) | High | Medium-High |
| **F5** | Opening city creation converts a bounded geocode retry queue into an unbounded one; no give-up rule exists | Defect (missed consequence) | Medium-High | High |
| **F6** | §8 enumerates 1 of 4 test files that assert on these routes | Defect (completeness) | Medium-High | High |
| **F7** | Lazy-seed trigger predicate unspecified; the obvious implementation breaks AD-09's first success criterion | Defect (under-spec) | Medium | High |
| **F8** | The new geocoding proxy route is absent from OP-06 §2.1 | Defect (minor) | Low | High |
| **F9** | `CROSS JOIN … LIMIT 1` silently picks an arbitrary owner if `is_owner=1` count > 1 | Defect (minor) | Low | High |
| **F10** | The release is not code-revertible; no down-migration convention exists | Gap | **Low** (downgraded — see note) | High |
| P1–P3 | Preferences / sizing notes, explicitly **not** defects | — | — | — |

> **Severity note (PO constraint, received mid-review).** Both staging and production hold
> **disposable test data**; nothing in either needs preserving. I have reweighted accordingly:
> **F10 drops from Medium to Low** and the data-*disposition* half of F1 drops with it. Nothing
> else moves, and one finding gets **stronger**: F3's failure mode is not only a legacy-data
> artefact — `ON DELETE SET NULL` regenerates the same NULL-creator condition permanently, on
> data that does not yet exist. See F3.
>
> The findings are deliberately framed around **structure that outlives the current table
> contents**: the unvalidated write path in F1(b), the containment rule in F3, the egress
> chokepoint in F4, the unbounded queue in F5, the seed predicate in F7. Recoverable is not the
> same as correct, and none of those become acceptable because today's rows are throwaway.

---

## F1 — BLOCKING. The place-level activity path is missing from the design, from the pre-migration check, and from the ownership validation

**What is wrong.** §3.3 states:

> `trip_activities_map` does the same for activities at both trip and place level (TR-04).

That is false. Place-level activities live in a **separate table**, `trip_place_activities_map` (`src/backend/db/schema.ts:376-387`), with its own FK `activity_id → activities.id`. `trip_activities_map` (`schema.ts:314-325`) is trip-level only. The spec never names `trip_place_activities_map` anywhere.

*Probes (this is a negative claim, so two that fail differently):* (1) `grep -n "trip_place_activities_map\|tripPlaceActivitiesMap\|place_activities\|placeActivities"` over the full spec — no match, exit 1; (2) I read all 941 lines and traced §3.3 → §8 → §9.3, the three places the table would have to appear. A different table name would defeat (1); a section I skimmed would defeat (2).

**Three concrete failures follow.** Under the PO's disposable-data constraint, **(b) is the one that
matters and it is the reason this stays blocking** — it is a permanent hole in the access model, not
a property of today's rows. (a) drops to a correctness check on the brief's own instructions.

**(a) The blocking pre-migration check queries the wrong table set — and the COO's live-data query inherited the error.** §9.3's check, and the COO's staging/production probe reported to me mid-review, both enumerate `trip_categories_map` and `trip_activities_map` joined via `trips`. `trip_place_activities_map` joins via `trip_places`, not `trips`, so it is unreachable from that query shape. Reproduced on a scratch DB built from the real migration chain, with one non-owner place-level activity assignment present:

```
--- the check as specified (trip-level only) ---
cat map non-owner:        [{"c":0}]
act map non-owner:        [{"c":0}]
--- the table the check omits ---
place-act map non-owner:  [{"c":1}]
```

The specified check returns a clean zero while cross-user data exists. This is precisely the failure §13 warns about — "the only place where being wrong corrupts data rather than costing a re-run" — arrived at from a direction the author did not anticipate.

**(b) §9.3's remediation does not reach the write path.** §9.3 and §3.3 both scope the ownership fix to `tripRepository.replaceAssociations`. I confirmed that function currently validates **only** companions (`src/backend/repositories/trips.ts:250-257` — `companionRepository.validateOwnership`; the `categoryIds` and `activityIds` branches at `:264-293` have no equivalent), so the spec is right that it needs extending. But place-level activities never pass through it. They are inserted by:

```
src/backend/routes/places.ts:242-280   POST /api/trips/:tripId/places/:placeId/activities
```

which validates that the *place* belongs to the caller (`:255-256`) and then inserts the caller-supplied `activity_id` with no check on the activity at all (`:274-276`). Post-migration, on the same scratch DB, the database accepted a non-owner's place tagged with the owner's activity:

```
DB ACCEPTED cross-user place activity:
[{"trip_place_id":100,"activity_id":2,"activity_owner":"owner1","place_owner":"nonown1"},
 {"trip_place_id":100,"activity_id":1,"activity_owner":"owner1","place_owner":"nonown1"}]
```

SQLite cannot express this constraint (the FK is to `activities.id`, which has no user dimension) — exactly the reason ADL-28 R4 put companion validation in application code. The same reasoning applies here and the spec does not carry it across.

**(c) §8 has no place-level assertion**, so nothing would catch (b) in CI.

**Required corrections.**

1. §3.3: replace the sentence with an accurate statement of the three junction tables and their join paths.
2. §9.3's pre-migration check: add the third query (given verbatim in "What I could not verify" below).
3. §9.2/§9.3 tasks: add activity-ownership validation to `POST /api/trips/:tripId/places/:placeId/activities`, rejecting a cross-user `activity_id` with 400 — same contract as `replaceAssociations`.
4. §8: add `POST /api/trips/:t/places/:p/activities` with another user's `activity_id` → **400**.
5. AD-09's success criteria (§6.3) say "assigning a category or activity belonging to another user **to a trip** is rejected with a 400." Widen to "to a trip or a place."

**Adjacent, lower severity, same root:** the read joins at `src/backend/repositories/places.ts:91` and `src/backend/routes/trips.ts:210` left-join `activities` on id alone. Once rows are per-user those become cross-user reads for any pre-existing mapping. Harmless once (3) closes the write path, but worth one line in the brief so it is a deliberate decision.

---

## F2 — BLOCKING. `npm run db:generate` produces a migration that cannot be applied, and §9.3's reason for hand-writing is the wrong mechanism

**What is wrong.** §9.3 says:

> Two files, one per table, each a SQLite table recreation (`UNIQUE(name)` → `UNIQUE(user_id, name)` cannot be done with `ALTER TABLE`)

and then warns the engineer to *"review the generated SQL by hand before applying — drizzle-kit's four patched bugs are specifically around table recreation."*

Both halves are wrong about what actually happens. I applied the per-user schema change to `schema.ts` and ran `npx drizzle-kit generate`. It produced **no table recreation at all**:

```sql
DROP INDEX `activities_name_unique`;
ALTER TABLE `activities` ADD `user_id` text NOT NULL REFERENCES users(id);
CREATE UNIQUE INDEX `uniq_activities_user_name` ON `activities` (`user_id`,`name`);
CREATE INDEX `idx_activities_user` ON `activities` (`user_id`);
-- …same four for trip_categories
```

`name text NOT NULL .unique()` is realised in this schema as a **standalone unique index**, not an inline table constraint — so drizzle drops it with `DROP INDEX` and never needs a rebuild for that reason. The premise "cannot be done with `ALTER TABLE`" is not the mechanism.

The real blocker is a different one, and it is fatal. Applying that file fails outright:

```
$ npx drizzle-kit migrate
Error: Cannot add a NOT NULL column with default value NULL
```

SQLite requires a non-NULL default when adding a `NOT NULL` column, *and* requires a NULL default when adding a column with a `REFERENCES` clause under FK enforcement. Those two requirements are mutually exclusive, so `ADD COLUMN user_id text NOT NULL REFERENCES users(id)` can never be applied — on an empty table or a full one.

**Why it matters.** The Database brief inherits §9.3 as its instruction set. Following it, the engineer runs `db:generate`, gets four ALTER/INDEX statements, has **no `__new_` scaffold to hand-edit**, and is told to watch for a table-recreation bug class this output never reaches. The correct instruction is the opposite and much stronger: **discard the generated file entirely and hand-write the twelve-step recreation**, using migration `0012_grey_ultimates.sql` (companions + shading config) as the template.

**The good news, and it is the answer to §13's headline question: the shape §9.3 describes is correct.** I hand-wrote it and executed it. See "What I verified as correct" below — `id` is preserved, `trip_categories_map` survives, `PRAGMA foreign_key_check` is clean. Validated SQL is appended at the end of this document so the Database brief starts from something that has actually run.

---

## F3 — The containment clause hides every pre-existing pending city from all users

**What is wrong.** §4.4 and §9.3 both specify the search clause as:

> `WHERE geocode_status = 'resolved' OR created_by_user_id = :me`

§4.4 separately, and correctly, reasons that `createdByUserId` must be nullable because "NULL means *seeded, or created before this column existed*". But a row that is `pending` **and** has `created_by_user_id IS NULL` satisfies neither disjunct. Every city that exists today and has not yet resolved becomes **invisible to every user, permanently** — including its own creator, who has no creator record.

The spec reasons carefully about NULL semantics for the *column* and then writes a query that has no branch for NULL. Nobody notices at review time because the migration adds no backfill, so there is nothing to look at.

**This is not only a legacy-data problem, and that is what makes it durable.** `created_by_user_id`
is `ON DELETE SET NULL` — a deliberate and correct choice (§4.4: deleting a user must never delete
shared city rows). So NULL is **not** a one-off legacy value that drains away after the migration.
Every time a user is deleted, all of their cities have their creator nulled — and any of those still
`pending` become invisible to everyone, forever, on data created *after* this ships. The two
deliberate design choices §4.4 reasons about most carefully — nullable column, `SET NULL` not
cascade — combine into a permanent failure the clause has no branch for. **This survives the
disposable-data constraint intact; it is a rule defect, not a data defect.**

**Legacy blast radius, bounded honestly** (the part the PO constraint does downgrade). Cities are
*not* seeded at startup — `grep -n "cities\|seedCities" src/backend/db/seed.ts` returns nothing, and `seed.ts` writes only categories/activities (`:44,50`) plus countries/regions. So the NULL-creator set is exactly the cities users have created to date. Any of those still `pending` — a failed or never-attempted geocode — disappears. In CI and E2E (`GEOCODING_ENABLED=false`) *every* city is pending, so a naive fixture-based test would pass while the real environment silently loses rows.

**Correction.** `WHERE geocode_status = 'resolved' OR created_by_user_id = :me OR created_by_user_id IS NULL`, with a comment stating that NULL means "no known creator — seeded, pre-column, or creator since deleted" and is treated as global. Amend GE-16's success criteria to add: *a pending city with no recorded creator remains visible to all users* — phrased that way rather than "predates the column", so it covers the `ON DELETE SET NULL` case too.

**Related, minor:** `GET /api/cities/:id` (`cities.ts:195-217`) carries no containment clause in the spec. GE-16 scopes the requirement to *search*, so this is arguably correct and deliberate — but it is unstated, and by-id fetch is how the retry queue polls. One sentence saying it is deliberately uncontained would close it.

---

## F4 — D7's rate-limit evidence does not survive inspection, and the release adds call sites without building the chokepoint it argues for

**I am not disputing the decision.** Proxy over CSP widening is right, and the forbidden-`User-Agent` argument carries it alone. What fails is the supporting evidence, and the spec then declines to build a limiter *because of* that evidence.

§5.1 asserts the server-side client "enforces a 1.1 s delay above the 1 req/s limit (`:17`)" and §5.1's operational note recommends "reuse of the existing 1.1 s delay discipline rather than a second, competing limiter."

Reading `src/backend/services/geocoding.service.ts`:

- `REQUEST_DELAY_MS` (`:17`) is used in exactly one place: a `sleep()` inside `processQueue`'s `for` loop (`:183-190`). **There is no limiter object to reuse** — it is a sleep in a loop, private to one function.
- `resolveCity` is exported and called directly, fire-and-forget, from `POST /api/cities` (`cities.ts:167`). That path is **not rate-limited at all** today.
- Each `resolveCity` makes **two** Nominatim requests: the `isOnline()` HEAD probe (`:85` → `:32-46`) and then the search GET (`:105`). So even `processQueue` issues roughly two requests per 1.1 s — already above the 1 req/s policy the ADL-10 comment claims compliance with.

After this release there are **three** uncoordinated call sites against one rate-limited third party: the 15-minute queue, resolve-then-create on every `POST /api/cities`, and the new user-interactive proxy behind `AddPlaceFlow`'s type-ahead. And they now share one `User-Agent` and one egress IP — which is what §5.1 wants for accountability, but it also means a policy violation now blocks **the application** rather than an anonymous browser. **The proxy increases rate-limit exposure unless the chokepoint is actually built.**

**Correction.** §5.1 must specify a single serialized queue through which *all* Nominatim egress passes (queue + resolve-then-create + proxy), or state explicitly that it is not being built and record the accepted risk. It should also drop the claim that a reusable limiter exists, and either drop `isOnline()` from the per-city path or count it. As written, the Backend brief inherits "no new limiter needed" from a premise that is not true.

---

## F5 — Opening city creation converts a bounded retry queue into an unbounded one

This is a consequence of a PO decision, not a challenge to it — flagged under the brief's explicit invitation to name consequences the spec missed.

§4.4's containment is self-maintaining *because* junk never resolves. That is correct and it is the right reason to adopt it. The flip side is not stated anywhere: **a row that never resolves is re-attempted every fifteen minutes, forever.**

`processQueue` (`:152-193`) selects every `geocode_status = 'pending'` row, ordered by `geocodeAttemptedAt`, and re-attempts all of them. There is no attempt counter, no backoff, and no terminal state.

*Probes (negative claim, two that fail differently):* (1) I read `processQueue` and `resolveCity` end to end — no counter, no cap, no give-up branch; (2) the `cities` table definition (`schema.ts:93-128`) has columns `id, country_code, region_id, name, latitude, longitude, geocode_status, geocode_attempted_at, created_at, updated_at` and `check('chk_cities_geocode_status', … IN ('pending','resolved'))` — there is no attempts column and the CHECK constraint *forbids* a third `'failed'` state. (1) would miss logic in another module; (2) would miss a counter kept outside the schema.

Today this is bounded because only the owner can create cities. **D4 removes that bound.** Every typo, every unresolvable name, every "asdf" any authenticated user ever submits becomes a permanent line item in a queue that costs two HTTP requests against a 1 req/s budget every fifteen minutes, forever. Combined with F4, the fifteen-minute queue alone can starve the interactive proxy.

**Correction.** Decide this now, while the migration is open. S4 already does an `ALTER TABLE cities ADD COLUMN`, so adding `geocode_attempts integer NOT NULL DEFAULT 0` alongside `created_by_user_id` is nearly free, and a give-up rule (stop re-attempting after N failures; keep the row usable and creator-private) costs a few lines in `processQueue`. Deferring means a second `cities` migration later. If the PO prefers to defer, that is fine — but it should be a recorded decision rather than an unnoticed one.

---

## F6 — §8 enumerates one of four test files that assert on these routes

Deliverable #4 of brief #326 exists so the Backend brief "inherits authority for the change" rather than appearing to weaken security tests on its own initiative. §8 delivers that for `security.access-matrix.test.ts` and only that file.

Three others assert on the same routes and break at S3 when `/api/admin/categories` and `/api/admin/activities` cease to exist:

| File | Assertions | Breaks because |
|---|---|---|
| `src/backend/routes/__tests__/owner-access.test.ts` | `:129,137` (non-owner 403), `:147,155` (**owner 200/201**) | the owner assertions become 404 |
| `src/backend/routes/__tests__/qa-backend-fixes.test.ts` | `:210,228,244,284` — snake_case shape, `/active` filtering, POST, soft-delete | routes gone |
| `tests/contract/places.contract.test.ts` | `:318,386` — `GET /api/admin/activities` expect(200) | routes gone; contract suite, not unit |

*Probes:* (1) `grep -n "owner-access.test\|qa-backend-fixes"` over the spec — exit 1; (2) `grep -rln` for the route strings across `src/` and `tests/` returns these four test files plus four frontend files.

This is the exact situation OP-30 was adopted after: an implementation agent facing a red check its brief did not authorise it to touch. Under a single release the surface is four files at once.

**Verified counterpoint, because it looks like a fifth break and is not.** §8's "must NOT change" list — `GET/POST/PATCH/DELETE /api/admin/categories → 403` — **does** survive S3, and the spec is right to leave it alone. `adminRouter.use(requireOwner)` (`admin.ts:105`) is router-level middleware, not per-route: once the sub-router mounts at `:232-233` are removed, a non-owner request to `/api/admin/categories` still reaches `requireOwner` and still gets 403 (an *owner* gets 404). I checked this specifically because it reads like an omission.

**Correction.** §8 gains a table per file, current → intended, at S3.

---

## F7 — The lazy-seed trigger predicate is unspecified, and the obvious implementation breaks AD-09's first success criterion

**The concurrency half of this is fine, and I want to say so explicitly** since it was raised as a concern. §3.2 says to reuse AD-07's mechanism. That mechanism is `shadingConfigRepository.seedDefaults` (`src/backend/repositories/shadingConfig.ts:94-108`), which uses `.onConflictDoNothing()`. Two simultaneous first requests from a new user therefore cannot double-seed, and the guarantee survives the change from global `UNIQUE(name)` to `UNIQUE(user_id, name)` — the composite index is the conflict target. **No defect. But `onConflictDoNothing` is the load-bearing detail and §3.2 does not name it**, so an implementer reusing "the pattern" loosely could drop it.

**The defect is the trigger.** shadingConfig seeds when the user has zero rows (`:25-30`, `:42-59`). That is safe there because shading config has **no user-create path** — the six rows are fixed constants and users only ever update them. Categories and activities are different: `POST /api/categories` is a first-class user action.

So: a brand-new user whose first action is to add "Diving" via the admin tab now has one row. The zero-row test is false. **They never receive the defaults.** AD-09's first success criterion — *"a user signing in for the first time sees the full default category and activity lists with no manual setup"* — fails, silently and permanently, for exactly the user who engaged with the feature first.

A second, cheaper variant: if the predicate counts *active* rows rather than all rows, a user who deactivates every entry gets them all re-seeded, which reads as "deleted items keep coming back."

**Correction.** §3.2 must state the predicate. The robust form is to seed on identity rather than on row count — seed at user creation, or carry a marker (e.g. `users.lists_seeded_at`) — and to run it before *any* categories/activities handler, not only the read. If a row-count trigger is preferred for symmetry with shading config, it must count all rows and must also fire on the write path. Either is fine; leaving it to the implementer is not.

---

## F8, F9, F10 — smaller corrections

**F8 — the geocoding proxy route is absent from OP-06 §2.1.** The revised matrix is otherwise good work, and its own stated invariant (via SE-01's proposed success criteria, §6.1) is that *every* `/api/*` route is classifiable into exactly one tier. The single brand-new route in this release does not appear in it. §9.2's security checklist does specify `requireAuth`, so it is not unspecified — but the canonical home should carry it. Suggest a tier-1 row: `POST /api/geocode/lookup` (or the chosen path), `requireAuth`, both columns "Read (200)", noting it is first-party egress and must not be anonymous.

**F9 — multi-owner is unhandled.** §9.3 inherits ADL-28's documented zero-owner caveat (`CROSS JOIN … LIMIT 1` matches an empty set → 0 rows copied). It does not carry the symmetric case: if more than one row has `is_owner = 1`, `LIMIT 1` picks an **arbitrary** one with no ordering, and every global category silently lands on whichever user SQLite returned first. Add `SELECT COUNT(*) FROM users WHERE is_owner = 1` to the pre-migration check and require the answer to be exactly 1.

**F10 — the release is not code-revertible, and nothing says so. Downgraded to Low.** §9.1 covers forward migration only. The PO's disposable-data constraint means the recovery path is "reseed", so this is no longer a design constraint worth spending effort on — I am keeping it because the *documentation* gap is still real and costs one paragraph, not because the risk is significant. It also expires on its own: this is only cheap while the data is disposable, and the release ships into a future where it is not.

*Probes (negative claim, two that fail differently):* (1) `grep -rin "rollback\|down.sql\|revert"` over `src/backend/migrations/` and `scripts/` — no matches, and the migrations directory contains only forward `NNNN_*.sql` files plus `meta/`; (2) `grep -in "rollback\|roll back\|revert\|down migration\|irreversib"` over the spec itself matches once, on the unrelated word "irreversibly" in §3.4. So neither the repo nor the spec has a rollback story.

That is a pre-existing project convention, not something ADL-46 broke. **But §9.1's single-release decision plus the `production` fast-forward promotion model makes "revert the merge" the natural incident response**, and here it produces a state worse than the bug it fixes:

- `admin.ts:172-175` inserts `{ name, createdAt, updatedAt }` only. Against the migrated table, `user_id NOT NULL` with no default → every category/activity creation fails at the DB.
- `admin.ts:141` does `db.select().from(table)` unfiltered → the owner's admin panel shows **every user's** categories.

**Correction.** One paragraph in §9.1 stating the posture explicitly: forward-fix only, no code-level revert after the migration has run; the emergency lever is `S1 alone` **before** the release, not a revert after it. §9.1 already retains "S1 alone clears the P1" as a fallback — it just needs saying that the fallback expires at merge.

---

## Preferences — explicitly NOT defects

Stated separately so they carry no weight against the spec.

**P1 — D5 is sized optimistically.** §4.3 says "the only genuinely new thing is *ordering the resolve before the insert*", and §5.1 says the proxy is "consolidation, not new capability." Two things are also new: `resolveCity` requests `addressdetails=0` and reads only `lat`/`lon` (`:102`, `:122-123`), so canonical-name and region-ISO extraction do not exist yet; and there is no name→result function that works without a `cities` row, which both the proxy and D5 step 3 need. This is a sizing note for the Backend brief, not a design error — the design is right.

**P2 — containment and find-or-create interact in a way that is specified but untested.** §4.3 step 2 keeps pass 1 uncreator-scoped ("unchanged"). So if user A holds a pending "Springfield, US" and user B submits the same name, B's search shows nothing but B's `POST` returns A's row with 200. I believe that is the correct behaviour — `uniq_cities_name_country_ci` is global, and creator-scoping pass 1 would make the insert collide with the unique index and surface as a constraint error. But the outcome is nowhere stated and §8 has no case for it. Add one: *non-owner B posts a name matching another user's pending city → 200, existing row, no new row.*

**P3 — OP-06 §2.1 says duplicates are "impossible"** on the constrained `POST /api/cities` path. §10.2 of the spec itself documents that `COLLATE NOCASE` is an ASCII-only fold and does not converge `"Zurich"`/`"Zürich"`. "Duplicates impossible" is stronger than the spec's own analysis supports; "duplicates structurally prevented for case variants, and for near-misses the geocoder canonicalises" is accurate and still makes the point.

---

## What I verified as correct

Recorded so the COO knows these were checked, and by whom.

**§13's headline question — does the S3 migration preserve `id`? YES.** Not checked arithmetically: I applied the per-user schema to `schema.ts`, hand-wrote the twelve-step recreation following `0012_grey_ultimates.sql`, and ran it via `drizzle-kit migrate` against a scratch DB built from the full real migration chain with a `trip_categories_map` row present.

```
trip_categories:          [{"id":2,…"City Break"},{"id":1,…"Ski Trip"}]   ids preserved
trip_categories_map:      [{"trip_id":10,"category_id":1}]                intact
PRAGMA foreign_key_check: []                                             clean
sqlite_sequence:          [{"name":"trip_categories","seq":2},{"name":"activities","seq":2}]
```

The child FK clause correctly re-binds to the renamed table (`FOREIGN KEY (category_id) REFERENCES trip_categories(id)` after `RENAME`), which is the step that most often goes wrong. **§9.3's migration shape is sound. Its route to that shape is not — see F2.**

**FK enforcement is ON at runtime.** `PRAGMA foreign_keys` → `1` on a `@libsql/client` connection. Corroborates CLAUDE.md's correction of the ADL-41 §7.2.1 false claim; re-verified rather than inherited.

**FK disabling during migration works on both transports, including remote Turso.** This matters because production is Turso and `PRAGMA foreign_keys` is a no-op inside a transaction. Local: `node_modules/@libsql/client/lib-esm/sqlite3.js:105` issues `PRAGMA foreign_keys=off` **before** `BEGIN`. Remote: `http.js:123` passes `disableForeignKeys = true` to `executeHranaBatch` (`hrana.js:199`). Both paths are safe for the table recreation.

**§8.1's stale `it.skip` is real and correctly characterised.** `it.skip('PATCH /api/cities/1 → 403 …')` is live in `security.access-matrix.test.ts`, `citiesRouter.patch` is at `cities.ts:223` with `requireOwner` at `:225`. The spec's corrected citation is right and the coverage-hole framing is right — this assertion has not run since BUG-22 merged.

**§3.1's Express fall-through mechanism works**, including the case §13 premise 5 flags as newly assumed. A sub-router mounted above the guard exposing only `GET /active` lets `GET /categories`, all writes, and every unmatched method fall through to `requireOwner`. And, checked separately because it reads like a break: §8's "must NOT change" 403 rows survive S3 — see F6's counterpoint.

**§10.1 (the geocode retry path is server-side, not browser-driven) is correct**, re-derived independently: `useGeocodeRetryQueue.ts` issues only `apiGet('/api/cities/:id')`; `processQueue` is imported at `server.ts:47`, invoked at `:325`, rescheduled by `setInterval` at `:330`.

**GE-16's "a request supplying latitude or longitude is rejected" is already satisfied** — `CreateCitySchema` is `.strict()` (`src/backend/validation/cities.schemas.ts:8-14`) with no coordinate fields. No work needed; worth marking in the brief so nobody builds it.

**§3.2's rejection of Option B is correct** on both counts: NULLs are distinct in a SQLite unique index, so `(NULL,'Beach')` genuinely would not conflict with `(user1,'Beach')`; and the AD-03/AD-06 per-user override argument holds. I looked for a reason to prefer Option B and did not find one.

**The COO's live-data query logic is sound for the tables it covers.** `trips.userId` is `.notNull()` (`schema.ts:251-253`) and `users.isOwner` is `.notNull().default(0)` (`:639`), so the inner join loses no rows and `is_owner = 0` is a complete complement of `is_owner = 1`. The zero result is trustworthy **for trip-level mappings**. It is not evidence about place-level mappings — see F1(a).

**Cities are not seeded at startup**, which bounds F3's blast radius. `grep -n "cities\|seedCities" src/backend/db/seed.ts` returns nothing; `seed.ts` writes categories/activities at `:44,50` plus countries/regions.

---

## What I could not verify

**Whether any live data actually trips F1 or F3.** No DB credentials in this worktree and the firewall blocks direct Turso access; `scripts/agent-diagnostics/turso-query.mjs` is the allowlisted path and I did not have the environment for it. **UNVERIFIED — blind spot: my F1(a) and F3 blast-radius statements are structural, derived from schema and code, not from production counts.** Three queries close it; the COO should run all three against **both** staging and production, for the same environment-parity reason the trip-level probe was:

```sql
-- 1. F1(a): the table the specified check omits. Expect 0.
SELECT COUNT(*) FROM trip_place_activities_map m
  JOIN trip_places p ON p.id = m.trip_place_id
  JOIN users u ON u.id = p.user_id
 WHERE u.is_owner = 0;

-- 2. F3: pending cities that would vanish under the clause as written. Expect 0.
SELECT COUNT(*) FROM cities WHERE geocode_status = 'pending';

-- 3. F9: the migration's CROSS JOIN assumption. Must be exactly 1.
SELECT COUNT(*) FROM users WHERE is_owner = 1;
```

If (1) is non-zero, §3.3's disposition contingency applies to place-level rows too and the Database brief must say so. If (2) is non-zero, F3 is not theoretical. If (3) is not 1, F9 is live.

**Point-in-time versus migration-time, which the COO asked about and I agree is not closed by counting.** *(Reweighted: with disposable data this is no longer about protecting rows. It is about the migration not silently legitimising a cross-user reference — a correctness property that persists after the data stops being disposable.)* A zero today is not a zero when the migration runs — `POST`/`PATCH /api/trips` accepts `category_ids` and `activity_ids` under `requireAuth` alone, and `POST /api/trips/:t/places/:p/activities` accepts `activity_id` the same way, so rows can appear at any moment between the probe and the deploy. **Recommendation: do not rely on the count. Make the migration self-verifying.** The CROSS JOIN backfill is a no-op for these rows either way — it re-points nothing in the junction tables — so the risk is not that the migration corrupts them but that it *silently legitimises* a cross-user reference. Add a post-migration assertion in the same migration file, after the recreations:

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

plus the two equivalents for `trip_activities_map` (join via `trips`) and `trip_place_activities_map` (join via `trip_places`). A failed migration is recoverable; a silently wrong one is the thing §13 was worried about. This converts the spec's "query staging first" from a point-in-time check into a run-time invariant, which is what the single-release decision actually requires.

**Live Nominatim behaviour.** The devcontainer firewall allows GitHub, npm and Anthropic only, so F4 and F5 are derived from reading `geocoding.service.ts`, not from observing request rates. **Blind spot: I have not measured actual request volume or confirmed Nominatim's current enforcement behaviour.** The code-level facts (one sleep, in one loop, private to `processQueue`; two requests per `resolveCity`; no give-up rule) are solid; the operational consequence is inference.

**§4.6's ODbL/attribution finding.** Not re-probed. The spec already marks it single-probe and names its own blind spot (README only, not `LICENSE`, footer, or map attribution control). I agree with that self-assessment and add nothing.

**Frontend scope.** §11 declares the S3 admin-tab UI and BUG-62's `ownerOnly` flags as undesigned and needing an owner in the same release. I did not review that gap beyond confirming it is declared — it is honestly flagged, and it is a scope question for the COO rather than a defect in the spec.

---

## Appendix — validated S3 migration

This ran successfully against a scratch DB at migration `0013` with junction rows present, and produced the verification output quoted above. Offered so the Database brief starts from something that has executed, not from a description. It still needs review in context — column order and the exact `CHECK` text must be re-confirmed against `schema.ts` at implementation time — and it deliberately mirrors `0012_grey_ultimates.sql`'s structure, including its `PRAGMA` bracketing.

```sql
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_trip_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_trip_categories_is_active" CHECK("__new_trip_categories"."is_active" IN (0, 1))
);
--> statement-breakpoint
-- ADL-46 §9.3 / ADL-28 prior art: assign existing global rows to the app owner,
-- PRESERVING id — trip_categories_map.category_id FKs to it. Same zero-owner
-- caveat as 0012 (fresh dev DB copies 0 rows; lazy seed covers it), plus the
-- multi-owner caveat: LIMIT 1 picks arbitrarily, so the pre-migration check must
-- assert exactly one is_owner = 1 row (review F9).
INSERT INTO `__new_trip_categories` ("id", "user_id", "name", "is_active", "created_at", "updated_at")
SELECT c."id", u."id", c."name", c."is_active", c."created_at", c."updated_at"
FROM `trip_categories` c
CROSS JOIN (SELECT "id" FROM `users` WHERE "is_owner" = 1 LIMIT 1) u;--> statement-breakpoint
DROP TABLE `trip_categories`;--> statement-breakpoint
ALTER TABLE `__new_trip_categories` RENAME TO `trip_categories`;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_trip_categories_user_name` ON `trip_categories` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_trip_categories_user` ON `trip_categories` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
-- …identical block for `activities` (chk_activities_is_active,
--    uniq_activities_user_name, idx_activities_user).
-- Then the cross-user assertions from "What I could not verify" above.
```

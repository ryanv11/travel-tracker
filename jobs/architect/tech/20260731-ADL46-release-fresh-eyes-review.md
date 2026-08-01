# ADL-46 release — OP-27 fresh-eyes review (integration branch, pre-merge)

**Date:** 2026-07-31
**Reviewer:** Architect (fresh dispatch, no authorship of any stage)
**Subject:** `release/adl46-access-model` @ `79ea9a4` (4 commits, ~50 files, +8107/−501 vs `main`)
**Design of record:** `jobs/architect/tech/ADL-46-non-owner-access-model.md`; BRD v3.13 (GE-16, SE-01/SE-03/AD-09); ADL-47 in force.
**Method:** every claim below is grounded in either a line-by-line read, an actual execution
against scratch databases through the real migrator, or a live query against staging/production
via the ADL-33 diagnostic path. Green CI was not treated as evidence for anything.

---

## 1. Verdict

**SHIP WITH FOLLOW-ONS** — with one finding (F1) that should be fixed **on this branch before
merge**, because as assembled the release violates two of GE-16's own success criteria and
therefore cannot pass its own UAT gate as written.

The migrations — the area billed as highest risk — are **sound**. I executed the full chain
against seeded scratch databases through the real `drizzle-kit migrate` path (not by reading
alone): ids preserved, every column copied correctly, all three junction tables intact,
`PRAGMA foreign_key_check` clean, every index (partial, expression, collation) reproduced
exactly, the cross-user assert genuinely aborts and rolls the whole batch back, and the live
§9.3.2 preconditions pass on **both staging and production as of today**. The access model is
faithfully implemented. The ATDD suite is genuinely spec-derived and was never adjusted to fit
the implementation.

The serious finding is not in the DDL. It is that the background re-resolution path silently
undoes the release's own headline "ask, don't guess" decision (D14) within seconds of a user
declining to choose.

---

## 2. Summary table

| # | Finding | Severity | Area | Confidence |
|---|---|---|---|---|
| F1 | Queue/on-create re-resolution auto-picks `candidates[0]`, defeating D14 and violating two GE-16 success criteria | **High** | Backend (geocoding) | High |
| F2 | Wildcard upgrade mutates a shared — possibly `resolved`, possibly another creator's — city row on a `requireAuth` path | Medium | Backend / spec conflict | High |
| F3 | Migration 0014's manual preconditions are not self-enforced; a zero-owner DB **commits dangling FKs silently** (executed, reproduced); multi-owner assigns silently to an arbitrary owner | Medium | Migrations | High |
| F4 | The resolve-then-create `'ok'` path (canonical pass 2, D12 never-overwrite) has **zero route-level test coverage** — every route suite mocks it away | Medium | Test coverage | High |
| F5 | In-file `PRAGMA foreign_keys` statements are no-ops under the real migrator on **both** transports; protection actually comes from the driver, which also runs all pending files as one transaction and never re-validates FKs after commit | Low (doc/knowledge) | Migrations | High |
| F6 | Old-code/new-schema deploy window: previous instance serves for minutes after the new instance's migration commits; old admin-list INSERTs 500 in that window | Low (accepted under D9) | Deploy | Medium |
| F7 | Ambiguous/unresolved POSTs cost two Nominatim searches (resolveCityName + immediate resolveCity re-query); an already-answered "no match" is re-asked to reach `'unresolvable'` | Low | Backend (efficiency) | High |
| F8 | QA/ATDD suite: genuinely spec-first (verified via git history), but its geocoding mock silently drifted from the module surface, and its coverage boundary should be understood before the D-17 trial is graded | Info | QA | High |

---

## 3. Findings

### F1 — Background re-resolution auto-picks the first candidate, defeating D14 (HIGH)

**What breaks.** GE-16 commits to: *"where a lookup returns more than one candidate the user is
asked to choose rather than one being selected for them, and declining to choose still creates a
usable pending record"* and *"a lookup that remains ambiguous after being constrained by the
selected country and region creates a pending record rather than choosing a candidate."* The
interactive path honours both. The re-resolution path then breaks both, almost immediately.

**Mechanism, with file:line.**
- `POST /api/cities` with an ambiguous name (no region): `resolveCityName` correctly returns
  `'ambiguous'` and the route inserts a `'pending'` row from the user's text
  (`src/backend/routes/cities.ts:305-322`) — correct so far.
- The route then **fires `resolveCity(city.id)` fire-and-forget on that same row**
  (`cities.ts:329`).
- `resolveCity` re-queries Nominatim with the same name+country (`geocoding.service.ts:154-158`),
  gets the same multiple candidates, and hands them to `pickBest`
  (`geocoding.service.ts:172`), which — when the row has no region — **returns
  `candidates[0]`** (`geocoding.service.ts:200-211`). The row is promoted to `'resolved'` with
  the first candidate's coordinates and becomes globally visible.
- The same happens via `processQueue` every 15 minutes for any pending ambiguous row.

**Concrete failure scenario.** User submits "Springfield", US, no region. Frontend shows the D14
ambiguity choice; user declines (explicitly permitted by GE-16). Pending row is created —
and within roughly one second the fire-and-forget resolves it to whichever Springfield Nominatim
ranks first, with that candidate's coordinates, `'resolved'`, in the shared catalogue. The
"declining to choose still creates a usable **pending** record" criterion survives less than a
second whenever the geocoder is reachable. This is exactly the silent-wrong-entry class D14
§4.3.2 was adopted to prevent, and D14's reason 1 (post-D13, a wrong auto-pick creates a
plausible permanent entry instead of colliding) applies in full. The row is also potentially
internally inconsistent (user's text/no region + first candidate's coordinates) — D14 reason 3.

**Why nothing caught it.** No test exercises `resolveCity` with multiple candidates — the D10
suite (`src/backend/services/__tests__/geocoding.service.test.ts`) tests single-candidate
success, no-match, recoverable, disabled, and cap exhaustion, but never multi-candidate. The
ATDD suite mocks `resolveCity` to a no-op. Two probes (service-code read + full test-case
enumeration) agree.

**Root cause class.** The spec never reconciled D14 with the pre-existing promotion path — §4.4
says "promotion is already automatic" and D14 says "never guess", and no section says what the
*queue* does with an ambiguous name. The implementation resolved the silence in favour of the
old behaviour (`data[0]`), which is faithful to the code that existed and unfaithful to GE-16's
text. I am not proposing the fix here (reviewer, not author), but note the design tension the
fix must answer: if the queue simply refuses multi-candidate rows they retry forever (D10 has no
terminal state for "ambiguous"), so the answer needs an Architect decision, not a one-liner.
Candidate shapes: treat multi-candidate-no-region as leave-pending-with-increment (bounded by
the cap, stays creator-private — my lean), or a terminal `'ambiguous'` disposition.

**Recommendation.** Fix on this branch before merge. Backend-only. Until fixed, GE-16 UAT
cannot pass as specified, and the failure is quiet — precisely the kind this project has been
burned by.

### F2 — Wildcard upgrade writes to a shared city row on a `requireAuth` path (MEDIUM)

**What it does.** D13 step 2 (`cities.ts:156-181`): a region-bearing request that misses the
exact key **UPDATEs** a region-less row's `region_id` — with no guard on `geocode_status` and no
guard on `created_by_user_id`. Any authenticated user can therefore mutate a **resolved, shared**
catalogue row that other users' places already reference.

**Concrete failure scenario.** Catalogue holds "Springfield", US, `region_id NULL`, `resolved`,
with Illinois coordinates (geocoded before regions were used); user A's place references it.
User B posts "Springfield" + region Missouri. Step 1 misses (key `0` ≠ MO), step 2 adopts the
row and sets `region_id = MO`. Result: a shared resolved row whose name+coordinates say Illinois
and whose region says Missouri — the "internally wrong, nothing collects it" class §4.4.3
identifies as the one genuine gap — **and user A's place now displays a Missouri region**. A
concurrent two-region race (B posts MO, C posts IL simultaneously) is last-write-wins on the
same row.

**Why I grade it a spec conflict rather than an implementation bug.** The implementation follows
§4.2.1's step 2 verbatim — the spec states no status or creator restriction. But it contradicts
the same document's own principles: §4.4.2 rejects creator-edit precisely because it "can
silently mutate a city another user's place already depends on. Re-pointing cannot" — yet step 2
is exactly such a mutation; and GE-16 says "correcting, re-pointing … a shared city record
itself remains an owner operation." The upgrade-of-an-under-specified-record argument is
reasonable for `pending` rows; it is much weaker for `resolved` ones, whose coordinates already
encode a specific place.

**Recommendation.** Architect ruling required (follow-on, not necessarily pre-merge): restrict
the wildcard upgrade to rows that are not `'resolved'` (create a new regioned row instead —
legal under the D13 index), or explicitly accept and record the mutation with its failure mode.
Test impact either way: B2-style coverage exists only for the permissive behaviour.

### F3 — Migration preconditions are manual-only; the zero-owner path commits dangling FKs silently (MEDIUM)

**Executed, not reasoned.** I ran migrations 0000–0013 through the real migrator, seeded
representative data (categories/activities with junction rows on trips and places,
trip_places on shared cities, case-variant names, NULL-region rows), then applied 0014–0015
through the real migrator, in four variants:

- **Clean (1 owner):** sound in every respect I could measure — see §4 below.
- **Cross-user junction present:** 0014's assert **aborts** with
  `CHECK constraint failed: no_cross_user_trip_category_mapping` and the database rolls back to
  the exact 0013 state (old table shapes, no `__new_*` leftovers, journal unrecorded). The
  self-verifying invariant works and is correctly named. This was the DB stage's self-flagged
  "described but unexercised" block; it is now exercised.
- **Zero owners (with data):** the CROSS JOIN copies 0 rows, `DROP TABLE` discards every
  category/activity, junction rows survive pointing at nothing — `PRAGMA foreign_key_check`
  reports 4 violations — and the migration **commits and reports success**. The in-file assert
  is structurally blind to this: its `EXISTS` clauses `JOIN trip_categories c ON c.id =
  m.category_id`, and when the parent rows are gone the join yields nothing, so every CASE says
  `'ok'`. The worst outcome (parents deleted wholesale) passes the guard that exists.
- **Two owners:** every global row lands silently on whichever owner SQLite returns first.
  Documented (F9 caveat in the file header) but enforced by nothing.

**Mitigation, verified live.** I ran the three §9.3.2 blocking queries against **both staging
and production** today via `scripts/agent-diagnostics/turso-query.mjs`: `owner_count = 1` and
all three cross-user junction counts `= 0` on both. So the deploy path as it exists today is
safe. The residual exposure is (a) the probe-to-deploy window — which the ADL itself argues is
the reason point-in-time counts are insufficient (§9.3.3), an argument applied to the cross-user
check but not to these two — and (b) any future environment that has data but a different owner
story (fresh envs are empty and safe; restored dumps and dev DBs with mismatched
`OWNER_CLERK_ID` are not).

**Recommendation.** Cheap, same-trick hardening: two more columns on the existing assert table —
owner-count (`CHECK` requires exactly 1 when any `trip_categories`/`activities` rows exist) and
a post-rebuild orphan check. Fine as a fast-follow; must land before this migration is ever run
against a database whose owner story is not the two verified ones. Not merge-blocking on the
current promotion path.

### F4 — The resolve-then-create success path is implemented but unconstrained by CI (MEDIUM)

Every route-level suite that touches `POST /api/cities` mocks the geocoding service away:
`adl46-access-model.test.ts:93-95` (mocks the module with **only** `resolveCity`),
`cities-find-or-create.test.ts:52` and `place-repoint.test.ts:46` (both pin `resolveCityName`
to `'disabled'`). Consequently the branch `resolution.status === 'ok'` in
`cities.ts:271-303` — canonical pass 2 (the step §4.3 calls "the part that does the real work
and is easy to omit"), the 4b resolved insert, and D12 rule 3 (never overwrite user-supplied
country/region) — **never executes under any test**. GE-16's "near-miss the geocoder
canonicalises converges onto the existing row" criterion has no CI assertion. Service-level
classification is tested; the route wiring above it is not. I verified the code is correct by
reading it; nothing will notice if it regresses.

Also in this class: `'unresolvable'` rows in *search* containment (treated like pending —
correct per GE-16, untested), and §3.2.1's headline criterion (first-action POST still receives
the defaults) which is exercised incidentally by `qa-backend-fixes.test.ts:252-266` but never
asserted (the test checks the 201, not that defaults now exist).

**Recommendation.** A small route-level suite with a candidate-returning mock: near-miss
canonical convergence (200, no new row), 4b insert fields (coords from candidate, country/region
from request), and the F1 fix's chosen queue behaviour. Fast-follow or fold into the F1 fix PR.

### F5 — The in-file FK PRAGMAs are decorative; the driver is what protects you (LOW, knowledge-preservation)

Established by reading the actual execution path and confirmed by behaviour: drizzle's libsql
migrator batches **all pending migration files plus their journal inserts** into one
`client.migrate()` call (`drizzle-orm/libsql/migrator.js`), and `client.migrate()` on **both**
transports issues `PRAGMA foreign_keys=off` **before** `BEGIN deferred`, runs everything in one
transaction, commits, then re-enables FKs (`@libsql/client/lib-esm/sqlite3.js:101-127`;
`hrana.js executeHranaBatch(..., disableForeignKeys=true)` via `http.js:112-135`). Inside that
transaction the migration files' own `PRAGMA foreign_keys=OFF/ON` lines are silently ignored.

Consequences worth recording (none of them defects today):
1. The files' comments imply the in-file bracketing is load-bearing. It is not — running these
   files through any *other* runner (turso CLI, sqlite3 shell) changes the semantics materially
   (per-statement autocommit → a failed assert leaves a half-applied schema instead of rolling
   back). The safety property belongs to the migrator, and that dependency should be stated.
2. FKs are disabled across the *whole* batch — including any future migration file that assumes
   enforcement mid-migration.
3. Nothing re-validates FK integrity after commit (`foreign_keys=on` does not check existing
   rows) — which is why F3's zero-owner outcome is silent.

Recommend a comment amendment in both files (or the migrations README) — nothing more.

### F6 — Old-code/new-schema window during deploy (LOW, accepted)

`npm start` = `drizzle-kit migrate && tsx src/backend/server.ts`. During a Railway deploy the
previous instance keeps serving while the new one builds and migrates against the shared Turso
DB. After 0014 commits and before traffic cutover, the old code's admin-list INSERT
(`{name, createdAt, updatedAt}` only) fails against `user_id NOT NULL` — transient 500s on an
owner-only surface for the build window; reads are unaffected; old `POST /api/cities` still
works (new columns have defaults). A failed migration fails the new instance and leaves the old
one serving the old schema — the correct failure mode. This is the knowingly-accepted cost of
D9's single-shot cutover (§9.1.1's forward-fix-only posture applies); recorded so it is
recognised during the deploy rather than diagnosed as a product bug.

### F7 — Doubled egress on the unhappy creation paths (LOW)

For an `'ambiguous'` or `'unresolved'` outcome, `POST /api/cities` performs the
`resolveCityName` search and then immediately fires `resolveCity`, which repeats essentially the
same search ~1.1 s later (`cities.ts:266` then `:329`) — two Nominatim requests to learn one
fact, on the same 1 req/s budget the chokepoint exists to protect. For `'unresolved'`
specifically, the route already holds a terminal answer and could mark the row `'unresolvable'`
without the second query (D10's classification logic lives in `resolveCity`, which is why it
re-asks). Efficiency only; bounded; fold into the F1 fix if convenient.

### F8 — QA/ATDD suite assessment (INFO — feeds the D-17 trial verdict)

**It asserts the spec, and it was not adjusted afterwards.** Verified two ways: `git log
--follow` shows exactly one commit ever touching `adl46-access-model.test.ts` (8864b79, the QA
stage), and `git diff 8864b79..HEAD` on the file is empty. Its assertions cite ADL sections and
match GE-16/AD-09 criteria text, including the deliberately awkward ones (F3's NULL-creator
visibility with a fixture that defeats the "everything is pending in CI" trap; P2's
shared-pending-row bonus case; the §8.1 unskip as a live test).

Three boundary facts for grading it:
1. **Its geocoding mock has silently drifted from the module surface.** It mocks the module with
   only `resolveCity`; the backend stage later added `resolveCityName`, so in this suite that
   import is `undefined` and Group B only works because `cities.ts:265-269` wraps the call in
   try/catch (the TypeError is swallowed into `'disabled'`). Green-for-the-wrong-reason: if the
   backend had not wrapped it, the ATDD suite would have 500'd on every Group B test and read as
   "implementation wrong" when the mock was. Use `importOriginal` spreading (as its own db mock
   does at :59-68) or explicitly pin both exports.
2. **B4's deliberately weak assertion is why the D13 reverse-door defect escaped it** — it
   accepts any status as long as nothing is silently returned or duplicated, and says so in an
   honest comment. Defensible judgement call, correctly flagged in-file; but it means the suite
   constrains "not wrong" rather than "right" for the ambiguous case, which is exactly where F1
   now sits — a D14/queue assertion in the ATDD suite would have caught F1.
3. **Coverage boundary:** it does not constrain resolve-then-create's success path (F4), D10
   (backend-authored tests only), the queue's multi-candidate behaviour (F1), or seeding
   defaults. That is not a failure of the trial — it is the measure of how much of the release's
   definition-of-done the ATDD round encoded: the access matrix, D13 invariants, and containment
   are genuinely pinned; the geocoder-behaviour half of GE-16 is not.

### Verified fixes from the earlier defect round (both hold)

- **D13 reverse-door fix** (`cities.ts:183-194`, step 2b): correct — single regioned match with
  no region requested returns it; two or more return null without touching either; the
  has-region path cannot fall through into it (`:180` early return). Direct regression tests
  exist for all four shapes (`cities-find-or-create.test.ts:114,134,168,187`).
- **Frontend region-selector collapse fix** (`AddPlaceFlow.tsx:103-137`): correct — the
  narrowed candidate set is used only when it yields ≥2 seeded matches, otherwise the full
  country list renders (no zero-option stranding), the ambiguity hint stays visible either way,
  and no lone survivor is auto-selected. Reasoning in the comment matches BUG-30/OQ-06 reality.
  Note its limit: D14 narrowing only exists where the region dropdown renders (region-tier
  countries); for non-region-tier countries ambiguity degrades straight to the F1 path.

---

## 4. What I verified and how

**Migrations — executed through the real path, four variants.** Scratch DBs built by applying
0000–0013 via `drizzle-kit migrate` (config pointed at a truncated copy of the migrations
folder), seeded with adversarial data (case-variant city names across countries, NULL-region
rows in a region-tier country, junction rows at trip AND place level, trip_places on shared and
pending cities, sqlite_sequence populated), then 0014–0015 applied via `drizzle-kit migrate`.
Verified on the clean run: ids preserved on all three rebuilt tables; every junction row intact
(2/1/1); `PRAGMA foreign_key_check` empty; `trip_places` untouched; new-column defaults
(`geocode_attempts=0`, `created_by_user_id NULL`); DDL and all indexes byte-compared against
`schema.ts` intent (partial index WHERE, expression index with `COLLATE NOCASE` +
`COALESCE(region_id, 0)`, amended CHECK); live enforcement probed by insert (case-variant
duplicate rejected; same-name-different-region accepted; `'unresolvable'` accepted; bogus status
rejected; FK on `user_id` enforced post-migration); `sqlite_sequence` carried. Collision-on-
migration for `cities` is impossible by construction (the new key is a strict superset of the
old enforced key) — confirmed by the superset argument AND by executing with the nearest-legal
adversarial data. Abort/rollback semantics established by the cross-user variant; F3's variants
as described. Snapshot integrity: `drizzle-kit generate` against the shipped meta reports "No
schema changes" — future generates will not drift.

**Live preconditions.** §9.3.2's three queries + owner count run today against **staging and
production** via `turso-query.mjs`: owner_count=1, all cross-user counts 0, on both.

**Migrator semantics.** Read `drizzle-orm/libsql/migrator.js`, `drizzle-kit`'s bundled copy (the
one actually on the `db:migrate` path, per the failure stack trace), `@libsql/client`
`sqlite3.js` and `http.js`/`hrana.js` migrate implementations — both transports disable FKs
around a single deferred transaction. Cross-checked behaviourally via the rollback observed in
the cross-user variant.

**Backend.** Full read of `categories.ts`/`activities.ts` + both repositories (all queries
userId-scoped, `onConflictDoNothing` seeding on the composite index, seed-before-write on POST),
`admin.ts` (factory removed, no scaffolding, countries/regions writes below `requireOwner`,
fail-closed comment matches behaviour), `cities.ts` (containment clause matches GE-16 including
`IS NULL`; `GET /:id` deliberately uncontained; PATCH still owner-only with `region_id`-only
schema), `places.ts` (F1(b) place-level activity ownership 400; D11 repoint validates target
city), `trips.ts` `replaceAssociations` (category/activity/companion ownership 400),
`geocode.ts` (requireAuth via global mount, no scoping needed), the chokepoint (correct
serialization: start-to-start ≥1.1 s, FIFO interleave so interactive calls wait one slot, never
throws, `isOnline()` gone), `seed.ts`/`reset-staging.ts`/`startup.service.ts` (per-user
reconciliation, no global inserts left), `server.ts` mounts, validation schemas
(`CreateCitySchema` `.strict()` → client-supplied lat/long rejected per GE-16).

**QA suite.** Full read + `git log --follow` + `git diff` since its authoring commit (empty).

**Frontend (targeted).** `useCities.ts` (direct Nominatim fetch + forbidden `User-Agent` gone;
proxy consumed), `AddPlaceFlow.tsx` D14 handling as above, `types/api.ts`.

**CI.** Branch head 79ea9a4; latest CI + Security Checks runs on it green (`gh run list`) —
noted for completeness, not used as evidence.

## 5. What I could NOT verify, and why

1. **Live Nominatim behaviour.** The devcontainer firewall blocks it (allowlist: GitHub, npm,
   Anthropic). F1's mechanism is deterministic from code, but the *distribution* of
   multi-candidate responses (how often real names are ambiguous after the settlement filter,
   whether `ISO3166-2-lvl4` is reliably present for D12 matching) is unmeasured. The `type ==
   null` pass-through in the settlement filter (`nominatim-client.ts:141`) is untested against
   real payloads. Must be exercised on staging.
2. **Railway deploy sequencing (F6).** That the old instance serves during the new build/migrate
   is the platform's documented rolling behaviour and consistent with `start`'s
   migrate-then-serve, but I did not observe a live deploy; the window length is an estimate.
3. **The probe-to-deploy gap for F3's preconditions.** My staging/prod counts are point-in-time
   (2026-07-31). The cross-user half is covered at run time by the in-file assert; the
   owner-count half is not — that is F3's recommendation.
4. **UAT-facing frontend behaviour.** I read the D14/AddPlaceFlow code and its tests but did not
   drive the UI; the decline-flow → F1 interaction is asserted from code reading (high
   confidence, but it is exactly the class UAT should walk).
5. **`vitest.config.backend.ts` change** (+8 lines) reviewed only as diff context (test include
   path for the new suites) — not exercised beyond CI's green, which this review otherwise
   declines to lean on.

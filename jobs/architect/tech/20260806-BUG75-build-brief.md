# BUG-75 / UX-12 — City-identity build brief (ATDD-first)

> **ATDD-first: yes** (OP-35 / ADL-50). This brief is Architect-spec'd, changes `schema.ts` + adds a
> migration + touches the access-adjacent city-create path. **QA is dispatched FIRST** to turn the
> acceptance criteria below into *red* tests, handed to the implementers as the executable definition of
> done, before any implementation runs.

## 0. Authoritative design — read it, do not re-derive it
The mechanism is fully specified and thrice-reviewed. Implementers and QA read these (on their branches;
`git show <branch>:<path>`), and **must not re-litigate the settled core**:
- **v3 design (the spec to build):** `jobs/architect/tech/20260806-BUG75-round4-identity-design-v3.md` on branch `feat/bug75-round4-identity-design-v3`.
- **v3 delta review (the corrections + the safe-to-build verdict):** `jobs/architect/tech/20260806-BUG75-round4-identity-design-v3-review.md` on branch `review/bug75-round4-design-v3`.
- Context (do not re-open): v2 design + its review (same branch chain), the Round-4 brief `20260805-BUG75-identity-round4-brief.md`.

**Settled core (fixed — CLAUDE.md D-22):** identity is **carried, not derived** — the geocoder's OSM
`(osm_type, osm_id)` reference, carried from the candidate the user picks; `display_name` is the render
payload; distinct `osm_id` coexist; same `osm_id` merges. Not a hash, not a coordinate bucket, no
gazetteer dependency.

## 1. What ships (BRD GE-16, v3.19 — spike-gate lifted)
1. **The identity-carry channel, end-to-end:** parse `osm_type`/`osm_id` (and the `address.county`
   discriminator) in `nominatim-client.ts`; surface them in the `GET /api/geocode` proxy response;
   accept a carried `{osm_type, osm_id, display_name, region_id}` on `CreateCitySchema` +
   `POST /api/cities`; the server **re-derives canonical data from its own create-time lookup** and uses
   the carried ref only to *select* among its candidates (v3 §2.3 — no client-trusted coordinates).
2. **F1 canonicalize-by-id:** resolve the carried ref via Nominatim `/lookup?osm_ids=` through the
   **same serialized single-egress chokepoint** as the existing geocoder (v3 §D — this is the one place a
   careless build reintroduces multi-egress rate-limit exposure; ADL-49 §4.3).
3. **The shared `CityPicker` (BUG-75 + UX-12 — one component, two call sites):** a place-level picker that
   renders ambiguous candidates by `display_name` and sends the chosen candidate's carried identity.
   **REUSE, do not fork** (OP-28 / the duplication audit): reuse the existing results list
   (`AddPlaceFlow.tsx:422-444`) and the candidate/region-disambiguation logic (`:149-183`, `:277-345`,
   which encodes the BUG-71/78/79 + D14 fixes — **do not re-implement**). Consumed by both the add-place
   flow (BUG-75) and UX-12's "Change city" re-point (the D11 `city_id` re-point backend is already on main).
4. **The expand/contract migration** (ADL-47): EXPAND (add nullable `osm_type`/`osm_id`/`display_name`)
   then a single atomic SWITCH stage (drop the global `uniq_cities_name_country_region_ci`, add both
   partial unique indexes, land all coexistence code together — v3 §9 as corrected by review F2).

## 2. Corrections that MUST be folded in (from the v3 delta review — not optional)
- **M-A (BUG-33 door):** stamp the OSM reference on **every** resolve (not only carried-pick resolves).
  A non-ambiguous city resolved by two users must merge to **one** `osm_id`-stamped row, never two
  duplicate NULL-`osm_id` rows. This is a **tested acceptance criterion** (§4).
- **M-B (`/lookup` empty):** define the terminal control flow when `/lookup?osm_ids=` returns zero rows or
  a non-settlement/reclassified object (stale/deleted OSM id) — neither a 500 nor a silent wrong
  `unresolvable`. **Tested acceptance criterion** (§4).
- **M1/F3 (twin-merge):** transaction + caught unique-violation control flow covering BOTH the
  `resolveCity` stamp AND the `POST /api/cities` create-path INSERTs (`cities.ts:339`, `:363`) —
  concurrent same-place adds merge (re-select-and-reuse), never 500.
- **B2 (legacy fallback):** the `(name,country,region)` fallback fires **only** when the incoming pick has
  no `osm_id`; a distinct-`osm_id` incoming never collapses onto a NULL-`osm_id` legacy row (INSERT instead).
- **F4 (`region_id`):** carry and apply the pick's `region_id` (derived from `region_iso` via the seeded
  map, NULL fallback respected — never invented).
- **Minors:** m-1 provenance — the current unique index is migration **0015**, not 0010; m-2 hand-write the
  partial/`COALESCE` indexes (drizzle-kit can't, ADL-15) using 0015 as the template; m-3 add
  `CHECK ((osm_type IS NULL) = (osm_id IS NULL))`; carry the BUG-79 `lookupTruncated` caveat into the picker.

## 3. ATDD-first — the acceptance criteria QA authors as RED tests (§ before implementation)
QA (dispatched first) writes these as failing acceptance/integration tests **at the layer where each
defect lives** — NOT backend doubles that inject `osm_id`s (the v1-review trap: green backend tests over a
path the user can never trigger). **Mandatory mock-fidelity check** (QUAL-22): any geocoder/Nominatim
double must export/behave like the real client — a suite that can pass vacuously specifies nothing.

Acceptance criteria (the executable definition of done):
1. **Coexistence:** two distinct real places sharing name+country+region (Newport, Isle of Wight vs
   Newport, Telford — both GB-ENG) both exist as distinct cities after being added via the real add-place
   flow with a place-level pick.
2. **Same-place merge:** a repeat of the *same* real place (same `osm_id`) returns the existing row, no new row.
3. **M-A:** two users add the *same non-ambiguous* city → **one** merged, `osm_id`-stamped row (no duplicate NULL-`osm_id` rows).
4. **Ask-to-choose:** an ambiguous name presents the place-level picker; the chosen candidate's identity is
   carried through create (region-only disambiguation is insufficient — the Newports share a region).
5. **M-B:** `/lookup` returning zero rows for a carried id lands in a defined terminal state (not 500, not a wrong `unresolvable`).
6. **Concurrency (M1/F3):** concurrent same-place adds merge, never 500.
7. **Pending/GE-16 carry-overs:** no client-supplied coordinates accepted; pending/unresolvable containment
   holds; selected country/region never overwritten; non-owner can add a place (no 403); PATCH/DELETE still 403 for non-owner.
8. **Migration green at each stage** (EXPAND, SWITCH) — no intermediate state where an insert throws.

## 4. Sequencing & agents
1. **QA (Opus 5), FIRST** — author the §3 red tests on the integration branch `release/bug75-city-identity`.
   Gate: implementation does not start until the red baseline lands.
2. **Database (Sonnet 5)** — the expand/contract migration (hand-written, §1.4 + m-2/m-3), staged per ADL-47.
3. **Backend (Sonnet 5)** — the carry channel, `/lookup` canonicalization, find-or-create changes (M-A/B2),
   twin-merge txn (M1/F3), server-reselect (v3 §2.3). **Security checklist below.**
4. **Frontend (Sonnet 5)** — the shared `CityPicker` (§1.3), wired into add-place + UX-12 re-point.
   Turn QA's red tests green **without editing QA's spec files**.

Assemble on `release/bug75-city-identity`; merge to main once every stage is green (broken intermediate
states never touch trunk — ADL-47).

## 5. Security checklist (Backend — mandatory, CLAUDE.md)
For every new/modified route: `requireAuth` at minimum (city create stays open to any authenticated user per
GE-16; PATCH/DELETE remain `requireOwner`); every user-data query `userId`-scoped; any new user-referencing
FK column `.notNull()`. Confirm `POST /api/cities` remains non-owner-addable and city curation
(PATCH/DELETE) remains owner-only.

## 6. Definition of done
All §3 acceptance criteria green (QA-authored, implementer-satisfied); migration green at each stage; CI
green on `release/bug75-city-identity`; QA independent verification; no re-implementation of the reused
picker logic. Then: merge, and UAT remains the PO's separate phase gate.

**Tracker home:** BUG-75 (and UX-12). **Requirement:** GE-16 (approved, v3.19).

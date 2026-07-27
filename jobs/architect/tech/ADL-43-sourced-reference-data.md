# ADL-43 — Sourced Reference Data: ISO 3166-2 Subdivisions, Airlines, Car Rental Providers

**Date:** 2026-07-27
**Status:** Decided, implementation pending. No schema, migration, seed data, or code change
was made by this ADL — it is the design that unblocks those briefs.
**Trigger:** Wave 0 scoping brief S3, GitHub issue #273. Tracker `BUG-45` and `OQ-06`.
**BRD refs:** §5.2 GE-01–GE-15, §5.6 FL-01/FL-02, CR-01/CR-02.
**Main log entry:** `jobs/architect/tech/20260307-architecture-decisions-log.md` — ADL-43. This
file carries the evidence, table sketches, and rejected alternatives; the log entry is the
decision of record.

---

## 1. Problem

`BUG-45` (airline / car-rental-provider free text → sourced dropdown with "Other" fallback)
and `OQ-06` (ISO 3166-2 subdivision seeding vs. hand-seeding per-country gaps, as `BUG-30` did
for GB) are posed as one decision in the brief: does this project source reference data from a
maintained dataset, or keep patching gaps one at a time as users hit them?

The honest answer, established by evidence below, is: **it depends which reference list.**
Two of the three lists in scope have a suitable external source; one does not. All three should
stop being hand-typed, but not all three get there the same way. §6 makes the case in full;
§2–5 are the per-list decisions.

**Evidence the gap is real, not hypothetical:**
- `data/regions.json` holds 76 rows across exactly 4 countries (US, CA, AU, GB).
- `data/countries.json` marks **26** countries `region_tier_enabled = 1` (Argentina, Australia,
  Bangladesh, Brazil, Canada, China, Ethiopia, Germany, India, Indonesia, Japan, Kazakhstan,
  Korea, Malaysia, Mexico, Myanmar, Nigeria, Pakistan, Philippines, Russia, South Africa,
  Thailand, UK, US, Uzbekistan, Vietnam) — **22 of those 26 have zero seeded regions today.**
  Any of them can reproduce `BUG-30` the moment a user logs a trip there. GB itself was only
  fixed as a targeted one-off (`src/backend/migrations/0008_bug30_uk_region_seed.sql`).
- `BUG-45`'s free-text `airline`/`provider` fields have no reference list at all today —
  `src/frontend/components/TripDetail/ItemForm.tsx:389,428`.

---

## 2. Subdivisions (OQ-06)

| # | Decision | Recommendation | Confidence |
|---|----------|-----------------|------------|
| S1 | Source | `country-region-data` (npm, MIT) generates `data/regions.json` — replaces hand-typing, does **not** replace `data/countries.json`'s existing `region_tier_enabled` config | High |
| S2 | Scope | Generate rows only for the 26 currently-enabled countries (940 rows, verified) — not all 249 (4,387 rows) — until GE-07's per-country enable list changes | Medium |
| S3 | Per-country override | A small, committed, hand-reviewed override table for countries where the systematic source's granularity doesn't match GE-02's product intent. **GB is the one confirmed case** — see §6.1 | High |
| S4 | Storage | Unchanged: generated JSON lands in `data/regions.json` in the exact shape it has today (`{country_code, name, iso_3166_2}`), seeded into the existing `regions` table by the existing startup-seed path. No new table, no new mechanism | High |
| S5 | Refresh | Manual: a checked-in generation script re-run on demand (new country enabled, upstream correction, or a `BUG-30`-shaped report), output reviewed and committed like any other data change — not fetched at runtime | High |

**Why `country-region-data` over Natural Earth (already bundled, ADL-09).** The obvious
first instinct is "we already bundle Natural Earth boundary data for GE-10 shading — reuse it
for the regions table too, zero new dependency." **This is wrong and the reason is the whole
point of this ADL:** `geo/regions.json` (Natural Earth `ne_10m_admin_1_states_provinces`,
already in this repo) admits **217 GB entries** and none of them is `GB-ENG`/`GB-SCT`/
`GB-WLS`/`GB-NIR` — it operates at UK county/unitary-authority granularity (verified: sampled
`geo/regions.json` directly, `type_en` values are `Unitary Authority`, `District`, `London
Borough`, never `Country`). `country-region-data` was checked as an alternative and has the
**identical** gap — 217 GB rows, none of the four constituent-country codes (verified: sampled
its `data.json` directly). **Both systematic sources return the wrong tier for the one country
this project has already hit in production.** See §6.1 for the full analysis — this is not a
minor caveat, it is the reason a "source everything, done" reading of this ADL would recreate
`BUG-30` even after adopting a comprehensive dataset.

**Why not just keep GB as a manual patch and source everything else.** Because the same
mismatch is the general case, not a GB-specific accident: ISO 3166-2 assigns each country's
codes into categories (Wikipedia's ISO 3166-2:GB page documents `country` alongside
`two-tier county`, `unitary authority`, `London borough`, etc., all coexisting as GB's
"1st-order" codes), and any systematic source has picked exactly one category as "the"
admin-1 list. It happens to be the right one for the app's intent (state/province-equivalent)
for the US/CA/AU/DE style of country, and wrong for GB. A future country could surface the same
class of mismatch. §2 (S3 above) is written to be the standing answer for that, not a one-off.

---

## 3. Airlines (BUG-45, part 1)

| # | Decision | Recommendation | Confidence |
|---|----------|-----------------|------------|
| A1 | Source | `airline-codes` (npm, wrapper) → OpenFlights `airlines.dat`, filtered to `active = 'Y'` and a non-empty IATA code | Medium |
| A2 | Storage | **New `airlines` table**, not a bundled frontend JSON — reuses the existing `trip_categories`/`activities` admin-list pattern (`id`, `name`, `is_active`, seeded, owner can deactivate). Airline lookups go through a backend search endpoint, not a client-side array | High |
| A3 | Licensing | **The OpenFlights data is ODbL, not MIT** — the npm wrapper's `MIT` claim covers its own wrapper code only, not the bundled data. Attribution + license text required in-repo. See §6.2 — flagged **needs confirmation before implementation** | Medium |
| A4 | "Other" fallback | UI-only sentinel — no DB row. Selecting "Other" (or finding no match) reveals the existing free-text input, which still writes a plain string into the existing extension column. No FK, no schema change to `item_flight_legs`/`item_flights` | High |
| A5 | Refresh | Manual regeneration script (devDependency, not a runtime dependency), re-run periodically or when "Other" usage suggests a real gap | High |

**Why a DB table, not a bundled JSON (A2).** This project already has a fresh, expensive lesson
about this exact shape of mistake: `ADL-44` (same Wave 0 batch) exists **because**
`geo/regions.json` — a 39–40 MB bundled JSON — is pulled into the frontend and made the map
slow. The filtered OpenFlights set (**978 active, IATA-coded airlines**, verified against the
snapshot fetched this session) is nowhere near that size, but shipping it as a static array in
the JS bundle is still the wrong shape for a searchable field, and it is avoidable at zero
extra cost: the app already has a working, owner-manageable admin-list mechanism
(`trip_categories`, `activities` — `src/backend/db/schema.ts:141-167`) that does exactly what's
needed — seeded rows, `is_active` soft-delete, a query endpoint. A typeahead endpoint
(`GET /api/reference/airlines?q=`) queries the table server-side; the client never holds the
full list in memory. This is the same DB-resident, zero-runtime-fetch shape GE-10/11/12/13
already establish for offline-safe data — nothing about it depends on a network call at
request time once the DB is seeded.

**Verification needed before implementation (explicit, per firewall constraint):** this
container cannot reach `openflights.org` or run the wrapper package's own data (only inspect
its committed snapshot). Confirmed via GitHub (allowed): `jpatokal/openflights` root license is
AGPLv3, and `data/LICENSE` (the actual governing file per the data README) is ODbL — a real,
different, and materially heavier obligation than the wrapper's MIT claim implies. Not
independently confirmed: openflights.org's current terms page (unreachable), whether the
`airline-codes` npm package's snapshot is complete/current, and whether OpenFlights' known
crowdsourced data-quality issues (the package's own README documents a `COUNTRY_CORRECTIONS`
patch list) affect any specific airline the PO will actually need. Recommend Database/Backend
re-verify the license terms directly against `openflights.org/data.php` once implementation
starts (this container's firewall allows GitHub, npm, and the Anthropic API only — not
arbitrary sites), and spot-check the filtered list before shipping.

---

## 4. Car rental providers (BUG-45, part 2)

| # | Decision | Recommendation | Confidence |
|---|----------|-----------------|------------|
| C1 | Source | **None exists.** Checked npm for a maintained car-rental-provider dataset — nothing credible found (verified: `npm view`/`npm search` this session, no equivalent to OpenFlights or an ISO registry) | High |
| C2 | Mechanism | Hand-curated seed list (~20–30 major global brands: Hertz, Avis, Enterprise, Budget, National, Alamo, Sixt, Europcar, Thrifty, Dollar, etc.), same `trip_categories`/`activities` admin-list table pattern as §3 A2 | High |
| C3 | "Other" fallback | Same as A4 — UI sentinel, free text, no FK, no schema change to `item_car_rentals` | High |

This is not a smaller version of the airline decision — it is the **negative case** that proves
the project shouldn't treat "source everything from a dataset" as a blanket policy (see §6.3).
There is no registry of car rental brands analogous to IATA/OpenFlights for airlines or ISO
3166-2 for subdivisions. The right mechanism here was already invented for this exact shape of
problem — `AD-09` ("global seeded defaults shared across all users... any user can add custom
entries... only deactivated by the app owner") — and this list should just become another
instance of it, alongside trip categories and activities.

---

## 5. Offline behaviour (GE-10 / GE-11–13)

No regression on any of the three lists. All three land as rows in the existing SQLite DB via
the existing seed-on-first-launch path (`src/backend/services/startup.service.ts`), exactly
like `trip_categories`/`activities`/`regions` do today — zero runtime network calls, available
immediately regardless of connectivity. GE-10 (boundary polygons, `geo/*.json`, ADL-09) is a
separate concern from all three of these and is untouched by this ADL — flagged explicitly so a
future reader doesn't conflate "boundary shading data" with "region/airline/provider reference
data"; they are different data, different files, different consumers, and this ADL was written
partly because that conflation is an easy mistake (see §6.1 — Natural Earth's own admin-1 file
was the first, wrong instinct for regions).

---

## 6. Full analysis (non-obvious risks)

### 6.1 The GB granularity trap generalizes — read this before implementing S1–S3

Two independent, differently-sourced, differently-licensed "comprehensive ISO 3166-2" datasets
(Natural Earth admin-1 and `country-region-data`) were checked against the concrete case this
project has already hit in production, and **both give the wrong answer**: 217 UK county/
unitary-authority codes, zero of the four constituent-country codes `BUG-30` actually needed.
This is not a defect in either dataset — both are internally correct, comprehensive views of
"the UK's administrative subdivisions" at the granularity their maintainers chose. The mismatch
is that ISO 3166-2 is a coding *standard* covering multiple coexisting category levels per
country, and "download a subdivision dataset" silently picks one category, which may or may not
be the one a travel app's Region-tier dropdown wants (state/province-equivalent, chosen by
product convention per GE-02/GE-06, not by the standard itself).

**Practical consequence for the Database brief:** the override table (S3) is not a "handle GB,
done" patch — it is the standing mechanism for this whole class of mismatch, and it should be
built and documented as such. When a future country reports a `BUG-30`-shaped gap (wrong
granularity, not missing data), the fix is: add one row to the override table, not re-litigate
the data source. This converts an unbounded, discovery-driven hand-seeding backlog into a
bounded, reviewable list of documented per-country exceptions — which is the actual improvement
OQ-06 is asking for, not "zero manual curation ever again" (unreachable) but "manual curation
becomes a small, visible exception list instead of a silent, unbounded gap."

### 6.2 ODbL is a real obligation, not a formality

The `airline-codes` npm package's own `package.json`/`LICENSE.txt` says `MIT`. That claim is
about the wrapper code (`index.js`, `convert.js`, the Backbone Collection interface) — it is
**not** a valid relicense of OpenFlights' underlying data, which the upstream repository
(`jpatokal/openflights`, `data/LICENSE`, fetched directly from GitHub this session) states is
governed by the **Open Database License (ODbL) 1.0**. Under ODbL §4.2/§4.3, publicly conveying
the database (bundling it into a shipped app counts) requires an attribution notice and access
to the license text; §4.4 (share-alike) means a filtered/derived subset the project ships
remains available under ODbL to anyone who asks for it — the project cannot silently relicense
its curated `active + IATA` subset as proprietary. None of this blocks adoption — attribution +
share-alike-on-request is a normal, low-cost, well-trodden obligation for the many products that
build on OpenFlights — but it is a real compliance step (an in-repo notice + license text, e.g.
alongside the existing Natural Earth attribution in `README.md`), not paperwork to skip. Flagged
Medium confidence specifically because `openflights.org`'s own current terms page could not be
reached from this container to cross-check against the GitHub-mirrored copy.

### 6.3 Why airlines and subdivisions do *not* share one mechanism, and car rental providers share neither

The brief asks this directly. The answer is no, and there are three distinct mechanisms once
all the evidence is in, not one:

1. **Subdivisions** — sourced from an external structured dataset (`country-region-data`, MIT),
   *plus* a mandatory per-country override table for category mismatches, generated to the
   existing `data/regions.json` shape and seeded into the existing `regions` table. No new
   table.
2. **Airlines** — sourced from an external structured dataset (OpenFlights via `airline-codes`),
   seeded into a **new** admin-managed table reusing the `trip_categories`/`activities` pattern,
   with a **materially different and heavier licensing obligation** (ODbL attribution +
   share-alike) than subdivisions carry (MIT/public domain, no obligation). The storage
   *pattern* is shared with car rental providers (§3); the sourcing step and its legal
   diligence are not transferable from subdivisions and must be redone for any future dataset —
   "we already source data from external lists" is not a blanket clearance.
3. **Car rental providers** — **not** sourced externally at all, because no suitable dataset
   exists. Hand-curated, seeded into the same admin-list table pattern as airlines, but the
   *provenance* mechanism (a person picks ~25 brands) is categorically different from "download
   and filter a registry."

The one thing genuinely shared across all three is an **architectural principle**, not a single
mechanism: prefer a maintained source over ad hoc hand-seeding *when a suitable source exists*,
verify its licensing and granularity against the app's actual product intent before adopting it,
and fall back to the existing `AD-09` curated-list pattern when no source exists. That
principle, not a shared pipeline, is what should carry forward to the next reference-data
gap.

---

## 7. Alternatives rejected

- **Reuse `geo/regions.json` (Natural Earth) for the `regions` DB table directly** — rejected,
  §6.1: wrong granularity for GB (and potentially other countries with multi-category ISO
  3166-2 coding), verified by direct inspection, not assumed.
- **Ship all 249 countries' subdivisions now (4,387 rows) instead of the 26 enabled ones (940
  rows)** — rejected for this ADL's scope: `region_tier_enabled` is a deliberate per-country UX
  decision (GE-06/GE-07), and seeding subdivisions for countries the config doesn't expose yet
  is speculative work with no consumer. The generation script should make "add another country"
  cheap when GE-07 turns one on, not front-load all 249 today.
- **Bundle the filtered airline list as a frontend JSON array (mirroring `geo/countries.json`'s
  pattern)** — rejected, §3 A2: this project has a live, same-batch cautionary tale (`ADL-44`)
  about exactly this shape of mistake at a larger scale; the DB-table + search-endpoint pattern
  already exists and costs nothing extra to reuse.
- **Add a `airline_id`/`provider_id` foreign key on the flight-leg/car-rental extension rows
  instead of keeping a free-text column** — rejected: `BUG-45`'s own spec is "dropdown *with*
  Other free-text fallback," which requires an unconstrained value to exist regardless; adding a
  parallel FK column would mean maintaining two representations of one fact for no benefit this
  ADL's scope needs. If a future requirement needs FK-level integrity (e.g. joining flight
  reliability stats by airline), that is a new, separate decision.
- **Treat this as one dataset decision covering all three lists** (the brief's framing as posed)
  — rejected once the evidence was in: it collapses genuinely different licensing regimes (ODbL
  vs. MIT vs. none) and genuinely different data availability (a source exists for two of three
  lists, not the third) into one answer. §6.3 is the reasoning trail for why the brief's
  question resolves to "no" on close inspection, which is itself the useful finding.

---

## 8. Implementation implications (spec-level; no DDL written by this ADL)

- **New tables (illustrative shape, Database brief to formalize):** `airlines(id, name,
  iata_code, icao_code, is_active, created_at, updated_at)` and
  `car_rental_providers(id, name, is_active, created_at, updated_at)` — both follow the
  existing `trip_categories`/`activities` pattern (`src/backend/db/schema.ts:141-167`) exactly:
  global, seeded, owner-deactivatable, no per-user scoping (matches `AD-09`, not `AD-08`).
- **No changes to `item_flights`, `item_flight_legs` (ADL-42), or `item_car_rentals`.** The
  `airline`/`provider` columns stay plain `TEXT`; the dropdown is a frontend concern backed by a
  new read-only reference endpoint, writing the same string shape the API already accepts today.
- **Cross-dependency on ADL-42:** the airline dropdown's target field is
  `item_flight_legs.airline` (new table, not yet in `schema.ts` — ADL-42 is "decided,
  implementation pending"), not `item_flights.airline`. The BUG-45 frontend brief for the
  *flight* dropdown cannot land until ADL-42's Database brief ships the legs table; the
  car-rental-provider dropdown has no such dependency and can proceed independently.
  `airlines`/`car_rental_providers` as reference tables have no dependency on ADL-42 either way
  — they can be created any time.
- **New read-only routes:** `GET /api/reference/airlines?q=` (search/typeahead, backend-side
  filtering per §3 A2) and `GET /api/reference/car-rental-providers` (small enough to return the
  full active list, no search needed). Both are global lists — `requireAuth` only, no
  `requireOwner`, no `userId` scoping (matches the trip-categories/activities access pattern,
  not the per-user companions pattern). Deactivation/management of both lists (the `AD-09`
  "owner can deactivate" half) is an owner-only admin route, same pattern as existing
  `/api/admin/*` category/activity management.
- **Generation scripts (devDependency-only, not runtime deps):** one script regenerates
  `data/regions.json` from `country-region-data` + the GB override (and any future overrides);
  a second regenerates an airlines seed source from `airline-codes`/OpenFlights, filtered to
  `active='Y'` + non-empty IATA. Both follow the existing `data/countries.json`/
  `data/regions.json` convention: generated output is committed and reviewed, not fetched live.
- **License/attribution additions (Database or Backend brief, before shipping airlines):** an
  in-repo notice (e.g. alongside the existing Natural Earth line in `README.md`) crediting
  OpenFlights under ODbL, plus the ODbL license text committed somewhere reachable (e.g.
  `THIRD_PARTY_LICENSES/openflights-ODbL.txt`). No equivalent needed for `country-region-data`
  (MIT) or the existing Natural Earth data (public domain, per `ADL-09`).
- **BUG-30-class regression test:** whichever brief implements S1–S3, add a seed-integrity check
  (unit or migration-time assertion) that every country with `region_tier_enabled = 1` has at
  least one row in `regions` — this is the automatable version of "don't let this silently gap
  again," and it costs one query.

## 9. Candidate new BRD requirement IDs (reported, not added — COO owns the BRD gate)

`BUG-45` changes user-facing behaviour (free text → dropdown) and currently has an empty
`brdRefs`. Per CLAUDE.md's success-criteria gate, suggest:
- A new §5.6 requirement (e.g. `FL-06` — `FL-05` is already taken, assigned to leg ordering by
  ADL-42's BRD gate, BRD v3.9) for the airline field: dropdown sourced from a reference
  list, searchable, "Other" reveals free text; success criteria — typing filters by name/IATA,
  selecting populates the field, "Other"/no-match reveals free text, saved value is a plain
  string with no API/schema break for existing legs.
- A new §5.6 requirement (e.g. `CR-03`) for the car-rental provider field, same shape.

`OQ-06` is a sourcing/internal-implementation decision, not a new user-facing requirement —
existing GE-01–GE-09 already describe the behaviour this makes more complete. Recommend closing
it as answered (§10 below) without a new BRD ID, but this is a judgement call for COO to
confirm, not asserted as settled here.

## 10. Supersession and open-question closure

**Supersession:** none. `ADL-09` (Natural Earth boundary data) is unaffected and reinforced —
this ADL explicitly distinguishes boundary/shading data (GE-10, `geo/*.json`, ADL-09's
territory) from region/airline/provider *reference* data (this ADL's territory); §5 states that
distinction so it isn't re-blurred later. `BUG-30`'s migration stands as the historical fix for
GB; this ADL's override mechanism (§6.1) is what should be used for the *next* country, not a
retroactive change to BUG-30's migration.

**OQ-06 closure:** answered — yes, adopt a systematic source (`country-region-data`) for
subdivisions, with a mandatory per-country override table for category mismatches (GB
confirmed as the first entry). Closed in `_project/tracker.json` in the same PR as this ADL.

## 11. Out of scope

Not designed here: the actual override-table schema/DDL, the generation scripts themselves, the
`airlines`/`car_rental_providers` migration, the reference-endpoint route handlers, and the
frontend dropdown component. All spec-level only, per this brief's scope — Database and Backend
briefs implement from §8 once the COO BRD gate (§9) clears.

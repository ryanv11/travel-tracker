# ADL-56 / GE-21 Nominatim ground-truth fixtures

**Captured live from `nominatim.openstreetmap.org/search` on 2026-08-26**, with production's
exact params (`format=json&addressdetails=1` — the shape `nominatimSearch` always forces,
`services/nominatim-client.ts`). Every file is a raw upstream response body, **unmodified**.

They exist for the same reason the `bug76/` set does: to defeat the QUAL-22 failure mode, where a
double encodes what we *assumed* the geocoder returns and the suite therefore passes vacuously.
ADL-56 §10 restates it as a rule for this wave — *"the geocode double must export and behave like
the real `nominatim-client` … verify the shape against the real client rather than against another
test's double."*

| File | Query | What it establishes |
|---|---|---|
| `newport_us.json` | `q=Newport&countrycodes=us&limit=10` | 10 rows, **all accepted** by the settlement gate, across **9 distinct `region_iso`** — including **Oregon** (`relation 186468`) and **Rhode Island** (`relation 191230`). The PO's BUG-97 case exactly: the catalogue holds one "Newport, Oregon" row and nine other real Newports exist that the cache knows nothing about. Raw count (10) equals the requested `CONSTRAINED_LIMIT`, so the route reports `truncated: true`. |
| `newport_gb.json` | `q=Newport&countrycodes=gb&limit=10` | 7 rows, **4 accepted**, spanning **GB-WLS + GB-ENG** — the Wales city (`node 26700977`) and Telford and Wrekin (`node 27459103`) that ADL-56 §1/§4 name by id, plus Pembrokeshire (`node 203628404`) and Isle of Wight (`node 2386521`). The **two GB-ENG rows are the same-region pair** a region `<select>` structurally cannot separate — the ADL-56 §10 test-2/test-3 case. The `county`/`suburb` rows are rejected by the admission gate. |
| `melbourne_au.json` | `q=Melbourne&countrycodes=au&limit=10` | 3 rows, **2 accepted**: the `place/city` relation (`4246124`) and the `boundary/administrative` + `addresstype=municipality` relation (`2404870`). **Both carry `AU-VIC`.** This is ADL-56 §6a confirmed against live data — two distinct `osm_id` (so `decideCityDisambiguation` fires the picker the PO saw) but **one** distinct `region_iso` (so `classifyCandidates` returns `ok` and the D4 backfill is correct). The `suburb` row is rejected by the gate. |

## Derived variants are built in test source, never committed here

ADL-56 §6b(2)'s N5(b) hazard needs a response where `eligible[0]` carries a **NULL** `region_iso`
while another eligible candidate carries the single distinct one. That shape is derived in the test
files that need it (`routes/__tests__/cities.adl56-region-backfill.test.ts`,
`services/__tests__/geocoding.adl56-region-backfill.test.ts`) by deleting one `ISO3166-2-lvl4` key
from `melbourne_au.json` in memory — **deliberately not committed as a JSON file**, so nothing in
this directory can be mistaken for upstream ground truth.

Its status, stated precisely: the shape is **reachable by construction** (`parseCandidate` reads
`regionIso` as `raw.address?.['ISO3166-2-lvl4'] ?? null`; Nominatim's ranking decides index 0
independently of whether that row carries the key; and real responses do contain accepted rows
without it — four of the 31 accepted rows in the pre-existing `bug76/springfield_global.json`
capture lack it). Its **frequency at index 0 is `UNVERIFIED`**: across 23 live captures taken while
authoring this fixture set (15 countries, `q=<name>&countrycodes=<cc>&limit=10&format=json&
addressdetails=1`), none put a key-less row first. Blind spot: a small, English-biased sample of
well-known cities.

## Drift note on the older Newport fixture

`src/frontend/components/TripDetail/__tests__/fixtures/newportGeocode.ts` (BUG-75/UX-12) gives
Newport, Isle of Wight as `node 26700978`. Today's capture returns `node 2386521` for that place and
contains no `26700978` at all — two probes that fail differently: the per-row dump of
`newport_gb.json`, and `grep -c 26700978` over the raw capture returning `0`. That older fixture is
**left untouched** (it is load-bearing for green BUG-75/UX-12 suites and its own header records a
different capture); ADL-56 suites use the 2026-08-26 ids above. Flagged so a future reader does not
treat the two id sets as interchangeable.

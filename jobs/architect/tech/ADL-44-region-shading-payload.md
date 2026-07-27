# ADL-44 — Region-shading geometry payload

**Date:** 2026-07-27
**Status:** Decided, implementation pending.
**Tracker:** BUG-48 | **GitHub:** #275 | **Wave 0 brief:** S5
**BRD refs:** GE-10, MP-01, MP-02 (no new requirement ID — see §7)

---

## 1. The reported bug, and why the obvious fix is wrong

BUG-48: country→state map shading "requires zooming in far too much (the US must nearly
fill the screen before state shading appears), made worse by rendering latency."

Read literally this asks to lower `REGION_ZOOM_THRESHOLD` (`src/frontend/components/Map/MapView.tsx:28`,
currently `3`). That is the wrong fix. Region shading is driven by two independent fetches
when zoom crosses the threshold:

1. `GET /api/map/shading/regions/:countryCode` — the shading **state** (colours), a few KB,
   already scoped to one country (`src/backend/routes/map.ts:151`, `getRegionShading` in
   `src/backend/services/shading.service.ts:323`).
2. `/geo/regions.json` — the region **geometry** (polygon boundaries), fetched by
   `RegionLayer` (`src/frontend/components/Map/RegionLayer.tsx:16,77`) as a MapLibre GeoJSON
   `Source`. This is **one static file containing every admin-1 region for all 241
   countries**, unscoped, refetched every time `RegionLayer` mounts (i.e. every time zoom
   crosses the threshold — `MapView.tsx:155`).

Lowering the threshold makes the second fetch fire sooner and more often. It does not
shrink it. The fix belongs entirely in item 2.

## 2. Verified facts (not assumed)

| Claim | Verification | Result |
|---|---|---|
| Reported "39 MB" file size | `ls -la geo/regions.json` | **40,726,851 bytes (38.8 MiB / 40.7 MB decimal).** The COO's probe was correct. |
| Compression in transit | `grep -n compression src/backend/server.ts package.json` | **None.** No `compression` middleware; `express.static('/geo', …)` (`server.ts:195`) serves the raw file. `gzip -6` of the file measured locally: 12.2 MB (30% of raw) — still large, and not applied today regardless. |
| Cache headers | `express.static(path.join(__dirname, '../../geo'))` — no options object | Default Express static config: no `Cache-Control`/`maxAge` set. Repeat fetches are not guaranteed to skip the network. |
| Fetch scope | `RegionLayer.tsx:77` — `<Source data={REGIONS_GEOJSON_URL} …>`, `REGIONS_GEOJSON_URL = '/geo/regions.json'` (a constant, not parameterised by country) | Every mount fetches **the whole world**, not the one visible country. `RegionLayer` unmounts/remounts on every crossing of `REGION_ZOOM_THRESHOLD` (`MapView.tsx:155`), so this is not a one-time cost per session. |
| Feature/property bloat | `python3` parse of `geo/regions.json`: 4,596 features, **121 properties/feature**, of which the frontend reads exactly **one** (`iso_3166_2` — `RegionLayer.tsx:59,77`, `MapView.tsx:104`) | Confirmed: `name` is not read either (no tooltip/label consumer found by grep across `src/frontend/components/Map/*.tsx`). Everything else (translated name variants, `FCLASS_*`, `woe_*`, `gn_*`, etc.) is dead weight shipped to the client. |
| Where the size actually comes from | Stripped to `{iso_3166_2, name}` only, full-precision geometry retained: 40.7 MB → **29.5 MB** (27% cut). Coordinates additionally rounded to 4dp (~11 m): → **24.3 MB**, gzip **7.3 MB** | Properties are real bloat but not the dominant cost. **Geometry point density is** — 1,295,319 coordinate pairs across 4,596 features (avg. 282/feature). Stripping alone does not fix this; the file is fundamentally too much geometry for what any single map view needs. |
| Per-country distribution | Same parse, grouped by `iso_a2`: 241 countries, **median 92 KB**, worst case Russia (86 regions) 3.26 MB, Canada 1.81 MB, **US (the bug's own example) 1.39 MB**, GB 1.14 MB. 90th-percentile country well under 1 MB. | A single country's regions are 30×–400× smaller than the world file. This is the actual lever. |
| Original design intent | `jobs/architect/tech/20260307-tech-blueprint.md:227-236` (§2.3, 2026-03-07): "`ne_10m_admin_1_states_provinces.json` | State/province outlines for region zoom | **~4 MB**". | The shipped file is **~10× the blueprint's own budget.** Whether the estimate was simply wrong or a higher-fidelity extract got bundled than intended is now moot — either way the file was never fit for the "load once, cache in memory" model the blueprint describes, and nothing was corrected when it clearly missed by an order of magnitude. |
| Precedent in this codebase | `geo/countries.json`: 177 features, **168 properties/feature but only 838 KB total**, avg. **60 coordinate pairs/feature** (vs. regions.json's 282) | `countries.json` was evidently generated from Natural Earth's low-resolution (110 m) admin-0 extract and/or simplified before bundling. `regions.json` (10 m, admin-1) never got the equivalent treatment. The fix pattern already exists in this repo for the country tier; it was simply never applied to the region tier. |

**Conclusion: the premise holds.** The file is real, unscoped, uncompressed, uncached, and
carries 10–100× more data than any single map interaction needs. This is not a
"lower the threshold" bug; the threshold was never the problem.

## 3. Decision

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D1 | Primary fix | Split `geo/regions.json` into one static file **per country** (`geo/regions/{ISO_A2}.json`), still fully bundled/local; fetch the one visible country's file instead of the world | High |
| D2 | Property whitelist | Keep only `iso_3166_2` (required — `promoteId`, click handling) and `name` (cheap, future-proofs a hover/label feature); drop the other 119 Natural Earth columns | High |
| D3 | Geometry simplification | Topology-preserving simplification (e.g. mapshaper `-simplify … keep-shapes`) for the small set of large/complex countries (Russia, Canada, US, GB, Indonesia, Philippines) to bring worst-case payload in line with the rest | Medium |
| D4 | Coordinate precision | Round to ≤5 decimal places (~1 m) — lossless at any zoom this app renders; exact tolerance left to implementation QA, not mandated numerically here | Medium |
| D5 | Compression | Add `compression` middleware (or pre-gzip + `Content-Encoding`) to the `/geo` static mount | High |
| D6 | Cache headers | Add `{ maxAge, immutable }` to `express.static('/geo', …)` — this is static reference data, not per-user | High |
| D7 | Server/DB involvement | None. Stays a build-time static-asset problem; no Turso/Postgres query, no Railway compute at request time | High |
| D8 | `REGION_ZOOM_THRESHOLD` | Leave at `3` in this ADL. The payload fix should make shading appear promptly at the existing threshold; whether to tune the number further is a product-feel call for a follow-up PO/UAT, not bundled into this fix | Medium |
| D9 | ADL-41 DISTINCT invariant | No conflict — this ADL does not touch `shading.service.ts` or any SQL aggregate. It changes only how boundary **geometry** is delivered to the client, never how shading **state** is computed. Verified: the shading-state fetch (`getRegionShading`, per-country, DISTINCT-safe per ADL-41 §3) is unaffected | High |
| D10 | GE-10 compliance | Preserved — see §4 | High |

## 4. GE-10 — the hardest constraint, addressed directly

GE-10: *"Country and region boundary polygon data is bundled with the app and no internet
connection is required to render country or region shading."*

Per-country lazy fetch does **not** violate this:

- The split files (`geo/regions/{ISO_A2}.json`) are generated once at build/preprocessing
  time and **committed as static assets**, exactly like today's single `geo/regions.json` —
  they ship in every deploy, Electron package, or Railway image. Nothing is generated or
  fetched at request time from any external source.
- They are served by the **app's own** Express instance (`express.static`, same mount
  point pattern as today, just pointed at a directory of per-country files instead of one
  file). This is the same trust boundary already used for `geo/countries.json` and every
  `/api/*` route — same-origin, same server, whether that server is `localhost` (Electron/
  offline Mac app) or the hosted Railway deployment.
- **Today's implementation already uses a network fetch** (MapLibre's GeoJSON `Source`
  issues an XHR to `/geo/regions.json`) — it is not inlined into the JS bundle. GE-10's
  guarantee has never meant "zero HTTP requests"; it means "zero dependency on the
  internet / a third-party host." Splitting one locally-served file into many
  locally-served files changes nothing about that guarantee — it changes only the
  granularity of what's requested from the same local/bundled source.
- Consequence for offline use: a fully offline Electron instance still resolves
  `/geo/regions/US.json` against its own embedded Express server, with zero external
  network dependency, identically to how it resolves `/geo/regions.json` today.

**What would violate GE-10** (and is explicitly rejected here): fetching region geometry
from a third-party geodata host or CDN at render time. Not proposed. Vector-tile serving
from a MapTiler-hosted tileset was considered and rejected for the same reason (§5).

## 5. Alternatives considered and rejected

- **Vector tiles (MVT / tippecanoe pipeline).** The "correct" long-term answer for
  world-scale boundary data, and explicitly not chosen here: it requires a tile-generation
  pipeline and a tile server, and either (a) MapTiler-hosted tiles, which violates GE-10
  outright, or (b) self-hosted `pmtiles`, which the tech blueprint already flags as a
  ~100 MB world basemap option (`20260307-tech-blueprint.md:223`) — solving a 40 MB problem
  by introducing a 100 MB one. Per-country static GeoJSON is simpler, fits the existing
  `express.static` delivery model unchanged, and the measured per-country sizes (§2) show
  it is sufficient. Revisit if a future requirement needs city-level polygon detail, where
  per-country splitting alone would not be enough.
- **Serving regions only for countries the user has visited.** Rejected as the primary
  mechanism: a user planning a future trip or just exploring the map needs to see region
  boundaries for countries with no logged visits yet (GE-09's "clicking into any level"
  is not conditioned on visit history). It would also turn a static reference asset into
  per-user filtered data, which doesn't fit the "bundled, offline" model GE-10 describes.
  Per-country lazy fetch already captures the real saving (you only ever pay for the one
  country you're looking at) without this restriction.
- **Precomputed detail levels (multiple simplification tiers).** Unnecessary on top of
  per-country splitting — once only one country's data loads at a time, a single
  appropriately-simplified tier per country is enough; there is no intermediate zoom
  range in this app's UI where a coarser-than-full region tier is shown (region shading is
  binary: off below the threshold, on at full detail above it).
- **Coordinate rounding alone, no splitting.** Tested directly (§2): rounding to 4dp only
  gets the world file to 24.3 MB (7.3 MB gzipped) — still an unscoped, oversized fetch on
  every threshold crossing. Splitting is the load-bearing fix; rounding and property
  stripping are additive, not substitutes.

## 6. Implementation implications

- **New build-time preprocessing step** (owner: whichever brief implements this — Frontend
  or a small tooling script, COO to assign) that reads the source Natural Earth admin-1
  data, applies D2–D4, and writes `geo/regions/{ISO_A2}.json` (241 files, one per country
  present in the current `geo/regions.json`). Output is committed to the repo like the
  current file is — no runtime generation.
- **`RegionLayer.tsx` changes:** `REGIONS_GEOJSON_URL` becomes a function of the visible
  country code (`` `/geo/regions/${countryCode}.json` ``) rather than a fixed constant.
  `RegionLayer` needs the `countryCode` (currently `MapView` tracks `visibleCountryCode`
  in state but only passes `regionData`, not the code itself, into `RegionLayer` —
  `MapView.tsx:155-157`). **Implementation risk to verify, not decide here:** confirm how
  react-map-gl's `<Source>` behaves when its `data` URL prop changes between country codes
  while the component stays mounted (pan between two zoomed-in countries without crossing
  back below the threshold) — it must issue a fresh fetch for the new country, not silently
  keep serving the old one's cached GeoJSON.
- **`server.ts:195` / `server-test-app.ts:112`:** add compression + cache headers to the
  `/geo` `express.static` mount (D5/D6). Trivial, no route logic change.
- **Comment drift (flagged, not fixed by this ADL — spec-only scope):**
  `MapView.tsx:6` says region shading loads "at zoom >= 4"; the constant at `MapView.tsx:28`
  is `3`. Whoever implements this brief and touches `MapView.tsx` must correct the comment
  to match whatever the final threshold value is.
- **No schema or DB change.** No backend query change. `shading.service.ts` is untouched —
  confirmed against ADL-41's binding DISTINCT rule (§3 there); this ADL's diff surface is
  static assets, `RegionLayer.tsx`, and `server.ts`'s static-file options only.

## 7. Success criteria (for the CLAUDE.md dispatch gate)

- Every per-country GeoJSON file ≤ 1.5 MB gzipped; ≤ 500 KB at the 90th percentile across
  all 241 countries. Russia and Canada (the two largest measured) are the required stress
  tests during implementation QA.
- Region shading for a country not previously fetched this session visibly renders within
  ~1 second of crossing `REGION_ZOOM_THRESHOLD`, measured on a throttled connection profile
  (e.g. Chrome DevTools "Fast 3G"/comparable) — replacing today's multi-second stall on the
  full 40 MB fetch.
- No visual regressions from simplification: spot-check Russia, Canada, GB, US, and at
  least one archipelago (Philippines or Indonesia) pre/post — no gaps, slivers, or missing
  shared borders between adjacent regions.
- GE-10 preserved: the feature functions with the app's own server reachable but the
  external network blocked (i.e. no dependency on any third-party host).
- `shading.service.ts` has a zero-line diff from this brief (ADL-41 invariant untouched).

## 8. BRD

No new requirement ID is needed. This is a performance defect against the existing
GE-10 / MP-01 / MP-02 requirements, not new functional scope — reported to COO per the
"report, don't add" instruction; COO owns the BRD gate decision on whether a
non-functional performance budget requirement is worth adding project-wide (out of scope
for this ADL to decide).

## 9. Supersession

`jobs/architect/tech/20260307-tech-blueprint.md` §2.3 (single-file ~4 MB estimate,
"loaded once at map initialisation and cached in memory for the session" delivery model)
is stamped superseded in the same PR as this ADL — the actual file was 10× the estimate
and the delivery model has since evolved to lazy zoom-triggered fetch (`MapView.tsx`,
predating this ADL) which §2.3 does not describe either.

`jobs/architect/tech/20260307-map-shading-spec.md` was checked in full (all 404 lines) —
it specifies only the SQL shading-**state** computation, never the geometry delivery
mechanism. No section of it is affected by this decision; no stamp applied.

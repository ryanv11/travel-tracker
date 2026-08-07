# BUG-76 fixtures — captured live from Nominatim 2026-08-07 by COO

> **CORRECTION (2026-08-07, post-OP-27).** The fixtures are now **`format=json`**, not
> `format=jsonv2` (matches production's exact params; `json` returns `class` + `addresstype`,
> which `parseCandidate` reads, whereas `jsonv2` renames `class`→`category` and would break
> it). Four CDP fixtures (`cdp_paradise_nv`, `cdp_mclean_va`, `cdp_bethesda_md`,
> `cdp_silverspring_md`) were added, introducing the `statistical` addresstype variant
> alongside `census`. See README + design-doc §9.

Captured while the container firewall was reachable (it self-heals/self-breaks —
`project_firewall_intermittent_regression`). Raw responses are the sibling `*.json` files
(`format=json&addressdetails=1`). These are ground truth for the accept-rule design and
the QA ATDD fixtures — DO NOT hand-write mocks (QUAL-22 failure mode).

## The current filter (verified in code)
`src/backend/services/nominatim-client.ts`
- `:116` `SETTLEMENT_TYPES = {city, town, village, hamlet, municipality}`
- `:230` and `:267` predicate: `c.type == null || SETTLEMENT_TYPES.has(c.type)`
- `:295` `parseCandidate` sets `type: raw.type` — i.e. keys on Nominatim's **class-type**
  (e.g. `administrative`), NOT `addresstype`.

## What the fixtures prove
| Query | Rows | Survive filter | Reality |
|---|---|---|---|
| denver (us / global) | 4 | **0** | Denver CO is `type=administrative, addresstype=city, rank=12`. All 4 Denvers dropped. Denver has **no place-node** in OSM. |
| springfield (us, 20) | 20 | **1** | Famous IL/MA/MO/OH all `type=administrative, addresstype=city` → dropped. Only Springfield **VA** survives (it has a separate `type=city` row). |
| springfield (global, 36) | 36 | 4 | Survivors: VA (city), NZ/GB/IN villages. The famous US state capitals all dropped. Global query leaks NZ/GB/AU. |
| neg: Colorado | 3 | 0 | `state` (rank 8), `county` (rank 12), `river`. Correctly must NOT be admitted. |
| neg: Cook County | 3 | 0 | all `county` (rank 12). Correctly must NOT be admitted. |

## THE SHARPENED DESIGN FINDING (new — the tracker note did not have this)
**`place_rank` does NOT discriminate a real city from a county.**
- Denver CO (a real city we WANT): `addresstype=city`, **`place_rank=12`**
- Cook County / Colorado County (we must REJECT): `addresstype=county`, **`place_rank=12`**
Same rank. So a rank threshold alone admits counties or rejects Denver.

**The clean discriminator in this data is `addresstype`**, not `type` and not `place_rank`:
- settlements carry `addresstype ∈ {city, town, village, hamlet, municipality}`
- non-settlements carry `addresstype ∈ {state, county, region, ...}`
A candidate predicate that admits a row when **`addresstype ∈ settlement-set`** (regardless
of `type`) would KEEP all Denvers + all Springfields and DROP every state/county/river above.

## Edge-case rulings (RESOLVED — design-doc §4 + §9)
- `addresstype=suburb` — Springfield, Chelmsford (GB-ENG); Springfield QLD/NSW (AU). **REJECT** (reversible).
- `addresstype=census` / `statistical` — **REJECT** (reversible/tunable). `statistical` is a
  second US-CDP variant (Bethesda/Silver Spring MD). Rejecting them does not drop the place:
  each has a settlement twin (`town`/`city` node) that survives — see the four `cdp_*`
  fixtures. Statistical row = `relation`, twin = `node`, different `(osm_type, osm_id)`, so
  dedup can't merge them → admitting both would duplicate. Reverse-widen is candidate-set-aware.
- `addresstype=municipality` — **ADMIT** (in the settlement set).
- `addresstype=town/city/village` on US **townships** (e.g. Springfield Township, PA) —
  **ADMIT** (a township with a settlement addresstype is a populated place; §9.7).
- Denver global == Denver US (4 rows, all US) — the "worldwide grab-bag" concern from the
  note is real for Springfield but NOT for Denver. Country-constraining the discovery query
  is a *secondary* lever, independent of the addresstype fix.

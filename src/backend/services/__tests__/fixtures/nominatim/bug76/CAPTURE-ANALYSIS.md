# BUG-76 fixtures — captured live from Nominatim 2026-08-07 by COO

Captured while the container firewall was reachable (it self-heals/self-breaks —
`project_firewall_intermittent_regression`). Raw responses are the sibling `*.json` files
(`format=jsonv2&addressdetails=1`). These are ground truth for the accept-rule design and
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

## Edge cases the Architect must rule on (present in the fixtures)
- `addresstype=suburb` — Springfield, Chelmsford (GB-ENG); Springfield QLD/NSW (AU). Admit or not?
- `addresstype=census` — Springfield VA has a `type=census` row *and* a real `type=city` row (dedup interaction).
- `addresstype=municipality` — present; already in the settlement set as a `type`, now appears as an `addresstype` too.
- Denver global == Denver US (4 rows, all US) — the "worldwide grab-bag" concern from the
  note is real for Springfield but NOT for Denver. Country-constraining the discovery query
  is a *secondary* lever, independent of the addresstype fix.

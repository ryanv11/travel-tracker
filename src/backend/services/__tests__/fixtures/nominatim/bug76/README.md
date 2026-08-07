# BUG-76 Nominatim ground-truth fixtures

**Captured live from `nominatim.openstreetmap.org/search` on 2026-08-07** while the
devcontainer firewall was intermittently reachable (it self-heals/self-breaks — see the
`project_firewall_intermittent_regression` memory). These are **real upstream responses**,
not hand-written mocks. They exist specifically to defeat the QUAL-22 failure mode — a
mock that encodes what we *assumed* Nominatim returns and therefore passes vacuously. The
existing `nominatim-client.test.ts:15` warning is the same concern; these files are the
antidote.

Every file is a raw `format=jsonv2&addressdetails=1` response body, unmodified.

| File | Query | What it proves |
|---|---|---|
| `denver_us.json` | `q=denver&countrycodes=us&limit=10` | 4 rows, **all `type=administrative`**. Denver CO is `addresstype=city, place_rank=12`; the other 3 are `addresstype=village`. **Zero** survive the current `SETTLEMENT_TYPES.has(type)` filter. Denver has **no place-node** in OSM. |
| `denver_unconstrained.json` | `q=denver&limit=20` (no country) | Same 4 US rows — Denver does **not** leak other countries; the worldwide-grab-bag concern is Springfield-specific, not universal. |
| `springfield_us.json` | `q=springfield&countrycodes=us&limit=20` | 20 rows. The famous state capitals (IL/MA/MO/OH) are all `type=administrative, addresstype=city` → dropped today. Only Springfield **VA** survives today (it has a separate `type=city` row). Contains the `census`+`city` VA dedup pair. |
| `springfield_global.json` | `q=springfield&limit=40` (no country) | 36 rows across US/GB/AU/NZ/CA/IN. Carries the `suburb` (GB/AU), `county` (CA "Rural Municipality"), `hamlet`, `municipality` edge cases. |
| `springfield_il.json` | `q=Springfield%2C+Illinois&limit=1` | The canonical false-negative: relation 126326, `type=administrative, addresstype=city`, dropped today. |
| `neg_cook_county.json` | `q=cook+county&countrycodes=us&limit=10` | 3 rows, all `addresstype=county, place_rank=12`. **Must NOT be admitted as a city.** Same `place_rank` as Denver CO — proves rank cannot discriminate. |
| `neg_colorado_state.json` | `q=colorado&countrycodes=us&limit=10` | `state` (rank 8), `county` (rank 12), `river` (rank 18). **Must NOT be admitted.** |

`CAPTURE-ANALYSIS.md` is the COO's original capture note (per-row breakdown + the
sharpened `place_rank`-is-not-a-discriminator finding).

## The load-bearing fact these fixtures establish

`place_rank` does **not** separate a city from a county — Denver CO (`addresstype=city`)
and Cook County (`addresstype=county`) are **both `place_rank=12`**. The clean orthogonal
discriminator is **`addresstype`**, which the current filter ignores entirely (it keys on
`type`, i.e. the class-type `administrative`). See `20260807-BUG76-accept-rule-design.md`.

# BUG-76 Nominatim ground-truth fixtures

> **CORRECTION (2026-08-07, post-OP-27).** These fixtures are now **`format=json`**, not
> `format=jsonv2`. The OP-27 review of the accept-rule design flagged a fidelity gap: the
> originally-committed fixtures were captured as `format=jsonv2` (they carried `category`),
> but **production requests `format=json`** (`nominatim-client.ts:214`/`:256`) and
> `parseCandidate` reads `raw.class` (`:294`) — a field `json` returns and `jsonv2` renames
> to `category`. Capturing in jsonv2 would let a mock pass while production broke (QUAL-22).
> The fixtures have been **replaced with the `format=json` set** (carrying `class`,
> `addresstype`, and the `address{}` block), captured/verified live against production's
> exact params `format=json&addressdetails=1`. `addresstype` **is present under `format=json`**
> — the OP-27 review's suggestion to switch production to jsonv2 was NOT adopted. Four CDP
> fixtures were added (`cdp_*`, below). The `jsonv2` mentions in the original text below are
> corrected in place. See design-doc §9 for the full record.

**Captured live from `nominatim.openstreetmap.org/search` on 2026-08-07** while the
devcontainer firewall was intermittently reachable (it self-heals/self-breaks — see the
`project_firewall_intermittent_regression` memory). These are **real upstream responses**,
not hand-written mocks. They exist specifically to defeat the QUAL-22 failure mode — a
mock that encodes what we *assumed* Nominatim returns and therefore passes vacuously. The
existing `nominatim-client.test.ts:15` warning is the same concern; these files are the
antidote.

Every file is a raw `format=json&addressdetails=1` response body, unmodified (matches
production's exact params; see the correction banner above for why `json`, not `jsonv2`).

| File | Query | What it proves |
|---|---|---|
| `denver_us.json` | `q=denver&countrycodes=us&limit=10` | 4 rows, **all `type=administrative`**. Denver CO is `addresstype=city, place_rank=12`; the other 3 are `addresstype=village`. **Zero** survive the current `SETTLEMENT_TYPES.has(type)` filter. Denver has **no place-node** in OSM. |
| `denver_unconstrained.json` | `q=denver&limit=20` (no country) | Same 4 US rows — Denver does **not** leak other countries; the worldwide-grab-bag concern is Springfield-specific, not universal. |
| `springfield_us.json` | `q=springfield&countrycodes=us&limit=20` | 20 rows. The famous state capitals (IL/MA/MO/OH) are all `type=administrative, addresstype=city` → dropped today. Only Springfield **VA** survives today (it has a separate `type=city` row). Contains the `census`+`city` VA dedup pair. |
| `springfield_global.json` | `q=springfield&limit=40` (no country) | 36 rows across US/GB/AU/NZ/CA/IN. Carries the `suburb` (GB/AU), `county` (CA "Rural Municipality"), `hamlet`, `municipality` edge cases. |
| `springfield_il.json` | `q=Springfield%2C+Illinois&limit=1` | The canonical false-negative: relation 126326, `type=administrative, addresstype=city`, dropped today. |
| `neg_cook_county.json` | `q=cook+county&countrycodes=us&limit=10` | 3 rows, all `addresstype=county, place_rank=12`. **Must NOT be admitted as a city.** Same `place_rank` as Denver CO — proves rank cannot discriminate. |
| `neg_colorado_state.json` | `q=colorado&countrycodes=us&limit=10` | `state` (rank 8), `county` (rank 12), `river` (rank 18). **Must NOT be admitted.** |
| `cdp_paradise_nv.json` | `q=Paradise, Nevada` | 2 rows: a `census` **relation** (osm_id 170053) + a `town` **node** twin (osm_id 3139480510). Proves rejecting `census` still resolves the place via the settlement twin. |
| `cdp_mclean_va.json` | `q=McLean, Virginia` | 2 rows: `census` **relation** 206832 + `town` **node** 158521719. Same census+twin shape. |
| `cdp_bethesda_md.json` | `q=Bethesda, Maryland` | 2 rows: a `statistical` **relation** (133482) + a `city` **node** twin (158248181). Introduces the `statistical` variant (a US CDP artifact, like `census`). |
| `cdp_silverspring_md.json` | `q=Silver Spring, Maryland` | 2 rows: `statistical` **relation** 133501 + `city` **node** 158521614. Second `statistical` instance. |

**census / statistical + dedup identity.** In every census/statistical+twin pair above, the
statistical row is an OSM `relation` and the settlement twin is a `node` — **different
`(osm_type, osm_id)`**. BUG-75 dedup keys on `(osmType, osmId)`, so it does **not** merge
them: admitting both would produce an un-dedupable duplicate in the picker. That is the
affirmative reason the accept-rule rejects `census`/`statistical` (the settlement twin
already represents the place). Reject-confidence is reversible/tunable — if a *census-only*
place (no twin) is ever dropped, the widen is candidate-set-aware (admit census/statistical
only when no settlement twin is in the same result set), not a blanket add. See design-doc
§9.4–§9.6.

`CAPTURE-ANALYSIS.md` is the COO's original capture note (per-row breakdown + the
sharpened `place_rank`-is-not-a-discriminator finding).

## The load-bearing fact these fixtures establish

`place_rank` does **not** separate a city from a county — Denver CO (`addresstype=city`)
and Cook County (`addresstype=county`) are **both `place_rank=12`**. The clean orthogonal
discriminator is **`addresstype`**, which the current filter ignores entirely (it keys on
`type`, i.e. the class-type `administrative`). See `20260807-BUG76-accept-rule-design.md`.

# `data/vendor/` — vendored upstream reference data

Upstream datasets copied into this repository rather than taken as npm dependencies.
Each file below is committed deliberately, with its provenance recorded here (GE-18).

---

## `iso3166-2.json`

| | |
|---|---|
| **Source package** | [`iso3166-2-db`](https://github.com/esosedi/3166) |
| **Version** | `2.3.11` |
| **Upstream path** | `data/iso3166-2.json` inside the published tarball |
| **Licence** | MIT — full text in `iso3166-2.LICENSE` |
| **Copyright** | Copyright (c) 2016 esosedi (Kashey \<thekashey@gmail.com\>) |
| **Size** | 3,346,916 bytes |
| **SHA-256** | `c2cbb77d98388ee0fc779dcd559bc5f2890f3a89e19ea7dacfb30baa2e4e6422` |
| **Vendored** | 2026-08-02, BUG-77 / ADL-48 S1 (issue #367) |

### What it is

ISO 3166-2 subdivision data for 234 countries. Each subdivision carries **both** identifiers
the project needs:

- `iso` — the ISO 3166-2 suffix (`WLS`, `SCT`, `NSW`, `BY`), which is what `regions.iso_3166_2`
  and Nominatim's `ISO3166-2-lvl4` both speak.
- `admin` — the GeoNames `admin1` code, which is the join key for the city crosswalk (ADL-48 §4.1).

**These are not the same thing.** `"<CC>-" + geonamesAdmin1` equals the ISO 3166-2 code for only
2 of the 26 region-tier countries (GB and US). ADL-48 §4 records why a naive concatenation would
have silently produced `AU-08` where the app expects `AU-NSW`.

### Why it is vendored rather than a dependency

`iso3166-2-db@2.3.11` unpacks to **283 MB across 42,268 files** and costs **~12 s of install
time**, for exactly this one 3.35 MB file. The bulk is `regions/` (205 MB) and `i18n/` (69 MB),
neither of which anything here reads. This repository installs `node_modules` **per agent
worktree and on every CI run**, so that cost is paid repeatedly.

Vendoring also pins the crosswalk against silent upstream change and removes a single-maintainer
package from the supply chain. Measured and recommended in
`jobs/architect/tech/20260802-ADL48-feasibility-spike.md` §6.5 (F3), confirmed independently by
`jobs/architect/tech/20260802-ADL48-spike-fresh-eyes-review.md` §3.

### Who reads it

`scripts/generate-gazetteer.mjs` only — a **build-time** script. Nothing at runtime reads this
file; the generator's committed output (`data/regions.json`) is what the app seeds from.

### Refreshing it

Refresh is on-demand, not scheduled (ADL-48 §10). To take a newer upstream release:

```bash
npm pack iso3166-2-db@<version> --pack-destination /tmp/isodl
tar -xzf /tmp/isodl/iso3166-2-db-<version>.tgz -C data/vendor --strip-components=2 \
    package/data/iso3166-2.json
tar -xzf /tmp/isodl/iso3166-2-db-<version>.tgz -O package/LICENSE > data/vendor/iso3166-2.LICENSE
node scripts/generate-gazetteer.mjs          # exits non-zero if the S1 safety proofs fail
```

Then update the version, size and SHA-256 in the table above, and review the
`data/regions.json` diff. The generator's `S1 SEED SAFETY` gate fails the run if any
currently-seeded code would be dropped, renamed, or duplicated, so an unsafe refresh cannot
pass silently.

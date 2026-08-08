# BUG-76 accept-rule design — OP-27 corrections folded in

**From:** Architect · **Date:** 2026-08-07 · **Branch:** `feat/bug76-accept-rule-design-corrected`
(branched off `origin/feat/bug76-accept-rule-design`) · **PR:** not opened (per brief).
**Type-check:** `type:check:all` clean. **Pre-push:** biome/typecheck/backend(740)/frontend(302)/status all green.

Incorporation of the settled OP-27 corrections into the corrected design-of-record. Not a
re-design; no second OP-27 pass. All corrections independently re-verified — every one held.

## What was done

- **Fixtures swapped to `format=json`** (were `jsonv2`). Committed set, all confirmed json shape
  (carry `class` + `addresstype` + `address`, none carry `category`): `denver_us`,
  `denver_unconstrained` (re-captured live), `springfield_us`, `springfield_global`,
  `springfield_il`, `neg_cook_county`, `neg_colorado_state`, + 4 new CDP fixtures
  `cdp_paradise_nv`, `cdp_mclean_va`, `cdp_bethesda_md`, `cdp_silverspring_md`. (Fidelity note:
  used the COO-verified scratchpad captures as authoritative to stay consistent with the COO's
  verified baseline; firewall was up, so I re-captured `denver_unconstrained` live and used a
  live probe to independently confirm `format=json&addressdetails=1` returns `addresstype`.)
- **Accept-rule result under json holds:** Denver **4/4**; Springfield US **19/20** (only the
  `census` row dropped, its `city` twin survives); Cook County **0**; Colorado **0**; all four
  CDPs retain a surviving `town`/`city` twin. Re-verified after biome formatting.
- **census + statistical reject** folded in: `statistical` added as a real second variant
  (Bethesda/Silver Spring MD); confidence downgraded high→reversible/tunable, grounded in the 4
  CDP probes. **Paradise NV AC (AC-8b)** added: census relation 170053 rejected AND town node
  3139480510 admitted.
- **Reversibility framing corrected** (per your mid-task refinement): the widen is
  **candidate-set-aware** (admit census/statistical only when no settlement twin in the same
  result set), NOT a blanket add. Affirmative reject rationale is now **C4-corrected**: the
  statistical row (`relation`) and its settlement twin (`node`) have different `(osm_type,osm_id)`
  — verified in-fixture (Paradise 170053/3139480510; McLean 206832/158521719; Springfield VA
  census 206834 / node 158396042; Bethesda 133482/158248181; Silver Spring 133501/158521614) —
  so BUG-75 dedup cannot merge them; admitting both = un-dedupable duplicate.
- **/lookup UNVERIFIED gap RESOLVED:** lookup call site (`:256-258`) sets `addressdetails:'1'`
  identically to search; shared predicate applies at both. UNVERIFIED caveat superseded.
- **C3 (townships) + C4 (dedup rationale)** folded in (§9.7, §9.6).
- **Correction-stamped in place** (Edit, append only): design doc — top banner + inline
  `SUPERSEDED`/`AMENDED` stamps at §3.4, §4 D5, §7 + full new §9; ADL-51 — dated correction
  addendum; fixtures README + CAPTURE-ANALYSIS — correction banners, inline `jsonv2`→`json`,
  CDP rows, edge-case rulings.

## Verification of the corrections themselves (all held)

- OP-27 C1 direction confirmed **wrong**: `format=json&addressdetails=1` (prod's exact params,
  `:214`/`:256`) returns `addresstype` (live probe: Denver→city, Cook County→county,
  Colorado→state); `parseCandidate` reads `raw.class` (`:294`), which jsonv2 renames to
  `category` — switching would break it. **Production stays on `format=json`.**
- Implementation note for ACs recorded: `parseCandidate` must read `addressType: raw.addresstype`;
  AC-0 mock-fidelity gate asserts outgoing URL carries `format=json&addressdetails=1`.

## Nothing found not to hold

Every claim in the corrections checked out against code (`:214`/`:256`/`:294`) and the committed
fixture data. One packaging detail worth a glance: the brief's fixture list named `neg_colorado`;
I kept the committed filename **`neg_colorado_state.json`** (design-doc/AC references point there)
and kept `denver_unconstrained.json` (design §5 references it), re-captured to json. Fixture JSON
files were biome-formatted (whitespace only; data byte-verified unchanged) so `npm run check` is
green — flag only because the README calls them "unmodified" (true of the data, not the framing).

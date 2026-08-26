/**
 * ADL-56 / GE-21 (BRD v3.22) — **SLICE 2** specification: the FRONTEND half of
 * §10 test **3**, the shared golden-fixture set.
 *
 * `[S2]` — NOT part of the Slice-1 red bar. A Slice-1 implementer must not
 * un-skip this block; it is expected to fail until the D2 ε-collapse lands.
 * The backend half lives in
 * `src/backend/routes/__tests__/cities.adl56-s2-name-path.test.ts`, together
 * with the live interim tripwire that makes the Slice-1 → Slice-2 gap
 * impossible to forget.
 *
 * ── WHAT "FE AND BE AGREE" ACTUALLY MEANS (§4) ───────────────────────────────
 * One definition of ambiguity: more than one DISTINCT REAL PLACE, where two
 * candidates are the same place iff they share `(osm_type, osm_id)` OR — for
 * Nominatim's routine multi-granularity duplication — they share
 * `(name NOCASE, country_code, region_iso)` and their coordinates are within a
 * small ε. `region_iso` distinctness is DEMOTED to the GE-15 auto-fill signal
 * and stops being the ambiguity test.
 *
 * Today the two trees disagree in BOTH directions, which is why the golden set
 * needs three cases and not one:
 *   • `decideCityDisambiguation` fires on `distinctOsmIds.size > 1` — so the
 *     two Melbourne granularities of ONE real place produce a spurious
 *     two-option picker (case B, RED here).
 *   • `classifyCandidates` fires on `distinctRegionIsos(...).length > 1` — so
 *     two genuinely distinct same-region Newports resolve silently (case A,
 *     RED in the backend half).
 * A build that fixes only one side swaps which case is broken. Running the SAME
 * three cases against both implementations is what makes "single definition"
 * mechanically verifiable rather than asserted (frameworks std 32).
 *
 * ── FLAGGED FOR SLICE 2'S DESIGN ─────────────────────────────────────────────
 * §4 requires ONE golden fixture set both trees consume. The frontend and
 * backend live in separate TS build trees (`tsconfig.frontend.json` /
 * `tsconfig.backend.json`) and cannot import a common module today, so the
 * three cases are declared inline here and again in the backend file.
 * TWO INLINE COPIES IS ITSELF THE DRIFT RISK §4 NAMES. Collapsing them into a
 * single shared fixture module is Slice-2 design work and is deliberately not
 * pre-empted here; it is recorded as an open item in the QA completion report.
 *
 * ── MOCK FIDELITY (QUAL-22) ──────────────────────────────────────────────────
 * Every candidate below is REAL captured Nominatim data (2026-08-26) —
 * `services/__tests__/fixtures/nominatim/adl56/newport_gb.json` and
 * `melbourne_au.json`, mapped into the frontend `GeocodeCandidate` shape by the
 * real `GET /api/geocode` serializer. The same objects are re-exported from
 * `components/TripDetail/__tests__/fixtures/adl56Geocode.ts`; they are inlined
 * here rather than imported so this file states the golden set in full and can
 * be diffed against the backend copy by eye.
 */
import { describe, expect, it } from 'vitest';
import type { GeocodeCandidate } from '../../types/api';
import { decideCityDisambiguation } from '../decideCityDisambiguation';

/** Golden case A — two DISTINCT real places, ONE region_iso. */
const SAME_REGION_NEWPORTS: GeocodeCandidate[] = [
  {
    name: 'Newport',
    display_name: 'Newport, Isle of Wight, England, PO30 5HD, United Kingdom',
    country_code: 'GB',
    region_iso: 'GB-ENG',
    latitude: 50.7003707,
    longitude: -1.2952039,
    osm_type: 'node',
    osm_id: 2386521,
  },
  {
    name: 'Newport',
    display_name: 'Newport, Telford and Wrekin, England, TF10 7AG, United Kingdom',
    country_code: 'GB',
    region_iso: 'GB-ENG',
    latitude: 52.7688594,
    longitude: -2.3783676,
    osm_type: 'node',
    osm_id: 27459103,
  },
];

/** Golden case B — ONE real place at two granularities (~2.2 km apart). */
const MELBOURNE_TWINS: GeocodeCandidate[] = [
  {
    name: 'Melbourne',
    display_name: 'Melbourne, Victoria, Australia',
    country_code: 'AU',
    region_iso: 'AU-VIC',
    latitude: -37.8142454,
    longitude: 144.9631732,
    osm_type: 'relation',
    osm_id: 4246124,
  },
  {
    name: 'City of Melbourne',
    display_name: 'City of Melbourne, Victoria, Australia',
    country_code: 'AU',
    region_iso: 'AU-VIC',
    latitude: -37.8123825,
    longitude: 144.9482613,
    osm_type: 'relation',
    osm_id: 2404870,
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// [S2] ADL-56 §10 test 3, FRONTEND half — SLICE 2 ONLY. Do NOT un-skip in
// Slice 1. Un-skipping this and its backend twin together is what proves
// GE-21's "the frontend and backend apply one identical ambiguity definition"
// criterion and closes the BRD v3.22 interim.
// ═════════════════════════════════════════════════════════════════════════════
describe.skip('[S2][INTERIM — Slice 2 only] ADL-56 test 3 (frontend half) — one place-level ambiguity definition', () => {
  it('golden case A — two same-region Newports ARE ambiguous: the picker fires', () => {
    // Already true today, and it must stay true: the ε-collapse must not
    // over-collapse two genuinely distinct places into one.
    expect(decideCityDisambiguation(SAME_REGION_NEWPORTS, 'GB-ENG').mode).toBe('picker');
  });

  it('golden case B — Melbourne city + municipality COLLAPSE to one place: no picker', () => {
    // The spurious two-option picker the PO saw (§6a). Same name, same
    // region_iso, coordinates within ε → one real place → no choice to make.
    expect(decideCityDisambiguation(MELBOURNE_TWINS, 'AU-VIC').mode).not.toBe('picker');
  });

  it('golden case B — and the collapsed place still yields its region as a suggestion (GE-15)', () => {
    // region_iso is DEMOTED as the ambiguity test but PRESERVED as the
    // auto-fill signal — the half of §4 a careless collapse deletes.
    expect(decideCityDisambiguation(MELBOURNE_TWINS, 'AU-VIC')).toMatchObject({
      mode: 'suggested',
      regionIso: 'AU-VIC',
    });
  });

  it('golden case C — a single unambiguous candidate is a suggestion, never a picker', () => {
    expect(decideCityDisambiguation([SAME_REGION_NEWPORTS[0]], 'GB-ENG')).toMatchObject({
      mode: 'suggested',
      regionIso: 'GB-ENG',
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LIVE INTERIM TRIPWIRE — un-skipped, green today, MUST go red when Slice 2
// lands. Its backend twin lives in `cities.adl56-s2-name-path.test.ts`.
//
// WHEN THIS TURNS RED: that is Slice 2 working. Delete this block, un-skip the
// `[S2]` block above, and re-stamp the GE-21 interim closed in ADL-56 §10a and
// the BRD v3.22 GE-21 row. Do NOT "fix" it by relaxing the assertion.
// ═════════════════════════════════════════════════════════════════════════════
describe('[INTERIM][GE-21 Slice 1→2] the frontend still shows a picker for the two Melbourne granularities — documented, not accidental', () => {
  it('Melbourne city + municipality currently produce a 2-option picker (BRD v3.22 GE-21 interim; closes in Slice 2)', () => {
    const decision = decideCityDisambiguation(MELBOURNE_TWINS, 'AU-VIC');
    expect(decision.mode).toBe('picker');
    if (decision.mode === 'picker') {
      expect(decision.candidates).toHaveLength(2);
    }
  });
});

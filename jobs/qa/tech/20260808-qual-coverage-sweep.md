# QUAL-02 / QUAL-21 / QUAL-22 — test-coverage sweep

Branch: `chore/qa-coverage-sweep`. PR: [#433](https://github.com/ryanv11/travel-tracker/pull/433) — 18/18 CI checks green.

## QUAL-22 — mock drift (`adl46-access-model.test.ts`)

**Finding (review F8):** the `vi.mock('../../services/geocoding.service.js', ...)` factory
exported only `resolveCity`:

```ts
vi.mock('../../services/geocoding.service.js', () => ({
  resolveCity: async () => undefined,
}));
```

`src/backend/routes/cities.ts:27` imports `resolveByOsmId, resolveCity, resolveCityName` and
calls `resolveCityName` at line 478 inside a try/catch:

```ts
let resolution: Awaited<ReturnType<typeof resolveCityName>>;
try {
  resolution = await resolveCityName(name, country_code, { regionIso });
} catch {
  resolution = { status: 'disabled', candidates: [] };
}
```

Since the mock didn't export `resolveCityName`, calling it (`undefined(...)`) threw a
`TypeError`, caught by the route's own catch, silently degrading every call to
`{ status: 'disabled', candidates: [] }`. Every Group B test (D13 find-or-create invariants)
therefore exercised the disabled/pending fallback path regardless of what it claimed to test.

**Verified against the real module** (two probes, per the negative-findings rule — this is a
positive "the export exists and is called" claim, established by both reading the source and
confirming via a live test run):
- `grep -n "export " src/backend/services/geocoding.service.ts` — confirms
  `resolveCityName`, `resolveByOsmId`, `resolveCity` are all real exports.
- `grep -n "resolveByOsmId\|resolveCity\|resolveCityName" src/backend/routes/cities.ts` —
  confirms all three are imported and `resolveCityName`/`resolveCity` are called; `resolveByOsmId`
  is called only inside `createOrReuseCarriedCity` (the `osm_type`/`osm_id` carried-ref branch),
  which Group B's tests never exercise (none send `osm_type`/`osm_id` — file header comment
  already states this).

**Fix.** The mock now exports real, controllable doubles:

```ts
let mockCityResolution: CityResolution = { status: 'disabled', candidates: [] };
const resolveCityNameSpy = vi.fn(async (): Promise<CityResolution> => mockCityResolution);
const resolveCitySpy = vi.fn(async () => undefined);

vi.mock('../../services/geocoding.service.js', () => ({
  resolveCity: resolveCitySpy,
  resolveCityName: resolveCityNameSpy,
  resolveByOsmId: async () => null,
}));
```

Default resolution stays `'disabled'` — identical terminal outcome to the pre-fix throw/catch —
so B1/B2/B3/B5/B6 (whose pass/fail never depended on `resolution.status`, only on pass-1
find-or-create matches or the pending-insert fallback) are **behaviourally unchanged**. Verified:
all 32 tests in the file still pass after the fix, unmodified for those five.

**B4 — the one test where this mattered.** B4's own name and comment claim to prove "ambiguous
no-region request does not silently pick one of two existing regioned rows." Pre-fix, it never
reached an `'ambiguous'` verdict at all — it silently ran the `'disabled'` fallback, which
happens to satisfy the same two loose invariants the test asserted (no silent pick, no
duplicate) for an unrelated reason. Fixed to set a genuine `'ambiguous'` `CityResolution`
(two candidates, distinct `region_iso`, matching what `classifyCandidates` would really produce
for two real Springfields with no region requested) and added two non-vacuous checks:

1. `expect(resolveCityNameSpy).toHaveBeenCalledWith('Springfield', 'US', { regionIso: null })`
   — proves the mock was actually reached with the arguments D12 §4.3.1 requires, not
   short-circuited by an earlier pass-1 match.
2. `expect(resolveCitySpy).not.toHaveBeenCalled()` — proves the route's ADL-46 F1/F2 ruling §2.6
   behaviour (skip the fire-and-forget re-resolution for an `'ambiguous'` verdict, since the
   route already holds the answer and re-firing burns a second Nominatim request for a
   provably identical result) is genuinely exercised. This is the **one real behavioural
   difference** between `'ambiguous'` and `'disabled'` in `cities.ts` (`if (created &&
   resolution.status !== 'ambiguous') { resolveCity(...) }`) — before the fix, both statuses
   landed in the identical pending-insert branch, so nothing could ever have told them apart.

Confirmed non-vacuous by running the full file: 32/32 pass, including B4 with both new
assertions actually executing (not skipped, not throwing).

## QUAL-21 — resolve-then-create route coverage (new file)

**Finding (review F4):** every backend route suite that posts to `/api/cities` mocks
`resolveCityName` to `{ status: 'disabled', candidates: [] }` —
`adl46-access-model.test.ts` (see above) and `cities-find-or-create.test.ts` both do this
deliberately (their own concern is find-or-create logic, not the geocoder). That means
`resolution.status === 'ok'` — the canonical-name convergence branch that is the entire point
of "resolve-THEN-create" (§4.3 steps 3-4a/4b) — had never been reached by a green CI run at the
route level. The tracker note names this as the root cause of two shipped defects (F1, and the
ambiguous-status regression).

**Design choice — mock only `global.fetch`, not `resolveCityName`.** Mocking
`resolveCityName`'s return value would repeat the exact problem this item exists to fix: a
pre-decided result cannot tell a correctly wired route from one wired to a broken resolver.
Instead this file follows the pattern `bug76-geocode-e2e.test.ts` already established —
`vi.stubGlobal('fetch', ...)` returning a real, committed Nominatim fixture body verbatim, and
`__resetChokepointForTests()` + `GEOCODING_ENABLED=true` so the real `nominatimSearch` →
`classifyCandidates` → `isAcceptedSettlement` chain runs end to end. Only `resolveCity` (the
fire-and-forget background re-check, irrelevant to this file's concern and non-deterministic if
left real — it would race the `fetch`-call-count assertions) is mocked to a no-op, via
`importOriginal` partial-mock so `resolveCityName`/`resolveByOsmId` stay real:

```ts
vi.mock('../../services/geocoding.service.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/geocoding.service.js')>();
  return { ...real, resolveCity: async () => undefined };
});
```

**Fixture choice.** `services/__tests__/fixtures/nominatim/bug76/springfield_il.json` — a
single, unambiguous settlement candidate (Springfield, Illinois, `addresstype=city`). Chosen
over `denver_us.json` (used elsewhere) specifically because Denver's fixture contains TWO
distinct settlement candidates in different states (Denver, CO and Denver, IA — both pass the
`addresstype` accept-rule), which resolves to `'ambiguous'` unless a `region_id` narrows it.
Springfield IL's single-candidate fixture reaches `'ok'` with no region needed, keeping the two
new tests focused on the resolve-then-create branch logic rather than region disambiguation
(already covered by `adl46-access-model.test.ts` Group B).

**Two tests, the two branches QUAL-21 names:**

- **Branch A (resolves to an EXISTING record).** Pre-seed a `Springfield`/`US` row (the
  CANONICAL name the geocoder will return) — never under the typo the request submits, so a
  match can only come from the resolve step's pass-2 canonical-name lookup (`findOrUpgradeCity`
  called a second time with `canonicalName`), not pass-1. Request submits `Springfeild` (typo).
  Asserts: `fetch` called exactly once, `200`, `res.body.id === existing.id`, no new row
  inserted under either the typo or the canonical name (`cityRows` count checks both).
- **Branch B (CREATES a new record).** No pre-existing row at all. Same typo'd request. Pass-1
  and pass-2 both miss, so the route inserts from the canonical geocoder response. Asserts:
  `201`, `geocode_status: 'resolved'`, name/lat/lon from the fixture (not the typo), and the
  OSM ref (`osmType: 'relation'`, `osmId: 126326`) is stamped on the row — the M-A rule
  (`cities.ts` comment ~line 505) that makes the row discoverable by the resolved-by-OSM merge
  mechanism.

**Non-vacuousness — mutation-tested, not just asserted.** Copied the file to a scratch path,
flipped `GEOCODING_ENABLED` to `'false'` in `beforeEach`, and re-ran:

```
FAIL branch A — AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
FAIL branch B — AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
```

Both fail immediately on `expect(fetch).toHaveBeenCalledTimes(1)` — the geocoder never runs
when disabled, exactly as expected — confirming the assertions are load-bearing rather than
coincidentally satisfied.

## QUAL-02 — assertion strength

Tracker note on this entry: findings 1 (filter-inversion) and 2 (sort-order) were already fixed
in PR #320 (category_id/country trip filters seeded to 3 with an exactly-1 assertion; GET
/api/trips sort-order test). Findings 3 (response-shape) and 4 (cross-trip item isolation) were
explicitly deferred out of that PR's scope on purpose. This brief scoped me to filter-inversion,
sort-order, and response-shape — re-probed the current suite (not inherited the tracker's
"already fixed" claim wholesale) and found:

- **Repository-level and route-level filter-inversion tests** (category_id, activity_id,
  country — `repositories/__tests__/trips.test.ts`, `routes/__tests__/trip-countries.test.ts`)
  already use the 3-trip inversion-proof pattern from PR #320. Route-level `GET /api/trips`
  sort-order test (`trips.crud.test.ts`) already asserts exact order via `toEqual([...])` with
  out-of-order seeding. **No further action** — confirmed already strong, not re-touched.
- **`trips.crud.test.ts`'s "each trip in list has expected response shape" test** — genuinely
  weak: `expect(trip).toHaveProperty('categories')` etc. with no value/type check, so a route
  returning `{ categories: null }` would still pass. Rewritten to seed real
  category/companion/activity/place/country rows and assert both `Array.isArray(...)` and
  `.toEqual(...)` against the exact expected content, including the nested `place.city` object
  shape (region_name/region_iso survive serialization).
- **`GET /api/cities/:id/carry-forward`'s `desc(trips.endDate)` sort** (`cities.ts:731`) — a
  genuine, previously-undetected sort-order gap distinct from PR #320's scope (that PR touched
  trip filters/sort, not this endpoint). Every existing test in
  `cities.carry-forward.test.ts` seeds at most one `next_time` item, so an unsorted or
  ascending-sorted query would have passed identically. Added a 3-trip test, seeded
  deliberately out of order (Middle, Earliest, Latest insertion order), asserting the response
  comes back Latest → Middle → Earliest by both `source_trip_name` and
  `source_trip_end_date`.

Scope was deliberately held to these two files per the brief's "don't rewrite the whole suite"
instruction — did not touch `items.rating-sort-filter.test.ts` (guardrail: avoid, another agent
touching cities.ts's rating-sort area this round) or attempt an exhaustive sweep for every
`toHaveProperty`-only assertion in the codebase.

## Full verification run (post origin/main merge, PR #432/QUAL-33 included)

- `npm run check` — clean (Biome). 5 remaining INFO-level `useLiteralKeys` lint notices are
  pre-existing, in `geocoding.resolveByOsmId.test.ts` and `cities.identity-carry.test.ts`,
  neither touched by this thread — confirmed via `git diff main` showing no changes to those
  files, and via checking the same finding appears against a clean `main` checkout.
- `npm run type:check:all` — clean.
- `npm run test:backend` — 762/762 passing (765 before the origin/main merge; QUAL-33 removed
  some now-redundant shading tests, accounting for the delta — unrelated to this thread).
- `npm run test:frontend` — 321/321 passing (untouched by this thread).
- `npm run status:check` — `_project/STATUS.md` up to date.

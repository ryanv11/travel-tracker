**QUAL-02 / QUAL-21 / QUAL-22** · PR [#433](https://github.com/ryanv11/travel-tracker/pull/433) · BRD: GE-16 (QUAL-21/22) · Branch: `chore/qa-coverage-sweep`

**Scope tested:** test-coverage sweep, three independent tracker items. Build ref: `chore/qa-coverage-sweep` merged with `origin/main` (includes PR #432/QUAL-33, picked up mid-thread, zero conflicts).

**Verdict per item:**

- **QUAL-22 (mock drift, PASS/fixed).** `adl46-access-model.test.ts`'s geocoding mock exported only `resolveCity`; `cities.ts` also calls `resolveCityName`/`resolveByOsmId`, so the undefined export threw and the route's own catch silently degraded every call to `'disabled'` — Group B tests exercised an accidental fallback, not what they claimed to test. Fixed: mock now exports real spies for all three. B4 (the ambiguous-verdict test) now sets a genuine `'ambiguous'` `CityResolution` and asserts (a) `resolveCityName` was actually called with the right args, (b) `resolveCity`'s fire-and-forget re-check is correctly skipped for `'ambiguous'` per ADL-46 §2.6 — the one real behavioural difference the old fallback could never distinguish. **How I confirmed non-vacuous:** ran the full file (32/32 pass) with both new assertions actually executing; B1/B2/B3/B5/B6 unchanged in outcome since default resolution stays `'disabled'`.

- **QUAL-21 (route coverage, PASS/added).** New file `cities.resolve-then-create.test.ts` — every existing suite mocked `resolveCityName` to `'disabled'`, so the resolve-then-create success path had zero route-level coverage (named root cause of 2 shipped defects). Mocks only `global.fetch` with a real committed Nominatim fixture (`springfield_il.json`); real `resolveCityName`/`classifyCandidates`/accept-rule run — matches the existing `bug76-geocode-e2e.test.ts` pattern. Two branches: resolves to existing record (200, no insert), creates new record (201, `geocode_status=resolved`, OSM ref stamped). **How I confirmed non-vacuous:** mutation-tested by temporarily forcing `GEOCODING_ENABLED=false` — both tests failed immediately on `fetch` call-count, confirming the assertions are load-bearing.

- **QUAL-02 (assertion strength, PASS/partial).** Re-probed the tracker's "findings 1/2 already fixed" note rather than trusting it — confirmed true (filter-inversion, GET /api/trips sort already strong from PR #320, untouched). Strengthened two remaining weak spots: `trips.crud.test.ts`'s response-shape test (was `toHaveProperty`-only, now seeds real category/companion/activity/place/country data and asserts type+value); added a sort-order test for `GET /api/cities/:id/carry-forward`'s `desc(trips.endDate)` (zero prior coverage). Finding 4 (cross-trip item isolation) remains untouched, still open — out of this brief's named scope.

**Files touched (for merge ordering):** `adl46-access-model.test.ts`, `cities.carry-forward.test.ts`, `trips.crud.test.ts` (modified), `cities.resolve-then-create.test.ts` (new). None overlap the guardrail list (`shading.service.ts` tests, cities.ts rating-sort test — lives in `items.rating-sort-filter.test.ts`, not touched).

**CI:** `scripts/ci-wait.sh pr 433` — 18/18 checks green (Backend/Frontend/E2E/Contract Tests, Type Check, Biome, Semgrep, Gitleaks, Dependency Scan). Local: `npm run check`/`type:check:all`/`test:backend` (762/762)/`test:frontend` (321/321)/`status:check` all clean.

**Open issues/blockers:** None. Did not touch `_project/tracker.json` per brief instruction (parallel sweeps this round) — tracker updates for QUAL-02/21/22 are on COO post-merge.

Full detail: `jobs/qa/tech/20260808-qual-coverage-sweep.md`. Park doc: `jobs/qa/park-docs/20260808-QA-park.txt`.

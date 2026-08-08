BACKEND COMPLETION REPORT

Header: tracker BUG-81 · PR #424 · BRD GE-16 · Branch feat/bug77-geocode-candidate-names (name left as-is, cosmetic — content is BUG-81 throughout)

**UPDATE (renamed post-review):** originally implemented under the brief's assigned ID BUG-77, which two independent probes showed was already assigned to a closed, unrelated issue (#367, region seeding). Flagged in the original version of this report. COO confirmed BUG-77 through BUG-80 were all already taken and reassigned this work to BUG-81 — every reference in this thread (test filename, source comments, park doc, context doc, this report, PR #424 title/body) has been renamed accordingly. Re-verified green post-rename (see CI below). No open ID question remains.

What was built: additive `state`, `country`, `county` (human-readable NAMES, distinct from existing `country_code`/`region_iso` ISO codes) on each `GET /api/geocode` candidate — `nominatim-client.ts` (parseCandidate + interfaces), `geocode.ts` (response mapping), `frontend/types/api.ts` (type only, no consumption). Presentation is explicitly the frontend follow-up.

Acceptance criteria:
- Additive/back-compat, no existing field renamed/removed: PASS
- state/country captured from real fixtures (Denver→Colorado/United States, Springfield→Illinois/United States): PASS
- county serialized on the wire for disambiguation: PASS
- Focused test using real fixtures at the fetch boundary (QUAL-22 mock-fidelity): PASS — new e2e test file, 4 assertions
- isAcceptedSettlement / BUG-76 accept-rule untouched: PASS

Security checklist:
1. Auth — `requireAuth` applied globally via `app.use('/api/', requireAuth)` in `server.ts`; no route-level change.
2. userId scoping — N/A, geocode proxy touches no user-owned table.
3. FK notNull — N/A, no schema change.

CI: all 18 checks green on PR #424, re-confirmed after the BUG-77→BUG-81 rename push (`scripts/ci-wait.sh pr 424`).

Open issues or blockers: none.

What is now unblocked: Frontend can build the picker-row presentation (label composition, same-state collision-county rule, scroll cap) against `state`/`country`/`county` on `GeocodeCandidate`.

Full detail: jobs/backend/park-docs/20260807-BACKEND-bug81-park.txt

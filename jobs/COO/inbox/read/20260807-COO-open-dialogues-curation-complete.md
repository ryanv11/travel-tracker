# Open-dialogues register curation — complete

**Branch:** `chore/open-dialogues-cleanup` · **PR:** #<PR> · **File:** `jobs/COO/open-dialogues.md`
**Line count:** 1149 → 950 (−199).

Every entry under `## Open` was cross-checked against CLAUDE.md, `_project/tracker.json`,
the ADL log, `.devcontainer/init-firewall.sh`, `git log`, and live `gh api`. Only unambiguous,
verified resolutions were moved. Nothing was moved on a status line alone.

## Decisions

| Entry | Decision | Verification / reason |
|---|---|---|
| D-22 | **MOVED** | Round-4 brief file `jobs/architect/tech/20260805-BUG75-identity-round4-brief.md` exists; BRD advanced to v3.19 (past the v3.18 promotion); BUG-75 present in tracker; GE-17 withdrawal confirmed in tracker note. |
| D-15 | **MOVED** | Branch protection re-verified live via `gh api …/branches/main/protection`: `strict=true`, required PR reviews, `enforce_admins=true` — exactly the resolution claim. |
| D-10 | **MOVED** | ADL-39 present in the ADL log (canonical home); entry stamped CLOSED 2026-07-23 with verified migration. D-11 (its child settings.local.json observation) left Open. |
| D-06 | **MOVED** | Both `travel-tracker-staging.up.railway.app` and `…-production-241f.up.railway.app` confirmed in `init-firewall.sh:214-215`. "Kept in place until post-rebuild" caveat preserved in the Resolved pointer. |
| D-17 | **FLAGGED** | Duplicate (full trial history in Open + pointer in Resolved). NOT touched — the Resolved pointer explicitly documents (dated 2026-08-05) a deliberate decision to retain the history in place, citing OP-28 ("a 120-line cut is exactly the wholesale-rewrite OP-28 warns against"). Removing the Open copy would directly contradict that recorded decision. Your call — see note below. |
| D-25 | **KEPT** | Its two proposed rules (amendment must re-walk sections; OP-27 reviews the document not the amendment) are NOT in CLAUDE.md. Two probes: grep for the rule language = empty; OP-33/34/35 cover unrelated topics (spike-gate, PO-infallible, ATDD). Status "not yet adopted" is accurate. |
| D-26, D-23, D-24, D-21, D-19, D-20, D-14, D-13, D-11, D-09, D-08, D-04, D-05, D-07, D-16, D-18 | **KEPT** | Genuinely open — deferred, pending PO, observation-only, or partially resolved (see D-12). |
| D-12 | **KEPT** | Item 1 resolved (ADL-46 → BRD v3.13); items 2–4 remain open. Partial — stays Open by design. |

## D-17 — the one flag for you to decide

D-17 appears in both sections. The Resolved-section pointer (already present) says the trial
history was **deliberately** left in the Open section rather than moved, because cutting ~120
lines is what OP-28 warns against, and the full substance now lives in ADL-50 + OP-35. So the
"duplication" is documented as intentional. I did not delete the Open copy, since overriding
another COO's explicit, dated, reasoned decision is not a call I should make unilaterally
(and the brief's own guardrail is "when in doubt, leave and flag").

Two clean options:
1. **Leave as-is** — honour the OP-28 note; the Open D-17 stays as RESOLVED-stamped history.
2. **Cut the Open copy** — the substance is safe in ADL-50, so this is not real data loss;
   the Resolved pointer already carries the forwarding link. If you want this, I can do it.

## Checks
`npm run check` → exit 0 (5 pre-existing lint *infos* in `src/backend/services/__tests__/`,
unrelated — `check` only lints `src/`, not the markdown). `npm run status:check` → up to date.
Only `jobs/COO/open-dialogues.md` changed.

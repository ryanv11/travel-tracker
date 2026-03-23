# PO UAT Log — Travel Tracker

This file is checked by the COO on every session pickup.
Add findings here during or after a live testing session. No specific format required —
bullet points are fine. Screenshots can be attached to the session folder (see below).

**UAT is a mandatory gate. Phases cannot be formally closed without a UAT PASS verdict.**

Resolved findings (all [x] items) are archived to `uat-archive.md`. COO moves them at session end.

---

## How to log a finding

Just add a new session block below. Minimal effort — describe what you saw and what you
expected. If you already fixed it yourself, note that too so it gets a bug ID and QA coverage.

For behaviour bugs: steps to reproduce are more useful than screenshots.
For visual/layout bugs: screenshot + one-line description is ideal.
For "fixed it myself" entries: note the commit or approximate time so COO can trace it.

Screenshots: save to `jobs/PO/screenshots/[date]-[short-description].png`

---

## Session format

```
### UAT Session — YYYY-MM-DD

**Scope:** [What you were testing — e.g. "Add trip flow end-to-end", "Map interaction"]
**Build:** [Commit hash or "latest" — visible in git log]
**Verdict:** PASS / FAIL / PARTIAL (fill in at end of session)

#### Findings

- [ ] [Description of bug or issue]
      Steps: 1. ... 2. ... 3. ...
      Expected: ...
      Actual: ...
      Screenshot: [filename or none]
      Fixed myself: yes/no — [commit if yes]

- [ ] ...

#### Notes / Observations
[Anything that feels off but isn't clearly a bug — UX friction, confusing flows, etc.]
```

---

## Open Sessions

<!-- None — all sessions closed -->

### UAT Session — 2026-03-20

**Scope:** Testing the UI migration
**Build:** 77a415b
**Verdict:** PASS (conditional — "looks good enough to continue", 2026-03-21)

#### Findings

- [x] Sort control missing from trip list
      Steps: Open trips tab, attempt to sort by newest/oldest/name
      Expected: Sort dropdown or controls visible in left panel
      Actual: No sort UI — hardcoded to date descending
      Screenshot: none
      Fixed myself: no
      Bug: #11

- [x] Trip detail header — wrong layout and element order
      Steps: Open any trip in right panel
      Expected (mockup): Trip status > Edit > Photos on right side of header
      Actual: Status on left next to title, then Photos > Edit on right
      Screenshot: none
      Fixed myself: no
      Bug: #12 (visual discrepancy — dispatched to UX)

- [x] Trip detail meta row — stacked instead of inline
      Steps: Open any trip in right panel, view below title
      Expected (mockup): Date range | Companions | Tags on one inline row
      Actual: Date range on own line, new line companions, new line tags
      Screenshot: none
      Fixed myself: no
      Bug: #12 (visual discrepancy — dispatched to UX)

- [x] In-panel navigation tabs missing
      Note: F-02 (Itinerary/Review tabs) confirmed DEFERRED — not a current fix requirement.
      F-03 (Map tab) remains scrapped. Tabs will be specced as separate work when content is ready.

- [x] Status bar missing or not visible
      Steps: Open any trip in right panel, scroll to bottom
      Expected (mockup): Persistent bar showing current status + next status CTA
      Actual: Not visible — F-04/TR-12 was in brief but may be present and incorrectly styled
      Screenshot: none
      Fixed myself: no
      Bug: #12 (UX to confirm if present but unstyled, or absent)

- [x] City box shading missing in trip detail
      Steps: Open a trip with multiple places, view place cards
      Expected (mockup): Shading/background styling on city section boxes
      Actual: No shading on city boxes
      Screenshot: none
      Fixed myself: no
      Bug: #12 (dispatched to UX)

- [x] Icons blue instead of green theme from mockup
      Screenshot: none
      Fixed myself: no
      Bug: #12 (dispatched to UX)

#### Notes / Observations

1. Sort regression — was in pre-migration app, dropped during Tailwind migration. PO confirmed: "shouldn't have dropped features from the original version."
2. Multiple visual discrepancies between delivered UI and approved Option B mockup. UX dispatched to do formal side-by-side comparison and produce delta doc.
3. ~~Open scope question: F-02 in-panel tabs.~~ **Closed 2026-03-23** — PO decision: not worth implementing without the map tab. F-02 and F-03 removed from BRD §9 entirely (v2.6).
4. BYPASS_AUTH=true added to .env.local — local dev was blocked by devcontainer firewall unable to reach Clerk JWKS endpoint.

---

# PO UAT Log — Travel Tracker

This file is checked by the COO on every session pickup.
Add findings here during or after a live testing session. No specific format required —
bullet points are fine. Screenshots can be attached to the session folder (see below).

**UAT is a mandatory gate. Phases cannot be formally closed without a UAT PASS verdict.**

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

## Sessions

<!-- Add new sessions below, most recent first -->

### UAT Session — 2026-03-19 (retroactive — pre-log)

**Scope:** General usage — region tier admin, Add Place flow
**Build:** ~1994213 / d704343
**Verdict:** PARTIAL — two bugs found and self-fixed; no further issues in scope tested

#### Findings

- [x] Region tier toggle cleared label on disable
      Steps: Admin panel → country with regions → toggle region tier off
      Expected: label preserved (read-only)
      Actual: label cleared
      Fixed myself: yes — commit 1994213
      Logged as: BUG-15

- [x] Add Place: region dropdown missing for region-tier country
      Steps: Add Place → new city → select country with region tier enabled
      Expected: region dropdown appears
      Actual: no dropdown shown; region_id not set
      Fixed myself: yes — commit d704343
      Logged as: BUG-16

#### Notes / Observations
None beyond the above.

---

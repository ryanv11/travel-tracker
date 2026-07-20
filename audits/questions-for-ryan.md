# Audit questions for Ryan — answer sheet

**Purpose:** consolidated open questions from the three audit sessions (A: doc integrity,
B: code & safety, C: workflow extraction), for Ryan to answer directly in-repo.

**How to use:** fill in the `**Answer:**` line under each question. Where I've given a
**My rec** line, you can just write `agree` (or override). When you've done a batch — you
don't have to do them all at once — tell me and I'll read this file, action what I can, and
mark items done. 🔓 = your answer unblocks part of the doc-cleanup PR I'm already working on.

**Legend for status:** ⬜ unanswered · ✅ answered · ▶️ in progress by Claude

---

## Tier 1 — Product-defining (please answer first)

### Q1. Is the app a solo offline Mac app, or a multi-user web app? 🔓

The written requirements (BRD §3, NF-01) still describe a single-user, offline, local Mac
app. What's actually built and shipped is a multi-user, login-required web app. These
contradict each other. Your answer decides whether BRD §3/NF-01 get rewritten, and it's the
backdrop for several questions below.
_Source: Session A Q6._
**Answer:**
It is currently planned to be a solo offline mac app but i'd like it to be easily scalable to become a multi user web app and an iOS app. This might start as small as just friends and family.

### Q2. Confirm the "add item to any trip" behavior was a bug.

Any logged-in user could add items to another user's trip. I've treated it as a bug and
already fixed it (PR #109). I just need confirmation it was never intended — I found nothing
in any spec blessing it. If you disagree, I'll revert.
**My rec:** confirm it's a bug (fix is done, tests added, CI green).
**Answer:**
It's a bug. a logged in user should be able to add items to someone elses trip that they're a participant/companion on. I'd consider this to be "someone elses trip" where whoever created the trip owns it and anyone added can view and edit it freely.

### Q3. What's actually allowed on a _locked_ trip?

Today you can delete a locked trip, and you can tag/untag activities on one, even though
"locked = read-only" is the stated rule. Are those intentional exceptions or bugs? Decides
whether code or comment gets fixed, and what the lock tests assert.
_Source: Session B Q2._
**Answer:**
Locked should be read only. You'd need to move it out of a locked state to make changes.

---

## Tier 2 — Unblocks the doc cleanup

### Q4. Can I mark the security checklist items as "passing"? 🔓

All six items the OP-06 checklist still shows as "failing" were fixed months ago. Can I flip
them (citing the fixing commits/PRs), or do you want an independent re-check first?
_Source: Session A Q1._
**My rec:** flip them with commit citations — Session B re-verified the fixes against live code.
**Answer:**
yes

### Q5. Is real login working in the local dev container now? 🔓

The firewall was opened to allow the login provider (Clerk JWKS), but the docs still say it's
blocked and GitHub issue #23 is still open. Can I fix the docs and close #23? And is "skip
login" (`BYPASS_AUTH=true`) still the intended local default?
_Source: Session A Q2._
**Answer:**
Unsure, let's work through it together.

### Q6. Locked-trip error code — 403 or 423? 🔓

The code and the API reference both return **403**; only the test policy says 423. One is
wrong — which is the intended contract?
_Source: Session A Q7 / Session B._
**My rec:** 403 is the real contract (code + API ref agree); fix the test policy to 403.
**Answer:**
test policy was written after and is incorrect. API reference data should be the source of truth.

### Q7. Do you approve the latest requirements (v2.7) as written? 🔓

The v2.7 security requirements (§5.11, SE-01–07) are the only BRD version with no recorded
sign-off from you — the changelog lists "COO" alone. A yes lets me record your approval.
_Source: Session A Q5._
**Answer:**
Can't find this, lets work through it together.

---

## Tier 3 — Bug or intentional? (each decides code-vs-comment)

### Q8. Updating one place date wipes the other.

Updating a place's arrival date alone clears the departure date (and vice versa) — unlike
every other update in the app, which leaves unmentioned fields alone. Deliberate (because the
form always sends both) or a bug?
_Source: Session B Q6._
**Answer:**
That's a bug, but the fields should always validate that the arrival date is before the departure date (or the same date)

### Q9. The leftover "session cookies" login setting.

A CORS setting (`credentials: true`) and comments reference "Phase 2 session cookies," but the
app uses bearer-token login and has no cookies. Vestigial and removable, or load-bearing for
some login flow you know of?
_Source: Session B Q3._
**Answer:**
Nothing I know of.

### Q10. Keep the async error-handling wrapper?

Newer Express handles async errors natively, so the `asyncHandler` wrapper may be redundant.
Keep it for consistency, or take a brief to drop it?
_Source: Session B Q5._
**Answer:**
Should have architect review and ensure that we are using the newer express features.

### Q11. Which database-transaction method is correct?

Two parts of the code give opposite advice about whether `db.transaction()` is safe with the
in-memory test client. Both work today. Which statement is current, so the wrong one gets
deleted?
_Source: Session B Q7._
**Answer:**
Not sure.

### Q12. The geocode retry loop.

The frontend retries failed geocodes forever, using an empty write as a poll (bumps the city's
timestamp; owner-only, so any future non-owner flow would 403 forever), and its cleanup branch
is dead code. Small fix brief now, or park until multi-user matters?
_Source: Session B Q8._
**Answer:**
Fix it.

### Q13. The 200-character trip-name limit.

Documented but never enforced (it lives in a test that always passes). Still a real
requirement (enforce it), or drop the limit from the docs?
_Source: Session B Q9._
**Answer:**
Enforce it.

---

## Tier 4 — Quick housekeeping confirmations

### Q14. Was the UI component library (shadcn/ui) dropped on purpose? 🔓

A design doc calls it the "single source of truth" for the frontend, but it was never
installed (the app uses plain Tailwind). Decision, or drift?
_Source: Session A Q11._
**Answer:**
Not sure, but UI is a bigger discussion to come back to. So I think it's drift.

### Q15. Is Electron packaging still the plan? 🔓

A decision (ADL-06) picked Electron, but the BRD still lists packaging as an open question
(OQ-02). Confirm so I can close OQ-02.
_Source: Session A Q12._
**My rec:** close OQ-02 as Electron (ADL-06 already decided it).
**Answer:**
If Electron is for the iOS app then yes.

### Q16. The screenshots folder. 🔓

CLAUDE.md and the UAT log point to `jobs/PO/screenshots/`, which doesn't exist. Were
screenshots deleted, or never used? (Fix the docs vs. create the folder.)
_Source: Session A Q9._
**Answer:**
Never used but should have a folder created.

### Q17. Why is there a copy of the Claude Code repo in the project? 🔓

`claude-code/` is git-ignored and isn't project content, but CODEBASE.md describes it as if it
is (slated for "extraction"). Why is the clone there, and should the doc stop describing it as
project content?
_Source: Session A Q4._
**Answer:**
We had a brief discussion about splitting out the travel tracker project from the Claude Orchestration layer, which is itself a project.

### Q18. Are the Word-doc versions of the requirements still used?

`travel-tracker-standalone-BRD.docx` and `travel-tracker-project-audit.docx` predate recent
BRD changes and can't be diffed in-repo. Still load-bearing?
_Source: Session A Q10._
**Answer:**
Switch to using a .md so it can be diffed and managed in repo.

### Q19. Where should the project's stated goal live? 🔓

It currently points at a frozen old plan file (`project-plan.txt`, stuck at 2026-03-08).
Refresh that file, or move the goal into CODEBASE.md and stamp the plan historical?
_Source: Session A Q8._
**My rec:** move the objective into CODEBASE.md; banner the plan historical.
**Answer:**
agree

### Q20. The production guard for "skip login."

The guard that blocks `BYPASS_AUTH` in production only fires when `NODE_ENV === 'production'`.
Should it instead fail closed — refuse to skip login unless explicitly told it's a dev/test
box? Relevant once you host it.
_Source: Session B Q4._
**My rec:** fail closed when you get to hosting; low urgency until then.
**Answer:**
yes

---

## Tier 5 — Process & tooling (lower urgency, higher long-term leverage)

### Q21. The four workflow skills.

I drafted four task-scoped skills (schema changes, backend routes, COO merge/close-out,
decision recording) in the Session C report. Confirm, rename, or drop each — none get
installed without your OK. Also: any recurring workflow I _didn't_ draft that you want one for
(e.g. frontend features)?
_Source: Session C Q1/Q2._
**Answer:**
Lets work through it together.

### Q22. Consolidate the 13 copied test-schemas into one?

Every backend test hand-copies the DB schema; the 13 copies have drifted from the real schema
and from each other. Consolidating to one shared copy removes the most error-prone step in
schema changes and makes tests actually catch schema bugs. Worth a dedicated fix?
_Source: Session B / Session C Q10._
**My rec:** yes — high leverage; do it before installing the schema skill.
**Answer:**
Yes

### Q23. How should the broken tracker tool be fixed?

`scripts/tracker.js` (BUG-23) mangles any entry containing `//`. New finding: the tracker file
itself contains comment lines, so standard JSON tools can't read it either. Fix: make the tool
comment-aware, or remove the decorative comment lines and keep it plain JSON?
_Source: Session C Q11 / BUG-23._
**My rec:** make it comment-aware (a string-aware stripper) so notes can contain `//` and URLs.
**Answer:**
comment aware

### Q24. Slim down the always-loaded instructions?

Move the step-by-step procedures (merge commands, schema workflow, security checklist,
PR snippets) out of CLAUDE.md into the per-task skills, keeping only always-true rules loaded
by default. Cuts baseline context.
_Source: Session C Q12._
**Answer:**
Yes

### Q25. The users-table stores dates differently from every other table.

`users` uses integer epoch timestamps; every other table uses text ISO-8601. Deliberate or
accidental? Affects how new tables should be built (the schema skill currently says "follow
text-ISO; don't copy users without a ruling").
_Source: Session B / Session C Q3._
**Answer:**
accidental, use an ISO unless there is a good reason not to.

---

## Notes / anything else

(Free-form — drop any other direction or corrections here and I'll fold them into the audit
follow-ups.)

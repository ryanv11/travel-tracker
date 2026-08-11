BACKEND COMPLETION — QUAL-48 file-backed test-client spike
Tracker: QUAL-48 · PR: (below) · BRD: n/a · Branch: chore/qual48-transaction-spike

GO / NO-GO: **GO.** A file-backed libSQL test client honours db.transaction() AND
lets a subsequent query on the same client succeed — the exact half the :memory:
double breaks — while keeping the partial unique indexes enforced, leaving the
drizzle-kit patch untouched, and passing all 827 tests at +~3s wall.

MOST LOAD-BEARING EVIDENCE (probe C, file-backed): tx commits; subsequent
`SELECT COUNT(*)` on the same client returns [{"c":1}] (:memory: THROWS here);
mid-tx unique violation rolls back with no orphan. Root cause is read, not
guessed: @libsql/client sqlite3.js:145-149 nulls #db when handing the connection
to the tx, so the next client query reopens from #path — empty for :memory:, the
same file for file-backed.

VERIFY-CHECKLIST (verdict · probe):
1. file-backed tx + subsequent query survives — VERIFIED · probe C vs :memory: probe A + mechanism read.
2. cheaper than file I/O? — VERIFIED a real alt exists but UNSAFE parallel (so NOT "only way").
   file::memory:?cache=shared works (probe D) no file I/O, BUT all such clients share ONE db/process
   (probe E) and named in-memory is rejected (probe F + whitelist read) → collides under
   fileParallelism:true. A @libsql/client version bump was NOT probed — marked UNVERIFIED.
3. coexists w/ drizzle-kit patch + partial indexes — VERIFIED · drizzle-kit never runtime-imported
   (grep) + partial index enforced-AND-partial file-backed (dup osm ref rejected, two NULL-osm rows
   allowed) + 827/827 pass.
4. cost to 827-suite — VERIFIED · 827/827 pass file-backed; wall 9.89s→12.87s (+~30%); test-db.ts
   edit REVERTED, suite reconfirmed at baseline.
5. unblocks itemRepository.create atomic wrap — VERIFIED · probe C models base+extension rollback
   (no orphan) and the post-write fetch survives file-backed (:memory: forbids it; executeCarryForward
   survives :memory: only because its route returns the tx result with no post-tx query).

AUDIT CLAIMS (§1d): all three CONFIRMED, none overturned. "No transactions" is false
(executeCarryForward), batch is atomic (probe B), the :memory: next-query break is real
(probe A). The three cited avoidance comments exist verbatim.

SECURITY CHECKLIST (OP-06): n/a — no routes, no application code touched.

DELIVERABLES: jobs/backend/tech/20260810-qual48-transaction-spike.md (report);
jobs/backend/tech/qual48-transaction-probe.mts (inert repro, probes A–F, outside every
vitest include glob — CI never runs it; kept per QUAL-25 precedent — flag if you'd rather discard).
NO src/backend/** change ships. drizzle-kit patch untouched.

CI: (PR # and green status appended after ci-wait — see below)

FOLLOW-ON: QUAL-48 part 2 + BUG-95 should PROCEED, on a per-test file-backed client design
(unique temp path WITH cleanup — the spike variant leaked temp dirs), ATDD-first. Optionally
scope file-backed to only transaction-using tests to keep the suite delta near zero.

BLOCKERS: none. OPEN QUESTIONS: none.
NOW UNBLOCKED: the QUAL-48 part-2 Backend brief (items base+extension atomicity + BUG-95).

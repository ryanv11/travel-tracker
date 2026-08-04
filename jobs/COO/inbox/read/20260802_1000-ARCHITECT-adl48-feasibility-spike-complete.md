# ARCHITECT → COO — ADL-48 feasibility spike complete

**Tracker:** OQ-06 · BUG-30 · **BUG-75** · D-19 · ENV-01 · GE-07 · GE-16
**Branch:** `spike/gazetteer-feasibility` · **DRAFT PR — DO NOT MERGE**
**BRD:** §5.2 GE-01…GE-18 (recommendations only — no BRD or tracker edits made)
**Report:** `jobs/architect/tech/20260802-ADL48-feasibility-spike.md`

## Verdict: **GO — WITH FOUR CHANGES**

ADL-48's central decision survived being built. It is cheaper and less risky than the ADL
argued, because the unmeasured question — search cost at 170k rows — has a clean answer that
costs the product nothing. Three stated mechanisms must change; one inherited defect is live
in shipped code today. First ADL-48 work where code was actually run.

## Per-decision verdicts

- **Q1 search perf — ADOPT FTS5 TRIGRAM; REJECT prefix.** Today 8.7 ms reading all 170,540
  rows/keystroke. Trigram 0.2 ms with a *provably identical* result set (30/30 terms, id-set
  equality). ADL-48 §5.3's "exact then prefix" is a **silent product regression** — "vegas"
  stops finding Las Vegas. Trap: trigram returns **0 rows** below 3 chars, so min-3 must be a
  validated precondition, not a UX convention.
- **Q1 regime — REFRAMED.** Turso RTT 29.5 ms vs 8.7 ms CPU, so the real latency win is
  **~22%, not 40×**. Don't let "40×" reach the PO — it's a local-file number. The true
  argument is **rows read: 4,264× fewer**, and Turso bills on rows read. Min 3 chars, 250 ms
  debounce, cap 50 + separate COUNT/GROUP BY.
- **Q2 narrowing — ADOPT RANK, REJECT FILTER.** Under `LIKE` the PO's instinct was right
  (filter 25× win, rank buys nothing). Under trigram, unnarrowed (0.2 ms) beats *filtered*
  `LIKE` (0.3 ms) — the performance case dissolves. Filtering would hide **all 49 "bergen"**
  rows from a GB trip. **Country is NOT the last signal**: the trip's existing places narrow
  6 GB "Newport"s → **1**; recommend as a later ranking term.
- **Q3 Turso — NOT A BLOCKER; move seed off boot path day one.** RTT 29.5 ms, `batch(2000)`
  156 ms as one round trip, 2,000-row `VALUES` **33 ms** (5× better — put it in the brief).
  Full seed 2.8–13.4 s wire time.
- **Q4 Nominatim — STILL UNVERIFIED, and the question changed shape.** Unreachable (2 probes;
  `WebFetch` non-functional, confirmed vs a control host). OSM proxy says all 9 present.
  **New risk:** `nominatim-client.ts:81`'s settlement-type filter may drop results Nominatim
  *did* return (Torridon/Gairloch/Applecross/Braemar are features as well as settlements).
  **The closing probe must check the returned `type`, or it gives a false pass.**
- **Q5 S1 — SAFE AND DISPATCHABLE.** Generator built and run: 714 rows, **76/76 preserved
  byte-for-byte** (names too), 0 missing, 0 dup ISO, +638 additive; F4's 2 rows dropped and
  named. F2 verified by me in `schema.ts`, not inherited. **F3: vendor it** — `iso3166-2-db`
  costs **11.8 s install** (new number; review had disk only) for one 3.35 MB file.
- **Q6 BUG-75 — WIDEN THE KEY; DECOUPLE IT.** Live **today** at 8,876 rows / 5.20% (worse
  than the review, which correctly modelled post-S1 at 5,024 / 2.95% — reproduced exactly).
  **S1 improves it.** A 0.1° coordinate bucket fixes 98.2%, leaving zero groups >10 km apart.

## CI
Draft PR opened; `scripts/ci-wait.sh` run to green before filing this. PR # in the branch.

## Open issues / blockers
- **Turso INSERT throughput UNVERIFIED** — the diagnostic token is read-only. I attempted the
  authorised scratch-table write deliberately so the refusal was a second independent probe;
  rejected, **nothing created, nothing to clean up, no user table touched.** Needs a
  write-capable token from an S2 branch.
- **Q4 needs one `curl` from any unfirewalled host** (staging shakedown or the PO's laptop).
- **Open decision I deliberately did not settle:** whether the ~17 MB artifact belongs in git
  history. Gitignored for now; row count, bytes and SHA-256 are in the report.

## Now unblocked
- **S0 (BUG-75 key widening)** — new, decoupled, dispatch first; cheapest to fix at 3 rows.
- **S1** — ready, with the F2 upsert wording and F4 filter both proven.
- **Database/Backend** — S2/S3 have measured numbers instead of estimates; both still gated on
  GE-17/GE-18 and the GE-16 amendment (amend as a whole per F6, not one sentence).

**Concession stated in the report §10:** the NW Highlands hold 45 gazetteer rows total, so for
the Scotland trial the gazetteer is the *minority* path. If that trial is the priority, the
honest sequencing is S0 → S1 → BUG-71 fix → **pause**, revisiting S2/S3 after.

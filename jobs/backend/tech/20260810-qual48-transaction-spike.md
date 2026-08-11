# QUAL-48 spike — file-backed libSQL test client: does it honour `db.transaction()`?

**Tracker:** QUAL-48 · **Class (OP-32):** gap · **Branch:** `chore/qual48-transaction-spike`
**Author:** Backend · **Date:** 2026-08-10 · **BRD:** n/a (internal test-infra spike)
**Type:** OP-33 spike — evidence + verify-checklist + go/no-go. **No production `src/backend/**` change ships.**

> Reproduce every runtime result below with the inert probe kept beside this report:
> `npx tsx jobs/backend/tech/qual48-transaction-probe.mts` (probes A–F). The full-suite
> and partial-index results came from a temporary `test-db.ts` edit that was **reverted**
> (suite confirmed back to baseline — see §4).

---

## Go / No-Go: **GO**

A file-backed libSQL test client honours `db.transaction()` **and** lets a subsequent query
on the same client succeed — the exact thing the `:memory:` double breaks — while keeping the
partial unique indexes enforced, leaving the drizzle-kit patch untouched, and passing all 827
tests at **+~3s wall (9.89s → 12.87s)**. The follow-on atomicity fix (QUAL-48 part 2 + BUG-95)
should proceed, on a **per-test file-backed** client design.

**Single most load-bearing piece of evidence** (probe C, file-backed):
```
transaction committed: true
subsequent SELECT: [{"c":1}]        <- :memory: THROWS here; file-backed sees the row
mid-tx failure rolled back: threw=true, rows v='b'=[{"c":0}]  => no orphan
```

---

## The mechanism (why file-backed works and `:memory:` doesn't) — read, not guessed

`@libsql/client`'s sqlite3 client, `transaction()` (lib `sqlite3.js:145-149`):
```js
async transaction(mode = "write") {
    const db = this.#getDb();
    executeStmt(db, transactionModeToBegin(mode), this.#intMode);
    this.#db = null;                 // hands the connection to the tx, nulls its own ref
    return new Sqlite3Transaction(db, this.#intMode);
}
#getDb() { if (this.#db === null) this.#db = new libsql(this.#path, this.#options); return this.#db; }
```
The client hands its live connection to the transaction object and **nulls `#db`**. The *next*
client query calls `#getDb()`, sees `null`, and opens a **new** connection from `#path`.

- **`:memory:`** — a new connection is a brand-new, **empty** in-memory database. Schema and data
  from the first connection are gone → the next query throws "no such table". (drizzle wraps this
  at `drizzle-orm/libsql/session.cjs:85`; it does not close the tx connection after commit.)
- **file-backed** — the new connection reopens the **same file**, sees the committed data → works.

This is a positive, self-verifying mechanism (code read) that predicts every runtime result below.

---

## Verify-checklist

### 1. File-backed honours `db.transaction()` AND a subsequent query survives — **VERIFIED (yes)**
- **Probe (runtime):** probe C — `db.transaction()` inserting two rows commits; a subsequent
  `SELECT COUNT(*)` on the **same** client returns `[{"c":1}]`; a mid-transaction unique-violation
  rolls the whole transaction back (`rows v='b' = [{"c":0}]`, no orphan).
- **Probe (contrast):** probe A — identical shape on `:memory:` → transaction commits but the
  subsequent SELECT **throws** ("Failed query … no such table"). The two probes fail differently
  (same code, only the URL changes), isolating the cause to the client's in-memory reopen.
- **Second, independent probe:** the mechanism read above predicts exactly this split.

### 2. Is there a cheaper fix than file I/O? — **VERIFIED: a real alternative exists, but it is unsafe for the parallel suite** (NOT "file-backed is the only way")
Three candidates named and probed rather than one:
- **`file::memory:?cache=shared` (shared-cache in-memory, no file I/O)** — **works** (probe D:
  transaction + subsequent query both succeed). **But** all shared-cache in-memory clients in one
  process share **one** database (probe E: a separate client reads another client's table+row),
  and libSQL will **not** accept a *named* in-memory DB to isolate them — `mode=memory` is rejected
  by the client's URL param whitelist (probe F: `URL_PARAM_NOT_SUPPORTED: "mode"`; confirmed too by
  reading `@libsql/core/lib-cjs/config.js` — in-memory mode whitelists only `cache`). Under Vitest's
  default threaded pool (`fileParallelism: true`), two test files in the same worker would collide.
  Viable **only** with `fileParallelism: false` / single-thread — that serialization is its own cost.
- **A per-test client reset / different client option** — the reopen is intrinsic to
  `transaction()` nulling `#db`; no client option changes it (mechanism read). Not a fix.
- **A `@libsql/client` version bump** — out of scope and would re-open dependency verification;
  not probed. Marked **UNVERIFIED** (blind spot: only `^0.14.0`, the pinned version, was tested).

**Conclusion:** file-backed is the **safest** default (natural per-test isolation via a unique temp
path, parallelism intact). Shared-cache is a genuine cheaper alternative **with a parallelism
caveat**, not a free win — recorded so the follow-on brief can choose with eyes open.

### 3. Coexists with the patched drizzle-kit 0.31.9 and the partial unique indexes — **VERIFIED (yes)**
- **drizzle-kit:** orthogonal. Two probes that fail differently: (i) `grep -rn drizzle-kit src/`
  returns only migration/test **comments**, never a runtime `import` — the test runtime builds its
  schema via `drizzle-orm/libsql/migrator`, not the drizzle-kit CLI the patch governs; (ii) the
  file-backed suite built its schema through that same migrator and passed 827/827 (§4). The client
  URL change touches neither the patch nor `npm run db:generate/migrate`.
- **Partial unique indexes:** enforced, and enforced *as partial*. Probe (`qual48-transaction-probe`
  logic, run against a file-backed DB built from the **real migrations**): a duplicate
  `(osm_type, osm_id)` is **rejected** by `uniq_cities_osm_ref`, while **two** rows with
  `osm_id IS NULL` are **both allowed** — a full index would reject the second; the partial predicate
  `WHERE osm_id IS NOT NULL` is honoured. A silently-ignored partial index (the false-green risk the
  brief names) is ruled out.

### 4. Cost to the existing 827-test suite — **VERIFIED (passes; ~+30% wall)**
Measured by temporarily pointing `createTestDb()` at a per-call temp file, then **reverting**:

| | Test Files | Tests | Duration (wall) | tests phase |
|---|---|---|---|---|
| `:memory:` (baseline) | 52 passed | **827 passed** | 9.89s | 5.79s |
| file-backed (spike) | 52 passed | **827 passed** | 12.87s | 25.43s |
| `:memory:` (revert re-run) | 52 passed | 827 passed | 10.01s | 6.10s |

Zero test failures file-backed. The pure test-execution phase grows ~4.4× (per-test file I/O), but
import/transform dominate wall time, so the observable cost is **+~3s (+30%)**. Not prohibitive.
(Blind spot, noted: measured in this devcontainer where `/tmp` is likely tmpfs; a real-disk CI
runner could differ — the follow-on should re-check, and can scope file-backed to only the tests
that need transactions to keep the delta near zero.)

### 5. Would it unblock wrapping `itemRepository.create` (base insert + `insertExtension`) atomically — **VERIFIED (yes)**
`itemRepository.create` inserts the base `items` row (`items.ts:148`), then `insertExtension`
(`:165`), then **`fetchItemsWithExtensions`** (a SELECT) — a query *after* the writes. That trailing
read is exactly why it cannot be wrapped in `db.transaction()` under `:memory:` today (the post-tx
query would throw). Probe C models the write pair precisely: base insert + a second insert inside one
transaction, mid-failure → full rollback, **no orphan base row**; and the subsequent read survives on
a file-backed client. So a file-backed test client unblocks wrapping `create` (and `update`) in a
transaction with the post-write fetch intact.

> Contrast that with `executeCarryForward` (`items.service.ts:116`), the one production
> `db.transaction()` that already works under `:memory:` — its route returns the transaction's own
> result directly (`places.ts:245`: `res.json({ created_item_ids: createdIds })`) with **no** query
> afterward. It survives by accident of shape, not by design; `create` cannot copy the trick.

---

## Audit claims (secondary audit §1d) — confirmed / overturned

All three **confirmed** (re-probed independently, not inherited):
- **"No transactions" is false.** `executeCarryForward` runs `db.transaction()` in production
  (read `items.service.ts:116-166`); it survives `:memory:` only because the route emits the tx
  result with no post-tx query (read `places.ts:238-248`). **Confirmed.**
- **Multi-step paths already atomic via `db.batch()`.** Probe B: a batch whose 2nd statement
  violates a unique index rolls back the 1st (`rows after = 0`). **Confirmed.**
- **The real constraint is the `:memory:` client breaking the next query after a transaction.**
  Probe A + the mechanism read. **Confirmed.** The three avoidance comments the audit cites are
  present verbatim (`trips.ts:288`, `cityIdentityService.ts:138`, `geocoding.service.ts:45`).
- **The reflection's proposed fix was `UNVERIFIED`.** It now is verified — this spike is the probe.

Nothing overturned. The frame holds: this is QUAL-22 inverted — a low-fidelity test double dictating
production *shape*, and the fix raises fidelity rather than lowering it.

---

## Recommendation for the follow-on (QUAL-48 part 2 + BUG-95)

**Proceed.** Design notes for that Backend brief (not decided here — spike produces evidence only):
1. **Client design: per-test file-backed** — unique temp path per `createTestDb()`, **with cleanup**
   (the spike variant leaked temp dirs; the real fix must `rm` per test or via a global teardown).
   Prefer this over shared-cache: it keeps `fileParallelism: true` and gives natural isolation.
2. **Scope to contain cost** — only tests that exercise transactions strictly need the file-backed
   client; `:memory:` can stay for the rest to keep the suite-wide delta near zero. Or accept the
   flat +~3s if uniformity is preferred. The brief should decide; both are green.
3. **Do not touch the drizzle-kit patch** — verified unnecessary; this change is orthogonal to it.
4. **ATDD-first (OP-35 trigger: silent atomicity + a data-integrity fix):** write the failing tests
   first — (a) `itemRepository.create` mid-failure strands **no** orphan base item; (b) BUG-95's
   non-owner-cannot-mutate-the-extension-row regression test — then make them pass.

## Artifacts
- `jobs/backend/tech/qual48-transaction-probe.mts` — inert, self-contained repro (probes A–F). Kept.
- No `src/backend/**` change. The `test-db.ts` measurement edit was reverted (§4).

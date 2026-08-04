# ARCHITECT → COO — ADL-49 OP-27 fresh-eyes review complete

**ADL:** ADL-49 (§1–§10) · **Reviews:** PR #394, issue #393 · **BRD:** none (environment/tooling)
**Branch:** `chore/adl49-op27-review` · **PR:** #395
**Deliverable:** `jobs/architect/tech/20260804-ADL49-fresh-eyes-review.md`

## Verdict

**Does not stand as briefable as written — narrowly.** All three ADD recommendations (D1 Nominatim,
D10 staging, D11 prod) are right and survive; F1 makes D10/D11 *cheaper* than argued. What fails is
the framework used to price them. Three blocking corrections.

## Per-decision verdict

- **D1 / D10 / D11 — adopt, upheld.** D10's *argument* must be re-based (F7); the verdict stands.
- **D12 — outcome upheld, reasoning rejected.** "Cannot be expressed in this script" is false (F3).
- **D17 — upheld and under-stated.** §10.8's "does not change any verdict" is false (F1).
- **D13 — upheld, remediation under-scoped 11× (F5).** Replacement command verified fail-loud.
- **D14/D15/D16, all of §5, §6.5 — upheld, untouched.**

## The three blocking items

1. **F1 (critical).** The allowlist is **already bypassable to any Cloudflare-proxied origin** —
   demonstrated live, 9/9 hosts, from both allowlisted CF edges. `api.maptiler.com` (301, real origin)
   and `api.clerk.com` (401 on `/v1/users`) are recorded in §10.3 as blocked with two probes each and
   are reachable **right now**. Negative controls hold (pypi.org/Fastly and api.turso.tech/CloudFront
   both fail), so this is "every Cloudflare zone", not "everything". The allowlist is an accident
   control, not a containment boundary; ADL-33 §4's Clerk exclusion is credential-only.
2. **F2 (high).** `nominatim.openstreetmap.org` and `tile.openstreetmap.org` are the **same address**
   (151.101.21.91). Applying D1 makes the OSM tile servers reachable, and §10.7's diff would commit
   that exclusion into the script as a false statement. **Do not apply the diff as written.**
3. **F3 (high).** §10.3 row 5's unprobed claim *"Azure blob storage is not in GitHub's meta ranges at
   all"* is false — the ADL's own error IP `20.209.227.33` is in `.actions` at `20.209.226.0/23`. The
   `.actions` CIDR path is a mechanism the script already implements. Refuse it on the number
   (**27.9M addresses vs 30,800 today, ~900×**), which §10.5.2's own last paragraph already does
   while the summary table says the opposite.

## Also needing action (not blocking the ADL edit)

- `gh run view --log-failed` is instructed in **11 files**, not one — including a second, gate-shaped
  fail-open in `.claude/skills/coo-startup/SKILL.md:169` (session-start red-main audit) and **8 role
  system prompts**.
- The STANDING CONDITION's premise is **true** (verified, 3 probes) but it is filed in a firewall
  comment nobody provisioning a Clerk credential will read. Home is ADL-33 §4.
- The enumeration is **additive-only**. Under F1 the *existing* entries determine what a misbehaving
  agent can reach. Raise the removal review as its own item.

## On the author's self-assessment

**Weakness B is real but not the weakest point** — §10.4.2's ratchet holds on the specifics, is
hedged, and self-limits. The actual weakest point is §10.8's closing sentence: a reassurance written
immediately after the discovery that invalidates it. Every problem I found is that one shape — a
correct discovery whose consequences were not propagated backwards.

## Killed before filing (6)

`ci-wait.sh` fail-open (**it fails closed by design**, BUG-64); a Clerk credential already present
(none); §10.7's diff malformed (**`git apply --check` exit 0 — the author's claim is accurate**); an
IPv6 hole (re-verified closed); a large Railway edge collision surface (**not established, and it
cuts the ADL's way**); `api.turso.tech`'s exclusion being nominal too (it is **effective**).

## CI

PR #395 — `scripts/ci-wait.sh pr 395` green. Docs-only: no source files, no config, no `src/`.

## Blockers

None for me. Items 1–3 above block application of §10.7's diff and any brief derived from D12 or D17.

# ADL-49 — Geocoder allowlist amendment to ADL-33, recorded-response replay fixtures, and a reassessment of GE-17's remaining case

**Date:** 2026-08-03 · **Amended 2026-08-04** — §10 (ENV-01 full host enumeration, issue #393) and
**§10.11 (amendment 2: threat model + OP-27 review corrections).** §10.11 corrects §10 in four
places; where they conflict, **§10.11 wins.** OP-27 review: `jobs/architect/tech/20260804-ADL49-fresh-eyes-review.md`.
**Status:** **Decided — design only. No code, config or firewall change ships with this ADL.**
The `.devcontainer/init-firewall.sh` diff is quoted verbatim in §3.5 and is *not applied*; it needs a
container rebuild and is the COO's to take after PO approval.
**§3.5's diff is superseded by §10.7's consolidated diff** — §3.5 is retained for history; apply §10.7.
**Amends:** ADL-33 (§2, §7, §10.3 — the allowlist and its stated exclusions).
**Tracker:** ENV-01 · BUG-76 · QUAL-22 · QUAL-18/19/20 · QUAL-25 · D-21 (open-dialogues).
**BRD:** GE-11, GE-15, GE-16, GE-17, GE-18 at v3.15. **No BRD change is proposed by this ADL** —
§6 recommends the PO *re-take* a decision the BRD already records, which is a COO/PO action, not a
requirements edit.
**Log entry:** `jobs/architect/tech/20260307-architecture-decisions-log.md` — ADL-49. This file is
the long form and supplements that entry; it does not replace it.

---

## 0. Summary

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D1 | Allowlist `nominatim.openstreetmap.org` | **ADOPT.** One entry in the existing domain loop. Single stable Fastly anycast A record — materially lower IP-rotation exposure than the Turso/Railway entries ADL-33 §7 warned about. Diff quoted in §3.5, not applied. | High |
| D2 | Allowlist MapTiler (`api.maptiler.com`) | **DEFER, and re-aim the underlying want.** The container firewall does not gate the PO's visual map testing at all — that browser runs on the host. It gates only in-container Playwright, where a live CDN dependency buys flake. And the two bugs D-21 cites as blocked are already fixed. §3.4. | High |
| D3 | Usage-policy obligations the allowlist creates | **The in-process limiter binds all three app call sites, and that is not sufficient.** The chokepoint is per-process; a capture script, a vitest worker or an ad-hoc `curl` each start a fresh 1 req/s budget against one shared egress IP. Rules in §4.3. Also: widen the `User-Agent` to carry a contact URL. | High |
| D4 | Replay-fixture architecture | **ADOPT.** Record the **wire response** at the `fetch` boundary — never the parsed `NominatimCandidate[]`. Recording post-filter output bakes BUG-76 into the fixture and the test can never see it. §5. | High |
| D5 | Interception mechanism | **A ~50-line in-repo replay `fetch` double, not MSW.** One URL prefix, one method — MSW's routing power is not the problem we have, and an unmatched-request **throw** is the guard that matters. §5.3. | Medium |
| D6 | Drift detection | **On-demand, human-triggered, from the devcontainer — never a CI gate.** CI must not depend on a free third-party service for green. Compare a semantic projection, not bytes. §5.7. | High |
| D7 | BUG-76 probe design | **ADOPT §7's design.** Record `class` *and* `type` per candidate against three limit/constraint variants; the decision table in §7.4 states what each outcome means. A result-count probe gives a false pass. | High |
| D8 | Does this weaken GE-17's case? | **YES — materially, though not fatally.** Two of the four arguments are dead. The third ("ambiguity completeness") rests on a premise that is **false for two of three call sites** and is largely addressable by three one-line changes. §6. | Medium-High |
| D9 | Sequencing | **Cheap-first wave before re-deciding GE-17 S2/S3:** allowlist → BUG-76 probe → the three geocoder query changes (§6.4) → fixtures. Then re-take S2/S3 with measurements instead of estimates. | Medium-High |

**Added by the 2026-08-04 amendment (§10) — the full ENV-01 host enumeration.** Full table with
evidence per host in §10.3; consolidated diff in §10.7.

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D10 | Allowlist `travel-tracker-staging.up.railway.app` | **ADOPT — the highest-value entry in this ADL, ahead of Nominatim.** D-06's fourth occurrence. The PO's entire verification loop is a host browser against staging (PO-confirmed 2026-08-04), so nobody in the container can observe the surface being judged. It grants an anonymous GET to a public page and no credential; the container already holds read-only SELECT on both Turso DBs. §10.4.1 | High |
| D11 | Allowlist `travel-tracker-production-241f.up.railway.app` | **ADOPT — separately, and second.** Same argument, weaker on value (prod is a promotion-event surface, and the shakedown workflow already accepts a `base_url` override). Taking D10 alone first is defensible and captures most of the benefit. §10.4.2 | Medium-High |
| D12 | Allowlist GitHub Actions **artifact** storage | **EXCLUDE — refused on cost. (CORRECTED, amendment 2 — the original headline "it cannot be expressed in this script" was false.)** It *can* be, via the meta-CIDR path this script already uses at line 126: the pool sits in GitHub meta's `.actions`. Priced and refused — **10,300 → 27,901,673 distinct addresses, a 2,709× widening** to reach a test artifact. The hostname route is still dead (9 distinct shards in 10 samples, unbounded, Traffic Manager). §10.5.2 | High |
| D13 | The `gh` CLI's own reach — **a live defect found while enumerating** | **`gh run view --log-failed`, the command CLAUDE.md tells every agent to run on a CI failure, exits 0 with zero output from this container.** It resolves to the same blocked blob pool. The run-*level* logs API is reachable and returns the full log. Working command in §10.5.3; this is a fail-open, not a nuisance | High |
| D14 | `api.maptiler.com` | **STILL DEFER — but §3.4(a) is now established rather than inferred**, and two further findings (§10.6) strengthen it: the E2E suite already filters MapTiler errors by design, and `api.maptiler.com` alone probably would *not* make in-container maps work. Presented as an explicit PO option in §10.3, not buried | High |
| D15 | Everything else probed | **EXCLUDE, each with its own reason** — `pipelines.actions.githubusercontent.com`, GitHub meta's `.actions` key, `img.clerk.com`, the Playwright CDNs, the OSM tile servers, `api.turso.tech`, `api.clerk.com`. §10.3 | High |
| D16 | Four hosts that look blocked and are not | `objects.githubusercontent.com`, `raw.githubusercontent.com`, `codeload.github.com` and `results-receiver.actions.githubusercontent.com` are **already reachable** via the GitHub meta CIDR aggregation. Recorded so nobody "fixes" a non-problem. §10.3 | High |
| D17 | The property that prices every entry — **new, and it applies to ADL-33's existing entries too** | **This allowlist matches IP addresses, not hostnames.** Adding a host grants the addresses it resolved to at container start *and everything else virtual-hosted on them*. ~~It does not change any verdict above~~ — **that clause is WITHDRAWN (amendment 2): it changes three.** §10.8 | High |

**Added by the 2026-08-04 amendment 2 (§10.11), after the OP-27 fresh-eyes review.** All three ADD
recommendations survive; the framework that priced them did not. Re-priced against a PO-stated threat
model §10 did not have. Full re-pricing table in §10.11.4.

| # | Decision | Recommendation | Confidence |
|---|---|---|---|
| D18 | What this allowlist actually is | **An availability and accident control — not a containment boundary.** Measured, not argued: `api.maptiler.com` is blocked by name but returns **HTTP 301** pinned to an address `registry.npmjs.org` resolves to. Negative control holds — `api.turso.tech` (CloudFront) fails TLS handshake through the same edge, so this is *every Cloudflare-proxied zone*, not everything. §10.8 | High |
| D19 | What an `EXCLUDE` row means | **Three different things, and each row must now say which:** `effective` (no allowlisted entry shares its CDN — the kernel does stop you), `nominal` (reachable today; the row states no case has been made), `rule-only` (reachable *because of one of our own entries*). §10.3 records this as probe class `E`. §10.11.2 | High |
| D20 | Severity of the bypass, under the PO's stated threat model | **Low — but *conditional*, not simply low.** The boundary exists to stop **changes**, and the bypass grants reads and no write capability. Its real effect is to leave the *credential* as the sole control for Cloudflare-fronted write APIs — which **promotes** ADL-33 §4 rather than excusing it. §10.11.2 | Medium-High |
| D21 | Where the STANDING CONDITION lives | **Moved to ADL-33 §4**, the decision someone re-opens when they want Clerk access. A condition filed only in a firewall comment is a record, not a control. §10.11.3 | High |

**The single most important finding in this document is not the allowlist.** It is §6.5: *the ten
tail places GE-17 was justified on are absent from the gazetteer datasets too* — ADL-48 §2 says so in
its own words. Under both architectures those places are reachable only through the geocoder, which
means **BUG-76 — our own `SETTLEMENT_TYPES` filter — is the only thing on this entire thread that
could make Plockton work at all.** It is also the cheapest item on it.

---

## 1. What this ADL is, and why it is not a one-line edit

Adding a domain to `.devcontainer/init-firewall.sh` is one entry in a `for domain in \ …` list. It
is an ADL for three reasons, all of them recorded rather than invented:

1. **ADL-33 documented its exclusions with reasoning.** `api.turso.tech` and `api.clerk.com` are
   deliberately absent, each with a paragraph explaining why (ADL-33 §2, §4). A list whose
   *omissions* are load-bearing cannot be extended by quiet edit without the extension inheriting
   none of that reasoning.
2. **This project requires an Architect ADL before the COO acts on runtime/infrastructure changes**
   (memory: `feedback_architect_involvement.md`).
3. **The allowlist is the smaller half of the question.** Reachability is not testability. What the
   PO actually asked for — better local testing — is delivered by §5, not by §3.

**Nothing here takes effect this session.** `init-firewall.sh` runs at container start via
`postStartCommand`; the current container keeps its ruleset until it restarts (ADL-33 §7, unchanged
and still correct).

### 1.1 The PO's framing is right and the record should say so plainly

> *"because the firewall blocks the geocoder isn't a good argument because we should be whitelisting
> services we need access to in local dev"*

ENV-01 is currently recorded in the tracker as `accepted` with the note *"Not a code bug. Accepted
constraint for dev environment. … No fix needed."* That posture is what let a reachability gap
harden into an architectural argument: for a year the answer to *"can we test the geocoder path?"*
was "no, and that's fine", and by 2026-08-01 "the primary path can't be tested" had become one of
four arguments for a 170,540-row bundled dataset (BRD v3.15's GE-17 changelog entry says so
explicitly — *"decisively, the primary city-entry path becomes testable in CI, which it is not today
because the devcontainer firewall blocks the geocoder"*).

An environment constraint accepted as permanent had started deciding product architecture. That is
the failure mode worth naming, independent of which way the GE-17 decision eventually goes.

**COO action (this ADL cannot take it — tracker edits are out of scope for this brief):** ENV-01's
`accepted` / "no fix needed" resolution should be reopened and re-pointed at this ADL.

---

## 2. Environment findings — probes run, and their blind spots

Everything in this section was probed from inside the devcontainer on 2026-08-03 on branch
`chore/adl33-nominatim-allowlist`. Commands and outputs are stated so the next reader can re-run them.

### 2.1 Reachability today

| Host | Probe A — network | Probe B — allowlist config | Verdict |
|---|---|---|---|
| `nominatim.openstreetmap.org` | `curl` → `(7) Failed to connect … port 443 after 249 ms` | `grep -c nominatim .devcontainer/init-firewall.sh` → `0` | Blocked, two independent probes |
| `api.maptiler.com` | `curl` → `(7) Failed to connect … port 443 after 2222 ms` | absent from the domain loop (file read in full, lines 140–151) | Blocked, two independent probes |
| `registry.npmjs.org` (control) | `curl` → **200** | present at line 141 | Reachable — the probe apparatus works |

The control matters: a bare connection failure is also what a broken resolver or a dead upstream
looks like. A same-shape request succeeding to an allowlisted host in the same second rules both out.
This is additionally the fourth, fifth and sixth independent probes of the same block — BUG-76's
tracker note already records three (TCP reject, allowlist absence, a non-functional `WebFetch`
verified against a control host).

### 2.2 DNS shape — the ADL-33 §7 CDN caveat, measured rather than assumed

ADL-33 §7 warns that the script pins A-records resolved at container start and that CDN-fronted
hosts rotate edge IPs. The honest answer for these two hosts is different, and the difference is the
whole reason to state it:

**Nominatim — Fastly anycast, one address, stable across sampling:**

```
nominatim.openstreetmap.org. → dualstack.n.sni.global.fastly.net.
                             → 151.101.21.91      (3 consecutive samples, identical)
```

Fastly's anycast model routes one advertised address globally, rather than handing a different edge
IP to each resolution the way a rotating pool does. In practice: **Nominatim is the least
rotation-exposed entry that would be added to this allowlist** — noticeably safer than the Turso and
Railway entries ADL-33 §7 was written about.

> **UNVERIFIED — stated so it is not over-read.** Three samples inside one minute, from one
> resolver, is weak evidence about stability over *weeks*. Fastly does re-map hostnames between
> anycast addresses on its own schedule. The claim "this IP is stable" is not established; the claim
> "this hostname does not hand out a different IP per resolution, the way a rotating pool does" is,
> to the extent three identical samples can establish it. **Blind spot:** one resolver, one vantage
> point, one minute.

**Practical consequence, and it should be written into the runbook rather than rediscovered:** if
Nominatim works after the rebuild and then stops mid-session, **that is the ADL-33 §7 failure mode,
and the fix is a container restart** (which re-runs `init-firewall.sh` and re-resolves). It is not a
code defect. ENV-01's original diagnosis — a stuck queue read as an app problem — is the same trap
in the opposite direction, and the cost of not writing this down is a session spent debugging
`nominatim-client.ts`.

**MapTiler — Cloudflare, a rotating five-address pool:**

```
api.maptiler.com → 104.17.242.40  104.17.243.40  104.17.244.40  104.17.245.40  104.17.246.40
```

The script's `while read -r ip` loop adds *every* A record returned, so all five land in the ipset —
coverage is better than a single-address pin. But this is exactly ADL-33 §7's class, and an
intermittent failure here would surface as **Playwright flake**, which is the most expensive possible
disguise for a network problem. This feeds D2 (§3.4).

### 2.3 IPv6 — checked because the script is IPv4-only, and it is *not* a live gap

`init-firewall.sh` resolves `A` records only (line 153) and installs no `ip6tables` rules anywhere.
Both hosts publish AAAA records (`2a04:4e42:5::347`; `2606:4700::6811:f*`), and Node 22's Happy
Eyeballs will try IPv6 when it is available — so an IPv4-only allowlist alongside working IPv6 egress
would be a bypass of the entire firewall, not just of this entry.

**It is not, today.** Three independent probes, each of which could fail differently:

1. `ip -6 addr` → the only inet6 address in the container is `::1/128 scope host` (loopback).
2. `ip -6 route` → empty. No default route, no route of any kind.
3. `curl -6 https://api.github.com/zen` → `000` (no connection), while `curl -4` to the *same URL*
   in the same second → `200`. A control that isolates "IPv6 does not work here" from "this host
   does not work here".

So: A-records-only is sufficient for this environment, and adding Nominatim introduces no IPv6 hole.
**Latent condition, worth one line in the runbook:** if the Docker network is ever given IPv6, the
allowlist stops covering egress and the default-DROP posture stops applying to it. That is a
pre-existing property of ADL-34's design, not something this ADL introduces, and it is recorded here
only because this is the first time anyone appears to have checked.

---

## 3. D1/D2 — the allowlist amendment

### 3.1 Hosts to add

**One:** `nominatim.openstreetmap.org`.

That is the entire public Nominatim API surface used by this application — `nominatim-client.ts:31`
sets `NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'` and it is the only occurrence of
the literal host anywhere in `src/` (grep across `src/**/*.ts,tsx`; every other hit is a comment).
No CDN sub-host, no separate tile or status host, no second endpoint.

### 3.2 What is deliberately *not* added, and why — extending ADL-33's exclusion discipline

ADL-33's most useful property is that its omissions carry reasons. This amendment keeps that:

| Host | Decision | Reason |
|---|---|---|
| `api.maptiler.com` | **Excluded for now** (§3.4) | The firewall is not what blocks the visual map testing it would supposedly unblock |
| `*.tile.openstreetmap.org` | **Excluded** | This app renders MapTiler vector tiles via MapLibre (`MapView.tsx:25`); it does not use OSM's raster tile servers. OSM's tile policy is separate from and stricter than Nominatim's |
| `nominatim.openstreetmap.org` write/status endpoints | **Not applicable** | The `/search` endpoint is read-only; there is nothing to scope down |
| `api.turso.tech`, `api.clerk.com` | **Still excluded** | ADL-33 §2 and §4 stand unchanged. This amendment does not reopen them |

### 3.3 Interaction with the script's mechanism

Checked against `init-firewall.sh` as it stands (read in full):

- **Resolution:** `dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}'` (line 153). The
  Nominatim record is a CNAME to `dualstack.n.sni.global.fastly.net` followed by an A record; the
  `$4 == "A"` guard correctly skips the CNAME row and takes the address. Verified by running the
  exact pipeline: it yields `151.101.21.91`.
- **Failure posture:** ADL-34's fix means a domain that fails to resolve is skipped with a warning
  and recorded in `FAILED_ITEMS` (lines 154–158). It cannot re-open the firewall. Adding an entry
  therefore carries **no lockdown risk** — worst case, one host stays unreachable and says so loudly
  at container start.
- **Idempotence:** `ipset add --exist` (line 167), so duplicate addresses across entries are fine.
- **Verification block:** the closing checks (lines 184–197) probe `example.com` (must fail) and
  `api.github.com` (must succeed). Adding a domain does not affect either. **Do not add a Nominatim
  reachability check there** — it would put a third-party service on the critical path of container
  start, and a Nominatim outage would then look like a broken devcontainer.

### 3.4 D2 — why MapTiler is deferred, and what the actual blocker is

D-21 records MapTiler as *"unblocks visual map testing; BUG-49 and BUG-34 are currently
unobservable."* Three findings, each independently sufficient to defer it:

**(a) The firewall does not gate the PO's visual map testing.** In this setup the app is served from
the container (`vite` on :5173, port-forwarded) but **the browser that fetches
`api.maptiler.com` is the browser on the host machine**, outside the container's netns and therefore
outside `iptables`. Manual map testing is unaffected by this allowlist in either direction. The only
browser the firewall reaches is the Playwright chromium baked into the image at Dockerfile build time
(`playwright.config.ts`, ADL-22 Option B comment).

> **Named as my weakest inference in this document** (§9.2). This is read off the devcontainer
> topology, not observed. If the PO in fact drives a container-side browser, the reasoning inverts
> and MapTiler should go in immediately.

> **RESOLVED (2026-08-04) — the inference above is now established, by the PO directly.** PO,
> verbatim: *"im only testing on staging now via browser on my mac."* The browser fetching
> `api.maptiler.com` is on the host machine, outside the container netns and outside `iptables`.
> The firewall does not gate the PO's map testing in either direction. §9.2's Weakness 2 is
> closed on its first half; its second half (whether a tile-less MapLibre style is sufficient
> for what map tests need to assert) is **untouched and still soft**.
>
> **Two independent confirmations found while enumerating (§10.6), which matter because they do
> not depend on the PO's statement:** (i) `devcontainer.json` forwards ports `[5173, 3001]` and
> `vite.config.ts` binds `host: '0.0.0.0'` — the configured topology is host-browser-to-forwarded-port;
> (ii) `src/e2e/map.spec.ts:14-20` filters `maptiler.com` and `ERR_ADDRESS_UNREACHABLE` out of its
> console assertions, with the comment *"tile services unreachable in devcontainer"* — the in-container
> suite was written knowing its own browser is inside the netns and blocked.
>
> **A new caveat that cuts against allowlisting MapTiler even if the PO wants it:** see §10.6 —
> one entry for `api.maptiler.com` probably would **not** be sufficient to make in-container maps
> render.

**(b) The two bugs cited are already fixed.** Read from the tracker rather than assumed:
**BUG-34** is `done` — *"MERGED to main 2026-07-20 (PR #163)"*. **BUG-49** is `done_pending_uat` —
*"FIXED 2026-07-28 (GitHub #296, PR #301)"*, with a `beforeId: 'city-markers'` fix and a COO
verification of the failure mode it could have had. Neither is an open defect awaiting a way to
observe it. What BUG-49 awaits is a **PO UAT round**, which happens in the host browser — see (a).

**(c) In CI, the firewall is not the blocker either — the missing API key is.**
`MapView.tsx:24` reads `import.meta.env.VITE_MAPTILER_KEY`, and the E2E job supplies only `DB_TYPE`
and `GEOCODING_ENABLED`. Three probes: a grep for `MAPTILER` across `.github/` (only hit in
repo: `.env.example:76`); a direct read of the `test-e2e` job's `env:` block; and a grep for
`secrets.` anywhere in `ci.yml` (no matches at all — the workflow consumes no repository secrets).
So a CI E2E build requests `…style.json?key=undefined`. **Allowlisting MapTiler would not change
that**, and fixing it means putting a real, quota-consuming API key into CI — a secrets decision, not
a firewall one.

**What to do instead, if map assertions are genuinely wanted.** MapLibre accepts an inline style
object. A local test style carrying only the GeoJSON sources and layers under test — no raster or
vector tile source, no third-party host — makes `CountryLayer` / `RegionLayer` / `CityMarkers` paint
order and marker presence assertable with zero egress, zero key and zero flake. That is the same
shape of answer QUAL-18 gives for CSP: fix the environment so it can express the failure, rather
than reaching further outside it. Recommend tracking it as a QUAL item; it is out of scope here.

**If the PO wants MapTiler allowlisted anyway**, it is cheap and safe to add — the entry costs
nothing when unused, and (b) above is an argument about *value*, not about risk. §3.5 shows where the
line goes. This is a recommendation, not a veto.

### 3.5 The exact diff — QUOTED, NOT APPLIED

> **SUPERSEDED (2026-08-04) by §10.7 — retained for history.** §10.7 carries the same Nominatim
> entry plus the two Railway app domains, and rewrites the comment block to cover the full
> exclusion set. **Apply §10.7, not this.** Nothing below is withdrawn; it is simply incomplete
> now that the whole host set has been enumerated. §3.5's three post-rebuild verification
> commands are still correct and are extended (not replaced) in §10.7.1.

`.devcontainer/init-firewall.sh` is untouched on this branch (`git status` clean of it). The COO
applies this after PO approval; it takes effect at the next container rebuild.

```diff
--- a/.devcontainer/init-firewall.sh
+++ b/.devcontainer/init-firewall.sh
@@ -130,7 +130,17 @@
 # 7. Resolve and add other allowed domains. Each domain is independent — one
 # failing to resolve only means that one host stays unreachable; it does not
 # affect any other domain or the lockdown itself.
 #
 # ADL-33/OP-21: the Turso/Railway entries below are for agent READ-ONLY
 # diagnostic access (deploy logs/status, DB SELECT queries) — not the app's own
 # runtime. Deliberately excludes api.turso.tech (Turso Platform/management API —
 # account-level, not read-only) and api.clerk.com (Clerk access was declined;
 # no read-only credential exists for it, see ADL-33 §4). Note: Turso/Railway sit
 # behind a CDN that rotates edge IPs — this script pins IPs resolved at container
 # start, so intermittent reachability is possible within a long session (ADL-33 §7).
+#
+# ADL-49 (2026-08-03): nominatim.openstreetmap.org added for LOCAL DEVELOPMENT AND
+# FIXTURE CAPTURE — it is the app's own runtime geocoder (nominatim-client.ts:31),
+# not a diagnostic host, and this is the first entry of that kind. Two obligations
+# ride with it and are not optional: Nominatim's usage policy caps this application
+# at ~1 req/s from one egress IP and requires an identifying User-Agent. The
+# in-process chokepoint (nominatim-client.ts) enforces the rate for the app, but NOT
+# across separate processes — see ADL-49 §4.3 before running any capture or probe
+# script. Deliberately still excluded: api.maptiler.com (ADL-49 §3.4 — the firewall
+# is not what blocks map testing) and the OSM raster tile servers (unused; separate,
+# stricter policy). Fastly anycast, single A record — materially less rotation-prone
+# than the Turso/Railway entries above, but the §7 caveat still applies: if the
+# geocoder stops mid-session, restart the container before debugging the client.
 for domain in \
     "registry.npmjs.org" \
     "api.anthropic.com" \
@@ -140,6 +150,7 @@
     "sentry.io" \
     "statsig.com" \
     "marketplace.visualstudio.com" \
     "vscode.blob.core.windows.net" \
     "update.code.visualstudio.com" \
     "just-raptor-89.clerk.accounts.dev" \
+    "nominatim.openstreetmap.org" \
     "travel-tracker-prod-ryanv11.aws-us-west-2.turso.io" \
     "travel-tracker-staging-ryanv11.aws-us-west-2.turso.io" \
     "backboard.railway.com"; do
```

If the PO also wants MapTiler (§3.4 recommends against, but it is the PO's call), the second line is
`    "api.maptiler.com" \` immediately after the Nominatim entry, and the comment's
"Deliberately still excluded" sentence drops MapTiler and keeps the tile-server exclusion.

**Post-rebuild verification the COO should run** (all three, in this order):

```bash
grep -n nominatim /usr/local/bin/init-firewall.sh          # the running copy, not the repo copy
curl -sS -o /dev/null -w '%{http_code}\n' \
  'https://nominatim.openstreetmap.org/search?q=glasgow&format=json&limit=1'   # expect 200
curl -sS -o /dev/null -w '%{http_code}\n' https://example.com                  # expect a failure
```

The third is the one people skip. It confirms the lockdown still holds — that the entry was *added*
and nothing else changed.

---

## 4. D3 — usage-policy obligations a local allowlist creates

### 4.1 What the policy requires

Nominatim's public instance is a donated free service. The obligations that bind us, in the form
ADL-10 already recorded them and the client already implements them:

- **An identifying `User-Agent`** — `nominatim-client.ts:32`,
  `TravelTracker/1.0 (personal-use-app)`.
- **At most ~1 request per second from one source** — `REQUEST_DELAY_MS = 1100`
  (`nominatim-client.ts:34`), a deliberate 100 ms of headroom.
- **Cache results; do not re-query what you already have** — `resolveCity` returns early for
  `resolved` and `unresolvable` rows (`geocoding.service.ts:238-239`); coordinates are stored
  permanently (GE-11).
- **No bulk/systematic querying** of the public instance.
- **Attribution** where results are displayed — GE-18's job, tracked, not this ADL's.

**One change recommended.** `(personal-use-app)` identifies the application but carries no contact
route, which is what the policy is actually asking for — the operators want to be able to reach
whoever is generating traffic before they block them. Recommend:

```ts
const USER_AGENT = 'TravelTracker/1.0 (+https://github.com/ryanv11/travel-tracker)';
```

Small, but it is a **behaviour change on an egress surface** and must be declared in whichever brief
makes it, not slipped in. It also needs to become an *export* — see §5.5.

### 4.2 Does the limiter bind every path that becomes reachable? — inside the app process, yes

Established by two probes that fail differently:

1. **Import graph.** `grep -rn "nominatimSearch" src/` returns exactly four non-test sites: the
   definition (`nominatim-client.ts:104`), `routes/geocode.ts:50`, and
   `services/geocoding.service.ts:185` and `:250`. Every one of those three call sites is inside the
   serialized chain.
2. **Literal-host search.** `grep -rni "nominatim" src/ --include='*.ts' --include='*.tsx'` finds the
   base URL exactly once, at `nominatim-client.ts:31`. Every other hit is a comment or a type name.
   There is no second `fetch` to the geocoder anywhere in `src/`, and a wrong assumption about the
   *function* name (probe 1's blind spot — see CLAUDE.md's `tripsRouter.delete` precedent) cannot
   also hide the *URL*.

The browser path is closed too: ADL-46 D7 moved the direct browser fetch behind the
`/api/geocode` proxy (`useCities.ts:62-66`), so no unlimited client-side caller exists.

### 4.3 Where the limiter does **not** bind — and this is what the allowlist newly exposes

`nominatim-client.ts:49-50` holds `chain` and `lastRequestAt` at **module scope**. Module scope is
*process* scope. The comment at line 48 says "Module-level = process-wide (single egress IP)" — the
first half is right and the second half is the assumption that breaks the moment more than one
process can reach the host. Three concrete bypasses, all of them created by this allowlist:

1. **A capture or probe script is a separate process.** `node scripts/capture-nominatim-fixtures.mjs`
   starts with `lastRequestAt = 0` and a fresh chain. Run it while `npm run dev:api` is up, or run
   two of them, and the container emits >1 req/s **from one IP**, which is precisely the unit the
   policy measures. This is the single largest new risk, and it is a *procedural* risk, not a code
   one.
2. **Vitest runs multiple worker processes.** Any test that reaches the network gets no cross-worker
   spacing. This is a design constraint on §5, not a hypothetical — it is why the replay double must
   **throw** on an unmatched request rather than fall through to the network. A pass-through double
   would be a rate-limit violation generator wearing a test harness.
3. **Ad-hoc `curl` at an agent terminal.** Nothing enforces anything.

**The rules, which belong in the runbook and in every brief that touches this:**

- **All deliberate egress to Nominatim goes through the capture script** (§5.5), which spaces its own
  requests at ≥1100 ms and logs every URL it issues.
- **Never run a capture while `npm run dev:api` is running.** The script should refuse if it can
  reach `http://localhost:3001/health` — a two-line guard that turns a policy rule into a mechanism.
- **The script refuses to run under `CI`** and requires an explicit `ALLOW_LIVE_NOMINATIM=1` opt-in.
  Two independent guards, because the failure is invisible when it happens and expensive later.
- **Test suites never reach the network.** Enforced by the throwing double, not by convention.

A cross-process file lock was considered and rejected as over-engineering for a solo project: the
`localhost:3001` guard plus the single-entry-point rule covers the realistic collisions, and a stale
lockfile is its own class of wasted afternoon. If a second developer ever exists, revisit.

**Residual risk, stated rather than mitigated away:** an agent with a terminal can still issue
`curl` at whatever rate it likes once the host is reachable. The mitigation is that the rules are
written down here and in the runbook — which is worth exactly as much as a written-down rule is
worth, and no more.

---

## 5. D4–D6 — the replay-fixture design

> This is the part that matters more than the allowlist. Reachability is not testability, and
> live-calling in CI is worse than either.

### 5.1 The failure this exists to close

BUG-71 shipped a defect past **32 purpose-written acceptance tests and green CI** because the mocks
encoded what we *assumed* Nominatim returns. QUAL-22 is the same shape stated generally: a suite
green for the wrong reason. And QUAL-22's own root cause is instructive — `adl46-access-model.test.ts`
mocks `resolveCity` but not `resolveCityName`, so calls to the latter throw, the route's `try/catch`
swallows the `TypeError`, and Group B passes **without executing what it claims to test**.

More hand-written mocks cannot close that. The defect is not "the mocks were wrong"; it is that a
hand-written mock is an assertion about a third party's behaviour, written by the same person who
wrote the code under test, checked by nobody. A recording is evidence.

**Corollary that shapes everything below: mocking `nominatimSearch` is forbidden in the new
suites.** That is mocking *our own parser and filter* — the exact layer BUG-76 lives in. The seam
must be `fetch`.

### 5.2 What gets recorded — the wire, not the parse

```
        fetch(NOMINATIM_BASE?…)  ←──── THE FIXTURE SEAM. Record here.
                 │
                 ▼
        RawNominatimResult[]           raw JSON, all fields, all results
                 │
                 ▼  parseCandidate()   ← under test
                 ▼  SETTLEMENT_TYPES    ← under test  ← BUG-76 lives HERE
        NominatimCandidate[]           ← NEVER the fixture
                 │
                 ▼  classifyCandidates() ← under test
```

Recording `NominatimCandidate[]` would mean recording output that has *already had the tail places
filtered out*, and BUG-76 would be structurally unobservable — the fixture would encode the bug as
ground truth. This is the same class of error as QUAL-18's CSP blind spot: the artefact under test
cannot express the failure.

Record the response body **verbatim**, every field, including the ones the parser ignores today
(`place_id`, `osm_type`, `importance`, `boundingbox`, the full `address` object). The fields we do
not read yet are exactly the ones a future fix will need, and they cost nothing to keep.

### 5.3 D5 — interception mechanism: an in-repo replay double

```
tests/fixtures/nominatim/
├── README.md            provenance, ODbL attribution, capture policy, §4.3 rules
├── requests.json        THE REVIEWABLE ARTEFACT — every query we ask the public service for
├── manifest.json        [{ id, url, query, capturedAt, httpStatus, sha256, source }]
└── responses/
    ├── <id>.json                 source: "captured"
    └── synthetic/<id>.json       source: "synthetic" + a required `reason`
```

**Recommend a ~50-line in-repo `fetch` double over MSW**, and the reasoning is fitness rather than
purity:

- The egress surface is **one URL prefix and one method**. MSW's value is request routing and
  handler composition; that is not the problem here.
- The behaviour that actually matters is **throwing loudly on an unmatched request** — that single
  property is what converts "tests do not hit the network" from a convention into a mechanism, and it
  is four lines.
- No new dependency in a project that already carries a patched `drizzle-kit` and a vendored 3.3 MB
  dataset.

*Trigger to switch to MSW, stated so this is a decision and not a preference:* a second external
egress surface appears, or the frontend needs the same treatment at the network layer rather than at
the API-client layer.

**Keying must be order-independent.** `nominatimSearch` builds its `URLSearchParams` from a spread
(`{...params, format, addressdetails}`), so key order follows the caller's object-literal order and
differs between `geocode.ts` and `geocoding.service.ts`. A fixture keyed on the raw query string
would miss on a call that is semantically identical. **Canonical key = the query parameters sorted by
name, `k=v` joined by `&`, with `q` lower-cased** — e.g.:

```
addressdetails=1&countrycodes=gb&format=json&limit=10&q=plockton
```

Lower-casing `q` is safe *for the key only* (Nominatim is case-insensitive on the search term) and it
prevents a `Plockton`/`plockton` fixture duplication. Everything else is compared exactly.

**Miss behaviour:** throw an error naming the canonical key and the command to record it. Never fall
through to the network; never return an empty result — an empty result is a *legitimate recorded
answer* (a genuine no-match) and must stay distinguishable from "no fixture exists".

### 5.4 How a test selects a fixture

It does not, explicitly. A vitest setup file installs the double with the whole manifest loaded, so
every suite in the backend project replays by default and the seam is invisible to well-behaved
tests. A test that wants a specific scenario simply drives the code with the query that scenario was
recorded under.

One collision to handle: `vitest.config.backend.ts:16` sets `GEOCODING_ENABLED: 'false'` globally,
which short-circuits `nominatimSearch` at line 107 *before any fetch happens*. A replay suite must
therefore `vi.stubEnv('GEOCODING_ENABLED', 'true')` — the precedent already exists at
`src/backend/routes/__tests__/cities.f1f2-ruling.test.ts:146`. Follow it rather than inventing a
second pattern.

### 5.5 Capture

`scripts/capture-nominatim-fixtures.mjs`, and it is the **only** thing that writes `responses/`.

- **Input is `requests.json`, checked in.** This is deliberate and it is the artefact a reviewer
  actually reads: it is the complete, diffable statement of what this project asks a donated public
  service for. A capture that needs a new query needs a visible commit.
- **It issues the request itself** — it must not call `nominatimSearch()`, which would apply the
  filter (§5.2) and would also silently no-op under `GEOCODING_ENABLED=false`.
- **It reuses one definition of the egress contract.** `NOMINATIM_BASE` and `USER_AGENT` should be
  **exported** from `nominatim-client.ts` and imported by the script. Two definitions of the
  User-Agent is how a policy obligation quietly stops being met. (A two-line source change; declare
  it in the brief.)
- **Spacing ≥ 1100 ms**, sequential, no concurrency, plus the §4.3 guards: refuse under `CI`,
  require `ALLOW_LIVE_NOMINATIM=1`, refuse if `http://localhost:3001/health` answers.
- **Writes:** the response body pretty-printed for reviewable diffs, plus a manifest row carrying
  `capturedAt`, the exact request URL, `httpStatus`, `source: "captured"`, and the **sha256 of the
  raw bytes before reformatting**.

### 5.6 Keeping fixtures honest — the actual QUAL-22 fix

A recorded fixture is only better than a mock if it is genuinely recorded. Three mechanisms, in
increasing order of how much they are worth:

1. **Hash check (a speed bump).** A CI test asserts every file in `responses/` has a manifest row and
   that its content matches the recorded `sha256`. Editing a fixture by hand to make a test pass now
   requires also recomputing the hash — which is a deliberate act visible in the diff, not an
   accident. Be honest about what this is: it stops drift and carelessness, not a determined author.
2. **Synthetic quarantine (the useful one).** Some cases genuinely cannot be recorded: a 429, a 500,
   a truncated body, a malformed `lat`. Those are legitimate and necessary tests. They live in
   `responses/synthetic/` with `source: "synthetic"` and a **required `reason`**. The point is not
   prohibition — it is that *"how much of this suite rests on invention?"* becomes answerable by
   counting files. That is the durable answer to QUAL-22: invention is bounded and visible rather
   than banned and therefore hidden.
3. **Frontend fixtures are derived, never authored.** The frontend calls `/api/geocode`, not
   Nominatim. Its fixtures should be **generated by running the recorded Nominatim responses through
   the real proxy handler** and capturing the output. One recorded truth, two consumers, and
   `AddPlaceFlow`'s tests stop encoding a second independent set of assumptions about candidate
   shape — which is exactly what BUG-71's frontend half did.

### 5.7 D6 — drift detection that CI does not depend on

The requirement is a genuine tension: we want to know when Nominatim's answers change, and we must
never let a free third-party service decide whether a PR is green.

**`npm run fixtures:nominatim:drift` — on demand, from the devcontainer, never a CI gate.**

- Re-issues every entry in `requests.json` under the same §4.3 guards and spacing.
- **Compares a semantic projection, not bytes.** Byte-diffing would be permanent noise —
  `place_id` and `importance` change constantly and mean nothing to us. The projection, per result:
  `class`, `type`, `name`, `address.country_code`, `address['ISO3166-2-lvl4']`, lat/lon rounded to
  3 dp (~110 m), plus the **result count** and the **ordering**. Count and order are in because both
  are load-bearing: count feeds truncation detection (§6.4) and order feeds `candidates[0]`.
- **Output is a report, not an exit code that blocks anything.** A drift finding means *"re-record and
  re-examine what we assumed"*, which is human work.
- **Named triggers, so "on demand" is not a euphemism for "never":** before dispatching any brief
  that touches the geocoder path; after a UAT round that reports a wrong or missing city; and when
  the GE-17 S2/S3 decision is re-taken (§6).

**Why not a scheduled GitHub Action.** Two reasons, the second the stronger. Volume is not the
problem — ~50 requests a month is trivially compliant. But a runner's egress IP is shared with all of
GitHub Actions, which is exactly the sort of source a public geocoder rate-limits aggressively and
indiscriminately; our compliant traffic would be indistinguishable from someone else's abuse. And
scheduled jobs that fail for third-party reasons train people to ignore red. If drift turns out to be
frequent enough that on-demand is genuinely insufficient, a `workflow_dispatch`-only Action is the
next step — not a `schedule:` one.

### 5.8 What this design does **not** fix

Stated up front so it is not oversold, in the same spirit as D-21's own scope limit:

- **Not the environment-parity class.** BUG-55 (Nominatim CSP-blocked in production) would have been
  caught by none of this — it is a topology difference and QUAL-18's job.
- **Not "the geocoder returns the right thing".** Fixtures prove our *code* handles recorded inputs
  correctly. They cannot prove the service answers correctly for an input nobody recorded. That
  distinction is load-bearing for §6.
- **Not the coverage tail.** §7 measures it; nothing here fixes it.

---

## 6. D8 — does allowlist + fixtures weaken the case for the bundled gazetteer (GE-17)?

**Yes, materially. Not fatally — but the arguments that survive are not the ones it is being sold
on, and one of the surviving-looking ones rests on a premise this brief found to be false.**

### 6.1 Scorecard

| GE-17's argument | Status after this ADL |
|---|---|
| **"Works offline"** | **Dead.** Already withdrawn by the PO/COO in BRD v3.15 on three independent probes (no service worker, no PWA manifest, no client-side city cache) |
| **"The primary path can't be tested"** | **Dismantled.** §5 makes it testable, offline, deterministically, at a fraction of the cost. And the stated *reason* it is untestable turns out to be inaccurate (§6.2) |
| **"Ambiguity completeness"** | **Substantially weakened.** Its premise is false for two of three call sites, and most of the residual gap is closable by three one-line changes (§6.3, §6.4) |
| **Coverage tail** | **Untouched here — and it does not say what it is being read as saying** (§6.5). This is the finding the PO most needs |
| *Provider independence (ENV-02 class)* | **Survives intact.** Not addressed by anything in this ADL |
| *Shorter pending-retry queue* | **Survives intact.** A bundled city is born `resolved` |
| *Common-case latency / Turso rows-read* | **Survives** (measured in the QUAL-25 spike) |

### 6.2 A premise in BRD v3.15's own GE-17 entry does not hold up

BRD v3.15 states the primary path *"is not [testable in CI] today because the devcontainer firewall
blocks the geocoder."* The devcontainer firewall does block the geocoder — §2.1 confirms it six ways.
But **the devcontainer firewall has nothing to do with CI.** CI runs on GitHub-hosted
`ubuntu-latest` runners; the reason `ci.yml` sets `GEOCODING_ENABLED: false` is ADL-10's policy
discipline — *do not hammer a donated free service from an automated build* — which is a correct
decision made for a completely different reason.

`ci.yml:76` carries the comment *"CI firewall doesn't allow Nominatim (ADL-10)"*, which conflates the
two environments, and that conflation appears to have propagated into the BRD.

> **UNVERIFIED — I cannot probe a GitHub Actions runner's egress from here, and I have not.** What I
> can state is positive evidence pointing the other way: the `test-e2e` job runs
> `npx playwright install --with-deps chromium`, which downloads browser binaries from Playwright's
> own CDN — neither GitHub nor npm — and `npm ci` reaches the npm registry. So the runner demonstrably
> reaches at least two non-GitHub hosts. **Blind spot:** that is evidence of *broad* egress, not proof
> of *unrestricted* egress. The honest claim is that the ci.yml comment is **unsupported**, not that
> it is disproved. **I deliberately did not "correct" the comment on this branch** — editing it would
> be exactly the single-probe upgrade the negative-findings rule forbids. It needs one probe from a
> runner (a `curl` step against Nominatim in a scratch workflow) and then a same-PR fix.

Either way the conclusion is unaffected: **recorded fixtures make the primary path CI-testable with
no egress at all**, which is strictly better than live-calling, and it needs no dataset.

### 6.3 "Ambiguity completeness" — the premise is false for two of the three call sites

The COO's read, which I was asked to test rather than accept:

> *the geocoder is queried at `limit=10` globally, so the code cannot distinguish "there is one
> Springfield" from "there are 21 and I got 10, thinned to 1"*

**The "globally" half is false for two of three call sites.** Read directly:

| Call site | Query | Constrained? |
|---|---|---|
| `geocoding.service.ts:185` (`resolveCityName` — resolve-then-create, `POST /api/cities`) | `q`, **`countrycodes`**, `limit=10` | **Yes** — country-constrained |
| `geocoding.service.ts:250` (`resolveCity` — the retry queue) | `q`, **`countrycodes`**, `limit=10` | **Yes** — country-constrained |
| `routes/geocode.ts:50` (the proxy) | `q`, `limit=10`, `countrycodes` **only if the caller sent `country_code`** | **Conditionally** |

And the caller that matters does not send it: `useCities.ts:42` builds
`new URLSearchParams({ q: cityName })` — nothing else. That is the **discovery** call, and it is
unconstrained *by necessity*, because its entire job is to find out which country the city is in
(`GeocodeQuerySchema` documents exactly this: *"Absent for the GE-15 country auto-populate discovery
case"*).

So the true statement is narrower and much more actionable: **exactly one path — discovery — is
globally unconstrained at `limit=10`, and that is the path BUG-71 travelled.** The resolve paths
already have the constraint that D-19 was going to add.

### 6.4 Three one-line changes, and what they actually buy

**(A) Record the raw pre-filter result count.** `nominatim-client.ts:136-143` computes
`data.map(parseCandidate).filter(...)` and **discards `data.length`**. Without it, truncation is
undetectable *even if the limit is raised* — you cannot tell "10 results, capped" from "10 results,
that is all there are". Add `rawCount: data.length` to the `'ok'` result and thread it to
`classifyCandidates`. ~5 lines, and it is the prerequisite for (B) meaning anything.

**(B) Raise `limit` on the country-constrained paths.** Within one country the candidate space for
even a pathological name is far smaller than globally. Combined with (A), `rawCount < limit` becomes
a **positive determination that the candidate set is complete** — which is precisely the predicate
GE-15's amended wording needs and which BRD v3.14's own caveat says is unsatisfiable today:

> *"GE-15's amended wording is not yet fully satisfiable, because the current geocoder path cannot
> reliably distinguish 'clear single choice' from 'ambiguous but truncated to one survivor'…
> GE-17 is what makes it satisfiable, since a complete local set can count its own candidates."*

That caveat is the load-bearing sentence connecting GE-15 to GE-17, and (A)+(B) partly falsify it.

> **UNVERIFIED, and the whole of (B) depends on it:** Nominatim's documented maximum for `limit`.
> I could not check it — the host is unreachable from here (§2.1) and this container has no web
> access. If the cap turns out to be 10, (B) evaporates entirely and the ambiguity argument for
> GE-17 re-strengthens considerably. **§7.2 is designed to measure it** as a by-product of the
> BUG-76 probe, at zero extra cost.
> **Second unverified item in the same family:** Nominatim applies de-duplication, and if dedupe runs
> *after* the limit then `rawCount < limit` does **not** strictly imply completeness — it would be a
> strong heuristic rather than a proof. §7.2's `limit=10` / `40` / `50` triplet over a
> known-many-results name measures both at once.

**(C) Pass the trip's declared countries on the discovery path.** `trip_countries` already exists as
a set; Nominatim's `countrycodes` accepts a comma-separated list. `countrycodes=gb,fr` on the
discovery call removes the global candidate pool that produced BUG-71. This *is* D-19, and it is
worth noting that ADL-48 §6.9 characterised D-19 against a gazetteer as collapsing to *"a single
`ORDER BY` clause"* — against the geocoder it collapses to a single query parameter, and it does
strictly more than reorder, because it changes what comes back rather than how it is sorted.

**What survives all three, and it is real:**
1. Truncation *at* the cap remains uncertain — Nominatim returns no total-match count.
2. A trip with **no declared countries** leaves discovery global.
3. A local table can `SELECT COUNT(*)` and be **certain**. Certainty versus a strong heuristic is a
   genuine difference.

**Net:** the gap narrows from *"cannot distinguish at all"* to *"can distinguish in the common case,
with a known and enumerable uncertain band."* That is a large reduction in the strength of the
argument, and it costs perhaps half a day against a multi-stage dataset build. **It should be tried
before it is used as the deciding argument** — which is the recommendation, not a claim that it
settles the question.

### 6.5 The finding the PO most needs — the tail places are not in the gazetteer either

ADL-48 §2, in its own words:

> *"of 16 Scottish places probed, Glasgow / Edinburgh / Inverness / Ullapool / Aviemore / Portree /
> Tarbert are present in both candidate datasets, but **Plockton, Applecross, Shieldaig, Lochinver,
> Durness, Kyleakin, Gairloch, Dornie and Braemar are absent from both**"*

"Both" means both **candidate gazetteer datasets** — `cities.json` and `all-the-cities`. So under
GE-17 as designed, those nine places resolve **only** through the geocoder, which ADL-48 explicitly
retains "for the tail". Everything on this thread has since been discussed as though the gazetteer
covers the flagship Scottish trip. **It does not, and ADL-48 never claimed it did.** GE-17's coverage
benefit is about the ~170,540 *common* cities; the tail is the geocoder's job under both
architectures.

Three consequences, and they reorder the priorities:

1. **BUG-76 is the highest-value item on this entire thread.** If our own `SETTLEMENT_TYPES` filter is
   discarding these places, fixing it is the only change under discussion that makes Plockton work —
   and it is a one-line set-widening that needs no dataset, no migration and no firewall entry in
   production.
2. **If the probe shows Nominatim genuinely lacks them, GE-17 does not rescue that** — neither path
   has them, and the honest answer becomes a different one entirely (a user-supplied fallback, an
   OSM-derived extract, or accepting a no-pin record for the tail). That is a *bigger* decision than
   S2/S3, and ADL-48 §15.1 already flags it as gating the whole tail strategy.
3. **Either way the probe must run before S2/S3 is re-decided.** It is ~60 seconds of egress.

### 6.6 Recommendation — sequence, do not re-litigate

Do **not** read this as "cancel GE-17". Provider independence, queue depth and common-case coverage
survive untouched, and the QUAL-25 spike's GO verdict was earned against real measurements. Read it
as: **the arguments currently carrying the decision are not the ones that survive scrutiny, so the
decision should be re-taken on the ones that do — after a cheap wave that costs about a day.**

| Step | Work | Answers |
|---|---|---|
| **W1** | Apply §3.5, rebuild the container | Unblocks everything below |
| **W2** | Run §7's BUG-76 probe (~60 s of egress) | Is the tail gap ours or Nominatim's? What is the `limit` cap? Does `rawCount < limit` imply completeness? |
| **W3** | Widen/tier `SETTLEMENT_TYPES` per §7.4; land §6.4 (A)+(B) | Does the common case get *measurably* less ambiguous without a dataset? |
| **W4** | Land §5's fixtures, recorded during W2 | Closes QUAL-22's class; makes the geocoder path CI-testable |
| **W5** | **Re-take the GE-17 S2/S3 decision** | Now with measurements instead of estimates |

W2 and W3 are P2-sized. W5 is the PO's, and this ADL takes no position on its outcome — only on the
evidence it should be taken with.

**"Approved in principle" is not a reason to soften any of the above**, and this ADL deliberately does
not soften it. It is also not a reason to *reverse* anything: three of GE-17's benefits are
untouched by this document, and the recommendation is to sequence, not to cancel.

---

## 7. D7 — the BUG-76 probe, specified precisely

### 7.1 What the probe is testing, and the false pass it must avoid

`nominatim-client.ts:81` defines
`SETTLEMENT_TYPES = new Set(['city','town','village','hamlet','municipality'])`, applied at line 141
as `c.type == null || SETTLEMENT_TYPES.has(c.type)`. Two properties of that predicate matter:

- **`class` is ignored entirely.** A `class=boundary, type=administrative` result is discarded; a
  hypothetical `class=natural, type=hamlet` would be kept.
- **A missing `type` passes.** `c.type == null` is permissive.

**The false pass, stated as the brief requires:** a probe that asks *"does the geocoder return a
result for Plockton?"* and gets a non-empty answer proves nothing, because the question is whether
the result **survives our filter**. Equally, a probe that calls `nominatimSearch()` is testing
through the very filter under investigation and can only ever report post-filter output. **The probe
must issue raw HTTP and read the raw array.**

A third false pass, less obvious: name-matching alone. "Braemar" exists in Australia; "Tarbert" exists
several times in Scotland alone. The probe must check `address.country_code === 'gb'` and record
`display_name`, not merely that a result carries the name.

### 7.2 The request matrix

**Tail names (10)** — the exact set ADL-48 §2 found absent from both datasets, plus Torridon:
Plockton · Applecross · Shieldaig · Lochinver · Durness · Kyleakin · Gairloch · Dornie · Braemar ·
Torridon

**Control names (7)** — present in both datasets per ADL-48 §2:
Glasgow · Edinburgh · Inverness · Ullapool · Aviemore · Portree · Tarbert

Controls are not decoration. They establish that the probe apparatus works, and they give a baseline
for what a normally-typed Scottish settlement looks like in this response shape — without which
"Plockton came back as `type=locality`" is uninterpretable.

**Three variants per name:**

| Variant | Query | Reproduces / measures |
|---|---|---|
| V1 | `q=<name>&limit=10` | The **discovery** path exactly (`useCities.ts:42` → `geocode.ts:50`) |
| V2 | `q=<name>&countrycodes=gb&limit=10` | The **resolve** path exactly (`geocoding.service.ts:185`, `:250`) |
| V3 | `q=<name>&countrycodes=gb&limit=40` | §6.4(B) — does a higher limit change the answer? |

17 names × 3 = **51 requests at ≥1100 ms ≈ 56 seconds.** Comfortably inside acceptable use for a
one-off characterisation; nowhere near "bulk geocoding".

**Plus a four-request completeness probe** on a deliberately many-result name — `Springfield` with
`countrycodes=us` at `limit=10`, `20`, `40`, `50`. This answers both §6.4's unverified items for the
cost of four requests: the cap is whatever `limit=50` actually returns, and comparing the `limit=20`
result set against the first 20 of `limit=40` shows whether de-duplication is applied before or after
the limit. **If it turns out `limit` caps at 10, §6.4(B) is dead and §6.3's conclusion weakens
sharply** — which is exactly why it is measured rather than assumed.

**Every one of these 55 responses is a fixture.** The probe and the §5.5 capture are the same run;
`requests.json` starts as this matrix. That is the whole design paying for itself.

### 7.3 What to record per result

Per name and variant: HTTP status, **raw result count**, and for **every** result in the raw array
(not just the first): `class`, `type`, `name`, `display_name`, `address.country_code`,
`address['ISO3166-2-lvl4']`, `lat`/`lon`, `osm_type`, and a computed
`survivesSettlementFilter: boolean` applying the current predicate exactly.

Output a table. The table is the deliverable; the fixtures are the durable artefact.

### 7.4 Decision table — what each outcome means and what it implies

| Observation for a tail name | Reading | Implication |
|---|---|---|
| Present, `class=place`, `type` **∈** `SETTLEMENT_TYPES` | Works today. Neither a coverage gap nor a filter defect | BUG-76 does not fire for this name. GE-17's coverage argument is **weakened for this name** — the geocoder already has it |
| Present, `class=place`, `type` **∉** the set (`locality`, `isolated_dwelling`, `suburb`, `neighbourhood`, `quarter`, `borough`, …) | **BUG-76 CONFIRMED.** We are discarding a real settlement | **Widen the filter** — accept the observed types, scoped to `class=place`. Ours to fix, cheap, no dataset, no firewall entry in production |
| Present **only** as `class=boundary, type=administrative` | Ambiguous. The name exists as a civil boundary, not a settlement node | **Do not widen blindly.** Tier it: accept `boundary/administrative` **only when no `class=place` result exists** for the query. A parish boundary is a defensible fallback; it is a poor first choice, and its coordinates are a polygon centroid |
| Present only as a natural feature (`class=natural`, `place=island`, `place=peninsula`) — Applecross and Torridon are the likely candidates | Not a settlement result | **Do not widen.** Widening to `natural` would let "Ben Nevis" become a city. This name's gap is real |
| **Absent** at V3 (country-constrained, `limit=40`) | **Genuine coverage gap in Nominatim itself** | ADL-48 §15.1's gating item **fires**. Note §6.5: the gazetteer lacks it too, so *neither* path covers it and the tail strategy must be re-taken |

**Aggregate reading over the 10 tail names — say this plainly in the report:**

- **≥7 present-but-mistyped** → the tail problem was substantially **ours**. Widening the filter is
  the fix; GE-17's coverage argument shrinks accordingly.
- **≥7 genuinely absent** → the coverage tail is real and **thin under both architectures** (§6.5).
  ADL-48's decision G6 must be re-taken, and the answer is neither "gazetteer" nor "geocoder".
- **Mixed** (the likeliest outcome) → widen the filter for what widening reaches, and the residual
  becomes an **enumerable list of named places** rather than an open question. That alone is worth
  the 60 seconds: an enumerable gap can be closed by hand.

### 7.5 What the probe explicitly does **not** establish

> **UNVERIFIED and unverifiable from this container — every statement in §7.4 about what Nominatim
> will return is a decision *rule*, not a prediction.** The host is unreachable here (§2.1, six
> probes). I have deliberately not guessed at OSM's typing of any specific place. **Blind spot:** OSM
> tagging varies per feature and per mapper; the `type` values enumerated in §7.4 row 2 are the
> plausible ones to look for, not a claim about what will come back. The probe exists precisely
> because nobody can answer this by reasoning.

---

## 8. Implementation implications

**COO / PO:**
1. Approve or decline §3.5's diff. It is quoted, not applied — `.devcontainer/init-firewall.sh` is
   untouched on this branch.
2. On approval: apply the diff, rebuild the container, run §3.5's three verification commands.
3. **Reopen ENV-01** (§1.1) — its "accepted, no fix needed" resolution is what let an environment
   constraint start deciding product architecture.
4. **Re-sequence per §6.6 (W1–W5) before re-taking the GE-17 S2/S3 decision.** This is the ADL's
   substantive ask.
5. Decide MapTiler explicitly (§3.4 recommends defer). If the map-assertion want is real, track the
   local-test-style approach as a QUAL item.
6. `ci.yml:76`'s comment needs one probe from a runner before it is corrected (§6.2) — do not
   "fix" it on inference.

**Backend brief (BUG-76 + §6.4), after the rebuild:**
- Run §7's probe; publish the §7.3 table; commit the 55 fixtures.
- Widen or tier `SETTLEMENT_TYPES` per §7.4. **`class`-aware, not a flat set** if row 3 fires.
- Land §6.4 (A) `rawCount` and (B) the raised limit — (B) only if §7.2's cap measurement supports it.
- Export `NOMINATIM_BASE` and `USER_AGENT` (§5.5); widen the User-Agent to carry a contact URL (§4.1)
  — **declare it, it is an egress-behaviour change.**
- **Security checklist:** no new routes, no new user-data columns, no auth surface touched.
  `/api/geocode` keeps its global `requireAuth` and reads no user data.

**QA brief (§5), can run in parallel:**
- `tests/fixtures/nominatim/` scaffold, the replay double, the setup-file wiring, the hash check and
  the synthetic quarantine.
- `fixtures:nominatim:drift` with the §5.7 projection and the §4.3 guards.
- **Do not mock `nominatimSearch`** — that is the QUAL-22 error. The seam is `fetch`.

**Paths cited in this document, all verified to exist on this branch:**
`.devcontainer/init-firewall.sh` · `.github/workflows/ci.yml` · `playwright.config.ts` ·
`vitest.config.backend.ts` · `src/backend/services/nominatim-client.ts` ·
`src/backend/services/geocoding.service.ts` · `src/backend/routes/geocode.ts` ·
`src/backend/validation/geocode.schemas.ts` · `src/backend/server.ts` ·
`src/frontend/hooks/useCities.ts` · `src/frontend/components/Map/MapView.tsx` ·
`src/frontend/components/TripDetail/AddPlaceFlow.tsx` ·
`src/backend/routes/__tests__/cities.f1f2-ruling.test.ts` ·
`jobs/architect/tech/ADL-48-bundled-gazetteer.md` ·
`jobs/architect/tech/20260307-architecture-decisions-log.md` · `data/vendor/README.md`
(Paths named as *to be created* — `tests/fixtures/nominatim/`,
`scripts/capture-nominatim-fixtures.mjs` — do not exist yet and are labelled as proposals.)

---

## 9. Findings I disproved before filing, and my two weakest points

### 9.1 Killed before this document was written

- **"IPv6 bypasses the firewall entirely."** I found the script is IPv4-only with no `ip6tables`
  rules and both hosts publish AAAA records — which looked like a serious pre-existing hole. It is
  not: three probes (§2.3) show the container has no global IPv6 address, no IPv6 route, and no IPv6
  connectivity against an IPv4 control that works. Would have been an alarming and wrong headline.
- **"All three call sites query globally."** The COO's framing, inherited from D-19. Reading the
  three call sites showed two already pass `countrycodes` (§6.3). Correcting this made §6's
  conclusion *stronger*, which is the uncomfortable direction and therefore the trustworthy one.
- **"MapTiler unblocks BUG-49 and BUG-34."** Both are already fixed (§3.4(b)). I nearly wrote the
  MapTiler section around unblocking them before reading their tracker entries.
- **"Nominatim is Cloudflare-fronted like Turso, so ADL-33 §7's rotation caveat bites equally."**
  It is Fastly anycast with one stable address (§2.2) — a materially weaker caveat, and saying so
  runs against the more cautious story I started writing.
- **"CI can't reach Nominatim."** Repeated in `ci.yml` and inherited into the BRD. I could not
  disprove it from here, so it is marked UNVERIFIED with its blind spot (§6.2) rather than asserted
  either way — and I did not edit the comment.

### 9.2 My two weakest points, named for the OP-27 review

**Weakness 1 — the entire §6.4/§7.4 quantification rests on unmeasured assumptions about a service I
cannot reach.** Nominatim's `limit` cap, whether de-duplication runs before or after the limit, and
OSM's typing of ten specific Scottish places are all unverifiable from this container. I have marked
each and designed §7.2 to measure them — but a reviewer should treat *"GE-17's ambiguity argument is
substantially weakened"* as **conditional on the probe**, not established. **If the cap turns out to
be 10, §6.4(B) is dead and §6.3's conclusion weakens considerably** (§6.5's coverage finding survives
regardless, since it is read from ADL-48's own text). Attack this first: re-read §6.4's chain of
inference and check whether §6.1's scorecard over-claims relative to what §7 can actually return.

**Weakness 2 — "the browser runs on the host" is the load-bearing premise of the MapTiler
deferral, and I inferred it rather than observed it.** I did not watch a MapTiler request succeed
from the PO's browser while the container was blocked. If the PO drives a container-side browser, or
if a future in-container preview is adopted, D2 inverts. Related and also soft: I assert a local
MapLibre style would be sufficient to assert what map tests need, **without having read what those
tests would need to assert** — BUG-49's fix is about MapLibre layer *paint order*, which a
tile-less style may or may not exercise faithfully. Do not let §3.4's alternative be adopted on my
say-so.

**A third, offered because self-named weaknesses are hypotheses rather than confessions** (the
ADL-48 review's own method note): the place I would attack if I were reviewing is **§5.6's honesty
mechanisms**. I claim recorded fixtures close QUAL-22's class where mocks cannot. But the hash check
is a speed bump by my own admission, `requests.json` is only reviewed if someone reviews it, and the
synthetic quarantine's value depends entirely on the `reason` field being written honestly. It is
plausible that the *real* mechanism is none of the three, and is simply that a recorded fixture is
**large and weird-looking** in a way an invented one is not — a 40-field Nominatim response with a
`boundingbox` and an `importance` of `0.31527` is expensive to fake convincingly. If that is the
actual load-bearing property, §5.6's mechanisms are theatre around it and should be simplified rather
than elaborated.

---

# 10. AMENDMENT (2026-08-04) — the complete ENV-01 host enumeration

**Author:** Architect · **Brief:** GitHub issue #393 · **Branch:** `chore/env01-allowlist-enumeration`
**Tracker:** ENV-01 (P2, reopened) · D-06 · D-21 · QUAL-20 · BUG-76
**Class:** environment/tooling. Not a product defect. Nothing under `src/` changes and
`.devcontainer/init-firewall.sh` is untouched on this branch.

## 10.0 Why §3 was not enough, and what this section adds

§3 answered *"should we allowlist Nominatim?"*. It did not answer *"what is the complete set of
external hosts this project needs and cannot reach?"* — and that is the question ENV-01's class keeps
re-asking. It has surfaced **four times in one session**: the geocoder (§3), the deployed staging
domain (D-06), the QUAL-20 Playwright trace, and MapTiler (D-21). Each was handled as a one-off.

This section enumerates the set from sources, decides each host, and consolidates the whole change
into **one** quoted diff (§10.7).

**It is not "allowlist everything," and the shape of the answer is the evidence for that.** Of
sixteen candidate hosts assessed, **three are added** and **eleven are excluded with stated reasons**;
two more are recorded as already-reachable. The single most-requested item on the list — GitHub
Actions artifact storage — is refused, and refused on a *technical* finding rather than a risk
judgement: it cannot be expressed in this script at all (§10.5).

**Adopted from §3 as-is, not re-derived** (per the brief): §3.1 (Nominatim is the whole surface),
§3.3 (the script's resolution/failure/idempotence mechanics), and §3.2's exclusion discipline. I did
re-run §3.3's mechanics against the live file and they hold; §10.5.2 adds one property of the
`while read -r ip` loop that §3.3 did not need to consider.

## 10.1 The probe apparatus, and the trap that invalidates the obvious probe

Everything below was probed from inside the devcontainer on **2026-08-04**, from the worktree
`/workspace/.claude/worktrees/agent-af551979e1405714d` (confirmed by `pwd` and
`git rev-parse --show-toplevel` before anything else ran).

**The trap, stated first because it disqualifies the probe most people would reach for.**
`init-firewall.sh:52-53` allows **UDP/53 in both directions before lockdown**, and it must — the
script's own `dig` calls at line 153 depend on it. So **DNS resolution succeeds for every host on
the internet, blocked or not.** A successful `dig` is not evidence of reachability and is not used
as one anywhere in this section. Where `dig` appears below it is doing a different job: mapping the
*address space the script would pin*, which is exactly what line 153 does.

**Probe A — a real TCP/TLS connection attempt**, with two controls run in the same pass:

| Control | Result | What it rules out |
|---|---|---|
| `api.github.com/zen` | `HTTP=200`, connect 0.119 s | A broken resolver, a dead network, a broken `curl` |
| `registry.npmjs.org` | `HTTP=200`, connect 0.061 s | Second allowlisted host, same second |
| `example.com` | `curl (7)` after **45 ms** | Confirms the lockdown is live *now*, not just in the file |

The **timing** is a second, independent signal and it is worth naming: a blocked host fails in tens
of milliseconds per address, because `iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited`
(line 84) returns an ICMP error immediately. A *dead upstream* black-holes and times out. So
"fails in 45 ms" and "fails after 8 s" mean different things, and every failure recorded below is
the fast kind. (Multi-address hosts fail proportionally slower — `api.maptiler.com` takes 3.2 s
because `curl` tries all five A records in turn. That is still fast-per-address.)

**Probe B — reading the allowlist configuration**, which fails differently by construction: a wrong
assumption about the network cannot also make a `grep` miss. Run against **both** copies, because
they are not the same file and could diverge:

- `/workspace/.claude/worktrees/agent-af551979e1405714d/.devcontainer/init-firewall.sh` (repo)
- `/usr/local/bin/init-firewall.sh` (the copy `postStartCommand` actually runs)

`diff` reports them **identical** on this branch. That check is itself load-bearing — §3.5's own
verification block greps the running copy for a reason, and an amendment that assumed they matched
without looking would be repeating the mistake this ADL keeps documenting.

**Probe C, where available — running the actual operation** (`gh run download`, `gh api …/logs`).
This is the strongest probe of the three because it exercises the real code path with the real
credential, and it is what turned the artifact question from a guess into §10.5.

**What I could not do:** `ipset list allowed-domains` requires root and `sudo` is restricted to
`init-firewall.sh` only (`/etc/sudoers.d/node-firewall`). So I could not read the live ipset
directly. Probe B reads the script that *builds* it, which is a strictly weaker statement — noted
here rather than glossed, and it is the main blind spot shared by every row in §10.3.

## 10.2 Sources enumerated — so the list is derived, not recalled

| Source | Command / file | What it contributed |
|---|---|---|
| Host literals in code | `grep -rEohI` for TLD-anchored domains over `src`, `scripts`, `.github`, `.devcontainer`, `e2e`, `tests`, `package.json`, `playwright*.config.ts` | `nominatim.openstreetmap.org`, `api.maptiler.com`, `img.clerk.com`, `backboard.railway.com`, `travel-tracker-staging.up.railway.app`, the Turso hosts, `just-raptor-89.clerk.accounts.dev` |
| The app's own CSP | `src/backend/server.ts:114-139` | The definitive list of what the *browser* fetches: `*.maptiler.com`, `img.clerk.com`, `CLERK_ORIGIN`. Note it is a **wildcard** for MapTiler — §10.6 |
| Env template | `.env.example` | `CLERK_JWKS_URI`, `CLERK_ISSUER`, `VITE_MAPTILER_KEY`, Turso URL shape. No host not already found |
| Railway variable set | Railway API, staging env, service `travel-tracker` | 22 variable **names** (values redacted — an OAuth-app token returns names only, so no secret was read or is reproduced here). Confirms the external-service set is exactly Clerk + Turso + MapTiler; introduces no new host |
| Deployed domains | Railway API, both environments | **Authoritative:** staging `travel-tracker-staging.up.railway.app`, production `travel-tracker-production-241f.up.railway.app`, both `targetPort 8080`, **no custom domains in either environment.** This closes the app-domain enumeration rather than assuming the two known names are all of them |
| CI egress paths | `.github/workflows/{ci,security,post-deploy-shakedown}.yml` | Playwright browser install, artifact upload, gitleaks release download, the `semgrep/semgrep` container image. All **runner-side**, see the scope note below |
| `gh` API surfaces | `gh run download`, `gh api …/runs/<id>/logs`, `gh api …/jobs/<id>/logs` | §10.5 — the artifact blob pool, and the D13 defect |
| Tooling image build | `.devcontainer/Dockerfile` | Playwright browser binaries are fetched at **image build time**, before any firewall exists — §10.3 row 14 |
| Standing requests | `jobs/COO/open-dialogues.md` D-06, D-21; `_project/tracker.json` ENV-01, QUAL-20 | The four occurrences, and QUAL-20's specific artifact need |

**Scope boundary, stated because it is easy to blur.** This table is about the **devcontainer's**
egress. GitHub Actions runners have their own, separate posture which this container cannot probe —
§6.2 already marks the `ci.yml:76` claim about it `UNVERIFIED` and that is unchanged. Rows about
CI-side hosts (the gitleaks release, the semgrep image, the Playwright CDN in CI) are listed only to
show they were considered and are **out of scope**, not to claim anything about a runner.

## 10.3 The host table

Legend — **Decision:** `ADD` (proposed for §10.7's diff) · `KEEP` (already allowlisted, no change) ·
`EXCLUDE` (assessed and deliberately left out) · `PO OPTION` (recommendation is exclude, but the
call is the PO's and the diff line is supplied).
**Evidence:** `A` = connection attempt, `B` = allowlist config read (both copies), `C` = ran the real
operation, `D` = address-space characterisation, **`E` = tested against the allowlisted *address
space*, not only against the host's own name** (added 2026-08-04, amendment 2).

> **PROBE CLASS `E` — added because A and B were not independent, and the review was right (F4).**
> §10.1 claimed A and B *"fail differently by construction"*. They do not. Once D17 is known — this
> allowlist matches IPs, not hostnames — **both probes share one assumption: that hostnames are the
> unit of reachability.** A resolves the host by its own name; B greps for that name. A single wrong
> assumption produces both results, which is exactly what the negative-findings rule prohibits, and
> the document derived the invalidating fact two sections later without connecting it.
>
> **What B actually establishes is "this name is not explicitly listed" — not "unreachable".** Class
> `E` is what answers the question the column claims to answer: resolve the host, identify its CDN,
> and check whether any allowlisted entry shares that CDN's edge. It costs one `dig` per host.
>
> **`Blocked today` is therefore split below into two columns**, because they are different facts:
> *by name* (what A and B measured) and *effectively* (what `E` measures). Three rows differ.

### Proposed additions

| # | Host | What needs it | Blocked today? (evidence) | Risk of allowing | Decision | Reason |
|---|---|---|---|---|---|---|
| 1 | `nominatim.openstreetmap.org` | The app's own runtime geocoder (`nominatim-client.ts:31`); BUG-76's probe; §5's fixture capture | **Yes.** A: `curl (7)` in 57 ms. B: 0 occurrences in either copy. (§2.1 records four further probes) | Low. Fastly anycast, one A record (§2.2). Carries **usage-policy obligations** that are not optional — §4.3 | **ADD** | Unchanged from D1. The one host here that is app runtime rather than agent diagnostics |
| 2 | `travel-tracker-staging.up.railway.app` | Reading the deployed staging build the PO is actually judging: served HTML/JS, `/health`, response headers, CSP | **Yes.** A: `curl (7)` in 64 ms. B: 0 occurrences of the host *or* of `up.railway.app` in either copy | Low, and lower than it looks. An **anonymous GET to a public page** — no credential is granted, and the API stays behind Clerk. See §10.4.1 for the honest version, including what it *does* widen | **ADD** | §10.4.1. D-06's fourth occurrence; the PO's whole verification loop lives here |
| 3 | `travel-tracker-production-241f.up.railway.app` | Verifying a promotion actually served the promoted build | **Yes.** A: `curl (7)` in 62 ms. B: 0 occurrences | Low, same shape as row 2. Prod-specific consideration in §10.4.2 | **ADD** (second, separable) | §10.4.2. The container **already** holds read-only SELECT on the production Turso DB (ADL-33 §2) — refusing the public website while granting the production database is not a coherent boundary |

### Deliberately excluded — the substance of this table

| # | Host | What would need it | Blocked **by name** (A+B) | Blocked **effectively** (probe `E`) | Decision | Reason |
|---|---|---|---|---|---|---|
| 4 | `productionresultssa<N>.blob.core.windows.net` | Downloading the QUAL-20 Playwright trace; any `gh run download` | **Yes.** C: `gh run download` → `dial tcp 20.209.227.33:443: connect: no route to host`. B: 0 occurrences | **Yes.** Azure Storage; no allowlisted entry shares those scale units | **EXCLUDE — refused on cost** | **CORRECTED (amendment 2).** It *is* expressible — via the CIDR path at line 126, not a hostname. Priced and refused: **2,709× widening.** §10.5.2 |
| 5 | GitHub meta's `.actions` key (script uses `.web + .api + .git` only) | Reaching row 4 by CIDR | n/a — B: `(.web + .api + .git)[]` at line 126 | n/a | **EXCLUDE — refused on cost** | **CORRECTED (amendment 2). My original reason here was false and unprobed:** I wrote *"it would not reach row 4 anyway — Azure blob storage is not in GitHub's meta ranges at all"*. It **is** in `.actions` — `20.209.227.33` ∈ `20.209.226.0/23`. Verified. Real reason: **10,300 → 27,901,673 addresses** |
| 6 | `pipelines.actions.githubusercontent.com` | Nothing in this container | **Yes.** A: `curl (7)` after 2.3 s. D: `13.107.42.16` via `l-msedge.net` | **Yes.** Microsoft edge; not in `.web/.api/.git` and no allowlisted neighbour | **EXCLUDE** | Probed only to explain *why* row 4's neighbours differ. No consumer |
| 7 | `api.maptiler.com` | In-container Playwright map assertions | Yes. A: `curl (7)` after 3.2 s. B: 0 occurrences | **NO — reachable today.** Cloudflare-proxied; pinned to `104.16.5.34` (a `registry.npmjs.org` address) it returns **HTTP 301**. Verified §10.8 | **PO OPTION** (recommend exclude — **now more strongly**) | §10.6. The entry would grant **almost nothing it does not already have**, while making a nominal exclusion look like a decision. F1 strengthens the deferral |
| 8 | `*.tile.openstreetmap.org` | Nothing — this app renders MapTiler vector tiles via MapLibre | Yes. A: `curl (7)` in 45 ms. B: 0 occurrences | **Yes today — but NO the moment D1 is applied.** `nominatim`, `tile`, `a/b/c.tile.openstreetmap.org` all resolve to **`151.101.21.91`**. Verified independently | **EXCLUDE as a rule, not as a control** | **CORRECTED (amendment 2), and it changes the diff.** Adding Nominatim makes the tile servers reachable as a side effect. The prohibition stands as a **repo rule**; §10.7's comment no longer claims it is enforced. §10.11.2 |
| 9 | `img.clerk.com` | Clerk avatar images — **in a browser** (`server.ts:130`, `imgSrc`) | Yes. A: `curl (7)` after 3.3 s. B: 0 occurrences | **NO — reachable today.** Cloudflare-proxied (`img-service-prod.clerk.dev.cdn.cloudflare.net`) | **EXCLUDE (nominal)** | Reason unchanged and still correct — no in-container consumer. But it is a *statement of no need*, not a control |
| 10 | `cdn.playwright.dev`, `playwright.azureedge.net` | `npx playwright install` **inside a running container** | **Yes.** A: `curl (7)` after 2.4 s / 3.3 s. B: 0 occurrences | **Yes.** Azure Front Door; no allowlisted neighbour | **EXCLUDE** | Browser binaries are baked at **image build time**, before any firewall exists. **The trap:** bumping `@playwright/test` needs a *rebuild*, not an in-container install — which fails here looking like a missing binary rather than a firewall block |
| 11 | `api.turso.tech` | Turso Platform/management API | **Yes.** A: `curl (7)` after 5.1 s. B: 0 occurrences | **YES — effective, and independently re-verified.** CloudFront (`api.turso.io` → `143.204.160.109`); pinned to the Cloudflare edge it **fails TLS handshake** | **EXCLUDE** | ADL-33 §2, **unchanged.** **This is the most important row in the table under §10.11's threat model** — it is the DB admin plane, the one host here where a write is catastrophic, and its exclusion actually holds |
| 12 | `api.clerk.com` | Clerk Backend API | Yes. A: `curl (7)` after 3.4 s. B: 0 occurrences | **NO — reachable today.** Cloudflare-proxied; the review measured `404` on `/` and **`401` on `/v1/users`** | **EXCLUDE (credential, not network)** | ADL-33 §4, **unchanged and — under §10.11 — the *correct* mechanism rather than a weakness.** The `401` is the control working: the host answers, and only the absent credential stands between this container and full user CRUD. See §10.11.3 |
| 13 | gitleaks GitHub release; `semgrep/semgrep` image | `security.yml` | n/a — runner-side | n/a | **OUT OF SCOPE** | Runs on a GitHub-hosted runner, not here. Listed so it is visibly considered, not silently missing |

### Already reachable — recorded so nobody "fixes" a non-problem

| # | Host | Status | Why it matters |
|---|---|---|---|
| 14 | `objects.githubusercontent.com`, `raw.githubusercontent.com`, `codeload.github.com` | **Reachable** (A: 404 / 301 / 301 — all connected) | Every one of them *looks* like it should be blocked, because none appears in the domain loop. They are covered by the meta CIDR aggregation at line 126 |
| 15 | `results-receiver.actions.githubusercontent.com` | **Reachable** (A: 404 — connected. D: `140.82.113.22`, a GitHub GLB address inside `.web`) | This is the whole of §10.5.3. Its sibling `pipelines.actions.githubusercontent.com` (row 6) is blocked — **`*.actions.githubusercontent.com` does not behave uniformly**, and assuming it does is how this gets mis-diagnosed |
| 16 | `vscode.blob.core.windows.net` | **Allowlisted** (line 146). D: `20.150.83.4`, scale unit `ams23prdstr11a` (Amsterdam) | The brief flagged this and was right to: it is `*.blob.core.windows.net` like row 4, and it **does not generalise** — different scale unit, different region, different IP. Its presence buys row 4 exactly nothing |

### Unchanged existing entries, with the reasons they carry

Recorded for completeness because this table's contract is *every* host carries a reason. Nothing
here is proposed for change.

| Host | Reason it is allowlisted |
|---|---|
| GitHub `.web + .api + .git` CIDRs | `git`, `gh`, the CI-log path. Bootstrapped at line 99 |
| `registry.npmjs.org` | `npm ci` / `npm install` |
| `api.anthropic.com` | Claude Code's own runtime |
| `sentry.io`, `statsig.com`, `marketplace.visualstudio.com`, `vscode.blob.core.windows.net`, `update.code.visualstudio.com` | Toolchain entries inherited from the upstream Anthropic devcontainer template — VS Code extension install/update and agent telemetry. **Not app-driven.** I am not proposing to remove them (out of scope, and removal is a different kind of change from addition), but a reader should know they are the one group here whose reason is "the template shipped it" |
| `just-raptor-89.clerk.accounts.dev` | Clerk JWKS + Frontend API — the app's auth runtime (`.env.example`, `CLERK_ISSUER`) |
| `travel-tracker-{prod,staging}-ryanv11.aws-us-west-2.turso.io` | ADL-33 §2 — read-only DB SELECT, per-database `--read-only` tokens |
| `backboard.railway.com` | ADL-33 §3 — deploy logs/status. Note the caveat there: no read-only Railway scope exists; the token is write-capable and "read-only" is behavioural |

## 10.4 D10/D11 — the two Railway app domains, assessed separately

### 10.4.1 Staging — ADOPT, and it should go in ahead of Nominatim

**This is the highest-value entry in the whole ADL, and §3 did not contain it.**

> **RE-BASED (2026-08-04, amendment 2) — the verdict is unchanged, the argument is not.** The
> original case led on the PO's current testing habit (*"im only testing on staging now via browser
> on my mac"*). The review (F7) is right that this is the wrong foundation, and its catch is sharp:
> **the same premise was doing opposite work in two sections.** §3.4(a) uses *"the PO's browser is on
> the host, outside the netns"* to argue **against** MapTiler — the firewall does not gate what the
> PO sees, so widening it buys nothing. §10.4.1 used the identical fact to argue **for** the Railway
> domains. Both hold only because the consumer differs — and once that is said out loud, **the PO
> quote stops supporting D10 at all. The PO can already see staging perfectly well; the entry does
> nothing for the PO.** An argument that evaporates the day the PO's habits change is not one to
> hang a firewall decision on. Re-based below on OP-32, which does not move.

**The need is entirely agent-side, and stating it that way makes it durable.** OP-32 is mandatory
and it is where this bites: **every defect must be classified regression / deployment-config / gap
before it is briefable, and getting the class wrong invalidates the entire brief.** A
deployment-class classification requires *observing the deployed artifact*. No agent in this
container can do that, so every deployment-class defect here is classified by proxy — which is
precisely the history the record already carries: D-06 (BRD-NF09 shakedown), BUG-59, and BUG-55,
which OP-32's own text names as the case that cost the project twice. That argument holds whether
the PO tests on staging, locally, or from a phone.

**The honest strength of the claim.** The original wording — *"nobody inside this container can
observe the surface the project is judged on"* — is too strong, and the review found the
counterexample in this repo: `post-deploy-shakedown.yml` defaults `SHAKEDOWN_BASE_URL` to the
staging domain and is `workflow_dispatch`-able with a `base_url` override, so an agent can dispatch
it and — **with D13's now-working run-log retrieval** — read the result. §10.4.2 credits exactly
that path when arguing prod needs the entry *less*, and did not credit it against staging. That was
inconsistent. The defensible claim is narrower and still strong: **no agent can observe staging
interactively or cheaply.** The shakedown path is one round-trip per question, minutes per answer,
and can only answer the five assertions someone already wrote — it is not a diagnostic instrument.

The rest of the original case stands: the COO reads Railway deploy logs and Turso rows through the
ADL-33 path, which worked twice (D-06's own 2026-07-21 update records it). The metadata path is
often sufficient — but it is a different question from *"what is the deployed document actually
serving"*, which is what D-06 was raised about and what neither Railway logs nor Turso rows answer.

**Four occurrences is the argument.** The BRD-NF09 shakedown (D-06, 2026-07-21), BUG-59 the same
day, QUAL-20's design (which had to be built as a GitHub Action *specifically because* of this
block — `post-deploy-shakedown.yml`'s header says so in its own words), and QUAL-20's unresolved
CSP classification now. A gap that has shaped a workflow decision is no longer a nuisance.

**What allowing it actually grants — stated at full strength, not minimised:**

- An **anonymous HTTP GET to a public web page.** Any person on the internet can already do this.
  The firewall is not what protects staging; Clerk is.
- It grants **no data access.** The API is behind `requireAuth` and the container holds no Clerk
  credential — ADL-33 §4 declined one and that is unchanged. `BYPASS_AUTH` is fatal under
  `NODE_ENV=production` (`server.ts:271-273`), and staging demonstrably runs `NODE_ENV=production`:
  it serves the frontend document from Express, which is gated on exactly that (`server.ts:86`,
  `SERVE_STATIC`), and the QUAL-20 shakedown's *"the app loads and returns a document"* and
  *"carries a Content-Security-Policy header"* checks both pass against it.
- It is **write-capable in principle** — nothing stops a `POST`. But without a token every write is
  a 401, and the container's existing Railway token (ADL-33 §3) is *already* write-capable against
  the same environment by Railway's own admission. The marginal reach is small.
- **The real widening, and it is not the app:** see §10.8. Pinning `69.46.46.75` grants that
  address, and whatever else answers on it becomes reachable by `Host` header. This is a genuine
  cost and it is not specific to staging; it is a property of every line in the list.
  **Smaller than I first stated (amendment 2):** the review found each Railway domain resolves to a
  *distinct single* address in `69.46.46.0/24` — staging `.75`, production `.14`, `up.railway.app`
  `.126`, `railway.com` `.46` — i.e. Railway appears to allocate per-domain edge addresses rather
  than pooling. Whether one such address serves other tenants by `Host` header is **UNVERIFIED and
  untestable from here while the address is blocked.** So the collision surface may be materially
  smaller than the CDN entries; I over-stated it, in the cautious direction.

> **AGAINST — WITHDRAWN (amendment 2), and this is the correction that matters most in §10.4.**
> The original ran: *"The container runs autonomous agents, and every entry widens what a
> misbehaving one can reach. If I thought this entry granted a data path I would refuse it."*
>
> **That argument was answering a question that was already lost.** §10.11's F1 shows the allowlist
> does not contain a deliberate actor at all — any Cloudflare-proxied origin is reachable today, with
> no firewall change. A "misbehaving agent" is not held back by this list; it never was. So the
> marginal containment cost of one more public web domain **rounds to zero**, and the honest position
> is that I was pricing this entry against a boundary that does not exist.
>
> Note the direction: this cuts *for* D10, which is why I am satisfied it is not motivated
> reasoning — the review found it, and it makes my own recommendation cheaper than I argued for it.

**What survives as the real argument against, and it is a governance one rather than a technical
one:** under §10.11's model, *"a case is made for any access required"*. The case here is OP-32,
and it is a good one. The clause that would refuse this entry is convenience, and this is not that.

**Verdict: ADOPT, first.** If the PO wants to take only one thing from this amendment, take this.

### 10.4.2 Production — ADOPT, separately, and second

Kept as its own decision at the COO's direction, and it deserves to be.

**For — restated as a SUBSET argument, not a consistency one (amendment 2).** I nominated this as my
own Weakness B and the review confirmed the diagnosis while correctly sizing it as smaller than I
feared. The original form was *"we already granted X, so refusing Y is incoherent"* — a **ratchet**,
which licenses every grant by reference to the last one and erodes chosen exclusions without ever
re-examining them. That shape is genuinely dangerous and I should not have used it.

**The valid form is a subset claim, and it needs no reference to precedent at all:** a read-only
SELECT against the production Turso database returns **user PII**; an anonymous GET of the
production website returns **what any stranger on the internet can already fetch**. The second is a
strict subset of the first on the axis that matters. That is sound on its own terms — *"already
granted"* was doing none of the logical work and all of the rhetorical work, and the sentence is
better without it. Under §10.11 the marginal cost is near zero anyway, so this argument no longer
has to carry weight it could not bear.

**Against, and it is why this is second rather than joint-first:**

- The need is **episodic**, not continuous. Prod is touched at promotion events, which are manual
  and COO-driven; staging is touched daily.
- **A path already exists.** `post-deploy-shakedown.yml` takes a `base_url` `workflow_dispatch`
  input, so prod can be shaken down from a runner today with no firewall change at all. That is a
  real alternative and it would be dishonest to omit it.
- Production is where an agent mistake is most expensive, and *"both databases hold disposable data
  today"* is a fact about today, not a design principle
  (memory: `feedback_dont_architect_for_current_user_base`).

**Verdict: ADOPT, but taking §10.4.1 alone is a defensible smaller change** and captures most of the
value. I am not going to pretend the prod entry is as load-bearing as the staging one; it is not.
If the PO wants to minimise the widening, drop the prod line from §10.7's diff — the diff is
written so that removing that one line leaves everything else valid.

**Carry ADL-33 §2's convention over verbatim:** prefer staging; hit production only when the
question is specifically about production.

## 10.5 D12/D13 — GitHub Actions artifacts, and a live defect found on the way

### 10.5.1 The finding

QUAL-20's tracker note says the Playwright trace *"is undownloadable from the devcontainer (Azure
blob storage is not in the firewall allowlist)"*, and treats that as an allowlist gap. It is not one.
**It is a host that cannot be put in this allowlist at all**, and that is a materially different
answer.

Probe C, the real operation:

```
$ gh run download 30866122831 --name shakedown-results
error downloading shakedown-results: Get "https://productionresultssa13.blob.core.windows.net/
  actions-results/…/artifacts/….zip?…": dial tcp 20.209.227.33:443: connect: no route to host
```

`no route to host` is the kernel surfacing the ICMP `admin-prohibited` from line 84 — the firewall,
unambiguously, not an outage.

**Then the part that decides it.** The host is not fixed. Reading the `302 Location` for ten
different artifacts returned **nine distinct hosts**:

```
sa13  sa5  sa17  sa4  sa7  sa16  sa18  sa11  sa17  sa1
```

And the namespace has no discoverable bound — every shard I tried resolves, up to and including
`productionresultssa50`. Characterising the address space behind them (probe D):

| Property | Measurement |
|---|---|
| Distinct shards observed in 10 artifact samples | 9 |
| Shards confirmed to exist | at least `sa1`–`sa20`, plus `sa24`, `sa30`, `sa40`, `sa50` — **no upper bound found** |
| Distinct Azure storage scale units behind 24 sampled shards | 7 (`blz25prdstrz09a`, `bl5prdstrz24a`, `bl5prdstrz25a`, `bn3prdstrz12a`, `bnz49prdstrz09a`, `bn9prdstrz04a`, `dub14prdstr24c`) |
| Distinct A records | ≥19, in four distinct `20.x`/`52.x`/`57.x` Azure blocks |
| Resolution path | `…blob.core.windows.net` → `blob.<unit>.store.core.windows.net` → **`blob.<unit>.trafficmanager.net`** |
| Regions implied | multiple — `dub14…` is Dublin, the rest are US |

### 10.5.2 Why this is refused — corrected (amendment 2)

> **CORRECTED (2026-08-04). This subsection was headed *"Why this cannot be an allowlist entry"* and
> that was wrong.** It can be. The OP-27 review (F3) found the mechanism, and it is one **this same
> script already implements**: line 126 aggregates GitHub meta CIDRs. Changing
> `(.web + .api + .git)[]` to `(.web + .api + .git + .actions)[]` reaches the blob pool, because the
> pool is inside `.actions`.
>
> **The three reasons below are not independent, and I claimed they were.** All three are downstream
> of one unstated assumption — *that the entry must be a hostname in the `for domain in \ …` loop*.
> A shared premise means they can all fall at once, which is exactly what happened. This is the
> project's own *"an argument **for** is an absence claim in disguise"* pattern, and I walked into it
> in a document whose whole subject is probing absences. Demoted to **three consequences of requiring
> a hostname entry** — they correctly kill the hostname route, which is what I set out to test.
>
> **A false sub-claim went with it.** §10.3 row 5 said *"Azure blob storage is not in GitHub's meta
> ranges at all"* — stated flatly, load-bearing for the headline, **and I ran no probe for it.** It
> is false. That is precisely the failure the negative-findings rule exists to catch, committed by
> the author of a section arguing for that rule. Corrected in row 5 and priced below.

**The verdict does not change — refuse — but the reason must.** I re-ran the pricing myself rather
than inherit it, and the review's arithmetic is slightly off in the direction that *understates* the
case:

| Set | CIDRs as published | After collapse | **Distinct addresses** |
|---|---|---|---|
| `.web + .api + .git` (today) | 92 | 58 | **10,300** |
| `.actions` (the alternative) | 5,658 | 3,944 | **27,901,673** |

The review priced this as *"~900×"*, comparing `.actions`' distinct total against `30,800` for the
current set. `30,800` is the **overlap-counted** sum: `.api` and `.git` largely repeat `.web`'s
ranges, and the ipset deduplicates (`ipset add --exist`). Like-for-like the container holds **10,300
distinct addresses today**, so the widening is **2,709×**, not 900×. The refusal is stronger than the
review stated it.

**Refuse it on that number.** A 2,709× widening of reachable address space — to a set whose declared
purpose is running arbitrary third-party workloads — in order to retrieve a test artifact. That is
not close, and it is a *risk* judgement rather than an impossibility, which matters: "impossible"
forecloses re-examination, while "expressible, priced at 27.9M addresses, refused" is a decision
someone with a different need can re-open and re-refuse in ten minutes.

**Three consequences of requiring a hostname entry** (retained — they kill the hostname route, which
remains the route anyone would reach for first):

1. **The hostname space is unbounded from our vantage point.** `init-firewall.sh` takes literal
   hostnames; it has no wildcard and cannot have one, because it resolves each name to A records
   at container start. Enumerating `sa1`…`sa50` would be a guess at a bound I could not establish,
   and GitHub can add shards at will.
2. **`trafficmanager.net` is Azure Traffic Manager** — a DNS-based global load balancer whose
   entire purpose is to hand out *different* endpoints over time. This is ADL-33 §7's rotation
   caveat in its most aggressive form: the addresses pinned at container start are not merely
   *likely* to drift, drifting is the mechanism's design intent. §3.3's "worst case, one host stays
   unreachable and says so loudly" does not hold here — the failure would be intermittent and
   silent, appearing days into a session.
3. **The shard is chosen at upload time and baked into the artifact record.** Retrying does not
   move it. So an entry covering some shards fails on the artifacts that landed elsewhere, at
   random, which is the worst available failure mode: a diagnostic tool that works most of the time.

**Superseded by the pricing above.** This paragraph originally read *"the only construction that
would genuinely work is allowlisting Azure IP blocks … Refused, and it is not close."* The instinct
was right and the conclusion survives — but the construction that works is **GitHub meta's `.actions`
CIDRs**, not hand-written Azure `/16`s, and it is narrower than I guessed while still being 2,709×
too wide. The refusal is on the measured number, not on the guess.

One mechanical note §3.3 did not need: the `while read -r ip` loop (lines 160-168) adds *every* A
record returned, and the `dig` answer for these hosts contains CNAME rows the `$4 == "A"` guard
correctly skips. So the loop would behave *correctly* here — it is not a parsing problem. The script
is fine; the target is wrong.

### 10.5.3 What to do instead — and this part already works

**Run-level logs are reachable and job-level logs are not.** That asymmetry is the answer, and it
was not obvious:

| Operation | Redirects to | Result |
|---|---|---|
| `gh api repos/{o}/{r}/actions/runs/{id}/logs` | `results-receiver.actions.githubusercontent.com` (GitHub-owned, `140.82.113.22`, inside `.web`) | **Works.** `HTTP=200`, 11,678-byte zip containing the full 47 KB job log |
| `gh api repos/{o}/{r}/actions/jobs/{id}/logs` | `productionresultssa<N>.blob.core.windows.net` | **Blocked** |
| `gh run download` | same blob pool | **Blocked** |

So, for the COO and every agent, the working command is:

```bash
# Full CI logs for a run, from inside the devcontainer. REFINED (amendment 2, review F10):
RUN_ID=<run-id>
gh api "repos/ryanv11/travel-tracker/actions/runs/$RUN_ID/logs" > "/tmp/runlogs-$RUN_ID.zip" \
  && unzip -o "/tmp/runlogs-$RUN_ID.zip" -d "/tmp/runlogs-$RUN_ID" \
  && grep -rn "<what you are looking for>" "/tmp/runlogs-$RUN_ID"
```

Two refinements over the form I first published, both from the review and both worth taking:

- **Check the exit code explicitly.** On failure `gh api` exits 1 but still writes ~138 bytes of JSON
  error body to stdout — so the original `gh api … > /tmp/runlogs.zip` produced a file named `.zip`
  that was not one. The `&&` chain above gates on `gh` rather than relying on `unzip` to notice.
  (It does fail *loud*, which is the property that matters and which the review verified: a
  nonexistent run exits **1** with `gh: Not Found (HTTP 404)` on stderr. It is not a second D13.)
- **Use a per-run directory.** A fixed `/tmp/runlogs` is overwritten across runs in one session and
  an agent can end up grepping a mixture of two.

> **UNVERIFIED — one thing neither of us probed.** `/runs/{id}/logs` is documented by GitHub to
> return the **latest attempt**, so diagnosing an earlier failing attempt of a re-run would need
> `/runs/{id}/attempts/{n}/logs`. **Blind spot:** no re-run was tested from this container; the only
> probes were the 404 case and a successful retrieval. Worth one probe before the CLAUDE.md edit lands.

**Verified end to end against QUAL-20's failing run.** The retrieved log contains the assertion, the
captured console text, and the stack — everything the tracker note needed except the `trace.zip`
itself:

```
Error: console/page errors on load:
 Note that 'script-src' was not explicitly set, so 'default-src' is used as a fallback.
```

**And that is the whole point.** QUAL-20's own tracker note already prescribes the right fix —
*"widen the capture in shakedown.spec.ts:47-49 to record all console args, msg.location() and the
violated directive, then re-run"*. That change puts the evidence into the **log**, which is already
reachable. The trace artifact was never the cheapest route to the answer; it was the route that
happened to be tried first. Same shape as §3.4's conclusion about MapTiler and QUAL-18's about CSP:
**fix the artefact so it can express the failure, rather than reaching further outside the
environment.**

### 10.5.4 D13 — the defect this uncovered, which is not about artifacts at all

**`gh run view <id> --log-failed` — the command CLAUDE.md instructs every agent to run when CI
fails — exits 0 and prints nothing from this container.**

Established by three probes that fail differently:

1. Two different failed runs (`30866122831`, `30863294212`): `exit=0`, **0 bytes on stdout, 0 bytes
   on stderr**, both times.
2. `gh run view --log` (the non-failed variant): same, `exit=0`, 0 bytes.
3. The underlying API call, run directly, names the cause instead of swallowing it:
   `gh api repos/…/actions/jobs/91858249898/logs` → `dial tcp 20.209.227.33:443: no route to host`.
   `gh`'s own subcommand discards that error; the raw API call does not.

This is **fail-open**, and it is the class the project already has a memory about
(`project_gate_script_failopen_audit.md`). An agent following CLAUDE.md's documented procedure sees
an empty result and a success exit code, and the natural reading of that is *"no failures in the
log"* — the opposite of the truth. It has presumably been silently degrading CI diagnosis for as
long as artifacts have been on this blob pool.

**Recommendation (COO action, not this ADL's to take):** replace `gh run view <run-id> --log-failed`
with §10.5.3's `gh api …/runs/<id>/logs` form, and raise a tracker entry. Deliberately **not** edited
here — those are shared records (OP-28) and outside the brief's scope.

> **UNDER-SCOPED BY AN ORDER OF MAGNITUDE — corrected (amendment 2, review F5).** I wrote this as a
> CLAUDE.md fix. `--log-failed` is instructed in **eleven** places: `CLAUDE.md:352`,
> `.claude/skills/coo-startup/SKILL.md:169`, and **eight role system prompts**
> (`jobs/{architect,backend,frontend,database,qa,docs,integrations,ux}/*-system-prompt.txt`), plus one
> historical reference in `open-dialogues.md` to leave alone. A role system prompt is read on *every*
> dispatch of that role, which arguably makes it more load-bearing here than CLAUDE.md — the reviewer
> noted it was told to run the command at the start of its own task, and so was I.
>
> **And there is a second fail-open in the same family that I did not look for.**
> `.claude/skills/coo-startup/SKILL.md:169` uses `--log-failed` in the **session-start audit for a
> red `main`**. Empty output plus exit 0 there means the COO's opening audit reports nothing to fix.
> That is D13's shape at a **gate** rather than a debugging step, and gates that fail open are a
> class this project already has a memory about. It is the more consequential of the two.
>
> **The COO is handling all eleven files separately; I have deliberately not touched any of them.**

> **UNVERIFIED — the scope of D13, stated so it is not over-read.** I established this for *this
> repository's* runs from *this* container. I did **not** establish when the behaviour started, nor
> whether `gh` behaves this way for all repositories, nor whether a newer `gh` reports the error
> properly. **Blind spot:** one `gh` version, one container, one repo, runs from the last week.
> The claim that stands is *"this command returns nothing here, and the reason is the blob block"* —
> not *"`gh run view --log-failed` is broken."*

## 10.6 D14 — MapTiler, with §3.4 re-checked rather than inherited

**§3.4(a) — now established.** PO-confirmed 2026-08-04 (§3.4's own stamp carries the quote). The
browser is host-side. Two independent supporting findings that do not depend on the PO's statement:
`devcontainer.json`'s `forwardPorts: [5173, 3001]` with `vite.config.ts` binding `0.0.0.0`; and
`src/e2e/map.spec.ts:14-20`, which filters `maptiler.com` and `ERR_ADDRESS_UNREACHABLE` from its
console assertions with the comment *"tile services unreachable in devcontainer"*. The E2E suite was
written knowing its browser is inside the netns and blocked — which is also a small, independent
confirmation that in-container Playwright *is* gated by this firewall, the other half of §3.4(a).

**§3.4(b) — re-verified, holds.** Read from the tracker on this branch: **BUG-34** `status: done`;
**BUG-49** `status: done_pending_uat`. Neither is an open defect awaiting a way to observe it.

**§3.4(c) — re-verified, holds, and one probe was stronger than §3.4 claimed.** `grep -rn MAPTILER
.github/` returns **nothing** (exit 1). `grep -rn 'secrets\.' .github/` returns exactly one hit, and
it is the word "secrets" in an English comment (`security.yml:55`, *"Scan for accidentally committed
secrets"*) — **not a `${{ secrets.* }}` reference anywhere in any workflow.** So the CI E2E build
requests `…style.json?key=undefined` and an allowlist entry would not change that.

**New finding, and it argues against the entry even for someone who wants it.** The app's own CSP
allows **`*.maptiler.com`** — a wildcard — in both `imgSrc` and `connectSrc` (`server.ts:130-133`),
while `MapView.tsx:26` names only `api.maptiler.com`. The wildcard is positive evidence that the
authors expected more than one MapTiler host: a MapLibre style document routinely references
sprites, glyphs and tile endpoints, which may or may not all live on `api.maptiler.com`.

> **UNVERIFIED, and it is the reason this row stays "recommend exclude" rather than becoming a
> cheap yes.** I could not read `https://api.maptiler.com/maps/streets-v2/style.json` to enumerate
> the hosts it references — the host is unreachable from here, which is the very thing under
> discussion, and this container has no other web access. **Probes run:** the CSP wildcard
> (`server.ts:130-133`) and the single literal in `MapView.tsx:26`. **Blind spot:** the style
> document's actual contents. **What follows:** adding `api.maptiler.com` alone may leave
> in-container maps still broken, in which case the entry buys nothing while widening the firewall
> — the worst combination available. If the PO wants MapTiler, the honest sequence is: add the one
> entry, rebuild, and **check whether tiles actually render** before concluding the question is
> closed.

**Recommendation unchanged: DEFER.** §3.4's closing position is carried up into §0's table (D14) as
the brief asked, so it is a visible PO option rather than prose: *the entry is cheap and safe to
add, (b) is an argument about value rather than risk, and this is a recommendation and not a veto.*
The diff line is supplied in §10.7 so the PO can take it without another Architect round.

## 10.7 The consolidated diff — QUOTED, NOT APPLIED

`.devcontainer/init-firewall.sh` is **unmodified on this branch** (`git status` clean of it; `diff`
against `/usr/local/bin/init-firewall.sh` reports identical). Applying it needs a container rebuild,
which is the PO's to take at a session boundary.

This **supersedes §3.5** and contains everything §3.5 had. Context verified against the live file at
lines 137–151.

**The diff was verified without being applied to the repo**, because a quoted diff nobody has tested
is just prose with syntax highlighting:

1. `git apply --check` against the worktree → **exit 0**, patch applies cleanly.
2. The patch was then applied to a **copy** of the file in a scratch directory outside the repo, and
   the result passed `bash -n` (**SYNTAX OK**) with the domain loop containing all fourteen entries
   in the intended order.
3. `.devcontainer/init-firewall.sh` in the repo is byte-identical to `/usr/local/bin/init-firewall.sh`
   after all of the above — **unmodified, as required**.

```diff
--- a/.devcontainer/init-firewall.sh
+++ b/.devcontainer/init-firewall.sh
@@ -137,15 +137,82 @@
 # no read-only credential exists for it, see ADL-33 §4). Note: Turso/Railway sit
 # behind a CDN that rotates edge IPs — this script pins IPs resolved at container
 # start, so intermittent reachability is possible within a long session (ADL-33 §7).
+#
+# ADL-49 §10 (2026-08-04, ENV-01) — three entries added below, in two categories.
+#
+# (a) nominatim.openstreetmap.org — the app's OWN RUNTIME geocoder
+#     (nominatim-client.ts:31), for local development and fixture capture. This is
+#     the first entry of that kind; every other host here is agent diagnostics.
+#     Two usage-policy obligations ride with it and are not optional: ~1 req/s from
+#     this single egress IP, and an identifying User-Agent. The in-process limiter
+#     does NOT span processes — read ADL-49 §4.3 before running any capture or
+#     probe script. Fastly anycast, one A record: materially less rotation-prone
+#     than the Turso/Railway entries above. If the geocoder stops working
+#     mid-session, restart the container before debugging the client.
+#
+#     SIDE EFFECT, STATED BECAUSE IT IS REAL: the OSM TILE servers share this exact
+#     Fastly anycast address — nominatim, tile., a/b/c.tile.openstreetmap.org all
+#     resolve to 151.101.21.91. This ipset holds ADDRESSES, so this entry makes the
+#     tile servers reachable too and no entry here can separate them. We do not use
+#     them (the app renders MapTiler vector tiles via MapLibre), their usage policy
+#     is STRICTER than Nominatim's, and nothing in this repo may call them. That is
+#     a repo RULE, not a control this file enforces — see ADL-49 §10.11.2.
+#
+# (b) travel-tracker-staging.up.railway.app
+#     travel-tracker-production-241f.up.railway.app
+#     The DEPLOYED APP's own public domains — read-only diagnostic GETs. Open
+#     dialogue D-06, raised 2026-07-21 and now on its fourth occurrence. The PO's
+#     entire verification loop is a host browser against staging, so nobody inside
+#     this container can observe the surface the PO is actually judging. These
+#     grant no credential: the API stays behind Clerk, and the container already
+#     holds read-only SELECT on BOTH Turso databases (ADL-33 §2) — granting the
+#     production database while refusing the public website would be incoherent.
+#     Prefer staging; hit production only when the question is specifically about
+#     production (ADL-33 §2's convention, carried over).
+#
+#     The "no credential" argument above has a STANDING CONDITION attached. It is
+#     recorded in ADL-33 §4 — the decision that declined Clerk access — because that
+#     is what someone provisioning a credential actually reads. It is NOT restated
+#     here: a condition filed only in a firewall script is a record, not a control.
+#
+# NOT ALLOWLISTED BY NAME, each with a reason (ADL-49 §10.3). READ THE CAVEAT BELOW
+# BEFORE TREATING ANY OF THESE AS BLOCKED — for Cloudflare-fronted hosts they are a
+# statement that no case has been made, NOT a control this file enforces:
+#   api.turso.tech    ADL-33 §2. CloudFront-fronted with no allowlisted neighbour,
+#                     so this exclusion is EFFECTIVE (verified). It is the DB admin
+#                     plane and the most important exclusion in this file.
+#   api.clerk.com     ADL-33 §4. Cloudflare-fronted: reachable today via the caveat
+#                     below, answering 401. The control here is the ABSENT
+#                     CREDENTIAL, not this list. That is deliberate, not a gap.
+#   img.clerk.com     no in-container consumer; browser-side avatars only.
+#   api.maptiler.com  ADL-49 §3.4/§10.6 — the firewall is not what blocks map
+#                     testing (PO-confirmed 2026-08-04). Also already reachable.
+#   productionresultssa*.blob.core.windows.net — GitHub Actions ARTIFACT storage.
+#                     Reachable only by widening the meta CIDRs at line 126 to
+#                     include '.actions': 10,300 -> 27,901,673 addresses, a 2,709x
+#                     widening. REFUSED ON THAT COST (ADL-49 §10.5.2). The run-LEVEL
+#                     logs API is already reachable — use it instead.
+#   GitHub meta '.actions' key — same refusal, same number.
+#
+# WHAT THIS FILE IS AND IS NOT (ADL-49 §10.8, measured not theorised): it matches IP
+# ADDRESSES, not hostnames — there is no SNI or Host inspection anywhere. So it is an
+# AVAILABILITY AND ACCIDENT CONTROL, not a containment boundary. Any CDN-fronted
+# origin sharing an address with an allowlisted host is reachable via SNI, and for
+# Cloudflare that is demonstrated: api.maptiler.com returns 301 when pinned to an
+# address registry.npmjs.org resolves to. Non-Cloudflare exclusions (CloudFront,
+# Azure) do hold. Do not read an absence from this list as unreachability.
 for domain in \
     "registry.npmjs.org" \
     "api.anthropic.com" \
     "sentry.io" \
     "statsig.com" \
     "marketplace.visualstudio.com" \
     "vscode.blob.core.windows.net" \
     "update.code.visualstudio.com" \
     "just-raptor-89.clerk.accounts.dev" \
+    "nominatim.openstreetmap.org" \
+    "travel-tracker-staging.up.railway.app" \
+    "travel-tracker-production-241f.up.railway.app" \
     "travel-tracker-prod-ryanv11.aws-us-west-2.turso.io" \
     "travel-tracker-staging-ryanv11.aws-us-west-2.turso.io" \
     "backboard.railway.com"; do
```

**Three lines are independently removable**, and the diff is written so that dropping any one of
them leaves the rest valid. That is deliberate — it lets the PO take a narrower change without
another Architect round:

- Drop `travel-tracker-production-241f.up.railway.app` → §10.4.2's smaller option.
- Drop both Railway lines → §3.5's original scope.
- **If the PO wants MapTiler** (§10.6 recommends against; it is the PO's call): add
  `    "api.maptiler.com" \` immediately after the Nominatim line, and delete the
  `api.maptiler.com` row from the "STILL DELIBERATELY EXCLUDED" comment block.

### 10.7.1 Post-rebuild verification — §3.5's three commands, extended

Run in this order. The first four are new or changed; the last is §3.5's and is the one people skip.

```bash
# 1. The RUNNING copy carries the change, not just the repo copy.
grep -nE 'nominatim|up\.railway\.app' /usr/local/bin/init-firewall.sh

# 2. Nothing failed to resolve at container start.
#    (Check the startup output for the "FIREWALL WARNING: N item(s)" block — absent is correct.)

# 3. The three new hosts answer.
curl -sS -o /dev/null -w 'nominatim %{http_code}\n' \
  'https://nominatim.openstreetmap.org/search?q=glasgow&format=json&limit=1'   # expect 200
curl -sS -o /dev/null -w 'staging  %{http_code}\n' \
  https://travel-tracker-staging.up.railway.app/health                          # expect 200
curl -sS -o /dev/null -w 'prod     %{http_code}\n' \
  https://travel-tracker-production-241f.up.railway.app/health                  # expect 200

# 4. The exclusions still hold — a positive test that the change was ADDITIVE.
curl -sS -o /dev/null -w 'maptiler %{http_code}\n' https://api.maptiler.com/    # expect failure
curl -sS -o /dev/null -w 'turso-mgmt %{http_code}\n' https://api.turso.tech/    # expect failure

# 5. The lockdown itself still holds.
curl -sS -o /dev/null -w 'example  %{http_code}\n' https://example.com          # expect failure
```

Step 4 is the one this amendment adds and it is the one that matters most for review: it converts
"we added three hosts" from an assertion into a measurement, by checking that the hosts we
*declined* are still declined.

## 10.8 D17 — the property that prices every line in this list

Worth stating plainly because it is not obvious from reading the script, it applies to entries that
were approved long before this ADL, and it is the honest unit of "what does one line cost".

**`init-firewall.sh` builds an `ipset` of IP addresses and matches on destination address
(lines 83, 160-168). It does not filter by hostname or SNI.** Adding a host therefore grants:

> every service reachable at the addresses that host resolved to *at container start*.

For a dedicated-IP host that is one service. For a CDN-fronted host it is not:

| Entry | Pins | What else is plausibly on those addresses |
|---|---|---|
| `nominatim.openstreetmap.org` | `151.101.21.91` | A Fastly anycast address — shared edge, many tenants |
| `api.maptiler.com` (if added) | five `104.17.24x.40` | Cloudflare shared edge |
| `travel-tracker-staging.up.railway.app` | `69.46.46.75` | Railway's edge — other Railway-hosted apps answering on the same address |
| `travel-tracker-production-241f.up.railway.app` | `69.46.46.14` | as above, a different edge address |
| the Turso and Railway entries (ADL-33) | — | already subject to exactly this, which §7's rotation caveat gestures at without naming |

> **WITHDRAWN (2026-08-04, amendment 2 — §10.11).** The sentence that stood here was:
> *"This does not change any verdict in §10.3, and I want to be clear about why rather than let it
> sound like a hedge. Reaching another tenant's service at a shared edge address requires knowing
> what to ask for and sending the right `Host`/SNI, and yields whatever that tenant serves publicly.
> It is a real widening and a small one."*
>
> **It is false, and the OP-27 review (F1) demonstrated it live rather than argued it.** It does
> change verdicts in §10.3 — rows 7, 9 and 12 describe hosts this container can reach *today*. I
> wrote it as a reassurance immediately after discovering the fact that invalidates it, which is the
> review's central diagnosis of this whole section and it is correct: **a correct discovery whose
> consequences were not propagated backwards.** The replacement is below; the propagation is §10.11.

**What replaces it.** This allowlist is an **availability and accident control, not a containment
boundary.** It stops an agent reaching a host *by name*, and it stops casual or accidental egress.
It does **not** stop deliberate egress to any CDN-fronted origin that shares an address with an
allowlisted host — and for Cloudflare that is now measured, not theoretical.

Confirmed independently on this branch (four requests, no volume), because a claim that re-prices
the whole section should not be inherited:

| Request | Result |
|---|---|
| `api.maptiler.com` direct, by its own name | `curl (7)` after 3.2 s — **blocked** |
| `api.maptiler.com` pinned to `104.16.5.34` (an address `registry.npmjs.org` resolves to) | **HTTP 301** — reachable |
| `api.turso.tech` direct | `curl (7)` after 5.1 s — blocked |
| `api.turso.tech` pinned to the same Cloudflare edge — **negative control** | **TLS handshake failure** (`curl 35`) |

The negative control is the important half: this is *not* "everything is reachable". It is precisely
"every Cloudflare-proxied zone is reachable". `api.turso.tech` fronts on **CloudFront**
(`api.turso.io` → `143.204.160.109`) and no CloudFront address is in the ipset, so its exclusion is
**effective**. `api.clerk.com` and `img.clerk.com` are Cloudflare-proxied, so theirs are **nominal**.

**That distinction is computable per host, and §10.3 now records it** as probe class `E`. The useful
consequence is not that exclusions are worthless — it is that an `EXCLUDE` row states one of two
quite different things, and it must now say which.

**Sampling note, in the same spirit as §2.2.** The two Railway addresses were sampled five times
over ~20 seconds and were identical every time (`69.46.46.75`, `69.46.46.14`), each a **single** A
record — notably better than §7's caveat implies for a Railway host. **Blind spot: one resolver,
one vantage point, twenty seconds.** That establishes "this hostname does not hand out a rotating
pool per resolution"; it does **not** establish stability over weeks. If a Railway domain works
after the rebuild and then stops mid-session, that is §7's failure mode and the fix is a container
restart — the same runbook line §2.2 wrote for Nominatim, and it now covers three hosts.

**The durable fix, named but not proposed.** Per-hostname egress control needs an SNI-aware proxy
(or an `ipset` rebuilt continuously from DNS), not an IP allowlist.

> **RE-TAKEN (2026-08-04, amendment 2).** The original text closed *"not justified by this project
> today"*, and the review is right that I made that call without knowing the boundary was already
> void — an easy judgement to reach when you think the gap is small. **Re-taken knowingly, the
> answer is the same, but for a different and better reason:** under the threat model in §10.11 the
> boundary exists to prevent *changes*, and an SNI proxy buys almost nothing against that goal. The
> only write-capable Cloudflare-fronted API in scope is `api.clerk.com`, and it is already controlled
> by ADL-33 §4 at the credential — the layer that actually holds (§10.11.3). Building an SNI proxy to
> re-add a network layer under a credential control that is working would be effort spent on the
> wrong boundary.
>
> **What I am not doing is settling it in a footnote, which is what the review objected to.**
> Recommend the COO raise it as an open dialogue so the decision is on the record and re-openable —
> particularly if the exfiltration goal is ever brought in scope, which is the case where the answer
> flips (§10.11.4).

## 10.9 What I could not establish — the UNVERIFIED register

Collected in one place so a reviewer can attack them without hunting. Each is marked at its point
of use as well.

| # | Claim I did **not** establish | Probe I ran | Blind spot |
|---|---|---|---|
| 1 | That the live `ipset` matches what the script would build | Read both copies of `init-firewall.sh` and `diff`'d them | `ipset list` needs root; `sudo` here is restricted to `init-firewall.sh`. **REWRITTEN (amendment 2):** the original mitigation claimed *"probe A tests live kernel state, and it agrees with probe B in all 13 cases."* **That agreement was not corroboration** — A and B share a blind spot (F4), so they agreed because they were asking the same question, not because the answer was checked twice. Probe class `E` is what actually closes it |
| 2 | An upper bound on the `productionresultssa<N>` shard namespace | Sampled `sa1`–`sa20`, `sa24`, `sa30`, `sa40`, `sa50` — all resolve | I stopped at 50. The claim is "no bound found", **not** "there are exactly N". The decision does not depend on the bound: unbounded-or-large is the same answer |
| 3 | Which hosts `api.maptiler.com/maps/streets-v2/style.json` actually references | CSP wildcard `*.maptiler.com`; the single literal in `MapView.tsx:26` | The style document is unreadable from here. §10.6 |
| 4 | That `gh run view --log-failed` is broken generally | Two failed runs, plus the underlying API call naming the cause | One `gh` version, one container, one repo. §10.5.4's own stamp |
| 5 | Long-run stability of the Railway A records | 5 samples over ~20 s | One resolver, one minute. §10.8 |
| 6 | Anything about GitHub Actions **runner** egress | — | Unchanged from §6.2, which already marks `ci.yml:76`'s claim UNVERIFIED. I did not probe a runner and did not edit that comment |
| 7 | That the toolchain entries (`sentry.io`, `statsig.com`, the VS Code hosts) are still needed | Read them in the domain loop; traced them to the upstream devcontainer template | I did not test removing them. **RE-SCOPED (amendment 2) — the review is right that this entry was wearing the UNVERIFIED label to avoid the work (F8).** Under D17 it is not hygiene: **`registry.npmjs.org` is the source of the F1 bypass** (twelve Cloudflare edge addresses, pinned to support `npm ci`), and `sentry.io`/`statsig.com` are *telemetry egress* by function. A section titled "the complete enumeration" asked only *"what should go in?"* and never *"what is already in, and what does it cost?"* — sixteen candidates assessed, seven existing entries listed and not assessed. **Recommend the COO raise the removal review as its own tracked item** (§10.11.6) |

## 10.10 My weakest points, named for the OP-27 reviewer

> **REVIEWED (2026-08-04) — the OP-27 pass ran; see `20260804-ADL49-fresh-eyes-review.md` and
> §10.11. Retained unedited below as the record of what I predicted, because the gap between what I
> nominated and what was found is the useful artefact.**
>
> **The scoreboard is not flattering and should not be smoothed over.** I nominated Weakness B
> (§10.4.2's ratchet) as the thing to attack first. The reviewer confirmed the diagnosis, then
> correctly ranked it **below** four findings I did not anticipate at all — and observed that fixing
> it changes nothing. The real weakest point was **§10.8's closing sentence**, which I wrote as a
> reassurance immediately after discovering the fact that invalidates it, and then listed nowhere.
>
> **Weakness A deserves a specific note because it was half-right in an instructive way.** I worried
> the three ADDs were "the three someone asked for", and defended by pointing at the load-bearing
> exclusions. The reviewer's verdict: *"the self-check picked the right worry and validated it
> against the wrong evidence — the exclusions were counted, not tested."* That is exactly right. Two
> were already ineffective (F1), one becomes ineffective on application (F2), and the flagship
> refusal rested on a false statement (F3). Counting exclusions is not evidence of rigour;
> **probe class `E` exists because that is the test I should have run on my own defence.**
>
> All three ADD recommendations survived. The framework did not.

The reviewer covers §1–§9 as well as this amendment (ADL-49 has never had a fresh-eyes pass). §9.2's
three named weaknesses still stand except where §3.4's 2026-08-04 stamp closes the first half of
Weakness 2. Three more from this section, in the order I would attack them:

**Weakness A — I recommend ADD on three hosts and EXCLUDE on eleven, and the three I recommend are
the three someone asked for.** That is the pattern a rubber stamp produces, so it deserves the
scrutiny. My defence is that the exclusions are load-bearing rather than decorative — the single
most-requested item (artifact storage, which QUAL-20 needs *right now*) is refused, and refused with
a replacement that is better than the entry would have been. But **attack row 2 specifically**: the
staging entry is the one I argue hardest for, and §10.4.1's "it grants no data access" rests on the
container holding no Clerk credential *today*. If a Clerk credential is ever provisioned, that
sentence stops being true and this entry's risk profile changes. **I noticed this while writing the
weakness and closed it rather than only flagging it** — §10.7's comment block now carries a STANDING
CONDITION recording the dependency where a future reader will actually be looking. What a reviewer
should still test is whether the *rest* of §10.4.1's case survives without that sentence.

**Weakness B — §10.4.2's consistency argument is the weakest reasoning in this section, and it is
the kind that generalises badly.** *"We already granted X, so refusing Y is incoherent"* is a
ratchet: it makes every past grant an argument for the next one, and applied repeatedly it approves
everything. I believe it holds here on the specifics — an anonymous public GET really is less than
a production DB SELECT — but a reviewer should check whether I reached for the shape of the argument
because the specifics were thin. The prod entry has the weakest *need* case on this list; if
anything gets cut, cut it.

**Weakness C — I asserted the QUAL-20 CSP question is answerable from the run log, and I did not
answer it.** §10.5.3 shows the log is retrievable and contains the console text. It does **not**
contain `msg.location()` or the violated directive, because `shakedown.spec.ts:47-49` never captured
them. So my claim is precisely *"the transport is not the blocker; the capture is"* — which is what
QUAL-20's own tracker note already says. If a reviewer reads §10.5.3 as *"and therefore the CSP
question is now settled"*, that is an over-read of what I established, and the classification should
stay UNRESOLVED until the widened capture runs.

**And one thing I disproved before filing, recorded because the negative direction is the
trustworthy one.** I started writing §10.5 as *"allowlist the Actions blob host"* — it looked like a
one-line entry and the tracker note framed it that way. The shard sampling killed it. Had I
enumerated hosts from the tracker's description instead of running `gh run download` and reading the
redirect, this amendment would have shipped a firewall entry that worked roughly one time in nine
and would have been debugged as flake.

---

# 10.11 AMENDMENT 2 (2026-08-04) — the threat model, and re-pricing §10 against it

**Trigger:** the OP-27 fresh-eyes review (`jobs/architect/tech/20260804-ADL49-fresh-eyes-review.md`,
PR #395) plus a PO statement of the container's actual purpose that neither ADL-33 nor §10 had.
**Verdict on §10 as it stood:** the three ADD recommendations survive; the framework used to price
them did not. The review's diagnosis of the failure shape is correct and I adopt it verbatim:
**every problem it found is a correct discovery whose consequences were not propagated backwards.**

## 10.11.1 The threat model — stated, because §10 was priced against an assumed one

Neither ADL-33 nor §10 ever wrote down what this firewall is *for*. Both proceeded on an implied
model — roughly "reduce what a compromised agent can reach" — and §10.4.1 priced entries against it
explicitly (*"every entry widens what a misbehaving one can reach"*). The PO has now stated it:

> *"The purpose of the container is primarily to stop changes to sensitive information either on my
> machine or not. There have to be exceptions to this in order for this project to be effective and
> we restrict changes through API permissions. So it should be a least privilege model where a case
> is made for any access required."*

Three things follow, and they are not what §10 assumed:

1. **The boundary exists to prevent *changes* — writes — not reads.** Read reachability and
   exfiltration are explicitly not the primary goal.
2. **Writes are restricted through API permissions**, i.e. **at the credential**, not at the
   network. The network allowlist is a supporting control, not the mechanism.
3. **Least privilege by *justification*:** "a case is made for any access required." Access is
   granted per-host on argument, and an entry justified only by convenience should be refused.

## 10.11.2 What this does to F1 — genuinely lower severity, but *conditional*, not simply "low"

The review rated F1 **Critical**. That rating was reached without the threat model, which nobody had.
Re-priced against the model above, F1 is **low severity today — and the reason it is low is a
condition, not a property.** The distinction is the whole point and I do not want it read as a
downgrade-and-move-on:

- **F1 grants reads, and reads are out of scope.** Every Cloudflare-proxied origin is reachable, and
  none of that is a *change* to anything. Under the stated model this is not a breach of the
  boundary; it is outside what the boundary is for.
- **F1 grants no write capability anywhere, today.** The one write-capable API it exposes is
  `api.clerk.com`, which answers **`401`** — the host is reachable and the credential is absent.
- **So F1's real effect is that it removes the network layer for Cloudflare-fronted write APIs**,
  leaving the credential as the *sole* control rather than one of two. That is precisely the model's
  own design (writes are restricted at API permissions), so it is coherent rather than broken — but
  it means **the credential control now has no backstop**, which raises the importance of ADL-33 §4
  rather than lowering it. §10.11.3.
- **The exfiltration consequence, stated once so the trade is knowing rather than silent:** an agent
  in this container can read anything in the bind-mounted workspace — including `.env.local` — and
  reach an arbitrary Cloudflare-proxied receiver. The stated model puts that out of scope. I am not
  campaigning to bring it in; I am recording that it *is* the trade, because "a case is made for any
  access required" implies the PO wants to make these calls knowingly.

**Where I disagree with the review.** It concludes F1 *"demolishes the exclusion-discipline frame."*
It does not, and the threat model sharpens why. Exclusion discipline under this model is
**least-privilege-by-justification** — a governance mechanism — and that survives F1 completely.
What F1 kills is the narrower claim that an `EXCLUDE` row is a *kernel guarantee*. Those are
different things, and conflating them would throw away the part that works.

The honest repair is **per-row honesty about which kind of exclusion a row is**, which is computable
and is now recorded as probe class `E` in §10.3:

| Kind | Means | Examples |
|---|---|---|
| **Effective** | No allowlisted entry shares its CDN edge; the kernel does stop you | `api.turso.tech` (CloudFront), the Playwright CDNs, `pipelines.actions…`, the artifact blob pool |
| **Nominal** | Reachable today via a shared CDN edge; the row states that no case has been made and nothing here may use it | `api.clerk.com`, `img.clerk.com`, `api.maptiler.com` |
| **Rule-only** | Reachable *because of one of our own entries*; a repo rule, never a control | `*.tile.openstreetmap.org` after D1 (F2) |

**And the single most important fact in this table, under this threat model:** `api.turso.tech` —
the database **admin plane**, the one host in §10.3 where a write would be catastrophic and
irreversible — is CloudFront-fronted with no allowlisted neighbour, and its exclusion is
**effective**. I re-verified it independently (§10.8): pinned to the Cloudflare edge that reaches
MapTiler, it **fails at TLS handshake**. The exclusion that matters most is the one that holds. That
is a good outcome and it was invisible in the review's framing, which grouped all exclusions together.

**F2 under this model.** Adding Nominatim makes the OSM tile servers reachable (same Fastly address,
verified independently on this branch across five hostnames). No write is involved — the tile
servers are read-only — so under the stated model this is not a security matter at all. It remains
a **usage-policy** matter and a **documentation-honesty** matter, which is why the correction to
§10.7's comment block was still mandatory: the diff must not commit a false claim into the running
script. The prohibition survives as a repo rule, stated as one.

## 10.11.3 What this does to ADL-33 §4 — the reviewer read it as a weakness; it is the mechanism

The review treats ADL-33 §4's Clerk exclusion being credential-based rather than network-based as a
gap — *"there is only ever one boundary here, and it is the credential."* Under §10.11.1 that
sentence is **a description of the intended design**, not a finding against it. Writes are restricted
through API permissions; that is the stated model. ADL-33 §4 declined the credential, which is the
control the model actually calls for, and it is working — `api.clerk.com` answers `401`.

**The consequence is a promotion, not a downgrade.** Because F1 removes any network backstop, the
credential decision is now **load-bearing alone**. That makes the STANDING CONDITION more important
than when I wrote it, and the review is right (F6) that a comment inside an unapplied firewall diff
is the wrong home: the person provisioning a Clerk credential edits `.env.local`,
`.env.agent-diagnostics` or a Railway variable set, and will never read `init-firewall.sh`.

**Action taken:** the condition is removed from §10.7's diff comment and recorded in **ADL-33 §4**,
the decision someone re-opens when they want Clerk access. The diff comment now points at it rather
than restating it. The review independently verified the premise with three probes (no
`CLERK_SECRET_KEY`, no `sk_*` pattern, no `@clerk/backend` consumer), which matches my own reading.

## 10.11.4 Re-pricing the §0 decisions

| # | Verdict before | Verdict now | Confidence then → now | Why |
|---|---|---|---|---|
| D1 Nominatim | ADOPT | **ADOPT** | High → **High** | Unchanged. F2 adds a side effect to disclose, not a reason to refuse |
| D10 staging | ADOPT | **ADOPT** | High → **High** | Argument re-based on OP-32 (F7). F1 makes the containment objection moot, so it is *cheaper* than argued |
| D11 production | ADOPT, second | **ADOPT, second** | Medium-High → **High** | The ratchet is replaced by a subset argument that stands alone; F1 removes the marginal-cost objection. Still second on *need* |
| D12 artifacts | EXCLUDE — "cannot be expressed" | **EXCLUDE — refused at 2,709×** | High → **High** | Headline was false (F3). Verdict survives on a measured number I re-computed myself |
| D14 MapTiler | DEFER | **DEFER — more strongly** | High → **High** | It is already reachable (F1), so the entry grants almost nothing while making a nominal exclusion look decided |
| D17 IP-not-hostname | "does not change any verdict" | **Withdrawn and replaced** | High → **High (restated)** | The property was right; the reassurance attached to it was false |
| — | *(new)* | **D18: this list is an availability/accident control, not a containment boundary** | — → **High** | §10.8, measured |
| — | *(new)* | **D19: exclusions are `effective` / `nominal` / `rule-only`; rows must say which** | — → **High** | §10.11.2 |

**Nothing in §5 (replay fixtures), §6 (GE-17) or §7 (the BUG-76 probe) is touched by any of this.**
§6.5 — the tail places being absent from the gazetteer datasets too — remains the most important
finding in the document and the review explicitly did not disturb it.

## 10.11.5 What I got wrong, plainly

Four things, and the pattern connecting them is worth more than the list:

1. **§10.3 row 5 asserted an absence with no probe** — *"Azure blob storage is not in GitHub's meta
   ranges at all"* — and it is false. In a section whose method note lectures about two probes for
   negative claims. This is the one I mind.
2. **§10.5.2 called three reasons "independent" when they shared a premise.** The project has a
   memory for exactly this shape (*an argument **for** is an absence claim in disguise*); I cited
   neighbouring rules and missed this one.
3. **§10.8 derived D17 and then reassured the reader it changed nothing**, two sections after
   building an evidence column that D17 invalidates.
4. **§10.1's probe A / probe B were not independent** — both assume hostnames are the unit of
   reachability. The rule's own words are *"a single wrong assumption cannot produce both results"*.

**The pattern:** each is a *correct* finding whose consequences stop one step early. That is not
carelessness and it is not fixed by more care — it is what happens when a document grows by
amendment and each amendment is graded against its own brief rather than against the document it is
joining.

### 10.11.5.1 The structural fix, stated for lifting into CLAUDE.md

> **AN AMENDMENT MUST RE-WALK THE SECTIONS IT DID NOT INTEND TO CHANGE.**
>
> When an amendment establishes a new general fact — a mechanism, a constraint, a property of the
> system — that fact is retroactive. It applies to every claim the document already made, including
> the ones the amendment was not written to touch. **The amendment is not complete until those
> earlier claims have been re-checked against it**, and any that no longer hold are corrected or
> stamped in the same change.
>
> **The failure mode this prevents** is not a wrong answer; it is a *right* answer whose
> consequences stop one step early. It is invisible to ordinary review because every individual
> sentence was true when written, and it is systematically produced by the way amendments are
> graded — against the brief that commissioned them, rather than against the document they are
> joining.
>
> **Concretely, when an amendment establishes a new fact, ask three questions before filing:**
> 1. **Does it invalidate any earlier *verdict*?** (§10.8's D17 flipped three rows of §10.3 and I
>    wrote "this does not change any verdict".)
> 2. **Does it invalidate any earlier *method*?** (D17 also broke §10.1's claim that probes A and B
>    were independent — they share the assumption D17 disproves.)
> 3. **Does it invalidate any earlier *reason*, even where the verdict survives?** (D12's refusal
>    was right; its stated reason — "cannot be expressed" — was false, and a false reason
>    forecloses re-examination in a way a priced refusal does not.)
>
> **Reviewer-side corollary, since this is what caught it here:** an OP-27 fresh-eyes pass over an
> amended document should review the *document*, not the amendment. The reviewer of this ADL was
> given §1–§10 rather than §10 alone, and every one of F1–F4 lives in the seam between them.

Probe class `E` exists because that re-walk was not done here.

## 10.11.6 Follow-ups for the COO — new items, not ADL edits

1. **Raise the allowlist *removal* review as its own tracked item.** Under D17/D18 the **existing**
   entries, not the proposed ones, determine what a misbehaving agent can reach — `registry.npmjs.org`
   is the source of the bypass, and `sentry.io`/`statsig.com` are telemetry egress by function. I am
   **not** recommending removals: `npm` is obviously required, and I have not established that the VS
   Code or telemetry entries are unused (not probed, not claimed). The point is that the question has
   changed character and is currently unowned. Highest-leverage follow-up in this document.
2. **Record the SNI-proxy decision as an open dialogue**, per §10.8's re-take — so it is on the
   record and re-openable rather than settled in a footnote, particularly if exfiltration is ever
   brought in scope.
3. **`api.turso.tech` deserves an explicit standing note.** It is the one *effective* exclusion
   protecting a write-capable admin plane (§10.11.2). If Turso ever moves it behind Cloudflare, that
   exclusion silently becomes nominal with no change on our side and no signal. Worth a periodic
   re-probe rather than an assumption — one `dig` answers it.
4. **`gh run view --log-failed` is instructed in 11 places, not 2** (review F5), including eight role
   system prompts and — more seriously — `.claude/skills/coo-startup/SKILL.md:169`, where it is used
   in the **session-start audit for a red `main`**. A command that exits 0 with empty output at a
   *gate* reports nothing to fix. That is D13's shape one level up and it is the more consequential
   instance. **Per COO instruction I have not touched any of those files.**
5. **F9 — a live MapTiler key in a container that can now be shown to reach MapTiler.**
   `.env.local` carries `VITE_MAPTILER_KEY`. §3.4(c) establishes carefully that *CI* has no key and
   concludes an allowlist entry would not help CI — correct, and it never asks the *local* question.
   Combined with F1, an agent here can spend the PO's MapTiler quota today. Small, bounded by the
   key's own quota, out of scope under §10.11.1 (no *change* to sensitive information), and **not
   caused by this ADL** — recorded because §3.4(c) is where a reader would look for it.

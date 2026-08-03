# ADL-49 — Geocoder allowlist amendment to ADL-33, recorded-response replay fixtures, and a reassessment of GE-17's remaining case

**Date:** 2026-08-03
**Status:** **Decided — design only. No code, config or firewall change ships with this ADL.**
The `.devcontainer/init-firewall.sh` diff is quoted verbatim in §3.5 and is *not applied*; it needs a
container rebuild and is the COO's to take after PO approval.
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

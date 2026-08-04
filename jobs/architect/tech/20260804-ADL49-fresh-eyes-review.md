# ADL-49 — OP-27 fresh-eyes review (§1–§10)

**Date:** 2026-08-04 · **Reviewer:** Architect (second, fresh context — did not author ADL-49)
**Under review:** `jobs/architect/tech/ADL-49-geocoder-allowlist-and-replay-fixtures.md` as it stands on
**PR #394** (branch `chore/env01-allowlist-enumeration`), **§1–§10**. §1–§9 shipped in PR #376 and had
never had an OP-27 pass; §10 is new in #394. Both were in scope.
**Related:** issue #393 · ENV-01 · D-06 · D-21 · QUAL-20 · ADL-33 (parent) · ADL-34.
**Constraints honoured:** ADL-49 not edited. `.devcontainer/init-firewall.sh` untouched. Nothing under
`src/` changed. No scanner suppression added. No `git stash` used.

---

## 0. Verdict and summary table

**Verdict: DOES NOT STAND AS BRIEFABLE IN ITS CURRENT FORM — but narrowly, and none of the three ADD
recommendations is wrong.**

All three proposed additions (D1, D10, D11) survive review, and finding F1 makes two of them *cheaper*
than the document argues. What does not survive is the **framework the document uses to price them**.
§10.8 (D17) correctly discovers that the allowlist matches IPs rather than hostnames, then states
*"This does not change any verdict in §10.3."* That sentence is false, and I established it live rather
than by argument: two of §10.3's `EXCLUDE` rows describe hosts this container **can reach right now**,
and one further exclusion becomes unenforceable the moment D1's own diff is applied.

Three corrections are load-bearing and must land before anything downstream is dispatched: **F1**
(the containment property), **F2** (the OSM tile exclusion the diff would ship as a false comment),
and **F3** (D12's "cannot be expressed" headline, which rests on a stated fact that is wrong).

| # | Finding | Severity | Section attacked | Effect on verdict |
|---|---|---|---|---|
| **F1** | The IP allowlist is **already bypassable to Cloudflare-proxied destinations**, demonstrated live against 9 hosts including two the ADL records as excluded. §10.8's "does not change any verdict" is false | **Critical** | §10.8 / D17; §10.3 rows 7, 12 | Re-prices every entry. *Strengthens* D10/D11; demolishes the exclusion-discipline frame |
| **F2** | Adding `nominatim.openstreetmap.org` (D1) **makes the OSM tile servers reachable** — identical A record. §10.7's diff would commit a false exclusion statement into the script | **High** | §3.2, §10.3 row 8, §10.7 comment block | Diff comment must be reworded before application; OSM tile policy exposure is real |
| **F3** | D12's *"it cannot be expressed in this script at all"* is false. The disproving mechanism is one the ADL rules out with an unprobed, incorrect factual claim | **High** | §0 D12, §10.3 row 5, §10.5.2 | Verdict (refuse) survives; the **reason** must change from "impossible" to "refused on risk" |
| **F4** | Probe B (grep the script for a hostname) **cannot** establish "blocked" once D17 is known. The document derives D17 and never applies it back to its own evidence column | **High** | §10.3 evidence column; §10.1 | Methodological; F1 is the instance that proves it |
| **F5** | D13's remediation names **1 of 11** places `--log-failed` is instructed, and misses a second fail-open in `/coo-startup` | **Medium-High** | §10.5.4 | Recommendation is right and under-scoped |
| **F6** | The STANDING CONDITION is filed where nobody triggering it will look, and F1 removes the second layer it implicitly assumes | **Medium** | §10.7 comment; §10.10 Weakness A | Decorative as placed; premise itself verified true |
| **F7** | D10's headline argument is **this month's PO workflow**, and the PO is the one actor who does not need the entry | **Medium** | §0 D10, §10.4.1 | ADOPT stands; the argument must be re-based on OP-32 |
| **F8** | The enumeration is **additive-only**. D17 implies a removal review, which §10.9 entry 7 scopes out in a footnote — and those entries are the source of F1 | **Medium** | §10.9 entry 7; §10.3 "unchanged existing entries" | Highest-leverage follow-up, currently unowned |
| **F9** | `VITE_MAPTILER_KEY` is live in this container and MapTiler is reachable (F1). §3.4(c) reasons only about CI | **Low-Medium** | §3.4(c) | Small live exposure, unnoticed |
| **F10** | D13's replacement is fail-loud (verified) but the documented one-liner has two residual traps | **Low** | §10.5.3 | Refine the command, not the decision |

**On the author's self-assessment.** Weakness B (§10.4.2's ratchet argument) is correctly identified
as weak reasoning, and I confirm the diagnosis in §5 below — but it is **not** the weakest point in
the section, and fixing it changes nothing. The weakest point is §10.8's closing sentence, which the
author wrote as a reassurance immediately after discovering the fact that invalidates it. That is the
more common failure shape: not a bad argument, but a correct discovery whose consequences are
truncated one step too early.

---

## 1. F1 (Critical) — the allowlist's containment property is already void for Cloudflare-proxied hosts

### What the document says

§10.8 derives the right property from the script and states the cost honestly, then closes:

> *"**This does not change any verdict in §10.3**, and I want to be clear about why rather than let it
> sound like a hedge. Reaching another tenant's service at a shared edge address requires knowing what
> to ask for and sending the right `Host`/SNI, and yields whatever that tenant serves publicly. It is a
> real widening and a small one."*

### What I measured

The mechanism is exactly as §10.8 describes — `iptables -A OUTPUT -m set --match-set allowed-domains
dst -j ACCEPT` (`init-firewall.sh:83`) against an `ipset` of addresses (`:73`, `:160-168`). There is no
SNI or `Host` inspection anywhere in the file. So `curl --resolve <host>:443:<allowlisted-ip>` reaches
any origin the CDN at that address will serve.

`registry.npmjs.org` pins **twelve** Cloudflare edge addresses (`104.16.0.34` … `104.16.11.34`);
`just-raptor-89.clerk.accounts.dev` pins two more (`104.18.34.146`, `172.64.153.110`). Pinning any one
of them opens Cloudflare's proxied estate. Run from this container, this session:

| Host | Direct (by its own name) | Via allowlisted `104.16.0.34` | Via allowlisted `104.18.34.146` |
|---|---|---|---|
| `api.maptiler.com` — ADL-49 §10.3 **row 7, "Blocked today: Yes"** | `curl (7)` after 2.2 s | **301** (`location: https://docs.maptiler.com/cloud/api/`) | **301** |
| `api.clerk.com` — ADL-33 §4 / §10.3 **row 12, "Blocked today: Yes"** | `curl (7)` after 3.3 s | **404** (`/`), **401** (`/v1/users`) | **404** |
| `img.clerk.com` — §10.3 **row 9, EXCLUDE** | `curl (7)` after 3.3 s | **404** | **404** |
| `www.cloudflare.com` | — | **200** | **200** |
| `blog.cloudflare.com` | — | **200** | **200** |
| `discord.com` | — | **200** | **200** |
| `zoom.us` | — | **301** | **301** |
| `medium.com` | — | **403** | **403** |
| **`pypi.org` — negative control, Fastly not Cloudflare** | — | **TLS handshake failure** | **TLS handshake failure** |
| `example.com` — lockdown control | `curl (7)` in 240 ms | — | — |
| `api.turso.tech` — **CloudFront**, §10.3 row 11 | `curl (7)` after 5.1 s | **TLS handshake failure** | — |

The 301 from `api.maptiler.com` carries `server: cloudflare`, a `cf-ray` header and a `location` of
`https://docs.maptiler.com/cloud/api/` — MapTiler's own origin, not a CDN error page. Its real API
endpoint answers too: `GET /maps/streets-v2/style.json?key=invalid` → **403**, which is MapTiler
rejecting the key, i.e. the request reached the service. The `401` from `api.clerk.com/v1/users` is
Clerk's Backend API rejecting an unauthenticated caller — the host is reachable and only the missing
credential stands between this container and it.

The two negative controls matter as much as the positives: `pypi.org` (Fastly) and `api.turso.tech`
(CloudFront) both **fail** at TLS handshake through a Cloudflare edge. This is not "everything is
reachable". It is precisely "every Cloudflare-proxied zone is reachable", and both edge IPs behaved
identically, so it is a property of the CDN rather than of one address.

### Why this changes the document

1. **§10.3's `EXCLUDE` verdict is nominal, not effective, for every Cloudflare-fronted host.** Rows 7,
   9 and 12 are recorded as blocked with two probes each; all three are reachable. Row 12 is the
   security-load-bearing one: ADL-33 §4 declined Clerk access, and this document treats that as a
   network boundary reinforcing a credential boundary. **There is only ever one boundary here, and it
   is the credential.** The ADL says something adjacent to this in §10.4.1 — *"the credential, not the
   network, is the boundary"* — but deploys it as a reason the Railway entries are safe, not as a
   general statement that the network boundary does not exist for CDN-fronted hosts. It does not.
2. **The exfiltration frame the allowlist exists to serve is substantially void.** Cloudflare's free
   tier is self-service: an adversary — or a compromised agent — can put a receiver behind Cloudflare
   in minutes and reach it from this container today, with no firewall change. I did not exfiltrate
   anything and I do not control any of the zones above; the inference from "arbitrary Cloudflare
   zones answer" to "an adversary-provisionable receiver answers" is an inference, and I label it as
   one — but it follows from a demonstrated fact and a public signup page, not from speculation.
3. **It cuts *for* D10 and D11, which is why I am confident it is not motivated reasoning.** If
   arbitrary Cloudflare-proxied egress already exists, the marginal containment cost of two Railway
   app domains rounds to zero. The strongest objection to those entries — *"the container runs
   autonomous agents and every entry widens what a misbehaving one can reach"* (§10.4.1, "Against,
   honestly") — is answering a question that was already lost. **Adopt D10 and D11.** Just stop
   pricing them as though the allowlist were containing anything.

### What should replace §10.8's closing sentence

Not a hedge, and not a veto on the additions. Something like: *this allowlist is an availability and
accident control, not a containment boundary. It stops an agent reaching a host by name and stops
casual egress; it does not stop deliberate egress to any CDN-fronted origin sharing an address with
an allowlisted host, and for Cloudflare that is measured, not theoretical.* Every subsequent
"what does one line cost" answer follows from that, and D17's genuine insight is preserved rather
than truncated.

The durable fix §10.8 names — an SNI-aware egress proxy — is dismissed there as *"not justified by
this project today."* That judgement was made without knowing the boundary is already void. It should
be re-taken with F1 on the table. I am **not** recommending building it now; I am recommending the
decision be re-taken knowingly, and recorded as an open dialogue rather than settled in a footnote.

---

## 2. F2 (High) — D1 makes the OSM tile servers reachable, and the diff would say otherwise in writing

`nominatim.openstreetmap.org` and `tile.openstreetmap.org` are the **same address**:

```
nominatim.openstreetmap.org.   → dualstack.n.sni.global.fastly.net. → 151.101.21.91
tile.openstreetmap.org.        → dualstack.n.sni.global.fastly.net. → 151.101.21.91
a.tile.openstreetmap.org.      → dualstack.n.sni.global.fastly.net. → 151.101.21.91
```

Applying §10.7's diff adds `151.101.21.91` to the ipset. From that moment `tile.openstreetmap.org` is
reachable, because the ipset holds addresses and cannot distinguish the two names. Two independent
probes, failing differently: (i) the DNS identity above; (ii) the mechanism demonstrated live in F1 —
an `ipset` entry serves any SNI the CDN accepts at that address. Reading `init-firewall.sh:83` is a
third. I did **not** attempt a request to either OSM host: nominatim is not allowlisted yet so the test
is not available, and I would not issue speculative traffic at a donated service to prove a point the
mechanism already establishes.

This is not a pedantic point, for two reasons.

**It is a policy exposure, not just a doc error.** §3.2 excludes the tile servers with the reason
*"OSM's tile policy is separate from and stricter than Nominatim's"* — a correct and good reason.
After D1 the exclusion is unenforceable by this mechanism. The project would be one `curl` away from
a stricter policy it believes itself to be walled off from, and §4.3 already documents that
*"an agent with a terminal can still issue `curl` at whatever rate it likes once the host is
reachable."* That sentence was written about Nominatim. It now covers the tile servers too.

**The §10.7 diff would commit the false claim into the running script.** Its comment block reads:

```
#   *.tile.openstreetmap.org       unused by this app; separate, stricter policy.
```

filed under `STILL DELIBERATELY EXCLUDED`. A future reader greps the script, sees the tile servers
excluded, and is wrong. Under the project's own document-lifecycle rule, a change that falsifies a
statement must correct that statement in the same change — and this one falsifies a statement it is
itself adding.

**Required correction (small).** Move the tile servers out of `STILL DELIBERATELY EXCLUDED` and into a
sentence of the Nominatim paragraph, e.g.: *the OSM tile servers share this exact Fastly anycast
address, so this entry makes them reachable as a side effect; we do not use them, their usage policy
is stricter than Nominatim's, and nothing in this repo may call them.* That is honest, it keeps the
prohibition as a rule rather than pretending it is a control, and it costs one line.

---

## 3. F3 (High) — D12's "cannot be expressed in this script at all" is false

This is the negative claim the brief flagged, and it fails — though not where the brief expected. The
shard-sampling argument is fine. The mechanism it never considers is the one already in the file.

### The stated fact that is wrong

§10.3 row 5 rules out GitHub meta's `.actions` key with, verbatim:

> *"…**and it would not reach row 4 anyway** — Azure blob storage is not in GitHub's meta ranges at all"*

No probe is recorded for that assertion anywhere in §10. I ran one. Against the live
`https://api.github.com/meta`, checking the author's **own** error IP from §10.5.1:

| Address | Source | In `.web + .api + .git` (what line 126 uses) | In `.actions` |
|---|---|---|---|
| `20.209.227.33` | the `gh run download` failure in §10.5.1 | NO | **YES — `20.209.226.0/23`** |
| `20.150.83.4` | `vscode.blob.core.windows.net`, §10.3 row 16 | NO | **YES — `20.150.83.0/24`** |
| `140.82.113.22` | `results-receiver…`, §10.3 row 15 | YES (`140.82.112.0/20`) | NO |
| `13.107.42.16` | `pipelines.actions…`, §10.3 row 6 | NO | NO |

The Actions artifact blob pool **is** inside GitHub meta's `.actions` ranges. So changing line 126's
`jq` from `(.web + .api + .git)[]` to `(.web + .api + .git + .actions)[]` — a mechanism this script
already implements, already validates, already aggregates and already fails safely on — reaches the
host. That single change also defeats all three of §10.5.2's "independent reasons":

- *"the hostname space is unbounded"* — irrelevant; no hostname is enumerated.
- *"Traffic Manager hands out different endpoints over time"* — the CIDRs cover the pool, so rotation
  within it is covered. This is exactly why the GitHub CIDR path exists in the first place.
- *"the shard is chosen at upload time and baked in"* — irrelevant for the same reason.

§10.5.2 opens *"Three independent reasons, any one of which is sufficient."* They are not independent.
All three are downstream of a single unstated assumption — **that the entry must be a hostname in the
`for domain in \ …` loop** — and the script contains a second, CIDR-based path the author uses and
documents elsewhere in the same section. This is the shape the project already has a memory about:
an argument *for* a conclusion is an absence claim in disguise, and each plank needs probing
separately, because a case can lose all of its planks at once when they share a premise.

### The verdict survives; the reason must not

I priced the alternative before recommending anything:

| Set | IPv4 CIDRs | Collapsed | Addresses |
|---|---|---|---|
| `.web + .api + .git` (today) | 92 | — | **30,800** |
| `.actions` (the alternative) | 5,658 | 3,944 | **27,901,673** |

A **~900×** widening of the container's reachable address space, to a set whose purpose is running
arbitrary third-party workloads, in order to retrieve a test artifact. **Refuse it.** I agree with the
outcome completely.

But refuse it **on that number**, which is what §10.5.2's own final paragraph already does — *"That is
a large fraction of a public cloud, on a container running autonomous agents, to retrieve a test
artifact. Refused, and it is not close."* — while §0's D12 headline and §10.3 row 4 both say the
opposite: *"not because of risk. It cannot be expressed in this script."* The document contradicts
itself, and the version that reached the summary table is the wrong one.

This matters beyond tidiness. *"Impossible"* forecloses re-examination; a reader who later genuinely
needs artifacts will read D12 and stop. *"Expressible, priced at 27.9M addresses, refused"* is a
decision someone can revisit with a different need and re-refuse in ten minutes. And the false
sub-claim in row 5 is exactly the pattern the project's negative-findings rule exists to catch: a
confidently-stated absence, no probe recorded, load-bearing for a headline, disproved by one query
against a host that was already allowlisted.

**Required correction.** Restate D12 as a risk refusal; correct row 5's "not in GitHub's meta ranges
at all" to "in `.actions`, which is 3,944 CIDRs / 27.9M addresses — refused on that basis"; and
demote §10.5.2's three reasons from "independent" to "three consequences of requiring a hostname
entry". The shard sampling is good work and should stay — it correctly kills the *hostname* route,
which is what the author set out to test.

---

## 4. F4 (High) — probe B cannot establish "blocked", and D17 is the reason

§10.1 defines the two-probe apparatus: probe A is a real TCP/TLS attempt, probe B is *"reading the
allowlist configuration, which fails differently by construction: a wrong assumption about the network
cannot also make a `grep` miss."* Every row in §10.3 carries `A` + `B`.

D17 (§10.8) then establishes that the allowlist matches IPs, not hostnames. The moment that is true,
**a hostname grep can no longer establish unreachability at all** — it establishes only *"this name is
not explicitly listed"*, which is a strictly weaker statement and is silent about the collision path.
And probe A resolves the host by its own name, so it is blind to the same path. The two probes fail
differently, but they share a blind spot, which is precisely what the negative-findings rule prohibits:
*"'independent' means a single wrong assumption cannot produce both results."* Here one assumption —
*hostnames are the unit of reachability* — produces both.

F1 is the instance that proves it: rows 7, 9 and 12 each carry `A` + `B`, each is recorded
"Blocked today: Yes", and each is reachable.

The document derives the fact that invalidates its own methodology, in the same document, two sections
later, and does not connect them. That is worth naming precisely because it is not carelessness — §10
is unusually rigorous, and the register in §10.9 is genuinely good. The gap is that D17 arrived late
and was treated as an addendum rather than as a retroactive correction to everything above it.

**Required correction.** §10.3's evidence column needs a third probe class for any row whose verdict is
*blocked*: **`E` = tested against the allowlisted address space, not only against the host's own name.**
Concretely, for each excluded host, resolve it, identify its CDN, and check whether any allowlisted
entry shares that CDN's edge. That is cheap — it is one `dig` per host plus the resolution data §10.8
already collected — and it is the only probe that actually answers the question the column claims to
answer.

---

## 5. Weakness B (§10.4.2's ratchet) — the author's own nomination, tested

The brief asked me to start here. The diagnosis is correct and the finding is real, but it is smaller
than the author fears and smaller than F1–F4.

**The argument is genuinely a ratchet.** §10.4.2: *"refusing an anonymous GET of the production website
is not a defensible boundary — it withholds strictly less information than what has already been
granted."* Generalised, that licenses every subsequent grant by reference to the last one, and the
document's own §10.3 shows why that is dangerous: ADL-33's exclusions were *chosen*, and a rule that
converts prior grants into arguments erodes chosen exclusions without ever re-examining them.

**But it does hold on the specifics, and it is not doing the work.** The comparison is real and
correctly directed: a read-only SELECT against the production database returns user PII; an anonymous
GET of the production website returns what any stranger can already fetch. It is not "we granted X so
grant Y" in the abusive sense — it is "Y is a strict subset of X on the axis we care about", which is a
sound form. And §10.4.2 does not rest on it alone: it lists three arguments *against* (episodic need,
an existing `base_url` path, prod being where mistakes cost most), reaches a hedged ADOPT, and
explicitly tells the PO to cut this line first if cutting anything. That is close to the opposite of a
ratchet in effect, whatever the shape of the sentence.

**Verdict on Weakness B: real but low-severity, and self-limiting.** The correction is one word — state
it as a *subset* argument rather than a *consistency* argument, since "already granted" is doing none
of the logical work and all of the rhetorical work. Under F1, the prod entry's marginal cost is near
zero anyway, so this argument does not need to carry weight it cannot bear.

**The more useful observation the self-assessment misses.** Weakness A worries that the three ADDs are
"the three someone asked for", and defends by pointing at the load-bearing exclusions. That defence is
sound in intent — but F1, F2 and F3 show the exclusions are weaker than claimed: two of them are
already ineffective, one becomes ineffective on application, and the flagship refusal is justified by
a false statement. **The self-check picked the right worry and validated it against the wrong
evidence.** The exclusions were counted, not tested. That is the honest generalisation of this review.

---

## 6. F5 (Medium-High) — D13's remediation names 1 of 11 places

D13 is taken as given per the brief; the COO has verified the fail-open with three probes. What I
checked is the remediation, and it is under-scoped by an order of magnitude.

§10.5.4 recommends: *"update CLAUDE.md's 'After opening a PR' section to replace `gh run view <run-id>
--log-failed`…"*. `--log-failed` is instructed in **eleven** places in this repo:

```
CLAUDE.md:352
.claude/skills/coo-startup/SKILL.md:169
jobs/architect/architect-system-prompt.txt:143
jobs/backend/backend-system-prompt.txt:132
jobs/frontend/frontend-system-prompt.txt:126
jobs/database/database-system-prompt.txt:126
jobs/qa/qa-system-prompt.txt:126
jobs/docs/docs-system-prompt.txt:124
jobs/integrations/integrations-system-prompt.txt:126
jobs/ux/ux-system-prompt.txt:128
jobs/COO/open-dialogues.md:994   (historical reference — leave)
```

Fixing CLAUDE.md alone leaves **eight role system prompts** telling every dispatched agent to run a
fail-open command — and a role system prompt is read on *every* dispatch of that role, which arguably
makes it more load-bearing than CLAUDE.md for this particular instruction. I read
`jobs/architect/architect-system-prompt.txt:143` at the start of this task and it told me to run it.

**And there is a second fail-open D13 did not look for, in the same family.**
`.claude/skills/coo-startup/SKILL.md:169` uses `gh run view <id> --log-failed` as part of the
**session-start audit for a red `main`** — *"and either fix it this session or raise a…"*. A command
that exits 0 with empty output there means the COO's opening audit reports nothing to fix. That is the
same shape as D13 but at a gate rather than at a debugging step, and gates that fail open are a class
this project already has a memory about.

**Findings I formed here and killed** — recorded because the brief asked for other commands with the
same shape, and the honest answer is that the most obvious candidate is fine:

- **`scripts/ci-wait.sh` fails CLOSED.** I read it in full (287 lines). Both modes resolve the target
  SHA authoritatively, refuse to report PASS without positively observing a terminal green result for
  that exact commit, and treat an empty or unparseable answer as failure (`pr` mode lines 199–202,
  `branch` mode lines 272–275; discovery timeout exits 2 in both). The header documents three
  historical fail-opens fixed under BUG-64 and states the governing rule: *"Absence of evidence is
  treated as failure, not success."* This is the correct design and D13's problem does not touch it.
- **`gh run download` fails loud** — it prints the `no route to host` error, which is how §10.5.1
  found the blob pool in the first place.
- **`scripts/agent-diagnostics/turso-query.mjs` fails loud** on a missing credential file (exit 1 with
  a named reason). I did not exercise its network-failure path and do not claim anything about it.

---

## 7. F6 (Medium) — the STANDING CONDITION is filed at the wrong index

The brief asked whether it is load-bearing or decorative. **As placed, decorative.** The premise it
rests on is true; the placement means nobody will read it at the moment it matters.

**The premise checks out — three probes.** (i) `.env.local`'s key names are `ALLOWED_ORIGINS`,
`CLERK_ISSUER`, `CLERK_JWKS_URI`, `DB_TYPE`, `HOST`, `NODE_ENV`, `OWNER_CLERK_ID`, `PORT`,
`SQLITE_PATH`, `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_MAPTILER_KEY` — no
`CLERK_SECRET_KEY`. (ii) No `sk_test_`/`sk_live_` pattern in `.env.local`, `.env.example` or
`.env.agent-diagnostics`. (iii) No `@clerk/backend`, `clerkClient` or `CLERK_SECRET_KEY` reference in
non-test backend source, so nothing here would consume one. The claim *"the container holds no Clerk
credential"* stands.

**The placement does not.** The condition lives in a shell comment inside `.devcontainer/init-firewall.sh`
— in a diff that is not applied, so today it exists nowhere at all. Even applied, the trigger event is
*"someone provisions a Clerk credential for this container"*, and that person will be editing
`.env.local`, `.env.agent-diagnostics` or a Railway variable set. **They will not be reading the
firewall script.** A condition indexed under a file the triggering action never touches is a record,
not a control.

**Where it belongs.** ADL-33 §4 is the decision that declined Clerk access — that is the document
someone re-opens when they want a Clerk credential, and it is the canonical home for the condition.
A second copy belongs wherever credential provisioning is actually recorded (`.env.example`'s Clerk
block would be read by the person doing the work). Keeping a pointer in the firewall comment is fine;
keeping *only* that is not.

**F1 makes this more urgent, not less.** §10.4.1's containment argument reads as credential-plus-network
in depth. It is not: `api.clerk.com` answers `401` from this container today. If a Clerk secret key is
ever provisioned here, the Backend API — full user CRUD over all PII, as §10.3 row 12 correctly
describes it — is immediately reachable, with no firewall change and no warning. The condition is
therefore the *only* control, which is a good reason to file it where it will be seen.

---

## 8. F7 (Medium) — D10's headline argument is workflow-shaped, and the PO does not need the entry

D10 is right. The argument leading it is not durable, and the brief was right to press on it.

**The same premise is doing opposite work in two sections and the document does not notice.** §3.4(a)
uses *"the PO's browser is on the host, outside the netns"* to argue **against** allowlisting MapTiler:
the firewall does not gate what the PO can see, so widening it buys nothing. §10.4.1 uses the identical
fact to argue **for** the Railway domains. Both can be true, but only because the consumer differs —
and once that is said out loud, the PO quote stops supporting D10. **The PO can already see staging
perfectly well.** The entry does nothing for the PO.

**The need is entirely agent-side, and stating it that way makes it durable.** The real argument is
OP-32: every defect must be classified as regression, deployment/config, or gap before it is
briefable, and a deployment classification requires observing the deployed artifact. No agent in this
container can do that, so every deployment-class defect is diagnosed by proxy — which is exactly the
history D-06, BUG-59 and BUG-55 record. That argument holds whether the PO tests on staging, locally,
or from a phone. The version in §10.4.1 evaporates the day the PO's habits change, and §10.4.1 itself
concedes the metadata path *"worked twice"*.

**A second, smaller overclaim.** *"Nobody inside this container can observe the surface the project is
judged on"* is too strong. `post-deploy-shakedown.yml` defaults `SHAKEDOWN_BASE_URL` to
`https://travel-tracker-staging.up.railway.app` (line 78) and is `workflow_dispatch`-able with a
`base_url` override (lines 32–34) — so an agent can dispatch it and, **with D13's now-working run-log
retrieval**, read the result. Slow, fixed-assertion, one round-trip per question, but it exists. §10.4.2
credits precisely this path when arguing prod is *less* needed, and does not credit it against staging.
The honest claim is *"no agent can observe staging interactively or cheaply"*, which is still a strong
argument for the entry and does not have to be defended against a counterexample in the same repo.

**Verdict: ADOPT stands, unchanged.** Re-base it on OP-32 and delete the reliance on the PO quote.

---

## 9. F8 (Medium) — the enumeration is additive-only, and its own D17 implies the removal review it skips

§10.9 entry 7 records, honestly:

> *"That the toolchain entries (`sentry.io`, `statsig.com`, the VS Code hosts) are still needed …
> I did not test removing them. Listed as 'inherited' rather than 'required'."*

and §10.3 scopes removal out: *"out of scope, and removal is a different kind of change from addition."*

Under F1 that footnote is the most consequential thing in §10. **`registry.npmjs.org` is the source of
the bypass** — twelve Cloudflare edge addresses, pinned to support `npm ci`. `sentry.io` (35.186.247.156)
and `statsig.com` (34.128.128.0) are *telemetry egress*: their whole function is to send data out of
this container to a third party, and the document's own framing is that widening the allowlist widens
what an autonomous agent can exfiltrate. `vscode.blob.core.windows.net` is an Azure Storage scale-unit
address (`ams23prdstr11a`), i.e. the same `*.blob.core.windows.net` class the document refuses in D12,
already present.

This is not a demand to rip them out — npm is obviously required, and I have not established that the
VS Code or telemetry entries are unused (I have not probed it and do not claim it). It is an
observation about the shape of the deliverable: a section titled *"the complete ENV-01 host
enumeration"*, whose central insight is that **every line costs more than one host**, asks only
*"what should go in?"* and never *"what is already in, and what does it cost?"* Sixteen candidate hosts
were assessed; the seven existing entries were listed with inherited reasons and not assessed at all.

**Recommendation:** raise the removal review as its own tracked item now, while F1 is fresh — because
the answer to *"is `sentry.io` still needed?"* has changed character. It is no longer hygiene. It is
one of the addresses that determines what a misbehaving agent can reach.

---

## 10. F9 / F10 (Low) — two smaller items

**F9 — a live MapTiler key in a container that can reach MapTiler.** `.env.local` carries
`VITE_MAPTILER_KEY`. §3.4(c) establishes carefully that *CI* has no key (three probes, all of which I
re-verified: `grep -rn MAPTILER .github/` returns nothing, and the only `secrets` string in any workflow
is an English word in a comment) and concludes an allowlist entry would not help CI. Correct — and it
never asks the local question. Combined with F1, an agent in this container can spend the PO's MapTiler
quota today. Small, bounded by the key's own quota, and not caused by this ADL — but it belongs in the
record, because §3.4(c) is the section where a reader would expect to find it.

**F10 — D13's replacement is fail-loud, with two residual traps.** I probed the failure mode the brief
asked about: `gh api "repos/ryanv11/travel-tracker/actions/runs/1/logs"` (nonexistent run) exits **1**
with `gh: Not Found (HTTP 404)` on stderr. It does not fail open, which is the property that matters,
and the recommendation is sound. Two refinements:

1. **It writes 138 bytes of JSON error body to stdout on failure**, so the documented
   `gh api … > /tmp/runlogs.zip` produces a file named `.zip` that is not one. The `&&` in §10.5.3's
   second line guards the `grep` on `unzip` succeeding, so nothing silently passes — but the command
   should check the exit code explicitly rather than relying on `unzip` to notice.
2. **`unzip -o … -d /tmp/runlogs` overwrites into a fixed shared directory.** Across two runs in one
   session an agent can grep a mixture of both. Use a per-run directory (`/tmp/runlogs-<RUN_ID>`).

One thing I did **not** establish, flagged rather than asserted: `/runs/{id}/logs` is documented by
GitHub to return the *latest attempt*, so a re-run's earlier failing attempt would need
`/runs/{id}/attempts/{n}/logs`. **UNVERIFIED** — I did not test a re-run from this container, and the
only probes I ran were the 404 case and the document's own successful retrieval. Worth one probe before
the CLAUDE.md edit lands.

---

## 11. Findings I formed and then killed

Recorded because the previous review in this series did so and it was useful — and because three of
these run against the direction of this review, which is the direction worth reporting.

| # | Hypothesis | Outcome | How |
|---|---|---|---|
| K1 | `scripts/ci-wait.sh` shares D13's fail-open shape — it asks a remote system whether a gate passed | **KILLED.** It fails closed by design and says so | Read all 287 lines. Empty/unreadable answers exit 1 or 2; PASS requires positively observing terminal green for the resolved SHA (lines 199–202, 272–275). BUG-64 fixed three historical fail-opens |
| K2 | A Clerk credential is already present, so §10.4.1's "no data access" is false today | **KILLED.** No Clerk secret key exists here | Three probes — §7 above. The ADL's claim stands |
| K3 | §10.7's quoted diff is malformed or stale against the live file (the superseded §3.5 diff *does* have an inconsistent hunk header) | **KILLED for §10.7.** Extracted the fenced block verbatim and ran `git apply --check` → **exit 0**. Hunk arithmetic checks out (15 → 69), and the context at lines 137–151 matches the live file exactly. The author's verification claim is accurate |
| K4 | The IPv4-only firewall leaves an IPv6 hole (§2.3's claim is a year old and unrechecked) | **KILLED.** Re-verified independently: only `::1/128` on `lo`, empty `ip -6 route`, and `curl -6` → `000` against `curl -4` → `200` on the same URL in the same second |
| K5 | Railway's edge is a large shared collision surface, so D10/D11 cost more than §10.8 says | **NOT ESTABLISHED, and it cuts the ADL's way.** `travel-tracker-staging` (`69.46.46.75`), `travel-tracker-production-241f` (`69.46.46.14`), `up.railway.app` (`69.46.46.126`) and `railway.com` (`69.46.46.46`) each resolve to a **distinct single** address in `69.46.46.0/24`, i.e. Railway appears to allocate per-domain edge addresses rather than pooling. **UNVERIFIED:** whether one Railway edge address serves other tenants by `Host` header is untestable from here while the address is blocked. §10.8's Railway row may *over*state the collision surface |
| K6 | `api.turso.tech`'s exclusion is nominal too, like Clerk's | **KILLED.** CloudFront-fronted (`143.204.160.x`); no CloudFront address is in the allowlist, and an SNI attempt through a Cloudflare edge fails at TLS handshake. That exclusion is **effective** — which is also the control proving F1 is not a blanket "everything is reachable" |

---

## 12. What must change before this is briefable

Ordered. Items 1–3 are blocking; 4–6 are corrections that should land in the same edit; 7–8 are new
items for the COO to raise.

1. **§10.8 / D17 — replace "This does not change any verdict in §10.3."** It changes rows 7, 9 and 12
   from *blocked* to *reachable*, and it re-frames the allowlist as an accident control rather than a
   containment boundary. Re-take the SNI-proxy judgement knowingly (F1).
2. **§10.7's diff comment — remove `*.tile.openstreetmap.org` from `STILL DELIBERATELY EXCLUDED`** and
   state the side effect in the Nominatim paragraph. The diff must not be applied as written (F2).
3. **§0 D12 / §10.3 row 5 / §10.5.2 — restate as a risk refusal.** Correct the false meta-ranges claim,
   price the `.actions` alternative at 3,944 CIDRs / 27.9M addresses, and demote the three "independent"
   reasons to three consequences of one shared assumption (F3).
4. **§10.3 — add a third probe class `E`** for excluded hosts: tested against the allowlisted *address
   space*, not only the host's own name (F4).
5. **§10.4.1 — re-base D10 on OP-32 deployment-class classification**, not the PO's current testing
   habit; soften *"nobody can observe"* to *"no agent can observe interactively"*, crediting the
   `workflow_dispatch` path (F7).
6. **§10.4.2 — restate the prod argument as a subset argument**, not a consistency one (Weakness B, §5).

**For the COO, as new items rather than ADL edits:**

7. **D13's remediation covers 11 files, not 1** — CLAUDE.md, `/coo-startup` (a second, gate-shaped
   fail-open) and eight role system prompts (F5). And the STANDING CONDITION needs a home in ADL-33 §4,
   not only a firewall comment (F6).
8. **Raise the allowlist *removal* review** as its own tracked item. Under F1 the existing entries —
   not the proposed ones — determine what a misbehaving agent can reach (F8).

**Unchanged and endorsed:** D1, D10, D11 (adopt — F1 makes the last two cheaper than argued);
D12's outcome (refuse); D14 (defer MapTiler — and F1 adds a new reason, since allowlisting it would
grant almost nothing it does not already have); D15, D16; the whole of §5's replay-fixture design;
§6.5's finding that the tail places are absent from the gazetteer too, which remains the most
important sentence in the document and which this review does not touch.

---

## 13. Method note, and my own blind spots

**Probes run from** `/workspace/.claude/worktrees/agent-af04e55a87ac51d7b` (confirmed by `pwd` and
`git rev-parse --show-toplevel` before anything else), 2026-08-04, against the live container. I did
not apply the diff, edit ADL-49, or touch `.devcontainer/init-firewall.sh` or anything under `src/`.

**The trap the brief named was respected.** DNS/UDP-53 stays open through lockdown
(`init-firewall.sh:52-53`), so no successful `dig` is used as evidence of reachability anywhere above.
Every reachability claim in F1 is a completed TLS handshake with an HTTP status code from the origin.
`dig` appears only for address-space characterisation, which is what line 153 does anyway.

**My blind spots, stated so the next reader knows what was not checked:**

1. **I could not read the live `ipset`** — `sudo` is restricted to `init-firewall.sh`, exactly as
   §10.9 entry 1 records. My inferences about *which* addresses are pinned come from resolving the
   hostnames in the domain loop. The F1 results do not depend on this: a completed TLS handshake to a
   pinned address is direct evidence of live kernel state regardless of how the address got there.
2. **F1's Cloudflare result is a sample of nine hosts from two edge addresses.** Both addresses behaved
   identically and the one failure was a non-Cloudflare host, which is why I state the finding as
   "Cloudflare-proxied zones" rather than "some zones". I did **not** enumerate Cloudflare's estate and
   do not claim every proxied zone is reachable.
3. **The exfiltration inference is an inference.** I demonstrated that arbitrary Cloudflare-proxied
   origins answer. I do not control any of those zones and did not send data anywhere. The step from
   "arbitrary CF zones answer" to "an adversary-provisionable receiver answers" rests on Cloudflare's
   free tier being self-service, which I did not probe.
4. **F2's OSM tile conclusion is a prediction about post-application state**, established by DNS
   identity plus the mechanism demonstrated in F1 plus reading `init-firewall.sh:83` — not by a request
   to an OSM host, which is unavailable today and which I would not have issued speculatively.
5. **K5's Railway collision surface is UNVERIFIED in both directions.** Distinct per-domain addresses
   are suggestive, not conclusive; whether one edge address serves other tenants by `Host` header
   cannot be tested from here while the address is blocked.
6. **I did not probe a GitHub Actions runner**, so §6.2's `UNVERIFIED` stamp on `ci.yml:76` is
   untouched and remains correct.
7. **F10's re-run/attempts point is unprobed** and marked as such.

**On the shape of this review.** The document is strong — the sourcing in §10.2 is exemplary, the
UNVERIFIED register in §10.9 is honest and mostly well-calibrated, the shard sampling in §10.5 killed
the author's own starting position, and §6.5 is a genuinely important finding. Every problem I found
is of one type: **a correct discovery whose consequences were not propagated backwards.** D17 was
derived and not applied to §10.3. The CIDR mechanism was used in §10.5.2's own paragraph and not
considered as the answer. The exclusions were counted as evidence of rigour and never tested. None of
that is sloppiness; it is what happens when a document grows by amendment and the amendment is graded
against the brief that produced it rather than against the document it is joining.

> **On §10.9's register, since the brief asked specifically.** Six of the seven entries are honest and
> correctly scoped. Entry 7 (the toolchain entries) is the one wearing the label to avoid the work —
> not dishonestly, but it is scoped out as hygiene when D17 makes it the most consequential open
> question in the section (F8). Entry 1's stated mitigation ("probe A tests live kernel state, and it
> agrees with probe B in all 13 cases") is the one I would rewrite: the agreement is not corroboration,
> because F4 shows both probes share a blind spot — they agreed because they were asking the same
> question, not because the answer was checked twice.

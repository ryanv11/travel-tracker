#!/bin/bash
set -uo pipefail  # Exit on undefined vars and pipeline failures — NOT on error (see below)
IFS=$'\n\t'       # Stricter word splitting
#
# ADL-34: this script previously ran under `set -e`, and a single domain in the
# resolution loop below failing to resolve (confirmed 2026-07-21: statsig.anthropic.com
# was a stale NXDOMAIN entry) caused the whole script to `exit 1` — which happened
# AFTER `iptables -F` had already flushed all rules but BEFORE the default-DROP
# policy and REJECT rule at the bottom ever ran. Net effect: one dead domain silently
# left the container's outbound network completely UNRESTRICTED instead of the
# intended allowlist-only posture, and this could persist across every container
# start until someone happened to test reachability directly.
#
# Fix: the default-DROP + allowlist-match + REJECT posture is now established
# EARLY (step 5 below), before any external domain resolution is attempted. Every
# resolution/validation step after that is purely ADDITIVE — it can only add more
# allowed IPs to the already-enforced ipset. No single domain, CIDR, or IP failure
# can put the container back into an open state; at worst, that one host stays
# unreachable (a loud, legible failure downstream — e.g. `git push` erroring on a
# connection failure) rather than a silent total loss of the firewall. `set -e` is
# deliberately dropped repo-wide in this script for the same reason: no unexpected
# early exit should ever be able to skip past the lockdown lines again.

FAILED_ITEMS=()

# 1. Extract Docker DNS info BEFORE any flushing
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

# Flush existing rules and delete existing ipsets
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# 2. Selectively restore ONLY internal Docker DNS resolution
if [ -n "$DOCKER_DNS_RULES" ]; then
    echo "Restoring Docker DNS rules..."
    iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
    iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
    echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
else
    echo "No Docker DNS rules to restore"
fi

# 3. Allow DNS, SSH, and localhost — required for this script's own domain
# resolution to work, and for basic container operation. These are the only
# things that run before lockdown; unlike the domain allowlist below, they are
# not attempts to reach external services that could rot over time.
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow the host network (needed for devcontainer/Docker-host communication).
# Failure here is non-fatal (warn + skip) — same reasoning as everything below.
HOST_IP=$(ip route | grep default | cut -d" " -f3 || true)
if [ -z "$HOST_IP" ]; then
    echo "WARNING: Failed to detect host IP — host-network access will not be allowlisted"
    FAILED_ITEMS+=("host-network (could not detect default route)")
else
    HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
    echo "Host network detected as: $HOST_NETWORK"
    iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
    iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT
fi

# 4. Create ipset with CIDR support (starts empty — populated below, additively)
ipset create allowed-domains hash:net

# 5. LOCKDOWN — establish the restrictive default now, before any external
# domain resolution is attempted. Everything from here to the end of the script
# only ever ADDS entries to allowed-domains; it can no longer un-apply this.
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited
echo "Default-deny lockdown applied. Populating allowlist..."

# 6. Fetch GitHub meta information and aggregate + add their IP ranges.
# Failure here is non-fatal: GitHub simply won't be allowlisted, which will
# surface as loud, legible connection failures in git/gh commands — not a
# silently-open firewall.
#
# Bootstrap note: the lockdown in step 5 now applies BEFORE this fetch runs,
# which means the curl below would otherwise be blocked by the very allowlist
# it exists to populate (api.github.com isn't allowed yet). DNS (UDP/53) stays
# open through lockdown, so resolve api.github.com's current A record and
# temporarily allow it — just enough to let this one bootstrap fetch through.
# The full official ranges added below are a superset and stay in the ipset
# regardless.
bootstrap_ips=$(dig +noall +answer A api.github.com | awk '$4 == "A" {print $5}')
if [ -n "$bootstrap_ips" ]; then
    while read -r ip; do
        [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] && ipset add --exist allowed-domains "$ip"
    done <<< "$bootstrap_ips"
else
    echo "WARNING: Failed to resolve api.github.com for bootstrap — meta fetch will likely fail"
fi

echo "Fetching GitHub IP ranges..."
gh_ranges=$(curl -s https://api.github.com/meta || true)
if [ -z "$gh_ranges" ]; then
    echo "WARNING: Failed to fetch GitHub IP ranges — GitHub will not be allowlisted"
    FAILED_ITEMS+=("GitHub (meta API fetch failed)")
elif ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null 2>&1; then
    echo "WARNING: GitHub API response missing required fields — GitHub will not be allowlisted"
    FAILED_ITEMS+=("GitHub (malformed meta API response)")
else
    echo "Processing GitHub IPs..."
    while read -r cidr; do
        if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
            echo "WARNING: Invalid CIDR range from GitHub meta, skipping: $cidr"
            FAILED_ITEMS+=("GitHub CIDR $cidr (invalid format)")
            continue
        fi
        echo "Adding GitHub range $cidr"
        ipset add --exist allowed-domains "$cidr"
    done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)
fi

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
#
# ADL-49 §10 (2026-08-04, ENV-01) — three entries added below, in two categories.
#
# (a) nominatim.openstreetmap.org — the app's OWN RUNTIME geocoder
#     (nominatim-client.ts:31), for local development and fixture capture. This is
#     the first entry of that kind; every other host here is agent diagnostics.
#     Two usage-policy obligations ride with it and are not optional: ~1 req/s from
#     this single egress IP, and an identifying User-Agent. The in-process limiter
#     does NOT span processes — read ADL-49 §4.3 before running any capture or
#     probe script. Fastly anycast, one A record: materially less rotation-prone
#     than the Turso/Railway entries above. If the geocoder stops working
#     mid-session, restart the container before debugging the client.
#
#     SIDE EFFECT, STATED BECAUSE IT IS REAL: the OSM TILE servers share this exact
#     Fastly anycast address — nominatim, tile., a/b/c.tile.openstreetmap.org all
#     resolve to 151.101.21.91. This ipset holds ADDRESSES, so this entry makes the
#     tile servers reachable too and no entry here can separate them. We do not use
#     them (the app renders MapTiler vector tiles via MapLibre), their usage policy
#     is STRICTER than Nominatim's, and nothing in this repo may call them. That is
#     a repo RULE, not a control this file enforces — see ADL-49 §10.11.2.
#
# (b) travel-tracker-staging.up.railway.app
#     travel-tracker-production-241f.up.railway.app
#     The DEPLOYED APP's own public domains — read-only diagnostic GETs. Open
#     dialogue D-06, raised 2026-07-21 and now on its fourth occurrence. The PO's
#     entire verification loop is a host browser against staging, so nobody inside
#     this container can observe the surface the PO is actually judging. These
#     grant no credential: the API stays behind Clerk, and the container already
#     holds read-only SELECT on BOTH Turso databases (ADL-33 §2) — granting the
#     production database while refusing the public website would be incoherent.
#     Prefer staging; hit production only when the question is specifically about
#     production (ADL-33 §2's convention, carried over).
#
#     The "no credential" argument above has a STANDING CONDITION attached. It is
#     recorded in ADL-33 §4 — the decision that declined Clerk access — because that
#     is what someone provisioning a credential actually reads. It is NOT restated
#     here: a condition filed only in a firewall script is a record, not a control.
#
# NOT ALLOWLISTED BY NAME, each with a reason (ADL-49 §10.3). READ THE CAVEAT BELOW
# BEFORE TREATING ANY OF THESE AS BLOCKED — for Cloudflare-fronted hosts they are a
# statement that no case has been made, NOT a control this file enforces:
#   api.turso.tech    ADL-33 §2. CloudFront-fronted with no allowlisted neighbour,
#                     so this exclusion is EFFECTIVE (verified). It is the DB admin
#                     plane and the most important exclusion in this file.
#   api.clerk.com     ADL-33 §4. Cloudflare-fronted: reachable today via the caveat
#                     below, answering 401. The control here is the ABSENT
#                     CREDENTIAL, not this list. That is deliberate, not a gap.
#   img.clerk.com     no in-container consumer; browser-side avatars only.
#   api.maptiler.com  ADL-49 §3.4/§10.6 — the firewall is not what blocks map
#                     testing (PO-confirmed 2026-08-04). Also already reachable.
#   productionresultssa*.blob.core.windows.net — GitHub Actions ARTIFACT storage.
#                     Reachable only by widening the meta CIDRs at line 126 to
#                     include '.actions': 10,300 -> 27,901,673 addresses, a 2,709x
#                     widening. REFUSED ON THAT COST (ADL-49 §10.5.2). The run-LEVEL
#                     logs API is already reachable — use it instead.
#   GitHub meta '.actions' key — same refusal, same number.
#
# WHAT THIS FILE IS AND IS NOT (ADL-49 §10.8, measured not theorised): it matches IP
# ADDRESSES, not hostnames — there is no SNI or Host inspection anywhere. So it is an
# AVAILABILITY AND ACCIDENT CONTROL, not a containment boundary. Any CDN-fronted
# origin sharing an address with an allowlisted host is reachable via SNI, and for
# Cloudflare that is demonstrated: api.maptiler.com returns 301 when pinned to an
# address registry.npmjs.org resolves to. Non-Cloudflare exclusions (CloudFront,
# Azure) do hold. Do not read an absence from this list as unreachability.
for domain in \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "sentry.io" \
    "statsig.com" \
    "marketplace.visualstudio.com" \
    "vscode.blob.core.windows.net" \
    "update.code.visualstudio.com" \
    "just-raptor-89.clerk.accounts.dev" \
    "nominatim.openstreetmap.org" \
    "travel-tracker-staging.up.railway.app" \
    "travel-tracker-production-241f.up.railway.app" \
    "travel-tracker-prod-ryanv11.aws-us-west-2.turso.io" \
    "travel-tracker-staging-ryanv11.aws-us-west-2.turso.io" \
    "backboard.railway.com"; do
    echo "Resolving $domain..."
    ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
    if [ -z "$ips" ]; then
        echo "WARNING: Failed to resolve $domain — it will not be allowlisted"
        FAILED_ITEMS+=("$domain (DNS resolution failed)")
        continue
    fi

    while read -r ip; do
        if [[ ! "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            echo "WARNING: Invalid IP from DNS for $domain, skipping: $ip"
            FAILED_ITEMS+=("$domain IP $ip (invalid format)")
            continue
        fi
        echo "Adding $ip for $domain"
        ipset add --exist allowed-domains "$ip"
    done < <(echo "$ips")
done

echo ""
if [ ${#FAILED_ITEMS[@]} -gt 0 ]; then
    echo "=========================================================================="
    echo "FIREWALL WARNING: ${#FAILED_ITEMS[@]} item(s) could NOT be allowlisted (lockdown"
    echo "is still active — these hosts are simply unreachable, not a security gap):"
    for item in "${FAILED_ITEMS[@]}"; do
        echo "  - $item"
    done
    echo "=========================================================================="
fi

echo "Firewall configuration complete"
echo "Verifying firewall rules..."
if curl --connect-timeout 5 https://example.com >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - was able to reach https://example.com"
    exit 1
else
    echo "Firewall verification passed - unable to reach https://example.com as expected"
fi

# Verify GitHub API access
if ! curl --connect-timeout 5 https://api.github.com/zen >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - unable to reach https://api.github.com"
    exit 1
else
    echo "Firewall verification passed - able to reach https://api.github.com as expected"
fi

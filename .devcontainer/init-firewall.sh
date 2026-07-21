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
for domain in \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "sentry.io" \
    "statsig.com" \
    "marketplace.visualstudio.com" \
    "vscode.blob.core.windows.net" \
    "update.code.visualstudio.com" \
    "just-raptor-89.clerk.accounts.dev" \
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

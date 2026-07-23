#!/bin/bash
# Travel Tracker — CI/deploy-check wait helper
#
# Every agent role (COO included) is instructed to "wait for CI to go green"
# before merging a PR or filing a completion report. Left to ad-hoc scripts,
# that has repeatedly meant a fresh polling loop written inline each time —
# slow, inconsistent, and once (2026-07-22) broken outright by naming a shell
# variable `status`, which is a read-only special variable in zsh (this
# environment's shell) and kills the script immediately with no useful error
# surfaced to the caller. This script is the one canonical replacement: it
# wraps gh's own built-in watch commands (gh pr checks --watch, gh run watch
# --exit-status) instead of hand-rolled grep/variable polling, then does one
# final authoritative check via --json before reporting, rather than trusting
# a watch command's own exit code alone.
#
# Usage:
#   scripts/ci-wait.sh pr <PR_NUMBER> [TIMEOUT_SECONDS]
#   scripts/ci-wait.sh branch <BRANCH_NAME> [TIMEOUT_SECONDS]
#
# Examples:
#   scripts/ci-wait.sh pr 227
#   scripts/ci-wait.sh branch main 300
#
# Exit codes:
#   0   all checks/runs passed
#   1   at least one check/run failed or was cancelled
#   2   usage error
#   124 timeout reached before checks reached a terminal state (from GNU timeout)
#
# Requires: gh CLI authenticated against this repo. No credentials of its own
# (unlike scripts/agent-diagnostics/*, this needs no .env.agent-diagnostics).
set -uo pipefail

REPO="ryanv11/travel-tracker"
MODE="${1:-}"
TARGET="${2:-}"
TIMEOUT="${3:-600}"
INTERVAL=15

usage() {
    echo "Usage: $0 pr <PR_NUMBER> [TIMEOUT_SECONDS]" >&2
    echo "       $0 branch <BRANCH_NAME> [TIMEOUT_SECONDS]" >&2
    exit 2
}

if [ "$MODE" != "pr" ] && [ "$MODE" != "branch" ]; then
    usage
fi
if [ -z "$TARGET" ]; then
    usage
fi

if [ "$MODE" = "pr" ]; then
    echo "[ci-wait] Watching PR #$TARGET checks (timeout ${TIMEOUT}s)..."
    timeout "$TIMEOUT" gh pr checks "$TARGET" --repo "$REPO" --watch --interval "$INTERVAL"
    watch_rc=$?

    if [ "$watch_rc" -eq 124 ]; then
        echo "[ci-wait] TIMEOUT — checks did not reach a terminal state within ${TIMEOUT}s." >&2
        exit 124
    fi

    # Authoritative re-check via --json rather than trusting the watch exit code alone.
    rollup=$(gh pr view "$TARGET" --repo "$REPO" --json statusCheckRollup \
        --jq '[.statusCheckRollup[] | select(.conclusion != null and .conclusion != "SUCCESS" and .conclusion != "NEUTRAL" and .conclusion != "SKIPPED")] | length')

    if [ "$rollup" -eq 0 ]; then
        echo "[ci-wait] PASS — all checks green on PR #$TARGET."
        exit 0
    else
        echo "[ci-wait] FAIL — $rollup check(s) not green on PR #$TARGET:" >&2
        gh pr checks "$TARGET" --repo "$REPO" 2>&1 | grep -v $'\tpass\t' >&2 || true
        exit 1
    fi
fi

if [ "$MODE" = "branch" ]; then
    echo "[ci-wait] Finding latest workflow runs for branch '$TARGET' (timeout ${TIMEOUT}s)..."
    latest_sha=$(gh run list --repo "$REPO" --branch "$TARGET" --limit 1 --json headSha --jq '.[0].headSha')
    if [ -z "$latest_sha" ] || [ "$latest_sha" = "null" ]; then
        echo "[ci-wait] No workflow runs found for branch '$TARGET'." >&2
        exit 2
    fi

    mapfile -t run_ids < <(gh run list --repo "$REPO" --branch "$TARGET" --limit 10 \
        --json databaseId,headSha --jq ".[] | select(.headSha == \"$latest_sha\") | .databaseId")

    if [ "${#run_ids[@]}" -eq 0 ]; then
        echo "[ci-wait] No runs found for the latest commit ($latest_sha) on '$TARGET'." >&2
        exit 2
    fi

    overall_rc=0
    for run_id in "${run_ids[@]}"; do
        echo "[ci-wait] Watching run $run_id..."
        timeout "$TIMEOUT" gh run watch "$run_id" --repo "$REPO" --exit-status --interval "$INTERVAL"
        run_rc=$?
        if [ "$run_rc" -eq 124 ]; then
            echo "[ci-wait] TIMEOUT — run $run_id did not finish within ${TIMEOUT}s." >&2
            exit 124
        fi
        if [ "$run_rc" -ne 0 ]; then
            overall_rc=1
        fi
    done

    if [ "$overall_rc" -eq 0 ]; then
        echo "[ci-wait] PASS — all runs green for '$TARGET' @ $latest_sha."
    else
        echo "[ci-wait] FAIL — at least one run failed for '$TARGET' @ $latest_sha." >&2
    fi
    exit "$overall_rc"
fi

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
# ── Fails closed (BUG-64, fixed 2026-07-27) ──────────────────────────────────
# This script is the enforcement mechanism for CLAUDE.md's mandatory post-merge
# main check, so a false PASS is worse than no check at all. Two fail-OPEN bugs
# were found and fixed:
#
#   1. branch mode inferred its target commit from `gh run list --limit 1` —
#      i.e. "the newest run", not "the branch tip". Run immediately after a
#      merge, before GitHub has registered the new commit's runs, the newest run
#      still belongs to the PREVIOUS commit: the script watched already-green
#      runs and reported PASS for a commit nothing had tested. Observed live on
#      2026-07-26 (PASS @ 89ad005 while main was at 1b84557 with both workflows
#      still in_progress). Now the tip is resolved from the repo itself and the
#      script waits for runs to appear for *that* SHA.
#
#   2. pr mode counted only checks that had already concluded non-green, so a PR
#      whose checks had not yet registered (empty rollup → length 0) or were all
#      still queued (conclusion null → filtered out) reported PASS. Now a
#      still-pending check counts as not-green, and zero checks is a failure.
#
#   3. pr mode reported PASS while more checks for the same commit were still
#      arriving. `gh pr checks --watch` returns when the checks it knows about
#      finish, and this repo's `push` + `pull_request` triggers register two sets
#      at different moments (PR #267: PASS on 9 checks, 18 present moments later).
#      Both modes now settle and re-query before reporting.
#
# The general rule both fixes follow: never report PASS without having positively
# observed a terminal green result for the exact commit asked about. Absence of
# evidence is treated as failure, not success.
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
#   0   all checks/runs passed for the target commit
#   1   at least one check/run failed, was cancelled, or is still not green
#   2   usage error, or no checks/runs ever registered for the target commit
#   124 timeout reached before checks reached a terminal state
#
# TIMEOUT_SECONDS is an overall budget for the whole invocation, not a per-run
# allowance — a run that finishes slowly eats into the budget of the next one.
#
# Requires: gh CLI authenticated against this repo. No credentials of its own
# (unlike scripts/agent-diagnostics/*, this needs no .env.agent-diagnostics).
set -uo pipefail

REPO="ryanv11/travel-tracker"
MODE="${1:-}"
TARGET="${2:-}"
TIMEOUT="${3:-600}"
INTERVAL=15

# How long to wait for GitHub to register any run/check for the target commit.
# Bounded separately so a branch with no CI configured fails fast instead of
# burning the entire timeout budget before reporting.
DISCOVERY_TIMEOUT=180
DISCOVERY_POLL=5

# Workflows for one commit do not all register in the same instant. After the
# first run/check appears, wait this long and re-query before locking the set —
# otherwise we could watch CI, pass, and never look at Security Checks.
SETTLE_SECONDS=10

DEADLINE=$(( $(date +%s) + TIMEOUT ))

# Remaining seconds in the overall budget, floored at 1 so `timeout` still runs
# (and reports 124) rather than being handed a zero/negative argument.
remaining() {
    local left=$(( DEADLINE - $(date +%s) ))
    [ "$left" -lt 1 ] && left=1
    echo "$left"
}

# `gh api` ignores --jq when the response is an error and dumps the raw error
# body to stdout (exiting non-zero), so a resolved SHA that is merely non-empty
# can actually be a JSON blob like {"message":"No commit found for SHA: ..."}.
# Validate the shape instead of trusting non-emptiness.
is_sha() {
    [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

# How many checks the PR currently reports. Empty/unreadable answers are left
# empty rather than defaulted to 0, so callers can tell "no checks" from
# "could not ask".
pr_check_count() {
    gh pr view "$TARGET" --repo "$REPO" --json statusCheckRollup \
        --jq '(.statusCheckRollup // []) | length' 2>/dev/null
}

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
    head_sha=$(gh pr view "$TARGET" --repo "$REPO" --json headRefOid --jq '.headRefOid' 2>/dev/null)
    if ! is_sha "$head_sha"; then
        echo "[ci-wait] Could not resolve head commit for PR #$TARGET." >&2
        exit 2
    fi
    echo "[ci-wait] PR #$TARGET head is $head_sha"

    # Wait for at least one check to exist before watching. `gh pr checks --watch`
    # returns immediately when a PR has no checks reported yet, which is exactly
    # the post-push window in which this script is usually called.
    echo "[ci-wait] Waiting for checks to register (up to ${DISCOVERY_TIMEOUT}s)..."
    discovery_deadline=$(( $(date +%s) + DISCOVERY_TIMEOUT ))
    while :; do
        check_count=$(pr_check_count)
        [ -n "$check_count" ] && [ "$check_count" != "null" ] && [ "$check_count" -gt 0 ] && break
        if [ "$(date +%s)" -ge "$discovery_deadline" ] || [ "$(date +%s)" -ge "$DEADLINE" ]; then
            echo "[ci-wait] FAIL — no checks registered for PR #$TARGET @ $head_sha within ${DISCOVERY_TIMEOUT}s." >&2
            echo "[ci-wait] Refusing to report PASS for a commit nothing has tested." >&2
            exit 2
        fi
        sleep "$DISCOVERY_POLL"
    done

    # `gh pr checks --watch` returns once the checks it already knows about have
    # finished — but a second trigger's checks can register after that. This repo
    # runs both `push` and `pull_request`, so every commit gets two sets, and they
    # do not appear together: observed live on PR #267, which reported PASS on 9
    # checks with 18 present moments later. Re-watch while the set is still
    # growing, mirroring the settle window branch mode already had.
    #
    # Correctness does not depend on this loop terminating at the right moment:
    # the authoritative rollup below counts anything non-terminal as not-green, so
    # exiting early yields a FAIL, never a false PASS. The loop exists to avoid
    # spurious failures, not to provide the guarantee.
    while :; do
        echo "[ci-wait] Watching PR #$TARGET checks (budget $(remaining)s)..."
        timeout "$(remaining)" gh pr checks "$TARGET" --repo "$REPO" --watch --interval "$INTERVAL"
        watch_rc=$?

        if [ "$watch_rc" -eq 124 ]; then
            echo "[ci-wait] TIMEOUT — checks did not reach a terminal state within ${TIMEOUT}s." >&2
            exit 124
        fi

        count_before=$(pr_check_count)
        sleep "$SETTLE_SECONDS"
        count_after=$(pr_check_count)

        # Equal (or unreadable, in which case both are empty and the rollup below
        # fails closed) means the set has stopped growing.
        [ "$count_after" = "$count_before" ] && break
        echo "[ci-wait] $(( count_after - count_before )) further check(s) registered after the watch — re-watching."
        if [ "$(date +%s)" -ge "$DEADLINE" ]; then
            break
        fi
    done
    check_count="${count_after:-$check_count}"

    # Authoritative re-check via --json rather than trusting the watch exit code
    # alone. A check counts as green only if it has positively concluded green:
    # anything still queued/in-progress counts as not-green (see BUG-64 note 2).
    # StatusContext entries carry `state` instead of `conclusion`, so both rollup
    # shapes are handled rather than assuming this repo only ever emits CheckRuns.
    rollup=$(gh pr view "$TARGET" --repo "$REPO" --json statusCheckRollup --jq '
        [ (.statusCheckRollup // [])[]
          | select(
              if .__typename == "StatusContext" then
                  .state != "SUCCESS"
              else
                  (.status != "COMPLETED")
                  or ((.conclusion != "SUCCESS") and (.conclusion != "NEUTRAL") and (.conclusion != "SKIPPED"))
              end
            )
        ] | length' 2>/dev/null)

    # An unparseable/empty answer means we do not know the state — fail closed.
    if [ -z "$rollup" ] || [ "$rollup" = "null" ]; then
        echo "[ci-wait] FAIL — could not read check state for PR #$TARGET." >&2
        exit 1
    fi

    if [ "$rollup" -eq 0 ]; then
        echo "[ci-wait] PASS — all $check_count check(s) green on PR #$TARGET @ $head_sha."
        exit 0
    else
        echo "[ci-wait] FAIL — $rollup check(s) not green on PR #$TARGET @ $head_sha:" >&2
        gh pr checks "$TARGET" --repo "$REPO" 2>&1 | grep -v $'\tpass\t' >&2 || true
        exit 1
    fi
fi

if [ "$MODE" = "branch" ]; then
    # Resolve the tip from the repo itself, NOT from `gh run list` — see BUG-64
    # note 1 in the header. This is the whole fix: the question being asked is
    # "is the current tip of this branch green", so the target commit must come
    # from the branch, never from whatever happens to have a run already.
    head_sha=$(gh api "repos/$REPO/commits/$TARGET" --jq '.sha' 2>/dev/null)
    if ! is_sha "$head_sha"; then
        echo "[ci-wait] Could not resolve tip commit for branch '$TARGET' — does it exist on the remote?" >&2
        exit 2
    fi
    echo "[ci-wait] Branch '$TARGET' is at $head_sha"

    echo "[ci-wait] Waiting for workflow runs to register for that commit (up to ${DISCOVERY_TIMEOUT}s)..."
    discovery_deadline=$(( $(date +%s) + DISCOVERY_TIMEOUT ))
    run_ids=()
    while :; do
        mapfile -t run_ids < <(gh run list --repo "$REPO" --branch "$TARGET" --limit 50 \
            --json databaseId,headSha --jq ".[] | select(.headSha == \"$head_sha\") | .databaseId")
        [ "${#run_ids[@]}" -gt 0 ] && break
        if [ "$(date +%s)" -ge "$discovery_deadline" ] || [ "$(date +%s)" -ge "$DEADLINE" ]; then
            echo "[ci-wait] FAIL — no workflow runs registered for '$TARGET' @ $head_sha within ${DISCOVERY_TIMEOUT}s." >&2
            echo "[ci-wait] Refusing to report PASS for a commit nothing has tested (BUG-64)." >&2
            exit 2
        fi
        sleep "$DISCOVERY_POLL"
    done

    # Re-query after a settle window to catch workflows that registered late.
    sleep "$SETTLE_SECONDS"
    mapfile -t settled_ids < <(gh run list --repo "$REPO" --branch "$TARGET" --limit 50 \
        --json databaseId,headSha --jq ".[] | select(.headSha == \"$head_sha\") | .databaseId")
    [ "${#settled_ids[@]}" -gt "${#run_ids[@]}" ] && run_ids=("${settled_ids[@]}")

    echo "[ci-wait] Watching ${#run_ids[@]} run(s) for $head_sha (budget $(remaining)s)..."
    overall_rc=0
    for run_id in "${run_ids[@]}"; do
        echo "[ci-wait] Watching run $run_id..."
        timeout "$(remaining)" gh run watch "$run_id" --repo "$REPO" --exit-status --interval "$INTERVAL"
        run_rc=$?
        if [ "$run_rc" -eq 124 ]; then
            echo "[ci-wait] TIMEOUT — run $run_id did not finish within the ${TIMEOUT}s budget." >&2
            exit 124
        fi
        if [ "$run_rc" -ne 0 ]; then
            overall_rc=1
        fi
    done

    # Authoritative re-check, mirroring pr mode: confirm every run for this exact
    # commit has positively concluded green, rather than trusting watch exit codes.
    not_green=$(gh run list --repo "$REPO" --branch "$TARGET" --limit 50 \
        --json headSha,status,conclusion --jq "
        [ .[]
          | select(.headSha == \"$head_sha\")
          | select((.status != \"completed\")
                   or ((.conclusion != \"success\") and (.conclusion != \"skipped\") and (.conclusion != \"neutral\")))
        ] | length" 2>/dev/null)

    if [ -z "$not_green" ] || [ "$not_green" = "null" ]; then
        echo "[ci-wait] FAIL — could not read run state for '$TARGET' @ $head_sha." >&2
        exit 1
    fi

    if [ "$overall_rc" -eq 0 ] && [ "$not_green" -eq 0 ]; then
        echo "[ci-wait] PASS — all ${#run_ids[@]} run(s) green for '$TARGET' @ $head_sha."
        exit 0
    fi

    echo "[ci-wait] FAIL — $not_green run(s) not green for '$TARGET' @ $head_sha." >&2
    gh run list --repo "$REPO" --branch "$TARGET" --limit 50 \
        --json headSha,status,conclusion,workflowName \
        --jq ".[] | select(.headSha == \"$head_sha\") | \"  \(.workflowName)\t\(.status)\t\(.conclusion // \"-\")\"" >&2 || true
    exit 1
fi

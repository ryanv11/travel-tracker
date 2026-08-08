#!/bin/bash
# PreToolUse guard — hard-block a direct `git commit` while HEAD is on a protected branch
# (main or production).
#
# Why: CLAUDE.md branch-per-brief + "COO never commits to main, ever" (incl. own doc/tracker
# edits). A real accidental direct-to-main commit happened during two concurrent COO sessions
# (open-dialogues D-13, contained by luck). `production` is even more sensitive — it is the
# prod deploy target and "agents never touch it" — so it is covered too.
#
# Scope is COMMITS, not pushes, on purpose: the prod promotion is
# `git merge --ff-only origin/main` + `git push` on production — a fast-forward, no commit —
# so it sails through untouched. Server-side GitHub branch protection stays the real gate;
# this is the local backstop against the accidental bare `git commit` on the wrong branch.
#
# Escape hatch for a genuine emergency (should be near-never): prefix the command with
# ALLOW_PROTECTED_COMMIT=1.

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$cmd" ] || exit 0

# Strip quoted strings + heredoc bodies (same discipline as block-db-push) so a commit
# MESSAGE that contains the text "git commit" cannot self-trip the guard.
stripped=$(printf '%s\n' "$cmd" | awk '
  inHd { if ($0 == hd) inHd = 0; next }
  {
    line = $0
    if (match(line, /<<-?[[:space:]]*['"'"'"]?[A-Za-z_][A-Za-z0-9_]*/)) {
      hd = substr(line, RSTART, RLENGTH); sub(/<<-?[[:space:]]*/, "", hd); gsub(/['"'"'"]/, "", hd); inHd = 1
    }
    gsub(/'"'"'[^'"'"']*'"'"'/, "", line); gsub(/"[^"]*"/, "", line); print line
  }')

# Only care about `git commit` invocations (git commit, git -C x commit, git commit -m ...).
# `commit-tree` and friends are excluded by requiring commit to end at a space or line end.
printf '%s' "$stripped" | grep -qE '(^|[;&|(]|&&|\|\||[[:space:]])git([[:space:]]+-[^[:space:]]+[[:space:]]+[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)' || exit 0

# If the SAME command creates/switches to a branch first (checkout -b / switch -c), the commit
# lands there, not on the protected branch — don't block. Keeps `git checkout -b x && git commit`
# working. Errs permissive on this edge; the target case (a bare commit on main) is still caught.
printf '%s' "$stripped" | grep -qE 'git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c)' && exit 0

# Explicit emergency override.
printf '%s' "$cmd" | grep -q 'ALLOW_PROTECTED_COMMIT' && exit 0

branch=$(git symbolic-ref --short HEAD 2>/dev/null)
case "$branch" in
  main|production)
    cat <<JSON
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked: direct commit to '$branch' is forbidden (CLAUDE.md branch-per-brief; COO never commits to main/production, incl. doc/tracker edits). Create a feat/fix/chore branch, commit there, open a PR. The prod promotion uses git merge --ff-only (no commit) and is unaffected. Genuine emergency: prefix ALLOW_PROTECTED_COMMIT=1."}}
JSON
    exit 0
    ;;
esac
exit 0

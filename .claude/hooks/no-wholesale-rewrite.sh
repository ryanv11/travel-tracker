#!/usr/bin/env bash
# PostToolUse hook (OP-28) — warns when a Write replaces an EXISTING shared-record file
# wholesale instead of amending it with Edit.
#
# Why this exists: on 2026-07-28 two concurrent Frontend agents each rewrote
# jobs/frontend/context/current.txt in full. Both rewrites were individually sensible; the
# result was a merge conflict the COO had to hand-resolve, and either agent's thread record
# would have been silently destroyed had the conflict not surfaced. Shared-record files
# exist to ACCUMULATE across many agents and sessions — a wholesale replacement of one is
# almost always a deviation, not an intended edit.
#
# PO direction (2026-07-28): "agents should never fully rewrite anything; if a full rewrite
# is required there is a fundamental issue/deviation and I'd want it double checked."
# Scoped here to shared-record paths — source-code rewrites stay allowed but must be
# DECLARED in the completion report (CLAUDE.md), since a small module legitimately changing
# in full is normal and blocking it would be noise.
#
# Warn-only, matching negative-findings-guard.sh's precedent: revisit block-vs-warn once the
# real false-positive rate is known. Silent when clean — zero tokens on the common case.

INPUT=$(cat)

result=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_name', ''))
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
    print('')
" 2>/dev/null)

TOOL=$(printf '%s' "$result" | head -1)
FILE=$(printf '%s' "$result" | sed -n '2p')

# Only Write replaces a file wholesale. Edit is surgical by construction.
[ "$TOOL" = "Write" ] || exit 0
[ -n "$FILE" ] || exit 0

# Only fires for a file that ALREADY existed — creating a new file is not a rewrite.
# PostToolUse runs after the write, so "did it exist before" is inferred from git: a path
# git already tracks existed before this tool call.
case "$FILE" in
  */jobs/*|*/_project/*|*/.planning/*|*/CLAUDE.md) ;;
  *) exit 0 ;;
esac

REPO=$(cd "$(dirname "$FILE")" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)
[ -n "$REPO" ] || exit 0

REL=${FILE#"$REPO"/}
git -C "$REPO" ls-files --error-unmatch "$REL" >/dev/null 2>&1 || exit 0

echo "no-wholesale-rewrite: $REL is a tracked shared-record file and was replaced wholesale with Write rather than amended with Edit. These files accumulate entries across agents and sessions — a full rewrite destroys other threads' records and causes merge conflicts (this happened twice: Wave 0, and again 2026-07-28 with two concurrent frontend agents). Append or amend a dated entry instead. If a full rewrite is genuinely correct here, say so explicitly in your completion report with the reason, so the COO can double-check it."

exit 0

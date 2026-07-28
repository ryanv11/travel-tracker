#!/usr/bin/env bash
# PostToolUse hook (OP-26) — warns when a Write/Edit into a deliverable or tracker note
# asserts an absence ("X does not exist / is unreachable / is not implemented") without a
# paired second-probe or UNVERIFIED marker nearby, per CLAUDE.md's negative-findings rule.
#
# Warn-only by design, not a PreToolUse block: regex against natural language will
# false-positive (e.g. an agent quoting this very rule), and a hard block would stall an
# agent mid-task for no reason. Revisit block-vs-warn once the real false-positive rate is
# known from use. Outputs nothing when clean — zero tokens on the common case, same
# convention as typecheck.sh.

WORKSPACE="/workspace"

INPUT=$(cat)

result=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    file_path = ti.get('file_path', '')
    content = ti.get('content', '') or ti.get('new_string', '') or ''
    print(file_path)
    print('---NFG-SEP---')
    print(content)
except Exception:
    print('')
    print('---NFG-SEP---')
    print('')
" 2>/dev/null)

FILE=$(printf '%s' "$result" | awk '/---NFG-SEP---/{exit} {print}')
CONTENT=$(printf '%s' "$result" | awk 'f{print} /---NFG-SEP---/{f=1}')

# Only deliverables and tracker notes — jobs/** and _project/tracker.json
case "$FILE" in
  */jobs/*|*/_project/tracker.json) ;;
  *) exit 0 ;;
esac

[ -z "$CONTENT" ] && exit 0

ABSENCE_RE='does not exist|doesn'"'"'t exist|not found|no evidence of|is unreachable|cannot be verified|can'"'"'t be verified|not implemented|never implemented|is not enabled|is disabled|no such|not present in'
PAIRING_RE='UNVERIFIED|probe 2|second probe|two independent probes|two probes'

if printf '%s' "$CONTENT" | grep -qiE "$ABSENCE_RE"; then
  if ! printf '%s' "$CONTENT" | grep -qiE "$PAIRING_RE"; then
    echo "negative-findings-guard: $FILE asserts something is missing/unreachable/not implemented but has no adjacent UNVERIFIED marker or second-probe mention. Per CLAUDE.md's negative-findings rule, confirm this with a second independent probe or mark it UNVERIFIED with the blind spot stated before treating it as fact."
  fi
fi

exit 0

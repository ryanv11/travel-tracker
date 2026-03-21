#!/usr/bin/env bash
# PostToolUse hook — logs every Write/Edit to the drift ledger.
# Tags entries with agent_type so COO can distinguish inline agent edits from COO edits.
# Silent always — never injects into agent context.

LEDGER="/workspace/.planning/drift-ledger.jsonl"

INPUT=$(cat)

FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null)

if [ -z "$FILE" ]; then
  exit 0
fi

# agent_type is present for subagent tool calls; absent for main session
AGENT_TYPE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('agent_type') or '')
except Exception:
    print('')
" 2>/dev/null)

ACTION=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_name', 'unknown').lower())
except Exception:
    print('unknown')
" 2>/dev/null)

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ -n "$AGENT_TYPE" ]; then
  printf '{"ts":"%s","action":"%s","file":"%s","agent_type":"%s"}\n' \
    "$TIMESTAMP" "$ACTION" "$FILE" "$AGENT_TYPE" >> "$LEDGER" 2>/dev/null || true
else
  printf '{"ts":"%s","action":"%s","file":"%s"}\n' \
    "$TIMESTAMP" "$ACTION" "$FILE" >> "$LEDGER" 2>/dev/null || true
fi

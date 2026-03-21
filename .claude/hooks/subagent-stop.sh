#!/usr/bin/env bash
# SubagentStop hook — writes a marker when an inline agent completes.
# This is the primary signal for COO post-spawn verification at startup.
# Silent always.

LEDGER="/workspace/.planning/drift-ledger.jsonl"

INPUT=$(cat)

AGENT_ID=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('agent_id') or '')
except Exception:
    print('')
" 2>/dev/null)

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

printf '{"ts":"%s","action":"subagent_stop","agent_id":"%s"}\n' \
  "$TIMESTAMP" "$AGENT_ID" >> "$LEDGER" 2>/dev/null || true

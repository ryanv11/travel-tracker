#!/usr/bin/env bash
# SessionEnd hook — writes the session_end sentinel automatically on every session close.
# Eliminates the need for manual sentinel writing; fires regardless of how the session ends.

LEDGER="/workspace/.planning/drift-ledger.jsonl"

INPUT=$(cat)

REASON=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('reason') or 'unknown')
except Exception:
    print('unknown')
" 2>/dev/null)

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

printf '{"ts":"%s","action":"session_end","reason":"%s"}\n' \
  "$TIMESTAMP" "$REASON" >> "$LEDGER" 2>/dev/null || true

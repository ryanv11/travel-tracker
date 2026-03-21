#!/usr/bin/env bash
# PostToolUse hook — incremental TypeScript type check on every .ts/.tsx edit.
# Reads tool data from stdin (Claude Code JSON format).
# Outputs nothing on clean; outputs tsc errors on failure.
# Appends a perf entry to typecheck-perf.log for the first week of monitoring.

WORKSPACE="/workspace"
LOG="$WORKSPACE/.claude/hooks/typecheck-perf.log"

# Parse file_path from stdin JSON
INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null)

# Only process .ts and .tsx files
if [[ "$FILE" != *.ts && "$FILE" != *.tsx ]]; then
  exit 0
fi

# Route to correct npm script based on file path
if [[ "$FILE" == *"/src/backend/"* ]] || [[ "$FILE" == */drizzle.config.ts ]]; then
  SCRIPT="type:check:backend"
  CONFIG_NAME="backend"
else
  SCRIPT="type:check"
  CONFIG_NAME="frontend"
fi

# Time the check
START_MS=$(date +%s%3N)

OUTPUT=$(cd "$WORKSPACE" && npm run "$SCRIPT" --silent 2>&1)
EXIT_CODE=$?

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

# Log perf entry (best-effort — never fail the hook on a log write error)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STATUS=$( [ "$EXIT_CODE" -eq 0 ] && echo "clean" || echo "errors" )
printf '{"ts":"%s","file":"%s","config":"%s","duration_ms":%d,"status":"%s"}\n' \
  "$TIMESTAMP" "$FILE" "$CONFIG_NAME" "$DURATION" "$STATUS" \
  >> "$LOG" 2>/dev/null || true

# Output only on error — zero tokens on clean
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "$OUTPUT"
fi

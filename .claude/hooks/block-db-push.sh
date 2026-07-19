#!/bin/bash
# PreToolUse guard (ADL-15): block every form of drizzle-kit push.
# The migrate workflow (db:generate + db:migrate) is the only sanctioned schema path —
# push bypasses the patched drizzle-kit and can corrupt/desync the migrations journal.
# Closes the gap noted in audit Session B invariant 1: the npm script was removed,
# but nothing stopped a direct `npx drizzle-kit push`.
#
# Matching is invocation-shaped: quoted strings and heredoc bodies are stripped first,
# so commit messages, issue bodies, and docs may mention db:push without tripping the
# guard (v1 blocked its own GitHub issue for this).
cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)
stripped=$(printf '%s\n' "$cmd" | awk '
  inHd { if ($0 == hd) inHd = 0; next }
  {
    line = $0
    if (match(line, /<<-?[[:space:]]*['"'"'"]?[A-Za-z_][A-Za-z0-9_]*/)) {
      hd = substr(line, RSTART, RLENGTH)
      sub(/<<-?[[:space:]]*/, "", hd)
      gsub(/['"'"'"]/, "", hd)
      inHd = 1
    }
    gsub(/'"'"'[^'"'"']*'"'"'/, "", line)
    gsub(/"[^"]*"/, "", line)
    print line
  }')
if printf '%s' "$stripped" | grep -qE '(^|[;&|([:space:]])(npx[[:space:]]+)?drizzle-kit[[:space:]]+push([[:space:]]|$)|(^|[;&|([:space:]])(npm[[:space:]]+run|yarn|pnpm([[:space:]]+run)?)[[:space:]]+db:push([[:space:]]|$)'; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by ADL-15: drizzle-kit push is forbidden in this repo. Use npm run db:generate + npm run db:migrate (CLAUDE.md > Schema changes)."}}
JSON
  exit 0
fi
exit 0

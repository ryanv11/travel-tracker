#!/usr/bin/env bash
# macOS notification bridge — container side.
#
# terminal-notifier only exists on the host Mac, not in this Linux devcontainer,
# so this hook can't call it directly. Instead it drops a small trigger file into
# /workspace/.claude/notify/queue/, which lives inside the bind-mounted project
# folder and is therefore instantly visible on the host filesystem too. A
# LaunchAgent-run watcher script on the host (see .claude/notify/host-setup/)
# polls that same path and fires the real terminal-notifier call.
#
# Wired to fire on: PreToolUse(AskUserQuestion), PreToolUse(ExitPlanMode),
# Notification, Stop — see .claude/settings.local.json.

set -euo pipefail

INPUT="$(cat)"
EVENT="$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty')"
TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')"
NOTIF_MSG="$(printf '%s' "$INPUT" | jq -r '.message // empty')"

PROJECT="$(jq -r '.name // "Claude Code project"' /workspace/package.json 2>/dev/null || echo "Claude Code project")"

case "$EVENT" in
  PreToolUse)
    case "$TOOL" in
      AskUserQuestion) CODE="question"; MSG="Claude has a question in $PROJECT" ;;
      ExitPlanMode)    CODE="plan";     MSG="Plan ready for review in $PROJECT" ;;
      *) exit 0 ;;
    esac
    ;;
  Notification)
    CODE="notify"
    MSG="${NOTIF_MSG:-Claude needs your input in $PROJECT}"
    ;;
  Stop)
    CODE="stop"
    MSG="Task completed in $PROJECT"
    ;;
  *)
    exit 0
    ;;
esac

QUEUE_DIR="/workspace/.claude/notify/queue"
mkdir -p "$QUEUE_DIR"
FILE="$QUEUE_DIR/${CODE}-$(date +%s%N)-$$.txt"
printf '%s\n' "$MSG" > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
exit 0

#!/bin/bash
# Runs on the Mac host (NOT inside the devcontainer). Watches the notify queue
# that .claude/hooks/notify.sh writes to from inside the container — that
# directory is visible here because the devcontainer bind-mounts this project
# folder straight from disk (see .devcontainer/devcontainer.json workspaceMount).
#
# Installed as a LaunchAgent — see com.ryanv.claude-notify.plist in this same
# folder for the install commands.

WATCH_DIR="/Users/ryanv/Library/CloudStorage/OneDrive-Personal/Work/ClaudeCode/my-project/.claude/notify/queue"
TERMINAL_NOTIFIER="/opt/homebrew/bin/terminal-notifier"
ICON="/Applications/Visual Studio Code.app/Contents/Resources/Code.icns"

mkdir -p "$WATCH_DIR"

while true; do
  shopt -s nullglob
  for f in "$WATCH_DIR"/*.txt; do
    base="$(basename "$f")"
    code="${base%%-*}"
    message="$(cat "$f" 2>/dev/null)"

    if [ -z "$message" ]; then
      rm -f "$f"
      continue
    fi

    # Skip the popup (but still consume the file) if VS Code is already frontmost —
    # no point interrupting when you're already looking at it.
    FRONTMOST="$(osascript -e 'tell application "System Events" to name of first application process whose frontmost is true' 2>/dev/null)"
    if [ "$FRONTMOST" = "Code" ]; then
      rm -f "$f"
      continue
    fi

    case "$code" in
      question) title="Claude Code — Question" ;;
      plan)     title="Claude Code — Plan Ready" ;;
      stop)     title="Claude Code — Done" ;;
      notify)   title="Claude Code — Needs Input" ;;
      *)        title="Claude Code" ;;
    esac

    "$TERMINAL_NOTIFIER" \
      -title "$title" \
      -message "$message" \
      -activate com.microsoft.VSCode \
      -contentImage "$ICON" \
      -sound default \
      -group "claude-code-$code"

    rm -f "$f"
  done
  sleep 1
done

#!/bin/bash
# Runs on the Mac host (NOT inside the devcontainer). Watches the notify queue
# that .claude/hooks/notify.sh writes to from inside the container — that
# directory is visible here because the devcontainer bind-mounts this project
# folder straight from disk (see .devcontainer/devcontainer.json workspaceMount).
#
# Installed as a LaunchAgent — see README.md in this same folder for the install
# steps and the host permissions it does (and does not) need.
#
# The queue path is passed in as $1 (the LaunchAgent plist supplies it), never
# hardcoded here — ADL-39's rule: no committed file may hardcode a host path.

WATCH_DIR="${1:-${CLAUDE_NOTIFY_QUEUE:-}}"
if [ -z "$WATCH_DIR" ]; then
  echo "usage: $0 <queue-dir>  (or set CLAUDE_NOTIFY_QUEUE)" >&2
  exit 64
fi
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
    # no point interrupting when you're already looking at it. Uses lsappinfo, not
    # osascript/System Events: that needs an Automation grant, which is deliberately
    # denied on the Mac mini host (see README.md).
    FRONTMOST="$(lsappinfo list 2>/dev/null | awk -F'"' '/\(in front\)/{print $2; exit}')"
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

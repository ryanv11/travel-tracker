# Host setup — macOS notification bridge (and other host-side pieces)

Everything in this folder runs on the **Mac host**, not inside the devcontainer. The container
side is `.claude/hooks/notify.sh`, which drops trigger files into `.claude/notify/queue/`; the
watcher here polls that folder through the bind mount and fires `terminal-notifier`.

> Layout below is the Mac mini install as of 2026-10-11 (reported by the host-side session that
> did the migration; the container cannot see `~` outside the repo, so the host paths are taken
> from that report, not re-verified from here).

## Install

```bash
REPO="$HOME/Projects/travel-tracker"          # wherever the repo is checked out on this Mac
HS="$REPO/.claude/notify/host-setup"

brew install terminal-notifier bash           # Homebrew bash: see "named launcher" below

# 1. The watcher script
mkdir -p ~/.local/share/travel-tracker ~/.local/bin
cp "$HS/claude-notify-watch.sh" ~/.local/share/travel-tracker/notify-watch.sh

# 2. Named launcher — a copy of Homebrew's bash under a readable name, so Login Items and
#    Activity Monitor show "travel-tracker-notify" instead of "bash". A copy of /bin/bash is
#    killed by macOS on launch; Homebrew's bash works.
cp /opt/homebrew/bin/bash ~/.local/bin/travel-tracker-notify

# 3. LaunchAgent (template — fill in the two placeholders)
sed -e "s#__HOME__#$HOME#g" -e "s#__REPO__#$REPO#g" \
  "$HS/com.travel-tracker.notify.plist" > ~/Library/LaunchAgents/com.travel-tracker.notify.plist
launchctl load ~/Library/LaunchAgents/com.travel-tracker.notify.plist
launchctl list | grep travel-tracker          # should list com.travel-tracker.notify
```

After editing `claude-notify-watch.sh` in the repo, re-run step 1 and
`launchctl kickstart -k gui/$(id -u)/com.travel-tracker.notify`.

Replaces the earlier `com.ryanv.claude-notify` LaunchAgent (`~/claude-notify-watch.sh`); unload
and delete that one if it is still present on a machine.

## Host permissions

- **No Automation grant.** The "is VS Code in front?" check uses `lsappinfo`, which needs no
  permission. The earlier version asked System Events via `osascript`, which needs Automation for
  System Events — **deliberately denied on the Mac mini** (another project on that host uses the
  denial as a control), so do not grant it. Check: `lsappinfo list | grep "in front"` prints
  `"Code"` when VS Code is frontmost.
- **Full Disk Access — probably not needed (UNVERIFIED).** It was needed when the queue lived
  under OneDrive (`~/Library/CloudStorage`, a protected location). `~/Projects` is not protected,
  but on the Mac mini bash already holds FDA for another project, so the watcher has never been
  run without it. If notifications silently stop on a new machine, grant FDA to the launcher
  before anything else.
- **Notification Center can wedge** and swallow every request with no error:
  `killall NotificationCenter usernoted`, then check the app's Alert Style is Banners/Alerts.

## Claude memory backup (separate host LaunchAgent, not in this repo)

The Claude auto-memory lives in the `claude-code-config-<devcontainerId>` Docker volume, inside
Docker Desktop's VM disk, which Time Machine excludes. So the host runs
`com.travel-tracker.memory-backup` nightly at 02:30: it copies `projects/*/memory` from any
`claude-code-config-*` volume holding a `-workspace` memory (read-only mount, no network) to
`~/Backups/travel-tracker-claude-memory/<date>-<volume id>.tgz`, keeps 90 days, prunes only after
a good run, and raises a banner if 3 days pass without a backup. Needs Docker Desktop running.
A rebuild that changes the `devcontainerId` (the ADL-39 F2 hazard) creates a new volume, which the
backup picks up automatically — and the `.tgz` files are where to restore memory from if a rebuild
comes up with it empty.

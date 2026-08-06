#!/usr/bin/env bash
# Bridge the gh CLI's auth to the LIVE VS Code dev-container git credential helper.
#
# Why this exists (diagnosed 2026-08-05):
#   - git works in this container via VS Code's dev-container credential helper
#     (/tmp/vscode-remote-containers-*.js), which VS Code re-injects on every attach and
#     which forwards to the host live.
#   - gh has a SEPARATE auth source: GH_TOKEN (empty — devcontainer.json sets it from
#     ${localEnv:GH_TOKEN}, but the host uses interactive `gh auth login`, not an env var,
#     so it resolves empty) or ~/.config/gh/hosts.yml. The gh config dir is NOT on the
#     persistent volume (only /home/node/.claude is), so it is wiped on every rebuild.
#   - Net effect: git keeps working, gh silently loses its token on rebuild.
#
# This mints a token from the same live git credential helper and logs gh in with it, so gh
# survives rebuilds with no manual re-login. Wired to devcontainer.json postAttachCommand,
# which re-runs on every attach (self-healing after a rebuild).
#
# Fail-open by design: if the helper is unavailable or returns nothing, gh simply stays
# logged out and callers can bridge inline — this must never break container attach.
set +e

TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')

if [ -n "$TOKEN" ]; then
  printf '%s' "$TOKEN" | gh auth login --with-token >/dev/null 2>&1 \
    && echo "gh-auth-bridge: gh authenticated from the git credential helper." \
    || echo "gh-auth-bridge: token minted but 'gh auth login' failed — gh left logged out."
else
  echo "gh-auth-bridge: no token from git credential helper — gh left logged out (bridge inline if needed)."
fi

exit 0

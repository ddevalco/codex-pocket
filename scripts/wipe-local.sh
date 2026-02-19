#!/usr/bin/env bash
set -euo pipefail

# CodeRelay: wipe local install + state (macOS)
#
# This script:
# - stops CodeRelay (if installed)
# - disables tailscale serve on this node (best-effort)
# - removes the launchd agent (best-effort)
# - deletes ~/.coderelay
#
# It does NOT uninstall bun or tailscale.

bold=$'\033[1m'
reset=$'\033[0m'
step() { echo "${bold}$*${reset}"; }

TS_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
PLIST="$HOME/Library/LaunchAgents/com.codex.pocket.plist"

step "Stopping CodeRelay (if present)"
if [[ -x "$HOME/.coderelay/bin/coderelay" ]]; then
  "$HOME/.coderelay/bin/coderelay" stop 2>/dev/null || true
fi

step "Disabling Tailscale Serve on this node (best-effort)"
if [[ -x "$TS_BIN" ]]; then
  "$TS_BIN" serve --https=443 off 2>/dev/null || true
  "$TS_BIN" serve --tcp=443 off 2>/dev/null || true
fi

step "Removing launchd agent (best-effort)"
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST" 2>/dev/null || true

step "Removing CodeRelay state (~/.coderelay)"
rm -rf "$HOME/.coderelay"

echo ""
echo "Wipe complete."

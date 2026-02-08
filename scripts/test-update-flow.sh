#!/usr/bin/env bash
set -euo pipefail

# Local regression test for the `codex-pocket update` flow.
# Runs everything under a temp HOME + CODEX_POCKET_HOME so it does NOT touch ~/.codex-pocket
# or ~/Library/LaunchAgents.

ROOT_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Prefer /tmp to avoid any macOS per-user tempdir oddities.
TMP="$(mktemp -d -p /tmp codex-pocket-update-test.XXXXXX)"
FAKE_HOME="$TMP/fake-home"
APP_HOME="$TMP/codex-pocket-home"
ORIGIN="$TMP/origin.git"

PORT=18790
APORT=18788
TOKEN="test-token-$(date +%s)"

cleanup() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null || true
  fi
  rm -rf "$TMP" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$FAKE_HOME" "$APP_HOME" "$APP_HOME/bin" "$TMP/tmp"

# Make sure anything that uses temp files (bun, node tooling, etc.) has a writable tempdir.
export TMPDIR="$TMP/tmp"

# Create a local "origin" so update can git fetch/pull without network.
git clone --bare "$ROOT_REPO" "$ORIGIN" >/dev/null 2>&1

git clone "$ORIGIN" "$APP_HOME/app" >/dev/null 2>&1

# Install CLI into the test home.
cp "$ROOT_REPO/bin/codex-pocket" "$APP_HOME/bin/codex-pocket"
chmod +x "$APP_HOME/bin/codex-pocket"

cat > "$APP_HOME/config.json" <<JSON
{
  "host": "127.0.0.1",
  "port": $PORT,
  "token": "$TOKEN",
  "publicOrigin": "",
  "db": "$APP_HOME/codex-pocket.db",
  "retentionDays": 1,
  "anchor": {"port": $APORT}
}
JSON

echo "Running update in isolated test home: $APP_HOME"

env \
  HOME="$FAKE_HOME" \
  CODEX_POCKET_HOME="$APP_HOME" \
  PATH="$PATH" \
  TMPDIR="$TMPDIR" \
  "$APP_HOME/bin/codex-pocket" update

# Validate service comes up.
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null

echo "OK: update flow test passed"

#!/usr/bin/env bash
set -euo pipefail

# Local regression test for the `codex-pocket update` flow.
# Runs everything under a temp HOME + CODEX_POCKET_HOME so it does NOT touch ~/.codex-pocket
# or ~/Library/LaunchAgents.

ROOT_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Use a temp root under the repo so we can force TMPDIR to a guaranteed-writable location.
# This test cleans up after itself and does NOT touch ~/.codex-pocket.
TMP_ROOT="${CODEX_POCKET_TEST_TMP_ROOT:-$ROOT_REPO/.tmp}"
mkdir -p "$TMP_ROOT"
TMP="$(mktemp -d -p "$TMP_ROOT" codex-pocket-update-test.XXXXXX)"
FAKE_HOME="$TMP/fake-home"
APP_HOME="$TMP/codex-pocket-home"
ORIGIN="$TMP/origin.git"

alloc_port() {
  local i p

  for i in $(seq 1 50); do
    p=$((20000 + (RANDOM % 40000)))
    if command -v lsof >/dev/null 2>&1; then
      if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "$p"
        return 0
      fi
    else
      echo "$p"
      return 0
    fi
  done

  # Fall back to an unlikely-but-fixed port if we somehow can't find a free one.
  echo "18790"
}

PORT="$(alloc_port)"
APORT="$(alloc_port)"
if [[ "$APORT" == "$PORT" ]]; then
  APORT=$((PORT + 1))
fi
DEFAULT_GUARD_PORT=8790
TOKEN="test-token-$(date +%s)"
OWNED_STALE_PID=""
OWNED_STUBBORN_PID=""
DEFAULT_GUARD_PID=""

cleanup() {
  if command -v lsof >/dev/null 2>&1; then
    if [[ -n "${OWNED_STALE_PID:-}" ]]; then
      kill "$OWNED_STALE_PID" 2>/dev/null || true
    fi
    if [[ -n "${DEFAULT_GUARD_PID:-}" ]]; then
      kill "$DEFAULT_GUARD_PID" 2>/dev/null || true
    fi
    if [[ -n "${OWNED_STUBBORN_PID:-}" ]]; then
      kill "$OWNED_STUBBORN_PID" 2>/dev/null || true
    fi

    local pids
    pids="$(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids:-}" ]]; then
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
    fi

    pids="$(lsof -nP -t -iTCP:"$APORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids:-}" ]]; then
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
    fi
  fi
  if [[ "${KEEP_TMP:-0}" == "1" ]]; then
    echo "KEEP_TMP=1; leaving temp dir at $TMP"
    return 0
  fi
  rm -rf "$TMP" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$FAKE_HOME" "$APP_HOME" "$APP_HOME/bin" "$TMP/tmp"

# Make sure anything that uses temp files (bun, node tooling, etc.) has a writable tempdir.
export TMPDIR="$TMP/tmp"

# Bun uses a global cache under ~/.bun by default; in sandboxed environments that may be unwritable.
# Wrap bun so `bun install` uses a cache dir under this test temp root.
REAL_BUN="$(command -v bun || true)"
if [[ -z "${REAL_BUN:-}" ]]; then
  echo "bun: missing" >&2
  exit 1
fi

mkdir -p "$TMP/bun-cache" "$TMP/bin"
cat >"$TMP/bin/bun" <<SH
#!/usr/bin/env bash
set -euo pipefail
REAL="$REAL_BUN"
CACHE="$TMP/bun-cache"
if [[ "\${1:-}" == "install" ]]; then
  shift
  exec "\$REAL" install --cache-dir "\$CACHE" "\$@"
fi
exec "\$REAL" "\$@"
SH
chmod +x "$TMP/bin/bun"
export PATH="$TMP/bin:$PATH"

# Create a local "origin" so update can git fetch/pull without network.
git clone --bare "$ROOT_REPO" "$ORIGIN" >/dev/null 2>&1

git clone "$ORIGIN" "$APP_HOME/app" >/dev/null 2>&1

# Seed node_modules from the current checkout so this regression test can run offline.
# This keeps the test focused on the update/restart logic rather than npm/network availability.
if [[ -d "$ROOT_REPO/node_modules" ]]; then
  echo "Seeding node_modules (to avoid network during bun install)..."
  if ! cp -cR "$ROOT_REPO/node_modules" "$APP_HOME/app/node_modules" 2>/dev/null; then
    cp -R "$ROOT_REPO/node_modules" "$APP_HOME/app/node_modules"
  fi
fi

# Install CLI into the test home.
# Install a stable wrapper so `codex-pocket` always uses the current repo version.
cat >"$APP_HOME/bin/codex-pocket" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${CODEX_POCKET_HOME:-$HOME/.codex-pocket}"
exec "$APP_DIR/app/bin/codex-pocket" "$@"
SH
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

wait_listen() {
  local port="$1"
  local i
  for i in $(seq 1 40); do
    if lsof -nP -t -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

pid_listening_on() {
  local port="$1"
  lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

start_default_guard_listener() {
  # Optional guard: when available, ensure update logic does not kill listeners on the default
  # 8790 unless that port is actually configured.
  if lsof -nP -t -iTCP:"$DEFAULT_GUARD_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Note: skipping default-port guard listener; $DEFAULT_GUARD_PORT already in use."
    return 0
  fi
  (
    cd "$TMP"
    python3 -m http.server "$DEFAULT_GUARD_PORT" >/dev/null 2>&1 &
    echo $! > "$TMP/default-guard.pid"
  )
  DEFAULT_GUARD_PID="$(cat "$TMP/default-guard.pid")"
  wait_listen "$DEFAULT_GUARD_PORT"
}

start_owned_stale_listener() {
  # Simulate a stale Pocket-owned process holding the configured local-orbit port.
  (
    cd "$APP_HOME/app"
    python3 -m http.server "$PORT" >/dev/null 2>&1 &
    echo $! > "$TMP/owned-stale.pid"
  )
  OWNED_STALE_PID="$(cat "$TMP/owned-stale.pid")"
  wait_listen "$PORT"
}

start_owned_stubborn_listener() {
  # Simulate an owned listener that ignores SIGTERM (requires SIGKILL cleanup path).
  (
    cd "$APP_HOME/app"
    python3 - "$APORT" >/dev/null 2>&1 <<'PY' &
import http.server, signal, socketserver, sys
signal.signal(signal.SIGTERM, signal.SIG_IGN)
port = int(sys.argv[1])
with socketserver.TCPServer(("127.0.0.1", port), http.server.SimpleHTTPRequestHandler) as httpd:
  httpd.serve_forever()
PY
    echo $! > "$TMP/owned-stubborn.pid"
  )
  OWNED_STUBBORN_PID="$(cat "$TMP/owned-stubborn.pid")"
  wait_listen "$APORT"
}

if command -v lsof >/dev/null 2>&1; then
  start_default_guard_listener
  start_owned_stale_listener
  start_owned_stubborn_listener
else
  echo "Note: lsof missing; skipping stale-listener simulation checks."
fi

env \
  HOME="$FAKE_HOME" \
  CODEX_POCKET_HOME="$APP_HOME" \
  PATH="$PATH" \
  TMPDIR="$TMPDIR" \
  "$APP_HOME/bin/codex-pocket" update

# Verify the stale owned listener is gone (update stop/start cleanup should remove it).
if command -v lsof >/dev/null 2>&1; then
  if [[ -n "${OWNED_STALE_PID:-}" ]] && ps -p "$OWNED_STALE_PID" >/dev/null 2>&1; then
    current_pid="$(pid_listening_on "$PORT")"
    if [[ -n "${current_pid:-}" && "$current_pid" == "$OWNED_STALE_PID" ]]; then
      echo "FAIL: stale owned listener survived update on configured port $PORT" >&2
      exit 1
    fi
  fi
  if [[ -n "${OWNED_STUBBORN_PID:-}" ]] && ps -p "$OWNED_STUBBORN_PID" >/dev/null 2>&1; then
    echo "FAIL: TERM-ignoring owned listener survived update on configured anchor port $APORT" >&2
    exit 1
  fi

  # If we could allocate the default-port guard, it must survive update because configured port is not 8790.
  if [[ -n "${DEFAULT_GUARD_PID:-}" ]] && ! ps -p "$DEFAULT_GUARD_PID" >/dev/null 2>&1; then
    echo "FAIL: default-port guard listener on $DEFAULT_GUARD_PORT was killed unexpectedly" >&2
    exit 1
  fi
fi

# Validate service comes up.
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null

echo "OK: update flow test passed"

# CLI

The `codex-pocket` CLI manages the service and talks to the local Admin API.

Binary location after install:
- `~/.codex-pocket/bin/codex-pocket` (wrapper that delegates to the repo copy in `~/.codex-pocket/app/bin/codex-pocket`)

## Running the CLI

Preferred (installed copy):

```bash
codex-pocket summary
```

If your shell says `command not found`, either:

- call it directly: `~/.codex-pocket/bin/codex-pocket summary`, or
- add it to PATH (`~/.zshrc` on macOS zsh):

```bash
echo 'export PATH="$HOME/.codex-pocket/bin:$PATH"' >> ~/.zshrc
exec zsh
```

Repo-local development usage:

```bash
./bin/codex-pocket summary
```

Inside the `bin/` directory, use `./codex-pocket` (shells do not run `.` by default).

Custom home installs (`CODEX_POCKET_HOME`) use:

```bash
$CODEX_POCKET_HOME/bin/codex-pocket summary
```

## Most-Used Commands

- `codex-pocket summary`
  - Prints URLs, logs, token prefix, DB path, uploads dir.

- `codex-pocket restart`
  - Stop/start and wait for `GET /health`.

- `codex-pocket ensure`
  - Best-effort self-heal: restart if needed, validate, run safe repairs, re-validate.

- `codex-pocket diagnose`
  - One command bug report (versions, ports, tailscale serve status, log tails).
  - Warns if the upstream Codex app-server auth token is invalid.

## Commands

- `codex-pocket doctor`
  - Checks dependencies and basic reachability.
  - Safe: does not modify the machine.

- `codex-pocket start`
  - Starts the service using `launchd` (agent: `com.codex.pocket`).
  - If `launchctl` is blocked (common on managed/MDM Macs), it falls back to a background process.

- `codex-pocket stop`
  - Stops the `launchd` agent.
  - Also kills any stray Codex Pocket listeners it owns (port safety net).

- `codex-pocket restart`
  - Equivalent of `stop` + `start`, then waits for `GET /health`.

- `codex-pocket status`
  - Prints `/admin/status` JSON (includes anchor auth status).

- `codex-pocket logs [anchor|server]`
  - Prints logs via the Admin API.

- `codex-pocket token`
  - Prints the current **Access Token** from `~/.codex-pocket/config.json`.
  - Use this when `/admin` asks you to sign in again.

- `codex-pocket urls`
  - Prints the current local and tailnet URLs from config.

- `codex-pocket pair`
  - Mints a short-lived pairing code (same as clicking “New pairing code” in `/admin`).

- `codex-pocket open-admin`
  - Opens the Admin page in your default browser.

- `codex-pocket smoke-test`
  - Fast PASS/FAIL check against `GET /health` and the Admin validation endpoint.
  - Also verifies the events replay endpoint returns NDJSON (this is the data path that populates thread history).

- `codex-pocket self-test`
  - Stricter test suite intended to catch “blank threads” regressions.
  - Requires WebSocket relay (client+anchor) to be working.

- `codex-pocket ensure`
  - Runs:
  - Validate (`/admin/validate`)
  - Safe repair (`/admin/repair`) when needed
  - Re-validate

- `codex-pocket update`
  - Updates the installed app in `~/.codex-pocket/app` (git pull), rebuilds the UI, then restarts.
  - Runs `codex-pocket ensure` and `codex-pocket smoke-test` after restart.
  - Always prints a final `codex-pocket summary` so you can quickly copy URLs/token/log paths.
  - Returns non-zero if post-update checks fail (next: `codex-pocket diagnose`).
  - If your install uses a non-default port (because the installer detected a conflict), the CLI uses the configured port.
  - After updating, clients may need a hard refresh (`Cmd+Shift+R`) if the browser cached a bad bundle.

## Config

The CLI reads:
- `~/.codex-pocket/config.json`

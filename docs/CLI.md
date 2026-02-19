# CLI

The `coderelay` CLI manages the service and talks to the local Admin API.

Binary location after install:

- `~/.coderelay/bin/coderelay` (wrapper that delegates to the repo copy in `~/.coderelay/app/bin/coderelay`)

## Running the CLI

Preferred (installed copy):

```bash
coderelay summary
```

If your shell says `command not found`, either:

- call it directly: `~/.coderelay/bin/coderelay summary`, or
- add it to PATH (`~/.zshrc` on macOS zsh):

```bash
echo 'export PATH="$HOME/.coderelay/bin:$PATH"' >> ~/.zshrc
exec zsh
```

Repo-local development usage:

```bash
./bin/coderelay summary
```

Inside the `bin/` directory, use `./coderelay` (shells do not run `.` by default).

Custom home installs (`CODEX_POCKET_HOME`) use:

```bash
$CODEX_POCKET_HOME/bin/coderelay summary
```

## Most-Used Commands

- `coderelay summary`
  - Prints URLs, logs, token prefix, DB path, uploads dir.

- `coderelay restart`
  - Stop/start and wait for `GET /health`.

- `coderelay ensure`
  - Best-effort self-heal: restart if needed, validate, run safe repairs, re-validate.

- `coderelay diagnose`
  - One command bug report (versions, ports, tailscale serve status, log tails).
  - Warns if the upstream Codex app-server auth token is invalid.

## Commands

- `coderelay doctor`
  - Checks dependencies and basic reachability.
  - Safe: does not modify the machine.

- `coderelay start`
  - Starts the service using `launchd` (agent: `com.codex.pocket`).
  - If `launchctl` is blocked (common on managed/MDM Macs), it falls back to a background process.

- `coderelay stop`
  - Stops the `launchd` agent.
  - Also kills any stray CodeRelay listeners it owns (port safety net).

- `coderelay restart`
  - Equivalent of `stop` + `start`, then waits for `GET /health`.

- `coderelay status`
  - Prints `/admin/status` JSON (includes anchor auth status).

- `coderelay logs [anchor|server]`
  - Prints logs via the Admin API.

- `coderelay token`
  - Prints the current **Access Token** from `~/.coderelay/config.json`.
  - Use this when `/admin` asks you to sign in again.

- `coderelay urls`
  - Prints the current local and tailnet URLs from config.

- `coderelay pair`
  - Mints a short-lived pairing code (same as clicking “New pairing code” in `/admin`).

- `coderelay open-admin`
  - Opens the Admin page in your default browser.

- `coderelay smoke-test`
  - Fast PASS/FAIL check against `GET /health` and the Admin validation endpoint.
  - Also verifies the events replay endpoint returns NDJSON (this is the data path that populates thread history).

- `coderelay self-test`
  - Stricter test suite intended to catch “blank threads” regressions.
  - Requires WebSocket relay (client+anchor) to be working.

- `coderelay ensure`
  - Runs:
  - Validate (`/admin/validate`)
  - Safe repair (`/admin/repair`) when needed
  - Re-validate

- `coderelay update`
  - Updates the installed app in `~/.coderelay/app` (git pull), rebuilds the UI, then restarts.
  - Runs `coderelay ensure` and `coderelay smoke-test` after restart.
  - Always prints a final `coderelay summary` so you can quickly copy URLs/token/log paths.
  - Returns non-zero if post-update checks fail (next: `coderelay diagnose`).
  - If your install uses a non-default port (because the installer detected a conflict), the CLI uses the configured port.
  - After updating, clients may need a hard refresh (`Cmd+Shift+R`) if the browser cached a bad bundle.

## Config

The CLI reads:

- `~/.coderelay/config.json`

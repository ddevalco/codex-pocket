# CLI

The `codex-remote` CLI manages the service and calls the admin API.

## Commands

- `codex-remote doctor`
  - Checks dependencies and service reachability.

- `codex-remote start`
  - Starts the launchd agent (`com.codex.remote`).

- `codex-remote stop`
  - Stops the launchd agent.

- `codex-remote status`
  - Prints `/admin/status` JSON.

- `codex-remote logs [anchor]`
  - Prints `/admin/logs?service=anchor`.

- `codex-remote pair`
  - Prints a one-time pairing URL (same as clicking "New pairing code" in `/admin`).

## Config

The CLI reads:
- `~/.zane-local/config.json`


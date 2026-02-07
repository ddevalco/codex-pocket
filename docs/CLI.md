# CLI

The `codex-pocket` CLI manages the service and calls the admin API.

## Commands

- `codex-pocket doctor`
  - Checks dependencies and service reachability.
  - Does not change your machine; safe to run any time.

- `codex-pocket start`
  - Starts the launchd agent (`com.codex.pocket`).
  - If `launchctl` is blocked (common on managed/MDM Macs), it falls back to a background process.

- `codex-pocket stop`
  - Stops the launchd agent.
  - Also kills any stray Codex Pocket listeners it owns (port safety net).

- `codex-pocket status`
  - Prints `/admin/status` JSON.

- `codex-pocket logs [anchor]`
  - Prints `/admin/logs?service=anchor`.

- `codex-pocket pair`
  - Prints a one-time pairing URL (same as clicking "New pairing code" in `/admin`).

- `codex-pocket token`
  - Prints the current **Access Token** from `~/.codex-pocket/config.json`.
  - Useful if `/admin` asks you to sign in again.

- `codex-pocket urls`
  - Prints the current local and tailnet URLs from config (Local/Admin/Tailnet/Tailnet Admin).

- `codex-pocket diagnose`
  - Prints a single diagnostic report (versions, health, ports, tailscale status/serve status, log tails).
  - This is the command to run before filing a bug report.

- `codex-pocket update`
  - Updates the installed app in `~/.codex-pocket/app` (git pull), rebuilds the UI, then restarts the service.
  - If your install uses a non-default port (because the installer detected a conflict), the CLI now starts the service on that configured port.

## Config

The CLI reads:
- `~/.codex-pocket/config.json`

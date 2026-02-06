# Configuration

Codex Remote is configured primarily via environment variables (set by the installer/launchd) and a small local config file used by the CLI.

## Config File

Path:
- `~/.zane-local/config.json`

Written by:
- `scripts/install-local.sh`

Fields:
- `token` (string): bearer token used by the web UI and admin API.
- `host` (string): host local-orbit listens on (default `127.0.0.1`).
- `port` (number): port local-orbit listens on (default `8790`).
- `db` (string): SQLite DB path (default `~/.zane-local/zane.db`).
- `retentionDays` (number): event retention.
- `uiDist` (string): path to built web UI (`dist/`).
- `anchor.cwd` (string): working directory for Anchor.
- `anchor.host` (string): host Anchor binds to (default `127.0.0.1`).
- `anchor.port` (number): port Anchor binds to (default `8788`).
- `anchor.log` (string): Anchor log file path.

Note: the service itself does not currently read `config.json` directly. It is used by the `codex-remote` CLI.

## Environment Variables

These are read by `services/local-orbit/src/index.ts`:

- `ZANE_LOCAL_TOKEN` (required)
  - Shared bearer token.

- `ZANE_LOCAL_HOST` (default `127.0.0.1`)
- `ZANE_LOCAL_PORT` (default `8790`)
- `ZANE_LOCAL_UI_DIST_DIR` (default `<repo>/dist`)

Persistence:
- `ZANE_LOCAL_DB` (default `~/.zane-local/zane.db`)
- `ZANE_LOCAL_RETENTION_DAYS` (default `14`)

Anchor management:
- `ZANE_LOCAL_AUTOSTART_ANCHOR` (default `1`)
  - Set to `0` to disable auto-start.
- `ZANE_LOCAL_ANCHOR_CWD` (default `<repo>/services/anchor`)
- `ZANE_LOCAL_ANCHOR_CMD` (default `bun`)
- `ZANE_LOCAL_ANCHOR_ARGS` (default `run src/index.ts`)
- `ZANE_LOCAL_ANCHOR_LOG` (default `~/.zane-local/anchor.log`)
- `ANCHOR_HOST` (default `127.0.0.1`)
- `ANCHOR_PORT` (default `8788`)

Pairing:
- `ZANE_LOCAL_PAIR_TTL_SEC` (default `300`)


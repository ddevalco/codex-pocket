# Development

This repo contains:
- A Svelte (Vite) web UI in `src/`.
- A Bun-based local server (`local-orbit`) in `services/local-orbit/`.
- A Bun-based local agent (`anchor`) in `services/anchor/`.

## Prereqs

- Bun

## Install

```bash
bun install
```

## Run UI (dev)

```bash
bun run dev
```

This starts Vite for local UI development.

## Build UI

```bash
bun run build
```

Output goes to `dist/`.

## Repo Hygiene

Agent artifacts are local-only. Do not commit agent prompts, notes, or rule sets.
Ignored by default: `.agents/`, `AGENT*.md`, `agent*.md`, `.agent/`, `prompts/`, `notes/`.

## Git Sync Policy

Keep `main` aligned with remote and avoid merge commits from `git pull`:

```bash
git fetch origin --prune
git checkout main
git pull --ff-only origin main
```

Recommended local defaults:

```bash
git config --global pull.ff only
git config --global fetch.prune true
```

Before tagging/releasing from your machine, verify a clean tree:

```bash
./scripts/ci/check-clean-tree.sh
```

## Run Local-Orbit (server)

Local-Orbit requires an access token.

Example:

```bash
export ZANE_LOCAL_TOKEN='dev-token'
export ZANE_LOCAL_PORT='8790'
export ZANE_LOCAL_HOST='127.0.0.1'
export ZANE_LOCAL_UI_DIST_DIR="$PWD/dist"

bun run services/local-orbit/src/index.ts
```

Notes:
- By default, local-orbit attempts to autostart the Anchor. To disable that while working on server-only behavior:

```bash
export ZANE_LOCAL_AUTOSTART_ANCHOR='0'
```

## CI

GitHub Actions runs on every push/PR:
- installs deps
- builds UI
- starts local-orbit with a dummy token (Anchor autostart disabled)
- smoke checks:
  - `/health`
  - `/admin/status` (with Authorization header)
  - cache headers: `/app` should be `no-store`, `/assets/*` should be immutable
  - `/events/<threadId>` returns NDJSON

Workflow file: `.github/workflows/ci.yml`.

# Changelog

All notable changes to **Codex Pocket** will be documented here.

This project started as a local-only fork inspired by **Zane** by Z. Siddiqi. See `docs/ATTRIBUTION.md`.

## Unreleased

### CLI / Update
- `codex-pocket update` now always prints a final `summary` and exits non-zero if `ensure` or `smoke-test` fail (next: `codex-pocket diagnose`).
- Config parsing is now validated early to avoid Python stack traces when config.json is empty/corrupt.
- Added a local update-flow regression script: `scripts/test-update-flow.sh`.

## 2026-02-08

### Stability
- Fixed a web UI runtime crash where the message “copy” button referenced an undefined `copyState`, causing blank threads and broken navigation. (commit `9513c3c`)

### Docs
- Expanded CLI and troubleshooting docs.
- Added `BACKLOG.md` and `docs/DIFFERENCES_FROM_ZANE.md`.

## 2026-02-07

### Thread Titles / Rename Sync
- Thread list titles now match Codex Desktop renamed titles by reading `~/.codex/.codex-global-state.json` and injecting `title/name/displayName` into `thread/list` + `thread/read` payloads. (commits `74db0ba`, `93c2702`)
- Added a thread rename action in Codex Pocket that updates Codex Desktop's title store (Admin token required). (commit `133d3da`)

### Vision / Attachments
- **Vision attachments**: image uploads are passed to Codex app-server as structured `input` items (in addition to rendering inline in the UI), making attached images available to vision-capable models. (commit `5d58e60`)
- Uploads API returns `localPath`, `filename`, and `mime` (authorised only) to support attachment wiring. (commit `5d58e60`)

### Branding
- Replaced the legacy Zane favicon with a Codex Pocket icon (`/icons/icon.svg`). (commit `01ba786`)

### iOS Upload UX
- iOS Safari shows the Photo Library picker for attachments by removing the `capture` attribute that forced camera-only. (commit `dc14c32`)

### Admin: Upload Retention & Ops
- Admin UI includes an Uploads section for retention config + manual prune, with status refresh after actions. (commits `e0247e1`, `a02f3eb`)

### Concurrency
- Fixed a global “turn in progress” state that blocked composing in other threads while one thread was running. Thread input is now tracked per-thread. (commit `e58cdd6`)

### CLI / Lifecycle
- Added `codex-pocket update`: pulls latest app, installs deps, rebuilds UI, restarts service. (commit `a2b4450`)
- Improved `start/stop/restart` reliability: auto-kill stale Codex Pocket listeners, wait for `/health`, and handle common port conflict cases. (commits `27aa998`, `6d2c959`)

### Installer UX & Reliability
- Installer improved to handle port conflicts more safely and persist port changes across config + launchd. (commit `a02f3eb`)
- Installer copies the access token to clipboard (best effort). (commit `defd262`)
- Pairing: QR served as an authenticated blob so the token doesn’t appear in image URLs. (commit `f462238`)

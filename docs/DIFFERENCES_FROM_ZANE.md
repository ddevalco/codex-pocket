# Differences From Zane

Codex Pocket started as a local-only fork inspired by Zane (credit: Z. Siddiqi).

Codex Pocket’s goal is narrower and more opinionated:
- Run Codex locally on macOS.
- Access it from iPhone (and other devices) securely.
- Avoid public internet exposure.
- Prefer a “single-node” deployment with as little infrastructure as possible.

## High-Level Differences

- No Cloudflare dependency
  - Zane’s default architecture expects Cloudflare components (Orbit/Auth style flows).
  - Codex Pocket replaces that with a single local server (`local-orbit`) plus a shared token.

- Tailnet-first (Tailscale) exposure
  - The service binds to `127.0.0.1`.
  - Remote access is intended via `tailscale serve` so it stays inside your tailnet.

- Simplified auth + pairing
  - One bearer Access Token protects WebSocket + admin endpoints.
  - `/admin` can mint short-lived one-time pairing codes and present them as QR.

- Installer + lifecycle UX
  - One-line macOS installer that builds UI, writes config under `~/.codex-pocket`, attempts `launchd`, and falls back to background mode if `launchctl` is blocked.
  - CLI tooling for start/stop/restart/update/diagnose/ensure.

- Local persistence
  - Selected events are stored in local SQLite with retention.

- Update reliability + anti-regression tooling
  - `codex-pocket ensure` / `smoke-test` / `self-test` help validate a node quickly and catch regressions like “blank threads”.
  - GitHub Actions CI runs build + smoke tests on pushes/PRs to catch breakages early.
  - `index.html` is served with `Cache-Control: no-store` to reduce cached broken bundle issues after updates.

- Attachments
  - Local uploads stored on disk and served as capability URLs (`/u/<token>`).
  - Images can be forwarded to Codex app-server as structured attachments so vision-capable models can consume pixels.

- Thread titles
  - Codex Pocket reads Codex Desktop’s local title store so renamed thread titles show in Pocket.
  - Pocket can rename by updating that same store (Admin-token protected).

- Export/share + copy UX
  - Export/share threads as Markdown/JSON (including iOS-friendly share-sheet behavior).
  - Improved message/tool output copy behavior, including a clipboard fallback for `http://` origins.

## What Stayed Similar

- The “orbit/anchor” conceptual split.
- The web UI style and many UI components.

## Attribution

See `docs/ATTRIBUTION.md`.

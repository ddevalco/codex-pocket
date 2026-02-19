# Differences From Zane

Codex Pocket started as a local-only fork inspired by Zane (credit: Z. Siddiqi).

Codex Pocket’s goal is narrower and more opinionated:

- Run Codex locally on macOS.
- Access it from iPhone (and other devices) securely.
- Avoid public internet exposure.
- Prefer a “single-node” deployment with as little infrastructure as possible.

## High-Level Differences

- **Multi-provider architecture with capability detection**
  - Zane is Codex-only with static feature assumptions.
  - Codex Pocket supports multiple AI providers (Codex, GitHub Copilot ACP) through a unified adapter interface.
  - **Capability Matrix**: Each provider declares capabilities (`CAN_ATTACH_FILES`, `CAN_FILTER_HISTORY`, `SUPPORTS_APPROVALS`, `SUPPORTS_STREAMING`) dynamically.
  - **Graceful Degradation**: UI elements automatically disable when capabilities are unavailable, with tooltips explaining why (no broken interactions).

- **No Cloudflare dependency**
  - Zane's default architecture expects Cloudflare components (Orbit/Auth style flows).
  - Codex Pocket replaces that with a single local server (`local-orbit`) plus token-based authentication.

- **Tailnet-first (Tailscale) exposure**
  - The service binds to `127.0.0.1`.
  - Remote access is intended via `tailscale serve` so it stays inside your tailnet.

- **Token-based auth + pairing**
  - Legacy Access Token for bootstrap/admin access.
  - Per-device token sessions (create/list/revoke in `/admin`).
  - Session tokens support read-only mode with server-side enforcement.
  - Pairing QR codes mint unique per-device tokens (not shared legacy token).
  - `/admin` can mint short-lived one-time pairing codes and present them as QR.

- **Approval workflows**
  - Interactive tool permission prompts (shell commands, file operations).
  - Persistent approval policies: "Always allow" or "Always reject" specific tools.
  - Auto-approve mode detection with warning banners.
  - Policy management UI in Settings.

- **Advanced filtering + views**
  - Filter threads by provider (All, Codex, Copilot).
  - Filter threads by status (All, Active, Archived).
  - Filter state persists across sessions via localStorage.
  - Live thread counts on filter chips.

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

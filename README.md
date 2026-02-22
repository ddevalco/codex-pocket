# CodeRelay

![ci](https://github.com/ddevalco/coderelay/actions/workflows/ci.yml/badge.svg)

Remote control for your local Codex on your Mac from your iPhone.

This project started as a local-only fork of Zane (credit: <https://github.com/z-siddiqi/zane>):

- No Cloudflare
- No public internet exposure required
- Local persistence via SQLite

## First-Time Setup (Checklist)

1. Create a (free) Tailscale account: <https://tailscale.com/>
2. Install Tailscale on your Mac + iPhone and sign in to both.
3. Install CodeRelay on your Mac:

```bash
curl -fsSL https://raw.githubusercontent.com/ddevalco/coderelay/main/scripts/install-local.sh | bash
```

1. Expose it on your tailnet (Mac):

```bash
tailscale up
tailscale serve --bg http://127.0.0.1:8790
```

1. Pair your iPhone:

- On Mac: open `http://127.0.0.1:8790/admin` and sign in with your **Access Token**.
- Scan the pairing QR with your iPhone.

If anything doesn’t work, run:

```bash
~/.coderelay/bin/coderelay ensure
```

### Docs

- Install: [`docs/INSTALL.md`](docs/INSTALL.md)
- CLI: [`docs/CLI.md`](docs/CLI.md)
- Admin: [`docs/ADMIN.md`](docs/ADMIN.md)
- Troubleshooting/FAQ: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)
- Provider Troubleshooting: [`docs/TROUBLESHOOTING_PROVIDERS.md`](docs/TROUBLESHOOTING_PROVIDERS.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- CI: [`docs/CI.md`](docs/CI.md)
- Native iOS roadmap: [`docs/NATIVE_IOS_ROADMAP.md`](docs/NATIVE_IOS_ROADMAP.md)
- Differences from Zane: [`docs/DIFFERENCES_FROM_ZANE.md`](docs/DIFFERENCES_FROM_ZANE.md)
- Development: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
- Testing playbook: [`docs/TESTING.md`](docs/TESTING.md)
- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)

### Backlog (Canonical)

We track the canonical backlog in GitHub Projects:

- <https://github.com/users/ddevalco/projects/2>

### Issues (Canonical)

All bugs, features, and reliability work are tracked as GitHub Issues:

- <https://github.com/ddevalco/coderelay/issues>

Workflow rules:

- Open an issue before starting work.
- Link every PR to an issue (`Fixes #...` or `Refs #...`).
- Keep issue status in sync with Project 2.

Prioritized engineering recommendations are maintained in:

- [`docs/RECOMMENDATIONS.md`](docs/RECOMMENDATIONS.md)

## Common First-Run Issues

- **`coderelay: command not found`**
  - The CLI is installed at `~/.coderelay/bin/coderelay`.
  - Quick run: `~/.coderelay/bin/coderelay summary`
  - Add to PATH (zsh):
    - `echo 'export PATH="$HOME/.coderelay/bin:$PATH"' >> ~/.zshrc`
    - `exec zsh`
  - From this repo, run `./bin/coderelay ...` (if you `cd bin`, use `./coderelay`, not `coderelay`).

- **"Serve is not enabled on your tailnet"**
  - Tailscale may require you to explicitly enable Serve in your tailnet admin settings.
  - Run `tailscale serve --bg http://127.0.0.1:8790` and follow the link Tailscale prints to enable Serve.

- **Admin shows "Failed to fetch" or stays on "Loading..."**
  - The browser can’t reach the local server.
  - Run `~/.coderelay/bin/coderelay ensure`.

- **Admin asks for the Access Token again**
  - If you reinstalled or rotated the token, the browser must re-auth.
  - Run `~/.coderelay/bin/coderelay token` to print it.

- **iPhone opens the tailnet URL but shows disconnected / no device**
  - Confirm Tailscale is connected on iPhone and Mac.
  - Open `/admin` on the Mac and click **Validate** then **Repair**.

- **Port conflict / service won’t start**
  - Run `~/.coderelay/bin/coderelay diagnose` to see what’s listening and the latest logs.

## Features

- 📱 Remote control for Codex on Mac from your iPhone
- 🔐 Secure E2E connection via Tailscale
- 🎨 Quad provider support (Codex, OpenCode, GitHub Copilot+, Claude)
- 💾 Local-first SQLite persistence
- ⚡ Real-time WebSocket relay
- 🧪 Bundle size guardrails and CI smoke tests

### Phase 4 Complete: Full Multi-Provider Integration

- **🔌 Dynamic Capability Matrix** — Each provider declares four capability flags:
  - `CAN_ATTACH_FILES`: File/image attachment support
  - `CAN_FILTER_HISTORY`: Thread history filtering
  - `SUPPORTS_APPROVALS`: Interactive tool permission prompts
  - `SUPPORTS_STREAMING`: Real-time response streaming

- **🎛️ Graceful Degradation UX** — UI elements automatically disable when capabilities are unavailable. Disabled buttons show tooltips explaining why (e.g., "This provider does not support attachments"). No broken interactions.

- **📎 Full Attachment Support** — Upload images and files to Codex and Copilot ACP. Files are stored locally (`~/.coderelay/uploads`), base64-encoded for ACP protocol, with automatic text-only fallback if attachments are rejected.

- **🔒 ACP Approval System** — Interactive prompts for tool permissions (shell commands, file operations, etc.):
  - Four decision types: `allow_once`, `allow_always`, `reject_once`, `reject_always`
  - Persistent policy store in localStorage (`coderelay_acp_approval_policies`)
  - Policies managed in Settings with revoke capability
  - Auto-approve detection (shows warning when `--allow-all-tools` is enabled)

- **🔍 Advanced Filtering** — Dual-axis thread filtering:
  - **Provider Filter**: All, Codex, or Copilot ACP (live counts)
  - **Status Filter**: All, Active, or Archived (live counts)
  - Filter state persists to localStorage (`coderelay_thread_filters`)
  - Mobile-responsive flex-wrap layout with empty state handling

## Multi-Provider Architecture

CodeRelay supports multiple AI providers through a unified adapter interface:

### Providers

**Codex (via Anchor)**

- Full read/write support
- All capabilities enabled by default
- Thread title sync with Codex Desktop
- Vision-capable model support
- Connected via local Anchor bridge process

**OpenCode**

- Connects to local OpenCode server (default: `http://127.0.0.1:4096`)
- REST API communication
- Full send, streaming, attachments support
- Configurable via `config.json` (`providers["opencode"].enabled`, `serverUrl`, `model`)

**GitHub Copilot+**

- Spawns `gh copilot --acp` or `copilot --acp` child process
- JSON-RPC over stdio via `AcpClient`
- Bidirectional communication for approval requests
- Full send, streaming, attachments, and approvals support
- Configurable via `config.json` (`providers["copilot-acp"].enabled`)

**Claude (Web API)**

- Direct API calls to Anthropic's Claude API
- Configurable model (claude-3-5-sonnet, claude-3-opus, claude-3-haiku)
- Full streaming support
- Configurable via `config.json` (`providers["claude"].enabled`, `apiKey`, `model`, `baseUrl`)

### Capability Matrix

| Capability | Codex | OpenCode | Copilot+ | Claude |
|------------|-------|----------|-----------|--------|
| `CAN_ATTACH_FILES` | ✅ | ✅ | ✅ | ❌ |
| `CAN_FILTER_HISTORY` | ✅ | ✅ | ❌ | ✅ |
| `SUPPORTS_APPROVALS` | ✅ | ✅ | ✅ (dynamic) | ❌ |
| `SUPPORTS_STREAMING` | ✅ | ✅ | ✅ | ✅ |

**Notes:** 
- Copilot+ `SUPPORTS_APPROVALS` is `false` when started with `--allow-all-tools` flag (tools are auto-approved at provider level).
- OpenCode capabilities depend on the OpenCode server version and model used.

### Adding More Providers

See [docs/PROVIDERS.md](docs/PROVIDERS.md) for the adapter development guide. Key steps:

1. Implement `ProviderAdapter` interface
2. Declare capabilities
3. Register in `services/local-orbit/src/index.ts`
4. UI automatically adapts based on declared capabilities

### Approval Workflows

When Copilot ACP requests tool permissions (e.g., running shell commands, reading files), you receive interactive approval prompts with four decision options:

- **Allow once** (`allow_once`): Approve this specific tool call only
- **Allow always** (`allow_always`): Auto-approve this tool for all future calls (saved as policy)
- **Reject once** (`reject_once`): Deny this specific tool call only
- **Reject always** (`reject_always`): Auto-deny this tool for all future calls (saved as policy)

**Policy Management:**

- Policies stored in localStorage (`coderelay_acp_approval_policies`)
- Specificity-based matching: exact tool name > tool kind > global default
- Manage policies in Settings: view all rules, revoke individual policies
- Auto-approve detection: warning banner shown when provider started with `--allow-all-tools`

**Approval Flow:**

1. ACP sends `session/request_permission` via JSON-RPC
2. Adapter normalizes to internal `approval_request` event (60s timeout)
3. Relay forwards to UI over WebSocket
4. UI checks policy store for matching rule
5. If no policy: show prompt; if policy exists: auto-apply
6. Decision sent back to adapter as `approval_decision`
7. Optional: "always" choices stored as persistent policies

### Advanced Filtering

Filter your thread list with dual-axis filtering:

**Provider Filter:**

- `all` (default): Show all threads
- `codex`: Show Codex threads only
- `copilot-acp`: Show Copilot ACP sessions only

**Status Filter:**

- `all` (default): Show all threads
- `active`: Show non-archived threads
- `archived`: Show archived threads only

**Features:**

- Live thread counts on filter chips
- Filter state persists to localStorage (`coderelay_thread_filters`)
- Defensive hydration on page load with validation fallback
- Empty state UI when no threads match filters
- Mobile-responsive flex-wrap layout
- Accessible keyboard navigation with ARIA attributes

## Architecture Overview

CodeRelay is a **local-first, multi-provider AI interface** with secure Tailscale-based remote access.

### Core Components

- **local-orbit**: Single local Node.js server (port 8790 default)
  - Serves web UI as static assets
  - WebSocket relay (`/ws` for UI clients, `/ws/anchor` for Codex bridge)
  - SQLite persistence (3 tables: events, upload_tokens, token_sessions)
  - Provider registry and lifecycle management
  - Upload storage and capability URL serving

- **Anchor**: Codex Desktop bridge process
  - Spawns `codex app-server` and relays JSON-RPC over stdio
  - Connects to local-orbit over WebSocket
  - Manages thread title sync with Codex Desktop state

- **Provider Adapters**: Pluggable AI provider backends
  - `CodexAdapter`: Codex Desktop integration (via Anchor)
  - `OpenCodeAdapter`: OpenCode server REST API
  - `CopilotAcpAdapter`: GitHub Copilot+ ACP process spawning
  - `ClaudeAdapter`: Anthropic Claude Web API
  - `ClaudeMcpAdapter`: Claude via MCP (local CLI)
  - Capability-driven feature declaration
  - Health monitoring and graceful degradation

- **Web UI**: Svelte 5 SPA
  - Mobile-first responsive design
  - Real-time WebSocket communication
  - Provider-aware filtering and capabilities
  - Approval prompt UI and policy management

### Data Flow

```text
iPhone/Mac Browser
       |
       | wss:// (via Tailscale)
       v
  local-orbit (WebSocket relay)
       |
       +---> Anchor ---> codex app-server (stdio JSON-RPC)
       |
       +---> CopilotAcpAdapter ---> gh copilot --acp (stdio JSON-RPC)
       |
       +---> SQLite (events, uploads, sessions)
```

### LocalStorage Keys

- `coderelay_thread_filters`: Provider and status filter state
- `coderelay_acp_approval_policies`: ACP tool permission policies
- `coderelay_enter_behavior`: Composer Enter key behavior (per-device)
- Quick replies, agent presets, helper profiles (various keys)

### Database Schema

**events table:**

- Stores thread events (prompts, responses, tool outputs)
- Indexed on `thread_id` and `created_at` for fast replay

**upload_tokens table:**

- Capability URLs for uploaded files
- Indexed on `expires_at` for automated cleanup

**token_sessions table:**

- Per-device session tokens with mode enforcement (full/read-only)
- Indexed on `revoked_at` for active session queries

## How CodeRelay Differs From Zane

See [docs/DIFFERENCES_FROM_ZANE.md](docs/DIFFERENCES_FROM_ZANE.md) for a complete architectural comparison.

**Key differences:**

- **Quad provider support**: Codex, OpenCode, GitHub Copilot+, Claude with unified interface (Zane is Codex-only)
- **Capability matrix**: Dynamic feature detection with graceful UI degradation (Zane assumes all features available)
- **Approval system**: Interactive tool permission prompts with persistent policies (Zane has no approval workflows)
- **Advanced filtering**: Provider + status filters with localStorage persistence (Zane has basic filtering)
- **Local-first architecture**: Single local server with token auth (Zane uses Cloudflare components)
- **Installer + CLI tooling**: One-line install, `launchd` integration, full lifecycle management
- **iPhone-first usability**: Mobile-oriented composer UX, responsive layout optimizations

## What You Get

- Web UI (mobile-friendly): create tasks, watch live output, approve/deny writes, review diffs
- Image attachments: upload from iPhone, embed inline in threads
- Composer UX: Enter inserts newline by default (configurable per-device)
- Admin UI (`/admin`): status, logs, start/stop Anchor, one-time pairing QR for your iPhone
- One local server (`local-orbit`) that serves:
  - UI (static)
  - WebSockets (`/ws`) for realtime control
  - REST endpoints for event replay (`/threads/:id/events`)
  - Thread title enrichment (reads `~/.codex/.codex-global-state.json`)

## Demo

[![CodeRelay demo](https://img.youtube.com/vi/kmH0hEY6Y7o/hqdefault.jpg)](https://www.youtube.com/watch?v=kmH0hEY6Y7o)

## CI (GitHub Actions)

This repo includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that builds the UI and runs smoke tests (including a WebSocket relay test) to catch regressions like “blank threads”.

## Security Model

- You must be on the same Tailscale tailnet as the Mac.
- Auth supports:
  - legacy Access Token (bootstrap/admin),
  - per-device token sessions (create/list/revoke in `/admin`).
- Pairing: `/admin` mints a short-lived one-time pairing code (shown as QR).
  - Consuming the code on iPhone returns a unique per-device session token.
  - Session tokens can be revoked individually in `/admin`.
  - QR pairing is token-session auth (not WebAuthn passkey auth).

## Why Tailscale?

CodeRelay is built around a simple security goal: **don’t expose your local Codex to the public internet**.
Tailscale is what makes that practical.

What it provides in this setup:

- **Private access**: your iPhone can reach your Mac as if it’s on the same LAN, but only inside your **tailnet**.
- **Encryption in transit**: traffic is encrypted between devices.
- **Stable device URL**: **MagicDNS** gives your Mac a stable hostname (e.g. `my-mac.tailXXXX.ts.net`).
- **No public tunnel vendor**: you don’t need Cloudflare (or any third-party tunnel) to make the UI reachable.

How it fits CodeRelay:

- CodeRelay binds locally to `127.0.0.1`.
- `tailscale serve` publishes that local-only service to your tailnet over HTTPS/WSS.
- The Admin/WS endpoints remain protected by your CodeRelay **Access Token** (and the iPhone pairing QR).

## Uploads (Images)

- Uploads are stored locally on your Mac (default: `~/.coderelay/uploads`).
- Upload retention is **permanent by default** (`0` days). You can set retention (days) in `/admin`.
- Uploaded images are served via capability URLs (`/u/<token>`). This avoids putting your **Access Token** in image URLs and allows `<img>` tags to load on iPhone.

## Install (macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/ddevalco/coderelay/main/scripts/install-local.sh | bash
```

After install:

- The service listens locally on `http://127.0.0.1:8790`.
- Your **Access Token** is printed by the installer and is also copied to your clipboard automatically (macOS `pbcopy`, best-effort).

What the installer does:

- Checks dependencies (git, bun, tailscale) and helps you install missing pieces.
- Builds the web UI (so you get a single self-contained local server + static UI).
- Writes state/config under `~/.coderelay/`.
- Attempts to install a `launchd` agent. If your system blocks `launchctl` (common on managed Macs), it will fall back to running in the background and prints `Service started via: ...`.
- Optionally configures `tailscale serve` so your iPhone can reach the service via MagicDNS.

## Wipe / Reset

If you want a clean slate (stop service, disable `tailscale serve`, remove launchd agent, delete `~/.coderelay`):

```bash
curl -fsSL https://raw.githubusercontent.com/ddevalco/coderelay/main/scripts/reset-and-install.sh | bash
```

If you only want to wipe without reinstalling, run the local script after install:

```bash
~/.coderelay/app/scripts/wipe-local.sh
```

## Enable iPhone Access (Tailscale)

If you do not have Tailscale yet:

1. Create a (free) Tailscale account: <https://tailscale.com/>
2. Install Tailscale on Mac + iPhone and sign in to both with the same account
3. Run `tailscale up` on the Mac

Terminology:

- A **tailnet** is your private Tailscale network (your account/org + its devices).
- **MagicDNS** is Tailscale's stable DNS name for your devices (e.g. `my-mac.tailXXXX.ts.net`).

Expose the service on your tailnet (run on Mac):

```bash
tailscale serve --bg http://127.0.0.1:8790
```

Note: Some tailnets require you to enable Tailscale Serve in the admin console the first time.
If you see an error like "Serve is not enabled on your tailnet", follow the link it prints and enable it.

Then open on your Mac (to pair your iPhone):

- `http://127.0.0.1:8790/admin`
- generate a pairing QR and scan it with your iPhone

What to expect after pairing:

- Your iPhone will open `https://<your-mac-magicdns-host>/` and connect automatically (no manual “server URL” setup).
- Threads/models populate after the Anchor connects (usually a few seconds). If you see “No device connected”, check `/admin` and `~/.coderelay/anchor.log`.
- Existing threads may appear immediately, but some Codex versions do not replay full historical transcripts into third-party UIs. In that case, only new activity will show up. (We’re iterating on better backfill.)

Note about the Codex desktop app:

- CodeRelay is its own UI. Messages you send from CodeRelay may not immediately appear in the Codex desktop app UI without a refresh/restart of the desktop app.

## Developer Notes

- Local server: `services/local-orbit/src/index.ts`
- Anchor: `services/anchor/src/index.ts`

## Docs

- Install: [`docs/INSTALL.md`](docs/INSTALL.md)
- Admin UI: [`docs/ADMIN.md`](docs/ADMIN.md)
- CLI: [`docs/CLI.md`](docs/CLI.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Security: [`docs/SECURITY.md`](docs/SECURITY.md)
- Config: [`docs/CONFIG.md`](docs/CONFIG.md)
- Protocol: [`docs/PROTOCOL.md`](docs/PROTOCOL.md)
- Security hardening: [`docs/HARDENING.md`](docs/HARDENING.md)
- Troubleshooting: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)
- Native iOS roadmap: [`docs/NATIVE_IOS_ROADMAP.md`](docs/NATIVE_IOS_ROADMAP.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)

## Attribution

See `docs/ATTRIBUTION.md`.

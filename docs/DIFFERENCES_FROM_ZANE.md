# Differences From Zane

CodeRelay started as a local-only fork inspired by Zane (credit: Z. Siddiqi).

CodeRelay’s goal is narrower and more opinionated:

- Run Codex locally on macOS.
- Access it from iPhone (and other devices) securely.
- Avoid public internet exposure.
- Prefer a “single-node” deployment with as little infrastructure as possible.

## High-Level Differences

### Multi-Provider Architecture with Capability Detection

**Zane:**

- Single provider: Codex only
- Static feature assumptions (all capabilities assumed available)
- Hard-coded provider-specific UI logic

**CodeRelay:**

- Quad provider support: Codex + OpenCode + GitHub Copilot+ + Claude (extensible to more)
- Unified adapter interface (`ProviderAdapter` contract)
- **Dynamic Capability Matrix**: Each provider declares four capability flags:
  - `CAN_ATTACH_FILES`: File/image attachment support
  - `CAN_FILTER_HISTORY`: Thread history filtering
  - `SUPPORTS_APPROVALS`: Interactive tool permission prompts
  - `SUPPORTS_STREAMING`: Real-time response streaming
- **Graceful Degradation**: UI elements automatically disable when capabilities unavailable, with explanatory tooltips
- **Provider Registry**: Centralized lifecycle management (start/stop/health) for all providers
- **Session Normalization**: Provider-specific formats converted to common schema

**Current Provider Matrix:**

| Capability | Codex | Copilot ACP |
|------------|-------|-------------|
| `CAN_ATTACH_FILES` | ✅ | ✅ |
| `CAN_FILTER_HISTORY` | ✅ | ❌ |
| `SUPPORTS_APPROVALS` | ✅ | ✅ (dynamic) |
| `SUPPORTS_STREAMING` | ✅ | ✅ |

**Benefits:**

- Add new AI providers without UI changes (UI adapts to declared capabilities)
- No broken interactions (disabled features show clear explanations)
- Future-proof for Claude, GPT, and other providers

### Approval Workflows

**Zane:**

- No approval system
- All tool permissions implicitly granted

**CodeRelay:**

- **Interactive Approval Prompts**: Shell commands, file operations require explicit user consent
- **Four Decision Types**:
  - `allow_once`: Single-use approval
  - `allow_always`: Persistent auto-approve policy (saved to localStorage)
  - `reject_once`: Single-use denial
  - `reject_always`: Persistent auto-deny policy (saved to localStorage)
- **Policy Store**: Specificity-based matching (exact tool name > tool kind > global default)
- **localStorage Key**: `coderelay_acp_approval_policies`
- **Policy Management UI**: View all saved policies in Settings, revoke individual rules
- **Auto-Approve Detection**: Warning banner when provider started with `--allow-all-tools` flag
- **Bidirectional JSON-RPC**: ACP adapter supports server-initiated permission requests with 60s timeout

**Benefits:**

- Security: Explicit control over file system and shell access
- Persistence: Set preferences once, apply automatically in future sessions
- Transparency: Always know what tools are running

### Advanced Filtering + View Persistence

**Zane:**

- Basic filtering (if any)
- No filter state persistence

**CodeRelay:**

- **Dual-Axis Filtering**:
  - **Provider Filter**: All / Codex / Copilot ACP (live thread counts)
  - **Status Filter**: All / Active / Archived (live thread counts)
- **localStorage Persistence**: Filter state survives page reloads (`coderelay_thread_filters`)
- **Defensive Hydration**: Validates loaded state, falls back to defaults on corruption
- **Mobile-Responsive Layout**: Flex-wrap filter chips, empty state handling
- **Accessible Navigation**: ARIA attributes, keyboard navigation support

**Benefits:**

- Quickly isolate threads by provider (e.g., "Show only Copilot sessions")
- Hide archived threads to reduce clutter
- Filter preferences remembered across sessions

### No Cloudflare Dependency

**Zane:**

- Default architecture expects Cloudflare components (Orbit/Auth style flows)
- Cloudflare Auth for authentication
- Public internet exposure considerations

**CodeRelay:**

- Single local server (`local-orbit`) with token-based authentication
- No Cloudflare components required
- Tailnet-first design (binds to `127.0.0.1`, exposed via `tailscale serve`)

### Token-Based Auth + Pairing

**Zane:**

- Cloudflare Auth-based authentication (passkeys/WebAuthn)

**CodeRelay:**

- **Legacy Access Token**: Bootstrap/admin access (printed during install)
- **Per-Device Session Tokens**: Create/list/revoke in `/admin`
- **Read-Only Mode**: Session tokens support server-side enforcement (full vs. read-only)
- **Pairing QR Codes**: Mint unique per-device tokens (not shared legacy token)
- **Short-Lived Pairing**: `/admin` mints one-time pairing codes with expiration

**Benefits:**

- Simple token management (no external auth provider)
- Per-device revocability (compromised device? Revoke its token only)
- Read-only mode for untrusted devices

### Copilot ACP Integration

**Zane:**

- Codex-only implementation
- No support for other AI providers

**CodeRelay:**

- **Process Management**: Spawns `gh copilot --acp` or `copilot --acp` child process
- **JSON-RPC Protocol**: Bidirectional communication over stdio via `AcpClient`
- **Full Capabilities**: Send prompts, stream responses, handle approvals, process attachments
- **Graceful Degradation**: Returns degraded health if CLI not installed (doesn't block other providers)
- **Config-Driven**: Enable/disable via `config.json` (`providers["copilot-acp"].enabled`)
- **Attachment Handling**: Base64-encodes files for ACP protocol, automatic text-only fallback

**Benefits:**

- Unified interface for multiple AI models
- GitHub Copilot accessible from same UI as Codex
- Extensible architecture for future providers
  - One-line macOS installer that builds UI, writes config under `~/.coderelay`, attempts `launchd`, and falls back to background mode if `launchctl` is blocked.
  - CLI tooling for start/stop/restart/update/diagnose/ensure.

- Local persistence
  - Selected events are stored in local SQLite with retention.

- Update reliability + anti-regression tooling
  - `coderelay ensure` / `smoke-test` / `self-test` help validate a node quickly and catch regressions like “blank threads”.
  - GitHub Actions CI runs build + smoke tests on pushes/PRs to catch breakages early.
  - `index.html` is served with `Cache-Control: no-store` to reduce cached broken bundle issues after updates.

- Attachments
  - Local uploads stored on disk and served as capability URLs (`/u/<token>`).
  - Images can be forwarded to Codex app-server as structured attachments so vision-capable models can consume pixels.

- Thread titles
  - CodeRelay reads Codex Desktop’s local title store so renamed thread titles show in Pocket.
  - Pocket can rename by updating that same store (Admin-token protected).

- Export/share + copy UX
  - Export/share threads as Markdown/JSON (including iOS-friendly share-sheet behavior).
  - Improved message/tool output copy behavior, including a clipboard fallback for `http://` origins.

## What Stayed Similar

- The “orbit/anchor” conceptual split.
- The web UI style and many UI components.

## Attribution

See `docs/ATTRIBUTION.md`.

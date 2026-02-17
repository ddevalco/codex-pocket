# Architecture

Codex Pocket is a local-first, Tailscale-first remote control surface for Codex running on your Mac.

## Components

### 1) local-orbit (single local server)

File: `services/local-orbit/src/index.ts`

Responsibilities:

- Serve the web UI (static files from `dist/`), including `/admin` and `/pair`.
- Provide a WebSocket endpoint (`/ws`) for the web UI.
- Provide a WebSocket endpoint (`/ws/anchor`) for the Anchor process.
- Relay JSON messages between web UI <-> Anchor.
- Persist selected events to a local SQLite database for reconnect/review.
- Provide admin APIs to inspect status, view logs, and manage the Anchor process.
- Handle image uploads (`/uploads/*`) and serve images via capability URLs (`/u/*`).

Local-orbit binds to `127.0.0.1` by default and is intended to be exposed to your iPhone using `tailscale serve`.

#### Provider Abstraction Layer (New in #129)

Folder: `services/local-orbit/src/providers/`

The provider abstraction layer enables Codex Pocket to integrate with multiple agent providers (Codex app-server, GitHub Copilot ACP, etc.) through a unified interface.

**Core contracts:**

- `ProviderAdapter` - Interface all providers must implement
  - Lifecycle: `start()`, `stop()`, `health()`
  - Sessions: `listSessions()`, `openSession()`
  - Execution: `sendPrompt()`, `subscribe()`, `unsubscribe()`
  - Normalization: `normalizeEvent()`
- `ProviderRegistry` - Manages multiple active providers
- `ProviderCapabilities` - Declares supported features per provider

**Normalized models:**

- `NormalizedSession` - Unified session shape for cross-provider UI
  - Fields: `provider`, `sessionId`, `title`, `project`, `repo`, `status`, `createdAt`, `updatedAt`, `preview`
  - Always includes `rawSession` for debugging/provider-specific features
- `NormalizedEvent` - Unified event envelope for timeline rendering
  - Categories: `user_message`, `agent_message`, `reasoning`, `plan`, `tool_command`, `file_diff`, `approval_request`, `user_input_request`, `lifecycle_status`, `metadata`
  - Always includes `rawEvent` for replay/debugging

**Normalizers:**

- `BaseSessionNormalizer` / `BaseEventNormalizer` - Abstract base classes
- `CodexSessionNormalizer` / `CodexEventNormalizer` - Reference implementations for Codex
- `ACPSessionNormalizer` / `ACPEventNormalizer` - Placeholder for future ACP integration

**Design principles:**

- Provider-agnostic core with explicit capability flags
- Preserve raw payloads for debugging, replay, and provider-specific features
- Extensible without breaking existing implementations
- No UI changes required until provider-aware features are activated

### 2) Anchor (Codex bridge)

File: `services/anchor/src/index.ts`

Responsibilities:

- Spawn `codex app-server`.
- Relay JSON-RPC messages between `codex app-server` (stdio JSONL) and the network.
- Connect outbound to local-orbit over WebSocket.

In this fork, Anchor does not require Cloudflare Auth/Orbit. It connects locally to `ws://127.0.0.1:<port>/ws/anchor`.

### 3) Web UI

Folder: `src/`

Responsibilities:

- Display threads, live output, diffs, approvals.
- Connect to local-orbit over WebSocket (`wss://<host>/ws` when served via Tailscale HTTPS).
- Fetch stored events from `GET /threads/:id/events`.

## Data Flow

### Live session

1. iPhone opens `https://<mac-magicdns-host>/` (served by local-orbit via `tailscale serve`).
2. Web UI connects to `wss://<mac-magicdns-host>/ws` with a bearer token.
3. Anchor (managed by local-orbit) connects to `ws://127.0.0.1:<port>/ws/anchor` with the same token.
4. local-orbit relays JSON messages between the two.

### Event persistence

- local-orbit stores NDJSON event entries in SQLite.
- The Review page fetches event history from `GET /threads/:id/events`.

### Thread titles (Codex Desktop sync)

Codex Pocket injects user-renamed thread titles by reading Codex Desktop's local title store:

- `~/.codex/.codex-global-state.json` (`thread-titles.titles[threadId]`)

This is done inside local-orbit as a presentation-only enrichment step for `thread/list` and `thread/read` payloads.

Codex Pocket can also rename threads by updating the same title store file (Admin-token protected).

### Image uploads + vision attachments

1. UI requests an upload slot: `POST /uploads/new` (authorised).
2. UI uploads bytes: `PUT /uploads/:token` (authorised).
3. local-orbit serves the image via capability URL: `GET /u/:token` (no auth; the token is the capability).
4. When you send a message, the UI includes both:
   - Markdown `![...](viewUrl)` so the timeline renders an inline image.
   - A structured `input` item with a local file `path` so Codex app-server can pass pixels to vision-capable models.

## Pairing

- Admin can mint a short-lived, one-time pairing link (`/admin/pair/new`).
- iPhone opens `/pair?code=...` which exchanges the code for the bearer token via `/pair/consume`.
- The code is one-time-use and expires.


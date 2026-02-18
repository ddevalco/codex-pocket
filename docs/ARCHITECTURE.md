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

## Provider Abstraction Layer

Codex Pocket supports multiple AI provider backends through a unified adapter interface. This enables viewing and interacting with sessions from different providers (Codex, GitHub Copilot, etc.) in one UI.

### Architecture

```text
┌─────────────────────────────────────────────────────┐
│                    UI (Svelte)                      │
│          Home.svelte, Thread.svelte                 │
└──────────────────┬──────────────────────────────────┘
                   │ WebSocket (JSON-RPC)
┌──────────────────▼──────────────────────────────────┐
│           local-orbit (Node.js server)              │
│  ┌───────────────────────────────────────────────┐  │
│  │          ProviderRegistry                     │  │
│  │   - Lifecycle management (start/stop)         │  │
│  │   - Health aggregation                        │  │
│  │   - Adapter lookup                            │  │
│  └───┬───────────────────────────────────────┬───┘  │
│      │                                       │      │
│  ┌───▼──────────┐                   ┌────────▼────┐ │
│  │CodexAdapter  │                   │CopilotACP   │ │
│  │(placeholder) │                   │Adapter      │ │
│  └───┬──────────┘                   └────────┬────┘ │
│      │                                       │      │
└──────┼───────────────────────────────────────┼──────┘
       │                                       │
   ┌───▼────┐                          ┌──────▼─────┐
   │ anchor │                          │ gh copilot │
   │(Codex) │                          │   --acp    │
   └────────┘                          └────────────┘
```

### ProviderAdapter Contract

All providers implement the `ProviderAdapter` interface:

```typescript
interface ProviderAdapter {
  name: string;
  capabilities: ProviderCapabilities;
  
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<ProviderHealth>;
  
  listSessions(params?: ListSessionsParams): Promise<ListSessionsResult>;
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
  streamMessage(params: StreamMessageParams): AsyncIterableIterator<StreamChunk>;
}
```

### Session Normalization

Provider-specific session formats are normalized to a common schema:

```typescript
interface NormalizedSession {
  sessionId: string;
  provider: string;  // 'codex', 'copilot-acp', etc.
  title: string;
  preview: string;
  createdAt?: string;
  updatedAt?: string;
  status: 'active' | 'completed' | 'error';
  metadata: Record<string, any>;
}
```

### Provider Integration Points

1. **Startup**: `ProviderRegistry.startAll()` called during server initialization
2. **Shutdown**: `ProviderRegistry.stopAll()` called on SIGTERM/SIGINT
3. **Thread List**: `augmentThreadList()` fetches sessions from all providers and merges
4. **Read-Only Enforcement**: `isAcpWriteOperation()` blocks writes to non-Codex providers in Phase 1
5. **Health Checks**: `/admin/health` endpoint aggregates provider health

### Copilot ACP Adapter

The `CopilotAcpAdapter` implements GitHub Copilot ACP (Agent Control Protocol):

- **Process Management**: Spawns `gh copilot --acp` or `copilot --acp` child process
- **Communication**: JSON-RPC over stdio using `AcpClient`
- **Graceful Degradation**: Returns degraded health if CLI not installed
- **Phase 1 Scope**: Read-only session listing (no prompt sending yet)

### Phase 1 Constraints

- **Read-Only**: ACP sessions are list-only; write operations return error
- **UI Gating**: Archive/rename buttons disabled for Copilot threads
- **No Message Send**: Prompt submission to Copilot deferred to Phase 2

See [ACP_CODEX_INTEGRATION_EPIC.md](./ACP_CODEX_INTEGRATION_EPIC.md) for implementation timeline.

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

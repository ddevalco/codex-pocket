# Codex Pocket Protocol (local-orbit)

This document describes the lightweight protocol used between:

- **Client**: the web UI (Mac/iPhone browser)
- **local-orbit**: the local server (`services/local-orbit/src/index.ts`)
- **Anchor**: the Mac agent (`services/anchor/src/index.ts`) which spawns `codex app-server`

Codex Pocket aims to be permissive about upstream `codex app-server` response shapes, but this document captures what Codex Pocket itself sends and expects.

## Provider Abstraction Layer (New in #129)

Codex Pocket now supports multi-provider integration through a unified adapter system. This enables integration with Codex app-server, GitHub Copilot ACP, and future agent providers.

### Normalized Event Model

All provider events are normalized into a unified `NormalizedEvent` envelope before storage and UI rendering:

```typescript
{
  provider: "codex" | "copilot-acp" | string,
  sessionId: string,
  eventId: string,
  category: EventCategory,
  timestamp: string, // ISO 8601
  text?: string,
  payload?: Record<string, unknown>,
  parentEventId?: string,
  rawEvent: unknown // Always preserved
}
```

### Event Categories

Events are categorized for consistent timeline rendering across providers:

- `user_message` - User input/prompts
- `agent_message` - Agent/LLM response text
- `reasoning` - Agent reasoning/thinking steps
- `plan` - Agent planning output
- `tool_command` - Tool/command execution
- `file_diff` - File changes/diffs
- `approval_request` - Requires user approval
- `user_input_request` - Requires user input
- `lifecycle_status` - Session lifecycle events (started, completed, error)
- `metadata` - Metadata updates (title change, etc.)

### Normalized Session Model

Sessions/threads are normalized for cross-provider UI rendering:

```typescript
{
  provider: string,
  sessionId: string,
  title: string,
  project?: string,
  repo?: string,
  status: "active" | "idle" | "completed" | "error" | "interrupted",
  createdAt: string, // ISO 8601
  updatedAt: string, // ISO 8601
  preview?: string,
  metadata?: Record<string, unknown>,
  rawSession?: unknown // Always preserved
}
```

### Provider Capabilities

Each provider declares its capabilities for graceful feature degradation:

```typescript
{
  listSessions: boolean,
  openSession: boolean,
  sendPrompt: boolean,
  streaming: boolean,
  attachments: boolean,
  approvals: boolean,
  multiTurn: boolean,
  filtering: boolean,
  pagination: boolean,
  custom?: Record<string, boolean>
}
```

The UI uses these flags to hide/disable unsupported features per provider.

## Transports

- HTTP: local-orbit serves static UI, admin endpoints, pairing, and event replay.
- WebSocket: realtime bidirectional relay.

### WebSocket endpoints

- `GET /ws` (alias for `/ws/client`)
- `GET /ws/client`
- `GET /ws/anchor`

All WS endpoints require auth:

- `?token=<access-token>` query param, or
- `Authorization: Bearer <access-token>` header

## Orbit Control Messages (non-JSON-RPC)

These are JSON objects with a `type` field.

### Client -> local-orbit

- `{ "type": "ping" }`
  - Heartbeat. Server responds with `{ "type": "pong" }`.

- `{ "type": "orbit.list-anchors" }`
  - Requests current anchors.

- `{ "type": "orbit.subscribe", "threadId": "..." }`
  - Subscribe client to a thread.

- `{ "type": "orbit.unsubscribe", "threadId": "..." }`
  - Unsubscribe client from a thread.

### Anchor -> local-orbit

- `{ "type": "anchor.hello", "hostname": "...", "platform": "...", "ts": "..." }`
  - Announces anchor identity.
- `{ "type": "orbit.anchor-auth", "status": "unknown"|"ok"|"invalid", "at": "...", "code": "...", "message": "..." }`
  - Reports upstream auth status (e.g., when Codex app-server token is invalidated).

### local-orbit -> Client

- `{ "type": "orbit.hello", "role": "client"|"anchor", "ts": "..." }`
- `{ "type": "orbit.anchors", "anchors": [ ... ] }`
- `{ "type": "orbit.anchor-connected", "anchor": { ... } }`
- `{ "type": "orbit.anchor-disconnected", "anchor": { ... } }`
- `{ "type": "orbit.anchor-auth", "status": "unknown"|"ok"|"invalid", "at": "...", "code": "...", "message": "..." }`

### local-orbit -> Anchor

- `{ "type": "orbit.client-subscribed", "threadId": "..." }`
  - Used by Anchor to optionally replay buffered approval prompts.

## JSON-RPC Relay

After subscription, the web UI sends JSON-RPC messages (e.g. `thread/list`, `thread/resume`, `turn/start`) over the WS.

local-orbit does not implement the full RPC surface. Instead, it:

- stores selected events in SQLite
- relays client JSON-RPC to Anchor
- relays Anchor/app-server output back to subscribed clients

### Important routing behavior

If a client sends a thread-scoped JSON-RPC message before any anchor is subscribed to that thread,
local-orbit will broadcast the message to all anchors so the anchor can observe the `threadId` and subscribe.

## Pairing

### Admin mints pairing codes

- `POST /admin/pair/new` (auth required)
  - returns `{ code, expiresAt, pairUrl }`

- `GET /admin/pair/qr.svg?code=...` (auth required)
  - returns an SVG QR code encoding the pairing URL.

### iPhone consumes pairing code

- `POST /pair/consume` (no auth)
  - body: `{ "code": "..." }`
  - returns `{ "token": "..." }`
  - token is a newly minted per-device token session
  - codes are one-time use and expire.

## Persistence

local-orbit stores events in SQLite (default `~/.codex-pocket/codex-pocket.db`).

- `GET /threads/:id/events` (auth required)
  - returns NDJSON (one JSON object per line)

## Admin debug

- `GET /admin/debug/events?limit=50` (auth required)
  - returns the last N stored event payloads (redacted).

- `POST /admin/token/rotate` (auth required)
  - rotates the legacy Access Token, persists it to `config.json` (if configured), clears pairing codes, and disconnects clients.

- `GET /admin/token/sessions` (auth required)
  - returns token sessions (id, label, mode, created/last-used/revoked timestamps).

- `POST /admin/token/sessions/new` (auth required)
  - body: `{ "label"?: string, "mode"?: "full" | "read_only" }`
  - returns `{ ok, token, session }` where `token` is only shown once.

- `POST /admin/token/sessions/revoke` (auth required)
  - body: `{ "id": "..." }`
  - revokes that token session.

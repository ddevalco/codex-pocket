# Provider Adapter Development Guide

This guide explains how to add support for new AI providers to CodeRelay.

## Overview

CodeRelay uses a **provider adapter pattern** to support multiple AI backends. Each provider implements the `ProviderAdapter` interface, which the `ProviderRegistry` manages.

**Current providers:**

- **Codex** (via Anchor): Full read/write support, all capabilities enabled
- **GitHub Copilot ACP**: Full integration with send, streaming, approvals, and attachments

## Provider Capability Matrix

| Capability | Codex | Copilot ACP | Description |
|------------|-------|-------------|-------------|
| `CAN_ATTACH_FILES` | ✅ | ✅ | File/image attachment support |
| `CAN_FILTER_HISTORY` | ✅ | ❌ | Thread history filtering |
| `SUPPORTS_APPROVALS` | ✅ | ✅ (dynamic) | Interactive tool permission prompts |
| `SUPPORTS_STREAMING` | ✅ | ✅ | Real-time response streaming |

**Note:** Copilot `SUPPORTS_APPROVALS` is `false` when started with `--allow-all-tools` flag (tools are auto-approved at provider level).

## Quick Start

1. Create a new adapter in `services/local-orbit/src/providers/adapters/`
2. Implement the `ProviderAdapter` interface
3. Add a session normalizer in `services/local-orbit/src/providers/normalizers/`
4. Register your adapter in `services/local-orbit/src/index.ts`
5. Add tests in `__tests__/` directories
6. Update documentation

## Adapter Interface

```typescript
interface ProviderAdapter {
  name: string;
  capabilities: ProviderCapabilities;
  
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<ProviderHealth>;
  
  // Session management
  listSessions(params?: ListSessionsParams): Promise<ListSessionsResult>;
  
  // Message handling (optional in Phase 1)
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
  streamMessage(params: StreamMessageParams): AsyncIterableIterator<StreamChunk>;
}
```

### Required Methods

#### `start()`

Initialize connections, spawn processes, or authenticate. Should be idempotent.

**Example:**

```typescript
async start(): Promise<void> {
  if (this.process) return; // Already started
  this.process = spawn('my-ai-cli', ['serve']);
  await this.waitForReady();
}
```

#### `stop()`

Clean up resources, close connections, kill processes.

**Example:**

```typescript
async stop(): Promise<void> {
  if (this.process) {
    this.process.kill('SIGTERM');
    await this.waitForExit();
    this.process = null;
  }
}
```

#### `health()`

Return current adapter health status.

**Returns:**

```typescript
{
  provider: 'my-provider',
  healthy: true,
  message: 'Connected',
  details: { uptime: 3600 }
}
```

#### `listSessions()`

Fetch available sessions and normalize them.

**Returns:**

```typescript
{
  sessions: [
    {
      sessionId: 'abc123',
      provider: 'my-provider',
      title: 'Session Title',
      preview: 'Last message preview...',
      createdAt: '2024-01-15T10:00:00Z',
      status: 'active',
      metadata: {}
    }
  ]
}
```

### Optional Methods (Phase 2+)

#### `sendMessage()`

Send a prompt and wait for complete response.

#### `streamMessage()`

Send a prompt and stream response chunks.

## Session Normalization

Create a normalizer extending `BaseSessionNormalizer`:

```typescript
export class MyProviderSessionNormalizer extends BaseSessionNormalizer {
  async normalizeSession(raw: any): Promise<NormalizedSession> {
    return {
      sessionId: raw.id,
      provider: 'my-provider',
      title: raw.title || this.generateTitle(raw),
      preview: this.generatePreview(raw.messages),
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      status: this.mapStatus(raw.state),
      metadata: raw.metadata || {}
    };
  }
}
```

## Capabilities

Declare what your adapter supports using the `ProviderCapabilities` interface:

```typescript
interface ProviderCapabilities {
  CAN_ATTACH_FILES: boolean;      // File/image attachment support
  CAN_FILTER_HISTORY: boolean;    // Thread history filtering
  SUPPORTS_APPROVALS: boolean;    // Interactive tool permission prompts
  SUPPORTS_STREAMING: boolean;    // Real-time response streaming
}
```

**Example:**

```typescript
capabilities: {
  CAN_ATTACH_FILES: true,
  CAN_FILTER_HISTORY: false,
  SUPPORTS_APPROVALS: !this.config.allowAllTools,  // Dynamic based on config
  SUPPORTS_STREAMING: true
}
```

The UI automatically adapts based on declared capabilities:

- If `CAN_ATTACH_FILES=false`: Attach button disabled with tooltip
- If `SUPPORTS_APPROVALS=false`: Auto-approve warning banner shown
- If `SUPPORTS_STREAMING=false`: Response shown after completion (no streaming)

## Error Handling

- **Graceful Degradation**: If CLI/API unavailable, return `healthy: false` from `health()`
- **Timeout Handling**: Set reasonable timeouts for network/process calls
- **User-Friendly Errors**: Return clear error messages for UI display

**Example:**

```typescript
async listSessions(): Promise<ListSessionsResult> {
  try {
    const response = await this.client.request('list', {}, 5000);
    return { sessions: response.map(s => this.normalizer.normalizeSession(s)) };
  } catch (err) {
    console.warn(`[my-provider] Failed to list sessions:`, err);
    return { sessions: [], error: 'Failed to fetch sessions' };
  }
}
```

## Testing

### Unit Tests

Create tests in `__tests__/` next to your adapter:

```typescript
// __tests__/my-provider-adapter.test.ts
import { describe, it, expect } from "bun:test";
import { MyProviderAdapter } from "../my-provider-adapter";

describe("MyProviderAdapter", () => {
  it("starts and reports healthy", async () => {
    const adapter = new MyProviderAdapter();
    await adapter.start();
    const health = await adapter.health();
    expect(health.healthy).toBe(true);
    await adapter.stop();
  });
});
```

### Integration Tests

Add conditional smoke tests (only run if provider available):

```typescript
import { it } from "bun:test";

it.skipIf(!process.env.MY_PROVIDER_API_KEY)("lists real sessions", async () => {
  const adapter = new MyProviderAdapter();
  await adapter.start();
  const result = await adapter.listSessions();
  expect(result.sessions.length).toBeGreaterThan(0);
  await adapter.stop();
});
```

## Registration

Register your adapter in `services/local-orbit/src/index.ts`:

```typescript
import { createRegistry } from './providers/registry';
import { MyProviderAdapter } from './providers/adapters/my-provider-adapter';

const providerRegistry = createRegistry();

// Register adapters
providerRegistry.register(new CodexAdapter());
providerRegistry.register(new MyProviderAdapter()); // ← Add here

// Start all providers
await providerRegistry.startAll();
```

## Examples

Refer to existing adapters:

- **CopilotAcpAdapter**: Process spawning, JSON-RPC over stdio
  - `services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts`
  - Shows process management, health checks, session normalization

- **AcpClient**: Generic JSON-RPC client for stdio communication
  - `services/local-orbit/src/providers/adapters/acp-client.ts`

## Best Practices

1. **Start Fast**: Don't block `start()` for long operations; use lazy initialization
2. **Health Checks**: Implement lightweight health checks (< 100ms)
3. **Resource Cleanup**: Always clean up in `stop()`, even if `start()` failed
4. **Logging**: Use `console.warn` for recoverable errors, `console.error` for critical failures
5. **Timeouts**: Set reasonable defaults (5s for requests, 30s for process startup)
6. **Graceful Degradation**: UI should work even if your adapter fails

## Current Provider Implementations

### Codex Adapter

**Location:** `services/local-orbit/src/providers/adapters/codex-adapter.ts`

**Status:** Phase 1 placeholder (full Codex integration is via Anchor, not this adapter)

**Capabilities:**

```typescript
{
  CAN_ATTACH_FILES: true,
  CAN_FILTER_HISTORY: true,
  SUPPORTS_APPROVALS: true,
  SUPPORTS_STREAMING: true
}
```

### Copilot ACP Adapter

**Location:** `services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts`

**Status:** Full Phase 4 implementation

**Process Management:**

- Spawns `gh copilot --acp` or `copilot --acp` child process
- JSON-RPC over stdio via `AcpClient`
- Health checking with process lifecycle management
- Graceful degradation if CLI not installed

**Capabilities:**

```typescript
{
  CAN_ATTACH_FILES: true,              // Base64-encodes files for ACP protocol
  CAN_FILTER_HISTORY: false,           // ACP protocol limitation
  SUPPORTS_APPROVALS: !allowAllTools,  // Dynamic based on --allow-all-tools flag
  SUPPORTS_STREAMING: true             // Real-time streaming via events
}
```

**Key Features:**

- **Bidirectional JSON-RPC**: Supports server-initiated requests (`session/request_permission`)
- **Approval Handling**: 60s timeout with automatic cancel, normalized to internal events
- **Attachment Protocol**: Reads files, base64-encodes, embeds in ACP content array
- **Fallback Logic**: Automatic text-only retry if attachments rejected
- **Config-Driven**: Enable/disable via `config.json` (`providers["copilot-acp"].enabled`)

## Phase 4: Full Multi-Provider Integration

All Phase 4 goals achieved:

- ✅ **P4-01**: Provider capability detection system with four flags
- ✅ **P4-02**: Graceful degrade UX with disabled elements and tooltips
- ✅ **P4-03**: ACP attachment support with base64 encoding
- ✅ **P4-04**: ACP approvals with bidirectional JSON-RPC and policy store
- ✅ **P4-05**: Advanced filtering with provider + status axes
- ✅ **P4-06**: Hardening with timeouts, retries, and health tracking

See [ACP_CODEX_INTEGRATION_EPIC.md](../ACP_CODEX_INTEGRATION_EPIC.md) for implementation details.

## Adding New Providers

New adapters should:

1. Implement the full `ProviderAdapter` interface
2. Declare accurate capabilities (UI adapts automatically)
3. Handle graceful degradation (provider unavailable shouldn't break other providers)
4. Follow error handling patterns (timeouts, retries, clear user-facing messages)
5. Add comprehensive tests (unit + integration)
6. Document provider-specific setup (CLI installation, API keys, etc.)

**Capability Guidelines:**

- Set `CAN_ATTACH_FILES=true` only if you can handle files in prompts
- Set `SUPPORTS_APPROVALS=true` only if you emit `session/request_permission` style events
- Set `SUPPORTS_STREAMING=true` only if you can emit incremental response chunks
- Set `CAN_FILTER_HISTORY=true` if your provider supports history filtering operations

**UI will automatically:**

- Disable attach button if `CAN_ATTACH_FILES=false`
- Show approval prompts only if `SUPPORTS_APPROVALS=true`
- Stream responses only if `SUPPORTS_STREAMING=true`
- Hide filter options if `CAN_FILTER_HISTORY=false`

See `CopilotAcpAdapter` for a complete reference implementation.

## Questions?

See [ACP_CODEX_INTEGRATION_EPIC.md](./ACP_CODEX_INTEGRATION_EPIC.md) for context and [ARCHITECTURE.md](./ARCHITECTURE.md) for system design.

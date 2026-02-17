# Provider Adapter Development Guide

This guide explains how to add support for new AI providers to Codex Pocket.

## Overview

Codex Pocket uses a **provider adapter pattern** to support multiple AI backends. Each provider implements the `ProviderAdapter` interface, which the `ProviderRegistry` manages.

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

Declare what your adapter supports:

```typescript
capabilities: {
  listSessions: true,
  sendMessage: false,    // Phase 1: read-only
  streamMessage: false,
  archiveSession: false
}
```

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

## Phase 1 Constraints

New adapters in Phase 1 should be **read-only**:

- Implement `listSessions()` only
- Set `capabilities.sendMessage = false`
- Return clear errors if write methods are called
- UI will automatically disable write actions (archive, rename, send)

## Questions?

See [ACP_CODEX_INTEGRATION_EPIC.md](./ACP_CODEX_INTEGRATION_EPIC.md) for context and [ARCHITECTURE.md](./ARCHITECTURE.md) for system design.

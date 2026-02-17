# ACP Protocol Research & Assumptions (Phase 2, Packet P2.1)

**Status:** ASSUMPTIONS ONLY - Requires verification with actual Copilot CLI  
**Date:** 2026-02-16  
**Branch:** `codex/131-acp-phase2-send-stream`

## Protocol Discovery Constraint

**Issue:** Copilot CLI not installed on development machine  
**Impact:** Cannot directly probe JSON-RPC methods via `gh copilot --acp`  
**Mitigation:** Implement based on standard JSON-RPC patterns + graceful fallbacks

## Assumptions

Based on standard AI agent protocols (LSP, MCP, Codex app-server) and JSON-RPC conventions:

### 1. Session Management Methods

```typescript
// Assumed ACP Methods:

// List existing sessions
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/list",
  "params": {
    "limit": 50,  // optional
    "offset": 0   // optional
  }
}

// Response:
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "sessions": [
      {
        "id": "session-uuid-123",
        "title": "Session title",
        "created_at": "2024-01-15T10:00:00Z",
        "updated_at": "2024-01-15T10:30:00Z",
        "status": "active" // or "completed", "error"
      }
    ]
  }
}

// Create new session (or "conversation") 
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/create",  // Alt: "session/start"
  "params": {
    "title": "New session",  // optional
    "context": {}            // optional metadata
  }
}

// Response:
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "sessionId": "session-uuid-456",
    "status": "active"
  }
}
```

### 2. Prompt/Message Sending Methods

```typescript
// Send prompt within a session
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "prompt/send",  // Alt: "message/send", "chat/send"
  "params": {
    "sessionId": "session-uuid-123",
    "message": "What is the capital of France?",
    "attachments": [],  // optional
    "stream": true      // enable streaming
  }
}

// Response (if not streaming):
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "turnId": "turn-uuid-789",  // or "requestId", "messageId"
    "status": "processing"
  }
}

// If streaming enabled, no immediate result - events begin
```

### 3. Event Notifications (Streaming)

When `stream: true`, server sends notifications (no `id` field):

```typescript
// Text delta (streaming response)
{
  "jsonrpc": "2.0",
  "method": "message/delta",  // Alt: "stream/chunk", "completion/delta"
  "params": {
    "sessionId": "session-uuid-123",
    "turnId": "turn-uuid-789",
    "delta": "Paris",
    "type": "text"
  }
}

// Tool call start
{
  "jsonrpc": "2.0",
  "method": "tool/start",  // Alt: "function/call", "action/start"
  "params": {
    "sessionId": "session-uuid-123",
    "turnId": "turn-uuid-789",
    "toolId": "tool-call-abc",
    "name": "search_web",
    "input": { "query": "Paris population" }
  }
}

// Tool call result
{
  "jsonrpc": "2.0",
  "method": "tool/result",  // Alt: "function/result", "action/result"
  "params": {
    "sessionId": "session-uuid-123",
    "turnId": "turn-uuid-789",
    "toolId": "tool-call-abc",
    "output": "2.1 million (city proper)"
  }
}

// Reasoning/thinking delta (like Claude's thinking)
{
  "jsonrpc": "2.0",
  "method": "reasoning/delta",  // Alt: "thinking/delta"
  "params": {
    "sessionId": "session-uuid-123",
    "turnId": "turn-uuid-789",
    "delta": "First, I need to consider...",
    "mode": "raw"  // or "summary"
  }
}

// Status update
{
  "jsonrpc": "2.0",
  "method": "turn/status",  // Alt: "message/status", "completion/status"
  "params": {
    "sessionId": "session-uuid-123",
    "turnId": "turn-uuid-789",
    "status": "completed",  // "processing", "error", "completed"
    "detail": null
  }
}

// Error notification
{
  "jsonrpc": "2.0",
  "method": "error",
  "params": {
    "sessionId": "session-uuid-123",
    "turnId": "turn-uuid-789",
    "error": {
      "code": -32000,
      "message": "Rate limit exceeded"
    }
  }
}
```

### 4. Alternative Method Names

Since we don't have actual ACP docs, we'll implement fallback chains:

```typescript
// Session list: try in order
["session/list", "sessions/list", "list_sessions", "listSessions"]

// Session create: try in order  
["session/create", "session/start", "create_session", "startSession"]

// Prompt send: try in order
["prompt/send", "message/send", "chat/send", "sendMessage"]

// Event methods (any of these):
["message/delta", "stream/chunk", "completion/delta", "text/delta"]
["tool/start", "function/call", "action/start"]
["tool/result", "function/result", "action/result"]
["reasoning/delta", "thinking/delta"]
["turn/status", "message/status", "completion/status"]
```

## Type Definitions

```typescript
// ACP Request Types
interface AcpSessionListRequest {
  limit?: number;
  offset?: number;
}

interface AcpSessionCreateRequest {
  title?: string;
  context?: Record<string, unknown>;
}

interface AcpPromptSendRequest {
  sessionId: string;
  message: string;
  attachments?: Array<{ type: string; data: string }>;
  stream?: boolean;
}

// ACP Response Types
interface AcpSession {
  id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
  status?: 'active' | 'completed' | 'error';
  messages?: Array<{ role: string; content: string }>;
}

interface AcpSessionListResponse {
  sessions: AcpSession[];
  nextOffset?: number;
}

interface AcpPromptSendResponse {
  turnId?: string;
  requestId?: string;
  messageId?: string;
  status?: string;
}

// ACP Event Types (notifications)
interface AcpEventBase {
  sessionId: string;
  turnId?: string;
  requestId?: string;
}

interface AcpMessageDelta extends AcpEventBase {
  delta: string;
  type: 'text' | 'tool' | 'reasoning';
}

interface AcpToolStart extends AcpEventBase {
  toolId: string;
  name: string;
  input: Record<string, unknown>;
}

interface AcpToolResult extends AcpEventBase {
  toolId: string;
  output: unknown;
  error?: string;
}

interface AcpStatusUpdate extends AcpEventBase {
  status: 'processing' | 'completed' | 'error';
  detail?: string;
}
```

## Implementation Strategy

1. **Method Discovery Runtime**: Try fallback chains, cache successful methods  
2. **Event Normalization**: Map any matching event to NormalizedEvent schema  
3. **Graceful Degradation**: If unsupported, return clear error  
4. **Raw Payload Preservation**: Always keep `rawEvent` for debugging

## Verification Checklist

When Copilot CLI becomes available, verify:

- [ ] Actual JSON-RPC method names for session/list, session/create, prompt/send
- [ ] Event notification method names and payload structures
- [ ] Required vs optional parameters
- [ ] Authentication/handshake requirements (if any)
- [ ] Session ID format and lifecycle
- [ ] Turn/request ID tracking
- [ ] Error code conventions
- [ ] Streaming behavior (line-buffered NDJSON?)
- [ ] Initialization protocol (if needed)
- [ ] Capability negotiation (if supported)

## References

- Standard JSON-RPC 2.0: https://www.jsonrpc.org/specification
- LSP Protocol: https://microsoft.github.io/language-server-protocol/
- Model Context Protocol (MCP): Similar stdio JSON-RPC pattern
- Codex app-server: Our existing JSON-RPC implementation

## Next Steps (P2.2)

With these assumptions documented, proceed to implement:
1. `sendPrompt()` in CopilotAcpAdapter with method fallback chain
2. PromptInput → ACP format mapping
3. Response parsing and turnId extraction
4. Basic smoke test with mock ACP server

## Notes

- This is **speculative implementation** based on best practices
- **Must be validated** against real Copilot CLI before production use
- Fallback chains ensure resilience to protocol changes
- Raw payload preservation enables post-hoc debugging

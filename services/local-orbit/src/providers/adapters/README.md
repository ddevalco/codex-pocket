# Copilot ACP Adapter - Phase 1 Implementation

## Overview

This implements packet P1.2 for issue #130: Copilot ACP process/client utilities.

## Files Created

### 1. `process-utils.ts`
Process management utilities:
- `findExecutable(name)` - Search for executables in PATH
- `spawnProcess(command, args)` - Spawn child processes with stdio pipes
- `killProcess(pid)` - Graceful process termination with SIGTERM/SIGKILL fallback
- `processHealth(pid)` - Check if a process is running

### 2. `acp-client.ts`
JSON-RPC 2.0 client for stdio communication:
- NDJSON parsing line-by-line
- Request/response correlation with unique IDs
- Timeout handling (default: 5 seconds)
- Notification handler support
- Automatic cleanup on process exit

### 3. `copilot-acp-adapter.ts`
ProviderAdapter implementation for GitHub Copilot:
- Spawns `copilot --acp` or `gh copilot --acp`
- Implements graceful degradation when Copilot not installed
- Health checks with detailed diagnostics
- Phase 1 scope: read-only, list sessions only
- Phase 2+ stubs: openSession, sendPrompt, subscribe (throw "not implemented")

### 4. `index.ts`
Export barrel for all adapter modules

## Implementation Details

### Process Spawning
- Searches PATH for `copilot` executable first
- Falls back to `gh` (GitHub CLI) if available
- Command: `copilot --acp` (spawns in ACP mode)
- Stdio configuration: pipes for stdin/stdout/stderr

### JSON-RPC Protocol
- Format: `{"jsonrpc":"2.0","id":1,"method":"name","params":{}}`
- NDJSON: newline-delimited JSON over stdio
- Request correlation: sequential ID counter
- Timeout: configurable per request (default 5000ms)
- Error handling: JSON-RPC error responses mapped to exceptions

### Graceful Degradation
When Copilot is not installed or unavailable:
- `start()` succeeds but logs warning
- `health()` returns `{status: "degraded", message: "Copilot CLI not found"}`
- `listSessions()` throws descriptive error
- Server can start and run without Copilot

### Health States
- **healthy**: Process running and responsive to JSON-RPC
- **degraded**: Executable not found OR process not responding
- **unhealthy**: Process not running
- **unknown**: Haven't checked yet

## Validation

✅ TypeScript compiles without errors
✅ Graceful degradation when Copilot absent
✅ Process spawning and health checks work
✅ Timeout handling prevents hanging
✅ Error handling allows server to start without Copilot

## Testing

Tested scenarios:
1. Non-existent executable path → degraded health
2. Copilot executable found but not supporting ACP → degraded health
3. Process spawning → successful start + stop
4. Timeout handling → configurable timeouts work

## Phase 2 Requirements (Future)

Not implemented in Phase 1:
- `openSession()` - throws "not implemented"
- `sendPrompt()` - throws "not implemented"
- `subscribe()` - returns no-op subscription
- `normalizeEvent()` - throws "not implemented"

## Interface Compliance

Implements all required methods from `ProviderAdapter`:
- ✅ `start()` - with graceful failure
- ✅ `stop()` - with cleanup
- ✅ `health()` - with diagnostics
- ✅ `listSessions()` - via JSON-RPC
- ✅ `openSession()` - stub (Phase 2)
- ✅ `sendPrompt()` - stub (Phase 2)
- ✅ `subscribe()` - no-op (Phase 2)
- ✅ `unsubscribe()` - no-op (Phase 2)
- ✅ `normalizeEvent()` - stub (Phase 2)

## Error Handling

All errors are handled gracefully:
- Spawn failures logged, don't crash adapter
- JSON parse errors logged, don't crash client
- Timeout errors reject promises cleanly
- Process exit cleans up pending requests
- Missing executables return degraded health

## Security Considerations

- Process spawning uses restricted stdio pipes
- No shell interpretation (direct spawn)
- PATH search only (no arbitrary paths)
- Timeout prevents resource exhaustion
- Graceful process termination (SIGTERM then SIGKILL)

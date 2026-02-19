# Provider Troubleshooting

This guide covers debugging and resolving issues with the provider system (Copilot ACP, Codex, and future providers).

## Quick Diagnostic Commands

```bash
# Check provider health
curl http://127.0.0.1:8790/admin/health

# Check if Copilot CLI is installed
which copilot

# Check if GitHub CLI is installed (alternative path)
which gh

# View server logs
coderelay logs server

# Run full diagnostics
coderelay diagnose
```

## Understanding Provider Architecture

CodeRelay uses a **provider adapter system** to support multiple agent backends:

- **Codex** (default): Uses local anchor process to relay to Codex desktop app
- **Copilot ACP** (Phase 1 - read-only): Uses GitHub Copilot CLI via Agent Control Protocol
- **Future providers**: Extensible architecture for additional agents

Each provider has:

- **Health status**: healthy, degraded, unhealthy, or unknown
- **Capabilities**: what operations are supported (list, open, send prompts, etc.)
- **Lifecycle**: start, stop, restart, health checks

---

## Startup Failures

### Copilot CLI Not Found

**Symptoms:**

```json
{
  "status": "degraded",
  "message": "Copilot CLI not found in PATH",
  "details": {
    "reason": "executable_not_found",
    "searchedPaths": ["/usr/local/bin", "/usr/bin", ...]
  }
}
```

**Diagnosis:**

```bash
# Check if copilot CLI is installed
which copilot

# Expected: /usr/local/bin/copilot or similar
# If not found: command not found
```

**Solutions:**

1. Install GitHub Copilot CLI:

   ```bash
   # Via npm (if available)
   npm install -g @github/copilot-cli

   # Or via GitHub CLI extension
   gh extension install github/gh-copilot
   ```

2. Add to PATH if installed elsewhere:

   ```bash
   export PATH="/path/to/copilot/dir:$PATH"
   echo 'export PATH="/path/to/copilot/dir:$PATH"' >> ~/.zshrc
   ```

3. Use custom executable path (advanced):

   ```bash
   # Set environment variable before starting
   export COPILOT_CLI_PATH="/custom/path/to/copilot"
   coderelay restart
   ```

**Note:** The system will gracefully degrade if Copilot is not found. Codex sessions will continue to work normally.

---

### ACP Process Spawn Failures

**Symptoms:**

- Server logs show: `[copilot-acp] Failed to start: Error: spawn ENOENT`
- Health endpoint shows: `"status": "unhealthy", "reason": "process_not_running"`
- Console errors: `EACCES` (permission denied) or `ENOTDIR` (path component not a directory)

**Common Causes:**

1. **Executable not executable**

   ```bash
   # Check permissions
   ls -la $(which copilot)
   # Should show: -rwxr-xr-x (executable bit set)

   # Fix if needed
   chmod +x $(which copilot)
   ```

2. **Bad symlink**

   ```bash
   # Check if symlink is broken
   file $(which copilot)
   # Should show: symbolic link to /actual/path/copilot

   # If broken, recreate symlink
   ln -sf /actual/path/to/copilot /usr/local/bin/copilot
   ```

3. **Process already running**

   ```bash
   # Check for zombie copilot processes
   ps aux | grep "copilot --acp"

   # Kill if found
   pkill -f "copilot --acp"

   # Restart server
   coderelay restart
   ```

4. **Resource limits**

   ```bash
   # Check open file limits
   ulimit -n
   # Should be at least 1024

   # Increase if needed
   ulimit -n 4096
   ```

**Logs to Check:**

```bash
# View detailed spawn errors
coderelay logs server | grep "copilot-acp"

# Typical error pattern:
# [copilot-acp] Spawning: /usr/local/bin/copilot --acp
# [copilot-acp] Failed to start: Error: spawn /usr/local/bin/copilot ENOENT
```

**Solution:**

Restart the server after fixing the underlying issue:

```bash
coderelay restart
coderelay self-test
```

---

### JSON-RPC Handshake Failures

**Symptoms:**

- Provider starts but health shows `"status": "degraded", "reason": "unresponsive"`
- Timeout errors in logs: `Request 1 (list_sessions) timed out after 5000ms`
- Process running but not responding

**Diagnosis:**

```bash
# Check if process is running
ps aux | grep "copilot --acp"

# Try manual ACP test
echo '{"jsonrpc":"2.0","id":1,"method":"list_sessions","params":{}}' | copilot --acp
```

**Common Causes:**

1. **Incompatible ACP version**

   - The Copilot CLI may use a different ACP protocol version
   - Check Copilot CLI version: `copilot --version`

2. **Auth not configured**

   - Copilot CLI may require GitHub authentication
   - Run: `gh auth status` (if using gh copilot)
   - Login if needed: `gh auth login`

3. **Process stderr errors**

   - JSON-RPC expects clean stdout
   - Stderr warnings may indicate auth or config issues

**Logs to Check:**

```bash
# Look for handshake timeout
coderelay logs server | grep "handshake"

# Check for JSON-RPC errors
coderelay logs server | grep "jsonrpc"

# Example error:
# [copilot-acp] Request 1 (list_sessions) timed out after 5000ms
```

**Solution:**

1. Ensure GitHub authentication is configured:

   ```bash
   gh auth status
   # If not authenticated: gh auth login
   ```

2. Restart with increased timeout (if slow network):

   ```bash
   # Set via environment (future enhancement)
   export ACP_TIMEOUT_MS=10000
   coderelay restart
   ```

3. If persistent, disable Copilot provider temporarily:

   ```bash
   # The system will degrade gracefully
   # Codex sessions remain functional
   ```

---

### Port Binding Issues

**Symptoms:**

- Server fails to start: `Error: listen EADDRINUSE: address already in use`
- Admin page shows "Connection refused"

**Diagnosis:**

```bash
# Check if port 8790 is in use
lsof -i :8790

# Expected output if running:
# COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
# bun     12345 user   23u  IPv4 0x...      0t0  TCP localhost:8790 (LISTEN)
```

**Solutions:**

1. **Kill existing process:**

   ```bash
   # Find PID
   lsof -i :8790

   # Kill the process
   kill <PID>

   # Force kill if needed
   kill -9 <PID>

   # Restart
   coderelay restart
   ```

2. **Change port:**

   ```bash
   # Set custom port
   export PORT=8791
   coderelay restart

   # Update Tailscale serve
   tailscale serve --bg http://127.0.0.1:8791
   ```

3. **Check for multiple instances:**

   ```bash
   # List all coderelay processes
   ps aux | grep "coderelay\|local-orbit"

   # Kill all and restart
   pkill -f "local-orbit"
   coderelay restart
   ```

---

## Degraded Mode

### What Happens When Copilot Unavailable

When the Copilot ACP provider cannot start or becomes unavailable:

1. **Graceful Degradation**
   - Server continues running normally
   - Codex sessions remain fully functional
   - UI may show Copilot sessions as "unavailable"

2. **UI Behavior**
   - Copilot sessions show status indicator: `"status": "degraded"`
   - Session list may be empty or show cached data
   - Opening Copilot sessions shows error: "Provider degraded"

3. **API Responses**
   - `GET /threads/copilot-acp/*` returns 503 or degraded status
   - Health endpoint shows provider details

### How to Detect Degraded State

**Via Health Endpoint:**

```bash
curl http://127.0.0.1:8790/admin/health | jq '.providers["copilot-acp"]'
```

**Expected Response:**

```json
{
  "status": "degraded",
  "message": "Copilot CLI not found in PATH",
  "lastCheck": "2026-02-17T10:30:00.000Z",
  "details": {
    "reason": "executable_not_found",
    "searchedPaths": ["/usr/local/bin", "/usr/bin", "/bin"]
  }
}
```

**Via Server Logs:**

```bash
coderelay logs server | grep "degraded"

# Example output:
# [copilot-acp] Copilot CLI not found in PATH
# [copilot-acp] Provider running in degraded mode
```

**Via CLI:**

```bash
coderelay diagnose | grep -A 5 "provider"
```

### Recovery from Degraded Mode

Once the underlying issue is fixed (e.g., Copilot CLI installed):

```bash
# Restart server to re-initialize providers
coderelay restart

# Verify health
curl http://127.0.0.1:8790/admin/health | jq '.providers["copilot-acp"].status'

# Expected: "healthy"
```

**Auto-recovery:** The system does not automatically retry provider initialization. You must explicitly restart.

---

## Read-Only Enforcement Errors

In Phase 1, Copilot ACP sessions are **read-only**. Certain operations are blocked at both the provider and protocol level.

### What Operations Are Blocked

**Blocked Operations:**

- `openSession` - Opening or resuming a Copilot session
- `sendPrompt` - Sending messages to Copilot sessions
- `subscribe` - Subscribing to real-time events
- Any RPC method that modifies Copilot state

**Allowed Operations:**

- `listSessions` - Viewing existing Copilot sessions
- `health` - Checking provider health
- Reading session metadata

### Error Messages Users See

#### Opening Copilot Session

**Request:**

```json
{"jsonrpc":"2.0","id":1,"method":"openSession","params":{"sessionId":"copilot-123"}}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "Copilot ACP sessions are read-only in Phase 1",
    "data": {
      "provider": "copilot-acp",
      "phase": 1
    }
  }
}
```

#### Read-Only Token Session

**Request:** (from client with read-only token)

```json
{"jsonrpc":"2.0","id":2,"method":"thread/create","params":{}}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32003,
    "message": "Read-only token session cannot call thread/create"
  }
}
```

#### UI Error (Typical)

```text
⚠️ This session is read-only
Copilot sessions are currently view-only. You can browse history but cannot send new messages.
```

### How to Verify Enforcement Working

#### Test 1: Check Provider Capabilities

```bash
curl http://127.0.0.1:8790/admin/health | jq '.providers["copilot-acp"].capabilities'
```

**Expected:**

```json
{
  "listSessions": true,
  "openSession": false,
  "sendPrompt": false,
  "streaming": false,
  "attachments": false
}
```

#### Test 2: Try Blocked Operation

```bash
# This should fail with read-only error
curl -X POST http://127.0.0.1:8790/api/threads/copilot-acp/test-123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"prompt":"Hello"}'

# Expected: HTTP 400 or 403 with read-only error
```

#### Test 3: Check Logs

```bash
coderelay logs server | grep "read.only\|Phase 1"

# Expected:
# [copilot-acp] openSession not implemented in Phase 1 (read-only)
# Read-only token session cannot call thread/create
```

### Future: Read-Write Support

Phase 2 will enable full read-write support:

- Opening and creating sessions
- Sending prompts and receiving responses
- Real-time event streaming
- Approval workflows

Track progress: Check GitHub issues tagged with `copilot-acp` and `phase-2`.

---

## Health Endpoint Details

### Endpoint: `GET /admin/health`

**Full URL:**

```text
http://127.0.0.1:8790/admin/health
```

**Authentication:** Requires valid admin token (same as admin UI).

**Response Format:**

```json
{
  "status": "healthy",
  "version": "0.8.0",
  "uptime": 3600,
  "providers": {
    "codex": {
      "status": "healthy",
      "message": "Codex anchor connected"
    },
    "copilot-acp": {
      "status": "degraded",
      "message": "Copilot CLI not found in PATH",
      "lastCheck": "2026-02-17T10:30:00.000Z",
      "details": {
        "reason": "executable_not_found",
        "searchedPaths": ["/usr/local/bin", "/usr/bin"]
      }
    }
  }
}
```

### How to Read Provider Status

**Status Values:**

| Status | Meaning | Action |
| -------- | ------- | ------ |
| `healthy` | Provider fully operational | None |
| `degraded` | Provider partially working or fallback mode | Check `details.reason`, fix if needed |
| `unhealthy` | Provider crashed or unresponsive | Restart server, check logs |
| `unknown` | Health check hasn't run yet | Wait 30s, check again |

**Example Statuses:**

#### Healthy Copilot

```json
{
  "status": "healthy",
  "message": "Copilot ACP is running and responsive",
  "lastCheck": "2026-02-17T10:32:15.000Z",
  "details": {
    "pid": 12345,
    "executable": "/usr/local/bin/copilot"
  }
}
```

#### Degraded - Not Found

```json
{
  "status": "degraded",
  "message": "Copilot CLI not found in PATH",
  "lastCheck": "2026-02-17T10:32:15.000Z",
  "details": {
    "reason": "executable_not_found"
  }
}
```

#### Unhealthy - Process Died

```json
{
  "status": "unhealthy",
  "message": "Copilot process not running",
  "lastCheck": "2026-02-17T10:32:15.000Z",
  "details": {
    "reason": "process_not_running",
    "pid": null
  }
}
```

#### Degraded - Unresponsive

```json
{
  "status": "degraded",
  "message": "Copilot process running but not responsive",
  "lastCheck": "2026-02-17T10:32:15.000Z",
  "details": {
    "reason": "unresponsive",
    "pid": 12345,
    "error": "Request 1 (list_sessions) timed out after 5000ms"
  }
}
```

### What "Healthy" vs "Unhealthy" Means

**Healthy:**

- Provider process running (if applicable)
- Can communicate with provider (JSON-RPC, HTTP, etc.)
- Able to list sessions successfully
- No degraded capabilities beyond design (e.g., Phase 1 read-only is OK)

**Degraded:**

- Provider available but with limitations
- Executable found but process crashed previously
- Process slow/timing out but eventually responsive
- Graceful fallback active (cached data, read-only mode, etc.)

**Unhealthy:**

- Provider completely unavailable
- Process not running and cannot be started
- Communication failures (timeout, connection refused)
- Critical dependencies missing (auth, network, etc.)

**Unknown:**

- Health check not yet performed (first 30s after start)
- Provider initialization in progress
- Temporary state before first health check completes

---

## Diagnostic Commands

### Check if Copilot CLI Installed

```bash
# Method 1: Direct check
which copilot

# Method 2: Via GitHub CLI
which gh
gh copilot --help

# Method 3: Full path check
ls -la /usr/local/bin/copilot
ls -la /opt/homebrew/bin/copilot
```

**Expected Output:**

```text
/usr/local/bin/copilot
```

**If Not Found:**

```text
copilot not found
```

### Test ACP Manually

**Basic Handshake Test:**

```bash
# Start copilot in ACP mode
copilot --acp

# In another terminal, send JSON-RPC request
echo '{"jsonrpc":"2.0","id":1,"method":"list_sessions","params":{}}' | copilot --acp

# Expected: JSON response with sessions array
```

**Via Script:**

```bash
# Create test script
cat > /tmp/test-acp.sh <<'EOF'
#!/bin/bash
set -e

echo "Testing Copilot ACP..."

# Start copilot in background
copilot --acp &
PID=$!

sleep 2

# Send request
echo '{"jsonrpc":"2.0","id":1,"method":"list_sessions","params":{}}' > /tmp/acp-req.json
cat /tmp/acp-req.json

# Kill process
kill $PID 2>/dev/null || true

echo "Test complete"
EOF

chmod +x /tmp/test-acp.sh
/tmp/test-acp.sh
```

### Log Locations

**Server Logs:**

```bash
# Via CLI
coderelay logs server

# Direct file (if using launchd)
tail -f ~/Library/Logs/coderelay/server.log

# Direct file (if using systemd on Linux)
journalctl -u coderelay -f
```

**Anchor Logs:**

```bash
# Via CLI
coderelay logs anchor

# Direct file
tail -f ~/Library/Logs/coderelay/anchor.log
```

**Provider-Specific Logs:**

All provider logs are prefixed with `[provider-id]` in server logs:

```bash
# Filter for Copilot ACP
coderelay logs server | grep "copilot-acp"

# Filter for Codex
coderelay logs server | grep "codex"

# Filter for provider errors
coderelay logs server | grep -i "provider.*error\|degraded\|unhealthy"
```

### What to Look For in Logs

**Normal Operation:**

```text
[copilot-acp] Spawning: /usr/local/bin/copilot --acp
[copilot-acp] Handshake complete (placeholder)
[copilot-acp] Started successfully
[copilot-acp] Health check: healthy
```

**Degraded Mode:**

```text
[copilot-acp] Copilot CLI not found in PATH
[copilot-acp] Provider running in degraded mode
[copilot-acp] Health check: degraded - executable_not_found
```

**Errors:**

```text
[copilot-acp] Failed to start: Error: spawn ENOENT
[copilot-acp] Error killing process 12345: ESRCH
[copilot-acp] Request 1 (list_sessions) timed out after 5000ms
[process-utils] Failed to spawn /usr/local/bin/copilot: EACCES
```

**JSON-RPC Issues:**

```text
[acp-client] Failed to parse response: SyntaxError: Unexpected token
[acp-client] Process exited before response received
[acp-client] Process stdin is not available
```

---

## Common Issues & Solutions

### "Permission denied" Errors

**Symptoms:**

```text
[copilot-acp] Failed to start: Error: spawn /usr/local/bin/copilot EACCES
```

**Cause:** Copilot executable lacks execute permission.

**Solution:**

```bash
# Check current permissions
ls -la $(which copilot)

# Add execute permission
chmod +x $(which copilot)

# Verify
ls -la $(which copilot)
# Should show: -rwxr-xr-x

# Restart
coderelay restart
```

---

### Zombie ACP Processes

**Symptoms:**

- New sessions fail to start
- "Address already in use" errors (if using named pipes/sockets)
- Multiple `copilot --acp` processes visible in `ps`

**Diagnosis:**

```bash
# List all copilot ACP processes
ps aux | grep "copilot --acp"

# Check for defunct/zombie processes
ps aux | grep " Z " | grep copilot
```

**Solution:**

```bash
# Kill all copilot ACP processes
pkill -f "copilot --acp"

# Force kill if needed
pkill -9 -f "copilot --acp"

# If specific PID needed
kill -9 <PID>

# Restart server (will spawn fresh process)
coderelay restart

# Verify no zombies
ps aux | grep "copilot --acp"
```

**Prevention:**

- Always use `coderelay restart` instead of killing processes manually
- Ensure graceful shutdown handlers are working (SIGTERM before SIGKILL)

---

### Session List Not Updating

**Symptoms:**

- Copilot session list shows stale data
- New sessions created externally don't appear
- UI shows "No sessions" but sessions exist

**Causes:**

1. **Health check failing silently**
2. **JSON-RPC timeout**
3. **Provider crashed but UI cached data**
4. **Copilot state changed externally**

**Diagnosis:**

```bash
# Check provider health
curl http://127.0.0.1:8790/admin/health | jq '.providers["copilot-acp"]'

# Check server logs for errors
coderelay logs server | grep "copilot-acp\|list_sessions"

# Try manual ACP test
echo '{"jsonrpc":"2.0","id":1,"method":"list_sessions","params":{}}' | copilot --acp
```

**Solutions:**

1. **Restart provider:**

   ```bash
   coderelay restart
   ```

2. **Clear browser cache:**

   - Desktop: Cmd+Shift+R (hard refresh)
   - iPhone Safari: Close tab and reopen

3. **Check Copilot CLI state:**

   ```bash
   # If using gh copilot, check auth
   gh auth status

   # Re-login if needed
   gh auth login
   ```

4. **Verify RPC method exists:**

   ```bash
   # Some Copilot CLI versions may not support list_sessions
   copilot --help | grep -i session
   ```

---

### Performance Degradation

**Symptoms:**

- Slow session list loading (>5 seconds)
- Health checks timing out intermittently
- UI feels sluggish when viewing Copilot sessions

**Causes:**

1. **Too many sessions** - Large session list takes time to serialize
2. **Slow RPC responses** - Copilot CLI itself is slow
3. **Resource exhaustion** - Server running out of memory/CPU

**Diagnosis:**

```bash
# Check server resource usage
top -pid $(pgrep -f local-orbit)

# Check response times
time curl http://127.0.0.1:8790/admin/health

# Check number of sessions (if available)
coderelay logs server | grep "list_sessions" | tail -20
```

**Solutions:**

1. **Increase timeout:**

   ```bash
   # Future: set via environment
   export ACP_TIMEOUT_MS=10000
   coderelay restart
   ```

2. **Limit session fetching:**

   - UI pagination (if supported)
   - Filter to recent sessions only

3. **Restart periodically:**

   ```bash
   # Add to cron for daily restart
   0 4 * * * ~/.coderelay/bin/coderelay restart
   ```

4. **Check Copilot CLI version:**

   ```bash
   copilot --version
   # Update if very old
   npm update -g @github/copilot-cli
   ```

---

## Next Steps

If provider issues persist:

1. **Gather diagnostics:**

   ```bash
   coderelay diagnose > /tmp/diagnose.txt
   coderelay logs server > /tmp/server.log
   coderelay logs anchor > /tmp/anchor.log
   curl http://127.0.0.1:8790/admin/health > /tmp/health.json
   ```

2. **Open GitHub issue:**

   - Repository: <https://github.com/ddevalco/coderelay/issues>
   - Include: diagnostics files, error messages, steps to reproduce
   - Tag with: `provider`, `copilot-acp`, `bug`

3. **Check existing issues:**

   - <https://github.com/ddevalco/coderelay/issues?q=label%3Aprovider>

4. **Disable problematic provider temporarily:**

   - The system will continue operating with other providers
   - Codex sessions remain fully functional

---

## Related Documentation

- [Main Troubleshooting Guide](TROUBLESHOOTING.md) - General issues and setup
- [Architecture](ARCHITECTURE.md) - System design and provider contracts
- [Development](DEVELOPMENT.md) - Building and testing providers
- [CLI Reference](CLI.md) - Command-line tools
- [Admin Guide](ADMIN.md) - Admin UI and configuration

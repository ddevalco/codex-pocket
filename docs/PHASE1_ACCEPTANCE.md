# Phase 1 Acceptance Runbook

Issue: #130 - Multi-provider support with Copilot ACP adapter (read-only)  
Branch: `codex/130-acp-phase1-registry`  
Date: 2026-02-17

## Validation Results (2026-02-17)

### Automated Test Outcomes

- `npm run build` — **PASS**
- `bunx tsc --noEmit` (root) — **PASS**
- `bunx tsc --noEmit` (`services/local-orbit`) — **PASS**
- `bun test` — **PASS** (23 pass, 0 fail)

### Acceptance Status Snapshot

- TypeScript compilation passes with no errors — **PASS**
- All unit tests pass (registry, acp-client, normalizers) — **PASS**
- Bundle size within thresholds (15%/30% total, 20%/50% per-chunk) — **NEEDS_MANUAL**
- Copilot sessions visible in Home UI (Scenario 1) — **NEEDS_MANUAL**
- Provider sections display with correct labels and badges — **NEEDS_MANUAL**
- Read-only enforcement works (disabled buttons, tooltip, JSON-RPC error) — **NEEDS_MANUAL**
- Graceful degradation when Copilot CLI missing (Scenario 2) — **NEEDS_MANUAL**
- No regressions to Codex functionality (create, send, archive work) — **NEEDS_MANUAL**
- Provider registry starts and stops cleanly (Scenario 3) — **NEEDS_MANUAL**
- Health endpoint returns correct status for all providers — **NEEDS_MANUAL**
- No console errors during normal operation — **NEEDS_MANUAL**
- Documentation updated (Epic, Architecture, Providers, README) — **NEEDS_MANUAL**

## Automated Checks ✓

Run these before manual testing:

```bash
# TypeScript compilation
cd services/local-orbit
npx tsc --noEmit

# Unit tests
bun test src/providers/__tests__/
bun test src/providers/adapters/__tests__/
bun test src/providers/normalizers/__tests__/

# Bundle size check
npm run build
./scripts/check-bundle-size.sh

# Linting
npm run lint
```

**Expected:** All checks pass, no TypeScript errors, bundle sizes within thresholds.

## Manual Test Scenarios

### Scenario 1: Copilot CLI Installed ✓

**Setup:**

- Ensure `gh copilot --acp` or `copilot --acp` is available
- Start at least one Copilot session in terminal

**Test Steps:**

1. **Start local-orbit:**

   ```bash
   cd services/local-orbit
   bun run src/index.ts
   ```

   **Expected:**
   - Console shows "Starting all providers..."
   - "[copilot-acp] Starting adapter" logged
   - "[copilot-acp] Successfully started" logged
   - No errors in startup logs

2. **Check health endpoint:**

   ```bash
   curl http://localhost:3030/admin/health
   ```

   **Expected:**

   ```json
   {
     "providers": [
       { "provider": "codex", "healthy": true, "message": "OK" },
       { "provider": "copilot-acp", "healthy": true, "message": "Ready" }
     ]
   }
   ```

3. **Open Home UI on iPhone/browser:**
   - Navigate to CodeRelay app
   - Go to Home screen

   **Expected:**
   - Two provider sections visible:
     - "Codex" with "New task" button
     - "GitHub Copilot" with "Read-only" badge
   - Copilot section shows active sessions
   - Session titles and previews display correctly

4. **Verify read-only enforcement:**
   - Locate a Copilot session in the list
   - Observe action buttons (archive/rename)

   **Expected:**
   - Archive button is visually disabled (dimmed, opacity reduced)
   - Rename button is visually disabled
   - Hovering shows tooltip: "Copilot sessions are read-only in Phase 1"
   - Clicking disabled button does nothing

5. **Attempt write operation via DevTools (optional):**

   - Open browser DevTools WebSocket inspector
   - Send manual JSON-RPC request:

     ```json
     {
       "jsonrpc": "2.0",
       "id": 999,
       "method": "turn/start",
       "params": {
         "threadId": "copilot-acp:session-123",
         "message": "Test"
       }
     }
     ```

   **Expected:**

   - Response is JSON-RPC error:

     ```json
     {
       "jsonrpc": "2.0",
       "id": 999,
       "error": {
         "code": -32000,
         "message": "Copilot sessions are read-only in Phase 1",
         "data": { "provider": "copilot-acp", "phase": 1 }
       }
     }
     ```

6. **Verify Codex functionality unchanged:**
   - Click "New task" in Codex section
   - Create a new Codex thread
   - Send a prompt
   - Archive the thread

   **Expected:**
   - All Codex operations work normally
   - No errors related to provider system
   - Thread list updates correctly

### Scenario 2: Copilot CLI Not Installed ✗

**Setup:**

- Rename/remove `gh` CLI or `copilot` binary temporarily
- Or test on a machine without Copilot installed

**Test Steps:**

1. **Start local-orbit:**

   ```bash
   cd services/local-orbit
   bun run src/index.ts
   ```

   **Expected:**
   - "[copilot-acp] Starting adapter" logged
   - "[copilot-acp] Executable not found, using degraded mode" logged
   - No fatal errors, server starts successfully

2. **Check health endpoint:**

   ```bash
   curl http://localhost:3030/admin/health
   ```

   **Expected:**

   ```json
   {
     "providers": [
       { "provider": "codex", "healthy": true, "message": "OK" },
       { "provider": "copilot-acp", "healthy": false, "message": "CLI not installed" }
     ]
   }
   ```

3. **Open Home UI:**
   - Navigate to Home screen

   **Expected:**
   - Codex section displays normally
   - GitHub Copilot section shows empty state:
     - "No Copilot sessions detected"
     - Or "Copilot CLI not installed" message
   - No JavaScript errors in console

4. **Verify Codex still works:**
   - Create and interact with Codex threads

   **Expected:**
   - Full Codex functionality intact
   - Copilot section remains empty but doesn't break UI

### Scenario 3: Server Restart & Shutdown ✓

**Test Steps:**

1. **Graceful shutdown:**
   - Start local-orbit
   - Send SIGTERM: `kill -TERM <pid>` or Ctrl+C

   **Expected:**
   - "Shutting down providers..." logged
   - "[copilot-acp] Stopping adapter" logged
   - "[copilot-acp] Successfully stopped" logged
   - Process exits cleanly within 5 seconds

2. **Restart:**
   - Restart local-orbit

   **Expected:**
   - Providers initialize successfully
   - Previous sessions visible in UI
   - No stale processes or resources

## Acceptance Criteria

- [ ] TypeScript compilation passes with no errors
- [ ] All unit tests pass (registry, acp-client, normalizers)
- [ ] Bundle size within thresholds (15%/30% total, 20%/50% per-chunk)
- [ ] Copilot sessions visible in Home UI (Scenario 1)
- [ ] Provider sections display with correct labels and badges
- [ ] Read-only enforcement works (disabled buttons, tooltip, JSON-RPC error)
- [ ] Graceful degradation when Copilot CLI missing (Scenario 2)
- [ ] No regressions to Codex functionality (create, send, archive work)
- [ ] Provider registry starts and stops cleanly (Scenario 3)
- [ ] Health endpoint returns correct status for all providers
- [ ] No console errors during normal operation
- [ ] Documentation updated (Epic, Architecture, Providers, README)

## Sign-Off

**Tested By:** _________________  
**Date:** _________________  
**Result:** ☐ PASS  ☐ FAIL (see notes)

**Notes:**

_______________________________________________________

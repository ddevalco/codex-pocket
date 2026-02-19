# ACP Approval Event Findings

## ACP Approval Protocol Testing Findings

**Test Date:** 2026-02-18  
**Test ID:** acp-approval-protocol-test  
**Tester:** Backend Developer Agent (Autonomous)  

## Executive Summary

- ✅ **GitHub Copilot CLI installed and ACP mode IS functional**  
- ⚠️ **Cannot fully test approval events due to undocumented protocol methods**  
- 🔍 **Strong evidence that approval mechanism exists in CLI design**  

## Environment Details

### GitHub CLI

- **Installed:** Yes
- **Version:** 2.86.0 (2026-01-21)
- **Path:** `/opt/homebrew/bin/gh`

### Copilot CLI Extension

- **Installed:** Yes  
- **Version:** 0.0.410/0.0.411  
- **ACP Mode Supported:** ✅ YES (`--acp` flag available)  
- **Path:** `/opt/homebrew/lib/node_modules/@github/copilot`  

## Test Results

### 1. ACP Mode Initialization ✅ SUCCESS

**Command tested:**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"test","version":"1.0"}}}' | gh copilot -- --acp
```

**Response received:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": 1,
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": {
        "image": true,
        "audio": false,
        "embeddedContext": true
      },
      "sessionCapabilities": {
        "list": {}
      }
    },
    "agentInfo": {
      "name": "Copilot",
      "title": "Copilot",
      "version": "0.0.411"
    },
    "authMethods": [
      {
        "id": "copilot-login",
        "name": "Log in with Copilot CLI",
        "description": "Run `copilot login` in the terminal",
        "_meta": {
          "terminal-auth": {
            "command": "/opt/homebrew/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot",
            "args": ["login"],
            "label": "Copilot Login"
          }
        }
      }
    ]
  }
}
```

**Analysis:**

- JSON-RPC 2.0 protocol confirmed working
- Protocol version 1 supported
- Agent capabilities returned successfully
- Authentication methods exposed

### 2. Method Discovery ⚠️ BLOCKED

**Methods tested (all returned "Method not found"):**

- `agent/chat`
- `agent/prompt`  
- `sendPrompt`
- `session/create`

**Error example:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32601,
    "message": "\"Method not found\": agent/chat",
    "data": {"method": "agent/chat"}
  }
}
```

**Impact:** Cannot trigger tool execution requests to test for approval events.

### 3. Approval Evidence from CLI Flags 🔍 STRONG INDICATOR

**Key finding from `gh copilot -- --help`:**

```text
--allow-all-tools           Allow all tools to run automatically
                            without confirmation; required for
                            non-interactive mode (env:
                            COPILOT_ALLOW_ALL)
```

**Additional related flags:**

- `--allow-tool [tools...]` - Tools the CLI has permission to use; will not prompt for permission
- `--deny-tool [tools...]` - Tools the CLI does not have permission to use; will not prompt for permission
- `--allow-all-paths` - Disable file path verification
- `--allow-all-urls` - Allow access to all URLs without confirmation

**Analysis:**

- The existence of `--allow-all-tools` strongly implies that **WITHOUT this flag, tools DO require confirmation**
- The flag description explicitly states "without confirmation" - meaning confirmation IS THE DEFAULT
- Multiple granular permission flags (`allow-tool`, `deny-tool`) suggest sophisticated approval system
- The `COPILOT_ALLOW_ALL` environment variable provides programmatic control

## Evidence Summary

### Approval System Exists: HIGH CONFIDENCE

**Supporting evidence:**

1. `--allow-all-tools` flag exists specifically to bypass confirmations
2. Granular tool permission system (`--allow-tool`, `--deny-tool`)
3. URL and path confirmation flags
4. Help text explicitly mentions "without confirmation" as non-default behavior

### Protocol Approval Events: UNKNOWN

**Blocking issue:**

- ACP protocol method names not documented in CLI help
- No specification found in installation directory  
- Cannot trigger tool execution to observe approval event structure

## Findings Classification

### What We KNOW ✅

1. ACP mode exists and works (`--acp` flag)
2. JSON-RPC 2.0 protocol with initialize handshake
3. Approval/confirmation IS part of the CLI design (based on flags)
4. Auto-approval can be enabled via `--allow-all-tools`
5. Granular permission control available

### What We DON'T KNOW ❌

1. Exact JSON-RPC method names for sending prompts/commands
2. Protocol event structure for approval requests
3. How client responds to approval requests
4. Notification types emitted during tool execution
5. Whether approvals are request/response or notification-based

## Implementation Implications for P4-04

### Can We Implement? ⚠️ PARTIAL

**What we CAN do:**

1. Detect ACP mode capability (`--acp` flag)
2. Initialize ACP connection  
3. Provide toggle to enable `--allow-all-tools` for auto-approval
4. Expose granular permission flags in UI

**What we CANNOT do (yet):**

1. Implement approval UI flow (protocol events unknown)
2. Show approval requests to user
3. Respond to approval requests
4. Intercept tool execution for user confirmation

## Recommendations

### RECOMMENDATION: DEFER FULL IMPLEMENTATION

**Reasoning:**

- Protocol methods undocumented in public help
- Cannot test approval event flow without protocol spec
- Risk of implementing against educated guesses

**Alternative: Implement Partial Support**

If immediate delivery needed, implement limited support:

```text
// Phase 1: Auto-approval mode only
interface CopilotACPConfig {
  mode: 'acp';
  autoApproveTools: boolean; // Maps to --allow-all-tools
  allowedTools?: string[];   // Maps to --allow-tool
  deniedTools?: string[];    // Maps to --deny-tool
}

// Start Copilot with auto-approval
function startCopilotACP(config: CopilotACPConfig) {
  const args = ['gh', 'copilot', '--', '--acp'];
  
  if (config.autoApproveTools) {
    args.push('--allow-all-tools');
  }
  
  if (config.allowedTools) {
    args.push('--allow-tool', ...config.allowedTools);
  }
  
  // Launch process...
}
```

**Benefit:** Provides value without blocked features  
**Limitation:** No interactive approval UI (user must pre-configure permissions)

### Next Steps to Unblock Full Implementation

1. **Option A: Request GitHub Documentation**
   - Contact GitHub Copilot team for ACP protocol spec
   - File issue on GitHub CLI repository asking for documentation
   - Check if spec is available in GitHub Copilot for VS Code extension

2. **Option B: Reverse Engineer Protocol**
   - Examine GitHub Copilot VS Code extension source code
   - Look for ACP client implementation
   - Extract method names and event structures

3. **Option C: Monitor Network Traffic**
   - Use VS Code with Copilot in ACP mode
   - Capture JSON-RPC traffic between VS Code and Copilot CLI  
   - Analyze actual approval events in real client session

## Test Artifacts

### Created Files

- `/Users/danedevalcourt/iPhoneApp/codex-pocket/scripts/debug/test-acp-approvals.ts` - Automated test script (blocked by Bun API issues)
- `/Users/danedevalcourt/iPhoneApp/codex-pocket/scripts/debug/test-acp-simple.sh` - Shell-based test
- This findings document

### Test Commands That Worked

```bash
# Initialize ACP connection
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"test","version":"1.0"}}}' | gh copilot -- --acp

# Check CLI version
gh copilot --version

# View help with flags
gh copilot -- --help
```

## Confidence Levels

| Finding | Confidence |
|---------|-----------|
| ACP mode exists | **HIGH** ✅ |
| Approval mechanism exists in CLI | **HIGH** ✅ |
| Protocol uses JSON-RPC 2.0 | **HIGH** ✅ |
| Protocol emits approval events | **MEDIUM** ⚠️ (inferred from flags) |
| Event structure/methods | **UNKNOWN** ❌ |

## Conclusion

GitHub Copilot CLI's ACP mode is functional and includes an approval/confirmation system (evidenced by `--allow-all-tools` flag and permission controls). However, the protocol's method names for triggering tool execution are undocumented, preventing us from capturing actual approval events.

**P4-04 can proceed with:**

- Auto-approval mode implementation (`--allow-all-tools`)
- Permission configuration UI (allow/deny tools)
- ACP connection establishment

**P4-04 is blocked on:**

- Interactive approval UI (requires protocol event structure)
- Approval request interception  
- Custom approval logic

**Recommended action:** Implement partial support (auto-approval configuration) and file request with GitHub for protocol documentation to unblock full implementation.

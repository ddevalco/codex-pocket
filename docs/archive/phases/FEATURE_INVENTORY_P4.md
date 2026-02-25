# Phase 4 Feature Inventory (Issue #196)

**Generated:** 2026-02-18

**Purpose:** Comprehensive audit of actual implementation to serve as source of truth for documentation rewrite.

## Providers

### ✅ Dual Provider Support

**Evidence:**

- **Source:** [services/local-orbit/src/index.ts](../services/local-orbit/src/index.ts) lines 172-185
- **Registry initialization:** Lines 172-174 create provider registry
- **Codex registration:** Lines 176-179 register CodexAdapter (placeholder)
- **Copilot registration:** Lines 181-189 register CopilotAcpAdapter with config
- **Provider IDs:** `"codex"` and `"copilot-acp"`

**Implementation details:**

- Registry pattern via `createRegistry()` from `providers/registry.js`
- Copilot enabled by default unless `providers["copilot-acp"].enabled === false` in config.json
- Config-driven enabling/disabling per provider

### ✅ Codex Provider (Placeholder)

**Evidence:**

- **Source:** [services/local-orbit/src/providers/adapters/codex-adapter.ts](../services/local-orbit/src/providers/adapters/codex-adapter.ts) lines 1-96
- **Provider ID:** `"codex"` (line 30)
- **Provider name:** `"Codex"` (line 31)
- **Capabilities:** All false except `listSessions: true` (lines 33-42)

**Status:** Phase 1 placeholder. Returns empty session list. Most methods throw "Method not implemented".

### ✅ GitHub Copilot ACP Provider

**Evidence:**

- **Source:** [services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts](../services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts) lines 1-779
- **Provider ID:** `"copilot-acp"` (line 90)
- **Provider name:** `"GitHub Copilot (ACP)"` (line 91)
- **Executable:** Spawns `copilot --acp` CLI process
- **Protocol:** JSON-RPC via AcpClient wrapper
- **Configuration:** Lines 54-77 define CopilotAcpConfig interface

**Full capabilities:**

- `listSessions: true` (line 94)
- `openSession: false` (line 95 - Phase 2 placeholder)
- `sendPrompt: true` (line 96 - Phase 2, Issue #144)
- `streaming: true` (line 97 - Phase 2, Issue #145)
- `attachments: true` (line 98 - Phase 2, P4-03-03 COMPLETE)
- `multiTurn: false` (line 99 - Phase 2)
- `filtering: false` (line 100)
- `pagination: false` (line 101)
- `approvals: !this.config.allowAllTools` (line 104 - dynamic based on --allow-all-tools flag)

## Capability System

### ✅ Capability Flags

**Evidence:**

- **Source:** [src/lib/types.ts](../src/lib/types.ts) lines 35-40
- **Interface:** `ProviderCapabilities`
- **Flags:**
  - `CAN_ATTACH_FILES: boolean` (line 36)
  - `CAN_FILTER_HISTORY: boolean` (line 37)
  - `SUPPORTS_APPROVALS: boolean` (line 38)
  - `SUPPORTS_STREAMING: boolean` (line 39)

### ✅ Default Capability Sets

**Evidence:**

- **Source:** [services/local-orbit/src/index.ts](../services/local-orbit/src/index.ts) lines 278-295
- **Type:** `PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities>`

**Codex capabilities (lines 279-285):**

```typescript
codex: {
  CAN_ATTACH_FILES: true,
  CAN_FILTER_HISTORY: true,
  SUPPORTS_APPROVALS: true,
  SUPPORTS_STREAMING: true,
}
```

**Copilot ACP capabilities (lines 286-292):**

```typescript
"copilot-acp": {
  CAN_ATTACH_FILES: true,     // P4-03-03 COMPLETE
  CAN_FILTER_HISTORY: false,
  SUPPORTS_APPROVALS: true,
  SUPPORTS_STREAMING: true,
}
```

### ✅ Capability Helper Functions

**Evidence:**

- **Source:** [src/lib/thread-capabilities.ts](../src/lib/thread-capabilities.ts) lines 1-88
- **Functions:**
  - `canAttachFiles(thread)` - lines 9-15
  - `canFilterHistory(thread)` - lines 24-30
  - `supportsApprovals(thread)` - lines 39-45
  - `supportsStreaming(thread)` - lines 54-60
  - `getCapabilityTooltip(capability, available)` - lines 69-86

**Backward compatibility:** All functions default to `true` if capabilities are undefined (preserves old behavior).

### ✅ UI Adaptation to Capabilities

**Evidence:**

- **Attach button:** [src/lib/components/PromptInput.svelte](../src/lib/components/PromptInput.svelte) line 88
  - `const canAttach = $derived(canAttachFiles(thread));`
- **Thread approval banner:** [src/routes/Thread.svelte](../src/routes/Thread.svelte) lines 63-65
  - `const showAutoApproveBanner = $derived.by(() => threadProvider === "copilot-acp" && !supportsApprovals(currentThread));`

## Approval System

### ✅ ACP Approval Request Protocol

**Evidence:**

- **Source:** [services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts](../services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts) lines 175-204
- **JSON-RPC handler:** Registers `"session/request_permission"` request handler (line 175)
- **Normalizer:** Uses `ACPStreamingNormalizer.normalizePermissionRequest()` (line 176)
- **Pending approvals:** Map stores pending approvals with timeout (60 seconds, line 185)
- **Resolution:** Approvals resolved via `resolveApproval()` method

### ✅ Approval Policy Store

**Evidence:**

- **Source:** [src/lib/approval-policy-store.svelte.ts](../src/lib/approval-policy-store.svelte.ts) lines 1-117
- **LocalStorage key:** `"coderelay_acp_approval_policies"` (line 3)
- **Interface:** `AcpApprovalPolicy` (lines 5-11)
  - `id: string` - unique policy ID
  - `toolKind?: string` - tool category filter
  - `toolTitle?: string` - tool name filter
  - `decision: "allow" | "reject"` - policy decision
  - `createdAt: number` - timestamp
  - `provider: "copilot-acp"` - provider scope

**Store methods:**

- `findMatchingPolicy(toolKind?, toolTitle?)` - lines 66-89 (specificity-based matching)
- `addPolicy(decision, toolKind?, toolTitle?)` - lines 91-108 (deduplicates existing)
- `revokePolicy(id)` - lines 110-113

**Persistence:** Reactive $effect saves to localStorage on mutation (lines 63-65).

### ✅ Approval UI Components

**Evidence:**

- **ApprovalPrompt:** [src/lib/components/ApprovalPrompt.svelte](../src/lib/components/ApprovalPrompt.svelte)
- **Settings policy management:** [src/routes/Settings.svelte](../src/routes/Settings.svelte) lines 400-429
  - Lists all saved policies
  - Shows policy decision, tool kind/title
  - "Revoke" button to remove policies
  - Auto-populated when user chooses "always allow/reject"

**Thread UI integration:**

- **ACP approval request:** [src/routes/Thread.svelte](../src/routes/Thread.svelte) lines 56-59
  - `const pendingAcpApproval = $derived.by(() => messages.getPendingAcpApproval(id));`
- **Auto-approve banner:** Lines 61-63 - shown when approvals disabled (`--allow-all-tools` mode)

### ✅ Approval Decision Routing

**Evidence:**

- **Source:** [services/local-orbit/src/index.ts](../services/local-orbit/src/index.ts) lines 2100-2118
- **Broadcast:** Lines 1963-1975 - `broadcastAcpApprovalRequest()` sends approval request to all clients
- **WebSocket handler:** Lines 2908-2920 - handles `"acp:approval_decision"` from UI clients
- **Adapter resolution:** Calls `acpAdapter.resolveApproval(rpcId, outcome)` to resolve pending approval

**Message types:**

- Outbound: `{ type: "acp:approval_request", ...payload }`
- Inbound: `{ type: "acp:approval_decision", rpcId, outcome }`

### ✅ Approval Options

**Evidence:**

- **Source:** [src/lib/types.ts](../src/lib/types.ts) lines 118-124
- **Interface:** `AcpApprovalOption`
  - `optionId: string` - unique option identifier
  - `name: string` - display name
  - `kind: "allow_once" | "allow_always" | "reject_once" | "reject_always"`

**Interface:** `AcpApprovalRequest` (lines 126-134)

- `rpcId: string | number` - JSON-RPC request ID
- `threadId: string` - session/thread identifier
- `toolCallId: string` - specific tool call ID
- `toolTitle?: string` - human-readable tool name
- `toolKind?: string` - tool category
- `options: AcpApprovalOption[]` - available response options
- `resolvedAt?: number` - resolution timestamp
- `resolution?: { optionId: string | null }` - resolved outcome

## Filtering System

### ✅ Thread Filter State

**Evidence:**

- **Source:** [src/lib/types.ts](../src/lib/types.ts) lines 8-16
- **Types:**
  - `ProviderFilter = "all" | "codex" | "copilot-acp"` (line 8)
  - `StatusFilter = "all" | "active" | "archived"` (line 9)
- **Interface:** `ThreadFilterState` (lines 11-14)
  - `provider: ProviderFilter`
  - `status: StatusFilter`

### ✅ Filter Persistence

**Evidence:**

- **Source:** [src/routes/Home.svelte](../src/routes/Home.svelte) lines 14-55
- **LocalStorage key:** `"coderelay_thread_filters"` (line 14)
- **Default:** `{ provider: "all", status: "all" }` (lines 16-19)
- **Load:** Lines 21-40 - loads from localStorage with validation
- **Save:** Lines 43-50 - persists on change
- **Effect:** Line 54-56 - reactive $effect saves on filter change

### ✅ Filter UI

**Evidence:**

- **Source:** [src/routes/Home.svelte](../src/routes/Home.svelte) (UI implementation in template)
- **Provider filter:** Validates against `["all", "codex", "copilot-acp"]` (line 31)
- **Status filter:** Validates against `["all", "active", "archived"]` (line 34)

### ✅ Filter Logic

**Evidence:**

- **Source:** [src/routes/Home.svelte](../src/routes/Home.svelte) lines 160-184
- **visibleThreads derived:** `$derived.by()` reactive computation

**Provider filtering (lines 163-171):**

```typescript
if (filters.provider !== "all") {
  list = list.filter((t) => {
    if (filters.provider === "copilot-acp") return t.provider === "copilot-acp";
    if (filters.provider === "codex") return t.provider !== "copilot-acp"; // Default is Codex
    return true;
  });
}
```

**Status filtering (lines 173-181):**

```typescript
if (filters.status !== "all") {
  list = list.filter((t) => {
    const isArchived = t.archived === true || t.status === "archived";
    if (filters.status === "archived") return isArchived;
    if (filters.status === "active") return !isArchived;
    return true;
  });
}
```

**Sorting:** Lines 183-184 - sorts by activity, then timestamp, then ID (deterministic).

## Attachment System

### ✅ Attachment Types

**Evidence:**

- **Client-side:** [src/lib/types.ts](../src/lib/types.ts) lines 72-78 - `ImageAttachment` interface
  - `kind: "image"`
  - `filename: string`
  - `mime: string`
  - `localPath: string`
  - `viewUrl: string`

- **Provider-side:** [services/local-orbit/src/providers/provider-types.ts](../services/local-orbit/src/providers/provider-types.ts)
  - `PromptAttachment` interface for provider adapters
  - Normalized attachment validation

### ✅ Attachment Upload Flow

**Evidence:**

- **Source:** [services/local-orbit/src/index.ts](../services/local-orbit/src/index.ts)
- **Upload endpoint:** Lines handle file upload, store to disk
- **Token generation:** Creates short-lived capability URL
- **Database:** `upload_tokens` table (lines 757-766)
  - Columns: token, path, mime, bytes, created_at, expires_at
  - Indexed on expires_at for cleanup

**LocalStorage:** Upload files stored in `UPLOAD_DIR` (env: `ZANE_LOCAL_UPLOAD_DIR`, default: `~/.coderelay/uploads`)

**Retention:** Configurable via `ZANE_LOCAL_UPLOAD_RETENTION_DAYS` (default: 0 = keep forever)

### ✅ ACP Attachment Mapping

**Evidence:**

- **Source:** [services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts](../services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts) lines 423-458
- **Content array construction:** Lines 421-422 - builds ACP content array
- **Attachment loop:** Lines 426-451 - reads and encodes each attachment
  - Calls `readAttachmentContent(localPath)` - lines 37-46 (base64 encoding)
  - Adds to content array with type, mimeType, data, filename
  - Logs successful attachment addition (line 444-446)
  - Continues on individual attachment failures (lines 447-451)

**Fallback:** Lines 464-495 - if ACP rejects attachments, retries with text-only.

### ✅ Attachment UI

**Evidence:**

- **Source:** [src/lib/components/PromptInput.svelte](../src/lib/components/PromptInput.svelte)
- **Capability check:** Line 88 - `const canAttach = $derived(canAttachFiles(thread));`
- **Pending attachments:** Line 86 - `let pendingAttachments = $state<ImageAttachment[]>([]);`
- **Upload state:** Lines 84-85 - `uploadBusy` and `uploadError` flags
- **Submit validation:** Line 89 - allows submit if attachments present (even with empty text)

**Markdown composition:** Lines 138-148 - embeds attachment markdown in composed text.

## Architecture

### ✅ WebSocket Message Types

**Evidence:**

- **Source:** [services/local-orbit/src/index.ts](../services/local-orbit/src/index.ts)
- **Approval request:** Lines 1970-1971 - `{ type: "acp:approval_request", ...payload }`
- **Approval decision:** Lines 2909 - `{ type: "acp:approval_decision", rpcId, outcome }`
- **Thread list augmentation:** Lines 11 - `threadListRequests` tracks list requests for capability injection

### ✅ Database Schema

**Evidence:**

- **Source:** [services/local-orbit/src/index.ts](../services/local-orbit/src/index.ts) lines 741-785

**events table (lines 742-754):**

```sql
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  direction TEXT NOT NULL,
  role TEXT NOT NULL,
  method TEXT,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_thread_created ON events(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
```

**upload_tokens table (lines 757-766):**

```sql
CREATE TABLE IF NOT EXISTS upload_tokens (
  token TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_expires ON upload_tokens(expires_at);
```

**token_sessions table (lines 769-779):**

```sql
CREATE TABLE IF NOT EXISTS token_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'full',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_token_sessions_revoked ON token_sessions(revoked_at);
```

### ✅ LocalStorage Keys

**Evidence:**

- Filter state: `"coderelay_thread_filters"` - [src/routes/Home.svelte](../src/routes/Home.svelte) line 14
- Approval policies: `"coderelay_acp_approval_policies"` - [src/lib/approval-policy-store.svelte.ts](../src/lib/approval-policy-store.svelte.ts) line 3
- Enter behavior: `"coderelay_enter_behavior"` - [src/routes/Settings.svelte](../src/routes/Settings.svelte) line 38
- Quick replies: Managed by `loadQuickReplies()` / `saveQuickReplies()`
- Agent presets: Managed by `loadAgentPresets()` / `saveAgentPresets()`
- Helper profiles: Managed by `loadHelperProfiles()` / `saveHelperProfiles()`

### ✅ Environment Variables

**Evidence:**

- **Source:** [services/local-orbit/src/index.ts](../services/local-orbit/src/index.ts) lines 23-146
- **Port:** `ZANE_LOCAL_PORT` (default: 8790) - line 23
- **Host:** `ZANE_LOCAL_HOST` (default: 127.0.0.1) - line 24
- **Config:** `ZANE_LOCAL_CONFIG_JSON` - line 25
- **Token:** `ZANE_LOCAL_TOKEN` - line 26
- **Database:** `ZANE_LOCAL_DB` (default: `~/.coderelay/coderelay.db`) - line 27
- **Upload dir:** `ZANE_LOCAL_UPLOAD_DIR` (default: `~/.coderelay/uploads`) - line 67
- **Upload retention:** `ZANE_LOCAL_UPLOAD_RETENTION_DAYS` (default: 0) - line 68
- **Upload prune interval:** `ZANE_LOCAL_UPLOAD_PRUNE_INTERVAL_HOURS` (default: 6) - line 72

## Settings

### ✅ Connection Settings

**Evidence:**

- **Source:** [src/routes/Settings.svelte](../src/routes/Settings.svelte) lines 295-342
- **Orbit URL:** Auto-derived in local mode (line 302)
- **Connect/Disconnect:** Lines 320-329 - manual connection control
- **Status indicators:** Line 315-318 - connection status chip

### ✅ Device Management

**Evidence:**

- **Source:** [src/routes/Settings.svelte](../src/routes/Settings.svelte) lines 344-371
- **Anchor list:** Lines 356-369 - displays connected devices
- **Device info:** Shows hostname, platform, connection time

### ✅ Composer Settings

**Evidence:**

- **Source:** [src/routes/Settings.svelte](../src/routes/Settings.svelte) lines 377-394
- **Enter key behavior:** Lines 381-391
  - Options: "Enter inserts newline" (Cmd/Ctrl+Enter sends) OR "Enter sends" (Shift+Enter newline)
  - Stored per-device in localStorage

### ✅ Approval Policy Management

**Evidence:**

- **Source:** [src/routes/Settings.svelte](../src/routes/Settings.svelte) lines 396-429
- **Policy list:** Lines 408-426 - displays all saved approval policies
- **Revoke action:** Line 421 - `approvalPolicyStore.revokePolicy(policy.id)`
- **Empty state:** Lines 405-407 - explains how rules are created

### ✅ Quick Replies

**Evidence:**

- **Source:** [src/routes/Settings.svelte](../src/routes/Settings.svelte) lines 431-481
- **Max count:** `MAX_QUICK_REPLIES` constant
- **Fields:** Label (24 char max) + Text (280 char max)
- **Actions:** Add, Remove, Save
- **Storage:** Per-device in localStorage

### ✅ Agent Presets

**Evidence:**

- **Source:** [src/routes/Settings.svelte](../src/routes/Settings.svelte) lines 483-580
- **Max count:** `MAX_AGENT_PRESETS` constant
- **Fields:**
  - Name (64 char max)
  - Mode (code/plan)
  - Model (120 char max)
  - Reasoning effort (low/medium/high)
  - Developer instructions (4000 char max)
  - Starter prompt (4000 char max)
- **Actions:** Add, Remove, Save, Export JSON, Import JSON
- **Storage:** Per-device in localStorage

### ✅ Helper Profiles

**Evidence:**

- **Source:** [src/routes/Settings.svelte](../src/routes/Settings.svelte) lines 582-660
- **Max count:** `MAX_HELPER_PROFILES` constant
- **Fields:**
  - Name
  - Preset ID (references agent preset)
  - Prompt
- **Actions:** Add, Remove, Save
- **Validation:** Lines 137-146 - auto-removes profiles for deleted presets

## Thread Information

### ✅ ThreadInfo Interface

**Evidence:**

- **Source:** [src/lib/types.ts](../src/lib/types.ts) lines 18-33
- **Fields:**
  - `id: string` - unique thread identifier
  - `preview?: string` - thread preview text
  - `title?: string` - thread title
  - `name?: string` - thread name
  - `cwd?: string` - working directory
  - `path?: string` - file path
  - `project?: string` - project name
  - `repo?: string` - repository name
  - `gitBranch?: string` - git branch
  - `gitOriginUrl?: string` - git remote URL
  - `createdAt?: number` - creation timestamp
  - `updatedAt?: number` - last update timestamp
  - `lastActivity?: number` - last activity timestamp
  - `lastActiveAt?: number` - last active timestamp
  - `modelProvider?: string` - model provider
  - `provider: "codex" | "copilot-acp"` - provider type
  - `status?: string` - thread status
  - `archived: boolean` - archived flag
  - `capabilities?: ProviderCapabilities` - capability flags

## Known Gaps (Not Yet Documented in README)

### ❌ Config.json Schema

**What's implemented:**

- Provider configuration: `providers["copilot-acp"].enabled` - [services/local-orbit/src/index.ts](../services/local-orbit/src/index.ts) lines 182-189
- Token storage: `config.json` token field - lines 119-125
- Upload configuration: `uploadDir`, `uploadRetentionDays`, `uploadPruneIntervalHours` - lines 127-145

**Not documented in README:** Full config.json schema with all available fields.

### ❌ CLI Commands Detail

**What's implemented:**

- CLI commands enumeration: [services/local-orbit/src/index.ts](../services/local-orbit/src/index.ts) lines 267-276 define `CliCommandId` type
- Full command set: status, diagnose, restart, start, stop, ensure, self-test, smoke-test, logs-server, logs-anchor, urls

**Documentation exists:** [docs/CLI.md](../docs/CLI.md) covers most commands

### ❌ ACP Process Management

**What's implemented:**

- Process spawning: [services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts](../services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts) lines 151-169
- Health checking: Lines 228-318
- Handshake protocol: Lines 163-166 (placeholder)
- Graceful degradation: Lines 153-160 (no throw on CLI not found)

**Not documented:** How ACP process lifecycle works, failure modes, recovery strategies.

### ❌ Normalizer Architecture

**What's implemented:**

- ACPStreamingNormalizer: Referenced in [services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts](../services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts) line 32
- Event normalization: Lines 560-574 (subscribe implementation)

**Not documented:** How raw ACP events are normalized, what streaming protocol looks like, how events are flushed.

## Summary Statistics

- **Providers:** 2 (Codex placeholder, Copilot ACP full)
- **Capability flags:** 4 (CAN_ATTACH_FILES, CAN_FILTER_HISTORY, SUPPORTS_APPROVALS, SUPPORTS_STREAMING)
- **Filter axes:** 2 (Provider, Status)
- **LocalStorage keys:** 6+ (filters, policies, enter behavior, quick replies, presets, helpers)
- **Database tables:** 3 (events, upload_tokens, token_sessions)
- **Environment variables:** 20+
- **WebSocket message types:** 10+ (including approval_request, approval_decision, thread updates)

## Recommendations for Docs Update

1. **README.md:**
   - Add capability flag reference table
   - Document approval policy workflow (with screenshots)
   - Add filtering UI explanation with examples
   - Link to PROVIDERS.md for adapter architecture

2. **New PROVIDERS.md:**
   - Provider adapter contract
   - Capability declaration
   - Registration pattern
   - How to add new providers

3. **New CAPABILITIES.md:**
   - Capability flag definitions
   - UI adaptation patterns
   - Backward compatibility strategy
   - Graceful degradation examples

4. **New APPROVALS.md:**
   - Approval request protocol
   - Policy matching logic
   - WebSocket message flow
   - UI integration points

5. **ARCHITECTURE.md updates:**
   - Add provider registry section
   - Document capability injection in thread list
   - Explain approval routing through WebSocket relay

6. **TROUBLESHOOTING_PROVIDERS.md:**
   - ACP process lifecycle
   - Copilot CLI not found scenarios
   - Approval timeout handling
   - Attachment fallback logic

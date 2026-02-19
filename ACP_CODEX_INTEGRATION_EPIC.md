# ACP_CODEX_INTEGRATION_EPIC.md

## Overview

This document tracks the multi-phase integration of GitHub Copilot ACP (Agent Control Protocol) into Codex Pocket, enabling a unified multi-provider interface.

## Phase 1: Registry & Read-Only Adapter ✅ COMPLETE

**Status**: Completed 2026-02-17 (PR #143)

**Goal**: Establish provider abstraction layer and read-only Copilot session viewing.

### Completed Items

- [x] Provider adapter contracts + normalized schemas (#129)
- [x] Copilot ACP adapter process management and read-only session ingestion (#130)
- [x] Provider registry with lifecycle management (start/stop/health)
- [x] Unified provider and session listing endpoints
- [x] UI provider grouping on Home screen

## Phase 2: Write Capability & Streaming ✅ COMPLETE

**Status**: Completed 2026-02-17 (PRs #147, #148, #149)

**Goal**: Enable prompt submission and real-time streaming responses.

### Completed Items

- [x] ACP write capability - `sendPrompt` method (#144)
- [x] Streaming response handling with incremental UI updates (#145)
- [x] UI prompt input for Copilot sessions (#146)
- [x] Automatic capability detection for UI enablement

## Phase 3: Unified Grouping + Filters ✅ MOSTLY COMPLETE

**Status**: Provider grouping completed in Phase 1; advanced filtering in Phase 4

### Completed Items

- [x] Provider grouping UX (completed in PR #143)
- [ ] Provider filter chips (moved to Phase 4)
- [ ] Persisted view preferences (moved to Phase 4)

## Phase 4: Rich Media, Approvals & Hardening ✅ COMPLETE

**Status**: Completed 2026-02-18

**Goal**: Full-featured ACP integration with capability detection, attachments, approvals, filtering, and reliability hardening.

### P4-01: Provider Capability Detection System ✅ COMPLETE

**Status**: Completed 2026-02-18 (#151)

- [x] Backend: `ProviderCapabilities` interface with feature flags
  - `CAN_ATTACH_FILES`: Attachment support
  - `CAN_FILTER_HISTORY`: History filtering
  - `SUPPORTS_APPROVALS`: Tool permission prompts
  - `SUPPORTS_STREAMING`: Real-time response streaming
- [x] Backend: `getProviderCapabilities()` normalization helper
- [x] Backend: `injectThreadCapabilities()` API payload augmentation
- [x] Frontend: `ProviderCapabilities` interface in types.ts
- [x] Frontend: `parseCapabilities()` and thread info normalization
- [x] Provider defaults: Codex (all true), Copilot (limited)
- [x] Validation: Type-check pass, build pass (689 modules), E2E verified

### P4-02: Graceful Degrade UX ✅ COMPLETE

**Status**: Completed 2026-02-18 (#152)

- [x] Created `thread-capabilities.ts` helper module
- [x] Gated attachment UI based on `CAN_ATTACH_FILES` capability
- [x] Removed hard-coded provider-specific UI checks
- [x] Added tooltips for disabled features
- [x] Backward compatibility: threads without capabilities default to enabled
- [x] Gated thread list actions (rename/archive) by capability
- [x] Validation: Type-check pass, backward compat verified

### P4-03: ACP Attachment Support ✅ COMPLETE

**Status**: Completed 2026-02-18

- [x] Created `PromptAttachment` interface
- [x] Attachment normalization helpers (`normalizeAttachment`, `isValidAttachment`)
- [x] Extended relay `routeAcpSendPrompt` to extract and normalize attachments
- [x] ACP adapter reads file content, base64 encodes for ACP protocol
- [x] ACP content array format: `[{type: "text"}, {type: "image", data: base64, mimeType}]`
- [x] Graceful fallback: text-only retry when ACP rejects attachments
- [x] Updated capability flags: `attachments: true`, `CAN_ATTACH_FILES: true`
- [x] Frontend passes attachments in `sendPrompt` params
- [x] Validation: Static checks pass, ready for manual testing

### P4-04: ACP Approvals + Tool Permission Handling ✅ COMPLETE

**Status**: Completed 2026-02-18 (#154)

- [x] Bidirectional JSON-RPC support in `AcpClient` (server→client requests)
- [x] Normalized `session/request_permission` into `approval_request` events
- [x] CopilotAcpAdapter mode-aware capabilities + 60s timeout auto-cancel
- [x] Relay wiring — forwards approvals to UI, routes decisions back to ACP
- [x] Persistent approval policy store (localStorage, auto-apply, revoke)
- [x] Frontend approval message handling and ACP-compliant decision sending
- [x] Thread.svelte approval UI components
- [x] Auto-approve warning banner (detects `--allow-all-tools`)
- [x] Settings policy management UI
- [x] Validation: Type-check ✅ 0 errors | Build ✅ Pass | 20/20 acceptance criteria ✅

### P4-05: Advanced Filtering + View Persistence ✅ COMPLETE

**Status**: Completed 2026-02-18 (#155)

- [x] Provider filter chips (All, Codex, Copilot) with live counts
- [x] Status filter chips (All, Active, Archived) with live counts
- [x] Mobile-responsive flex-wrap layout
- [x] Empty state handling when no threads match filters
- [x] localStorage persistence (key: `codex_pocket_thread_filters`)
- [x] Defensive hydration on page load for filter state
- [x] Keyboard navigation and ARIA attributes for chip controls
- [x] Types: `ThreadFilterState`, `ProviderFilter`, `StatusFilter`
- [x] Files: Home.svelte, threads.svelte.ts, types.ts
- [x] Validation: Type-check pass, Build pass, All 9 acceptance criteria met

### P4-06: Hardening + Release Gate ✅ COMPLETE

**Status**: Completed 2026-02-18 (#156)

- [x] Runtime hardening: 30s timeout enforcement for `sendPrompt` operations
- [x] Automatic retry logic: Exponential backoff retry (up to 3 attempts)
- [x] Health tracking: Provider health monitoring with consecutive failure detection
- [x] Test coverage expansion: Timeout, retry, isolation, error recovery tests
- [x] CI enhancements: Capability smoke tests, regression guards
- [x] Performance telemetry: Timeout and retry metrics
- [x] Validation: Type-check ✅ 0 errors | Tests ✅ 74 pass | Build ✅ Pass

## Implementation Summary

**Backend Files:**

- `services/local-orbit/src/providers/provider-types.ts` - Capability interfaces
- `services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts` - ACP adapter
- `services/local-orbit/src/relay/acp-client.ts` - Bidirectional JSON-RPC
- `services/local-orbit/src/index.ts` - Relay wiring and attachment handling

**Frontend Files:**

- `src/lib/types.ts` - Capability and filter type definitions
- `src/lib/threads.svelte.ts` - Thread store with filter state
- `src/lib/thread-capabilities.ts` - Capability check helpers
- `src/lib/approval-policy-store.svelte.ts` - Persistent approval policies
- `src/routes/Home.svelte` - Filter UI and thread list
- `src/routes/Thread.svelte` - Approval prompts and attachment UI

## Capability Matrix

| Feature | Codex | GitHub Copilot ACP |
|---------|-------|-------------------|
| Send prompts | ✅ | ✅ |
| Stream responses | ✅ | ✅ |
| Attach files/images | ✅ | ✅ |
| Tool approvals | ✅ | ✅ |
| Filter history | ✅ | ⚠️ Limited |
| Rename threads | ✅ | ❌ |
| Archive threads | ✅ | ❌ |

## Next Steps

Phase 4 is complete. Future enhancements may include:

- Additional provider integrations (Claude, GPT, etc.)
- Enhanced context management
- Session recovery and reconnection
- Multi-session orchestration

## References

- GitHub Project: <https://github.com/users/ddevalco/projects/2>
- Phase 4 Issues: #151, #152, #153, #154, #155, #156
- BACKLOG.md: Canonical implementation tracking
- CHANGELOG.md: User-visible feature announcements

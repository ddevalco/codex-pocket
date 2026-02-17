# ACP + Codex Multi-Provider Integration Epic

Date: 2026-02-16

## Status

- ✅ **Phase 0**: Contracts & Schemas (PR #138, merged)
- ✅ **Phase 1**: Registry & Read-Only Adapter (PR #143, merged)
- ✅ **Phase 2**: Prompt Send + Streaming (PRs #147, #148, #149 • 2026-02-17)
- ✅ **Phase 3**: Home UI Grouping (completed in Phase 1 / PR #143)
- 📋 **Phase 4**: Capability Matrix (planned)
- 📋 **Phase 5**: Hardening (planned)

## Summary

Codex Pocket currently integrates deeply with Codex app-server. This epic defines how to add an additional provider path based on ACP (starting with GitHub Copilot CLI ACP server) so users can view and operate both sources in one UI.

Desired UX:
- Home shows provider groups (collapsed/expanded):
  - Codex Sessions
  - Copilot Sessions
- Each provider group retains current project/repo grouping behavior.
- Thread/session details stay provider-native for transport, but provider-agnostic in core UI where possible.

## Why Now

- ACP is becoming a standard ecosystem protocol for editor/agent interoperability.
- Users increasingly run both Codex and Copilot agent workflows and need one operational surface.
- Codex Pocket already has strong transport, persistence, and timeline UX that can host multi-provider aggregation.

## Reality Check: Equivalent vs Compatible

Codex app-server and ACP are compatible in spirit, but not equivalent 1:1.

Shared traits:
- Agent-client protocol transport model (often stdio subprocess + streamed events)
- Session/conversation concept
- Prompt/request execution lifecycle
- Incremental updates and tool/event reporting

Important differences:
- Lifecycle and naming: ACP session/prompt/update vs Codex thread/turn/item
- Event taxonomy: ACP update variants vs Codex `turn/*` and `item/*`
- Capabilities surface: Codex has rich review/thread/filter primitives; ACP is provider-agnostic and evolving
- Auth/runtime setup differs per provider implementation (e.g., `copilot --acp` modes)

Conclusion:
- Implement an adapter model, not protocol conflation.

## Proposed Architecture

### 1) Provider Adapter Boundary

Add a provider abstraction inside local-orbit with two initial implementations:
- `codex-app-server` adapter (existing behavior wrapped behind interface)
- `copilot-acp` adapter (new)

Provider adapter contract (conceptual):
- `start()` / `stop()`
- `health()`
- `listSessions(cursor, filters)`
- `openSession(sessionId)`
- `sendPrompt(sessionId, input, options)`
- `subscribe(sessionId)` / `unsubscribe(sessionId)`
- `normalizeEvent(rawEvent) -> NormalizedEvent`

### 2) Unified Session Model

Introduce a normalized session shape used by the UI list layer:
- `provider`: `codex` | `copilot`
- `sessionId`
- `title`
- `project`
- `repo`
- `status`
- `createdAt` / `updatedAt`
- `preview`

Use provider-specific adapters to map source payloads into this model.

### 3) Event Normalization Layer

Define normalized timeline event categories (examples):
- user message
- agent message
- reasoning
- plan
- command/tool
- file change/diff
- approval request / user input request
- provider lifecycle/status

Store both:
- normalized envelope for shared UI rendering
- raw provider payload for debug/replay

### 4) Local-Orbit Runtime Changes

- Add multi-provider registry and config (provider enable/disable)
- Start/monitor each enabled adapter process
- Add provider-aware websocket events to clients
- Keep existing auth/session controls; add provider-safe scoping

### 5) UI Changes

Home:
- provider sections with expand/collapse state
- each section keeps existing sort/group behavior
- provider badges/chips on thread rows

Thread/Detail:
- provider identity in header
- provider-specific capabilities hidden/disabled when unsupported

Settings/Admin:
- provider toggles
- provider health/status panel
- diagnostics for adapter startup/auth failures

## Phased Rollout

### Phase 0 — Design + Contracts ✅ COMPLETED (#129)

**Status:** Implementation complete (2026-02-16)

**Implemented:**

- Provider adapter interface (`ProviderAdapter`) with full lifecycle management
- Normalized session model (`NormalizedSession`) with all required fields
- Normalized event model (`NormalizedEvent`) with comprehensive event taxonomy
- Base normalizer classes (`BaseSessionNormalizer`, `BaseEventNormalizer`)
- Reference Codex implementations demonstrating the normalization pattern
- Utility functions for session/event manipulation, filtering, grouping
- Validation functions ensuring data integrity
- Full TypeScript definitions and documentation

**Files created:**

- `services/local-orbit/src/providers/contracts.ts` - Core adapter interfaces
- `services/local-orbit/src/providers/provider-types.ts` - Type definitions
- `services/local-orbit/src/providers/normalized-session.ts` - Session utilities
- `services/local-orbit/src/providers/normalized-event.ts` - Event utilities
- `services/local-orbit/src/providers/normalizers/session-normalizer.ts` - Session normalization
- `services/local-orbit/src/providers/normalizers/event-normalizer.ts` - Event normalization
- `services/local-orbit/src/providers/index.ts` - Barrel export

**Event taxonomy finalized:**

- `user_message` - User input/prompts
- `agent_message` - Agent/LLM response text
- `reasoning` - Agent reasoning/thinking steps
- `plan` - Agent planning output
- `tool_command` - Tool/command execution
- `file_diff` - File changes/diffs
- `approval_request` - Requires user approval
- `user_input_request` - Requires user input (not just approval)
- `lifecycle_status` - Session lifecycle events
- `metadata` - Metadata updates

**Capability degradation matrix:**

All providers declare capabilities via `ProviderCapabilities`:

- `listSessions`, `openSession`, `sendPrompt`
- `streaming`, `attachments`, `approvals`
- `multiTurn`, `filtering`, `pagination`
- Custom capabilities per provider

**Design principles validated:**

- Raw provider payloads always preserved in `rawSession`/`rawEvent` fields
- Provider-agnostic core with extensibility for future providers
- No breaking changes to existing functionality
- No UI changes (purely backend contracts)

**Validation:**

- ✅ `bunx tsc --noEmit` passes
- ✅ `bun run build` succeeds
- ✅ All interfaces thoroughly documented

**Next phase:** Phase 1 — Read-Only ACP Session Ingestion

## Phase 1: Registry & Read-Only Adapter ✅

**Completed:** 2026-02-16
**PR:** #143
**Scope:** Copilot ACP session listing in Home UI (read-only)

### Implemented

- ✅ ProviderRegistry with lifecycle management
- ✅ CopilotAcpAdapter with process spawning and health checks
- ✅ AcpClient for JSON-RPC communication
- ✅ ACPSessionNormalizer for session transformation
- ✅ Thread list augmentation with ACP sessions
- ✅ Read-only enforcement at relay layer
- ✅ Home UI provider grouping (Codex vs Copilot sections)
- ✅ Action gating (archive/rename disabled for Copilot)
- ✅ Unit tests for registry, client, and normalizers

### Validation

- Copilot sessions visible in Home UI with `provider: 'copilot-acp'`
- Provider sections display correctly with read-only badges
- Write operations blocked with JSON-RPC error
- Graceful degradation when Copilot CLI not installed
- All tests passing, TypeScript compilation clean
- No regressions to existing Codex functionality

### Key Files

- `services/local-orbit/src/providers/registry.ts` - Provider registry
- `services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts` - Copilot adapter
- `services/local-orbit/src/providers/adapters/acp-client.ts` - JSON-RPC client
- `services/local-orbit/src/providers/normalizers/session-normalizer.ts` - Session normalization
- `services/local-orbit/src/index.ts` - Registry integration, thread augmentation, read-only guards
- `src/routes/Home.svelte` - Provider grouping UI

## Phase 2: Prompt Send + Streaming

**Status:** Planning (Entry Gate - Approval Required)  
**Prerequisites:** Phase 1 complete ✅  
**Goal:** Enable sending prompts to Copilot sessions and streaming responses  
**Detailed Plan:** [`docs/PHASE2_PLAN.md`](PHASE2_PLAN.md)

**Issue structure clarification:**
- Umbrella/planning container: #131 (with design/plan context also recorded in #133 and #134)
- Implementation task issues: #144 (`sendPrompt`), #145 (streaming), #146 (UI prompt input)

### Overview

Builds on Phase 1 provider infrastructure to add write capabilities:

- **Send prompts** to Copilot ACP sessions via JSON-RPC `sendPrompt` method
- **Stream responses** incrementally as ACP emits update notifications
- **Parse and aggregate** streaming chunks into unified timeline events
- **Handle errors** gracefully with ACP-specific failure modes (rate limits, timeouts, interruptions)

### Implementation Issues

**⚠️ Entry Gate:** All issues must be reviewed against [`PHASE2_PLAN.md`](PHASE2_PLAN.md) before code execution.

#### Phase 2 Task 1: ACP Write Capability - sendPrompt Method

GitHub Issue: #144 (originally planned as #131)

**Scope:** Implement `CopilotAcpAdapter.sendPrompt()` method with request/response handling.

**Key deliverables:**
- JSON-RPC `sendPrompt` request builder with input validation
- Response parsing to extract `turnId` for correlation
- Error handling for JSON-RPC protocol errors
- Timeout handling (5s default)
- Unit test coverage (90%+ for sendPrompt logic)

**Files:**
- `services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts`
- `services/local-orbit/src/providers/adapters/__tests__/copilot-acp-adapter.test.ts`

**Dependencies:** Phase 1 complete ✅

#### Phase 2 Task 2: Streaming Response Handling

GitHub Issue: #145 (originally planned as #133)

**Scope:** Parse ACP update notifications, aggregate chunks, emit normalized events.

**Key deliverables:**
- `AcpClient` notification routing to session-specific handlers
- `ACPEventNormalizer` class for chunk aggregation and category mapping
- Streaming context management (turnId correlation, timeout cleanup)
- Flush strategies (done marker, type transitions)
- Unit test coverage (95%+ for aggregation logic)

**Files:**
- `services/local-orbit/src/providers/adapters/acp-client.ts`
- `services/local-orbit/src/providers/normalizers/acp-event-normalizer.ts` (NEW)
- `services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts` (subscribe method)
- `services/local-orbit/src/providers/normalizers/__tests__/acp-event-normalizer.test.ts` (NEW)

**Dependencies:** #131 (requires sendPrompt to generate turnIds)

#### Phase 2 Task 3: UI Prompt Input for Copilot Sessions

GitHub Issue: #146 (originally planned as #134)

**Scope:** Enable prompt composer for Copilot sessions with streaming response display.

**Key deliverables:**
- Remove read-only guard for ACP sessions in relay layer
- Enable composer in `ThreadDetail.svelte` based on provider capabilities
- Wire streaming events to WebSocket subscribers
- Display incremental updates in timeline
- Error handling UI (validation, rate limits, timeouts)

**Files:**
- `services/local-orbit/src/index.ts` (relay routing)
- `src/routes/ThreadDetail.svelte`
- `src/lib/components/Composer.svelte` (loading states)

**Dependencies:** #131, #133 (requires backend streaming support)

### Sequencing and Dependencies

```
Phase 1 ✅
    ↓
#131: sendPrompt Method
    ↓
#133: Streaming Handling
    ↓
#134: UI Prompt Input
```

**Critical path:** Issues must be implemented in strict sequence (no parallelization).

**Implementation issue critical path:** #144 → #145 → #146

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Protocol drift (ACP updates) | Pin CLI versions, version detection in health checks |
| Partial capability support | Capability flags prevent UI from exposing unsupported features |
| Provider failure isolation | Process supervision, graceful degradation preserves Codex sessions |
| Streaming errors mid-response | Timeout-based cleanup (30s), emit partial content + error event |
| Rate limiting from backend | Parse rate limit errors, surface to user with retry guidance |

See [`PHASE2_PLAN.md`](PHASE2_PLAN.md) for complete risk table and mitigation strategies.

### Success Criteria

Phase 2 complete when:

1. ✅ All unit tests pass (`bun test`)
2. ✅ TypeScript compilation clean (`bunx tsc --noEmit`)
3. ✅ Integration tests pass (mock ACP streaming)
4. ✅ Manual E2E test script passes with live Copilot CLI
5. ✅ User can send prompt to Copilot session and receive streaming response
6. ✅ Error cases handled gracefully
7. ✅ No regressions to Phase 1 or Codex functionality

### Post-Phase 2 Capabilities

**Enabled:**
- ✅ Read Copilot sessions (Phase 1)
- ✅ Send prompts to Copilot (Phase 2)
- ✅ Stream responses incrementally (Phase 2)

**Deferred:**
- ⏸️ Attachments, approvals, advanced filtering (Phase 4)
- ⏸️ Multi-provider reliability hardening (Phase 5)

### Phase 3 — Unified Grouping + Filters ✅ COMPLETED

**Status:** Completed in Phase 1 (PR #143). Advanced features (filter chips, view persistence) deferred as optional enhancements.

- provider grouping UX ✅ completed in Phase 1
- provider filter chips and persisted view preferences (optional enhancements, deferred)

## Phase 4: Capability Matrix + Graceful Degrade

**Status:** Planning (Plan Approved)
**Detailed Plan:** [`docs/PHASE4_PLAN.md`](PHASE4_PLAN.md)
**Goal:** Introduce capability detection and graceful UI degradation based on provider features.

### Scope

1.  **Capability Plumbing:** Surface provider capability flags in thread/session payloads.
2.  **Graceful Degrade UX:** Disable unsupported actions with explicit hints (no hard-coded checks).
3.  **ACP Attachments:** Extend send path to support file attachments.
4.  **ACP Approvals:** Handle "approve/reject" events from ACP.
5.  **Filtering:** Provider/status filtering with persistence.

### Implementation Issues

**P4-01: Capability Matrix Plumbing**
- Surface provider capability flags in thread/session payloads and client thread model
- Dependencies: Phase 1/2 complete

**P4-02: Graceful Degrade UX**
- Disable unsupported actions with explicit hints based on capability matrix
- Dependencies: P4-01

**P4-03: ACP Attachment Support**
- Extend ACP send path to carry attachments with safe degradation
- Dependencies: P4-01, P4-02

**P4-04: ACP Approvals + User Input Handling**
- Normalize ACP approval/input events and integrate with existing approval components
- Dependencies: P4-03

**P4-05: Advanced Filtering + View Persistence**
- Add provider/status/query filtering with local persistence
- Dependencies: P4-01

**P4-06: Hardening + Release Gate**
- Finalize tests, docs, CI checks following stacked PR discipline
- Dependencies: P4-02, P4-04, P4-05

### Phase 5 — Hardening

- reliability/reconnect behavior for ACP adapter
- metrics and admin observability
- CI smoke for both providers

## Risks and Mitigations

- Protocol drift (ACP preview):
  - pin tested versions and add compatibility guards
- UX inconsistency between providers:
  - use capability matrix and clear affordance gating
- Increased process/runtime complexity:
  - strong adapter health checks and restart policy
- Mapping fidelity loss:
  - retain raw provider payloads for diagnostics and replay

## Success Criteria

- Users can see both Codex and Copilot sessions in one Home screen
- Users can open and run prompts in both provider session types
- Core timeline remains stable and understandable across providers
- Provider-specific failures are isolated and observable

## Issue History & Breakdown

**Original Planning** (initial numbering):
1. Epic: ACP + Codex multi-provider integration (#128)
2. Provider adapter contracts + normalized schemas (#129) ✅ COMPLETED (PR #138)
3. Copilot ACP adapter process and read-only session ingestion (#130) ✅ COMPLETED (PR #143)
4. ACP prompt/send + stream update mapping (planned as #131)
5. Home UI provider grouping (planned as #132, superseded - completed in PR #143)
6. Capability matrix and graceful degrade handling (planned as #133)
7. Hardening: reliability, metrics, CI smoke (planned as #134)

**Current Implementation Issues** (Phase 2):
- #144: ACP write capability - sendPrompt method
- #145: Streaming response handling
- #146: UI prompt input for Copilot sessions

**Note**: Issues #131-#134 were originally planned but implementation proceeded directly to #144-#146. Phase 3 grouping work was completed within Phase 1 (PR #143).


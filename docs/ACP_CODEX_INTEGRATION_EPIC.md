# ACP + Codex Multi-Provider Integration Epic

Date: 2026-02-16

## Status

- ✅ **Phase 0**: Contracts & Schemas (PR #138, merged)
- ✅ **Phase 1**: Registry & Read-Only Adapter (PR #143, merged)
- ✅ **Phase 2**: Prompt Send + Streaming (PRs #147, #148, #149 • 2026-02-17)
- ✅ **Phase 3**: Home UI Grouping + Filtering (PR #143, P4-05)
- ✅ **Phase 4**: Capability Matrix + Graceful Degrade (ALL COMPLETE • 2026-02-18)
- ✅ **Phase 5**: Hardening (COMPLETE • 2026-02-18)
- ✅ **Phase 5.1**: Claude Integration (P5-01 Complete • 2026-02-19)
  - Foundation: PR #212 • Full Implementation: PR #[pending]
  - Anthropic SDK integration with streaming support
  - Session/event normalizers
  - UI provider filter includes Claude
  - See [PHASE5_IMPLEMENTATION_SPECS.md](PHASE5_IMPLEMENTATION_SPECS.md) for details

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

```text
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

- ✅ Attachments, approvals, advanced filtering (Phase 4 COMPLETE)
- ⏸️ Multi-provider reliability hardening (Phase 5)

### Phase 3 — Unified Grouping + Filters ✅ COMPLETED

**Status:** Completed (PR #143, P4-05).

- Provider grouping UX ✅ completed in Phase 1 (PR #143)
- Advanced filter chips and persisted view preferences ✅ completed in Phase 4 (P4-05)

## Phase 4: Capability Matrix + Graceful Degrade

**Status:** ✅ COMPLETE (2026-02-18)

**Detailed Plan:** [`docs/PHASE4_PLAN.md`](PHASE4_PLAN.md)

**Goal:** Introduce capability detection and graceful UI degradation based on provider features.

### Scope

1. **Capability Plumbing:** Surface provider capability flags in thread/session payloads.
2. **Graceful Degrade UX:** Disable unsupported actions with explicit hints (no hard-coded checks).
3. **ACP Attachments:** Extend send path to support file attachments.
4. **ACP Approvals:** Handle "approve/reject" events from ACP.
5. **Filtering:** Provider/status filtering with persistence.

### Implementation Issues

**P4-01: Capability Matrix Plumbing ✅ COMPLETE**

- Surface provider capability flags in thread/session payloads and client thread model
- Dependencies: Phase 1/2 complete
- Status: Completed 2026-02-18 (#151)

**P4-02: Graceful Degrade UX ✅ COMPLETE**

- Disable unsupported actions with explicit hints based on capability matrix
- Dependencies: P4-01
- Status: Completed 2026-02-18 (#152)

**P4-03: ACP Attachment Support ✅ COMPLETE**

- Status: Completed 2026-02-18, ready for manual testing (#153)
- Extend ACP send path to carry attachments with safe degradation
- Dependencies: P4-01, P4-02

**P4-04: ACP Approvals + User Input Handling ✅ COMPLETE**

- Status: Completed 2026-02-18 (#154)
- Normalize ACP approval/input events and integrate with existing approval components
- Dependencies: P4-03

**P4-05: Advanced Filtering + View Persistence ✅ COMPLETE**

- Status: Completed 2026-02-18 (#155)
- Add provider/status/query filtering with local persistence
- Dependencies: P4-01

**P4-06: Hardening + Release Gate ✅ COMPLETE**

- Status: Completed 2026-02-18 (#156)
- Finalize tests, docs, CI checks following stacked PR discipline
- Dependencies: P4-02, P4-04, P4-05
- Includes: 30s timeouts, exponential backoff retry, health tracking, test coverage, CI guards

### Phase 5 — Hardening

- reliability/reconnect behavior for ACP adapter
- metrics and admin observability
- CI smoke for both providers

## Approvals & Tool Permissions

### What approvals are and why they matter

- When Copilot wants to perform a potentially dangerous action (run a shell command, modify a file, make a network request), ACP sends a `session/request_permission` JSON-RPC request before executing.
- This gives the user the ability to allow (once or always) or reject (once or always) the action.
- Without this, users have no oversight or control over what the agent does on their system.
- Supporting approvals is critical for a secure and trustworthy user experience.

### How the ACP approval protocol works

- Method: `session/request_permission` (JSON-RPC request, has `id` field, must be replied to)
- Contains: `sessionId`, `toolCall` (with `toolCallId`, title, kind), `options` array
- Each option has: `optionId`, `name`, `kind` (allow_once | allow_always | reject_once | reject_always)
- Client responds with: `{ "result": { "outcome": { "outcome": "selected", "optionId": "<chosen>" } } }`
- Or cancels: `{ "result": { "outcome": { "outcome": "cancelled" } } }`
- If client never responds: agent blocks indefinitely (no timeout in protocol)

### The --allow-all-tools flag impact

- Flag bypasses ALL approval events — agent executes every tool without asking
- No `session/request_permission` events are sent when this flag is active
- This gives the agent the same access as the user account with zero oversight
- Equivalent flags: `--allow-all`, `--yolo`
- Finer-grained: `--allow-tool <name>` and `--deny-tool <name>` exist
- Impact on Codex Pocket: approval UI is never shown, tool actions appear as immediately executed
- Recommendation: Don't use `--allow-all-tools` unless you fully understand and accept the risk

### How Codex Pocket handles this

- Adapter detects whether auto-approve mode is active via its own config/launch args
- `SUPPORTS_APPROVALS` capability flag: set to `false` when auto-approve mode is on, `true` otherwise
- When `SUPPORTS_APPROVALS = false`: UI shows a persistent banner warning user they're in auto-approve mode
- When `SUPPORTS_APPROVALS = true`: full `ApprovalPrompt.svelte` workflow is active
- Everything else (chat, streaming, attachments, filtering) works regardless of approval mode
- Persistent approvals (allow_always / reject_always) are stored client-side in a local policy store

### Persistent approvals and revocation

- "Allow always" / "Reject always" choices are stored in a client-side policy store (not in ACP protocol)
- Users can review and revoke these in Settings
- Revocation means next occurrence of that tool action will prompt again
- Policy store keys off tool type + command/path pattern

### What users need to know (user-facing summary)

- **Why the app prompts before running commands**: For your safety, the agent asks for permission before running commands on your computer. This ensures you always have control over what the AI agent can do.
- **What each choice means**:
  - **Allow Once**: Let the agent run this specific command this one time.
  - **Allow Always**: This tool/command pattern is trusted. Never ask for this again.
  - **Reject Once**: Don't let the agent run this command right now.
  - **Reject Always**: Block this tool/command pattern forever.
- **How to manage persistent rules**: You can view and delete your "Always" rules in Settings if you change your mind later.
- **Why NOT to use --allow-all-tools casually**: Running with the `--allow-all-tools` flag removes all safety checks. The agent could delete files or run harmful commands without your knowledge. Only use this in environments you fully trust.

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

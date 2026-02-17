# ACP + Codex Multi-Provider Integration Epic

Date: 2026-02-16

## Status

- ✅ **Phase 0**: Contracts & Schemas (PR #138, merged)
- ✅ **Phase 1**: Registry & Read-Only Adapter (PR #143, merged)
- 🚧 **Phase 2**: Prompt Send + Streaming (planned)
- 📋 **Phase 3**: Home UI Grouping (planned)
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

**Prerequisites:** Phase 1 complete ✅
**Goal:** Enable sending prompts to Copilot sessions and streaming responses

Builds on Phase 1 provider infrastructure to add write capabilities...

### Phase 3 — Unified Grouping + Filters

- provider grouping UX
- provider filter chips and persisted view preferences

### Phase 4 — Capability Matrix + Graceful Degrade

- provider capability matrix in client
- disable unsupported actions safely (with hints)

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

## Initial Issue Breakdown

Create one epic and staged implementation issues:

1. Epic: ACP + Codex multi-provider integration (#128)
2. Provider adapter contracts + normalized schemas (#129) ✅ COMPLETED
3. Copilot ACP adapter process and read-only session ingestion (#130) ✅ COMPLETED
4. ACP prompt/send + stream update mapping (#131)
5. Home UI provider grouping (Codex Sessions/Copilot Sessions) (#132)
6. Capability matrix and graceful degrade handling (#133)
7. Hardening: reliability, metrics, CI smoke for dual-provider mode (#134)


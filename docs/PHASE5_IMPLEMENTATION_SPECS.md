# Phase 5 Implementation Specs

Date: 2026-02-19
Status: Planning only (no code changes in this phase)

## Scope

Phase 5 foundation items, focusing on provider expansion and telemetry visibility.

- P5-01: Claude Integration (issue #200)
- P5-04: Token Cost Display (issue #203)
- P5-02: Context/Memory Offload & Save (issue #201) is deferred to a later packet

## Assumptions

- Provider adapter architecture and capability matrix are already in place and stable (Phase 4 complete).
- UI should remain provider-agnostic with graceful degradation based on capabilities.
- Any new provider must preserve raw payloads in normalized session/event structures for debugging.

## Cross-Cutting Decisions (Pre-Implementation)

1. Claude transport choice (CLI, API, or other) must be confirmed before implementation.
2. Token usage/cost data source must be standardized across providers (local-orbit in-memory vs persisted telemetry).
3. Cost display should be opt-in and per-device, with clear privacy implications.

## Risk Controls and Rollout Strategy

- Feature flags:
  - Provider enable/disable toggles in server config for Claude.
  - UI toggle for cost display (off by default).
- Progressive rollout:
  - Gate Claude adapter startup behind explicit enable flag; do not auto-enable.
  - Gate token cost UI behind settings toggle with explicit privacy note.
- UX regression prevention:
  - Provider capabilities must default to safe false values for unsupported features.
  - Thread view must avoid hard-coded provider checks and use capability helpers.
- Validation requirements before merge:
  - `bunx tsc --noEmit`
  - `bun test`
  - `bun run build`
  - `~/.codex-pocket/bin/codex-pocket self-test`
  - Manual smoke test: open `/app`, list sessions, open thread, send prompt (Codex + Copilot ACP)

## P5-01: Claude Integration (Issue #200)

### Acceptance Criteria (Expanded)

- Claude sessions appear in Home provider grouping with correct badges and counts.
- Claude provider health appears in Admin status with clear error messaging on startup failure.
- Claude sessions can be opened and streamed if the adapter declares `sendPrompt` and `streaming` capabilities.
- Thread list and thread detail UI render Claude sessions without special-case provider checks.
- Feature degradation works: unsupported actions are disabled with tooltips derived from capabilities.
- Provider enable/disable toggles persist and safely stop/start the Claude adapter.
- No regressions to Codex or Copilot ACP session listing and prompt flows.

### Technical Approach and Architecture Decisions

- Add a Claude adapter that implements `ProviderAdapter` and plugs into the registry.
- Create a Claude session normalizer and event normalizer that output `NormalizedSession` and `NormalizedEvent`.
- Preserve raw Claude payloads in `rawSession` and `rawEvent` for debug/replay.
- Capabilities should be explicit and derived from runtime detection (e.g., attachments, approvals).
- Add provider config shape for Claude (auth, endpoints, or executable path), but keep config optional to avoid breaking existing config.

### File Changes (Expected)

- `services/local-orbit/src/providers/provider-types.ts`: add `"claude"` to `ProviderId`.
- `services/local-orbit/src/providers/adapters/claude-adapter.ts` (new): adapter implementation, lifecycle, health checks, session listing, prompt send, subscribe.
- `services/local-orbit/src/providers/normalizers/claude-session-normalizer.ts` (new): normalize Claude sessions into `NormalizedSession`.
- `services/local-orbit/src/providers/normalizers/claude-event-normalizer.ts` (new): normalize Claude events into `NormalizedEvent`.
- `services/local-orbit/src/providers/index.ts`: export new adapter and normalizers.
- `services/local-orbit/src/index.ts`: register Claude provider, config handling, capability injection, relay wiring.
- `src/lib/types.ts`: extend `ProviderFilter` and `ThreadInfo.provider` to include `"claude"`.
- `src/routes/Home.svelte`: provider filter chip and grouping updates to include Claude.
- `src/routes/Thread.svelte`: confirm any provider-specific logic uses capability helpers and supports Claude.
- `docs/ACP_CODEX_INTEGRATION_EPIC.md`: note Phase 5 Claude status and link to specs.

### Capability Matrix Considerations

- Claude adapter must declare `ProviderCapabilities` with runtime detection where possible.
- At minimum, provide explicit defaults for: `sendPrompt`, `streaming`, `attachments`, `approvals`.
- UI should use capability helpers; no explicit `provider === "claude"` checks.

### Dependencies and Prerequisites

- Confirm Claude transport and authentication approach (blocking decision).
- Confirm whether Claude supports attachments and approvals in this integration.
- Provider config format for Claude must be agreed and documented.

### Risks and Mitigations

- Risk: Provider startup failures due to missing CLI/API auth. Mitigation: health checks + admin diagnostics + graceful degradation in UI.
- Risk: Incomplete event mapping leading to missing timeline entries. Mitigation: normalize minimal event set first (user/agent/tool) and preserve raw payloads.
- Risk: Provider capability misreporting causes UI affordances to misbehave. Mitigation: strict defaults (false) and explicit opt-in capability detection.

### Testing Strategy

- Unit tests for session and event normalizers with recorded fixtures.
- Adapter integration tests for health checks and listSessions.
- Manual smoke test for Claude listing + prompt send (if available).

### Rollback Plan

- Disable Claude in provider config.
- Stop adapter process and remove from registry.
- Remove provider-specific UI entries if issues persist.

## P5-04: Token Cost Display (Issue #203)

### Acceptance Criteria (Expanded)

- Settings includes a toggle for token cost display (off by default).
- When enabled, each message row shows token usage and estimated cost, if available.
- Token/cost data is provider-agnostic and rendered only when present.
- Data updates in near-real-time for streaming responses (partial usage updates acceptable).
- No UI regressions when usage data is missing.
- Costs respect provider/model pricing tables and use consistent rounding.

### Technical Approach and Architecture Decisions

- Add a normalized usage payload (tokens and cost) to message metadata or event payloads.
- Introduce a provider-agnostic cost calculator with per-provider pricing tables.
- Capture usage at the local-orbit layer so UI remains simple and stateless.
- Store only aggregated token counts and cost per message; avoid storing raw prompt content.

### File Changes (Expected)

- `services/local-orbit/src/providers/provider-types.ts`: extend `NormalizedEvent.payload` schema expectations for `tokenUsage` or `cost` fields.
- `services/local-orbit/src/index.ts`: capture token usage from provider responses and attach to normalized events; add provider-agnostic cost calculation helper.
- `services/local-orbit/src/providers/adapters/*`: Codex and Copilot ACP adapters attach token usage when available.
- `src/lib/types.ts`: add token usage shape to `MessageMetadata` or introduce a new metadata interface.
- `src/lib/messages.svelte.ts`: preserve token usage metadata when mapping events to messages.
- `src/lib/components/MessageBlock.svelte`: render token/cost display when toggle enabled and data present.
- `src/routes/Settings.svelte`: add UI toggle and local storage persistence.

### Capability Matrix Considerations

- Token usage is a data-availability issue, not a capability flag.
- For providers that cannot supply usage, UI should hide the cost row.

### Dependencies and Prerequisites

- Pricing table source of truth (static table vs configurable file) must be chosen.
- Confirm if Codex and Copilot ACP emit token usage metadata today.

### Risks and Mitigations

- Risk: Incorrect pricing table leads to misleading costs. Mitigation: document table source and allow admin override later.
- Risk: Performance regressions due to per-event calculations. Mitigation: compute once in local-orbit and cache in message metadata.
- Risk: UX clutter in thread view. Mitigation: toggle off by default and compact display.

### Testing Strategy

- Unit tests for cost calculation helper and rounding.
- UI test to verify toggle on/off and missing-data behavior.
- Manual validation with streaming responses (partial updates acceptable).

### Rollback Plan

- Disable setting toggle by default and hide UI.
- Remove cost calculation hook and return to existing message rendering.

## P5-02: Context/Memory Offload & Save (Issue #201) - Deferred

### Status

- Defer detailed implementation spec to sub-packets due to scope.
- This phase only records high-level constraints and open questions.

### Known Constraints

- Must support per-project and per-thread preferences.
- Export/import must be reversible and preserve metadata.
- Search must be performant on low-end devices and offline.

### Blocking Decisions

- Storage format (SQLite vs JSONL files vs external index).
- Encryption strategy for local memory store.
- Interaction model for context injection (manual vs automatic).

## Open Questions (Blocking Decisions)

- Which Claude transport will be supported in Phase 5 (CLI, API, or other)?
- What is the pricing table source and update strategy for token cost calculation?
- Where should per-provider pricing live (server config vs code constants)?
- How should token usage be persisted for historical views (if at all)?

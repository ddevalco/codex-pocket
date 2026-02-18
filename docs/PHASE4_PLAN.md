# Phase 4 Implementation Plan: Capability Matrix + Graceful Degrade

**Status:** APPROVED - Ready for Implementation  
**Created:** 2026-02-17  
**Prerequisites:** Phase 3 complete ✅ (PR #143)
**Goal:** Introduce capability detection and graceful UI degradation based on provider features

---

## Executive Summary

Phase 4 focuses on making the Codex Pocket UI "smart" about what different providers can and cannot do. Not all providers support every feature (e.g., attachments, specific approval types, filtering).

Instead of hard-coding checks like `if (provider === 'copilot')`, we will implement a **Capability Matrix** pattern:

1. **Discovery:** Providers declare their capabilities (flags) in their session/thread payloads.
2. **Plumbing:** The UI receives these flags and stores them in the `Thread` model.
3. **Adaptation:** UI components check capabilities (`canAttach`, `canFilter`, `requiresApproval`) to enable/disable features.
4. **UX Polish:** Disabled features explain *why* they are unavailable, rather than just hiding.

This phase also covers **ACP Attachments** and **Approvals**, integrating them into the normalized event stream.

---

## Architecture Changes

### 1. Capability Matrix (The "Plumbing")

**Current State:**

- UI assumes all sessions support all features (legacy Codex behavior).
- Provider-specific checks are scattered or non-existent for new features.

**Phase 4 Changes:**

- **Provider Interface:** Add `capabilities` object to `ProviderAdapter` interface.
- **Session Payload:** Include `capabilities: string[]` or a structured object in the session list/detail response.
- **Client Model:** `Thread` class in `threads.svelte.ts` gains a `capabilities` registry.
- **Flags:**
  - `CAN_ATTACH_FILES`
  - `CAN_FILTER_HISTORY`
  - `SUPPORTS_APPROVALS`
  - `SUPPORTS_STREAMING`

### 2. Graceful Degradation (The "UX")

**Components Impacted:**

- **PromptInput:** Disable file attachment button if `!CAN_ATTACH_FILES`. Show tooltip.
- **Thread View:** Hide or disable filter controls if `!CAN_FILTER_HISTORY`.
- **Message Actions:** Disable "Reply" or "Edit" if unsupported by provider.

### 3. ACP Feature Expansion

**Attachments:**

- Extend `sendPrompt` in `copilot-acp-adapter` to accept file references.
- Map UI attachment structure to ACP `context` items.

**Approvals:**

- Listen for ACP "approval request" events.
- Normalize them into `Turn` or `Item` types that the UI understands.
- Send "approve/reject" signals back via JSON-RPC.

---

## Implementation Plan (Step-by-Step)

### P4-01: Capability Matrix Plumbing

- **Goal:** Surface provider capability flags in thread/session payloads and client thread model.
- **Files:** `services/local-orbit/src/index.ts`, `src/lib/types.ts`, `src/lib/threads.svelte.ts`
- **Output:**
  - `ProviderCapabilities` interface.
  - `Thread.capabilities` property populated from API.
- **Acceptance:**
  - `codex` provider returns full capability set (backward compatible).
  - `copilot` provider returns limited capability set.
  - Client `Thread` object correctly reflects these flags.

### P4-02: Graceful Degrade UX

- **Goal:** Disable unsupported actions with explicit hints based on capability matrix.
- **Files:** `src/routes/Home.svelte`, `src/routes/Thread.svelte`, `src/lib/components/PromptInput.svelte`
- **Output:**
  - UI updates to check `thread.capabilities.has(...)`.
  - Tooltips/Empty states for disabled features.
- **Acceptance:**
  - Opening a Copilot session disables "Attach File" (until P4-03).
  - Opening a Codex session keeps all features enabled.
  - No `if (provider === 'copilot')` checks in UI components.

### P4-03: ACP Attachment Support

- **Goal:** Extend ACP send path to carry attachments.
- **Files:** `services/local-orbit/src/index.ts`, `copilot-acp-adapter.ts`, `Thread.svelte`, `PromptInput.svelte`
- **Output:**
  - `sendPrompt` accepts attachment list.
  - ACP adapter converts attachments to ACP-compatible context.
  - Update `copilot` capability to include `CAN_ATTACH_FILES`.
- **Acceptance:**
  - User can attach a file in Copilot session.
  - File content is sent to ACP.
  - UI shows attachment in timeline.

### P4-04: ACP Approvals + User Input Handling

- **Goal:** Normalize ACP approval/input events and integrate with existing approval components.
- **Files:** `acp-event-normalizer.ts`, `copilot-acp-adapter.ts`, `index.ts`, `messages.svelte.ts`, `Thread.svelte`
- **Output:**
  - ACP "user_action_required" events mapped to UI "Approval" items.
  - UI "Approve" button triggers `sendNotification` or `sendResponse` to ACP.
- **Acceptance:**
  - Copilot "Allow command execution?" prompt appears in UI.
  - Clicking "Allow" sends correct signal to ACP.
  - Flow continues.

### P4-05: Advanced Filtering + View Persistence

- **Goal:** Add provider/status/query filtering with local persistence.
- **Files:** `src/routes/Home.svelte`, `src/lib/types.ts`, `src/lib/threads.svelte.ts`
- **Output:**
  - Filter bar in Home view (Provider: All/Codex/Copilot, Status: Active/Archived).
  - LocalStorage persistence of filter preferences.
- **Acceptance:**
  - Users can see only Copilot sessions.
  - Refreshing page remembers filter selection.

### P4-06: Hardening + Release Gate

- **Goal:** Finalize tests, docs, CI checks following stacked PR discipline.
- **Files:** `docs/ACP_CODEX_INTEGRATION_EPIC.md`, `BACKLOG.md`, `CHANGELOG.md`, CI config
- **Output:**
  - Updated documentation.
  - Unit tests for new adapters and normalizers.
  - End-to-end smoke test usage guide.
- **Acceptance:**
  - All P4-01 through P4-05 features verified.
  - No regressions in Codex workflow.
  - Codebase clean and ready for Phase 5 (if any) or Release.

---

## Critical Path

1. **P4-01** (Plumbing) must be done first to enable **P4-02** (UX).
2. **P4-02** allows us to ship a "safe" partial integration while working on complex features.
3. **P4-03** and **P4-04** can be developed in parallel, but **P4-03** (Attachments) is usually simpler and builds confidence.
4. **P4-05** is independent UI work, can happen anytime after basic data is stable.
5. **P4-06** wraps it up.

## Risk Assessment

- **ACP Protocol Volatility:** ACP is evolving. Approval/Context implementation details might change.
  - *Mitigation:* Keep the `Adapter` layer strict. Isolate protocol specifics there.
- **UI Complexity:** Conditional UI logic can get messy.
  - *Mitigation:* Use a centralized `capabilities` store, avoid scattered boolean logic.

## Estimated Timeline

- **Total:** 10-14 days
- **Breakdown:**
  - Plumbing & UX: 3 days
  - Attachments: 2 days
  - Approvals (Complex): 4 days
  - Filtering & Polish: 2 days
  - Hardening: 3 days

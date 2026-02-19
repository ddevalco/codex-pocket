# Backlog

This file mirrors the canonical backlog, which lives in **GitHub Projects**:

- [GitHub Project 2](https://github.com/users/ddevalco/projects/2)

If the two ever disagree, treat GitHub Projects as the source of truth and update this file to match.

Issues are canonical for work items:

- [GitHub Issues](https://github.com/ddevalco/coderelay/issues)

## Recently Done

### 2026-02-19: Rebrand to CodeRelay

- Phase 5: Rebrand to CodeRelay - COMPLETE (2026-02-19)
- Renamed project to CodeRelay.
- Updated documentation and branding.
- Migrated legacy installs.

### 2026-02-19: Phase 2 - Claude & Token Cost Foundations

- [x] Phase 2: Claude & Token Cost Foundations - COMPLETE (2026-02-19)
- [x] Implemented Claude adapter scaffold with health checks and graceful degradation (#200).
- [x] Implemented provider-agnostic token usage tracking and cost calculator backend (#203).
- [x] Added pricing tables for major providers with fallback support.
- [x] Validated with 70+ new unit tests across both systems.
- [x] Foundation merged; UI expansion deferred to Phase 3.
- Next: Phase 3 (UI Integration & API Clients).

### 2026-02-19: Phase 1 - UI Elements Toggles

- [x] Phase 1: UI Elements Toggles - COMPLETE (2026-02-19)
- [x] Implemented `uiToggles.ts` store with Svelte 5 runes and localStorage persistence.
- [x] Added "UI Elements" section in Settings with surface-based grouping.
- [x] Gated Thread List export/share actions behind toggles.
- [x] Gated Composer quick replies and attachment thumbnails.
- [x] Simplified Message copy variants with a safety guarantee (at least one enabled).
- [x] Gated Tool output copy and Thread View header actions.
- [x] Full audit and polish of Settings UX with help text and responsive layout.
- [x] Resolved all 10 P0/P1 issues (#175-184).
- [x] Validation: Type-check ✅ | Build ✅ | Reviewer ✅
- Phase 2 (Ecosystem Foundations) ready for implementation.

### 2026-02-18: Phase 4.4 - ACP Approvals

- [x] P4-04: ACP Approvals + Tool Permission Handling - IMPLEMENTED (2026-02-18)
- [x] Logic: Bidirectional JSON-RPC support in AcpClient (server→client requests)
- [x] Logic: Normalized session/request_permission into approval_request events
- [x] Logic: CopilotAcpAdapter mode-aware capabilities + 60s timeout auto-cancel
- [x] Logic: Relay wiring — forwards approvals to UI, routes decisions back to ACP
- [x] Logic: Persistent approval policy store (localStorage, auto-apply, revoke)
- [x] UI: Frontend approval message handling and ACP-compliant decision sending
- [x] UI: Thread.svelte approval UI + auto-approve warning banner + Settings policy management
- [x] Validation: Type-check ✅ 0 errors | Build ✅ Pass | 20/20 acceptance criteria ✅

### 2026-02-18: Phase 4.5 - Advanced Filtering

- [x] P4-05: Advanced Filtering + View Persistence - IMPLEMENTED (2026-02-18)
- [x] UI: Added Provider filter chips (All, Codex, Copilot) with live counts
- [x] UI: Added Status filter chips (All, Active, Archived) with live counts
- [x] UI: Implemented mobile-responsive flex-wrap layout for filters
- [x] UI: Added empty state handling when no threads match filters
- [x] Logic: Implemented localStorage persistence (key: "coderelay_thread_filters")
- [x] Logic: Added defensive hydration on page load for filter state
- [x] Accessibility: Added keyboard navigation and ARIA attributes for chip controls
- [x] Types: Added ThreadFilterState, ProviderFilter, StatusFilter to types.ts
- [x] Files: [src/routes/Home.svelte](src/routes/Home.svelte), [src/lib/threads.svelte.ts](src/lib/threads.svelte.ts), [src/lib/types.ts](src/lib/types.ts)
- [x] Validation: Type-check pass, Build pass, All 9 acceptance criteria met

### 2026-02-18: Phase 4.3 - ACP Attachment Support

- [x] P4-03: ACP Attachment Support - IMPLEMENTED (2026-02-18)
- [x] Created PromptAttachment interface and attachment helpers (normalizeAttachment, isValidAttachment)
- [x] Extended relay routeAcpSendPrompt to extract and normalize attachments from multiple sources
- [x] ACP adapter reads file content, base64 encodes, and maps to ACP content array format
- [x] Graceful fallback: text-only retry when ACP rejects attachments
- [x] Updated capability flags: attachments: true, CAN_ATTACH_FILES: true
- [x] Frontend Thread.svelte passes attachments in sendPrompt params
- [x] End-to-end validation: Static checks pass, ready for manual testing
- Next: P4-06 (Hardening)

### 2026-02-19: Phase 4.2 - Graceful Degrade UX

- [x] P4-02: Graceful Degrade UX (#152) - IMPLEMENTED (2026-02-19)
- [x] Capability-based UI degradation (no hard-coded provider checks)
- [x] Tooltips for disabled features with clear explanations
- [x] Backward compatibility (defaults to enabled when capabilities absent)
- [x] Type-safe capability helpers in [src/lib/thread-capabilities.ts](src/lib/thread-capabilities.ts)
- [x] Validation: Type-check: ✅ Pass | Build: ✅ Pass | Tests: ✅ Pass | Reviewer: ✅ Approved

### 2026-02-18: Phase 4.1 - Capability Matrix Plumbing

- [x] P4-01: Provider capability detection system (#151)
- [x] Backend: ProviderCapabilities interface with 4 flags
- [x] Backend: getProviderCapabilities() normalization helper
- [x] Backend: injectThreadCapabilities() API payload augmentation
- [x] Frontend: ProviderCapabilities interface in types.ts
- [x] Frontend: parseCapabilities() and normalizeThreadInfo updates
- [x] Capability flags: CAN_ATTACH_FILES, CAN_FILTER_HISTORY, SUPPORTS_APPROVALS, SUPPORTS_STREAMING
- [x] Provider defaults: codex (all true), copilot-acp (limited)
- [x] Validation: Type-check pass, build pass (689 modules), E2E chain verified
- PR: codex/phase4-p4-01-capability-matrix
- Next: P4-02, P4-03, P4-04 (ALL DONE)

### 2026-02-18: UI Elements Toggles Planning

- [x] Feature specification: UI Elements toggles for clutter reduction (#174)
- [x] Identified 15+ toggleable non-critical features across Thread View, Thread List, Messages, Composer
- [x] Created 3-phase implementation plan (Foundation + High-Impact → Coverage → Polish)
- [x] Documented in docs/UI_ELEMENTS_TOGGLES.md
- Child Issues: #175-184 (Foundation, Settings UI, Thread exports, Composer features, Copy variants, Thread View, Thread List, Messages matrix, Settings expansion, Polish)

- **#130 / #143**: ACP Phase 1: Registry & Read-Only Adapter.
  - Provider adapter contracts + normalized schemas (#129).
  - Copilot ACP adapter process and read-only session ingestion (#130).
- **#115**: Multi-agent workflows: helper-agent actions with reusable profiles (P3, #109).

- **#147 / #148 / #149**: ACP Phase 2: Prompt Send + Streaming.
  - ACP write capability - `sendPrompt` method (#144).
  - Streaming response handling (#145).
  - UI prompt input for Copilot sessions (#146).

### 2026-02-17: Phase 3 - ACP Phase 5 Hardening

- [x] Runtime hardening - 30s timeout, exponential backoff retry (max 3 attempts), health tracking (#163)
- [x] Test coverage expansion - Timeout, retry, isolation, degraded state tests (#164)  
- [x] CI enhancements - Capability smoke tests, regression guards for capability matrix (#165)
- Type-check: ✅ 0 errors | Tests: ✅ 74 pass | Build: ✅ 689 modules (2.0s)

### 2026-02-18: PR #166 Review Feedback

- [x] CopilotAcpAdapter health check - Fail when client missing (#169)
- [x] DangerZone typing - Optional Snippet with defensive render (#167)
- [x] PierreDiff typing - Replace any[] with typed interfaces (#172)
- [x] Changelog formatting - Clear release section headings (#170)
- [x] Changelog accuracy - Confirmed exponential backoff wording (#171)
- Type-check: ✅ 0 errors | Tests: ✅ 74 pass | Build: ✅ Pass | Markdown: ✅ 0 errors

- CI: added an explicit `/admin/validate` smoke check (auth required).
- CI: added small regression guards to prevent known UI footguns (e.g. thread list subscription loop).
- CLI: `start` now falls back to background mode if the launchd plist is missing.
- CLI: improved owned-process detection by also checking process CWD (helps kill stale listeners from older installs where the command line is just `bun run src/index.ts`).
- Update regression: `scripts/test-update-flow.sh` now runs in restricted/offline environments (seeds `node_modules`, wraps Bun cache dir, uses more portable cleanup).
- CLI: stop/start now kill stale listeners using configured ports (not hard-coded 8790).
- Added GitHub Actions CI workflow to build and smoke-test local-orbit on every push/PR.
- CI now smoke-tests the WebSocket relay path (client ↔ anchor).
- CI now smoke-tests safe `/admin/repair` actions (`ensureUploadDir`, `pruneUploads`) to cover self-heal endpoint regressions.
- CI now smoke-tests `/admin/repair` safe actions and non-Tailscale `fixTailscaleServe` behavior.
- `coderelay update` now always prints a final `summary` block and exits non-zero if post-update `ensure`/`smoke-test` fail.
- Fixed `ensure`/`smoke-test` validation parsing to avoid false failures.
- CLI now validates `config.json` early (avoids Python stack traces when config is missing/empty/corrupt).
- Added a local update-flow regression script: `scripts/test-update-flow.sh`.
- Update-flow regression script now validates stale-listener cleanup behavior on configured ports (with default-port guard when available).

- `index.html` is now served with `Cache-Control: no-store` to reduce cached broken bundle issues.
- UI now shows build metadata (commit/time) and server shows app commit in /health + /admin/status.
- Thread ordering: thread list is now sorted by most recent activity (Pocket-observed activity first, then upstream timestamps, then createdAt).
- UI: message copy improvements (plain-text default, Shift+Click for raw markdown, clipboard fallback on `http://`).
- UI: tool output blocks now have a copy button (with the same clipboard fallback).
- UI: export/share threads as Markdown or JSON (downloads + iOS share sheet with real files when supported).
- UI: export/share from thread list now works even if cache is cold (rehydrates from events on-demand).
- UI: Shift+Click export/share from the thread list forces a bounded “deeper replay” fetch for older threads.
- UI: thread list mobile density improved (2-line titles, date preserved).
- UI: thread list now includes quick export/share actions (md + json) without opening the thread.
- UI: message actions menu (copy, copy markdown, copy quoted, copy from here) + thread-level “copy last 20”.
- UI: fixed a thread list instability regression caused by subscription bookkeeping inside an effect (could manifest as empty/unstable thread list).
- Admin/settings redesign phase 1: shared surface primitives (`SectionCard`, `StatusChip`, `DangerZone`) added and `/settings` migrated to use them.
- Admin/settings redesign phase 2: `/admin` moved to shared card primitives and a settings-style grid hierarchy.
- Admin/settings redesign phase 3: added admin interaction polish (confirmations, action-result chips, progressive disclosure for advanced sections).
- Admin/settings redesign phase 4: accessibility pass for keyboard/focus visibility, semantic labels, and screen-reader action feedback on `/admin` and `/settings`.
- Repo hygiene: added `CONTRIBUTING.md` and documented ff-only sync policy + pre-release clean-tree check (`scripts/ci/check-clean-tree.sh`).
- Composer quick-reply shortcuts: added one-tap presets in thread composer, with customizable label/text presets in `/settings` (persisted per-device).
- Settings redesign follow-up: `/settings` now uses a responsive card grid hierarchy (desktop 2-column, mobile 1-column) with core controls prioritized.
- Thread export/share polish: added `.html` export in thread view + thread-list quick actions (Markdown/JSON retained).
- Security hardening: added rate limits for sensitive token-minting endpoints (`/admin/pair/new`, `/uploads/new`) with explicit `429` behavior and CI coverage.
- Attachment UX polish: composer now uses removable attachment chips and supports multiple image attachments per message without requiring manual markdown edits.
- Upload retention visibility: `/admin` now shows upload footprint stats (size, file count, oldest/newest, and last prune activity).
- Thread export/share polish: added PDF export action (print-to-PDF) in thread view + thread-list quick actions.
- Backlog hygiene: removed stale completed P1 items (admin redesign parent + thread activity indicator polish) so active sections stay actionable.
- Upload retention reporting: `/admin/uploads/stats` now includes last prune detail/source (manual/scheduled/unknown), shown in Admin Uploads UI.
- Attachment chips now include image thumbnails in composer for faster visual confirmation before send.
- Admin/Settings redesign pass: calmer system-console visual refresh for `/admin` and `/settings`.
- Admin uploads: auto-cleanup interval (hours) is now configurable and persisted in `/admin`.
- Security/auth model: backend token sessions added (create/list/revoke) with legacy-token compatibility.
- Admin: token session management UI added (create/list/revoke, mode display, one-time token copy).
- Security: token sessions support `read_only` mode with server-side enforcement for write operations.
- Pairing: `/admin/pair/new` now mints per-device session tokens instead of returning the legacy shared token.
- Security/read-only UX: read-only sessions can connect to WebSocket for live reads; mutating RPC methods are denied explicitly.
- CI: added smoke coverage for token-session security behavior (pairing token semantics + read-only guards).
- CLI/update: stale owned listeners now use bounded SIGKILL fallback cleanup (including symlink-safe ownership detection) to reduce restart flakiness.
- CI: added edge guards for one-time pair-code consumption and immediate auth denial after token-session revocation.
- Docs: added a phased native iOS roadmap (`docs/NATIVE_IOS_ROADMAP.md`) with constraints, milestones, and decision gates.
- Reliability: durable outbox + idempotency for mutating RPCs (P1, #105) completed via PR #111.
- Observability: run timeline + failure reason counters in admin status (P1, #106) completed via PR #112.
- Away mode: blocked-turn push alerts for approvals/user-input (P2, #107) completed via PR #113.
- Orchestration UX: prompt/agent presets with import/export + dropdown apply (P2, #108) completed via PR #114.
- Multi-agent workflows: helper-agent actions with reusable profiles (P3, #109) completed via PR #115.

## Active Items

### Security/Dependencies (2026-02-17)

- ✅ Resolved via `npm audit fix` (automatic remediation succeeded).
- Resolved advisories:
  - `devalue` DoS (`GHSA-g2pg-6438-jwpf`, `GHSA-vw5p-8cq8-m7mv`) — no longer reported.
  - `svelte` XSS (`GHSA-6738-r8g5-qwp3`) — no longer reported.
- Validation completed post-remediation:
  - `bun test` → pass (23/23).
  - `npm run build` → pass (build succeeded; existing Svelte a11y warnings unchanged).
  - `npm audit --audit-level=moderate` → pass (`found 0 vulnerabilities`).

### ACP + Codex Multi-Provider Integration

Epic tracking: [`docs/ACP_CODEX_INTEGRATION_EPIC.md`](docs/ACP_CODEX_INTEGRATION_EPIC.md)

**Phase 1: Registry & Read-Only Adapter** ✅ COMPLETED (PR #143)

- Provider adapter contracts + normalized schemas (#129) ✅
- Copilot ACP adapter process and read-only session ingestion (#130) ✅

**Phase 3: Unified Grouping + Filters** ✅ MOSTLY COMPLETED

- Provider grouping UX ✅ completed in Phase 1 (PR #143)
- Provider filter chips and persisted view preferences (optional enhancements, deferred)

**Phase 4: Capability Matrix + Graceful Degrade** ✅ COMPLETE

- [x] P4-01: Provider capability detection system (#151) ✅
- [x] P4-03: ACP Attachments - IMPLEMENTED ✅ (2026-02-18, ready for manual testing)
- [x] P4-04: ACP Approvals - IMPLEMENTED ✅ (2026-02-18)
- [x] P4-05: Advanced Filtering + View Persistence ✅ (2026-02-18)
- [x] P4-06: Hardening + Release Gate ✅

Source and implementation notes: [`docs/RECOMMENDATIONS.md`](docs/RECOMMENDATIONS.md)

## Phase 5: Multi-Provider Excellence

### Done ✓

- ✅ #200 - Claude Integration (PR #212, #214)
- ✅ #203 - Token Cost Display (PR #213, #215)
- ✅ #205 - Rebrand to CodeRelay (PR #216)

### Remaining

- [ ] P5-02: Context/Memory Offload & Save
- [ ] P5-03: Custom Agent Import
- [ ] P5-05: Metrics Dashboard Integration

## Technical Debt & Refactoring

- **CodexAdapter Migration**: Migrate Codex provider logic from index.ts into CodexAdapter class.
  - **Goal**: Migrate Codex provider logic from index.ts into CodexAdapter class.
  - **Why**: Reduce index.ts complexity (~2,900 lines), match cleaner adapter pattern used by copilot-acp.
  - **Status**: Optional refactoring, no functional impact.
  - **Priority**: Low (P3/P4).
  - **Files**: [services/local-orbit/src/index.ts](services/local-orbit/src/index.ts), [services/local-orbit/src/providers/adapters/codex-adapter.ts](services/local-orbit/src/providers/adapters/codex-adapter.ts)

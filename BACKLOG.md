# Backlog

This file mirrors the canonical backlog, which lives in **GitHub Projects**:

- [GitHub Project 2](https://github.com/users/ddevalco/projects/2)

If the two ever disagree, treat GitHub Projects as the source of truth and update this file to match.

Issues are canonical for work items:

- [GitHub Issues](https://github.com/ddevalco/coderelay/issues)

## Recently Done

### 2026-02-20: Phase 2 - OKLCH Color System Fixes ✅

**Epic:** #262 | **PR:** #271 | **Status:** Complete (Needs Visual QA)

**Context:** Fixed OKLCH color interpolation issues causing incorrect color display in Home and Admin pages.

#### Issue #268: OKLCH Color Normalization in Admin Components ✅ DONE

**Problem:**

- Admin components using outdated color interpolation patterns
- Inconsistent OKLCH color space usage
- Need to normalize to standard color utilities

**Resolution:**

- ✅ Migrated Admin page components to `oklch-utils`
- ✅ Consistent color interpolation patterns
- ✅ Aligned with design system standards

#### Issue #269: OKLCH Color Fixes for Home Page ✅ DONE

**Problem:**

- Home page suffering from same OKLCH inconsistencies
- Mixed color interpolation patterns
- Visual inconsistencies in UI elements

**Resolution:**

- ✅ Standardized Home page color usage
- ✅ Applied consistent OKLCH patterns
- ✅ Improved visual consistency

#### Issue #270: Shared Components Color Normalization ✅ DONE

**Problem:**

- Shared components had mixed color approaches
- Inconsistent color space usage across reusable elements
- Technical debt in color implementation

**Resolution:**

- ✅ Updated shared components to use standard color utilities
- ✅ Consistent OKLCH color space application
- ✅ Removed legacy color patterns

**Validation:**

- ✅ Issues #268, #269, #270 closed
- ✅ PR #271 created with `needs-visual-qa` label
- ⏳ Awaiting visual QA approval

**Impact:**

- Standardized OKLCH color system across all UI components
- Improved visual consistency
- Reduced technical debt in color implementation
- Foundation for future design system enhancements

**Files Changed:** Multiple component files across Home, Admin, and shared component directories

---

### 2026-02-20: Phase 1 Packet 2 - Security & Validation Fixes ✅

**Epic:** #262 | **PR:** #267 | **Status:** COMPLETE

**Context:** Addressed 4 critical/high security findings from comprehensive Copilot code review covering 182 total findings across the codebase.

#### Issue #263: Approval Authorization Gate ✅ FIXED

**Problem:**

- Missing authorization check before approval decisions
- Unauthorized clients could potentially approve/reject
- No subscription verification in approval flow

**Resolution:**

- ✅ Implemented `validateApprovalDecisionAuthorization()` function
- ✅ Subscription verification before approval decisions
- ✅ Prevents unauthorized clients from approving/rejecting
- ✅ 5 new authorization tests (42 total passing)

#### Issue #264: Agent I/O Sanitization ✅ FIXED

**Problem:**

- Agent filenames vulnerable to header injection
- Path traversal attack vectors in agent I/O
- Prototype pollution risk in capability objects

**Resolution:**

- ✅ Header injection prevention in agent filenames
- ✅ Path traversal attack blocking
- ✅ Prototype pollution prevention in capabilities
- ✅ 4 new validation functions
- ✅ 24 new sanitization tests (29 total passing)

#### Issue #265: Token Count Validation ✅ FIXED

**Problem:**

- Token counts accepted NaN/Infinity/negative values
- Cost calculator corruption risk
- No validation of numeric token data

**Resolution:**

- ✅ Reject NaN/Infinity/negative token counts
- ✅ Cost calculator corruption prevention
- ✅ Added `validateTokenCounts()` and `safeNumberFromUsage()`
- ✅ 16 new validation tests (74 total passing)

#### Issue #266: Schema Hardening ✅ FIXED

**Problem:**

- Metadata/payload schema accepted arrays and null
- Weak type enforcement for record objects
- Schema validation gaps

**Resolution:**

- ✅ Enforce plain object schema for metadata/payload
- ✅ Reject arrays and null values
- ✅ Added `isPlainRecord()` helper
- ✅ 12 new schema tests (229 total passing)

**Validation:**

- ✅ 229/229 tests passing
- ✅ Type-check: 0 errors
- ✅ Markdownlint: 0 errors (4 packet docs)
- ✅ Zero regressions
- ✅ Reviewer approved

**Impact:**

- Eliminated 4 critical/high security vulnerabilities
- Hardened authorization flows
- Improved input validation across all providers
- Enhanced schema type safety
- Foundation for remaining 178 Copilot findings

**Files Changed:** 9 implementation files, 4 test files, 4 documentation files

**Documentation:**

- [p1p2-authz-approval-gate-implementation.md](p1p2-authz-approval-gate-implementation.md)
- [p1p2-sanitize-agent-io-COMPLETE.md](p1p2-sanitize-agent-io-COMPLETE.md)
- [p1p2-token-validation-COMPLETE.md](p1p2-token-validation-COMPLETE.md)
- [p1p2-schema-hardening-COMPLETE.md](p1p2-schema-hardening-COMPLETE.md)

**Epic #262 Progress:**

- ✅ Phase 1 Packet 2 (4 critical/high issues): COMPLETE
- ✅ Phase 2 (OKLCH Color System Fixes): COMPLETE (PR #271 needs visual QA)
- 📊 Remaining: ~175 findings from Copilot review
- 📋 Next: Prioritize and batch remaining findings

### 2026-02-20: Provider Configuration UI ✅

**Context:** User requested Settings UI for managing providers without manual config.json editing.

#### Issue #259 (P1): Provider Configuration UI in Settings ✅ IMPLEMENTED

**Problem:**

- All provider configuration required manual `~/.coderelay/config.json` editing
- No visual health status monitoring
- Difficult to setup Claude providers (web API and local CLI)
- No validation feedback for configuration errors
- Poor UX for managing four different providers

**Requirements:**

- Settings section for all providers
- Enable/disable toggles
- API key input fields (masked for security)
- Status monitoring with real-time updates
- Provider-specific configuration fields
- Save persistence with restart notification

**Implementation:** (commit 84bc9d4)

**Backend API:**

- ✅ `GET /api/config/providers`: Read current provider config with API keys masked
- ✅ `PATCH /api/config/providers`: Update config with validation
- ✅ Helper functions: `readProviderConfig`, `writeProviderConfig`, `maskProviderConfig`
- ✅ Atomic writes using temp file + rename pattern
- ✅ Validation rules:
  - Claude web API: Requires non-empty API key when enabled
  - All timeouts/maxTokens: Must be positive integers
  - Executable paths: Format validation
  - Models: Non-empty strings
- ✅ Clear error messages for validation failures
- ✅ Audit trail in admin logs

**Frontend UI:**

- ✅ New Providers section in Settings page
- ✅ Grid layout (responsive for desktop/mobile)
- ✅ Four provider cards:
  - **Codex**: Display-only (always enabled)
  - **Copilot ACP**: Toggle + executable path override
  - **Claude (Web API)**: Toggle + API key + model + advanced settings
  - **Claude MCP (Local CLI)**: Toggle + executable path + model + advanced settings
- ✅ Real-time health status polling (30-second intervals)
- ✅ StatusChip components with color-coded status
- ✅ Advanced settings collapse/expand with `<details>` elements
- ✅ Form state management with `$derived isDirty` check
- ✅ Save button (enabled only when changes detected)
- ✅ Restart banner after successful save

**Provider-Specific Features:**

| Provider | Config Fields | Always On |
|----------|---------------|-----------|
| **Codex** | None (display-only) | ✅ |
| **Copilot ACP** | Executable path override | Default on |
| **Claude (Web)** | API key, model, base URL, timeout | Opt-in |
| **Claude MCP** | Executable path, model, maxTokens, timeout, debug | Opt-in |

**Security:**

- API keys masked with "••••" in GET response
- Password input type for API key fields
- No plain text secrets in DOM
- Authorization required for all config endpoints

**UX Flow:**

1. User navigates to Settings → Providers section
2. Sees all four providers with current health status
3. Enables desired provider with toggle
4. Configures provider-specific settings
5. Clicks "Save Changes" (validation happens)
6. Configuration persists to `config.json`
7. Restart banner appears with "Restart Now" button
8. Service restart applies new configuration

**Impact:**

- ✅ Eliminated need for manual `config.json` editing
- ✅ Visual health monitoring for all providers
- ✅ Easy Claude provider setup (both web and local)
- ✅ Clear configuration validation
- ✅ Improved provider management UX

**Technical Details:**

- Type-safe API client in `src/lib/api/config.ts`
- Svelte 5 $state/$derived/$effect for reactive state
- Reused existing components (SectionCard, StatusChip)
- Grid layout with `auto-fit minmax(300px, 1fr)`
- Health polling cleans up on component unmount

---

**Complete Provider Architecture (At End of Day):**

| Provider | Type | Status | Configuration |
|----------|------|--------|---------------|
| **Codex** | Local (Anchor) | ✅ Working | None needed |
| **Copilot ACP** | Local (CLI) | ✅ Capability detection | Executable path |
| **Claude** | Web (API) | ✅ Optional | API key, model, timeout |
| **Claude MCP** | Local (CLI) | ✅ Optional | Executable path, model, tokens |

**Total Issues Resolved Today:**

- Issue #257: Dark mode contrast ✅
- Issue #255: Copilot capability detection ✅
- Issue #256: Claude MCP adapter ✅
- Issue #258: Hybrid architecture backlog ✅
- Issue #259: Provider Configuration UI ✅

**Commits:**

- 82ad9bf: Dark mode contrast fix
- 90b44c9: Copilot capability detection
- 83cf0ea: Claude MCP adapter
- 8a97d9e: BACKLOG update (installation fixes)
- 84bc9d4: Provider Configuration UI

**Lines of Code:**

- Backend: ~150 lines (API endpoints + helpers)
- Frontend: ~200 lines (UI components + state management)
- Total: ~350 lines of production code

### 2026-02-19: Installer Bug Fixes

**Issue:** Installation process had multiple critical bugs:

- Missing `local-orbit` dependency installation (causing @anthropic-ai/sdk crash)
- Wrong environment variable (`VITE_ZANE_LOCAL` vs `VITE_CODERELAY_LOCAL`)
- No support for local development repo installation

**Resolution:**

- ✅ Fixed `scripts/install-local.sh` (commit 55a417d)
- ✅ Added local-orbit dependency installation with validation
- ✅ Corrected build environment variable
- ✅ Added local repo source support via rsync
- ✅ Improved error handling and messaging
- ✅ Fixed Issue #251 - ACP adapter now correctly spawns `gh copilot --acp` (commit eaa3143)

**Impact:** Installer now works correctly from both GitHub and local sources. App installs and runs without manual dependency fixes.

### 2026-02-19: Fresh Install Critical Issues - All Resolved ✅

**Context:** User reported multiple critical issues after fresh installation that prevented app usage.

#### Issue #252 (P0 CRITICAL): UI Blank/Broken ✅ FIXED

**Problem:**

- `/app` showed blank/black screen
- `/settings` unclickable/non-functional
- Runtime error: `ReferenceError: $state is not defined`

**Root Cause:**

- `src/lib/uiToggles.ts` was plain TypeScript file
- Svelte 5 runes ($state, $effect) not compiled by Svelte compiler
- Runes appeared raw in production bundle causing runtime crash

**Resolution:** (commit 62f7f08)

- ✅ Renamed to `uiToggles.svelte.ts` (Svelte module)
- ✅ Updated 7 import paths across codebase
- ✅ Verified no uncompiled runes in production bundle
- ✅ UI now loads and functions correctly

**Lesson:** Always use `.svelte.ts` extension for TypeScript modules using Svelte runes.

---

#### Issue #253 (P1 HIGH): ACP Provider Unhealthy ✅ FIXED

**Problem:**

- ACP provider status: "unhealthy"
- Message: "ACP client not initialized"
- Despite having Copilot CLI installed at `/opt/homebrew/bin/copilot`

**Root Cause:**

- launchd services have restricted PATH (`/usr/bin:/bin:/usr/sbin:/sbin` only)
- Homebrew binaries in `/opt/homebrew/bin` not accessible
- Adapter couldn't find Copilot CLI executable

**Resolution:** (commit 9cf97ac)

- ✅ Added `EnvironmentVariables` section to launchd plist
- ✅ Includes proper PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
- ✅ Documented PATH verification in TROUBLESHOOTING.md
- ✅ ACP provider now initializes correctly when Copilot installed

---

#### Issue #254 (P2 MEDIUM): VS Code Type Errors ✅ FIXED

**Problem:**

- Editor showing false-positive TypeScript errors:
  - `marked.d.ts` not a module
  - `purify.es.d.mts` not a module
  - Property 'env' does not exist on ImportMeta
- Build succeeded despite errors (editor-only issue)

**Root Cause:**

- VS Code using bundled TypeScript instead of workspace version
- Older TS versions mishandle `.d.mts` files and Vite env types

**Resolution:** (commit 7a009b0)

- ✅ Added `.vscode/settings.json` with workspace TS configuration
- ✅ Added `.vscode/extensions.json` with recommended extensions
- ✅ Documented editor setup in DEVELOPMENT.md
- ✅ Phantom errors eliminated for developers

---

**Installer Improvements:**

- All fixes included in updated installer
- Proper dependency installation (local-orbit)
- Correct environment variables (VITE_CODERELAY_LOCAL)
- Local repository source support
- PATH configuration for launchd services

**Impact:** Fresh installations now work correctly with full functionality:

- ✅ UI loads and renders
- ✅ All routes functional (/app, /settings, /admin)
- ✅ ACP provider initializes when Copilot installed
- ✅ Clean developer experience

### 2026-02-19: Post-Install Issues and Provider Architecture Improvements ✅

**Context:** After resolving installation issues (#252-254), user tested the app and discovered three new issues plus architectural mismatch with Claude provider.

---

#### Issue #257 (P2): Settings Text Low Contrast in Dark Mode ✅ FIXED

**Problem:**

- Settings page text very low contrast in dark mode
- Light gray on dark gray backgrounds hard to read
- Affected all hint text, labels, secondary text
- WCAG AA compliance issues

**Root Cause:**

- `--color-cli-text-muted`: 50% lightness (too dark)
- `--color-cli-text-dim`: 65% lightness (too dark)  
- OKLCH colors insufficient contrast on `oklch(15% 0 0)` dark backgrounds

**Resolution:** (commit 82ad9bf)

- ✅ Increased `--color-cli-text-dim`: 65% → 80% lightness
- ✅ Increased `--color-cli-text-muted`: 50% → 70% lightness
- ✅ Improved WCAG AA compliance for all dark mode text
- ✅ Maintains visual hierarchy (primary > dim > muted)

**Impact:** Settings, Home, Thread pages now clearly readable in dark mode.

---

#### Issue #255 (P1): Copilot Threads Not Appearing ✅ FIXED

**Problem:**

- User actively using GitHub Copilot Chat in VS Code
- Expected to see Copilot threads in CodeRelay
- Server logs: `JSON-RPC error -32601: "Method not found": list_sessions`
- ACP provider status: "unhealthy"

**Root Cause:**

- User's Copilot CLI version doesn't support `list_sessions` method
- Adapter unconditionally called method during health checks
- Missing capability negotiation during handshake
- Treated missing method as "unhealthy" instead of "degraded"

**Resolution:** (commit 90b44c9)

- ✅ Added capability probing during ACP handshake
- ✅ Detects JSON-RPC -32601 errors to identify missing methods
- ✅ Returns "degraded" status (not "unhealthy") when method unavailable
- ✅ Friendly error message: "Session listing not supported by this Copilot CLI version"
- ✅ Other Copilot features remain functional

**Lesson:** Version compatibility requires capability detection, not assumption.

---

#### Issue #256 (P1): Claude Architectural Mismatch ✅ FIXED

**Problem:**

- User has Claude CLI (v2.1.49) running locally
- Expected local CLI integration like Codex (Anchor) and Copilot (ACP)
- Discovered we integrated Claude via Anthropic web API (requires API key)
- Architectural inconsistency: 2 providers use local CLI, 1 uses web API

**Root Cause:**

- Original implementation used `@anthropic-ai/sdk` (web API)
- User's Claude CLI supports MCP (Model Context Protocol)
- `claude mcp serve` mode available
- `--output-format=stream-json` for structured output
- Never built local CLI adapter

**Resolution:** (commit 83cf0ea)

- ✅ Built new `claude-mcp-adapter.ts` (644 lines)
- ✅ Process spawning: `claude --print --output-format=stream-json`
- ✅ JSON streaming parser with real-time event emission
- ✅ Local session tracking (in-memory Map)
- ✅ Executable discovery with PATH search
- ✅ Health monitoring with graceful degradation
- ✅ Multi-turn conversation support via history

**Dual Provider Architecture:**

- **claude**: Anthropic web API (existing, requires API key)
- **claude-mcp**: Local CLI via MCP (new, no API key needed)

**Documentation:** Created comprehensive [CLAUDE_MCP_ADAPTER.md](services/local-orbit/src/providers/adapters/CLAUDE_MCP_ADAPTER.md) guide.

---

#### Issue #258 (Backlog): Web + Local Hybrid Architecture ✅ DOCUMENTED

**Proposal:**
Since we now support both web API and local CLI for Claude, consider offering same flexibility for Codex and Copilot in future.

**Potential Enhancements:**

- **Copilot Web:** GitHub Models API (`gpt-4o` via Copilot subscription)
- **Codex Web:** Research if web API available (may be local-only)

**Benefits:**

- User flexibility (choose based on setup/preferences)
- Reliability (fallback if one method unavailable)
- Performance (local may be faster, web may have more features)
- Cost (some prefer local execution, others managed API)

**Status:** Backlog/future consideration, no immediate implementation.

---

**Summary:**

- ✅ Fixed 3 critical post-install issues (contrast, Copilot, Claude)
- ✅ Improved provider architecture with dual Claude support
- ✅ Enhanced capability detection for version compatibility
- ✅ Documented hybrid architecture pattern for future providers
- 📦 Reinstall required to get all fixes

**Provider Status After Fixes:**

- **Codex:** Local CLI via Anchor ✅
- **Copilot ACP:** Local CLI with capability detection ✅
- **Claude:** Web API (existing) ✅
- **Claude MCP:** Local CLI (new) ✅

**Commits:**

- 82ad9bf: Dark mode contrast fix
- 90b44c9: Copilot capability detection
- 83cf0ea: Claude MCP adapter

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

## Epic #221: Farfield-Inspired UI/UX Refresh

### Issue #223: OKLCH Color Migration - Terminal Components

**Epic:** #221 | **Story Points:** 13 | **Status:** Phase 1A ✅, Phase 1B ✅

Migrate terminal/message components from CSS variables to Tailwind utility classes.

**Progress:**

- ✅ Phase 1A: 6 leaf components (PR #244 merged)
- ✅ Phase 1B: 11 critical components (in batches)
  - Batch 1: Tool.svelte
  - Batch 2: MessageBlock + ApprovalPrompt + UserInputPrompt
  - Batch 3: PromptInput
  - Batch 4: Thread route
  - Batch 5: Settings + remaining

**Acceptance Criteria:**

- [x] All `var(--cli-*)` CSS variable references removed
- [x] All components use Tailwind utility classes
- [x] No visual regressions in light/dark mode
- [x] Build and type-check pass
- [x] Dynamic color assignment works correctly

**Dependencies:**

- ✅ Issue #222 (Tailwind v4 foundation) - complete

**Blocks:**

- Issues #224-226 (other Phase 1 work)

## Technical Debt & Refactoring

- **CodexAdapter Migration**: Migrate Codex provider logic from index.ts into CodexAdapter class.
  - **Goal**: Migrate Codex provider logic from index.ts into CodexAdapter class.
  - **Why**: Reduce index.ts complexity (~2,900 lines), match cleaner adapter pattern used by copilot-acp.
  - **Status**: Optional refactoring, no functional impact.
  - **Priority**: Low (P3/P4).
  - **Files**: [services/local-orbit/src/index.ts](services/local-orbit/src/index.ts), [services/local-orbit/src/providers/adapters/codex-adapter.ts](services/local-orbit/src/providers/adapters/codex-adapter.ts)

## Future Features / Ideas

- **OpenCode Integration**
  - **Status**: Planned (not started)
  - **Priority**: TBD (to be determined)
  - **Description**: Placeholder for OpenCode integration feature (details to be defined)

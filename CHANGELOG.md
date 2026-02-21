# Changelog

All notable changes to **CodeRelay** will be documented here.

This project started as a local-only fork inspired by **Zane** by Z. Siddiqi. See `docs/ATTRIBUTION.md`.

## [Unreleased]

### Changed

- **OKLCH Color Migration (Phase 1B)**: Migrated 11 terminal and message components to Tailwind OKLCH system (including `Tool`, `MessageBlock`, `ApprovalPrompt`, `UserInputPrompt`, `PromptInput`, `Thread`, `Settings`).
- **BREAKING**: Rebranded from "Codex Pocket" to "CodeRelay"
  - All localStorage keys migrated automatically (`__zane_threads_store__` → `__coderelay_threads_store__`)
  - Environment variable: `CODEX_POCKET_HOME` → `CODERELAY_HOME`
  - Binary: `codex-pocket` → `coderelay`
  - LaunchAgent: `com.codex.pocket.plist` → `com.coderelay.plist`
  - Repository will be renamed: `ddevalco/codex-pocket` → `ddevalco/coderelay`
- **Copilot sessions attachment button now enabled** (CAN_ATTACH_FILES: true)
- sendPrompt relay path supports multiple attachment input formats
- ACP protocol uses content array with text and image/attachment parts
- Attachment button disabled for providers that don't support file attachments
- Removed hard-coded provider checks from UI components
- Unified action gating logic in thread list (rename/archive)

### Added

- **ACP Approvals & Tool Permissions**: Interactive prompts for Copilot tool actions (shell commands, file ops, etc.)
- Support for "Allow once", "Always allow", "Reject once", and "Always reject" decisions
- 60-second timeout auto-cancel for pending approvals
- Persistent "always" rules stored in localStorage with revocation UI in Settings
- Auto-approve mode detection via `--allow-all-tools` flag with UI warning banner
- Bidirectional JSON-RPC support for server-initiated ACP requests
- **Advanced Filtering**: Thread list can now be filtered by provider (All/Codex/Copilot) and status (All/Active/Archived)
- Live thread counts displayed on filter chips
- Persistent filter state (localStorage) survives page reloads
- Mobile-responsive filter bar with accessible chip controls
- Empty state handling for filtered thread list
- **ACP attachment support**: Copilot sessions can now send image attachments to ACP providers
- File content base64 encoding for ACP protocol compatibility
- Graceful fallback: text-only retry when ACP rejects attachments
- Attachment validation and normalization helpers (PromptAttachment interface)
- Capability-driven UI feature gating: attachment button now respects provider capabilities
- Tooltips explain why features are unavailable when disabled
- Created thread-capabilities helper module for consistent capability checks

### Fixed

- Backward compatibility: threads without capability metadata work normally
- Graceful degradation: UI adapts to provider limitations without errors

## 2026-01 to 2026-02-16 - Early Development

The following features were added during early development:

- Core/Multi-provider: ACP write capability implementation via `sendPrompt` (PR #147).
- Providers: streaming response handling for ACP sessions (PR #148).
- UI: prompt input and session interaction for Copilot sessions (PR #149).
- Core/Multi-provider: implemented Phase 1 of multi-provider support with a provider registry and lifecycle management (PR #143).
- Providers: added read-only Copilot ACP (Agent Control Plane) adapter to surface active Copilot sessions (PR #143).
- API: added unified provider and session listing endpoints to support discovery across different backend adapters (PR #143).
- UI: home page threads are now grouped by provider, allowing for discovery of external sessions (PR #143).
- CLI: added `coderelay self-test` and expanded `smoke-test` to cover the NDJSON events replay endpoint (helps catch “blank threads” regressions).
- CLI: smoke-test now also verifies `/app` serves HTML and the main JS bundle is fetchable (catches "blank app" incidents when the service is unhealthy or UI dist is mismatched).
- CLI: background-mode start is now fully detached (prevents "service starts then immediately dies" when invoked from install/update helpers).
- UI: harden thread list parsing/normalization so upstream `thread/list` response shape changes (nested `data`, `thread_id`) don't collapse the list to empty.
- UI: fixed a thread list instability regression where list subscription bookkeeping used reactive `$state<Set<...>>` and could create an effect feedback loop (manifesting as an empty/unstable thread list).
- Repo/CI: remove `.agents/` artifacts from git and add a CI regression guard to prevent reintroducing the thread list subscription loop pattern.
- UI: message-level **copy** button (with a fallback clipboard implementation for non-HTTPS origins).
- UI: thread export now supports both Markdown (`.md`) and JSON (`.json`).
- UI: thread share now prefers sharing a real file on iOS (Web Share API `files`), falling back to text/copy/download.
- UI: thread list now has quick **export/share** actions (Markdown + JSON) without opening the thread.
- UI: thread list export/share now rehydrates from the events replay endpoint when cache is cold; Shift+Click forces a bounded deeper replay fetch.
- UI: tool output blocks now have a **copy** button (works on `http://` via fallback copy).
- UI: message copy now defaults to copying plain text (markdown stripped); Shift+Click copies raw markdown source.
- UI: message actions menu (copy, copy markdown, copy quoted, copy from here) + thread header “copy last 20”.
- UI: mobile thread list shows more of the title by allowing 2-line titles while keeping the date visible.
- UI/Admin/CLI: detect upstream Codex app-server auth invalidation and surface a clear recovery warning.
- Admin: add a limited remote CLI runner for safe `coderelay` commands (with output capture).
- UI: Admin page refreshed with a structured, settings-style layout and clearer hierarchy.
- Docs/UX: added `docs/ADMIN_REDESIGN_PROPOSAL.md` and aligned backlog/project planning for phased Admin + Settings UI redesign work.
- Docs: added `docs/NATIVE_IOS_ROADMAP.md` with phased native-client milestones, constraints, and decision gates.
- Docs/Repo: added `CONTRIBUTING.md` with an explicit ff-only sync policy, PR/testing expectations, and a local pre-release clean-tree check script (`scripts/ci/check-clean-tree.sh`).
- UX: added one-tap composer quick-reply shortcuts (default `Proceed`/`Elaborate`) plus a `/settings` editor to customize and persist preset labels/text per device.
- Settings redesign follow-up: `/settings` now uses a responsive two-column card grid on desktop (single-column mobile) with core controls prioritized above secondary account/about details.
- Admin/Settings redesign pass: refreshed `/admin` and `/settings` visual surfaces with calmer system-console styling (improved card hierarchy, spacing, button/input treatments, and responsive two-column admin operations layout) with no behavioral/API changes.
- Thread export/share: added `.html` export format in thread view and thread-list quick actions (alongside existing Markdown/JSON exports).
- Attachments: composer now supports multi-image selection and shows removable attachment chips; image markdown is generated automatically on send so users no longer need to edit attachment markdown manually.
- Admin uploads: added storage visibility in `/admin` (file count, bytes used, oldest/newest timestamps, and last prune activity) backed by a new authenticated `/admin/uploads/stats` endpoint.
- Thread export/share: added PDF export action (print-to-PDF via browser print dialog) in thread view and thread-list quick actions, using existing HTML export content.
- Docs/Backlog: cleaned stale completed P1 items from active backlog sections (admin redesign parent + thread indicator polish) to keep roadmap actionable.
- Admin uploads reporting: `/admin/uploads/stats` now includes last prune detail/source (manual/scheduled/unknown), surfaced in Admin Uploads UI.
- Attachments: composer attachment chips now render small image thumbnails for faster visual verification before sending.
- Admin uploads: auto-cleanup cadence is now configurable (1-168 hours) and visible in `/admin`, persisted with retention settings.
- Admin: added token session management UI in `/admin` (create/list/revoke session tokens) with one-time token display/copy and active/revoked status.
- Docs: updated README/Admin/Security/Protocol docs to reflect token-session auth, read-only mode, and per-device pairing tokens.

## Unreleased

### Added

- **ACP Phase 5 Hardening:** 30-second timeout enforcement for `sendPrompt` operations with performance telemetry
- **Automatic Retry Logic:** Exponential backoff retry (up to 3 attempts) for transient ACP failures
- **Health Tracking:** Provider health monitoring with consecutive failure detection
- **Test Coverage Expansion:** Comprehensive reliability tests for timeout behavior, retry logic, session isolation, and error recovery (ECONNRESET, EPIPE)
- **CI Capability Smoke Tests:** Added `capability-smoke` job to validate provider capability matrix in CI pipeline
- **Regression Guards:** Automated capability matrix regression checks in CI

### Changed

- **CI Pipeline:** Enhanced with capability validation and regression detection (codex/phase3-integration)

### UX

- UI: on mobile, the thread status legend is now available via a `?` button (iOS doesn't reliably show `title` tooltips).
- UX: thread list ordering now preserves upstream activity timestamps (updatedAt/lastActivity) and uses a deterministic tie-breaker (less reorder-on-refresh).
- Thread list is now sorted by most recent activity (Pocket-observed activity first, then upstream timestamps, then createdAt fallback).
- Admin/Settings redesign phase 1: added shared settings-surface primitives (`SectionCard`, `StatusChip`, `DangerZone`) and migrated `/settings` to use them without behavior changes.
- Admin/Settings redesign phase 2: `/admin` now uses shared card primitives with a settings-style grid shell and status chips while preserving existing admin actions/flows.
- Admin/Settings redesign phase 3: admin interactions now include disruptive-action confirmations, unified action result chips with timestamps, and progressive disclosure for advanced CLI/log/debug sections.
- Admin/Settings redesign phase 4: accessibility pass adds stronger keyboard focus styles (including advanced disclosure summaries), explicit labels for critical controls, and screen-reader announcements for action results/errors.
- Admin UI polish: reorganized `/admin` into a cleaner top-to-bottom flow (core + pairing, uploads, then stacked advanced tools) and refreshed control styling for a more modern, consistent look.

### CLI / Update

- CLI: `start` now falls back to background mode if the launchd plist is missing (keeps update/restart usable even if the agent file is deleted).
- CLI: improved owned-process detection by also checking process CWD (helps kill stale listeners from older installs where the command line is just `bun run src/index.ts`).
- `coderelay update` stop/restart now more aggressively cleans up *owned* stale listeners and orphaned anchors before rebuilding/restarting.
- CLI/update stale-listener cleanup now has a bounded `SIGKILL` fallback for **owned** listeners that ignore `SIGTERM` (reduces post-update restart flakiness without killing unrelated processes).
- `ensure`/`smoke-test` now retry `/admin/validate` a few times to avoid false failures immediately after restart.
- Start/stop/restart now kill stale listeners using the configured ports (not hard-coded 8790).
- `coderelay update` now always prints a final `summary` and exits non-zero if `ensure` or `smoke-test` fail (next: `coderelay diagnose`).
- Config parsing is now validated early to avoid Python stack traces when config.json is empty/corrupt.
- Added a local update-flow regression script: `scripts/test-update-flow.sh`.
- Update-flow regression script now simulates a stale Pocket-owned listener on the configured port and asserts cleanup behavior (plus a default-port guard when available) to catch hardcoded-port regressions.
- Fixed `ensure`/`smoke-test` validation parsing so `/admin/validate` results are read correctly (no more false "empty response" failures).
- Installer now writes `~/.coderelay/bin/coderelay` as a small wrapper that delegates to `~/.coderelay/app/bin/coderelay` to avoid stale CLI copies after updates.

### Cache / Versioning

- `index.html` is now served with `Cache-Control: no-store` to reduce cached broken bundle issues after updates.
- Settings and Admin now show UI build commit/time plus server app commit (from `/health` and `/admin/status`).

### CI

- Added GitHub Actions workflow to build the UI and run a local-orbit smoke test (health, admin status, cache headers, events endpoint).
- CI now also smoke-tests the WebSocket relay path (client ↔ anchor) to catch blank-thread regressions.
- CI now also smoke-tests `POST /admin/repair` using safe actions (`ensureUploadDir`, `pruneUploads`) to catch regressions in the self-heal path.
- CI now smoke-tests `/admin/repair` safe actions and non-Tailscale `fixTailscaleServe` behavior to harden self-heal path coverage across environments.
- CI now smoke-tests `/admin/uploads/retention` updates (retention + auto-cleanup interval) and verifies `/admin/status` reflects saved upload settings.
- CI now smoke-tests token-session security behavior (pairing returns per-device token, read-only session write/WS mutating guards).
- CI now also verifies pair codes are one-time consumable and revoked session tokens immediately lose auth.

## 2026-02-21

### Fixed

- fix: Address 33 Copilot review comments from merged PRs #280-286 (#294)
- fix: Replace insecure Math.random()/Date.now() session IDs with crypto.randomUUID() (#293)

## 2026-02-20

### Added

- feat: P5.4 plan mode visualization (#286)
- feat: P5 polish & micro-interactions (#285)
- feat: P4 conversation UI refresh (#284)
- feat: P3 composer improvements (#283)
- feat: P2 component library (#282, #281)
- feat: P1 design system foundation (#280)

### Fixed

- fix: Remediate Copilot code review findings (#279)

## 2026-02-18

### Added

- feat: Multi-provider routing and UI support (#275)

## 2026-02-16

### Security

- security: Authorization, sanitization, validation, schema hardening (#267)

## 2026-02-17 - Phase 2: Multi-provider & Reliability

### Providers (Phase 2)

- Copilot ACP: added write capability with `sendPrompt()` method for sending prompts to sessions (#144)
- Copilot ACP: added streaming response handling with incremental UI updates and chunk aggregation (#145)
- UI: enabled prompt composer for Copilot sessions with automatic capability detection (#146)

### Reliability

- Reliability: added durable client outbox with idempotency keys for mutating RPCs to prevent lost/duplicated user actions on reconnects (PR #111, P1 #105).
- Observability: added server-side run timeline and failure reason counters exposed in `/admin/status` and Admin UI for improved remote debugging (PR #112, P1 #106).

### Orchestration UX

- feat(notifications): away-mode alerts (PR #113).
- Orchestration UX: prompt and agent presets (PR #114).
- Multi-agent: helper profile launch (PR #115).

### Security

- Security/dependencies: ran `npm audit fix` to remediate `devalue` DoS advisories (`GHSA-g2pg-6438-jwpf`, `GHSA-vw5p-8cq8-m7mv`) and `svelte` XSS advisory (`GHSA-6738-r8g5-qwp3`); `npm audit --audit-level=moderate` now reports 0 vulnerabilities.
- Security: added in-process rate limits for sensitive token-minting endpoints (`/admin/pair/new`, `/uploads/new`) with explicit `429` responses and CI smoke coverage.
- Security/Admin: phase-1 per-device token sessions added on the backend (`/admin/token/sessions*`) with create/list/revoke APIs and legacy-token auth compatibility.
- Security: token sessions now support `read_only` mode; read-only sessions are blocked from write HTTP actions and WebSocket upgrades.
- Pairing/Security: `/admin/pair/new` now mints a unique token session per pairing code instead of reusing the legacy shared token.
- Security: read-only token sessions can now connect to WebSocket for live reads, while mutating client RPC methods are denied with explicit errors.

## 2026-02-08 - Stability & Documentation

### Stability

- Fixed a web UI runtime crash where the message “copy” button referenced an undefined `copyState`, causing blank threads and broken navigation. (commit `9513c3c`)

### Docs

- Expanded CLI and troubleshooting docs.
- Added `BACKLOG.md` and `docs/DIFFERENCES_FROM_ZANE.md`.

## 2026-02-07 - Thread Management & Attachments

### Thread Titles / Rename Sync

- Thread list titles now match Codex Desktop renamed titles by reading `~/.codex/.codex-global-state.json` and injecting `title/name/displayName` into `thread/list` + `thread/read` payloads. (commits `74db0ba`, `93c2702`)
- Added a thread rename action in CodeRelay that updates Codex Desktop's title store (Admin token required). (commit `133d3da`)

### Vision / Attachments

- **Vision attachments**: image uploads are passed to Codex app-server as structured `input` items (in addition to rendering inline in the UI), making attached images available to vision-capable models. (commit `5d58e60`)
- Uploads API returns `localPath`, `filename`, and `mime` (authorised only) to support attachment wiring. (commit `5d58e60`)

### Branding

- Replaced the legacy Zane favicon with a CodeRelay icon (`/icons/icon.svg`). (commit `01ba786`)

### iOS Upload UX

- iOS Safari shows the Photo Library picker for attachments by removing the `capture` attribute that forced camera-only. (commit `dc14c32`)

### Admin: Upload Retention & Ops

- Admin UI includes an Uploads section for retention config + manual prune, with status refresh after actions. (commits `e0247e1`, `a02f3eb`)

### Concurrency

- Fixed a global “turn in progress” state that blocked composing in other threads while one thread was running. Thread input is now tracked per-thread. (commit `e58cdd6`)

### CLI / Lifecycle

- Added `coderelay update`: pulls latest app, installs deps, rebuilds UI, restarts service. (commit `a2b4450`)
- Improved `start/stop/restart` reliability: auto-kill stale CodeRelay listeners, wait for `/health`, and handle common port conflict cases. (commits `27aa998`, `6d2c959`)

### Installer UX & Reliability

- Installer improved to handle port conflicts more safely and persist port changes across config + launchd. (commit `a02f3eb`)
- Installer copies the access token to clipboard (best effort). (commit `defd262`)
- Pairing: QR served as an authenticated blob so the token doesn’t appear in image URLs. (commit `f462238`)

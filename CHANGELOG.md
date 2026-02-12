# Changelog

All notable changes to **Codex Pocket** will be documented here.

This project started as a local-only fork inspired by **Zane** by Z. Siddiqi. See `docs/ATTRIBUTION.md`.

## Unreleased

- CLI: added `codex-pocket self-test` and expanded `smoke-test` to cover the NDJSON events replay endpoint (helps catch “blank threads” regressions).
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
- Admin: add a limited remote CLI runner for safe `codex-pocket` commands (with output capture).
- Docs/UX: added `docs/ADMIN_REDESIGN_PROPOSAL.md` and aligned backlog/project planning for phased Admin + Settings UI redesign work.
- Docs/Repo: added `CONTRIBUTING.md` with an explicit ff-only sync policy, PR/testing expectations, and a local pre-release clean-tree check script (`scripts/ci/check-clean-tree.sh`).
- UX: added one-tap composer quick-reply shortcuts (default `Proceed`/`Elaborate`) plus a `/settings` editor to customize and persist preset labels/text per device.
- Settings redesign follow-up: `/settings` now uses a responsive two-column card grid on desktop (single-column mobile) with core controls prioritized above secondary account/about details.
- Admin/Settings redesign pass: refreshed `/admin` and `/settings` visual surfaces with calmer system-console styling (improved card hierarchy, spacing, button/input treatments, and responsive two-column admin operations layout) with no behavioral/API changes.
- Thread export/share: added `.html` export format in thread view and thread-list quick actions (alongside existing Markdown/JSON exports).
- Security: added in-process rate limits for sensitive token-minting endpoints (`/admin/pair/new`, `/uploads/new`) with explicit `429` responses and CI smoke coverage.
- Attachments: composer now supports multi-image selection and shows removable attachment chips; image markdown is generated automatically on send so users no longer need to edit attachment markdown manually.
- Admin uploads: added storage visibility in `/admin` (file count, bytes used, oldest/newest timestamps, and last prune activity) backed by a new authenticated `/admin/uploads/stats` endpoint.
- Thread export/share: added PDF export action (print-to-PDF via browser print dialog) in thread view and thread-list quick actions, using existing HTML export content.
- Docs/Backlog: cleaned stale completed P1 items from active backlog sections (admin redesign parent + thread indicator polish) to keep roadmap actionable.
- Admin uploads reporting: `/admin/uploads/stats` now includes last prune detail/source (manual/scheduled/unknown), surfaced in Admin Uploads UI.
- Attachments: composer attachment chips now render small image thumbnails for faster visual verification before sending.
- Admin uploads: auto-cleanup cadence is now configurable (1-168 hours) and visible in `/admin`, persisted with retention settings.

### UX
- UI: on mobile, the thread status legend is now available via a `?` button (iOS doesn't reliably show `title` tooltips).
- UX: thread list ordering now preserves upstream activity timestamps (updatedAt/lastActivity) and uses a deterministic tie-breaker (less reorder-on-refresh).
- Thread list is now sorted by most recent activity (Pocket-observed activity first, then upstream timestamps, then createdAt fallback).
- Admin/Settings redesign phase 1: added shared settings-surface primitives (`SectionCard`, `StatusChip`, `DangerZone`) and migrated `/settings` to use them without behavior changes.
- Admin/Settings redesign phase 2: `/admin` now uses shared card primitives with a settings-style grid shell and status chips while preserving existing admin actions/flows.
- Admin/Settings redesign phase 3: admin interactions now include disruptive-action confirmations, unified action result chips with timestamps, and progressive disclosure for advanced CLI/log/debug sections.
- Admin/Settings redesign phase 4: accessibility pass adds stronger keyboard focus styles (including advanced disclosure summaries), explicit labels for critical controls, and screen-reader announcements for action results/errors.

### CLI / Update
- CLI: `start` now falls back to background mode if the launchd plist is missing (keeps update/restart usable even if the agent file is deleted).
- CLI: improved owned-process detection by also checking process CWD (helps kill stale listeners from older installs where the command line is just `bun run src/index.ts`).
- `codex-pocket update` stop/restart now more aggressively cleans up *owned* stale listeners and orphaned anchors before rebuilding/restarting.
- `ensure`/`smoke-test` now retry `/admin/validate` a few times to avoid false failures immediately after restart.
- Start/stop/restart now kill stale listeners using the configured ports (not hard-coded 8790).
- `codex-pocket update` now always prints a final `summary` and exits non-zero if `ensure` or `smoke-test` fail (next: `codex-pocket diagnose`).
- Config parsing is now validated early to avoid Python stack traces when config.json is empty/corrupt.
- Added a local update-flow regression script: `scripts/test-update-flow.sh`.
- Update-flow regression script now simulates a stale Pocket-owned listener on the configured port and asserts cleanup behavior (plus a default-port guard when available) to catch hardcoded-port regressions.
- Fixed `ensure`/`smoke-test` validation parsing so `/admin/validate` results are read correctly (no more false "empty response" failures).
- Installer now writes `~/.codex-pocket/bin/codex-pocket` as a small wrapper that delegates to `~/.codex-pocket/app/bin/codex-pocket` to avoid stale CLI copies after updates.

### Cache / Versioning
- `index.html` is now served with `Cache-Control: no-store` to reduce cached broken bundle issues after updates.
- Settings and Admin now show UI build commit/time plus server app commit (from `/health` and `/admin/status`).

### CI
- Added GitHub Actions workflow to build the UI and run a local-orbit smoke test (health, admin status, cache headers, events endpoint).
- CI now also smoke-tests the WebSocket relay path (client ↔ anchor) to catch blank-thread regressions.
- CI now smoke-tests `/admin/repair` safe actions and non-Tailscale `fixTailscaleServe` behavior to harden self-heal path coverage across environments.

## 2026-02-08

### Stability
- Fixed a web UI runtime crash where the message “copy” button referenced an undefined `copyState`, causing blank threads and broken navigation. (commit `9513c3c`)

### Docs
- Expanded CLI and troubleshooting docs.
- Added `BACKLOG.md` and `docs/DIFFERENCES_FROM_ZANE.md`.

## 2026-02-07

### Thread Titles / Rename Sync
- Thread list titles now match Codex Desktop renamed titles by reading `~/.codex/.codex-global-state.json` and injecting `title/name/displayName` into `thread/list` + `thread/read` payloads. (commits `74db0ba`, `93c2702`)
- Added a thread rename action in Codex Pocket that updates Codex Desktop's title store (Admin token required). (commit `133d3da`)

### Vision / Attachments
- **Vision attachments**: image uploads are passed to Codex app-server as structured `input` items (in addition to rendering inline in the UI), making attached images available to vision-capable models. (commit `5d58e60`)
- Uploads API returns `localPath`, `filename`, and `mime` (authorised only) to support attachment wiring. (commit `5d58e60`)

### Branding
- Replaced the legacy Zane favicon with a Codex Pocket icon (`/icons/icon.svg`). (commit `01ba786`)

### iOS Upload UX
- iOS Safari shows the Photo Library picker for attachments by removing the `capture` attribute that forced camera-only. (commit `dc14c32`)

### Admin: Upload Retention & Ops
- Admin UI includes an Uploads section for retention config + manual prune, with status refresh after actions. (commits `e0247e1`, `a02f3eb`)

### Concurrency
- Fixed a global “turn in progress” state that blocked composing in other threads while one thread was running. Thread input is now tracked per-thread. (commit `e58cdd6`)

### CLI / Lifecycle
- Added `codex-pocket update`: pulls latest app, installs deps, rebuilds UI, restarts service. (commit `a2b4450`)
- Improved `start/stop/restart` reliability: auto-kill stale Codex Pocket listeners, wait for `/health`, and handle common port conflict cases. (commits `27aa998`, `6d2c959`)

### Installer UX & Reliability
- Installer improved to handle port conflicts more safely and persist port changes across config + launchd. (commit `a02f3eb`)
- Installer copies the access token to clipboard (best effort). (commit `defd262`)
- Pairing: QR served as an authenticated blob so the token doesn’t appear in image URLs. (commit `f462238`)

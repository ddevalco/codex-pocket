# Backlog

This file mirrors the canonical backlog, which lives in **GitHub Projects**:

- https://github.com/users/ddevalco/projects/2

If the two ever disagree, treat GitHub Projects as the source of truth and update this file to match.

## Recently Done

- CI: added an explicit `/admin/validate` smoke check (auth required).
- CI: added small regression guards to prevent known UI footguns (e.g. thread list subscription loop).
- CLI: `start` now falls back to background mode if the launchd plist is missing.
- CLI: improved owned-process detection by also checking process CWD (helps kill stale listeners from older installs where the command line is just `bun run src/index.ts`).
- Update regression: `scripts/test-update-flow.sh` now runs in restricted/offline environments (seeds `node_modules`, wraps Bun cache dir, uses more portable cleanup).
- CLI: stop/start now kill stale listeners using configured ports (not hard-coded 8790).
- Added GitHub Actions CI workflow to build and smoke-test local-orbit on every push/PR.
- CI now smoke-tests the WebSocket relay path (client ↔ anchor).
- CI now smoke-tests `/admin/repair` safe actions and non-Tailscale `fixTailscaleServe` behavior.
- `codex-pocket update` now always prints a final `summary` block and exits non-zero if post-update `ensure`/`smoke-test` fail.
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

## P0 (Stability)

- CI smoke coverage hardening (remaining edge paths).
- Update reliability with stale processes (remaining hardening).

## P4 (Platform)

- Native iOS app (optional): better background behavior, push notifications for “approval required”, better file picker.

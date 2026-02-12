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
- `codex-pocket update` now always prints a final `summary` block and exits non-zero if post-update `ensure`/`smoke-test` fail.
- Fixed `ensure`/`smoke-test` validation parsing to avoid false failures.
- CLI now validates `config.json` early (avoids Python stack traces when config is missing/empty/corrupt).
- Added a local update-flow regression script: `scripts/test-update-flow.sh`.

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

## P0 (Stability)

- Extend CI smoke coverage to include WebSocket relay and (optionally) additional admin repair paths with stubs/bypasses for non-Tailscale environments.

## P1 (UX)

- Admin UI redesign (Issue #25):
  - Implement the system-settings style overhaul described in `docs/ADMIN_REDESIGN_PROPOSAL.md`.
  - Prioritize status clarity, progressive disclosure, and mobile usability.
- Thread activity indicator (idle/working/blocked) polish:
  - Ensure it is visible on mobile.
  - Add a legend or tooltip.
- Composer quick-reply shortcuts:
  - Add one-tap preset replies (for example: "Proceed", "Elaborate").
  - Allow users to customize the shortcut labels/text in settings.
- Settings UI redesign:
  - Rework `/settings` into a clearer, more modern layout with stronger visual hierarchy.
  - Align styling/components with the Admin refresh so both surfaces feel consistent.
- Thread export/share polish:
  - Add “Export as HTML/PDF” (optional).

## P2 (Attachments)

- Attachment UI polish:
  - Optional “attachment chip” UI so users don’t have to see markdown inserted into the composer.
  - Multiple attachments per message.
- Upload retention:
  - Scheduled pruning + reporting in Admin.
  - Better visibility: size used, oldest/newest, last prune time.

## P3 (Security / Admin)

- Per-device tokens (instead of one global bearer token) and revocation UI.
- Optional read-only mode for paired devices.
- Rate limit sensitive endpoints (`/admin/pair/new`, `/uploads/new`).

## P4 (Platform)

- Native iOS app (optional): better background behavior, push notifications for “approval required”, better file picker.

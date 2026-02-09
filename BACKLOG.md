# Backlog

This is a prioritized list of remaining improvements.

## Recently Done

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

## P0 (Stability)

- Extend CI smoke coverage to include WebSocket relay and (optionally) `/admin/validate` with stubs/bypasses for non-Tailscale environments.
- Improve update reliability when multiple Pocket processes exist: detect and kill stale listeners more aggressively before restart.

## P1 (UX)

- Thread activity indicator (idle/working/blocked) polish:
  - Ensure it is visible on mobile.
  - Add a legend or tooltip.
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

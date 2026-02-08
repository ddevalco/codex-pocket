# Backlog

This is a prioritized list of remaining improvements.

## Recently Done

- `codex-pocket update` now always prints a final `summary` block and exits non-zero if post-update `ensure`/`smoke-test` fail.
- CLI now validates `config.json` early (avoids Python stack traces when config is missing/empty/corrupt).
- Added a local update-flow regression script: `scripts/test-update-flow.sh`.

## P0 (Stability)

- Add automated end-to-end smoke coverage in CI: build UI, run local-orbit, hit `/health`, `/admin/status`, `/admin/validate`.
- Improve update reliability when multiple Pocket processes exist: detect and kill stale listeners more aggressively before restart.
- Reduce “cached broken bundle” cases:
  - Set `Cache-Control: no-store` (or short max-age) for `index.html`.
  - Show a build/version string in Settings/Admin so it’s obvious which code is running.

## P1 (UX)

- Thread ordering: sort by last activity consistently.
  - Clarify behavior: “observed activity” vs upstream timestamps.
- Thread activity indicator (idle/working/blocked) polish:
  - Ensure it is visible on mobile.
  - Add a legend or tooltip.
- Copy UX:
  - Copy message button on mobile should be easier to hit.
  - Add “Copy as Markdown” vs “Copy plain text” (optional).
- Export/share:
  - Export thread to Markdown.
  - Share sheet integration on iOS.

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

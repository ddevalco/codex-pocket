# Admin UI

Open `/admin` in the browser.

## What it shows
- Service status (UI dist, DB path/retention, anchor status)
- Anchor log stream
- Remote CLI (a limited allowlist of `codex-pocket` commands)

## Pair iPhone
- On first sign-in, `/admin` auto-generates a short-lived pairing QR.
- Use "Regenerate pairing code" to mint a fresh QR (codes are one-time and expire).
- Scan from iPhone to sign in without manually typing the token.

## Thread titles (Codex Desktop sync)
Codex Pocket keeps thread titles in sync with the Codex desktop app by reading:
- `~/.codex/.codex-global-state.json` (`thread-titles.titles[threadId]`)

This is necessary because many `codex app-server` versions do not include the user-renamed title in `thread/list` payloads.

### Renaming threads from Codex Pocket
Codex Pocket can rename a thread by updating the same Codex title store file.
- In the thread list (desktop UI), click the ✎ icon next to a thread.
- This requires you to be signed into `/admin` in that browser session (uses the Admin bearer token).

## Anchor control
- **Anchor** is the local agent running on your Mac. It spawns `codex app-server` and relays messages to the web UI.
- Anchor is auto-started by default when the service starts.
- Use "Stop anchor" if you want to suspend Codex spawning and remote control temporarily.

## Remote CLI
The Admin UI includes a limited command runner for safe, hardcoded `codex-pocket` commands. This is useful when
you’re remote and need to troubleshoot.

Notes:
- Commands are allowlisted and do **not** include token-printing or update flows.
- Disruptive commands (stop/restart) can disconnect the admin session.

## SQLite persistence
- local-orbit stores selected events in SQLite (default `~/.codex-pocket/codex-pocket.db`).
- Retention is configured via `ZANE_LOCAL_RETENTION_DAYS` (default 14 days).

## Debug tools
- "Debug" shows the last stored events (redacted). This helps diagnose issues where threads appear but transcripts are blank.
- "Rotate access token" rotates the bearer token and disconnects all devices. After rotating, you must sign in again on Mac/iPhone.

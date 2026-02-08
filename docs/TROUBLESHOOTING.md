# Troubleshooting

This page is written for the real-world failure modes we’ve seen during installs and updates.

## Quick Fix (Most Common)

1. Restart:

```bash
~/.codex-pocket/bin/codex-pocket restart
```

2. Validate + repair:

```bash
~/.codex-pocket/bin/codex-pocket ensure
```

3. Print URLs (so you know what to open):

```bash
~/.codex-pocket/bin/codex-pocket urls
```

## If You Need To File A Bug

Run this and paste the output:

```bash
~/.codex-pocket/bin/codex-pocket diagnose
```

## Common Symptoms

### "This site can’t be reached" / "Failed to fetch"

This usually means the browser can’t reach the server at all (not an auth issue).

```bash
curl -fsS http://127.0.0.1:8790/health
```

If it fails:

```bash
~/.codex-pocket/bin/codex-pocket restart
curl -fsS http://127.0.0.1:8790/health
```

If it still fails:

```bash
~/.codex-pocket/bin/codex-pocket diagnose
```

### Blank Screen / Threads Don’t Render After An Update

Most common cause: the browser has cached a broken JS bundle.

1. Hard refresh (desktop): `Cmd+Shift+R`
2. On iPhone Safari:
- Long-press the refresh icon, then “Reload Without Content Blockers” (if present)
- If still broken: Settings app -> Safari -> Advanced -> Website Data -> delete the Pocket site

If it’s still blank, open DevTools console and look for the first non-extension error.
- Errors with `chrome-extension://...` are from extensions and are not Pocket.

### Thread List Loads, But A Thread Is Empty

This usually means the web UI loaded, but it didn’t receive event history or the live socket stream.

1. Confirm service + anchor are up:

```bash
~/.codex-pocket/bin/codex-pocket smoke-test
```

2. Validate + repair:

```bash
~/.codex-pocket/bin/codex-pocket ensure
```

3. Check whether the DB contains events for that thread:

```bash
sqlite3 ~/.codex-pocket/codex-pocket.db "select thread_id, count(*) n from events group by thread_id order by n desc limit 10;"
```

If events exist but the UI is empty, it’s almost always a frontend JS error. Hard refresh and check console.

### Admin Asks For Access Token Again

Get your current token:

```bash
~/.codex-pocket/bin/codex-pocket token
```

If you lost the token and `~/.codex-pocket/config.json` is gone, you’ll need to reinstall.

### "Serve is not enabled on your tailnet"

Tailscale may require enabling Serve once per tailnet.

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg http://127.0.0.1:8790
```

If it prints a URL, open it, enable Serve, then rerun the command.

### iPhone Opens Tailnet URL But Shows Disconnected / No Device

1. Confirm Tailscale is connected on iPhone and Mac.
2. Confirm `tailscale serve` is enabled and pointing at `http://127.0.0.1:8790`.
3. If you recently ran `codex-pocket update`, restart:

```bash
~/.codex-pocket/bin/codex-pocket restart
```

Then reload the tailnet URL.

### Port In Use (EADDRINUSE)

Defaults:
- Server: `8790`
- Anchor: `8788`

```bash
lsof -nP -iTCP:8790 -sTCP:LISTEN || true
lsof -nP -iTCP:8788 -sTCP:LISTEN || true
```

Then:

```bash
~/.codex-pocket/bin/codex-pocket restart
```

## Where Things Live

- Config: `~/.codex-pocket/config.json`
- Server log: `~/.codex-pocket/server.log`
- Anchor log: `~/.codex-pocket/anchor.log`
- Uploads: `~/.codex-pocket/uploads`
- DB: `~/.codex-pocket/codex-pocket.db`

# Troubleshooting

This page is written for a real-world failure mode: you installed Codex Pocket, it worked once, and then later Safari shows a blank screen, `/admin` asks for a token again, or iPhone can't connect.

## Quick Fix (Most Common)

1. Restart the service:

```bash
~/.codex-pocket/bin/codex-pocket restart
```

2. Then validate and auto-repair:

```bash
~/.codex-pocket/bin/codex-pocket ensure
```

## Common Symptoms

### "This site can't be reached" / "Failed to fetch"

This usually means the browser can't reach the local server at all (not an auth issue).

Run:

```bash
curl -fsS http://127.0.0.1:8790/health
```

If it fails, restart:

```bash
~/.codex-pocket/bin/codex-pocket restart
curl -fsS http://127.0.0.1:8790/health
```

If it still fails, capture diagnostics:

```bash
~/.codex-pocket/bin/codex-pocket diagnose
```

### Admin Asks For Access Token Again

Get your current token:

```bash
~/.codex-pocket/bin/codex-pocket token
```

If you lost the token and the `config.json` is gone, you'll need to reinstall.

### "Serve is not enabled on your tailnet"

Tailscale may require you to enable Serve in the admin console once per tailnet.

Run (on the Mac):

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg http://127.0.0.1:8790
```

If it prints a URL to enable Serve, open it and enable Serve, then rerun the command.

### iPhone Opens The Tailnet URL But Shows Disconnected / No Device

1. Confirm Tailscale is connected on iPhone and Mac.
2. Confirm `tailscale serve` is enabled and pointing at `http://127.0.0.1:8790`.
3. If you recently ran `codex-pocket update`, restart the service:

```bash
~/.codex-pocket/bin/codex-pocket restart
```

Then re-open the tailnet URL.

### Port In Use (EADDRINUSE)

Codex Pocket defaults to `8790` (server) and `8788` (anchor).

If another process is listening, you'll usually see logs mentioning `EADDRINUSE`.

The installer and CLI try to auto-kill stale Codex Pocket listeners, but if you want to check manually:

```bash
lsof -nP -iTCP:8790 -sTCP:LISTEN || true
lsof -nP -iTCP:8788 -sTCP:LISTEN || true
```

Then restart:

```bash
~/.codex-pocket/bin/codex-pocket restart
```

## Where Things Live

- Config: `~/.codex-pocket/config.json`
- Server log: `~/.codex-pocket/server.log`
- Anchor log: `~/.codex-pocket/anchor.log`
- Uploads: `~/.codex-pocket/uploads`
- DB: `~/.codex-pocket/codex-pocket.db`


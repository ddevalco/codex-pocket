# Troubleshooting

This project is designed to be local-first and tailnet-only. When something goes wrong, start with the CLI.

## Quick Checks

1. `codex-pocket self-test`
2. `codex-pocket diagnose`
3. `codex-pocket logs server`
4. `codex-pocket logs anchor`

## Common Issues

### Admin Page Asks For Access Token

Get the current token:

```bash
codex-pocket token
```

If you recently reinstalled or deleted `~/.codex-pocket/config.json`, the token changed and you may need to re-pair your phone.

### Pairing Code Expired (GitHub Actions / iPhone Pairing)

Generate a new one-time pairing link:

```bash
codex-pocket pair
```

Then open the printed URL (or scan it with your iPhone).

### Blank Screen Or Broken Navigation After Update

Hard refresh:

- Desktop: Cmd+Shift+R
- iPhone Safari: reload, or close the tab and reopen

If it persists:

```bash
codex-pocket restart
codex-pocket self-test
```

### Threads Are Empty / History Does Not Populate

This is usually one of:

- Anchor not running / not connected
- WebSocket relay broken (client <-> orbit <-> anchor)
- Events endpoint not returning NDJSON

Run:

```bash
codex-pocket self-test
```

If it fails:

```bash
codex-pocket diagnose
codex-pocket logs server
codex-pocket logs anchor
```

### Duplicate Devices Showing In Settings

This can happen when orphaned anchor processes are left behind after restarts/updates.

Fix:

```bash
codex-pocket restart
codex-pocket self-test
```

If it keeps happening, `codex-pocket diagnose` will show whether multiple anchors are running.

### Update Completed But Service Is Not Reachable

The updater does best-effort restarts, but macOS `launchctl` can be blocked and the service may fall back to a background process.

Run:

```bash
codex-pocket restart
codex-pocket self-test
```

### Tailscale Not Found

Codex Pocket expects Tailscale for tailnet-only access.

Install Tailscale:

- macOS: install the Tailscale app, then sign in
- iPhone: install Tailscale, then sign in to the same tailnet

Then verify serve is configured:

```bash
codex-pocket diagnose
```


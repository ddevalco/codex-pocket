# Troubleshooting

This project is designed to be local-first and tailnet-only. When something goes wrong, start with the CLI.

## Quick Checks

1. `coderelay self-test`
2. `coderelay diagnose`
3. `coderelay logs server`
4. `coderelay logs anchor`

## Provider-Specific Issues

For issues related to provider adapters (Copilot ACP, Codex, etc.), see:

- **[Provider Troubleshooting Guide](TROUBLESHOOTING_PROVIDERS.md)** - Startup failures, degraded mode, read-only enforcement, health endpoints, and diagnostic commands

## Common Issues

### `coderelay: command not found`

This means your shell PATH does not include the install bin directory yet.

Immediate workaround:

```bash
~/.coderelay/bin/coderelay summary
```

Permanent fix (zsh/macOS):

```bash
echo 'export PATH="$HOME/.coderelay/bin:$PATH"' >> ~/.zshrc
exec zsh
```

If you are running from the git repo, use:

```bash
./bin/coderelay summary
```

If you `cd bin`, run `./coderelay`, not `coderelay`.

### Admin Page Asks For Access Token

Get the current token:

```bash
coderelay token
```

If you recently reinstalled or deleted `~/.coderelay/config.json`, the token changed and you may need to re-pair your phone.

### Pairing Code Expired (iPhone Pairing)

Generate a new one-time pairing link:

```bash
coderelay pair
```

Then open the printed URL (or scan it with your iPhone).

Note: GitHub Actions does not use pairing codes. If CI is failing, open the Actions tab in GitHub to view logs and re-run the workflow.

### Blank Screen Or Broken Navigation After Update

Hard refresh:

- Desktop: Cmd+Shift+R
- iPhone Safari: reload, or close the tab and reopen

If it persists:

```bash
coderelay restart
coderelay self-test
```

### Threads Are Empty / History Does Not Populate

This is usually one of:

- Anchor not running / not connected
- WebSocket relay broken (client <-> orbit <-> anchor)
- Events endpoint not returning NDJSON

Run:

```bash
coderelay self-test
```

If it fails:

```bash
coderelay diagnose
coderelay logs server
coderelay logs anchor
```

### Messages Won't Send / Stuck After Long Runs

If the UI is responsive but new messages never start running, the upstream Codex app-server token may have been invalidated
(often after switching the desktop app between ChatGPT login and API key).

Fix:

1. Re-login in the Codex desktop app (ensure the correct auth mode is active).
2. Restart Pocket so Anchor re-spawns app-server with fresh auth:

```bash
coderelay restart
```

`coderelay diagnose` will now warn if it detects invalid upstream auth.

### Duplicate Devices Showing In Settings

This can happen when orphaned anchor processes are left behind after restarts/updates.

Fix:

```bash
coderelay restart
coderelay self-test
```

If it keeps happening, `coderelay diagnose` will show whether multiple anchors are running.

### Update Completed But Service Is Not Reachable

The updater does best-effort restarts, but macOS `launchctl` can be blocked and the service may fall back to a background process.

Run:

```bash
coderelay restart
coderelay self-test
```

If the service repeatedly becomes unreachable shortly after starting, confirm you are on the latest version (some older
background-start paths were not fully detached from the parent process).

### Tailscale Not Found

CodeRelay expects Tailscale for tailnet-only access.

Install Tailscale:

- macOS: install the Tailscale app, then sign in
- iPhone: install Tailscale, then sign in to the same tailnet

Then verify serve is configured:

```bash
coderelay diagnose
```

### Anchor Log Shows `Executable not found in $PATH: "codex"`

This usually means Anchor is running under launchd with a minimal PATH that does not include your Codex install location.

Anchor now auto-checks common locations (`/opt/homebrew/bin/codex`, `/usr/local/bin/codex`, `$HOME/.bun/bin/codex`), but if your install is elsewhere set an explicit override:

```bash
export ANCHOR_CODEX_PATH="/full/path/to/codex"
coderelay restart
```

If you use launchd, add the same env var to your launch configuration so it survives reboots.

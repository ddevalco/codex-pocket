# Install

## One-line install (macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/ddevalco/coderelay/main/scripts/install-local.sh | bash
```

Use a custom install location (optional):

```bash
CODERELAY_HOME="$HOME/my-relay" \
 curl -fsSL https://raw.githubusercontent.com/ddevalco/coderelay/main/scripts/install-local.sh | bash
```

The installer:

- checks dependencies (git, bun, tailscale)
- offers to run `tailscale up` if needed
- clones/updates the repo into `~/.coderelay/app`
- installs dependencies
- builds the web UI
- writes config to `~/.coderelay/config.json`
- installs a `launchd` agent to run the service at login
- optionally configures `tailscale serve` so your iPhone can access it

Notes:

- The installer prints an **Access Token** and also copies it to your clipboard automatically (macOS `pbcopy`, best-effort).
- Some machines (often managed/MDM) block `launchctl load` with `error 5`. In that case CodeRelay falls back to a background process (it will print `Service started via: background(pid ...)`).

## After install

- Local access: `http://127.0.0.1:8790`
- Tailnet access: `https://<your-mac-magicdns-host>/`
- Admin: `/admin`
- CLI: `~/.coderelay/bin/coderelay` (a thin wrapper that delegates to `~/.coderelay/app/bin/coderelay`)

### Make `coderelay` available in your shell

If `coderelay` prints `command not found`, your shell PATH does not include the install bin directory yet.

zsh (default on macOS):

```bash
echo 'export PATH="$HOME/.coderelay/bin:$PATH"' >> ~/.zshrc
exec zsh
```

bash:

```bash
echo 'export PATH="$HOME/.coderelay/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Quick alternatives (no shell config):

```bash
~/.coderelay/bin/coderelay summary
./bin/coderelay summary   # from repo root
```

Note: shells do not execute from the current directory by name. Inside `bin/`, run `./coderelay`, not `coderelay`.

## Tailscale Setup (Mac + iPhone)

CodeRelay is designed to be used over **Tailscale** so it stays private (tailnet-only) and encrypted.

1. Create a (free) Tailscale account: <https://tailscale.com/>
2. Install Tailscale on your Mac and iPhone
3. Sign in to both with the same account
4. On the Mac, run:

```bash
tailscale up
```

1. Expose CodeRelay on your tailnet (on the Mac):

```bash
tailscale serve --bg http://127.0.0.1:8790
```

If you see "Serve is not enabled on your tailnet", Tailscale will print a link.
Open it and enable Tailscale Serve for your tailnet.

## Uninstall

1. Stop and remove launchd agent:

```bash
# CodeRelay (new)
launchctl unload "$HOME/Library/LaunchAgents/com.coderelay.plist" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.coderelay.plist"

# Codex Pocket (old)
launchctl unload "$HOME/Library/LaunchAgents/com.codex.pocket.plist" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.codex.pocket.plist"
```

1. Remove app data:

```bash
rm -rf "$HOME/.coderelay"
```

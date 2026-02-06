# Install

## One-line install (macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/ddevalco/codex-remote/main/scripts/install-local.sh | bash
```

The installer:
- checks dependencies (git, bun, tailscale)
- offers to run `tailscale up` if needed
- clones/updates the repo into `~/.codex-pocket/app`
- installs dependencies
- builds the web UI
- writes config to `~/.codex-pocket/config.json`
- installs a `launchd` agent to run the service at login
- optionally configures `tailscale serve` so your iPhone can access it

## After install
- Local access: `http://127.0.0.1:8790`
- Tailnet access: `https://<your-mac-magicdns-host>/`
- Admin: `/admin`

## Uninstall
1. Stop and remove launchd agent:

```bash
launchctl unload "$HOME/Library/LaunchAgents/com.codex.pocket.plist" || true
rm -f "$HOME/Library/LaunchAgents/com.codex.pocket.plist"
```

2. Remove app data:

```bash
rm -rf "$HOME/.codex-pocket"
```

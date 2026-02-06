# Troubleshooting

## iPhone can't open the site
- Ensure you ran `tailscale up` on the Mac.
- Ensure you configured serving:

```bash
tailscale serve status
```

- Ensure the service is running:

```bash
curl -i http://127.0.0.1:8790/health
```

## WebSocket won't connect
- Confirm the Orbit URL is `wss://<your-host>/ws`.
- In local mode it should auto-populate; if not, open Settings and verify.

## Pairing code fails
- Pairing codes are one-time and expire (default 5 minutes).
- Generate a fresh code from `/admin`.

## Anchor not connected
- Wait a few seconds after service start; anchor auto-starts.
- Check `/admin` logs.
- Confirm `codex` is installed and authenticated.


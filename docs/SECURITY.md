# Security

Codex Remote gives remote control of a local Codex session. Treat it like remote admin access.

## Threat Model
- Unauthorized control of your Codex session (can read/write files, run commands via Codex approvals).
- Token leakage (bearer token gives access to WebSocket + admin APIs).
- Tailnet compromise (an attacker with access to your Tailscale network can attempt access).
- Sensitive data exposure via logs or persisted events.

## Baseline Controls

### Network boundary (Tailscale)
- local-orbit binds to `127.0.0.1` and is meant to be exposed via `tailscale serve`.
- Do not bind local-orbit to `0.0.0.0` unless you fully understand the implications.
- Prefer Tailscale ACLs to restrict which devices/users can reach your Mac.

### Authentication
- A single bearer token (`ZANE_LOCAL_TOKEN`) protects:
  - WebSocket `/ws`
  - WebSocket `/ws/anchor`
  - Admin endpoints `/admin/*`
  - Event API `/threads/:id/events`

### Pairing
- Pairing uses a short-lived, one-time code.
- The code can be shown as a QR from `/admin` and consumed on iPhone at `/pair`.
- Pairing code TTL is configurable via `ZANE_LOCAL_PAIR_TTL_SEC` (default 300s).

### Local persistence
- Events are stored in SQLite at `ZANE_LOCAL_DB` (default `~/.zane-local/zane.db`).
- Retention is controlled by `ZANE_LOCAL_RETENTION_DAYS` (default 14).

## Operational Guidance
- Treat the bearer token like a password.
  - Rotate it if an iPhone is lost, or if you suspect compromise.
- Keep `tailscale serve` exposure limited to your tailnet.
- Consider enabling Tailscale ACLs so only your phone can reach this service.
- Be mindful of what you ask Codex to print or diff: it can end up in logs and the SQLite event store.

## Known Limitations (Current)
- No per-user accounts: single shared token.
- No end-to-end encryption above TLS: traffic is secured by Tailscale HTTPS/WSS.
- Event persistence is plaintext on disk.


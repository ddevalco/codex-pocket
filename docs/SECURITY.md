# Security

Codex Pocket gives remote control of a local Codex session. Treat it like remote admin access.

## Threat Model
- Unauthorized control of your Codex session (can read/write files, run commands via Codex approvals).
- Token leakage (legacy token or device-session tokens can grant remote access).
- Tailnet compromise (an attacker with access to your Tailscale network can attempt access).
- Sensitive data exposure via logs or persisted events.

## Baseline Controls

### Network boundary (Tailscale)
- local-orbit binds to `127.0.0.1` and is meant to be exposed via `tailscale serve`.
- Do not bind local-orbit to `0.0.0.0` unless you fully understand the implications.
- Prefer Tailscale ACLs to restrict which devices/users can reach your Mac.

### Authentication
- A legacy bearer token (`ZANE_LOCAL_TOKEN`) plus per-device session tokens protect:
  - WebSocket `/ws`
  - WebSocket `/ws/anchor`
  - Admin endpoints `/admin/*`
  - Event API `/threads/:id/events`

- Token sessions can be created/listed/revoked from `/admin`.
- Token session mode:
  - `full`: normal read/write access
  - `read_only`: read-only HTTP access; write endpoints are denied and mutating websocket RPC calls are denied

### Pairing
- Pairing uses a short-lived, one-time code.
- The code can be shown as a QR from `/admin` and consumed on iPhone at `/pair`.
- Pair consume returns a unique per-device session token (not the legacy bootstrap token).
- Pairing code TTL is configurable via `ZANE_LOCAL_PAIR_TTL_SEC` (default 300s).

### Local persistence
- Events are stored in SQLite at `ZANE_LOCAL_DB` (default `~/.codex-pocket/codex-pocket.db`).
- Retention is controlled by `ZANE_LOCAL_RETENTION_DAYS` (default 14).

## Operational Guidance
- Treat the bearer token like a password.
  - Rotate the legacy token if bootstrap/admin token compromise is suspected.
  - Revoke individual token sessions when a paired device is lost/compromised.
- Keep `tailscale serve` exposure limited to your tailnet.
- Consider enabling Tailscale ACLs so only your phone can reach this service.
- Be mindful of what you ask Codex to print or diff: it can end up in logs and the SQLite event store.

## Known Limitations (Current)
- No per-user identity/accounts; access is still token-based.
- No end-to-end encryption above TLS: traffic is secured by Tailscale HTTPS/WSS.
- Event persistence is plaintext on disk.

# CI (GitHub Actions)

Codex Pocket uses GitHub Actions to catch regressions on every push and pull request.

The workflow is defined in:
- `.github/workflows/ci.yml`

## What It Checks

- Installs dependencies with Bun
- Builds the UI (Vite)
- Starts `local-orbit` in CI mode (no Anchor autostart)
- Verifies:
  - `GET /health` returns OK
  - `GET /admin/validate` returns sane JSON (auth required)
  - WebSocket relay path works (client ↔ anchor protocol surface, simulated)
  - `GET /admin/status` returns sane JSON (auth required)
  - Cache headers:
    - SPA routes (`/app`) serve `index.html` with `Cache-Control: no-store`
    - Hashed assets serve `Cache-Control: ... immutable`
  - Events endpoint returns NDJSON

## Does CI Cost Money?

- Public repos: GitHub Actions is available without paying for it.
- Private repos: GitHub provides a monthly free tier of minutes/storage (limits vary by plan).

If the repo stays public, you generally don’t need to think about cost.

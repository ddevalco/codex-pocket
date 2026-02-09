# CI (GitHub Actions)

Codex Pocket uses GitHub Actions to catch regressions on every push and pull request.

The workflow is defined in:
- `.github/workflows/ci.yml`

## What It Checks

- Installs dependencies with Bun
- Builds the UI (Vite)
- Runs small regression guards (fast static checks) to prevent known UI footguns
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

## Regression Guards

The workflow also runs `scripts/ci/regression-guards.ts`.

These are intentionally small, targeted checks that catch regressions that are easy to reintroduce but hard to
detect with a generic smoke test. Example: a past thread-list regression where reactive state bookkeeping inside
an effect created a feedback loop and made the thread list appear empty/unusable.

## Does CI Cost Money?

- Public repos: GitHub Actions is available without paying for it.
- Private repos: GitHub provides a monthly free tier of minutes/storage (limits vary by plan).

If the repo stays public, you generally don’t need to think about cost.

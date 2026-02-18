# CI (GitHub Actions)

Codex Pocket uses GitHub Actions to catch regressions on every push and pull request.

The workflow is defined in:

- `.github/workflows/ci.yml`

## What It Checks

- Installs dependencies with Bun
- Builds the UI (Vite)
- Runs bundle-size guardrails against the committed baseline
- Runs small regression guards (fast static checks) to prevent known UI footguns
- Starts `local-orbit` in CI mode (no Anchor autostart)
- Verifies:
  - `GET /health` returns OK
  - Capability-aware ACP errors return structured metadata (`capability` + `provider`)
  - `GET /admin/validate` returns sane JSON (auth required)
  - `POST /admin/repair` with safe actions (`ensureUploadDir`, `pruneUploads`) returns sane JSON and no errors
  - `GET /admin/uploads/stats` returns upload footprint stats (auth required)
  - `POST /admin/repair` with safe actions (`ensureUploadDir`, `pruneUploads`) returns sane JSON and no errors
  - `POST /admin/repair` with `fixTailscaleServe` behaves deterministically in non-Tailscale CI environments (explicit apply or explicit error)
  - Sensitive endpoint rate limits return explicit `429` once CI's low threshold is exceeded (`/admin/pair/new`, `/uploads/new`)
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

Capability regression guards additionally ensure the thread/UI capability matrix stays complete, and that
composer gating continues to honor `capabilities.sendPrompt` so unsupported actions are disabled.

## Bundle Size Guardrails

CI automatically checks the size of the production build against a committed baseline (`.bundlesize.baseline.json`).

### When CI Fails

The check evaluates thresholds for both warnings and hard failures:

- **Total Bundle Size**:
  - **Warning**: Increases by more than **15%**.
  - **Failure**: Increases by more than **30%**.
- **Individual Chunks**:
  - **Warning**: Any chunk increases by more than **20%**.
  - **Failure**: Any chunk increases by more than **50%**.

These thresholds prevent accidental "bundle bloat" from new dependencies or logic while allowing for minor fluctuations. Warning levels highlight significant growth, while failure levels block the build until the baseline is reviewed and updated.

### Updating the Baseline

If a feature legitimately increases the bundle size (e.g., adding a new major feature or library), the baseline should be updated to reflect the new state.

1. Ensure you have a standard production build:

   ```bash
   npm run build
   ```

2. Generate a new baseline file:

   ```bash
   python3 scripts/generate-baseline.py
   ```

3. Commit the updated `.bundlesize.baseline.json` as part of your pull request.

## Does CI Cost Money?

- Public repos: GitHub Actions is available without paying for it.
- Private repos: GitHub provides a monthly free tier of minutes/storage (limits vary by plan).

If the repo stays public, you generally don’t need to think about cost.

## Release Hygiene Note

CI checkouts are always clean, so dirty-tree protection is most useful on local maintainer machines.
Before creating tags/releases locally, run:

```bash
./scripts/ci/check-clean-tree.sh
```

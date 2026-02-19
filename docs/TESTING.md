# Testing Playbook (Canonical)

Last updated: 2026-02-17  
Scope: Codex Pocket web UI + local-orbit server + multi-provider (Codex + Copilot ACP Phase 1 read-only)

## 1) Environment Setup

### Prerequisites

- macOS (recommended for local workflow and iPhone pairing flow)
- `node` installed (required by toolchain utilities)
- `bun` installed (primary package manager/runtime)
- `gh` CLI installed and authenticated (required for CI-status checks in preflight)
- Optional for provider scenarios:
  - `copilot` CLI or `gh copilot` installed to validate Copilot-available path

Quick verification:

```bash
node -v
bun --version
gh --version
gh auth status -h github.com
```

### Clone and install

```bash
git clone https://github.com/ddevalco/codex-pocket.git
cd codex-pocket
bun install
```

### Service start commands

#### Build UI first

```bash
bun run build
```

#### Start local-orbit (dev-safe defaults)

```bash
export ZANE_LOCAL_TOKEN='dev-token'
export ZANE_LOCAL_HOST='127.0.0.1'
export ZANE_LOCAL_PORT='8790'
export ZANE_LOCAL_UI_DIST_DIR="$PWD/dist"
export ZANE_LOCAL_AUTOSTART_ANCHOR='0'

bun run services/local-orbit/src/index.ts
```

#### Optional: UI dev server

```bash
bun run dev
```

## 2) Command Matrix

Run from repo root unless otherwise noted.

| Purpose | Command | Expected output / pass criteria |
| --- | --- | --- |
| Install deps | `bun install` | Completes without errors |
| Build UI | `bun run build` | Vite build succeeds; `dist/` created |
| TypeScript (root) | `bunx tsc --noEmit` | Exits 0, no TS errors |
| TypeScript (local-orbit) | `cd services/local-orbit && bunx tsc --noEmit` | Exits 0, no TS errors |
| Unit/integration tests | `bun test` | All tests pass |
| Lint (manual local gate) | `bunx eslint .` | Exits 0, no lint errors |
| Regression guards | `bun scripts/ci/regression-guards.ts` | Prints `regression-guards: OK` |
| Bundle-size guardrails | `./scripts/check-bundle-size.sh` | Prints `Bundle size status: ok` (warn allowed, fail blocks) |
| Release preflight | `bun run preflight` | Full local gate passes; includes clean tree, TS, build, TODO scan, tests, CI check via `gh` |
| Preflight (skip CI query) | `./scripts/ci/release-preflight.sh --skip-ci-check` | Same as above, skips remote CI-status check |

### CI-equivalent local sequence (recommended before PR)

```bash
bun install
bun run build
./scripts/check-bundle-size.sh
bun scripts/ci/regression-guards.ts
bun test
```

## 3) Provider-Specific Manual Scenarios

Use these to validate provider behavior beyond automated tests.

### Scenario A: Copilot CLI installed

1. Ensure `copilot --acp` or `gh copilot` is available.
2. Start local-orbit with env from Section 1.
3. Check base health:

   ```bash
   curl -fsS http://127.0.0.1:8790/health
   ```

   Expect `status: "ok"` and valid server metadata.

4. Check provider health (auth required):

   ```bash
   curl -fsS -H "Authorization: Bearer dev-token" http://127.0.0.1:8790/admin/status
   ```

   Expect `providers["copilot-acp"]` to exist and be `healthy` or explicitly `degraded` with message/details.

5. Open Home UI and confirm:
   - Codex section renders normally.
   - GitHub Copilot section renders.
   - Copilot items remain read-only.

### Scenario B: Copilot CLI missing (graceful degradation)

1. Run on a machine/path where Copilot executable is unavailable.
2. Start local-orbit with env from Section 1.
3. Verify service still starts and `/health` remains `ok`.
4. Check `/admin/status`:
   - `providers["copilot-acp"]` should report non-fatal degraded/unhealthy state with a clear message.
5. Confirm UI remains usable for Codex and does not crash due to Copilot absence.

### Scenario C: Read-only enforcement

Validate both UI-level and API-level protections.

1. In UI, Copilot write actions remain disabled.
2. Create a read-only token session and verify write denial:

   ```bash
   curl -fsS \
     -H "Authorization: Bearer dev-token" \
     -H "Content-Type: application/json" \
     -X POST \
     -d '{"label":"manual-ro","mode":"read_only"}' \
     http://127.0.0.1:8790/admin/token/sessions/new
   ```

   Use returned token for:

   ```bash
   curl -sS -o /tmp/ro-write.json -w '%{http_code}' \
     -H "Authorization: Bearer <RO_TOKEN>" \
     -H "Content-Type: application/json" \
     -X POST \
     -d '{}' \
     http://127.0.0.1:8790/admin/pair/new
   ```

   Expect HTTP `401` for write endpoint with read-only token.

3. Optional WS check: mutating RPC methods should fail with explicit read-only error.

### Scenario D: Graceful shutdown/restart

1. Stop service with `Ctrl+C` or `SIGTERM`.
2. Confirm provider shutdown logs appear.
3. Restart local-orbit and verify `/health` and `/admin/status` recover.

### Scenario E: P4-03 ACP Attachment Support (Manual Testing)

**Status:** IMPLEMENTED - Ready for manual testing (2026-02-18)

**Prerequisites:**

- Codex Pocket running locally
- Copilot ACP session available
- Image file for attachment testing

**Test Steps:**

1. **Build and Compile**

   ```bash
   cd /Users/danedevalcourt/iPhoneApp/codex-pocket
   bun run type-check
   cd services/local-orbit
   bun test src/providers/adapters/__tests__/copilot-acp-adapter.test.ts
   cd ../..
   bun run build
   ```

2. **Attachment Flow**
   - Open copilot-acp session in UI
   - Verify attachment button enabled (not grayed out)
   - Click attachment button and select image file
   - Add prompt text: "What's in this image?"
   - Click send and verify no errors
   - Check browser console for "[copilot-acp] Added image attachment" log

3. **Text-Only Regression**
   - Send message without attachment
   - Verify works as before (no regression)

4. **Error Handling**
   - Test graceful fallback by monitoring network logs
   - If ACP rejects attachment, verify text-only retry occurs

**Expected Results:**

- ✅ Attachment button enabled for Copilot sessions
- ✅ Image preview appears in composer
- ✅ Message sent successfully with attachment
- ✅ No console errors during send
- ✅ Backend logs show: "[copilot-acp] Added image attachment"
- ✅ Text-only messages continue to work
- ✅ Graceful fallback occurs if attachment rejected

**Implementation Summary:**

- PromptAttachment interface and helpers (normalizeAttachment, isValidAttachment)
- Relay extracts attachments from multiple input sources
- ACP adapter base64 encodes file content and maps to ACP content array
- Capability flags updated: `attachments: true`, `CAN_ATTACH_FILES: true`
- Frontend Thread.svelte passes attachments in sendPrompt

## 4) Regression Checklist

Run this checklist for every release candidate.

### Known issues to watch (from `scripts/ci/regression-guards.ts`)

- [ ] Do **not** reintroduce reactive `let listSubscribed = $state<Set<...>>` pattern in `src/routes/Home.svelte`.
- [ ] Thread list remains populated/usable during live updates (no feedback-loop blank-list regression).
- [ ] `bun scripts/ci/regression-guards.ts` prints `regression-guards: OK`.

### Bundle size limits

- [ ] `./scripts/check-bundle-size.sh` reports `ok` (or justified `warn` with review notes).
- [ ] Respect CI thresholds:
  - Total bundle increase: warn > 15%, fail > 30%
  - Per-chunk increase: warn > 20%, fail > 50%
- [ ] For intentional increases, regenerate baseline via `python3 scripts/generate-baseline.py` and include rationale in PR.

### Performance benchmarks (release validation)

- [ ] `/health` responds consistently without timeouts under normal local load.
- [ ] WebSocket smoke path (`bun scripts/ci/ws-smoke.ts` with valid token/base URL) passes.
- [ ] Home thread list interaction remains responsive (no visible hangs, no repeated blank-state flicker).
- [ ] Startup, shutdown, and restart complete cleanly without orphaned provider processes.

## 5) Sign-Off Template

Use this section in release PRs and handoff notes.

### Release validation checklist

- [ ] Environment prerequisites verified (`node`, `bun`, `gh`)
- [ ] Command matrix core checks passed (build, TS, tests, lint)
- [ ] CI-equivalent local sequence passed
- [ ] Provider manual scenarios A-D completed
- [ ] Regression checklist completed
- [ ] Any warnings/degradations documented and accepted

### Sign-off record

- Tested by: ____________________
- Reviewer/approver: ____________________
- Date (UTC): ____________________
- Build/commit: ____________________
- Result: ☐ PASS  ☐ FAIL
- Notes / risk acceptance:

  _______________________________________

### Who signs off and when

- Feature owner signs off after local command matrix + manual provider scenarios pass.
- Reviewer signs off during PR review after validating regression checklist and risk notes.
- Final release sign-off occurs immediately before tag/cut, using latest `main` commit and fresh preflight.

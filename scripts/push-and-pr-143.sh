#!/usr/bin/env bash

set -u
set -o pipefail

BRANCH="codex/130-acp-phase1-registry"
PR_NUMBER="143"
TITLE="Phase 1: Multi-Provider Registry & Copilot ACP Adapter"
GITHUB_API="https://api.github.com"

log() {
  printf '%s\n' "$*"
}

fail_net() {
  log "Network check failed: GitHub is unreachable."
  exit 1
}

fail_git() {
  log "Git/PR error: $*"
  exit 2
}

run_cmd() {
  "$@"
  local rc=$?
  if [ $rc -ne 0 ]; then
    fail_git "Command failed (exit $rc): $*"
  fi
}

if ! command -v git >/dev/null 2>&1; then
  fail_git "git is not installed or not on PATH."
fi

if ! command -v gh >/dev/null 2>&1; then
  fail_git "GitHub CLI (gh) is not installed or not on PATH."
fi

if ! command -v curl >/dev/null 2>&1; then
  fail_git "curl is not installed or not on PATH."
fi

log "Checking network connectivity to GitHub..."
if ! curl -fsS --connect-timeout 5 --max-time 10 "$GITHUB_API" >/dev/null; then
  fail_net
fi
log "Network OK."

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$repo_root" ]; then
  fail_git "Not inside a git repository."
fi

log "Using repository: $repo_root"
cd "$repo_root" || fail_git "Unable to cd to repo root."

log "Pushing branch: $BRANCH"
run_cmd git push origin "$BRANCH"
log "Push complete."

base_ref="$(git symbolic-ref -q refs/remotes/origin/HEAD 2>/dev/null || true)"
if [ -n "$base_ref" ]; then
  base_branch="${base_ref##*/}"
else
  if git show-ref --verify --quiet refs/remotes/origin/main; then
    base_branch="main"
  elif git show-ref --verify --quiet refs/remotes/origin/master; then
    base_branch="master"
  else
    base_branch="main"
  fi
fi
log "Base branch detected: $base_branch"

pr_body="$(cat <<'EOF'
## Overview

Implements Phase 1 of multi-provider architecture for CodeRelay:
- Provider registry with adapter pattern
- GitHub Copilot ACP adapter (read-only)
- UI grouping by provider
- Session normalizers for unified data model

## Changes

### Architecture
- [x] Provider registry pattern with adapter interface
- [x] CopilotAcpAdapter implementing read-only operations
- [x] Session normalizers for data consistency
- [x] UI routing updates for provider-aware sessions

### Features
- [x] List Copilot sessions with rich metadata
- [x] Load individual Copilot sessions
- [x] Provider grouping in UI (Copilot badge)
- [x] Disabled export buttons for read-only providers

### Testing
- [x] 23/23 tests passing
- [x] TypeScript compilation clean
- [x] Protocol validation via probe scripts

## PR Review Fixes

All review issues resolved in commits cc9c489, d96b1cc, 6e80969, 4517d56:
- [x] TypeScript errors fixed (bun:test, marked API, imports)
- [x] UX consistency (export buttons, Unicode icons)
- [x] Build artifacts cleaned up
- [x] Dynamic test data

## Next Steps

After merge:
- Phase 2: Implement sendPrompt (write operations)
- Phase 3: Full streaming support
EOF
)"

pr_comment="$(cat <<'EOF'
## All PR Review Issues Resolved

### Fixes Completed
- [x] TypeScript: bun:test module resolution configured
- [x] TypeScript: marked.parse() API updated to current version
- [x] TypeScript: DangerZone import fixed
- [x] TypeScript: SessionStatus test types added
- [x] UX: Export buttons disabled for Copilot (read-only)
- [x] UX: Unicode icons for cross-platform compatibility
- [x] Code Quality: Dynamic timestamps in validation
- [x] Cleanup: Build artifacts removed and ignored

### Validation
- [x] TypeScript: Clean compilation (bunx tsc --noEmit)
- [x] Tests: 23/23 passing (bun test)
- [x] Build artifacts: Properly ignored

### Commits
- 59e112a: Remove build artifacts
- cc9c489: TypeScript configuration and API fixes
- d96b1cc: UX consistency improvements
- 6e80949: Dynamic test timestamps
- 4517d56: SessionStatus type annotations

Ready for merge.
EOF
)"

log "Checking if PR #$PR_NUMBER exists..."
pr_view_output="$(gh pr view "$PR_NUMBER" --json number 2>&1)"
pr_view_rc=$?

if [ $pr_view_rc -eq 0 ]; then
  log "PR #$PR_NUMBER exists. Adding comment."
  run_cmd gh pr comment "$PR_NUMBER" --body "$pr_comment"
  log "Comment added to PR #$PR_NUMBER."
else
  if printf '%s' "$pr_view_output" | grep -qi "not found"; then
    log "PR #$PR_NUMBER not found. Creating new PR."
    run_cmd gh pr create --head "$BRANCH" --base "$base_branch" --title "$TITLE" --body "$pr_body"
    log "PR created."
  else
    fail_git "gh pr view failed: $pr_view_output"
  fi
fi

log "Done."

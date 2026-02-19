#!/usr/bin/env bash
set -euo pipefail

if [[ -t 1 ]]; then
  RED="\033[0;31m"
  GREEN="\033[0;32m"
  YELLOW="\033[0;33m"
  BLUE="\033[0;34m"
  RESET="\033[0m"
else
  RED=""
  GREEN=""
  YELLOW=""
  BLUE=""
  RESET=""
fi

info() {
  echo -e "${BLUE}==>${RESET} $*"
}

success() {
  echo -e "${GREEN}✔${RESET} $*"
}

warn() {
  echo -e "${YELLOW}⚠${RESET} $*"
}

fail() {
  echo -e "${RED}✖${RESET} $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./scripts/ci/release-preflight.sh [--skip-ci-check]

Checks:
  - clean git tree
  - on main, synced with origin/main
  - TypeScript compile (bunx tsc --noEmit)
  - build (bun run build)
  - dist/ size thresholds (warn >2MB, fail >5MB)
  - TODO/FIXME/XXX scan in src/, services/, scripts/
  - tests (bun test) if any exist
  - CI check via gh (best effort, skip with --skip-ci-check)
EOF
}

SKIP_CI_CHECK=0
for arg in "$@"; do
  case "$arg" in
    --skip-ci-check)
      SKIP_CI_CHECK=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $arg"
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "Not inside a git repository."
fi

info "Checking clean git tree"
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  fail "Working tree is not clean. Commit/stash/discard local changes before release."
fi
success "Working tree is clean"

info "Verifying main is synced with origin"
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "main" ]]; then
  fail "Current branch is '$current_branch' (expected 'main')."
fi

git fetch origin --prune >/dev/null 2>&1 || fail "Failed to fetch origin."
if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  fail "origin/main not found."
fi

read -r behind ahead < <(git rev-list --left-right --count origin/main...main)
if [[ "$behind" != "0" || "$ahead" != "0" ]]; then
  fail "main is not synced with origin/main (behind: $behind, ahead: $ahead)."
fi
success "main is synced with origin/main"

info "TypeScript compile check"
bunx tsc --noEmit
success "TypeScript compile succeeded"

info "Build"
bun run build
success "Build succeeded"

info "Checking dist/ size"
if [[ ! -d dist ]]; then
  fail "dist/ not found after build."
fi
size_kb="$(du -sk dist | awk '{print $1}')"
size_mb="$(awk -v kb="$size_kb" 'BEGIN { printf "%.2f", kb/1024 }')"
if (( size_kb > 5120 )); then
  fail "dist/ size is ${size_mb} MB (over 5 MB)."
elif (( size_kb > 2048 )); then
  warn "dist/ size is ${size_mb} MB (over 2 MB)."
else
  success "dist/ size is ${size_mb} MB"
fi

info "Scanning TODO/FIXME/XXX in src/, services/, scripts/"
scan_dirs=()
[[ -d src ]] && scan_dirs+=("src")
[[ -d services ]] && scan_dirs+=("services")
[[ -d scripts ]] && scan_dirs+=("scripts")

if (( ${#scan_dirs[@]} > 0 )); then
  if command -v rg >/dev/null 2>&1; then
    if rg -n -e 'TODO|FIXME|XXX' "${scan_dirs[@]}"; then
      fail "Found TODO/FIXME/XXX markers."
    fi
  else
    if grep -RIn -E 'TODO|FIXME|XXX' "${scan_dirs[@]}"; then
      fail "Found TODO/FIXME/XXX markers."
    fi
  fi
fi
success "No TODO/FIXME/XXX markers found"

info "Running tests if any exist"
if find . -type f \( \
  -name "*.test.ts" -o -name "*.spec.ts" -o \
  -name "*.test.tsx" -o -name "*.spec.tsx" -o \
  -name "*.test.js" -o -name "*.spec.js" -o \
  -name "*.test.jsx" -o -name "*.spec.jsx" \
\) \
  -not -path "./node_modules/*" \
  -not -path "./dist/*" \
  -not -path "./.git/*" \
  -print -quit | grep -q .; then
  bun test
  success "Tests succeeded"
else
  warn "No tests found; skipping"
fi

info "Phase 4 capability regression guards"
bash scripts/ci/phase4-guards.sh
success "Phase 4 capability regression guards passed"

if (( SKIP_CI_CHECK == 1 )); then
  warn "Skipping CI check (--skip-ci-check)"
  success "Preflight complete"
  exit 0
fi

info "Checking latest CI run via gh"
if ! command -v gh >/dev/null 2>&1; then
  warn "gh not installed; skipping CI check"
  success "Preflight complete"
  exit 0
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  warn "gh not authenticated; skipping CI check"
  success "Preflight complete"
  exit 0
fi

latest_info="$(gh run list --branch "$current_branch" --limit 1 --json status,conclusion,workflowName,displayTitle --jq '.[0].status + "|" + (.[0].conclusion // "") + "|" + (.[0].workflowName // "") + "|" + (.[0].displayTitle // "")' 2>/dev/null || true)"
if [[ -z "$latest_info" ]]; then
  warn "No CI runs found for branch '$current_branch'"
  success "Preflight complete"
  exit 0
fi

IFS='|' read -r ci_status ci_conclusion ci_workflow ci_title <<<"$latest_info"
if [[ "$ci_status" == "completed" && "$ci_conclusion" == "success" ]]; then
  success "CI ok: ${ci_workflow} (${ci_title})"
elif [[ "$ci_status" == "completed" ]]; then
  fail "CI failed: ${ci_workflow} (${ci_title}) conclusion=${ci_conclusion:-unknown}"
else
  warn "CI not complete: ${ci_workflow} (${ci_title}) status=${ci_status}"
fi

success "Preflight complete"

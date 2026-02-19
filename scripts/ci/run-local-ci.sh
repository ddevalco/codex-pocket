#!/usr/bin/env bash
# Run the complete CI validation suite locally.
# This mirrors the CI ordering in .github/workflows/ci.yml.

set -euo pipefail

if [[ -t 1 ]]; then
  RED="\033[0;31m"
  GREEN="\033[0;32m"
  BLUE="\033[0;34m"
  YELLOW="\033[0;33m"
  RESET="\033[0m"
else
  RED=""
  GREEN=""
  BLUE=""
  YELLOW=""
  RESET=""
fi

info() {
  echo -e "${BLUE}==>${RESET} $*"
}

success() {
  echo -e "${GREEN}OK${RESET} $*"
}

warn() {
  echo -e "${YELLOW}WARN${RESET} $*"
}

fail() {
  echo -e "${RED}FAIL${RESET} $*" >&2
  exit 1
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ -n "${LOCAL_CI_FORCE_FAIL:-}" ]]; then
  fail "LOCAL_CI_FORCE_FAIL is set"
fi

STEPS=(
  "Typecheck"
  "Build"
  "Bundle size"
  "Regression guards"
  "Phase 4 guards"
)

STATUSES=()
for step in "${STEPS[@]}"; do
  STATUSES+=("pending")
done

total=${#STEPS[@]}

print_summary() {
  echo ""
  info "CI summary (${total} steps)"
  for i in "${!STEPS[@]}"; do
    step="${STEPS[$i]}"
    status="${STATUSES[$i]}"
    case "$status" in
      pass)
        success "$step"
        ;;
      fail)
        echo -e "${RED}FAIL${RESET} ${step}"
        ;;
      *)
        warn "$step (not run)"
        ;;
    esac
  done
}

trap print_summary EXIT

run_step() {
  local name="$1"
  shift

  info "$name"
  set +e
  "$@"
  local rc=$?
  set -e

  local index=-1
  for i in "${!STEPS[@]}"; do
    if [[ "${STEPS[$i]}" == "$name" ]]; then
      index=$i
      break
    fi
  done

  if [[ $rc -eq 0 ]]; then
    if [[ $index -ge 0 ]]; then
      STATUSES[$index]="pass"
    fi
    success "$name passed"
    return 0
  fi

  if [[ $index -ge 0 ]]; then
    STATUSES[$index]="fail"
  fi
  fail "$name failed (exit ${rc})"
}

run_step "Typecheck" bunx tsc --noEmit
run_step "Build" bun run build
run_step "Bundle size" bash ./scripts/check-bundle-size.sh
run_step "Regression guards" bun ./scripts/ci/regression-guards.ts
run_step "Phase 4 guards" bash ./scripts/ci/phase4-guards.sh

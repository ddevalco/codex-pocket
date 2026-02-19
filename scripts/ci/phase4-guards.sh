#!/usr/bin/env bash
set -euo pipefail

if [[ -t 1 ]]; then
  RED="\033[0;31m"
  GREEN="\033[0;32m"
  BLUE="\033[0;34m"
  RESET="\033[0m"
else
  RED=""
  GREEN=""
  BLUE=""
  RESET=""
fi

info() {
  echo -e "${BLUE}==>${RESET} $*"
}

success() {
  echo -e "${GREEN}✔${RESET} $*"
}

fail() {
  echo -e "${RED}✖${RESET} $*" >&2
  exit 1
}

require_file() {
  local file_path="$1"
  local label="$2"
  if [[ ! -f "$file_path" ]]; then
    fail "${label} missing (${file_path})"
  fi
  success "${label} present"
}

require_grep() {
  local pattern="$1"
  local file_path="$2"
  local label="$3"
  if ! grep -q -E "$pattern" "$file_path"; then
    fail "${label} missing in ${file_path}"
  fi
  success "${label} present"
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

info "Phase 4 capability regression guards"

require_file "src/lib/thread-capabilities.ts" "Thread capability helpers"
require_file "src/lib/approval-policy-store.svelte.ts" "Approval policy store"
require_file "services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts" "ACP adapter"
require_file "services/local-orbit/src/providers/adapters/__tests__/copilot-acp-adapter.test.ts" "ACP adapter tests"

require_grep "CAN_ATTACH_FILES" "src/lib/types.ts" "CAN_ATTACH_FILES capability"
require_grep "CAN_FILTER_HISTORY" "src/lib/types.ts" "CAN_FILTER_HISTORY capability"
require_grep "SUPPORTS_APPROVALS" "src/lib/types.ts" "SUPPORTS_APPROVALS capability"
require_grep "SUPPORTS_STREAMING" "src/lib/types.ts" "SUPPORTS_STREAMING capability"
require_grep "ThreadFilterState" "src/lib/types.ts" "Thread filter state"

require_grep "function canAttachFiles" "src/lib/thread-capabilities.ts" "canAttachFiles helper"
require_grep "function canFilterHistory" "src/lib/thread-capabilities.ts" "canFilterHistory helper"
require_grep "function supportsApprovals" "src/lib/thread-capabilities.ts" "supportsApprovals helper"
require_grep "function supportsStreaming" "src/lib/thread-capabilities.ts" "supportsStreaming helper"
require_grep "getCapabilityTooltip" "src/lib/thread-capabilities.ts" "capability tooltip"

require_grep "approvalPolicyStore" "src/lib/approval-policy-store.svelte.ts" "approvalPolicyStore export"
require_grep "AcpApprovalPolicy" "src/lib/approval-policy-store.svelte.ts" "AcpApprovalPolicy definition"

require_grep "attachments" "services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts" "ACP attachment support"
require_grep "approvals" "services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts" "ACP approvals support"

info "Phase 4 typecheck"
bunx tsc --noEmit
success "Typecheck passed"

info "Phase 4 build"
bun run build
success "Build passed"

info "Phase 4 local-orbit tests"
# Install local-orbit dependencies
(cd services/local-orbit && bun install)
set +e
TEST_OUTPUT="$(cd services/local-orbit && bun test 2>&1)"
TEST_STATUS=$?
set -e
echo "$TEST_OUTPUT"
if [[ $TEST_STATUS -ne 0 ]]; then
  fail "Local-orbit tests failed (exit ${TEST_STATUS})"
fi
TEST_COUNT="$(echo "$TEST_OUTPUT" | grep -E "Ran [0-9]+ tests" | tail -n 1 | grep -oE "[0-9]+" | head -n 1 || true)"
if [[ -z "$TEST_COUNT" ]]; then
  TEST_COUNT="$(echo "$TEST_OUTPUT" | grep -E "^[[:space:]]*[0-9]+ tests? passed" | head -n 1 | grep -oE "[0-9]+" || true)"
fi
if [[ -z "$TEST_COUNT" ]]; then
  TEST_COUNT="$(echo "$TEST_OUTPUT" | grep -E "^[[:space:]]*[0-9]+ pass" | head -n 1 | grep -oE "[0-9]+" || true)"
fi
if [[ -z "$TEST_COUNT" ]]; then
  fail "Could not determine test count from bun test output"
fi
if (( TEST_COUNT < 90 )); then
  fail "Test count regressed below 90 (got ${TEST_COUNT})"
fi
success "Tests passed (${TEST_COUNT} total)"

success "Phase 4 guards PASSED"

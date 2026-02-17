#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

commit_if_changed() {
  local message="$1"
  shift
  local files=("$@")

  if git diff --quiet -- "${files[@]}"; then
    echo "No changes for commit: $message"
    return 0
  fi

  git add -- "${files[@]}"
  git commit -m "$message"
}

commit_if_changed "fix(local-orbit): update TypeScript config and UI types" \
  services/local-orbit/tsconfig.json \
  services/local-orbit/package.json \
  services/local-orbit/bun.lock \
  src/lib/components/MessageBlock.svelte \
  src/lib/components/Reasoning.svelte \
  src/lib/components/Tool.svelte \
  src/lib/components/system/DangerZone.svelte

commit_if_changed "style(ui): align home route button and icon states" \
  src/routes/Home.svelte

commit_if_changed "test(data): make ACP validator dates dynamic" \
  services/local-orbit/src/providers/normalizers/validate-acp-normalizer.ts

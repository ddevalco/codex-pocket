#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository."
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "Working tree is not clean."
  echo "Commit/stash/discard local changes before release/tag operations."
  exit 1
fi

echo "Working tree is clean."

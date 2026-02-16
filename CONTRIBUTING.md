# Contributing

Thanks for contributing to Codex Pocket.

## Branching + Sync Policy

- Never commit directly to `main`.
- Create topic branches as `codex/<short-desc>`.
- Keep `main` synced from remote and avoid local drift:

```bash
git fetch origin --prune
git checkout main
git pull --ff-only origin main
```

- Rebase your topic branch on latest `origin/main` before opening/updating a PR:

```bash
git fetch origin --prune
git rebase origin/main
```

Recommended local git defaults:

```bash
git config --global pull.ff only
git config --global fetch.prune true
```

## Pull Request Expectations

- Keep scope tight (one theme per PR).
- Tie the PR to a GitHub issue.
- Update docs when behavior changes.
- Update `CHANGELOG.md` for user-visible changes.

## Backlog + Issue Tracking (Required)

- GitHub is the canonical system for planning and tracking:
	- Issues: https://github.com/ddevalco/codex-pocket/issues
	- Project board: https://github.com/users/ddevalco/projects/2
- Every feature/bug/chore starts as a GitHub issue (use templates).
- Every PR must reference its issue (`Fixes #<id>` or `Refs #<id>`).
- Every open issue should be assigned to exactly one status column in Project 2.
- `BACKLOG.md` is a mirror for quick in-repo visibility; if it diverges, GitHub wins.

Recommended label set:

- `type:bug`, `type:feature`, `type:reliability`, `type:docs`
- `priority:p0`, `priority:p1`, `priority:p2`
- `area:ui`, `area:local-orbit`, `area:anchor`, `area:protocol`, `area:ci`

Project hygiene cadence:

- During triage: create/update issue + labels + project status.
- Before opening PR: verify issue is in `In Progress`.
- After merge: close issue and move to `Done`.

PR description should include:
- what/why
- how to test
- risk assessment
- rollback instructions

## Validation Before PR

- Required baseline:

```bash
~/.codex-pocket/bin/codex-pocket self-test
```

- If UI is touched:

```bash
VITE_ZANE_LOCAL=1 bunx --bun vite build
```

## Pre-Release / Tagging Guard

Before a release/tag operation, verify no local uncommitted changes:

```bash
./scripts/ci/check-clean-tree.sh
```

This prevents creating release artifacts from a dirty working tree.

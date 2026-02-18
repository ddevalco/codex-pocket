# Agent Operating Rules (Codex Pocket, Local-Only)

These rules apply to humans and coding agents working in this repo.

## Local-only requirement

- This file set is local-only and must never be committed.
- Keep all agent guidance under `.agent-local/`.

## Required context order

Before substantial implementation, read in this order:

1. `README.md`
2. `CHANGELOG.md`
3. `BACKLOG.md`
4. `docs/CI.md`
5. `docs/TROUBLESHOOTING.md`
6. `.agent-local/HANDOFF.md`
7. `.agent-local/NEXT_AGENT_PROMPT.md` (when resuming from rollover)

If task touches admin/settings UI, also read:

- `docs/ADMIN.md`
- `docs/ADMIN_REDESIGN_PROPOSAL.md`

## Branching + PRs

- Branch name: `codex/<short-desc>`
- Do not commit directly to `main`.
- Create a PR for every change, including docs-only changes.

PR body must include:

- what/why
- how to test
- risk assessment
- rollback instructions

## Stability-first guardrails

Do not regress these paths:

- thread history population
- navigation
- pairing/admin flows
- attachments
- concurrent threads
- update/install lifecycle

## Required validation

Before and after meaningful changes:

- `~/.codex-pocket/bin/codex-pocket self-test`
- `~/.codex-pocket/bin/codex-pocket smoke-test`

When UI changes:

- `VITE_ZANE_LOCAL=1 bunx --bun vite build`

## Security rules

- Never log or expose bearer tokens/secrets.
- Keep pairing short-lived and explicit.
- Prefer least privilege and safe defaults.

## Docs discipline

When behavior changes, update as needed:

- `README.md`
- `CHANGELOG.md`
- relevant `docs/*`
- `BACKLOG.md` mirror if roadmap scope changes

## Orchestrator Tool Boundaries (applies when running in Orchestrator mode)

Orchestrator agents:

- Read files and coordinate other agents
- Do NOT have CLI, git, or file editing capabilities
- Must delegate ALL execution work via runSubagent

If you're the Orchestrator and trying to:

- Run a command → delegate to Junior Developer
- Edit a file → delegate to appropriate specialist
- Create a branch → delegate to Junior Developer
- Commit changes → delegate to Junior Developer

This is not optional. The Orchestrator lacks these tools.

## Thread handoff rule

When ending a long thread, update `.agent-local/HANDOFF.md` with:

- current branch + repo status
- completed work and PRs
- known blockers/errors
- next recommended item
- validation commands and results

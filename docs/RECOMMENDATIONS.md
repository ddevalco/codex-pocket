# Recommendations (Prioritized)

Date: 2026-02-15

This document lays out recommended work from the architecture and protocol review.

## Completed Since Publication

- ✅ #107 completed in PR #113 (`feat(notifications): away-mode alerts`)
- ✅ #108 completed in PR #114 (`Orchestration UX: prompt and agent presets`)
- ✅ #109 completed in PR #115 (`Multi-agent: helper profile launch`)

## Tracking Policy

- Canonical tracker: GitHub Issues
  - https://github.com/ddevalco/codex-pocket/issues
- Canonical planning board: GitHub Project 2
  - https://github.com/users/ddevalco/projects/2
- For each item below:
  1. Create an issue from the title.
  2. Apply labels (`type:*`, `priority:*`, `area:*`).
  3. Add to Project 2 and set status.
  4. Link PR with `Fixes #<issue>`.

## P1 — Reliability (Do First)

### 1) Durable outbox + idempotency for mutating RPCs

Issue: #105 — ✅ COMPLETED (PR #111)

Issue title:
- `Reliability: durable outbox + idempotency keys for mutating RPCs`

Why:
- Prevented lost/duplicated user actions on reconnects (turn start, approvals, user-input responses).

Scope:
- Added a client outbox persisted locally.
- Tagged mutating RPCs with idempotency keys.
- Replayed safely after reconnect.
- Suppressed duplicate application on server/relay side.

Acceptance criteria:
- Disconnect/reconnect during `turn/start` did not lose or duplicate turn start.
- Disconnect/reconnect during approval response did not send conflicting decisions.
- Disconnect/reconnect during user-input response preserved submitted answers exactly once.

Suggested labels:
- `type:reliability`, `priority:p1`, `area:protocol`, `area:local-orbit`, `area:ui`

### 2) Run timeline + failure reason counters

Issue: #106 — ✅ COMPLETED (PR #112)

Issue title:
- `Observability: admin run timeline and failure reason counters`

Why:
- Improved remote debugging confidence while away from keyboard.

Scope:
- Added server-side counters for common failures/timeouts/reconnects.
- Exposed in `/admin/status` and UI status cards.
- Included recent run timeline snippets from event log.

Acceptance criteria:
- Admin showed counts for recent failures by class (auth, network, timeout, process exit).
- Admin timeline showed recent operational milestones and errors with timestamps.

Suggested labels:
- `type:feature`, `priority:p1`, `area:local-orbit`, `area:ui`

## P2 — Usability and Orchestration

### 3) Away mode notifications for blocked turns

Issue: #107 — ✅ COMPLETED (PR #113)

Issue title:
- `Away mode: push notification when turn is blocked on approval or user input`

Why:
- Enables practical long-running remote use without constantly watching the screen.

Scope:
- Trigger PWA/local notifications when thread indicator transitions to blocked.
- Include quick deep-link to blocked thread.
- Add per-device setting controls.

Acceptance criteria:
- When a turn reaches pending approval/user-input, notification fires once.
- Tapping notification opens the corresponding thread.
- User can disable/enable behavior from Settings.

Suggested labels:
- `type:feature`, `priority:p2`, `area:ui`

### 4) Prompt/agent presets with import/export

Issue: #108 — ✅ COMPLETED (PR #114)

Issue title:
- `Orchestration UX: prompt and agent presets with import/export`

Why:
- Reuses repeated workflows and makes collaboration mode practical.

Scope:
- Add preset schema (name, mode, model, reasoning effort, developer instructions, starter prompt).
- Add Settings management UI.
- Add import/export JSON.
- Add dropdown apply in composer.

Acceptance criteria:
- User can create/edit/delete presets.
- User can export presets and import on another device.
- User can apply preset in one action before starting/sending.

Suggested labels:
- `type:feature`, `priority:p2`, `area:ui`, `area:protocol`

## P3 — Advanced Multi-Agent Workflows

### 5) First-class helper-agent orchestration

Issue: #109 — ✅ COMPLETED (PR #115)

Issue title:
- `Multi-agent: first-class helper agent actions and profile-based spawn`

Why:
- Existing collab event plumbing exists; this converts it into an intentional user feature.

Scope:
- Add explicit UI action to spawn helper agent from selected profile.
- Show helper-agent lifecycle and status in thread timeline.
- Persist reusable helper profiles tied to presets.

Acceptance criteria:
- User can launch helper agent from UI without manual prompt crafting.
- Timeline shows helper agent start/progress/completion clearly.
- Profiles are reusable across sessions.

Suggested labels:
- `type:feature`, `priority:p3`, `area:ui`, `area:protocol`

## Recommended Issue Creation Order

1. Durable outbox + idempotency
2. Run timeline + failure counters
3. Away mode notifications
4. Prompt/agent presets import/export
5. First-class helper-agent orchestration

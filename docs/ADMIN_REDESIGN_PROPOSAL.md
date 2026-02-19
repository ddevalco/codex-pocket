# Admin + Settings UI Redesign Proposal

Date: 2026-02-12  
Status: Proposed  
Owner: CodeRelay maintainers

## Goals

- Make `/admin` feel calm, readable, and system-like rather than terminal-dump-like.
- Improve operator confidence: critical status and actions should be obvious in the first screen.
- Keep high-power diagnostics available, but progressively disclosed.
- Align `/admin` and `/settings` visual language so they feel like one product surface.

## Non-goals

- No backend behavior changes in phase 1 (UI-only restructuring first).
- No new permissions model in this proposal.
- No redesign of thread/chat pages in this proposal.

## Current Pain Points

- Long, single-column page forces excessive scrolling.
- Status, destructive actions, and low-priority debug/log content are visually co-equal.
- Most content uses monospace, reducing scanability for non-log UI text.
- Repeated control patterns are not normalized (button hierarchy, result messaging, section affordances).
- `/settings` and `/admin` feel related but not intentionally unified.

## UX Principles

1. Hierarchy first: state and core actions before diagnostics.
2. Progressive disclosure: hide advanced/debug by default.
3. Predictable controls: one primary action per card, consistent button priority.
4. Calm density: improved spacing, muted surfaces, concise copy.
5. Operational safety: explicit danger zones and confirmations.

## Information Architecture

## `/admin`

Top summary strip (always visible):

- Server endpoint
- Anchor status
- Auth status
- Last validate/repair result + timestamp

Primary sections:

1. System Overview
2. Operations
3. Access & Pairing
4. Uploads
5. Remote CLI (Advanced; collapsed by default)
6. Diagnostics (Advanced; collapsed by default)

## `/settings`

Sections:

1. Connection
2. Devices
3. Composer
4. Notifications
5. About
6. Account

Structure and components should match Admin card system.

## Layout + Visual System

- Desktop: 12-column grid (`main 8 / side 4`) for admin overview + controls.
- Mobile: single-column cards with sticky quick-actions for key operations.
- Typography:
  - Sans for headings/body UI labels.
  - Monospace only for paths, hashes, logs, token/code snippets.
- Surfaces:
  - Elevated cards for sections.
  - Subtle borders and restrained shadows.
  - Explicit status chips (Healthy, Warning, Action required).
- Actions:
  - Primary: one per card.
  - Secondary: adjacent routine actions.
  - Danger: isolated within dedicated "Danger Zone" blocks.

## Key UI Changes by Feature

### Admin status + controls

- Replace raw key/value wall with grouped status cards:
  - Service
  - Anchor
  - Auth
  - Storage
- Add compact quick-action row:
  - Validate
  - Repair
  - Refresh
- Add inline operation feedback:
  - result state
  - short message
  - "last run" timestamp

### Pairing + token operations

- Split Pairing and Token rotation into separate cards.
- Add confirmation before token rotate.
- Keep pairing QR prominent but with cleaner metadata layout.

### Remote CLI

- Move into collapsible Advanced card.
- Keep risky command warning always visible when selected.
- Add small command history list (optional phase 2).

### Logs + debug

- Collapsed by default.
- Add tabs for anchor logs / ops / debug events.
- Improve preformatted panel readability and controls (copy/download tail).

### Settings alignment

- Apply same card shell and spacing rhythm as Admin.
- Normalize labels/button styles and section headers.
- Maintain existing behavior; visual + IA polish first.

## Accessibility + Usability Requirements

- WCAG AA color contrast for text and status chips.
- Keyboard navigable controls and visible focus states.
- Danger actions require explicit confirmation.
- Preserve legibility in dark/light/system themes.

## Implementation Plan (Small PRs)

1. Shared UI primitives + token tune-up (no behavior changes)

- Add reusable components: `Card`, `SectionHeader`, `StatusChip`, `DangerZone`, `LogPanel`.
- Ensure theme token coverage for these primitives.

1. Admin IA/layout refactor

- Rebuild Admin into grid/card structure.
- Keep all existing endpoints/flows unchanged.

1. Admin interaction polish

- Add confirmations, action feedback states, collapsible advanced sections.

1. Settings visual alignment

- Migrate settings sections to shared primitives and spacing rules.

1. Accessibility + docs + screenshots

- Keyboard/focus/contrast pass.
- Update docs and changelog with before/after screenshots.

## Risks

- Regressions in critical admin controls if refactor is too large.
- Theme edge cases if tokens are incomplete.
- Mobile density regressions in card-heavy layout.

## Risk Mitigation

- Keep PRs under ~300 LOC when possible.
- Preserve endpoint wiring while only changing presentation first.
- Manual smoke after each PR:
  - Validate/Repair
  - Anchor start/stop
  - Pair QR regeneration
  - Upload retention save/prune
  - Remote CLI run

## Acceptance Criteria (Overall)

- Admin and Settings share a consistent system-settings visual language.
- Core operations are usable from first viewport on desktop and mobile.
- Advanced diagnostics remain accessible without cluttering default view.
- No regression in existing admin behavior.

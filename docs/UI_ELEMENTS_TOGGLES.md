# UI Elements Toggles

## Overview

Per-device UI customization that lets users hide or show non-critical interface elements. Defaults remain ON for backward compatibility and to avoid surprises. Preferences are stored locally in the browser and do not sync across devices.

## Phase 1 Status (Complete)

All Phase 1 issues are complete, covering the store, Settings UI, and the high-impact toggles.

- #175 Foundation store and persistence: Complete
- #176 Settings UI Elements section: Complete
- #177 Thread list exports toggle: Complete
- #178 Composer quick replies toggle: Complete
- #179 Composer attachment thumbnails toggle: Complete
- #180 Message copy variants toggle: Complete
- #181 Thread view header actions toggle: Complete
- #182 Thread list actions toggle: Complete
- #183 Settings polish and documentation: Complete
- #184 QA checklist and validation: Complete

## Defaults and Rationale

- Default: All toggles ON to preserve existing behavior.
- Storage: `localStorage` key `codex-pocket:ui-toggles` (per-device, per-browser).
- Safety guarantee: At least one message copy action always remains enabled.
- Rationale: Users can reduce clutter without losing critical actions or accidentally hiding required flows.

## How To Use

1. Go to Settings.
2. Open the UI Elements card.
3. Toggle a switch to hide or show that feature.
4. Use "Reset to defaults" to restore all toggles to ON.

## Settings Layout

The UI Elements section is grouped for clarity:

- Thread List: Controls quick actions and exports in the home thread list.
- Composer: Controls the composer shortcut row and attachment previews.
- Messages: Controls copy actions for messages and tool output.
- Thread View: Controls secondary header actions inside a thread.

On desktop, groups appear in a two-column grid. On mobile, they stack into a single column for readability. The header includes per-device and defaults-on chips, plus a prominent reset action.

## Testing Notes

- Verify toggles persist after reload.
- Confirm hidden UI elements do not render when toggled off.
- Validate that at least one message copy action is always available.

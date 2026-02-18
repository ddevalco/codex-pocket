# UI Elements Toggles

## Overview

Feature for per-device UI customization with on/off switches for 15+ non-critical visual elements. Reduces clutter while preserving critical functions. Default: all ON.

## Feature Catalog

### High Priority (P0)

| Feature | Location | Default | Impact | Value Proposition |
|---------|----------|---------|--------|-------------------|
| Thread-list export buttons (4/thread) | Home.svelte | ON | High | Remove significant mobile clutter |
| Quick reply shortcuts row | PromptInput | ON | Medium | Reclaim vertical composer space |
| Attachment thumbnails | PromptInput | ON | Medium | Compact text-only mode option |
| Message copy variants (4 options) | MessageBlock | ON | Medium | Simplify to 1-2 core actions |

### Medium Priority (P1)

- Thread copy button (Thread.svelte header)
- Thread share button (Thread.svelte header)
- More menu exports (Thread.svelte popover)
- Helper profiles menu (Thread.svelte header)
- Review link (Thread.svelte header)
- Tool output copy button (Tool.svelte)
- Rename button (Home.svelte thread items)
- Archive button (Home.svelte thread items)

### Lower Priority (P2)

- Draft indicator (PromptInput footer)
- Preset dropdown (PromptInput toolbar)
- Image upload label text (PromptInput toolbar)

## Technical Design

### Store Architecture

Create `src/lib/uiToggles.ts`:

```typescript
interface UITogglesState {
  // Thread List
  showThreadListExports: boolean;
  showThreadListRename: boolean;
  showThreadListArchive: boolean;
  
  // Thread View
  showThreadCopy: boolean;
  showThreadShare: boolean;
  showThreadMoreMenu: boolean;
  showHelperProfiles: boolean;
  showReviewLink: boolean;
  
  // Messages
  showAdvancedCopy: boolean;
  showToolOutputCopy: boolean;
  
  // Composer
  showQuickReplies: boolean;
  showAttachmentThumbnails: boolean;
  showDraftIndicator: boolean;
  showPresetDropdown: boolean;
}
```

localStorage key: `codex-pocket:ui-toggles`  
Default: All `true`  
Safety: At least one message copy method must remain available

### Settings UI

Add "UI Elements" section to Settings.svelte with grouped switches:

- Thread View (5 toggles)
- Thread List (3 toggles)
- Messages (2 toggles)
- Composer (4 toggles)

Notice: "These preferences are stored on this device only."

## Implementation Phases

**Phase 1 - Foundation + High-Impact** (Sequential)

1. Create uiToggles.ts store
2. Add Settings UI Elements section
3. Gate thread-list exports
4. Gate composer features
5. Simplify message copy

**Phase 2 - Coverage** (Parallel)

6. Thread View toggles
7. Thread List remaining
8. Composer remaining
9. Messages matrix
10. Expand Settings UI

**Phase 3 - Polish** (Sequential)

11. Empty states + guardrails
12. Documentation
13. QA validation

## Testing Strategy

- Unit: Store init, fallbacks, persistence
- Integration: Toggle → UI updates
- Visual: Mobile viewport clutter reduction
- Safety: At least one copy method always available

## Constraints

- Cannot hide critical functions (send, navigation, basic display)
- Must default to ON (backward compatibility)
- Per-device only (no sync)
- Preserve at least one message copy action
